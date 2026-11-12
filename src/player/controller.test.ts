import { describe, it, expect, vi } from "vitest";
import { tickToTime } from "../compiler/sceneIR";
import {
  PlayerController,
  PlayerError,
  type ControllerOptions,
  type MountFn,
  type PlayerMount,
  type PlayheadState,
} from "./controller";

const BOUNDED = `scene { size: (400, 300) duration: 2 circle c { position: (1, 2), radius: 3 } }`;
const INDEFINITE = `scene { size: (400, 300) circle c { position: (1, 2), radius: 3 } }`;
const OTHER_SIZE = `scene { size: (640, 360) duration: 2 circle c { position: (1, 2), radius: 3 } }`;

/**
 * Records calls and lets a test push states, imitating the renderer's playback.
 *
 * Like `Playback`, play/pause/restart notify synchronously, and `seek` only
 * records its target. `performSeek()` is the next frame performing it: the
 * playhead lands on the target, paused, and listeners hear it. `restart`
 * drops a recorded target, as `Playback.restart` does. A state a test
 * `push`es stands for a frame, and a frame performs any recorded seek before
 * anything else, so `push` drops the record too.
 */
class FakeMount implements PlayerMount {
  calls: string[] = [];
  destroyed = 0;
  pendingSeek: number | null = null;
  private listeners = new Set<(s: PlayheadState) => void>();
  state: PlayheadState;
  constructor(state: PlayheadState) {
    this.state = state;
  }
  play() {
    this.calls.push("play");
    const atEnd = this.state.endTick !== null && this.state.tick === this.state.endTick;
    this.emit(atEnd ? { tick: 0, playing: true } : { playing: true });
  }
  pause() { this.calls.push("pause"); this.emit({ playing: false }); }
  seek(tick: number) { this.calls.push(`seek:${tick}`); this.pendingSeek = tick; }
  hasPendingSeek() { return this.pendingSeek !== null; }
  restart() { this.calls.push("restart"); this.pendingSeek = null; this.emit({ tick: 0, playing: true }); }
  subscribe(l: (s: PlayheadState) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  getState() { return this.state; }
  async liveFramesHash() { return "hash"; }
  destroy() { this.destroyed++; }
  /** The next frame performs the recorded seek and leaves playback paused. */
  performSeek() {
    const target = this.pendingSeek;
    if (target === null) throw new Error("no seek recorded");
    this.pendingSeek = null;
    this.emit({ tick: target, playing: false, reachedTick: Math.max(this.state.reachedTick, target) });
  }
  push(s: Partial<PlayheadState>) {
    this.pendingSeek = null;
    this.emit(s);
  }
  private emit(s: Partial<PlayheadState>) {
    this.state = { ...this.state, ...s };
    for (const l of [...this.listeners]) l(this.state);
  }
}

function setup(opts: { autoplay?: boolean; loop?: boolean; reducedMotion?: boolean } = {}) {
  const events = {
    ready: vi.fn(),
    error: vi.fn(),
    ended: vi.fn(),
    mounted: vi.fn(),
    state: vi.fn(),
  };
  const options: ControllerOptions = {
    autoplay: () => opts.autoplay ?? true,
    loop: () => opts.loop ?? false,
    reducedMotion: () => opts.reducedMotion ?? false,
    onReady: events.ready,
    onError: events.error,
    onEnded: events.ended,
    onMounted: events.mounted,
    onState: events.state,
  };
  const starts: Array<{ tick: number; playing: boolean }> = [];
  const mounts: FakeMount[] = [];
  const mountFn: MountFn = async (ir, start) => {
    starts.push(start);
    const m = new FakeMount({
      tick: start.tick,
      playing: start.playing,
      endTick: ir.duration === null ? null : Math.round(ir.duration * 120),
      reachedTick: start.tick,
    });
    mounts.push(m);
    return m;
  };
  return { controller: new PlayerController(options), events, starts, mounts, mountFn };
}

const text = (s: string) => async () => s;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("PlayerController: initial playhead", () => {
  it("autoplay without reduced motion mounts at tick 0, playing", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    expect(t.starts).toEqual([{ tick: 0, playing: true }]);
  });

  it("reduced motion shows the poster: last tick of a bounded scene, paused", async () => {
    const t = setup({ reducedMotion: true });
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    expect(t.starts).toEqual([{ tick: 240, playing: false }]);
    expect(t.controller.paused).toBe(true);
  });

  it("no autoplay on an indefinite scene shows tick 0, paused", async () => {
    const t = setup({ autoplay: false });
    await t.controller.load(text(INDEFINITE));
    await t.controller.attach(t.mountFn);
    expect(t.starts).toEqual([{ tick: 0, playing: false }]);
  });
});

