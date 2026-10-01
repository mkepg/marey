// Monaco takes literal hex strings, so this file is the one place outside
// global.scss that holds colour. Every value here is drawn from the same two
// palettes as the --bg-editor, --text-* and --accent tokens: keep them in step.
export function defineThemes(monaco: typeof import("monaco-editor")): void {
  // Quiet mat: editor #16171a, gutter on the same ground.
  monaco.editor.defineTheme("Marey-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment",     foreground: "5d626d", fontStyle: "italic" },
      { token: "keyword",     foreground: "a99bff", fontStyle: "bold" },
      { token: "keyword.let", foreground: "d0a8ff", fontStyle: "bold" },
      { token: "color",       foreground: "f0a27a" },
      { token: "string",      foreground: "8fd9a0" },
      { token: "number",      foreground: "f28b82" },
      { token: "operator",    foreground: "9aa0ab" },
      { token: "identifier",  foreground: "8ab4f8" },
      { token: "delimiter",   foreground: "9aa0ab" },
      { token: "value",       foreground: "f0a27a" },
    ],
    colors: {
      "editor.background":                  "#16171a",
      "editor.foreground":                  "#d9dbe1",
      "editorGutter.background":            "#16171a",
      "editor.lineHighlightBackground":     "#1b1c20",
      "editor.lineHighlightBorder":         "#1b1c20",
      "editorCursor.foreground":            "#a99bff",
      "editor.selectionBackground":         "#6b58f055",
      "editor.inactiveSelectionBackground": "#6b58f02e",
      "editorLineNumber.foreground":        "#5d626d",
      "editorLineNumber.activeForeground":  "#d9dbe1",
      "editorIndentGuide.background1":      "#26282e",
      "editorIndentGuide.activeBackground1": "#3a3d46",
      "scrollbarSlider.background":         "#26282e99",
      "scrollbarSlider.hoverBackground":    "#2f3138cc",
    },
  });

  // Graph paper: editor #fbfcfa, ink text.
  monaco.editor.defineTheme("Marey-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment",     foreground: "8a93a6", fontStyle: "italic" },
      { token: "keyword",     foreground: "2b4fa8", fontStyle: "bold" },
      { token: "keyword.let", foreground: "7a3a9a", fontStyle: "bold" },
      { token: "color",       foreground: "a14a12" },
      { token: "string",      foreground: "2f7a4a" },
      { token: "number",      foreground: "a8325e" },
      { token: "operator",    foreground: "5a6478" },
      { token: "identifier",  foreground: "1d2a44" },
      { token: "delimiter",   foreground: "5a6478" },
      { token: "value",       foreground: "a14a12" },
    ],
    colors: {
      "editor.background":                  "#fbfcfa",
      "editor.foreground":                  "#1d2a44",
      "editorGutter.background":            "#fbfcfa",
      "editor.lineHighlightBackground":     "#eef2f5",
      "editor.lineHighlightBorder":         "#eef2f5",
      "editorCursor.foreground":            "#1d2a44",
      "editor.selectionBackground":         "#1d2a4426",
      "editor.inactiveSelectionBackground": "#1d2a4414",
      "editorLineNumber.foreground":        "#8a93a6",
      "editorLineNumber.activeForeground":  "#1d2a44",
      "editorIndentGuide.background1":      "#e6ebf1",
      "editorIndentGuide.activeBackground1": "#cdd8e4",
      "scrollbarSlider.background":         "#cdd8e499",
      "scrollbarSlider.hoverBackground":    "#b8c6d6cc",
    },
  });
}
