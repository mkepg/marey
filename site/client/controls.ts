/**
 * The player's control bar sits over the bottom of the scene. On this site
 * it fades out while the scene plays and the reader is neither pointing at
 * the player nor using its controls (`site.css`, `marey-player.is-playing`).
 * It stays on screens that cannot hover and while the scene is paused.
 *
 * The player fires no play or pause event, so the class follows its `paused`
 * property after everything that can change it: the scene loading, a click,
 * key or seek in the bar, and the scene ending. Code that calls `play()`,
 * `pause()` or `restart()` itself calls `syncPlaying` afterwards. Without the
 * class the bar shows, so a missed change leaves it visible, never hidden.
 */

export const PLAYING_CLASS = "is-playing";

/** The part of `<marey-player>` this needs. */
export interface PlayingTarget {
  readonly paused: boolean;
  readonly classList: Pick<DOMTokenList, "toggle">;
  addEventListener(type: string, listener: () => void): void;
}

/** The events after which `paused` may have changed. */
export const PLAYING_EVENTS = ["ready", "ended", "click", "keyup", "input", "change"] as const;

export function syncPlaying(player: PlayingTarget): void {
  player.classList.toggle(PLAYING_CLASS, !player.paused);
}

/**
 * Keeps `player`'s class in step with its playback. `later` defers each check
 * until the player has acted on the event: a click reaches this listener
 * before the play button's own handler has run.
 */
export function trackPlaying(
  player: PlayingTarget,
  later: (run: () => void) => void = (run) => void requestAnimationFrame(run),
): void {
  for (const type of PLAYING_EVENTS) player.addEventListener(type, () => later(() => syncPlaying(player)));
  syncPlaying(player);
}
