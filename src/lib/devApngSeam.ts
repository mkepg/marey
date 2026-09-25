import { runApngExport } from "../compiler/export/apngPipeline";
import type { FrameSnapshot } from "../compiler/renderer/frameSampler";

/** What `window.__mareyExportApng` resolves to. */
export interface ExportApngResult {
  /** Base64-encoded APNG bytes. No `data:` prefix. */
  readonly apng: string;
  /**
   * One base64 `getImageData`-derived RGBA capture per sampled frame, at the
   * exact canvas `runApngExport`'s `onFrame` observer was handed for that
   * frame -- the lossless pixels `apng-check.mjs` decodes the muxed file
   * back against. Not PNG-encoded (unlike `devVideoSeam.ts`'s
   * `referenceFrames`): `apng-check.mjs` needs raw RGBA to compare
   * byte-for-byte against a decoded frame's own `getImageData`, and
   * encoding to PNG and back would risk masking the exact bug this harness
   * exists to catch.
   */
  readonly referenceRgba: (string | null)[];
  readonly fps: number;
  readonly frameCount: number;
  /** `null` when `withReferenceCapture` is `false` -- no canvas was ever inspected to read a size off. */
  readonly width: number | null;
  readonly height: number | null;
}

export interface ExportApngOptions {
  readonly fps: number;
  readonly durationSeconds?: number;
  /**
   * Omit the raw RGBA reference capture when only the container bytes (or
   * just their size) are wanted. Mirrors `devVideoSeam.ts`'s
   * `withReferenceFrames`. Default `true`.
   *
   * Fix round 1, finding 2: `apng-check.mjs`'s full pixel-identity harness
   * holds one raw RGBA capture per sampled frame (~2.56MB base64 per
   * 800x600 frame) for the lossless byte-for-byte comparison, and that
   * measurably crashes the page well before a `--duration 30` (900-frame)
   * export completes (see that script's own header comment for the exact
   * error). `--size-only` passes `withReferenceCapture: false` so a long
   * export's file SIZE can still be measured through this same committed
   * seam and script -- never allocating the array that crashes the page --
   * rather than needing an uncommitted, unreproducible scratch probe.
   */
  readonly withReferenceCapture?: boolean;
}

declare global {
  interface Window {
    /**
     * Dev-only APNG export seam for
     * `tools/visual-check/apng-check.mjs`.
     *
     * Absent from a production build for the same reason
     * `window.__mareyExportVideo`/`__mareyExportPng`/`__mareyExportLottie`
     * are: `main.tsx` reaches it through a dynamic import inside
     * `if (import.meta.env.DEV)`, which Vite constant-folds to `false` when
     * building, so this module is dropped rather than merely left
     * unreferenced. The top bar's **apng** button reaches the same
     * `runApngExport` through `useExport.ts`'s click-loaded dynamic
     * `import()`.
     */
    __mareyExportApng?: (
      source: string,
      opts: ExportApngOptions,
    ) => Promise<ExportApngResult>;
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

function rgbaToBase64(data: Uint8ClampedArray): string {
  return toBase64(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}

/**
 * The shipped export path, `runApngExport`, with observers attached -- not
 * a copy of it (ruling R45). Mirrors `devVideoSeam.ts`'s `exportVideo`
 * exactly in shape and in its one load-bearing detail:
 *
 * `referenceRgba[k]` is keyed by the snapshot's own frozen `frame.index`
 * (`onFrame`'s second argument), never by `sampled.indexOf(frame)` or by
 * the order canvases happen to arrive in. `devVideoSeam.ts`'s own docstring
 * (Task 4 ruling T4-R2) explains why a position lookup against the same
 * array the mux loop also walks has no ground truth independent of that
 * array's own order: a pipeline that permuted the whole array before
 * handing it to `use` would permute the report and the mux order in
 * lockstep, so `indexOf` would agree with wherever the frame actually
 * landed and a whole-array reorder would be invisible to this harness.
 * `frame.index` has no such blind spot -- it names each frame's TRUE
 * sampled position regardless of what order later code hands it around in,
 * so a pipeline that muxes frames out of order or drops one leaves the
 * references in sampler order while the decoded file stops matching them,
 * which is exactly the mutation Task 5 Step 7 proves this harness catches.
 */
async function exportApng(
  source: string,
  opts: ExportApngOptions,
): Promise<ExportApngResult> {
  const withReferenceCapture = opts.withReferenceCapture !== false;
  let sampled: ReadonlyArray<FrameSnapshot> = [];
  let width: number | null = null;
  let height: number | null = null;
  const referenceRgba: (string | null)[] = [];

  let bytes: Uint8Array;
  try {
    bytes = await runApngExport({
      source,
      fps: opts.fps,
      durationSeconds: opts.durationSeconds,
      observer: {
        onSampled: (frames) => {
          sampled = frames;
          if (withReferenceCapture) referenceRgba.push(...frames.map(() => null));
        },
        // `undefined`, not a no-op function, when the caller wants no
        // capture: `runApngExport`'s own loop skips the `await
        // observer.onFrame?.(...)` call entirely rather than invoking and
        // discarding a callback that would still cost a `getImageData` read
        // per frame -- see `apngPipeline.ts`.
        onFrame: withReferenceCapture
          ? (canvas, frame) => {
              // `frame.index`, not `sampled.indexOf(frame)` -- see this
              // function's own docstring (T4-R2) for why.
              const k = frame.index;
              if (k < 0 || k >= referenceRgba.length) {
                throw new Error(
                  "[export] onFrame received a frame whose index is outside the sampled range",
                );
              }
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                throw new Error("[export] onFrame's canvas has no 2D context to read pixels from");
              }
              const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
              referenceRgba[k] = rgbaToBase64(data);
              if (width === null) {
                width = canvas.width;
                height = canvas.height;
              }
            }
          : undefined,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`[export] ${message}`);
  }
  if (withReferenceCapture && width === null) {
    throw new Error("[export] runApngExport returned without rasterizing any frame");
  }

  // A `null` slot -- a sampled frame `onFrame` was never called for, e.g. a
  // dropped frame (Task 5 Step 7, mutation (a)) -- is reported, not thrown:
  // `apng-check.mjs` gates on it explicitly (`missingReferenceFrames`, the
  // same shape `video-check.mjs` already uses for the identical question on
  // the video path), so the report names exactly which index the pipeline
  // never handed a canvas for rather than an opaque construction failure.
  // With capture off, `referenceRgba` stays `[]` and `width`/`height` stay
  // `null` -- there was nothing to inspect a size from.
  return {
    apng: toBase64(bytes),
    referenceRgba,
    fps: opts.fps,
    frameCount: sampled.length,
    width,
    height,
  };
}

export function installApngSeam(): void {
  window.__mareyExportApng = exportApng;
}
