import { describe, it, expect } from "vitest";
import { advanceAnimTime, animProgress, type AnimTime } from "./timeline";

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

  it("rests at zero when a yoyo without loop returns to the start", () => {
    const t = makeAnim({ durationTicks: 2, yoyo: true });
    for (let i = 0; i < 10; i++) advanceAnimTime(t);
    expect(t.elapsedTicks).toBe(0);
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

  it("clamps to the 0..1 range", () => {
    const low = makeAnim({ durationTicks: 10, elapsedTicks: 0, direction: -1 });
    expect(animProgress(low, 0.9)).toBe(0);

    const high = makeAnim({ durationTicks: 10, elapsedTicks: 10 });
    expect(animProgress(high, 0.9)).toBe(1);
  });
});
