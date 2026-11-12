/**
 * Turns a per-frame track into a few cubic-eased Lottie keyframes.
 *
 * Runs are grown greedily from the left (fitted-keyframes spec F5): from a
 * run's first frame `a`, the end `b` advances one frame at a time while one
 * easing curve, shared by every component, reproduces every sample inside the
 * run within the tolerance. At the first `b` that fails, a keyframe is written
 * at `b − 1` and the next run starts there.
 *
 * A Lottie segment draws `v0 + (v1 − v0) · E(p)` per component, where `p` is
 * linear progress through the segment and `E` is the cubic Bézier easing with
 * control points (0, 0), (o.x, o.y), (i.x, i.y), (1, 1). With `o.x = 1/3` and
 * `i.x = 2/3` the x curve is the identity, so `E` is the cubic polynomial with
 * Bernstein control values 0, `o.y`, `i.y`, 1, and the y handles can encode
 * any cubic in time (spec F6). One `E` serves every component because
 * dotlottie-web ignores per-component handles on a combined vector (spec §4,
 * "Correction, 2026-11-13").
 *
 * Keyframe values are the samples themselves, copied (spec F4). A run fits
 * only when:
 *
 * - its two shared handles lie in `handleRange` (F6);
 * - every component, rebuilt from those handles, is within the tolerance of
 *   every interior sample, and a flat component (end samples within the
 *   tolerance of each other) also stays within the tolerance of the straight
 *   line between its end samples (F3, F6);
 * - no critical point of the curve inside a frame interval lies outside that
 *   interval's two samples widened by the tolerance (F4b), so players drawing
 *   fractional frames never see an overshoot between samples;
 * - every interior sample equal to one of `exactValues` is reproduced within
 *   1e-9, not merely within the tolerance (spec §4, "Opacity at its bounds is
 *   exact"). Keyframe values are copied samples, so a run's own ends are
 *   always exact.
 *
 * Pure and deterministic (F9): plain arithmetic in a fixed order. Imports
 * nothing from the renderer, the IR or the text shaper.
 */

/**
 * Per-channel tolerances in the Lottie file's own units (spec F3, and its
 * correction of 2026-11-13). Each is chosen from what the player draws, not
 * from the property's own units:
 *
 * - position 0.004 px: about one level on an antialiased edge;
 * - scale 0.0004 percentage points: 0.004 px at the edge of a 1,000 px shape;
 * - rotation 0.0002 degrees: 0.0035 px at 1,000 px from the pivot;
 * - opacity 0.05 on the 0-100 scale: 0.13 of an 8-bit level;
 * - colour 0.25/255 on the 0-1 scale: a quarter level, which leaves the
 *   player's own easing inversion (accurate to about 1e-3 in progress) half a
 *   level of margin before a channel rounds to the wrong 8-bit value.
 */
export const LOTTIE_FIT_TOLERANCE: {
  readonly position: 0.004;
  readonly scale: 0.0004;
  readonly rotation: 0.0002;
  readonly opacity: 0.05;
  readonly color: number;
} = {
  position: 0.004,
  scale: 0.0004,
  rotation: 0.0002,
  opacity: 0.05,
  color: 0.25 / 255,
};

/** The y-handle range a fitted easing may use (spec F6). */
export const DEFAULT_HANDLE_RANGE: readonly [number, number] = [-1, 2];

export interface FitOptions {
  /** Give the last keyframe linear handles rather than only `t` and `s`. */
  readonly finalHandles: boolean;
  /** The inclusive range every fitted y handle must lie in. */
  readonly handleRange: readonly [number, number];
  /**
   * Values a sample must keep exactly: a sample equal (`===`) to one of them
   * is reproduced by the fitted curve within {@link EXACT_VALUE_EPSILON} at
   * its frame, or the run does not fit. The encoder passes `[0, 100]` for
   * opacity, which players quantise and scenes hold longest.
   */
  readonly exactValues?: ReadonlyArray<number>;
}

/** How close the fitted curve must come to a sample listed in `exactValues`. */
export const EXACT_VALUE_EPSILON = 1e-9;

export interface FitHandle {
  readonly x: ReadonlyArray<number>;
  readonly y: ReadonlyArray<number>;
}

export interface FittedKeyframe {
  readonly t: number;
  readonly s: ReadonlyArray<number>;
  readonly o?: FitHandle;
  readonly i?: FitHandle;
}

const LINEAR_Y1 = 1 / 3;
const LINEAR_Y2 = 2 / 3;

/**
 * Running sums over the interior samples of the run being grown, indexed by
 * `j = frame − a` for `j` in 1..n−1. They make each least-squares solve O(1)
 * per component: the Bernstein basis at `u = j / n` expands into powers of
 * `j`, divided by powers of `n`.
 */
