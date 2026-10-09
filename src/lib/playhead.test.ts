import { describe, it, expect } from "vitest";
import { formatPlayhead, nextStart, PlayheadMemory, type PlayheadSource } from "./playhead";
import type { PlaybackState } from "../compiler/renderer/playback";

const s = (tick: number, endTick: number | null, reachedTick = tick) =>
  ({ tick, playing: false, endTick, reachedTick });

describe("formatPlayhead", () => {
  it("shows position and length for a scene with a duration", () => {
    expect(formatPlayhead(s(150, 480))).toBe("1.25 / 4.00 s");
  });
  it("shows position alone for an indefinite scene", () => {
    expect(formatPlayhead(s(1488, null))).toBe("12.40 s");
  });
});

describe("nextStart", () => {
  it("restores the remembered playhead after an edit", () => {
    expect(nextStart({ tick: 90, playing: true }, false)).toEqual({ tick: 90, playing: true });
  });
  it("starts from zero when the file was replaced", () => {
    expect(nextStart({ tick: 90, playing: true }, true)).toBeUndefined();
  });
  it("starts from zero when nothing is remembered", () => {
    expect(nextStart(null, false)).toBeUndefined();
  });
});

/** A controller that reports `tick` and emits to whoever is still subscribed. */
class FakeController implements PlayheadSource {
  private readonly listeners = new Set<(s: PlaybackState) => void>();
  private tick: number;
  private readonly playing: boolean;
  constructor(tick: number, playing = true) {
    this.tick = tick;
    this.playing = playing;
  }
  getState(): PlaybackState {
    return { tick: this.tick, playing: this.playing, endTick: null, reachedTick: this.tick };
  }
  subscribe(listener: (s: PlaybackState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  emit(tick: number): void {
    this.tick = tick;
    for (const l of this.listeners) l(this.getState());
  }
  get subscribers(): number { return this.listeners.size; }
}

describe("PlayheadMemory", () => {
  it("lets only the latest compile set the remembered playhead, in order", () => {
    const memory = new PlayheadMemory(1);
    const seen: Array<PlaybackState | null> = [];
    const onState = (s: PlaybackState | null) => { seen.push(s); };

    // The playhead before the burst: a compile adopted and playing at 40.
    const before = memory.begin(1);
    const displayed = new FakeController(40);
    expect(memory.adopt(before.id, displayed, onState)).toBe(true);
    seen.length = 0;

    // 1. Two compiles start; the first is superseded by the second.
    const first = memory.begin(1);
    const second = memory.begin(1);
    expect(second.id).not.toBe(first.id);
    expect(second.start).toEqual({ tick: 40, playing: true });

    // 2. The first one's result arrives late and is refused, with no effect:
    //    nothing reported, nothing subscribed, nothing remembered.
    const late = new FakeController(999);
    expect(memory.adopt(first.id, late, onState)).toBe(false);
    expect(seen).toEqual([]);
    expect(late.subscribers).toBe(0);

    // 3. The next compile still starts from the pre-burst playhead.
    const third = memory.begin(1);
    expect(third.start).toEqual({ tick: 40, playing: true });

    // 4. An adopted controller's emissions move the remembered playhead.
    const current = new FakeController(50);
    expect(memory.adopt(third.id, current, onState)).toBe(true);
    expect(seen.at(-1)?.tick).toBe(50);
    current.emit(70);
    expect(seen.at(-1)?.tick).toBe(70);
    const fourth = memory.begin(1);
    expect(fourth.start).toEqual({ tick: 70, playing: true });

    // 5. `begin` released that controller, so what it emits now is ignored.
    expect(current.subscribers).toBe(0);
    const count = seen.length;
    current.emit(999);
    expect(seen.length).toBe(count);
    expect(memory.begin(1).start).toEqual({ tick: 70, playing: true });
  });

  it("forgets the playhead when the file changes, and keeps it through a failed compile", () => {
    const memory = new PlayheadMemory(1);
    const a = memory.begin(1);
    memory.adopt(a.id, new FakeController(90, false), () => {});

    // A failed compile has no controller; the playhead waits for the next one.
    const failed = memory.begin(1);
    const seen: Array<PlaybackState | null> = [];
    expect(memory.adopt(failed.id, null, (s) => { seen.push(s); })).toBe(true);
    expect(seen).toEqual([null]);
    expect(memory.begin(1).start).toEqual({ tick: 90, playing: false });

    // A replaced file (newFile, loadExample) starts at 0, and stays there
    // until a controller of the new file is adopted.
    expect(memory.begin(2).start).toBeUndefined();
    expect(memory.begin(2).start).toBeUndefined();
  });

  it("release stops listening without starting a compile", () => {
    const memory = new PlayheadMemory(1);
    const c = new FakeController(10);
    memory.adopt(memory.begin(1).id, c, () => {});
    expect(c.subscribers).toBe(1);
    memory.release();
    expect(c.subscribers).toBe(0);
  });
});
