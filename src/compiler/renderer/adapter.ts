import { Application, Container, Graphics } from "pixi.js";
import type { IRSceneNode, IRendererAdapter } from "../sceneIR";
import { buildNode } from "./builder";

export const pixiRendererAdapter: IRendererAdapter = {
  async render(
    scene: IRSceneNode,
    hostElement: HTMLDivElement,
    _isDark: boolean
  ): Promise<() => void> {
    await document.fonts.ready;

    const app = new Application();
    
    // Initialize the canvas with a transparent background
    await app.init({
      resizeTo:        hostElement,
      backgroundAlpha: 0, 
      autoStart:       true,
      antialias:       true,
      resolution:      window.devicePixelRatio || 1,
      autoDensity:     true,
    });

    hostElement.appendChild(app.canvas);
    const sceneRoot = new Container();
    app.stage.addChild(sceneRoot);

    // 1. Draw the logical scene background (The Artboard)
    const bgRect = new Graphics()
      .rect(0, 0, scene.width, scene.height)
      .fill(scene.background);
    
    // Add it first so it renders behind all other children
    sceneRoot.addChild(bgRect);

    // 2. CREATE AND APPLY THE CLIPPING MASK
    const boundsMask = new Graphics()
      .rect(0, 0, scene.width, scene.height)
      .fill(0xffffff); // Color doesn't matter, just needs to be a solid fill
    
    // Must be a child of sceneRoot to scale properly with the sceneFit logic
    sceneRoot.addChild(boundsMask); 
    
    // Instruct PixiJS to use this specific graphic to crop overflow
    sceneRoot.mask = boundsMask;    

    // 3. Render the rest of the user's objects
    for (const node of scene.children) {
      sceneRoot.addChild(buildNode(node));
    }

    const logicalWidth  = scene.width;
    const logicalHeight = scene.height;
    const sceneFit      = scene.sceneFit;

    function updateLayout(): void {
      if (!app.canvas) return;

      const sw = hostElement.clientWidth;
      const sh = hostElement.clientHeight;

      if (sceneFit === "contain") {
        const s = Math.min(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.scale.set(s);
        sceneRoot.position.set(
          (sw - logicalWidth  * s) / 2,
          (sh - logicalHeight * s) / 2
        );
      } else if (sceneFit === "cover") {
        const s = Math.max(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.scale.set(s);
        sceneRoot.position.set(
          (sw - logicalWidth  * s) / 2,
          (sh - logicalHeight * s) / 2
        );
      } else if (sceneFit === "fill") {
        sceneRoot.scale.set(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.position.set(0, 0);
      } else {
        sceneRoot.scale.set(1);
        sceneRoot.position.set(0, 0);
      }
    }

    const resizeObserver = new ResizeObserver(() => {
        updateLayout();
    });

    resizeObserver.observe(hostElement);
    updateLayout();

    return () => {
      resizeObserver.disconnect();
      app.destroy(true, { children: true });
    };
  },
};