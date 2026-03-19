import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import styles from "./FallbackEditor.module.scss";

export const FallbackEditor: FunctionComponent = () => {
  const code    = useAppStore((s) => s.code);
  const setCode = useAppStore((s) => s.setCode);

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    
    // FIX: Preserves Ctrl+Z/Undo history and prevents destroying highlighted text
    document.execCommand("insertText", false, "  ");
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