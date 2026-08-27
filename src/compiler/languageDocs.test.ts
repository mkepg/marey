/**
 * Every example in docs/LANGUAGE.md must compile.
 *
 * The document is the only copy of its examples — there is no parallel fixture
 * directory to fall out of sync with it. This is the mechanism that stops the
 * reference becoming a fifth hand-synced list (spec 2026-08-27, L2/§5): when
 * Phase 3 renames `def` to `let`, every example here stops compiling and the
 * build goes red, rather than the document quietly going stale.
 *
 * Fences tagged ```declare are compiled. Fences tagged ```text are prose
 * fragments and are skipped deliberately.
 *
 * The document is pulled in as a build-time dependency via Vite's `?raw`
 * import (declared by `vite/client`), rather than read from disk with
 * `node:fs`, so this typechecks under `tsconfig.app.json` without pulling in
 * node types. It also resolves relative to this file instead of the process
 * working directory, so it isn't sensitive to where `vitest` is invoked from.
 */
import { describe, it, expect } from "vitest";
import markdownDoc from "../../docs/LANGUAGE.md?raw";
import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";

interface Example {
  /** 1-indexed line in LANGUAGE.md where the fence opens. */
  line: number;
  source: string;
}

export function extractExamples(markdown: string): Example[] {
  const lines = markdown.split(/\r?\n/);
  const examples: Example[] = [];
  let open: { line: number; body: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (open === null) {
      if (line.trim() === "```declare") open = { line: i + 1, body: [] };
    } else if (line.trim() === "```") {
      examples.push({ line: open.line, source: open.body.join("\n") });
      open = null;
    } else {
      open.body.push(line);
    }
  }

  if (open !== null) {
    throw new Error(`Unclosed \`\`\`declare fence opened at line ${open.line}`);
  }
  return examples;
}

function compileErrors(source: string): string[] {
  const { ast, errors } = parse(lex(source));
  const out = errors.map((e) => `L${e.line ?? "?"}: ${e.message}`);
  if (ast) {
    const { errors: typeErrors } = typeCheck(ast);
    out.push(...typeErrors.map((e) => `L${e.line ?? "?"}: ${e.message}`));
  }
  return out;
}

describe("docs/LANGUAGE.md examples", () => {
  const markdown = markdownDoc;
  const examples = extractExamples(markdown);

  it("contains at least one example", () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(examples.map((e) => [e.line, e.source] as const))(
    "the example at LANGUAGE.md line %i compiles",
    (_line, source) => {
      expect(compileErrors(source)).toEqual([]);
    }
  );
});
