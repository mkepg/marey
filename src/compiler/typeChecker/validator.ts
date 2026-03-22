import type { AstNode, ObjectNode, AstValue, CompilerError } from "../types";

type PropKind = AstValue["kind"];
type PropContract = PropKind | readonly PropKind[];

export const REQUIRED_PROPS: Readonly<Record<string, readonly string[]>> = {
  scene:     ["size"],
  circle:    ["position", "radius"],
  rectangle: ["position", "size"],
  polygon:   ["points"],
  line:      ["position", "points", "thickness"],
  text:      ["position", "content"],
  animate:   ["property", "to", "duration"],
  group:     [],
};

export const PROP_TYPES: Readonly<Record<string, Readonly<Record<string, PropContract>>>> = {
  scene:     { background: "color", size: "point", sceneFit: "sceneFit" },
  circle:    { position: "point", radius: "number", color: "color", alpha: "number", rotation: "number", scale: ["number", "point"], anchor: "point", z: "number" },
  rectangle: { position: "point", size: "point",   color: "color", alpha: "number", rotation: "number", scale: ["number", "point"], anchor: "point", z: "number" },
  polygon:   { position: "point", points: "pointList", color: "color", alpha: "number", rotation: "number", scale: ["number", "point"], anchor: "point", z: "number" },
  line:      { position: "point", points: "pointList", thickness: "number", color: "color", alpha: "number", rotation: "number", scale: ["number", "point"], anchor: "point", z: "number" },
  text:      { position: "point", content: "string", fontSize: "number", color: "color", rotation: "number", scale: ["number", "point"], anchor: "point", z: "number" },
  animate:   { property: "animProperty", to: ["number", "point"], duration: "number", easing: "easing", loop: "boolean", yoyo: "boolean" },
  group:     { position: "point", rotation: "number", scale: ["number", "point"], alpha: "number", z: "number" },
};

export const KIND_LABEL: Readonly<Record<PropKind, string>> = {
  number:    "a number",
  color:     "a color (hex code or named color keyword)",
  string:    "a quoted string",
  point:     "a point (x, y)",
  pointList: "a point list [(x,y), ...]",
  sceneFit:  "a sceneFit keyword (contain, cover, fill, or none)",
  boolean:   "a boolean (true or false)",
  easing:    "an easing keyword (e.g. easeInOut, linear)",
  animProperty: "an animatable property name (e.g. position, rotation, scale, alpha)",
};

