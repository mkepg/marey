import { Application } from "pixi.js";
import type { IRSceneNode } from "../sceneIR";
import { mountScene } from "./mountScene";
import type { LivePlayback, MountedScene } from "./mountScene";
import type { PlaybackStart } from "./playback";

export type { LivePlayback };

export interface IRendererAdapter {
  render(
    scene: IRSceneNode,
    host: HTMLDivElement,
    isDark: boolean,
    start?: PlaybackStart,
  ): Promise<{ cleanup: () => void; playback: LivePlayback }>;
}

// One initialisation shared by every render: a render that starts while an
// earlier one is still inside `init()` waits for it rather than using an
// application that is not ready yet.
let sharedAppReady: Promise<Application> | null = null;
// The mount the shared application currently shows, and a counter that tells a
// stale render's cleanup from the latest one's.
let activeMount: MountedScene | null = null;
let renderGeneration = 0;

function initSharedApp(): Promise<Application> {
  const app = new Application();
  return app
    .init({
      backgroundAlpha: 0,
      autoStart:       true,
      antialias:       true,
      resolution:      window.devicePixelRatio || 1,
      autoDensity:     true,
    })
    .then(
      () => app,
      (error: unknown) => {
        // Let the next render try again instead of failing forever.
        sharedAppReady = null;
        throw error;
      },
    );
}

/**
 * Start Pixi's initialisation before there is a scene to draw. Creating the
 * renderer fetches its WebGL chunk, and waiting for the first compile to ask
 * for it put that download after the compile instead of beside it. A failure
 * here is reported by the render that next awaits it, which also retries.
 */
export function prepareRenderer(): void {
  sharedAppReady ??= initSharedApp();
  sharedAppReady.catch(() => {});
}

export const pixiRendererAdapter: IRendererAdapter = {
  async render(
    scene: IRSceneNode,
    hostElement: HTMLDivElement,
    _isDark: boolean,
    start?: PlaybackStart,
  ): Promise<{ cleanup: () => void; playback: LivePlayback }> {
    // Scene text is drawn in JetBrains Mono (builder.ts). Ask for that face
    // rather than waiting on `document.fonts.ready`, which also waits for
    // the interface's fonts and resolves at once if no face has been
    // requested yet.
    await Promise.race([
      document.fonts.load("16px 'JetBrains Mono'").catch(() => []),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);

    sharedAppReady ??= initSharedApp();
    const app = await sharedAppReady;

    if (app.canvas.parentElement !== hostElement) {
      hostElement.appendChild(app.canvas);
    }

    // The previous render's callback must stop before its stage is torn down.
    activeMount?.cleanup();
    activeMount = null;

    const oldChildren = app.stage.removeChildren();
    oldChildren.forEach(c => c.destroy({ children: true, texture: true, context: true }));

    const mounted = mountScene(app, scene, hostElement, start);
    activeMount = mounted;
    const generation = ++renderGeneration;

    const cleanup = (): void => {
      mounted.cleanup();
      // Only the latest render stops the ticker: a stale render's cleanup must
      // not stop a newer one's.
      if (generation === renderGeneration) {
        activeMount = null;
        app.ticker.stop();
      }
    };

    return { cleanup, playback: mounted.playback };
  },
};
