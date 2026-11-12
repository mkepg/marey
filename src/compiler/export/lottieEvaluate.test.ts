import { describe, it, expect } from "vitest";
import { evaluateKeyframes, evaluateProperty } from "./lottieEvaluate";
import type { FittedKeyframe } from "./lottieFit";

const LINEAR_O = { x: [1 / 3], y: [1 / 3] };
const LINEAR_I = { x: [2 / 3], y: [2 / 3] };

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
    // And off the midpoint, where the x curve has to be inverted numerically.
    for (const f of [1, 2.5, 7, 9.75]) {
      const p = f / 10;
      expect(Math.abs(evaluateKeyframes(k, f)[0] - 100 * p * (2 - p))).toBeLessThan(1e-9);
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