interface RunSums {
  /** `pow[p] = Σ j^p` for p in 0..6. */
  readonly pow: Float64Array;
  /** `dev[c * 3 + p − 1] = Σ j^p · (values[a + j][c] − values[a][c])` for p in 1..3. */
  readonly dev: Float64Array;
}

/**
 * Fits `values` (one array per frame, each of the same length `d ≥ 1`, at
 * least two frames) into keyframes whose segments reproduce every sample
 * within `tolerance`.
 *
 * A run whose least-squares handles fall outside `handleRange` is rejected
 * and split, never refitted with clamped handles.
 */
export function fitKeyframes(
  values: ReadonlyArray<ReadonlyArray<number>>,
  tolerance: number,
  options: FitOptions,
): FittedKeyframe[] {
  const frames = values.length;
  if (frames < 2) throw new RangeError(`fitKeyframes: needs at least 2 frames, got ${frames}`);
  const d = values[0].length;
  if (d < 1) throw new RangeError("fitKeyframes: values have no components");
  for (let f = 0; f < frames; f++) {
    const v = values[f];
    if (v.length !== d) throw new RangeError(`fitKeyframes: frame ${f} has ${v.length} components, expected ${d}`);
    for (let c = 0; c < d; c++) {
      if (!Number.isFinite(v[c])) throw new RangeError(`fitKeyframes: frame ${f} component ${c} is not finite`);
    }
  }
  if (!(tolerance >= 0)) throw new RangeError(`fitKeyframes: tolerance must be non-negative, got ${tolerance}`);

  const exact = options.exactValues ?? [];
  const keyframes: FittedKeyframe[] = [];
  const sums: RunSums = { pow: new Float64Array(7), dev: new Float64Array(d * 3) };
  let a = 0;
  while (a < frames - 1) {
    sums.pow.fill(0);
    sums.dev.fill(0);
    // A one-frame run always fits: no interior samples, linear handles.
    let best: readonly [number, number] = [LINEAR_Y1, LINEAR_Y2];
    let b = a + 1;
    while (b + 1 < frames) {
      // Frame b becomes interior to the candidate run [a, b + 1].
      addInterior(sums, values, a, b, d);
      const handles = fitRun(values, a, b + 1, tolerance, options.handleRange, exact, sums, d);
      if (handles === null) break;
      best = handles;
      b++;
    }
    keyframes.push({
      t: a,
      s: Array.from(values[a]),
      o: { x: [1 / 3], y: [best[0]] },
      i: { x: [2 / 3], y: [best[1]] },
    });
    a = b;
  }
  const last = frames - 1;
  keyframes.push(
    options.finalHandles
      ? { t: last, s: Array.from(values[last]), o: { x: [1 / 3], y: [LINEAR_Y1] }, i: { x: [2 / 3], y: [LINEAR_Y2] } }
      : { t: last, s: Array.from(values[last]) },
  );
  return keyframes;
}

function addInterior(sums: RunSums, values: ReadonlyArray<ReadonlyArray<number>>, a: number, frame: number, d: number): void {
  const j = frame - a;
  let jp = 1;
  for (let p = 0; p <= 6; p++) {
    sums.pow[p] += jp;
    jp *= j;
  }
  const start = values[a];
  const v = values[frame];
  for (let c = 0; c < d; c++) {
    const dv = v[c] - start[c];
    sums.dev[c * 3] += j * dv;
    sums.dev[c * 3 + 1] += j * j * dv;
    sums.dev[c * 3 + 2] += j * j * j * dv;
  }
}

/** The shared easing E at `u`, written as lottie-web evaluates it. */
function easeAt(u: number, y1: number, y2: number): number {
  const A = 1 - 3 * y2 + 3 * y1;
  const B = 3 * y2 - 6 * y1;
  const C = 3 * y1;
  return ((A * u + B) * u + C) * u;
}

/**
 * The shared handles `[y1, y2]` for the run `[a, b]`, or `null` when the run
 * does not fit. `sums` holds the run's interior samples.
 */
