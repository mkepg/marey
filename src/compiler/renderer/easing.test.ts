import { describe, expect, it } from "vitest";
import { evaluateEasing, releaseEndOf, springOmega, SPRING_EPSILON, type ReleaseEnd } from "./easing";

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

describe("evaluateEasing: spring", () => {
  const BOUNCES = [0, 0.25, 0.5, 0.9];

  /** The left side of ω's defining equation (spec §3.2), through `Math`. */
  function settleResidual(bounce: number, omega: number): number {
    const zeta = 1 - bounce;
    return zeta === 1
      ? Math.exp(-omega) * (1 + omega)
      : Math.exp(-zeta * omega) / Math.sqrt(1 - zeta * zeta);
  }

  /** Spec §3.2's curve, written out through `Math` as an independent reference. */
  function reference(t: number, bounce: number): number {
    const zeta = 1 - bounce;
    const w = springOmega(bounce);
    if (zeta === 1) return 1 - Math.exp(-w * t) * (1 + w * t);
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
  }

  for (const b of BOUNCES) {
    it(`bounce ${b}: starts at exactly 0 and ends at exactly 1`, () => {
      expect(evaluateEasing(0, "spring", null, b)).toBe(0);
      expect(evaluateEasing(1, "spring", null, b)).toBe(1);
    });

    it(`bounce ${b}: has settled to within the tolerance just before the end`, () => {
      const residual = Math.abs(1 - evaluateEasing(1 - 1e-12, "spring", null, b));
      if (b === 0) {
        // Critically damped, the residual e^(-wt)(1 + wt) falls monotonically
        // and equals SPRING_EPSILON exactly at t = 1, because that is the
        // equation w solves. 1e-12 before the end it is larger by the slope
        // w^2 e^(-w) times 1e-12, about 1.1e-15. The snap at t = 1 is still
        // SPRING_EPSILON; the slack below is that slope term and nothing more.
        expect(residual).toBeLessThanOrEqual(SPRING_EPSILON * (1 + 1e-10));
        expect(residual).toBeGreaterThan(SPRING_EPSILON * (1 - 1e-10));
      } else {
        expect(residual).toBeLessThanOrEqual(SPRING_EPSILON);
      }
    });

    it(`bounce ${b}: follows spec §3.2's curve`, () => {
      for (let i = 1; i < 1000; i++) {
        const t = i / 1000;
        expect(Math.abs(evaluateEasing(t, "spring", null, b) - reference(t, b)), `t = ${t}`).toBeLessThanOrEqual(1e-12);
      }
    });

    it(`bounce ${b}: w solves its defining equation, inside the bisection bracket`, () => {
      const w = springOmega(b);
      expect(w).toBeGreaterThan(1);
      expect(w).toBeLessThan(200);
      expect(Math.abs(settleResidual(b, w) - SPRING_EPSILON)).toBeLessThanOrEqual(1e-12);
    });
  }

  it("solves w to these exact doubles", () => {
    // w is part of the portable curve, so a port must reach the same bits.
    // The defining-equation test above cannot see a solve cut short or the
    // other end of the final bracket, since both still meet it within 1e-12;
    // these values can. They are the bracket's upper end once 60 halvings
    // have closed it to adjacent doubles.
    expect(springOmega(0)).toBe(11.75637122249542);
    expect(springOmega(0.25)).toBe(12.831572878091222);
    expect(springOmega(0.5)).toBe(18.708362816404147);
    expect(springOmega(0.9)).toBe(92.15365539902938);
  });

  it("keeps w inside the bisection bracket over the whole bounce range", () => {
    // w is not monotonic in bounce (its minimum, about 10.92 at bounce
    // 0.045, is below bounce 0's 11.76), so the bracket is checked across the
    // range, not only at its ends.
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 900; i++) {
      const w = springOmega(i / 1000);
      lo = Math.min(lo, w);
      hi = Math.max(hi, w);
      expect(Math.abs(settleResidual(i / 1000, w) - SPRING_EPSILON), `bounce ${i / 1000}`).toBeLessThanOrEqual(1e-12);
    }
    console.log(`springOmega over bounce [0, 0.9] by 0.001: min ${lo}, max ${hi}; ` +
      BOUNCES.map((b) => `w(${b}) = ${springOmega(b)}`).join(", "));
    expect(lo).toBeGreaterThan(1);
    expect(hi).toBeLessThan(200);
  });

  it("bounce 0 never overshoots, since critical damping cannot", () => {
    for (let i = 0; i <= 10_000; i++) {
      expect(evaluateEasing(i / 10_000, "spring", null, 0)).toBeLessThanOrEqual(1);
    }
  });

  it("bounce 0.5 overshoots", () => {
    let max = 0;
    for (let i = 0; i <= 10_000; i++) max = Math.max(max, evaluateEasing(i / 10_000, "spring", null, 0.5));
    expect(max).toBeGreaterThan(1);
  });

  it("defaults bounce to 0.25", () => {
    for (let i = 0; i <= 100; i++) {
      expect(evaluateEasing(i / 100, "spring")).toBe(evaluateEasing(i / 100, "spring", null, 0.25));
    }
    expect(evaluateEasing(0.3, "spring")).not.toBe(evaluateEasing(0.3, "spring", null, 0.5));
  });

  it("is not reshaped by a release end; the validator rejects handoff with spring", () => {
    for (const release of ["end", "start"] as const) {
      for (let i = 0; i <= 100; i++) {
        expect(evaluateEasing(i / 100, "spring", release, 0.5)).toBe(evaluateEasing(i / 100, "spring", null, 0.5));
      }
    }
  });

  // The critically damped formula is chosen when the damping ratio is exactly
  // 1, never within a tolerance. Just above bounce 0 the underdamped formula
  // applies, with its own w; a bounce so small that 1 - bounce rounds to 1 has
  // no underdamped curve in doubles (sqrt(1 - zeta^2) is 0) and is critically
  // damped like bounce 0.
  it("is underdamped at the smallest bounce whose damping ratio is not 1", () => {
    const b = 2 ** -52;
    expect(1 - b).not.toBe(1);
    expect(Math.abs(settleResidual(b, springOmega(b)) - SPRING_EPSILON)).toBeLessThanOrEqual(1e-12);
    expect(springOmega(b)).not.toBe(springOmega(0));
    expect(Math.abs(evaluateEasing(0.5, "spring", null, b) - reference(0.5, b))).toBeLessThanOrEqual(1e-12);
  });

  it("is critically damped when 1 - bounce rounds to 1", () => {
    const b = 2 ** -54;
    expect(1 - b).toBe(1);
    expect(springOmega(b)).toBe(springOmega(0));
    for (let i = 0; i <= 100; i++) {
      expect(evaluateEasing(i / 100, "spring", null, b)).toBe(evaluateEasing(i / 100, "spring", null, 0));
    }
  });
});
