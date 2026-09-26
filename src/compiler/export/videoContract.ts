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
  | "VIDEO_ODD_DIMENSIONS"
  | "VIDEO_EXCEEDS_CODEC_LEVELS"
  | "VIDEO_EXCEEDS_DEVICE_LIMITS"
  | "VIDEO_NO_WEBGL";

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

export const DEFAULT_BITRATE = 8_000_000;

/**
 * Every MP4/WebM export is encoded at this multiple of the scene's declared
 * size (spec §2.1, owner decision O3). 2x lands 4:2:0 chroma at the scene's
 * own resolution, which is what lifted PSNR from ~40 to ~42 dB in findings
 * §1.2. A scene too large for it is refused, never silently exported at 1x.
 */
export const VIDEO_SCALE = 2;

/**
 * One row of ITU-T H.264 Table A-1 ("Level limits"), the columns the level
 * choice below reads.
 */
export interface H264Level {
  /** The level number as the standard writes it, e.g. `"3.1"`. */
  readonly name: string;
  /** `level_idc`: ten times the level number (A.3.1's closing paragraph). */
  readonly levelIdc: number;
  /** MaxMBPS: macroblocks per second. */
  readonly maxMbPerSecond: number;
  /** MaxFS: macroblocks per frame. */
  readonly maxFrameMbs: number;
  /** MaxBR in units of 1000 bits/s (cpbBrVclFactor for Baseline, A.3.1 i). */
  readonly maxKbps: number;
}

/**
 * ITU-T H.264 Table A-1, levels 1 to 5.1, transcribed from Rec. ITU-T H.264
 * (03/2010), Annex A, p. 294 (downloaded from itu.int and read as text for
 * this table; not from memory). Level 1b is left out: for Baseline it is
 * signalled by `constraint_set3_flag` rather than by `level_idc` alone, and
 * the default bitrate is far above its limit anyway. Levels 5.2 and 6.x were
 * added in later editions that could not be retrieved here, so 5.1 is the top
 * of the supported range: 36,864 macroblocks per frame, e.g. 4096x2304.
 */
export const H264_LEVELS: ReadonlyArray<H264Level> = Object.freeze([
  { name: "1", levelIdc: 10, maxMbPerSecond: 1_485, maxFrameMbs: 99, maxKbps: 64 },
  { name: "1.1", levelIdc: 11, maxMbPerSecond: 3_000, maxFrameMbs: 396, maxKbps: 192 },
  { name: "1.2", levelIdc: 12, maxMbPerSecond: 6_000, maxFrameMbs: 396, maxKbps: 384 },
  { name: "1.3", levelIdc: 13, maxMbPerSecond: 11_880, maxFrameMbs: 396, maxKbps: 768 },
  { name: "2", levelIdc: 20, maxMbPerSecond: 11_880, maxFrameMbs: 396, maxKbps: 2_000 },
  { name: "2.1", levelIdc: 21, maxMbPerSecond: 19_800, maxFrameMbs: 792, maxKbps: 4_000 },
  { name: "2.2", levelIdc: 22, maxMbPerSecond: 20_250, maxFrameMbs: 1_620, maxKbps: 4_000 },
  { name: "3", levelIdc: 30, maxMbPerSecond: 40_500, maxFrameMbs: 1_620, maxKbps: 10_000 },
  { name: "3.1", levelIdc: 31, maxMbPerSecond: 108_000, maxFrameMbs: 3_600, maxKbps: 14_000 },
  { name: "3.2", levelIdc: 32, maxMbPerSecond: 216_000, maxFrameMbs: 5_120, maxKbps: 20_000 },
  { name: "4", levelIdc: 40, maxMbPerSecond: 245_760, maxFrameMbs: 8_192, maxKbps: 20_000 },
  { name: "4.1", levelIdc: 41, maxMbPerSecond: 245_760, maxFrameMbs: 8_192, maxKbps: 50_000 },
  { name: "4.2", levelIdc: 42, maxMbPerSecond: 522_240, maxFrameMbs: 8_704, maxKbps: 50_000 },
  { name: "5", levelIdc: 50, maxMbPerSecond: 589_824, maxFrameMbs: 22_080, maxKbps: 135_000 },
  { name: "5.1", levelIdc: 51, maxMbPerSecond: 983_040, maxFrameMbs: 36_864, maxKbps: 240_000 },
]);

