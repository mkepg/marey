import { describe, it, expect } from "vitest";
import {
  advanceAnimTime,
  animProgress,
  advancePhysicsTime,
  type AnimTime,
  type PhysicsTime,
} from "./timeline";

function makeAnim(over: Partial<AnimTime> = {}): AnimTime {
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

describe("advanceAnimTime", () => {
  it("advances one tick per call", () => {
    const t = makeAnim();
    advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(1);
    advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(2);
  });

  it("completes exactly once, on the tick it reaches its duration", () => {
    const t = makeAnim({ durationTicks: 3 });
    expect(advanceAnimTime(t)).toBe(false);
    expect(advanceAnimTime(t)).toBe(false);
    expect(advanceAnimTime(t)).toBe(true);
    expect(t.completed).toBe(true);
    expect(advanceAnimTime(t)).toBe(false);
  });

  it("reverses direction at the end when yoyo is set", () => {
    const t = makeAnim({ durationTicks: 2, yoyo: true });
    advanceAnimTime(t);
    advanceAnimTime(t);
    expect(t.direction).toBe(-1);
    expect(t.completed).toBe(false);
    advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(1);
  });

  it("restarts from zero when looping", () => {
    const t = makeAnim({ durationTicks: 2, loop: true });
    advanceAnimTime(t);
    advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(0);
    expect(t.completed).toBe(false);
  });

  it("completes a non-looping yoyo once on the return tick", () => {
    const t = makeAnim({ durationTicks: 2, yoyo: true });
    expect([1, 2, 3].map(() => advanceAnimTime(t))).toEqual([false, false, false]);
    expect(advanceAnimTime(t)).toBe(true);
    expect(t).toMatchObject({ elapsedTicks: 0, direction: -1, completed: true });
    expect(advanceAnimTime(t)).toBe(false);
  });

  it("completes a non-looping yoyo at exactly 2x durationTicks", () => {
    // The off-by-one guard: the return leg is the same length as the outbound
    // one, so completion lands on tick 2n, never 2n±1.
    for (const durationTicks of [1, 2, 3, 10]) {
      const t = makeAnim({ durationTicks, yoyo: true });
      let completedAt = -1;
      for (let i = 1; i <= durationTicks * 4; i++) {
        if (advanceAnimTime(t)) { completedAt = i; break; }
      }
      expect(completedAt).toBe(durationTicks * 2);
      expect(t.elapsedTicks).toBe(0);
    }
  });

  it("keeps ping-ponging forever when a yoyo also loops", () => {
    // The permission case beside the completion above: `loop: true` is still
    // the way to ask for endless there-and-back motion, and must not complete.
    const t = makeAnim({ durationTicks: 2, loop: true, yoyo: true });
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      expect(advanceAnimTime(t)).toBe(false);
      seen.push(t.elapsedTicks);
    }
    expect(seen).toEqual([1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0]);
    expect(t.completed).toBe(false);
  });

  it("takes the same number of ticks regardless of how they are batched", () => {
    const a = makeAnim({ durationTicks: 240 });
    const b = makeAnim({ durationTicks: 240 });

    let aTicks = 0;
    while (!a.completed) { advanceAnimTime(a); aTicks++; }

    let bTicks = 0;
    for (let batch = 0; batch < 100 && !b.completed; batch++) {
      for (let i = 0; i < 7 && !b.completed; i++) { advanceAnimTime(b); bTicks++; }
    }

    expect(bTicks).toBe(aTicks);
    expect(aTicks).toBe(240);
  });
});

describe("animProgress", () => {
  it("reports progress as a fraction of the duration", () => {
    const t = makeAnim({ durationTicks: 10, elapsedTicks: 5 });
    expect(animProgress(t, 0)).toBeCloseTo(0.5, 5);
  });

  it("interpolates toward the next tick using alpha", () => {
    const t = makeAnim({ durationTicks: 10, elapsedTicks: 5 });
    expect(animProgress(t, 0.5)).toBeCloseTo(0.55, 5);
  });

  it("interpolates backwards when reversing", () => {
    const t = makeAnim({ durationTicks: 10, elapsedTicks: 5, direction: -1 });
    expect(animProgress(t, 0.5)).toBeCloseTo(0.45, 5);
  });

  it("ignores alpha once completed so the end state is exact", () => {
    const t = makeAnim({ durationTicks: 10, elapsedTicks: 10, completed: true });
    expect(animProgress(t, 0.9)).toBe(1);
  });

  it("reports exactly the start value for a completed yoyo, ignoring alpha", () => {
    // Characterizes animProgress's pre-existing completed-state handling
    // (`sub = t.completed ? 0 : ...`, unchanged by P3A-10) at the specific
    // AnimTime a completed non-looping yoyo now lands on: elapsed 0, direction
    // -1. It does not exercise advanceAnimTime, so it would pass unmodified
    // against the pre-P3A-10 code too — it is not itself a regression test for
    // that fix. What it does pin is the value the fix's completion state must
    // read as: without this, `elapsedTicks: 0` could be read as progress 0 OR
    // 1 depending on which edge `p < 0` / `p > 1` clamps toward with alpha
    // still applied; the "ignores alpha" branch above is what removes that
    // ambiguity. The actual regression test for P3A-10 is `advanceAnimTime`'s
    // "completes a non-looping yoyo once on the return tick" in this file.
    const t = makeAnim({ durationTicks: 10, elapsedTicks: 0, direction: -1, completed: true, yoyo: true });
    expect(animProgress(t, 0.9)).toBe(0);
  });

  it("clamps to the 0..1 range", () => {
    const low = makeAnim({ durationTicks: 10, elapsedTicks: 0, direction: -1 });
    expect(animProgress(low, 0.9)).toBe(0);

    const high = makeAnim({ durationTicks: 10, elapsedTicks: 10 });
    expect(animProgress(high, 0.9)).toBe(1);
  });
});

function makePhysics(over: Partial<PhysicsTime> = {}): PhysicsTime {
  return { elapsedTicks: 0, durationTicks: 10, completed: false, ...over };
}

describe("advancePhysicsTime", () => {
  it("advances one tick per call", () => {
    const t = makePhysics();
    advancePhysicsTime(t);
    expect(t.elapsedTicks).toBe(1);
  });

  it("completes exactly once, on the tick it reaches its duration", () => {
    const t = makePhysics({ durationTicks: 2 });
    expect(advancePhysicsTime(t)).toBe(false);
    expect(advancePhysicsTime(t)).toBe(true);
    expect(t.completed).toBe(true);
    expect(advancePhysicsTime(t)).toBe(false);
  });

  it("never completes when the duration is indefinite", () => {
    const t = makePhysics({ durationTicks: null });
    for (let i = 0; i < 1000; i++) advancePhysicsTime(t);
    expect(t.completed).toBe(false);
  });
});
