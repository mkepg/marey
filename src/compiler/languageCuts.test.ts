import { describe, expect, it } from "vitest";
import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";

/**
 * Task 9 (Phase 3A): an executable regression matrix pinning the roadmap's
 * settled cuts and deferrals — spec §4's language cuts, Phase 3B's excluded
 * expressiveness, and Phase 7's deferred physics syntax. Every case here is
 * expected to fail on first run, because these constructs are already
 * outside the grammar and the property contract in languageContract.ts. This
 * file exists so a future phase cannot reintroduce one of them by accident
 * without a test noticing.
 *
 * Each rejection case is deliberately built as a *minimal* fixture — every
 * other required property is present and valid — so the single diagnostic it
 * produces can only be caused by the one construct under test, not by some
 * unrelated missing-property or syntax error in the fixture.
 */

interface Diagnostic {
  readonly message: string;
  readonly line?: number;
  readonly col?: number;
}

/**
 * Captures lex, parse, and type errors as positioned diagnostics.
 *
 * `parse()` and `typeCheck()` both accumulate `CompilerError[]` (with
 * line/col already attached), but a *lex*-phase failure is a single thrown
 * plain object (see lexer/state.ts `LexerState.err`), not an accumulated
 * array. This normalizes all three phases to one shape instead of silently
 * discarding position for the lex case, which a message-only capture would.
 */
function diagnosticsFor(source: string): Diagnostic[] {
  try {
    const parsed = parse(lex(source));
    if (parsed.errors.length || !parsed.ast) return parsed.errors;
    return typeCheck(parsed.ast).errors;
  } catch (error) {
    if (typeof error === "object" && error !== null && "message" in error) {
      const e = error as { message: unknown; line?: unknown; col?: unknown };
      return [{
        message: String(e.message),
        line: typeof e.line === "number" ? e.line : undefined,
        col: typeof e.col === "number" ? e.col : undefined,
      }];
    }
    return [{ message: String(error) }];
  }
}

function messagesFor(source: string): string[] {
  return diagnosticsFor(source).map((d) => d.message);
}

/** 1-indexed line/col of the first occurrence of `needle` in `source`. */
function posAt(source: string, needle: string): { line: number; col: number } {
  const idx = source.indexOf(needle);
  if (idx === -1) throw new Error(`fixture is missing needle ${JSON.stringify(needle)}`);
  const before = source.slice(0, idx);
  const lines = before.split("\n");
  return { line: lines.length, col: lines.at(-1)!.length + 1 };
}

