/**
 * The fixed simulation rate. 120Hz is chosen so that common export frame
 * rates divide evenly into it (24 → 5 ticks, 30 → 4, 60 → 2), which keeps
 * exported frames on exact simulation states rather than interpolations.
 */
export const TICK_HZ = 120;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_SECONDS = 1 / TICK_HZ;

/** Longest single frame we will honour; anything worse is treated as a hitch. */
export const MAX_FRAME_MS = 100;

/** Most ticks we will simulate in one rendered frame, to avoid a death spiral. */
export const MAX_CATCHUP_TICKS = 8;

/** Convert a duration in seconds to whole simulation ticks. */
export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_HZ));
}

/**
 * Turns wall-clock frame deltas into a whole number of fixed ticks.
 *
 * The remainder is carried between calls, so the tick count after a given
 * amount of elapsed time does not depend on how that time was split into
 * frames. That is what makes playback reproducible.
 */
export class LiveDriver {
  private accumulator = 0;

  /** Fraction of a tick left unspent, for render interpolation. 0..1 */
  alpha = 0;

  /** Returns how many fixed ticks to advance for this frame. */
  pump(deltaMs: number): number {
    this.accumulator += Math.min(deltaMs, MAX_FRAME_MS);

    let ticks = 0;
    while (this.accumulator >= TICK_MS && ticks < MAX_CATCHUP_TICKS) {
      this.accumulator -= TICK_MS;
      ticks++;
    }

    // If we hit the ceiling there is still a backlog. Drop it rather than
    // letting it compound into progressively slower frames.
    if (this.accumulator >= TICK_MS) {
      this.accumulator = 0;
    }

    this.alpha = this.accumulator / TICK_MS;
    return ticks;
  }

  reset(): void {
    this.accumulator = 0;
    this.alpha = 0;
  }
}
