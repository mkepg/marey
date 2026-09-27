import type { FrameSnapshot } from "../renderer/frameSampler";
import { withRasterExport, YIELD_EVERY_MS, yieldToEventLoop } from "./rasterExport";
import { pngBytesOf } from "./pngSequence";

/**
 * Optional observation points, for the dev harness (`src/lib/devExportSeam.ts`).
 * Mirrors `ApngExportObserver` (`apngPipeline.ts`) and `VideoExportObserver`
 * (`videoPipeline.ts`): the shape this task moves out of `devExportSeam.ts`
 * pays nothing extra for them -- no PNG bytes or frames are kept beyond what
 * `opts.onPng` itself chooses to retain.
 */
export interface PngExportObserver {
  /** Called once with the sampler's own output, in the sampler's order. */
  readonly onSampled?: (frames: ReadonlyArray<FrameSnapshot>) => void;
}

export interface RunPngExportOptions {
  readonly source: string;
  readonly fps: number;
  /** Explicit export bound in seconds. Overrides the scene's own duration. */
  readonly durationSeconds?: number;
  /** Awaited once per frame, in the sampler's order; `frame.index` places it. */
  readonly onPng: (frame: FrameSnapshot, png: Uint8Array) => void | Promise<void>;
  readonly observer?: PngExportObserver;
}

export interface PngExportResult {
  readonly fps: number;
  readonly frameCount: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Compile, plan, build, sample, then rasterize and hand off one PNG frame at
 * a time: the whole PNG-sequence export path, and the **only** copy of it
 * (ruling R45, global constraint 7). Moved out of `devExportSeam.ts` in this
 * task, the same move Phase 5B made for video and Phase 5C Task 5 made for
 * APNG, so `marey export --format png` (a later task) and the dev harness
 * seam both call this rather than either holding its own copy.
 *
 * The compile -> plan -> build -> sample prefix and the teardown around it
 * are `rasterExport.ts`'s `withRasterExport`; this function supplies only
 * `scale: 1` (spec §2.1/O3: a plain PNG sequence, like APNG, is never
 * upscaled -- "2x" is a video-only decision) plus the lazy rasterize loop
 * below.
 *
 * Frames are rasterized lazily, inside that loop, for the identical reason
 * `runApngExport` and `runVideoExport` are: `PreparedRasterExport.rasterize`
 * allocates a new canvas per call, and holding every frame's canvas at once
 * would block the page until all of them existed. The loop's shape --
 * rasterize, read the canvas's PNG bytes with `pngBytesOf`, zero the canvas,
 * hand the bytes to `opts.onPng`, then yield to the event loop about once per
 * `YIELD_EVERY_MS` of work -- mirrors `runApngExport`'s mux loop, and reuses
 * that module's shared `YIELD_EVERY_MS`/`yieldToEventLoop`
 * (`rasterExport.ts`) rather than a second copy of either.
 *
 * `opts.onPng` is this pipeline's only way to keep a frame's bytes past its
 * own iteration -- unlike `runApngExport`, which must accumulate every
 * frame's PNG bytes itself to mux them into one file, a PNG sequence has no
 * single output to build, so nothing here holds more than one frame's bytes
 * at a time. The caller (a CLI writing one file per frame, or the dev seam
 * base64-encoding into a preallocated array) decides what "keep" means.
 *
 * Every failure surfaces as a thrown `Error` whose `.message` is the
 * triggering diagnostic's `message` verbatim (`EXPORT_*` from `planExport`)
 * -- never rewrapped, matching `runApngExport`'s and `runVideoExport`'s
 * contract.
 */
export async function runPngExport(opts: RunPngExportOptions): Promise<PngExportResult> {
  const observer = opts.observer ?? {};

  return withRasterExport(
    {
      source: opts.source,
      fps: opts.fps,
      durationSeconds: opts.durationSeconds,
      scale: 1,
    },
    async ({ ir, plan, frames, rasterize }) => {
      observer.onSampled?.(frames);
      let lastYield = performance.now();
      for (const frame of frames) {
        const canvas = rasterize(frame);
        const png = await pngBytesOf(canvas);
        // Resumed only after this frame's bytes are read; zero-sizing frees
        // the canvas's backing store now rather than waiting on the GC --
        // memory hygiene with no observable output, same status
        // `runApngExport`'s identical lines carry (that module's own comment
        // says so too).
        canvas.width = 0;
        canvas.height = 0;
        await opts.onPng(frame, png);
        if (performance.now() - lastYield >= YIELD_EVERY_MS) {
          await yieldToEventLoop();
          lastYield = performance.now();
        }
      }
      return { fps: plan.fps, frameCount: plan.frameCount, width: ir.width, height: ir.height };
    },
  );
}
