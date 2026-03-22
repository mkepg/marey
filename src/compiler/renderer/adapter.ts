import { Application, Container, Graphics } from "pixi.js";
import type { IRSceneNode, IRendererAdapter, IRAnimation, IRPhysics, IRSequence, IRPoint } from "../sceneIR";
import { buildNode } from "./builder";

// ─── animation runner ────────────────────────────────────────────────────────

interface RunningAnim {
  container: Container;
  anim: IRAnimation;
  startVal: number | IRPoint;
  targetVal: number | IRPoint;
  elapsed: number;
  direction: number;
  completed: boolean;
}

// ─── physics runner ──────────────────────────────────────────────────────────

interface PhysicsRunner {
  container: Container;
  /** Null means "indefinitely". */
  durationMs: number | null;
  elapsed: number;
  completed: boolean;
}

// ─── sequence gate ───────────────────────────────────────────────────────────

/**
 * One live sequence gate — corresponds to one `sequence { }` block.
 *
 * `peersReady` starts false for every gate whose peers are populated
 * by a prior gate opening (i.e. every gate after the first one on the
 * same container). The ticker must NOT evaluate such a gate until
 * `peersReady` is true — otherwise an empty peer set looks like
 * "all done" and the gate fires immediately on frame 1.
 *
 * `peersReady` is set to true in `openGate()` when the previous gate
 * on the same container populates this gate's peer set.
 *
 * For the first gate on a container the peers are known at collection
 * time, so `peersReady` starts as true.
 */
interface SequenceGate {
  container: Container;
  sequence: IRSequence;
  peers: Set<RunningAnim | PhysicsRunner>;
  /** True once this gate's peer set is fully populated and can be evaluated. */
  peersReady: boolean;
  activated: boolean;
  ownedAnims: RunningAnim[];
  ownedPhysics: PhysicsRunner[];
}

// ─── easing ──────────────────────────────────────────────────────────────────

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

// ─── helpers ─────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Applies one frame of animation to a container.
 * Returns true if this animation completed on this exact frame.
 */
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
        const EPSILON = 0.001;
        const e0      = evaluateEasing(1.0 - EPSILON, ra.anim.easing);
        const e1      = 1.0;
        const dx      = (targetPt.x - startPt.x) * (e1 - e0);
        const dy      = (targetPt.y - startPt.y) * (e1 - e0);
        const dtSec   = ra.anim.duration * EPSILON;
        ra.container.__physicsState.velocity.x = dx / dtSec;
        ra.container.__physicsState.velocity.y = dy / dtSec;
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

