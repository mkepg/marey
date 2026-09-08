import type { languages as MonacoLanguagesNS } from "monaco-editor";
import {
  ANIMATABLE_PROPERTIES,
  BOOLEAN_VALUES,
  DURATION_VALUES,
  EASING_VALUES,
  FIT_VALUES,
  KIND_LABEL,
  LANGUAGE_CONTRACT,
  NAMED_COLORS,
  PROP_TYPES,
  REQUIRED_PROPS,
} from "../../../compiler/languageContract";
import { KEYWORD_DOCS, physicsSnippet, propertyHoverMarkdown, VALUE_DOCS } from "./constants";
import { analyzeContext } from "./scanner";

const namedColors = Object.keys(NAMED_COLORS);

const propertyPlaceholder = (
  blockName: keyof typeof LANGUAGE_CONTRACT,
  property: string,
): string => LANGUAGE_CONTRACT[blockName].properties[property]?.placeholder ?? "value";

const animationSnippet = (): string => `animate {\n\tproperty: \${1:${propertyPlaceholder("animate", "property")}}\n\tto: \${2:${propertyPlaceholder("animate", "to")}}\n\tduration: \${3:${propertyPlaceholder("animate", "duration")}}\n\t$0\n}`;

export const sequenceSnippet = (): string => `sequence {\n\t\${1:animate {\n\t\tproperty: ${propertyPlaceholder("animate", "property")}\n\t\tto: ${propertyPlaceholder("animate", "to")}\n\t\tduration: \${2:${propertyPlaceholder("animate", "duration")}}\n\t\teasing: ${propertyPlaceholder("animate", "easing")}\n\t}}\n}`;

