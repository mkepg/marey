import { describe, expect, it } from "vitest";
import { evaluateEasing, releaseEndOf, type ReleaseEnd } from "./easing";

const EASINGS = ["linear", "easeIn", "easeOut", "easeInOut"] as const;
const RELEASES: ReleaseEnd[] = [null, "end", "start"];

/**
 * Slope at t = 0 and t = 1 for every easing and release end. The reshaped
 * rows are Phase 6C spec §2.2; every other entry is the usual curve's slope.
 */
const SLOPES: Record<string, Record<(typeof EASINGS)[number], [number, number]>> = {
  none: { linear: [1, 1], easeIn: [0, 2], easeOut: [2, 0], easeInOut: [0, 0] },
  end: { linear: [1, 1], easeIn: [0, 2], easeOut: [2, 0.5], easeInOut: [0, 0.5] },
  start: { linear: [1, 1], easeIn: [0.5, 2], easeOut: [2, 0], easeInOut: [0.5, 0] },
};

/** The curves as they were before Phase 6C, kept here as the reference. */
function legacy(t: number, easing: string): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  switch (easing) {
    case "easeIn": return t * t;
    case "easeOut": return t * (2 - t);
    case "easeInOut": return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default: return t;
  }
}

describe("evaluateEasing", () => {
  for (const release of RELEASES) {
    for (const easing of EASINGS) {
      const label = `${easing}, release ${release ?? "none"}`;

      it(`${label}: starts at 0 and ends at 1`, () => {
        expect(evaluateEasing(0, easing, release)).toBe(0);
        expect(evaluateEasing(1, easing, release)).toBe(1);
      });

      it(`${label}: never moves backwards`, () => {
        let prev = 0;
        for (let i = 1; i <= 1000; i++) {
          const e = evaluateEasing(i / 1000, easing, release);
          expect(e).toBeGreaterThanOrEqual(prev);
          prev = e;
        }
      });

      it(`${label}: has the slopes of spec §2.2 at both ends`, () => {
        const h = 1e-6;
        const [s0, s1] = SLOPES[release ?? "none"][easing];
        expect(evaluateEasing(h, easing, release) / h).toBeCloseTo(s0, 3);
        expect((1 - evaluateEasing(1 - h, easing, release)) / h).toBeCloseTo(s1, 3);
      });
    }
  }

  for (const easing of EASINGS) {
    it(`${easing} with no release end is the pre-6C curve exactly`, () => {
      for (let i = 0; i <= 1000; i++) {
        expect(evaluateEasing(i / 1000, easing)).toBe(legacy(i / 1000, easing));
      }
    });
  }
});

describe("releaseEndOf", () => {
  it("is null without a handoff", () => {
    expect(releaseEndOf({ handoff: false, yoyo: false, loop: false })).toBeNull();
    expect(releaseEndOf({ handoff: false, yoyo: true, loop: false })).toBeNull();
  });

  it("is the end for a plain handoff and the start for a yoyo one", () => {
    expect(releaseEndOf({ handoff: true, yoyo: false, loop: false })).toBe("end");
    expect(releaseEndOf({ handoff: true, yoyo: true, loop: false })).toBe("start");
  });

  it("is null for a loop, which never completes and so never hands off", () => {
    expect(releaseEndOf({ handoff: true, yoyo: false, loop: true })).toBeNull();
  });
});
