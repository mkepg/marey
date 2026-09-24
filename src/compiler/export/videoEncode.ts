import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  VideoSampleSource,
  VideoSample,
} from "mediabunny";
import {
  frameTimestampSeconds,
  frameDurationSeconds,
  noWebCodecsDiagnostic,
  unsupportedCodecDiagnostic,
  videoOutputFormatOptions,
  videoSourceConfig,
  type VideoDiagnostic,
  type VideoPlan,
} from "./videoContract";

/** Optional callbacks. The shipped export button passes only `onProgress`. */
export interface EncodeVideoHooks {
  readonly onProgress?: (done: number, total: number) => void;
  /**
   * mediabunny's `onEncoderConfig`: the WebCodecs `VideoEncoderConfig` it
   * builds from `videoSourceConfig(plan)`, called once per candidate before
   * `isConfigSupported` selects one. Used by the dev harness to record the
   * resolved config in its evidence.
   */
  readonly onEncoderConfig?: (config: VideoEncoderConfig) => unknown;
}

/**
 * A refusal carrying its diagnostic, so a UI can show the message and a
 * harness can assert on the code.
 */
export class VideoExportError extends Error {
  readonly diagnostic: VideoDiagnostic;
  constructor(diagnostic: VideoDiagnostic) {
    super(diagnostic.message);
    this.name = "VideoExportError";
    this.diagnostic = diagnostic;
  }
}

/**
 * Refuse, with a diagnostic, if this browser cannot encode `plan`: no
 * WebCodecs at all (most often an insecure context), or no support for the
 * plan's codec string at its size, rate and settings.
 *
 * The one copy of the environment check. `encodeVideo` calls it first, and
 * `runVideoExport` calls it before sampling (ruling R45), because sampling
 * and rasterizing a long scene takes seconds and a refusal should not wait
 * for them, or be pre-empted by running out of memory during them.
 */
export async function assertVideoEncodable(plan: VideoPlan): Promise<void> {
  if (typeof VideoEncoder === "undefined") {
    throw new VideoExportError(noWebCodecsDiagnostic());
  }
  const config = videoSourceConfig(plan);
  const support = await VideoEncoder.isConfigSupported({
    codec: plan.fullCodecString,
    width: plan.width,
    height: plan.height,
    bitrate: plan.bitrate,
    framerate: plan.fps,
    hardwareAcceleration: config.hardwareAcceleration,
    latencyMode: config.latencyMode,
    bitrateMode: config.bitrateMode,
  });
  if (!support.supported) {
    throw new VideoExportError(
      unsupportedCodecDiagnostic(plan.fullCodecString, plan.container),
    );
  }
}

/**
 * Encode an already-rasterized frame sequence into muxed container bytes.
 *
 * **This module sees neither the scene graph nor the IR** — it takes a
 * `VideoPlan` of inert numbers and a sequence of canvases, and has no import
 * that could reach either (`exportBoundary.test.ts` enforces that). That is
 * the video half of the same structural claim Phase 5A made for Lottie:
 * "encoders see only sampled output" as an import-level fact rather than a
 * convention.
 *
 * It receives no runtime, no world and no driver, so it cannot advance the
 * simulation even by accident, and it reads no clock: every timestamp is
 * derived from the frame's index (`videoContract.ts`).
 *
 * No encoder field is invented here. The `VideoSampleSource` config is
 * `videoSourceConfig(plan)` and the container options are
 * `videoOutputFormatOptions(plan)`, both pure functions in `videoContract.ts`
 * pinned by `videoContract.test.ts`; `videoEncode.test.ts` pins that this
 * module passes them to mediabunny unchanged, with mediabunny mocked.
 *
 * The parameter stays a sequence of `CanvasImageSource` rather than PixiJS's
 * `ICanvas` (what `frameRaster.ts`'s rasterizer actually returns): `ICanvas`
 * is a structural interface, not assignable to the DOM `CanvasImageSource`
 * union, and widening this signature to accept it would put a `pixi.js` type
 * inside this module — exactly the import `exportBoundary.test.ts` forbids.
 * Task 3's call site casts instead; that cast belongs there; this module
 * never imports a pixi type to avoid it.
 *
 * **Verified against a real mediabunny build before being written** (Task 2's
 * Step 1 probe, `.sdd/2026-09-18-phase-5b-video/task-2-report.md`):
 * `VideoSampleSource` + `VideoSample`, each constructed from a *different*
 * `OffscreenCanvas` per frame, round-tripped 10/10 samples through a muxed
 * MP4 with no extra blit — the plan's own self-identified risk (that only
 * `CanvasSource`'s single re-read canvas would work) did not materialize.
 * `"avc"`/`"vp9"` were also confirmed as the exact short codec identifiers
 * `VideoSampleSource` expects, matching `videoContract.ts`'s
 * `mediabunnyCodec`.
 */
