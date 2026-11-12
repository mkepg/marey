import { Container, Graphics } from "pixi.js";
import type { Application, Ticker } from "pixi.js";
import type { IRSceneNode } from "../sceneIR";
import { buildNode } from "./builder";
import { secondsToTicks } from "./clock";
import { createWorldForScene } from "./physicsWorld";
import { Playback } from "./playback";
import type { PlaybackController, PlaybackHost, PlaybackStart } from "./playback";
import { SceneRuntime } from "./sceneRuntime";

/** The controller a stage's owner drives; `inner` is for the dev seam's hashes. */
export type LivePlayback = PlaybackController & { readonly inner: Playback };

export interface MountOptions {
  /** The family `text` nodes ask for; `builder.ts`'s `TEXT_FONT_FAMILY` when omitted. */
  readonly fontFamily?: string;
}

export interface MountedScene {
  readonly playback: LivePlayback;
  cleanup(): void;
}

/**
 * Mount an IR on `app`'s stage: the scene root, background and bounds mask,
 * `fit` layout that follows `host`'s size, and a `Playback` driven by the
 * application's ticker. The playground (one shared application) and the
 * embeddable player (one application per element) both go through here, so
 * they cannot disagree about how a scene reaches the screen.
 *
 * The caller owns the application, the canvas and anything else on the stage;
 * `cleanup()` undoes only what this call added.
 */
export function mountScene(
  app: Application,
  scene: IRSceneNode,
  host: HTMLElement,
  start?: PlaybackStart,
  options: MountOptions = {},
): MountedScene {
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
    if (!app.canvas) return;
    const sw = host.clientWidth;
    const sh = host.clientHeight;

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
    app.resize();
    updateLayout();
    // Resizing clears the canvas, and a paused or ended scene has no ticker
    // running to draw it again.
    app.render();
  });
  resizeObserver.observe(host);

  app.resizeTo = host;
  updateLayout();

  const playbackHost: PlaybackHost = {
    build() {
      const root = new Container();
      for (const node of scene.children) root.addChild(buildNode(node, options.fontFamily));
      const runtime = new SceneRuntime(createWorldForScene(scene), root);
      return { root, runtime };
    },
    attach(root) {
      for (const old of objectsLayer.removeChildren()) old.destroy({ children: true, context: true });
      objectsLayer.addChild(root);
    },
    render() {
      // While the ticker runs, the application's own render step draws every
      // frame; drawing here as well would paint each playing frame twice.
      if (!app.ticker.started) app.render();
    },
  };

  const endTick = scene.duration === null ? null : secondsToTicks(scene.duration);
  // A scene with nothing remembered plays from 0, as the preview always has.
  const from = start ?? { tick: 0, playing: true };
  let playback: Playback;
  try {
    playback = new Playback(playbackHost, endTick, from);
  } catch (error) {
    // Building the first frame failed (a bad node, say). Undo what this call
    // added so a caller that tears its application down does not leave an
    // observer that would resize it afterwards.
    resizeObserver.disconnect();
    sceneRoot.destroy({ children: true, texture: true, context: true });
    throw error;
  }

  // `ticker.deltaMS` still appears exactly once in the renderer: here.
  const tickerCallback = (ticker: Ticker): void => {
    playback.frame(ticker.deltaMS);
    if (!playback.getState().playing && !playback.hasPendingSeek()) app.ticker.stop();
  };
  app.ticker.add(tickerCallback);
  const wake = (): void => { app.ticker.start(); };

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

  let cleaned = false;
  const cleanup = (): void => {
    // A second call is a no-op, so an owner that replaces a mount can clean it
    // up early and its own later cleanup stays harmless.
    if (cleaned) return;
    cleaned = true;
    resizeObserver.disconnect();
    playback.destroy();
    // Only this mount's own tree: a newer mount may already own the stage.
    sceneRoot.destroy({ children: true, texture: true, context: true });
    // Only this mount's own callback.
    app.ticker.remove(tickerCallback);
  };

  return { playback: control, cleanup };
}