/**
 * Applies one frame of physics simulation.
 * Returns true when the physics runner reaches its duration limit.
 */
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
      // Fall through — apply the last frame of movement first.
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

  s.velocity.x += p.gravity.x * dtSeconds;
  s.velocity.y += p.gravity.y * dtSeconds;
  const f = Math.pow(p.friction, dtSeconds * 60);
  s.velocity.x *= f;
  s.velocity.y *= f;
  layout.currentPos.x += s.velocity.x * dtSeconds;
  layout.currentPos.y += s.velocity.y * dtSeconds;

  if (p.collideBounds && container.__baseSize) {
    const bw     = container.__baseSize.w * Math.abs(layout.currentScale.x);
    const bh     = container.__baseSize.h * Math.abs(layout.currentScale.y);
    const left   = layout.currentPos.x - layout.localAnchorX * layout.currentScale.x;
    const top    = layout.currentPos.y - layout.localAnchorY * layout.currentScale.y;
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
        if (s.velocity.y < p.gravity.y * dtSeconds * 2.5) {
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
  return pr.completed;
}

// ─── collect nodes ────────────────────────────────────────────────────────────

type AnimOrPhysics = RunningAnim | PhysicsRunner;

/**
 * Recursively walks the PixiJS container tree and collects all runners
 * and sequence gates.
 *
 * Key invariant this function enforces:
 *   - gate[0] on any container has peersReady = true  (peers known now)
 *   - gate[N] on any container (N > 0) has peersReady = false
 *     It will be set to true by openGate(N-1) at runtime.
 *
 * This prevents the ticker from treating an empty peer set as "all done"
 * on a gate whose peers have not yet been assigned.
 */
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

    // Top-level physics block (directly on the object, not inside a sequence).
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

    // ── Build sequence gates ─────────────────────────────────────────
    // gate[0]:  peersReady = true,  peers = nodeAnims + nodePhysics
    // gate[N]:  peersReady = false, peers = {} (filled by openGate(N-1))
    const seqs = container.__sequences ?? [];
    let isFirstGate = true;

    for (const seq of seqs) {
      const peers = new Set<AnimOrPhysics>();
      // Only the first gate on this container gets its peers pre-populated.
      // Subsequent gates start with an empty peer set AND peersReady=false
      // so the ticker skips them until the prior gate populates them.
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

// ─── adapter ─────────────────────────────────────────────────────────────────

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

    const resizeObserver = new ResizeObserver(() => updateLayout());
    resizeObserver.observe(hostElement);
    updateLayout();

    // ── data collection ─────────────────────────────────────────────────
    const runningAnims:   RunningAnim[]   = [];
    const physicsRunners: PhysicsRunner[] = [];
    const gates:          SequenceGate[]  = [];

    collectData(sceneRoot, runningAnims, physicsRunners, gates);

    // Pre-compute for each gate which gate index is its direct predecessor
    // on the same container. Used in openGate() to find who to notify next.
    // Value is -1 when this is the first gate on its container.
    const gatePrevIndex: number[] = gates.map((gate, gi) => {
      for (let pi = gi - 1; pi >= 0; pi--) {
        if (gates[pi].container === gate.container) return pi;
      }
      return -1;
    });

    // ── open a gate ──────────────────────────────────────────────────────

    /**
     * Activates a sequence gate:
     *   1. Reads all steps in the sequence and creates RunningAnim /
     *      PhysicsRunner entries, appended to the live arrays so the
     *      ticker picks them up immediately next frame.
     *   2. Finds the next gate on the same container and:
     *        a. Populates its peer set with this gate's owned runners.
     *        b. Sets peersReady = true so the ticker can now evaluate it.
     *
     * Step 2b is the critical fix: without it, gate[N+1] has peersReady=false
     * forever and never opens. With the old code, gate[N+1] had
     * peersReady=true from the start but an empty peer set, causing it to
     * fire immediately on frame 1.
     */
    function openGate(gi: number): void {
      const gate = gates[gi];
      if (gate.activated) return;
      gate.activated = true;

      const container = gate.container;

      // Snapshot current visual state so sequence animations start from
      // wherever the object is right now, not from its original position.
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
          // ── animate step ─────────────────────────────────────────
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
          // ── physics step ─────────────────────────────────────────
          const phIR = step as IRPhysics;

          // Inherit exit velocity for seamless continuity.
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

      // ── Notify the next gate on this container ───────────────────────
      // Find the immediate successor gate on the same container and:
      //   - populate its peer set with what this gate just spawned
      //   - flip peersReady to true so the ticker will now evaluate it
      //
      // Without peersReady the successor gate is invisible to the ticker.
      // Without populating peers it would see an empty set and open immediately.
      for (let ni = gi + 1; ni < gates.length; ni++) {
        if (gates[ni].container === container && gatePrevIndex[ni] === gi) {
          for (const ra of gate.ownedAnims)   gates[ni].peers.add(ra);
          for (const pr of gate.ownedPhysics) gates[ni].peers.add(pr);
          gates[ni].peersReady = true;  // ← The fix: unlock the gate for evaluation
          break;
        }
      }
    }

    // ── ticker ───────────────────────────────────────────────────────────
    app.ticker.add((ticker) => {
      const dt        = Math.min(ticker.deltaMS, 100);
      const dtSeconds = dt / 1000;

      // 1. Tick all running animations (top-level and sequence-owned).
      for (const ra of runningAnims) {
        tickAnim(ra, dt);
      }

      // 2. Tick all physics runners. Array grows as gates open, so use index.
      for (let i = 0; i < physicsRunners.length; i++) {
        const pr = physicsRunners[i];
        tickPhysics(pr, pr.container, dt, dtSeconds, logicalWidth, logicalHeight);
      }

      // 3. Evaluate sequence gates in source order.
      //
      //    A gate is eligible only when peersReady is true — this prevents
      //    gates whose peer set has not yet been assigned from firing early.
      //
      //    Once eligible, it opens as soon as every peer is completed.
      //    Gates are evaluated in order so that gate[N+1] can only be
      //    reached after gate[N] has opened and set peersReady on gate[N+1].
      for (let gi = 0; gi < gates.length; gi++) {
        const gate = gates[gi];
        if (gate.activated)  continue;
        if (!gate.peersReady) continue;  // ← Blocked until prior gate opens

        let allDone = true;
        for (const peer of gate.peers) {
          if (!peer.completed) { allDone = false; break; }
        }
        if (allDone) {
          openGate(gi);
        }
      }
    });

    return () => {
      resizeObserver.disconnect();
      app.destroy(true, { children: true });
    };
  },
};