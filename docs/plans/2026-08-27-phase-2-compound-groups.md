# Phase 2 — Compound Groups Implementation Plan

**Goal:** A `group` carrying a `physics` block welds its children into one Matter compound body, so a multi-part logo tumbles as one coherent object instead of colliding as a misplaced bounding box.

**Architecture:** `builder.ts` flattens a group's already-built children into a list of placed `BodyPart`s; `physicsWorld.ts` welds them with `Body.create({ parts })` and stores `localOrigin − centreOfMass` as the read-back offset (D16, generalising D15). A new pure `transform.ts` owns the 2D transform algebra shared by the builder's flattening and `physicsSync.ts`'s new ancestor-transform composition (D17), which is what makes `physics` inside a `template` place correctly. Before any of that, the tick and paint phases are extracted out of `adapter.ts`'s `render()` closure into a testable `SceneRuntime`.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), PixiJS 8, matter-js 0.20.0 (pinned), Vitest (node environment), Playwright via the `visual-check` skill.

**Spec:** `docs/specs/2026-08-27-phase-2-compound-groups-design.md`. Decisions D16–D18 are recorded in `2026-08-26-physics-shared-world-design.md` §2.

**Branch:** `phase-2-compound-groups` (already created; do not work on `main`).

---

## Background an implementer needs

Read these before Task 1. They are short and each one has already caused a real bug.

**The three renderer invariants** (`AGENTS.md`, "Renderer"):

1. **Nothing that mutates scene state may take a time argument.** `advanceOneTick()` advances exactly one tick. `ticker.deltaMS` appears exactly once in the whole renderer, inside `driver.pump()`.
2. **State mutation belongs in the tick phase, painting in the paint phase.** `tickAnim` advances and fires completion side effects; `applyAnim` only writes display properties. Moving a side effect into paint makes it fire once per *frame* instead of once per *tick*, silently dropping physics ticks. This has been a bug twice.
3. **Nothing fed into the physics world may derive from `driver.alpha`.** `pushAnimToWorld` evaluates animations at `alpha = 0` for exactly this reason.

**The alpha trap.** `readState(id, alpha)` at `alpha = 0` returns the *previous* interpolated state, not the current one. `snapContainerToBody` reads at `alpha = 1` deliberately, because that is what makes it tick-aligned. Tests that read only at 0 or 1 hid a real bug in Phase 1 — `physicsWorld.test.ts` now has one that reads at 0.5.

**Named colours are not identifiers.** `red`, `cyan`, `magenta` etc. lex as their own token type, so `def cyan = ...` is a parse error. Do not use them as object or `def` names in test fixtures.

**TypeScript is strict** with `noUnusedLocals`, `noUnusedParameters` and `verbatimModuleSyntax`. Type-only imports need the `type` keyword or the build fails.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/compiler/renderer/transform.ts` | **Create** | Pure 2D transform algebra: compose, point to/from world, vector rotation. No imports at all. |
| `src/compiler/renderer/transform.test.ts` | **Create** | Tests for the above. |
| `src/compiler/renderer/sceneRuntime.ts` | **Create** | The tick phase and the paint phase. Owns the runner lists and the world reference. `import type` only from `pixi.js`. |
| `src/compiler/renderer/sceneRuntime.test.ts` | **Create** | Tests for the tick/paint split, the pin lifecycle, and the alpha-0 rule. |
| `src/compiler/renderer/adapter.ts` | Modify | Shrinks to: PixiJS `Application`, canvas, stage teardown, `buildNode` loop, `sceneFit` layout, the ticker callback, cleanup. |
| `src/compiler/renderer/physicsWorld.ts` | Modify | `BodyGeometry` gains a `compound` variant; `addBody` welds parts and computes the reference-point offset uniformly. |
| `src/compiler/renderer/physicsWorld.test.ts` | Modify | Compound welding, offset through rotation, `Body.scale`, `deltaTime`. |
| `src/compiler/renderer/builder.ts` | Modify | A group's `__bodyShape` becomes a flattened `compound`. Declares `__bodyTransform`. |
| `src/compiler/renderer/builder.test.ts` | **Create** | First tests for the builder. Group flattening, nesting, child scale and rotation. |
| `src/compiler/renderer/physicsSync.ts` | Modify | Threads an ancestor transform through `bindPhysicsBodies`; converts on write-back. |
| `src/compiler/renderer/physicsSync.test.ts` | Modify | Ancestor-transform round trip. |
| `src/compiler/typeChecker/validator.ts` | Modify | Two new rules using the already-threaded `ancestors` parameter. |
| `src/compiler/typeChecker/validator.test.ts` | **Create** | The two new rules. The typeChecker has no tests today. |
| `docs/LANGUAGE.md` | Modify | The collision-shape paragraph, the new compile errors, D18's visual-only note, one new example. |
| `src/compiler/languageDocs.test.ts` | Modify | Three behavioural assertions locking the new claims. |
| `tools/visual-check/scenes/logo.marey` | **Create** | A multi-part logo that tumbles as one body. |
| `tools/visual-check/scenes/logo-freeze.marey` | **Create** | The same logo frozen mid-tumble, for the determinism check. |

---

## Task 1: Extract `SceneRuntime` from `adapter.ts`

**Behaviour-preserving. No feature change. This task must not alter a single rendered pixel.**

**Files:**
- Create: `src/compiler/renderer/sceneRuntime.ts`
- Modify: `src/compiler/renderer/adapter.ts` (replaced almost entirely)

- [ ] **Step 1: Capture the "before" baseline in a real browser**

This task's only oracle is that nothing changes. Capture it before touching code.

Start the dev server in one terminal and leave it running:

```bash
npx vite --port 5199 --strictPort
```

`--strictPort` matters. Without it vite walks forward to 5200, 5201… when the port is taken and prints the one it bound, while `check.mjs` still defaults to `http://localhost:5199` — so a stale pre-existing server absorbs every capture and this task, whose only oracle is "nothing changed", reports a confident false pass. If you must use another port, append `--url http://localhost:<port>` to every `check.mjs` call.

Note also that `--at 300` lands before the renderer initialises (~900–1100 ms), so that frame is not a reproducible oracle even on unmodified code — compare frames from 1500 ms onward.

Then, in another terminal:

```bash
npx playwright install chromium
node tools/visual-check/check.mjs --scene default --at 300,1500,4000 --out .visual-check/t1-default-before
node tools/visual-check/check.mjs --scene tools/visual-check/scenes/freeze-midair.marey --settle 6000 --out .visual-check/t1-freeze-before
node tools/visual-check/check.mjs --scene tools/visual-check/scenes/pile.marey --settle 9000 --out .visual-check/t1-pile-before
```

Read the PNGs with the Read tool to confirm they are not blank. A blank frame means WebGL failed to initialise, not that the renderer is broken — run `node tools/visual-check/smoke.mjs` to check.

Expected: `freeze-midair` and `pile` report `deterministic: true`. `default` has `loop: true` animations so it never rests; `deterministic` and `frozen at rest` are meaningless for it — use it only to confirm the card renders and the handoff arcs.

- [ ] **Step 2: Record the current test count**

Run: `npm test`
Expected: `Tests  121 passed (121)`. Write the number down; it must not fall.

- [ ] **Step 3: Create `sceneRuntime.ts`**

This is a mechanical move. Every function below is copied from `adapter.ts` with two changes only: the module-level `activeWorld` global becomes `this.world`, and the functions that used it become methods. **Do not "improve" anything while moving it** — the ordering in `advanceOneTick` and `paint` is load-bearing (see the invariants above).

Create `src/compiler/renderer/sceneRuntime.ts`:

```ts
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

export function evaluateEasing(t: number, easing: string): number {
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

export function getEasingDerivativeAtEnd(easing: string): number {
  switch (easing) {
    case "easeIn":    return 2.0;
    case "easeOut":   return 0.5;
    case "easeInOut": return 0.5;
    case "linear":
    default:          return 1.0;
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function applyAnim(ra: RunningAnim, alpha: number): void {
  const e = evaluateEasing(animProgress(ra.time, alpha), ra.anim.easing);

  if (ra.anim.property === "alpha") {
    ra.container.alpha = lerp(ra.startVal as number, ra.targetVal as number, e);
  } else if (ra.anim.property === "rotation") {
    ra.container.rotation = lerp(ra.startVal as number, ra.targetVal as number, e) * (Math.PI / 180);
  } else if (ra.anim.property === "position" && ra.container.__mareyLayout) {
    const layout = ra.container.__mareyLayout;
    const startPt = ra.startVal as IRPoint;
    const targetPt = ra.targetVal as IRPoint;

    layout.currentPos.x = lerp(startPt.x, targetPt.x, e);
    layout.currentPos.y = lerp(startPt.y, targetPt.y, e);

    ra.container.__updateLayout?.();
  } else if (ra.anim.property === "scale" && ra.container.__mareyLayout) {
    const layout = ra.container.__mareyLayout;
    const startPt = ra.startVal as IRPoint;
    const targetPt = ra.targetVal as IRPoint;
    layout.currentScale.x = lerp(startPt.x, targetPt.x, e);
    layout.currentScale.y = lerp(startPt.y, targetPt.y, e);
    ra.container.__updateLayout?.();
  }
}

export function getCurrentVal(container: Container, prop: string): number | IRPoint {
  if (prop === "position") {
    return container.__mareyLayout
      ? { x: container.__mareyLayout.currentPos.x, y: container.__mareyLayout.currentPos.y }
      : (container.__startProps ? { x: container.__startProps.position.x, y: container.__startProps.position.y } : { x: 0, y: 0 });
  }
  if (prop === "scale") {
    return container.__mareyLayout
      ? { x: container.__mareyLayout.currentScale.x, y: container.__mareyLayout.currentScale.y }
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
  readonly world: IPhysicsWorld;
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

    // Completion side effects are state, not paint, so they must happen on the
    // tick they occur — not once per rendered frame. Deferring them would let
    // physics skip ticks while a stale kinematic count is still set.
    if (justCompleted && ra.isPosAnim && ra.container.__mareyLayout) {
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
   */
  private pushAnimToWorld(ra: RunningAnim): void {
    const id = ra.container.__body;
    if (!id) return;

    const e = evaluateEasing(animProgress(ra.time, 0), ra.anim.easing);

    if (ra.anim.property === "position") {
      const startPt = ra.startVal as IRPoint;
      const targetPt = ra.targetVal as IRPoint;
      this.world.setPosition(id, lerp(startPt.x, targetPt.x, e), lerp(startPt.y, targetPt.y, e));
    } else if (ra.anim.property === "rotation") {
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
    for (let i = 0; i < this.runningAnims.length; i++) {
      this.tickAnim(this.runningAnims[i]);
    }

    // Animations own their properties; push the tick-aligned values into the
    // world before it steps, so physics never sees a wall-clock-derived value.
    for (let i = 0; i < this.runningAnims.length; i++) {
      this.pushAnimToWorld(this.runningAnims[i]);
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
}
```

- [ ] **Step 4: Rewire `adapter.ts`**

Replace the entire contents of `src/compiler/renderer/adapter.ts` with:

```ts
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
      world.destroy();
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
```

Note what disappeared: the module-level `activeWorld` and its `if (activeWorld === world) activeWorld = null` teardown. It is now `runtime.world`, scoped to the runtime instance. That closes the interleaving risk Phase 1's execution notes recorded as unconfirmed.

- [ ] **Step 5: Typecheck and run the suite**

Run: `npx tsc -b --noEmit && npm test`
Expected: typecheck clean, `Tests  121 passed (121)`. If the count dropped, something was deleted rather than moved.

- [ ] **Step 6: Capture the "after" baseline and compare**

With the dev server still running:

```bash
node tools/visual-check/check.mjs --scene default --at 300,1500,4000 --out .visual-check/t1-default-after
node tools/visual-check/check.mjs --scene tools/visual-check/scenes/freeze-midair.marey --settle 6000 --out .visual-check/t1-freeze-after
node tools/visual-check/check.mjs --scene tools/visual-check/scenes/pile.marey --settle 9000 --out .visual-check/t1-pile-after
```

Read the before/after PNGs side by side with the Read tool. Expected: visually identical, and `deterministic: true` still reported for `freeze-midair` and `pile`.

`freeze-midair` is the one that matters most — it is one box with no contacts frozen in free fall, so nothing can absorb a divergence. If the extraction moved a side effect between the tick and paint phases, this is where it shows.

- [ ] **Step 7: Commit**

```bash
git add src/compiler/renderer/sceneRuntime.ts src/compiler/renderer/adapter.ts
git commit -m "refactor(renderer): lift the tick and paint phases out of render()

advanceOneTick and the runner lifecycle were closure-scoped inside
render(), reachable only through a PixiJS ticker. Spec 5.3 calls an export
driver 'a different caller rather than a different engine', but there was
no caller surface to be different from.

SceneRuntime owns the runner lists and the world reference; adapter.ts
keeps the Application, the canvas, sceneFit layout and the ticker. The
module-level activeWorld global becomes a field, closing the interleaving
risk Phase 1's notes recorded as unconfirmed.

Behaviour-preserving: 121 tests green, and visual-check reports
freeze-midair and pile byte-identical and still deterministic.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Test `SceneRuntime`

**Files:**
- Create: `src/compiler/renderer/sceneRuntime.test.ts`

These tests target exactly the three bugs review found in Phase 1, all of which lived in this code, plus invariant 3.

- [ ] **Step 1: Write the test file**

Create `src/compiler/renderer/sceneRuntime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { SceneRuntime } from "./sceneRuntime";
import { TICK_HZ } from "./clock";
import type {
  IPhysicsWorld, BodyGeometry, BodyState, PhysicsParams, PinReason,
} from "./physicsWorld";
import type { IRAnimation, IRPhysics } from "../sceneIR";

/**
 * A world that records what it was told rather than simulating.
 *
 * The point of these tests is the *orchestration* — which call happens on
 * which tick, and in which phase. Real physics would only add noise.
 */
class RecordingWorld implements IPhysicsWorld {
  readonly calls: string[] = [];
  readonly pins = new Map<string, Set<PinReason>>();
  readonly positions = new Map<string, { x: number; y: number }>();
  readonly velocities = new Map<string, { x: number; y: number }>();
  readonly angleOverrides = new Map<string, number | null>();
  idle = false;

  addBody(id: string, _g: BodyGeometry, x: number, y: number, _a: number, _p: PhysicsParams): void {
    this.pins.set(id, new Set());
    this.positions.set(id, { x, y });
    this.calls.push(`addBody:${id}`);
  }
  removeBody(id: string): void { this.calls.push(`removeBody:${id}`); }
  hasBody(id: string): boolean { return this.pins.has(id); }
  setParams(id: string, _p: PhysicsParams): void { this.calls.push(`setParams:${id}`); }
  pin(id: string, reason: PinReason): void {
    this.pins.get(id)?.add(reason);
    this.calls.push(`pin:${id}:${reason}`);
  }
  unpin(id: string, reason: PinReason): void {
    this.pins.get(id)?.delete(reason);
    this.calls.push(`unpin:${id}:${reason}`);
  }
  isPinned(id: string): boolean { return (this.pins.get(id)?.size ?? 0) > 0; }
  setPosition(id: string, x: number, y: number): void {
    this.positions.set(id, { x, y });
    this.calls.push(`setPosition:${id}:${x.toFixed(4)},${y.toFixed(4)}`);
  }
  setVelocity(id: string, vx: number, vy: number): void {
    this.velocities.set(id, { x: vx, y: vy });
    this.calls.push(`setVelocity:${id}:${vx.toFixed(4)},${vy.toFixed(4)}`);
  }
  setScale(id: string, sx: number, sy: number): void {
    this.calls.push(`setScale:${id}:${sx.toFixed(4)},${sy.toFixed(4)}`);
  }
  overrideAngle(id: string, radians: number | null): void {
    this.angleOverrides.set(id, radians);
    this.calls.push(`overrideAngle:${id}:${radians === null ? "null" : radians.toFixed(4)}`);
  }
  step(): void { this.calls.push("step"); }
  readState(id: string, _alpha: number): BodyState | null {
    const p = this.positions.get(id);
    return p ? { x: p.x, y: p.y, angle: 0 } : null;
  }
  idsOutsideBounds(_margin: number): string[] { return []; }
  isIdle(): boolean { return this.idle; }
  isAsleep(_id: string): boolean { return false; }
  destroy(): void { this.calls.push("destroy"); }
}

const PHYSICS: IRPhysics = {
  velocity: { x: 0, y: 0 },
  gravity: { x: 0, y: 980 },
  airDrag: 0,
  bounce: 0.65,
  collideBounds: true,
  duration: 1,
};

function anim(over: Partial<IRAnimation> = {}): IRAnimation {
  return {
    property: "position",
    to: { x: 200, y: 0 },
    duration: 1,
    easing: "linear",
    loop: false,
    yoyo: false,
    handOff: false,
    ...over,
  };
}

