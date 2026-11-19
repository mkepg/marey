import { describe, expect, it, vi } from "vitest";
import { CREATE_WITHIN, PlayerPool, REMOVE_BEYOND, type IntersectionObserverLike } from "./pool";

/** A slot and a player that remember where they are, standing in for DOM nodes. */
class FakeSlot {
  isConnected = true;
  children: FakePlayer[] = [];
  append(el: FakePlayer): void {
    el.parent = this;
    this.children.push(el);
  }
}
class FakePlayer {
  parent: FakeSlot | null = null;
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
}

/** An observer driven by hand: the test says how far each slot is from the viewport. */
class FakeObserver implements IntersectionObserverLike {
  readonly callbacks = new Map<Element, (px: number) => void>();
  observe(slot: Element, onDistance: (px: number) => void): void {
    this.callbacks.set(slot, onDistance);
  }
  unobserve(slot: Element): void {
    this.callbacks.delete(slot);
  }
  /** Where each slot really is now, which the observer's last report may not say. */
  readonly truth = new Map<object, number>();
  /** Reports `px` for the slot; the slot is really `actual` away (default: the same). */
  move(slot: object, px: number, actual = px): void {
    this.truth.set(slot, actual);
    this.callbacks.get(slot as Element)?.(px);
  }
  distanceOf = (slot: Element): number => this.truth.get(slot) ?? Number.POSITIVE_INFINITY;
}

function setup(limit = 12) {
  const io = new FakeObserver();
  const pool = new PlayerPool(limit, io, io.distanceOf);
  const made: FakePlayer[] = [];
  const create = (): HTMLElement => {
    const p = new FakePlayer();
    made.push(p);
    return p as unknown as HTMLElement;
  };
  const request = (slot: FakeSlot) => pool.request(slot as unknown as Element, create);
  return { io, pool, made, request };
}

