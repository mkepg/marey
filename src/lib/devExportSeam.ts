import { runPngExport } from "../compiler/export/pngPipeline";
import { hashFrames } from "../compiler/export/frameHash";

/** What `window.__mareyExportPng` resolves to. */
export interface ExportPngResult {
  /** One base64-encoded PNG per frame, in order. No `data:` prefix. */
  readonly frames: string[];
  /** `hashFrames` over the sampled snapshots — simulation output, not pixels. */
  readonly hash: string;
  readonly fps: number;
  readonly frameCount: number;
  readonly width: number;
  readonly height: number;
}

export interface ExportPngOptions {
  readonly fps: number;
  readonly durationSeconds?: number;
}

declare global {
  interface Window {
    /**
     * Dev-only export seam for `tools/visual-check/export-check.mjs`.
     *
     * Absent from a production build: `main.tsx` reaches it through a dynamic
     * import inside `if (import.meta.env.DEV)`, which Vite constant-folds to
     * `false` when building, so the whole module is dropped rather than merely
     * unreferenced.
     */
    __mareyExportPng?: (source: string, opts: ExportPngOptions) => Promise<ExportPngResult>;
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

/**
 * Compile, plan, build, sample, encode — the whole export path, with no UI.
 *
 * The top bar ships MP4, WebM, APNG and Lottie buttons, but no PNG-sequence
 * button, so a browser harness has nothing to click for PNG frames. A narrow
 * named seam is better than driving a button that does not exist, and better
 * than the harness re-implementing the pipeline in page script, where it
 * could silently diverge from the one the app actually runs.
 *
 * Since Phase 6 Task 4 this seam calls `pngPipeline.ts`'s `runPngExport` —
 * the same move Phase 5B made for video and Phase 5C Task 5 made for APNG —
 * rather than holding its own copy of the compile -> plan -> build -> sample
 * prefix (`rasterExport.ts`'s `withRasterExport`, global constraint 7). It
 * passes no `durationSeconds` override beyond what the caller supplies: the
 * `Application` `runPngExport` builds is initialised at the scene's
 * **logical** size with the scene's own background, `autoStart: false`
 * (nothing here may advance on a wall clock) and `resolution: 1` (`scale: 1`,
 * spec §2.1/O3 — a plain PNG sequence is never upscaled). The preview's
 * `Application` carries `devicePixelRatio` and whatever `fit` scaling the
 * pane needs; the exported artifact is the scene, not the preview.
 *
 * This seam only *observes* `runPngExport`: `observer.onSampled` supplies
 * the sampler's own frames for `hashFrames` (the simulation-state hash, not
 * a pixel hash) and sizes the base64 array up front, and `onPng` places each
 * frame's base64 PNG at `frame.index` — never at arrival order (Task 4
 * ruling T4-R2, carried into every export seam) — as frames are produced.
 */
async function exportPng(source: string, opts: ExportPngOptions): Promise<ExportPngResult> {
  try {
    let hash = "";
    let pngs: string[] = [];
    const result = await runPngExport({
      source,
      fps: opts.fps,
      durationSeconds: opts.durationSeconds,
      onPng: (frame, png) => {
        pngs[frame.index] = toBase64(png);
      },
      observer: {
        onSampled: (frames) => {
          pngs = new Array(frames.length);
          hash = hashFrames(frames);
        },
      },
    });
    return {
      frames: pngs,
      hash,
      fps: result.fps,
      frameCount: result.frameCount,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Only the refusals `withRasterExport` can throw before any
    // Application exists for this seam (a compile failure, a `planExport`
    // diagnostic, or, since Phase 5C Task 7, `ensureExportFonts`'s
    // `EXPORT_FONT_UNAVAILABLE` — this call passes no `beforeBuild`, so
    // nothing else can throw ahead of `new Application()`) get this seam's
    // own `[export] ` marker, reproducing this function's pre-Task-4
    // behaviour exactly: an error from inside the build/sample/encode step
    // (a bad scene tree, a PNG encode failure) propagates unprefixed, same
    // as before.
    if (message.startsWith("Source did not compile:") || /^\[EXPORT_/.test(message)) {
      throw new Error(`[export] ${message}`);
    }
    throw error;
  }
}

export function installExportSeam(): void {
  window.__mareyExportPng = exportPng;
}
