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

  /**
   * The point-list coordinate sites are a separate pair of calls from the
   * point ones (`parseExpr.ts` `parseListLiteral` vs `parseParenOrPoint`), so
   * the two above do not cover them. Re-introducing `depth + 1` in
   * `parseListLiteral` alone leaves the whole rest of the suite green.
   */
  it("accepts 50 levels of nesting in a point-list coordinate", () => {
    const source = `scene { size: (100, 100) polygon g { position: (0, 0), points: [(${nest(50)}, 0), (1, 1), (2, 2)] } }`;
    expect(diagnosticsFor(source)).toEqual([]);
  });

  it("rejects 51 levels of nesting in a point-list coordinate", () => {
    const source = `scene { size: (100, 100) polygon g { position: (0, 0), points: [(${nest(51)}, 0), (1, 1), (2, 2)] } }`;
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

describe("structural nesting depth", () => {
  /**
   * A coordinate resets the *expression* budget, so nothing bounded how deeply
   * points nest inside one another once `((x, y))` made a point reachable from
   * inside an expression. `(1,(1,(1,…)))` recursed for real and blew the stack
   * at ~2000 levels — about 6000 characters, inside `MAX_SHARE_LENGTH`
   * (`lib/share.ts:17`), so it arrives by share link. The pre-refactor parser
   * reported a clean positioned error at every depth because it rejected the
   * second level outright and never recursed.
   *
   * Note these fixtures are never diagnostic-free at any depth: a coordinate
   * must be a number, so a point inside one is always an error. The boundary
   * being pinned is therefore *which* error — the ordinary coordinate-kind
   * complaint below the cap, the structural one above it — and, above all,
   * that a position survives instead of the parser throwing.
   */
  const nestPoints = (n: number) => {
    let s = "(1, 1)";
    for (let i = 1; i < n; i++) s = `(1, ${s})`;
    return s;
  };
  const sceneWith = (point: string) =>
    `scene { size: (100, 100) circle c { position: ${point}, radius: 5 } }`;

  it("does not reach the structural cap at 50 nested points", () => {
    const diags = diagnosticsFor(sceneWith(nestPoints(50)));
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("A point coordinate must be a number, but got point.");
    expect(diags[0].message).not.toContain("nested too deeply");
  });

  it("rejects 51 nested points with a positioned error", () => {
    const diags = diagnosticsFor(sceneWith(nestPoints(51)));
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain(
      "Points and point lists are nested too deeply. Maximum nesting depth is 50.",
    );
    expect(typeof diags[0].line).toBe("number");
    expect(typeof diags[0].col).toBe("number");
  });

  /**
   * The regression itself: at these depths the parser used to throw
   * `RangeError: Maximum call stack size exceeded`, which reaches the user
   * through `compiler.worker.ts`'s catch as a message with no position at all.
   * `diagnosticsFor` deliberately does not catch, so a throw fails here.
   */
  it.each([2000, 5000, 20000])("reports rather than overflowing at %i nested points", (n) => {
    const diags = diagnosticsFor(sceneWith(nestPoints(n)));
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("nested too deeply");
    expect(typeof diags[0].line).toBe("number");
    expect(typeof diags[0].col).toBe("number");
  });

  /**
   * The structural and expression caps *multiply*: a coordinate resets the
   * expression budget, so each of the 50 permitted structural levels carries
   * a fresh 50-level expression budget and the reachable stack depth is their
   * product. Both caps stay satisfied the whole way down while the stack runs
   * out — a few thousand characters was enough. A third budget bounds the
   * product; these fixtures keep both factors legal so only that third one
   * can be what stops them.
   */
  const nestedGroupsAndPoints = (levels: number, groups: number) => {
    let s = "(1, 1)";
    for (let i = 1; i < levels; i++) {
      s = `${"(".repeat(groups)}(1, ${s})${")".repeat(groups)}`;
    }
    return s;
  };

  it.each([
    [30, 50],
    [50, 40],
    [50, 50],
  ])("bounds %i structural levels each %i groups deep", (levels, groups) => {
    const diags = diagnosticsFor(sceneWith(nestedGroupsAndPoints(levels, groups)));
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("This value nests too deeply overall.");
    expect(typeof diags[0].line).toBe("number");
    expect(typeof diags[0].col).toBe("number");
  });

  it("leaves a shape well inside the product alone", () => {
    // 5 x 50 stays under the total budget, so the ordinary coordinate
    // complaint still wins — the cap is not swallowing everything.
    const diags = diagnosticsFor(sceneWith(nestedGroupsAndPoints(5, 50)));
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("A point coordinate must be a number, but got point.");
  });

  /**
   * What a *list entry* costs, pinned at the exact boundary.
   *
   * Phase 3B made a list entry a general expression, which forced a choice
   * between the two budget rules: an entry could reset the expression budget
   * like a point coordinate, or inherit an incremented one like a grouped
   * expression. `parseListLiteral` takes the second, so a `[` costs one
   * *expression* level and no structural level, and one level of
   * `[(1, <inner>)]` therefore costs exactly one structural level — the
   * point's own coordinate — the same as a bare `(1, <inner>)` does above.
   *
   * Switching that one call to `intoCoordinate` charges `struct` twice per
   * level instead, halving how deeply lists and points may alternate, and
   * leaves every other test in the repository green — verified by making the
   * swap and running the full suite. Only a fixture sitting exactly on the
   * cap can see it: at 50 levels the structural budget is spent to the last
   * level and the ordinary coordinate complaint still wins, while the halved
   * arithmetic would report the structural error here instead.
   */
  const nestListsAndPoints = (n: number) => {
    let s = "[(1, 1)]";
    for (let i = 1; i < n; i++) s = `[(1, ${s})]`;
    return s;
  };
  const polygonWith = (points: string) =>
    `scene { size: (100, 100) polygon g { position: (0, 0), points: ${points} } }`;

  it("charges one structural level per alternating list-and-point level, not two", () => {
    const diags = diagnosticsFor(polygonWith(nestListsAndPoints(50)));
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("A point coordinate must be a number, but got list.");
    expect(diags[0].message).not.toContain("nested too deeply");
  });

  it("rejects the 51st alternating level structurally", () => {
    const diags = diagnosticsFor(polygonWith(nestListsAndPoints(51)));
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain(
      "Points and point lists are nested too deeply. Maximum nesting depth is 50.",
    );
  });

  it("bounds alternating point-list and point nesting too", () => {
    let s = "[(1, 1)]";
    for (let i = 1; i < 3000; i++) s = `[(1, ${s})]`;
    const diags = diagnosticsFor(
      `scene { size: (100, 100) polygon g { position: (0, 0), points: ${s} } }`,
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("nested too deeply");
    expect(typeof diags[0].line).toBe("number");
    expect(typeof diags[0].col).toBe("number");
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
