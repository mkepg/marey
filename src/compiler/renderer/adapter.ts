import { Application, Container, Graphics, Ticker } from "pixi.js";
import type { IRSceneNode, IRendererAdapter, IRAnimation, IRPhysics, IRSequence, IRPoint, IRParallelStep } from "../sceneIR";
import { buildNode } from "./builder";
import { LiveDriver, secondsToTicks } from "./clock";
import {
  advanceAnimTime,
  animProgress,
  advancePhysicsTime,
  type AnimTime,
  type PhysicsTime,
} from "./timeline";
import { MatterWorld, type IPhysicsWorld } from "./physicsWorld";
import {
  bindPhysicsBodies,
  cullEscapedBodies,
  pinBody,
  physicsParamsFromIR,
  snapContainerToBody,
  syncWorldToContainers,
  unpinBody,
  CULL_MARGIN,
  type PhysicsBinding,
} from "./physicsSync";

export interface RunningAnim {
  container: Container;
  anim: IRAnimation;
  startVal: number | IRPoint;
  targetVal: number | IRPoint;
  time: AnimTime;
  isPosAnim: boolean;
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

/**
 * The world for the scene currently being rendered. Module-level because
 * spawnAnim/spawnPhysics are reached from several call sites; there is only
 * ever one scene rendering at a time, and `render` resets it.
 */
let activeWorld: IPhysicsWorld | null = null;

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
  const justCompleted = advanceAnimTime(ra.time);

  // Completion side effects are state, not paint, so they must happen on the
  // tick they occur — not once per rendered frame. Deferring them would let
  // physics skip ticks while a stale kinematic count is still set.
  if (justCompleted && ra.isPosAnim && ra.container.__declareLayout) {
    ra.container.__kinematicPosAnimCount = Math.max(0, (ra.container.__kinematicPosAnimCount || 1) - 1);

    if (ra.anim.handOff && ra.anim.duration > 0) {
      const startPt = ra.startVal as IRPoint;
      const targetPt = ra.targetVal as IRPoint;
      const deriv = getEasingDerivativeAtEnd(ra.anim.easing);
      const durSec = Math.max(ra.anim.duration, 0.001);

      ra.container.__pendingVelocity = {
        x: ((targetPt.x - startPt.x) / durSec) * deriv,
        y: ((targetPt.y - startPt.y) / durSec) * deriv,
      };
    }

    if (activeWorld) unpinBody(ra.container, activeWorld, "POS_ANIM");
  }

  // The rotation-override release is state, not paint, for the same reason:
  // it must happen on the tick the animation completes, not once per rendered
  // frame. Leaving it in the paint-phase splice loop let a catch-up burst of
  // several ticks per frame keep re-applying the override for ticks after the
  // animation had already finished.
  if (justCompleted && ra.anim.property === "rotation" && ra.container.__body && activeWorld) {
    activeWorld.overrideAngle(ra.container.__body, null);
  }

  return justCompleted;
}

/**
 * Push an animation's tick-aligned value into the physics world.
 *
 * Evaluated at alpha 0 deliberately. `applyAnim` paints at the driver's
 * wall-clock alpha, and feeding that to the world would make body positions a
 * function of frame rate — which is exactly the determinism Phase 0 bought.
 * The cost is that during a position animation the drawn position leads the
 * collision shape by up to one tick.
 */
function pushAnimToWorld(ra: RunningAnim, world: IPhysicsWorld): void {
  const id = ra.container.__body;
  if (!id) return;

  const e = evaluateEasing(animProgress(ra.time, 0), ra.anim.easing);

  if (ra.anim.property === "position") {
    const startPt = ra.startVal as IRPoint;
    const targetPt = ra.targetVal as IRPoint;
    world.setPosition(id, lerp(startPt.x, targetPt.x, e), lerp(startPt.y, targetPt.y, e));
  } else if (ra.anim.property === "rotation") {
    const deg = lerp(ra.startVal as number, ra.targetVal as number, e);
    world.overrideAngle(id, deg * (Math.PI / 180));
  } else if (ra.anim.property === "scale") {
    const startPt = ra.startVal as IRPoint;
    const targetPt = ra.targetVal as IRPoint;
    world.setScale(id, lerp(startPt.x, targetPt.x, e), lerp(startPt.y, targetPt.y, e));
  }
}

