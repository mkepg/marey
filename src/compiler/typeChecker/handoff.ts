import type { AstNode, ObjectNode } from "../types";

/**
 * The physics runner a `handoff: true` animation can hand its exit velocity
 * to, plus how the two are scheduled relative to each other. `"concurrent"`
 * means the physics runner starts alongside the animation (a direct sibling
 * on the same renderable, or a sibling inside one `parallel`); `"later"`
 * means the physics runner is a direct step further along the same
 * `sequence`, starting only once the animation has already completed.
 *
 * `ambiguousPhysics` and `ambiguousPosAnim` record whether the schedule
 * `resolveHandoffTarget` picked one runner out of is actually safe to reason
 * about statically. Runtime pinning (`sceneRuntime.ts`) is reason-counted
 * across *every* runner that touches the body, not just the one this
 * function happened to resolve to:
 *
 *  - `ambiguousPhysics` is true when more than one `physics` block starts
 *    concurrently with the handoff, and the two shapes this counts are unsafe
 *    for different reasons. Inside a `parallel`, each `physics` sibling
 *    reaches the IR as its own step (`builder.ts`'s
 *    `buildSequencesFromChildren`) and spawns its own `PhysicsRunner` against
 *    the same body; whichever completes first adds the `FROZEN` pin reason,
 *    and nothing ever removes that specific hold — a genuine multi-runner
 *    race. As a *direct* sibling of the renderable (not inside a `parallel`),
 *    it is not a race at all: `buildObjectNode` in `builder.ts` (~line 119)
 *    does `node.children.find(c => c.type === "physics")`, which keeps only
 *    the *first* direct `physics` child, so a second one is silently dropped
 *    before it ever reaches the IR — only one `PhysicsRunner` is ever
 *    spawned, and the source's second physics block simply has no effect.
 *    Either way, checking only the first physics block found (which one is
 *    arbitrary — `Array.prototype.find` order) would validate a duration
 *    relationship against a runner that either races another live one, or
 *    isn't the only physics the source appears to declare.
 *  - `ambiguousPosAnim` is true when more than one direct-child animation
 *    (counting the handoff animation itself) drives `property: position`
 *    concurrently. Every position animation holds the `POS_ANIM` pin reason
 *    for its own duration, and the count is reason-counted — two holds need
 *    two releases (`physicsWorld.ts`'s `pin`/`unpin`). If a second position
 *    animation is still running when the handoff's own animation completes,
 *    the body stays pinned past the moment the parked velocity is written,
 *    and if the physics runner freezes before that second animation
 *    releases its hold, the velocity is never flushed.
 *
 * Both are always false for `"later"` scheduling: a sequence step runs
 * alone — `SceneRuntime.advanceOneTick`'s sequence phase only starts the next
 * step once every runner in the previous one has `time.completed` — so a
 * later physics step can never race another runner the way a concurrent one
 * can. `resolveHandoffTarget` also does not search into a nested `parallel`
 * for a later step (see the function doc below), so a "later" target is
 * always a single bare `physics` block, never a `parallel` wrapping several.
 */
export interface HandoffTarget {
  readonly physics: ObjectNode;
  readonly scheduling: "concurrent" | "later";
  readonly ambiguousPhysics: boolean;
  readonly ambiguousPosAnim: boolean;
}

/** How many direct children of `container` are `physics` blocks. */
function countConcurrentPhysics(container: AstNode): number {
  return container.children.filter((c) => c.type === "physics").length;
}

/**
 * How many direct children of `container` are `animate` blocks driving
 * `property: position` — the only property that takes the `POS_ANIM` pin.
 */
function countConcurrentPositionAnims(container: AstNode): number {
  let n = 0;
  for (const c of container.children) {
    if (c.type !== "animate") continue;
    const prop = c.props["property"];
    if (prop?.kind === "animProperty" && prop.value === "position") n++;
  }
  return n;
}

const RENDERABLE_TYPES: ReadonlySet<string> = new Set([
  "circle", "rectangle", "polygon", "line", "text", "group",
]);

/**
 * Resolves the physics runner a `handoff: true` animation targets, under the
 * grammar validator.ts already accepts (P3A-8):
 *
 *  - a top-level `animate` inside a renderable, or an `animate`/`physics`
 *    pair inside one `parallel`, are scheduled concurrently — the target is
 *    a direct physics sibling of the animation's enclosing block;
 *  - a direct `sequence` step hands off to the first *later* direct physics
 *    step in the same sequence. A physics step that occurs earlier has
 *    already run to completion and is not a target; a physics step reached
 *    only through a nested `parallel` is not searched — this task does not
 *    widen the grammar validator.ts already accepts.
 *
 * Returns null when no eligible physics runner exists, which callers use to
 * raise `TYPE_HANDOFF_PHYSICS`.
 *
 * `ancestors` is the same enclosing-object chain `validator.ts`'s traversal
 * already threads through `checkNode`, and its last entry is always the
 * animation's immediate AST parent — the same node `parent` carries. This
 * function reads the enclosing block off `ancestors` so it does not depend
 * on a caller keeping those two views in sync; `parent` is the fallback for
 * the case where `ancestors` is empty. The literal syntax `scene { animate {
 * ... } }` cannot reach this: `parser/index.ts` rejects an `animate` keyword
 * at the scene body loop before any node is built. But `generate` expands its
 * body through the generic `parseObject` path, which has no such guard, so
 * `generate i in 0 to 0 { animate { ..., handoff: true } } }` at the scene
 * root does produce an `animate` node as a direct scene child — `ancestors`
 * empty, `container` falls back to the scene node, and every branch below
 * returns `null`, same as `checkNode`'s own (separate, unconditional) "must
 * be placed inside a renderable object" diagnostic for that node.
 */
export function resolveHandoffTarget(
  animation: ObjectNode,
  parent: AstNode | null,
  ancestors: readonly ObjectNode[],
): HandoffTarget | null {
  const container: AstNode | null =
    ancestors.length > 0 ? ancestors[ancestors.length - 1] : parent;
  if (!container) return null;

  if (container.type === "parallel" || RENDERABLE_TYPES.has(container.type)) {
    const physics = container.children.find((c) => c.type === "physics");
    if (!physics) return null;
    return {
      physics,
      scheduling: "concurrent",
      ambiguousPhysics: countConcurrentPhysics(container) > 1,
      ambiguousPosAnim: countConcurrentPositionAnims(container) > 1,
    };
  }

  if (container.type === "sequence") {
    const siblings = container.children;
    const index = siblings.indexOf(animation);
    if (index === -1) return null;
    for (let i = index + 1; i < siblings.length; i++) {
      if (siblings[i].type === "physics") {
        return {
          physics: siblings[i],
          scheduling: "later",
          ambiguousPhysics: false,
          ambiguousPosAnim: false,
        };
      }
    }
    return null;
  }

  return null;
}

/** Whether `yoyo: true` is set — doubles a handoff animation's effective runtime. */
export function yoyoIsTrue(animation: ObjectNode): boolean {
  const yoyoVal = animation.props["yoyo"];
  return yoyoVal?.kind === "boolean" && yoyoVal.value === true;
}
