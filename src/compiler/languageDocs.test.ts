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
 * fragments and are skipped deliberately. Any other tag — including an empty
 * one — is treated as a mistake, not tolerated: `extractExamples` throws
 * naming the bad tag and its line, so a typo like ```Declare loses coverage
 * loudly instead of silently. A four-or-more-backtick fence also throws:
 * this extractor is a line scanner, not a nested-fence parser, so a block
 * that displays fence syntax literally must not be attempted.
 *
 * Reported compile-error line numbers are absolute (LANGUAGE.md line numbers,
 * not offsets into the extracted snippet), computed from the fence's own
 * line. A lexer/parser/typeChecker throw is caught and surfaced as a
 * `THREW: ...` entry rather than escaping as an uncaught exception — see
 * `eval/compile.test.ts` for the precedent this follows.
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

const RECOGNISED_TAGS = new Set(["declare", "text"]);

export function extractExamples(markdown: string): Example[] {
  const lines = markdown.split(/\r?\n/);
  const examples: Example[] = [];
  let open: { line: number; tag: string; body: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (/^`{4,}/.test(trimmed)) {
      throw new Error(
        `Four-backtick fence at line ${i + 1} is not supported by this extractor. Use three-backtick fences only.`
      );
    }

    const fenceMatch = /^```(.*)$/.exec(trimmed);

    if (open === null) {
      if (fenceMatch) {
        const tag = fenceMatch[1].trim();
        if (!RECOGNISED_TAGS.has(tag)) {
          throw new Error(
            `Unrecognised fence tag "${tag}" at line ${i + 1}. Use \`\`\`declare for a compiled example or \`\`\`text for a prose fragment.`
          );
        }
        open = { line: i + 1, tag, body: [] };
      }
      continue;
    }

    if (fenceMatch) {
      if (open.tag === "declare") {
        examples.push({ line: open.line, source: open.body.join("\n") });
      }
      open = null;
    } else {
      open.body.push(raw);
    }
  }

  if (open !== null) {
    throw new Error(`Unclosed \`\`\`${open.tag} fence opened at line ${open.line}`);
  }
  return examples;
}

function compileErrors(source: string, fenceLine: number): string[] {
  const out: string[] = [];
  const absolute = (line: number | undefined): string =>
    line === undefined ? "?" : String(fenceLine + line);
  try {
    const { ast, errors } = parse(lex(source));
    out.push(...errors.map((e) => `LANGUAGE.md:${absolute(e.line)}: ${e.message}`));
    if (ast) {
      const { errors: typeErrors } = typeCheck(ast);
      out.push(...typeErrors.map((e) => `LANGUAGE.md:${absolute(e.line)}: ${e.message}`));
    }
  } catch (err) {
    out.push(`THREW: ${String(err).slice(0, 200)}`);
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
    (line, source) => {
      expect(compileErrors(source, line)).toEqual([]);
    }
  );
});

describe("extractExamples", () => {
  it("extracts a single declare fence and reports the fence marker's line", () => {
    const md = ["prose", "```declare", "scene { }", "```", "more prose"].join("\n");
    expect(extractExamples(md)).toEqual([{ line: 2, source: "scene { }" }]);
  });

  it("extracts two fences and reports both line numbers correctly", () => {
    const md = [
      "# heading",
      "```declare",
      "scene { A }",
      "```",
      "text between",
      "```declare",
      "scene { B }",
      "```",
    ].join("\n");
    expect(extractExamples(md)).toEqual([
      { line: 2, source: "scene { A }" },
      { line: 6, source: "scene { B }" },
    ]);
  });

  it("skips a text fence — it does not appear in the results", () => {
    const md = ["```text", "this is prose, not code", "```", "```declare", "scene { }", "```"].join(
      "\n"
    );
    const result = extractExamples(md);
    expect(result).toEqual([{ line: 4, source: "scene { }" }]);
  });

  it("throws on an unclosed declare fence, naming the opening line", () => {
    const md = ["intro", "```declare", "scene { }"].join("\n");
    expect(() => extractExamples(md)).toThrow(
      "Unclosed ```declare fence opened at line 2"
    );
  });

  it("throws on an unrecognised tag such as Declare, naming the tag", () => {
    const md = ["```Declare", "scene { }", "```"].join("\n");
    expect(() => extractExamples(md)).toThrow(
      'Unrecognised fence tag "Declare" at line 1.'
    );
  });

  it("throws on a four-backtick fence", () => {
    const md = ["````declare", "scene { }", "````"].join("\n");
    expect(() => extractExamples(md)).toThrow(
      "Four-backtick fence at line 1 is not supported by this extractor."
    );
  });

  it("handles CRLF line endings, producing the same result as LF", () => {
    const lf = ["```declare", "scene { }", "```"].join("\n");
    const crlf = lf.replace(/\n/g, "\r\n");
    expect(extractExamples(crlf)).toEqual(extractExamples(lf));
  });
});
