import { encodePngSequence } from "../compiler/export/pngSequence";
import { hashFrames } from "../compiler/export/frameHash";
import { withRasterExport } from "../compiler/export/rasterExport";

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
 * The compile -> plan -> build -> sample prefix and the teardown around it
 * are `rasterExport.ts`'s `withRasterExport` (Phase 5C Task 4) — the same
 * helper `videoPipeline.ts` and `lottiePipeline.ts` are built on, so this
 * seam observes exactly the pipeline they run rather than holding a second
 * copy of it (global constraint 7). It passes `scale: 1`: the `Application`
 * is initialised at the scene's **logical** size with the scene's own
 * background, `autoStart: false` (nothing here may advance on a wall clock)
 * and `resolution: 1`. The preview's `Application` carries
 * `devicePixelRatio` and whatever `fit` scaling the pane needs; the exported
 * artifact is the scene, not the preview.
 */
async function exportPng(source: string, opts: ExportPngOptions): Promise<ExportPngResult> {
  try {
    return await withRasterExport(
      { source, fps: opts.fps, durationSeconds: opts.durationSeconds, scale: 1 },
      async ({ ir, plan, app, root, frames }) => {
        // Sample the whole scene first, then encode. `encodePngSequence`
        // never sees the runtime, so the two phases cannot interleave even
        // by mistake.
        const pngs = await encodePngSequence(app, root, frames);
        return {
          frames: pngs.map(toBase64),
          hash: hashFrames(frames),
          fps: plan.fps,
          frameCount: plan.frameCount,
          width: ir.width,
          height: ir.height,
        };
      },
    );
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