/**
 * A minimal container carrying the `__`-prefixed runtime fields the runtime
 * reads. Built by hand rather than through `buildNode` so each test states
 * exactly the state it depends on.
 */
function makeContainer(over: {
  animations?: IRAnimation[];
  physics?: IRPhysics;
  position?: { x: number; y: number };
} = {}): Container {
  const c = new Container();
  const pos = over.position ?? { x: 0, y: 0 };
  c.__mareyLayout = {
    localPivotX: 0,
    localPivotY: 0,
    currentPos: { x: pos.x, y: pos.y },
    currentScale: { x: 1, y: 1 },
  };
  c.__updateLayout = () => {};
  c.__startProps = {
    position: { x: pos.x, y: pos.y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    alpha: 1,
  };
  c.__animations = over.animations ?? [];
  c.__sequences = [];
  c.__physics = over.physics;
  c.__kinematicPosAnimCount = 0;
  c.__bodyShape = { kind: "circle", radius: 10 };
  return c;
}

function makeRoot(child: Container): Container {
  const root = new Container();
  root.addChild(child);
  return root;
}

describe("SceneRuntime · tick phase", () => {
  it("advances an animation by exactly one tick per advanceOneTick", () => {
    const c = makeContainer({ animations: [anim({ property: "alpha", to: 0 })] });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));

    rt.advanceOneTick();
    rt.paint(0);
    expect(c.alpha).toBeCloseTo(1 - 1 / TICK_HZ, 6);

    rt.advanceOneTick();
    rt.paint(0);
    expect(c.alpha).toBeCloseTo(1 - 2 / TICK_HZ, 6);
  });

  it("pins POS_ANIM at spawn and releases it on the completion tick, not on paint", () => {
    const c = makeContainer({ animations: [anim()], physics: PHYSICS });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    expect(world.pins.get(id)!.has("POS_ANIM")).toBe(true);

    // duration 1s at 120Hz completes on tick 120. Nothing may release it early,
    // and no paint call is made at all in this loop.
    for (let i = 0; i < TICK_HZ - 1; i++) rt.advanceOneTick();
    expect(world.pins.get(id)!.has("POS_ANIM")).toBe(true);

    rt.advanceOneTick();
    expect(world.pins.get(id)!.has("POS_ANIM")).toBe(false);
  });

  it("releases a rotation override on the completion tick even under a catch-up burst", () => {
    // Phase 1 bug 3: the release lived in the paint-phase splice loop, so a
    // frame that advanced several ticks kept re-applying the override for ticks
    // after the animation had finished.
    const c = makeContainer({
      animations: [anim({ property: "rotation", to: 180 })],
      physics: PHYSICS,
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    // Burst of 12 ticks per "frame", which is LiveDriver's catch-up ceiling.
    let ticks = 0;
    while (ticks < TICK_HZ + 12) {
      for (let i = 0; i < 12; i++) { rt.advanceOneTick(); ticks++; }
      rt.paint(0.5);
    }

    // The release fires at tick 120, not at the end of the burst containing it.
    //
    // Note this asserts only WHEN the release fires. Whether it *sticks* is a
    // separate question, and today it does not — `pushAnimToWorld` re-arms the
    // override on the same tick. Task 3 fixes that and asserts it.
    const releaseIndex = world.calls.indexOf(`overrideAngle:${id}:null`);
    expect(releaseIndex).toBeGreaterThan(-1);
    const stepsBefore = world.calls.slice(0, releaseIndex).filter((c2) => c2 === "step").length;
    expect(stepsBefore).toBe(TICK_HZ - 1);
  });

  it("feeds the world the tick-aligned value, never an alpha-interpolated one", () => {
    // Invariant 3. pushAnimToWorld evaluates at alpha 0 so the simulation is not
    // a function of frame rate. A linear 1s animation from x=0 to x=200 has moved
    // 200 * (1/120) after one tick.
    const c = makeContainer({ animations: [anim()], physics: PHYSICS });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    rt.advanceOneTick();
    rt.paint(0.75);

    expect(world.positions.get(id)!.x).toBeCloseTo(200 / TICK_HZ, 6);
    // The painted position leads it by up to one tick — that is the documented cost.
    expect(c.__mareyLayout!.currentPos.x).toBeCloseTo((200 * 1.75) / TICK_HZ, 6);
  });

  it("parks a handOff velocity on the completion tick and flushes it when the last pin lifts", () => {
    const c = makeContainer({
      animations: [anim({ handOff: true, easing: "linear" })],
      physics: PHYSICS,
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    for (let i = 0; i < TICK_HZ; i++) rt.advanceOneTick();

    // linear hands off at average speed: 200px over 1s.
    expect(world.velocities.get(id)).toEqual({ x: 200, y: 0 });
  });

  it("pins FROZEN when a physics duration expires", () => {
    const c = makeContainer({ physics: { ...PHYSICS, duration: 1 } });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    expect(world.pins.get(id)!.has("FROZEN")).toBe(false);
    for (let i = 0; i < TICK_HZ; i++) rt.advanceOneTick();
    expect(world.pins.get(id)!.has("FROZEN")).toBe(true);
  });
});

describe("SceneRuntime · paint phase", () => {
  it("splices completed runners so isIdle can become true", () => {
    const c = makeContainer({ animations: [anim({ property: "alpha", to: 0 })] });
    const world = new RecordingWorld();
    world.idle = true;
    const rt = new SceneRuntime(world, makeRoot(c));

    expect(rt.isIdle()).toBe(false);
    for (let i = 0; i < TICK_HZ; i++) rt.advanceOneTick();
    expect(rt.isIdle()).toBe(false); // not spliced until paint
    rt.paint(1);
    expect(rt.isIdle()).toBe(true);
  });

  it("reports not idle while the world says a body is still moving", () => {
    const c = makeContainer({ physics: { ...PHYSICS, duration: "indefinitely" } });
    const world = new RecordingWorld();
    world.idle = false;
    const rt = new SceneRuntime(world, makeRoot(c));

    rt.advanceOneTick();
    rt.paint(1);
    expect(rt.isIdle()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/compiler/renderer/sceneRuntime.test.ts`
Expected: PASS, 8 tests. If any fail, the extraction in Task 1 changed behaviour — fix the extraction, not the test.

- [ ] **Step 3: Full suite and typecheck**

Run: `npx tsc -b --noEmit && npm test`
Expected: typecheck clean, 129 passed.

- [ ] **Step 4: Commit**

```bash
git add src/compiler/renderer/sceneRuntime.test.ts
git commit -m "test(renderer): cover the tick/paint split and the pin lifecycle

Targets the three bugs review found in Phase 1, all of which lived in
adapter.ts with no coverage: the orphaned handoff velocity, the
rotation-override release running in the paint phase, and the alpha-0 rule
for anything fed into the world.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Stop completed animations pushing to the world

**Two live defects with one root cause. Not in the spec — added deliberately.**

**The root cause.** `advanceOneTick` runs `tickAnim` over every runner, then `pushAnimToWorld` over *the same list*. Completed runners are not spliced until the paint phase, so between completing and being spliced they keep pushing. Two things go wrong, and they need different fixes.

**Defect A — a `rotation` animation permanently locks a physics object's angle.** `tickAnim` releases the override on the completion tick, but `pushAnimToWorld` writes the final angle straight back on that same tick. Nothing clears it again, so `step()` re-applies `Body.setAngle` for the rest of the scene.

Measured before writing this task. A 40x40 square dropped off-centre onto a static ledge, its rotation animation finished long before impact:

| ordering | final angle after impact |
|---|---|
| current | **20.00°** — exactly the animation's `to`. It does not rotate at all. |
| override cleared after splice | −269.04° |
| skip the push once completed (the fix below) | −269.19° |

This is the fourth instance of the rotation-override family. Phase 1's execution notes record the third, which was the same release running in the wrong *phase*; this one is in the right phase but the wrong *order within the tick*.

It also falsifies `docs/LANGUAGE.md`, which says "When an animation finishes, the object returns to full physics control on whichever property the animation was driving", and it means physics spec §6.11's claim that `stepper` "will tumble on impact instead of landing flat" has never been true — its angle is locked at 180° before its physics step begins.

**Defect B — a completed `position` animation re-teleports its body once per tick for the rest of a catch-up burst.** Found by the Task 1 code-quality review and confirmed by measurement. `LiveDriver` advances up to 12 ticks in one frame, so an animation that completes early in a burst keeps pushing for every remaining tick of it.

Measured: a 6-tick position animation inside a 12-tick burst produced **12 `setPosition` calls**, the last six all writing the animation's endpoint `(200, 0)` — after `tickAnim` had completed the animation and unpinned the body. `Body.setPosition` preserves velocity, so the body is dragged back to the endpoint while keeping its momentum.

**How many stale pushes happen depends on how many ticks that frame absorbed, which is the wall clock.** That makes the simulation a function of frame rate — the exact thing AGENTS.md's invariant 3 exists to prevent, arriving by a route the invariant's own wording does not cover, since no `driver.alpha` is involved.

**The two fixes differ, and the difference matters.**

- *Rotation* must skip on the completion tick **and after**. The override is a latch: `tickAnim` released it, and re-arming it even once is what makes Defect A permanent.
- *Position and scale* must push on the completion tick **but not after**. That one final push is what leaves the body exactly at the animation's target; suppressing it would leave the body one tick short. Suppressing the *later* ones is what removes the frame-rate dependence.

**Files:**
- Modify: `src/compiler/renderer/sceneRuntime.ts` (`advanceOneTick` and `pushAnimToWorld`)
- Modify: `src/compiler/renderer/sceneRuntime.test.ts`

- [ ] **Step 1: Write the two failing tests**

Append both inside the `describe("SceneRuntime · tick phase", ...)` block in `src/compiler/renderer/sceneRuntime.test.ts`:

```ts
  it("leaves the angle released after a rotation animation finishes", () => {
    // The release must STICK. tickAnim nulls the override on the completion
    // tick, but pushAnimToWorld runs straight after over the same not-yet-
    // spliced list, so a naive ordering re-arms it — and since the runner is
    // spliced in the paint phase, nothing would ever clear it again. The body
    // would hold the animation's final angle for the rest of the scene.
    const c = makeContainer({
      animations: [anim({ property: "rotation", to: 180 })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));
    const id = c.__body!;

    for (let i = 0; i < TICK_HZ; i++) rt.advanceOneTick();
    rt.paint(1);
    expect(world.angleOverrides.get(id)).toBeNull();

    // And it stays released on later ticks, with the runner spliced away.
    for (let i = 0; i < 10; i++) rt.advanceOneTick();
    rt.paint(1);
    expect(world.angleOverrides.get(id)).toBeNull();
  });

  it("stops pushing a completed position animation for the rest of a burst", () => {
    // Defect B. LiveDriver advances up to 12 ticks in one frame, so an
    // animation that finishes early in a burst keeps re-teleporting its body
    // to the endpoint for every remaining tick — and how many that is depends
    // on the wall clock, which makes the simulation frame-rate dependent.
    //
    // The completion tick's own push is kept deliberately: it is what leaves
    // the body exactly at the target rather than one tick short.
    const c = makeContainer({
      animations: [anim({ duration: 6 / TICK_HZ, to: { x: 200, y: 0 } })],
      physics: { ...PHYSICS, duration: "indefinitely" },
    });
    const world = new RecordingWorld();
    const rt = new SceneRuntime(world, makeRoot(c));

    for (let i = 0; i < 12; i++) rt.advanceOneTick();
    rt.paint(1);

    const pushes = world.calls.filter((s) => s.startsWith("setPosition:"));
    expect(pushes).toHaveLength(6);
    // The last one is the completion tick, and it lands exactly on target.
    expect(pushes[5]).toBe("setPosition:b0:200.0000,0.0000");
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/compiler/renderer/sceneRuntime.test.ts -t "leaves the angle released"`

Expected: FAIL — `expected 3.14159... to be null`. That number is 180° in radians, which is the animation's own `to`: the proof that the override was re-armed rather than released.

Run: `npx vitest run src/compiler/renderer/sceneRuntime.test.ts -t "stops pushing a completed position"`

Expected: FAIL — `expected length 12 to be 6`. The six extra pushes are the stale ones.

- [ ] **Step 3: Fix it**

Two changes in `src/compiler/renderer/sceneRuntime.ts`.

**First**, `advanceOneTick` must tell the push loop which runners completed *on this tick*, because position and scale still need their final push and rotation does not. `tickAnim` already returns that boolean; it is currently discarded. Replace the first two loops of `advanceOneTick` with:

```ts
    // A runner that completed is not spliced until the paint phase, so without
    // this set it would keep pushing for every remaining tick of a catch-up
    // burst — making the simulation a function of how many ticks the frame
    // happened to absorb. `justCompleted` is kept because position and scale
    // still owe the world one final push at their target value.
    const justCompleted = new Set<RunningAnim>();
    for (let i = 0; i < this.runningAnims.length; i++) {
      const ra = this.runningAnims[i];
      if (this.tickAnim(ra)) justCompleted.add(ra);
    }

    // Animations own their properties; push the tick-aligned values into the
    // world before it steps, so physics never sees a wall-clock-derived value.
    for (let i = 0; i < this.runningAnims.length; i++) {
      const ra = this.runningAnims[i];
      if (ra.time.completed && !justCompleted.has(ra)) continue;
      this.pushAnimToWorld(ra, justCompleted.has(ra));
    }
```

**Second**, `pushAnimToWorld` takes the flag and uses it to split rotation from the other two:

```ts
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
```

Note the asymmetry is deliberate and is the whole point: the caller's `continue` handles "completed on an earlier tick" for all three properties, and the `completedThisTick` guard inside handles "completed right now" for rotation alone.

Update the method's docstring to state that it is only called for runners that are still running or completed on this very tick.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/compiler/renderer/sceneRuntime.test.ts`

Expected: PASS, 10 tests.

- [ ] **Step 5: Full suite and typecheck**

Run: `npx tsc -b --noEmit && npm test`

Expected: clean, all green.

- [ ] **Step 6: Confirm the behaviour change in the browser**

**CORRECTED 2026-08-28 — this step's original premise was false.** It claimed the fix would make the default scene's `stepper` start tumbling, citing physics spec §6.11. `stepper` is released from a completed `easeInOut` position animation with no exit velocity and lands flat on a flat floor: symmetric contact, no torque, no rotation, override bug or not. The card's own header comment in `src/store/defaultScene.ts` has said so since commit `91172b1`; §6.11 was stale and has now been corrected in place.

So this step is **a regression check, not a change check**: the default scene must look the *same* before and after.

To actually see Defect A, build a scene with an asymmetric landing — a triangle whose `rotation` animation finishes well before it lands off-centre on a static ledge. Do not use a square: one settling at 0° or 90° looks identical either way and hides the effect.

With the dev server running. **Start it as `npx vite --port 5199 --strictPort`, or read the port it prints and append `--url http://localhost:<port>` to every `check.mjs` call below.** Without `--strictPort`, vite silently walks forward to 5200, 5201… when 5199 is taken, while `check.mjs` still defaults to 5199 — so the capture can hit a stale pre-existing server and report a confident pass without ever exercising your code. This happened during Task 1.

```bash
node tools/visual-check/check.mjs --scene default --at 300,2400,4000,6000 --out .visual-check/t3-default-after
```

Read the PNGs and compare against `.visual-check/t1-default-before` from Task 1. Expected: the card is unchanged — three easing lanes, the `handOff` arc, the breathing rings, the bar wave, and `stepper` landing flat exactly as before. Note that only the 300 ms and 4000 ms samples are directly comparable, since Task 1 captured `--at 300,1500,4000`.

Then capture your asymmetric-landing scene before and after the production change (stash it to get the "before"). Expected: before, the shape's angle latches the instant its animation ends and it never rotates again, coming to rest in a physically impossible tilted pose; after, it rocks and settles flat against the ledge.

- [ ] **Step 7: Commit**

```bash
git add src/compiler/renderer/sceneRuntime.ts src/compiler/renderer/sceneRuntime.test.ts
git commit -m "fix(renderer): stop completed animations pushing to the world

advanceOneTick runs tickAnim over every runner, then pushAnimToWorld over
the same list. Completed runners are not spliced until the paint phase, so
they keep pushing in between. Two defects, one cause.

A rotation animation permanently locked its object's angle: tickAnim
released the override on the completion tick and pushAnimToWorld re-armed
it on that same tick, after which nothing ever cleared it and step() forced
Body.setAngle to the animation final value for the rest of the scene.
Measured on a square dropped off-centre onto a ledge, rotation animation
long finished: 20.00deg after impact, which is the animation own to and
means no rotation at all, against -269.19deg with the fix.

A completed position animation re-teleported its body once per tick for the
rest of a catch-up burst. A 6-tick animation inside a 12-tick burst made 12
setPosition calls, the last six writing the endpoint after the body had
been unpinned. How many stale pushes occur depends on how many ticks the
frame absorbed, so the simulation was a function of frame rate.

The two fixes differ: rotation is a latch and must skip the completion tick
too, while position and scale still owe one final push at their target.

Falsified LANGUAGE.md returns to full physics control and physics spec 6.11
prediction that stepper would tumble rather than land flat. The default
scene changes: stepper now tumbles.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Stop animations starting from paint-phase state

**The third defect in the same family, and the largest. Found by mutation-testing Task 3, not by scoping.**

`spawnAnim` seeds a new animation's `startVal` from `getCurrentVal(container, prop)`, which reads `__mareyLayout.currentPos`, `container.rotation` and `container.alpha`. Every one of those was last written **in the paint phase, at the driver's wall-clock alpha** — by `applyAnim`, or by `syncWorldToContainers`. That `startVal` then flows straight into `pushAnimToWorld` → `world.setPosition`.

So the value the physics world receives depends on when the last frame happened to land. This is invariant 3 again, reached by a third route — and again with no `driver.alpha` anywhere in the call chain, which is why the invariant's own wording did not catch it.

**Measured.** A `sequence { animate position to 120; animate position to 240; physics }`, run twice for an identical **40 ticks**, painting at alpha 0.5, differing only in how many ticks each frame absorbed:

| frame size | `setPosition` values after the first animation ends |
|---|---|
| 1 tick | `120.0000`, `114.3333`, `118.6667`, `123.0000` |
| 7 ticks | `120.0000`, **`8.0000`**, `16.0000`, `24.0000` |

At 7-tick pacing the second animation starts from a `currentPos` that no paint has updated since tick 0, so it animates from ~0 instead of ~110 — the body is dragged roughly **110px backwards**, and how far depends purely on frame rate. The equivalent divergence in Task 3's Defect B was a stale endpoint repeat; this one is a visible jump and it breaks scene replay, which is what Phase 0 exists to guarantee and what baked-keyframe export depends on.

**Why it survived this long.** The physics→animate handoff *is* protected: `snapContainerToBody` runs on freeze and reads at alpha 1, which is tick-aligned. Only the animate→animate handoff is unprotected, because nothing snaps there.

**The fix has direct precedent.** Mirror `snapContainerToBody`: on the tick an animation completes, write its exact final value to the container in the **tick** phase, before anything can read it as a start value.

This looks like it brushes invariant 2, which says painting belongs in the paint phase. It does not. Invariant 2 forbids moving *side effects* into paint; it does not forbid a tick-phase state snap. `snapContainerToBody` already does exactly this for the freeze transition and documents why.

**Files:**
- Modify: `src/compiler/renderer/sceneRuntime.ts` (`tickAnim`)
- Modify: `src/compiler/renderer/sceneRuntime.test.ts`

- [ ] **Step 1: Write the failing test**

This is a *harness*, not a single assertion — the same shape would have caught Task 3's Defect B, and this is the third instance of the family, so it is worth building properly. Append a new describe block to `src/compiler/renderer/sceneRuntime.test.ts`:

```ts
/**
 * Frame pacing must not change what the physics world is told.
 *
 * Three separate defects in this phase have been "a wall-clock-derived value
 * reached the world", and none of them involved `driver.alpha` directly, which
 * is why reading invariant 3 literally did not prevent any of them. This runs a
 * scene at two very different frame pacings for an identical number of ticks
 * and requires the world to see the identical call sequence.
 */
function runAtPacing(ticksPerFrame: number, totalTicks: number): string[] {
  const c = makeContainer({ sequence: TWO_STEP_SEQUENCE });
  const world = new RecordingWorld();
  const rt = new SceneRuntime(world, makeRoot(c));
  let done = 0;
  while (done < totalTicks) {
    const n = Math.min(ticksPerFrame, totalTicks - done);
    for (let i = 0; i < n; i++) rt.advanceOneTick();
    // A deliberately awkward alpha: 0 and 1 are the two values that hide this.
    rt.paint(0.5);
    done += n;
  }
  return world.calls;
}

describe("SceneRuntime · frame pacing must not reach the world", () => {
  it("sends the world the same calls at 1 tick per frame as at 7", () => {
    expect(runAtPacing(7, 40)).toEqual(runAtPacing(1, 40));
  });

  it("sends the same calls at 12 ticks per frame — LiveDriver's catch-up ceiling", () => {
    expect(runAtPacing(12, 60)).toEqual(runAtPacing(1, 60));
  });

  it("starts a sequence's second animation from the first one's exact target", () => {
    // The specific mechanism: the second animation's startVal is read from
    // container state that the paint phase last wrote at the driver's alpha.
    const calls = runAtPacing(7, 40);
    const positions = calls.filter((s) => s.startsWith("setPosition:"));
    const firstTargetIndex = positions.indexOf("setPosition:b0:120.0000,0.0000");
    expect(firstTargetIndex).toBeGreaterThan(-1);
    // Whatever comes next must continue from 120, not jump back toward 0.
    const next = positions[firstTargetIndex + 1];
    const x = Number(next.split(":")[2].split(",")[0]);
    expect(x).toBeGreaterThanOrEqual(120);
  });
});
```

You need one fixture. `makeContainer` currently takes `animations`/`physics`/`position`; add a `sequence` option that sets `__sequences`, and define the sequence beside the other constants:

```ts
/** animate to 120 over 6 ticks, then to 240 over 30, then simulate. */
const TWO_STEP_SEQUENCE: IRSequence = {
  steps: [
    { ...anim({ to: { x: 120, y: 0 }, duration: 6 / TICK_HZ }) },
    { ...anim({ to: { x: 240, y: 0 }, duration: 30 / TICK_HZ }) },
    { ...PHYSICS, duration: "indefinitely" },
  ],
};
```

Import `IRSequence` as a type from `../sceneIR`.

- [ ] **Step 2: Run to confirm all three fail**

Run: `npx vitest run src/compiler/renderer/sceneRuntime.test.ts -t "frame pacing"`

Expected: all three FAIL. The first two on a long array diff whose first divergence is the second animation's start; the third with a received `x` around `8`, not `≥ 120`.

If any of the three passes before the fix, it is not testing the bug — say so and stop rather than proceeding.

- [ ] **Step 3: Implement**

In `src/compiler/renderer/sceneRuntime.ts`, in `tickAnim`, immediately after `const justCompleted = advanceAnimTime(ra.time);`:

```ts
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
```

`applyAnim` is a module-level function in this file, so it is directly callable.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/compiler/renderer/sceneRuntime.test.ts`

Expected: PASS, 15 tests.

- [ ] **Step 5: Full suite and typecheck**

Run: `npx tsc -b --noEmit && npm test`

Expected: clean, 136 passed.

If an existing test now fails, do not adjust it before understanding why: this changes when a container reaches its final animated value, and a test that depended on the old one-tick lag is either encoding the bug or catching a real regression. Report which.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/renderer/sceneRuntime.ts src/compiler/renderer/sceneRuntime.test.ts
git commit -m "fix(renderer): stop animations starting from paint-phase state

spawnAnim seeds startVal from getCurrentVal, which reads currentPos,
rotation and alpha — all last written by the paint phase at the driver's
wall-clock alpha. That value then goes straight into world.setPosition, so
what the physics world is told depended on when the last frame landed.

Measured on a two-step position sequence over an identical 40 ticks: at
1-tick frames the second animation continues from 120, at 7-tick frames it
restarts from 8, dragging the body about 110px backwards. That breaks scene
replay, which is what the fixed clock exists to provide.

Third defect in this phase of the form 'a wall-clock-derived value reached
the world', and the third with no driver.alpha anywhere in the call chain.
Adds a frame-pacing harness that requires the world to see identical calls
at 1, 7 and 12 ticks per frame — the shape of test that would have caught
the other two.

Fixed by snapping the animated property to its final value in the tick
phase on completion, mirroring what snapContainerToBody already does for
the freeze transition.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `transform.ts` — pure 2D transform algebra

**Files:**
- Create: `src/compiler/renderer/transform.ts`
- Create: `src/compiler/renderer/transform.test.ts`

Both the builder's group flattening (Task 7) and `physicsSync`'s ancestor composition (Task 8) need to compose a parent transform with a child's local one. This module is the single copy.

- [ ] **Step 1: Write the failing test**

Create `src/compiler/renderer/transform.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  IDENTITY, compose, toWorld, toLocal, rotateScaleVector, type LocalTransform,
} from "./transform";

const DEG = Math.PI / 180;

describe("compose", () => {
  it("adds translation when there is no rotation or scale", () => {
    const parent: LocalTransform = { x: 100, y: 50, rot: 0, sx: 1, sy: 1 };
    expect(compose(parent, { x: 10, y: 5 }, 0, { x: 1, y: 1 })).toEqual({
      x: 110, y: 55, rot: 0, sx: 1, sy: 1,
    });
  });

  it("rotates the child's offset into the parent's frame", () => {
    const parent: LocalTransform = { x: 0, y: 0, rot: 90 * DEG, sx: 1, sy: 1 };
    const c = compose(parent, { x: 10, y: 0 }, 0, { x: 1, y: 1 });
    expect(c.x).toBeCloseTo(0, 10);
    expect(c.y).toBeCloseTo(10, 10);
  });

  it("scales the child's offset before rotating it", () => {
    const parent: LocalTransform = { x: 0, y: 0, rot: 90 * DEG, sx: 2, sy: 3 };
    const c = compose(parent, { x: 10, y: 0 }, 0, { x: 1, y: 1 });
    expect(c.x).toBeCloseTo(0, 10);
    expect(c.y).toBeCloseTo(20, 10);
  });

  it("sums rotations and multiplies scales", () => {
    const parent: LocalTransform = { x: 0, y: 0, rot: 30 * DEG, sx: 2, sy: 4 };
    const c = compose(parent, { x: 0, y: 0 }, 45 * DEG, { x: 3, y: 0.5 });
    expect(c.rot).toBeCloseTo(75 * DEG, 10);
    expect(c.sx).toBeCloseTo(6, 10);
    expect(c.sy).toBeCloseTo(2, 10);
  });

  it("composing with identity is a no-op", () => {
    const child = compose(IDENTITY, { x: 7, y: -3 }, 0.4, { x: 1.5, y: 2 });
    expect(child).toEqual({ x: 7, y: -3, rot: 0.4, sx: 1.5, sy: 2 });
  });
});

describe("toWorld and toLocal", () => {
  it("toWorld places a local point through translation, rotation and scale", () => {
    const t: LocalTransform = { x: 400, y: 300, rot: 90 * DEG, sx: 2, sy: 1 };
    const w = toWorld(t, 10, 0);
    expect(w.x).toBeCloseTo(400, 10);
    expect(w.y).toBeCloseTo(320, 10);
  });

  it("toLocal is the exact inverse of toWorld", () => {
    const t: LocalTransform = { x: -37, y: 214, rot: 1.234, sx: 2.5, sy: 0.4 };
    const w = toWorld(t, 13, -29);
    const back = toLocal(t, w.x, w.y);
    expect(back.x).toBeCloseTo(13, 8);
    expect(back.y).toBeCloseTo(-29, 8);
  });

  it("round-trips under identity", () => {
    expect(toWorld(IDENTITY, 5, 9)).toEqual({ x: 5, y: 9 });
    expect(toLocal(IDENTITY, 5, 9)).toEqual({ x: 5, y: 9 });
  });
});

describe("rotateScaleVector", () => {
  it("applies rotation and scale but not translation", () => {
    // A velocity must not pick up the parent's position.
    const t: LocalTransform = { x: 1000, y: 1000, rot: 90 * DEG, sx: 1, sy: 1 };
    const v = rotateScaleVector(t, 60, 0);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(60, 10);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/compiler/renderer/transform.test.ts`
Expected: FAIL — `Failed to resolve import "./transform"`.

- [ ] **Step 3: Write the implementation**

Create `src/compiler/renderer/transform.ts`:

```ts
/**
 * 2D transform algebra, shared by the builder's group flattening and
 * `physicsSync`'s ancestor composition.
 *
 * Deliberately dependency-free — no `pixi.js`, no IR, no Matter. It exists as
 * its own module because two callers need the identical composition and a
 * second copy would drift.
 *
 * `rot` is in radians, matching `Container.rotation`. Marey source writes
 * degrees; `builder.ts` converts on the way in.
 */
export interface LocalTransform {
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly sx: number;
  readonly sy: number;
}

export const IDENTITY: LocalTransform = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };

/**
 * Place a child's local transform inside its parent's frame.
 *
 * Scale applies before rotation, which is the order PixiJS's own scene graph
 * uses, so a scaled-then-rotated child lands where it is drawn.
 */
export function compose(
  parent: LocalTransform,
  localPos: { x: number; y: number },
  localRot: number,
  localScale: { x: number; y: number }
): LocalTransform {
  const c = Math.cos(parent.rot);
  const s = Math.sin(parent.rot);
  const px = localPos.x * parent.sx;
  const py = localPos.y * parent.sy;
  return {
    x: parent.x + px * c - py * s,
    y: parent.y + px * s + py * c,
    rot: parent.rot + localRot,
    sx: parent.sx * localScale.x,
    sy: parent.sy * localScale.y,
  };
}

/** A point in `t`'s local space, expressed in the space `t` is defined in. */
export function toWorld(t: LocalTransform, x: number, y: number): { x: number; y: number } {
  const c = Math.cos(t.rot);
  const s = Math.sin(t.rot);
  const px = x * t.sx;
  const py = y * t.sy;
  return { x: t.x + px * c - py * s, y: t.y + px * s + py * c };
}

/**
 * The exact inverse of `toWorld`.
 *
 * Used for physics write-back: the world reports a body's position in scene
 * space, but a container's `currentPos` is relative to its parent.
 */
export function toLocal(t: LocalTransform, x: number, y: number): { x: number; y: number } {
  const c = Math.cos(t.rot);
  const s = Math.sin(t.rot);
  const dx = x - t.x;
  const dy = y - t.y;
  return {
    x: (dx * c + dy * s) / t.sx,
    y: (-dx * s + dy * c) / t.sy,
  };
}

/**
 * Rotate and scale a vector, without translating it.
 *
 * A velocity is a direction and a magnitude, not a position, so it must not
 * pick up the parent's offset. `handOff` needs this.
 */
export function rotateScaleVector(
  t: LocalTransform,
  x: number,
  y: number
): { x: number; y: number } {
  const c = Math.cos(t.rot);
  const s = Math.sin(t.rot);
  const px = x * t.sx;
  const py = y * t.sy;
  return { x: px * c - py * s, y: px * s + py * c };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/compiler/renderer/transform.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/renderer/transform.ts src/compiler/renderer/transform.test.ts
git commit -m "feat(renderer): add pure 2D transform algebra

One copy of the parent-child composition that both the builder's group
flattening and physicsSync's ancestor composition need.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Compound bodies in `physicsWorld.ts`

**Files:**
- Modify: `src/compiler/renderer/physicsWorld.ts:90-96` (`BodyGeometry`), `206-274` (`addBody`)
- Modify: `src/compiler/renderer/physicsWorld.test.ts`

This lands before the builder emits compounds, so there is never an intermediate state where a group's geometry has no handler.

- [ ] **Step 1: Write the failing tests**

Append to `src/compiler/renderer/physicsWorld.test.ts`:

```ts
describe("compound bodies (spec D16, D18)", () => {
  it("welds parts into one body whose reference point is the local origin", () => {
    // Two squares either side of the group origin, the right one heavier, so
    // the centre of mass is NOT the origin. That is the whole point of D16:
    // a group's reference point is its origin, not its content's centre.
    const world = new MatterWorld(800, 600);
    world.addBody("g", {
      kind: "compound",
      parts: [
        { kind: "rectangle", width: 20, height: 20, x: -50, y: 0, angle: 0 },
        { kind: "rectangle", width: 60, height: 60, x: 50, y: 0, angle: 0 },
      ],
    }, 400, 100, 0, VACUUM);

    const state = world.readState("g", 1)!;
    expect(state.x).toBeCloseTo(400, 6);
    expect(state.y).toBeCloseTo(100, 6);
    world.destroy();
  });

  it("keeps the reference point on the origin through a rotation", () => {
    const world = new MatterWorld(800, 600);
    world.addBody("g", {
      kind: "compound",
      parts: [
        { kind: "rectangle", width: 20, height: 20, x: -50, y: 0, angle: 0 },
        { kind: "rectangle", width: 60, height: 60, x: 50, y: 0, angle: 0 },
      ],
    }, 400, 100, Math.PI / 2, VACUUM);

    // Rotating 90deg about the centre of mass at (440, 100) carries the origin
    // from (400, 100) to (440, 60). Measured against Matter 0.20.0.
    const state = world.readState("g", 1)!;
    expect(state.x).toBeCloseTo(440, 4);
    expect(state.y).toBeCloseTo(60, 4);
    world.destroy();
  });

  it("collides using the real parts, not the parent's convex hull", () => {
    // An L: the notch must let a small body through. If Matter collided on the
    // auto-hull the notch would be solid.
    const world = new MatterWorld(800, 600);
    world.addBody("L", {
      kind: "compound",
      parts: [
        { kind: "rectangle", width: 200, height: 20, x: 0, y: 90, angle: 0 },
        { kind: "rectangle", width: 20, height: 200, x: -90, y: 0, angle: 0 },
      ],
    }, 400, 400, 0, VACUUM);
    world.pin("L", "NO_RUNNER");

    // Dropped into the notch — clear of both arms.
    world.addBody("ball", { kind: "circle", radius: 6 }, 440, 330, 0, {
      ...VACUUM, gravityY: 980,
    });

    for (let i = 0; i < TICK_HZ; i++) world.step();

    // It rests on the horizontal arm at y ~= 400 + 90 - 10 - 6, not on the hull
    // top at y ~= 400 - 100 - 6.
    const y = world.readState("ball", 1)!.y;
    expect(y).toBeGreaterThan(400);
    world.destroy();
  });

  it("falls back to a unit rectangle for a compound with no parts", () => {
    // An empty group. Body.create({parts: []}) would silently return Matter's
    // default 40x40 body.
    const world = new MatterWorld(800, 600);
    world.addBody("empty", { kind: "compound", parts: [] }, 400, 100, 0, VACUUM);
    const state = world.readState("empty", 1)!;
    expect(state.x).toBeCloseTo(400, 6);
    expect(state.y).toBeCloseTo(100, 6);
    world.destroy();
  });

  it("sets deltaTime on the parent, which is the only one Matter reads", () => {
    // Body.create defaults deltaTime to 1000/60 on the parent AND every part.
    // Body.update and setVelocity/getVelocity read only the parent's, so the
    // parent is the correct place — but this is exactly the class of unstated
    // normalisation the 6.3 conversions got wrong once.
    const world = new MatterWorld(800, 600);
    world.addBody("g", {
      kind: "compound",
      parts: [{ kind: "rectangle", width: 40, height: 40, x: 0, y: 0, angle: 0 }],
    }, 400, 100, 0, VACUUM);

    // A vacuum body given 600 px/s must travel 600px in one second, exactly as
    // the single-body assertion in this file requires.
    world.setVelocity("g", 600, 0);
    for (let i = 0; i < TICK_HZ; i++) world.step();
    expect(world.readState("g", 1)!.x).toBeCloseTo(1000, 0);
    world.destroy();
  });

  it("scales a compound about its centre of mass, keeping visual and body aligned (D7)", () => {
    const world = new MatterWorld(800, 600);
    world.addBody("g", {
      kind: "compound",
      parts: [
        { kind: "rectangle", width: 20, height: 20, x: -50, y: 0, angle: 0 },
        { kind: "rectangle", width: 60, height: 60, x: 50, y: 0, angle: 0 },
      ],
    }, 400, 100, 0, VACUUM);

    world.setScale("g", 2, 2);

    // The centre of mass holds at (440, 100); the origin is offset (-40, 0)
    // from it at scale 1, so at scale 2 it reads 80px to its left.
    const state = world.readState("g", 1)!;
    expect(state.x).toBeCloseTo(360, 4);
    expect(state.y).toBeCloseTo(100, 4);
    world.destroy();
  });

  it("bakes a part's own angle into a rotated rectangle part", () => {
    const world = new MatterWorld(800, 600);
    world.addBody("g", {
      kind: "compound",
      parts: [
        { kind: "rectangle", width: 100, height: 10, x: 0, y: 0, angle: Math.PI / 2 },
      ],
    }, 400, 100, 0, VACUUM);
    // A 100x10 bar rotated 90deg is 10 wide and 100 tall.
    const b = world.boundsOf("g")!;
    expect(b.max.x - b.min.x).toBeCloseTo(10, 4);
    expect(b.max.y - b.min.y).toBeCloseTo(100, 4);
    world.destroy();
  });
});
```

Both fixtures these tests use are already in `physicsWorld.test.ts`: `TICK_HZ`, imported from `./clock` at line 12, and `VACUUM`, the zero-gravity `PhysicsParams` at line 100. Do not add new ones.

The last test calls a `boundsOf` accessor that does not exist yet; it is added in Step 3.

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: FAIL — TypeScript rejects `kind: "compound"` as not assignable to `BodyGeometry`, and `boundsOf` is not a method.

- [ ] **Step 3: Implement**

In `src/compiler/renderer/physicsWorld.ts`, replace the `BodyGeometry` block (currently lines 81–96) with:

```ts
/**
 * A point in a body's own local space. Spelled inline rather than imported,
 * because this module must not depend on `pixi.js` (D9) and does not depend on
 * the IR either.
 */
export interface LocalPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * One shape inside a compound, placed in the group's local space.
 *
 * `x`/`y` locate the shape's own pivot — its centre for a circle or rectangle,
 * its bounding-box centre for a polygon — which is the same point `builder.ts`
 * pivots the drawn shape about. `angle` is radians.
 */
export type BodyPart =
  | { readonly kind: "circle"; readonly radius: number; readonly x: number; readonly y: number }
  | {
      readonly kind: "rectangle";
      readonly width: number; readonly height: number;
      readonly x: number; readonly y: number; readonly angle: number;
    }
  | {
      readonly kind: "polygon";
      readonly points: ReadonlyArray<LocalPoint>;
      readonly x: number; readonly y: number; readonly angle: number;
    };

/**
 * Plain geometry, in the container's own local space. Deliberately free of
 * any PixiJS type (spec D9).
 *
 * `addBody` places the geometry's **reference point** at the (x, y) it is
 * given. Each kind defines its own, and the stored offset is always
 * `referencePoint − centreOfMass` (spec D16, which generalises D15):
 *
 * | kind        | reference point            | offset            |
 * |-------------|----------------------------|-------------------|
 * | `circle`    | shape centre               | zero              |
 * | `rectangle` | shape centre               | zero              |
 * | `polygon`   | bounding-box centre        | bbox − centroid   |
 * | `compound`  | the group's local origin   | origin − centre   |
 *
 * That is what keeps the drawn shape aligned with its collision shape as a
 * body rotates, and what makes a group rotate about its declared origin
 * rather than about its content's centre of mass.
 */
export type BodyGeometry =
  | { readonly kind: "circle"; readonly radius: number }
  | { readonly kind: "rectangle"; readonly width: number; readonly height: number }
  | { readonly kind: "polygon"; readonly points: ReadonlyArray<LocalPoint> }
  | { readonly kind: "compound"; readonly parts: ReadonlyArray<BodyPart> };
```

Add these module-level helpers just above `export class MatterWorld` (after the `BodyRecord` interface):

```ts
/**
 * Matter's `Vertices.hull` is typed as taking `Matter.Vertex[]`
 * (index/body/isInternal), but the real implementation
 * (`../matter-js-master/src/geometry/Vertices.js`) only ever reads `.x`/`.y`
 * off each entry, so plain points are safe at runtime.
 *
 * Hulling up front rather than letting Matter fall back internally also avoids
 * its `warnOnce` about the `poly-decomp` we deliberately do not ship (spec 3).
 */
function hullOf(points: ReadonlyArray<LocalPoint>): Matter.Vertex[] {
  return Matter.Vertices.hull(
    points.map((p) => ({ x: p.x, y: p.y })) as Matter.Vertex[]
  );
}

/** Rotate points about the local origin. */
function rotatePoints(points: ReadonlyArray<LocalPoint>, angle: number): LocalPoint[] {
  if (angle === 0) return points.map((p) => ({ x: p.x, y: p.y }));
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return points.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

/**
 * A polygon body whose *bounding-box centre* lands at (x, y).
 *
 * `Bodies.fromVertices` places the centre of MASS at the point it is given, and
 * for an asymmetric polygon those are different points — 7.5px apart for the
 * default scene's own triangle. This is D15.
 */
function polygonBodyAtBboxCentre(points: ReadonlyArray<LocalPoint>, x: number, y: number): Matter.Body {
  // Matter.Vertex extends Vector, so the hull passes straight to fromVertices.
  const hull = hullOf(points);
  const centroid = Matter.Vertices.centre(hull);
  const bounds = Matter.Bounds.create(hull);
  const offX = (bounds.min.x + bounds.max.x) / 2 - centroid.x;
  const offY = (bounds.min.y + bounds.max.y) / 2 - centroid.y;
  return Matter.Bodies.fromVertices(x - offX, y - offY, [hull]);
}

/**
 * One Matter body for a part, with the part's own pivot placed at
 * (originX + p.x, originY + p.y).
 *
 * A rotated rectangle takes `angle` as an option, because a rectangle's pivot
 * is its centre and `Bodies.rectangle` rotates about that. A rotated polygon
 * instead has its *points* rotated first, because its pivot is the bounding-box
 * centre and `Body.setAngle` would rotate it about the centre of mass.
 */
function createPartBody(p: BodyPart, originX: number, originY: number): Matter.Body {
  const x = originX + p.x;
  const y = originY + p.y;

  if (p.kind === "circle") {
    return Matter.Bodies.circle(x, y, Math.max(p.radius, 0.5));
  }
  if (p.kind === "rectangle") {
    return Matter.Bodies.rectangle(
      x, y,
      Math.max(p.width, 1),
      Math.max(p.height, 1),
      { angle: p.angle }
    );
  }
  return polygonBodyAtBboxCentre(rotatePoints(p.points, p.angle), x, y);
}
```

Replace the body of `addBody` (currently lines 206–274) with:

```ts
  addBody(
    id: string,
    geometry: BodyGeometry,
    x: number,
    y: number,
    angle: number,
    params: PhysicsParams
  ): void {
    // Every branch places the geometry's REFERENCE POINT at (x, y); the offset
    // then falls out as `(x, y) − centreOfMass` uniformly. See BodyGeometry's
    // table and spec D16.
    let body: Matter.Body;

    if (geometry.kind === "circle") {
      body = Matter.Bodies.circle(x, y, Math.max(geometry.radius, 0.5));
    } else if (geometry.kind === "rectangle") {
      body = Matter.Bodies.rectangle(
        x, y,
        Math.max(geometry.width, 1),
        Math.max(geometry.height, 1)
      );
    } else if (geometry.kind === "polygon") {
      body = polygonBodyAtBboxCentre(geometry.points, x, y);
    } else if (geometry.parts.length === 0) {
      // An empty group. Body.create({parts: []}) would silently hand back
      // Matter's default 40x40 body; a unit rectangle preserves what a
      // zero-area group did before compounds existed.
      body = Matter.Bodies.rectangle(x, y, 1, 1);
    } else {
      body = Matter.Body.create({
        parts: geometry.parts.map((p) => createPartBody(p, x, y)),
      });
    }

    // Captured before setAngle, so it is a body-LOCAL vector: at angle 0 the
    // body's local axes and the world's coincide.
    const offsetX = x - body.position.x;
    const offsetY = y - body.position.y;

    // Body.create defaults deltaTime to 1000/60. Left alone, the first tick
    // would run with Matter's time correction at 0.5. Parts inherit the same
    // default, but Body.update and setVelocity/getVelocity read only the
    // parent's, so the parent is the only one that needs it.
    body.deltaTime = MATTER_DELTA_MS;
    Matter.Body.setAngle(body, angle);

    const rec: BodyRecord = {
      body,
      gravityX: params.gravityX,
      gravityY: params.gravityY,
      offsetX,
      offsetY,
      scaleX: 1,
      scaleY: 1,
      pinReasons: new Set(),
      angleOverride: null,
      prevX: body.position.x,
      prevY: body.position.y,
      prevAngle: body.angle,
    };
    this.records.set(id, rec);
    this.applyParams(rec, params);
    Matter.Composite.add(this.engine.world, body);
  }
```

**Also fix pin reason-counting while this file is open.** `pinReasons` is a `Set<PinReason>`, so two `pin(id, "POS_ANIM")` calls collapse to one entry and a single `unpin` releases both. An object with two `animate position` blocks therefore goes dynamic the moment the *first* one finishes, while the second is still calling `setPosition` on it. Confirmed: at tick 6 of a 6-tick and a 30-tick animation on one body, the pin set is empty.

Change the field to a count per reason:

```ts
  /** Why this body is pinned, and how many holds each reason has. */
  readonly pinReasons: Map<PinReason, number>;
```

```ts
  pin(id: string, reason: PinReason): void {
    const rec = this.records.get(id);
    if (!rec) return;
    const wasPinned = rec.pinReasons.size > 0;
    // Counted, not a set: two position animations on one object take two holds
    // and must take two releases. A Set silently collapsed them, so the first
    // animation to finish handed the body back to the solver while the second
    // was still driving it.
    rec.pinReasons.set(reason, (rec.pinReasons.get(reason) ?? 0) + 1);
    if (!wasPinned) Matter.Body.setStatic(rec.body, true);
  }

  unpin(id: string, reason: PinReason): void {
    const rec = this.records.get(id);
    if (!rec) return;
    const held = rec.pinReasons.get(reason);
    if (held === undefined) return;
    if (held > 1) {
      rec.pinReasons.set(reason, held - 1);
      return;
    }
    rec.pinReasons.delete(reason);
    if (rec.pinReasons.size > 0) return;
    // setStatic collapses positionPrev onto position, so the body resumes from
    // rest. Callers that want momentum carried across call setVelocity after.
    Matter.Body.setStatic(rec.body, false);
    Matter.Sleeping.set(rec.body, false);
  }
```

Update `addBody`'s record literal from `pinReasons: new Set()` to `pinReasons: new Map()`.

Then delete the dead counter this was originally built to be. `__kinematicPosAnimCount` is incremented in `sceneRuntime.ts`'s `spawnAnim`, decremented in `tickAnim`, declared in `builder.ts`'s `declare module` block and initialised there — and **read nowhere in `src/`**. It is leftover state from before Phase 1 replaced counting with reason-tagging, and it looks live. Remove all four sites.

Add a test for the counting:

```ts
  it("takes two releases when two reasons of the same kind hold the pin", () => {
    // Two `animate position` blocks on one object take two holds. A Set
    // collapsed them, so the first to finish handed the body back to the
    // solver while the second was still driving it.
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 100, 100, 0, VACUUM);
    w.pin("a", "POS_ANIM");
    w.pin("a", "POS_ANIM");
    w.unpin("a", "POS_ANIM");
    expect(w.isPinned("a")).toBe(true);
    w.unpin("a", "POS_ANIM");
    expect(w.isPinned("a")).toBe(false);
    w.destroy();
  });
```

Add this accessor next to `isAsleep`, for the rotated-part test:

```ts
  /** A body's world-space AABB. Test-facing; the renderer does not need it. */
  boundsOf(id: string): Matter.Bounds | null {
    const rec = this.records.get(id);
    return rec ? rec.body.bounds : null;
  }
```

Marey it on the interface, next to `isAsleep`:

```ts
  /** A body's world-space AABB. Test-facing; the renderer does not need it. */
  boundsOf(id: string): Matter.Bounds | null;
```

Adding a method to `IPhysicsWorld` means every implementer must have it. The only other one is `RecordingWorld` in `sceneRuntime.test.ts` — add there:

```ts
  boundsOf(_id: string): null { return null; }
```

and any fake world in `physicsSync.test.ts`. Run the typechecker; it will name every site.

Note `Matter.Bounds` appears in the interface, so `physicsWorld.ts` already importing `Matter` covers it — but `physicsSync.ts` imports `IPhysicsWorld` as a type only, which is fine.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/compiler/renderer/physicsWorld.test.ts`
Expected: PASS, including every pre-existing test. The polygon path was refactored into `polygonBodyAtBboxCentre` but computes the identical numbers — if a pre-existing polygon or D15 assertion fails, the refactor changed behaviour and must be corrected, not the test.

- [ ] **Step 5: Full suite and typecheck**

Run: `npx tsc -b --noEmit && npm test`
Expected: clean, all green.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/renderer/physicsWorld.ts src/compiler/renderer/physicsWorld.test.ts src/compiler/renderer/sceneRuntime.test.ts
git commit -m "feat(physics): weld compound bodies and unify the reference point

BodyGeometry gains a compound variant built with Body.create({parts}).
addBody now places every geometry's reference point at the given (x, y) and
derives offset = referencePoint - centreOfMass uniformly, which makes D15
the polygon row of a general rule rather than a special case (D16).

Verified against Matter 0.20.0: Detector skips parts[0] when parts.length
> 1, so an L-shaped compound collides concavely rather than on its auto
hull; and setVelocity reads only the parent's deltaTime.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: `builder.ts` flattens a group into a compound

**Files:**
- Modify: `src/compiler/renderer/builder.ts:193-218` (the `group` case), plus the `declare module` block
- Create: `src/compiler/renderer/builder.test.ts`

**One thing to check while you are here.** Task 3's browser verification noticed that a polygon appears to render rotated roughly −90° from what its `points` suggest — a `[(0,-40),(34,22),(-34,22)]` triangle at `rotation: 35` draws apex-left rather than apex-up. That was confirmed to be identical with and without a `physics` block, so it is a drawing-side observation, not an animation-versus-physics divergence, and it is pre-existing rather than caused by this phase. `builder.ts` is the file that would own it. **Investigate far enough to say whether it is real**, and if it is, record it in your report rather than fixing it — a rotation offset in the drawing layer is out of Phase 2's scope and needs its own decision.

- [ ] **Step 1: Write the failing tests**

Create `src/compiler/renderer/builder.test.ts`:

```ts
/**
 * First tests for `builder.ts`.
 *
 * Phase 1's execution notes recorded that this layer needed "a DOM and a
 * PixiJS Application". It does not: PixiJS `Container` and `Graphics`
 * construct and compute `getLocalBounds()` in plain Node under this repo's
 * `environment: "node"` vitest config. Only `Text` needs a canvas, which is
 * why no `text` fixture appears here.
 */
import { describe, it, expect } from "vitest";
import { buildNode } from "./builder";
import type { IRObjectNode, IRObjectProps } from "../sceneIR";
import type { BodyPart } from "./physicsWorld";

const DEG = Math.PI / 180;

function circle(name: string, x: number, y: number, radius: number, over: Partial<IRObjectProps> = {}): IRObjectNode {
  return {
    id: name,
    props: {
      kind: "circle", position: { x, y }, radius, color: "#ff0000",
      rotation: 0, scale: { x: 1, y: 1 }, alpha: 1, z: 0,
      animations: [], sequences: [],
      ...over,
    } as IRObjectProps,
    children: [],
  };
}

function rect(name: string, x: number, y: number, w: number, h: number, over: Partial<IRObjectProps> = {}): IRObjectNode {
  return {
    id: name,
    props: {
      kind: "rectangle", position: { x, y }, width: w, height: h, color: "#ff0000",
      rotation: 0, scale: { x: 1, y: 1 }, alpha: 1, z: 0,
      animations: [], sequences: [],
      ...over,
    } as IRObjectProps,
    children: [],
  };
}

function group(name: string, children: IRObjectNode[], over: Partial<IRObjectProps> = {}): IRObjectNode {
  return {
    id: name,
    props: {
      kind: "group",
      transform: { position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
      alpha: 1, z: 0, animations: [], sequences: [],
      ...over,
    } as IRObjectProps,
    children,
  };
}

function partsOf(node: IRObjectNode): ReadonlyArray<BodyPart> {
  const shape = buildNode(node).__bodyShape;
  if (!shape || shape.kind !== "compound") {
    throw new Error(`expected a compound, got ${shape ? shape.kind : "undefined"}`);
  }
  return shape.parts;
}

describe("builder · group compound geometry", () => {
  it("gives a group one part per child, at the child's own local offset", () => {
    // The defect this replaces: the group got ONE rectangle sized from
    // getLocalBounds() but positioned at the origin, so an asymmetric group's
    // collision box sat 100px from its content.
    expect(partsOf(group("g", [circle("c", 100, 0, 30)]))).toEqual([
      { kind: "circle", radius: 30, x: 100, y: 0 },
    ]);
  });

  it("keeps the group's origin as the parts' frame, not the content's centre", () => {
    const parts = partsOf(group("g", [
      rect("a", -50, 0, 20, 20),
      rect("b", 50, 0, 60, 60),
    ]));
    expect(parts).toEqual([
      { kind: "rectangle", width: 20, height: 20, x: -50, y: 0, angle: 0 },
      { kind: "rectangle", width: 60, height: 60, x: 50, y: 0, angle: 0 },
    ]);
  });

  it("bakes a child's rotation into its part's angle", () => {
    const parts = partsOf(group("g", [
      rect("bar", 0, 0, 100, 10, { rotation: 90 } as Partial<IRObjectProps>),
    ]));
    expect(parts).toHaveLength(1);
    const p = parts[0];
    expect(p.kind).toBe("rectangle");
    if (p.kind !== "rectangle") throw new Error("unreachable");
    expect(p.angle).toBeCloseTo(90 * DEG, 10);
    expect(p.width).toBe(100);
  });

  it("bakes a child's scale into its part's dimensions", () => {
    const parts = partsOf(group("g", [
      rect("r", 0, 0, 40, 20, { scale: { x: 2, y: 3 } } as Partial<IRObjectProps>),
    ]));
    expect(parts).toEqual([
      { kind: "rectangle", width: 80, height: 60, x: 0, y: 0, angle: 0 },
    ]);
  });

  it("uses the mean radius for a non-uniformly scaled circle, since Matter has no ellipse", () => {
    const parts = partsOf(group("g", [
      circle("c", 0, 0, 10, { scale: { x: 2, y: 4 } } as Partial<IRObjectProps>),
    ]));
    expect(parts).toEqual([{ kind: "circle", radius: 30, x: 0, y: 0 }]);
  });

  it("flattens a nested group into the same part list (D18)", () => {
    const parts = partsOf(group("outer", [
      circle("a", 10, 0, 5),
      group("inner", [circle("b", 5, 0, 5)], {
        transform: { position: { x: 100, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
      } as Partial<IRObjectProps>),
    ]));
    expect(parts).toEqual([
      { kind: "circle", radius: 5, x: 10, y: 0 },
      { kind: "circle", radius: 5, x: 105, y: 0 },
    ]);
  });

  it("rotates a nested group's children into the outer group's frame", () => {
    const parts = partsOf(group("outer", [
      group("inner", [circle("b", 10, 0, 5)], {
        transform: { position: { x: 0, y: 0 }, rotation: 90, scale: { x: 1, y: 1 } },
      } as Partial<IRObjectProps>),
    ]));
    expect(parts).toHaveLength(1);
    expect(parts[0].x).toBeCloseTo(0, 10);
    expect(parts[0].y).toBeCloseTo(10, 10);
  });

  it("gives an empty group a compound with no parts", () => {
    // physicsWorld falls back to a unit rectangle; the builder does not guess.
    expect(partsOf(group("g", []))).toEqual([]);
  });

  it("expresses a polygon child's points relative to its own bbox centre", () => {
    // The triangle's bbox centre is (0, -7.5), not its centroid (0, 0) — the
    // same distinction D15 exists to correct.
    const tri: IRObjectNode = {
      id: "t",
      props: {
        kind: "polygon", position: { x: 40, y: 0 },
        points: [{ x: 0, y: -30 }, { x: 26, y: 15 }, { x: -26, y: 15 }],
        color: "#ff0000", rotation: 0, scale: { x: 1, y: 1 }, alpha: 1, z: 0,
        animations: [], sequences: [],
      } as IRObjectProps,
      children: [],
    };
    const parts = partsOf(group("g", [tri]));
    expect(parts).toHaveLength(1);
    const p = parts[0];
    if (p.kind !== "polygon") throw new Error("expected a polygon part");
    expect(p.x).toBe(40);
    expect(p.points.map((q) => ({ x: q.x, y: q.y }))).toEqual([
      { x: 0, y: -22.5 }, { x: 26, y: 22.5 }, { x: -26, y: 22.5 },
    ]);
  });
});

describe("builder · leaf shapes keep their existing geometry", () => {
  it("a circle is still a circle", () => {
    expect(buildNode(circle("c", 0, 0, 12)).__bodyShape).toEqual({ kind: "circle", radius: 12 });
  });

  it("a rectangle is still a rectangle", () => {
    expect(buildNode(rect("r", 0, 0, 30, 40)).__bodyShape).toEqual({
      kind: "rectangle", width: 30, height: 40,
    });
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/compiler/renderer/builder.test.ts`
Expected: FAIL — every group test throws `expected a compound, got rectangle`.

- [ ] **Step 3: Implement the flattening**

In `src/compiler/renderer/builder.ts`, add to the imports at the top:

```ts
import type { BodyGeometry, BodyPart } from "./physicsWorld";
import { compose, IDENTITY, type LocalTransform } from "./transform";
```

(The existing `import type { BodyGeometry } from "./physicsWorld";` line is replaced by the first of these.)

Add these two functions just above `export function buildNode`:

```ts
/**
 * One placed part for a leaf shape, with the child's scale baked into its
 * dimensions and its accumulated rotation carried as `angle`.
 *
 * A group's own scale is deliberately NOT baked in here — it goes through
 * `world.setScale` and `Body.scale`, which scales vertices on each axis
 * independently about a point, exactly as PixiJS does. Baking it here as well
 * would apply it twice.
 */
function placePart(shape: BodyGeometry, t: LocalTransform): BodyPart | null {
  if (shape.kind === "circle") {
    // Matter has no ellipse. A non-uniformly scaled circle collides as a
    // circle of the mean radius; the common uniform case is exact.
    const meanScale = (Math.abs(t.sx) + Math.abs(t.sy)) / 2;
    return { kind: "circle", radius: shape.radius * meanScale, x: t.x, y: t.y };
  }
  if (shape.kind === "rectangle") {
    return {
      kind: "rectangle",
      width: shape.width * Math.abs(t.sx),
      height: shape.height * Math.abs(t.sy),
      x: t.x, y: t.y, angle: t.rot,
    };
  }
  if (shape.kind === "polygon") {
    return {
      kind: "polygon",
      points: shape.points.map((p) => ({ x: p.x * t.sx, y: p.y * t.sy })),
      x: t.x, y: t.y, angle: t.rot,
    };
  }
  // A nested compound is flattened by the caller, never placed whole.
  return null;
}

/**
 * Walk a group's built children and flatten every leaf shape into one part
 * list, in the group's own local space (spec D18).
 *
 * Reads the children's already-computed `__bodyShape`, so there is no second
 * copy of the per-kind geometry mapping to drift out of sync with the switch
 * in `buildNode`. A nested group recurses rather than contributing its own
 * compound, which is what makes nesting need no special case.
 */
function collectBodyParts(container: Container, t: LocalTransform, out: BodyPart[]): void {
  for (const raw of container.children) {
    const child = raw as Container;
    const shape = child.__bodyShape;
    const layout = child.__mareyLayout;
    // A `Graphics` or `Text` leaf inside a shape's wrapper has neither.
    if (!shape || !layout) continue;

    const childT = compose(t, layout.currentPos, child.rotation, layout.currentScale);

    if (shape.kind === "compound") {
      collectBodyParts(child, childT, out);
    } else {
      const part = placePart(shape, childT);
      if (part) out.push(part);
    }
  }
}
```

Replace the `group` case's body-shape lines — currently `builder.ts:210-216`:

```ts
      const groupBounds = wrapper.getLocalBounds();
      wrapper.__baseSize = { w: groupBounds.width, h: groupBounds.height };
      wrapper.__bodyShape = {
        kind: "rectangle",
        width: Math.max(groupBounds.width, 1),
        height: Math.max(groupBounds.height, 1),
      };
```

with:

```ts
      const groupBounds = wrapper.getLocalBounds();
      wrapper.__baseSize = { w: groupBounds.width, h: groupBounds.height };

      // A group welds its children into one compound body (spec 7). The parts
      // are expressed in the group's own local space, so the body's reference
      // point is the group's origin — the same point its pivot sits at, and
      // the same point `position` places (spec D16).
      //
      // What this replaces: a single rectangle SIZED from getLocalBounds() but
      // POSITIONED at the origin. The two disagreed for any group whose
      // children sat asymmetrically around it.
      const parts: BodyPart[] = [];
      collectBodyParts(wrapper, IDENTITY, parts);
      wrapper.__bodyShape = { kind: "compound", parts };
```

Leave `localPivot` at `{ x: 0, y: 0 }`. D16 fixes the body, not the visual: a group's pivot is its local origin, which is documented behaviour and is what gives `use Template() x { position: … }` a stable anchor.

- [ ] **Step 4: Run the builder tests**

Run: `npx vitest run src/compiler/renderer/builder.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Full suite and typecheck**

Run: `npx tsc -b --noEmit && npm test`
Expected: clean, all green.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/renderer/builder.ts src/compiler/renderer/builder.test.ts
git commit -m "feat(renderer): weld a group's children into one compound body

Replaces a single rectangle sized from getLocalBounds() but positioned at
the group's origin — measured 100px adrift for a group with one child at
local (100, 0). Parts are flattened across nested groups (D18) and read
from the children's own __bodyShape, so there is no second copy of the
per-kind geometry mapping.

First tests for builder.ts. Phase 1's notes said this needed a DOM; it does
not — PixiJS Container and Graphics run in plain Node, and only Text needs
a canvas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Ancestor-transform composition in `physicsSync.ts`

**Files:**
- Modify: `src/compiler/renderer/physicsSync.ts` (`bindPhysicsBodies`, `syncWorldToContainers`, `snapContainerToBody`, `flushPendingVelocity`)
- Modify: `src/compiler/renderer/builder.ts` (`declare module` block: add `__bodyTransform`)
- Modify: `src/compiler/renderer/sceneRuntime.ts` (`pushAnimToWorld`)
- Modify: `src/compiler/renderer/physicsSync.test.ts`

This is D17: `physics` inside a group places correctly, provided every ancestor group is static. Task 9's validator rules enforce that precondition.

- [ ] **Step 1: Write the failing tests**

Append to `src/compiler/renderer/physicsSync.test.ts`:

```ts
describe("ancestor transforms (spec D17)", () => {
  it("places a body inside a translated group at its world position", () => {
    // The defect this fixes: a template carrying physics produced one body per
    // instance, all at (0, 0), because the child's LOCAL position was passed
    // through as a scene coordinate.
    const child = physicsChild({ x: 10, y: 20 });
    const g = staticGroup({ x: 400, y: 300, children: [child] });

    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(g), world);

    expect(world.addCalls).toHaveLength(1);
    expect(world.addCalls[0].x).toBeCloseTo(410, 8);
    expect(world.addCalls[0].y).toBeCloseTo(320, 8);
  });

  it("rotates and scales a child's position into the group's frame", () => {
    const child = physicsChild({ x: 10, y: 0 });
    const g = staticGroup({
      x: 100, y: 100, rotation: Math.PI / 2, scale: { x: 2, y: 2 },
      children: [child],
    });

    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(g), world);

    expect(world.addCalls[0].x).toBeCloseTo(100, 8);
    expect(world.addCalls[0].y).toBeCloseTo(120, 8);
    // The body's scale is the composed one, not the child's own.
    expect(world.scaleCalls).toEqual([{ id: "b0", sx: 2, sy: 2 }]);
  });

  it("converts a body's world position back into the child's local space", () => {
    const child = physicsChild({ x: 10, y: 20 });
    const g = staticGroup({ x: 400, y: 300, children: [child] });

    const world = new FakeWorld();
    const bindings = bindPhysicsBodies(asContainer(g), world);
    world.unpin("b0", "NO_RUNNER");
    world.setState("b0", { x: 500, y: 400, angle: 0 });

    syncWorldToContainers(bindings, world, 1);

    expect(child.__mareyLayout!.currentPos.x).toBeCloseTo(100, 8);
    expect(child.__mareyLayout!.currentPos.y).toBeCloseTo(100, 8);
  });

  it("subtracts the ancestor rotation on write-back", () => {
    const child = physicsChild({ x: 0, y: 0 });
    const g = staticGroup({ x: 0, y: 0, rotation: Math.PI / 2, children: [child] });

    const world = new FakeWorld();
    const bindings = bindPhysicsBodies(asContainer(g), world);
    world.unpin("b0", "NO_RUNNER");
    world.setState("b0", { x: 0, y: 0, angle: Math.PI });

    syncWorldToContainers(bindings, world, 1);

    expect(child.rotation).toBeCloseTo(Math.PI / 2, 8);
  });

  it("snapContainerToBody converts through the same transform", () => {
    const child = physicsChild({ x: 0, y: 0 });
    const g = staticGroup({ x: 400, y: 300, children: [child] });

    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(g), world);
    world.setState("b0", { x: 450, y: 360, angle: 0 });

    snapContainerToBody(asContainer(child), world);

    expect(child.__mareyLayout!.currentPos.x).toBeCloseTo(50, 8);
    expect(child.__mareyLayout!.currentPos.y).toBeCloseTo(60, 8);
  });

  it("rotates a parked handoff velocity into world space but does not translate it", () => {
    // A velocity is a direction and a magnitude, so it takes the ancestor's
    // rotation and scale but never its position.
    const child = physicsChild({ x: 0, y: 0 });
    const g = staticGroup({ x: 1000, y: 1000, rotation: Math.PI / 2, children: [child] });

    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(g), world);
    world.unpin("b0", "NO_RUNNER");
    child.__pendingVelocity = { x: 60, y: 0 };

    flushPendingVelocity(asContainer(child), world);

    expect(world.velocityCalls).toHaveLength(1);
    expect(world.velocityCalls[0].vx).toBeCloseTo(0, 8);
    expect(world.velocityCalls[0].vy).toBeCloseTo(60, 8);
  });

  it("leaves a top-level object's placement untouched", () => {
    // Identity transform — which is every object in every scene written before
    // Phase 2, so this is the no-regression case.
    const child = physicsChild({ x: 250, y: 175 });
    const root = makeContainer({ children: [child] });

    const world = new FakeWorld();
    bindPhysicsBodies(asContainer(root), world);

    expect(world.addCalls[0].x).toBe(250);
    expect(world.addCalls[0].y).toBe(175);
    expect(world.scaleCalls).toEqual([{ id: "b0", sx: 1, sy: 1 }]);
  });
});
```

Three additions to the existing fixtures at the top of the file:

**1. `MockContainer` gains the new field.** Add to the interface (after `__body?: string;`):

```ts
  __bodyTransform?: LocalTransform;
```

and add `import type { LocalTransform } from "./transform";` to the imports.

**2. `FakeWorld` gains `boundsOf`**, because Task 6 added it to `IPhysicsWorld` and this class implements the interface in full deliberately, so the compiler catches drift:

```ts
  boundsOf(_id: string): null {
    // Not exercised by physicsSync.
    return null;
  }
```

**3. Two factories**, built on the existing `makeContainer`. Add them next to it:

```ts
/** A static group: no physics, no animations, so it owns no body itself. */
function staticGroup(over: {
  x: number;
  y: number;
  rotation?: number;
  scale?: { x: number; y: number };
  children: MockContainer[];
}): MockContainer {
  return makeContainer({
    rotation: over.rotation ?? 0,
    children: over.children,
    __bodyShape: { kind: "compound", parts: [] },
    __mareyLayout: {
      localPivotX: 0,
      localPivotY: 0,
      currentPos: { x: over.x, y: over.y },
      currentScale: { x: over.scale?.x ?? 1, y: over.scale?.y ?? 1 },
    },
  });
}

/** A leaf that declares physics, so it does own a body. */
function physicsChild(pos: { x: number; y: number }): MockContainer {
  return makeContainer({
    __bodyShape: { kind: "circle", radius: 10 },
    __physics: {
      velocity: { x: 0, y: 0 },
      gravity: { x: 0, y: 980 },
      airDrag: 0,
      bounce: 0.65,
      collideBounds: true,
      duration: 1,
    },
    __mareyLayout: {
      localPivotX: 0,
      localPivotY: 0,
      currentPos: { x: pos.x, y: pos.y },
      currentScale: { x: 1, y: 1 },
    },
  });
}
```

`staticGroup` gives the group an empty compound but no `__physics`, so `hasPhysicsAnywhere` is false for it and each test is about exactly one body.

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/compiler/renderer/physicsSync.test.ts`
Expected: FAIL — the first test reports `x: 10, y: 20` instead of `410, 320`.

- [ ] **Step 3: Marey `__bodyTransform`**

In `src/compiler/renderer/builder.ts`, inside the `declare module "pixi.js"` block, after `__body`:

```ts
    /**
     * The constant transform from this container's local space to the scene's.
     *
     * Set by `bindPhysicsBodies` on any container that owns a body. It is
     * constant for the scene's life because D17's validator rules reject
     * `physics` under a group that animates — which is what keeps it free of
     * `driver.alpha` and so keeps the simulation independent of frame rate.
     */
    __bodyTransform?: LocalTransform;
```

`LocalTransform` is already imported by Task 7's changes to this file.

- [ ] **Step 4: Implement in `physicsSync.ts`**

Add to the imports:

```ts
import { compose, IDENTITY, toWorld, toLocal, rotateScaleVector, type LocalTransform } from "./transform";
```

Add this helper near the top:

```ts
/**
 * The transform from a container's local space to the scene's.
 *
 * Identity for a top-level object, which is every object in every scene
 * written before Phase 2.
 */
export function bodyTransformOf(container: Container): LocalTransform {
  return container.__bodyTransform ?? IDENTITY;
}
```

Replace `bindPhysicsBodies` with:

```ts
export function bindPhysicsBodies(root: Container, world: IPhysicsWorld): PhysicsBinding[] {
  const bindings: PhysicsBinding[] = [];
  let nextId = 0;

  const visit = (container: Container, t: LocalTransform): void => {
    const layout = container.__mareyLayout;

    if (hasPhysicsAnywhere(container) && container.__bodyShape && layout) {
      const id = `b${nextId++}`;
      const params = container.__physics
        ? physicsParamsFromIR(container.__physics)
        : RESTING_PARAMS;

      // A body lives in scene space. A container's currentPos is relative to
      // its parent, so an object inside a group needs its ancestor chain
      // composed in — without which a template's every instance simulates at
      // its LOCAL coordinates (spec D17).
      container.__bodyTransform = t;
      const world_pos = toWorld(t, layout.currentPos.x, layout.currentPos.y);

      world.addBody(
        id,
        container.__bodyShape,
        world_pos.x,
        world_pos.y,
        t.rot + container.rotation,
        params
      );
      world.setScale(id, t.sx * layout.currentScale.x, t.sy * layout.currentScale.y);
      world.pin(id, "NO_RUNNER");

      container.__body = id;
      bindings.push({ id, container });
    }

    if (!layout) {
      // A `Graphics` or `Text` leaf. It has no children that could own a body.
      return;
    }

    const childT = compose(t, layout.currentPos, container.rotation, layout.currentScale);
    for (const child of container.children) {
      visit(child as Container, childT);
    }
  };

  visit(root, IDENTITY);
  return bindings;
}
```

Note the root itself has no `__mareyLayout` — it is the bare `sceneRoot` container from `adapter.ts`. Handle that: the `if (!layout) return;` above would stop the walk at the root. Guard it instead:

```ts
    const childT = layout
      ? compose(t, layout.currentPos, container.rotation, layout.currentScale)
      : t;
    for (const child of container.children) {
      visit(child as Container, childT);
    }
```

and delete the early `return`. Use this version.

Replace `flushPendingVelocity`'s body:

```ts
export function flushPendingVelocity(container: Container, world: IPhysicsWorld): void {
  const id = container.__body;
  const pending = container.__pendingVelocity;
  if (!id || !pending || world.isPinned(id)) return;
  // A velocity is a direction and a magnitude, so it takes the ancestor's
  // rotation and scale but never its translation.
  const v = rotateScaleVector(bodyTransformOf(container), pending.x, pending.y);
  world.setVelocity(id, v.x, v.y);
  container.__pendingVelocity = undefined;
}
```

Replace the body of `syncWorldToContainers`'s loop:

```ts
  for (const { id, container } of bindings) {
    if (world.isPinned(id)) continue;
    const state = world.readState(id, alpha);
    if (!state) continue;
    const layout = container.__mareyLayout;
    if (!layout) continue;
    const t = bodyTransformOf(container);
    const local = toLocal(t, state.x, state.y);
    layout.currentPos.x = local.x;
    layout.currentPos.y = local.y;
    container.rotation = state.angle - t.rot;
    container.__updateLayout?.();
  }
```

And `snapContainerToBody`:

```ts
export function snapContainerToBody(container: Container, world: IPhysicsWorld): void {
  const id = container.__body;
  if (!id) return;
  const state = world.readState(id, 1);
  const layout = container.__mareyLayout;
  if (!state || !layout) return;
  const t = bodyTransformOf(container);
  const local = toLocal(t, state.x, state.y);
  layout.currentPos.x = local.x;
  layout.currentPos.y = local.y;
  container.rotation = state.angle - t.rot;
  container.__updateLayout?.();
}
```

Finally, guard D17's precondition. The composed transform is only constant because the validator rejects `physics` under a moving group; if a later phase relaxes that rule without revisiting this code, the transform goes stale silently rather than failing. Spec §10 lists that as a risk. Thread a flag through `visit`:

```ts
  const visit = (container: Container, t: LocalTransform, movingAncestor: boolean): void => {
```

inside the body-creating branch, before `world.addBody`:

```ts
      if (movingAncestor) {
        // Unreachable via the compiler: TYPE_PHYSICS_IN_PHYSICS_GROUP and
        // TYPE_PHYSICS_IN_ANIMATED_GROUP reject exactly this shape (D17). If it
        // is ever reached, `t` was captured once at bind time and is already
        // stale, so the body simulates somewhere the object is not.
        //
        // Logged rather than thrown: a throw here would blank the preview of a
        // scene that compiled cleanly, and runtime errors have nowhere to go
        // yet (physics spec 12, open risks).
        console.error(
          `[physicsSync] body ${id} sits under a group that moves; its ancestor ` +
          `transform is stale. This should have been a compile error (D17).`
        );
      }
```

and at the recursion site, plus the initial call:

```ts
    const childMoves = movingAncestor
      || (container.__animations?.length ?? 0) > 0
      || (container.__sequences?.length ?? 0) > 0
      || container.__physics !== undefined;

    const childT = layout
      ? compose(t, layout.currentPos, container.rotation, layout.currentScale)
      : t;
    for (const child of container.children) {
      visit(child as Container, childT, childMoves);
    }
  };

  visit(root, IDENTITY, false);
```

Note `childMoves` is computed from the container being *descended through*, so a top-level animated object does not flag itself — only its descendants.

- [ ] **Step 5: Fix `pushAnimToWorld` in `sceneRuntime.ts`**

An animation's `to` is written in the object's local space, so it needs the same conversion.

Add `bodyTransformOf` to the **existing** `./physicsSync` import block in `sceneRuntime.ts` (do not add a second import statement from the same module — `verbatimModuleSyntax` is fine with it but the linting intent is one block per module), and add a new import for the transform helper:

```ts
import {
  bindPhysicsBodies,
  bodyTransformOf,
  cullEscapedBodies,
  pinBody,
  physicsParamsFromIR,
  snapContainerToBody,
  syncWorldToContainers,
  unpinBody,
  CULL_MARGIN,
  type PhysicsBinding,
} from "./physicsSync";
import { toWorld } from "./transform";
```

and change the `position` branch of `pushAnimToWorld`:

```ts
    if (ra.anim.property === "position") {
      const startPt = ra.startVal as IRPoint;
      const targetPt = ra.targetVal as IRPoint;
      // The animation's endpoints are in the container's local space; the world
      // wants scene space (spec D17).
      const p = toWorld(
        bodyTransformOf(ra.container),
        lerp(startPt.x, targetPt.x, e),
        lerp(startPt.y, targetPt.y, e)
      );
      this.world.setPosition(id, p.x, p.y);
    } else if (ra.anim.property === "rotation") {
```

And the `scale` branch must compose too:

```ts
    } else if (ra.anim.property === "scale") {
      const startPt = ra.startVal as IRPoint;
      const targetPt = ra.targetVal as IRPoint;
      const t = bodyTransformOf(ra.container);
      this.world.setScale(
        id,
        t.sx * lerp(startPt.x, targetPt.x, e),
        t.sy * lerp(startPt.y, targetPt.y, e)
      );
    }
```

And the `rotation` branch. **Keep the `completedThisTick` guard and its comment** — they are Task 3's fix for a defect that permanently locked a body's angle, and dropping them silently reverts it. The only change is adding the ancestor rotation:

```ts
    } else if (ra.anim.property === "rotation") {
      // Unlike position and scale, the angle override is a LATCH: step()
      // re-applies it every tick until something clears it. `tickAnim` cleared
      // it on the completion tick, and re-arming it even once would re-lock the
      // body's angle for the rest of the scene, because this runner is spliced
      // in the paint phase and nothing would ever clear it again.
      if (completedThisTick) return;
      const deg = lerp(ra.startVal as number, ra.targetVal as number, e);
      this.world.overrideAngle(id, bodyTransformOf(ra.container).rot + deg * (Math.PI / 180));
    }
```

If `leaves the angle released after a rotation animation finishes` goes red while you work on this task, you dropped the guard. Restore it — do not edit the test.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/compiler/renderer/physicsSync.test.ts src/compiler/renderer/sceneRuntime.test.ts`
Expected: PASS. The pre-existing `physicsSync` tests all use top-level containers, where the transform is identity, so none should change.

- [ ] **Step 7: Full suite and typecheck**

Run: `npx tsc -b --noEmit && npm test`
Expected: clean, all green.

- [ ] **Step 8: Commit**

```bash
git add src/compiler/renderer/physicsSync.ts src/compiler/renderer/physicsSync.test.ts src/compiler/renderer/builder.ts src/compiler/renderer/sceneRuntime.ts
git commit -m "fix(physics): place bodies inside groups at their world position

A physics block inside any group had its LOCAL position passed through as a
scene coordinate, and world coordinates written back into the same local
field. A template carrying physics produced one body per instance, all at
(0, 0), while the instances drew correctly elsewhere.

bindPhysicsBodies now composes the ancestor chain and stores it as
__bodyTransform; write-back, handoff velocity and the animation push all
convert through it. The transform is constant because D17's validator rules
reject physics under a group that animates, which is what keeps it free of
driver.alpha.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Validator rules

**Files:**
- Modify: `src/compiler/typeChecker/validator.ts:181-195` (the `physics` block)
- Create: `src/compiler/typeChecker/validator.test.ts` (the typeChecker directory has no tests today)

- [ ] **Step 1: Write the failing tests**

`src/compiler/typeChecker/` currently holds only `builder.ts`, `index.ts`, `resolvers.ts` and `validator.ts` — there is no test file. Create `src/compiler/typeChecker/validator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";

function errorsFor(source: string): string[] {
  const { ast, errors } = parse(lex(source));
  if (errors.length > 0) return errors.map((e) => e.message);
  const { errors: typeErrors } = typeCheck(ast!);
  return typeErrors.map((e) => e.message);
}

describe("physics inside a group (spec D17)", () => {
  it("rejects physics on a child of a physics group", () => {
    const out = errorsFor(`
      scene {
        size: (800, 600)
        group logo {
          position: (400, 300)
          physics { gravity: (0, 900), duration: 2 }
          circle dot {
            position: (0, 0)
            radius: 10
            physics { gravity: (0, 900), duration: 2 }
          }
        }
      }
    `);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_PHYSICS_IN_PHYSICS_GROUP");
    expect(out[0]).toContain("logo");
  });

  it("rejects physics on a child of an animated group", () => {
    const out = errorsFor(`
      scene {
        size: (800, 600)
        group row {
          position: (100, 100)
          animate { property: position, to: (400, 100), duration: 1 }
          circle dot {
            position: (0, 0)
            radius: 10
            physics { gravity: (0, 900), duration: 2 }
          }
        }
      }
    `);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_PHYSICS_IN_ANIMATED_GROUP");
    expect(out[0]).toContain("row");
  });

  it("rejects physics reached through a sequence inside a physics group", () => {
    const out = errorsFor(`
      scene {
        size: (800, 600)
        group logo {
          position: (400, 300)
          physics { gravity: (0, 900), duration: 2 }
          circle dot {
            position: (0, 0)
            radius: 10
            sequence {
              animate { property: alpha, to: 0.5, duration: 0.5 }
              physics { gravity: (0, 900), duration: 2 }
            }
          }
        }
      }
    `);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_PHYSICS_IN_PHYSICS_GROUP");
  });

  it("rejects physics nested two groups deep under an animated ancestor", () => {
    const out = errorsFor(`
      scene {
        size: (800, 600)
        group outer {
          position: (100, 100)
          animate { property: rotation, to: 90, duration: 1 }
          group inner {
            position: (10, 10)
            circle dot {
              position: (0, 0)
              radius: 10
              physics { gravity: (0, 900), duration: 2 }
            }
          }
        }
      }
    `);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("TYPE_PHYSICS_IN_ANIMATED_GROUP");
    expect(out[0]).toContain("outer");
  });

  it("allows physics under a static group", () => {
    expect(errorsFor(`
      scene {
        size: (800, 600)
        group layout {
          position: (400, 300)
          circle dot {
            position: (0, 0)
            radius: 10
            physics { gravity: (0, 900), duration: 2 }
          }
        }
      }
    `)).toEqual([]);
  });

  it("allows physics inside a template, whose use wrapper is a static group", () => {
    expect(errorsFor(`
      template Ball(tone) {
        circle b {
          position: (0, 0)
          radius: 12
          color: tone
          physics { gravity: (0, 900), duration: 2 }
        }
      }
      scene {
        size: (800, 600)
        generate i from 0 to 2 {
          use Ball(cyan) ball { position: (200 + i * 100, 80) }
        }
      }
    `)).toEqual([]);
  });

  it("allows physics on the group itself", () => {
    expect(errorsFor(`
      scene {
        size: (800, 600)
        group logo {
          position: (400, 300)
          physics { gravity: (0, 900), duration: 2 }
          circle dot { position: (0, 0), radius: 10 }
          rectangle bar { position: (30, 0), size: (40, 10) }
        }
      }
    `)).toEqual([]);
  });

  it("allows animate on a child of a physics group (D18: visual-only, not an error)", () => {
    expect(errorsFor(`
      scene {
        size: (800, 600)
        group logo {
          position: (400, 300)
          physics { gravity: (0, 900), duration: 2 }
          circle dot {
            position: (0, 0)
            radius: 10
            animate { property: alpha, to: 0.4, duration: 1, loop: true, yoyo: true }
          }
        }
      }
    `)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/compiler/typeChecker/validator.test.ts`
Expected: FAIL — the four rejection tests get `[]` because no such rule exists.

- [ ] **Step 3: Implement**

In `src/compiler/typeChecker/validator.ts`, inside `if (typeName === "physics") { ... }` — after the existing `parentType === "scene"` check and before the `duration` check — insert:

```ts
      // D17: a body inside a group needs its ancestor chain composed in at
      // bind time, which is only sound while that chain is constant. A group
      // that declares physics welds its children into its own body instead, and
      // a group that animates would make the composed transform stale.
      //
      // `ancestors` is every enclosing object, so a physics block reached
      // through a `sequence` or `parallel` is covered by the same walk.
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const anc = ancestors[i];
        if (anc.type !== "group") continue;

        const ancHasPhysics = anc.children.some((c) => c.type === "physics");
        const ancAnimates = anc.children.some(
          (c) => c.type === "animate" || c.type === "sequence"
        );

        if (ancHasPhysics) {
          errors.push({
            phase: "TYPE",
            message: `[TYPE_PHYSICS_IN_PHYSICS_GROUP] Group '${anc.name}' already declares physics, so its children are welded into its body and cannot simulate separately. Remove this 'physics' block.`,
            line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol,
          });
          break;
        }
        if (ancAnimates) {
          errors.push({
            phase: "TYPE",
            message: `[TYPE_PHYSICS_IN_ANIMATED_GROUP] Group '${anc.name}' is animated, so a physics body inside it cannot be placed deterministically. Move the 'physics' block onto '${anc.name}', or remove its animation.`,
            line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol,
          });
          break;
        }
      }
```

The loop runs innermost-first and `break`s on the first offending group, so a physics block nested under two bad groups reports one error rather than two.

`ancestors` is already a parameter of `checkNode` (`validator.ts:56`) and is already threaded correctly by both recursion sites — nothing else needs changing.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/compiler/typeChecker/validator.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Full suite and typecheck**

Run: `npx tsc -b --noEmit && npm test`
Expected: clean, all green.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/typeChecker/validator.ts src/compiler/typeChecker/validator.test.ts
git commit -m "feat(validator): reject physics under a physics or animated group

Spec 7 asked for the first rule. The second is what makes D17's
ancestor-transform composition sound: it is only constant while the chain
does not animate.

A static chain is still allowed, so a template can carry physics — which is
the case that was silently placing every instance at (0, 0).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: `docs/LANGUAGE.md` and its behavioural assertions

**Files:**
- Modify: `docs/LANGUAGE.md` (the collision-shape paragraph in "Physics"; a new subsection)
- Modify: `src/compiler/languageDocs.test.ts`

The reference currently says a group "gets a single rectangle spanning the bounding box of everything inside it." That is true today and is exactly what this phase replaces. Because the change is **semantic with no syntax change**, `languageDocs.test.ts` stays green while the prose goes false — which is why the new claims need assertions, not just an edit.

- [ ] **Step 1: Update the collision-shape paragraph**

In `docs/LANGUAGE.md`, find the paragraph beginning "The collision shape a body gets depends on the object's kind" (around line 423). Replace the `group` clause. The paragraph becomes:

```markdown
The collision shape a body gets depends on the object's kind: `circle` gets a
circle at its declared radius; `rectangle` gets a rectangle at its declared
size; `text` gets a rectangle sized to the rendered text's bounding box;
`line` gets a rectangle spanning its points' bounding box, widened to at
least its `thickness`. **`polygon` gets the convex hull of its points, not its
exact outline** — a concave polygon collides as its hull, even though it is
drawn with its true, concave shape.

**A `group` with a `physics` block is welded into a single body made of one
shape per object inside it**, each at its own offset and angle within the
group. A multi-part logo therefore tumbles as one rigid object rather than
colliding as a single rectangle around everything. Because the parts are
separate, a concave arrangement collides concavely: a ball dropped into the
notch of an L-shaped group falls into the notch rather than resting on top of
it.

**The group's own origin is the point the body is placed at** — the same point
`position` sets and the same point `rotation` turns about. That holds even
when the group's contents sit entirely to one side of it, so a group whose
children are all offset still rotates about its declared origin rather than
about the middle of its contents.
```

- [ ] **Step 2: Add a subsection on physics and groups**

Immediately after the paragraphs above, insert:

```markdown
### Physics and groups

`physics` may be declared on a `group`, or on an object inside a group, but
not both — and not inside a group that moves.

- A `physics` block on an object whose enclosing `group` also declares
  `physics` is a compile error (`TYPE_PHYSICS_IN_PHYSICS_GROUP`). The group's
  children are already welded into its body; they cannot also simulate
  separately.
- A `physics` block on an object inside a group that has an `animate` or
  `sequence` block is a compile error (`TYPE_PHYSICS_IN_ANIMATED_GROUP`). The
  object's position in the scene would depend on where its moving parent
  happens to be, which cannot be resolved to a fixed simulation coordinate.

Inside a **static** group — one with no `animate`, `sequence` or `physics` of
its own — `physics` on a child works normally, and the child's position is
interpreted relative to the group as everywhere else. This includes the group
that a `use` expansion wraps around a template, so a template may carry a
`physics` block:

```marey
template Ball(tone) {
  circle b {
    position: (0, 0)
    radius: 12
    color: tone
    physics {
      gravity: (0, 900)
      bounce: 0.5
      collideBounds: true
      duration: indefinitely
    }
  }
}

scene {
  size: (800, 600)
  background: #0a0e1a

  generate i from 0 to 4 {
    use Ball(cyan) ball { position: (160 + i * 120, 80) }
  }
}
```

**An `animate` block on an object inside a physics group moves only the
drawing, not the collision shape.** The welded body is built once from where
the group's contents sit at the start, so an element that pulses or spins
inside a tumbling logo keeps its original part in the body. This is intended —
it allows a logo to tumble as one rigid object while something inside it
animates — but it means a large animation inside a physics group will drift
visibly away from what the object actually collides with.
```

- [ ] **Step 3: Add a compiled example of a welded group**

Immediately after the subsection above, add:

```markdown
```marey
scene {
  size: (800, 600)
  background: #0a0e1a

  group logo {
    position: (400, 120)
    rotation: 15

    rectangle stem  { position: (0, 0),    size: (24, 120), color: cyan }
    rectangle armTop{ position: (34, -40), size: (48, 24),  color: magenta }
    rectangle armMid{ position: (28, 10),  size: (36, 24),  color: magenta }

    physics {
      gravity: (0, 900)
      bounce: 0.35
      collideBounds: true
      duration: indefinitely
    }
  }
}
```
```

- [ ] **Step 4: Write the behavioural assertions**

Append to `src/compiler/languageDocs.test.ts`:

```ts
import { buildNode } from "./renderer/builder";
import { MatterWorld } from "./renderer/physicsWorld";

/** Build the IR for a source string, failing loudly on any compile error. */
function irFor(source: string) {
  const { ast, errors } = parse(lex(source));
  expect(errors).toEqual([]);
  const { errors: typeErrors, ir } = typeCheck(ast!);
  expect(typeErrors).toEqual([]);
  return ir!;
}

describe("LANGUAGE.md · Physics · the collision shape a group gets", () => {
  it("welds one part per object inside the group, not a single rectangle", () => {
    const ir = irFor(`
      scene {
        size: (800, 600)
        group logo {
          position: (400, 120)
          rectangle stem   { position: (0, 0),    size: (24, 120) }
          rectangle armTop { position: (34, -40), size: (48, 24) }
          physics { gravity: (0, 900), duration: 2 }
        }
      }
    `);
    const shape = buildNode(ir.registry["scene.logo"]).__bodyShape;
    expect(shape).toEqual({
      kind: "compound",
      parts: [
        { kind: "rectangle", width: 24, height: 120, x: 0, y: 0, angle: 0 },
        { kind: "rectangle", width: 48, height: 24, x: 34, y: -40, angle: 0 },
      ],
    });
  });

  it("places the body at the group's own origin, not at the middle of its contents", () => {
    // Every child sits to the right of the origin, so the two differ. The
    // reference point must be the origin: that is what `position` sets and
    // what `rotation` turns about.
    const ir = irFor(`
      scene {
        size: (800, 600)
        group off {
          position: (200, 300)
          rectangle a { position: (100, 0), size: (20, 20) }
          rectangle b { position: (200, 0), size: (20, 20) }
          physics { gravity: (0, 0), duration: 2 }
        }
      }
    `);
    const shape = buildNode(ir.registry["scene.off"]).__bodyShape!;
    const world = new MatterWorld(800, 600);
    world.addBody("g", shape, 200, 300, 0, {
      gravityX: 0, gravityY: 0, airDrag: 0, bounce: 0, collideBounds: true,
    });
    const state = world.readState("g", 1)!;
    expect(state.x).toBeCloseTo(200, 6);
    expect(state.y).toBeCloseTo(300, 6);
    world.destroy();
  });
});

describe("LANGUAGE.md · Physics · Animation and physics together", () => {
  it("a finished rotation animation hands the angle back to the solver", () => {
    // The reference says "When an animation finishes, the object returns to
    // full physics control on whichever property the animation was driving."
    // That was false until Phase 2 (see Task 3): the override was re-armed on
    // the completion tick and never cleared, locking the angle for good.
    const VACUUM = {
      gravityX: 0, gravityY: 0, airDrag: 0, bounce: 0, collideBounds: true,
    };
    const world = new MatterWorld(800, 600);
    world.addBody("a", { kind: "rectangle", width: 40, height: 40 }, 400, 300, 0, VACUUM);

    // Held: the override wins over the solver.
    world.overrideAngle("a", Math.PI);
    world.step();
    expect(world.readState("a", 1)!.angle).toBeCloseTo(Math.PI, 6);

    // Released: nothing forces the angle any more, so a spin is not undone.
    world.overrideAngle("a", null);
    world.setVelocity("a", 0, 0);
    world.step();
    const free = world.readState("a", 1)!.angle;
    world.step();
    expect(world.readState("a", 1)!.angle).toBeCloseTo(free, 6);
    world.destroy();
  });
});

describe("LANGUAGE.md · Physics · Physics and groups", () => {
  function typeErrorsFor(source: string): string[] {
    const { ast, errors } = parse(lex(source));
    expect(errors).toEqual([]);
    return typeCheck(ast!).errors.map((e) => e.message);
  }

  it("TYPE_PHYSICS_IN_PHYSICS_GROUP fires on a child of a physics group", () => {
    const out = typeErrorsFor(`
      scene {
        size: (800, 600)
        group logo {
          position: (400, 300)
          physics { gravity: (0, 900), duration: 2 }
          circle dot { position: (0, 0), radius: 10, physics { duration: 2 } }
        }
      }
    `);
    expect(out.join("\n")).toContain("TYPE_PHYSICS_IN_PHYSICS_GROUP");
  });

  it("TYPE_PHYSICS_IN_ANIMATED_GROUP fires on a child of an animated group", () => {
    const out = typeErrorsFor(`
      scene {
        size: (800, 600)
        group row {
          position: (100, 100)
          animate { property: position, to: (400, 100), duration: 1 }
          circle dot { position: (0, 0), radius: 10, physics { duration: 2 } }
        }
      }
    `);
    expect(out.join("\n")).toContain("TYPE_PHYSICS_IN_ANIMATED_GROUP");
  });

  it("a child's animate inside a physics group is allowed, and is visual-only", () => {
    // D18. The welded body is built from the group's layout at build time, so
    // the animating child's part is fixed where it started.
    const ir = irFor(`
      scene {
        size: (800, 600)
        group logo {
          position: (400, 300)
          physics { gravity: (0, 900), duration: 2 }
          circle dot {
            position: (40, 0)
            radius: 10
            animate { property: position, to: (200, 0), duration: 1, loop: true, yoyo: true }
          }
        }
      }
    `);
    const shape = buildNode(ir.registry["scene.logo"]).__bodyShape;
    expect(shape).toEqual({
      kind: "compound",
      parts: [{ kind: "circle", radius: 10, x: 40, y: 0 }],
    });
  });
});
```

Note the `registry` keys are scope-qualified — `"scene.logo"`, not `"logo"` (`builder.ts:288`), as the existing `generate` assertion in this file already records.

- [ ] **Step 5: Run the docs tests**

Run: `npx vitest run src/compiler/languageDocs.test.ts`
Expected: PASS. Every `marey` fence in `LANGUAGE.md` still compiles, including the two new ones, and the five new assertions pass.

If the new `use Ball(cyan)` example fails to compile, check that `cyan` is being passed as a template argument and not used as a `def` name — named colours lex as their own token type.

- [ ] **Step 6: Full suite and typecheck**

Run: `npx tsc -b --noEmit && npm test`
Expected: clean, all green.

- [ ] **Step 7: Commit**

```bash
git add docs/LANGUAGE.md src/compiler/languageDocs.test.ts
git commit -m "docs(language): a physics group is welded, not a bounding box

The reference said a group 'gets a single rectangle spanning the bounding
box of everything inside it'. That was true and is now false, and because
the change is semantic with no syntax change the compiled-examples test
would have stayed green while the prose rotted.

Five behavioural assertions lock the new claims: the compound's parts, the
reference point at the group's origin, both new compile errors, and D18's
visual-only child animation.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Browser verification and the eval re-run

**Files:**
- Create: `tools/visual-check/scenes/logo.marey`
- Create: `tools/visual-check/scenes/logo-freeze.marey`
- Modify: `tools/visual-check/SKILL.md` (the scenes table)

The headless suite cannot see a canvas. "A multi-part logo tumbles as one coherent object instead of exploding" is what spec §7 says this phase ships, and only this can check it.

- [ ] **Step 1: Write the tumbling logo scene**

Create `tools/visual-check/scenes/logo.marey`:

```marey
// Phase 2: a multi-part group welded into one compound body.
// The three bars must stay rigidly attached as the logo tumbles and lands.
// Before compound groups this collided as one rectangle around all of them.
scene {
  size: (800, 600)
  background: #0a0e1a

  rectangle ledge {
    position: (400, 520)
    size: (420, 24)
    color: #334155
    physics {
      gravity: (0, 0)
      duration: 12
      collideBounds: true
    }
  }

  group logo {
    position: (360, 90)
    rotation: 18

    rectangle stem   { position: (0, 0),    size: (26, 130), color: cyan }
    rectangle armTop { position: (38, -46), size: (52, 26),  color: magenta }
    rectangle armMid { position: (30, 12),  size: (40, 26),  color: magenta }

    physics {
      gravity: (0, 900)
      bounce: 0.3
      airDrag: 0.004
      collideBounds: true
      duration: indefinitely
    }
  }
}
```

The `ledge` carries a `physics` block with zero gravity and a long duration so it becomes a static obstacle — per D13 an object without `physics` is not a collider at all, so a bare rectangle would be a ghost and the logo would fall straight past it.

- [ ] **Step 2: Write the mid-motion determinism scene**

Create `tools/visual-check/scenes/logo-freeze.marey`:

```marey
// Phase 2 determinism, checked mid-tumble rather than at rest.
// A settled pile converges on the same fixed point even when the trajectory
// diverged, so at-rest equality hides real non-determinism — that is how the
// f9de4a9 bug survived four clean settling scenes in Phase 1.
// `duration: 0.9` freezes this logo in mid-air, part-way through a rotation.
scene {
  size: (800, 600)
  background: #0a0e1a

  group logo {
    position: (300, 80)
    rotation: 10

    rectangle stem   { position: (0, 0),    size: (26, 130), color: cyan }
    rectangle armTop { position: (38, -46), size: (52, 26),  color: magenta }

    physics {
      gravity: (0, 900)
      velocity: (140, 0)
      collideBounds: false
      duration: 0.9
    }
  }
}
```

- [ ] **Step 3: Run the checks**

With the dev server running. **Start it as `npx vite --port 5199 --strictPort`, or read the port it prints and append `--url http://localhost:<port>` to every `check.mjs` call below.** Without `--strictPort`, vite silently walks forward to 5200, 5201… when 5199 is taken, while `check.mjs` still defaults to 5199 — so the capture can hit a stale pre-existing server and report a confident pass without ever exercising your code. This happened during Task 1.

```bash
node tools/visual-check/check.mjs \
  --scene tools/visual-check/scenes/logo.marey \
  --at 300,900,1800 --settle 9000 --out .visual-check/t9-logo

node tools/visual-check/check.mjs \
  --scene tools/visual-check/scenes/logo-freeze.marey \
  --settle 5000 --out .visual-check/t9-logo-freeze
```

Expected for `logo`: `compiled: true`, `rendered: true`, `deterministic: true`, `frozen at rest: true`, `cpu at rest` near zero.

**Read the PNGs with the Read tool. The numbers are a safety net; the images are the point.** What to look for, in order:

1. The three bars stay rigidly attached through every capture. If they separate and fall independently, the welding is not happening — check that `__bodyShape` reached `addBody` as a compound.
2. The logo lands *on* the ledge, resting at an angle if it landed on a corner. If it sinks through, the ledge's body is missing.
3. The drawn bars sit on the collision shape, not beside it. A rigid group drifting a constant offset from where it collides means the reference point is wrong — that is the D16 defect reappearing.

Expected for `logo-freeze`: `deterministic: true`. This is the strongest check available, because the capture lands on a transient state part-way through a rotation, where any divergence is visible rather than absorbed by a settle.

- [ ] **Step 4: Record the scenes in the skill**

In `tools/visual-check/SKILL.md`, add two rows to the scenes table:

```markdown
| `logo.marey` | A multi-part group welds into one compound body and tumbles rigidly (Phase 2, D16) |
| `logo-freeze.marey` | The same logo frozen mid-tumble — determinism on a transient state, not at rest |
```

- [ ] **Step 5: Re-run the authorability eval**

```bash
EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts
```

Expected: no regression against `eval/RESULTS-R2.md`. No scene in either corpus places `physics` inside a group, so nothing should change. If something does, that is a real regression and must be understood before proceeding.

- [ ] **Step 6: Commit**

```bash
git add tools/visual-check/scenes/logo.marey tools/visual-check/scenes/logo-freeze.marey tools/visual-check/SKILL.md
git commit -m "test(visual): add compound-group tumble and mid-motion determinism scenes

logo.marey checks the headline behaviour spec 7 promises — a multi-part
logo tumbling as one rigid object. logo-freeze.marey checks determinism on
a transient state rather than at rest, per Phase 1's finding that a settled
pile converges even when the trajectory diverged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: Execution notes and roadmap update

**Files:**
- Modify: `docs/plans/2026-08-27-phase-2-compound-groups.md` (this file — add "Execution notes")
- Modify: `AGENTS.md` (Roadmap, Renderer, and Non-obvious gotchas sections)

Every plan in `docs/plans/` carries an "Execution notes" section recording defects found during execution and issues deliberately deferred. The next phase reads it before starting.

- [ ] **Step 1: Write the execution notes**

Append an `## Execution notes` section to this file, following the structure Phase 1's plan uses: **Defects in this plan**, **Bugs found by review**, **Gaps left open deliberately**. Record, at minimum:

- Anything in this plan that turned out to be wrong when executed. Phase 1's notes record three such defects; this plan has at least these:
  - **Task 3 Step 6's premise was false**, and because the step told the implementer to use the Step 7 commit message verbatim, **commit `25c655b`'s message asserts "The default scene changes: stepper now tumbles", which is untrue.** `stepper` lands flat and always did — a symmetric flat contact has no torque. The claim came from physics spec §6.11, which had been stale since `91172b1` corrected the scene's own comment. §6.11 is now fixed in place. Record the bad commit message explicitly: it cannot be rewritten without rewriting history, so the note is the only correction that will be found later.
  - The browser steps originally said `npx vite --port 5199` without `--strictPort`. Vite walks forward silently when the port is taken while `check.mjs` keeps defaulting to 5199, so a stale server can absorb every capture and report a confident false pass. Found during Task 1, fixed in the plan, and it then happened again in Task 3 (both 5199 and 5200 were stale).
  - `--at 300` samples before the renderer initialises (~900–1100 ms), so that frame is not a reproducible oracle even on unmodified code.
  - **Task 9's Step 3 code would have banned the entire feature.** Its ancestor loop started at `ancestors.length - 1`, but for a `physics` block that is a direct child of a group, the innermost ancestor *is that group* — so a group's own `physics` block matched `anc.children.some(c => c.type === "physics")` and flagged itself. As written, `TYPE_PHYSICS_IN_PHYSICS_GROUP` fired on every compound group, which is the thing Phase 2 exists to build, and both rejection tests double-reported. Fixed during execution by walking back past any `sequence`/`parallel` wrapper to the owning renderable object and scanning strictly above it — which also correctly permits a group whose own `physics` sits inside a `sequence` (legal per D13). Caught only because the plan included two "this must still be allowed" tests; a plan with only rejection tests would have shipped it.
  - **Task 6's `deltaTime` test used `VACUUM`, which has `collideBounds: true`.** At 600 px/s from x=400 the body reached the right wall well inside the one-second window and stopped dead against it at x=780, which reads exactly like a broken velocity conversion. The assertion, not the implementation, was wrong.
  - Task 5's expected failure text was `Failed to resolve import "./transform"`; vitest 4 words it `Cannot find module`. Same failure, different wording.
- Whether `visual-check` found anything the headless suite missed, which it did in Phase 1.
- The two caveats §5.4 of the spec records but does not fix: a circle *part*'s stale `circleRadius` under non-uniform scale, and `Body.scale` fighting `setStatic`'s `_original` mass snapshot. Both are pre-existing and equally true of single bodies.
- The shear approximation from spec §5.3: a rotated child beneath a nested group carrying non-uniform scale collides unsheared.
- That `adapter.ts` is now thin but still has no direct tests of its own — `SceneRuntime` carries the coverage, and what remains in `adapter.ts` is PixiJS lifecycle and `sceneFit` layout, which genuinely does need a DOM.

- [ ] **Step 2: Update `AGENTS.md`**

Three edits:

**Roadmap** — change the Phase 2 line:

```markdown
- **Phase 2 — compound groups: done** on `phase-2-compound-groups`. A `group`
  with `physics` welds its children into one Matter compound body. Adds
  decisions D16–D18 and fixes two live defects §7 did not anticipate: a group's
  collision box was positioned at its origin while sized from its children's
  extent, and any `physics` block inside any group simulated at local
  coordinates read as scene coordinates — so a `template` carrying physics
  placed every instance at `(0, 0)`.
- Phases 3–6: the property-table unification, new physics syntax, export
  (incl. baked-keyframe Lottie), motion-graphics core.
```

**Renderer** — the paragraph currently says `adapter.ts` "owns the PixiJS app, the ticker, and the runner lifecycle." Correct it, and correct the group-pivot sentence at the end of that section:

```markdown
`renderer/adapter.ts` owns the PixiJS app, the ticker and `sceneFit` layout.
`renderer/sceneRuntime.ts` owns the runner lifecycle — the tick phase, the
paint phase, and the idle test — and, like the modules below it, imports
`pixi.js` for types only. Lifting it out of `render()`'s closure is what gives
Phase 5's export driver something to call: `advanceOneTick()` takes no time
argument, and now nothing but a caller stands between it and a bare loop.
```

and, in the `builder.ts` paragraph:

```markdown
A `group`'s pivot is its local origin (`builder.ts:199`) and is never derived
from where its children sit — that is deliberate (D16), and its collision body
is now placed to match rather than the other way round. A group with `physics`
gets a **compound** body, one part per shape inside it, flattened across nested
groups.
```

**Non-obvious gotchas** — add:

```markdown
- **`physics` inside a group is only legal under a *static* group.** D17: the
  ancestor transform is composed once at bind time and stored as
  `__bodyTransform`, which is only sound while that chain does not move. Two
  validator rules enforce it. A `use` expansion wraps its template in a group,
  so this is what decides whether a template may carry physics.
- **A compound's collision uses its parts, not its hull.** Matter's `Detector`
  skips `parts[0]` when `parts.length > 1`, so an L-shaped group collides
  concavely — even though §3 of the physics spec cut concave decomposition for
  single shapes.
```

- [ ] **Step 3: Verify the whole thing one last time**

Run: `npx tsc -b --noEmit && npm test`
Expected: clean, all green.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-08-27-phase-2-compound-groups.md AGENTS.md
git commit -m "docs: record Phase 2 execution notes and update the roadmap

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Execution notes

Phase 2 shipped what §7 promised — a multi-part logo tumbles as one coherent
object — and found four live defects on the way, none of which §7 anticipated.
Three of the four were in the tick/paint seam, which is the same place all three
of Phase 1's review bugs lived.

Final state: **187 tests** (from 121), `tsc -b` clean, `npm run build` clean,
both `.eval` corpora reproducing their committed baselines byte for byte.

### Defects found in the code, beyond the plan's scope

Listed in the order they surfaced, because the order is the point: each was
found by the tests written for the previous one.

**1. A `rotation` animation permanently locked a physics object's angle.** Found
while writing Task 2's tests. `tickAnim` released the angle override on the
completion tick and `pushAnimToWorld` re-armed it on that same tick, over the
same not-yet-spliced list; the runner was then spliced in the paint phase and
nothing ever cleared it, so `step()` forced `Body.setAngle` to the animation's
final value for the rest of the scene. Measured on a square dropped off-centre
onto a ledge: 20.00° after impact — the animation's own `to`, i.e. no rotation
at all — against −269.19° with the fix. This is the **fourth** instance of the
rotation-override family; Phase 1's notes record the third.

**2. A completed `position` animation kept pushing for the rest of a catch-up
burst.** Found by the code-quality review of Task 1. `LiveDriver` advances up to
12 ticks per frame, and a runner is not spliced until paint, so a 6-tick
animation inside a 12-tick burst produced **12 `setPosition` calls** — the last
six writing the endpoint after the body had been unpinned. How many stale pushes
occur depends on how many ticks the frame absorbed.

**3. An animation's start value was read from paint-phase state.** Found by
mutation-testing Task 3. `spawnAnim` seeds `startVal` from `getCurrentVal`,
which reads `currentPos`, `rotation` and `alpha` — all last written by the paint
phase at the driver's wall-clock alpha — and that value flows straight into
`world.setPosition`. Measured on a two-step position sequence over an identical
40 ticks: at 1-tick frames the second animation continues from 120, at 7-tick
frames it restarts from 8, dragging the body ~110px backwards.

**4. Pin reasons collapsed duplicate holds.** Found by the same review.
`pinReasons` was a `Set`, so two `animate position` blocks on one object took one
hold and the first to finish handed the body back to the solver while the second
was still driving it. Now a `Map<PinReason, number>`. This also turned up
`__kinematicPosAnimCount`, built to count exactly this, read nowhere in `src/`,
and by now looking live — deleted, all four sites.

**The pattern worth carrying forward.** Defects 2 and 3 are both "a wall-clock-
derived value reached the physics world", and **neither has `driver.alpha`
anywhere in its call chain**. Invariant 3 as written in `AGENTS.md` names alpha
specifically, so reading it literally prevented neither. It has been restated as
*nothing fed into the physics world may derive from the wall clock*, of which
alpha is one instance, burst length another, and paint-phase state a third.

The test shape that catches this class is a **frame-pacing harness**: run the
same scene for an identical number of ticks at 1, 7 and 12 ticks per frame and
require the world to see identical calls. It exists now
(`sceneRuntime.test.ts`, "frame pacing must not reach the world") and would have
caught defects 2 and 3 both.

**5. `docs/LANGUAGE.md` had a second false claim the plan did not list.** Task 10
was scoped to the collision-shape sentence. Its implementer read the whole
document and found the Physics preamble's **iff** also falsified: *"An object
gets a collision body if, and only if, it declares a `physics` block… An object
with only `animate` blocks is not a collider: nothing rests on it, and things
pass through it."* A child of a physics group declares no `physics` of its own —
and after Task 9 *cannot* — yet it becomes a part of the group's compound and is
therefore solid. It is also the first sentence a reader meets in that section.
Qualified in place.

### Defects in this plan

**Task 9's rule would have banned the entire feature.** Its ancestor loop started
at `ancestors.length - 1`, but for a `physics` block that is a direct child of a
group the innermost ancestor *is that group* — so a group's own `physics` block
matched `anc.children.some(c => c.type === "physics")` and flagged itself.
`TYPE_PHYSICS_IN_PHYSICS_GROUP` fired on every compound group, and both rejection
tests double-reported. Fixed during execution by walking back past any
`sequence`/`parallel` wrapper to the owning renderable object and scanning
strictly above it, which also correctly permits a group whose own `physics` sits
inside a `sequence` (legal per D13).

**This was caught only because the plan carried "this must still be allowed"
tests beside the rejections.** A plan with rejection tests alone would have
shipped a validator that rejected the phase's own headline feature, with a green
suite. Write the permission cases.

**Task 3 Step 6's premise was false, and the false claim is now in the history.**
It asserted the fix would make the default scene's `stepper` start tumbling,
citing physics spec §6.11. `stepper` is released from a completed `easeInOut`
position animation with no exit velocity onto a flat floor: symmetric contact, no
torque, no rotation, override bug or not. The card's own header comment has said
so since `91172b1`; §6.11 was never reconciled and has now been corrected in
place. Because the step said to use the Step 7 commit message verbatim,
**commit `25c655b`'s message asserts "The default scene changes: stepper now
tumbles", which is untrue.** It cannot be rewritten without rewriting history, so
this note is the only correction anyone will find. A stale prediction in a spec
is not an oracle.

**Task 10's rotation assertion could not fail.** The plan's version exercised
`MatterWorld.overrideAngle` — a primitive that was never broken and is already
covered elsewhere — rather than the `pushAnimToWorld` re-arm that was the actual
defect. It documented the mechanism and guarded nothing. Reported honestly by its
implementer rather than left to rot, and rewritten to drive the whole pipeline;
confirmed by mutation that removing the `completedThisTick` guard now fails it.

**Task 6's `deltaTime` test used `VACUUM`, which has `collideBounds: true`.** At
600 px/s from x=400 the body reached the right wall well inside the one-second
window and stopped dead against it at x=780 — which reads exactly like a broken
velocity conversion and is not one. The assertion was wrong, not the code.

**The browser steps originally omitted `--strictPort`.** Vite walks forward to
5200, 5201… when the port is taken and prints what it bound, while `check.mjs`
still defaults to 5199 — so a stale server from an earlier run absorbs every
capture and the check reports a confident pass without exercising the new code.
This bit Task 1 and then bit Task 3 again, with two stale servers by then. Now
documented in the skill itself, not just the plan.

Smaller ones: `--at 300` samples before the renderer initialises (~900–1100 ms),
so that frame is not a reproducible oracle even on unmodified code; Task 5's
predicted failure text was vitest 3's wording, not vitest 4's; and Task 10's
"insert immediately after" would have orphaned an existing paragraph under the
new subsection.

### Gaps left open deliberately

**The polygon rotation observation was investigated and dismissed.** Task 3's
browser check reported a polygon appearing to draw ~90° off from its `points`.
Probed by reading vertex world positions through PixiJS's own transform at 0°,
35° and 90°: all three are correct for a y-down space, and there is no offset.
What is real nearby is that a polygon's pivot is its **bounding-box centre**, not
its centroid — about 10px apart for that triangle — so it spins about a point
above its centre of area and the apex swings on a wider arc. That is the same
bbox-vs-centroid distinction D15 exists to correct in the physics layer, it is
already documented as intended, and changing it would alter every existing
rotating-polygon scene. No decision needed; recorded so it is not re-investigated.

**`adapter.ts` still has no tests of its own**, but the reason has changed. It is
now ~137 lines holding the PixiJS `Application`, the canvas, `sceneFit` layout
and the ticker — which genuinely does need a DOM. Everything that was worth
testing moved to `SceneRuntime` and has 15 tests. Phase 1's notes blamed the DOM
for the whole file being untestable; that was false, and the real blocker was the
closure.

**The D17 precondition guard has no test.** `bindPhysicsBodies` logs if it ever
places a body under a group that moves. Task 9's validator rules make that
unreachable, which is the intent — but it means a guard against the phase's own
central assumption is itself uncovered.

**Three approximations ship as designed**, all recorded in the spec: a rotated
child beneath a nested group carrying non-uniform scale collides unsheared; a
non-uniformly scaled circle child collides at its mean radius, since Matter has
no ellipse; and `body.circleRadius` is handled only on a compound's parent, so
non-uniform scale leaves a circle *part*'s radius stale — harmless, because
Matter 0.20's `Collision.collides` is SAT over vertices.

**Two pre-existing Matter interactions were left alone.** `Body.scale` while a
body is pinned fights `setStatic`'s `_original` mass snapshot, which is taken
before the scale and restored after it. And `transform.ts`'s `IDENTITY` is
compile-time immutable but not `Object.freeze`d, unlike the IR values elsewhere
in this codebase.

**The `.eval` harness writes both corpora to the same file.** `compile.test.ts`
computes its output path as `${DIR}/../report.json`, so running with
`EVAL_DIR=eval/scenes-r2` silently overwrites `eval/report.json` — the R1
baseline — rather than `report-r2.json`. Both corpora were verified against their
committed baselines by restoring the file between runs. Worth fixing whenever
`.eval` is next touched; it makes a re-run look like a regression.

### What the next phase should read first

Phase 3 opens the parser and collapses the four property tables. Two things here
bear on it directly: `RESERVED_PROPS` still reserves `anchor`, `width` and
`height`, none of which exist, and the `PROP_TYPES` table now has two more error
codes to stay in sync with. Phase 3 also inherits the `.eval` path bug above and
the `adapter.ts` DOM-testing question, which is now much smaller than it was.

