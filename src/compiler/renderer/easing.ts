/**
 * Easing curves, as pure functions of linear progress.
 *
 * Kept apart from `sceneRuntime.ts` for the reason `clock.ts` and
 * `timeline.ts` are: it imports nothing from `pixi.js`, so it is tested in
 * Node.
 */
import type { IRAnimation } from "../sceneIR";
import { propertyDefault } from "../languageContract";
import { cosDeg, detExp, RAD_TO_DEG, sinDeg } from "../detMath";

/**
 * The spring's settle tolerance: at `t = 1` it is within this fraction of the
 * travel from `to`, so the snap onto `to` there is at most 0.05 px on a 500 px
 * move (Phase 10A spec §3.2).
 */
export const SPRING_EPSILON = 1e-4;

/** `animate`'s `bounce` when it is not written, from the contract. */
const DEFAULT_BOUNCE = propertyDefault("animate", "bounce") as number;

/** The fixed bisection bracket and step count for `springOmega`. */
const OMEGA_LO = 1;
const OMEGA_HI = 200;
const OMEGA_STEPS = 60;

const omegaByBounce = new Map<number, number>();

/**
 * The natural frequency `w` of the spring for `bounce`, per unit of linear
 * progress: the `w` at which the spring has settled to within
 * `SPRING_EPSILON` at `t = 1` (spec §3.2). With damping ratio
 * `zeta = 1 - bounce` it solves
 *
 * - `e^(-w) (1 + w) = SPRING_EPSILON` when `zeta` is exactly 1, and
 * - `e^(-zeta w) / sqrt(1 - zeta^2) = SPRING_EPSILON` otherwise, the
 *   envelope of the underdamped curve.
 *
 * Both sides fall monotonically in `w`. The solve is bisection on [1, 200]
 * for exactly 60 steps, with no exit that depends on the data, so every
 * engine and a C port take the same steps to the same double. 60 halvings of
 * the bracket's width 199 leave it under 2e-16, below one ulp of any `w` in
 * it, so the result is converged. It returns the upper end, at which the
 * residual is at or below `SPRING_EPSILON`. `w` is not monotonic in
 * `bounce`: measured every 0.001 over [0, 0.9] it runs from about 10.92 (at
 * 0.045) to about 92.15 (at 0.9), with 11.76 at 0, and the smallest non-zero
 * `bounce`, 2^-52, gives about 26.9. All of it lies well inside the bracket.
 *
 * Memoised per `bounce`: a scene's springs use a handful of values, and the
 * curve is evaluated several times a tick.
 */
export function springOmega(bounce: number): number {
  const cached = omegaByBounce.get(bounce);
  if (cached !== undefined) return cached;
  const zeta = 1 - bounce;
  const critical = zeta === 1;
  // Math.sqrt is one of the operations IEEE 754 requires to be correctly
  // rounded, so unlike Math.exp or Math.sin it returns the same double in
  // every engine and in C, and it is portable as it stands.
  const envelopeScale = critical ? 1 : Math.sqrt(1 - zeta * zeta);
  let lo = OMEGA_LO;
  let hi = OMEGA_HI;
  for (let i = 0; i < OMEGA_STEPS; i++) {
    const mid = 0.5 * (lo + hi);
    const residual = critical
      ? detExp(-mid) * (1 + mid)
      : detExp(-zeta * mid) / envelopeScale;
    if (residual > SPRING_EPSILON) lo = mid;
    else hi = mid;
  }
  omegaByBounce.set(bounce, hi);
  return hi;
}

/**
 * Spec §3.2's damped-oscillator curve for `t` in (0, 1), through `detMath`
 * so it is bit-identical across engines.
 *
 * The critically damped form is taken when `zeta` is exactly 1, never within
 * a tolerance. That is `bounce === 0`, and also a `bounce` of at most 2^-54,
 * for which `1 - bounce` rounds to 1 and the underdamped form would divide by
 * `sqrt(1 - zeta^2) = 0`. Every other `bounce`, however small, is underdamped.
 */
function springCurve(t: number, bounce: number): number {
  const zeta = 1 - bounce;
  const w = springOmega(bounce);
  if (zeta === 1) {
    const wt = w * t;
    return 1 - detExp(-wt) * (1 + wt);
  }
  // Math.sqrt is correctly rounded and so portable; see `springOmega`.
  const wd = w * Math.sqrt(1 - zeta * zeta);
  const deg = wd * t * RAD_TO_DEG;
  return 1 - detExp(-zeta * w * t) * (cosDeg(deg) + ((zeta * w) / wd) * sinDeg(deg));
}

/**
 * The end of its curve at which a `handoff` animation releases its body:
 * `"end"` for a plain animation, and `"start"` for a non-looping yoyo, which
 * finishes its return leg at progress 0. `null` when nothing is handed off.
 */
export type ReleaseEnd = "start" | "end" | null;

export function releaseEndOf(anim: Pick<IRAnimation, "handoff" | "yoyo" | "loop">): ReleaseEnd {
  // A loop never completes, so it never hands off (TYPE_HANDOFF_LOOP).
  if (!anim.handoff || anim.loop) return null;
  return anim.yoyo ? "start" : "end";
}

/**
 * Eased progress for linear progress `t`, clamped to [0, 1].
 *
 * With a release end, a curve that would arrive there at rest is swapped for
 * the cubic Hermite curve that arrives at half the average speed and keeps
 * the usual slope at its other end, so a handoff has momentum to hand over
 * (Phase 6C spec §2.2). A curve that already moves at its release end is
 * left alone.
 *
 * `bounce` shapes only `spring`, and every other curve ignores it.
 */
export function evaluateEasing(
  t: number,
  easing: string,
  release: ReleaseEnd = null,
  bounce: number = DEFAULT_BOUNCE,
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  // Before the release-end swaps, which do not apply: a spring settles at
  // rest and has no moving replacement, so the validator rejects it with
  // 'handoff: true' (TYPE_HANDOFF_SPRING) and `release` is never set here.
  if (easing === "spring") return springCurve(t, bounce);

  if (release === "end") {
    // Slopes 2 → 0.5 and 0 → 0.5.
    if (easing === "easeOut") return t * (2 + t * (-1.5 + 0.5 * t));
    if (easing === "easeInOut") return t * t * (2.5 - 1.5 * t);
  } else if (release === "start") {
    // Slopes 0.5 → 2 and 0.5 → 0.
    if (easing === "easeIn") return t * (0.5 + 0.5 * t * t);
    if (easing === "easeInOut") return t * (0.5 + t * (2 - 1.5 * t));
  }

  switch (easing) {
    case "easeIn":    return t * t;
    case "easeOut":   return t * (2 - t);
    case "easeInOut": return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case "linear":
    default:          return t;
  }
}
