import { useEffect, useRef, useState } from "preact/hooks";
import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import { useShare } from "../../hooks/useShare";
import { useExport, type ExportKind } from "../../hooks/useExport";
import { exportLabelFor } from "./exportLabel";
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

const ExportIcon: FunctionComponent = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ChevronIcon: FunctionComponent = () => (
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2 3.5 5 6.5 8 3.5" />
  </svg>
);

interface ExportOption {
  readonly kind: ExportKind;
  readonly label: string;
  readonly detail: string;
  readonly Icon: FunctionComponent;
}

/** The export menu's entries, in the order the menu lists them. */
const EXPORT_OPTIONS: readonly ExportOption[] = [
  { kind: "mp4",    label: "MP4 video",  detail: "H.264 · 2×",        Icon: VideoIcon },
  { kind: "webm",   label: "WebM video", detail: "VP9 · 2×",          Icon: VideoIcon },
  { kind: "apng",   label: "APNG image", detail: "animated PNG · 1×", Icon: ApngIcon },
  { kind: "lottie", label: "Lottie",     detail: "vector JSON",       Icon: LottieIcon },
];

const MENU_ITEM = '[role="menuitem"]';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const menuRef     = useRef<HTMLDivElement>(null);
  const triggerRef  = useRef<HTMLButtonElement>(null);

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

  // Opening the menu focuses its first entry; a press anywhere outside the
  // menu or its trigger closes it.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>(MENU_ITEM)?.focus();
    const onPointerDown = (e: PointerEvent): void => {
      if (!menuWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const closeMenu = (): void => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (e: KeyboardEvent): void => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM) ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number): void => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case "Escape":    e.preventDefault(); closeMenu(); break;
      case "Tab":       setMenuOpen(false); break;
      case "ArrowDown": e.preventDefault(); focusAt(at + 1); break;
      case "ArrowUp":   e.preventDefault(); focusAt(at - 1); break;
      case "Home":      e.preventDefault(); focusAt(0); break;
      case "End":       e.preventDefault(); focusAt(items.length - 1); break;
    }
  };

  const handleTriggerKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMenuOpen(true);
    }
  };

  const handleExportClick = (kind: ExportKind): void => {
    closeMenu();
    void exportScene(kind);
  };

  // While an export runs, the menu's trigger names the kind that is running
  // and shows `exportLabelFor`'s progress label for it.
  const running = progress ? EXPORT_OPTIONS.find((o) => o.kind === progress.kind) : undefined;
  const runningLabel = progress ? exportLabelFor(progress.kind, progress) : "";

  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        <span className={styles.logo}>Marey</span>
        <div className={styles.status} role="status">
          <div className={`${styles.statusDot} ${dotMod}`} />
          <span className={styles.statusLabel}>{statusText}</span>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.autoRunControl} title="Compile automatically as you type">
          <span className={styles.autoRunLabel}>auto-run</span>
          <button
            className={`${styles.switch} ${autoRun ? styles.active : ""}`}
            onClick={() => setAutoRun(!autoRun)}
            aria-pressed={autoRun}
            aria-label="Auto-run"
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
          {confirmingNew ? "confirm?" : <span className={styles.btnText}>new</span>}
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
          {confirmingExample ? "replace?" : <span className={styles.btnText}>example</span>}
        </button>

        <div className={styles.tooltipWrap}>
          <button
            className={styles.btnIcon}
            onClick={() => { void handleShare(); }}
            disabled={isTooLarge}
            aria-label={isTooLarge ? "Code too large to share via URL" : "Share — copy link to clipboard"}
            aria-disabled={isTooLarge}
            title={isTooLarge ? undefined : "Share — copy link to clipboard"}
          >
            <ShareIcon />
            <span className={styles.btnText}>share</span>
          </button>
          {isTooLarge && (
            <span className={styles.tooltip} role="tooltip">
              Code too large to share via URL
            </span>
          )}
        </div>

        <div className={styles.menuWrap} ref={menuWrapRef}>
          <button
            ref={triggerRef}
            className={`${styles.btnIcon}${running ? ` ${styles.btnExporting}` : ""}`}
            onClick={() => setMenuOpen(!menuOpen)}
            onKeyDown={handleTriggerKeyDown}
            disabled={isExporting}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={
              running
                ? running.kind === "lottie"
                  ? "Exporting Lottie animation"
                  : `Exporting ${running.label}, ${runningLabel}`
                : "Export scene"
            }
            title="Export as video, APNG or Lottie"
          >
            <ExportIcon />
            {running ? `${running.kind} ${runningLabel}` : "export"}
            {!running && <ChevronIcon />}
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              className={styles.menu}
              role="menu"
              aria-label="Export format"
              onKeyDown={handleMenuKeyDown}
            >
              {EXPORT_OPTIONS.map((option) => (
                <button
                  key={option.kind}
                  className={styles.menuItem}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => handleExportClick(option.kind)}
                >
                  <option.Icon />
                  <span className={styles.menuLabel}>{option.label}</span>
                  <span className={styles.menuDetail}>{option.detail}</span>
                </button>
              ))}
              <div className={styles.menuSeparator} role="separator" />
              {/* Generated at build time by vite-plugins/thirdPartyLicenses.ts. */}
              <a
                className={`${styles.menuItem} ${styles.menuLink}`}
                role="menuitem"
                tabIndex={-1}
                href={`${import.meta.env.BASE_URL}third-party-licenses.txt`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                aria-label="Third-party licenses (opens in a new tab)"
              >
                <span className={styles.menuLabel}>Third-party licenses</span>
              </a>
            </div>
          )}
        </div>

        <div className={styles.divider} />

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
