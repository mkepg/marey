import { Application, Container, Graphics, Ticker } from "pixi.js";
import type { IRSceneNode, IRendererAdapter } from "../sceneIR";
import { buildNode } from "./builder";
import { LiveDriver } from "./clock";
import { MatterWorld } from "./physicsWorld";
import { SceneRuntime } from "./sceneRuntime";

let sharedApp: Application | null = null;
let activeTickerCallback: ((ticker: Ticker) => void) | null = null;

export const pixiRendererAdapter: IRendererAdapter = {
  async render(
    scene: IRSceneNode,
    hostElement: HTMLDivElement,
    _isDark: boolean
  ): Promise<() => void> {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);

    if (!sharedApp) {
      sharedApp = new Application();
      await sharedApp.init({
        backgroundAlpha: 0,
        autoStart:       true,
        antialias:       true,
        resolution:      window.devicePixelRatio || 1,
        autoDensity:     true,
      });
    }

    if (sharedApp.canvas.parentElement !== hostElement) {
      hostElement.appendChild(sharedApp.canvas);
    }

    if (activeTickerCallback) {
      sharedApp.ticker.remove(activeTickerCallback);
      activeTickerCallback = null;
    }

    const oldChildren = sharedApp.stage.removeChildren();
    oldChildren.forEach(c => c.destroy({ children: true, texture: true }));

    const sceneRoot = new Container();
    sharedApp.stage.addChild(sceneRoot);

    const bgRect = new Graphics()
      .rect(0, 0, scene.width, scene.height)
      .fill(scene.background);
    sceneRoot.addChild(bgRect);

    const boundsMask = new Graphics()
      .rect(0, 0, scene.width, scene.height)
      .fill(0xffffff);
    sceneRoot.addChild(boundsMask);
    sceneRoot.mask = boundsMask;

    for (const node of scene.children) {
      sceneRoot.addChild(buildNode(node));
    }

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
    });
    resizeObserver.observe(hostElement);

    if (sharedApp) {
      sharedApp.resizeTo = hostElement;
    }
    updateLayout();

    const world = new MatterWorld(logicalWidth, logicalHeight);
    const runtime = new SceneRuntime(world, sceneRoot);
    const driver = new LiveDriver();

    // The loop: pump -> advance N ticks -> paint once at the sub-tick alpha.
    // `ticker.deltaMS` appears exactly once in the whole renderer, here.
    activeTickerCallback = (ticker: Ticker) => {
      const ticks = driver.pump(ticker.deltaMS);

      for (let t = 0; t < ticks; t++) {
        runtime.advanceOneTick();
      }

      runtime.paint(driver.alpha);

      if (runtime.isIdle()) {
        sharedApp?.ticker.stop();
      }
    };

    sharedApp.ticker.start();
    sharedApp.ticker.add(activeTickerCallback);

    return () => {
      resizeObserver.disconnect();
      runtime.destroy();
      if (sharedApp) {
        const oldChildren = sharedApp.stage.removeChildren();
        oldChildren.forEach(c => c.destroy({ children: true, texture: true }));

        if (activeTickerCallback) {
          sharedApp.ticker.remove(activeTickerCallback);
          activeTickerCallback = null;
        }
      }
    };
  },
};