describe("roadmap cut: physics properties that never shipped", () => {
  // mass, friction, collisionCategory, collisionMask are spec §4's cut list.
  // lockPosition, lockRotation, spin are Phase 7 deferrals — new names that
  // do not exist yet. isStatic and angularVelocity are the *old* names those
  // will replace; the roadmap is explicit that neither name has shipped, so
  // both must be rejected identically today.
  it.each([
    ["mass", "5"],
    ["friction", "0.5"],
    ["collisionCategory", "2"],
    ["collisionMask", "4"],
    ["lockPosition", "true"],
    ["lockRotation", "true"],
    ["spin", "90"],
    ["isStatic", "true"],
    ["angularVelocity", "5"],
  ])("rejects physics property '%s' as unknown", (prop, value) => {
    const source = `scene { size:(100,100) circle c { position:(0,0), radius:10, physics { duration:1, ${prop}: ${value} } } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain(`has an unknown property '${prop}'`);
    const labelPos = posAt(source, `${prop}: ${value}`);
    expect(diags[0].line).toBe(labelPos.line);
    expect(diags[0].col).toBe(labelPos.col + `${prop}: `.length);
  });
});

describe("roadmap cut: general mutable variables", () => {
  it("rejects rebinding a 'let' in the same scope", () => {
    const source = `let x = 1 let x = 2 scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Variable 'x' is already defined in this immediate scope.");
    const pos = posAt(source, "let x = 2");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col + "let ".length);
  });

  it("rejects a bare assignment 'x = 2' (no assignment statement exists)", () => {
    const source = `scene { size:(10,10) x = 2 }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Expected ':' after the property name, but found '='.");
    const pos = posAt(source, "=");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });
});

describe("roadmap cut: user-defined functions, scripting runtime, plugin system, world", () => {
  // None of these words are lexer keywords, so each is read as a bare
  // top-level identifier — which the file grammar only ever accepts as
  // 'let' or 'template', immediately before the single 'scene' block.
  it.each([
    ["function", "function greet() { }"],
    ["import", "import foo"],
    ["while", "while true { }"],
    ["plugin", "plugin foo { }"],
    ["world", "world { gravity: (0, 900) }"],
  ])("rejects top-level '%s' construct", (word, stmt) => {
    const source = `${stmt} scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain(`found identifier '${word}'`);
    expect(diags[0].message).toContain("must begin with the 'scene' keyword");
    const pos = posAt(source, word);
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });

  // 'if' moved from this bucket in Phase 3B: it is no longer a bare
  // identifier (see "expression keywords" in lexer.test.ts), so it fails
  // one step earlier with a different, more specific message.
  it("rejects top-level 'if' construct as a reserved word, not a bare identifier", () => {
    const source = `if true { } scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain(`found reserved word 'if'`);
    expect(diags[0].message).toContain("must begin with the 'scene' keyword");
    const pos = posAt(source, "if");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });
});

describe("roadmap cut: arbitrary objects in source", () => {
  it("rejects an object literal as a value", () => {
    const source = `let obj = { a: 1 } scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Unexpected '{' where a property value was expected.");
    const pos = posAt(source, "{ a: 1 }");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });
});

