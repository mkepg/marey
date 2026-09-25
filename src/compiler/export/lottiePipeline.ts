import { Application, Container } from "pixi.js";
import { compileSource } from "../compileSource";
import { destroyExportApp } from "./exportApp";
import { planExport } from "./exportContract";
import { planLottie, hexToRgb01 } from "./lottieGeometry";
import { encodeLottie, type LottieDoc } from "./lottieEncode";
import { buildNode } from "../renderer/builder";
import { sampleFrames, type FrameSnapshot } from "../renderer/frameSampler";
import { SceneRuntime } from "../renderer/sceneRuntime";
import { MatterWorld } from "../renderer/physicsWorld";

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
 * Neither caller reaches the other: this module never imports
 * `devLottieSeam.ts` (`exportBoundary.test.ts` pins that), and the button
 * does not call the dev-only `window.__mareyExportLottie` global, which is
 * constant-folded out of a production build (`main.tsx`).
 *
 * Unlike the PNG/video seams this makes no `extract` call and produces no
 * renderer output — a Lottie document is inert JSON, not pixels — but it
 * still constructs a real `Application`, because `SceneRuntime` and the tree
 * `buildNode` produces expect a live Pixi context to attach to. `autoStart:
 * false` (renderer invariant: nothing here may advance on a wall clock).
 *
 * Every failure surfaces as a thrown `Error` whose `.message` is the
 * triggering diagnostic's `message` **verbatim**, joined with `" | "` when
 * there is more than one — never rewrapped with an added prefix, matching
 * `runVideoExport`'s contract, because `useExport.ts` shows it in a toast as
 * it is.
 */
export async function runLottieExport(opts: RunLottieExportOptions): Promise<LottieDoc> {
  const observer = opts.observer ?? {};
  const outcome = compileSource(opts.source);
  if (!outcome.ok || !outcome.ir) {
    throw new Error(
      `Source did not compile: ${outcome.errors.map((e) => `${e.phase}: ${e.message}`).join(" | ")}`,
    );
  }
  const ir = outcome.ir;

  const planned = planExport(ir, { fps: opts.fps, durationSeconds: opts.durationSeconds });
  if (!planned.ok) {
    throw new Error(planned.diagnostics.map((d) => d.message).join(" | "));
  }

  // Fires before any Pixi object exists, matching design §2's "diagnostics
  // are properties of the scene, not of the frames" — an unsupported node is
  // rejected before a single tick is simulated, and before any GL context is
  // opened.
  const geometry = planLottie(ir);
  if (!geometry.ok) {
    throw new Error(geometry.diagnostics.map((d) => d.message).join(" | "));
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
  // WebGL context — never destroyed. A caller retrying this export against a
  // scene that fails to build would accumulate leaked contexts until the
  // browser's limit is exhausted, which breaks the live preview too, not
  // just the export.
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
    observer.onSampled?.(frames);
    const doc: LottieDoc = encodeLottie(geometry.layers, frames, planned.plan, {
      width: ir.width,
      height: ir.height,
      background: hexToRgb01(ir.background),
      name: "Marey scene",
    });

    return doc;
  } finally {
    runtime?.destroy();
    root?.destroy({ children: true, texture: true });
    if (app?.renderer) destroyExportApp(app);
  }
}
