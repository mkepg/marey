import { useEffect, useRef } from "preact/hooks";
import type { FunctionComponent } from "preact";
import type { editor as MonacoEditorNS } from "monaco-editor";

import { useMonaco } from "../../hooks/useMonaco";
import { useAppStore } from "../../store";
import { lint } from "../../compiler";

function defineThemes(monaco: typeof import("monaco-editor")): void {
  monaco.editor.defineTheme("Declare-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment",     foreground: "3a3a55", fontStyle: "italic" },
      { token: "keyword",     foreground: "c792ea", fontStyle: "bold" },
      { token: "keyword.def", foreground: "ff79c6", fontStyle: "bold" },
      { token: "color",       foreground: "f78c6c" },
      { token: "string",      foreground: "c3e88d" },
      { token: "number",      foreground: "f07178" },
      { token: "operator",    foreground: "89ddff" },
      { token: "identifier",  foreground: "82aaff" },
      { token: "delimiter",   foreground: "89ddff" },
    ],
    colors: {
      "editor.background":                  "#0c0c0e",
      "editor.foreground":                  "#c5c5d6",
      "editor.lineHighlightBackground":     "#13131a",
      "editorCursor.foreground":            "#7c6af7",
      "editor.selectionBackground":         "#2d2858",
      "editorLineNumber.foreground":        "#2e2e44",
      "editorLineNumber.activeForeground":  "#5a5a78",
      "editorIndentGuide.background":       "#1a1a28",
      "editorIndentGuide.activeBackground": "#2d2858",
      "scrollbarSlider.background":         "#1e1e2880",
    },
  });

  monaco.editor.defineTheme("Declare-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment",     foreground: "9090a8", fontStyle: "italic" },
      { token: "keyword",     foreground: "7c3aed", fontStyle: "bold" },
      { token: "keyword.def", foreground: "d5358f", fontStyle: "bold" },
      { token: "color",       foreground: "c2410c" },
      { token: "string",      foreground: "166534" },
      { token: "number",      foreground: "be185d" },
      { token: "operator",    foreground: "374151" },
      { token: "identifier",  foreground: "1e40af" },
      { token: "delimiter",   foreground: "374151" },
    ],
    colors: {
      "editor.background":                 "#ffffff",
      "editor.foreground":                 "#111118",
      "editor.lineHighlightBackground":    "#f5f5fa",
      "editorCursor.foreground":           "#6355e8",
      "editor.selectionBackground":        "#ede9fd",
      "editorLineNumber.foreground":       "#c8c8d8",
      "editorLineNumber.activeForeground": "#888898",
    },
  });
}

function registerLanguage(monaco: typeof import("monaco-editor")): void {
  if (monaco.languages.getLanguages().some((l) => l.id === "Declare")) return;

  monaco.languages.register({ id: "Declare" });

  monaco.languages.setMonarchTokensProvider("Declare", {
    // NEW: Added generate, from, and to
    keywords:    ["scene", "circle", "rectangle", "polygon", "text", "group", "generate", "from", "to"],
    defKeyword:  ["def"],
    namedColors: ["red", "green", "blue", "white", "black", "yellow", "cyan", "magenta", "orange"],
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/#[0-9a-fA-F]{3,6}/, "color"],
        [/"[^"]*"/, "string"],
        [/\d+\.?\d*/, "number"],
        [/[+\-*/=]/, "operator"],
        [/[{}()[\],:]/, "delimiter"],
        [
          /[a-zA-Z_][a-zA-Z0-9_]*/,
          {
            cases: {
              "@defKeyword":  "keyword.def",
              "@keywords":    "keyword",
              "@namedColors": "color",
              "@default":     "identifier",
            },
          },
        ],
      ],
    },
  });
}

interface MonacoEditorProps {
  onReady: (editor: MonacoEditorNS.IStandaloneCodeEditor) => void;
}

const EDITOR_OPTIONS: MonacoEditorNS.IStandaloneEditorConstructionOptions = {
  language: "Declare",
  fontFamily: "'JetBrains Mono', monospace",
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
};

export const MonacoEditor: FunctionComponent<MonacoEditorProps> = ({ onReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef    = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const monaco       = useMonaco();

  const code    = useAppStore((s) => s.code);
  const theme   = useAppStore((s) => s.theme);
  const setCode = useAppStore((s) => s.setCode);

  const codeRef  = useRef(code);
  const themeRef = useRef(theme);
  codeRef.current  = code;
  themeRef.current = theme;

  useEffect(() => {
    if (!monaco || !containerRef.current || editorRef.current) return;

    let isCancelled = false;

    const initEditor = async () => {
      await document.fonts.ready;
      if (isCancelled || !containerRef.current) return;

      registerLanguage(monaco);
      defineThemes(monaco);

      const editor = monaco.editor.create(containerRef.current, {
        ...EDITOR_OPTIONS,
        value: codeRef.current,
        theme: themeRef.current === "dark" ? "Declare-dark" : "Declare-light",
      });

      editor.onDidChangeModelContent(() => {
        setCode(editor.getValue());
      });

      editorRef.current = editor;
      onReady(editor);
    };

    initEditor();

    return () => {
      isCancelled = true;
    };
  }, [monaco]);

  useEffect(() => {
    if (!editorRef.current || !window.monaco) return;
    window.monaco.editor.setTheme(theme === "dark" ? "Declare-dark" : "Declare-light");
  }, [theme]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.getValue() !== code) {
      editorRef.current.setValue(code);
    }
  }, [code]);

  useEffect(() => {
    if (!monaco || !editorRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const timer = setTimeout(() => {
      const liveErrors = lint(code);

      const markers: MonacoEditorNS.IMarkerData[] = liveErrors.map((err) => ({
        severity: monaco.MarkerSeverity.Error,
        message: `[${err.phase}] ${err.message}`,
        startLineNumber: err.line ?? 1,
        startColumn: err.col ?? 1,
        endLineNumber: err.line ?? 1,
        endColumn: err.col ? err.col + 1 : 100,
      }));

      monaco.editor.setModelMarkers(model, "declare-compiler", markers);
    }, 400);

    return () => clearTimeout(timer);
  }, [code, monaco]);

  useEffect(() => {
    return () => {
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
};