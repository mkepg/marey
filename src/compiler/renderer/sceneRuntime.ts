import type { Container } from "pixi.js";
import type { IRAnimation, IRPhysics, IRSequence, IRPoint, IRParallelStep } from "../sceneIR";
import { secondsToTicks } from "./clock";
import {
  advanceAnimTime,
  animProgress,
  advancePhysicsTime,
  type AnimTime,
  type PhysicsTime,
} from "./timeline";
import type { IPhysicsWorld } from "./physicsWorld";
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
  /**
   * Whether `tickAnim` completed this runner on the tick currently being
   * advanced. Lives on the runner rather than in a per-tick side table so the
   * two lifecycle bits — `time.completed` and this — sit on the same object.
   */
  completedThisTick: boolean;
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

/**
 * Paint-phase counterpart of `SceneRuntime.tickAnim`, and the other half of
 * AGENTS.md's invariant 2: `tickAnim` advances state and fires completion side
 * effects, `applyAnim` only writes display properties. It sits outside the
 * class purely because it never touches the world.
 */
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

/**
 * Everything that mutates or paints scene state, lifted out of `adapter.ts`'s
 * `render()` closure.
 *
 * The lift is what lets the tick phase be driven without a wall clock: spec
 * §5.3 calls an export driver "a different *caller* rather than a different
 * engine", and until this existed there was no caller surface to be different
 * from. It is also what makes any of this testable — the blocker was never the
 * DOM (PixiJS `Container` and `Graphics` run in plain Node; only `Text` needs a
 * canvas), it was the closure.
 *
 * Every `pixi.js` import here is `import type`, as in `physicsSync.ts`, so this
 * module has no runtime dependency on PixiJS.
 */
export class SceneRuntime {
  private readonly world: IPhysicsWorld;
  private readonly bindings: PhysicsBinding[];
  private readonly runningAnims: RunningAnim[] = [];
  private readonly physicsRunners: PhysicsRunner[] = [];
  private readonly sequenceRunners: SequenceRunner[] = [];

  constructor(world: IPhysicsWorld, sceneRoot: Container) {
    this.world = world;
    // Bodies exist before any runner does, so an object animating in during a
    // sequence is a pinned static obstacle rather than a ghost (spec D6, D13).
    this.bindings = bindPhysicsBodies(sceneRoot, world);
    this.collectData(sceneRoot);
  }

  private tickAnim(ra: RunningAnim): boolean {
    const justCompleted = advanceAnimTime(ra.time);

    // Snap the animated property to its exact final value, in the TICK phase.
    //
    // Whatever runs next reads this container's state as its own starting
    // point — `spawnAnim` calls `getCurrentVal`, which reads `currentPos`,
    // `rotation` and `alpha`. Those are all last written by the PAINT phase at
    // the driver's wall-clock alpha, so without this snap a sequence's second
    // animation starts from a frame-rate-dependent value and pushes it straight
    // into the physics world. Measured at ~110px of divergence between 1-tick
    // and 7-tick frames over the same 40 ticks.
    //
    // This is a state snap in the tick phase, not a side effect moved into
    // paint, so it does not conflict with invariant 2 — it is the same move
    // `snapContainerToBody` already makes for the freeze transition, and for
    // the same reason. `animProgress` returns 1 for a completed runner, so
    // evaluating at alpha 0 gives exactly the final value.
    if (justCompleted) applyAnim(ra, 0);

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

      unpinBody(ra.container, this.world, "POS_ANIM");
    }