/**
 * The lowest H.264 level whose limits admit this stream, or `null` if none
 * in `H264_LEVELS` does.
 *
 * Every constraint of H.264 A.3.1 that depends on what this exporter
 * chooses: e) `PicWidthInMbs * FrameHeightInMbs <= MaxFS`; f) and g) each
 * dimension in macroblocks `<= Sqrt(MaxFS * 8)`; a) consecutive frames at
 * least `PicSizeInMbs / MaxMBPS` apart, i.e. `PicSizeInMbs * fps <= MaxMBPS`
 * (`fR` = 1/172 s is never the binding term at the rates `planExport`
 * accepts, which divide 120); and i) bitrate `<= 1000 * MaxBR`. Baseline is
 * progressive only (`frame_mbs_only_flag` = 1), so a frame is
 * `ceil(width / 16)` by `ceil(height / 16)` macroblocks.
 */
export function h264LevelFor(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): H264Level | null {
  const widthMbs = Math.ceil(width / 16);
  const heightMbs = Math.ceil(height / 16);
  const frameMbs = widthMbs * heightMbs;
  for (const level of H264_LEVELS) {
    const maxSideMbs = Math.sqrt(level.maxFrameMbs * 8);
    if (
      frameMbs <= level.maxFrameMbs &&
      widthMbs <= maxSideMbs &&
      heightMbs <= maxSideMbs &&
      frameMbs * fps <= level.maxMbPerSecond &&
      bitrate <= level.maxKbps * 1000
    ) {
      return level;
    }
  }
  return null;
}

/**
 * `avc1.42 00 LL`: Baseline (`profile_idc` 66 = 0x42), constraint byte `00`,
 * then `level_idc` in hex. Baseline because it is the most broadly playable;
 * left to choose, mediabunny selected High (`avc1.640c14`). The constraint
 * byte stays `00`, which is what the phase's MP4 evidence was measured with;
 * the emitted `avcC` carries `0xC0` (Constrained Baseline), which the encoder
 * decides (whole-branch review M-8), so the string is a request, not a
 * description of every flag in the stream.
 */
export function h264CodecString(level: H264Level): string {
  return `avc1.4200${level.levelIdc.toString(16).padStart(2, "0")}`;
}

/** One VP9 level's limits, the columns the level choice below reads. */
export interface Vp9Level {
  readonly name: string;
  /** The two digits a `vp09.PP.LL.DD` codec string carries: ten times the level. */
  readonly code: string;
  readonly maxLumaSampleRate: number;
  readonly maxLumaPictureSize: number;
  /** Maximum luma width *and* height, in samples ("breadth"). */
  readonly maxBreadth: number;
  /** Maximum bitrate in units of 1000 bits/s. */
  readonly maxKbps: number;
}

/**
 * The VP9 level definitions, as the WebM Project's reference encoder carries
 * them: libvpx `vp9/encoder/vp9_encoder.c`, `vp9_level_defs` (columns: sample
 * rate, size, breadth, bitrate, cpb, ...), the table behind
 * https://www.webmproject.org/vp9/levels/. Transcribed from the source, not
 * from memory.
 */
export const VP9_LEVELS: ReadonlyArray<Vp9Level> = Object.freeze([
  { name: "1", code: "10", maxLumaSampleRate: 829_440, maxLumaPictureSize: 36_864, maxBreadth: 512, maxKbps: 200 },
  { name: "1.1", code: "11", maxLumaSampleRate: 2_764_800, maxLumaPictureSize: 73_728, maxBreadth: 768, maxKbps: 800 },
  { name: "2", code: "20", maxLumaSampleRate: 4_608_000, maxLumaPictureSize: 122_880, maxBreadth: 960, maxKbps: 1_800 },
  { name: "2.1", code: "21", maxLumaSampleRate: 9_216_000, maxLumaPictureSize: 245_760, maxBreadth: 1_344, maxKbps: 3_600 },
  { name: "3", code: "30", maxLumaSampleRate: 20_736_000, maxLumaPictureSize: 552_960, maxBreadth: 2_048, maxKbps: 7_200 },
  { name: "3.1", code: "31", maxLumaSampleRate: 36_864_000, maxLumaPictureSize: 983_040, maxBreadth: 2_752, maxKbps: 12_000 },
  { name: "4", code: "40", maxLumaSampleRate: 83_558_400, maxLumaPictureSize: 2_228_224, maxBreadth: 4_160, maxKbps: 18_000 },
  { name: "4.1", code: "41", maxLumaSampleRate: 160_432_128, maxLumaPictureSize: 2_228_224, maxBreadth: 4_160, maxKbps: 30_000 },
  { name: "5", code: "50", maxLumaSampleRate: 311_951_360, maxLumaPictureSize: 8_912_896, maxBreadth: 8_384, maxKbps: 60_000 },
  { name: "5.1", code: "51", maxLumaSampleRate: 588_251_136, maxLumaPictureSize: 8_912_896, maxBreadth: 8_384, maxKbps: 120_000 },
  { name: "5.2", code: "52", maxLumaSampleRate: 1_176_502_272, maxLumaPictureSize: 8_912_896, maxBreadth: 8_384, maxKbps: 180_000 },
  { name: "6", code: "60", maxLumaSampleRate: 1_176_502_272, maxLumaPictureSize: 35_651_584, maxBreadth: 16_832, maxKbps: 180_000 },
  { name: "6.1", code: "61", maxLumaSampleRate: 2_353_004_544, maxLumaPictureSize: 35_651_584, maxBreadth: 16_832, maxKbps: 240_000 },
  { name: "6.2", code: "62", maxLumaSampleRate: 4_706_009_088, maxLumaPictureSize: 35_651_584, maxBreadth: 16_832, maxKbps: 480_000 },
]);

