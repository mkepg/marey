/**
 * Fix 4 (Phase 3A review): the fixed-tick conversion (`TICK_HZ`,
 * `secondsToTicks`) belongs in a pipeline-neutral module both the
 * typeChecker and the renderer import, not in `renderer/clock.ts` — which
 * made `typeChecker/validator.ts` the only `typeChecker/ -> renderer/`
 * import in the codebase. `sceneIR.ts` already sits at that neutral level,
 * so this is where the one implementation now lives; `clock.ts` re-exports
 * it rather than keeping a second copy.
 */
import { describe, it, expect } from "vitest";
import { TICK_HZ, secondsToTicks } from "./sceneIR";
import {
  TICK_HZ as clockTickHz,
  TICK_MS,
  TICK_SECONDS,
  secondsToTicks as clockSecondsToTicks,
} from "./renderer/clock";
import validatorSource from "./typeChecker/validator.ts?raw";
import clockSource from "./renderer/clock.ts?raw";

describe("sceneIR tick math (pipeline-neutral home)", () => {
  it("computes whole simulation ticks at 120Hz, rounding and clamping to at least 1", () => {
    expect(TICK_HZ).toBe(120);
    expect(secondsToTicks(1)).toBe(120);
    expect(secondsToTicks(1.5)).toBe(180);
    expect(secondsToTicks(4)).toBe(480);
    expect(secondsToTicks(0)).toBe(1);
    expect(secondsToTicks(0.0001)).toBe(1);
  });

  it("clock.ts re-exports the exact same TICK_HZ and secondsToTicks — one implementation, not two", () => {
    // Reference equality on the function proves clock.ts isn't holding its
    // own copy of the Math.round(seconds * 120) formula.
    expect(clockSecondsToTicks).toBe(secondsToTicks);
    expect(clockTickHz).toBe(TICK_HZ);
    expect(TICK_MS).toBe(1000 / TICK_HZ);
    expect(TICK_SECONDS).toBe(1 / TICK_HZ);
  });

  it("clock.ts source no longer defines its own secondsToTicks function body", () => {
    expect(clockSource).not.toMatch(/function\s+secondsToTicks/);
  });

  it("validator.ts no longer imports the render stage's clock module", () => {
    // This was the only typeChecker/ -> renderer/ import in the codebase —
    // the type-check stage reaching into the render stage. It must now
    // import the conversion from the pipeline-neutral sceneIR.ts instead.
    expect(validatorSource).not.toMatch(/from\s+["']\.\.\/renderer\/clock["']/);
    expect(validatorSource).toMatch(/secondsToTicks/);
  });
});
