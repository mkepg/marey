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
  });

  it("returns parse errors and no IR", () => {
    const out = compileSource(`circle c { }`);
    expect(out.ok).toBe(false);
    expect(out.ir).toBeNull();
    expect(out.errors.length).toBeGreaterThan(0);
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
});