/**
 * The lowest VP9 level whose limits admit this stream, or `null`.
 *
 * Measured before this existed: every WebM this phase produced declared
 * level 1 (`CodecPrivate` `02 01 0a`) for 800x600 content, 13 times level
 * 1's picture-size limit, because the codec string was pinned to
 * `vp09.00.10.08`; Chromium accepts the mismatch without complaint, so only
 * a stricter decoder would notice. The sample rate is judged per frame
 * (`width * height * fps`) rather than averaged over an alt-ref group, which
 * can only over-state it: the conservative direction for a declaration.
 */
export function vp9LevelFor(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Vp9Level | null {
  const pictureSize = width * height;
  for (const level of VP9_LEVELS) {
    if (
      pictureSize <= level.maxLumaPictureSize &&
      width <= level.maxBreadth &&
      height <= level.maxBreadth &&
      pictureSize * fps <= level.maxLumaSampleRate &&
      bitrate <= level.maxKbps * 1000
    ) {
      return level;
    }
  }
  return null;
}

/** `vp09.00.LL.08`: profile 0 (8-bit 4:2:0), the chosen level, 8-bit depth. */
export function vp9CodecString(level: Vp9Level): string {
  return `vp09.00.${level.code}.08`;
}

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
  /** The **coded** size: `VIDEO_SCALE` times the scene's own size (spec §2.1). */
  readonly width: number;
  readonly height: number;
  /** `VIDEO_SCALE`, carried on the plan so a caller need not re-import the constant. */
  readonly scale: number;
  /** The scene's own declared size, kept alongside the coded `width`/`height`. */
  readonly sceneWidth: number;
  readonly sceneHeight: number;
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
 * No level in the supported range admits this scene's coded size. Both the
 * scene's own numbers and the coded (2x) numbers are in the message: naming
 * only the coded size would read as a bug report against a scene the author
 * never asked to export that large (spec §2.3).
 */
export function exceedsCodecLevelsDiagnostic(
  container: VideoContainer,
  sceneWidth: number,
  sceneHeight: number,
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): VideoDiagnostic {
  const top = container === "mp4"
    ? `H.264 level ${H264_LEVELS[H264_LEVELS.length - 1].name}`
    : `VP9 level ${VP9_LEVELS[VP9_LEVELS.length - 1].name}`;
  const advice = container === "mp4"
    ? "Make the scene's 'size' smaller or export at a lower frame rate, or export WebM, whose codec levels go higher."
    : "Make the scene's 'size' smaller or export at a lower frame rate.";
  return {
    code: "VIDEO_EXCEEDS_CODEC_LEVELS",
    message: `[VIDEO_EXCEEDS_CODEC_LEVELS] Video exports at ${VIDEO_SCALE}x the scene's size, so a ${sceneWidth}x${sceneHeight} scene becomes a ${width}x${height} video; at ${fps}fps and ${bitrate / 1_000_000} Mbit/s that is too large or too fast for ${container.toUpperCase()} export, whose highest supported codec level is ${top}. ${advice}`,
  };
}

/**
 * The export `Application` did not get a WebGL renderer.
 *
 * pixi.js 8.16 falls back from WebGL to WebGPU and then to canvas
 * (`autoDetectRenderer.mjs`). The device-limit check below reads
 * `MAX_TEXTURE_SIZE` and `MAX_RENDERBUFFER_SIZE` from a WebGL context, and
 * neither fallback has one. Without this refusal, `gl` is undefined there
 * and the export dies with a bare TypeError instead of a message a person
 * can act on (final review M-7). `rendererName` is pixi's own
 * `renderer.name` ("webgpu", "canvas").
 */
export function noWebGLDiagnostic(rendererName: string): VideoDiagnostic {
  return {
    code: "VIDEO_NO_WEBGL",
    message: `[VIDEO_NO_WEBGL] Video export needs WebGL to check this device's size limits, but the browser gave Marey a '${rendererName}' renderer instead. Turn on hardware acceleration or WebGL in this browser's settings, or export APNG or Lottie, which do not need it.`,
  };
}

/**
 * Refuse a coded size the device's GL context cannot actually render.
 *
 * PixiJS checks no texture-size limit of its own (research §6): a scene
 * whose coded size exceeds `MAX_TEXTURE_SIZE` or `MAX_RENDERBUFFER_SIZE`
 * would otherwise fail deep inside WebGL, with no name a person could act
 * on. This is a pure function so it stays headlessly testable; the pipeline
 * supplies the two limits from the export `Application`'s own GL context
 * (`videoPipeline.ts`), after `init` and before building or sampling.
 */
export function deviceLimitDiagnostic(
  plan: VideoPlan,
  maxTextureSize: number,
  maxRenderbufferSize: number,
): VideoDiagnostic | null {
  const limit = Math.min(maxTextureSize, maxRenderbufferSize);
  if (plan.width <= limit && plan.height <= limit) return null;
  return {
    code: "VIDEO_EXCEEDS_DEVICE_LIMITS",
    message: `[VIDEO_EXCEEDS_DEVICE_LIMITS] Video exports at ${plan.scale}x the scene's size, so this ${plan.sceneWidth}x${plan.sceneHeight} scene needs a ${plan.width}x${plan.height} frame, but this device can render at most ${limit}x${limit} pixels. Make the scene's 'size' smaller.`,
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

  // The coded size: what the encoder, the codec-level check and the
  // odd-dimension check all reason about from here on. The scene's own
  // size (`ir.width`/`ir.height`) is kept separately on the plan so a
  // refusal or a downstream caller can still name it (spec §2.1).
  const width = ir.width * VIDEO_SCALE;
  const height = ir.height * VIDEO_SCALE;

  // H.264 4:2:0 stores chroma at half resolution in both axes, so an odd
  // dimension has no representation. Refused by name rather than silently
  // cropped or padded: a scene exported one pixel smaller than it was
  // authored is exactly the kind of quiet degradation Phase 5A's refusal
  // surface exists to prevent. Evaluated on the CODED size, which is what
  // the encoder actually receives -- at the current `VIDEO_SCALE` (2) this
  // can never fire, because doubling any integer is always even. Kept
  // anyway: it is the correct check for whatever the coded size is under
  // any scale, and it becomes live again the moment `VIDEO_SCALE` changes
  // (AGENT-LESSONS §2f -- a known-unreachable branch is recorded, not
  // deleted).
  if (request.container === "mp4" && (width % 2 !== 0 || height % 2 !== 0)) {
    diagnostics.push({
      code: "VIDEO_ODD_DIMENSIONS",
      message: `[VIDEO_ODD_DIMENSIONS] MP4 export uses H.264 4:2:0, which requires even pixel dimensions, but this scene is ${width}x${height}. Change the scene's 'size' to even numbers, or export WebM instead.`,
    });
  }

  // The codec string is a function of the plan, not a pin (ruling R43): the
  // level it declares is the lowest one whose limits admit this frame size,
  // rate and bitrate, so the same plan always yields the same string (what
  // byte identity needs) and the declaration is true of the content. When no
  // level fits, the refusal says so here, in the plan, instead of reaching
  // the browser as VIDEO_UNSUPPORTED_CODEC, which blames the browser. Chosen
  // from the CODED size (spec §2.1): the encoder never sees the scene's own
  // size, so a level that only admits the scene size while missing the
  // coded size would immediately fail in the browser instead of here.
  const isMp4 = request.container === "mp4";
  const bitrate = request.bitrate ?? DEFAULT_BITRATE;
  let fullCodecString: string | null;
  if (isMp4) {
    const level = h264LevelFor(width, height, plan.fps, bitrate);
    fullCodecString = level ? h264CodecString(level) : null;
  } else {
    const level = vp9LevelFor(width, height, plan.fps, bitrate);
    fullCodecString = level ? vp9CodecString(level) : null;
  }
  if (fullCodecString === null) {
    diagnostics.push(
      exceedsCodecLevelsDiagnostic(request.container, ir.width, ir.height, width, height, plan.fps, bitrate),
    );
  }

  if (diagnostics.length > 0 || fullCodecString === null) {
    return { ok: false, diagnostics: Object.freeze(diagnostics) };
  }

  return {
    ok: true,
    plan: Object.freeze({
      container: request.container,
      fullCodecString,
      mediabunnyCodec: isMp4 ? ("avc" as const) : ("vp9" as const),
      width,
      height,
      scale: VIDEO_SCALE,
      sceneWidth: ir.width,
      sceneHeight: ir.height,
      fps: plan.fps,
      frameCount: plan.frameCount,
      bitrate,
      encoderOptions: Object.freeze({
        hardwareAcceleration: "prefer-software" as const,
        latencyMode: "quality" as const,
        bitrateMode: "constant" as const,
        keyFrameInterval: KEY_FRAME_INTERVAL,
      }),
    }),
  };
}
