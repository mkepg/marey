import { describe, it, expect } from "vitest";
import { evaluateKeyframes, evaluateProperty } from "./lottieEvaluate";
import type { FittedKeyframe } from "./lottieFit";

const LINEAR_O = { x: [1 / 3], y: [1 / 3] };
const LINEAR_I = { x: [2 / 3], y: [2 / 3] };

/** One segment from 0 at frame 0 to 1 at frame 1, so the value is the eased progress. */
function oneSegment(x1: number, y1: number, x2: number, y2: number): FittedKeyframe[] {
  return [
    { t: 0, s: [0], o: { x: [x1], y: [y1] }, i: { x: [x2], y: [y2] } },
    { t: 1, s: [1] },
  ];
}

/** A Bézier coordinate with control values 0, a1, a2, 1, in Bernstein form. */
function bernstein(u: number, a1: number, a2: number): number {
  const v = 1 - u;
  return 3 * a1 * u * v * v + 3 * a2 * u * u * v + u * u * u;
}

/**
 * The exact eased progress, independent of the evaluator: x(u) = p solved by
 * 200 bisection steps (x is monotone for x handles in [0, 1]), then y(u).
 */
function referenceEase(p: number, x1: number, y1: number, x2: number, y2: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (bernstein(mid, x1, x2) < p) lo = mid;
    else hi = mid;
  }
  return bernstein((lo + hi) / 2, y1, y2);
}

describe("evaluateKeyframes", () => {
  it("linear handles reproduce a lerp", () => {
    const k: FittedKeyframe[] = [
      { t: 0, s: [0], o: LINEAR_O, i: LINEAR_I },
      { t: 10, s: [100] },
    ];
    expect(evaluateKeyframes(k, 5)[0]).toBeCloseTo(50, 12);
  });

  it("easeOut handles match t(2 − t)", () => {
    const k: FittedKeyframe[] = [
      { t: 0, s: [0], o: { x: [1 / 3], y: [2 / 3] }, i: { x: [2 / 3], y: [1] } },
      { t: 10, s: [100] },
    ];
    expect(Math.abs(evaluateKeyframes(k, 5)[0] - 100 * 0.75)).toBeLessThan(1e-9);
    // And off the midpoint. With x handles 1/3 and 2/3, x(u) = u, so this
    // checks the y curve only; the cases below invert a non-identity x.
    for (const f of [1, 2.5, 7, 9.75]) {
      const p = f / 10;
      expect(Math.abs(evaluateKeyframes(k, f)[0] - 100 * p * (2 - p))).toBeLessThan(1e-9);
    }
  });

  it("inverts a non-identity x curve by Newton iteration", () => {
    // CSS `ease`. At progress 0.5 the table's first guess has slope well above
    // 0.001, so the value comes from the Newton refinement.
    const [x1, y1, x2, y2] = [0.25, 0.1, 0.25, 1];
    const got = evaluateKeyframes(oneSegment(x1, y1, x2, y2), 0.5)[0];
    expect(Math.abs(got - referenceEase(0.5, x1, y1, x2, y2))).toBeLessThan(1e-9);
  });

  it("falls back to bisection where x is too flat for Newton", () => {
    // x1 = 0, x2 = 1 make x(u) = 3u² − 2u³, whose slope vanishes at both
    // ends. At progress 1e-6 (and 1 − 1e-6) the first guess has slope about
    // 2e-5, below lottie-web's 0.001 threshold, so u comes from at most 10
    // halvings of a 0.1-wide table interval: within 0.1 / 2^10 ≈ 1e-4 of the
    // true u. y has slope at most 1.5 there, so the played value is within
    // 1.5e-4 of the exact one. Returning the first guess unrefined would be
    // about 8.6e-4 off, outside that bound.
    const [x1, y1, x2, y2] = [0, 0.5, 1, 0.5];
    for (const p of [1e-6, 1 - 1e-6]) {
      const got = evaluateKeyframes(oneSegment(x1, y1, x2, y2), p)[0];
      expect(Math.abs(got - referenceEase(p, x1, y1, x2, y2)), `progress ${p}`).toBeLessThan(1.5e-4);
    }
  });

  it("clamps outside the keyframes", () => {
    const k: FittedKeyframe[] = [
      { t: 0, s: [7, 1], o: LINEAR_O, i: LINEAR_I },
      { t: 4, s: [20, 2], o: LINEAR_O, i: LINEAR_I },
      { t: 10, s: [100, 3] },
    ];
    expect(evaluateKeyframes(k, -3)).toEqual([7, 1]);
    expect(evaluateKeyframes(k, 99)).toEqual([100, 3]);
    expect(evaluateKeyframes(k, 10)).toEqual([100, 3]);
  });

  it("reads a split position", () => {
    const y = {
      a: 1,
      k: [
        { t: 0, s: [0], o: LINEAR_O, i: LINEAR_I },
        { t: 10, s: [100] },
      ],
    };
    const prop = { s: true, x: { a: 0, k: 4 }, y };
    for (const f of [0, 3, 5, 10]) {
      const [px, py] = evaluateProperty(prop, f);
      expect(px).toBe(4);
      expect(py).toBeCloseTo(10 * f, 9);
    }
  });

  it("reads static and animated combined properties", () => {
    expect(evaluateProperty({ a: 0, k: [3, 4] }, 2)).toEqual([3, 4]);
    expect(evaluateProperty({ a: 0, k: 9 }, 2)).toEqual([9]);
    const animated = {
      a: 1,
      k: [
        { t: 0, s: [0, 10], o: LINEAR_O, i: LINEAR_I },
        { t: 2, s: [4, 30] },
      ],
    };
    const v = evaluateProperty(animated, 1);
    expect(v[0]).toBeCloseTo(2, 12);
    expect(v[1]).toBeCloseTo(20, 12);
  });
});
