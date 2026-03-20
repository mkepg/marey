import { useEffect, useRef } from "preact/hooks";
import type { FunctionComponent } from "preact";
import type { editor as MonacoEditorNS, languages as MonacoLanguagesNS } from "monaco-editor";
import { useMonaco } from "../../hooks/useMonaco";
import { useAppStore } from "../../store";
import { lint } from "../../compiler";
import { REQUIRED_PROPS, PROP_TYPES, KIND_LABEL } from "../../compiler/typeChecker/validator";

// --- Hover Documentation Dictionaries ---
const KEYWORD_DOCS: Record<string, string> = {
  generate: `### \`generate\`\nCreates a loop to generate multiple objects or groups. The loop variable can be used in math expressions inside the block to position or scale objects dynamically.\n\n**Example:**\n\`\`\`declare\ngenerate i from 1 to 5 {\n  circle dot {\n    position: (i * 50, 100)\n    radius: 10\n  }\n}\n\`\`\``,
  def: `### \`def\`\nDeclares a constant variable. Variables in Declare are strictly block-scoped and immutable.\n\n**Example:**\n\`\`\`declare\ndef spacing = 50\n\`\`\``,
  scene: `### \`scene\`\nThe root block of a Declare program. Contains all objects and global scene properties.\n\n**Required Property:** \`size\``
};

const PROPERTY_DOCS: Record<string, string> = {
  position: `### \`position\`\nSets the \`(x, y)\` coordinates of the object in the scene.\n\n**Accepts:** \`point\`\n**Example:** \`position: (100, 200)\``,
  radius: `### \`radius\`\nSets the radius of a circle.\n\n**Accepts:** \`number\` (greater than 0)\n**Example:** \`radius: 50\``,
  size: `### \`size\`\nSets the width and height of a rectangle or the scene.\n\n**Accepts:** \`point\` (width, height)\n**Example:** \`size: (600, 400)\``,
  points: `### \`points\`\nDefines the vertices of a polygon. Must contain at least 3 points.\n\n**Accepts:** \`pointList\`\n**Example:** \`points: [(0,0), (100,0), (50,100)]\``,
  content: `### \`content\`\nThe text string to display.\n\n**Accepts:** \`string\`\n**Example:** \`content: "Hello World"\``,
  fontSize: `### \`fontSize\`\nThe size of the text font.\n\n**Accepts:** \`number\`\n**Example:** \`fontSize: 24\``,
  color: `### \`color\`\nThe fill color. Can be a named color or a hex code.\n\n**Accepts:** \`color\`\n**Example:** \`color: red\` or \`color: #ff0000\``,
  alpha: `### \`alpha\`\nTransparency level from \`0.0\` (invisible) to \`1.0\` (fully opaque).\n\n**Accepts:** \`number\`\n**Example:** \`alpha: 0.5\``,
  rotation: `### \`rotation\`\nRotation angle in degrees.\n\n**Accepts:** \`number\`\n**Example:** \`rotation: 45\``,
  scale: `### \`scale\`\nScales the object. Can be a uniform number or a point for independent X/Y scaling.\n\n**Accepts:** \`number\` or \`point\`\n**Example:** \`scale: 1.5\` or \`scale: (2, 0.5)\``,
  anchor: `### \`anchor\`\nThe origin point for rotation and positioning, mapped from \`0.0\` to \`1.0\`. \`(0.5, 0.5)\` is the exact geometric center.\n\n**Accepts:** \`point\`\n**Example:** \`anchor: (0.5, 0.5)\``,
  z: `### \`z\`\nZ-index for rendering order. Objects with higher \`z\` values are drawn on top.\n\n**Accepts:** \`number\`\n**Example:** \`z: 10\``,
  background: `### \`background\`\nThe background color of the scene.\n\n**Accepts:** \`color\`\n**Example:** \`background: #222222\``,
  sceneFit: `### \`sceneFit\`\nHow the scene scales to the preview window.\n\n**Accepts:** \`contain\`, \`cover\`, \`fill\`, or \`none\`\n**Example:** \`sceneFit: contain\``,
};

