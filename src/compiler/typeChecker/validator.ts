import type { AstNode, ObjectNode, AstValue } from "../types";

type PropKind = AstValue["kind"];
type PropContract = PropKind | readonly PropKind[];

const REQUIRED_PROPS: Readonly<Record<string, readonly string[]>> = {
  scene:     ["size"],
  circle:    ["position", "radius"],
  rectangle: ["position", "size"],
  polygon:   ["points"],
  text:      ["position", "content"],
  group:     [],
};

const PROP_TYPES: Readonly<Record<string, Readonly<Record<string, PropContract>>>> = {
  scene:     { background: "color", size: "point", sceneFit: "sceneFit" },
  circle:    { position: "point", radius: "number", color: "color", alpha: "number", rotation: "number", scale: ["number", "point"], anchor: "point", z: "number" },
  rectangle: { position: "point", size: "point",   color: "color", alpha: "number", rotation: "number", scale: ["number", "point"], anchor: "point", z: "number" },
  polygon:   { position: "point", points: "pointList", color: "color", alpha: "number", rotation: "number", scale: ["number", "point"], anchor: "point", z: "number" },
  text:      { position: "point", content: "string", fontSize: "number", color: "color", rotation: "number", scale: ["number", "point"], anchor: "point", z: "number" },
  group:     { position: "point", rotation: "number", scale: ["number", "point"], alpha: "number", z: "number" },
};

const KIND_LABEL: Readonly<Record<PropKind, string>> = {
  number:    "a number",
  color:     "a color (hex code or named color keyword)",
  string:    "a quoted string",
  point:     "a point (x, y)",
  pointList: "a point list [(x,y), ...]",
  sceneFit:  "a sceneFit keyword (contain, cover, fill, or none)",
};

export function collectErrors(ast: AstNode): string[] {
  const errors: string[] = [];

  function checkNode(node: AstNode): void {
    const typeName = node.type;
    const isScene  = typeName === "scene";
    const nodeName = isScene ? "scene" : (node as ObjectNode).name;
    const label    = isScene ? "The scene block" : `'${typeName}' object '${nodeName}'`;

    const required = REQUIRED_PROPS[typeName] ?? [];
    const contract = PROP_TYPES[typeName]    ?? {};

    for (const prop of required) {
      if (!(prop in node.props)) {
        errors.push(`${label} is missing the required property '${prop}'.`);
      }
    }

    for (const [key, val] of Object.entries(node.props)) {
      const expected = contract[key];

      if (expected === undefined) {
        const knownList = Object.keys(contract).map((k) => `'${k}'`).join(", ");
        errors.push(`${label} has an unknown property '${key}'. Valid properties for '${typeName}' are: ${knownList}.`);
        continue;
      }

      const isExpected = Array.isArray(expected) ? expected.includes(val.kind) : expected === val.kind;

      if (!isExpected) {
        if (key === "sceneFit" && val.kind === "string") {
          errors.push(`${label}: 'sceneFit' must be an unquoted keyword. Remove the quotes around the value.`);
        } else if (val.kind === "string" && (!Array.isArray(expected) && expected !== "string")) {
          const expStr = Array.isArray(expected) ? expected.map(e => KIND_LABEL[e as PropKind] ?? e).join(" or ") : KIND_LABEL[expected as PropKind] ?? expected;
          errors.push(`${label}: property '${key}' expects ${expStr}, but a quoted string was given.`);
        } else {
          const expStr = Array.isArray(expected) ? expected.map(e => KIND_LABEL[e as PropKind] ?? e).join(" or ") : KIND_LABEL[expected as PropKind] ?? expected;
          errors.push(`${label}: property '${key}' expects ${expStr}, but got ${KIND_LABEL[val.kind] ?? val.kind}.`);
        }
        continue;
      }

      if (key === "alpha" && val.kind === "number") {
        if (val.value < 0 || val.value > 1) errors.push(`${label}: 'alpha' must be between 0.0 and 1.0 inclusive, but got ${val.value}.`);
      }

      if (key === "radius" && val.kind === "number") {
        if (val.value <= 0) errors.push(`${label}: 'radius' must be greater than 0, but got ${val.value}.`);
      }

      if (key === "fontSize" && val.kind === "number") {
        if (val.value <= 0) errors.push(`${label}: 'fontSize' must be greater than 0, but got ${val.value}.`);
      }

      if (key === "anchor" && val.kind === "point") {
        if (val.x < 0 || val.x > 1 || val.y < 0 || val.y > 1) {
          errors.push(`[TYPE_ANCHOR_OUT_OF_RANGE] ${label}: 'anchor' must be in range [0.0, 1.0], but got (${val.x}, ${val.y}).`);
        }
      }

      if (key === "scale") {
        if (val.kind === "number" && val.value === 0) errors.push(`[TYPE_ZERO_SCALE] ${label}: 'scale' cannot be exactly zero.`);
        else if (val.kind === "point" && (val.x === 0 || val.y === 0)) errors.push(`[TYPE_ZERO_SCALE] ${label}: 'scale' components cannot be exactly zero, but got (${val.x}, ${val.y}).`);
      }

      if (key === "size" && val.kind === "point") {
        if (val.x <= 0 && val.y <= 0) errors.push(`${label}: 'size' width and height must both be greater than 0.`);
        else if (val.x <= 0) errors.push(`${label}: 'size' width must be greater than 0, but got ${val.x}.`);
        else if (val.y <= 0) errors.push(`${label}: 'size' height must be greater than 0, but got ${val.y}.`);
      }

      if (key === "points" && val.kind === "pointList") {
        if (val.value.length < 3) errors.push(`${label}: 'polygon' requires at least 3 points.`);
        else if (val.value.length > 10000) errors.push(`[TYPE_POLYGON_TOO_LARGE] ${label}: 'polygon' exceeds the maximum safe limit of 10,000 points.`);
      }
    }

    if (!isScene && typeName !== "group" && node.children.length > 0) {
      errors.push(`${label} contains nested objects, but only 'group' blocks may have children.`);
    }

    node.children.forEach(checkNode);
  }

  checkNode(ast);
  return errors;
}