function applyAnim(ra: RunningAnim, alpha: number): void {
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

  // A new runner attaching to this container thaws it (spec 6.7).
  if (activeWorld) {
    unpinBody(container, activeWorld, "FROZEN");
    if (isPos) pinBody(container, activeWorld, "POS_ANIM");
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
  container.__physics = phIR;

  const id = container.__body;
  if (id && activeWorld) {
    activeWorld.setParams(id, physicsParamsFromIR(phIR));

    // A handoff that already fired wins over the declared velocity.
    container.__pendingVelocity = {
      x: container.__pendingVelocity?.x ?? phIR.velocity.x,
      y: container.__pendingVelocity?.y ?? phIR.velocity.y,
    };

    // Unpin before flushing: setStatic(false) collapses the body back to rest,
    // so a velocity written first would be discarded. unpinBody flushes after
    // each unpin, so if another reason still holds the pin — a position
    // animation running alongside this physics block — the velocity stays
    // parked and whichever unpin releases the last reason flushes it then.
    unpinBody(container, activeWorld, "FROZEN");
    unpinBody(container, activeWorld, "NO_RUNNER");
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

  if (container.__physics) {
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

    const world = new MatterWorld(logicalWidth, logicalHeight);
    activeWorld = world;

    // Bodies exist before any runner does, so an object animating in during a
    // sequence is a pinned static obstacle rather than a ghost (spec D6, D13).
    const bindings: PhysicsBinding[] = bindPhysicsBodies(sceneRoot, world);

    collectData(sceneRoot, runningAnims, physicsRunners, sequenceRunners);

    const driver = new LiveDriver();

    // Advance the whole scene exactly one fixed tick. Everything that changes
    // scene state lives here and takes no time argument, so an export driver
    // can call it in a bare loop with no wall clock involved.
    function advanceOneTick(): void {
      for (let i = 0; i < runningAnims.length; i++) {
        tickAnim(runningAnims[i]);
      }

      // Animations own their properties; push the tick-aligned values into the
      // world before it steps, so physics never sees a wall-clock-derived value.
      for (let i = 0; i < runningAnims.length; i++) {
        pushAnimToWorld(runningAnims[i], world);
      }

      // Before freeze, so an escaped body is removed rather than frozen into
      // an invisible off-screen obstacle (spec 6.7).
      cullEscapedBodies(bindings, world, CULL_MARGIN);

      for (let i = 0; i < physicsRunners.length; i++) {
        const pr = physicsRunners[i];
        if (advancePhysicsTime(pr.time)) {
          pinBody(pr.container, world, "FROZEN");
          // Snap to the exact tick the freeze happened on. Pinned bodies are
          // skipped by the paint-phase sync, so without this the object keeps
          // the alpha-interpolated position of the last frame painted before
          // it froze — which is wall-clock dependent and differs between runs.
          snapContainerToBody(pr.container, world);
        }
      }

      world.step();

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
        applyAnim(runningAnims[i], driver.alpha);
      }

      // Physics writes after animations, so a dynamic body's position wins over
      // a stale one. A body driven by a position animation is pinned, and
      // syncWorldToContainers skips pinned bodies, so the two never fight.
      syncWorldToContainers(bindings, world, driver.alpha);

      for (let i = runningAnims.length - 1; i >= 0; i--) {
        // The rotation-override release lives in tickAnim (the tick phase),
        // not here — see the comment there. This loop only splices.
        if (runningAnims[i].time.completed) runningAnims.splice(i, 1);
      }
      for (let i = physicsRunners.length - 1; i >= 0; i--) {
        if (physicsRunners[i].time.completed) physicsRunners.splice(i, 1);
      }
      for (let i = sequenceRunners.length - 1; i >= 0; i--) {
        if (sequenceRunners[i].state === "DONE") sequenceRunners.splice(i, 1);
      }

      // Physics runners are no longer part of the idle test: a
      // `duration: indefinitely` runner never completes, so it would pin the
      // ticker open forever. The world reports idle once every body is asleep
      // or pinned.
      if (runningAnims.length === 0 && sequenceRunners.length === 0 && world.isIdle()) {
        sharedApp?.ticker.stop();
      }
    };

    sharedApp.ticker.start();
    sharedApp.ticker.add(activeTickerCallback);

    return () => {
      resizeObserver.disconnect();
      world.destroy();
      if (activeWorld === world) activeWorld = null;
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