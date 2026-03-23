import { useEffect, useState } from "preact/hooks";
import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import type { ActiveToast } from "../../store";
import styles from "./Toast.module.scss";

const VISIBLE_MS = 2800;
const EXIT_MS = 180;

const ToastItem: FunctionComponent<{ toast: ActiveToast }> = ({ toast }) => {
  const dismissToast = useAppStore((s) => s.dismissToast);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const autoHideTimer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => {
        dismissToast(toast.id);
      }, EXIT_MS);
    }, VISIBLE_MS);

    return () => clearTimeout(autoHideTimer);
  }, [toast.id, dismissToast]);

  return (
    <div
      className={`${styles.toast}${exiting ? ` ${styles.exiting}` : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className={`${styles.dot} ${styles[toast.kind]}`} />
      {toast.message}
    </div>
  );
};

export const Toast: FunctionComponent = () => {
  const toasts = useAppStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.toastContainer}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
};