export async function encodeVideo(
  plan: VideoPlan,
  canvases: Iterable<CanvasImageSource> | AsyncIterable<CanvasImageSource>,
  hooks: EncodeVideoHooks = {},
): Promise<Uint8Array> {
  const { onProgress } = hooks;
  await assertVideoEncodable(plan);

  const target = new BufferTarget();
  const formatOptions = videoOutputFormatOptions(plan);
  const format =
    formatOptions.container === "mp4"
      ? new Mp4OutputFormat({ fastStart: formatOptions.fastStart })
      : new WebMOutputFormat();
  const output = new Output({ format, target });

  // The whole config comes from `videoSourceConfig`, including the
  // frames-to-seconds `keyFrameInterval` conversion (see its docstring).
  // Nothing is added here except the optional observer, which only the dev
  // harness passes: it records the resolved WebCodecs config the encoder was
  // actually opened with (spec §5). mediabunny calls it once per candidate
  // config, before `isConfigSupported` picks one.
  const source = new VideoSampleSource({
    ...videoSourceConfig(plan),
    ...(hooks.onEncoderConfig ? { onEncoderConfig: hooks.onEncoderConfig } : {}),
  });

  output.addVideoTrack(source, { frameRate: plan.fps });
  await output.start();

  let index = 0;
  const duration = frameDurationSeconds(plan.fps);
  try {
    // `for await` so the caller can rasterize lazily, one frame per
    // iteration. `new VideoSample(canvas)` copies the pixels at construction
    // (with WebCodecs present it wraps `new VideoFrame(canvas)`,
    // `mediabunny.mjs:20839-20853`), so the source may drop or reuse the
    // canvas as soon as the next frame is requested.
    for await (const canvas of canvases) {
      const sample = new VideoSample(canvas, {
        timestamp: frameTimestampSeconds(index, plan.fps),
        duration,
      });
      try {
        // Awaited per frame, not fired-and-forgotten: the returned promise is
        // the encoder's backpressure signal, and ignoring it on a
        // 7,200-frame export queues every frame at once.
        await source.add(sample);
      } finally {
        // Closed whether `add` succeeded or threw. Mediabunny does not take
        // ownership of this for us -- `VideoSampleSource.add()` hands the
        // sample to its internal encoder with `shouldClose: false`
        // (`mediabunny.mjs:35866`) -- and `VideoSample.close()`'s own doc
        // says samples "should be closed as soon as they are not needed
        // anymore" (`mediabunny.d.ts:4950-4953`). Without the `finally`, a
        // throw on `add` (a codec error, an OOM, a dropped frame) leaks the
        // in-flight `VideoFrame`'s system/GPU memory on top of every frame
        // already added and never closed.
        sample.close();
      }
      index += 1;
      onProgress?.(index, plan.frameCount);
    }
  } catch (error) {
    // Release mediabunny's own internal encoder/track resources before this
    // export's failure propagates. `Output.cancel()` is documented to do
    // exactly that -- "releasing internal resources like encoders"
    // (`mediabunny.d.ts:3753-3758`) -- and reading its implementation
    // (`mediabunny.mjs:39529-39550`) confirms it is safe to call from every
    // state reachable here: a no-op if the output somehow already finished
    // (`finalizing`/`finalized`, with only a console warning), idempotent if
    // called twice, and never thrown from `started`. Its own failure is
    // swallowed rather than awaited bare, so a problem in cleanup can never
    // replace the real error the caller needs to see and act on -- the
    // original `error` is always what gets rethrown, never whatever
    // `cancel()` did or didn't do.
    await output.cancel().catch(() => {});
    throw error;
  }

  await output.finalize();
  if (!target.buffer) {
    // No `[export] ` prefix. That prefix is the dev harness's marker
    // (`devVideoSeam.ts` adds it to every failure it rethrows, for a Node
    // author reading a stack trace); this module is shared production code,
    // and since Task 5 shipped the export button its throws reach a real
    // user's toast verbatim -- `useExportVideo.ts` shows `error.message`
    // unchanged, by design (R23). A bracketed harness tag in a toast is
    // noise to the only person now reading it. The seam keeps its own
    // prefix for the `VideoExportError` path it wraps; this one plain
    // `Error` simply passes through it unmarked, which is the correct
    // trade when the same string has two audiences and only one of them is
    // a person.
    throw new Error("The muxer finalized without producing a buffer.");
  }
  return new Uint8Array(target.buffer);
}
