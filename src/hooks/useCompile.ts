import { useCallback, useEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";
import { compile } from "../compiler";
import { PlayheadMemory } from "../lib/playhead";
import { useAppStore } from "../store";

export function useCompile(hostRef: RefObject<HTMLDivElement>): () => void {
  const code             = useAppStore((s) => s.code);
  const theme            = useAppStore((s) => s.theme);
  const autoRun          = useAppStore((s) => s.autoRun);
  const setLogs          = useAppStore((s) => s.setLogs);
  const setErrors        = useAppStore((s) => s.setErrors);
  const setCompileStatus = useAppStore((s) => s.setCompileStatus);
  const setIsCompiling   = useAppStore((s) => s.setIsCompiling);
  const setSceneInfo      = useAppStore((s) => s.setSceneInfo);
  const setPlayback       = useAppStore((s) => s.setPlayback);
  const setPlaybackController = useAppStore((s) => s.setPlaybackController);
  const fileId            = useAppStore((s) => s.fileId);

  const codeRef   = useRef(code);
  const themeRef  = useRef(theme);

  codeRef.current   = code;
  themeRef.current  = theme;

  const fileIdRef = useRef(fileId);
  fileIdRef.current = fileId;

  // The playhead of the compile that is on screen, restored into the next
  // one, and the rule that only the latest compile may set it.
  const memoryRef = useRef<PlayheadMemory | null>(null);
  memoryRef.current ??= new PlayheadMemory(fileId);
  const memory = memoryRef.current;

  const cleanupRef = useRef<(() => void) | null>(null);
  // Whether any compile has run yet. Until one has, the scene must still be
  // populated even with auto-run off.
  const hasCompiledRef = useRef(false);

  const runCompile = useCallback((): void => {
    const host = hostRef.current;
    if (!host) return;

    const source = codeRef.current;
    hasCompiledRef.current = true;

    setIsCompiling(true);

    // Ensure we clean up the previous PIXI instance before starting a new one
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    // The previous controller stops feeding the remembered playhead in the same
    // place its scene is torn down (`begin` releases it).
    const { id: currentId, start } = memory.begin(fileIdRef.current);
    setPlaybackController(null);
    // The old scene is gone from the host now, so the frame and caption that
    // describe it go too. The new result sets them again.
    setSceneInfo(null);

    const timestamp = new Date().toLocaleTimeString();

    compile(source, host, () => themeRef.current === "dark", start).then(({ logs, errors, success, cleanup, playback, _irPayload }) => {
      // Only the latest compile job's result is applied; an older one that
      // arrives late is disposed of and never becomes the remembered playhead.
      if (!memory.adopt(currentId, playback, setPlayback)) {
        if (cleanup) cleanup();
        return;
      }

      cleanupRef.current = cleanup;
      setPlaybackController(playback);
      setLogs([
        { kind: "sys", text: `» compile ${timestamp}` },
        ...logs,
      ]);
      setErrors(errors);
      setCompileStatus(success ? "ok" : "error");
      setSceneInfo(
        success && _irPayload
          ? {
              width: _irPayload.width,
              height: _irPayload.height,
              duration: _irPayload.duration,
              fit: _irPayload.fit,
            }
          : null,
      );
      setIsCompiling(false);
    });
  }, [hostRef, memory, setLogs, setErrors, setCompileStatus, setIsCompiling, setSceneInfo, setPlayback, setPlaybackController]);

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
    const isFirst = !hasCompiledRef.current;

    // Logic: Trigger until the first compile has run (to populate the scene)
    // OR if autoRun is enabled for subsequent code changes.
    if (!autoRun && !isFirst) return;

    // Use a snappier 300ms delay for the initial boot,
    // and a standard 800ms debounce for typing changes.
    const delay = isFirst ? 300 : 800;

    setIsCompiling(true);
    const id = setTimeout(runCompile, delay);

    return () => clearTimeout(id);
  }, [code, autoRun, runCompile, setIsCompiling]);

  // Tear the scene down when the hook unmounts, and only then: this effect's
  // dependencies never change, so a code or auto-run change cannot reach it.
  useEffect(() => () => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    memory.release();
    setPlaybackController(null);
  }, [memory, setPlaybackController]);

  return runCompile;
}