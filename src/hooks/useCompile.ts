import { useCallback, useEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";
import { compile } from "../compiler";
import { useAppStore } from "../store";

export function useCompile(hostRef: RefObject<HTMLDivElement>): () => void {
  const code   = useAppStore((s) => s.code);
  const theme  = useAppStore((s) => s.theme);
  const status = useAppStore((s) => s.compileStatus);
  
  const setLogs          = useAppStore((s) => s.setLogs);
  const setErrors        = useAppStore((s) => s.setErrors);
  const setCompileStatus = useAppStore((s) => s.setCompileStatus);
  
  const codeRef   = useRef(code);
  const themeRef  = useRef(theme);
  const statusRef = useRef(status);
  
  codeRef.current   = code;
  themeRef.current  = theme;
  statusRef.current = status;
  
  const cleanupRef = useRef<(() => void) | null>(null);
  const compileIdRef = useRef<number>(0);
  
  const runCompile = useCallback((): void => {
    const host = hostRef.current;
    if (!host) return;
    
    const isDark = themeRef.current === "dark";
    const source = codeRef.current;
    
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
      while (host.firstChild) host.removeChild(host.firstChild);
    }
    
    compileIdRef.current += 1;
    const currentId = compileIdRef.current;
    const timestamp = new Date().toLocaleTimeString();
    
    compile(source, host, isDark).then(({ logs, errors, success, cleanup }) => {
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
    });
  }, [hostRef, setLogs, setErrors, setCompileStatus]);
  
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
  
  // FIX: Removed the `useEffect` that triggered runCompile() on theme changes.
  
  useEffect(() => {
    const id = setTimeout(runCompile, 300);
    return () => {
      clearTimeout(id);
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);
  
  return runCompile;
}