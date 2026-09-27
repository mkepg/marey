import { describe, it, expect } from "vitest";
import { compile } from "./index";

describe("compile (the public entry)", () => {
  it("returns the IR and no errors for a valid scene", () => {
    const out = compile(`scene { size: (800, 600) circle c { position: (1, 2), radius: 3 } }`);
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
    expect(out.ir!.width).toBe(800);
  });

  it("returns the errors and a null IR for invalid source", () => {
    const out = compile("banana");
    expect(out.ok).toBe(false);
    expect(out.ir).toBeNull();
    expect(out.errors[0].message).toContain("must begin with the 'scene' keyword");
  });

  // The public type is deliberately narrower than CompileOutcome, so
  // compileSource's internal fields (symbols, tokenCount,
  // topLevelObjectCount) can change without a breaking release (spec §2.3).
  it("exposes exactly ok, ir and errors", () => {
    expect(Object.keys(compile("banana")).sort()).toEqual(["errors", "ir", "ok"]);
  });
});