describe("PlayerController: ready and duration", () => {
  it("ready fires once, after compile, before any attach", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    expect(t.events.ready).toHaveBeenCalledTimes(1);
    expect(t.events.ready).toHaveBeenCalledWith({ width: 400, height: 300, duration: 2 });
    expect(t.controller.mounted).toBeNull();
  });

  it("duration is NaN before ready and Infinity when indefinite", async () => {
    const t = setup();
    expect(t.controller.duration).toBeNaN();
    await t.controller.load(text(INDEFINITE));
    expect(t.controller.duration).toBe(Infinity);
  });
});

describe("PlayerController: leaving and re-entering view", () => {
  it("detach stores the playhead; attach restores it", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 90, playing: true });
    t.controller.detach();
    expect(t.mounts[0].destroyed).toBe(1);
    expect(t.controller.mounted).toBeNull();
    await t.controller.attach(t.mountFn);
    expect(t.starts[1]).toEqual({ tick: 90, playing: true });
  });

  it("an indefinite scene restarts from tick 0 after leaving view", async () => {
    const t = setup();
    await t.controller.load(text(INDEFINITE));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 500, playing: true });
    t.controller.detach();
    await t.controller.attach(t.mountFn);
    expect(t.starts[1]).toEqual({ tick: 0, playing: true });
  });
});

describe("PlayerController: race guards", () => {
  it("a mount that resolves after detach is destroyed", async () => {
    const t = setup();
    const gate = deferred<void>();
    const late: MountFn = async (ir, start) => {
      await gate.promise;
      return t.mountFn(ir, start);
    };
    await t.controller.load(text(BOUNDED));
    const attaching = t.controller.attach(late);
    t.controller.detach();
    gate.resolve();
    await attaching;
    expect(t.mounts).toHaveLength(1);
    expect(t.mounts[0].destroyed).toBe(1);
    expect(t.controller.mounted).toBeNull();
  });

  it("a mount that resolves after a newer load is destroyed", async () => {
    const t = setup();
    const gate = deferred<void>();
    const late: MountFn = async (ir, start) => {
      await gate.promise;
      return t.mountFn(ir, start);
    };
    await t.controller.load(text(BOUNDED));
    const attaching = t.controller.attach(late);
    const slow = deferred<string>();
    const reloading = t.controller.load(() => slow.promise);
    gate.resolve();
    await attaching;
    expect(t.mounts[0].destroyed).toBe(1);
    expect(t.controller.mounted).toBeNull();
    slow.resolve(OTHER_SIZE);
    await reloading;
  });

  it("a superseded load that rejects late reports no error", async () => {
    const t = setup();
    const first = deferred<string>();
    const a = t.controller.load(() => first.promise);
    await t.controller.load(text(BOUNDED));
    first.reject(new PlayerError("PLAYER_FETCH_FAILED", "404 old.marey"));
    await a;
    expect(t.events.error).not.toHaveBeenCalled();
    expect(t.events.ready).toHaveBeenCalledTimes(1);
    expect(t.controller.source).toBe(BOUNDED);
  });

  it("onMounted fires for the adopted mount and not for one destroyed as stale", async () => {
    const t = setup();
    const gate = deferred<void>();
    const late: MountFn = async (ir, start) => {
      await gate.promise;
      return t.mountFn(ir, start);
    };
    await t.controller.load(text(BOUNDED));
    const attaching = t.controller.attach(late);
    t.controller.detach();
    gate.resolve();
    await attaching;
    expect(t.events.mounted).not.toHaveBeenCalled();
    await t.controller.attach(t.mountFn);
    expect(t.events.mounted).toHaveBeenCalledTimes(1);
  });

  it("a superseded load is discarded", async () => {
    const t = setup();
    const first = deferred<string>();
    const second = deferred<string>();
    const a = t.controller.load(() => first.promise);
    const b = t.controller.load(() => second.promise);
    second.resolve(OTHER_SIZE);
    await b;
    first.resolve(BOUNDED);
    await a;
    expect(t.events.ready).toHaveBeenCalledTimes(1);
    expect(t.events.ready).toHaveBeenCalledWith({ width: 640, height: 360, duration: 2 });
    expect(t.controller.source).toBe(OTHER_SIZE);
  });
});

