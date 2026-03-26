import { useEffect, useRef, useState } from "preact/hooks";
import type { FunctionComponent } from "preact";
import type { editor as MonacoEditorNS } from "monaco-editor";

import { useMonaco } from "../../../hooks/useMonaco";
import { useAppStore } from "../../../store";
import { lint } from "../../../compiler";
import { defineThemes } from "./themes";
import { registerLanguage } from "./language";

interface MonacoEditorProps {
  onReady: (editor: MonacoEditorNS.IStandaloneCodeEditor) => void;
}

const EDITOR_OPTIONS: MonacoEditorNS.IStandaloneEditorConstructionOptions = {
  language: "Declare",
  fontFamily: "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
  fontSize: 13,
  lineHeight: 22,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderLineHighlight: "line",
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on",
  smoothScrolling: true,
  padding: { top: 14, bottom: 14 },
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  guides: { indentation: true },
  scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
  folding: false,
  lineNumbersMinChars: 3,
  automaticLayout: true,
  fixedOverflowWidgets: true,
};

export const MonacoEditor: FunctionComponent<MonacoEditorProps> = ({ onReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef    = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<MonacoEditorNS.IEditorDecorationsCollection | null>(null);
  const [isReady, setIsReady] = useState(false);

  const monaco  = useMonaco();
  const code    = useAppStore((s) => s.code);
  const theme   = useAppStore((s) => s.theme);
  const fileId  = useAppStore((s) => s.fileId); // FIX 3: Pull down tracked fileId
  const setCode = useAppStore((s) => s.setCode);

  const codeRef  = useRef(code);
  const themeRef = useRef(theme);
  const prevFileId = useRef(fileId);

  codeRef.current  = code;
  themeRef.current = theme;

  useEffect(() => {
    if (!monaco || !containerRef.current || editorRef.current) return;

    let isCancelled = false;
    const initEditor = async () => {
      try {
        await document.fonts.load("13px 'JetBrains Mono'");
      } catch {
      }

      if (isCancelled || !containerRef.current) return;

      registerLanguage(monaco);
      defineThemes(monaco);

      const editor = monaco.editor.create(containerRef.current, {
        ...EDITOR_OPTIONS,
        value: codeRef.current,
        theme: themeRef.current === "dark" ? "Declare-dark" : "Declare-light",
      });

      decorationsRef.current = editor.createDecorationsCollection([]);

      editor.onDidChangeModelContent(() => {
        setCode(editor.getValue());
      });

      editorRef.current = editor;
      setIsReady(true);
      onReady(editor);
    };

    initEditor();

    return () => {
      isCancelled = true;
    };
  }, [monaco]);

  useEffect(() => {
    if (!editorRef.current || !monaco) return;
    monaco.editor.setTheme(theme === "dark" ? "Declare-dark" : "Declare-light");
  }, [theme, monaco]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.getValue() !== code) {
      editorRef.current.setValue(code);
    }
  }, [code]);

  // FIX 3: Flushes undo/redo stack explicitly if the file ID changes (clicking "New File")
  useEffect(() => {
    if (!editorRef.current || !monaco) return;
    if (prevFileId.current !== fileId) {
      prevFileId.current = fileId;
      const oldModel = editorRef.current.getModel();
      const newModel = monaco.editor.createModel(codeRef.current, "Declare");
      editorRef.current.setModel(newModel);
      if (oldModel) {
        oldModel.dispose();
      }
    }
  }, [fileId, monaco]);

  useEffect(() => {
    if (!monaco || !editorRef.current || !isReady) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const timer = setTimeout(async () => {
      const result = await lint(code);
      const liveErrors = result && result.errors ? result.errors : [];

      const markers: MonacoEditorNS.IMarkerData[] = liveErrors.map((err) => ({
        severity: monaco.MarkerSeverity.Error,
        message: `[${err.phase}] ${err.message}`,
        startLineNumber: err.line ?? 1,
        startColumn: err.col ?? 1,
        endLineNumber: err.endLine ?? err.line ?? 1,
        endColumn: err.endCol ?? (err.col ? err.col + 1 : 100),
      }));

      monaco.editor.setModelMarkers(model, "declare-compiler", markers);

      if (decorationsRef.current) {
        const decorations: MonacoEditorNS.IModelDeltaDecoration[] = liveErrors.map((err) => ({
          range: new monaco.Range(err.line ?? 1, 1, err.endLine ?? err.line ?? 1, 1),
          options: {
            isWholeLine: true,
            className: "declare-error-line",
            linesDecorationsClassName: "declare-error-gutter",
          },
        }));
        decorationsRef.current.set(decorations);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [code, monaco, isReady]);

  useEffect(() => {
    return () => {
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
};