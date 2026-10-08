import type { PlaybackStart, PlaybackState } from "../compiler/renderer/playback";
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
