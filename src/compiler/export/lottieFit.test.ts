import { describe, it, expect } from "vitest";
import {
  DEFAULT_HANDLE_RANGE,
  LOTTIE_FIT_TOLERANCE,
  fitKeyframes,
  type FitOptions,
  type FittedKeyframe,
} from "./lottieFit";
import { evaluateKeyframes } from "./lottieEvaluate";
import { evaluateEasing } from "../renderer/easing";

const OPTS: FitOptions = { finalHandles: false, handleRange: DEFAULT_HANDLE_RANGE };

/** `frames` samples of `f` over t in [0, 1], one component each. */
function sample(f: (t: number) => number, frames: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < frames; i++) out.push([f(i / (frames - 1))]);
  return out;
}

/** Fits `values` and asserts the played-back curve is within `tol` of every sample. */
function roundTrip(
  values: ReadonlyArray<ReadonlyArray<number>>,
  tol: number,
  options: FitOptions = OPTS,
): FittedKeyframe[] {
  const k = fitKeyframes(values, tol, options);
  for (let f = 0; f < values.length; f++) {
    const got = evaluateKeyframes(k, f);
    for (let c = 0; c < values[f].length; c++) {
      const err = Math.abs(got[c] - values[f][c]);
      if (!(err <= tol)) {
        throw new Error(`frame ${f} component ${c}: played ${got[c]}, sampled ${values[f][c]}, error ${err} > ${tol}`);
      }
    }
  }
  return k;
}

/** Spec F4b: at every half frame the curve lies between its neighbouring samples, widened by `tol`. */
function expectNoOvershoot(values: ReadonlyArray<ReadonlyArray<number>>, tol: number): void {
  const k = fitKeyframes(values, tol, OPTS);
  for (let f = 0; f + 1 < values.length; f++) {
    for (const frac of [0.25, 0.5, 0.75]) {
      const got = evaluateKeyframes(k, f + frac);
      for (let c = 0; c < values[f].length; c++) {
        const lo = Math.min(values[f][c], values[f + 1][c]) - tol;
        const hi = Math.max(values[f][c], values[f + 1][c]) + tol;
        if (!(got[c] >= lo && got[c] <= hi)) {
          throw new Error(`frame ${f + frac} component ${c}: ${got[c]} outside [${lo}, ${hi}]`);
        }
      }
    }
  }
}

const PX = 640;
const scaled = (easing: string, release: "start" | "end" | null = null) => (t: number) =>
  PX * evaluateEasing(t, easing, release);

/** A ball thrown from 400 that rises to 0 and falls back to 400; 60 frames put the apex between frames 29 and 30. */
const thrownBall = () => sample((t) => 400 - 1600 * t + 1600 * t * t, 60);
const step = () => [...Array.from({ length: 20 }, () => [0]), ...Array.from({ length: 20 }, () => [100])];

/** A deterministic physics-like track: a ball dropped onto a floor, bouncing and losing energy. */
function bouncingBall(frames: number): number[][] {
  const out: number[][] = [];
  let y = 0;
  let vy = 0;
  const dt = 1 / 60;
  for (let f = 0; f < frames; f++) {
    out.push([y]);
    vy += 2000 * dt;
    y += vy * dt;
    if (y > 500) {
      y = 500 - (y - 500) * 0.7;
      vy = -vy * 0.7;
    }
  }
  return out;
}

/** MINSTD linear congruential generator, values in [0, 1). */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function allHandles(k: ReadonlyArray<FittedKeyframe>): number[] {
  const ys: number[] = [];
  for (const kf of k) {
    if (kf.o) ys.push(...kf.o.y);
    if (kf.i) ys.push(...kf.i.y);
  }
  return ys;
}

