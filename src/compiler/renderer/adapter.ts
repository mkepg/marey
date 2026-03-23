import { Application, Container, Graphics, Ticker } from "pixi.js";
import type { IRSceneNode, IRendererAdapter, IRAnimation, IRPhysics, IRSequence, IRPoint } from "../sceneIR";
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

interface PhysicsRunner {
  container: Container;
  durationMs: number | null;
  elapsed: number;
  completed: boolean;
}

interface SequenceGate {
  container: Container;
  sequence: IRSequence;
  peers: Set<RunningAnim | PhysicsRunner>;
  peersReady: boolean;
  activated: boolean;
  ownedAnims: RunningAnim[];
  ownedPhysics: PhysicsRunner[];
}

function evaluateEasing(t: number, easing: string): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  switch (easing) {
    case "easeIn":    return t * t;
    case "easeOut":   return t * (2 - t);
    case "easeInOut": return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case "linear":
    default:          return t;
  }
}

// Computes the instantaneous derivative of the easing curve at t=1
function getEasingDerivativeAtEnd(easing: string): number {
  switch (easing) {
    case "easeIn":    return 2; // f(t) = t^2 -> f'(1) = 2
    case "easeOut":   return 0; // f(t) = t(2-t) -> f'(1) = 0
    case "easeInOut": return 0; // f(t) = -1 + 4t - 2t^2 -> f'(1) = 0
    case "linear":
    default:          return 1; // f(t) = t -> f'(1) = 1
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function tickAnim(ra: RunningAnim, dt: number): boolean {
  if (ra.completed) return false;
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
    ra.container.rotation =
      lerp(ra.startVal as number, ra.targetVal as number, e) * (Math.PI / 180);
  } else if (ra.anim.property === "position" && ra.container.__declareLayout) {
    const layout   = ra.container.__declareLayout;
    const startPt  = ra.startVal  as IRPoint;
    const targetPt = ra.targetVal as IRPoint;

    layout.currentPos.x = lerp(startPt.x, targetPt.x, e);
    layout.currentPos.y = lerp(startPt.y, targetPt.y, e);

    if (justCompleted && ra.container.__physicsState) {
      if (ra.anim.handOff && ra.anim.duration > 0) {
        // Calculate exact momentum transfer using the easing function's derivative
        const deriv = getEasingDerivativeAtEnd(ra.anim.easing);
        const durSec = Math.max(ra.anim.duration, 0.001); // Safe floor to prevent Infinity
        
        const dx = targetPt.x - startPt.x;
        const dy = targetPt.y - startPt.y;

        ra.container.__physicsState.velocity.x = (dx / durSec) * deriv;
        ra.container.__physicsState.velocity.y = (dy / durSec) * deriv;
      }
      ra.container.__physicsState.active        = true;
      ra.container.__physicsState.skipNextFrame = true;
    }
    ra.container.__updateLayout?.();

  } else if (ra.anim.property === "scale" && ra.container.__declareLayout) {
    const layout   = ra.container.__declareLayout;
    const startPt  = ra.startVal  as IRPoint;
    const targetPt = ra.targetVal as IRPoint;

    layout.currentScale.x = lerp(startPt.x, targetPt.x, e);
    layout.currentScale.y = lerp(startPt.y, targetPt.y, e);
    ra.container.__updateLayout?.();
  }

  return justCompleted;
}

function tickPhysics(
  pr: PhysicsRunner,
  container: Container,
  dt: number,
  dtSeconds: number,
  logicalWidth: number,
  logicalHeight: number
): boolean {
  if (pr.completed) return false;

  if (pr.durationMs !== null) {
    pr.elapsed += dt;
    if (pr.elapsed >= pr.durationMs) {
      pr.completed = true;
    }
  }

  const p = container.__physics!;
  const s = container.__physicsState!;

  if (!s.active) return pr.completed;
  if (s.skipNextFrame) {
    s.skipNextFrame = false;
    return pr.completed;
  }

  const layout = container.__declareLayout;
  if (!layout) return pr.completed;

  // --- High-Fidelity Physics Sub-Stepping ---
  const MAX_STEP = 1 / 120; // 120Hz sub-step for collision reliability
  let timeAccumulator = dtSeconds;
  
  // Prevent death spirals if the browser tab goes into background
  if (timeAccumulator > 0.1) timeAccumulator = 0.1; 

  while (timeAccumulator > 0) {
    const step = Math.min(timeAccumulator, MAX_STEP);
    timeAccumulator -= step;

    s.velocity.x += p.gravity.x * step;
    s.velocity.y += p.gravity.y * step;

    // Apply frame-rate independent friction
    const f = Math.pow(p.friction, step * 60);
    s.velocity.x *= f;
    s.velocity.y *= f;

    layout.currentPos.x += s.velocity.x * step;
    layout.currentPos.y += s.velocity.y * step;

    if (p.collideBounds && container.__baseSize) {
      const absScaleX = Math.abs(layout.currentScale.x);
      const absScaleY = Math.abs(layout.currentScale.y);
      const bw = container.__baseSize.w * absScaleX;
      const bh = container.__baseSize.h * absScaleY;

      const left   = layout.currentPos.x - layout.localAnchorX * absScaleX;
      const top    = layout.currentPos.y - layout.localAnchorY * absScaleY;
      const right  = left + bw;
      const bottom = top  + bh;

      if (left < 0) {
        layout.currentPos.x += -left;
        if (s.velocity.x < 0) s.velocity.x = -s.velocity.x * p.bounce;
      } else if (right > logicalWidth) {
        layout.currentPos.x -= (right - logicalWidth);
        if (s.velocity.x > 0) s.velocity.x = -s.velocity.x * p.bounce;
      }

      if (top < 0) {
        layout.currentPos.y += -top;
        if (s.velocity.y < 0) s.velocity.y = -s.velocity.y * p.bounce;
      } else if (bottom > logicalHeight) {
        layout.currentPos.y -= (bottom - logicalHeight);
        if (s.velocity.y > 0) {
          // Rest threshold to prevent jittering on the floor
          if (s.velocity.y < p.gravity.y * step * 2.5) {
            s.velocity.y = 0;
          } else {
            s.velocity.y = -s.velocity.y * p.bounce;
          }
        }
        // Apply ground friction when resting
        if (s.velocity.y === 0 && p.gravity.y > 0) {
          s.velocity.x *= 0.95;
          if (Math.abs(s.velocity.x) < 5) s.velocity.x = 0;
        }
      }
    }
  }

  container.__updateLayout?.();
  return pr.completed;
}

type AnimOrPhysics = RunningAnim | PhysicsRunner;

function collectData(
  container: Container,
  runningAnims: RunningAnim[],
  physicsRunners: PhysicsRunner[],
  gates: SequenceGate[]
): void {
  if (container.__animations && container.__startProps) {
    const anims      = container.__animations;
    const startProps = container.__startProps;
    const nodeAnims: RunningAnim[] = [];

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

      const ra: RunningAnim = {
        container, anim,
        startVal:  sVal,
        targetVal: tVal as number | IRPoint,
        elapsed: 0, direction: 1, completed: false,
      };
      runningAnims.push(ra);
      nodeAnims.push(ra);
    }

    const nodePhysics: PhysicsRunner[] = [];
    if (container.__physicsState && container.__physics) {
      const ph = container.__physics;
      const pr: PhysicsRunner = {
        container,
        durationMs: ph.duration === "indefinitely" ? null : ph.duration * 1000,
        elapsed: 0,
        completed: false,
      };
      physicsRunners.push(pr);
      nodePhysics.push(pr);
    }

    const seqs = container.__sequences ?? [];
    let isFirstGate = true;
    for (const seq of seqs) {
      const peers = new Set<AnimOrPhysics>();
      const peersReady = isFirstGate;

      if (isFirstGate) {
        for (const ra of nodeAnims)   peers.add(ra);
        for (const pr of nodePhysics) peers.add(pr);
      }

      const gate: SequenceGate = {
        container,
        sequence: seq,
        peers,
        peersReady,
        activated: false,
        ownedAnims: [],
        ownedPhysics: [],
      };
      gates.push(gate);
      isFirstGate = false;
    }
  }

  for (const child of container.children) {
    collectData(child as Container, runningAnims, physicsRunners, gates);
  }
}

