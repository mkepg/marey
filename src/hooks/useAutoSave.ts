/**
 * src/hooks/useAutoSave.ts
 *
 * Debounced auto-save: writes `code` to localStorage 750 ms after the user
 * stops typing.
 *
 * Rules:
 *   - Never saves an empty string. An empty string in localStorage is the
 *     sentinel that newFile() uses to signal "no session" — overwriting it
 *     would break the boot-time resolver on the next page load.
 *   - Cancels any in-flight timer on unmount so we never write stale state.
 *   - Does NOT interact with the URL hash at all; hash management is handled
 *     exclusively by useShare and resolveInitialCode.
 */

import { useEffect, useRef } from "preact/hooks";
import { useAppStore } from "../store";
import { saveToStorage } from "../lib/share";

const DEBOUNCE_MS = 750;

export function useAutoSave(): void {
  const code    = useAppStore((s) => s.code);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cancel any pending save before scheduling a new one
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Do not persist empty strings — the blank-file sentinel must stay absent
    if (code.trim().length === 0) return;

    timerRef.current = setTimeout(() => {
      saveToStorage(code);
      timerRef.current = null;
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [code]);
}