import { useEffect, useRef } from "preact/hooks";
import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import styles from "./Terminal.module.scss";

const MAX_LOGS = 500;

export const Terminal: FunctionComponent = () => {
  const logs    = useAppStore((s) => s.logs);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs]);

  // FIX: Cap logs to prevent DOM explosion and frame drops
  const displayLogs = logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs;
  const truncated = logs.length > MAX_LOGS;

  return (
    <div className={styles.body} ref={bodyRef}>
      {logs.length === 0 ? (
        <span className={styles.empty}>// output will appear here</span>
      ) : (
        <>
          {truncated && (
            <div className={`${styles.line} ${styles.sys}`}>
              [sys] Output truncated to last {MAX_LOGS} lines...
            </div>
          )}
          {displayLogs.map((entry, i) => (
            <div
              key={i}
              className={`${styles.line} ${styles[entry.kind] ?? ""}`}
              style={{ animationDelay: `${i * 10}ms` }}
            >
              {entry.text}
            </div>
          ))}
        </>
      )}
    </div>
  );
};