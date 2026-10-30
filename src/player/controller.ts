import { compile } from "../package";
import { secondsToTicks, timeToTick, tickToTime } from "../compiler/sceneIR";
import type { IRSceneNode } from "../compiler/sceneIR";
import type { CompilerError } from "../compiler/types";

export type PlayerErrorCode =
  | "PLAYER_NO_SOURCE"
  | "PLAYER_FETCH_FAILED"
  | "PLAYER_COMPILE_FAILED"
  | "PLAYER_FONT_UNAVAILABLE"
  | "PLAYER_RENDER_FAILED";

export class PlayerError extends Error {
  readonly code: PlayerErrorCode;
  constructor(code: PlayerErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PlayerError";
  }
}

/**
 * Structurally identical to the renderer's `PlaybackState`. It is redeclared
 * rather than imported so nothing under `src/player/` reaches the renderer
 * (and through it pixi.js) except the lazily loaded `render.ts`.
 */
export interface PlayheadState {
  readonly tick: number;
  readonly playing: boolean;
  readonly endTick: number | null;
  readonly reachedTick: number;
}

export interface PlayerMount {
  play(): void;
  pause(): void;
  seek(tick: number): void;
  restart(): void;
  subscribe(listener: (s: PlayheadState) => void): () => void;
  getState(): PlayheadState;
  liveFramesHash(ticks: readonly number[]): Promise<string>;
  destroy(): void;
}

export type MountFn = (
  ir: IRSceneNode,
  start: { tick: number; playing: boolean },
) => Promise<PlayerMount>;

/** Rejects with a `PlayerError` for NO_SOURCE and FETCH_FAILED. */
export type SourceLoader = () => Promise<string>;

export interface ControllerOptions {
  autoplay: () => boolean;
  loop: () => boolean;
  reducedMotion: () => boolean;
  onReady(info: { width: number; height: number; duration: number }): void;
  onError(code: PlayerErrorCode, message: string, errors: ReadonlyArray<CompilerError>): void;
  onEnded(): void;
  /** For the controls UI. Also fired when the mount is torn down or rebuilt. */
  onState(s: PlayheadState): void;
}

interface Playhead {
  tick: number;
  playing: boolean;
}

/**
 * All of the player's behaviour that does not touch the DOM or a canvas, so it
 * can be tested in Node against a fake mount. The custom element is a shell
 * around this class.
 *
 * Asynchrony is the hard part: a load and a mount can each finish after the
 * world moved on (a newer load, the element leaving view). Every result is
 * checked against the generation it started under and dropped, or a mount
 * destroyed, when it is stale.
 */
export class PlayerController {
  private loadGen = 0;
  /** Bumped by every mountNow, detach and load: identifies one mount attempt. */
  private mountGen = 0;
  private _ir: IRSceneNode | null = null;
  private _source: string | null = null;
  private _errors: ReadonlyArray<CompilerError> = [];
  private _mount: PlayerMount | null = null;
  private mountFn: MountFn | null = null;
  private attached = false;
  private unsubscribe: (() => void) | null = null;
  private wasPlaying = false;
  /** Where the scene resumes when the next mount starts. */
  private stored: Playhead = { tick: 0, playing: false };
  /** The last state seen or set, so unmounted reads and `onState` stay coherent. */
  private shown: PlayheadState = { tick: 0, playing: false, endTick: null, reachedTick: 0 };
  /** A seek that should resume playing once the mount reports reaching its tick. */
  private resumeAt: number | null = null;

  private readonly options: ControllerOptions;

  constructor(options: ControllerOptions) {
    this.options = options;
  }

  async load(loader: SourceLoader): Promise<void> {
    const gen = ++this.loadGen;
    this.teardownMount();
    this.mountGen++;
    this._ir = null;
    this._source = null;
    this._errors = [];

    let source: string;
    try {
      source = await loader();
    } catch (e) {
      if (gen !== this.loadGen) return;
      const code = e instanceof PlayerError ? e.code : "PLAYER_FETCH_FAILED";
      this.options.onError(code, e instanceof Error ? e.message : String(e), []);
      return;
    }
    if (gen !== this.loadGen) return;

    const out = compile(source);
    if (!out.ok || out.ir === null) {
      this._errors = out.errors;
      this.options.onError("PLAYER_COMPILE_FAILED", "The scene did not compile.", out.errors);
      return;
    }

    this._source = source;
    this._ir = out.ir;
    const poster = this.endTick ?? 0;
    this.stored =
      this.options.autoplay() && !this.options.reducedMotion()
        ? { tick: 0, playing: true }
        : { tick: poster, playing: false };
    this.shown = { ...this.stored, endTick: this.endTick, reachedTick: this.stored.tick };
    this.options.onReady({
      width: out.ir.width,
      height: out.ir.height,
      duration: out.ir.duration ?? Infinity,
    });
    this.options.onState(this.shown);
    if (this.attached) await this.mountNow();
  }