describe("fitKeyframes", () => {
  it("fits each Marey easing as one segment", () => {
    const curves: Array<[string, (t: number) => number]> = [
      ["linear", scaled("linear")],
      ["easeIn", scaled("easeIn")],
      ["easeOut", scaled("easeOut")],
      ["easeOut handoff at end", scaled("easeOut", "end")],
      ["easeInOut handoff at end", scaled("easeInOut", "end")],
      ["easeIn handoff at start", scaled("easeIn", "start")],
      ["easeInOut handoff at start", scaled("easeInOut", "start")],
    ];
    for (const [name, f] of curves) {
      const values = sample(f, 61);
      const k = roundTrip(values, 0.01);
      expect(k.map((kf) => kf.t), name).toEqual([0, 60]);
    }
  });

  it("splits easeInOut near its midpoint", () => {
    const values = sample(scaled("easeInOut"), 61);
    const k = roundTrip(values, 0.01);
    expect(k.map((kf) => kf.t)).toEqual([0, 30, 60]);
  });

  it("fits a sampled parabola as one segment", () => {
    const values = sample((t) => 300 + 400 * t - 150 * t * t, 45);
    const k = roundTrip(values, 0.01);
    expect(k).toHaveLength(2);
  });

  it("never overshoots between samples", () => {
    expectNoOvershoot(step(), 0.01);
    expectNoOvershoot(thrownBall(), 0.01);
    expectNoOvershoot(sample(scaled("easeInOut"), 61), 0.01);
  });

  it("splits a run that returns to its start", () => {
    const values = thrownBall();
    const k = roundTrip(values, 0.01);
    expect(k.length).toBeGreaterThanOrEqual(3);
    const apex = 29.5;
    expect(k.some((kf) => Math.abs(kf.t - apex) <= 1)).toBe(true);
  });

  it("splits exactly at a step", () => {
    const k = roundTrip(step(), 0.01);
    expect(k.map((kf) => kf.t)).toEqual([0, 19, 20, 39]);
  });

  it("keeps a flat component constant under a shared easing", () => {
    const values = sample((t) => PX * evaluateEasing(t, "easeOut"), 61).map(([sx]) => [sx, 100]);
    const k = roundTrip(values, 0.01);
    expect(k).toHaveLength(2);
    for (const kf of k) {
      for (const h of [kf.o, kf.i]) {
        if (!h) continue;
        expect(h.x).toHaveLength(1);
        expect(h.y).toHaveLength(1);
        expect(Number.isFinite(h.x[0])).toBe(true);
        expect(Number.isFinite(h.y[0])).toBe(true);
      }
    }
    for (let f = 0; f < values.length; f++) expect(evaluateKeyframes(k, f)[1]).toBe(100);
    for (let f = 0; f + 1 < values.length; f++) expect(evaluateKeyframes(k, f + 0.5)[1]).toBe(100);
    expect(JSON.stringify(k)).not.toContain("null");
  });

  it("splits components that need different easings", () => {
    const values = sample((t) => t, 61).map(([t]) => [PX * t, PX * evaluateEasing(t, "easeIn")]);
    const k = roundTrip(values, 0.01);
    expect(k.length).toBeGreaterThan(2);
  });

  it("treats float noise as flat", () => {
    const values = Array.from({ length: 30 }, () => [100]);
    values[29] = [100 + 1e-13];
    const k = roundTrip(values, 0.01);
    expect(k).toHaveLength(2);
    expect(k[0].o).toEqual({ x: [1 / 3], y: [1 / 3] });
    expect(k[0].i).toEqual({ x: [2 / 3], y: [2 / 3] });
  });

  it("keeps every handle inside the range", () => {
    for (const values of [thrownBall(), step()]) {
      for (const y of allHandles(fitKeyframes(values, 0.01, OPTS))) {
        expect(y).toBeGreaterThanOrEqual(-1);
        expect(y).toBeLessThanOrEqual(2);
      }
      const narrow: FitOptions = { finalHandles: false, handleRange: [0, 1] };
      const k = roundTrip(values, 0.01, narrow);
      for (const y of allHandles(k)) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("handles two and three frame tracks", () => {
    expect(roundTrip([[0], [1]], 0.01)).toHaveLength(2);
    roundTrip([[0], [5], [1]], 0.01);
  });

  it("copies samples into keyframes", () => {
    for (const values of [thrownBall(), step(), bouncingBall(300), sample(scaled("easeInOut"), 61)]) {
      const k = fitKeyframes(values, 0.01, OPTS);
      for (const kf of k) {
        expect(kf.s).toHaveLength(values[kf.t].length);
        for (let c = 0; c < kf.s.length; c++) expect(kf.s[c]).toBe(values[kf.t][c]);
      }
    }
  });

  it("is deterministic", () => {
    const values = bouncingBall(300);
    const a = JSON.stringify(fitKeyframes(values, 0.01, OPTS));
    const b = JSON.stringify(fitKeyframes(values, 0.01, OPTS));
    expect(a).toBe(b);
    roundTrip(values, 0.01);
  });

  it("pins the tolerance table", () => {
    expect(LOTTIE_FIT_TOLERANCE).toEqual({
      position: 0.004,
      scale: 0.0004,
      rotation: 0.0002,
      opacity: 0.05,
      color: 0.25 / 255,
    });
  });

  it("stays inside the encoding budget", () => {
    const FRAMES = 720;
    const FPS = 60;
    const SEGMENT = 2 * FPS;
    const rand = lcg(1);
    const tracks: number[][][] = [];
    for (let n = 0; n < 33; n++) {
      // Piecewise cubic, continuous in value, with a new cubic every 2 s.
      const track: number[][] = [];
      let base = rand() * 500;
      let c1 = 0;
      let c2 = 0;
      let c3 = 0;
      for (let f = 0; f < FRAMES; f++) {
        const local = f % SEGMENT;
        if (local === 0) {
          if (f > 0) base = base + c1 + c2 + c3;
          c1 = (rand() - 0.5) * 400;
          c2 = (rand() - 0.5) * 400;
          c3 = (rand() - 0.5) * 400;
        }
        const u = local / SEGMENT;
        track.push([base + u * (c1 + u * (c2 + u * c3))]);
      }
      tracks.push(track);
    }
    for (let n = 0; n < 33; n++) {
      // Random walk.
      const track: number[][] = [];
      let v = rand() * 500;
      for (let f = 0; f < FRAMES; f++) {
        track.push([v]);
        v += (rand() - 0.5) * 10;
      }
      tracks.push(track);
    }
    const start = performance.now();
    let keyframes = 0;
    for (const track of tracks) keyframes += fitKeyframes(track, LOTTIE_FIT_TOLERANCE.position, OPTS).length;
    const elapsed = performance.now() - start;
    console.log(`fitKeyframes: 66 tracks x ${FRAMES} frames in ${elapsed.toFixed(1)} ms, ${keyframes} keyframes`);
    expect(elapsed).toBeLessThan(2000);
    // Outside the timed region: the timed output must also be correct.
    for (const n of [0, 1, 32, 33, 34, 65]) roundTrip(tracks[n], LOTTIE_FIT_TOLERANCE.position);
    for (const track of tracks.slice(0, 33)) {
      // A cubic segment is one run, so each 2 s segment needs about one keyframe.
      expect(fitKeyframes(track, 0.01, OPTS).length).toBeLessThanOrEqual(FRAMES / SEGMENT * 3 + 1);
    }
  });

  it("writes the final keyframe bare unless asked", () => {
    const values = sample(scaled("easeOut"), 61);
    const bare = fitKeyframes(values, 0.01, OPTS);
    const last = bare[bare.length - 1];
    expect(last.o).toBeUndefined();
    expect(last.i).toBeUndefined();
    expect(Object.keys(last).sort()).toEqual(["s", "t"]);

    const handled = fitKeyframes(values, 0.01, { ...OPTS, finalHandles: true });
    const lastHandled = handled[handled.length - 1];
    expect(lastHandled.o).toEqual({ x: [1 / 3], y: [1 / 3] });
    expect(lastHandled.i).toEqual({ x: [2 / 3], y: [2 / 3] });
  });

  it("puts both handles on the segment's first keyframe", () => {
    const k = fitKeyframes(sample(scaled("easeOut"), 61), 0.01, OPTS);
    expect(k).toHaveLength(2);
    expect(k[0].o).toBeDefined();
    expect(k[0].i).toBeDefined();
    expect(k[0].o!.x).toEqual([1 / 3]);
    expect(k[0].i!.x).toEqual([2 / 3]);
    expect(k[0].o!.y[0]).toBeCloseTo(2 / 3, 9);
    expect(k[0].i!.y[0]).toBeCloseTo(1, 9);
    expect(k[1].o).toBeUndefined();
    expect(k[1].i).toBeUndefined();
  });
});

describe("fitKeyframes · exactValues", () => {
  /** Opacity held at 100 for 30 frames, then an easeIn fade to 0 over 60: the fade leaves 100 so slowly that one run can span the hold. */
  const holdThenFade = (): number[][] => [
    ...Array.from({ length: 30 }, () => [100]),
    ...sample((t) => 100 * (1 - evaluateEasing(t, "easeIn", null)), 61),
  ];
  const EXACT: FitOptions = { ...OPTS, exactValues: [0, 100] };

  it("reproduces held 100s exactly and ends exactly at 0", () => {
    const values = holdThenFade();
    const k = roundTrip(values, LOTTIE_FIT_TOLERANCE.opacity, EXACT);
    for (let f = 0; f < 30; f++) expect(evaluateKeyframes(k, f)[0], `frame ${f}`).toBe(100);
    expect(evaluateKeyframes(k, values.length - 1)[0]).toBe(0);
    // Every sample equal to a listed value, wherever it falls, within 1e-9.
    for (let f = 0; f < values.length; f++) {
      if (values[f][0] === 0 || values[f][0] === 100) {
        expect(Math.abs(evaluateKeyframes(k, f)[0] - values[f][0]), `frame ${f}`).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it("lets the same track deviate at the hold without them", () => {
    const values = holdThenFade();
    const k = roundTrip(values, LOTTIE_FIT_TOLERANCE.opacity);
    let off = 0;
    for (let f = 0; f < 30; f++) if (evaluateKeyframes(k, f)[0] !== 100) off++;
    expect(off).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const values = holdThenFade();
    const a = JSON.stringify(fitKeyframes(values, LOTTIE_FIT_TOLERANCE.opacity, EXACT));
    const b = JSON.stringify(fitKeyframes(values, LOTTIE_FIT_TOLERANCE.opacity, EXACT));
    expect(a).toBe(b);
  });
});
