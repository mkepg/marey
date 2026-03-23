import { useEffect, useRef } from "preact/hooks";
import type { FunctionComponent } from "preact";
import type { editor as MonacoEditorNS } from "monaco-editor";

import { useAppStore }  from "../store";
import { useCompile }   from "../hooks/useCompile";
import { useSplitPane } from "../hooks/useSplitPane";
import { useAutoSave }  from "../hooks/useAutoSave";

import { TopBar }       from "./TopBar/TopBar";
import { MonacoEditor } from "./Editor/MonacoEditor";
import { Terminal }     from "./Terminal/Terminal";
import { Preview }      from "./Preview/Preview";
import { PaneLabel }    from "./Layout/PaneLabel";
import { Handle }       from "./Layout/Handle";
import { Toast }        from "./Toast/Toast";

import styles from "./App.module.scss";

export const App: FunctionComponent = () => {
  const theme        = useAppStore((s) => s.theme);
  
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
  }, [hRatio, vRatio]);

  const leftW     = hRatio === 0 ? "0px" : `${(hRatio * 100).toFixed(2)}%`;
  const rightW    = hRatio === 1 ? "0px" : `${((1 - hRatio) * 100).toFixed(2)}%`;
  const editorH   = vRatio === 0 ? "0px" : `${(vRatio * 100).toFixed(2)}%`;
  const terminalH = vRatio === 1 ? "0px" : `${((1 - vRatio) * 100).toFixed(2)}%`;

  const isDragging = isHDragging || isVDragging;

  return (
    <div className={styles.app} data-theme={theme}>
      <TopBar onRun={runCompile} />

      <div className={styles.split} ref={containerRef}>
        
        {/* Left Pane */}
        <div 
          className={styles.leftPane} 
          ref={leftPaneRef} 
          style={{ width: leftW, display: hRatio === 0 ? 'none' : 'flex' }}
        >
          
          {/* Editor */}
          <div
            className={styles.editorWrap}
            style={{ height: editorH, display: vRatio === 0 ? 'none' : 'block', pointerEvents: isDragging ? "none" : "auto" }}
          >
            <PaneLabel>code editor</PaneLabel>
            <div style={{ height: "calc(100% - 32px)" }}>
              <MonacoEditor onReady={(editor) => { editorRef.current = editor; }} />
            </div>
          </div>

          <Handle axis="vertical" onPointerDown={onVPointerDown} />

          {/* Terminal */}
          <div 
            className={styles.terminal} 
            style={{ height: terminalH, display: vRatio === 1 ? 'none' : 'flex' }}
          >
            <PaneLabel>output</PaneLabel>
            <Terminal />
          </div>
        </div>

        <Handle axis="horizontal" onPointerDown={onHPointerDown} />

        {/* Right Pane (Preview) */}
        <div
          className={styles.rightPane}
          style={{ width: rightW, display: hRatio === 1 ? 'none' : 'flex', pointerEvents: isDragging ? "none" : "auto" }}
        >
          <PaneLabel>scene preview</PaneLabel>
          <Preview hostRef={hostRef} />
        </div>

      </div>

      <Toast />
    </div>
  );
};