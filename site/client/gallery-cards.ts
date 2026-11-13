/**
 * The decisions behind the gallery's cards and tag filter, kept free of the
 * DOM and the player so they can be tested on their own. `gallery.ts` wires
 * them to the page.
 */

/** A card is shown when no tag is pressed, or when it carries any pressed tag. */
export function matchesTags(cardTags: ReadonlyArray<string>, pressed: ReadonlySet<string>): boolean {
  return pressed.size === 0 || cardTags.some((tag) => pressed.has(tag));
}

/** What the filter's status line says after a change. */
export function countLabel(shown: number, total: number): string {
  return shown === total ? `Showing all ${total} scenes` : `Showing ${shown} of ${total} scenes`;
}

/** The part of `<marey-player>` a card uses. */
export interface CardPlayer {
  play(): void;
  pause(): void;
  currentTime: number;
  addEventListener(type: "ready", listener: () => void): void;
}

/**
 * One card's playback. A card shows its poster until it is hovered or has the
 * keyboard focus, plays while either lasts, and pauses when both have gone.
 * The poster is the player's own still (a bounded scene that is not playing
 * shows its last tick) or, when the entry gives one, the `poster` time, set
 * once the player is ready. Where the card cannot play (a screen without
 * hover, or a reader who asked for reduced motion) it only ever shows the
 * poster.
 *
 * The pool may take a card's player away and make a new one later; each new
 * player is attached, and only the newest is driven.
 */
export class CardPlayback {
  private hovered = false;
  private focused = false;
  private player: CardPlayer | null = null;
  private readonly poster: number | null;
  private readonly canPlay: boolean;

  constructor(poster: number | null, canPlay: boolean) {
    this.poster = poster;
    this.canPlay = canPlay;
  }

  /** True while the card is hovered or focused and is allowed to play. */
  get active(): boolean {
    return this.canPlay && (this.hovered || this.focused);
  }

  attach(player: CardPlayer): void {
    this.player = player;
    player.addEventListener("ready", () => {
      if (this.player !== player) return;
      if (this.active) player.play();
      else if (this.poster !== null) player.currentTime = this.poster;
    });
  }

  set(kind: "hover" | "focus", on: boolean): void {
    const was = this.active;
    if (kind === "hover") this.hovered = on;
    else this.focused = on;
    if (this.active === was || !this.player) return;
    if (this.active) this.player.play();
    else this.player.pause();
  }
}
