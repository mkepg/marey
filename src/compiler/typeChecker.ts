import type { AstNode, ObjectNode, AstValue } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Declare Type Checker
// ─────────────────────────────────────────────────────────────────────────────

type PropKind = AstValue["kind"];

const REQUIRED_PROPS: Readonly<Record<string, string[]>> = {
  circle:    ["position", "radius"],
  rectangle: ["position", "size"],
  polygon:   ["points"],
  text:      ["position", "content"],
  group:     [],
};

const PROP_TYPES: Readonly<Record<string, Record<string, PropKind>>> = {
  circle:    { position: "point", radius: "number", color: "color", alpha: "number" },
  rectangle: { position: "point", size: "point", color: "color", alpha: "number" },
  polygon:   { points: "pointList", color: "color", alpha: "number" },
  text:      { position: "point", content: "string", fontSize: "number", color: "color" },
  group:     { position: "point", rotation: "number", scale: "number" },
};

export function typeCheck(ast: AstNode): string[] {
  const errors: string[] = [];

  function checkNode(node: AstNode): void {
    if (node.type === "scene") {
      node.children.forEach(checkNode);
      return;
    }

    const objNode = node as ObjectNode;
    const required = REQUIRED_PROPS[objNode.type] ?? [];
    const contract = PROP_TYPES[objNode.type] ?? {};

    // Required properties
    for (const prop of required) {
      if (!(prop in objNode.props)) {
        errors.push(`[${objNode.name}] missing required property '${prop}'`);
      }
    }

    // Property type & constraint checks
    for (const [key, val] of Object.entries(objNode.props)) {
      const expected = contract[key];
      if (!expected) {
        errors.push(`[${objNode.name}] unknown property '${key}'`);
        continue;
      }
      if (expected !== val.kind) {
        errors.push(
          `[${objNode.name}] property '${key}' expects ${expected}, got ${val.kind}`
        );
        continue;
      }
      // Range constraints
      if (key === "alpha" && val.kind === "number" && (val.value < 0 || val.value > 1)) {
        errors.push(`[${objNode.name}] 'alpha' must be in [0, 1], got ${val.value}`);
      }
      if (key === "radius" && val.kind === "number" && val.value <= 0) {
        errors.push(`[${objNode.name}] 'radius' must be > 0`);
      }
      if (key === "fontSize" && val.kind === "number" && val.value <= 0) {
        errors.push(`[${objNode.name}] 'fontSize' must be > 0`);
      }
      if (key === "scale" && val.kind === "number" && val.value <= 0) {
        errors.push(`[${objNode.name}] 'scale' must be > 0`);
      }
      if (key === "size" && val.kind === "point" && (val.x <= 0 || val.y <= 0)) {
        errors.push(`[${objNode.name}] 'size' width and height must both be > 0`);
      }
      if (key === "points" && val.kind === "pointList" && val.value.length < 3) {
        errors.push(`[${objNode.name}] 'polygon' requires at least 3 points`);
      }
    }

    // Children only allowed in groups
    if (objNode.type !== "group" && objNode.children.length > 0) {
      errors.push(`[${objNode.name}] only 'group' objects may contain children`);
    }

    objNode.children.forEach(checkNode);
  }

  checkNode(ast);
  return errors;
}
