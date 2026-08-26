import { TICK_HZ } from "./clock";

/**
 * Matter normalises velocity and air friction against `Common._baseDelta`
 * (1000/60 ms), independently of the delta actually passed to `Engine.update`.
 * `MATTER_R` is our tick expressed in those units.
 *
 * Every conversion below is written in terms of it rather than hard-coded for
 * 120Hz, so changing TICK_HZ cannot silently halve or double anything.
 */
export const MATTER_R = 60 / TICK_HZ;

/** Milliseconds of one fixed tick, as Matter wants it. */
export const MATTER_DELTA_MS = 1000 / TICK_HZ;

/** Matter's own velocity unit: pixels per 1/60 of a second. */
const MATTER_BASE_HZ = 60;

/**
 * Declare's `airDrag` is 0 = vacuum, 1 = maximum resistance, and was defined by
 * the old engine as `pow(1 - airDrag, 1/60)` applied once per tick.
 *
 * Matter damps by `1 - frictionAir * MATTER_R` once per tick. Matching one
 * second of the two gives `1 - fa*r = (1 - airDrag)^r`.
 */
export function airDragToFrictionAir(airDrag: number): number {
  const clamped = airDrag < 0 ? 0 : airDrag > 1 ? 1 : airDrag;
  return (1 - Math.pow(1 - clamped, MATTER_R)) / MATTER_R;
}

/** px/s (Declare) → px per 1/60s (Matter's `Body.setVelocity`). */
export function pxPerSecToMatter(pxPerSec: number): number {
  return pxPerSec / MATTER_BASE_HZ;
}

/** px per 1/60s (Matter) → px/s (Declare). */
export function matterToPxPerSec(matterVel: number): number {
  return matterVel * MATTER_BASE_HZ;
}

/**
 * px/s^2 (Declare) → the velocity delta, in Matter units, to add once per tick.
 *
 * This is deliberately not a force. See spec 6.4: a force set before
 * `Engine.update` is still in the buffer when Matter's sleeping pass reads it,
 * so nothing would ever sleep.
 */
export function gravityToTickDelta(pxPerSecSq: number): number {
  return pxPerSecToMatter(pxPerSecSq) / TICK_HZ;
}
