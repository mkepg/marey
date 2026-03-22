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
    completed: boolean;
}

function evaluateEasing(t: number, easing: string): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    switch(easing) {
        case "easeIn": return t * t;
        case "easeOut": return t * (2 - t);
        case "easeInOut": return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        case "linear": default: return t;
    }
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
    const physicsNodes: Container[] = [];

    function collectData(container: Container) {
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
                    continue;
                }

                runningAnims.push({
                    container, anim, startVal: sVal, targetVal: tVal as number | IRPoint,
                    elapsed: 0, direction: 1, completed: false
                });
            }
        }
        if (container.__physicsState && container.__physics) {
            physicsNodes.push(container);
        }
        for (const child of container.children) collectData(child);
    }
    collectData(sceneRoot);

    app.ticker.add((ticker) => {
        // Cap dt to a maximum of 100ms to prevent huge jumps from lag/tab switching
        const dt = Math.min(ticker.deltaMS, 100);
        const dtSeconds = dt / 1000;
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

        // 1. Process Keyframe Animations
        for (const ra of runningAnims) {
            if (ra.completed) continue;

            ra.elapsed += ra.direction * dt;
            const durMs = ra.anim.duration * 1000;
            let progress = durMs > 0 ? ra.elapsed / durMs : 1;

            let justCompleted = false;

            if (progress >= 1.0) {
                if (ra.anim.yoyo) {
                    progress = 1.0;
                    ra.direction = -1;
                } else if (ra.anim.loop) {
                    progress = 0.0;
                    ra.elapsed = 0;
                } else {
                    progress = 1.0;
                    ra.completed = true;
                    justCompleted = true;
                }
            } else if (progress <= 0.0 && ra.direction === -1) {
                if (ra.anim.loop) {
                    progress = 0.0;
                    ra.direction = 1;
                } else {
                    progress = 0.0;
                }
            }

            const e = evaluateEasing(progress, ra.anim.easing);

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

                if (justCompleted && ra.container.__physicsState) {
                    if (ra.anim.handOff && ra.anim.duration > 0) {
                        const EPSILON = 0.001; 
                        const e0 = evaluateEasing(1.0 - EPSILON, ra.anim.easing);
                        const e1 = 1.0; 

                        const dx = (targetPt.x - startPt.x) * (e1 - e0);
                        const dy = (targetPt.y - startPt.y) * (e1 - e0);
                        const dtSec = ra.anim.duration * EPSILON; 

                        ra.container.__physicsState.velocity.x = dx / dtSec;
                        ra.container.__physicsState.velocity.y = dy / dtSec;
                    }
                    
                    ra.container.__physicsState.active = true;
                    // Prevent double-movement in the exact frame the animation ends
                    ra.container.__physicsState.skipNextFrame = true;
                }

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

        // 2. Process Real-Time Physics
        for (const node of physicsNodes) {
            const p = node.__physics!;
            const s = node.__physicsState!;
            if (!s.active) continue;

            if (s.skipNextFrame) {
                s.skipNextFrame = false;
                continue;
            }

            const layout = node.__declareLayout;
            if (!layout) continue;

            // Gravity
            s.velocity.x += p.gravity.x * dtSeconds;
            s.velocity.y += p.gravity.y * dtSeconds;

            // Time-based Friction
            const f = Math.pow(p.friction, dtSeconds * 60);
            s.velocity.x *= f;
            s.velocity.y *= f;

            // Apply Velocity
            layout.currentPos.x += s.velocity.x * dtSeconds;
            layout.currentPos.y += s.velocity.y * dtSeconds;

            // Bounds Collision Resolving
            if (p.collideBounds && node.__baseSize) {
                const bw = node.__baseSize.w * Math.abs(layout.currentScale.x);
                const bh = node.__baseSize.h * Math.abs(layout.currentScale.y);
                const left = layout.currentPos.x - layout.localAnchorX * layout.currentScale.x;
                const top = layout.currentPos.y - layout.localAnchorY * layout.currentScale.y;
                const right = left + bw;
                const bottom = top + bh;

                if (left < 0) {
                    layout.currentPos.x += (0 - left);
                    if (s.velocity.x < 0) s.velocity.x = -s.velocity.x * p.bounce;
                } else if (right > logicalWidth) {
                    layout.currentPos.x -= (right - logicalWidth);
                    if (s.velocity.x > 0) s.velocity.x = -s.velocity.x * p.bounce;
                }

                if (top < 0) {
                    layout.currentPos.y += (0 - top);
                    if (s.velocity.y < 0) s.velocity.y = -s.velocity.y * p.bounce;
                } else if (bottom > logicalHeight) {
                    layout.currentPos.y -= (bottom - logicalHeight);
                    if (s.velocity.y > 0) {
                        // Sleep Threshold: If the downward bounce is very small, zero it out.
                        if (s.velocity.y < p.gravity.y * dtSeconds * 2.5) {
                            s.velocity.y = 0;
                        } else {
                            s.velocity.y = -s.velocity.y * p.bounce;
                        }
                    }
                    
                    // Ground Friction: Apply extra drag to X when resting to prevent infinite sliding jitter
                    if (s.velocity.y === 0 && p.gravity.y > 0) {
                        s.velocity.x *= 0.95;
                        if (Math.abs(s.velocity.x) < 5) s.velocity.x = 0;
                    }
                }
            }

            node.__updateLayout?.();
        }
    });

    return () => {
      resizeObserver.disconnect();
      app.destroy(true, { children: true });
    };
  },
};