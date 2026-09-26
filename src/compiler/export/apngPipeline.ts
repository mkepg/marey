import type { FrameSnapshot } from "../renderer/frameSampler";
import { withRasterExport, YIELD_EVERY_MS, yieldToEventLoop } from "./rasterExport";
import { pngBytesOf } from "./pngSequence";
import { encodeApng } from "./apngEncode";

/**
 * Optional observation points, for the dev harness
 * (`src/lib/devApngSeam.ts`). Mirrors `VideoExportObserver`
 * (`videoPipeline.ts`): the shipped export button passes none, and pays
 * nothing for them -- no reference images are kept, and every canvas is
 * released once its PNG bytes have been read.
 */
export interface ApngExportObserver {
  /** Called once with the sampler's own output, in the sampler's order. */
  readonly onSampled?: (frames: ReadonlyArray<FrameSnapshot>) => void;
  /**
   * Called with each canvas immediately before its pixels are read into PNG
   * bytes, and awaited, so the observer can read them first. `frame` is the
   * sampled snapshot the canvas was rasterized from, by identity -- see
   * `devApngSeam.ts` for why an observer must slot on `frame.index`, not on
   * the order canvases arrive in (Task 4 ruling T4-R2, carried into this
   * seam too).
   */
  readonly onFrame?: (canvas: HTMLCanvasElement, frame: FrameSnapshot) => void | Promise<void>;
}

export interface RunApngExportOptions {
  readonly source: string;
  readonly fps: number;
  /** Explicit export bound in seconds. Overrides the scene's own duration. */
  readonly durationSeconds?: number;
  readonly onProgress?: (done: number, total: number) => void;
  readonly observer?: ApngExportObserver;
}

/**
 * Compile, plan, build, sample, then rasterize and mux one frame at a time:
 * the whole APNG export path, and the **only** copy of it (ruling R45,
 * global constraint 7). The top bar's **apng** button (`useExport.ts`)
 * calls this, and so does the dev harness seam (`devApngSeam.ts`) through
 * `observer`, so `tools/visual-check/apng-check.mjs` measures this
 * orchestration rather than a hand-kept copy of it -- the same reasoning
 * `videoPipeline.ts` and `lottiePipeline.ts` already carry.
 *
 * The compile -> plan -> build -> sample prefix and the teardown around it
 * are `rasterExport.ts`'s `withRasterExport` (Phase 5C Task 4); this
 * function supplies only `scale: 1` (spec §5.2, design §2.1/O3: APNG, like
 * the plain PNG sequence, is never upscaled -- "2x" is a video-only
 * decision) plus the lazy rasterize-and-mux loop below.
 *
 * Frames are rasterized lazily, inside that loop, for the identical reason
 * `runVideoExport` does: `PreparedRasterExport.rasterize` allocates a new
 * canvas per call, and holding every frame's canvas at once before muxing
 * would block the page until all of them existed. The loop's shape --
 * rasterize, hand the canvas to `observer.onFrame`, read its PNG bytes with
 * `pngBytesOf` (`pngSequence.ts`, exported for this), zero the canvas, then
 * yield to the event loop about once per `YIELD_EVERY_MS` of work -- mirrors
 * `runVideoExport`'s encode loop exactly, and reuses that module's own
 * `YIELD_EVERY_MS`/`yieldToEventLoop` (moved into `rasterExport.ts` in this
 * same task) rather than a second copy of either.
 *
 * Only compressed PNG bytes are held for more than one iteration -- the
 * `pngs` array below -- never a second live canvas or raw pixel buffer, so
 * a long export's peak memory is bounded by the muxed output, not by the
 * frame count times the canvas size.
 *
 * Every failure surfaces as a thrown `Error` whose `.message` is the
 * triggering diagnostic's `message` verbatim (`EXPORT_*` from `planExport`)
 * -- never rewrapped, matching `runVideoExport`'s and `runLottieExport`'s
 * contract, because `useExport.ts` shows it in a toast as it is.
 */
export async function runApngExport(opts: RunApngExportOptions): Promise<Uint8Array> {
  const observer = opts.observer ?? {};

  return withRasterExport(
    {
      source: opts.source,
      fps: opts.fps,
      durationSeconds: opts.durationSeconds,
      scale: 1,
    },
    async ({ plan, frames, rasterize }) => {
      observer.onSampled?.(frames);
      // `withRasterExport` only omits `rasterize` when its caller supplies no
      // `scale`; this pipeline always does, so this is unreachable -- same
      // guard `runVideoExport` carries for the identical reason.
      if (!rasterize) {
        throw new Error("[export] runApngExport requested no raster scale, so there is nothing to mux.");
      }
      const rasterizeFrame = rasterize;

      const pngs: Uint8Array[] = [];
      let done = 0;
      let lastYield = performance.now();
      for (const frame of frames) {
        const canvas = rasterizeFrame(frame);
        // See `runVideoExport`'s identical cast for why an `ICanvas` from
        // this rasterizer is a plain `document.createElement("canvas")` in a
        // browser with the default adapter, and belongs to the one function
        // that holds both types.
        await observer.onFrame?.(canvas as unknown as HTMLCanvasElement, frame);
        pngs.push(await pngBytesOf(canvas));
        // Resumed only after this frame's bytes are read; zero-sizing frees
        // the canvas's backing store now rather than waiting on the GC.
        canvas.width = 0;
        canvas.height = 0;
        done += 1;
        opts.onProgress?.(done, frames.length);
        if (performance.now() - lastYield >= YIELD_EVERY_MS) {
          await yieldToEventLoop();
          lastYield = performance.now();
        }
      }

      return encodeApng(pngs, { fps: plan.fps });
    },
  );
}