    // The rotation-override release is state, not paint, for the same reason:
    // it must happen on the tick the animation completes, not once per rendered
    // frame. Leaving it in the paint-phase splice loop let a catch-up burst of
    // several ticks per frame keep re-applying the override for ticks after the
    // animation had already finished.
    if (justCompleted && ra.anim.property === "rotation" && ra.container.__body) {
      this.world.overrideAngle(ra.container.__body, null);
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
   *
   * Only called for runners that are still running or completed on this very
   * tick; `advanceOneTick` skips anything that completed on an earlier tick,
   * because a completed runner is not spliced until the paint phase and would
   * otherwise keep pushing for the rest of a catch-up burst.
   */
  private pushAnimToWorld(ra: RunningAnim, completedThisTick: boolean): void {
    const id = ra.container.__body;
    if (!id) return;

    const e = evaluateEasing(animProgress(ra.time, 0), ra.anim.easing);

    if (ra.anim.property === "position") {
      const startPt = ra.startVal as IRPoint;
      const targetPt = ra.targetVal as IRPoint;
      this.world.setPosition(id, lerp(startPt.x, targetPt.x, e), lerp(startPt.y, targetPt.y, e));
    } else if (ra.anim.property === "rotation") {
      // Unlike position and scale, the angle override is a LATCH: step()
      // re-applies it every tick until something clears it. `tickAnim` cleared
      // it on the completion tick, and re-arming it even once would re-lock the
      // body's angle for the rest of the scene, because this runner is spliced
      // in the paint phase and nothing would ever clear it again.
      if (completedThisTick) return;
      const deg = lerp(ra.startVal as number, ra.targetVal as number, e);
      this.world.overrideAngle(id, deg * (Math.PI / 180));
    } else if (ra.anim.property === "scale") {
      const startPt = ra.startVal as IRPoint;
      const targetPt = ra.targetVal as IRPoint;
      this.world.setScale(id, lerp(startPt.x, targetPt.x, e), lerp(startPt.y, targetPt.y, e));
    }
  }

  private spawnAnim(container: Container, anim: IRAnimation, localList: AnimOrPhysics[]): void {
    const isPos = anim.property === "position";
    if (isPos) {
      container.__kinematicPosAnimCount = (container.__kinematicPosAnimCount || 0) + 1;
    }

    // A new runner attaching to this container thaws it (spec 6.7).
    unpinBody(container, this.world, "FROZEN");
    if (isPos) pinBody(container, this.world, "POS_ANIM");

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
      isPosAnim: isPos,
      completedThisTick: false,
    };
    this.runningAnims.push(ra);
    localList.push(ra);
  }

  private spawnPhysics(container: Container, phIR: IRPhysics, localList: AnimOrPhysics[]): void {
    container.__physics = phIR;

    const id = container.__body;
    if (id) {
      this.world.setParams(id, physicsParamsFromIR(phIR));

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
      unpinBody(container, this.world, "FROZEN");
      unpinBody(container, this.world, "NO_RUNNER");
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
    this.physicsRunners.push(pr);
    localList.push(pr);
  }

  private startSequenceStep(sr: SequenceRunner): void {
    const step = sr.sequence.steps[sr.stepIndex];
    sr.activeStepRunners = [];

    if ("type" in step && step.type === "parallel") {
      for (const sub of (step as IRParallelStep).steps) {
        if ("property" in sub) {
          this.spawnAnim(sr.container, sub as IRAnimation, sr.activeStepRunners);
        } else {
          this.spawnPhysics(sr.container, sub as IRPhysics, sr.activeStepRunners);
        }
      }
    } else if ("property" in step) {
      this.spawnAnim(sr.container, step as IRAnimation, sr.activeStepRunners);
    } else {
      this.spawnPhysics(sr.container, step as IRPhysics, sr.activeStepRunners);
    }
  }

  private collectData(container: Container): void {
    const nodeAnims: RunningAnim[] = [];
    const nodePhysics: PhysicsRunner[] = [];

    if (container.__animations && container.__startProps) {
      for (const anim of container.__animations) {
        this.spawnAnim(container, anim, nodeAnims);
      }
    }

    if (container.__physics) {
      this.spawnPhysics(container, container.__physics, nodePhysics);
    }

    if (container.__sequences && container.__sequences.length > 0) {
      const seq = container.__sequences[0];
      this.sequenceRunners.push({
        container,
        sequence: seq,
        stepIndex: 0,
        state: "WAITING",
        basePeers: [...nodeAnims, ...nodePhysics],
        activeStepRunners: [],
      });
    }

    for (const child of container.children) {
      this.collectData(child as Container);
    }
  }

  /**
   * Advance the whole scene exactly one fixed tick.
   *
   * Everything that changes scene state lives here and takes no time argument,
   * so an export driver can call it in a bare loop with no wall clock involved.
   * The order of the six phases below is load-bearing; see the class comment
   * and AGENTS.md's renderer invariants.
   */
  advanceOneTick(): void {
    // A runner that completed is not spliced until the paint phase, so without
    // the guard below it would keep pushing for every remaining tick of a
    // catch-up burst — making the simulation a function of how many ticks the
    // frame happened to absorb. `completedThisTick` is recorded because
    // position and scale still owe the world one final push at their target.
    for (let i = 0; i < this.runningAnims.length; i++) {
      const ra = this.runningAnims[i];
      ra.completedThisTick = this.tickAnim(ra);
    }

    // Animations own their properties; push the tick-aligned values into the
    // world before it steps, so physics never sees a wall-clock-derived value.
    //
    // Deliberately a second loop, not fused with the one above. Two runners can
    // share a container, and spawnPhysics documents that unpinning collapses a
    // body to rest — so fusing would let runner 0's setPosition land before
    // runner 1's unpinBody, which is a real reordering, not a tidy-up.
    for (let i = 0; i < this.runningAnims.length; i++) {
      const ra = this.runningAnims[i];
      if (ra.time.completed && !ra.completedThisTick) continue;
      this.pushAnimToWorld(ra, ra.completedThisTick);
    }

    // Before freeze, so an escaped body is removed rather than frozen into
    // an invisible off-screen obstacle (spec 6.7).
    cullEscapedBodies(this.bindings, this.world, CULL_MARGIN);

    for (let i = 0; i < this.physicsRunners.length; i++) {
      const pr = this.physicsRunners[i];
      if (advancePhysicsTime(pr.time)) {
        pinBody(pr.container, this.world, "FROZEN");
        // Snap to the exact tick the freeze happened on. Pinned bodies are
        // skipped by the paint-phase sync, so without this the object keeps
        // the alpha-interpolated position of the last frame painted before
        // it froze — which is wall-clock dependent and differs between runs.
        snapContainerToBody(pr.container, this.world);
      }
    }

    this.world.step();

    for (let i = 0; i < this.sequenceRunners.length; i++) {
      const sr = this.sequenceRunners[i];
      if (sr.state === "DONE") continue;

      if (sr.state === "WAITING") {
        let allBaseDone = true;
        for (const bp of sr.basePeers) {
          if (!bp.time.completed) { allBaseDone = false; break; }
        }
        if (allBaseDone) {
          sr.state = "RUNNING";
          this.startSequenceStep(sr);
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
            this.startSequenceStep(sr);
          }
        }
      }
    }
  }

