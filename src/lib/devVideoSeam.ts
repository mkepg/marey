import type { VideoContainer, VideoPlan } from "../compiler/export/videoContract";
import { runVideoExport } from "../compiler/export/videoPipeline";
import { hashFrames } from "../compiler/export/frameHash";
import type { FrameSnapshot } from "../compiler/renderer/frameSampler";

/** What `window.__mareyExportVideo` resolves to. */
export interface ExportVideoResult {
  /** Base64-encoded container bytes. No `data:` prefix. */
  readonly video: string;
  /** `hashFrames` over the sampled snapshots — simulation output, not pixels. */
  readonly hash: string;
  readonly container: VideoContainer;
  readonly fps: number;
  readonly frameCount: number;
  /** The CODED size: the scene's own size times `VIDEO_SCALE` (Phase 5C). */
  readonly width: number;
  readonly height: number;
  /** The scene's own declared size, kept alongside the coded `width`/`height`. */
  readonly sceneWidth: number;
  readonly sceneHeight: number;
  readonly byteLength: number;
  /**
   * One base64 PNG per sampled frame, for the frame-by-frame comparison: the
   * exact canvas the encoder was given for sampled frame k, at index k.
   * `null` at an index the encoder was never given a canvas for.
   */
  readonly referenceFrames: (string | null)[];
  /**
   * Every WebCodecs `VideoEncoderConfig` mediabunny reported through
   * `onEncoderConfig`, copied at the moment of the callback (spec §5's
   * "resolved config is recorded in the evidence"). mediabunny builds one
   * candidate per rate-control mode and calls the hook for each before
   * `isConfigSupported` selects one; with a numeric bitrate there is one.
   */
  readonly encoderConfigs: unknown[];
}

export interface ExportVideoOptions {
  readonly container: VideoContainer;
  readonly fps: number;
  readonly durationSeconds?: number;
  /** Omit reference PNGs when only the container bytes are wanted. */
  readonly withReferenceFrames?: boolean;
}

declare global {
  interface Window {
    /**
     * Dev-only video export seam for
     * `tools/visual-check/video-check.mjs`.
     *
     * Absent from a production build for the same reason
     * `window.__mareyExportPng` is (`devExportSeam.ts`): `main.tsx` reaches it
     * through a dynamic import inside `if (import.meta.env.DEV)`, which Vite
     * constant-folds to `false` when building, so this module — base64
     * encoding, frame hashing, reference-PNG capture, the `window` assignment
     * below — is dropped rather than merely left unreferenced. `mediabunny`
     * does ship: the top bar's MP4/WebM buttons reach the same
     * `runVideoExport` through `useExport.ts`'s click-loaded dynamic
     * `import()`.
     */
    __mareyExportVideo?: (
      source: string,
      opts: ExportVideoOptions,
    ) => Promise<ExportVideoResult>;
  }
}

/** Base64 without a FileReader round trip; chunked to stay under the arg limit. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function canvasToPngBase64(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("no blob"))), "image/png"),
  );
  return toBase64(new Uint8Array(await blob.arrayBuffer()));
}

/**
 * A JSON-safe copy of a `VideoEncoderConfig`, so it survives
 * `page.evaluate`'s serialisation into `report.json`. After the callback
 * mediabunny 1.58.0 reassigns `alpha = "discard"` on the same object
 * (`mediabunny.mjs:35433-35447`); `buildVideoEncoderConfigs` already set it to
 * `"discard"` for this exporter (no `alpha: "keep"`), so the copy equals the
 * object then passed to `isConfigSupported` and `configure`. The config holds
 * only strings, numbers and, for H.264, one nested plain object
 * (`avc: { format: "avc" }`, `mediabunny.mjs:5255`), so a JSON round trip
 * loses nothing.
 */
function plainEncoderConfig(config: VideoEncoderConfig): unknown {
  return JSON.parse(JSON.stringify(config));
}