describe("PlayerController: currentTime", () => {
  it("currentTime before load is ignored", async () => {
    const t = setup({ reducedMotion: true });
    expect(() => { t.controller.currentTime = 1; }).not.toThrow();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    expect(t.starts[0].tick).toBe(240);
  });

  it("currentTime set while playing keeps playing", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.controller.currentTime = 1;
    expect(t.mounts[0].calls).toContain("seek:120");
    expect(t.controller.currentTime).toBe(1);
    expect(t.mounts[0].calls).not.toContain("play");
    t.mounts[0].push({ tick: 120, playing: false });
    expect(t.mounts[0].calls).toContain("play");
  });

  it("currentTime = 0 seeks tick 0, and currentTime = 99 clamps to endTick", async () => {
    const t = setup({ reducedMotion: true });
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.controller.currentTime = 0;
    expect(t.mounts[0].calls).toContain("seek:0");
    t.controller.currentTime = 99;
    expect(t.mounts[0].calls).toContain("seek:240");
    expect(t.controller.currentTime).toBe(2);
  });

  it("a detached indefinite scene clamps currentTime to its restart at tick 0", async () => {
    const t = setup();
    await t.controller.load(text(INDEFINITE));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 500, reachedTick: 500 });
    t.controller.detach();
    t.controller.currentTime = 3;
    expect(t.controller.currentTime).toBe(0);
    await t.controller.attach(t.mountFn);
    expect(t.starts[1].tick).toBe(0);
  });

  it("a non-finite currentTime is ignored", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    for (const v of [NaN, Infinity, -Infinity]) {
      expect(() => { t.controller.currentTime = v; }).not.toThrow();
    }
    expect(t.mounts[0].calls.filter((c) => c.startsWith("seek"))).toEqual([]);
    expect(t.controller.currentTime).toBe(0);
  });

  it("currentTime set on a paused embed stays paused once the seek is performed", async () => {
    const t = setup({ autoplay: false });
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.controller.currentTime = 0.5;
    expect(t.controller.paused).toBe(true);
    t.mounts[0].performSeek();
    expect(t.mounts[0].calls).toEqual(["seek:60"]);
    expect(t.mounts[0].getState()).toMatchObject({ tick: 60, playing: false });
    expect(t.controller.paused).toBe(true);
    expect(t.controller.currentTime).toBe(0.5);
  });

  it("currentTime set while detached updates the stored playhead", async () => {
    const t = setup({ reducedMotion: true });
    await t.controller.load(text(BOUNDED));
    t.controller.currentTime = 0.5;
    expect(t.controller.currentTime).toBe(0.5);
    await t.controller.attach(t.mountFn);
    expect(t.starts[0].tick).toBe(60);
  });
});