  /**
   * Paint once, at the fractional position between the last two ticks.
   *
   * Display writes only. The one piece of bookkeeping here is splicing
   * completed runners, which is where it has always lived — it is not a side
   * effect, and moving it would be an unrequested behaviour change.
   */
  paint(alpha: number): void {
    for (let i = 0; i < this.runningAnims.length; i++) {
      applyAnim(this.runningAnims[i], alpha);
    }

    // Physics writes after animations, so a dynamic body's position wins over
    // a stale one. A body driven by a position animation is pinned, and
    // syncWorldToContainers skips pinned bodies, so the two never fight.
    syncWorldToContainers(this.bindings, this.world, alpha);

    for (let i = this.runningAnims.length - 1; i >= 0; i--) {
      // The rotation-override release lives in tickAnim (the tick phase),
      // not here — see the comment there. This loop only splices.
      if (this.runningAnims[i].time.completed) this.runningAnims.splice(i, 1);
    }
    for (let i = this.physicsRunners.length - 1; i >= 0; i--) {
      if (this.physicsRunners[i].time.completed) this.physicsRunners.splice(i, 1);
    }
    for (let i = this.sequenceRunners.length - 1; i >= 0; i--) {
      if (this.sequenceRunners[i].state === "DONE") this.sequenceRunners.splice(i, 1);
    }
  }

  /**
   * Whether the scene has come to rest and the ticker may stop.
   *
   * Physics runners are deliberately not part of this test: a
   * `duration: indefinitely` runner never completes, so it would pin the
   * ticker open forever. The world reports idle once every body is asleep
   * or pinned.
   */
  isIdle(): boolean {
    return this.runningAnims.length === 0
      && this.sequenceRunners.length === 0
      && this.world.isIdle();
  }

  /**
   * Release the world this runtime was given.
   *
   * The constructor acquires — it creates a body per qualifying container and
   * pins each one — so the release belongs here rather than in the caller.
   * An export driver constructs a runtime, runs it to completion, and needs a
   * defined way to let it go.
   */
  destroy(): void {
    this.world.destroy();
    this.runningAnims.length = 0;
    this.physicsRunners.length = 0;
    this.sequenceRunners.length = 0;
  }
}
