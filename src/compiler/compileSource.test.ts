import { describe, it, expect } from "vitest";
import { compileSource } from "./compileSource";

describe("compileSource", () => {
  it("compiles a valid scene to IR", () => {
    const out = compileSource(`scene { size: (800, 600) circle c { position: (1, 2), radius: 3 } }`);
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
    expect(out.ir!.width).toBe(800);
    // Registry ids are scope-qualified, not bare — confirmed by running this
    // exact source and reading the actual key (AGENT-LESSONS §3d).
    expect(Object.keys(out.ir!.registry)).toEqual(["scene.c"]);
    // `topLevelObjectCount` is the second widening beyond the brief's spec
    // (the worker's `[parser] AST root: scene, N top-level object(s)` line
    // needs it and the brief only anticipated tokenCount) — pin it here
    // rather than leave it untested.
    expect(out.topLevelObjectCount).toBe(1);
    // `tokenCount` is the widening the brief *did* anticipate, and the more
    // dangerous of the two to leave unpinned: `compiler.worker.ts` prints
    // `out.tokenCount - 1` for `[lexer]   N tokens`, one of the three lines
    // Global Constraint 3 names by hand, and the worker itself has no
    // automated test. 26 confirmed by running this exact source through
    // compileSource and reading the real value (AGENT-LESSONS §3d): "scene"
    // KEYWORD, "{", "size" IDENT, ":", "(", "800", ",", "600", ")", "circle"
    // KEYWORD, "c" IDENT, "{", "position" IDENT, ":", "(", "1", ",", "2",
    // ")", ",", "radius" IDENT, ":", "3", "}", "}" = 25 content tokens + EOF.
    expect(out.tokenCount).toBe(26);
  });

  it("returns parse errors and no IR", () => {
    const out = compileSource(`circle c { }`);
    expect(out.ok).toBe(false);
    expect(out.ir).toBeNull();
    expect(out.errors.length).toBeGreaterThan(0);
    // Pins the tag the eval harness's phase partition (Step 5) and the
    // worker's `firstPhase === "PARSE"` branch both depend on. Without this,
    // the test above would still pass unchanged if parsing started throwing
    // instead of returning errors — the exact regression the worker's
    // `[parser]` branch would silently stop covering (reviewer Minor 7).
    expect(out.errors[0].phase).toBe("PARSE");
  });

  it("returns type errors and no IR", () => {
    const out = compileSource(`scene { size: (800, 600) circle c { position: (1, 2), radius: -3 } }`);
    expect(out.ok).toBe(false);
    expect(out.ir).toBeNull();
    // The brief's fixture asserted "greater than zero" (spelled out), but the
    // "positive" constraint branch (validator.ts) produces "greater than 0"
    // with a digit — confirmed by running the validator directly on this
    // exact source (AGENT-LESSONS §3d: a verbatim fixture is a claim to check).
    expect(out.errors.map((e) => e.message).join("\n")).toContain("greater than 0");
    // Same reasoning as the PARSE phase tag above, for the eval harness's
    // typeErrors bucket and the worker's `firstPhase === "TYPE"` branch.
    expect(out.errors[0].phase).toBe("TYPE");
  });

  it("reports binding and object names as symbols", () => {
    const out = compileSource(`let r = 5\nscene { size: (800, 600) circle dot { position: (1, 2), radius: r } }`);
    expect(out.symbols).toContain("r");
    expect(out.symbols).toContain("dot");
  });

  it("turns a thrown error into a diagnostic rather than propagating it", () => {
    // The brief's fixture was a whitespace-only source. Verified empirically
    // (probe run against `parse(lex(" ".repeat(4)))`) that this does NOT
    // throw: `parse()` throws a ParseException internally for an empty file
    // and catches it in its own outer try/catch, returning a normal PARSE
    // error — the same path exercised by the "returns parse errors" test
    // above. It does not exercise compileSource's own catch block at all.
    //
    // A source that fails to *lex* genuinely throws all the way out of the
    // pipeline: `lex()` throws a raw `{ phase: "LEX", ... }` object before
    // `parse()` is ever called, so nothing internal catches it and it must
    // reach compileSource's own try/catch to come back as a CompileOutcome
    // instead of propagating — which is the behaviour this test's name
    // claims and the worker (and the CLI's exit code) rely on.
    const out = compileSource("!");
    expect(out.ok).toBe(false);
    expect(out.errors.length).toBeGreaterThan(0);
    expect(out.errors[0].phase).toBe("LEX");
  });

  it("still reports a real tokenCount when lexing succeeds but parsing throws (the 50-error abort)", () => {
    // Fix round 1 (Important 1): the parser's 50-error abort
    // (`parser/state.ts:112-115`,`:137-139`) is reachable from ordinary (if
    // badly malformed) user input — e.g. pasting a large non-Marey document
    // into the editor — not an internal invariant, and it throws a plain
    // `Error` that escapes every `instanceof ParseException` guard. Before
    // this fix, `compileSource`'s `tokens` variable was declared inside the
    // `try`, so the `catch` block could not see it and always reported
    // `tokenCount: 0` here — which silently dropped the worker's
    // `[lexer]   N tokens` line (one of Global Constraint 3's three named
    // lines) for this reachable case. `tokens` is now hoisted above the
    // `try` so the catch block can still read how far lexing got.
    //
    // "x: 1" repeated 52 times inside a scene block: the first occurrence is
    // legitimate, each of the next 50 triggers one "Property 'x' is defined
    // more than once" PARSE error (pushed to `state.errors`), and the 52nd
    // clause — the 51st duplicate — is the one `throwError` call that finds
    // `state.errors.length >= 50` and throws the plain abort Error instead.
    // Verified empirically (probe run, not guessed): 51 duplicates is the
    // exact boundary — 50 duplicates produces 50 structured errors and no
    // throw, 51 throws.
    const clauses = Array.from({ length: 52 }, () => "x: 1").join(" ");
    const out = compileSource(`scene { ${clauses} }`);
    expect(out.ok).toBe(false);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].phase).toBe("RUNTIME");
    expect(out.errors[0].message).toContain("Maximum error limit reached");
    // The load-bearing assertion for this fix: lexing this source succeeds
    // (it is well-formed at the token level), so tokenCount must reflect the
    // real token count, not the pre-fix 0.
    expect(out.tokenCount).toBe(160);
  });
});
