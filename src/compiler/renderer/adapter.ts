import { Application, Container, Graphics, Ticker } from "pixi.js";
import type { IRSceneNode, IRendererAdapter, IRAnimation, IRPhysics, IRSequence, IRPoint, IRParallelStep } from "../sceneIR";
import { buildNode } from "./builder";
import { LiveDriver, secondsToTicks, TICK_SECONDS } from "./clock";
import {
  advanceAnimTime,
  animProgress,
  advancePhysicsTime,
  type AnimTime,
  type PhysicsTime,
} from "./timeline";

export interface RunningAnim {
  container: Container;
  anim: IRAnimation;
  startVal: number | IRPoint;
  targetVal: number | IRPoint;
  time: AnimTime;
  isPosAnim: boolean;
  justCompletedThisTick?: boolean;
}

export interface PhysicsRunner {
  container: Container;
  time: PhysicsTime;
}

type AnimOrPhysics = RunningAnim | PhysicsRunner;

interface SequenceRunner {
  container: Container;
  sequence: IRSequence;
  stepIndex: number;
  state: "WAITING" | "RUNNING" | "DONE";
  basePeers: AnimOrPhysics[];
  activeStepRunners: AnimOrPhysics[];
}

export interface IPhysicsEngine {
  tickContainer(
    pr: PhysicsRunner,
    container: Container,
    logicalWidth: number,
    logicalHeight: number
  ): boolean;
}

export class NativePhysicsEngine implements IPhysicsEngine {
  tickContainer(
    pr: PhysicsRunner,
    container: Container,
    logicalWidth: number,
    logicalHeight: number
  ): boolean {
    const justCompleted = advancePhysicsTime(pr.time);

    if ((container.__kinematicPosAnimCount || 0) > 0) {
      return justCompleted;
    }

    const p = container.__physics!;
    const s = container.__physicsState!;
    const layout = container.__declareLayout;
    if (!layout) return justCompleted;

    // One fixed tick of integration. Previously this was an accumulator loop
    // over a variable delta; the clock now guarantees a constant step.
    const step = TICK_SECONDS;

    s.velocity.x += p.gravity.x * step;
    s.velocity.y += p.gravity.y * step;

    // INVERTED DRAG FIX: 0 = vacuum, 1 = maximum resistance
    const f = Math.pow(1.0 - p.airDrag, step * 60);
    s.velocity.x *= f;
    s.velocity.y *= f;

    layout.currentPos.x += s.velocity.x * step;
    layout.currentPos.y += s.velocity.y * step;

    if (p.collideBounds && container.__baseSize) {
      const absScaleX = Math.abs(layout.currentScale.x);
      const absScaleY = Math.abs(layout.currentScale.y);

      const baseW = container.__baseSize.w * absScaleX;
      const baseH = container.__baseSize.h * absScaleY;

      const cos = Math.abs(Math.cos(container.rotation));
      const sin = Math.abs(Math.sin(container.rotation));

      const projW = baseW * cos + baseH * sin;
      const projH = baseW * sin + baseH * cos;

      const projAnchorX = projW * 0.5;
      const projAnchorY = projH * 0.5;

      const left   = layout.currentPos.x - projAnchorX;
      const top    = layout.currentPos.y - projAnchorY;
      const right  = left + projW;
      const bottom = top  + projH;

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
          if (s.velocity.y < p.gravity.y * step * 2.5) {
            s.velocity.y = 0;
          } else {
            s.velocity.y = -s.velocity.y * p.bounce;
          }
        }
        if (s.velocity.y === 0 && p.gravity.y > 0) {
          s.velocity.x *= 0.95;
          if (Math.abs(s.velocity.x) < 5) s.velocity.x = 0;
        }
      }
    }

    container.__updateLayout?.();
    return justCompleted;
  }
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

