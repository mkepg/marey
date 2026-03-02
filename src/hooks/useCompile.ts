import { useCallback, useEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";
import { compile } from "../compiler";
import { useAppStore } from "../store";

// ─────────────────────────────────────────────────────────────────────────────
// useCompile
//
// Wires the compile action to keyboard shortcut + initial run + theme rerender.
// Now async because PixiJS v8 requires awaiting app.init().
//
// Between compiles the previous PixiJS Application is destroyed via the
// cleanup function returned by renderScene() to free GPU resources.
// ─────────────────────────────────────────────────────────────────────────────

export function useCompile(hostRef: RefObject<HTMLDivElement>): () => void {
  const code   = useAppStore((s) => s.code);
  const theme  = useAppStore((s) => s.theme);
  const status = useAppStore((s) => s.compileStatus);
  const setLogs          = useAppStore((s) => s.setLogs);
  const setCompileStatus = useAppStore((s) => s.setCompileStatus);

  // Keep latest values accessible inside stable callbacks without re-creating them
  const codeRef   = useRef(code);
  const themeRef  = useRef(theme);
  const statusRef = useRef(status);
  codeRef.current   = code;
  themeRef.current  = theme;
  statusRef.current = status;

  // Holds the cleanup fn from the most recent successful PixiJS render.
  // Called before every new render to destroy the previous Application.
  const cleanupRef = useRef<(() => void) | null>(null);

  const runCompile = useCallback((): void => {
    const host = hostRef.current;
    if (!host) return;

    const isDark = themeRef.current === "dark";
    const source = codeRef.current;

    // Destroy the previous PixiJS Application (frees WebGL context + GPU memory)
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
      // Remove any leftover <canvas> the previous app appended
      while (host.firstChild) host.removeChild(host.firstChild);
    }

    const timestamp = new Date().toLocaleTimeString();

    // compile() is async — run it and update state when it resolves
    compile(source, host, isDark).then(({ logs, success, cleanup }) => {
      cleanupRef.current = cleanup;
      setLogs([
        { kind: "sys", text: `» compile ${timestamp}` },
        ...logs,
      ]);
      setCompileStatus(success ? "ok" : "error");
    });
  }, [hostRef, setLogs, setCompileStatus]);

  // Keyboard shortcut: Ctrl/Cmd + Enter
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

  // Re-render when theme changes (background colour switches)
  useEffect(() => {
    if (statusRef.current === "ok") runCompile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Initial compile on mount
  useEffect(() => {
    const id = setTimeout(runCompile, 300);
    return () => {
      clearTimeout(id);
      // Destroy PixiJS app on component unmount
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return runCompile;
}
