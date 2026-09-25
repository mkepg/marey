import { planLottie, hexToRgb01, type LayerSpec } from "./lottieGeometry";
import { encodeLottie, type LottieDoc } from "./lottieEncode";
import type { FrameSnapshot } from "../renderer/frameSampler";
import { withRasterExport } from "./rasterExport";
import { CanvasTextMetrics, Container, Text } from "pixi.js";
import type { IRObjectId, IRObjectNode, IRSceneNode, IRTextProps } from "../sceneIR";
import { createTextOutliner, type TextGlyphRun, type TextLayout } from "./textOutline";
import { fetchExportFont } from "./exportFonts";

/** Every text object's pixi-measured layout and HarfBuzz outlines, by IR id. */
export interface CollectedTextLayouts {
  readonly textLayouts: ReadonlyMap<IRObjectId, TextLayout>;
  readonly glyphRuns: ReadonlyMap<IRObjectId, TextGlyphRun>;
}

/**
 * Measure every `text` node as the built tree actually laid it out, then
 * outline it with HarfBuzz (spec §6.2, O5, and §6.3, O4).
 *
 * Runs after `buildNode`, on the tree `withRasterExport` built, so the
 * numbers are the ones the sampled snapshots were taken against:
 * - `width`/`height` are the wrapper's `__baseSize`, the exact box
 *   `builder.ts` pivoted on (equal to the `Text`'s own width/height, Task
 *   6 Q3), so the anchor matches the snapshots by construction;
 * - `lines`, `lineHeight` and `fontProperties.ascent` come from
 *   `CanvasTextMetrics.measureText` on the built `Text`'s own text and
 *   style. That is a cache hit on the measurement pixi made while building
 *   (`_measurementCache`, keyed by the style's `styleKey`), so it cannot
 *   disagree with what was built; and the font-metrics cache under it was
 *   emptied after the font loaded, in `withRasterExport`'s prefix;
 * - `padding` is `style._getFinalPadding()` (tagged `@internal` in pixi
 *   8.16.0's typings, but typed and the only source of the number).
 *
 * The IR id to container mapping is `__mareyId`, which `buildNode` stamps
 * on every wrapper; the IR side is a walk of `ir.children`, the same tree
 * `buildNode` was given. A text node with no container, or a container with
 * no `Text` child, is an invariant failure: the builder produced something
 * this module does not understand, and dropping it would drop ink.
 *
 * The font is fetched once, only if the scene has text, and the outliner is
 * destroyed in `finally`. A text-free scene fetches nothing.
 *
 * `runLottieExport` calls this from `withRasterExport`'s `afterBuild`, and
 * passes both maps straight into `planLottie` (Task 8, ruling T8-R1).
 */
export async function collectTextLayouts(
  root: Container,
  ir: IRSceneNode,
  fetchFont: () => Promise<ArrayBuffer> = () => fetchExportFont(),
): Promise<CollectedTextLayouts> {
  const texts = textNodes(ir);
  const textLayouts = new Map<IRObjectId, TextLayout>();
  const glyphRuns = new Map<IRObjectId, TextGlyphRun>();
  if (texts.length === 0) return { textLayouts, glyphRuns };

  const built = containersById(root);
  for (const { id } of texts) textLayouts.set(id, measureBuiltText(id, built.get(id)));

  const outliner = await createTextOutliner(await fetchFont());
  try {
    for (const { id, props } of texts) {
      glyphRuns.set(id, outliner.outline(textLayouts.get(id)!, props.fontSize));
    }
  } finally {
    outliner.destroy();
  }
  return { textLayouts, glyphRuns };
}

function textNodes(ir: IRSceneNode): Array<{ id: IRObjectId; props: IRTextProps }> {
  const out: Array<{ id: IRObjectId; props: IRTextProps }> = [];
  const visit = (node: IRObjectNode): void => {
    if (node.props.kind === "text") out.push({ id: node.id, props: node.props });
    node.children.forEach(visit);
  };
  ir.children.forEach(visit);
  return out;
}

function containersById(root: Container): Map<IRObjectId, Container> {
  const out = new Map<IRObjectId, Container>();
  const visit = (container: Container): void => {
    if (container.__mareyId !== undefined) out.set(container.__mareyId, container);
    for (const child of container.children) visit(child);
  };
  visit(root);
  return out;
}

function measureBuiltText(id: IRObjectId, wrapper: Container | undefined): TextLayout {
  const invariant = (what: string) =>
    new Error(`[export] collectTextLayouts: text node '${id}' ${what}; the scene tree is not what buildNode builds.`);
  if (!wrapper) throw invariant("has no built container");
  const text = wrapper.children.find((child): child is Text => child instanceof Text);
  if (!text) throw invariant("has no pixi Text child");
  if (!wrapper.__baseSize) throw invariant("has no __baseSize");
  const metrics = CanvasTextMetrics.measureText(text.text, text.style);
  return {
    width: wrapper.__baseSize.w,
    height: wrapper.__baseSize.h,
    ascent: metrics.fontProperties.ascent,
    lineHeight: metrics.lineHeight,
    padding: text.style._getFinalPadding(),
    lines: [...metrics.lines],
  };
}

