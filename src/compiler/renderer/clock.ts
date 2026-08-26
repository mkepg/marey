/**
 * The fixed simulation rate. 120Hz is chosen so that common export frame
 * rates divide evenly into it (24 → 5 ticks, 30 → 4, 60 → 2), which keeps
 * exported frames on exact simulation states rather than interpolations.
 */
export const TICK_HZ = 120;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_SECONDS = 1 / TICK_HZ;

/**
 * Most ticks we will simulate in one rendered frame, to avoid a death spiral.
 *
 * 12 ticks is exactly 100ms, which matches PixiJS's own `Ticker._maxElapsedMS`
 * clamp on `deltaMS`. Keeping these equal means we consume every millisecond
 * the ticker is willing to report, so a sustained low frame rate slows
 * rendering without also slowing the simulation. A lower value here would put
 * the scene into permanent slow motion whenever frames take longer than this.
 */
export const MAX_CATCHUP_TICKS = 12;

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
    // A negative or non-finite delta would corrupt the accumulator permanently,
    // so treat anything nonsensical as no time passing.
    const delta = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    this.accumulator += delta;

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
