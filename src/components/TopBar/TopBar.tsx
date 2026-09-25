import { useState } from "preact/hooks";
import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import { useShare } from "../../hooks/useShare";
import { useExport, type ExportKind } from "../../hooks/useExport";
import styles from "./TopBar.module.scss";

const SunIcon: FunctionComponent = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1"  x2="12" y2="3"  />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"  />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1"  y1="12" x2="3"  y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36" />
    <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"  />
  </svg>
);

const MoonIcon: FunctionComponent = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const RunIcon: FunctionComponent = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
    <polygon points="2,1 9,5 2,9" />
  </svg>
);

const ShareIcon: FunctionComponent = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const NewFileIcon: FunctionComponent = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9"  y1="14" x2="15" y2="14" />
  </svg>
);

const ExampleIcon: FunctionComponent = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const VideoIcon: FunctionComponent = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="14" height="12" rx="2" />
    <path d="M16 10l6-4v12l-6-4z" />
  </svg>
);

const ApngIcon: FunctionComponent = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

const LottieIcon: FunctionComponent = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 1 9 9" />
    <circle cx="12" cy="21" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

interface TopBarProps {
  onRun: () => void;
}

export const TopBar: FunctionComponent<TopBarProps> = ({ onRun }) => {
  const theme       = useAppStore((s) => s.theme);
  const status      = useAppStore((s) => s.compileStatus);
  const autoRun     = useAppStore((s) => s.autoRun);
  const isTooLarge  = useAppStore((s) => s.isTooLargeToShare);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const newFile     = useAppStore((s) => s.newFile);
  const loadExample = useAppStore((s) => s.loadExample);
  const setAutoRun  = useAppStore((s) => s.setAutoRun);
  const handleShare = useShare();
  const code        = useAppStore((s) => s.code);
  const isExporting = useAppStore((s) => s.isExporting);
  const { exportScene, progress } = useExport();

  const [confirmingNew, setConfirmingNew] = useState(false);
  const [confirmingExample, setConfirmingExample] = useState(false);

  // An empty editor has nothing to lose, so skip the confirmation there —
  // that is the case a first-timer who cleared the editor is most likely in.
  const exampleNeedsConfirm = code.trim().length > 0;

  const dotMod     = status === "ok" ? styles.ok : status === "error" ? styles.error : "";
  const statusText = status === "ok" ? "compiled" : status === "error" ? "error" : "ready";

  const handleNewClick = (): void => {
    if (!confirmingNew) {
      setConfirmingNew(true);
      setTimeout(() => setConfirmingNew(false), 3_000);
      return;
    }
    setConfirmingNew(false);
    newFile();
  };

  const handleNewBlur = (): void => {
    setTimeout(() => setConfirmingNew(false), 150);
  };

  const handleExampleClick = (): void => {
    if (exampleNeedsConfirm && !confirmingExample) {
      setConfirmingExample(true);
      setTimeout(() => setConfirmingExample(false), 3_000);
      return;
    }
    setConfirmingExample(false);
    loadExample();
  };

  const handleExampleBlur = (): void => {
    setTimeout(() => setConfirmingExample(false), 150);
  };

  // The New/Example buttons reflect their confirm state in the label; this
  // does the same for the one button currently mid-export, showing a percent
  // rather than static text so a several-second export does not read as a
  // hung tab. The other export buttons just go disabled. Lottie (and APNG,
  // once it ships) has no per-frame progress at all, so its running label is
  // always "…" rather than a percent or "starting…".
  const exportLabel = (kind: ExportKind): string => {
    if (progress && progress.kind === kind) {
      if (kind === "lottie" || kind === "apng") return "…";
      return progress.total > 0
        ? `${Math.round((progress.done / progress.total) * 100)}%`
        : "starting…";
    }
    return kind;
  };

  const handleExportClick = (kind: ExportKind): void => {
    void exportScene(kind);
  };

  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        <span className={styles.logo}>Marey</span>
      </div>

      <div className={styles.right}>
        <div className={`${styles.statusDot} ${dotMod}`} />
        <span className={styles.statusLabel}>{statusText}</span>
        
        <div className={styles.divider} />

        {/* Improved Auto-Run Toggle Switch */}
        <div className={styles.autoRunControl} title="Compile automatically as you type">
          <span className={styles.autoRunLabel}>Auto-Run</span>
          <button 
            className={`${styles.switch} ${autoRun ? styles.active : ""}`}
            onClick={() => setAutoRun(!autoRun)}
            aria-pressed={autoRun}
            role="switch"
          >
            <div className={styles.knob} />
          </button>
        </div>

        <div className={styles.divider} />

        <button
          className={`${styles.btnIcon}${confirmingNew ? ` ${styles.btnConfirm}` : ""}`}
          onClick={handleNewClick}
          onBlur={handleNewBlur}
          aria-label={confirmingNew ? "Click again to confirm new file" : "New file"}
          title={confirmingNew ? "Click again to confirm — clears editor" : "New file"}
        >
          <NewFileIcon />
          {confirmingNew ? "confirm?" : "new"}
        </button>

        <button
          className={`${styles.btnIcon}${confirmingExample ? ` ${styles.btnConfirm}` : ""}`}
          onClick={handleExampleClick}
          onBlur={handleExampleBlur}
          aria-label={
            confirmingExample
              ? "Click again to confirm loading the example"
              : "Load the example scene"
          }
          title={
            confirmingExample
              ? "Click again to confirm — replaces your code"
              : "Load the example scene"
          }
        >
          <ExampleIcon />
          {confirmingExample ? "replace?" : "example"}
        </button>

        <div className={styles.tooltipWrap}>
          <button
            className={styles.btnIcon}
            onClick={() => { void handleShare(); }}
            disabled={isTooLarge}
            aria-label={isTooLarge ? "Code too large to share via URL" : "Share — copy link to clipboard"}
            aria-disabled={isTooLarge}
          >
            <ShareIcon />
            share
          </button>
          {isTooLarge && (
            <span className={styles.tooltip} role="tooltip">
              Code too large to share via URL
            </span>
          )}
        </div>

        <div className={styles.divider} />

        <button
          className={`${styles.btnIcon}${progress?.kind === "mp4" ? ` ${styles.btnExporting}` : ""}`}
          onClick={() => handleExportClick("mp4")}
          disabled={isExporting}
          aria-label={
            progress?.kind === "mp4"
              ? `Exporting MP4 video, ${exportLabel("mp4")}`
              : "Export scene as MP4 video"
          }
          title="Export MP4 video"
        >
          <VideoIcon />
          {exportLabel("mp4")}
        </button>

        <button
          className={`${styles.btnIcon}${progress?.kind === "webm" ? ` ${styles.btnExporting}` : ""}`}
          onClick={() => handleExportClick("webm")}
          disabled={isExporting}
          aria-label={
            progress?.kind === "webm"
              ? `Exporting WebM video, ${exportLabel("webm")}`
              : "Export scene as WebM video"
          }
          title="Export WebM video"
        >
          <VideoIcon />
          {exportLabel("webm")}
        </button>

        <button
          className={`${styles.btnIcon}${progress?.kind === "apng" ? ` ${styles.btnExporting}` : ""}`}
          onClick={() => handleExportClick("apng")}
          disabled={isExporting}
          aria-label={
            progress?.kind === "apng"
              ? `Exporting APNG image, ${exportLabel("apng")}`
              : "Export scene as APNG image"
          }
          title="Export APNG image"
        >
          <ApngIcon />
          {exportLabel("apng")}
        </button>

        <button
          className={`${styles.btnIcon}${progress?.kind === "lottie" ? ` ${styles.btnExporting}` : ""}`}
          onClick={() => handleExportClick("lottie")}
          disabled={isExporting}
          aria-label={
            progress?.kind === "lottie"
              ? "Exporting Lottie animation"
              : "Export scene as Lottie animation (JSON)"
          }
          title="Export Lottie animation (JSON)"
        >
          <LottieIcon />
          {exportLabel("lottie")}
        </button>

        <div className={styles.divider} />

        {/* Generated at build time by vite-plugins/thirdPartyLicenses.ts. */}
        <a
          className={`${styles.btnIcon} ${styles.btnLink}`}
          href={`${import.meta.env.BASE_URL}third-party-licenses.txt`}
          target="_blank"
          rel="noopener noreferrer"
          title="Third-party licenses"
          aria-label="Third-party licenses (opens in a new tab)"
        >
          licenses
        </a>

        <button
          className={styles.btnIcon}
          title="Toggle theme"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>

        <button className={styles.btnRun} onClick={onRun} aria-label="Run (Ctrl+Enter)">
          <RunIcon /> RUN
        </button>
      </div>
    </header>
  );
};