  async attach(mount: MountFn): Promise<void> {
    this.mountFn = mount;
    this.attached = true;
    if (this._ir) await this.mountNow();
  }

  detach(): void {
    this.attached = false;
    this.mountGen++;
    const m = this._mount;
    if (!m) return;
    const s = m.getState();
    // An indefinite scene has no position worth keeping: its physics cannot
    // be resumed from a tick without replaying it (spec §4.4).
    this.stored = { tick: s.endTick === null ? 0 : s.tick, playing: s.playing };
    this.shown = {
      ...s,
      tick: this.stored.tick,
      reachedTick: s.endTick === null ? 0 : s.reachedTick,
    };
    this.teardownMount();
    this.options.onState(this.shown);
  }

  play(): void {
    this.resumeAt = null;
    if (this._mount) return this._mount.play();
    const end = this.endTick;
    this.stored = { tick: end !== null && this.stored.tick === end ? 0 : this.stored.tick, playing: true };
    this.syncShownFromStored();
  }

  pause(): void {
    this.resumeAt = null;
    if (this._mount) return this._mount.pause();
    this.stored = { ...this.stored, playing: false };
    this.syncShownFromStored();
  }

  restart(): void {
    this.resumeAt = null;
    if (this._mount) return this._mount.restart();
    this.stored = { tick: 0, playing: true };
    this.syncShownFromStored();
  }

  get currentTime(): number {
    return this._ir ? tickToTime(this.shown.tick) : 0;
  }

  set currentTime(seconds: number) {
    if (!this._ir || !Number.isFinite(seconds)) return;
    const end = this.endTick;
    const target = Math.min(Math.max(timeToTick(seconds), 0), end ?? this.shown.reachedTick);
    const wasPlaying = this._mount
      ? this._mount.getState().playing || this.resumeAt !== null
      : this.stored.playing;
    this.resumeAt = null;
    this.shown = { ...this.shown, tick: target, reachedTick: Math.max(this.shown.reachedTick, target) };
    if (this._mount) {
      this._mount.seek(target);
      // A seek leaves playback paused; a video keeps playing through a seek.
      // Landing on the end is the exception: play() there would replay.
      if (wasPlaying && target !== end) this.resumeAt = target;
    } else {
      this.stored = { tick: target, playing: wasPlaying && target !== end };
    }
  }

  get duration(): number {
    return this._ir ? (this._ir.duration ?? Infinity) : NaN;
  }

  get paused(): boolean {
    return this._mount ? !this._mount.getState().playing : !this.stored.playing;
  }

  get errors(): ReadonlyArray<CompilerError> {
    return this._errors;
  }

  get ir(): IRSceneNode | null {
    return this._ir;
  }

  get source(): string | null {
    return this._source;
  }

  get mounted(): PlayerMount | null {
    return this._mount;
  }

  private get endTick(): number | null {
    return this._ir && this._ir.duration !== null ? secondsToTicks(this._ir.duration) : null;
  }

  private syncShownFromStored(): void {
    this.shown = { ...this.shown, tick: this.stored.tick, playing: this.stored.playing };
    this.options.onState(this.shown);
  }

  private teardownMount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this._mount?.destroy();
    this._mount = null;
    this.resumeAt = null;
  }

  private async mountNow(): Promise<void> {
    const ir = this._ir;
    const mountFn = this.mountFn;
    if (!ir || !mountFn || this._mount) return;
    const gen = ++this.mountGen;
    const start = { ...this.stored };
    this.options.onState({ ...this.shown, tick: start.tick, playing: start.playing });

    let mount: PlayerMount;
    try {
      mount = await mountFn(ir, start);
    } catch (e) {
      if (gen !== this.mountGen) return;
      const code = e instanceof PlayerError ? e.code : "PLAYER_RENDER_FAILED";
      this.options.onError(code, e instanceof Error ? e.message : String(e), []);
      return;
    }
    if (gen !== this.mountGen) {
      mount.destroy();
      return;
    }

    this._mount = mount;
    this.wasPlaying = start.playing;
    this.unsubscribe = mount.subscribe((s) => this.onMountState(s));
  }

  private onMountState(s: PlayheadState): void {
    this.shown = s;
    // Settle ending detection and tell the UI before resuming: the real
    // playback notifies synchronously from play(), so resuming first would
    // re-enter this method and then overwrite its fresher state with this
    // stale one.
    const ended = s.endTick !== null && s.tick === s.endTick && !s.playing && this.wasPlaying;
    this.wasPlaying = s.playing;
    this.options.onState(s);
    if (this.resumeAt !== null && s.tick === this.resumeAt) {
      this.resumeAt = null;
      this._mount?.play();
    }
    if (!ended) return;
    if (this.options.loop()) this._mount?.restart();
    else this.options.onEnded();
  }
}
