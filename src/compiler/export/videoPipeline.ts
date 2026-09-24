import { Application, Container } from "pixi.js";
import { compileSource } from "../compileSource";
import { destroyExportApp } from "./exportApp";
import { planExport } from "./exportContract";
import { planVideo, type VideoContainer, type VideoPlan } from "./videoContract";
import { assertVideoEncodable, encodeVideo } from "./videoEncode";
import { createFrameRasterizer } from "./frameRaster";
import { buildNode } from "../renderer/builder";
import { sampleFrames, type FrameSnapshot } from "../renderer/frameSampler";
import { SceneRuntime } from "../renderer/sceneRuntime";
import { MatterWorld } from "../renderer/physicsWorld";

/**
 * Optional observation points, for the dev harness (`devVideoSeam.ts`).
 *
 * The shipped export button passes none, and pays nothing for them: no
 * reference images are kept, no hash is computed, and every canvas is
 * released once the encoder has copied it.
 */
export interface VideoExportObserver {
  /** Called once, after both contracts and the codec probe accept the request. */
  readonly onPlanned?: (plan: VideoPlan) => void;
  /** Called once with the sampler's own output, in the sampler's order. */
  readonly onSampled?: (frames: ReadonlyArray<FrameSnapshot>) => void;
  /**
   * Called with each canvas immediately before the encoder consumes it, and
   * awaited, so the observer can read its pixels before it is released.
   * `frame` is the sampled snapshot the canvas was rasterized from, by
   * identity, so an observer can place the canvas at that snapshot's
   * position in `onSampled`'s array rather than trusting the order the
   * canvases arrive in. That is what lets the harness catch this loop
   * reordering or dropping frames.
   */
  readonly onFrame?: (canvas: HTMLCanvasElement, frame: FrameSnapshot) => void | Promise<void>;
  /** mediabunny's resolved WebCodecs encoder config (see `EncodeVideoHooks`). */
  readonly onEncoderConfig?: (config: VideoEncoderConfig) => unknown;
}

export interface RunVideoExportOptions {
  readonly source: string;
  readonly container: VideoContainer;
  readonly fps: number;
  /** Explicit export bound in seconds. Overrides the scene's own duration. */
  readonly durationSeconds?: number;
  readonly onProgress?: (done: number, total: number) => void;
  readonly observer?: VideoExportObserver;
}

/**
 * Let the browser run other tasks, including a repaint, if at least this
 * long has passed since the last yield. A resolved promise is a microtask
 * and never lets the page repaint; a `MessageChannel` message is a task, and
 * unlike `setTimeout(0)` it is not clamped to 4 ms once nested.
 *
 * 100 ms rather than one display frame, measured (fix-wave report, item 3;
 * headless Chromium with SwiftShader, the full app page): at 16 ms a
 * 900-frame export took 43.7 s against 21-22 s with no explicit yield,
 * because every yield also lets the live preview repaint; at 100 ms it took
 * 22.1 s. The longest main-thread gap was the same, about 0.75 s, in all
 * three, so the explicit yield is not what ended the freeze: it guarantees a
 * repaint opportunity at least every 100 ms of rasterize-and-encode work
 * without relying on mediabunny's own backpressure awaits to provide one.
 */
const YIELD_EVERY_MS = 100;

