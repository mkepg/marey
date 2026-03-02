import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import styles from "./TopBar.module.scss";

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// TopBar
// ─────────────────────────────────────────────────────────────────────────────

interface TopBarProps {
  onRun: () => void;
}

export const TopBar: FunctionComponent<TopBarProps> = ({ onRun }) => {
  const theme         = useAppStore((s) => s.theme);
  const status        = useAppStore((s) => s.compileStatus);
  const toggleTheme   = useAppStore((s) => s.toggleTheme);

  const dotMod    = status === "ok" ? styles.ok : status === "error" ? styles.error : "";
  const statusText = status === "ok" ? "compiled" : status === "error" ? "error" : "ready";

  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        <span className={styles.logo}>
          Declare
        </span>
      </div>

      <div className={styles.right}>
        <div className={`${styles.statusDot} ${dotMod}`} />
        <span className={styles.statusLabel}>{statusText}</span>

        <button
          className={styles.btnIcon}
          title="Toggle theme"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>

        <button className={styles.btnRun} onClick={onRun}>
          <RunIcon /> RUN
        </button>
      </div>
    </header>
  );
};