export function collectErrors(ast: AstNode): CompilerError[] {
  const errors: CompilerError[] = [];
  function checkNode(node: AstNode, parentType: string | null = null): void {
    const typeName = node.type;
    const isScene  = typeName === "scene";
    const nodeName = isScene ? "scene" : (node as ObjectNode).name;
    const isUseBlock = !isScene && (node as ObjectNode).isUse;
    const label = isScene
        ? "The scene block"
        : typeName === "animate" 
        ? "The 'animate' block"
        : `'${isUseBlock ? "use" : typeName}' ${isUseBlock ? "block" : "object"} '${nodeName}'`;
        
    const required = REQUIRED_PROPS[typeName] ?? [];
    const contract = PROP_TYPES[typeName]    ?? {};
    
    if (typeName === "animate") {
      if (parentType === "scene") {
          errors.push({ phase: "TYPE", message: "An 'animate' block must be placed inside a renderable object (e.g., circle, group, etc.), not at the root of the scene.", line: node.line, col: node.col });
      }
      const propVal = node.props["property"];
      const toVal = node.props["to"];
      if (propVal && toVal && propVal.kind === "animProperty") {
          const p = propVal.value as string;
          if (!["position", "rotation", "scale", "alpha"].includes(p)) {
               errors.push({ phase: "TYPE", message: `[TYPE_ANIM_PROP] Cannot animate property '${p}'. Supported properties are: position, rotation, scale, alpha.`, line: propVal.line, col: propVal.col });
          }
          if (p === "position" && toVal.kind !== "point") {
              errors.push({ phase: "TYPE", message: `[TYPE_ANIM_MISMATCH] Property 'position' expects a point for 'to' (e.g., to: (100, 100)).`, line: toVal.line, col: toVal.col });
          }
          if (p === "scale" && toVal.kind !== "point" && toVal.kind !== "number") {
              errors.push({ phase: "TYPE", message: `[TYPE_ANIM_MISMATCH] Property 'scale' expects a number or point for 'to'.`, line: toVal.line, col: toVal.col });
          }
          if ((p === "rotation" || p === "alpha") && toVal.kind !== "number") {
              errors.push({ phase: "TYPE", message: `[TYPE_ANIM_MISMATCH] Property '${p}' expects a number for 'to'.`, line: toVal.line, col: toVal.col });
          }
      }
    }

    for (const prop of required) {
      if (!(prop in node.props)) {
        errors.push({ phase: "TYPE", message: `${label} is missing the required property '${prop}'.`, line: node.line, col: node.col });
      }
    }

    for (const [key, val] of Object.entries(node.props)) {
      const expected = contract[key];
      const errPos = { line: val.line, col: val.col };
      
      if (expected === undefined) {
        const knownList = Object.keys(contract).map((k) => `'${k}'`).join(", ");
        errors.push({ phase: "TYPE", message: `${label} has an unknown property '${key}'. Valid properties for '${typeName}' are: ${knownList}.`, ...errPos });
        continue;
      }

      const isExpected = Array.isArray(expected) ? expected.includes(val.kind) : expected === val.kind;
      if (!isExpected) {
        if (key === "sceneFit" && val.kind === "string") {
          errors.push({ phase: "TYPE", message: `${label}: 'sceneFit' must be an unquoted keyword. Remove the quotes around the value.`, ...errPos });
        } else if (val.kind === "string" && (!Array.isArray(expected) && expected !== "string")) {
          const expStr = Array.isArray(expected) ? expected.map(e => KIND_LABEL[e as PropKind] ?? e).join(" or ") : KIND_LABEL[expected as PropKind] ?? expected;
          errors.push({ phase: "TYPE", message: `${label}: property '${key}' expects ${expStr}, but a quoted string was given.`, ...errPos });
        } else {
          const expStr = Array.isArray(expected) ? expected.map(e => KIND_LABEL[e as PropKind] ?? e).join(" or ") : KIND_LABEL[expected as PropKind] ?? expected;
          errors.push({ phase: "TYPE", message: `${label}: property '${key}' expects ${expStr}, but got ${KIND_LABEL[val.kind] ?? val.kind}.`, ...errPos });
        }
        continue;
      }

      if (key === "duration" && val.kind === "number") {
        if (val.value <= 0) errors.push({ phase: "TYPE", message: `${label}: 'duration' must be strictly greater than 0, but got ${val.value}.`, ...errPos });
      }
      if (key === "alpha" && val.kind === "number") {
        if (val.value < 0 || val.value > 1) errors.push({ phase: "TYPE", message: `${label}: 'alpha' must be between 0.0 and 1.0 inclusive, but got ${val.value}.`, ...errPos });
      }
      if (key === "radius" && val.kind === "number") {
        if (val.value <= 0) errors.push({ phase: "TYPE", message: `${label}: 'radius' must be greater than 0, but got ${val.value}.`, ...errPos });
      }
      if (key === "thickness" && val.kind === "number") {
        if (val.value <= 0) errors.push({ phase: "TYPE", message: `${label}: 'thickness' must be greater than 0, but got ${val.value}.`, ...errPos });
      }
      if (key === "fontSize" && val.kind === "number") {
        if (val.value <= 0) errors.push({ phase: "TYPE", message: `${label}: 'fontSize' must be greater than 0, but got ${val.value}.`, ...errPos });
      }
      if (key === "content" && val.kind === "string") {
        if (val.value.length > 500) {
          errors.push({ phase: "TYPE", message: `[TYPE_TEXT_TOO_LONG] ${label}: 'content' string is too long (${val.value.length} chars). Maximum allowed is 500 characters to prevent rendering crashes.`, ...errPos });
        }
      }
      if (key === "anchor" && val.kind === "point") {
        if (val.x < 0 || val.x > 1 || val.y < 0 || val.y > 1) {
          errors.push({ phase: "TYPE", message: `[TYPE_ANCHOR_OUT_OF_RANGE] ${label}: 'anchor' must be in range [0.0, 1.0], but got (${val.x}, ${val.y}).`, ...errPos });
        }
      }
      if (key === "scale") {
        if (val.kind === "number" && val.value <= 0) {
          errors.push({ phase: "TYPE", message: `[TYPE_INVALID_SCALE] ${label}: 'scale' must be greater than zero.`, ...errPos });
        }
        else if (val.kind === "point" && (val.x <= 0 || val.y <= 0)) {
          errors.push({ phase: "TYPE", message: `[TYPE_INVALID_SCALE] ${label}: 'scale' components must be greater than zero, but got (${val.x}, ${val.y}).`, ...errPos });
        }
      }
      if (key === "size" && val.kind === "point") {
        if (val.x <= 0 && val.y <= 0) errors.push({ phase: "TYPE", message: `${label}: 'size' width and height must both be greater than 0.`, ...errPos });
        else if (val.x <= 0) errors.push({ phase: "TYPE", message: `${label}: 'size' width must be greater than 0, but got ${val.x}.`, ...errPos });
        else if (val.y <= 0) errors.push({ phase: "TYPE", message: `${label}: 'size' height must be greater than 0, but got ${val.y}.`, ...errPos });
      }
      if (key === "points" && val.kind === "pointList") {
        if (typeName === "polygon" && val.value.length < 3) errors.push({ phase: "TYPE", message: `${label}: 'polygon' requires at least 3 points.`, ...errPos });
        else if (typeName === "line" && val.value.length < 2) errors.push({ phase: "TYPE", message: `${label}: 'line' requires at least 2 points.`, ...errPos });
        else if (val.value.length > 10000) errors.push({ phase: "TYPE", message: `[TYPE_POLYGON_TOO_LARGE] ${label}: '${typeName}' exceeds the maximum safe limit of 10,000 points.`, ...errPos });
      }
    }
    
    const hasVisualChildren = node.children.some(c => c.type !== "animate");
    if (!isScene && typeName !== "group" && hasVisualChildren) {
      errors.push({ phase: "TYPE", message: `${label} contains nested visual objects, but only 'group' blocks may have visual children.`, line: node.line, col: node.col });
    }
    node.children.forEach((c) => checkNode(c, typeName));
  }
  
  checkNode(ast);
  return errors;
}