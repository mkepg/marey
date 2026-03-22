import { Application, Container, Graphics } from "pixi.js";
import type { IRSceneNode, IRendererAdapter, IRAnimation, IRPoint } from "../sceneIR";
import { buildNode } from "./builder";

interface RunningAnim {
    container: Container;
    anim: IRAnimation;
    startVal: number | IRPoint;
    targetVal: number | IRPoint;
    elapsed: number;
    direction: number;
}

export const pixiRendererAdapter: IRendererAdapter = {
  async render(
    scene: IRSceneNode,
    hostElement: HTMLDivElement,
    _isDark: boolean
  ): Promise<() => void> {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 2000))
    ]);
    const app = new Application();
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

    const runningAnims: RunningAnim[] = [];
    function collectAnims(container: Container) {
        if (container.__animations && container.__startProps) {
            const anims: ReadonlyArray<IRAnimation> = container.__animations;
            const startProps = container.__startProps;
            
            for (const anim of anims) {
                let sVal: number | IRPoint;
                let tVal = anim.to;
                
                if (anim.property === "position") {
                    sVal = { x: startProps.position.x, y: startProps.position.y };
                    if (typeof tVal === "number") tVal = { x: tVal, y: tVal };
                } else if (anim.property === "scale") {
                    sVal = { x: startProps.scale.x, y: startProps.scale.y };
                    if (typeof tVal === "number") tVal = { x: tVal, y: tVal }; 
                } else if (anim.property === "rotation") {
                    sVal = startProps.rotation;
                    if (typeof tVal !== "number") continue;
                } else if (anim.property === "alpha") {
                    sVal = startProps.alpha;
                    if (typeof tVal !== "number") continue;
                } else {
                    continue; // Safeguard against unsupported animProperties dynamically
                }

                runningAnims.push({
                    container, anim, startVal: sVal, targetVal: tVal as number | IRPoint,
                    elapsed: 0, direction: 1
                });
            }
        }
        for (const child of container.children) collectAnims(child);
    }
    collectAnims(sceneRoot);

    app.ticker.add((ticker) => {
        const dt = ticker.deltaMS;
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

        for (const ra of runningAnims) {
            ra.elapsed += ra.direction * dt;
            const durMs = ra.anim.duration * 1000;
            let progress = durMs > 0 ? ra.elapsed / durMs : 1;

            if (progress >= 1.0) {
                if (ra.anim.yoyo) {
                    progress = 1.0;
                    ra.direction = -1;
                } else if (ra.anim.loop) {
                    progress = 0.0;
                    ra.elapsed = 0;
                } else {
                    progress = 1.0;
                }
            } else if (progress <= 0.0 && ra.direction === -1) {
                if (ra.anim.loop) {
                    progress = 0.0;
                    ra.direction = 1;
                } else {
                    progress = 0.0;
                }
            }

            let e = progress;
            const t = progress;
            switch(ra.anim.easing) {
                case "easeIn": e = t*t; break;
                case "easeOut": e = t*(2-t); break;
                case "easeInOut": e = t<0.5 ? 2*t*t : -1+(4-2*t)*t; break;
                case "linear": default: e = t; break;
            }

            if (ra.anim.property === "alpha") {
                ra.container.alpha = lerp(ra.startVal as number, ra.targetVal as number, e);
            } else if (ra.anim.property === "rotation") {
                ra.container.rotation = lerp(ra.startVal as number, ra.targetVal as number, e) * (Math.PI / 180);
            } else if (ra.anim.property === "position" && ra.container.__declareLayout) {
                const layout = ra.container.__declareLayout;
                const startPt = ra.startVal as IRPoint;
                const targetPt = ra.targetVal as IRPoint;
                layout.currentPos.x = lerp(startPt.x, targetPt.x, e);
                layout.currentPos.y = lerp(startPt.y, targetPt.y, e);
                ra.container.__updateLayout?.();
            } else if (ra.anim.property === "scale" && ra.container.__declareLayout) {
                const layout = ra.container.__declareLayout;
                const startPt = ra.startVal as IRPoint;
                const targetPt = ra.targetVal as IRPoint;
                layout.currentScale.x = lerp(startPt.x, targetPt.x, e);
                layout.currentScale.y = lerp(startPt.y, targetPt.y, e);
                ra.container.__updateLayout?.();
            }
        }
    });

    return () => {
      resizeObserver.disconnect();
      app.destroy(true, { children: true });
    };
  },
};