describe("PlayerController: play, pause and restart while a seek is pending (spec §3.3)", () => {
  it("a pause() before the seek is performed does not revert the getter", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 90, playing: true });
    t.controller.currentTime = 1;
    expect(t.controller.currentTime).toBe(1);
    t.controller.pause();
    expect(t.controller.currentTime).toBe(1);
    expect(t.events.state.mock.calls.at(-1)![0]).toMatchObject({ tick: 120, playing: false });
  });

  it("currentTime = x then play() on a paused embed plays from x", async () => {
    const t = setup({ autoplay: false });
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    expect(t.controller.paused).toBe(true);
    t.controller.currentTime = 0.5;
    t.controller.play();
    expect(t.controller.paused).toBe(false);
    expect(t.controller.currentTime).toBe(0.5);
    // Playing from the old tick now would be undone when the seek lands.
    expect(t.mounts[0].calls).not.toContain("play");
    t.mounts[0].performSeek();
    expect(t.mounts[0].calls.at(-1)).toBe("play");
    expect(t.mounts[0].getState()).toMatchObject({ tick: 60, playing: true });
    expect(t.controller.paused).toBe(false);
  });

  it("currentTime = x then pause() on a playing embed ends paused at x, with no resume", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 90, playing: true });
    t.controller.currentTime = 1;
    t.controller.pause();
    t.mounts[0].performSeek();
    expect(t.mounts[0].calls).toEqual(["seek:120", "pause"]);
    expect(t.mounts[0].getState()).toMatchObject({ tick: 120, playing: false });
    expect(t.controller.currentTime).toBe(1);
    expect(t.controller.paused).toBe(true);
  });

  it("restart() drops the pending target and the getter follows the restart from tick 0", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 90, playing: true });
    t.controller.currentTime = 1;
    t.controller.restart();
    expect(t.mounts[0].hasPendingSeek()).toBe(false);
    expect(t.controller.currentTime).toBe(0);
    expect(t.controller.paused).toBe(false);
    t.mounts[0].push({ tick: 12, playing: true });
    expect(t.controller.currentTime).toBe(tickToTime(12));
    expect(t.mounts[0].calls).toEqual(["seek:120", "restart"]);
  });

  it("a pause() that stops on the target tick is not taken for the performed seek", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 120, playing: true });
    t.controller.currentTime = 1;
    t.controller.pause();
    t.controller.play();
    expect(t.mounts[0].calls).toEqual(["seek:120", "pause"]);
    t.mounts[0].performSeek();
    expect(t.mounts[0].getState()).toMatchObject({ tick: 120, playing: true });
  });

  it("play() with a seek to the end pending restarts from tick 0 (spec §3.4)", async () => {
    const t = setup({ autoplay: false });
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 90 });
    t.controller.currentTime = 99;
    t.controller.play();
    expect(t.mounts[0].calls).toEqual(["seek:240", "restart"]);
    expect(t.mounts[0].hasPendingSeek()).toBe(false);
    expect(t.controller.currentTime).toBe(0);
    expect(t.controller.paused).toBe(false);
  });

  it("leaving view with a resume armed stores the playhead as playing", async () => {
    const t = setup({ autoplay: false });
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 90 });
    t.controller.currentTime = 0.5;
    t.controller.play();
    // The mount itself is still paused; only the armed resume says playing.
    expect(t.mounts[0].getState().playing).toBe(false);
    t.controller.detach();
    await t.controller.attach(t.mountFn);
    expect(t.starts[1]).toEqual({ tick: 60, playing: true });
  });

  it("an indefinite scene leaving view with a seek pending still restarts from tick 0", async () => {
    const t = setup();
    await t.controller.load(text(INDEFINITE));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 500, reachedTick: 500 });
    t.controller.currentTime = 3;
    expect(t.mounts[0].calls).toEqual(["seek:360"]);
    t.controller.detach();
    await t.controller.attach(t.mountFn);
    expect(t.starts[1]).toEqual({ tick: 0, playing: true });
  });

  it("leaving view with a seek pending stores the target, not the old tick", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 90, playing: true });
    t.controller.currentTime = 1;
    t.controller.detach();
    await t.controller.attach(t.mountFn);
    expect(t.starts[1]).toEqual({ tick: 120, playing: true });
  });
});

/**
 * A mount whose `mountFn` waits on a gate, as the real one waits on the
 * renderer chunk, the font and `app.init`. Whatever the reader does in that
 * window must hold once the mount resolves.
 */
async function pendingMount(opts: Parameters<typeof setup>[0], source: string) {
  const t = setup(opts);
  const gate = deferred<void>();
  const late: MountFn = async (ir, start) => {
    await gate.promise;
    return t.mountFn(ir, start);
  };
  await t.controller.load(text(source));
  const attaching = t.controller.attach(late);
  const resolve = async () => {
    gate.resolve();
    await attaching;
    return t.mounts[0];
  };
  return { ...t, resolve };
}

