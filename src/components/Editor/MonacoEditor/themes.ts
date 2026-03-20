export function defineThemes(monaco: typeof import("monaco-editor")): void {
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