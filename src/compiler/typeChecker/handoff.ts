import type { AstNode, ObjectNode } from "../types";

/**
 * The physics runner a `handoff: true` animation can hand its exit velocity
 * to, plus how the two are scheduled relative to each other. `"concurrent"`
 * means the physics runner starts alongside the animation (a direct sibling
 * on the same renderable, or a sibling inside one `parallel`); `"later"`
 * means the physics runner is a direct step further along the same
 * `sequence`, starting only once the animation has already completed.
 */
export interface HandoffTarget {
  readonly physics: ObjectNode;
  readonly scheduling: "concurrent" | "later";
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
 * the (currently unreachable in practice) case where `ancestors` is empty.
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
    return physics ? { physics, scheduling: "concurrent" } : null;
  }

  if (container.type === "sequence") {
    const siblings = container.children;
    const index = siblings.indexOf(animation);
    if (index === -1) return null;
    for (let i = index + 1; i < siblings.length; i++) {
      if (siblings[i].type === "physics") {
        return { physics: siblings[i], scheduling: "later" };
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