export function registerLanguage(monaco: typeof import("monaco-editor")): void {
  if (monaco.languages.getLanguages().some((l) => l.id === "Marey")) return;

  monaco.languages.register({ id: "Marey" });

  monaco.languages.setMonarchTokensProvider("Marey", {
    keywords:    ["scene", "circle", "rectangle", "polygon", "line", "text", "group", "generate", "template", "use", "animate", "physics", "sequence", "parallel"],
    letKeyword:  ["let"],
    booleanValues: [...BOOLEAN_VALUES],
    easingValues:  [...EASING_VALUES],
    durationKeywords: [...DURATION_VALUES],
    fitValues: [...FIT_VALUES],
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
              "@letKeyword":       "keyword.let",
              "@keywords":         "keyword",
              "@booleanValues":    "value",
              "@easingValues":     "value",
              "@durationKeywords": "value",
              "@fitValues":        "value",
              "@namedColors":      "color",
              "@default":          "identifier",
            },
          },
        ],
      ],
    },
  });

  monaco.languages.registerColorProvider("Marey", {
    provideDocumentColors: (model) => {
      const text = model.getValue();
      const colors: MonacoLanguagesNS.IColorInformation[] = [];
      const regex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;

      let match;
      while ((match = regex.exec(text)) !== null) {
        const hex = match[1];
        let r = 0, g = 0, b = 0;

        if (hex.length === 3) {
          r = parseInt(hex[0] + hex[0], 16) / 255;
          g = parseInt(hex[1] + hex[1], 16) / 255;
          b = parseInt(hex[2] + hex[2], 16) / 255;
        } else {
          r = parseInt(hex.substring(0, 2), 16) / 255;
          g = parseInt(hex.substring(2, 4), 16) / 255;
          b = parseInt(hex.substring(4, 6), 16) / 255;
        }

        const startPos = model.getPositionAt(match.index);
        const endPos   = model.getPositionAt(match.index + match[0].length);

        colors.push({
          range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
          color: { red: r, green: g, blue: b, alpha: 1 },
        });
      }
      return colors;
    },
    provideColorPresentations: (_, colorInfo) => {
      const color = colorInfo.color;
      const toHex = (c: number) => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      };
      const hexString = `#${toHex(color.red)}${toHex(color.green)}${toHex(color.blue)}`;
      return [{ label: hexString }];
    },
  });

  monaco.languages.registerHoverProvider("Marey", {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const token = word.word;
      let md = "";

      if (token in KEYWORD_DOCS) {
        md = KEYWORD_DOCS[token];
      } else if (token in PROP_TYPES) {
        const req   = REQUIRED_PROPS[token as keyof typeof REQUIRED_PROPS] || [];
        const props = PROP_TYPES[token as keyof typeof PROP_TYPES];

        md = `### \`${token}\` object\n---\n`;
        if (req.length > 0) {
          md += `**Required Properties:**\n- \`${req.join("`\n- `")}\`\n\n`;
        }
        const optional = Object.keys(props).filter(p => !req.includes(p));
        if (optional.length > 0) {
          md += `**Optional Properties:**\n- \`${optional.join("`\n- `")}\`\n`;
        }
      } else {
        // Several property names (e.g. `position`) describe different
        // things on different blocks, so resolve the block the cursor is
        // actually inside before falling back to first-appearance lookup.
        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const scopeChain = analyzeContext(textUntilPosition);
        const currentBlock = scopeChain[scopeChain.length - 1].blockType;

        const propertyDoc = propertyHoverMarkdown(token, currentBlock ?? undefined);
        if (propertyDoc !== undefined) {
          md = propertyDoc;
        } else {
          const valueDoc = VALUE_DOCS[token];
          if (valueDoc !== undefined) md = valueDoc;
        }
      }

      if (md) {
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [{ value: md }],
        };
      }
      return null;
    },
  });

  monaco.languages.registerCompletionItemProvider("Marey", {
    triggerCharacters: [":"],
    provideCompletionItems: (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const lineUntilCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     word.startColumn,
        endColumn:       word.endColumn,
      };

      if (/^\s*let\s+[a-zA-Z0-9_]*$/.test(lineUntilCursor)) {
        return { suggestions: [] };
      }

      const scopeChain  = analyzeContext(textUntilPosition);
      const activeScope = scopeChain[scopeChain.length - 1];
      const currentBlock = activeScope.blockType;

      const reachableVars: Record<string, string> = {};
      for (const scope of scopeChain) {
        for (const [name, type] of Object.entries(scope.vars)) {
          reachableVars[name] = type;
        }
      }

      const isTypingBindingValue = /^\s*let\s+[a-zA-Z0-9_]*\s*=\s*(.*)$/.exec(lineUntilCursor);
      const isTypingGenerate = /^\s*generate\s+(.*)$/.exec(lineUntilCursor);

      if (isTypingBindingValue || isTypingGenerate) {
        const suggestions: MonacoLanguagesNS.CompletionItem[] = [];

        for (const [sym, type] of Object.entries(reachableVars)) {
          suggestions.push({
            label: sym,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: sym,
            detail: `Variable (${type})`,
            range,
          });
        }
        for (const color of namedColors) {
          suggestions.push({
            label: color,
            kind: monaco.languages.CompletionItemKind.Color,
            insertText: color,
            detail: "Built-in named color",
            range,
          });
        }
        return { suggestions };
      }

      const needsLeadingSpace = /([a-zA-Z][a-zA-Z0-9_]*)\s*:$/.test(lineUntilCursor);

      const isTypingValueMatch = lineUntilCursor.match(/([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(.*)$/);

      const suggestions: MonacoLanguagesNS.CompletionItem[] = [];

      if (currentBlock && isTypingValueMatch) {
        const propName  = isTypingValueMatch[1];
        const propsDef  = PROP_TYPES[currentBlock as keyof typeof PROP_TYPES];

        if (propsDef && propName in propsDef) {
          const expectedTypeDef = propsDef[propName as keyof typeof propsDef];
          const expectedTypes   = Array.isArray(expectedTypeDef) ? expectedTypeDef : [expectedTypeDef];

          if (expectedTypes.includes("color")) {
            for (const color of namedColors) {
              suggestions.push({
                label: color,
                kind: monaco.languages.CompletionItemKind.Color,
                insertText: needsLeadingSpace ? ` ${color}` : color,
                detail: "Built-in named color",
                range,
              });
            }
          }
          if (expectedTypes.includes("boolean")) {
            for (const value of BOOLEAN_VALUES) {
              suggestions.push({
                label: value,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: needsLeadingSpace ? ` ${value}` : value,
                detail: "boolean",
                range,
              });
            }
          }
          if (expectedTypes.includes("easing")) {
            for (const e of EASING_VALUES) {
              suggestions.push({ label: e, kind: monaco.languages.CompletionItemKind.Keyword, insertText: needsLeadingSpace ? ` ${e}` : e, detail: "easing", range });
            }
          }
          if (expectedTypes.includes("animProperty")) {
            for (const p of ANIMATABLE_PROPERTIES) {
              suggestions.push({ label: p, kind: monaco.languages.CompletionItemKind.Property, insertText: needsLeadingSpace ? ` ${p}` : p, detail: "animatable property", range });
            }
          }
          if (expectedTypes.includes("fit")) {
            for (const val of FIT_VALUES) {
              suggestions.push({
                label: val,
                kind: monaco.languages.CompletionItemKind.Enum,
                insertText: needsLeadingSpace ? ` ${val}` : val,
                detail: "fit mode",
                range,
              });
            }
          }

          if (propName === "duration" && currentBlock === "physics") {
            for (const duration of DURATION_VALUES) {
              suggestions.push({
                label: duration,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: needsLeadingSpace ? ` ${duration}` : duration,
                detail: "Run physics simulation forever (not valid inside a sequence)",
                range,
              });
            }
          }

          for (const [sym, type] of Object.entries(reachableVars)) {
            if (expectedTypes.includes(type)) {
              suggestions.push({
                label: sym,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: needsLeadingSpace ? ` ${sym}` : sym,
                detail: `Variable (${type})`,
                range,
              });
            }
          }
        }
      } else {
        if (currentBlock && currentBlock in PROP_TYPES) {
          const propsDef = PROP_TYPES[currentBlock as keyof typeof PROP_TYPES];
          for (const [prop, type] of Object.entries(propsDef)) {
            const typeArray    = Array.isArray(type) ? type : [type];
            const displayTypes = typeArray
              .map(t => KIND_LABEL[t as keyof typeof KIND_LABEL] || t)
              .join(" or ");

            suggestions.push({
              label: prop,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: `${prop}: `,
              detail: `Property (${displayTypes})`,
              range,
              command: { id: "editor.action.triggerSuggest", title: "Suggest values" },
            });
          }
        }

        const isContainer = currentBlock === "scene"
          || currentBlock === "group"
          || currentBlock === "generate"
          || currentBlock === "template"
          || currentBlock === "use";

        if (isContainer || !currentBlock) {
          const objects = ["circle", "rectangle", "polygon", "line", "text", "group"];
          for (const obj of objects) {
            const reqProps  = REQUIRED_PROPS[obj as keyof typeof REQUIRED_PROPS] || [];

            let insertText  = `${obj} \${1:name} {\n`;
            let tabIndex    = 2;
            for (const prop of reqProps) {
              const placeholder = propertyPlaceholder(obj as keyof typeof LANGUAGE_CONTRACT, prop);
              insertText += `\t${prop}: \${${tabIndex}:${placeholder}}\n`;
              tabIndex++;
            }
            insertText += `\t$0\n}`;

            suggestions.push({
              label: obj,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: `Create new ${obj} object`,
              range,
            });
          }

          suggestions.push({
            label: "let",
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: `let \${1:varName} = \${2:value}`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Marey a constant variable",
            range,
          });

          suggestions.push({
            label: "generate",
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: `generate \${1:i} in \${2:1} to \${3:5} {\n\t$0\n}`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Generate objects in a loop",
            range,
          });

          suggestions.push({
            label: "use",
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: `use \${1:Template}(\${2:args}) \${3:instanceName} {\n\t$0\n}`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Instantiate a template",
            range,
          });
        }

        const isRenderable = ["circle", "rectangle", "polygon", "line", "text", "group"].includes(currentBlock || "");
        if (isRenderable) {
          suggestions.push({
            label: "animate",
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: animationSnippet(),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Create an animation block",
            range,
          });
          suggestions.push({
            label: "physics",
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: physicsSnippet(false),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Create a physics simulation block",
            range,
          });
          suggestions.push({
            label: "sequence",
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: sequenceSnippet(),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Chain a motion step — runs after all peer animate/physics complete",
            range,
          });
        }

        // ADDED: parallel suggestions inside sequence
        if (currentBlock === "sequence") {
          suggestions.push({
            label: "parallel",
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: `parallel {\n\t$0\n}`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Execute multiple animations or physics steps simultaneously",
            range,
          });
        }

        // UPDATED: Allow animate and physics inside parallel
        if (currentBlock === "sequence" || currentBlock === "parallel") {
          suggestions.push({
            label: "animate",
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: animationSnippet(),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: `Create an animation step inside a ${currentBlock}`,
            range,
          });
          suggestions.push({
            label: "physics",
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: physicsSnippet(true),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: `Create a physics step inside a ${currentBlock} (must use numeric duration)`,
            range,
          });
        }

        if (!currentBlock) {
          suggestions.push({
            label: "template",
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: `template \${1:Name}(\${2:param}) {\n\t$0\n}`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Define a reusable template",
            range,
          });

          const sceneReqProps = REQUIRED_PROPS["scene"] || [];
          let sceneInsertText = `scene {\n`;
          let sceneTabIndex   = 1;

          for (const prop of sceneReqProps) {
            const placeholder = propertyPlaceholder("scene", prop);
            sceneInsertText += `\t${prop}: \${${sceneTabIndex}:${placeholder}}\n`;
            sceneTabIndex++;
          }
          sceneInsertText += `\t$0\n}`;

          suggestions.push({
            label: "scene",
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: sceneInsertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Main scene block",
            range,
          });
        }
      }

      return { suggestions };
    },
  });
}
