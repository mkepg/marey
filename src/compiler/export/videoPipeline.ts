import { RendererType, type Application, type WebGLRenderer } from "pixi.js";
import {
  deviceLimitDiagnostic,
  noWebGLDiagnostic,
  planVideo,
  type VideoContainer,
  type VideoPlan,
} from "./videoContract";
import { assertVideoEncodable, encodeVideo } from "./videoEncode";
import type { FrameSnapshot } from "../renderer/frameSampler";
import { withRasterExport, YIELD_EVERY_MS, yieldToEventLoop } from "./rasterExport";

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
 * Compile, plan, probe, build, sample, then rasterize and encode one frame at
 * a time: the whole video export path, and the **only** copy of it. The top
 * bar's export buttons (`useExport.ts`) call this, and so does the dev
 * harness seam (`devVideoSeam.ts`) through `observer`, so `video-check.mjs`
 * measures this orchestration rather than a hand-kept copy of it (ruling R45,
 * whole-branch review I-2: with two copies, reversing or thinning the frames
 * here left every test and the harness green).
 *
 * The compile -> plan -> build -> sample prefix and the teardown around it
 * are `rasterExport.ts`'s `withRasterExport` (Phase 5C Task 4): this
 * function supplies only what is video-specific, through `beforeBuild`,
 * `scale` and `afterInit`, plus the lazy rasterize-and-encode loop below.
 *
 * Neither caller reaches the other: this module never imports
 * `devVideoSeam.ts` (`exportBoundary.test.ts` pins that), and the button does
 * not call the dev-only `window.__mareyExportVideo` global, which is
 * constant-folded out of a production build (`main.tsx`).
 *
 * **Order matters in three places (whole-branch review I-4):**
 * - The environment and codec probe (`assertVideoEncodable`) runs inside
 *   `beforeBuild`, which `withRasterExport` calls before any `Application`
 *   exists, so a refusal (insecure context, unsupported codec) arrives
 *   before the scene has been simulated rather than after.
 * - Frames are rasterized lazily, inside the encode loop. The earlier
 *   `frames.map(rasterize)` held every frame's canvas at once (PixiJS's
 *   `extract.canvas()` allocates a new one per call), about 1.9 MB per
 *   800x600 frame, and blocked the page until all of them existed.
 * - The loop yields to the event loop at least every `YIELD_EVERY_MS`
 *   (100 ms) of work (`rasterExport.ts`), so the progress label repaints. `sampleFrames` itself is synchronous and frozen
 *   by GC7; its share of the freeze remains (recorded in
 *   `eval/RESULTS-PHASE-5B.md`).
 *
 * Every failure surfaces as a thrown `Error` whose `.message` is the
 * triggering diagnostic's `message` **verbatim** — `EXPORT_*` from
 * `planExport`, `VIDEO_*` from `planVideo` or `assertVideoEncodable` — never
 * rewrapped with an added prefix, because `useExport.ts` shows it in a
 * toast as it is, and those messages are written for a person
 * (`videoContract.ts`, `exportContract.ts`).
 */
export async function runVideoExport(opts: RunVideoExportOptions): Promise<Uint8Array> {
  const observer = opts.observer ?? {};

  // Stashed by `beforeBuild` once `planVideo` and the codec probe have both
  // accepted the request, so `scale` and the encode step below can read it
  // without re-deriving it: `planVideo` is pure, but recomputing its result
  // in a second place would still be a second copy of the decision.
  let videoPlan: VideoPlan | undefined;

  return withRasterExport(
    {
      source: opts.source,
      fps: opts.fps,
      durationSeconds: opts.durationSeconds,
      // Read only after `beforeBuild` has run (`withRasterExport`'s own
      // order), so this always sees the `VideoPlan` `beforeBuild` just
      // computed rather than racing it.
      scale: () => videoPlan!.scale,
      // `planVideo` and the encoder probe run here, before any Application
      // exists (5B ruling I-4).
      beforeBuild: async (ir, plan) => {
        const video = planVideo(ir, plan, { container: opts.container });
        if (!video.ok) {
          throw new Error(video.diagnostics.map((d) => d.message).join(" | "));
        }
        await assertVideoEncodable(video.plan);
        videoPlan = video.plan;
        observer.onPlanned?.(video.plan);
      },
      // Refuse a coded size the device's own GL context cannot render,
      // before building or sampling the scene (spec §2.3). PixiJS checks no
      // texture-size limit of its own (research §6), so without this a
      // scene whose coded size exceeds the device's limits would fail deep
      // inside WebGL with no name a person could act on.
      // `deviceLimitDiagnostic` is the pure comparison (`videoContract.ts`,
      // headlessly tested); this is the one line that reads the device's
      // actual limits.
      afterInit: (app: Application) => {
        // The limits below exist only on a WebGL context. pixi falls back to
        // WebGPU and then canvas when WebGL is unavailable, and neither has
        // `gl`, so refuse by name first (`noWebGLDiagnostic`).
        if (app.renderer.type !== RendererType.WEBGL) {
          throw new Error(noWebGLDiagnostic(app.renderer.name).message);
        }
        const gl = (app.renderer as WebGLRenderer).gl;
        const limitRefusal = deviceLimitDiagnostic(
          videoPlan!,
          gl.getParameter(gl.MAX_TEXTURE_SIZE),
          gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        );
        if (limitRefusal) throw new Error(limitRefusal.message);
      },
    },
    async ({ frames, rasterize }) => {
      observer.onSampled?.(frames);
      const plan = videoPlan!;
      // Always present: this pipeline supplies `scale`, and
      // `withRasterExport`'s first overload types `rasterize` as required
      // whenever it does.
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

      return await encodeVideo(plan, rasterized(), {
        onProgress: opts.onProgress,
        onEncoderConfig: observer.onEncoderConfig,
      });
    },
  );
}
