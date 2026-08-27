import type { Container } from "pixi.js";
import type { IRPhysics, IRSequenceStep } from "../sceneIR";
import type { IPhysicsWorld, PhysicsParams, PinReason } from "./physicsWorld";

/** A container and the id of the body that represents it. */
export interface PhysicsBinding {
  readonly id: string;
  readonly container: Container;
}

/** How far outside the scene a body may drift before it is culled. */
export const CULL_MARGIN = 800;

function stepHasPhysics(step: IRSequenceStep): boolean {
  if ("type" in step && step.type === "parallel") {
    return step.steps.some((sub) => !("property" in sub));
  }
  return !("property" in step);
}

/**
 * Spec D13: a body exists only for an object that declares `physics` — either
 * directly, or in any step of any sequence it owns.
 *
 * The sequence case matters for D6. A `sequence { animate position …; physics … }`
 * needs its body to exist during the animate step, pinned static, so the object
 * shoves a pile on its way in rather than ghosting through it.
 */
export function hasPhysicsAnywhere(container: Container): boolean {
  if (container.__physics) return true;
  const sequences = container.__sequences;
  if (!sequences) return false;
  for (const seq of sequences) {
    for (const step of seq.steps) {
      if (stepHasPhysics(step)) return true;
    }
  }
  return false;
}

export function physicsParamsFromIR(ph: IRPhysics): PhysicsParams {
  return {
    gravityX: ph.gravity.x,
    gravityY: ph.gravity.y,
    airDrag: ph.airDrag,
    bounce: ph.bounce,
    collideBounds: ph.collideBounds,
  };
}

/** Physics defaults for a body whose runner has not started yet. */
const RESTING_PARAMS: PhysicsParams = {
  gravityX: 0,
  gravityY: 0,
  airDrag: 0,
  bounce: 0,
  collideBounds: true,
};

/**
 * Walk the scene tree, create a body for every qualifying container, and return
 * the bindings in tree order — which is what makes body ids deterministic.
 *
 * Every body starts pinned for NO_RUNNER. `spawnPhysics` releases it.
 */
export function bindPhysicsBodies(root: Container, world: IPhysicsWorld): PhysicsBinding[] {
  const bindings: PhysicsBinding[] = [];
  let nextId = 0;

  const visit = (container: Container): void => {
    if (hasPhysicsAnywhere(container) && container.__bodyShape && container.__declareLayout) {
      const id = `b${nextId++}`;
      const layout = container.__declareLayout;
      const params = container.__physics
        ? physicsParamsFromIR(container.__physics)
        : RESTING_PARAMS;

      world.addBody(
        id,
        container.__bodyShape,
        layout.currentPos.x,
        layout.currentPos.y,
        container.rotation,
        params
      );
      world.setScale(id, layout.currentScale.x, layout.currentScale.y);
      world.pin(id, "NO_RUNNER");

      container.__body = id;
      bindings.push({ id, container });
    }

    for (const child of container.children) {
      visit(child as Container);
    }
  };

  visit(root);
  return bindings;
}

export function pinBody(container: Container, world: IPhysicsWorld, reason: PinReason): void {
  if (container.__body) world.pin(container.__body, reason);
}

/**
 * Push a parked velocity into the world, if the body is free to take one.
 *
 * A Matter body owns its velocity and unpinning collapses it back to rest, so
 * the value can only be applied once the last pin has lifted. Until then it
 * waits on the container.
 */
export function flushPendingVelocity(container: Container, world: IPhysicsWorld): void {
  const id = container.__body;
  const pending = container.__pendingVelocity;
  if (!id || !pending || world.isPinned(id)) return;
  world.setVelocity(id, pending.x, pending.y);
  container.__pendingVelocity = undefined;
}

export function unpinBody(container: Container, world: IPhysicsWorld, reason: PinReason): void {
  if (!container.__body) return;
  world.unpin(container.__body, reason);
  // Flush here rather than at each call site: a velocity parked while two
  // reasons held the pin must be applied by whichever release is the last one,
  // and callers were already forgetting one of those paths.
  flushPendingVelocity(container, world);
}

/**
 * Paint phase: write body transforms onto containers.
 *
 * Pinned bodies are skipped — for them the flow is container → body, which is
 * what keeps a frozen object tracking a sibling animation instead of drifting
 * off its own collision shape (spec 6.6).
 */
export function syncWorldToContainers(
  bindings: ReadonlyArray<PhysicsBinding>,
  world: IPhysicsWorld,
  alpha: number
): void {
  for (const { id, container } of bindings) {
    if (world.isPinned(id)) continue;
    const state = world.readState(id, alpha);
    if (!state) continue;
    const layout = container.__declareLayout;
    if (!layout) continue;
    layout.currentPos.x = state.x;
    layout.currentPos.y = state.y;
    container.rotation = state.angle;
    container.__updateLayout?.();
  }
}

/**
 * Write a body's exact tick-aligned transform onto its container, ignoring
 * sub-tick interpolation.
 *
 * Call this the moment a body becomes pinned for good — freezing on `duration`
 * expiry. `syncWorldToContainers` skips pinned bodies, so without this the
 * container keeps whatever position it was last *painted* at, and that paint
 * used the driver's wall-clock `alpha`. The frozen object then lands up to one
 * tick of motion away from where the simulation actually stopped it, and the
 * amount varies between runs — which is exactly the determinism the fixed
 * clock exists to provide, and which frame-accurate export depends on.
 *
 * Reading at alpha 1 is what makes it tick-aligned: it returns the current
 * state rather than a blend with the previous one.
 */
export function snapContainerToBody(container: Container, world: IPhysicsWorld): void {
  const id = container.__body;
  if (!id) return;
  const state = world.readState(id, 1);
  const layout = container.__declareLayout;
  if (!state || !layout) return;
  layout.currentPos.x = state.x;
  layout.currentPos.y = state.y;
  container.rotation = state.angle;
  container.__updateLayout?.();
}

/**
 * Remove bodies that have drifted far outside the scene, and hide the
 * containers that went with them.
 *
 * Runs before freeze (spec 6.7), so an escaped `collideBounds: false` body is
 * removed rather than frozen into an invisible off-screen obstacle.
 */
export function cullEscapedBodies(
  bindings: ReadonlyArray<PhysicsBinding>,
  world: IPhysicsWorld,
  margin: number
): void {
  const escaped = world.idsOutsideBounds(margin);
  if (escaped.length === 0) return;
  const gone = new Set(escaped);
  for (const { id, container } of bindings) {
    if (!gone.has(id)) continue;
    world.removeBody(id);
    container.__body = undefined;
    container.visible = false;
  }
}
