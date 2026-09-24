import { Application, Container } from "pixi.js";
import { compileSource } from "../compileSource";
import { planExport } from "./exportContract";
import { planVideo, type VideoContainer } from "./videoContract";
import { encodeVideo } from "./videoEncode";
import { createFrameRasterizer } from "./frameRaster";
import { buildNode } from "../renderer/builder";
import { sampleFrames } from "../renderer/frameSampler";
import { SceneRuntime } from "../renderer/sceneRuntime";
import { MatterWorld } from "../renderer/physicsWorld";

export interface RunVideoExportOptions {
  readonly source: string;
  readonly container: VideoContainer;
  readonly fps: number;
  /** Explicit export bound in seconds. Overrides the scene's own duration. */
  readonly durationSeconds?: number;
  readonly onProgress?: (done: number, total: number) => void;
}

/**
 * Compile, plan, build, sample, rasterize, encode — the whole video export
 * path, for a real UI control rather than a harness.
 *
 * Task 5's brief (`.sdd/2026-09-18-phase-5b-video/task-5-brief.md`)
 * requires `useExportVideo.ts` to consume "the same pipeline
 * `devVideoSeam.ts` uses" without calling `window.__mareyExportVideo` (that
 * seam is `import.meta.env.DEV`-gated and constant-folded out of a
 * production build — `main.tsx` — so a caller reaching through it would work
 * in `npm run dev` and silently do nothing once built) and without importing
 * `devVideoSeam.ts` itself. This module is the extracted answer: the
 * compile -> plan -> build -> sample -> rasterize -> encode call order and
 * the try/finally teardown shape are read directly from `devVideoSeam.ts`'s
 * `exportVideo` (Task 3/4's reference implementation, reasoning preserved
 * there) and reproduced here, not imported — `exportBoundary.test.ts` pins
 * that this file never imports `devVideoSeam.ts` in any form, the same way
 * it already pins that `videoEncode.ts`/`videoContract.ts` never import
 * `pixi.js`.
 *
 * Deliberately narrower than `devVideoSeam.ts`'s `exportVideo`: no base64
 * encoding, no reference-PNG re-extraction, no `hashFrames` call. Those
 * exist only for `video-check.mjs`'s frame-by-frame comparison harness: a
 * shipped export button has no use for a simulation-output hash or a second
 * copy of every frame as a PNG, and computing them here would cost real time
 * and memory a person waiting on a download does not benefit from.
 *
 * Every failure surfaces as a thrown `Error` whose `.message` is the
 * triggering diagnostic's `message` **verbatim** — `EXPORT_*` from
 * `planExport`, `VIDEO_*` from `planVideo` or `encodeVideo`'s own
 * `VideoExportError` — never rewrapped with an added prefix. `devVideoSeam.ts`
 * prefixes its own rethrow with `[export] ` because that text is for a
 * harness author reading a Node exception; here the same text lands
 * verbatim in a toast a person reads, and `VIDEO_*`/`EXPORT_*` messages are
 * already written for exactly that (`videoContract.ts`, `exportContract.ts`).
 * Adding a prefix here would be a second, driftable copy of wording that
 * already exists once.
 */
export async function runVideoExport(opts: RunVideoExportOptions): Promise<Uint8Array> {
  const outcome = compileSource(opts.source);
  if (!outcome.ok || !outcome.ir) {
    throw new Error(
      `Source did not compile: ${outcome.errors.map((e) => `${e.phase}: ${e.message}`).join(" | ")}`,
    );
  }
  const ir = outcome.ir;

  // `" | "`, not `" "`. `planExport` accumulates: an unbounded scene
  // requested at an unsupported frame rate returns EXPORT_UNSUPPORTED_FPS
  // *and* EXPORT_UNBOUNDED_SCENE (`exportContract.ts:87-114`), and each
  // diagnostic message is a complete sentence ending in a full stop. Joined
  // with a space, two of them run together into one paragraph in a toast
  // and read as a single confused message; joined with `" | "` they read as
  // two refusals, which is what they are. `" | "` also matches what all
  // three dev seams already use (`devVideoSeam.ts:110/117/122`,
  // `devExportSeam.ts`, `devLottieSeam.ts`) and what line 62 above already
  // used for compile errors -- this file was inconsistent with itself.
  const planned = planExport(ir, { fps: opts.fps, durationSeconds: opts.durationSeconds });
  if (!planned.ok) {
    throw new Error(planned.diagnostics.map((d) => d.message).join(" | "));
  }

  const video = planVideo(ir, planned.plan, { container: opts.container });
  if (!video.ok) {
    throw new Error(video.diagnostics.map((d) => d.message).join(" | "));
  }

  // Same reasoning as `devVideoSeam.ts`: `app` is assigned before it is known
  // whether `init()` will succeed, and the `finally` below gates on
  // `app.renderer` (assigned only once `init()`'s `autoDetectRenderer(...)`
  // resolves) rather than on `app` alone, so a failed `init()` cannot turn
  // into a second, masking crash inside `finally`.
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

    // Sample the whole scene first, then encode — `encodeVideo` never sees
    // the runtime, so the two phases cannot interleave even by mistake.
    const frames = sampleFrames(runtime, root, planned.plan);
    const rasterize = createFrameRasterizer(app, root, frames);
    const canvases = frames.map(rasterize);

    // `createFrameRasterizer` returns PixiJS's `ICanvas`, not assignable to
    // the DOM `CanvasImageSource` union `encodeVideo` declares (its own
    // docstring explains why that signature stays narrow — widening it would
    // put a pixi type inside a module `exportBoundary.test.ts` forbids from
    // importing one). The cast belongs at this call site, the one place that
    // holds both types, exactly as it does in `devVideoSeam.ts`. At runtime
    // this is not a lie: in a real browser with `autoStart: false`,
    // `app.renderer.extract.canvas()` returns a real `HTMLCanvasElement`,
    // which satisfies `CanvasImageSource`.
    return await encodeVideo(
      video.plan,
      canvases as unknown as CanvasImageSource[],
      { onProgress: opts.onProgress },
    );
  } finally {
    runtime?.destroy();
    root?.destroy({ children: true, texture: true });
    if (app?.renderer) app.destroy(true, { children: true });
  }
}
