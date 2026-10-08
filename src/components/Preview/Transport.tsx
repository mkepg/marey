import type { FunctionComponent } from "preact";
import { useAppStore } from "../../store";
import { formatPlayhead } from "../../lib/playhead";
import styles from "./Transport.module.scss";

export const Transport: FunctionComponent = () => {
  const state = useAppStore((s) => s.playback);
  const control = useAppStore((s) => s.playbackController);
  if (!state || !control) return null;
  const max = state.endTick ?? state.reachedTick;
  return (
    <div className={styles.transport} data-transport>
      <button type="button" className={styles.button} data-transport-toggle
        aria-label={state.playing ? "Pause" : "Play"}
        onClick={() => (state.playing ? control.pause() : control.play())}>
        {state.playing ? "❚❚" : "▶"}
      </button>
      <button type="button" className={styles.button} data-transport-restart aria-label="Restart"
        onClick={() => control.restart()}>
        ↺
      </button>
      <input type="range" className={styles.scrub} data-transport-scrub aria-label="Playhead"
        min={0} max={max} step={1} value={state.tick}
        onInput={(e) => control.seek(Number((e.target as HTMLInputElement).value))} />
      <span className={styles.readout} data-transport-readout>{formatPlayhead(state)}</span>
    </div>
  );
};
