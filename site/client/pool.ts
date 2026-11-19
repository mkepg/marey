/**
 * Caps how many `<marey-player>` elements exist at once. Each player owns a
 * WebGL context, and browsers drop the oldest context past a small limit, so
 * a long page of samples cannot give every sample a live player. A sample asks
 * for a slot; the pool makes the player when the slot is near the viewport and
 * a place is free, and removes it again when the slot is far away. A slot on
 * screen that is still waiting when every place is taken gets the place of the
 * player farthest off screen, so nothing the reader is looking at stays empty
 * while a player they cannot see holds a place.
 */

/** A slot closer than this many pixels to the viewport may get a player. */
export const CREATE_WITHIN = 400;
/** A slot farther than this many pixels from the viewport loses its player. */
export const REMOVE_BEYOND = 1200;
/** Players alive at once. */
export const PLAYER_LIMIT = 12;

/**
 * Reports how far an element is from the viewport, in pixels (0 while it is
 * on screen), whenever that crosses a threshold the pool cares about. Named
 * for the browser API behind the real one; the pool is driven by hand in tests.
 */
export type DistanceOf = (slot: Element) => number;

/**
 * How far a slot's box is from the viewport now, in pixels (0 while any of it
 * is on screen). A box with no size, such as one inside a closed `details`,
 * is infinitely far away.
 */
export function measureDistance(slot: Element): number {
  const r = slot.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, r.top - window.innerHeight, -r.bottom);
}

export interface IntersectionObserverLike {
  observe(slot: Element, onDistance: (px: number) => void): void;
  unobserve(slot: Element): void;
}

interface Entry {
  readonly create: () => HTMLElement;
  /**
   * Distance at the last report; Infinity until the first. The observer only
   * reports when a margin is crossed, so this says "the observer has seen the
   * slot" and decides removal; the order of waiting slots is measured afresh.
   */
  distance: number;
  player: HTMLElement | null;
  /** Order of the request, to break ties between slots at the same distance. */
  readonly order: number;
}

export class PlayerPool {
  private readonly entries = new Map<Element, Entry>();
  private liveCount = 0;
  private counter = 0;

  private readonly limit: number;
  private readonly io: IntersectionObserverLike;
  private readonly distanceOf: DistanceOf;

  constructor(limit: number, io: IntersectionObserverLike, distanceOf: DistanceOf = measureDistance) {
    this.limit = limit;
    this.io = io;
    this.distanceOf = distanceOf;
  }

  /** Players currently in the document. */
  get live(): number {
    return this.liveCount;
  }

  /** Asks for a player in `slot`. Asking again while the slot is registered does nothing. */
  request(slot: Element, create: () => HTMLElement): void {
    if (this.entries.has(slot)) return;
    this.entries.set(slot, { create, distance: Number.POSITIVE_INFINITY, player: null, order: this.counter++ });
    this.io.observe(slot, (px) => this.onDistance(slot, px));
  }

  /** Drops the slot: removes its player, forgets it, and gives the place to the nearest waiting slot. */
  release(slot: Element): void {
    const entry = this.entries.get(slot);
    if (!entry) return;
    this.io.unobserve(slot);
    this.entries.delete(slot);
    this.drop(entry);
    this.fill();
  }

  private onDistance(slot: Element, px: number): void {
    const entry = this.entries.get(slot);
    if (!entry) return;
    entry.distance = px;
    if (entry.player && px > REMOVE_BEYOND) this.drop(entry);
    this.fill();
  }

  private drop(entry: Entry): void {
    if (!entry.player) return;
    entry.player.remove();
    entry.player = null;
    this.liveCount--;
  }

  /**
   * Fills the free places, then trades off-screen players for on-screen slots
   * until none is left waiting. The loop is bounded twice over, so it cannot
   * spin however the distances are measured: each round must give its freed
   * place to a slot on screen other than the one it took it from, and there
   * are at most as many rounds as slots.
   */
  private fill(): void {
    this.fillFreePlaces();
    for (let round = 0; round < this.entries.size; round++) {
      const freed = this.evictForOnScreen();
      if (!freed) return;
      const filled = this.fillFreePlaces();
      if (!filled.some((slot) => slot !== freed && this.distanceOf(slot) === 0)) return;
    }
  }

