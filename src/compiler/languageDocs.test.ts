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
import { advanceAnimTime, type AnimTime } from "./renderer/timeline";

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
    if (
      err !== null &&
      typeof err === "object" &&
      !(err instanceof Error) &&
      typeof (err as { message?: unknown }).message === "string"
    ) {
      const e = err as { message: string; line?: number };
      out.push(`THREW: LANGUAGE.md:${absolute(e.line)}: ${e.message}`.slice(0, 200));
    } else {
      out.push(`THREW: ${String(err).slice(0, 200)}`);
    }
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

/**
 * Facts asserted by docs/LANGUAGE.md that a reader cannot verify from the
 * document alone. Each test is named after the heading whose claim it locks.
 */

function mkAnimTime(over: Partial<AnimTime> = {}): AnimTime {
  return {
    elapsedTicks: 0,
    durationTicks: 10,
    direction: 1,
    completed: false,
    loop: false,
    yoyo: false,
    ...over,
  };
}

/** Elapsed-tick values produced by `n` successive ticks. */
function elapsedSequence(t: AnimTime, n: number): number[] {
  const seq: number[] = [];
  for (let i = 0; i < n; i++) {
    advanceAnimTime(t);
    seq.push(t.elapsedTicks);
  }
  return seq;
}

/** Tick index (1-based) at which the animation reports completion, or -1. */
function completesAtTick(t: AnimTime, limit: number): number {
  for (let i = 0; i < limit; i++) {
    if (advanceAnimTime(t)) return i + 1;
  }
  return -1;
}

describe("LANGUAGE.md · Animation · loop and yoyo", () => {
  it("duration is the half-cycle: a there-and-back yoyo takes 2x duration", () => {
    const t = mkAnimTime({ yoyo: true, loop: true });
    // Out over 10 ticks, back over 10, then repeats. One full cycle is 20.
    expect(elapsedSequence(t, 20)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    ]);
    expect(elapsedSequence(t, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("a plain animation completes at exactly durationTicks", () => {
    expect(completesAtTick(mkAnimTime(), 500)).toBe(10);
  });

  it("yoyo without loop never completes — see the warning in that section", () => {
    const t = mkAnimTime({ yoyo: true, loop: false });
    expect(completesAtTick(t, 500)).toBe(-1);
    expect(t).toEqual({
      elapsedTicks: 0,
      durationTicks: 10,
      direction: -1,
      completed: false,
      loop: false,
      yoyo: true,
    });
  });

  it("yoyo without loop rests at its start value rather than drifting", () => {
    const t = mkAnimTime({ yoyo: true, loop: false });
    const seq = elapsedSequence(t, 25);
    expect(seq.slice(20)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("LANGUAGE.md · Reuse · generate", () => {
  it("nested generate suffixes the innermost loop index first: dot_<j>_<i>", () => {
    const source = `
      scene {
        size: (800, 600)
        generate i from 0 to 1 {
          generate j from 0 to 2 {
            circle dot {
              position: (0, 0)
              radius: 5
            }
          }
        }
      }
    `;
    const { ast, errors } = parse(lex(source));
    expect(errors).toEqual([]);
    const { errors: typeErrors, ir } = typeCheck(ast!);
    expect(typeErrors).toEqual([]);
    // Registry keys are scope-qualified ("scene.<name>"), not the bare name
    // (builder.ts:288). i has range 0..1, j has range 0..2 — the two ranges
    // differ so which loop contributes which suffix position is unambiguous.
    expect(Object.keys(ir!.registry).sort()).toEqual([
      "scene.dot_0_0", "scene.dot_0_1",
      "scene.dot_1_0", "scene.dot_1_1",
      "scene.dot_2_0", "scene.dot_2_1",
    ]);
  });
});

describe("LANGUAGE.md · Physics · collideBounds", () => {
  it("defaults to true when the property is omitted", () => {
    const source = `
      scene {
        size: (800, 600)
        circle a {
          position: (400, 100)
          radius: 20
          color: cyan
          physics { gravity: (0, 900), duration: 2 }
        }
      }
    `;
    const { ast, errors } = parse(lex(source));
    expect(errors).toEqual([]);
    const { errors: typeErrors, ir } = typeCheck(ast!);
    expect(typeErrors).toEqual([]);
    // Note the `.props` hop: IRObjectNode is { id, props, children } and the
    // physics block hangs off `props`, not off the node (sceneIR.ts:96-115).
    // Top-level registry keys are scope paths ("scene.<name>"), not the bare
    // name (builder.ts:288).
    expect(ir!.registry["scene.a"].props.physics?.collideBounds).toBe(true);
  });
});
