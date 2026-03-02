import type { AstNode, ObjectNode, AstValue } from "./types";

type PropKind = AstValue["kind"];

const REQUIRED_PROPS: Readonly<Record<string, string[]>> = {
  scene:     ["size"],
  circle:    ["position", "radius"],
  rectangle: ["position", "size"],
  polygon:   ["points"],
  text:      ["position", "content"],
  group:     [],
};

const PROP_TYPES: Readonly<Record<string, Record<string, PropKind>>> = {
  scene:     { background: "color", size: "point", scaleMode: "string" },
  circle:    { position: "point", radius: "number", color: "color", alpha: "number" },
  rectangle: { position: "point", size: "point", color: "color", alpha: "number" },
  polygon:   { points: "pointList", color: "color", alpha: "number" },
  text:      { position: "point", content: "string", fontSize: "number", color: "color" },
  group:     { position: "point", rotation: "number", scale: "number" },
};

export function typeCheck(ast: AstNode): string[] {
  const errors: string[] = [];

  function checkNode(node: AstNode): void {
    const typeName = node.type;
    const isScene = typeName === "scene";
    const nodeName = isScene ? "scene" : (node as ObjectNode).name;
    const required = REQUIRED_PROPS[typeName] ?? [];
    const contract = PROP_TYPES[typeName] ?? {};

    for (const prop of required) {
      if (!(prop in node.props)) {
        errors.push(`[${nodeName}] missing required property '${prop}'`);
      }
    }

    for (const [key, val] of Object.entries(node.props)) {
      const expected = contract[key];
      if (!expected) {
        errors.push(`[${nodeName}] unknown property '${key}'`);
        continue;
      }

      if (expected !== val.kind) {
        errors.push(
          `[${nodeName}] property '${key}' expects ${expected}, got ${val.kind}`
        );
        continue;
      }

      if (key === "scaleMode" && val.kind === "string") {
        const validModes = ["contain", "cover", "fill", "none"];
        if (!validModes.includes(val.value)) {
          errors.push(`[${nodeName}] 'scaleMode' must be one of: ${validModes.join(", ")}, got '${val.value}'`);
        }
      }
      if (key === "alpha" && val.kind === "number" && (val.value < 0 || val.value > 1)) {
        errors.push(`[${nodeName}] 'alpha' must be in [0, 1], got ${val.value}`);
      }
      if (key === "radius" && val.kind === "number" && val.value <= 0) {
        errors.push(`[${nodeName}] 'radius' must be > 0`);
      }
      if (key === "fontSize" && val.kind === "number" && val.value <= 0) {
        errors.push(`[${nodeName}] 'fontSize' must be > 0`);
      }
      if (key === "scale" && val.kind === "number" && val.value <= 0) {
        errors.push(`[${nodeName}] 'scale' must be > 0`);
      }
      if (key === "size" && val.kind === "point" && (val.x <= 0 || val.y <= 0)) {
        errors.push(`[${nodeName}] 'size' width and height must both be > 0`);
      }
      if (key === "points" && val.kind === "pointList" && val.value.length < 3) {
        errors.push(`[${nodeName}] 'polygon' requires at least 3 points`);
      }
    }

    // Only groups and the root scene can contain children
    if (!isScene && typeName !== "group" && node.children.length > 0) {
      errors.push(`[${nodeName}] only 'group' objects may contain children`);
    }

    node.children.forEach(checkNode);
  }

  checkNode(ast);
  return errors;
}