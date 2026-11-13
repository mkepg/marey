import { describe, it, expect } from "vitest";
import {
  COLOR_FIT_BAND,
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
  // A 2 s animation, sampled the way the exporter samples it: one frame per
  // output frame, `2 * fps + 1` frames from its start to its end.
  const SECONDS = 2;
  const ONE_SEGMENT: Array<[string, string, "start" | "end" | null]> = [
    ["linear", "linear", null],
    ["easeIn", "easeIn", null],
    ["easeOut", "easeOut", null],
    ["easeOut handoff at end", "easeOut", "end"],
    ["easeInOut handoff at end", "easeInOut", "end"],
    ["easeIn handoff at start", "easeIn", "start"],
    ["easeInOut handoff at start", "easeInOut", "start"],
  ];

  for (const fps of [30, 60]) {
    const N = SECONDS * fps;
    const tol = LOTTIE_FIT_TOLERANCE.position;

    it(`fits each Marey easing as one segment at ${fps} fps`, () => {
      for (const [name, easing, release] of ONE_SEGMENT) {
        const k = roundTrip(sample(scaled(easing, release), N + 1), tol);
        expect(k.map((kf) => kf.t), name).toEqual([0, N]);
      }
    });

    it(`splits easeInOut at its midpoint at ${fps} fps`, () => {
      const k = roundTrip(sample(scaled("easeInOut"), N + 1), tol);
      expect(k.map((kf) => kf.t)).toEqual([0, N / 2, N]);
    });

    it(`fits a yoyo as two segments, and an easeInOut yoyo as four, at ${fps} fps`, () => {
      // A yoyo plays its curve forward over N frames and back over the next N
      // (`timeline.ts`): progress t, then 2 - t. A non-looping yoyo with a
      // handoff releases at its start, so it uses the "start" curves.
      const yoyo = (easing: string, release: "start" | "end" | null) =>
        sample((t) => scaled(easing, release)(t <= 0.5 ? 2 * t : 2 - 2 * t), 2 * N + 1);
      // Each curve here moves at its end, so the yoyo has a corner at the turn
      // and splits exactly there.
      const cornered: Array<[string, string, "start" | "end" | null]> = [
        ["linear", "linear", null],
        ["easeIn", "easeIn", null],
        ["easeIn handoff at start", "easeIn", "start"],
      ];
      for (const [name, easing, release] of cornered) {
        const values = yoyo(easing, release);
        expect(values[N][0], name).toBe(PX);
        const k = roundTrip(values, tol);
        expect(k.map((kf) => kf.t), name).toEqual([0, N, 2 * N]);
        expectNoOvershoot(values, tol);
      }
      // These arrive at rest, so the turn is smooth and one cubic runs through
      // it (easeOut's two legs are one parabola). Two segments still, split
      // wherever the first one stops fitting.
      const smooth: Array<[string, string, "start" | "end" | null]> = [
        ["easeOut", "easeOut", null],
        ["easeInOut handoff at start", "easeInOut", "start"],
      ];
      for (const [name, easing, release] of smooth) {
        const values = yoyo(easing, release);
        const k = roundTrip(values, tol);
        expect(k, name).toHaveLength(3);
        expectNoOvershoot(values, tol);
      }
      // easeInOut changes curve at each leg's midpoint, which fixes two of its
      // splits; its smooth turn leaves the one between them free.
      const values = yoyo("easeInOut", null);
      const k = roundTrip(values, tol);
      expect(k).toHaveLength(5);
      expect([k[0].t, k[1].t, k[3].t, k[4].t]).toEqual([0, N / 2, (3 * N) / 2, 2 * N]);
      expectNoOvershoot(values, tol);
    });
  }

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

describe("fitKeyframes · band", () => {
  /** A colour channel easing between two levels, each frame rounded to a whole 8-bit level as the sampler does. */
  const quantisedRamp = (from: number, to: number, easing: string, frames: number): number[][] =>
    sample((t) => Math.round(from + (to - from) * evaluateEasing(t, easing)) / 255, frames);
  const COLOR: FitOptions = { ...OPTS, band: COLOR_FIT_BAND };

  for (const fps of [30, 60]) {
    it(`keeps every fitted channel at or above its level, so truncation draws the level, at ${fps} fps`, () => {
      const ramps: Array<[number, number, string]> = [[13, 47, "easeInOut"], [230, 61, "easeOut"], [0, 255, "linear"], [128, 129, "easeIn"]];
      for (const [from, to, easing] of ramps) {
        const values = quantisedRamp(from, to, easing, 12 * fps + 1);
        const k = fitKeyframes(values, LOTTIE_FIT_TOLERANCE.color, COLOR);
        expect(k.length, `${from}->${to} ${easing}`).toBeLessThan(values.length);
        for (let f = 0; f < values.length; f++) {
          const got = evaluateKeyframes(k, f)[0];
          const want = values[f][0];
          const at = `${from}->${to} ${easing} frame ${f}`;
          expect(got, at).toBeGreaterThanOrEqual(want);
          expect(got - want, at).toBeLessThanOrEqual(LOTTIE_FIT_TOLERANCE.color);
          expect(Math.floor(255 * got), at).toBe(Math.round(255 * want));
        }
        // Between frames (F4b): no lower than the lower neighbour, no higher than the higher one plus the band.
        for (let f = 0; f + 1 < values.length; f++) {
          const got = evaluateKeyframes(k, f + 0.5)[0];
          expect(got).toBeGreaterThanOrEqual(Math.min(values[f][0], values[f + 1][0]));
          expect(got).toBeLessThanOrEqual(Math.max(values[f][0], values[f + 1][0]) + LOTTIE_FIT_TOLERANCE.color);
        }
      }
    });
  }

  it("a symmetric band is the tolerance on both sides", () => {
    const values = bouncingBall(300);
    const plain = JSON.stringify(fitKeyframes(values, 0.01, OPTS));
    expect(JSON.stringify(fitKeyframes(values, 0.01, { ...OPTS, band: [0.01, 0.01] }))).toBe(plain);
  });

  it("rejects a negative or non-finite band", () => {
    expect(() => fitKeyframes([[0], [1]], 0.01, { ...OPTS, band: [-0.01, 0.01] })).toThrow(RangeError);
    expect(() => fitKeyframes([[0], [1]], 0.01, { ...OPTS, band: [0, Infinity] })).toThrow(RangeError);
  });
});

describe("fitKeyframes · long runs (spec F10)", () => {
  const FRAMES = 3600; // 60 s at 60 fps
  const tol = LOTTIE_FIT_TOLERANCE.position;

  /** A ball that bounces and comes to rest at 500: exactly, or jittering inside the tolerance. */
  function settles(jitter: boolean): number[][] {
    const rand = lcg(7);
    return bouncingBall(FRAMES).map(([y], f) => [f < 400 ? y : 500 + (jitter ? (rand() - 0.5) * tol : 0)]);
  }

  it("fits a minute of smooth motion in a few keyframes, quickly", () => {
    const tracks = [
      sample(scaled("linear"), FRAMES),
      sample(scaled("easeIn"), FRAMES),
      sample((t) => 300 + 400 * t - 150 * t * t, FRAMES),
      sample(scaled("easeInOut"), FRAMES),
    ];
    const start = performance.now();
    const fitted = tracks.map((values) => fitKeyframes(values, tol, OPTS));
    const elapsed = performance.now() - start;
    // F10's ceiling. Growing every run one frame at a time takes seconds here.
    expect(elapsed).toBeLessThan(2000);
    for (const k of fitted.slice(0, 3)) expect(k.map((kf) => kf.t)).toEqual([0, FRAMES - 1]);
    // easeInOut changes curve between frames 1799 and 1800, so it needs a short run there.
    expect(fitted[3].length).toBeLessThanOrEqual(4);
    tracks.forEach((values) => roundTrip(values, tol));
  }, 30_000);

  it("fits a body that comes to rest, exactly or inside the tolerance, quickly", () => {
    for (const jitter of [false, true]) {
      const values = settles(jitter);
      const start = performance.now();
      const k = fitKeyframes(values, tol, OPTS);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(2000);
      roundTrip(values, tol);
      // The rest is one run: no keyframe between the first resting frames and the end.
      expect(k.filter((kf) => kf.t > 401 && kf.t < FRAMES - 1)).toEqual([]);
    }
  }, 30_000);

  it("is deterministic and inside tolerance on long irregular tracks", () => {
    const rand = lcg(3);
    let v = 250;
    const walk: number[][] = [];
    for (let f = 0; f < FRAMES; f++) {
      walk.push([v]);
      v += (rand() - 0.5) * 0.004;
    }
    for (const values of [walk, bouncingBall(FRAMES)]) {
      const a = JSON.stringify(fitKeyframes(values, tol, OPTS));
      expect(JSON.stringify(fitKeyframes(values, tol, OPTS))).toBe(a);
      roundTrip(values, tol);
      expectNoOvershoot(values, tol);
    }
  });
});