describe("PlayerController: input while the mount is pending", () => {
  it("play() on a paused poster plays from tick 0 once the mount resolves", async () => {
    const t = await pendingMount({ autoplay: false }, BOUNDED);
    t.controller.play();
    const m = await t.resolve();
    expect(t.starts[0]).toEqual({ tick: 240, playing: false });
    expect(t.controller.paused).toBe(false);
    expect(t.controller.currentTime).toBe(0);
    expect(t.events.state.mock.calls.at(-1)![0]).toMatchObject({ tick: 0, playing: true });
    // Play at the end starts again from tick 0 (spec §3.4).
    expect(m.calls).toEqual(["seek:0"]);
    m.performSeek();
    expect(m.calls).toEqual(["seek:0", "play"]);
    expect(m.getState()).toMatchObject({ tick: 0, playing: true });
  });

  it("play() on a paused indefinite scene plays once the mount resolves", async () => {
    const t = await pendingMount({ autoplay: false }, INDEFINITE);
    t.controller.play();
    const m = await t.resolve();
    expect(m.calls).toEqual(["play"]);
    expect(m.getState().playing).toBe(true);
    expect(t.controller.paused).toBe(false);
  });

  it("pause() on an autoplay embed holds once the mount resolves", async () => {
    const t = await pendingMount({}, BOUNDED);
    t.controller.pause();
    const m = await t.resolve();
    expect(t.starts[0]).toEqual({ tick: 0, playing: true });
    expect(m.calls).toEqual(["pause"]);
    expect(m.getState().playing).toBe(false);
    expect(t.controller.paused).toBe(true);
    expect(t.events.state.mock.calls.at(-1)![0]).toMatchObject({ tick: 0, playing: false });
  });

  it("restart() on a paused poster plays from tick 0 once the mount resolves", async () => {
    const t = await pendingMount({ autoplay: false }, BOUNDED);
    t.controller.restart();
    const m = await t.resolve();
    expect(t.controller.paused).toBe(false);
    expect(t.controller.currentTime).toBe(0);
    m.performSeek();
    expect(m.getState()).toMatchObject({ tick: 0, playing: true });
  });

  it("currentTime set on an autoplay embed is shown and keeps it playing once the mount resolves", async () => {
    const t = await pendingMount({}, BOUNDED);
    t.controller.currentTime = 1;
    const m = await t.resolve();
    expect(m.calls).toEqual(["seek:120"]);
    expect(t.controller.currentTime).toBe(1);
    expect(t.controller.paused).toBe(false);
    expect(t.events.state.mock.calls.at(-1)![0]).toMatchObject({ tick: 120, playing: true });
    m.performSeek();
    expect(m.calls).toEqual(["seek:120", "play"]);
    expect(m.getState()).toMatchObject({ tick: 120, playing: true });
  });

  it("currentTime set on a paused poster seeks and stays paused once the mount resolves", async () => {
    const t = await pendingMount({ autoplay: false }, BOUNDED);
    t.controller.currentTime = 0.5;
    const m = await t.resolve();
    expect(m.calls).toEqual(["seek:60"]);
    m.performSeek();
    expect(m.calls).toEqual(["seek:60"]);
    expect(m.getState()).toMatchObject({ tick: 60, playing: false });
    expect(t.controller.paused).toBe(true);
    expect(t.controller.currentTime).toBe(0.5);
  });

  it("currentTime set then pause() on an autoplay embed ends paused on the new time", async () => {
    const t = await pendingMount({}, BOUNDED);
    t.controller.currentTime = 1;
    t.controller.pause();
    const m = await t.resolve();
    expect(t.controller.paused).toBe(true);
    expect(t.controller.currentTime).toBe(1);
    m.performSeek();
    expect(m.calls).toEqual(["seek:120", "pause"]);
    expect(m.getState()).toMatchObject({ tick: 120, playing: false });
  });

  it("no input in the window sends nothing to the mount", async () => {
    const t = await pendingMount({}, BOUNDED);
    const m = await t.resolve();
    expect(m.calls).toEqual([]);
    expect(t.events.state.mock.calls.at(-1)![0]).toMatchObject({ tick: 0, playing: true });
  });
});

