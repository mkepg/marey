import { Application, Container } from "pixi.js";
import { compileSource } from "../compiler/compileSource";
import { planExport } from "../compiler/export/exportContract";
import { planLottie } from "../compiler/export/lottieGeometry";
import { encodeLottie, type LottieDoc } from "../compiler/export/lottieEncode";
import { hashFrames } from "../compiler/export/frameHash";
import { buildNode } from "../compiler/renderer/builder";
import { sampleFrames } from "../compiler/renderer/frameSampler";
import { SceneRuntime } from "../compiler/renderer/sceneRuntime";
import { MatterWorld } from "../compiler/renderer/physicsWorld";
import type { IRColor } from "../compiler/sceneIR";

/** What `window.__mareyExportLottie` resolves to. */
export interface ExportLottieResult {
  /** The whole Lottie document. Typed `unknown` at this boundary on purpose:
   * a Playwright harness receives it over `page.evaluate`'s JSON channel and
   * has no reason to import `LottieDoc` to write it to disk or hand it to
   * lottie-web, which takes `unknown` JSON itself. */
  readonly doc: unknown;
  /** `hashFrames` over the sampled snapshots — simulation output, not the
   * encoded document — so a harness can check cross-reload determinism the
   * same way `export-check.mjs` does for the PNG seam. */
  readonly hash: string;
  readonly fps: number;
  readonly frameCount: number;
}

export interface ExportLottieOptions {
  readonly fps: number;
  readonly durationSeconds?: number;
}

declare global {
  interface Window {
    /**
     * Dev-only export seam for Task 4's Lottie browser harness
     * (`tools/visual-check/lottie-check.mjs`).
     *
     * Absent from a production build for the same reason
     * `__mareyExportPng` is: `main.tsx` reaches it through a dynamic import
     * inside `if (import.meta.env.DEV)`, which Vite constant-folds to
     * `false` when building, dropping the whole module rather than merely
     * leaving the global unset.
     */
    __mareyExportLottie?: (
      source: string,
      opts: ExportLottieOptions,
    ) => Promise<ExportLottieResult>;
  }
}

/**
 * `lottieGeometry.ts`'s hex→0-1-float conversion is private (`hexToRgb01`,
 * not exported), and that file is outside this task's allowed edit list, so
 * the scene background needs the same one-line conversion reproduced here to
 * build the `LottieSceneInfo` `encodeLottie` requires. Not a new instance of
 * the AGENT-LESSONS §5 hand-synced-list problem: `lottieRoundTrip.test.ts`
 * already duplicates this exact function for the identical reason (its own
 * header comment names it), so this is the established precedent for this
 * boundary, not a second one.
 */
function hexToRgb01(hex: IRColor): readonly [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r / 255, g / 255, b / 255];
}

/**
 * Compile, plan, build, sample, encode to Lottie — with no UI and no product
 * export button, the same reasoning as `devExportSeam.ts`'s `exportPng`.
 *
 * Unlike the PNG seam this makes no `extract` call and produces no renderer
 * output — a Lottie document is inert JSON, not pixels — but it still
 * constructs a real `Application`, because `SceneRuntime` and the tree
 * `buildNode` produces expect a live Pixi context to attach to. `autoStart:
 * false` (renderer invariant: nothing here may advance on a wall clock).
 */
async function exportLottie(
  source: string,
  opts: ExportLottieOptions,
): Promise<ExportLottieResult> {
  const outcome = compileSource(source);
  if (!outcome.ok || !outcome.ir) {
    throw new Error(
      `[export] Source did not compile: ${outcome.errors.map((e) => `${e.phase}: ${e.message}`).join(" | ")}`,
    );
  }
  const ir = outcome.ir;

  const planned = planExport(ir, { fps: opts.fps, durationSeconds: opts.durationSeconds });
  if (!planned.ok) {
    throw new Error(`[export] ${planned.diagnostics.map((d) => d.message).join(" | ")}`);
  }

  // Fires before any Pixi object exists, matching design §2's "diagnostics
  // are properties of the scene, not of the frames" — an unsupported node is
  // rejected before a single tick is simulated, and before any GL context is
  // opened.
  const geometry = planLottie(ir);
  if (!geometry.ok) {
    throw new Error(`[export] ${geometry.diagnostics.map((d) => d.message).join(" | ")}`);
  }

  // Constructed incrementally below and torn down in `finally`, which
  // destroys only what actually exists. `app` is assigned before it is known
  // whether `init()` will succeed, on purpose: `Application.destroy()` reaches
  // straight into `this.renderer.destroy(...)` with no null check, and
  // `renderer` is only assigned once `init()`'s `autoDetectRenderer(...)`
  // resolves — so guarding on `app` alone would turn a failed `init()` into a
  // second, masking crash inside `finally`. Gating on `app.renderer` instead
  // means "destroy only if there is a renderer to destroy."
  //
  // The `try` starts here, at `new Application()`, rather than lower down:
  // before this fix (in the PNG seam this is modelled on) it opened only
  // after `app`, `root`, `world` and `runtime` had all already been
  // constructed, so a throw from `app.init()`, the `buildNode` loop, or
  // either constructor left an initialised `Application` — a live canvas and
  // WebGL context — never destroyed. A caller retrying
  // `window.__mareyExportLottie` against a scene that fails to build would
  // accumulate leaked contexts until the browser's limit is exhausted, which
  // breaks the live preview too, not just the export.
  let app: Application | undefined;
  let root: Container | undefined;
  let runtime: SceneRuntime | undefined;
  try {
    app = new Application();
    await app.init({
      width: ir.width,
      height: ir.height,
      background: ir.background,
      backgroundAlpha: 1,
      antialias: true,
      resolution: 1,
      autoDensity: false,
      autoStart: false,
    });

    root = new Container();
    for (const node of ir.children) root.addChild(buildNode(node));

    const world = new MatterWorld(ir.width, ir.height);
    runtime = new SceneRuntime(world, root);

    const frames = sampleFrames(runtime, root, planned.plan);
    const doc: LottieDoc = encodeLottie(geometry.layers, frames, planned.plan, {
      width: ir.width,
      height: ir.height,
      background: hexToRgb01(ir.background),
      name: "devLottieSeam",
    });

    return {
      doc,
      hash: hashFrames(frames),
      fps: planned.plan.fps,
      frameCount: planned.plan.frameCount,
    };
  } finally {
    runtime?.destroy();
    root?.destroy({ children: true, texture: true });
    if (app?.renderer) app.destroy(true, { children: true });
  }
}

export function installLottieSeam(): void {
  window.__mareyExportLottie = exportLottie;
}
