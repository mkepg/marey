import type { IRSceneNode } from "../sceneIR";
import type { SamplerPlan } from "./exportContract";

/**
 * Diagnostics for a video export that cannot be honoured.
 *
 * Prefixed `VIDEO_` rather than `EXPORT_` because these are specific to
 * encoding: the request already passed `planExport`, so the frame rate and
 * duration are known good and are never re-checked here (AGENT-LESSONS §5 —
 * two structures that must agree are better as one that derives).
 */
export type VideoDiagnosticCode =
  | "VIDEO_NO_WEBCODECS"
  | "VIDEO_UNSUPPORTED_CODEC"
  | "VIDEO_ODD_DIMENSIONS";

export interface VideoDiagnostic {
  readonly code: VideoDiagnosticCode;
  readonly message: string;
}

export type VideoContainer = "mp4" | "webm";

export interface VideoRequest {
  readonly container: VideoContainer;
  /** Bits per second. Defaults to `DEFAULT_BITRATE`. */
  readonly bitrate?: number;
}

/**
 * H.264 baseline, level 3.1. Pinned rather than inferred: left to choose,
 * mediabunny selected High profile (`avc1.640c14`). Baseline is the most
 * broadly playable, and — the reason this is a constant rather than a
 * preference — a codec string that drifts between runs makes every
 * byte-identity claim in `eval/RESULTS-PHASE-5B.md` false without any code
 * appearing to change.
 */
export const MP4_CODEC_STRING = "avc1.42001f";

/** VP9 profile 0, level 1.0, 8-bit. Pinned for the same reason. */
export const WEBM_CODEC_STRING = "vp09.00.10.08";

export const DEFAULT_BITRATE = 8_000_000;

/**
 * Frames between keyframes, **in frames** — not the unit mediabunny's own
 * `keyFrameInterval` field takes. mediabunny's `VideoSampleSource` expects
 * this in *seconds* (its default, when the field is omitted, is a literal
 * `2`, i.e. two seconds — measured directly against
 * `node_modules/mediabunny/dist/modules/src/media-source.js`,
 * `const keyFrameInterval = this.encodingConfig.keyFrameInterval ?? 2;`, and
 * confirmed empirically via `EncodedPacketSink` key-frame indices, Task 4
 * §11 Q3). `videoSourceConfig` (below) is the single site that converts this
 * constant to mediabunny's unit, dividing by `plan.fps` — see its docstring
 * for the measurement that caught the mismatch (`EncodedPacketSink` returned
 * key-frame indices `[0, 17, 30, 47]` before that conversion existed, instead
 * of every 30 frames).
 *
 * Explicit here (rather than left unset) because an implicit muxer default
 * is a library-version dependency: a mediabunny upgrade that changed it
 * would change every emitted file while this repository's code stayed
 * identical. Task 4 also confirmed the *default itself* is byte-stable
 * across repeated unset runs — this constant exists to pin the *value*, not
 * to work around instability in mediabunny's own default.
 */
export const KEY_FRAME_INTERVAL = 30;

export interface VideoEncoderOptions {
  readonly hardwareAcceleration: "prefer-software";
  readonly latencyMode: "quality";
  readonly bitrateMode: "constant";
  readonly keyFrameInterval: number;
}

export interface VideoPlan {
  readonly container: VideoContainer;
  readonly fullCodecString: string;
  /** mediabunny's own short codec name, distinct from the WebCodecs string. */
  readonly mediabunnyCodec: "avc" | "vp9";
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly frameCount: number;
  readonly bitrate: number;
  readonly encoderOptions: VideoEncoderOptions;
}

export type VideoPlanResult =
  | { readonly ok: true; readonly plan: VideoPlan }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<VideoDiagnostic> };

/**
 * The configuration object `videoEncode.ts` hands to mediabunny's
 * `VideoSampleSource`, in mediabunny's own field names and units.
 *
 * Structurally a subset of mediabunny's `VideoEncodingConfig`, declared here
 * rather than imported so this module keeps no dependency on the muxer.
 */
export interface VideoSourceConfig {
  readonly codec: VideoPlan["mediabunnyCodec"];
  readonly bitrate: number;
  readonly fullCodecString: string;
  readonly hardwareAcceleration: VideoEncoderOptions["hardwareAcceleration"];
  readonly latencyMode: VideoEncoderOptions["latencyMode"];
  readonly bitrateMode: VideoEncoderOptions["bitrateMode"];
  /** **Seconds** between keyframes: mediabunny's unit, not `VideoPlan`'s. */
  readonly keyFrameInterval: number;
}

/**
 * Build the `VideoSampleSource` config from a plan.
 *
 * A pure function here, not an object literal inside `videoEncode.ts`, so a
 * headless test can pin what actually reaches the encoder (whole-branch
 * review I-3, ruling R44). Before this existed, `videoContract.test.ts` pinned
 * the values in `VideoPlan` and nothing pinned that they were passed on:
 * deleting `latencyMode` from the call site, or reverting the frames-to-seconds
 * conversion below, left the whole suite green.
 *
 * `keyFrameInterval` is the one field that is converted rather than copied.
 * `VideoPlan` holds it in **frames** (`KEY_FRAME_INTERVAL`); mediabunny's field
 * of the same name is in **seconds**. Task 2 measured this both by reading the
 * shipped implementation (`VideoSource.add()` computes
 * `Math.floor(sampleToEncode.timestamp / keyFrameInterval)`, and that
 * timestamp is in seconds) and empirically (60 frames at 30 fps with
 * `keyFrameInterval: 1` produced a keyframe at exactly frame 30, the
 * one-second boundary). Passed straight through, 30 frames would become a
 * keyframe every 30 *seconds*.
 */
