import { useEffect, useRef, useState } from "preact/hooks";
import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import { useShare } from "../../hooks/useShare";
import { useExport, type ExportKind } from "../../hooks/useExport";
import { EXAMPLES, type ExampleId } from "../../examples";
import { exportLabelFor } from "./exportLabel";
import { menuKey } from "./menuKeys";
import { useIsNarrow } from "../../hooks/useIsNarrow";
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

const MENU_ITEM = '[role="menuitem"], [role="menuitemcheckbox"]';

/** How long a "Replace your code?" prompt waits for a second choice. */
const CONFIRM_MS = 3_000;

/**
 * An ask-then-confirm prompt: `arm(key)` raises it, and it lowers itself after
 * `CONFIRM_MS` unless `clear()` runs first. `armed` holds the key it was raised
 * for, so one prompt can serve a list of items.
 */
function useConfirm<K>() {
  const [armed, setArmed] = useState<K | null>(null);
  const timer = useRef<number | undefined>(undefined);

  /** Lowers the prompt `ms` from now, replacing any pending timeout. */
  const expireIn = (ms: number): void => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setArmed(null), ms);
  };
  const arm = (key: K): void => {
    setArmed(key);
    expireIn(CONFIRM_MS);
  };
  const clear = (): void => {
    window.clearTimeout(timer.current);
    setArmed(null);
  };

  return { armed, arm, clear, expireIn };
}

/**
 * Open/close, outside-click and keyboard handling shared by the top bar's
 * menus. Opening focuses the first item; Escape closes and returns focus to
 * the trigger; the key rules themselves live in `menuKey`.
 */
function useMenu(onClose?: () => void) {
  const [open, setOpen] = useState(false);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(MENU_ITEM)?.focus();
    const onPointerDown = (e: PointerEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      onClose?.();
    };
    // onClose only touches a ref and a state setter, so a stale closure is harmless.
  }, [open]);

  const close = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent): void => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM) ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const result = menuKey(e.key, at, items.length);
    switch (result.kind) {
      case "move":
        e.preventDefault();
        items[result.index]?.focus();
        break;
      case "activate":
        e.preventDefault();
        items[at]?.click();
        break;
      case "close":
        if (e.key === "Escape") { e.preventDefault(); close(); } else setOpen(false);
        break;
      case "ignore":
        break;
    }
  };

  const onTriggerKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
    }
  };

  return { open, setOpen, close, wrapRef, menuRef, triggerRef, onMenuKeyDown, onTriggerKeyDown };
}

const MoreIcon: FunctionComponent = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <circle cx="3"  cy="8" r="1.4" />
    <circle cx="8"  cy="8" r="1.4" />
    <circle cx="13" cy="8" r="1.4" />
  </svg>
);

/** The short name a running export shows in place of its menu button's label. */
const SHORT_NAME: Readonly<Record<ExportKind, string>> = {
  mp4: "MP4",
  webm: "WebM",
  apng: "APNG",
  lottie: "Lottie",
};

// Generated at build time by vite-plugins/thirdPartyLicenses.ts.
const LICENSES_HREF = `${import.meta.env.BASE_URL}third-party-licenses.txt`;

interface TopBarProps {
  onRun: () => void;
}

/**
 * The top bar (spec 6B §4). On desktop: the wordmark and the compile status
 * on the left; auto-run, Examples, New, Share, Export, the theme toggle and
 * Run on the right. On phones it keeps the wordmark, the status dot,
 * Examples and Run, and folds everything else into the ⋯ (More) menu.
 */
