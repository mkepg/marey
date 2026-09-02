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
}

/**
 * Advance exactly one tick.
 *
 * Returns true only on the tick where a non-looping animation finishes: at
 * `durationTicks` for a plain animation, and at `2 * durationTicks` for a
 * `yoyo`, whose return leg is part of its runtime.
 */
export function advanceAnimTime(t: AnimTime): boolean {
  if (t.completed) return false;

  t.elapsedTicks += t.direction;

  if (t.elapsedTicks >= t.durationTicks) {
    if (t.yoyo) {
      t.elapsedTicks = t.durationTicks;
      t.direction = -1;
    } else if (t.loop) {
      t.elapsedTicks = 0;
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
 * Progress through the animation, 0..1.
 *
 * `alpha` is the unspent fraction of a tick from the driver. Because easing is
 * a pure function of progress, animations interpolate smoothly just by
 * evaluating at a fractional tick — no previous-state buffer is needed.
 */
export function animProgress(t: AnimTime, alpha: number): number {
  if (t.durationTicks <= 0) return 1;

  const sub = t.completed ? 0 : alpha * t.direction;
  const p = (t.elapsedTicks + sub) / t.durationTicks;

  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
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
