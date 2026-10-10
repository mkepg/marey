import { Application, Container, Graphics, Ticker } from "pixi.js";
import type { IRSceneNode } from "../sceneIR";
import { buildNode } from "./builder";
import { secondsToTicks } from "./clock";
import { MatterWorld } from "./physicsWorld";
import { Playback } from "./playback";
import type { PlaybackController, PlaybackHost, PlaybackStart } from "./playback";
import { SceneRuntime } from "./sceneRuntime";

/** The controller the playground drives; `inner` is for the dev seam's hashes. */
export type LivePlayback = PlaybackController & { readonly inner: Playback };

export interface IRendererAdapter {
  render(
    scene: IRSceneNode,
    host: HTMLDivElement,
    isDark: boolean,
    start?: PlaybackStart,
  ): Promise<{ cleanup: () => void; playback: LivePlayback }>;
}

let sharedApp: Application | null = null;
// One initialisation shared by every render: a render that starts while an
// earlier one is still inside `init()` waits for it rather than using an
// application that is not ready yet.
let sharedAppReady: Promise<Application> | null = null;
let activeTickerCallback: ((ticker: Ticker) => void) | null = null;

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
      () => {
        sharedApp = app;
        return app;
      },
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

    if (activeTickerCallback) {
      app.ticker.remove(activeTickerCallback);
      activeTickerCallback = null;
    }

    const oldChildren = app.stage.removeChildren();
    oldChildren.forEach(c => c.destroy({ children: true, texture: true, context: true }));

    const sceneRoot = new Container();
    app.stage.addChild(sceneRoot);

    const bgRect = new Graphics()
      .rect(0, 0, scene.width, scene.height)
      .fill(scene.background);
    sceneRoot.addChild(bgRect);

    const boundsMask = new Graphics()
      .rect(0, 0, scene.width, scene.height)
      .fill(0xffffff);
    sceneRoot.addChild(boundsMask);
    sceneRoot.mask = boundsMask;

    const objectsLayer = new Container();
    sceneRoot.addChild(objectsLayer);

    const logicalWidth  = scene.width;
    const logicalHeight = scene.height;
    const fit           = scene.fit;

    function updateLayout(): void {
      if (!sharedApp?.canvas) return;
      const sw = hostElement.clientWidth;
      const sh = hostElement.clientHeight;

      if (fit === "contain") {
        const s = Math.min(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.scale.set(s);
        sceneRoot.position.set((sw - logicalWidth  * s) / 2, (sh - logicalHeight * s) / 2);
      } else if (fit === "cover") {
        const s = Math.max(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.scale.set(s);
        sceneRoot.position.set((sw - logicalWidth  * s) / 2, (sh - logicalHeight * s) / 2);
      } else if (fit === "fill") {
        sceneRoot.scale.set(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.position.set(0, 0);
      } else {
        sceneRoot.scale.set(1);
        sceneRoot.position.set(0, 0);
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      sharedApp?.resize();
      updateLayout();
      // Resizing clears the canvas, and a paused or ended scene has no ticker
      // running to draw it again.
      sharedApp?.render();
    });
    resizeObserver.observe(hostElement);

    if (sharedApp) {
      sharedApp.resizeTo = hostElement;
    }
    updateLayout();

    const host: PlaybackHost = {
      build() {
        const root = new Container();
        for (const node of scene.children) root.addChild(buildNode(node));
        const runtime = new SceneRuntime(new MatterWorld(logicalWidth, logicalHeight), root);
        return { root, runtime };
      },
      attach(root) {
        for (const old of objectsLayer.removeChildren()) old.destroy({ children: true, context: true });
        objectsLayer.addChild(root);
      },
      render() {
        // While the ticker runs, the application's own render step draws every
        // frame; drawing here as well would paint each playing frame twice.
        if (sharedApp && !sharedApp.ticker.started) sharedApp.render();
      },
    };

    const endTick = scene.duration === null ? null : secondsToTicks(scene.duration);
    // A scene with nothing remembered plays from 0, as the preview always has.
    const from = start ?? { tick: 0, playing: true };
    const playback = new Playback(host, endTick, from);

    // `ticker.deltaMS` still appears exactly once in the renderer: here.
    const tickerCallback = (ticker: Ticker): void => {
      playback.frame(ticker.deltaMS);
      if (!playback.getState().playing && !playback.hasPendingSeek()) sharedApp?.ticker.stop();
    };
    activeTickerCallback = tickerCallback;
    app.ticker.add(tickerCallback);
    const wake = (): void => { sharedApp?.ticker.start(); };

    const control: LivePlayback = {
      inner: playback,
      play: () => { playback.play(); wake(); },
      pause: () => playback.pause(),
      seek: (tick) => { playback.seek(tick); wake(); },
      restart: () => { playback.restart(); wake(); },
      subscribe: (l) => playback.subscribe(l),
      getState: () => playback.getState(),
    };

    if (playback.getState().playing) wake();

    const cleanup = (): void => {
      resizeObserver.disconnect();
      playback.destroy();
      if (sharedApp) {
        // Only this render's own tree: a newer render may already own the stage.
        sceneRoot.destroy({ children: true, texture: true, context: true });

        // Only this render's own callback: a stale render's cleanup must not
        // remove a newer one's.
        sharedApp.ticker.remove(tickerCallback);
        if (activeTickerCallback === tickerCallback) {
          activeTickerCallback = null;
          sharedApp.ticker.stop();
        }
      }
    };

    return { cleanup, playback: control };
  },
};
