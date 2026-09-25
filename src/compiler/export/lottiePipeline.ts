import { planLottie, hexToRgb01, type LayerSpec } from "./lottieGeometry";
import { encodeLottie, type LottieDoc } from "./lottieEncode";
import type { FrameSnapshot } from "../renderer/frameSampler";
import { withRasterExport } from "./rasterExport";

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

  // Stashed by `beforeBuild`, so the encode step inside `use` can read the
  // layers `planLottie` already computed rather than a second copy.
  let layers: ReadonlyArray<LayerSpec> | undefined;

  return withRasterExport(
    {
      source: opts.source,
      fps: opts.fps,
      durationSeconds: opts.durationSeconds,
      // Fires before any Pixi object exists, matching design §2's
      // "diagnostics are properties of the scene, not of the frames" — an
      // unsupported node is rejected before a single tick is simulated, and
      // before any GL context is opened.
      beforeBuild: (ir) => {
        const geometry = planLottie(ir);
        if (!geometry.ok) {
          throw new Error(geometry.diagnostics.map((d) => d.message).join(" | "));
        }
        layers = geometry.layers;
      },
    },
    async ({ ir, plan, frames }) => {
      observer.onSampled?.(frames);
      // `beforeBuild` always runs, and always sets `layers` when it does not
      // throw, before `use` is ever called.
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
