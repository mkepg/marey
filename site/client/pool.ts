/**
 * Caps how many `<marey-player>` elements exist at once. Each player owns a
 * WebGL context, and browsers drop the oldest context past a small limit, so
 * a long page of samples cannot give every sample a live player. A sample asks
 * for a slot; the pool makes the player when the slot is near the viewport and
 * a place is free, and removes it again when the slot is far away.
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
export interface IntersectionObserverLike {
  observe(slot: Element, onDistance: (px: number) => void): void;
  unobserve(slot: Element): void;
}

interface Entry {
  readonly create: () => HTMLElement;
  /** Distance from the viewport at the last report; Infinity until the first. */
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

  constructor(limit: number, io: IntersectionObserverLike) {
    this.limit = limit;
    this.io = io;
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

  /** Gives each free place to the nearest slot that wants one. */
  private fill(): void {
    while (this.liveCount < this.limit) {
      let best: [Element, Entry] | null = null;
      for (const pair of this.entries) {
        const [slot, entry] = pair;
        if (entry.player || entry.distance > CREATE_WITHIN) continue;
        if (!slot.isConnected) continue;
        if (!best || entry.distance < best[1].distance || (entry.distance === best[1].distance && entry.order < best[1].order)) {
          best = pair;
        }
      }
      if (!best) return;
      const [slot, entry] = best;
      try {
        const player = entry.create();
        slot.append(player);
        entry.player = player;
        this.liveCount++;
      } catch {
        // A sample whose player cannot be made is given up on; the others still get their turn.
        this.io.unobserve(slot);
        this.entries.delete(slot);
      }
    }
  }
}

/**
 * The browser's observer behind the interface. Two observers, with margins of
 * the two thresholds, wake the pool when a slot crosses either; the distance
 * itself is measured from the slot's box at that moment. A box with no size
 * (inside a closed `details`) is infinitely far away.
 */
export function createViewportObserver(): IntersectionObserverLike {
  const callbacks = new Map<Element, (px: number) => void>();
  const measure = (slot: Element): number => {
    const r = slot.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, r.top - window.innerHeight, -r.bottom);
  };
  const report = (entries: IntersectionObserverEntry[]): void => {
    for (const e of entries) callbacks.get(e.target)?.(measure(e.target));
  };
  const near = new IntersectionObserver(report, { rootMargin: `${CREATE_WITHIN}px 0px` });
  const far = new IntersectionObserver(report, { rootMargin: `${REMOVE_BEYOND}px 0px` });
  return {
    observe(slot, onDistance) {
      callbacks.set(slot, onDistance);
      near.observe(slot);
      far.observe(slot);
    },
    unobserve(slot) {
      callbacks.delete(slot);
      near.unobserve(slot);
      far.unobserve(slot);
    },
  };
}

let shared: PlayerPool | null = null;

/** The page's one pool, so every kind of sample draws on the same 12 players. */
export function sharedPool(): PlayerPool {
  shared ??= new PlayerPool(PLAYER_LIMIT, createViewportObserver());
  return shared;
}
