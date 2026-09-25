import { useCallback, useState } from "preact/hooks";
import { useAppStore } from "../store";

/** The frame rate every export uses. Matches `video-check.mjs`'s own default. */
const EXPORT_FPS = 30;

/** Every kind the top bar's export buttons can produce. */
export type ExportKind = "mp4" | "webm" | "apng" | "lottie";

export interface ExportProgress {
  readonly kind: ExportKind;
  readonly done: number;
  readonly total: number;
}

/**
 * One download helper for every export kind: video bytes (`Uint8Array`) and
 * a Lottie document (already `JSON.stringify`-ed to a `string`) both end the
 * same way — a `Blob`, an object URL, a synthetic anchor click, then revoke
 * — only the `Blob` constructor argument, MIME type and filename differ.
 * Same shape as `useShare.ts`'s `downloadCode`.
 *
 * The cast on the `Uint8Array` branch: TS 5.9's DOM lib types `BlobPart`'s
 * `ArrayBufferView` branch as `ArrayBufferView<ArrayBuffer>`, but
 * `encodeVideo` (`videoEncode.ts`) returns a `Uint8Array<ArrayBufferLike>` —
 * `new Uint8Array(target.buffer)` over mediabunny's `BufferTarget.buffer`,
 * which is a plain `ArrayBuffer` at runtime but typed as the wider
 * `ArrayBufferLike` union. `Blob` has accepted any `Uint8Array` in every
 * browser since the constructor existed; this is a lib.dom
 * generic-strictness gap, not a real runtime hazard.
 */
function download(bytes: Uint8Array | string, filename: string, mime: string): void {
  const blob =
    typeof bytes === "string"
      ? new Blob([bytes], { type: mime })
      : new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export for every one of the top bar's export buttons — generalised from
 * Phase 5B's video-only export hook to cover Lottie now and APNG once Task 5
 * lands. `"apng"` is in the `ExportKind` union from this task onward, but its
 * branch throws until T5 replaces it; no apng button renders yet
 * (`TopBar.tsx`).
 *
 * Modelled on `useShare.ts`: a `useCallback` returning a `Promise<void>`,
 * `showToast` for the end states, and the `download` helper above.
 *
 * Progress is reported as local hook state, not through `showToast`:
 * `runVideoExport`'s `onProgress` fires once per frame — 240 times for a
 * 240-frame export — and `showToast` (`store/index.ts`) appends a new,
 * independently auto-dismissing toast on every call. Wiring a per-frame
 * callback into it would flood the toast stack rather than reassure anyone
 * that a several-second export is progressing and not a hung tab. Lottie (and
 * APNG once it lands) has no per-frame encode progress worth showing —
 * `progress.total` stays 0, and `TopBar.tsx`'s `exportLabel` reads that as
 * "starting…"/"…" rather than a percentage.
 *
 * Each pipeline (`videoPipeline.ts`, `lottiePipeline.ts`) is loaded with a
 * dynamic `import()` inside the callback, not a static top-level import, so
 * neither pipeline — nor `mediabunny`, which only `videoPipeline.ts` pulls in
 * — sits in the eager entry chunk every page load pays for. Measured
 * (Phase 5B task-5-report.md, "FIX 1"): a static import of just the video
 * path put +283,561 bytes (+6.6%, ~+74 kB gzipped) of new weight into the
 * chunk every visitor downloads, for a feature only exporters use.
 *
 * `isExporting` is set in a `finally`, not just on the success path: a
 * failed export (an unsupported codec, an out-of-memory 6,000-frame request,
 * a scene Lottie refuses) must not leave the export buttons disabled
 * forever, and the `finally` is what guarantees that regardless of which
 * line throws.
 */
export function useExport(): {
  readonly exportScene: (kind: ExportKind) => Promise<void>;
  readonly progress: ExportProgress | null;
} {
  const code = useAppStore((s) => s.code);
  const showToast = useAppStore((s) => s.showToast);
  const setIsExporting = useAppStore((s) => s.setIsExporting);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const exportScene = useCallback(
    async (kind: ExportKind): Promise<void> => {
      setIsExporting(true);
      setProgress({ kind, done: 0, total: 0 });
      try {
        if (kind === "mp4" || kind === "webm") {
          const { runVideoExport } = await import("../compiler/export/videoPipeline");
          const bytes = await runVideoExport({
            source: code,
            container: kind,
            fps: EXPORT_FPS,
            onProgress: (done, total) => setProgress({ kind, done, total }),
          });
          download(bytes, `scene.${kind}`, kind === "mp4" ? "video/mp4" : "video/webm");
          showToast(`Exported scene.${kind}`, "success");
        } else if (kind === "lottie") {
          const { runLottieExport } = await import("../compiler/export/lottiePipeline");
          const doc = await runLottieExport({ source: code, fps: EXPORT_FPS });
          download(JSON.stringify(doc), "scene.json", "application/json");
          showToast("Exported scene.json", "success");
        } else {
          // T5 replaces this branch with the real APNG pipeline. No button
          // reaches it yet (TopBar.tsx renders no apng button), so this
          // throw is unreachable from the shipped UI today; it exists only
          // so the ExportKind union and this switch stay in lockstep.
          throw new Error("[export] APNG export is not available yet.");
        }
      } catch (error) {
        // VIDEO_*/EXPORT_*/LOTTIE_* diagnostic messages are already written
        // to be read by a person (`videoContract.ts`, `exportContract.ts`,
        // `lottieGeometry.ts`) — the pipelines throw them verbatim as
        // `Error.message`, so showing that message directly is the whole
        // job here. Rewording it would create a second copy of text that
        // already exists once.
        const message = error instanceof Error ? error.message : String(error);
        showToast(message, "error");
      } finally {
        setProgress(null);
        setIsExporting(false);
      }
    },
    [code, showToast, setIsExporting],
  );

  return { exportScene, progress };
}