const namedColors = ["red", "green", "blue", "white", "black", "yellow", "cyan", "magenta", "orange"];

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
    keywords:    ["scene", "circle", "rectangle", "polygon", "text", "group", "generate", "from", "to"],
    defKeyword:  ["def"],
    namedColors,
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

  // LEVEL 3: Hover Documentation Provider
  monaco.languages.registerHoverProvider("Declare", {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const token = word.word;

      let md = "";

      if (token in KEYWORD_DOCS) {
        md = KEYWORD_DOCS[token];
      }
      else if (token in PROP_TYPES) {
        const req = REQUIRED_PROPS[token as keyof typeof REQUIRED_PROPS] || [];
        const props = PROP_TYPES[token as keyof typeof PROP_TYPES];
        
        md = `### \`${token}\` object\n---\n`;
        if (req.length > 0) {
          md += `**Required Properties:**\n- \`${req.join("`\n- `")}\`\n\n`;
        }
        const optional = Object.keys(props).filter(p => !req.includes(p));
        if (optional.length > 0) {
          md += `**Optional Properties:**\n- \`${optional.join("`\n- `")}\`\n`;
        }
      }
      else if (token in PROPERTY_DOCS) {
        md = PROPERTY_DOCS[token];
      }

      if (md) {
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [{ value: md }]
        };
      }
      return null;
    }
  });

  // LEVEL 1, 2, & 4: Type-Aware Contextual Autocomplete
  monaco.languages.registerCompletionItemProvider("Declare", {
    triggerCharacters: [':'],
    provideCompletionItems: (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });
      
      const lineUntilCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });

      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const suggestions: MonacoLanguagesNS.CompletionItem[] = [];

      // --- 1. Fast Synchronous Type Inference ---
      const fullText = model.getValue();
      const inferredVariables: Record<string, string> = {};

      // 1a. Infer `def` variables
      const defRegex = /def\s+([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(.*?)(?=\n|$)/g;
      let match;
      while ((match = defRegex.exec(fullText)) !== null) {
        const name = match[1];
        const val = match[2].trim();
        let type = "number"; // Defaults to number for math expressions
        
        if (val.startsWith('"')) type = "string";
        else if (val.startsWith('#') || namedColors.includes(val)) type = "color";
        else if (val.startsWith('[')) type = "pointList";
        else if (/^\(.*\)$/.test(val) && val.includes(',')) type = "point";
        else if (["contain", "cover", "fill", "none"].includes(val)) type = "sceneFit";
        
        inferredVariables[name] = type;
      }

      // 1b. Infer `generate` loop variables (they are always numbers)
      const genRegex = /generate\s+([a-zA-Z][a-zA-Z0-9_]*)\s+from/g;
      while ((match = genRegex.exec(fullText)) !== null) {
        inferredVariables[match[1]] = "number";
      }

      // --- 2. Determine Block Context ---
      const lastBraceIndex = textUntilPosition.lastIndexOf('{');
      const lastCloseBraceIndex = textUntilPosition.lastIndexOf('}');
      let currentBlock: string | null = null;

      if (lastBraceIndex > lastCloseBraceIndex) {
        const textBeforeBrace = textUntilPosition.substring(0, lastBraceIndex).trim();
        const tokens = textBeforeBrace.split(/[\s\n\r]+/);
        for (let i = tokens.length - 1; i >= 0; i--) {
          const t = tokens[i];
          if (t in PROP_TYPES) {
            currentBlock = t;
            break;
          }
        }
      }

      // --- 3. Determine Line Context (Property Name vs Property Value) ---
      const isTypingValueMatch = lineUntilCursor.match(/([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(.*)$/);

      if (currentBlock && isTypingValueMatch) {
        // STATE A: Typing a Property Value (e.g., `radius: |`)
        const propName = isTypingValueMatch[1];
        const propsDef = PROP_TYPES[currentBlock as keyof typeof PROP_TYPES];
        
        if (propsDef && propName in propsDef) {
          const expectedTypeDef = propsDef[propName as keyof typeof propsDef];
          const expectedTypes = Array.isArray(expectedTypeDef) ? expectedTypeDef : [expectedTypeDef];

          // If it expects a color, suggest the built-in color palette
          if (expectedTypes.includes("color")) {
            for (const color of namedColors) {
              suggestions.push({
                label: color,
                kind: monaco.languages.CompletionItemKind.Color,
                insertText: color,
                detail: "Built-in named color",
                range
              });
            }
          }

          // ONLY suggest variables whose inferred type matches the property's expected type
          for (const [sym, symType] of Object.entries(inferredVariables)) {
            if (expectedTypes.includes(symType) && sym !== word.word) {
              suggestions.push({
                label: sym,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: sym,
                detail: `Variable (${symType})`,
                range
              });
            }
          }
        }
      } 
      else if (currentBlock) {
        // STATE B: Typing a Property Name inside a block (e.g., `circle { | }`)
        const propsDef = PROP_TYPES[currentBlock as keyof typeof PROP_TYPES];
        if (propsDef) {
          for (const [prop, type] of Object.entries(propsDef)) {
            const typeArray = Array.isArray(type) ? type : [type];
            const displayTypes = typeArray.map(t => KIND_LABEL[t as keyof typeof KIND_LABEL] || t).join(" or ");
            
            suggestions.push({
              label: prop,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: `${prop}: `, // Automatically inserts the colon
              detail: `Property (${displayTypes})`,
              range
            });
          }
        }
      } 
      else {
        // STATE C: Typing at the Top Level (outside of blocks)
        const objects = ["circle", "rectangle", "polygon", "text", "group"];
        for (const obj of objects) {
          suggestions.push({
            label: obj,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: `${obj} \${1:name} {\n\t$0\n}`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: `Create new ${obj} object`,
            range
          });
        }

        suggestions.push({
          label: "scene",
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: `scene {\n\t$0\n}`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Main scene block",
          range
        });

        suggestions.push({
          label: "def",
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: `def \${1:varName} = \${2:value}`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Declare a constant variable",
          range
        });

        suggestions.push({
          label: "generate",
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: `generate \${1:i} from \${2:1} to \${3:5} {\n\t$0\n}`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Generate objects in a loop",
          range
        });
      }

      return { suggestions };
    }
  });
}

// ... (EDITOR_OPTIONS and MonacoEditor component remain exactly the same as previous) ...

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
};

export const MonacoEditor: FunctionComponent<MonacoEditorProps> = ({ onReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef    = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<MonacoEditorNS.IEditorDecorationsCollection | null>(null);

  const monaco  = useMonaco();
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
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 2000))
      ]);

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

  useEffect(() => {
    if (!monaco || !editorRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const timer = setTimeout(async () => {
      const result = await lint(code);
      const liveErrors = Array.isArray(result) ? result : [];

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
  }, [code, monaco]);

  useEffect(() => {
    return () => {
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
};