// Persistent WebGL context to prevent flickering and VRAM dumping
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

    // Ensure the canvas is mounted to the active host element
    if (sharedApp.canvas.parentElement !== hostElement) {
      hostElement.appendChild(sharedApp.canvas);
    }

    // Soft reset: clear objects but keep context alive
    sharedApp.stage.removeChildren();
    if (activeTickerCallback) {
      sharedApp.ticker.remove(activeTickerCallback);
      activeTickerCallback = null;
    }

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
    const sceneFit      = scene.sceneFit;

    function updateLayout(): void {
      if (!sharedApp?.canvas) return;
      const sw = hostElement.clientWidth;
      const sh = hostElement.clientHeight;

      if (sceneFit === "contain") {
        const s = Math.min(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.scale.set(s);
        sceneRoot.position.set((sw - logicalWidth  * s) / 2, (sh - logicalHeight * s) / 2);
      } else if (sceneFit === "cover") {
        const s = Math.max(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.scale.set(s);
        sceneRoot.position.set((sw - logicalWidth  * s) / 2, (sh - logicalHeight * s) / 2);
      } else if (sceneFit === "fill") {
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

    const runningAnims:   RunningAnim[]   = [];
    const physicsRunners: PhysicsRunner[] = [];
    const gates:          SequenceGate[]  = [];

    collectData(sceneRoot, runningAnims, physicsRunners, gates);

    const gatePrevIndex: number[] = gates.map((gate, gi) => {
      for (let pi = gi - 1; pi >= 0; pi--) {
        if (gates[pi].container === gate.container) return pi;
      }
      return -1;
    });

    function openGate(gi: number): void {
      const gate = gates[gi];
      if (gate.activated) return;
      gate.activated = true;

      const container = gate.container;

      const currentPos = container.__declareLayout
        ? { x: container.__declareLayout.currentPos.x, y: container.__declareLayout.currentPos.y }
        : container.__startProps
          ? { x: container.__startProps.position.x, y: container.__startProps.position.y }
          : { x: 0, y: 0 };

      const currentScale = container.__declareLayout
        ? { x: container.__declareLayout.currentScale.x, y: container.__declareLayout.currentScale.y }
        : container.__startProps
          ? { x: container.__startProps.scale.x, y: container.__startProps.scale.y }
          : { x: 1, y: 1 };

      const currentRotation = container.rotation * (180 / Math.PI);
      const currentAlpha    = container.alpha;

      for (const step of gate.sequence.steps) {
        if ("property" in step) {
          const anim = step as IRAnimation;
          let sVal: number | IRPoint;
          let tVal = anim.to;

          if (anim.property === "position") {
            sVal = { x: currentPos.x, y: currentPos.y };
            if (typeof tVal === "number") tVal = { x: tVal, y: tVal };
          } else if (anim.property === "scale") {
            sVal = { x: currentScale.x, y: currentScale.y };
            if (typeof tVal === "number") tVal = { x: tVal, y: tVal };
          } else if (anim.property === "rotation") {
            sVal = currentRotation;
            if (typeof tVal !== "number") continue;
          } else if (anim.property === "alpha") {
            sVal = currentAlpha;
            if (typeof tVal !== "number") continue;
          } else {
            continue;
          }

          const ra: RunningAnim = {
            container, anim,
            startVal:  sVal,
            targetVal: tVal as number | IRPoint,
            elapsed: 0, direction: 1, completed: false,
          };
          runningAnims.push(ra);
          gate.ownedAnims.push(ra);
        } else {
          const phIR = step as IRPhysics;

          const exitVelX = container.__physicsState?.velocity.x ?? phIR.velocity.x;
          const exitVelY = container.__physicsState?.velocity.y ?? phIR.velocity.y;

          container.__physics = phIR;

          if (!container.__physicsState) {
            container.__physicsState = {
              velocity: { x: exitVelX, y: exitVelY },
              active: true,
              skipNextFrame: false,
              elapsed: phIR.duration === "indefinitely" ? undefined : 0,
            };
          } else {
            container.__physicsState.velocity.x    = exitVelX;
            container.__physicsState.velocity.y    = exitVelY;
            container.__physicsState.active        = true;
            container.__physicsState.skipNextFrame = false;
            container.__physicsState.elapsed       =
              phIR.duration === "indefinitely" ? undefined : 0;
          }

          const pr: PhysicsRunner = {
            container,
            durationMs: phIR.duration === "indefinitely"
              ? null
              : (phIR.duration as number) * 1000,
            elapsed: 0,
            completed: false,
          };
          physicsRunners.push(pr);
          gate.ownedPhysics.push(pr);
        }
      }

      for (let ni = gi + 1; ni < gates.length; ni++) {
        if (gates[ni].container === container && gatePrevIndex[ni] === gi) {
          for (const ra of gate.ownedAnims)   gates[ni].peers.add(ra);
          for (const pr of gate.ownedPhysics) gates[ni].peers.add(pr);
          gates[ni].peersReady = true;
          break;
        }
      }
    }

    activeTickerCallback = (ticker: Ticker) => {
      const dt        = Math.min(ticker.deltaMS, 100);
      const dtSeconds = dt / 1000;

      for (const ra of runningAnims) {
        tickAnim(ra, dt);
      }

      for (let i = 0; i < physicsRunners.length; i++) {
        const pr = physicsRunners[i];
        tickPhysics(pr, pr.container, dt, dtSeconds, logicalWidth, logicalHeight);
      }

      for (let gi = 0; gi < gates.length; gi++) {
        const gate = gates[gi];
        if (gate.activated)  continue;
        if (!gate.peersReady) continue;

        let allDone = true;
        for (const peer of gate.peers) {
          if (!peer.completed) { allDone = false; break; }
        }

        if (allDone) {
          openGate(gi);
        }
      }
    };

    sharedApp.ticker.add(activeTickerCallback);

    return () => {
      resizeObserver.disconnect();
      if (sharedApp) {
        // Only do a soft cleanup so the next render can reuse the context
        sharedApp.stage.removeChildren();
        if (activeTickerCallback) {
          sharedApp.ticker.remove(activeTickerCallback);
          activeTickerCallback = null;
        }
      }
    };
  },
};