import type { AstNode, ObjectNode, AstValue } from "./types";

type PropKind = AstValue["kind"];

// ─── Property contracts ────────────────────────────────────────────────────────

const REQUIRED_PROPS: Readonly<Record<string, readonly string[]>> = {
  scene:     ["size"],
  circle:    ["position", "radius"],
  rectangle: ["position", "size"],
  polygon:   ["points"],
  text:      ["position", "content"],
  group:     [],
};

/**
 * "scaleMode" is typed as "scaleMode" (a first-class enum kind), not "string".
 * A quoted string in that position will fail the kind check with a specific message.
 */
const PROP_TYPES: Readonly<Record<string, Readonly<Record<string, PropKind>>>> = {
  scene:     { background: "color", size: "point", scaleMode: "scaleMode" },
  circle:    { position: "point", radius: "number", color: "color", alpha: "number" },
  rectangle: { position: "point", size: "point",   color: "color", alpha: "number" },
  polygon:   { points: "pointList",                color: "color", alpha: "number" },
  text:      { position: "point", content: "string", fontSize: "number", color: "color" },
  group:     { position: "point", rotation: "number", scale: "number" },
};

// Human-readable type names for use in error messages.
const KIND_LABEL: Readonly<Record<PropKind, string>> = {
  number:    "a number",
  color:     "a color (hex code or named color keyword)",
  string:    "a quoted string",
  point:     "a point (x, y)",
  pointList: "a point list [(x,y), ...]",
  scaleMode: "a scaleMode keyword (contain, cover, fill, or none)",
};

// ─── Type checker ──────────────────────────────────────────────────────────────

export function typeCheck(ast: AstNode): string[] {
  const errors: string[] = [];

  function checkNode(node: AstNode): void {
    const typeName = node.type;
    const isScene  = typeName === "scene";
    const nodeName = isScene ? "scene" : (node as ObjectNode).name;
    const label    = isScene ? "The scene block" : `'${typeName}' object '${nodeName}'`;

    const required = REQUIRED_PROPS[typeName] ?? [];
    const contract = PROP_TYPES[typeName]    ?? {};

    // ── Required-property presence ──────────────────────────────────────────
    for (const prop of required) {
      if (!(prop in node.props)) {
        errors.push(
          `${label} is missing the required property '${prop}'.`
        );
      }
    }

    // ── Per-property validation ─────────────────────────────────────────────
    for (const [key, val] of Object.entries(node.props)) {
      const expected = contract[key];

      // Unknown property
      if (expected === undefined) {
        const knownList = Object.keys(contract).map((k) => `'${k}'`).join(", ");
        errors.push(
          `${label} has an unknown property '${key}'. ` +
          `Valid properties for '${typeName}' are: ${knownList}.`
        );
        continue;
      }

      // Type mismatch
      if (expected !== val.kind) {
        if (key === "scaleMode" && val.kind === "string") {
          errors.push(
            `${label}: 'scaleMode' must be an unquoted keyword — ` +
            `contain, cover, fill, or none. ` +
            `Remove the quotes around the value (e.g. scaleMode: contain).`
          );
        } else if (key === "scaleMode") {
          errors.push(
            `${label}: 'scaleMode' expects a scaleMode keyword ` +
            `(contain, cover, fill, or none), but got ${KIND_LABEL[val.kind] ?? val.kind}.`
          );
        } else if (val.kind === "string" && expected !== "string") {
          errors.push(
            `${label}: property '${key}' expects ${KIND_LABEL[expected] ?? expected}, ` +
            `but a quoted string was given. Remove the quotes and use the correct literal form.`
          );
        } else {
          errors.push(
            `${label}: property '${key}' expects ${KIND_LABEL[expected] ?? expected}, ` +
            `but got ${KIND_LABEL[val.kind] ?? val.kind}.`
          );
        }
        continue;
      }

      // ── Value constraint checks ───────────────────────────────────────────

      if (key === "alpha" && val.kind === "number") {
        if (val.value < 0 || val.value > 1) {
          errors.push(
            `${label}: 'alpha' must be between 0.0 and 1.0 inclusive, ` +
            `but got ${val.value}. ` +
            `Use 0 for fully transparent and 1 for fully opaque.`
          );
        }
      }

      if (key === "radius" && val.kind === "number") {
        if (val.value <= 0) {
          errors.push(
            `${label}: 'radius' must be greater than 0, but got ${val.value}.`
          );
        }
      }

      if (key === "fontSize" && val.kind === "number") {
        if (val.value <= 0) {
          errors.push(
            `${label}: 'fontSize' must be greater than 0, but got ${val.value}.`
          );
        }
      }

      if (key === "scale" && val.kind === "number") {
        if (val.value <= 0) {
          errors.push(
            `${label}: 'scale' must be greater than 0, but got ${val.value}. ` +
            `Use 1.0 for no scaling.`
          );
        }
      }

      if (key === "size" && val.kind === "point") {
        if (val.x <= 0 && val.y <= 0) {
          errors.push(
            `${label}: 'size' width (${val.x}) and height (${val.y}) must both be greater than 0.`
          );
        } else if (val.x <= 0) {
          errors.push(
            `${label}: 'size' width must be greater than 0, but got ${val.x}.`
          );
        } else if (val.y <= 0) {
          errors.push(
            `${label}: 'size' height must be greater than 0, but got ${val.y}.`
          );
        }
      }

      if (key === "points" && val.kind === "pointList") {
        if (val.value.length < 3) {
          errors.push(
            `${label}: 'polygon' requires at least 3 points, ` +
            `but only ${val.value.length} ${val.value.length === 1 ? "was" : "were"} given.`
          );
        }
      }

      if (key === "rotation" && val.kind === "number") {
        // Rotation is unbounded in degrees (wrap-around is valid), but NaN/Infinity
        // from a future expression evaluator should be caught here.
        if (!isFinite(val.value)) {
          errors.push(
            `${label}: 'rotation' must be a finite number of degrees, ` +
            `but got ${val.value}.`
          );
        }
      }
    }

    // ── Nesting constraint ────────────────────────────────────────────────────
    if (!isScene && typeName !== "group" && node.children.length > 0) {
      errors.push(
        `${label} contains nested objects, but only 'group' blocks may have children. ` +
        `Move the nested objects into a 'group', or remove them.`
      );
    }

    // ── Recurse ───────────────────────────────────────────────────────────────
    node.children.forEach(checkNode);
  }

  checkNode(ast);
  return errors;
}