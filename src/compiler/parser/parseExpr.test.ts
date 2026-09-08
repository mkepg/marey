import { describe, expect, it } from "vitest";
import type { AstValue, ListValue } from "../types";
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

/**
 * The shortest fixture that folds one expression and keeps the result
 * reachable: a `let` binding survives on `ParseResult.env`, so the folded
 * value can be asserted directly instead of through a property the contract
 * also has an opinion about.
 */
const bindingOf = (expr: string) => `let value = ${expr}\nscene { size: (100, 100) }`;

/** Folds `expr` in a binding, asserting it produced no diagnostics at all. */
function foldOf(expr: string): AstValue {
  const parsed = parse(lex(bindingOf(expr)));
  expect(parsed.errors).toEqual([]);
  return parsed.env.value;
}

/**
 * Diagnostics from folding `expr` in a binding — asserted to be exactly one.
 *
 * Every rejection fixture below produces a single diagnostic, confirmed by
 * dumping the whole array for each. A second one appearing is a regression in
 * its own right (the parser recovering somewhere it used to stop), so the
 * count is checked here rather than restated in every test.
 */
function diagnosticsForExpr(expr: string): Diagnostic[] {
  const diags = diagnosticsFor(bindingOf(expr));
  expect(diags).toHaveLength(1);
  return diags;
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
      "Points and lists are nested too deeply. Maximum nesting depth is 50.",
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

  // A sibling test used to sit here, named "rejects the 51st alternating
  // level structurally" (nestListsAndPoints(51), asserting only that some
  // "nested too deeply" message appears). It was deleted: two reviewers
  // found its assertion did not check what its name claimed. Verified by
  // swapping `parseListLiteral`'s entry transition from `intoGroup` to
  // `intoCoordinate` (making each level cost two structural levels instead
  // of one, exactly the bug this test's name says it guards against) and
  // running the full suite — that mutation turns exactly one test red across
  // all 422: the "charges one structural level..." test directly above,
  // whose 50-level fixture sits exactly on the boundary and so distinguishes
  // cost-per-level 1 from 2. The deleted test's 51-level fixture overshoots
  // the cap either way — at cost 1 by one level, at cost 2 by ~26 — so it
  // reported "too deeply" under both the correct arithmetic and the broken
  // one and could not have caught this regression. The test directly above
  // is the real pin for this boundary; "bounds alternating point-list and
  // point nesting too" below already covers "does sufficiently deep
  // alternating nesting report rather than crash" at a depth (3000) far past
  // where a per-level cost of 1 vs 2 could matter.
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

/* ------------------------------------------------------------------------ *
 * Task 5 — modulo, comparisons, and boolean combinators (design 4.1-4.3)
 * ------------------------------------------------------------------------ */

describe("modulo", () => {
  it("folds a remainder", () => {
    expect(foldOf("17 % 5")).toMatchObject({ kind: "number", value: 2 });
  });

  it("binds tighter than '+', the way '*' does", () => {
    // 1 + (7 % 4) = 4; at additive precedence it would be (1 + 7) % 4 = 0,
    // so the two groupings disagree and this fixture can tell them apart.
    expect(foldOf("1 + 7 % 4")).toMatchObject({ kind: "number", value: 4 });
  });

  it("associates left against '*' at its own precedence level", () => {
    // (10 % 4) * 2 = 4, not 10 % (4 * 2) = 2.
    expect(foldOf("10 % 4 * 2")).toMatchObject({ kind: "number", value: 4 });
  });

  it("rejects modulo by zero rather than folding NaN into the scene", () => {
    const diags = diagnosticsForExpr("5 % 0");
    expect(diags[0].message).toContain("Modulo by zero.");
  });

  it("takes JavaScript's remainder sign rather than a floored modulo", () => {
    // Unary '-' binds tighter than '%', so this is (-7) % 3, and JavaScript's
    // '%' keeps the dividend's sign: -1, not the floored 2. No phase has
    // decided to floor it; pinned so that changing it is a decision, not drift.
    expect(foldOf("-7 % 3")).toMatchObject({ kind: "number", value: -1 });
  });
});

describe("comparison operators", () => {
  it.each([
    ["1 == 1", true],  ["1 == 2", false],
    ["1 != 2", true],  ["1 != 1", false],
    ["1 < 2", true],   ["2 < 1", false],
    ["2 > 1", true],   ["1 > 2", false],
    ["1 <= 1", true],  ["2 <= 1", false],
    ["1 >= 1", true],  ["1 >= 2", false],
  ])("folds '%s'", (expr, expected) => {
    expect(foldOf(expr)).toMatchObject({ kind: "boolean", value: expected });
  });

  /**
   * Precedence 3 — *below* `+`/`-` at 5 — rather than merely some level of its
   * own. What that buys is on the right: arithmetic following a comparison has
   * to be folded into the comparison's right operand.
   *
   * `1 + 1 == 2`, the fixture these replaced, could not show that, and its name
   * ("binds looser than arithmetic") claimed it did. Move all six comparisons
   * from 3 to 5 and `+` shares their level, so the loop's left-associative fold
   * still yields `(1 + 1) == 2` and still `true`. The whole suite stayed green
   * under that mutation — 470/470 — because nothing anywhere put arithmetic on
   * the *right* of a comparison.
   *
   * Each fixture below does, and each is red under it: at equal precedence the
   * comparison's operand stops before the `+`, leaving the `+` facing the
   * non-associativity check, which reports the bogus "Comparisons cannot be
   * chained" — so `foldOf`'s no-diagnostics assertion fails.
   */
  it.each([
    // Value-distinguishing, not just error-distinguishing: if the `+ 1` were
    // not absorbed into the right operand this would be comparing 1 to 1.
    ["1 == 1 + 1", false],
    ["1 < 2 + 3", true],
    // The replaced fixture's left-hand arithmetic, kept — but now with a right
    // side that makes the grouping observable.
    ["1 + 1 == 2 + 0", true],
  ])("binds looser than the arithmetic on either side of it: '%s'", (expr, expected) => {
    expect(foldOf(expr)).toMatchObject({ kind: "boolean", value: expected });
  });

  it("compares strings and colors by equality", () => {
    expect(foldOf(`"a" == "a"`)).toMatchObject({ kind: "boolean", value: true });
    // A named color is only ever kept as the hex it resolves to.
    expect(foldOf("red == red")).toMatchObject({ kind: "boolean", value: true });
    expect(foldOf("red == blue")).toMatchObject({ kind: "boolean", value: false });
  });
});

describe("boolean combinators", () => {
  it.each([
    ["true and true", true],   ["true and false", false],
    ["false or true", true],   ["false or false", false],
    ["not false", true],       ["not true", false],
  ])("folds '%s'", (expr, expected) => {
    expect(foldOf(expr)).toMatchObject({ kind: "boolean", value: expected });
  });

  it("gives 'and' tighter precedence than 'or'", () => {
    // (false and false) or true = true; false and (false or true) = false.
    expect(foldOf("false and false or true")).toMatchObject({ kind: "boolean", value: true });
  });
});

describe("'not' binds looser than a comparison and tighter than 'and'", () => {
  /**
   * `not`'s operand is parsed at `and`'s precedence (`parseExpr.ts`
   * NOT_OPERAND_MIN_PREC), which fixes three readings at once. Each test below
   * is red under a different wrong choice, so the constant is pinned from both
   * sides rather than only from above:
   *
   *  - operand parsed by `parsePrimary` (the shape unary '-' uses), or at
   *    comparison precedence: the first test alone goes red — `not 1 == 2`
   *    becomes `(not 1) == 2`, i.e. 'not' applied to a number.
   *  - operand parsed at `or`'s precedence: the second alone goes red. At 0,
   *    the second and third both do — `not` swallows the `and`/`or` after it.
   *
   * Verified by making each of those four edits and running the whole suite;
   * outside this describe nothing else noticed any of them, which is why these
   * three tests exist.
   */
  it("reads 'not a == b' as 'not (a == b)'", () => {
    expect(foldOf("not 1 == 2")).toMatchObject({ kind: "boolean", value: true });
  });

  it("reads 'not a and b' as '(not a) and b'", () => {
    // not (true and false) would be true.
    expect(foldOf("not true and false")).toMatchObject({ kind: "boolean", value: false });
  });

  it("reads 'not a or b' as '(not a) or b'", () => {
    // not (true or true) would be false.
    expect(foldOf("not true or true")).toMatchObject({ kind: "boolean", value: true });
  });

  it("charges the expression budget for every recursive 'not' operand", () => {
    const nestedNot = (count: number) => `${Array.from({ length: count }, () => "not").join(" ")} true`;

    expect(foldOf(nestedNot(50))).toMatchObject({ kind: "boolean", value: true });

    const diags = diagnosticsForExpr(nestedNot(51));
    expect(diags[0].message).toContain(
      "Math expression is too deeply nested. Maximum depth is 50.",
    );
  });

  it("charges the total budget for the 'not' operand, not only the expression one", () => {
    /**
     * `total` can only be the cap that fires where `expr` has been reset, and
     * `intoCoordinate` is the only thing that resets it — so pinning this edge
     * means putting the `not` underneath a point coordinate, where a boolean is
     * never legal. That looks like it should make the edge unpinnable, and it
     * is why it went unpinned: `not` yields a boolean, so no *valid* program
     * has a `not` below a coordinate.
     *
     * The observation window is that both diagnostics are reachable and their
     * order is fixed by the direction of travel. `checkNesting` runs on the way
     * *down*, before the operand is folded; `requireCoordinate` runs on the way
     * back *up*. So the invalid program still distinguishes the two versions of
     * this edge by *which* error it stops at.
     *
     * 40 point levels each holding 9 parens put the ctx at the `not` at exactly
     * total 400 — 40 x (1 coordinate + 9 groups) — with expr at 9 and struct at
     * 40, both far from their own 50s, so `total` is the only budget at its
     * edge. `intoUnary` takes it to 401 and the descent stops there.
     *
     * Drop the `total` advance from this one edge and the descent continues,
     * the operand folds to a boolean, and the innermost coordinate rejects it
     * instead. Verified: that mutation turns the first assertion below red and
     * leaves the rest of the suite green, which is exactly the gap this closes.
     */
    const nestedCoordinate = (levels: number, parens: number) => {
      let s = "not true";
      for (let i = 0; i < levels; i++) s = `(${"(".repeat(parens)}${s}${")".repeat(parens)}, 0)`;
      return s;
    };

    expect(diagnosticsForExpr(nestedCoordinate(40, 9))[0].message).toContain(
      "This value nests too deeply overall. Maximum total nesting is 400.",
    );

    // One level less — total 390 at the `not`, so nothing overflows and the
    // coordinate's own type error is what surfaces. This is what makes the
    // fixture above a *boundary*: without it, the same assertion would pass on
    // a build that charged `total` far too eagerly somewhere else entirely.
    expect(diagnosticsForExpr(nestedCoordinate(39, 9))[0].message).toContain(
      "A point coordinate must be a number, but got boolean.",
    );
  });
});

describe("type rules on the new operators", () => {
  it("rejects equality between different kinds instead of folding false", () => {
    const diags = diagnosticsForExpr("1 == red");
    expect(diags[0].message).toContain(
      "'==' compares two values of the same kind, but got number and color.",
    );
    expect(diags[0].message).toContain(
      "Comparing different kinds is an error rather than always false",
    );
  });

  it("rejects equality on a kind with no single primitive payload", () => {
    const diags = diagnosticsForExpr("(1, 2) == (1, 2)");
    expect(diags[0].message).toContain(
      "'==' cannot compare point values. Comparable kinds are number, string, boolean and color.",
    );
  });

  it("reports a mixed-kind comparison at the operator, not at either operand", () => {
    // Neither operand is wrong on its own — it is the pairing that fails — so
    // this diagnostic anchors differently from the operand-type ones above.
    const source = bindingOf("1 == red");
    const diags = diagnosticsFor(source);
    expect({ line: diags[0].line, col: diags[0].col }).toEqual(posAt(source, "=="));
  });

  it("rejects an ordering comparison on non-numbers", () => {
    const diags = diagnosticsForExpr("red < blue");
    expect(diags[0].message).toContain("The left operand of '<' must be a number, but got color.");
  });

  it("rejects a non-number on the right of an ordering comparison too", () => {
    const diags = diagnosticsForExpr("1 < blue");
    expect(diags[0].message).toContain("The right operand of '<' must be a number, but got color.");
  });

  it.each([
    ["1 and true", "and", "left", "number"],
    ["true and 1", "and", "right", "number"],
    ["red or true", "or", "left", "color"],
    ["true or red", "or", "right", "color"],
  ])("rejects '%s' — there is no truthiness", (expr, op, side, kind) => {
    const diags = diagnosticsForExpr(expr);
    expect(diags[0].message).toContain(
      `The ${side} operand of '${op}' must be a boolean, but got ${kind}. Marey has no truthiness — write an explicit comparison.`,
    );
  });

  it("rejects a non-boolean operand to 'not'", () => {
    const diags = diagnosticsForExpr("not 1");
    expect(diags[0].message).toContain(
      "'not' requires a boolean, but got number. Marey has no truthiness — write an explicit comparison.",
    );
  });
});

describe("comparisons are non-associative", () => {
  // Fix round: `toContain("cannot be chained.")` alone pins nothing about
  // *which* operator's name the template interpolates — a fixed string
  // substituted for `op.name` in `'${op.name}' cannot be chained.` would
  // still pass every row below. Each row now names the operator that
  // actually fires first for its own expression (the first of the pair,
  // per `parseExpr.ts`'s chaining check), so a wrong-operator regression in
  // the template is caught per-row rather than only by the shared suffix.
  it.each([
    ["1 < 2 < 3", "<"],
    ["1 == 2 == 3", "=="],
    ["1 < 2 == 3", "<"],
    ["1 >= 2 <= 3", ">="],
  ])(
    "rejects the chain '%s' rather than regrouping it",
    (expr, op) => {
      // Task 9 generalised this message off the comparison-specific wording,
      // since 'to' is now non-associative at a different precedence too: it
      // now names the first operator of the pair rather than saying
      // "Comparisons".
      const diags = diagnosticsForExpr(expr);
      expect(diags[0].message).toContain(`'${op}' cannot be chained.`);
    },
  );

  it("names both operators in the rewrite it suggests", () => {
    const diags = diagnosticsForExpr("1 < 2 == 3");
    expect(diags[0].message).toContain("Write 'a < b and b == c' rather than 'a < b == c'.");
  });

  it("still accepts comparisons combined through parentheses", () => {
    expect(foldOf("(1 < 2) == (3 < 4)")).toMatchObject({ kind: "boolean", value: true });
  });

  it("still accepts comparisons combined with 'and'", () => {
    expect(foldOf("1 < 2 and 3 < 4")).toMatchObject({ kind: "boolean", value: true });
  });
});

describe("reserved words that are not operators", () => {
  /**
   * `and` and `or` lex as EXPR_KEYWORD, the one token type Task 3 gave to all
   * eleven reserved expression words — so the operator table keys word
   * operators by the *word* rather than by the token type. Keying by token
   * type would make every reserved word bind as a single operator in the
   * middle of an expression, silently.
   *
   * That mistake is loud rather than subtle: making the lookup match any
   * EXPR_KEYWORD by token type turns 23 tests red across 8 files — the golden
   * IR snapshots, the LANGUAGE.md examples, and the existing `generate`
   * permission case in languageCuts.test.ts among them. These two fixtures are
   * here because none of those *names* the cause; both are red under that
   * change, and each says which word was eaten and where: `to` after a
   * `generate` start bound, `sin` after a property value.
   */
  it("leaves a reserved word after a complete value to the property parser", () => {
    const source = `scene { size: (10, 10) circle c { position: (0, 0) radius: 5 sin } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Expected ':' after the property name, but found '}'.");
  });
});

/* ------------------------------------------------------------------------ *
 * Task 6 — the conditional value expression (design 4.2, 4.3)
 * ------------------------------------------------------------------------ */

describe("conditional value expression", () => {
  it("folds to the 'then' branch when the condition holds", () => {
    expect(foldOf("if 1 == 1 then 10 else 20")).toMatchObject({ kind: "number", value: 10 });
  });

  it("folds to the 'else' branch when it does not", () => {
    expect(foldOf("if 1 == 2 then 10 else 20")).toMatchObject({ kind: "number", value: 20 });
  });

  it("carries a non-numeric kind through", () => {
    // Nothing about the result is numeric: a named color survives only as the
    // hex it resolves to, and both branches produce one.
    expect(foldOf("if true then red else blue")).toMatchObject({ kind: "color", value: "#ff0000" });
    expect(foldOf("if false then red else blue")).toMatchObject({ kind: "color", value: "#0000ff" });
  });

  it("chains through the else branch", () => {
    expect(foldOf("if false then 1 else if true then 2 else 3")).toMatchObject({
      kind: "number",
      value: 2,
    });
  });

  it("chains four deep and still reaches the last else", () => {
    expect(
      foldOf("if false then 1 else if false then 2 else if false then 3 else 4"),
    ).toMatchObject({ kind: "number", value: 4 });
  });
});

describe("the conditional is the loosest construct", () => {
  /**
   * All three sub-expressions are parsed at minimum precedence 0, and the else
   * branch is the one where that is observable rather than merely tidy. Each
   * test below is red under a different tightening, verified by making the edit
   * and running the whole suite; nothing outside this describe noticed any of
   * them.
   */
  it("extends the else branch as far right as it goes", () => {
    // `if true then 1 else (2 + 3)` = 1. The competing grouping,
    // `(if true then 1 else 2) + 3`, is 4 — so a *taken* then branch is what
    // distinguishes them. With the condition false the two agree at 5, which
    // is why the second assertion cannot stand alone: it only shows the '+ 3'
    // was not silently dropped.
    expect(foldOf("if true then 1 else 2 + 3")).toMatchObject({ kind: "number", value: 1 });
    expect(foldOf("if false then 1 else 2 + 3")).toMatchObject({ kind: "number", value: 5 });
    // The two fixtures above only reach down to precedence 5, so parsing the
    // branch at `and`'s 2 truncates it at the loosest operators and still left
    // the whole suite green — verified. Hence this third fixture: the 'or'
    // would be stranded after a conditional that has already returned, and
    // `foldOf`'s no-diagnostics assertion is what catches it.
    expect(foldOf("if false then false else false or true")).toMatchObject({
      kind: "boolean",
      value: true,
    });
  });

  it("takes a whole boolean expression as the condition", () => {
    // At any minimum precedence above 0 the condition stops at 'false' and the
    // 'or' is what `consumeWord` finds where it wanted 'then'.
    expect(foldOf("if false or true then 1 else 2")).toMatchObject({ kind: "number", value: 1 });
  });

  it("takes a whole arithmetic or boolean expression as the then branch", () => {
    // Likewise, and from both sides of the precedence table: at additive
    // precedence or tighter the branch stops at '1' and the '+' faces
    // `consumeWord`'s 'else'; at `and`'s precedence the second fixture stops at
    // 'false' and the 'or' does.
    expect(foldOf("if true then 1 + 2 else 0")).toMatchObject({ kind: "number", value: 3 });
    expect(foldOf("if true then false or true else false")).toMatchObject({
      kind: "boolean",
      value: true,
    });
  });

  it("may begin the operand of a tighter operator", () => {
    // `minPrec` is not consulted by the dispatch, so a conditional can start an
    // expression an operator is already waiting on, and then runs to the end of
    // its own else branch: 1 + (if true then 2 else (3 * 4)).
    expect(foldOf("1 + if true then 2 else 3 * 4")).toMatchObject({ kind: "number", value: 3 });
    expect(foldOf("1 + if false then 2 else 3 * 4")).toMatchObject({ kind: "number", value: 13 });
  });

  it("is not a primary, so unary '-' does not take one", () => {
    // The dispatch is in `parseExpr`, not in `parsePrimary` where '-' and 'not'
    // live — an expression is either a conditional or a precedence climb. This
    // is the one case where that placement is observable.
    const diags = diagnosticsForExpr("-if true then 1 else 2");
    expect(diags[0].message).toContain(
      "Unexpected reserved word 'if' where a property value was expected.",
    );
    expect(foldOf("-(if true then 1 else 2)")).toMatchObject({ kind: "number", value: -1 });
  });

  it("binds a trailing 'else' to the nearest unclosed 'if'", () => {
    // `if true then (if false then 1 else 2) else 3` = 2. The trailing else
    // cannot belong to the outer 'if' instead: the inner one would then have
    // none, and this grammar has no if-without-else form.
    expect(foldOf("if true then if false then 1 else 2 else 3")).toMatchObject({
      kind: "number",
      value: 2,
    });
  });

  it("permits a bare conditional as the condition", () => {
    // Deliberate, not incidental. Forbidding it would need a second entry into
    // the precedence climb that skips the dispatch, to reject a program that is
    // already unambiguous: 'then' is not an operator, so the inner conditional's
    // else branch stops there of its own accord.
    //   if (if true then false else true) then 1 else 2  ->  2
    expect(foldOf("if if true then false else true then 1 else 2")).toMatchObject({
      kind: "number",
      value: 2,
    });
  });
});

describe("type rules on the conditional", () => {
  it("requires a boolean condition — there is no truthiness", () => {
    const diags = diagnosticsForExpr("if 1 then 2 else 3");
    expect(diags[0].message).toContain(
      "An 'if' condition must be a boolean, but got number. Marey has no truthiness — write an explicit comparison such as 'i % 5 == 0'.",
    );
  });

  it("reports a non-boolean condition at the condition, not at the 'if'", () => {
    // Exactly one sub-expression is at fault, so this anchors like
    // `requireNumber` does rather than like `compareEqual`'s at-the-operator
    // mixed-kind message.
    const source = bindingOf("if 1 then 2 else 3");
    const diags = diagnosticsFor(source);
    expect({ line: diags[0].line, col: diags[0].col }).toEqual(posAt(source, "1 then"));
  });

  it("requires both branches to be the same kind", () => {
    const diags = diagnosticsForExpr("if false then 5 else red");
    expect(diags[0].message).toContain(
      "Both branches of an 'if' must be the same kind, but 'then' is number and 'else' is color.",
    );
  });

  it("reports the mismatch even when the taken branch is valid on its own", () => {
    // The condition is true, so the then branch alone folds to 5 and a parser
    // that returned early would never look at 'else red'. That is the shape
    // design 2.1 forbids: `radius:` would be a number or a color depending on
    // data. `diagnosticsForExpr` also asserts this is the *only* diagnostic, so
    // the construct is rejected rather than rejected-and-recovered-into-noise.
    const diags = diagnosticsForExpr("if true then 5 else red");
    expect(diags[0].message).toContain(
      "Both branches of an 'if' must be the same kind, but 'then' is number and 'else' is color.",
    );
    expect(diags[0].message).toContain(
      "Both branches are checked whichever one the condition selects, so a value's kind never depends on data.",
    );
  });

  it("reports a branch mismatch at the 'if', not at either branch", () => {
    // Neither branch is wrong on its own — it is the pairing that fails — so
    // this anchors the way `compareEqual` does and not the way the condition
    // check above does.
    const source = bindingOf("if true then 5 else red");
    const diags = diagnosticsFor(source);
    expect({ line: diags[0].line, col: diags[0].col }).toEqual(posAt(source, "if true"));
  });

  it("names what it found where 'then' belonged", () => {
    const diags = diagnosticsForExpr("if true 1 else 2");
    expect(diags[0].message).toContain(
      "Expected 'then' after the condition of an 'if', but found number 1.",
    );
  });

  it("names what it found where 'else' belonged", () => {
    const diags = diagnosticsForExpr("if true then 1");
    expect(diags[0].message).toContain(
      "Expected 'else' after the 'then' branch of an 'if', but found keyword 'scene'.",
    );
  });
});

describe("the conditional's recursion budgets", () => {
  it("charges the expression budget for every 'else if' in a chain", () => {
    const chain = (n: number) =>
      `${Array.from({ length: n }, (_, i) => `if false then ${i} else `).join("")}${n}`;

    // The k-th conditional sits at expr k-1, so its own three edges reach
    // expr k: 50 chained conditionals land exactly on the cap, 51 pass it.
    expect(foldOf(chain(50))).toMatchObject({ kind: "number", value: 50 });
    expect(diagnosticsForExpr(chain(51))[0].message).toContain(
      "Math expression is too deeply nested. Maximum depth is 50.",
    );
  });

  /**
   * Which budget rule a branch follows — the same choice `parseListLiteral`
   * faced for a list entry, and the same answer: the grouped-expression rule,
   * not the coordinate one. A branch costs one expression level and does not
   * reset the budget, and charges no structural level at all, because a
   * conditional is not a point or a list.
   *
   * Only a fixture sitting exactly on the cap can see it. Switching one edge to
   * `intoCoordinate` restarts `expr`, so 50 parens inside that branch fit where
   * they must not. Made separately, that swap left the whole suite green for
   * the condition and for the then branch until these fixtures existed; on the
   * else branch the chain test above caught it, and this one does too.
   */
  const nest = (n: number, inner: string) => `${"(".repeat(n)}${inner}${")".repeat(n)}`;

  it.each([
    ["condition", (n: number) => `if ${nest(n, "true")} then 1 else 2`],
    ["then branch", (n: number) => `if true then ${nest(n, "1")} else 2`],
    ["else branch", (n: number) => `if true then 1 else ${nest(n, "2")}`],
  ])("charges one non-resetting expression level for the %s", (_position, build) => {
    // The branch itself is level 1, so 49 more parens reach exactly 50.
    expect(foldOf(build(49))).toMatchObject({ kind: "number", value: 1 });
    expect(diagnosticsForExpr(build(50))[0].message).toContain(
      "Math expression is too deeply nested. Maximum depth is 50.",
    );
  });

  /**
   * That all three sub-expression edges advance `total`, pinned one edge at a
   * time — the corollary in AGENT-LESSONS 2c: a suite that goes red when you
   * revert all three tells you nothing about which of them is guarded.
   *
   * The window is the same one the `not` edge uses above. `total` can only be
   * the cap that fires where `expr` has been reset, and `intoCoordinate` is the
   * only reset — so the fixture has to put the conditional under a point
   * coordinate, where a boolean would be illegal anyway. `checkNesting` runs on
   * the way *down* and `requireCoordinate` on the way back *up*, so which of
   * the two errors surfaces is what distinguishes charging an edge from not.
   *
   * 19 point levels each holding 20 parens put the ctx at the innermost
   * expression at exactly total 399 — 19 x (1 coordinate + 20 groups) — with
   * expr at 20 and struct at 19, both far from their own 50s. Every one of the
   * conditional's three edges therefore lands on 400, the last legal value, and
   * a single redundant `(…)` in *one* branch position is what tips that branch
   * to 401. Drop the `total` advance from that one edge and the descent
   * completes instead, folding to a number the enclosing coordinate accepts —
   * so the diagnostic becomes the baseline test's coordinate complaint.
   * Verified by making each of the three mutations separately.
   */
  const nestedCoordinate = (inner: string) => {
    let s = inner;
    for (let i = 0; i < 19; i++) s = `(${"(".repeat(20)}${s}${")".repeat(20)}, 0)`;
    return s;
  };

  it("leaves a conditional sitting exactly on the total budget alone", () => {
    // This is what makes the three below a *boundary*: with no redundant parens
    // the descent completes and the complaint is the ordinary one about the
    // point one level up, never about nesting.
    expect(diagnosticsForExpr(nestedCoordinate("if true then 1 else 2"))[0].message).toContain(
      "A point coordinate must be a number, but got point.",
    );
  });

  it.each([
    ["condition", "if (true) then 1 else 2"],
    ["then branch", "if true then (1) else 2"],
    ["else branch", "if true then 1 else (2)"],
  ])("charges the total budget for the %s", (_position, inner) => {
    expect(diagnosticsForExpr(nestedCoordinate(inner))[0].message).toContain(
      "This value nests too deeply overall. Maximum total nesting is 400.",
    );
  });
});

describe("indexing and length", () => {
  it("reads an element by index", () => {
    expect(foldOf("[3,7,2][1]")).toMatchObject({ kind: "number", value: 7 });
  });

  it("indexes a point list, which is the same list kind", () => {
    expect(foldOf("[(1,2),(3,4)][0]")).toMatchObject({ kind: "point", x: 1, y: 2 });
  });

  it("chains through nested lists", () => {
    expect(foldOf("[[1,2],[3,4]][1][0]")).toMatchObject({ kind: "number", value: 3 });
  });

  it("indexes a name bound with 'let'", () => {
    const parsed = parse(lex(`let v = [3,7,2]\nlet x = v[1]\nscene { size: (100, 100) }`));
    expect(parsed.errors).toEqual([]);
    expect(parsed.env.x).toMatchObject({ kind: "number", value: 7 });
  });

  it("reports length", () => {
    expect(foldOf("length([3,7,2])")).toMatchObject({ kind: "number", value: 3 });
  });

  // Design 4.2: postfix binds tighter than unary '-'. If the minus branch calls
  // parsePrimary instead of parsePostfix this reads as -( [1,2] ) and errors.
  it("binds tighter than unary minus, so '-v[0]' negates the element", () => {
    expect(foldOf("-[5,9][1]")).toMatchObject({ kind: "number", value: -9 });
  });

  // The index is a full expression, and it is a *group*: it does not reset the
  // expression budget the way a point coordinate does.
  it("takes a whole expression as the index", () => {
    expect(foldOf("[10,20,30][1 + 1]")).toMatchObject({ kind: "number", value: 30 });
  });

  /**
   * Task 7's brief specifies `intoGroup` for the index expression, but no
   * fixture above distinguishes it from a bare, unadvanced `ctx` — every one
   * of them stays far under the 50-level expression cap either way. Verified
   * directly: swapping `intoGroup(ctx)` for a bare `ctx` in `parsePostfix`'s
   * index parse and running the whole suite leaves it entirely green.
   *
   * This fixture sits exactly on the boundary that only `intoGroup` produces.
   * The index costs one level for the bracket itself — matching a list entry,
   * per `parsePostfix`'s own comment — so 49 redundant parens *inside* the
   * index is the last depth that still folds (1 + 49 = 50) and 50 is the
   * first that overflows (1 + 50 = 51). Under a bare `ctx` the bracket costs
   * nothing, so the same 50-paren fixture would still fold (0 + 50 = 50) and
   * prove nothing — which is exactly the swap above, confirmed empirically.
   */
  const nestIndex = (n: number) => `${"(".repeat(n)}0${")".repeat(n)}`;

  it("charges the index expression one level like a group, not a bare pass-through", () => {
    expect(foldOf(`[9][${nestIndex(49)}]`)).toMatchObject({ kind: "number", value: 9 });
    expect(diagnosticsForExpr(`[9][${nestIndex(50)}]`)[0].message).toContain(
      "Math expression is too deeply nested. Maximum depth is 50.",
    );
  });

  /**
   * Same gap, same fix, for `length`'s argument: the brief's `intoGroup(ctx)`
   * is likewise unpinned by every fixture above. Verified the same way —
   * swapping it for a bare `ctx` in the 'length' branch and running the whole
   * suite leaves it green.
   *
   * The argument costs one level for the call's own parentheses, and the
   * list argument's own single entry costs a second one via
   * `parseListLiteral`'s `intoGroup(ctx)` — a level `nestIndex` above does not
   * pay, since its inner value is a bare number rather than a list entry. So
   * 48 redundant parens around the list argument is the last depth that folds
   * (1 + 48 + 1 = 50) and 49 is the first that overflows (1 + 49 + 1 = 51); a
   * bare `ctx` in the 'length' branch would only reach 0 + 49 + 1 = 50 at that
   * same depth and still fold, proving nothing.
   *
   * The list argument is a single element, `[3]`, deliberately with no comma.
   * `parseParenOrPoint`'s forward scan for a point-marking comma tracks paren
   * nesting only, not bracket nesting, so a comma *inside* a list that sits
   * directly under exactly one paren pair is misread as a point separator —
   * confirmed directly: `foldOf("([1,2,3])")` throws "A point coordinate must
   * be a number, but got list" today, on unmodified `main`, unrelated to this
   * task. A single-element list has no comma for that pre-existing bug to
   * misread, so this fixture sidesteps it rather than exercising it.
   */
  const nestLengthArg = (n: number) => `${"(".repeat(n)}[3]${")".repeat(n)}`;

  it("charges the length argument one level like a group, not a bare pass-through", () => {
    expect(foldOf(`length(${nestLengthArg(48)})`)).toMatchObject({ kind: "number", value: 1 });
    expect(diagnosticsForExpr(`length(${nestLengthArg(49)})`)[0].message).toContain(
      "Math expression is too deeply nested. Maximum depth is 50.",
    );
  });

  it("rejects an out-of-range index, naming the index and the length", () => {
    const msg = diagnosticsForExpr("[1,2][5]")[0].message;
    // The brief's own draft asserted "index 5" (lowercase), but the message
    // template capitalises "Index" at the start of the sentence — toContain is
    // case-sensitive, so the lowercase form never matches. The wording stands
    // (design section 8 only requires the diagnostic name the index and the
    // length); the assertion is corrected to match the actual sentence case.
    expect(msg).toContain("Index 5");
    expect(msg).toContain("length 2");
  });

  // Fix round 1, Important 2: the brief's own fixtures only ever put a
  // non-integer or negative *number* in the index position, so
  // `index.kind !== "number"` (parseExpr.ts) had no fixture anywhere that
  // reached it — confirmed by deleting the guard and running the whole
  // suite (518/518 stayed green). The guard's *presence* is type-enforced
  // (without it, `index.value` on a non-number `AstValue` variant fails
  // `tsc`), but its message and reachability were unverified. Pinned here.
  it("rejects a non-number index, naming the kind", () => {
    expect(diagnosticsForExpr("[1,2][true]")[0].message).toContain("must be a number, but got boolean");
  });

  it("rejects a non-integer index", () => {
    expect(diagnosticsForExpr("[1,2][0.5]")[0].message).toContain("whole number");
  });

  it("rejects a negative index rather than wrapping", () => {
    const msg = diagnosticsForExpr("[1,2][-1]")[0].message;
    // Same case-sensitivity correction as the out-of-range test above: the
    // shared "Index ... is out of range" template capitalises "Index".
    expect(msg).toContain("Index -1");
  });

  it("rejects indexing a non-list, naming the kind", () => {
    const msg = diagnosticsForExpr("5[0]")[0].message;
    expect(msg).toContain("only a list can be indexed");
    // The name alone does not pin the *kind* being reported: `${value.kind}`
    // in the template could be swapped for a constant or dropped and the
    // assertion above stays green. This one only survives if the message
    // actually names "number".
    expect(msg).toContain("Cannot index a number");
  });

  it("rejects length of a non-list, naming the kind", () => {
    const msg = diagnosticsForExpr("length(5)")[0].message;
    expect(msg).toContain("'length' requires a list");
    // Same gap as above: `${arg.kind}` could be dropped and the assertion
    // above alone would not notice. Pin the actual kind too.
    expect(msg).toContain("but got number");
  });

  it("anchors an out-of-range index at the '[', not at the end of the expression", () => {
    const source = bindingOf("[1,2][5]");
    const diags = diagnosticsFor(source);
    // `posAt(source, "[")` finds the *first* '[' in the source, which is the
    // list literal's opening bracket, not the index bracket the diagnostic is
    // meant to anchor on — the whole point of this test. The fixture locator
    // is corrected to "[5]", whose position is the index's own '[', while the
    // anchor in parsePostfix stays on openTok as designed.
    //
    // Position alone is not enough to pin this: before indexing exists, `[5]`
    // is simply unparsed top-level input, and the parser's pre-existing
    // "must begin with 'scene'" recovery diagnostic happens to land at that
    // very column too (verified — it passes on position alone with no
    // indexing support at all). Asserting the message keeps this test from
    // going green for that unrelated reason.
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Index 5");
    expect(diags[0]).toMatchObject(posAt(source, "[5]"));
  });
});

describe("trigonometry", () => {
  // `toMatchObject`'s primitive-field comparison is exact equality, which is
  // the point: Math.sin(Math.PI) is 1.2246e-16, and a naive radian conversion
  // fails every one of the four `0`/`1` rows below outright — confirmed by
  // revert check 1 (task-8-report.md), which shows this exact table's
  // `sin(180)`/`cos(90)`/`cos(270)` rows going red on that float noise. A
  // separate "exact at the cardinal angles" test was cut in fix round 1: it
  // asserted `toBe(0)` twice and never `1` at all (a name that claimed more
  // than it checked), and was fully subsumed by this table regardless — see
  // the revert-1 evidence above for proof that this `it.each` alone already
  // discriminates the exactness property, at both `0` and `1`.
  it.each([
    ["sin(0)", 0], ["sin(90)", 1], ["sin(180)", 0], ["sin(270)", -1],
    ["cos(0)", 1], ["cos(90)", 0], ["cos(180)", -1], ["cos(270)", 0],
  ])("evaluates %s in degrees", (expr, expected) => {
    expect(foldOf(expr)).toMatchObject({ kind: "number", value: expected });
  });

  /**
   * The brief's own two rows here (`sin(-90)`, `cos(720)`) do not actually
   * discriminate the `+ 360` correction this test claims to pin. Worked out
   * with `node -e` before writing this test:
   *
   *  - `-90 % 360` is `-90`, which matches none of the cardinal checks, so
   *    the reverted (uncorrected) code falls through to
   *    `Math.sin((-90 * Math.PI) / 180)` — which is exactly `-1` in IEEE 754
   *    double precision, the mirror image of `Math.sin(Math.PI / 2) === 1`.
   *  - `810 % 360` is `90`, already non-negative, so the correction never
   *    triggers for `cos(720)` (routed through `sinDegrees(810)`) at all.
   *
   * Both rows pass unchanged even with `deg % 360` in place of
   * `((deg % 360) + 360) % 360` — confirmed by the revert in
   * task-8-report.md, revert check 2. `sin(-180)` is added because it is not
   * this lucky: `-180 % 360` is `-180` (matches no cardinal), and
   * `Math.sin(-Math.PI)` is `-1.2246...e-16`, not `0` — the exact float-noise
   * failure the cardinal-exactness design exists to prevent, reached through
   * the negative-angle branch instead of the direct one. The original two
   * rows are kept: they still exercise the reduction path, even though they
   * do not pin the correction on their own.
   */
  it("reduces angles outside 0-360 before the cardinal check", () => {
    expect(foldOf("sin(-90)")).toMatchObject({ value: -1 });
    expect(foldOf("cos(720)")).toMatchObject({ value: 1 });
    expect(foldOf("sin(-180)")).toMatchObject({ value: 0 });
  });

  it("is still approximate off the cardinal angles", () => {
    expect((foldOf("sin(30)") as { value: number }).value).toBeCloseTo(0.5, 10);
  });

  it("places a dot on a circle without hand-computed coordinates", () => {
    // 180 * cos(0) = 180 exactly; the radial-dots case.
    expect(foldOf("400 + 180 * cos(0)")).toMatchObject({ value: 580 });
  });

  it("takes a whole expression as the argument", () => {
    expect(foldOf("sin(45 + 45)")).toMatchObject({ value: 1 });
  });

  it("rejects a non-numeric argument, naming the kind", () => {
    // The brief's own assertion checked only `toContain("requires a
    // number")`, which `Unary '-' requires a number, but got ...` also
    // satisfies — the identical neighbouring-path trap Task 7's review found
    // for the index and 'length' rejections ("naming the kind", above).
    // `red` is a NAMED_COLOR (languageContract.ts), so the argument's kind is
    // `color`; pin that the way the index/length fixtures do.
    const msg = diagnosticsForExpr("sin(red)")[0].message;
    expect(msg).toContain("'sin' requires a number of degrees");
    expect(msg).toContain("but got color");
  });

  it("has no pi constant", () => {
    expect(diagnosticsForExpr("sin(pi)")[0].message).toContain("Undefined variable 'pi'");
  });

  /**
   * Fix round 1, Minor 4: `sin`/`cos` is the first fold in this module that
   * can put `NaN` in the IR, and `applyBinary`'s `%`/`/` arms already refuse
   * to do that (division/modulo by zero throw rather than yielding `NaN`).
   *
   * The lexer rejects any single literal that itself parses to `Infinity`
   * (`lexer/handlers.ts`) and rejects scientific notation outright, so
   * neither `sin(1e400)` nor a 400-digit literal reaches the parser at all —
   * both fixtures were tried directly and both are lexer errors, confirmed
   * before writing this one. But `*` (`parseExpr.ts`'s `applyBinary`) has no
   * overflow guard, so two separately-finite literals can still multiply past
   * `Number.MAX_VALUE` (~1.8e308): `1` followed by 159 zeros is `1e159`,
   * finite and lexer-legal on its own, and `1e159 * 1e159 = 1e318` overflows
   * to `Infinity` — confirmed with `node -e` before writing this fixture.
   * `sinDegrees(Infinity)` is `NaN` (`Infinity % 360` is `NaN` in JavaScript),
   * which is exactly the silent-NaN outcome the guard exists to catch.
   */
  const hugeLiteral = "1" + "0".repeat(159);

  it("rejects a non-finite argument reached by overflowing '*', not a silent NaN", () => {
    const msg = diagnosticsForExpr(`sin(${hugeLiteral} * ${hugeLiteral})`)[0].message;
    expect(msg).toContain("'sin' requires a finite number of degrees");
    expect(msg).toContain("but got Infinity");
  });

  /**
   * Same gap as Task 7's index and 'length' fixtures (see
   * "charges the index expression..." / "charges the length argument..."
   * above): the brief's `intoGroup(ctx)` for the trig argument is unpinned
   * by every fixture above it. Verified directly — swapping `intoGroup(ctx)`
   * for a bare `ctx` in the sin/cos branch and running the whole suite left
   * it entirely green (see task-8-report.md).
   *
   * The argument costs one level for the call's own parenthesis, matching
   * the index bracket exactly (not `length`'s argument, which pays a second
   * level for its list literal), so 49 redundant parens around a bare number
   * is the last depth that still folds (1 + 49 = 50) and 50 is the first
   * that overflows (1 + 50 = 51).
   */
  const nestTrigArg = (n: number) => `${"(".repeat(n)}0${")".repeat(n)}`;

  it("charges the trig argument one level like a group, not a bare pass-through", () => {
    expect(foldOf(`sin(${nestTrigArg(49)})`)).toMatchObject({ kind: "number", value: 0 });
    expect(diagnosticsForExpr(`sin(${nestTrigArg(50)})`)[0].message).toContain(
      "Math expression is too deeply nested. Maximum depth is 50.",
    );
  });
});

/* ------------------------------------------------------------------------ *
 * Task 9 — the 'A to B' range (design section 8)
 * ------------------------------------------------------------------------ */

describe("range", () => {
  it("builds an inclusive list of integers", () => {
    const r = foldOf("0 to 3") as ListValue;
    expect(r.kind).toBe("list");
    expect(r.value.map((v) => (v as { value: number }).value)).toEqual([0, 1, 2, 3]);
  });

  it("binds looser than subtraction, so '0 to n - 1' is a range of n items", () => {
    const parsed = parse(lex(`let n = 12\nlet r = 0 to n - 1\nscene { size: (100, 100) }`));
    expect(parsed.errors).toEqual([]);
    expect((parsed.env.r as ListValue).value).toHaveLength(12);
  });

  it("binds tighter than comparison, so '0 to 3 == x' compares the list", () => {
    // Precedence 4 sits below comparison at 3, so the range folds first and the
    // '==' then rejects a list operand. The diagnostic naming 'list' is what
    // distinguishes this from 'to' having been given precedence 2.
    expect(diagnosticsForExpr("0 to 3 == 1")[0].message).toContain("list");
  });

  it("yields the empty list when the end precedes the start", () => {
    expect((foldOf("5 to 1") as ListValue).value).toHaveLength(0);
  });

  it("rejects non-integer bounds", () => {
    expect(diagnosticsForExpr("0 to 2.5")[0].message).toContain("whole numbers");
  });

  it("rejects a range longer than the list ceiling", () => {
    expect(diagnosticsForExpr("0 to 10001")[0].message).toContain("10,000");
  });

  it("applies the same ceiling to a list literal", () => {
    const literal = `[${Array.from({ length: 10001 }, (_, i) => i).join(",")}]`;
    expect(diagnosticsForExpr(literal)[0].message).toContain("10,000");
  });

  it("rejects a chained range rather than regrouping it", () => {
    expect(diagnosticsForExpr("0 to 3 to 5")[0].message).toContain("cannot be chained");
  });

  // The corpus shape. Commas between properties are optional and no .eval scene
  // uses them, so this — not the comma'd version — is what protects the corpus.
  it("still allows 'to' as a property name with no separating comma", () => {
    const src = `scene { size:(100,100)\n circle c { position:(0,0)\n radius:5\n animate {\n property: alpha\n to: 0.5\n duration: 1\n } } }`;
    expect(parse(lex(src)).errors).toEqual([]);
  });

  it("still allows 'to' as a property name with a comma", () => {
    const src = `scene { size:(100,100) circle c { position:(0,0), radius:5 animate { property: position, to: (10,10), duration: 1 } } }`;
    expect(parse(lex(src)).errors).toEqual([]);
  });

  /**
   * The two fixtures above do not actually pin the lookahead guard: `property`
   * is the one property key whose value is a bare identifier, and
   * `parseValue.ts:11` special-cases exactly that — `property: alpha` returns
   * an `animProperty` value without ever entering `parseExpr`'s operator loop
   * at all, so the loop never gets a chance to misread the following `to`.
   * Confirmed by deleting the guard and running both fixtures above: neither
   * goes red. Every '.eval' animate block puts 'to' right after 'property',
   * so the guard happens not to be load-bearing for that exact shape — but it
   * is load-bearing for any other comma-free ordering, which property order is
   * not restricted to at parse time. This fixture puts a plain-number
   * property ('duration') directly before 'to', which does fold through the
   * ordinary operator loop, and is what actually exercises the guard.
   */
  it("still allows 'to' as a property name straight after an ordinary folded value", () => {
    const src = `scene { size:(100,100)\n circle c { position:(0,0)\n radius:5\n animate {\n property: alpha\n duration: 1\n to: 0.5\n } } }`;
    expect(parse(lex(src)).errors).toEqual([]);
  });

});
