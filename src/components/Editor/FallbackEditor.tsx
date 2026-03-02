import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import styles from "./FallbackEditor.module.scss";

// ─────────────────────────────────────────────────────────────────────────────
// FallbackEditor — plain <textarea> used while Monaco is loading
// ─────────────────────────────────────────────────────────────────────────────

export const FallbackEditor: FunctionComponent = () => {
  const code    = useAppStore((s) => s.code);
  const setCode = useAppStore((s) => s.setCode);

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget as HTMLTextAreaElement;
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const next  = el.value.slice(0, start) + "  " + el.value.slice(end);
    el.value = next;
    el.selectionStart = el.selectionEnd = start + 2;
    setCode(next);
  };

  return (
    <textarea
      className={styles.textarea}
      value={code}
      onInput={(e) => setCode((e.currentTarget as HTMLTextAreaElement).value)}
      onKeyDown={handleKeyDown}
      spellcheck={false}
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
    />
  );
};
