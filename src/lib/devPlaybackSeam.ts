import { useAppStore } from "../store";
import type { PlaybackState } from "../compiler/renderer/playback";
import type { LivePlayback } from "../compiler/renderer/adapter";

declare global {
  interface Window {
    /**
     * Dev-only playback seam for the browser harness: drives the mounted
     * scene's transport and exposes the two hashes that compare a live frame
     * with the frame an exporter samples at the same tick.
     *
     * Absent from a production build, for the reason `__mareyExportPng` is.
     */
    __mareyPlayback?: {
      state(): PlaybackState;
      play(): void;
      pause(): void;
      restart(): void;
      seek(tick: number): Promise<PlaybackState>;
      snapshotHash(): string;
      referenceHash(tick: number): string;
    };
  }
}

function mounted(): LivePlayback {
  // The store holds the controller type; the adapter's own controller carries `inner`.
  const control = useAppStore.getState().playbackController as LivePlayback | null;
  if (!control) throw new Error("[devPlaybackSeam] no scene is mounted");
  return control;
}

export function installPlaybackSeam(): void {
  window.__mareyPlayback = {
    state: () => mounted().getState(),
    play: () => mounted().play(),
    pause: () => mounted().pause(),
    restart: () => mounted().restart(),
    seek: (tick) => {
      const control = mounted();
      return new Promise<PlaybackState>((resolve) => {
        const unsubscribe = control.subscribe((s) => {
          unsubscribe();
          resolve(s);
        });
        control.seek(tick);
      });
    },
    snapshotHash: () => mounted().inner.snapshotHash(),
    referenceHash: (tick) => mounted().inner.referenceHash(tick),
  };
}
