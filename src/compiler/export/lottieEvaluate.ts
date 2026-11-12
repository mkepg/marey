/**
 * Plays a keyframed Lottie property back at a frame, the way lottie-web 5.x
 * does, so tests can measure what a player draws rather than what the encoder
 * meant to write.
 *
 * The easing follows lottie-web's `BezierEaser` (Gaëtan Renaudeau's
 * BezierEasing): an 11-entry float32 table of x(u) seeds a guess, four Newton
 * iterations refine it when the slope there is at least 0.001, and a bisection
 * of at most 10 steps takes over when it is not. The value is then
 * `s + (next.s − s) · y(u)` per component, with the per-component handle
 * falling back to index 0, as `interpolateValue` reads `o.x[i] ?? o.x[0]`.
 * Before the first keyframe a property holds the first value; at or after the
 * last it holds the last.
 *
 * Pure: imports nothing from the renderer, the IR or the text shaper.
 */
import type { FittedKeyframe } from "./lottieFit";

const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 0.0000001;
const SUBDIVISION_MAX_ITERATIONS = 10;
const SPLINE_TABLE_SIZE = 11;
const SAMPLE_STEP = 1 / (SPLINE_TABLE_SIZE - 1);

const coefA = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1;
const coefB = (a1: number, a2: number) => 3 * a2 - 6 * a1;
const coefC = (a1: number) => 3 * a1;

/** x(u) for handles (a1, a2), or y(u) for the y handles. */
function calcBezier(u: number, a1: number, a2: number): number {
  return ((coefA(a1, a2) * u + coefB(a1, a2)) * u + coefC(a1)) * u;
}

function slope(u: number, a1: number, a2: number): number {
  return 3 * coefA(a1, a2) * u * u + 2 * coefB(a1, a2) * u + coefC(a1);
}

function binarySubdivide(x: number, lo: number, hi: number, x1: number, x2: number): number {
  let currentX: number;
  let currentU: number;
  let i = 0;
  do {
    currentU = lo + (hi - lo) / 2;
    currentX = calcBezier(currentU, x1, x2) - x;
    if (currentX > 0) hi = currentU;
    else lo = currentU;
  } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
  return currentU;
}

function newtonRaphson(x: number, guess: number, x1: number, x2: number): number {
  for (let i = 0; i < NEWTON_ITERATIONS; i++) {
    const s = slope(guess, x1, x2);
    if (s === 0) return guess;
    guess -= (calcBezier(guess, x1, x2) - x) / s;
  }
  return guess;
}

/** The curve parameter u at which x(u) = x. */
function uForX(x: number, x1: number, x2: number): number {
  const table = new Float32Array(SPLINE_TABLE_SIZE);
  for (let i = 0; i < SPLINE_TABLE_SIZE; i++) table[i] = calcBezier(i * SAMPLE_STEP, x1, x2);
  let intervalStart = 0;
  let current = 1;
  const last = SPLINE_TABLE_SIZE - 1;
  for (; current !== last && table[current] <= x; ++current) intervalStart += SAMPLE_STEP;
  --current;
  const dist = (x - table[current]) / (table[current + 1] - table[current]);
  const guess = intervalStart + dist * SAMPLE_STEP;
  const initialSlope = slope(guess, x1, x2);
  if (initialSlope >= NEWTON_MIN_SLOPE) return newtonRaphson(x, guess, x1, x2);
  if (initialSlope === 0) return guess;
  return binarySubdivide(x, intervalStart, intervalStart + SAMPLE_STEP, x1, x2);
}

/** lottie-web's `BezierEasing.get`: eased progress for linear progress `x`. */
function ease(x: number, x1: number, y1: number, x2: number, y2: number): number {
  if (x1 === y1 && x2 === y2) return x;
  if (x === 0) return 0;
  if (x === 1) return 1;
  return calcBezier(uForX(x, x1, x2), y1, y2);
}

type HandleLike = { readonly x: number | ReadonlyArray<number>; readonly y: number | ReadonlyArray<number> };

function component(v: number | ReadonlyArray<number>, i: number): number {
  if (typeof v === "number") return v;
  return v[i] === undefined ? v[0] : v[i];
}

/** The value of keyframes `k` at `frame`, one number per component. */
export function evaluateKeyframes(k: ReadonlyArray<FittedKeyframe>, frame: number): number[] {
  if (k.length === 0) throw new Error("evaluateKeyframes: no keyframes");
  if (k.length === 1) return [...k[0].s];

  // The segment lottie-web picks: the last whose start is at or before the
  // frame, or the first segment when the frame is before every keyframe.
  let seg = 0;
  while (seg < k.length - 2 && k[seg + 1].t <= frame) seg++;
  const key = k[seg];
  const next = k[seg + 1];

  const out: number[] = [];
  for (let i = 0; i < key.s.length; i++) {
    let perc: number;
    if (frame >= next.t) perc = 1;
    else if (frame < key.t) perc = 0;
    else {
      const o: HandleLike | undefined = key.o;
      const ih: HandleLike | undefined = key.i;
      if (!o || !ih) throw new Error(`evaluateKeyframes: keyframe at t=${key.t} starts a segment but has no handles`);
      perc = ease(
        (frame - key.t) / (next.t - key.t),
        component(o.x, i),
        component(o.y, i),
        component(ih.x, i),
        component(ih.y, i),
      );
    }
    out.push(key.s[i] + (next.s[i] - key.s[i]) * perc);
  }
  return out;
}

function asArray(v: unknown): number[] {
  if (typeof v === "number") return [v];
  if (Array.isArray(v) && v.every((n) => typeof n === "number")) return [...v];
  throw new Error(`evaluateProperty: not a number or number array: ${JSON.stringify(v)}`);
}

/**
 * The value of a Lottie property at `frame`: a static `{a: 0, k}`, an
 * animated `{a: 1, k: [keyframes]}`, or a split position `{s: true, x, y}`,
 * whose value is `[x, y]`.
 */
export function evaluateProperty(prop: unknown, frame: number): number[] {
  if (typeof prop !== "object" || prop === null) {
    throw new Error(`evaluateProperty: not a property: ${JSON.stringify(prop)}`);
  }
  const p = prop as { a?: unknown; k?: unknown; s?: unknown; x?: unknown; y?: unknown };
  if (p.s === true) return [...evaluateProperty(p.x, frame), ...evaluateProperty(p.y, frame)];
  if (p.a === 1) {
    if (!Array.isArray(p.k)) throw new Error("evaluateProperty: animated property without a keyframe array");
    return evaluateKeyframes(p.k as FittedKeyframe[], frame);
  }
  return asArray(p.k);
}
