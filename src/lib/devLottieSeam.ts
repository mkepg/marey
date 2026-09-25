import { runLottieExport } from "../compiler/export/lottiePipeline";
import { hashFrames } from "../compiler/export/frameHash";
import type { FrameSnapshot } from "../compiler/renderer/frameSampler";

/** What `window.__mareyExportLottie` resolves to. */
export interface ExportLottieResult {
  /** The whole Lottie document. Typed `unknown` at this boundary on purpose:
   * a Playwright harness receives it over `page.evaluate`'s JSON channel and
   * has no reason to import `LottieDoc` to write it to disk or hand it to
   * lottie-web, which takes `unknown` JSON itself. */
  readonly doc: unknown;
  /** `hashFrames` over the sampled snapshots — simulation output, not the
   * encoded document — so a harness can check cross-reload determinism the
   * same way `export-check.mjs` does for the PNG seam. */
  readonly hash: string;
  readonly fps: number;
  readonly frameCount: number;
}

export interface ExportLottieOptions {
  readonly fps: number;
  readonly durationSeconds?: number;
}

declare global {
  interface Window {
    /**
     * Dev-only export seam for `tools/visual-check/lottie-check.mjs`.
     *
     * Absent from a production build for the same reason
     * `__mareyExportPng` is: `main.tsx` reaches it through a dynamic import
     * inside `if (import.meta.env.DEV)`, which Vite constant-folds to
     * `false` when building, dropping the whole module rather than merely
     * leaving the global unset.
     *
     * A thin observer of `runLottieExport` (`lottiePipeline.ts`), as
     * `devVideoSeam.ts` is of `runVideoExport` (ruling R45): this file does
     * not re-implement compile -> plan -> build -> sample -> encode.
     */
    __mareyExportLottie?: (
      source: string,
      opts: ExportLottieOptions,
    ) => Promise<ExportLottieResult>;
  }
}

async function exportLottie(
  source: string,
  opts: ExportLottieOptions,
): Promise<ExportLottieResult> {
  let frames: ReadonlyArray<FrameSnapshot> = [];
  const doc = await runLottieExport({
    source,
    fps: opts.fps,
    durationSeconds: opts.durationSeconds,
    observer: {
      onSampled: (sampled) => {
        frames = sampled;
      },
    },
  });
  return { doc, hash: hashFrames(frames), fps: doc.fr, frameCount: doc.op };
}

export function installLottieSeam(): void {
  window.__mareyExportLottie = exportLottie;
}
