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
 *
 * Focus in the bar keeps it showing, for keyboard readers. A mouse click
 * would leave the clicked button focused too, and the bar up until the
 * reader clicked elsewhere, so after a pointer click the site moves the
 * focus off the control again. The player's shadow root is open, and its
 * controls are documented parts, so this needs nothing from the player.
 */

export const PLAYING_CLASS = "is-playing";

/** The part of `<marey-player>` this needs. */
export interface PlayingTarget {
  readonly paused: boolean;
  readonly classList: Pick<DOMTokenList, "toggle">;
  readonly shadowRoot: { readonly activeElement: Element | null } | null;
  addEventListener(type: string, listener: (event: Event) => void): void;
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
  player.addEventListener("click", (event) => releasePointerFocus(player, event));
  syncPlaying(player);
}

/**
 * After a click made with a pointer, takes the focus off the control that
 * was clicked, so the bar can fade once the pointer leaves. A click made with
 * the keyboard (Enter or Space on a focused button) has `detail` 0 and keeps
 * its focus. The click has already reached the control: a click inside the
 * shadow root arrives at the player after its target's own listeners.
 */
export function releasePointerFocus(player: PlayingTarget, event: Event): void {
  // `detail` is the click count: 1 or more from a pointer, 0 from a key.
  if (!(event as Partial<MouseEvent>).detail) return;
  const active = player.shadowRoot?.activeElement;
  if (active && "blur" in active && typeof active.blur === "function") active.blur();
}
