import { describe, expect, it } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";

/**
 * Phase 3B Task 2 pinned the seam where `parseMathExpr` — which returned a
 * JavaScript `number` — became `parseExpr`, which returns an `AstValue`.
 *
 * The refactor was meant to be behaviour-preserving, and an A/B diff of full
 * parse results over a hazard corpus showed it was, except in three places.
 * Two of those are deliberate improvements that nothing else pins, and one was
 * a narrowing that had to be undone. All three are pinned here, because a
 * later task that touches the expression grammar could otherwise revert any of
 * them and still see a green suite.
 */

interface Diagnostic {
  readonly message: string;
  readonly line?: number;
  readonly col?: number;
  readonly endCol?: number;
}

/** Lex, parse, and type-check `source`, returning every positioned diagnostic. */
function diagnosticsFor(source: string): Diagnostic[] {
  const parsed = parse(lex(source));
  if (parsed.errors.length || !parsed.ast) return parsed.errors;
  return typeCheck(parsed.ast).errors;
}

/** 1-indexed line/col of the first occurrence of `needle` in `source`. */
function posAt(source: string, needle: string): { line: number; col: number } {
  const idx = source.indexOf(needle);
  if (idx < 0) throw new Error(`fixture does not contain ${JSON.stringify(needle)}`);
  const before = source.slice(0, idx);
  const line = before.split("\n").length;
  const col = idx - (before.lastIndexOf("\n") + 1) + 1;
  return { line, col };
}

describe("redundant parentheses around a point", () => {
  /**
   * Before Task 2 the point-vs-paren lookahead lived only in `parseValue`, so
   * a '(' reached from inside an expression was always a grouped expression
   * and `((100, 200))` was a parse error. `parsePrimary` now runs the
   * lookahead at every nesting level, so the redundant parens are accepted.
   */
  it("accepts '((x, y))' as the same point as '(x, y)'", () => {
    const source = `
      scene {
        size: (100, 100)
        circle c { position: ((100, 200)), radius: 5 }
      }
    `;
    expect(diagnosticsFor(source)).toEqual([]);

    const ast = parse(lex(source)).ast;
    expect(ast?.children[0].props.position).toMatchObject({
      kind: "point",
      x: 100,
      y: 200,
    });
  });
});

describe("'property:' names an animatable property, never a binding", () => {
  /**
   * A latent bug before Task 2: `parseValue`'s old `isMathStart` gate ran
   * *before* its `currentKey === "property"` case, so any `let position = ...`
   * anywhere in the file hijacked every `animate { property: position }` in
   * it — the animation silently targeted the binding's value instead of the
   * property. `parseValue` now resolves the `property` key first.
   */
  it("resolves 'property: position' even when 'position' is a bound name", () => {
    const source = `
      let position = 5
      scene {
        size: (100, 100)
        circle c {
          position: (10, 10)
          radius: 5
          animate { property: position, to: (20, 20), duration: 1 }
        }
      }
    `;
    expect(diagnosticsFor(source)).toEqual([]);

    const ast = parse(lex(source)).ast;
    const animate = ast?.children[0].children[0];
    expect(animate?.type).toBe("animate");
    expect(animate?.props.property).toMatchObject({
      kind: "animProperty",
      value: "position",
    });
  });
});

describe("expression nesting depth", () => {
  /**
   * A point coordinate gets a full depth budget of its own. Task 2 briefly
   * passed `depth + 1` into the coordinate parsers, which cost a coordinate
   * one level against the pre-refactor code and rejected source that used to
   * compile. The pre-refactor code passed a hard-coded 0 at all four
   * coordinate sites (`de9bf39:parseValue.ts:128,130,166,168`); it still does.
   */
  const nest = (n: number) => `${"(".repeat(n)}1${")".repeat(n)}`;

  it("accepts 50 levels of nesting in a point coordinate", () => {
    const source = `scene { size: (100, 100) circle c { position: (${nest(50)}, 0), radius: 5 } }`;
    expect(diagnosticsFor(source)).toEqual([]);
  });

  it("rejects 51 levels of nesting in a point coordinate", () => {
    const source = `scene { size: (100, 100) circle c { position: (${nest(51)}, 0), radius: 5 } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Math expression is too deeply nested. Maximum depth is 50.");
  });

  it("applies the same 50/51 boundary to a plain property value", () => {
    const ok = `scene { size: (100, 100) circle c { position: (0, 0), radius: ${nest(50)} } }`;
    expect(diagnosticsFor(ok)).toEqual([]);

    const tooDeep = `scene { size: (100, 100) circle c { position: (0, 0), radius: ${nest(51)} } }`;
    const diags = diagnosticsFor(tooDeep);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Math expression is too deeply nested. Maximum depth is 50.");
  });
});

describe("operand-type errors", () => {
  /**
   * `requireNumber` originally reported at `state.peek()`, which by the time
   * `applyBinary` runs is the token *after* the whole binary expression — so
   * the editor squiggled the next property, on the next line. The diagnostic
   * anchors to the offending operand instead.
   */
  it("reports a bad left operand at the operand, not at the next property", () => {
    const source = [
      "scene {",
      "  size: (100, 100)",
      "  circle c {",
      "    position: (10, 10)",
      "    radius: true + 1",
      "    fill: red",
      "  }",
      "}",
    ].join("\n");

    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("The left operand of '+' must be a number, but got boolean.");
    expect({ line: diags[0].line, col: diags[0].col }).toEqual(posAt(source, "true"));
  });

  it("reports a bad right operand at the operand", () => {
    const source = [
      "let sky = #38bdf8",
      "scene {",
      "  size: (100, 100)",
      "  circle c {",
      "    position: (10, 10)",
      "    radius: 1 + sky",
      "    fill: red",
      "  }",
      "}",
    ].join("\n");

    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("The right operand of '+' must be a number, but got color.");
    expect({ line: diags[0].line, col: diags[0].col }).toEqual(posAt(source, "sky\n"));
  });
});
