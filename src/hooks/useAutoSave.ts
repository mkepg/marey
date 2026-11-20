import { useEffect, useRef } from "preact/hooks";
import { useAppStore } from "../store";
import { saveToStorage } from "../lib/share";

const DEBOUNCE_MS = 750;

/**
 * Saves the code at once when the page is left. The top bar's links to the
 * documentation site open in the same tab, so an edit made inside the
 * debounce window would otherwise be gone when the reader comes back.
 * Returns the function that removes the listener.
 */
export function saveOnLeave(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  getCode: () => string,
  save: (code: string) => boolean,
): () => void {
  const flush = (): void => {
    const code = getCode();
    if (code.trim().length > 0) save(code);
  };
  target.addEventListener("pagehide", flush);
  return () => target.removeEventListener("pagehide", flush);
}

export function useAutoSave(): void {
  const code      = useAppStore((s) => s.code);
  const showToast = useAppStore((s) => s.showToast);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => saveOnLeave(window, () => useAppStore.getState().code, saveToStorage), []);

  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (code.trim().length === 0) return;

    timerRef.current = setTimeout(() => {
      const success = saveToStorage(code);
      if (!success) {
        showToast("Auto-save failed. Your browser's local storage is full.", "error");
      }
      timerRef.current = null;
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [code, showToast]);
}
