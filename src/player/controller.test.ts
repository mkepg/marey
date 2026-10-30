import { describe, it, expect, vi } from "vitest";
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

/** Records calls and lets a test push states, imitating the renderer's playback. */
class FakeMount implements PlayerMount {
  calls: string[] = [];
  destroyed = 0;
  private listeners = new Set<(s: PlayheadState) => void>();
  state: PlayheadState;
  constructor(state: PlayheadState) {
    this.state = state;
  }
  play() { this.calls.push("play"); }
  pause() { this.calls.push("pause"); }
  seek(tick: number) { this.calls.push(`seek:${tick}`); }
  restart() { this.calls.push("restart"); }
  subscribe(l: (s: PlayheadState) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  getState() { return this.state; }
  async liveFramesHash() { return "hash"; }
  destroy() { this.destroyed++; }
  push(s: Partial<PlayheadState>) {
    this.state = { ...this.state, ...s };
    for (const l of [...this.listeners]) l(this.state);
  }
}

function setup(opts: { autoplay?: boolean; loop?: boolean; reducedMotion?: boolean } = {}) {
  const events = {
    ready: vi.fn(),
    error: vi.fn(),
    ended: vi.fn(),
    state: vi.fn(),
  };
  const options: ControllerOptions = {
    autoplay: () => opts.autoplay ?? true,
    loop: () => opts.loop ?? false,
    reducedMotion: () => opts.reducedMotion ?? false,
    onReady: events.ready,
    onError: events.error,
    onEnded: events.ended,
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

  it("currentTime set while detached updates the stored playhead", async () => {
    const t = setup({ reducedMotion: true });
    await t.controller.load(text(BOUNDED));
    t.controller.currentTime = 0.5;
    expect(t.controller.currentTime).toBe(0.5);
    await t.controller.attach(t.mountFn);
    expect(t.starts[0].tick).toBe(60);
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

  it("loop and ended ignore an indefinite scene", async () => {
    const t = setup({ loop: true });
    await t.controller.load(text(INDEFINITE));
    await t.controller.attach(t.mountFn);
    t.mounts[0].push({ tick: 240, playing: false });
    expect(t.mounts[0].calls).not.toContain("restart");
    expect(t.events.ended).not.toHaveBeenCalled();
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