describe("PlayerPool", () => {
  it("names the distances the brief fixes", () => {
    expect(CREATE_WITHIN).toBe(400);
    expect(REMOVE_BEYOND).toBe(1200);
  });

  it("holds exactly 12 live players when 20 slots are in view", () => {
    const { io, pool, made, request } = setup();
    const slots = Array.from({ length: 20 }, () => new FakeSlot());
    for (const s of slots) request(s);
    for (const s of slots) io.move(s, 0);
    expect(pool.live).toBe(12);
    expect(made).toHaveLength(12);
    expect(slots.filter((s) => s.children.length === 1)).toHaveLength(12);
  });

  it("creates nothing for a slot farther than 400 px", () => {
    const { io, pool, request } = setup();
    const s = new FakeSlot();
    request(s);
    io.move(s, 401);
    expect(pool.live).toBe(0);
    io.move(s, 400);
    expect(pool.live).toBe(1);
  });

  it("fills the nearest waiting slot when one is released", () => {
    const { io, pool, request } = setup(2);
    const [a, b, far, near] = [new FakeSlot(), new FakeSlot(), new FakeSlot(), new FakeSlot()];
    for (const s of [a, b, far, near]) request(s);
    io.move(a, 0);
    io.move(b, 0);
    io.move(far, 380);
    io.move(near, 20);
    expect(pool.live).toBe(2);
    pool.release(a as unknown as Element);
    expect(pool.live).toBe(2);
    expect(near.children).toHaveLength(1);
    expect(far.children).toHaveLength(0);
  });

  it("removes the player of a slot that moves beyond 1200 px and fills a waiting slot", () => {
    const { io, pool, request } = setup(1);
    const [a, b] = [new FakeSlot(), new FakeSlot()];
    request(a);
    request(b);
    io.move(a, 0);
    io.move(b, 100);
    expect(a.children).toHaveLength(1);
    io.move(a, 1201);
    expect(a.children).toHaveLength(0);
    expect(b.children).toHaveLength(1);
    expect(pool.live).toBe(1);
  });

  it("keeps a player that is between 400 and 1200 px away", () => {
    const { io, pool, request } = setup();
    const s = new FakeSlot();
    request(s);
    io.move(s, 0);
    io.move(s, 900);
    expect(pool.live).toBe(1);
    expect(s.children).toHaveLength(1);
  });

  it("creates one player however often a slot is requested", () => {
    const { io, pool, made, request } = setup();
    const s = new FakeSlot();
    request(s);
    request(s);
    io.move(s, 0);
    request(s);
    expect(made).toHaveLength(1);
    expect(pool.live).toBe(1);
  });

  it("never creates a player for a slot released before it was filled", () => {
    const { io, pool, made, request } = setup();
    const s = new FakeSlot();
    request(s);
    pool.release(s as unknown as Element);
    io.move(s, 0);
    expect(made).toHaveLength(0);
    expect(pool.live).toBe(0);
  });

  it("does not create for a slot that left the document before its turn", () => {
    const { io, pool, made, request } = setup(1);
    const [a, b] = [new FakeSlot(), new FakeSlot()];
    request(a);
    request(b);
    io.move(a, 0);
    io.move(b, 0);
    b.isConnected = false;
    pool.release(a as unknown as Element);
    expect(made).toHaveLength(1);
    expect(pool.live).toBe(0);
  });

  it("lets a request made again after a release create a fresh player", () => {
    const { io, pool, made, request } = setup();
    const s = new FakeSlot();
    request(s);
    io.move(s, 0);
    pool.release(s as unknown as Element);
    expect(s.children).toHaveLength(0);
    request(s);
    io.move(s, 0);
    expect(made).toHaveLength(2);
    expect(pool.live).toBe(1);
  });

  it("survives a create function that throws, and fills the next slot", () => {
    const io = new FakeObserver();
    const pool = new PlayerPool(1, io, io.distanceOf);
    const [a, b] = [new FakeSlot(), new FakeSlot()];
    pool.request(a as unknown as Element, () => {
      throw new Error("no");
    });
    pool.request(b as unknown as Element, () => new FakePlayer() as unknown as HTMLElement);
    io.move(a, 0);
    io.move(b, 5);
    expect(pool.live).toBe(1);
    expect(b.children).toHaveLength(1);
  });

  it("orders waiting slots by their distance now, not by the last report", () => {
    const { io, pool, request } = setup(1);
    const [holder, drifted, arrived] = [new FakeSlot(), new FakeSlot(), new FakeSlot()];
    for (const s of [holder, drifted, arrived]) request(s);
    io.move(holder, 0);
    // Both report 400 on crossing the margin; `drifted` has since moved away, `arrived` is on screen.
    io.move(drifted, 400, 390);
    io.move(arrived, 400, 10);
    pool.release(holder as unknown as Element);
    expect(arrived.children).toHaveLength(1);
    expect(drifted.children).toHaveLength(0);
  });

  it("does not create for a waiting slot that has drifted beyond 400 px since its report", () => {
    const { io, pool, request } = setup(1);
    const [holder, drifted] = [new FakeSlot(), new FakeSlot()];
    request(holder);
    request(drifted);
    io.move(holder, 0);
    io.move(drifted, 400, 900);
    pool.release(holder as unknown as Element);
    expect(pool.live).toBe(0);
  });

  it("stops tracking a waiting slot that left the document", () => {
    const { io, pool, request } = setup(1);
    const [holder, gone] = [new FakeSlot(), new FakeSlot()];
    request(holder);
    request(gone);
    io.move(holder, 0);
    io.move(gone, 10);
    gone.isConnected = false;
    pool.release(holder as unknown as Element);
    expect(io.callbacks.has(gone as unknown as Element)).toBe(false);
    expect(pool.live).toBe(0);
  });

  it("gives a waiting slot on screen the place of the player farthest off screen", () => {
    const { io, pool, request } = setup(2);
    const [near, far, onScreen] = [new FakeSlot(), new FakeSlot(), new FakeSlot()];
    for (const s of [near, far, onScreen]) request(s);
    io.move(near, 0);
    io.move(far, 0);
    // Scrolled: both players are now off screen but inside 1,200 px, so neither is removed by distance.
    io.move(near, 300);
    io.move(far, 900);
    expect(pool.live).toBe(2);
    io.move(onScreen, 0);
    expect(onScreen.children).toHaveLength(1);
    expect(far.children).toHaveLength(0);
    expect(near.children).toHaveLength(1);
    expect(pool.live).toBe(2);
  });

  it("frees as many places as there are waiting slots on screen, and no more", () => {
    const { io, pool, request } = setup(3);
    const old = [new FakeSlot(), new FakeSlot(), new FakeSlot()];
    const fresh = [new FakeSlot(), new FakeSlot()];
    for (const s of [...old, ...fresh]) request(s);
    for (const s of old) io.move(s, 0);
    old.forEach((s, i) => io.move(s, 100 + i * 300));
    for (const s of fresh) io.move(s, 0);
    expect(fresh.every((s) => s.children.length === 1)).toBe(true);
    // The nearest of the old players keeps its place.
    expect(old.map((s) => s.children.length)).toEqual([1, 0, 0]);
    expect(pool.live).toBe(3);
  });

  it("never removes a player on screen for another slot on screen", () => {
    const { io, pool, made, request } = setup(2);
    const slots = [new FakeSlot(), new FakeSlot(), new FakeSlot()];
    for (const s of slots) request(s);
    for (const s of slots) io.move(s, 0);
    expect(slots.map((s) => s.children.length)).toEqual([1, 1, 0]);
    expect(pool.live).toBe(2);
    // No player was removed and made again: two players made for two places.
    expect(made).toHaveLength(2);
  });

  it("stops trading places when the distances it measures disagree from one call to the next", () => {
    const io = new FakeObserver();
    // Every measurement flips between on screen and 500 px away, which no
    // real page does; the pool must still return, within its limit.
    let calls = 0;
    const flipping = (): number => (calls++ % 2 === 0 ? 0 : 500);
    const pool = new PlayerPool(2, io, flipping);
    let made = 0;
    const slots = Array.from({ length: 6 }, () => new FakeSlot());
    for (const s of slots) {
      pool.request(s as unknown as Element, () => {
        made++;
        return new FakePlayer() as unknown as HTMLElement;
      });
    }
    for (const s of slots) io.move(s, 0);
    expect(pool.live).toBeLessThanOrEqual(2);
    // At most one trade per slot on each of the six reports, beyond the first two players.
    expect(made).toBeLessThanOrEqual(2 + 6 * 6);
  });

  it("does not take a place for a waiting slot that is near but not on screen", () => {
    const { io, pool, request } = setup(1);
    const [holder, near] = [new FakeSlot(), new FakeSlot()];
    request(holder);
    request(near);
    io.move(holder, 0);
    io.move(holder, 600);
    io.move(near, 100);
    expect(holder.children).toHaveLength(1);
    expect(near.children).toHaveLength(0);
    expect(pool.live).toBe(1);
  });

  it("keeps the evicted slot waiting, and gives it a player again when it is back on screen", () => {
    const { io, pool, made, request } = setup(1);
    const [a, b] = [new FakeSlot(), new FakeSlot()];
    request(a);
    request(b);
    io.move(a, 0);
    io.move(a, 700);
    io.move(b, 0);
    expect(b.children).toHaveLength(1);
    io.move(b, 700);
    io.move(a, 0);
    expect(a.children).toHaveLength(1);
    expect(b.children).toHaveLength(0);
    expect(made).toHaveLength(3);
    expect(pool.live).toBe(1);
  });

  it("logs a create function that throws", () => {
    const io = new FakeObserver();
    const pool = new PlayerPool(1, io, io.distanceOf);
    const seen = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const a = new FakeSlot();
    pool.request(a as unknown as Element, () => {
      throw new Error("no");
    });
    io.move(a, 0);
    expect(seen).toHaveBeenCalledOnce();
    seen.mockRestore();
  });
});
