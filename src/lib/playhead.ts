import type { PlaybackController, PlaybackStart, PlaybackState } from "../compiler/renderer/playback";
import { TICK_HZ } from "../compiler/sceneIR";

/** `1.25 / 4.00 s`, or `12.40 s` for a scene with no declared length (spec §3.4). */
export function formatPlayhead(s: PlaybackState): string {
  const sec = (ticks: number): string => (ticks / TICK_HZ).toFixed(2);
  return s.endTick === null ? `${sec(s.tick)} s` : `${sec(s.tick)} / ${sec(s.endTick)} s`;
}

/** Spec §3.5: an edit keeps the playhead; a replaced file starts at 0. */
export function nextStart(remembered: PlaybackStart | null, fileChanged: boolean): PlaybackStart | undefined {
  if (fileChanged || remembered === null) return undefined;
  return { tick: remembered.tick, playing: remembered.playing };
}

/** What `PlayheadMemory` reads from a scene's controller. */
export type PlayheadSource = Pick<PlaybackController, "getState" | "subscribe">;

/**
 * The playhead carried from one compile to the next (spec §3.5), and the rule
 * that only the latest compile may set it.
 *
 * `begin` starts a compile: it stops listening to the controller on screen,
 * forgets the playhead if the file was replaced, and returns the new compile's
 * id and the start to mount it at. `adopt` takes that compile's result. A result
 * whose id is not the latest is refused with no side effect, so a compile that
 * finishes after a newer one started can never become the remembered playhead;
 * the caller then disposes of it. `release` stops listening without starting a
 * compile.
 */
export class PlayheadMemory {
  private compileId = 0;
  private remembered: PlaybackStart | null = null;
  private lastFileId: number;
  private unsubscribe: (() => void) | null = null;

  constructor(fileId: number) {
    this.lastFileId = fileId;
  }

  begin(fileId: number): { id: number; start: PlaybackStart | undefined } {
    this.release();
    this.compileId += 1;
    const fileChanged = fileId !== this.lastFileId;
    this.lastFileId = fileId;
    if (fileChanged) this.remembered = null;
    return { id: this.compileId, start: nextStart(this.remembered, fileChanged) };
  }

  adopt(
    id: number,
    controller: PlayheadSource | null,
    onState: (s: PlaybackState | null) => void,
  ): boolean {
    if (id !== this.compileId) return false;
    if (controller) {
      const seed = controller.getState();
      this.remembered = { tick: seed.tick, playing: seed.playing };
      onState(seed);
      this.unsubscribe = controller.subscribe((st) => {
        this.remembered = { tick: st.tick, playing: st.playing };
        onState(st);
      });
    } else {
      onState(null);
    }
    return true;
  }

  release(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