/**
 * Optional observation points, for the dev harness (`devLottieSeam.ts`).
 *
 * Mirrors `VideoExportObserver` (`videoPipeline.ts`): the shipped export
 * button passes none, and pays nothing for them.
 */
export interface LottieExportObserver {
  /** Called once with the sampler's own output, in the sampler's order. */
  readonly onSampled?: (frames: ReadonlyArray<FrameSnapshot>) => void;
}

export interface RunLottieExportOptions {
  readonly source: string;
  readonly fps: number;
  /** Explicit export bound in seconds. Overrides the scene's own duration. */
  readonly durationSeconds?: number;
  readonly observer?: LottieExportObserver;
}

/**
 * Compile, plan, build, sample, encode to Lottie — the whole Lottie export
 * path, and the **only** copy of it. The top bar's **lottie** button
 * (`useExport.ts`) calls this, and so does the dev harness seam
 * (`devLottieSeam.ts`) through `observer`, so `lottie-check.mjs` measures
 * this orchestration rather than a hand-kept copy of it (ruling R45, the
 * same reasoning `videoPipeline.ts` carries for video).
 *
 * The compile -> plan -> build -> sample prefix and the teardown around it
 * are `rasterExport.ts`'s `withRasterExport` (Phase 5C Task 4, controller
 * ruling T4-R1: the shared helper moved onto this pipeline too, so exactly
 * one copy of the prefix remains across `videoPipeline.ts`,
 * `devExportSeam.ts` and this file). This function supplies no `scale` at
 * all — unlike the PNG/video seams this makes no `extract` call and
 * produces no renderer output, a Lottie document is inert JSON, not pixels
 * — so `PreparedRasterExport.rasterize` is never produced and never called.
 * The export `Application` `withRasterExport` still constructs (at
 * resolution 1) is needed only because `SceneRuntime` and the tree
 * `buildNode` produces expect a live Pixi context to attach to. `autoStart:
 * false` (renderer invariant: nothing here may advance on a wall clock).
 *
 * Neither caller reaches the other: this module never imports
 * `devLottieSeam.ts` (`exportBoundary.test.ts` pins that), and the button
 * does not call the dev-only `window.__mareyExportLottie` global, which is
 * constant-folded out of a production build (`main.tsx`).
 *
 * Every failure surfaces as a thrown `Error` whose `.message` is the
 * triggering diagnostic's `message` **verbatim**, joined with `" | "` when
 * there is more than one — never rewrapped with an added prefix, matching
 * `runVideoExport`'s contract, because `useExport.ts` shows it in a toast as
 * it is.
 */
export async function runLottieExport(opts: RunLottieExportOptions): Promise<LottieDoc> {
  const observer = opts.observer ?? {};

  // Stashed by `afterBuild`, so the encode step inside `use` reads the
  // layers `planLottie` already computed rather than a second copy.
  let layers: ReadonlyArray<LayerSpec> | undefined;

  return withRasterExport(
    {
      source: opts.source,
      fps: opts.fps,
      durationSeconds: opts.durationSeconds,
      // Planning runs after the build and before sampling (ruling T8-R1).
      // `text` needs pixi's layout of the built `Text` and HarfBuzz's
      // outlines of it (spec §6.2-6.3), and neither exists before the
      // build, so a pre-build `planLottie` could not see them, and a second,
      // post-build call would be a second copy of planning. One call, here:
      // a refusal (`LOTTIE_TEXT_MISSING_GLYPH`) arrives after the export
      // `Application` and the tree exist (both torn down by
      // `withRasterExport`'s `finally`) but before a single tick is sampled,
      // so design §2's "diagnostics are properties of the scene, not of the
      // frames" still holds: `observer.onSampled` never fires for a refused
      // scene. A text-free scene fetches no font and measures nothing
      // (`collectTextLayouts` returns two empty maps).
      afterBuild: async (root, ir) => {
        const { textLayouts, glyphRuns } = await collectTextLayouts(root, ir);
        const geometry = planLottie(ir, { layouts: textLayouts, runs: glyphRuns });
        if (!geometry.ok) {
          throw new Error(geometry.diagnostics.map((d) => d.message).join(" | "));
        }
        layers = geometry.layers;
      },
    },
    async ({ ir, plan, frames }) => {
      observer.onSampled?.(frames);
      // `afterBuild` always runs before sampling, and always sets `layers`
      // when it does not throw, so `use` is never reached without them.
      if (!layers) {
        throw new Error("[export] runLottieExport reached encoding with no planned layers.");
      }
      const doc: LottieDoc = encodeLottie(layers, frames, plan, {
        width: ir.width,
        height: ir.height,
        background: hexToRgb01(ir.background),
        name: "Marey scene",
      });
      return doc;
    },
  );
}
