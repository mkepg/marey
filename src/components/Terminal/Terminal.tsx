import { useEffect, useRef } from "preact/hooks";
import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import styles from "./Terminal.module.scss";

const MAX_LOGS = 500;

export const Terminal: FunctionComponent = () => {
  const logs    = useAppStore((s) => s.logs);
  const bodyRef = useRef<HTMLDivElement>(null);
  
  // Track if the user is actively looking at the bottom of the logs
  const isAtBottomRef = useRef(true);

  const handleScroll = () => {
    if (!bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    // 40px threshold to be considered "at the bottom"
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  useEffect(() => {
    // Only yank the scrollbar down if the user is already at the bottom
    if (bodyRef.current && isAtBottomRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs]);

  const displayLogs = logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs;
  const truncated = logs.length > MAX_LOGS;

  return (
    <div className={styles.body} ref={bodyRef} onScroll={handleScroll}>
      {logs.length === 0 ? (
        <span className={styles.empty}></span>
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