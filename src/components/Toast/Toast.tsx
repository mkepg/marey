import { useEffect, useRef, useState } from "preact/hooks";
import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import type { ToastState } from "../../store";
import styles from "./Toast.module.scss";

/** How long the toast is visible before auto-dismissing. */
const VISIBLE_MS = 2_800;
/** How long the exit animation runs (must match CSS). */
const EXIT_MS = 180;

export const Toast: FunctionComponent = () => {
  const toast       = useAppStore((s) => s.toast);
  const dismissToast = useAppStore((s) => s.dismissToast);

  // We keep a local snapshot so the toast text doesn't vanish mid-exit-animation
  const [visible, setVisible] = useState<ToastState | null>(null);
  const [exiting, setExiting] = useState(false);

  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When a new toast arrives, reset any pending timers and restart
  useEffect(() => {
    if (toast === null) return;

    // Clear any in-flight timers
    if (autoHideTimer.current !== null) clearTimeout(autoHideTimer.current);
    if (exitTimer.current !== null)     clearTimeout(exitTimer.current);

    setExiting(false);
    setVisible(toast);

    autoHideTimer.current = setTimeout(() => {
      setExiting(true);
      exitTimer.current = setTimeout(() => {
        setVisible(null);
        setExiting(false);
        dismissToast();
      }, EXIT_MS);
    }, VISIBLE_MS);

    return () => {
      if (autoHideTimer.current !== null) clearTimeout(autoHideTimer.current);
      if (exitTimer.current !== null)     clearTimeout(exitTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  if (visible === null) return null;

  return (
    <div
      className={`${styles.toast}${exiting ? ` ${styles.exiting}` : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className={`${styles.dot} ${styles[visible.kind]}`} />
      {visible.message}
    </div>
  );
};