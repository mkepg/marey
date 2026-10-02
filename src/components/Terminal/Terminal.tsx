import { useEffect, useRef, useState } from "preact/hooks";
import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import type { LogEntry } from "../../compiler";
import { useIsNarrow } from "../../hooks/useIsNarrow";
import { logSummary } from "./logSummary";
import styles from "./Terminal.module.scss";

const MAX_LOGS = 500;
const BODY_ID = "marey-log";

/** Splits "[lexer]   tokenizing..." into its phase tag and its message. */
const TAGGED = /^(\[[^\]]+\])(\s*)([\s\S]*)$/;

const LogLine: FunctionComponent<{ entry: LogEntry }> = ({ entry }) => {
  const match = TAGGED.exec(entry.text);
  return (
    <div className={`${styles.line} ${styles[entry.kind] ?? ""}`}>
      {match ? (
        <>
          <span className={styles.tag}>{match[1]}</span>
          {match[2]}
          {match[3]}
        </>
      ) : (
        entry.text
      )}
    </div>
  );
};

const LogBody: FunctionComponent<{ id?: string }> = ({ id }) => {
  const logs    = useAppStore((s) => s.logs);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Follow new output only while the reader is already at the bottom.
  const isAtBottomRef = useRef(true);

  const handleScroll = (): void => {
    if (!bodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  useEffect(() => {
    if (bodyRef.current && isAtBottomRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs]);

  const displayLogs = logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs;
  const truncated = logs.length > MAX_LOGS;

  return (
    <div id={id} className={styles.body} ref={bodyRef} onScroll={handleScroll}>
      {logs.length === 0 ? (
        <span className={styles.empty}>No output yet. Run the scene to compile it.</span>
      ) : (
        <>
          {truncated && (
            <div className={`${styles.line} ${styles.sys}`}>
              Showing the last {MAX_LOGS} lines.
            </div>
          )}
          {displayLogs.map((entry, i) => (
            <LogLine key={i} entry={entry} />
          ))}
        </>
      )}
    </div>
  );
};

/**
 * The compiler's log. On desktop it fills its pane. On phones it folds into
 * one status line, which opens the log underneath it (spec 6B §4).
 */
export const Terminal: FunctionComponent = () => {
  const narrow = useIsNarrow();
  const status = useAppStore((s) => s.compileStatus);
  const errors = useAppStore((s) => s.errors);
  const [open, setOpen] = useState(false);

  if (!narrow) return <LogBody />;

  const dotMod = status === "ok" ? styles.ok : status === "error" ? styles.error : "";

  return (
    <div className={styles.folded}>
      <button
        type="button"
        className={styles.toggle}
        data-log-toggle
        aria-expanded={open}
        aria-controls={open ? BODY_ID : undefined}
        onClick={() => setOpen(!open)}
      >
        <span className={`${styles.dot} ${dotMod}`} aria-hidden="true" />
        <span className={styles.summary}>{logSummary(status, errors.length)}</span>
        <span className={styles.toggleHint}>{open ? "Hide log" : "Show log"}</span>
        <svg
          className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ""}`}
          width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="2 6.5 5 3.5 8 6.5" />
        </svg>
      </button>
      {open && <LogBody id={BODY_ID} />}
    </div>
  );
};
