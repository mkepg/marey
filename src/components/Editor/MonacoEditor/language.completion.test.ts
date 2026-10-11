import { describe, expect, it } from "vitest";
import type { languages } from "monaco-editor";
import { registerLanguage } from "./language";

type Provider = languages.CompletionItemProvider;

/** Registers the language against a stub of the monaco namespace and returns the completion provider. */
function completionProvider(): Provider {
  let provider: Provider | undefined;
  const noop = () => ({ dispose() {} });
  const stub = {
    Range: class {},
    languages: {
      getLanguages: () => [],
      register: noop,
      setMonarchTokensProvider: noop,
      registerColorProvider: noop,
      registerHoverProvider: noop,
      registerCompletionItemProvider: (_id: string, p: Provider) => {
        provider = p;
        return { dispose() {} };
      },
      CompletionItemKind: { Color: 1, Keyword: 2, Property: 3, Variable: 4, Enum: 5, Snippet: 6 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
  };
  registerLanguage(stub as never);
  if (!provider) throw new Error("no completion provider registered");
  return provider;
}

/** Completions offered with the cursor at the end of `text`. */
function labelsAt(text: string): string[] {
  const lines = text.split("\n");
  const lineNumber = lines.length;
  const column = lines[lines.length - 1].length + 1;
  const model = {
    getValueInRange: (r: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }) => {
      const out: string[] = [];
      for (let n = r.startLineNumber; n <= r.endLineNumber; n++) {
        const line = lines[n - 1];
        const from = n === r.startLineNumber ? r.startColumn - 1 : 0;
        const to = n === r.endLineNumber ? r.endColumn - 1 : line.length;
        out.push(line.slice(from, to));
      }
      return out.join("\n");
    },
    getWordUntilPosition: () => ({ word: "", startColumn: column, endColumn: column }),
  };
  const result = completionProvider().provideCompletionItems(
    model as never,
    { lineNumber, column } as never,
    {} as never,
    {} as never,
  ) as { suggestions: { label: string | { label: string } }[] };
  return result.suggestions.map((s) => (typeof s.label === "string" ? s.label : s.label.label));
}

describe("value completion for 'world { bounds }'", () => {
  it("offers edge lists, led by [left, right, bottom]", () => {
    const labels = labelsAt("world {\n  bounds: ");
    expect(labels).toEqual(["[left, right, bottom]", "[left, right, top, bottom]", "[]"]);
  });

  it("offers no edge lists for a property that is not an edge list", () => {
    expect(labelsAt("world {\n  gravity: ")).not.toContain("[left, right, bottom]");
  });
});
