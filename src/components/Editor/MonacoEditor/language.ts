import type { languages as MonacoLanguagesNS } from "monaco-editor";
import { REQUIRED_PROPS, PROP_TYPES, KIND_LABEL } from "../../../compiler/typeChecker/validator";
import { KEYWORD_DOCS, PROPERTY_DOCS, namedColors } from "./constants";
import { analyzeContext } from "./scanner";

export function registerLanguage(monaco: typeof import("monaco-editor")): void {
  if (monaco.languages.getLanguages().some((l) => l.id === "Declare")) return;
  
  monaco.languages.register({ id: "Declare" });
  
  monaco.languages.setMonarchTokensProvider("Declare", {
    keywords:    ["scene", "circle", "rectangle", "polygon", "text", "group", "generate", "from", "to", "template", "use"],
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

  // ----------------------------------------------------------------------
  // NEW: Custom Color Provider to restrict the color picker to 6-digit Hex
  // ----------------------------------------------------------------------
  monaco.languages.registerColorProvider("Declare", {
    // 1. Scan the document to find existing hex colors and add swatch squares
    provideDocumentColors: (model) => {
      const text = model.getValue();
      const colors: MonacoLanguagesNS.IColorInformation[] = [];
      const regex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
      
      let match;
      while ((match = regex.exec(text)) !== null) {
        const hex = match[1];
        let r = 0, g = 0, b = 0;
        
        // Parse 3-digit vs 6-digit hex
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
        const endPos = model.getPositionAt(match.index + match[0].length);
        
        colors.push({
          range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
          color: { red: r, green: g, blue: b, alpha: 1 } // We force alpha to 1 visually
        });
      }
      return colors;
    },
    
    // 2. Intercept the color picker output and force a 6-digit hex
    provideColorPresentations: (_, colorInfo) => {
      const color = colorInfo.color;
      
      const toHex = (c: number) => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      };
      
      // We explicitly ignore color.alpha here to enforce Declare's syntax
      const hexString = `#${toHex(color.red)}${toHex(color.green)}${toHex(color.blue)}`;
      
      return [
        {
          label: hexString
        }
      ];
    }
  });

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
      
      if (/^\s*def\s+[a-zA-Z0-9_]*$/.test(lineUntilCursor)) {
        return { suggestions: [] };
      }
      
      const scopeChain = analyzeContext(textUntilPosition);
      const activeScope = scopeChain[scopeChain.length - 1];
      const currentBlock = activeScope.blockType;
      
      const reachableVars: Record<string, string> = {};
      for (const scope of scopeChain) {
        for (const [name, type] of Object.entries(scope.vars)) {
          reachableVars[name] = type;
        }
      }
      
      const isTypingDefValue = /^\s*def\s+[a-zA-Z0-9_]*\s*=\s*(.*)$/.exec(lineUntilCursor);
      const isTypingGenerate = /^\s*generate\s+(.*)$/.exec(lineUntilCursor);
      
      if (isTypingDefValue || isTypingGenerate) {
        const suggestions: MonacoLanguagesNS.CompletionItem[] = [];
        
        for (const [sym, type] of Object.entries(reachableVars)) {
          suggestions.push({
            label: sym,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: sym,
            detail: `Variable (${type})`,
            range
          });
        }
        for (const color of namedColors) {
          suggestions.push({
            label: color,
            kind: monaco.languages.CompletionItemKind.Color,
            insertText: color,
            detail: "Built-in named color",
            range
          });
        }
        return { suggestions };
      }
      
      const needsLeadingSpace = /([a-zA-Z][a-zA-Z0-9_]*)\s*:$/.test(lineUntilCursor);
      const getPlaceholderForProp = (prop: string, propType: unknown, isScene: boolean = false): string => {
        if (prop === "size") return isScene ? "(600, 400)" : "(100, 100)";
        if (prop === "radius") return "50";
        if (prop === "content") return '"Text"';
        
        const primaryType = Array.isArray(propType) ? propType[0] : propType;
        switch (primaryType) {
          case "point": return "(0, 0)";
          case "number": return "10";
          case "color": return "black";
          case "string": return '"text"';
          case "pointList": return "[(50,0), (100,100), (0,100)]";
          case "sceneFit": return "contain";
          default: return "value";
        }
      };
      
      const isTypingValueMatch = lineUntilCursor.match(/([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
      const suggestions: MonacoLanguagesNS.CompletionItem[] = [];
      
      if (currentBlock && isTypingValueMatch) {
        const propName = isTypingValueMatch[1];
        const propsDef = PROP_TYPES[currentBlock as keyof typeof PROP_TYPES];
        
        if (propsDef && propName in propsDef) {
          const expectedTypeDef = propsDef[propName as keyof typeof propsDef];
          const expectedTypes = Array.isArray(expectedTypeDef) ? expectedTypeDef : [expectedTypeDef];
          
          if (expectedTypes.includes("color")) {
            for (const color of namedColors) {
              suggestions.push({
                label: color,
                kind: monaco.languages.CompletionItemKind.Color,
                insertText: needsLeadingSpace ? ` ${color}` : color,
                detail: "Built-in named color",
                range
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
                range
              });
            }
          }
        }
      }
      else {
        if (currentBlock && currentBlock in PROP_TYPES) {
          const propsDef = PROP_TYPES[currentBlock as keyof typeof PROP_TYPES];
          for (const [prop, type] of Object.entries(propsDef)) {
            const typeArray = Array.isArray(type) ? type : [type];
            const displayTypes = typeArray.map(t => KIND_LABEL[t as keyof typeof KIND_LABEL] || t).join(" or ");
            
            suggestions.push({
              label: prop,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: `${prop}: `,
              detail: `Property (${displayTypes})`,
              range,
              command: {
                id: "editor.action.triggerSuggest",
                title: "Suggest values",
              },
            });
          }
        }
        
        const isContainer = currentBlock === "scene" || currentBlock === "group" || currentBlock === "generate" || currentBlock === "template" || currentBlock === "use";
        if (isContainer || !currentBlock) {
          const objects = ["circle", "rectangle", "polygon", "text", "group"];
          
          for (const obj of objects) {
            const reqProps = REQUIRED_PROPS[obj as keyof typeof REQUIRED_PROPS] || [];
            const propsDef = PROP_TYPES[obj as keyof typeof PROP_TYPES];
            
            let insertText = `${obj} \${1:name} {\n`;
            let tabIndex = 2;
            for (const prop of reqProps) {
              const propType = propsDef ? propsDef[prop as keyof typeof propsDef] : "unknown";
              const placeholder = getPlaceholderForProp(prop, propType, false);
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
              range
            });
          }
          
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

          suggestions.push({
            label: "use",
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: `use \${1:Template}(\${2:args}) \${3:instanceName} {\n\t$0\n}`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Instantiate a template",
            range
          });
        }
        
        if (!currentBlock) {
          suggestions.push({
            label: "template",
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: `template \${1:Name}(\${2:param}) {\n\t$0\n}`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: "Define a reusable template",
            range
          });

          const sceneReqProps = REQUIRED_PROPS["scene"] || [];
          const scenePropsDef = PROP_TYPES["scene"];
          
          let sceneInsertText = `scene {\n`;
          let sceneTabIndex = 1;
          for (const prop of sceneReqProps) {
            const propType = scenePropsDef ? scenePropsDef[prop as keyof typeof scenePropsDef] : "unknown";
            const placeholder = getPlaceholderForProp(prop, propType, true);
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
            range
          });
        }
      }
      return { suggestions };
    }
  });
}