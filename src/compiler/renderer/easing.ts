/**
 * Easing curves, as pure functions of linear progress.
 *
 * Kept apart from `sceneRuntime.ts` for the reason `clock.ts` and
 * `timeline.ts` are: it imports nothing from `pixi.js`, so it is tested in
 * Node.
 */
import type { IRAnimation } from "../sceneIR";

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
 */
export function evaluateEasing(t: number, easing: string, release: ReleaseEnd = null): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

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
