import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import styles from "./FallbackEditor.module.scss";

export const FallbackEditor: FunctionComponent = () => {
  const code    = useAppStore((s) => s.code);
  const setCode = useAppStore((s) => s.setCode);

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Tab") return;
    e.preventDefault();

    const target = e.currentTarget as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;

    // Safely insert spaces using string manipulation instead of the deprecated execCommand API
    const newCode = code.substring(0, start) + "  " + code.substring(end);
    setCode(newCode);

    // Reposition the cursor accurately after the DOM has updated
    requestAnimationFrame(() => {
      target.selectionStart = target.selectionEnd = start + 2;
    });
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