import { useEffect, useRef } from "preact/hooks";
import { useAppStore } from "../store";
import { saveToStorage } from "../lib/share";

const DEBOUNCE_MS = 750;

export function useAutoSave(): void {
  const code      = useAppStore((s) => s.code);
  const showToast = useAppStore((s) => s.showToast);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

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