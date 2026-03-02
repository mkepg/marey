import { useEffect, useRef } from "preact/hooks";
import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import styles from "./Terminal.module.scss";

// ─────────────────────────────────────────────────────────────────────────────
// Terminal — scrollable compiler output panel
// ─────────────────────────────────────────────────────────────────────────────

export const Terminal: FunctionComponent = () => {
  const logs    = useAppStore((s) => s.logs);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className={styles.body} ref={bodyRef}>
      {logs.length === 0 ? (
        <span className={styles.empty}>// press RUN or Ctrl+Enter to compile</span>
      ) : (
        logs.map((entry, i) => (
          <div
            key={i}
            className={`${styles.line} ${styles[entry.kind] ?? ""}`}
            style={{ animationDelay: `${i * 25}ms` }}
          >
            {entry.text}
          </div>
        ))
      )}
    </div>
  );
};
