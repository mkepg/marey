import { useEffect, useRef } from "preact/hooks";
import type { FunctionComponent } from "preact";
import type { editor as MonacoEditorNS } from "monaco-editor";
import { useAppStore }  from "../store";
import { useCompile }   from "../hooks/useCompile";
import { useSplitPane } from "../hooks/useSplitPane";
import { TopBar }       from "./TopBar/TopBar";
import { MonacoEditor } from "./Editor/MonacoEditor";
import { Terminal }     from "./Terminal/Terminal";
import { Preview }      from "./Preview/Preview";
import { PaneLabel }    from "./Layout/PaneLabel";
import { Handle }       from "./Layout/Handle";
import styles from "./App.module.scss";

export const App: FunctionComponent = () => {
  const theme        = useAppStore((s) => s.theme);
  const hostRef      = useRef<HTMLDivElement>(null);
  const editorRef    = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const runCompile = useCompile(hostRef);
  
  // FIX: Destructure new pointer method
  const { ratio: hRatio, onHandlePointerDown: onHPointerDown } = useSplitPane({
    axis: "horizontal",
    initial: 0.52,
    min: 0.2,
    max: 0.8,
    containerRef,
  });
  
  const leftPaneRef = useRef<HTMLDivElement>(null);
  
  const { ratio: vRatio, onHandlePointerDown: onVPointerDown } = useSplitPane({
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
  
  const leftW     = `${(hRatio * 100).toFixed(2)}%`;
  const rightW    = `${((1 - hRatio) * 100).toFixed(2)}%`;
  const editorH   = `${(vRatio * 100).toFixed(2)}%`;
  const terminalH = `${((1 - vRatio) * 100).toFixed(2)}%`;
  
  return (
    <div className={styles.app} data-theme={theme}>
      <TopBar onRun={runCompile} />
      <div className={styles.split} ref={containerRef}>
        <div className={styles.leftPane} ref={leftPaneRef} style={{ width: leftW }}>
          <div className={styles.editorWrap} style={{ height: editorH }}>
            <PaneLabel>code editor</PaneLabel>
            <div style={{ height: "calc(100% - 32px)" }}>
              <MonacoEditor onReady={(editor) => { editorRef.current = editor; }} />
            </div>
          </div>
          {/* FIX: Map down the pointer method */}
          <Handle axis="vertical" onPointerDown={onVPointerDown} />
          <div className={styles.terminal} style={{ height: terminalH }}>
            <PaneLabel>output</PaneLabel>
            <Terminal />
          </div>
        </div>
        {/* FIX: Map down the pointer method */}
        <Handle axis="horizontal" onPointerDown={onHPointerDown} />
        <div className={styles.rightPane} style={{ width: rightW }}>
          <PaneLabel>scene preview</PaneLabel>
          <Preview hostRef={hostRef} />
        </div>
      </div>
    </div>
  );
};