describe("roadmap cut: network/file access in source", () => {
  it("rejects a bare call-like identifier 'fetch(...)' — no function-call syntax exists", () => {
    const source = `scene { size:(10,10) circle c { position:(0,0), radius: fetch("http://x") } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Undefined variable 'fetch'.");
    const pos = posAt(source, "fetch(");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });
});

describe("Phase 3B lift: trig", () => {
  // Lifted by Phase 3B (roadmap 8.1, R5). Angles are in DEGREES, matching
  // `rotation` — the only other angle in the language.
  it.each(["sin(45)", "cos(45)"])("allows trig function '%s' in degrees", (expr) => {
    expect(messagesFor(`scene { size:(10,10) circle c { position:(0,0), radius: 100 + ${expr} } }`)).toEqual([]);
  });

  // Deliberately NOT shipped — design section 11, deviation 1. A pi constant
  // beside degree-based trig is a trap: sin(pi) would be 0.0548, not 0.
  it("has no pi constant", () => {
    const source = `scene { size:(10,10) circle c { position:(0,0), radius: sin(pi) } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Undefined variable 'pi'");
  });
});

describe("Phase 3B lift: one list kind", () => {
  // Staleness fix (Task 12): this block's title used to end "; indexing
  // still excluded". The indexing test that justified that clause was moved
  // out to its own "Phase 3B lift: indexing" block below (see that block's
  // comment), which made the clause both untested here and false anyway —
  // indexing is lifted, not excluded. Renamed to match the sibling
  // "Phase 3B lift: X" blocks instead of leaving the vacated half of the
  // title behind.
  // Lifted by Phase 3B (roadmap 8.1): [...] is a general list.
  it("allows a bare number list, which Phase 3B lifts", () => {
    expect(messagesFor(`let nums = [1,2,3] scene { size:(10,10) }`)).toEqual([]);
  });

  it("still rejects a non-point element on 'points', now from the contract", () => {
    const source = `scene { size:(100,100) polygon p { position:(0,0), points: [(0,0), 5, (5,10)] } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("element 1");
    expect(diags[0].message).toBe(
      "'polygon' object 'p': 'points' expects a list where every element is a point (x, y), but element 1 is a number.",
    );
    // Positioned at the offending element itself, not at the whole list.
    const pos = posAt(source, "5,");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });
});

describe("Phase 3B lift: indexing", () => {
  // Fix round 1, Minor 7: this test used to live in the "one list kind;
  // indexing still excluded" block above, which made that block's title false
  // the moment the test asserted the opposite of "excluded". Moved here to
  // match the file's own convention for a pure lift (see "Phase 3B lift:
  // modulo and comparisons" below) rather than leave a title contradicting
  // its own content in the one file whose job is to record what the language
  // excludes.
  //
  // Phase 3B lifts this cut (roadmap 8.1; design section 11, deviation 2):
  // indexing ships alongside direct iteration rather than instead of it,
  // because parallel lists — values with labels — need it.
  it("allows indexing, which Phase 3B lifts for parallel lists", () => {
    expect(messagesFor(`let pts = [(0,0),(1,1)] let first = pts[0] scene { size:(10,10) }`)).toEqual([]);
  });
});

describe("Phase 3B lift: modulo and comparisons", () => {
  // Lifted by Phase 3B, whose Task 5 gave the parser a rule for each of these.
  // Authority: roadmap 8.1 ("Modulo"; "Equality and basic numeric
  // comparison"), grammar and type rules settled in the Phase 3B design,
  // sections 4.1-4.3.
  //
  // Each of the three cases below is the inversion of the exclusion case it
  // replaces, on the same fixture: what used to assert that no parser rule
  // existed now asserts that the rule exists and folds to the right value. The
  // folded value is asserted, not just the absence of diagnostics — an
  // operator quietly dropped would satisfy "no diagnostics" too.
  it("allows '%' modulo, which Phase 3B lifts", () => {
    const parsed = parse(lex(`let x = 7 % 4 scene { size:(10,10) }`));
    expect(parsed.errors).toEqual([]);
    expect(parsed.env.x).toMatchObject({ kind: "number", value: 3 });
  });

  it("allows '<' comparison, which Phase 3B lifts", () => {
    const parsed = parse(lex(`let x = 1 < 2 scene { size:(10,10) }`));
    expect(parsed.errors).toEqual([]);
    expect(parsed.env.x).toMatchObject({ kind: "boolean", value: true });
  });

  it("allows '==' comparison, and the property contract still rejects its result on 'radius'", () => {
    // The old exclusion case used this fixture to show '==' had no parser
    // rule at all ("Expected a property name, but found '=='"). It parses now,
    // so what is left is the *contract* refusing a boolean where a number
    // belongs — a type-phase diagnostic, which is the proof the parse
    // succeeded. Lifting the operator did not loosen the property contract.
    const source = `scene { size:(10,10) circle c { position:(0,0), radius: 1 == 2 } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toBe(
      "'circle' object 'c': property 'radius' expects a number, but got a boolean (true or false).",
    );
  });

  // Retained, not lifted: the operators arrived, the truthiness did not.
  // Design section 4.3 is explicit that 'and'/'or'/'not' take booleans only.
  it("still rejects a non-boolean operand to 'and' — there is no truthiness", () => {
    const diags = diagnosticsFor(`let x = 1 and true scene { size:(10,10) }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain(
      "The left operand of 'and' must be a boolean, but got number. Marey has no truthiness — write an explicit comparison.",
    );
  });
});

describe("Phase 3B lift: conditional value expression", () => {
  // Lifted by Phase 3B, whose Task 6 gave the parser an if/then/else rule.
  // Authority: roadmap 8.1 ("a conditional"), decided by R4 ("'Every fifth item
  // differs' requires a decision as well as a remainder"); the grammar and the
  // type rules are settled in the Phase 3B design, sections 4.1-4.3.
  //
  // The inversion runs on the same fixture as the exclusion case it replaces,
  // and asserts the folded value rather than only the absence of diagnostics —
  // a construct quietly dropped would satisfy "no diagnostics" too.
  it("allows an inline 'if...then...else' value, which Phase 3B lifts", () => {
    const source = `scene { size:(10,10) circle c { position:(0,0), radius: if true then 1 else 2 } }`;
    expect(messagesFor(source)).toEqual([]);
    expect(parse(lex(source)).ast?.children[0].props.radius).toMatchObject({
      kind: "number",
      value: 1,
    });
  });

  // Retained, not lifted. The conditional lives in *value* position only: it
  // decides what a property is, never whether an object exists (design 2.1).
  // The top-level statement form is already covered by "rejects top-level 'if'
  // construct as a reserved word" above; this is the in-scene one, which is
  // where an author would actually reach for a guard.
  //
  // It fails at the missing ':' rather than at 'if', because a reserved word is
  // admitted where a *property name* goes — the gate that keeps
  // `animate { to: ... }` working. Only the first diagnostic is pinned: the
  // three that follow are recovery walking out of the block 'if true {' opened,
  // and their number is recovery behaviour rather than a language rule.
  it("still rejects 'if' as an emission guard inside the scene", () => {
    const source = `scene { size:(10,10) if true { circle c { position:(0,0), radius:5 } } }`;
    const diags = diagnosticsFor(source);
    expect(diags[0].message).toBe(
      "In the scene: Expected ':' after the property name, but found token 'true'.",
    );
    const pos = posAt(source, "true");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });

  // Retained for the same reason 'and'/'or' kept theirs: the operator arrived,
  // the truthiness did not (design 4.3).
  it("still rejects a non-boolean 'if' condition — there is no truthiness", () => {
    const diags = diagnosticsFor(`let x = if 1 then 2 else 3 scene { size:(10,10) }`);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain(
      "An 'if' condition must be a boolean, but got number. Marey has no truthiness — write an explicit comparison such as 'i % 5 == 0'.",
    );
  });

  // The design names this exact fixture (section 4.3): without the rule,
  // `radius: if flag then 5 else red` compiles whenever `flag` is true and a
  // value's *kind* becomes data-dependent, which is where design 2.1 is
  // easiest to cross by accident. The condition here is true, so the taken
  // branch is valid on its own and only the untaken one is wrong.
  it("still rejects branches of different kinds, taken branch or not", () => {
    const source = `scene { size:(10,10) circle c { position:(0,0), radius: if true then 5 else red } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain(
      "Both branches of an 'if' must be the same kind, but 'then' is number and 'else' is color.",
    );
  });
});

describe("Phase 3B reservation regression: parseGenerate's 'in' collection recovery", () => {
  // A valid `in` header reaches collection parsing, where the rejected `}`
  // must remain unconsumed before recovery. Consuming it would move
  // synchronize() past the group close and create a spurious third diagnostic
  // before the following sibling can be parsed.
  it("reports exactly two diagnostics for a 'generate' missing its collection, not three", () => {
    const source = `scene { size:(10,10) group g { generate i in } circle ok { position:(0,0), radius:5 } } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(2);
    expect(diags[0].message).toContain("Unexpected '}' where a property value was expected.");
    expect(diags[1].message).toContain("Unexpected '}' after the scene block closed.");
  });
});

describe("Phase 3A permission neighbors", () => {
  it("allows immutable shadowing across nested scopes", () => {
    const source = `
      let x = 1
      scene {
        size: (10, 10)
        circle c {
          let x = 2
          position: (0, 0)
          radius: x
        }
      }
    `;
    expect(messagesFor(source)).toEqual([]);
  });

  it("allows ordinary arithmetic in a value expression", () => {
    const source = `
      let a = 2 + 3 * 4
      scene {
        size: (10, 10)
        circle c { position: (0, 0), radius: a }
      }
    `;
    expect(messagesFor(source)).toEqual([]);
  });

  it("allows a point list on 'points'", () => {
    const source = `
      scene {
        size: (100, 100)
        polygon p { position: (0, 0), points: [(0, 0), (10, 0), (5, 10)] }
      }
    `;
    expect(messagesFor(source)).toEqual([]);
  });

  it("allows 'generate' to produce a run of objects", () => {
    const source = `
      scene {
        size: (200, 100)
        generate i in 0 to 2 {
          circle dot { position: (i * 50, 50), radius: 5 }
        }
      }
    `;
    expect(messagesFor(source)).toEqual([]);
  });

  it("allows every current physics property", () => {
    const source = `
      scene {
        size: (100, 100)
        circle c {
          position: (0, 0)
          radius: 10
          physics {
            velocity: (1, 2)
            gravity: (0, 980)
            airDrag: 0.1
            bounce: 0.5
            collideBounds: true
            duration: 2
          }
        }
      }
    `;
    expect(messagesFor(source)).toEqual([]);
  });

  it("allows every current animation property", () => {
    const source = `
      scene {
        size: (100, 100)
        circle c {
          position: (0, 0)
          radius: 10
          animate {
            property: position
            to: (10, 10)
            duration: 1
            easing: easeInOut
            loop: false
            yoyo: false
            handoff: false
          }
        }
      }
    `;
    expect(messagesFor(source)).toEqual([]);
  });

  // The rejections above must come from the *property* contract, not from a
  // blanket keyword ban — every cut word must still work as an ordinary
  // binding/object name and value reference.
  it.each([
    "mass", "friction", "collisionCategory", "collisionMask",
    "lockPosition", "lockRotation", "spin", "isStatic", "angularVelocity",
    "function", "import", "fetch", "while", "plugin", "world",
  ])("keeps cut word '%s' usable as an ordinary identifier, not a reserved word", (word) => {
    const source = `
      let ${word} = 5
      scene {
        size: (10, 10)
        circle ${word} { position: (0, 0), radius: ${word} }
      }
    `;
    expect(messagesFor(source)).toEqual([]);
  });

  // Phase 3B reserves these as expression operators. They were ordinary
  // identifiers until this phase; the roadmap authority is 8.1 and the
  // grammar is settled in the Phase 3B design, section 6.1.
  //
  // Asserting only the *first* diagnostic, not the count: rejecting an
  // object name throws before that object's own '{' is consumed, so the
  // parser's generic synchronize() recovery (parser/state.ts) resyncs mid
  // object rather than skipping it whole and can cascade into further
  // diagnostics once a sibling object follows — see the second `circle ok`
  // below, which exercises exactly that shape. Fixing the cascade means
  // changing synchronize(), which is cross-cutting parser recovery used by
  // every error path in the language; out of scope for reserving eleven
  // words. The real requirement is that the rejection is clearly reported
  // as a reserved word, which the first diagnostic always is.
  //
  // The assertion below pins the exact hint text ("<word> is a reserved
  // expression word"), not just the substring "reserved": describeToken's
  // own EXPR_KEYWORD rendering ("reserved word 'sin'", state.ts) already
  // contains "reserved" on its own, so a bare `toContain("reserved")` would
  // keep passing even with the parseObject.ts/parseUse.ts hint deleted —
  // verified by temporarily deleting it and re-running this suite, which
  // stayed green under the weaker assertion and went red under this one.
  it.each(["if", "then", "else", "and", "or", "not", "sin", "cos", "length", "in", "to"])(
    "reserves expression word '%s' so it cannot be an object name",
    (word) => {
      const source = `scene { size: (10, 10) circle ${word} { position: (0, 0), radius: 5 } circle ok { position: (0, 0), radius: 5 } }`;
      const diags = diagnosticsFor(source);
      expect(diags.length).toBeGreaterThan(0);
      expect(diags[0].message).toContain(`'${word}' is a reserved expression word`);
    },
  );

  it("reserves an expression word as a 'use' instance name too", () => {
    // parseUse's instance-name check (parser/parseUse.ts) is a separate code
    // path from parseObject's object-name check, and was not covered by the
    // it.each above. Same reasoning on asserting only diags[0]: no
    // brace-skip recovery here either, so a sibling property inside the
    // 'use' block can cascade the same way.
    const source = `
      template T(r) {
        circle c { position: (0, 0), radius: r }
      }
      scene {
        size: (100, 100)
        use T(5) sin { }
      }
    `;
    const diags = diagnosticsFor(source);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].message).toContain("'sin' is a reserved expression word");
  });

  it("reserves an expression word as a 'let' binding name too", () => {
    // parseBinding's name check (parser/parseBinding.ts) is a third
    // separate code path from parseObject's and parseUse's, and had zero
    // coverage of its own hint text: deleting the hint line left the whole
    // 404-test suite green. Pinning the exact wording here, same as the
    // object-name and use-instance-name cases above.
    const source = `let sin = 5 scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].message).toContain("'sin' is a reserved expression word");
  });

  it("still exercises the scene-level property-name gate for a reserved word", () => {
    // The scene-level property gate (parser/index.ts) admits EXPR_KEYWORD
    // the same way parseObject's and parseUse's do, but nothing exercised
    // it: reverting just that one arm left the full suite green. 'to' is
    // not a scene property, so this is a *type*-phase rejection ("unknown
    // property"), not a parse-phase "expected a property name" — proof the
    // gate let the token through as a property-name attempt instead of
    // rejecting it on the spot.
    const source = `scene { size:(10,10) to: (1,2) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("has an unknown property 'to'");
  });

  it("still exercises the 'use'-body property-name gate for a reserved word", () => {
    // Same reasoning as the scene-level case above, for parseUse's other
    // property gate (parser/parseUse.ts, the one inside a 'use' instance's
    // '{ }' override block — distinct from the instance-*name* gate tested
    // above). 'to' is not a group property, so this is an "unknown
    // property" type error, proving the token reached property-name
    // position instead of being rejected as "expected a property name".
    const source = `
      template T(r) {
        circle c { position: (0, 0), radius: r }
      }
      scene {
        size: (100, 100)
        use T(5) inst { to: (1, 2) }
      }
    `;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("has an unknown property 'to'");
  });

  it("still allows 'to' as a property name, because animate declares one", () => {
    const source = `
      scene {
        size: (100, 100)
        circle c {
          position: (0, 0)
          radius: 10
          animate { property: position, to: (10, 10), duration: 1 }
        }
      }
    `;
    expect(messagesFor(source)).toEqual([]);
  });
});

describe("Phase 3B line: data determines values, source structure determines shape", () => {
  // Design section 2.1. Reading the source alone tells you how many objects a
  // program emits and what they are named. A predicate may never gate emission.
  //
  // Every assertion below was verified by running the fixture and reading
  // the real diagnostic (not guessed) — see task-12-report.md for the raw
  // output, and the whole-branch review fix report for the re-derived output
  // behind the function-definition and list-element-assignment cases, whose
  // fixtures moved inside the scene block after the originals were found to
  // be intercepted by an unrelated top-level gate. Every fixture here now
  // places its construct somewhere ordinary Marey content is allowed, so
  // the diagnostic asserted is caused by the construct under test.

  it("rejects a conditional used as an emission guard", () => {
    // 'if' is EXPR_KEYWORD, which the property-name grammar admits as a
    // token that could start a property name, so parsing fails expecting
    // ':' where it finds 'true' instead — a generic property-syntax error,
    // not an invented semantic "no emission guards" message. Same mechanism
    // and message as "still rejects 'if' as an emission guard inside the
    // scene" in the "Phase 3B lift: conditional value expression" block
    // above; kept here too so section 2's rejection matrix is complete in
    // one place. diags[1..3] are recovery walking out of the block
    // 'if true {' opened (same shape that test's own comment describes).
    // Only diags[0] is pinned, matching that sibling test's own convention:
    // the cascade count is recovery behaviour, not a language rule, and
    // pinning it would make this test fragile to unrelated recovery changes.
    const source = `scene { size:(10,10) if true { circle c { position:(0,0), radius:1 } } }`;
    const diags = diagnosticsFor(source);
    expect(diags[0].message).toBe(
      "In the scene: Expected ':' after the property name, but found token 'true'.",
    );
    const pos = posAt(source, "true");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });

  it("rejects a filter clause on generate", () => {
    // No 'where' grammar exists at all: parseGenerate expects '{' right
    // after the collection expression ('0 to 4') and finds the identifier
    // 'where' instead. Same recovery shape as the case above — diags[1..3]
    // are the parser walking back out of the partially-opened block. Only
    // diags[0] is pinned, for the same reason as that case: the cascade
    // count is recovery behaviour, not a language rule.
    const source = `scene { size:(10,10) generate i in 0 to 4 where i % 2 == 0 { circle c { position:(0,0), radius:1 } } }`;
    const diags = diagnosticsFor(source);
    expect(diags[0].message).toBe(
      "In the scene: Expected '{' to open a block, but found identifier 'where'.",
    );
    const pos = posAt(source, "where");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });

  // 'while' is not a recognized keyword, so 'generate's body-parsing loop
  // rejects it as an unexpected token where an object definition, 'let',
  // 'use', or 'generate' was expected. It additionally leaves its own stray
  // '{' behind: recovery skips past 'while' and 'true' and stops at the
  // '{', which the loop then rejects as a second unexpected token before it
  // reaches the '}' that closes the while-body and ends the loop. That
  // second diagnostic is recovery noise, not the rule under test — the same
  // cascade-count fragility the two cases above deliberately don't pin — so,
  // like them, only diags[0] is asserted here rather than a total count.
  it("rejects the loop-control construct 'while'", () => {
    const word = "while";
    const source = `scene { size:(10,10) generate i in 0 to 1 { while true { } } }`;
    const diags = diagnosticsFor(source);
    expect(diags[0].message).toBe(
      `In 'generate' block: Expected an object definition, 'let', 'use', or 'generate', but found identifier '${word}'.`,
    );
    const pos = posAt(source, word);
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });

  // 'break' and 'continue' are likewise unrecognized, but neither leaves a
  // trailing brace behind, so each produces exactly one diagnostic — not a
  // cascade, so pinning the count here isn't the fragility 'while' has above.
  const loopControlCases: Array<[word: string, stmt: string]> = [
    ["break", "break"],
    ["continue", "continue"],
  ];
  it.each(loopControlCases)(
    "rejects the loop-control construct '%s'",
    (word, stmt) => {
      const source = `scene { size:(10,10) generate i in 0 to 1 { ${stmt} } }`;
      const diags = diagnosticsFor(source);
      expect(diags).toHaveLength(1);
      expect(diags[0].message).toBe(
        `In 'generate' block: Expected an object definition, 'let', 'use', or 'generate', but found identifier '${word}'.`,
      );
      const pos = posAt(source, word);
      expect(diags[0].line).toBe(pos.line);
      expect(diags[0].col).toBe(pos.col);
    },
  );

  it("rejects calling a 'let'-bound name as if it were a function", () => {
    // No call syntax exists over arbitrary names: 'f' resolves as a bare
    // variable reference, and the trailing '(2)' is leftover syntax the
    // property-parsing loop rejects as an unexpected token where the next
    // property name was expected.
    const source = `let f = 5 scene { size:(10,10) circle c { position:(0,0), radius: f(2) } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toBe(
      "In 'circle' object 'c': Expected a property name, but found '('.",
    );
    const pos = posAt(source, "(2)");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });

  // Both of the next two used to place their construct at the *top level*,
  // ahead of the scene block — where the pre-existing "must begin with the
  // 'scene' keyword" gate (parser/index.ts) intercepts any leading
  // identifier before parsing can reach a function-definition or
  // list-mutation rule. They therefore asserted that unrelated gate's
  // message (the same one "roadmap cut: user-defined functions, scripting
  // runtime, plugin system, world" above already pins) and would have stayed
  // green if a later phase added either construct *inside* a scene body.
  // Both now put the construct inside the scene, where ordinary Marey
  // content lives, so what is being rejected is the construct itself.

  // Inside a scene body, 'function' and 'operator' are ordinary identifiers
  // sitting in property-name position, so the property grammar consumes the
  // word and then demands the ':' that every scene property has. Each fixture
  // leaves a 3-diagnostic cascade behind — recovery walking back out of the
  // '{ }' body the fixture opens — so, following this file's convention for
  // the 'while' and 'where' cases above, only diags[0] is pinned: the cascade
  // count is recovery behaviour, not a language rule.
  const definitionCases: Array<[word: string, stmt: string, found: string, needle: string]> = [
    ["function", "function double(x) { }", "identifier 'double'", "double"],
    ["operator", "operator +(a, b) { }", "'+'", "+"],
  ];
  it.each(definitionCases)(
    "rejects defining an operator or function ('%s')",
    (_word, stmt, found, needle) => {
      const source = `scene { size:(10,10) ${stmt} }`;
      const diags = diagnosticsFor(source);
      expect(diags[0].message).toBe(
        `In the scene: Expected ':' after the property name, but found ${found}.`,
      );
      const pos = posAt(source, needle);
      expect(diags[0].line).toBe(pos.line);
      expect(diags[0].col).toBe(pos.col);
    },
  );

  // Reading an element is valid Marey as of Phase 3B (see "Phase 3B lift:
  // indexing" above), so what these fixtures reject is the *assignment*, not
  // the index expression: the same scene with 'radius: v[0]' in place of the
  // assignment compiles with zero diagnostics. 'v' is a genuinely bound list
  // in both rows, so neither can be passing for an unknown-identifier error.
  // The two rows cover the two gates a stray statement can meet inside a
  // scene — the scene body's property-name grammar, and the 'generate' body's
  // object/'let'/'use'/'generate' loop — because a mutation rule added to
  // either one has to be caught. Each produces exactly one diagnostic, so
  // unlike the cascading cases above the count is pinned here.
  //
  // Note the needles: posAt(source, "[") would resolve to the *list
  // literal's* bracket rather than the index's, so the first row anchors on
  // "[0]" instead.
  const listAssignmentCases: Array<[where: string, source: string, message: string, needle: string]> = [
    [
      "the scene body",
      `scene { size:(10,10) let v = [1,2] v[0] = 5 }`,
      "In the scene: Expected ':' after the property name, but found '['.",
      "[0]",
    ],
    [
      "a 'generate' body",
      `scene { size:(10,10) generate i in 0 to 1 { let v = [1,2] v[0] = 5 } }`,
      "In 'generate' block: Expected an object definition, 'let', 'use', or 'generate', but found identifier 'v'.",
      "v[0]",
    ],
  ];
  it.each(listAssignmentCases)(
    "rejects assigning to a list element in %s",
    (_where, source, message, needle) => {
      const diags = diagnosticsFor(source);
      expect(diags).toHaveLength(1);
      expect(diags[0].message).toBe(message);
      const pos = posAt(source, needle);
      expect(diags[0].line).toBe(pos.line);
      expect(diags[0].col).toBe(pos.col);
    },
  );

  it("rejects rebinding a list, since bindings stay immutable", () => {
    const source = `let v = [1,2] let v = [3,4] scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("already defined in this immediate scope");
  });

  it("still rejects string concatenation", () => {
    const source = `scene { size:(10,10) text t { position:(0,0), content: "a" + "b" } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("String concatenation using '+' is not supported.");
  });
});
