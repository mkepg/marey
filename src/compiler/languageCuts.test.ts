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
    ["if", "if true { }"],
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

describe("Phase 3B exclusion: trig", () => {
  it.each([
    ["sin", "sin(45)"],
    ["cos", "cos(45)"],
  ])("rejects trig function '%s(...)' — no function-call syntax exists", (name, expr) => {
    const source = `scene { size:(10,10) circle c { position:(0,0), radius: ${expr} } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain(`Undefined variable '${name}'.`);
    const pos = posAt(source, expr);
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });
});

describe("Phase 3B exclusion: lists and indexing", () => {
  it("rejects a bare number list '[1,2,3]' — only point lists parse inside '[...]'", () => {
    const source = `let nums = [1,2,3] scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Each entry in a point list must be a point");
    const pos = posAt(source, "1,2,3");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });

  it("rejects index syntax 'pts[0]' — a value reference consumes only the bare name", () => {
    const source = `let pts = [(0,0),(1,1)] let first = pts[0] scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("must begin with the 'scene' keyword");
    expect(diags[0].message).toContain("found '['");
    const pos = posAt(source, "[0]");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });
});

describe("Phase 3B exclusion: modulo and comparisons", () => {
  it("rejects '%' modulo — not a character the lexer accepts", () => {
    const source = `let x = 1 % 2 scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Unexpected character '%'");
    const pos = posAt(source, "%");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });

  it("rejects '<' comparison — not a character the lexer accepts", () => {
    const source = `let x = 1 < 2 scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Unexpected character '<'");
    const pos = posAt(source, "<");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });

  it("rejects '==' comparison — leftover tokens are not a property name", () => {
    const source = `scene { size:(10,10) circle c { position:(0,0), radius: 1 == 2 } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Expected a property name, but found '='.");
    const pos = posAt(source, "==");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });
});

describe("Phase 3B exclusion: conditional value expression", () => {
  it("rejects an inline 'if...then...else' value", () => {
    const source = `scene { size:(10,10) circle c { position:(0,0), radius: if true then 1 else 2 } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Undefined variable 'if'.");
    const pos = posAt(source, "if true");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
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
        generate i from 0 to 2 {
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
    "function", "import", "fetch", "while", "if", "plugin", "world", "sin", "cos",
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
});