export function videoSourceConfig(plan: VideoPlan): VideoSourceConfig {
  return {
    codec: plan.mediabunnyCodec,
    bitrate: plan.bitrate,
    fullCodecString: plan.fullCodecString,
    hardwareAcceleration: plan.encoderOptions.hardwareAcceleration,
    latencyMode: plan.encoderOptions.latencyMode,
    bitrateMode: plan.encoderOptions.bitrateMode,
    keyFrameInterval: plan.encoderOptions.keyFrameInterval / plan.fps,
  };
}

/**
 * Container options for the muxer, keyed by container.
 *
 * MP4 uses `fastStart: "in-memory"`, which writes the `moov` box before
 * `mdat` so a player can start before the whole file has arrived. In
 * mediabunny 1.58.0 that is also what an unset field resolves to for a
 * `BufferTarget` (`mediabunny.mjs:31178`,
 * `this.formatOptions.fastStart ?? (target instanceof BufferTarget ? "in-memory" : false)`),
 * so today it is explicit for the same reason `KEY_FRAME_INTERVAL` is: an
 * implicit library default is a library-version dependency. `false` is not
 * equivalent; it moves `moov` after `mdat`. WebM takes no options.
 */
export type VideoOutputFormatOptions =
  | { readonly container: "mp4"; readonly fastStart: "in-memory" }
  | { readonly container: "webm" };

export function videoOutputFormatOptions(plan: VideoPlan): VideoOutputFormatOptions {
  return plan.container === "mp4"
    ? { container: "mp4", fastStart: "in-memory" }
    : { container: "webm" };
}

/**
 * Presentation time of one output frame, in **seconds**.
 *
 * Seconds, not microseconds: mediabunny documents `VideoSampleInit.timestamp`
 * as "the presentation timestamp of the frame in seconds". Getting this wrong
 * produces a file that still plays and still decodes the right number of
 * frames, so only an explicit test catches it.
 *
 * Computed from the index rather than accumulated, so frame N is exactly
 * `N / fps` and a long export cannot drift.
 */
export function frameTimestampSeconds(index: number, fps: number): number {
  return index / fps;
}

/** Duration of one output frame, in seconds. */
export function frameDurationSeconds(fps: number): number {
  return 1 / fps;
}

/** WebCodecs is absent — most often an insecure context, not an old browser. */
export function noWebCodecsDiagnostic(): VideoDiagnostic {
  return {
    code: "VIDEO_NO_WEBCODECS",
    message:
      "[VIDEO_NO_WEBCODECS] This browser exposes no VideoEncoder, so video cannot be encoded. WebCodecs is only available in a secure context — check the page is served over https:// or http://localhost, not from a file:// URL or an insecure origin.",
  };
}

/** The resolved codec is not supported by this browser's encoder. */
export function unsupportedCodecDiagnostic(
  fullCodecString: string,
  container: VideoContainer,
): VideoDiagnostic {
  return {
    code: "VIDEO_UNSUPPORTED_CODEC",
    message: `[VIDEO_UNSUPPORTED_CODEC] This browser's video encoder does not support '${fullCodecString}', which Marey uses for ${container.toUpperCase()} export. Try the other container.`,
  };
}

/**
 * Validate a video export request against an already-validated sampler plan.
 *
 * Takes the `SamplerPlan` rather than re-deriving frame count and rate: the
 * plan is branded, so holding one is proof `planExport` already validated the
 * request (`exportContract.ts`). This function adds only what is specific to
 * encoding.
 */
export function planVideo(
  ir: IRSceneNode,
  plan: SamplerPlan,
  request: VideoRequest,
): VideoPlanResult {
  const diagnostics: VideoDiagnostic[] = [];

  // H.264 4:2:0 stores chroma at half resolution in both axes, so an odd
  // dimension has no representation. Refused by name rather than silently
  // cropped or padded: a scene exported one pixel smaller than it was
  // authored is exactly the kind of quiet degradation Phase 5A's refusal
  // surface exists to prevent.
  if (request.container === "mp4" && (ir.width % 2 !== 0 || ir.height % 2 !== 0)) {
    diagnostics.push({
      code: "VIDEO_ODD_DIMENSIONS",
      message: `[VIDEO_ODD_DIMENSIONS] MP4 export uses H.264 4:2:0, which requires even pixel dimensions, but this scene is ${ir.width}x${ir.height}. Change the scene's 'size' to even numbers, or export WebM instead.`,
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: Object.freeze(diagnostics) };
  }

  const isMp4 = request.container === "mp4";
  return {
    ok: true,
    plan: Object.freeze({
      container: request.container,
      fullCodecString: isMp4 ? MP4_CODEC_STRING : WEBM_CODEC_STRING,
      mediabunnyCodec: isMp4 ? ("avc" as const) : ("vp9" as const),
      width: ir.width,
      height: ir.height,
      fps: plan.fps,
      frameCount: plan.frameCount,
      bitrate: request.bitrate ?? DEFAULT_BITRATE,
      encoderOptions: Object.freeze({
        hardwareAcceleration: "prefer-software" as const,
        latencyMode: "quality" as const,
        bitrateMode: "constant" as const,
        keyFrameInterval: KEY_FRAME_INTERVAL,
      }),
    }),
  };
}
