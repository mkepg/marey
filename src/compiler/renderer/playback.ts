import type { Container } from "pixi.js";
import type { SceneRuntime } from "./sceneRuntime";
import { LiveDriver } from "./clock";
import { snapshotFor } from "./frameSampler";
import { hashFrames } from "../export/frameHash";

export interface PlaybackState {
  /** The tick on screen. */
  readonly tick: number;
  readonly playing: boolean;
  /** `secondsToTicks(scene.duration)`, or null for an indefinite scene. */
  readonly endTick: number | null;
  /** The furthest tick played or sought, ever. */
  readonly reachedTick: number;
}

export interface PlaybackController {
  play(): void;
  pause(): void;
  /** Recorded; the next `frame()` performs the latest one and leaves playback paused. */
  seek(tick: number): void;
  /** Replay to tick 0 now and play. */
  restart(): void;
  subscribe(listener: (s: PlaybackState) => void): () => void;
  getState(): PlaybackState;
}

/** What `Playback` needs from whoever owns the stage. */
export interface PlaybackHost {
  /** A fresh tree, world and runtime from the cached IR. Does not touch the stage. */
  build(): { root: Container; runtime: SceneRuntime };
  /** Put `root` on the stage, destroying whatever tree was there. */
  attach(root: Container): void;
  /** Draw the current frame now. */
  render(): void;
}

export interface PlaybackStart {
  readonly tick: number;
  readonly playing: boolean;
}

/**
 * The preview's transport, headless: play, pause, seek and the end of a scene.
 *
 * Every jump in time is a replay from tick 0 with `sampleFrames`' own loop,
 * `advanceOneTick(); paintExactTick();` per tick, so a sought frame is the
 * frame an exporter samples at that tick (Phase 7 spec §3.1). A backward seek
 * rebuilds the tree from the host's cached IR; a forward seek continues from
 * the current tick. Seeks are recorded and only the latest is performed, once,
 * on the next `frame()`, so a drag costs one replay per displayed frame
 * (§3.2).
 *
 * It owns no ticker and imports `pixi.js` for types only, so it runs in Node.
 * The owner of the stage calls `frame(deltaMS)` once per animation frame.
 */
export class Playback implements PlaybackController {
  private readonly host: PlaybackHost;
  private readonly endTick: number | null;
  private root!: Container;
  private runtime!: SceneRuntime;
  private tick = 0;
  private playing = false;
  private reachedTick = 0;
  private pendingSeek: number | null = null;
  private readonly driver = new LiveDriver();
  private readonly listeners = new Set<(s: PlaybackState) => void>();

  constructor(
    host: PlaybackHost,
    endTick: number | null,
    start: PlaybackStart = { tick: 0, playing: false },
  ) {
    this.host = host;
    this.endTick = endTick;
    this.mount();
    const target = this.endTick === null ? start.tick : Math.min(start.tick, this.endTick);
    this.replayTo(Math.max(0, target));
    this.playing = start.playing && !this.atEnd();
    this.host.render();
  }

  getState(): PlaybackState {
    return { tick: this.tick, playing: this.playing, endTick: this.endTick, reachedTick: this.reachedTick };
  }

  subscribe(listener: (s: PlaybackState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** At the end of a scene with a `duration`, play starts again from 0 (§3.3). */
  play(): void {
    if (this.atEnd()) this.replayTo(0);
    this.playing = true;
    this.driver.reset();
    this.notify();
  }

  pause(): void {
    this.playing = false;
    this.driver.reset();
    // A paused frame is always an exportable frame (spec §3.1).
    this.runtime.paintExactTick();
    this.host.render();
    this.notify();
  }

  /** Recorded only, clamped to `[0, endTick ?? reachedTick]`; `frame()` performs the latest one. */
  seek(tick: number): void {
    const end = this.endTick ?? this.reachedTick;
    this.pendingSeek = Math.max(0, Math.min(Math.round(tick), end));
  }

  /** Whether a seek is waiting for the next `frame()`. */
  hasPendingSeek(): boolean {
    return this.pendingSeek !== null;
  }

  restart(): void {
    this.pendingSeek = null;
    this.replayTo(0);
    this.playing = true;
    this.driver.reset();
    this.host.render();
    this.notify();
  }

  /** Called once per animation frame by the owner's ticker. */
  frame(deltaMS: number): void {
    if (this.pendingSeek !== null) {
      const target = this.pendingSeek;
      this.pendingSeek = null;
      this.playing = false;
      this.driver.reset();
      this.replayTo(target);
      this.host.render();
      this.notify();
      return;
    }
    if (!this.playing) return;

    let ticks = this.driver.pump(deltaMS);
    if (this.endTick !== null) ticks = Math.min(ticks, this.endTick - this.tick);
    for (let i = 0; i < ticks; i++) {
      this.runtime.advanceOneTick();
      this.tick++;
    }
    this.reachedTick = Math.max(this.reachedTick, this.tick);

    if (this.atEnd()) {
      this.playing = false;
      this.runtime.paintExactTick();
    } else {
      this.runtime.paint(this.driver.alpha);
      // After the paint, not before it: a completed runner is spliced in the
      // paint phase, so `isIdle()` only turns true once a paint has run. Asked
      // before, it would pause a frame late. This is the moment the adapter's
      // loop stops its ticker (§3.3), and an indefinite scene pauses there.
      if (this.endTick === null && this.runtime.isIdle()) {
        this.playing = false;
        this.runtime.paintExactTick();
      }
    }
    this.host.render();
    this.notify();
  }

  /** `hashFrames` over the live tree's current snapshot. */
  snapshotHash(): string {
    return hashFrames([{ index: 0, tick: this.tick, objects: snapshotFor(this.root) }]);
  }

  /** The same hash for a fresh build replayed `tick` ticks with the sampler's loop. */
  referenceHash(tick: number): string {
    const { root, runtime } = this.host.build();
    for (let i = 0; i < tick; i++) {
      runtime.advanceOneTick();
      runtime.paintExactTick();
    }
    const hash = hashFrames([{ index: 0, tick, objects: snapshotFor(root) }]);
    runtime.destroy();
    root.destroy({ children: true });
    return hash;
  }

  destroy(): void {
    this.runtime.destroy();
    this.listeners.clear();
  }

  private atEnd(): boolean {
    return this.endTick !== null && this.tick >= this.endTick;
  }

  private mount(): void {
    const { root, runtime } = this.host.build();
    this.root = root;
    this.runtime = runtime;
    this.host.attach(root);
    this.tick = 0;
  }

  /** Spec §3.1: backward rebuilds; forward continues. The sampler's loop, exactly. */
  private replayTo(target: number): void {
    if (target < this.tick) {
      this.runtime.destroy();
      this.mount();
    }
    while (this.tick < target) {
      this.runtime.advanceOneTick();
      this.runtime.paintExactTick();
      this.tick++;
    }
    this.runtime.paintExactTick();
    this.reachedTick = Math.max(this.reachedTick, this.tick);
  }

  private notify(): void {
    const s = this.getState();
    for (const l of this.listeners) l(s);
  }
}