export const TopBar: FunctionComponent<TopBarProps> = ({ onRun }) => {
  const narrow      = useIsNarrow();
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

  const newConfirm = useConfirm<true>();
  const confirmingNew = newConfirm.armed !== null;
  const exampleConfirm = useConfirm<ExampleId>();
  const confirmingId = exampleConfirm.armed;
  const clearConfirm = exampleConfirm.clear;
  const clearNewConfirm = newConfirm.clear;

  const exportMenu  = useMenu();
  const exampleMenu = useMenu(clearConfirm);
  const moreMenu    = useMenu(clearNewConfirm);

  // An empty editor has nothing to lose, so skip the confirmation there —
  // that is the case a first-timer who cleared the editor is most likely in.
  const exampleNeedsConfirm = code.trim().length > 0;

  const dotMod     = status === "ok" ? styles.ok : status === "error" ? styles.error : "";
  const statusText = status === "ok" ? "compiled" : status === "error" ? "error" : "idle";

  /** New asks once, then clears the editor on a second choice within 3 s. Returns true once it has cleared. */
  const chooseNew = (): boolean => {
    if (!confirmingNew) {
      newConfirm.arm(true);
      return false;
    }
    clearNewConfirm();
    newFile();
    return true;
  };

  // Leaving New cancels its confirmation, after a short grace period so a
  // second click that moves focus still counts.
  const handleNewBlur = (): void => {
    newConfirm.expireIn(150);
  };

  const handleExampleChoice = (id: ExampleId): void => {
    if (exampleNeedsConfirm && confirmingId !== id) {
      exampleConfirm.arm(id);
      return;
    }
    clearConfirm();
    exampleMenu.close();
    loadExample(id);
  };

  // Export runs from the Export menu on desktop and from ⋯ on phones; either
  // way the menu closes and focus goes back to its button first.
  const handleExportClick = (kind: ExportKind): void => {
    if (isExporting) return;
    (narrow ? moreMenu : exportMenu).close();
    void exportScene(kind);
  };

  // While an export runs, the menu's trigger names the kind that is running
  // and shows `exportLabelFor`'s progress label for it.
  const running = progress ? EXPORT_OPTIONS.find((o) => o.kind === progress.kind) : undefined;
  const runningLabel = progress ? exportLabelFor(progress.kind, progress) : "";
  // The running export, as a phrase: "MP4 video, 42%" or "Lottie animation".
  const runningWhat = running
    ? running.kind === "lottie"
      ? "Lottie animation"
      : `${running.label}, ${runningLabel}`
    : "";
  const fraction = progress && progress.total > 0 ? progress.done / progress.total : null;

  const exampleMenuEl = (
    <div className={styles.menuWrap} ref={exampleMenu.wrapRef}>
      <button
        ref={exampleMenu.triggerRef}
        className={styles.btn}
        onClick={() => exampleMenu.setOpen(!exampleMenu.open)}
        onKeyDown={exampleMenu.onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={exampleMenu.open}
        aria-label="Examples"
        title="Load an example scene"
      >
        Examples
        <ChevronIcon />
      </button>

      {exampleMenu.open && (
        <div
          ref={exampleMenu.menuRef}
          className={`${styles.menu} ${styles.menuLeft} ${styles.exampleMenu}`}
          role="menu"
          aria-label="Examples"
          onKeyDown={exampleMenu.onMenuKeyDown}
        >
          {EXAMPLES.map((example) => {
            const confirming = confirmingId === example.id;
            return (
              <button
                key={example.id}
                className={`${styles.menuItem} ${styles.exampleItem}${confirming ? ` ${styles.confirmDestructive}` : ""}`}
                role="menuitem"
                tabIndex={-1}
                onClick={() => handleExampleChoice(example.id)}
              >
                <span className={styles.exampleTitle}>
                  {confirming ? "Replace your code?" : example.title}
                </span>
                <span className={styles.exampleDescription}>
                  {confirming ? `Choose again to load ${example.title}.` : example.description}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const exportItems = (
    <div role="group" aria-label="Export">
      {EXPORT_OPTIONS.map((option) => (
        <button
          key={option.kind}
          className={styles.menuItem}
          role="menuitem"
          tabIndex={-1}
          aria-disabled={isExporting || undefined}
          onClick={() => handleExportClick(option.kind)}
        >
          <option.Icon />
          <span className={styles.menuLabel}>{option.label}</span>
          <span className={styles.menuDetail}>{option.detail}</span>
        </button>
      ))}
    </div>
  );

  const licensesItem = (onChoose: () => void) => (
    <a
      className={`${styles.menuItem} ${styles.menuLink}`}
      role="menuitem"
      tabIndex={-1}
      href={LICENSES_HREF}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onChoose}
      aria-label="Third-party licenses (opens in a new tab)"
    >
      <span className={styles.menuIconSpace} aria-hidden="true" />
      <span className={styles.menuLabel}>Third-party licenses</span>
    </a>
  );

  const runButton = (
    <button className={styles.btnRun} onClick={onRun} aria-label="Run (Ctrl+Enter)" title="Run (Ctrl+Enter)">
      <RunIcon />
      Run
    </button>
  );

  return (
    <header className={`${styles.topBar}${narrow ? ` ${styles.narrow}` : ""}`} data-topbar>
      <div className={styles.left}>
        <span className={styles.logo}>Marey</span>
        <div className={styles.status} role="status" title={narrow ? statusText : undefined}>
          <span className={`${styles.statusDot} ${dotMod}`} aria-hidden="true" />
          <span className={narrow ? styles.visuallyHidden : styles.statusLabel}>{statusText}</span>
        </div>
      </div>

      {narrow ? (
        <div className={styles.right}>
          {exampleMenuEl}

          <div className={styles.menuWrap} ref={moreMenu.wrapRef}>
            <button
              ref={moreMenu.triggerRef}
              className={`${styles.btn} ${styles.btnSquare}${running ? ` ${styles.btnExporting}` : ""}`}
              onClick={() => moreMenu.setOpen(!moreMenu.open)}
              onKeyDown={moreMenu.onTriggerKeyDown}
              aria-haspopup="menu"
              aria-expanded={moreMenu.open}
              aria-label={running ? `More, exporting ${runningWhat}` : "More"}
              title="More"
            >
              <MoreIcon />
            </button>

            {moreMenu.open && (
              <div
                ref={moreMenu.menuRef}
                className={`${styles.menu} ${styles.moreMenu}`}
                role="menu"
                aria-label="More"
                onKeyDown={moreMenu.onMenuKeyDown}
              >
                <button
                  className={styles.menuItem}
                  role="menuitemcheckbox"
                  aria-checked={autoRun}
                  tabIndex={-1}
                  onClick={() => setAutoRun(!autoRun)}
                >
                  <span className={styles.menuIconSpace} aria-hidden="true" />
                  <span className={styles.menuLabel}>Auto-run</span>
                  <span className={`${styles.track}${autoRun ? ` ${styles.on}` : ""}`} aria-hidden="true">
                    <span className={styles.knob} />
                  </span>
                </button>
                <button
                  className={`${styles.menuItem}${confirmingNew ? ` ${styles.confirmDestructive}` : ""}`}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => { if (chooseNew()) moreMenu.close(); }}
                >
                  <NewFileIcon />
                  <span className={styles.menuLabel}>{confirmingNew ? "Clear the editor?" : "New file"}</span>
                  {confirmingNew && <span className={styles.menuDetail}>Choose again</span>}
                </button>
                <button
                  className={styles.menuItem}
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={isTooLarge || undefined}
                  onClick={() => {
                    if (isTooLarge) return;
                    moreMenu.close();
                    void handleShare();
                  }}
                >
                  <ShareIcon />
                  <span className={styles.menuLabel}>Share link</span>
                  {isTooLarge && <span className={styles.menuDetail}>Code too large</span>}
                </button>

                <div className={styles.menuSeparator} role="separator" />
                <div className={styles.menuGroupLabel} aria-hidden="true">Export</div>
                {exportItems}
                {licensesItem(() => moreMenu.setOpen(false))}

                <div className={styles.menuSeparator} role="separator" />
                <button
                  className={styles.menuItem}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={toggleTheme}
                >
                  {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                  <span className={styles.menuLabel}>{theme === "dark" ? "Light theme" : "Dark theme"}</span>
                </button>
              </div>
            )}
          </div>

          {runButton}

          {running && (
            <div
              className={`${styles.progress}${fraction === null ? ` ${styles.progressIndeterminate}` : ""}`}
              style={fraction === null ? undefined : { transform: `scaleX(${fraction})` }}
              aria-hidden="true"
            />
          )}
        </div>
      ) : (
        <div className={styles.right}>
          <button
            className={styles.autoRun}
            onClick={() => setAutoRun(!autoRun)}
            role="switch"
            aria-checked={autoRun}
            title="Compile automatically as you type"
          >
            Auto-run
            <span className={`${styles.track}${autoRun ? ` ${styles.on}` : ""}`} aria-hidden="true">
              <span className={styles.knob} />
            </span>
          </button>

          <div className={styles.divider} />

          {exampleMenuEl}

          <button
            className={`${styles.btn}${confirmingNew ? ` ${styles.confirmDestructive}` : ""}`}
            onClick={() => { chooseNew(); }}
            onBlur={handleNewBlur}
            aria-label={confirmingNew ? "Clear editor? Choose New again to confirm" : "New file"}
            title={confirmingNew ? "Choose again to clear the editor" : "New file"}
          >
            {confirmingNew ? "Clear editor?" : "New"}
          </button>

          <div className={styles.tooltipWrap}>
            <button
              className={styles.btn}
              onClick={() => { void handleShare(); }}
              disabled={isTooLarge}
              aria-label={isTooLarge ? "Share: code too large to share via URL" : "Share: copy a link to the clipboard"}
              aria-disabled={isTooLarge}
              title={isTooLarge ? undefined : "Copy a link to this scene"}
            >
              Share
            </button>
            {isTooLarge && (
              <span className={styles.tooltip} role="tooltip">
                Code too large to share via URL
              </span>
            )}
          </div>

          <div className={styles.menuWrap} ref={exportMenu.wrapRef}>
            <button
              ref={exportMenu.triggerRef}
              className={`${styles.btn}${running ? ` ${styles.btnExporting}` : ""}`}
              onClick={() => exportMenu.setOpen(!exportMenu.open)}
              onKeyDown={exportMenu.onTriggerKeyDown}
              disabled={isExporting}
              aria-haspopup="menu"
              aria-expanded={exportMenu.open}
              aria-label={running ? `Exporting ${runningWhat}` : "Export scene"}
              title="Export as video, APNG or Lottie"
            >
              {running ? `${SHORT_NAME[running.kind]} ${runningLabel}` : "Export"}
              {!running && <ChevronIcon />}
            </button>

            {exportMenu.open && (
              <div
                ref={exportMenu.menuRef}
                className={styles.menu}
                role="menu"
                aria-label="Export format"
                onKeyDown={exportMenu.onMenuKeyDown}
              >
                {exportItems}
                <div className={styles.menuSeparator} role="separator" />
                {licensesItem(() => exportMenu.setOpen(false))}
              </div>
            )}
          </div>

          <div className={styles.divider} />

          <button
            className={`${styles.btn} ${styles.btnSquare}`}
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          {runButton}
        </div>
      )}
    </header>
  );
};
