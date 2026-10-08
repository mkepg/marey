import { useCallback, useEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";
import { compile } from "../compiler";
import type { PlaybackStart } from "../compiler/renderer/playback";
import { nextStart } from "../lib/playhead";
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

  // The playhead of the compile that is on screen, restored into the next one.
  const rememberedRef = useRef<PlaybackStart | null>(null);
  const lastFileIdRef = useRef(fileId);
  const unsubscribeRef = useRef<(() => void) | null>(null);

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
    // The previous controller stops feeding the remembered playhead in the same
    // place its scene is torn down.
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setPlaybackController(null);
    // The old scene is gone from the host now, so the frame and caption that
    // describe it go too. The new result sets them again.
    setSceneInfo(null);

    compileIdRef.current += 1;
    const currentId = compileIdRef.current;
    const timestamp = new Date().toLocaleTimeString();

    const fileChanged = fileIdRef.current !== lastFileIdRef.current;
    lastFileIdRef.current = fileIdRef.current;
    if (fileChanged) rememberedRef.current = null;
    const start = nextStart(rememberedRef.current, fileChanged);

    compile(source, host, () => themeRef.current === "dark", start).then(({ logs, errors, success, cleanup, playback, _irPayload }) => {
      // Race condition check: Only apply results if this is still the latest compile job
      if (currentId !== compileIdRef.current) {
        if (cleanup) cleanup();
        return;
      }

      cleanupRef.current = cleanup;
      // Only a result that passed the race check is the displayed compile, so
      // only its controller may become the remembered playhead.
      setPlaybackController(playback);
      if (playback) {
        const seed = playback.getState();
        rememberedRef.current = { tick: seed.tick, playing: seed.playing };
        setPlayback(seed);
        unsubscribeRef.current = playback.subscribe((st) => {
          rememberedRef.current = { tick: st.tick, playing: st.playing };
          setPlayback(st);
        });
      } else {
        setPlayback(null);
      }
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
  }, [hostRef, setLogs, setErrors, setCompileStatus, setIsCompiling, setSceneInfo, setPlayback, setPlaybackController]);

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
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        setPlaybackController(null);
      }
    };
  }, [code, autoRun, runCompile, setIsCompiling]);

  return runCompile;
}