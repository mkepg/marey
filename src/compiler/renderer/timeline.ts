/**
 * Frame-indexed time state for a running animation.
 *
 * Everything is counted in fixed simulation ticks rather than milliseconds,
 * so a given tick index always corresponds to the same visual state.
 */
export interface AnimTime {
  elapsedTicks: number;
  durationTicks: number;
  /** 1 forwards, -1 while a yoyo is reversing. */
  direction: number;
  completed: boolean;
  loop: boolean;
  yoyo: boolean;
  /**
   * Remaining delay in ticks; counts down to 0 and is never re-armed. Spent
   * exactly once, before the first iteration, so a looping animation's period
   * stays `duration` — roadmap 5.2's phase-offset criterion needs delay to
   * shift phase, not period, the same defect already avoided for `duration`.
   */
  delayTicks: number;
  /**
   * `elapsedTicks` as it stood before the most recent `advanceAnimTime`.
   * `paintProgress` interpolates from it, so painting runs backward across
   * [N-1, N] as `readState` does for physics. Equal to `elapsedTicks` after a
   * tick that did not move the animation: a delay tick, or any tick after it
   * completed.
   */
  prevElapsedTicks: number;
  /**
   * Whether the most recent tick wrapped a looping animation from its last
   * tick back to 0. `paintProgress` then paints that tick toward the end of
   * the cycle rather than sweeping back through the whole path.
   */
  wrappedThisTick: boolean;
}

/**
 * Advance exactly one tick.
 *
 * Returns true only on the tick where a non-looping animation finishes: at
 * `durationTicks` for a plain animation, and at `2 * durationTicks` for a
 * `yoyo`, whose return leg is part of its runtime.
 */
export function advanceAnimTime(t: AnimTime): boolean {
  // First, and before every early return, so a runner that does not move on
  // this tick paints still.
  t.prevElapsedTicks = t.elapsedTicks;
  t.wrappedThisTick = false;

  if (t.completed) return false;

  if (t.delayTicks > 0) {
    t.delayTicks -= 1;
    return false;
  }

  t.elapsedTicks += t.direction;

  if (t.elapsedTicks >= t.durationTicks) {
    if (t.yoyo) {
      t.elapsedTicks = t.durationTicks;
      t.direction = -1;
    } else if (t.loop) {
      t.elapsedTicks = 0;
      t.wrappedThisTick = true;
    } else {
      t.elapsedTicks = t.durationTicks;
      t.completed = true;
      return true;
    }
  } else if (t.elapsedTicks <= 0 && t.direction === -1) {
    if (t.loop) {
      t.elapsedTicks = 0;
      t.direction = 1;
    } else {
      // A non-looping yoyo has run both legs, so it is finished (P3A-10). It
      // completes here rather than at `durationTicks` because the return leg is
      // part of the animation: total runtime is exactly `2 * durationTicks`.
      //
      // Resting at elapsed 0 without completing is what this used to do, and it
      // meant the runner was never spliced, `isIdle()` never passed, and a
      // position animation's hold on its body was never released.
      //
      // `direction` is deliberately left at -1: `animProgress` ignores the
      // sub-tick term once `completed` is set, so progress is exactly 0 — the
      // animation's starting value — and nothing interpolates past it.
      t.elapsedTicks = 0;
      t.completed = true;
      return true;
    }
  }

  return false;
}

/**
 * Progress through the animation, 0..1, as the tick phase reads it.
 *
 * Called with `alpha = 0` it is the tick-exact progress at tick N: what
 * `pushAnimToWorld`, a scale runner's own value, the completion snap and
 * `paintExactTick` all use. A positive `alpha` extends forward from tick N
 * toward N+1; nothing paints that way any more, because the live preview
 * paints with `paintProgress`, which interpolates backward as physics does.
 */
export function animProgress(t: AnimTime, alpha: number): number {
  if (t.durationTicks <= 0) return 1;
  // The driver's sub-tick `alpha` must not leak a small positive progress
  // into a still-delayed animation.
  if (t.delayTicks > 0) return 0;

  const sub = t.completed ? 0 : alpha * t.direction;
  const p = (t.elapsedTicks + sub) / t.durationTicks;

  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}

/**
 * Progress to paint at the driver's sub-tick `alpha`: the lerp from the
 * previous tick's progress to this tick's (Phase 6C spec §2.4). It is the
 * same backward interpolation `readState` gives physics, so a body and an
 * animation painted at one alpha sit at one moment, and an object handing
 * off from one to the other keeps its pace. A loop's wrap tick paints to the
 * end of the cycle; the jump back to the start falls between frames.
 */
export function paintProgress(t: AnimTime, alpha: number): number {
  if (t.durationTicks <= 0) return 1;
  if (t.delayTicks > 0) return 0;
  const to = t.wrappedThisTick ? t.durationTicks : t.elapsedTicks;
  const p = (t.prevElapsedTicks + (to - t.prevElapsedTicks) * alpha) / t.durationTicks;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** Frame-indexed time state for a running physics simulation. */
export interface PhysicsTime {
  elapsedTicks: number;
  /** null means `duration: indefinitely` — this runner never completes. */
  durationTicks: number | null;
  completed: boolean;
}

/**
 * Advance exactly one tick.
 * Returns true only on the tick where a finite simulation finishes.
 */
export function advancePhysicsTime(t: PhysicsTime): boolean {
  if (t.completed) return false;
  if (t.durationTicks === null) return false;

  t.elapsedTicks += 1;

  if (t.elapsedTicks >= t.durationTicks) {
    t.completed = true;
    return true;
  }

  return false;
}