function getEasingDerivativeAtEnd(easing: string): number {
  switch (easing) {
    case "easeIn":    return 2.0;
    case "easeOut":   return 0.5; 
    case "easeInOut": return 0.5; 
    case "linear":
    default:          return 1.0;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function tickAnim(ra: RunningAnim): boolean {
  return advanceAnimTime(ra.time);
}

function applyAnim(ra: RunningAnim, alpha: number, justCompleted: boolean): void {
  const e = evaluateEasing(animProgress(ra.time, alpha), ra.anim.easing);

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

    if (justCompleted && ra.isPosAnim) {
      ra.container.__kinematicPosAnimCount = Math.max(0, (ra.container.__kinematicPosAnimCount || 1) - 1);

      if (ra.anim.handOff && ra.anim.duration > 0) {
        if (!ra.container.__physicsState) {
          ra.container.__physicsState = { velocity: { x: 0, y: 0 } };
        }

        const deriv = getEasingDerivativeAtEnd(ra.anim.easing);
        const durSec = Math.max(ra.anim.duration, 0.001);
        const dx = targetPt.x - startPt.x;
        const dy = targetPt.y - startPt.y;

        ra.container.__physicsState.velocity.x = (dx / durSec) * deriv;
        ra.container.__physicsState.velocity.y = (dy / durSec) * deriv;
      }
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

function getCurrentVal(container: Container, prop: string): number | IRPoint {
  if (prop === "position") {
    return container.__declareLayout
      ? { x: container.__declareLayout.currentPos.x, y: container.__declareLayout.currentPos.y }
      : (container.__startProps ? { x: container.__startProps.position.x, y: container.__startProps.position.y } : { x: 0, y: 0 });
  }
  if (prop === "scale") {
    return container.__declareLayout
      ? { x: container.__declareLayout.currentScale.x, y: container.__declareLayout.currentScale.y }
      : (container.__startProps ? { x: container.__startProps.scale.x, y: container.__startProps.scale.y } : { x: 1, y: 1 });
  }
  if (prop === "rotation") return container.rotation * (180 / Math.PI);
  if (prop === "alpha") return container.alpha;
  return 0;
}

function spawnAnim(container: Container, anim: IRAnimation, globalList: RunningAnim[], localList: AnimOrPhysics[]) {
  const isPos = anim.property === "position";
  if (isPos) {
    container.__kinematicPosAnimCount = (container.__kinematicPosAnimCount || 0) + 1;
  }

  const sVal = getCurrentVal(container, anim.property);
  let tVal = anim.to;
  if ((anim.property === "position" || anim.property === "scale") && typeof tVal === "number") {
    tVal = { x: tVal, y: tVal };
  }

  const ra: RunningAnim = {
    container, anim,
    startVal: sVal,
    targetVal: tVal as number | IRPoint,
    time: {
      elapsedTicks: 0,
      durationTicks: secondsToTicks(anim.duration),
      direction: 1,
      completed: false,
      loop: anim.loop,
      yoyo: anim.yoyo,
    },
    isPosAnim: isPos
  };
  globalList.push(ra);
  localList.push(ra);
}

function spawnPhysics(container: Container, phIR: IRPhysics, globalList: PhysicsRunner[], localList: AnimOrPhysics[]) {
  const exitVelX = container.__physicsState?.velocity.x ?? phIR.velocity.x;
  const exitVelY = container.__physicsState?.velocity.y ?? phIR.velocity.y;
  container.__physics = phIR;
  
  if (!container.__physicsState) {
    container.__physicsState = { velocity: { x: exitVelX, y: exitVelY } };
  } else {
    container.__physicsState.velocity.x = exitVelX;
    container.__physicsState.velocity.y = exitVelY;
  }

  const pr: PhysicsRunner = {
    container,
    time: {
      elapsedTicks: 0,
      durationTicks: phIR.duration === "indefinitely"
        ? null
        : secondsToTicks(phIR.duration as number),
      completed: false,
    },
  };
  globalList.push(pr);
  localList.push(pr);
}

function startSequenceStep(sr: SequenceRunner, runningAnims: RunningAnim[], physicsRunners: PhysicsRunner[]) {
  const step = sr.sequence.steps[sr.stepIndex];
  sr.activeStepRunners = [];
  
  if ("type" in step && step.type === "parallel") {
    for (const sub of (step as IRParallelStep).steps) {
      if ("property" in sub) {
        spawnAnim(sr.container, sub as IRAnimation, runningAnims, sr.activeStepRunners);
      } else {
        spawnPhysics(sr.container, sub as IRPhysics, physicsRunners, sr.activeStepRunners);
      }
    }
  } else if ("property" in step) {
    spawnAnim(sr.container, step as IRAnimation, runningAnims, sr.activeStepRunners);
  } else {
    spawnPhysics(sr.container, step as IRPhysics, physicsRunners, sr.activeStepRunners);
  }
}

function collectData(
  container: Container,
  runningAnims: RunningAnim[],
  physicsRunners: PhysicsRunner[],
  sequenceRunners: SequenceRunner[]
): void {
  const nodeAnims: RunningAnim[] = [];
  const nodePhysics: PhysicsRunner[] = [];

  if (container.__animations && container.__startProps) {
    for (const anim of container.__animations) {
      spawnAnim(container, anim, runningAnims, nodeAnims);
    }
  }

  if (container.__physicsState && container.__physics) {
    spawnPhysics(container, container.__physics, physicsRunners, nodePhysics);
  }

  if (container.__sequences && container.__sequences.length > 0) {
    const seq = container.__sequences[0];
    sequenceRunners.push({
      container,
      sequence: seq,
      stepIndex: 0,
      state: "WAITING",
      basePeers: [...nodeAnims, ...nodePhysics],
      activeStepRunners: []
    });
  }

  for (const child of container.children) {
    collectData(child as Container, runningAnims, physicsRunners, sequenceRunners);
  }
}

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

    const runningAnims:    RunningAnim[]    = [];
    const physicsRunners:  PhysicsRunner[]  = [];
    const sequenceRunners: SequenceRunner[] = [];

    collectData(sceneRoot, runningAnims, physicsRunners, sequenceRunners);

    const physicsEngine = new NativePhysicsEngine();
    const driver = new LiveDriver();

    // Advance the whole scene exactly one fixed tick. Everything that changes
    // scene state lives here and takes no time argument, so an export driver
    // can call it in a bare loop with no wall clock involved.
    function advanceOneTick(): void {
      for (let i = 0; i < runningAnims.length; i++) {
        const ra = runningAnims[i];
        if (tickAnim(ra)) {
          ra.justCompletedThisTick = true;
        }
      }

      for (let i = 0; i < physicsRunners.length; i++) {
        const pr = physicsRunners[i];
        physicsEngine.tickContainer(pr, pr.container, logicalWidth, logicalHeight);
      }

      for (let i = 0; i < sequenceRunners.length; i++) {
        const sr = sequenceRunners[i];
        if (sr.state === "DONE") continue;

        if (sr.state === "WAITING") {
          let allBaseDone = true;
          for (const bp of sr.basePeers) {
            if (!bp.time.completed) { allBaseDone = false; break; }
          }
          if (allBaseDone) {
            sr.state = "RUNNING";
            startSequenceStep(sr, runningAnims, physicsRunners);
          }
        } else if (sr.state === "RUNNING") {
          let allStepsDone = true;
          for (const sp of sr.activeStepRunners) {
            if (!sp.time.completed) { allStepsDone = false; break; }
          }
          if (allStepsDone) {
            sr.stepIndex++;
            if (sr.stepIndex >= sr.sequence.steps.length) {
              sr.state = "DONE";
            } else {
              startSequenceStep(sr, runningAnims, physicsRunners);
            }
          }
        }
      }
    }

    activeTickerCallback = (ticker: Ticker) => {
      const ticks = driver.pump(ticker.deltaMS);

      for (let t = 0; t < ticks; t++) {
        advanceOneTick();
      }

      // Paint once, at the fractional position between the last two ticks.
      for (let i = 0; i < runningAnims.length; i++) {
        const ra = runningAnims[i];
        applyAnim(ra, driver.alpha, ra.justCompletedThisTick === true);
        ra.justCompletedThisTick = false;
      }

      for (let i = runningAnims.length - 1; i >= 0; i--) {
        if (runningAnims[i].time.completed) runningAnims.splice(i, 1);
      }
      for (let i = physicsRunners.length - 1; i >= 0; i--) {
        if (physicsRunners[i].time.completed) physicsRunners.splice(i, 1);
      }
      for (let i = sequenceRunners.length - 1; i >= 0; i--) {
        if (sequenceRunners[i].state === "DONE") sequenceRunners.splice(i, 1);
      }

      if (runningAnims.length === 0 && physicsRunners.length === 0 && sequenceRunners.length === 0) {
        sharedApp?.ticker.stop();
      }
    };

    sharedApp.ticker.start();
    sharedApp.ticker.add(activeTickerCallback);

    return () => {
      resizeObserver.disconnect();
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