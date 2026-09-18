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
  type VideoDiagnostic,
  type VideoPlan,
} from "./videoContract";

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
 * Every encoder field comes from `plan.encoderOptions` rather than being
 * written here, because each was measured to change the emitted bitstream and
 * each is pinned by a test in `videoContract.test.ts`.
 *
 * The parameter stays `Iterable<CanvasImageSource>` rather than PixiJS's
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
  canvases: Iterable<CanvasImageSource>,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  if (typeof VideoEncoder === "undefined") {
    throw new VideoExportError(noWebCodecsDiagnostic());
  }

  const support = await VideoEncoder.isConfigSupported({
    codec: plan.fullCodecString,
    width: plan.width,
    height: plan.height,
    bitrate: plan.bitrate,
    framerate: plan.fps,
  });
  if (!support.supported) {
    throw new VideoExportError(
      unsupportedCodecDiagnostic(plan.fullCodecString, plan.container),
    );
  }

  const target = new BufferTarget();
  const format =
    plan.container === "mp4"
      ? new Mp4OutputFormat({ fastStart: "in-memory" })
      : new WebMOutputFormat();
  const output = new Output({ format, target });

  const source = new VideoSampleSource({
    codec: plan.mediabunnyCodec,
    bitrate: plan.bitrate,
    fullCodecString: plan.fullCodecString,
    hardwareAcceleration: plan.encoderOptions.hardwareAcceleration,
    latencyMode: plan.encoderOptions.latencyMode,
    bitrateMode: plan.encoderOptions.bitrateMode,
    // `videoContract.ts` documents `keyFrameInterval` as "frames between
    // keyframes" and pins it to 30. mediabunny's own field of the same name
    // is NOT in frames -- Task 2's Step 1 probe measured it directly, both
    // by reading the shipped implementation (`VideoSource.add()` computes
    // `Math.floor(sampleToEncode.timestamp / keyFrameInterval)`, and
    // `sampleToEncode.timestamp` is seconds) and empirically (encoding 60
    // frames at 30fps with `keyFrameInterval: 1` forced a keyframe at
    // exactly frame index 30 -- the one-SECOND boundary -- not at every
    // frame). Passed straight through, `plan.encoderOptions.keyFrameInterval`
    // (a frame count) would tell mediabunny to key-frame roughly every 30
    // SECONDS instead of every 30 frames. Dividing by `plan.fps` here is the
    // one-line fix, kept in this module rather than in `videoContract.ts`:
    // that file is Task 1's, complete and reviewed, and this discrepancy is
    // reported (see the Step 1 report above) rather than edited there.
    keyFrameInterval: plan.encoderOptions.keyFrameInterval / plan.fps,
  });

  output.addVideoTrack(source, { frameRate: plan.fps });
  await output.start();

  let index = 0;
  const duration = frameDurationSeconds(plan.fps);
  for (const canvas of canvases) {
    const sample = new VideoSample(canvas, {
      timestamp: frameTimestampSeconds(index, plan.fps),
      duration,
    });
    // Awaited per frame, not fired-and-forgotten: the returned promise is the
    // encoder's backpressure signal, and ignoring it on a 7,200-frame export
    // queues every frame at once.
    await source.add(sample);
    sample.close();
    index += 1;
    onProgress?.(index, plan.frameCount);
  }

  await output.finalize();
  if (!target.buffer) {
    throw new Error("[export] The muxer finalized without producing a buffer.");
  }
  return new Uint8Array(target.buffer);
}