/**
 * The shipped export path, `runVideoExport`, with observers attached — not a
 * copy of it. Until the Phase 5B fix wave this function was a hand-kept
 * duplicate of that orchestration, so the harness measured the duplicate and
 * the shipped path could reverse or drop frames with the harness green
 * (whole-branch review I-2, ruling R45).
 *
 * The observers collect what `video-check.mjs` needs:
 * - `referenceFrames[k]` is a lossless PNG of **the canvas the encoder was
 *   handed** for sampled frame k, read in `onFrame` before the pipeline
 *   releases it. The slot is `frame.index` — the snapshot's own frozen
 *   position, written once by `sampleFrames` (`frameSampler.ts`) before any
 *   pipeline code sees the array — not `sampled.indexOf(frame)`, which this
 *   file used until Task 4 fix round 1 (T4-R2). `indexOf` finds a frame's
 *   position within `sampled`, the very array `runVideoExport`'s encode
 *   loop also iterates; a pipeline that permuted that one shared array
 *   before handing it to its `use` callback would permute `onSampled`'s
 *   report and the encode order in lockstep, so `indexOf` always agreed
 *   with wherever the frame actually landed and a whole-array permutation
 *   (e.g. a full reversal) was invisible to this harness — measured in
 *   Task 4's own Step 4 mutation, which needed this fix before it went red.
 *   `frame.index` has no such blind spot: it names each frame's TRUE
 *   sampled position regardless of what order, or which array, later code
 *   hands it around in, so if the pipeline ever encodes frames out of order
 *   or skips one, the references stay in sampler order and the decoded
 *   file stops matching them.
 * - `hash` is `hashFrames` over the sampler's output.
 * - `encoderConfigs` is what mediabunny reported through `onEncoderConfig`.
 *
 * Every failure is rethrown with an `[export] ` prefix, a marker for a
 * harness author reading a Node exception; `runVideoExport` itself throws
 * the diagnostic text unprefixed because its other caller shows it in a toast.
 */
async function exportVideo(
  source: string,
  opts: ExportVideoOptions,
): Promise<ExportVideoResult> {
  const withReferenceFrames = opts.withReferenceFrames !== false;
  let plan: VideoPlan | undefined;
  let sampled: ReadonlyArray<FrameSnapshot> = [];
  const referenceFrames: (string | null)[] = [];
  const encoderConfigs: unknown[] = [];

  let bytes: Uint8Array;
  try {
    bytes = await runVideoExport({
      source,
      container: opts.container,
      fps: opts.fps,
      durationSeconds: opts.durationSeconds,
      observer: {
        onPlanned: (p) => {
          plan = p;
        },
        onSampled: (frames) => {
          sampled = frames;
          if (withReferenceFrames) referenceFrames.push(...frames.map(() => null));
        },
        onFrame: withReferenceFrames
          ? async (canvas, frame) => {
              // `frame.index`, not `sampled.indexOf(frame)` — see this
              // function's own docstring (T4-R2) for why a position lookup
              // against the same array the encode loop walks has no ground
              // truth independent of that array's own order.
              const k = frame.index;
              if (k < 0 || k >= referenceFrames.length) {
                throw new Error(
                  "[export] onFrame received a frame whose index is outside the sampled range",
                );
              }
              referenceFrames[k] = await canvasToPngBase64(canvas);
            }
          : undefined,
        onEncoderConfig: (config) => {
          encoderConfigs.push(plainEncoderConfig(config));
        },
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // The observer's own errors above already carry the prefix; adding it
    // again produced "[export] [export] ...".
    throw new Error(message.startsWith("[export] ") ? message : `[export] ${message}`);
  }
  if (!plan) throw new Error("[export] runVideoExport returned without reporting a plan");

  return {
    video: toBase64(bytes),
    hash: hashFrames(sampled),
    container: plan.container,
    fps: plan.fps,
    frameCount: plan.frameCount,
    width: plan.width,
    height: plan.height,
    sceneWidth: plan.sceneWidth,
    sceneHeight: plan.sceneHeight,
    byteLength: bytes.length,
    referenceFrames,
    encoderConfigs,
  };
}

export function installVideoSeam(): void {
  window.__mareyExportVideo = exportVideo;
}
