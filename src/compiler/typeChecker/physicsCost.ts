import type { AstNode, ObjectNode } from "../types";

export const MAX_PHYSICS_BODIES = 500;
export const MAX_PHYSICS_PARTS = 2_000;

export interface PhysicsCost {
  readonly bodies: number;
  readonly parts: number;
  readonly bodyLimitNode: ObjectNode | null;
  readonly partLimitNode: ObjectNode | null;
}

function isVisualNode(node: ObjectNode): boolean {
  return node.type === "circle"
    || node.type === "rectangle"
    || node.type === "polygon"
    || node.type === "line"
    || node.type === "text"
    || node.type === "group";
}

/** Whether this visual owns a Matter body, including its own sequence. */
export function ownsPhysics(node: ObjectNode): boolean {
  if (node.children.some((child) => child.type === "physics")) return true;
  return node.children
    .filter((child) => child.type === "sequence")
    .some((sequence) => sequence.children.some((step) =>
      step.type === "physics"
      || (step.type === "parallel" && step.children.some((parallelStep) => parallelStep.type === "physics"))
    ));
}

function collectVisualLeaves(node: ObjectNode, leaves: ObjectNode[]): void {
  for (const child of node.children) {
    if (!isVisualNode(child)) continue;
    if (child.type === "group") {
      collectVisualLeaves(child, leaves);
    } else {
      leaves.push(child);
    }
  }
}

/** Count body owners and flattened collision primitives in source order. */
export function countPhysicsCost(ast: AstNode): PhysicsCost {
  let bodies = 0;
  let parts = 0;
  let bodyLimitNode: ObjectNode | null = null;
  let partLimitNode: ObjectNode | null = null;

  const addBody = (node: ObjectNode): void => {
    bodies += 1;
    if (bodies > MAX_PHYSICS_BODIES && bodyLimitNode === null) {
      bodyLimitNode = node;
    }
  };

  const addPart = (node: ObjectNode): void => {
    parts += 1;
    if (parts > MAX_PHYSICS_PARTS && partLimitNode === null) {
      partLimitNode = node;
    }
  };

  const visit = (node: ObjectNode): void => {
    if (!isVisualNode(node)) return;

    if (ownsPhysics(node)) {
      addBody(node);
      if (node.type === "group") {
        const leaves: ObjectNode[] = [];
        collectVisualLeaves(node, leaves);
        for (const leaf of leaves) addPart(leaf);
      } else {
        addPart(node);
      }
    }

    for (const child of node.children) {
      if (isVisualNode(child)) visit(child);
    }
  };

  if (ast.type === "scene") {
    for (const child of ast.children) visit(child);
  } else {
    visit(ast);
  }

  return { bodies, parts, bodyLimitNode, partLimitNode };
}
