import type { Container } from "pixi.js";
import type { SceneRuntime } from "./sceneRuntime";
import type { SamplerPlan } from "../export/exportContract";
import type { IRObjectId } from "../sceneIR";

/** One object's transform at one sampled frame. */
export interface ObjectSnapshot {
  readonly id: IRObjectId;
  /**
   * Parent-local, exactly as `layout.currentPos` holds it — a group's
   * children are in the group's local frame, not scene space, so two
   * snapshots with the same `x`/`y` are only at the same drawn position if
   * they also share a parent. `rotation`/`scaleX`/`scaleY`/`alpha` below are
   * likewise local to the container, not composed with any ancestor's.
   */
  readonly x: number;
  readonly y: number;
  /** Radians, as the scene graph holds it. */
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly alpha: number;
  /**
   * Whether the container is drawn at all. Written by `cullEscapedBodies`
   * (`physicsSync.ts`) inside `advanceOneTick()` when a body leaves the scene
   * by `CULL_MARGIN` — the only runtime display property the renderer
   * mutates that this snapshot omitted before this field existed. Omitting
   * it silently dropped a culled object from every exported frame, including
   * ones sampled before the cull happened, because `frameRaster.ts` replays
   * frames onto the same tree `sampleFrames` just drove to its final state.
   */
  readonly visible: boolean;
}

/** One output frame: immutable, and the only thing an encoder ever sees. */
export interface FrameSnapshot {
  readonly index: number;
  readonly tick: number;
  readonly objects: ReadonlyArray<ObjectSnapshot>;
}

/**
 * Read one snapshot's worth of transforms off a built scene tree.
 *
 * Public because it is the *inverse* of `applySnapshot`
 * (`../export/frameRaster.ts`), and a round trip is only checkable if both
 * directions are reachable. Nothing else in the renderer needs it: the sampler
 * below is the only production caller.
 */
export function snapshotFor(root: Container): ObjectSnapshot[] {
  const out: ObjectSnapshot[] = [];
  // Depth-first in scene-graph order, which is IR order. The ordering is part
  // of the contract: a hash over the sequence is only stable if the sequence is.
  const visit = (c: Container): void => {
    const id = c.__mareyId;
    const layout = c.__mareyLayout;
    if (id !== undefined && layout) {
      out.push(Object.freeze({
        id,
        x: layout.currentPos.x,
        y: layout.currentPos.y,
        rotation: c.rotation,
        scaleX: layout.currentScale.x,
        scaleY: layout.currentScale.y,
        alpha: c.alpha,
        visible: c.visible,
      }));
    }
    for (const child of c.children) visit(child as Container);
  };
  visit(root);
  return out;
}

/**
 * Drive a scene for a plan's worth of ticks and return one snapshot per output
 * frame.
 *
 * A sibling of `LiveDriver`, not a replacement. `LiveDriver.pump(deltaMS)` maps
 * wall-clock milliseconds to ticks; this maps an output-frame index to ticks
 * and never sees a clock at all. Both call the same `advanceOneTick()`, which
 * takes no time argument — renderer invariant 1, and the whole reason Phase 2
 * lifted `SceneRuntime` out of `render()`'s closure.
 *
 * **It paints every tick, not every frame — but measured, not because Gate B
 * criterion 3 can tell the difference.** The original design worry was that
 * `spawnAnim` seeds a new runner's start value from paint-written container
 * state (`getCurrentVal` reads `currentPos`, `rotation` and `alpha`), so a
 * paint cadence that varied with the requested frame rate would make the
 * exported *simulation* frame-rate dependent. That was tested directly —
 * moving `paintExactTick()` out of this loop to run once per frame instead of
 * once per tick — and the 30-vs-60 coincident-frame test still passed. It
 * does not distinguish the two cadences, for a documented reason: `tickAnim`
 * (`sceneRuntime.ts`) already snaps a runner's own property to its exact
 * tick-aligned value with `applyAnim(ra, 0)` **in the tick phase**, the moment
 * that runner completes — precisely to keep a later `getCurrentVal` read
 * tick-aligned regardless of when paint next runs. Every `spawnAnim` in this
 * suite's fixture reads a property that was either never animated or was
 * snapped that way, so paint cadence had nothing left to affect. (The fixture
 * has no `sequence` block; whether a mid-scene sequence step could still
 * observe paint-phase state some other way is untested here and open.)
 *
 * Painting every tick is kept anyway, as the more conservative choice — it
 * matches the "state mutation in the tick phase, painting in the paint
 * phase" split every other subsystem in this renderer follows, and it is
 * never less tick-aligned than painting once per frame — but that choice is
 * not the thing pinned by the coincident-frame tests. What those tests pin is
 * that `advanceOneTick()` itself is deterministic and frame-rate independent;
 * the paint cadence used to observe it turned out not to matter here.
 *
 * Frame 0 samples tick 0, before any advance, so the first exported frame is
 * the scene as authored.
 */
export function sampleFrames(
  runtime: SceneRuntime,
  root: Container,
  plan: SamplerPlan,
): FrameSnapshot[] {
  const frames: FrameSnapshot[] = [];

  frames.push(Object.freeze({ index: 0, tick: 0, objects: Object.freeze(snapshotFor(root)) }));

  for (let index = 1; index < plan.frameCount; index++) {
    for (let t = 0; t < plan.ticksPerFrame; t++) {
      runtime.advanceOneTick();
      runtime.paintExactTick();
    }
    frames.push(Object.freeze({
      index,
      tick: index * plan.ticksPerFrame,
      objects: Object.freeze(snapshotFor(root)),
    }));
  }

  return frames;
}