function yieldToEventLoop(): Promise<void> {
  if (typeof MessageChannel === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/**
 * Compile, plan, probe, build, sample, then rasterize and encode one frame at
 * a time: the whole video export path, and the **only** copy of it. The top
 * bar's export buttons (`useExportVideo.ts`) call this, and so does the dev
 * harness seam (`devVideoSeam.ts`) through `observer`, so `video-check.mjs`
 * measures this orchestration rather than a hand-kept copy of it (ruling R45,
 * whole-branch review I-2: with two copies, reversing or thinning the frames
 * here left every test and the harness green).
 *
 * Neither caller reaches the other: this module never imports
 * `devVideoSeam.ts` (`exportBoundary.test.ts` pins that), and the button does
 * not call the dev-only `window.__mareyExportVideo` global, which is
 * constant-folded out of a production build (`main.tsx`).
 *
 * **Order matters in three places (whole-branch review I-4):**
 * - The environment and codec probe (`assertVideoEncodable`) runs before the
 *   scene is built or sampled, so a refusal (insecure context, unsupported
 *   codec) arrives before the scene has been simulated rather than after.
 * - Frames are rasterized lazily, inside the encode loop. The earlier
 *   `frames.map(rasterize)` held every frame's canvas at once (PixiJS's
 *   `extract.canvas()` allocates a new one per call), about 1.9 MB per
 *   800x600 frame, and blocked the page until all of them existed.
 * - The loop yields to the event loop about once per display frame, so the
 *   progress label repaints. `sampleFrames` itself is synchronous and frozen
 *   by GC7; its share of the freeze remains (recorded in
 *   `eval/RESULTS-PHASE-5B.md`).
 *
 * Every failure surfaces as a thrown `Error` whose `.message` is the
 * triggering diagnostic's `message` **verbatim** — `EXPORT_*` from
 * `planExport`, `VIDEO_*` from `planVideo` or `assertVideoEncodable` — never
 * rewrapped with an added prefix, because `useExportVideo.ts` shows it in a
 * toast as it is, and those messages are written for a person
 * (`videoContract.ts`, `exportContract.ts`).
 */
export async function runVideoExport(opts: RunVideoExportOptions): Promise<Uint8Array> {
  const observer = opts.observer ?? {};
  const outcome = compileSource(opts.source);
  if (!outcome.ok || !outcome.ir) {
    throw new Error(
      `Source did not compile: ${outcome.errors.map((e) => `${e.phase}: ${e.message}`).join(" | ")}`,
    );
  }
  const ir = outcome.ir;

  // `" | "`, not `" "`: `planExport` accumulates, and each diagnostic is a
  // complete sentence, so two joined with a space read as one confused
  // message in a toast (`exportContract.ts:87-114`).
  const planned = planExport(ir, { fps: opts.fps, durationSeconds: opts.durationSeconds });
  if (!planned.ok) {
    throw new Error(planned.diagnostics.map((d) => d.message).join(" | "));
  }

  const video = planVideo(ir, planned.plan, { container: opts.container });
  if (!video.ok) {
    throw new Error(video.diagnostics.map((d) => d.message).join(" | "));
  }

  await assertVideoEncodable(video.plan);
  observer.onPlanned?.(video.plan);

  // `app` is assigned before it is known whether `init()` will succeed, and
  // the `finally` below gates on `app.renderer` (assigned only once
  // `init()`'s `autoDetectRenderer(...)` resolves) rather than on `app`
  // alone, so a failed `init()` cannot turn into a second, masking crash
  // inside `finally`. The `try` opens at `new Application()` so a throw from
  // `init()`, the `buildNode` loop or either constructor cannot leak a live
  // WebGL context.
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

    // Sample the whole scene first, then encode: `encodeVideo` never sees
    // the runtime, so the two phases cannot interleave even by mistake.
    const frames = sampleFrames(runtime, root, planned.plan);
    observer.onSampled?.(frames);
    const rasterize = createFrameRasterizer(app, root, frames, video.plan.scale);

    async function* rasterized(): AsyncGenerator<HTMLCanvasElement> {
      let lastYield = performance.now();
      for (const frame of frames) {
        // `createFrameRasterizer` returns PixiJS's `ICanvas`, which is not
        // assignable to the DOM types `encodeVideo` declares (its docstring
        // explains why that signature stays narrow). In a browser with the
        // default adapter, `extract.canvas()` is a plain
        // `document.createElement("canvas")` (`BrowserAdapter.mjs`), so this
        // cast states what the value is; it belongs here, the one place that
        // holds both types.
        const canvas = rasterize(frame) as unknown as HTMLCanvasElement;
        await observer.onFrame?.(canvas, frame);
        yield canvas;
        // Resumed only when the encoder asks for the next frame, by which
        // point it has copied this one into a `VideoSample`. Zero-sizing the
        // canvas frees its backing store now rather than whenever the
        // garbage collector gets to it.
        canvas.width = 0;
        canvas.height = 0;
        if (performance.now() - lastYield >= YIELD_EVERY_MS) {
          await yieldToEventLoop();
          lastYield = performance.now();
        }
      }
    }

    return await encodeVideo(video.plan, rasterized(), {
      onProgress: opts.onProgress,
      onEncoderConfig: observer.onEncoderConfig,
    });
  } finally {
    runtime?.destroy();
    root?.destroy({ children: true, texture: true });
    if (app?.renderer) destroyExportApp(app);
  }
}