describe("PlayerController: ended and loop", () => {
  it("ended fires once when a playing bounded scene reaches endTick", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 100, playing: true });
    t.mounts[0].push({ tick: 240, playing: false });
    t.mounts[0].push({ tick: 240, playing: false });
    expect(t.events.ended).toHaveBeenCalledTimes(1);
  });

  it("with loop, restart() is called instead", async () => {
    const t = setup({ loop: true });
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 240, playing: false });
    expect(t.mounts[0].calls).toContain("restart");
    expect(t.events.ended).not.toHaveBeenCalled();
  });

  it("a seek resumed just before the end still ends, and the last state says playing", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.controller.currentTime = tickToTime(239);
    t.mounts[0].push({ tick: 239, playing: false });
    expect(t.mounts[0].calls).toContain("play");
    expect(t.events.state.mock.calls.at(-1)![0]).toMatchObject({ tick: 239, playing: true });
    t.mounts[0].push({ tick: 240, playing: false });
    expect(t.events.ended).toHaveBeenCalledTimes(1);
  });

  it("with loop, a seek resumed just before the end restarts", async () => {
    const t = setup({ loop: true });
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(t.mountFn);
    t.controller.currentTime = tickToTime(239);
    t.mounts[0].push({ tick: 239, playing: false });
    t.mounts[0].push({ tick: 240, playing: false });
    expect(t.mounts[0].calls).toContain("restart");
    expect(t.events.ended).not.toHaveBeenCalled();
  });

  it("loop and ended ignore an indefinite scene that comes to rest", async () => {
    for (const loop of [true, false]) {
      const t = setup({ loop });
      await t.controller.load(text(INDEFINITE));
      await t.controller.attach(t.mountFn);
      t.mounts[0].push({ tick: 100, reachedTick: 100, playing: true });
      // What Playback reports when an indefinite scene goes idle: it pauses
      // itself on the furthest tick it reached, the end of its seek range.
      // A rule that took that for an end (tick === endTick ?? reachedTick)
      // would fire here.
      t.mounts[0].push({ tick: 240, reachedTick: 240, playing: false });
      expect(t.mounts[0].calls).not.toContain("restart");
      expect(t.events.ended).not.toHaveBeenCalled();
    }
  });
});

describe("PlayerController: errors", () => {
  it("compile failure reports PLAYER_COMPILE_FAILED with the compiler's errors", async () => {
    const t = setup();
    await t.controller.load(text("banana"));
    expect(t.events.error).toHaveBeenCalledTimes(1);
    const [code, , errors] = t.events.error.mock.calls[0];
    expect(code).toBe("PLAYER_COMPILE_FAILED");
    expect(errors.length).toBeGreaterThan(0);
    expect(t.controller.errors).toEqual(errors);
    expect(t.events.ready).not.toHaveBeenCalled();
  });

  it("a loader's PlayerError keeps its code", async () => {
    const t = setup();
    await t.controller.load(async () => { throw new PlayerError("PLAYER_FETCH_FAILED", "404"); });
    expect(t.events.error).toHaveBeenCalledWith("PLAYER_FETCH_FAILED", "404", []);
  });

  it("a non-PlayerError mount rejection is PLAYER_RENDER_FAILED", async () => {
    const t = setup();
    await t.controller.load(text(BOUNDED));
    await t.controller.attach(async () => { throw new Error("webgl lost"); });
    expect(t.events.error.mock.calls[0][0]).toBe("PLAYER_RENDER_FAILED");

    const u = setup();
    await u.controller.load(text(BOUNDED));
    await u.controller.attach(async () => { throw new PlayerError("PLAYER_FONT_UNAVAILABLE", "no font"); });
    expect(u.events.error.mock.calls[0][0]).toBe("PLAYER_FONT_UNAVAILABLE");
    expect(u.events.ready).toHaveBeenCalledTimes(1);
  });
});