function fitRun(
  values: ReadonlyArray<ReadonlyArray<number>>,
  a: number,
  b: number,
  tol: number,
  range: readonly [number, number],
  exact: ReadonlyArray<number>,
  sums: RunSums,
  d: number,
): readonly [number, number] | null {
  const n = b - a;
  const start = values[a];
  const end = values[b];

  // Least squares on the non-flat components, residuals in tolerance units:
  // component c weighs |Δc| / tol, which is the same as fitting Δc · E(u) to
  // the deviations v − v0 directly.
  let weight = 0;
  for (let c = 0; c < d; c++) {
    const delta = end[c] - start[c];
    if (Math.abs(delta) > tol) weight += delta * delta;
  }

  let y1 = LINEAR_Y1;
  let y2 = LINEAR_Y2;
  if (weight > 0 && n === 2) {
    // One interior sample, at u = 1/2: the quadratic through the three
    // points (the weighted mean of the components' normalised middles),
    // raised to a cubic.
    let mid = 0;
    for (let c = 0; c < d; c++) {
      const delta = end[c] - start[c];
      if (Math.abs(delta) > tol) mid += delta * (values[a + 1][c] - start[c]);
    }
    mid /= weight;
    const q1 = (mid - 0.25) / 0.5;
    y1 = (2 * q1) / 3;
    y2 = (2 * q1 + 1) / 3;
  } else if (weight > 0 && n > 2) {
    // Σ u^p over the interior, u = j / n.
    const U: number[] = [];
    let np = 1;
    for (let p = 0; p <= 6; p++) {
      U.push(sums.pow[p] / np);
      np *= n;
    }
    // B1 = 3u(1 − u)², B2 = 3u²(1 − u); E(u) = B1·y1 + B2·y2 + u³.
    const m11 = 9 * (U[2] - 4 * U[3] + 6 * U[4] - 4 * U[5] + U[6]);
    const m12 = 9 * (U[3] - 3 * U[4] + 3 * U[5] - U[6]);
    const m22 = 9 * (U[4] - 2 * U[5] + U[6]);
    const b1u3 = 3 * (U[4] - 2 * U[5] + U[6]);
    const b2u3 = 3 * (U[5] - U[6]);
    let r1 = -weight * b1u3;
    let r2 = -weight * b2u3;
    const n2 = n * n;
    const n3 = n2 * n;
    for (let c = 0; c < d; c++) {
      const delta = end[c] - start[c];
      if (!(Math.abs(delta) > tol)) continue;
      const d1 = sums.dev[c * 3] / n;
      const d2 = sums.dev[c * 3 + 1] / n2;
      const d3 = sums.dev[c * 3 + 2] / n3;
      r1 += delta * 3 * (d1 - 2 * d2 + d3);
      r2 += delta * 3 * (d2 - d3);
    }
    const det = (m11 * m22 - m12 * m12) * weight;
    y1 = (r1 * m22 - r2 * m12) / det;
    y2 = (m11 * r2 - m12 * r1) / det;
  }
  if (!(y1 >= range[0] && y1 <= range[1] && y2 >= range[0] && y2 <= range[1])) return null;

  // Every interior sample, every component, in its own units.
  for (let j = 1; j < n; j++) {
    const u = j / n;
    const e = easeAt(u, y1, y2);
    const v = values[a + j];
    for (let c = 0; c < d; c++) {
      const delta = end[c] - start[c];
      const err = Math.abs(start[c] + delta * e - v[c]);
      if (!(err <= tol)) return null;
      if (Math.abs(delta) <= tol && !(Math.abs(start[c] + delta * u - v[c]) <= tol)) return null;
      if (!(err <= EXACT_VALUE_EPSILON) && exact.includes(v[c])) return null;
    }
  }

  // Spec F4b: between two samples the curve is monotone except at a critical
  // point of E, so checking E's critical points inside (0, 1) is enough.
  const A = 1 - 3 * y2 + 3 * y1;
  const B = 3 * y2 - 6 * y1;
  const C = 3 * y1;
  for (const u of quadraticRoots(3 * A, 2 * B, C)) {
    if (!(u > 0 && u < 1)) continue;
    const interval = Math.min(n - 1, Math.floor(u * n));
    const e = easeAt(u, y1, y2);
    const left = values[a + interval];
    const right = values[a + interval + 1];
    for (let c = 0; c < d; c++) {
      const delta = end[c] - start[c];
      if (delta === 0) continue;
      const at = start[c] + delta * e;
      const lo = Math.min(left[c], right[c]) - tol;
      const hi = Math.max(left[c], right[c]) + tol;
      if (!(at >= lo && at <= hi)) return null;
    }
  }
  return [y1, y2];
}

/**
 * Real roots of `qa·u² + qb·u + qc`, computed without the cancellation the
 * textbook formula suffers when `qa` is tiny (linear handles leave it at
 * rounding noise).
 */
function quadraticRoots(qa: number, qb: number, qc: number): number[] {
  if (qa === 0) return qb === 0 ? [] : [-qc / qb];
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return [];
  const q = -0.5 * (qb + (qb < 0 ? -1 : 1) * Math.sqrt(disc));
  if (q === 0) return [0];
  return [q / qa, qc / q];
}