  /**
   * When every place is taken and a slot on screen is still waiting, removes
   * the player whose slot is farthest from the viewport, if that slot is off
   * screen. Returns the slot whose player was removed, or null. A player whose
   * slot is on screen is never removed for another, so when more slots are on
   * screen than there are places, the extra ones wait.
   */
  private evictForOnScreen(): Element | null {
    if (this.liveCount < this.limit) return null;
    let waitingOnScreen = false;
    let farthest: { slot: Element; entry: Entry; distance: number } | null = null;
    for (const [slot, entry] of this.entries) {
      if (!slot.isConnected) continue;
      if (entry.player) {
        const distance = this.distanceOf(slot);
        if (!farthest || distance > farthest.distance) farthest = { slot, entry, distance };
      } else if (entry.distance !== Number.POSITIVE_INFINITY && this.distanceOf(slot) === 0) {
        waitingOnScreen = true;
      }
    }
    if (!waitingOnScreen || !farthest || farthest.distance === 0) return null;
    this.drop(farthest.entry);
    return farthest.slot;
  }

  /**
   * Gives each free place to the nearest slot that wants one. Distances are
   * measured here, not taken from the last report: a report is a snapshot from
   * when a margin was crossed, and a slot that drifted away since would
   * otherwise tie with one that has just scrolled in. Returns the slots it
   * gave a player.
   */
  private fillFreePlaces(): Element[] {
    const filled: Element[] = [];
    while (this.liveCount < this.limit) {
      let best: { slot: Element; entry: Entry; distance: number } | null = null;
      for (const [slot, entry] of [...this.entries]) {
        if (entry.player || entry.distance === Number.POSITIVE_INFINITY) continue;
        if (!slot.isConnected) {
          // A slot taken out of the page will never be shown: stop tracking it.
          this.io.unobserve(slot);
          this.entries.delete(slot);
          continue;
        }
        const distance = this.distanceOf(slot);
        if (distance > CREATE_WITHIN) continue;
        if (!best || distance < best.distance || (distance === best.distance && entry.order < best.entry.order)) {
          best = { slot, entry, distance };
        }
      }
      if (!best) return filled;
      const { slot, entry } = best;
      try {
        const player = entry.create();
        slot.append(player);
        entry.player = player;
        this.liveCount++;
        filled.push(slot);
      } catch (e) {
        // A sample whose player cannot be made is given up on; the others still get their turn.
        console.error("The sample's player could not be made", e);
        this.io.unobserve(slot);
        this.entries.delete(slot);
      }
    }
    return filled;
  }
}

/**
 * The browser's observer behind the interface. Three observers wake the pool
 * when a slot crosses the edge of the viewport or either threshold; the
 * distance itself is measured from the slot's box at that moment. A box with
 * no size (inside a closed `details`) is infinitely far away.
 */
export function createViewportObserver(): IntersectionObserverLike {
  const callbacks = new Map<Element, (px: number) => void>();
  const report = (entries: IntersectionObserverEntry[]): void => {
    for (const e of entries) callbacks.get(e.target)?.(measureDistance(e.target));
  };
  // The viewport's own edge matters too: a slot that scrolls on screen while
  // every place is taken can then claim one (PlayerPool.evictForOnScreen).
  const observers = [0, CREATE_WITHIN, REMOVE_BEYOND].map(
    (margin) => new IntersectionObserver(report, { rootMargin: `${margin}px 0px` }),
  );
  return {
    observe(slot, onDistance) {
      callbacks.set(slot, onDistance);
      for (const o of observers) o.observe(slot);
    },
    unobserve(slot) {
      callbacks.delete(slot);
      for (const o of observers) o.unobserve(slot);
    },
  };
}

let shared: PlayerPool | null = null;

/** The page's one pool, so every kind of sample draws on the same 12 players. */
export function sharedPool(): PlayerPool {
  shared ??= new PlayerPool(PLAYER_LIMIT, createViewportObserver());
  return shared;
}
