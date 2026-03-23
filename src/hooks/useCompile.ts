import { useCallback, useEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";
import { compile } from "../compiler";
import { useAppStore } from "../store";

export function useCompile(hostRef: RefObject<HTMLDivElement>): () => void {
  const code             = useAppStore((s) => s.code);
  const theme            = useAppStore((s) => s.theme);
  const autoRun          = useAppStore((s) => s.autoRun);
  const setLogs          = useAppStore((s) => s.setLogs);
  const setErrors        = useAppStore((s) => s.setErrors);
  const setCompileStatus = useAppStore((s) => s.setCompileStatus);
  const setIsCompiling   = useAppStore((s) => s.setIsCompiling);

  const codeRef   = useRef(code);
  const themeRef  = useRef(theme);

  codeRef.current   = code;
  themeRef.current  = theme;

  const cleanupRef = useRef<(() => void) | null>(null);
  const compileIdRef = useRef<number>(0);
  const isFirstMount = useRef(true);

  const runCompile = useCallback((): void => {
    const host = hostRef.current;
    if (!host) return;

    const source = codeRef.current;
    
    setIsCompiling(true);

    // Ensure we clean up the previous PIXI instance before starting a new one
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    compileIdRef.current += 1;
    const currentId = compileIdRef.current;
    const timestamp = new Date().toLocaleTimeString();

    compile(source, host, () => themeRef.current === "dark").then(({ logs, errors, success, cleanup }) => {
      // Race condition check: Only apply results if this is still the latest compile job
      if (currentId !== compileIdRef.current) {
        if (cleanup) cleanup();
        return;
      }

      cleanupRef.current = cleanup;
      setLogs([
        { kind: "sys", text: `» compile ${timestamp}` },
        ...logs,
      ]);
      setErrors(errors);
      setCompileStatus(success ? "ok" : "error");
      setIsCompiling(false);
    });
  }, [hostRef, setLogs, setErrors, setCompileStatus, setIsCompiling]);

  // Handle Manual Execution (Ctrl+Enter)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runCompile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runCompile]);

  // Unified Compilation Trigger (Fixes double-compile on boot)
  useEffect(() => {
    const isFirst = isFirstMount.current;
    isFirstMount.current = false;

    // Logic: Trigger if it's the very first mount (to populate the scene)
    // OR if autoRun is enabled for subsequent code changes.
    if (!autoRun && !isFirst) return;

    // Use a snappier 300ms delay for the initial boot, 
    // and a standard 800ms debounce for typing changes.
    const delay = isFirst ? 300 : 800;
    
    setIsCompiling(true);
    const id = setTimeout(runCompile, delay);

    return () => {
      clearTimeout(id);
      // If the hook unmounts during the initial boot phase, ensure cleanup
      if (isFirst && cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [code, autoRun, runCompile, setIsCompiling]);

  return runCompile;
}