import { useEffect, useRef, useState } from "preact/hooks";
import type { FunctionComponent } from "preact";
import type { editor as MonacoEditorNS } from "monaco-editor";
import { useAppStore }  from "../store";
import { useCompile }   from "../hooks/useCompile";
import { useSplitPane } from "../hooks/useSplitPane";
import { useAutoSave }  from "../hooks/useAutoSave";
import { useIsNarrow }  from "../hooks/useIsNarrow";
import { TopBar }       from "./TopBar/TopBar";
import { MonacoEditor } from "./Editor/MonacoEditor";
import { Terminal }     from "./Terminal/Terminal";
import { Preview }      from "./Preview/Preview";
import { Handle }       from "./Layout/Handle";
import { phonePreviewHeight, type SceneSize } from "./Layout/phoneLayout";
import { Toast }        from "./Toast/Toast";
import styles from "./App.module.scss";

export const App: FunctionComponent = () => {
  const theme        = useAppStore((s) => s.theme);
  const sceneInfo    = useAppStore((s) => s.sceneInfo);
  const narrow       = useIsNarrow();
  const hostRef      = useRef<HTMLDivElement>(null);
  const editorRef    = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const runCompile = useCompile(hostRef);
  useAutoSave();

  const {
    ratio: hRatio,
    isDragging: isHDragging,
    onHandlePointerDown: onHPointerDown,
  } = useSplitPane({
    axis: "horizontal",
    initial: 0.52,
    min: 0.2,
    max: 0.8,
    containerRef,
  });

  const leftPaneRef = useRef<HTMLDivElement>(null);

  const {
    ratio: vRatio,
    isDragging: isVDragging,
    onHandlePointerDown: onVPointerDown,
  } = useSplitPane({
    axis: "vertical",
    initial: 0.75,
    min: 0.3,
    max: 0.88,
    containerRef: leftPaneRef,
  });

  useEffect(() => {
    const id = setTimeout(() => editorRef.current?.layout(), 0);
    return () => clearTimeout(id);
  }, [hRatio, vRatio, narrow]);

  // The phone preview's height depends on the pane's width, the viewport's
  // height and the scene's aspect ratio.
  const [paneWidth, setPaneWidth] = useState(() => window.innerWidth);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    if (!narrow) return;
    const container = containerRef.current;
    if (!container) return;
    const measure = (): void => {
      setPaneWidth(container.clientWidth);
      setViewportHeight(window.innerHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [narrow]);

  // A recompile clears `sceneInfo` for a moment. Sizing from the last scene
  // that compiled keeps the editor below from jumping on every keystroke.
  const lastScene = useRef<SceneSize | null>(null);
  if (sceneInfo) lastScene.current = { width: sceneInfo.width, height: sceneInfo.height };
  const previewHeight = phonePreviewHeight(paneWidth, viewportHeight, lastScene.current);

  // DRAG LAG FIX: Dynamically link width/height definitions directly to the CSS variables
  const leftW     = hRatio === 0 ? "0px" : `calc(var(--split-h, ${hRatio}) * 100%)`;
  const rightW    = hRatio === 1 ? "0px" : `calc((1 - var(--split-h, ${hRatio})) * 100%)`;
  const editorH   = vRatio === 0 ? "0px" : `calc(var(--split-v, ${vRatio}) * 100%)`;
  const terminalH = vRatio === 1 ? "0px" : `calc((1 - var(--split-v, ${vRatio})) * 100%)`;

  const isDragging = isHDragging || isVDragging;

  // On phones the panes stack as preview, editor, log, with no handles
  // (spec 6B §4). The element tree stays the same in both layouts, so the
  // renderer's host and the editor are never remounted when it switches.
  return (
    <div
      className={`${styles.app}${narrow ? ` ${styles.phone}` : ""}`}
      data-theme={theme}
      style={narrow ? ({ "--preview-h": `${previewHeight}px` } as any) : undefined}
    >
      <TopBar onRun={runCompile} />
      <div
        className={styles.split}
        ref={containerRef}
        style={narrow ? undefined : ({ "--split-h": hRatio } as any)}
      >
        <div
          className={styles.leftPane}
          ref={leftPaneRef}
          style={narrow ? undefined : ({ width: leftW, display: hRatio === 0 ? "none" : "flex", "--split-v": vRatio } as any)}
        >
          <div
            className={styles.editorWrap}
            style={narrow ? undefined : { height: editorH, display: vRatio === 0 ? "none" : "block", pointerEvents: isDragging ? "none" : "auto" }}
          >
            <MonacoEditor onReady={(editor) => { editorRef.current = editor; }} />
          </div>
          {!narrow && <Handle axis="vertical" onPointerDown={onVPointerDown} />}
          <div
            className={styles.terminal}
            style={narrow ? undefined : { height: terminalH, display: vRatio === 1 ? "none" : "flex" }}
          >
            <Terminal />
          </div>
        </div>
        {!narrow && <Handle axis="horizontal" onPointerDown={onHPointerDown} />}
        <div
          className={styles.rightPane}
          style={narrow ? undefined : { width: rightW, display: hRatio === 1 ? "none" : "flex", pointerEvents: isDragging ? "none" : "auto" }}
        >
          <Preview hostRef={hostRef} />
        </div>
      </div>
      <Toast />
    </div>
  );
};
