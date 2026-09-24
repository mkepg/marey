import { useCallback, useState } from "preact/hooks";
import { useAppStore } from "../store";
import type { VideoContainer } from "../compiler/export/videoContract";

/** The frame rate every export uses. Matches `video-check.mjs`'s own default. */
const EXPORT_FPS = 30;

export interface VideoExportProgress {
  readonly container: VideoContainer;
  readonly done: number;
  readonly total: number;
}

function downloadVideo(bytes: Uint8Array, container: VideoContainer): void {
  const mime = container === "mp4" ? "video/mp4" : "video/webm";
  // Same shape as `useShare.ts`'s `downloadCode`: a Blob, an object URL, a
  // synthetic anchor click, then revoke — only the MIME type and filename
  // differ.
  //
  // The cast: TS 5.9's DOM lib types `BlobPart`'s `ArrayBufferView` branch as
  // `ArrayBufferView<ArrayBuffer>`, but `encodeVideo` (`videoEncode.ts`)
  // returns a `Uint8Array<ArrayBufferLike>` — `new Uint8Array(target.buffer)`
  // over mediabunny's `BufferTarget.buffer`, which is a plain `ArrayBuffer`
  // at runtime but typed as the wider `ArrayBufferLike` union. `Blob` has
  // accepted any `Uint8Array` in every browser since the constructor existed;
  // this is a lib.dom generic-strictness gap, not a real runtime hazard.
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scene.${container}`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Video export for the top bar's export buttons.
 *
 * Modelled on `useShare.ts`: a `useCallback` returning a `Promise<void>`,
 * `showToast` for the end states, and a download helper identical in shape
 * to `downloadCode` (Blob + object URL + synthetic click + revoke).
 *
 * Progress is reported as local hook state, not through `showToast`:
 * `encodeVideo`'s `onProgress` fires once per frame — 240 times for a
 * 240-frame export — and `showToast` (`store/index.ts`) appends a new,
 * independently auto-dismissing toast on every call. Wiring a per-frame
 * callback into it would flood the toast stack rather than reassure anyone
 * that a several-second export is progressing and not a hung tab.
 *
 * Consumes `videoPipeline.ts`'s `runVideoExport` — the same
 * compile -> plan -> build -> sample -> rasterize -> encode path
 * `devVideoSeam.ts` runs — rather than `window.__mareyExportVideo`: that
 * seam is `import.meta.env.DEV`-gated and constant-folded out of a
 * production build (`main.tsx`), so a caller reaching through it would work
 * in `npm run dev` and silently do nothing once built. See
 * `.sdd/2026-09-18-phase-5b-video/task-5-report.md` for why
 * `videoPipeline.ts` exists as a separate module rather than this hook
 * calling the compiler/renderer/export modules directly.
 *
 * `runVideoExport` is loaded with a dynamic `import()` inside the callback,
 * not a static top-level import, so `mediabunny` (and the rest of the export
 * path) is not in the eager entry chunk every page load pays for. Measured
 * (`task-5-report.md`, "FIX 1"): a static import put +283,561 bytes
 * (+6.6%, ~+74 kB gzipped) of new weight into the chunk every visitor
 * downloads, for a feature only exporters use — this app has no other
 * lazy-loading precedent (`monaco-editor` and `pixi.js` are both needed for
 * first paint, so their static imports don't answer this question), but
 * `mediabunny` is the first heavy dependency here that the median visitor
 * never causes to execute, so it gets its own boundary.
 *
 * `isExporting` is set in a `finally`, not just on the success path: a
 * failed export (an unsupported codec, an out-of-memory 6,000-frame
 * request) must not leave the export buttons disabled forever, and the
 * `finally` is what guarantees that regardless of which line throws.
 */
export function useExportVideo(): {
  readonly exportVideo: (container: VideoContainer) => Promise<void>;
  readonly progress: VideoExportProgress | null;
} {
  const code = useAppStore((s) => s.code);
  const showToast = useAppStore((s) => s.showToast);
  const setIsExporting = useAppStore((s) => s.setIsExporting);
  const [progress, setProgress] = useState<VideoExportProgress | null>(null);

  const exportVideo = useCallback(
    async (container: VideoContainer): Promise<void> => {
      setIsExporting(true);
      setProgress({ container, done: 0, total: 0 });
      try {
        const { runVideoExport } = await import("../compiler/export/videoPipeline");
        const bytes = await runVideoExport({
          source: code,
          container,
          fps: EXPORT_FPS,
          onProgress: (done, total) => setProgress({ container, done, total }),
        });
        downloadVideo(bytes, container);
        showToast(`Exported scene.${container}`, "success");
      } catch (error) {
        // VIDEO_*/EXPORT_* diagnostic messages are already written to be
        // read by a person (`videoContract.ts`, `exportContract.ts`) —
        // `runVideoExport` throws them verbatim as `Error.message`, so
        // showing that message directly is the whole job here. Rewording it
        // would create a second copy of text that already exists once.
        const message = error instanceof Error ? error.message : String(error);
        showToast(message, "error");
      } finally {
        setProgress(null);
        setIsExporting(false);
      }
    },
    [code, showToast, setIsExporting],
  );

  return { exportVideo, progress };
}
