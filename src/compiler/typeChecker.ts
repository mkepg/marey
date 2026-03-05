import type { AstNode, ObjectNode, AstValue } from "./types";
import type {
  IRSceneNode,
  IRObjectNode,
  IRObjectId,
  IRObjectProps,
  IRCircleProps,
  IRRectangleProps,
  IRPolygonProps,
  IRTextProps,
  IRGroupProps,
  IRColor,
  IRPoint,
  IRPointList,
  IRScaleMode,
  IRTransform,
} from "./sceneIR";

// ─── Internal contract tables (unchanged from v0.3) ──────────────────────────

type PropKind = AstValue["kind"];

const REQUIRED_PROPS: Readonly<Record<string, readonly string[]>> = {
  scene:     ["size"],
  circle:    ["position", "radius"],
  rectangle: ["position", "size"],
  polygon:   ["points"],
  text:      ["position", "content"],
  group:     [],
};

const PROP_TYPES: Readonly<Record<string, Readonly<Record<string, PropKind>>>> = {
  scene:     { background: "color", size: "point", scaleMode: "scaleMode" },
  circle:    { position: "point", radius: "number", color: "color", alpha: "number" },
  rectangle: { position: "point", size: "point",   color: "color", alpha: "number" },
  polygon:   { points: "pointList",                color: "color", alpha: "number" },
  text:      { position: "point", content: "string", fontSize: "number", color: "color" },
  group:     { position: "point", rotation: "number", scale: "number" },
};

const KIND_LABEL: Readonly<Record<PropKind, string>> = {
  number:    "a number",
  color:     "a color (hex code or named color keyword)",
  string:    "a quoted string",
  point:     "a point (x, y)",
  pointList: "a point list [(x,y), ...]",
  scaleMode: "a scaleMode keyword (contain, cover, fill, or none)",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Expand a 3-digit hex shorthand to 6 digits and normalise to #rrggbb. */
function normaliseColor(raw: string): IRColor {
  // raw is already the value stored in AstValue (without the leading #)
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (hex.length === 3) {
    const [r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return `#${hex}`;
}

function resolveColor(props: Record<string, AstValue>, key: string, fallback: IRColor): IRColor {
  const v = props[key];
  if (v?.kind === "color") return normaliseColor(v.value as string);
  return fallback;
}

function resolveNumber(props: Record<string, AstValue>, key: string, fallback: number): number {
  const v = props[key];
  if (v?.kind === "number") return v.value as number;
  return fallback;
}

function resolvePoint(props: Record<string, AstValue>, key: string, fallback: IRPoint): IRPoint {
  const v = props[key];
  if (v?.kind === "point") return { x: v.x, y: v.y };
  return fallback;
}

function resolveString(props: Record<string, AstValue>, key: string, fallback: string): string {
  const v = props[key];
  if (v?.kind === "string") return v.value as string;
  return fallback;
}

function resolvePointList(props: Record<string, AstValue>, key: string): IRPointList {
  const v = props[key];
  if (v?.kind === "pointList") {
    return v.value.map((pt) => ({ x: pt.x, y: pt.y }));
  }
  return [];
}

function resolveScaleMode(props: Record<string, AstValue>): IRScaleMode {
  const v = props["scaleMode"];
  if (v?.kind === "scaleMode") return v.value as IRScaleMode;
  return "contain";
}

// ─── Type-check pass (error collection — identical logic to v0.3) ─────────────

function collectErrors(ast: AstNode): string[] {
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
        errors.push(
          `${label} has an unknown property '${key}'. ` +
          `Valid properties for '${typeName}' are: ${knownList}.`
        );
        continue;
      }

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
          errors.push(`${label}: 'radius' must be greater than 0, but got ${val.value}.`);
        }
      }
      if (key === "fontSize" && val.kind === "number") {
        if (val.value <= 0) {
          errors.push(`${label}: 'fontSize' must be greater than 0, but got ${val.value}.`);
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
          errors.push(`${label}: 'size' width must be greater than 0, but got ${val.x}.`);
        } else if (val.y <= 0) {
          errors.push(`${label}: 'size' height must be greater than 0, but got ${val.y}.`);
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
        if (!isFinite(val.value)) {
          errors.push(
            `${label}: 'rotation' must be a finite number of degrees, but got ${val.value}.`
          );
        }
      }
    }

    if (!isScene && typeName !== "group" && node.children.length > 0) {
      errors.push(
        `${label} contains nested objects, but only 'group' blocks may have children. ` +
        `Move the nested objects into a 'group', or remove them.`
      );
    }

    node.children.forEach(checkNode);
  }

  checkNode(ast);
  return errors;
}

// ─── IR construction pass ────────────────────────────────────────────────────

/**
 * Build the Scene IR from a validated AST.
 * Called only when collectErrors returns an empty array.
 */
function buildIR(ast: AstNode): IRSceneNode {
  const registry: Record<IRObjectId, IRObjectNode> = {};

  function buildObjectNode(node: ObjectNode, scopePath: string): IRObjectNode {
    const id: IRObjectId = scopePath;
    const p = node.props;
    let props: IRObjectProps;

    switch (node.type) {
      case "circle": {
        const circleProps: IRCircleProps = {
          kind:     "circle",
          position: resolvePoint(p, "position", { x: 0, y: 0 }),
          radius:   resolveNumber(p, "radius", 0),
          color:    resolveColor(p, "color", "#ffffff"),
          alpha:    resolveNumber(p, "alpha", 1.0),
        };
        props = circleProps;
        break;
      }
      case "rectangle": {
        const sizeVal = p["size"];
        const rectProps: IRRectangleProps = {
          kind:     "rectangle",
          position: resolvePoint(p, "position", { x: 0, y: 0 }),
          width:    sizeVal?.kind === "point" ? sizeVal.x : 0,
          height:   sizeVal?.kind === "point" ? sizeVal.y : 0,
          color:    resolveColor(p, "color", "#ffffff"),
          alpha:    resolveNumber(p, "alpha", 1.0),
        };
        props = rectProps;
        break;
      }
      case "polygon": {
        const polyProps: IRPolygonProps = {
          kind:   "polygon",
          points: resolvePointList(p, "points"),
          color:  resolveColor(p, "color", "#ffffff"),
          alpha:  resolveNumber(p, "alpha", 1.0),
          // Polygons have no position property in their contract.
          // We store (0, 0) so IRVisualBase is satisfied; the renderer
          // uses the absolute point coordinates from the points list.
          position: { x: 0, y: 0 },
        };
        props = polyProps;
        break;
      }
      case "text": {
        const textProps: IRTextProps = {
          kind:     "text",
          position: resolvePoint(p, "position", { x: 0, y: 0 }),
          content:  resolveString(p, "content", ""),
          fontSize: resolveNumber(p, "fontSize", 16),
          color:    resolveColor(p, "color", "#ffffff"),
          alpha:    resolveNumber(p, "alpha", 1.0),
        };
        props = textProps;
        break;
      }
      case "group": {
        const transform: IRTransform = {
          position: resolvePoint(p, "position", { x: 0, y: 0 }),
          rotation: resolveNumber(p, "rotation", 0),
          scale:    resolveNumber(p, "scale", 1.0),
        };
        const groupProps: IRGroupProps = {
          kind:      "group",
          transform,
        };
        props = groupProps;
        break;
      }
      default: {
        // Exhaustive guard — the type-checker guarantees we never reach here.
        const _never: never = node.type;
        throw new Error(`[IR] Unknown object type: ${String(_never)}`);
      }
    }

    const children: IRObjectNode[] = node.children.map((child) =>
      buildObjectNode(child, `${id}.${child.name}`)
    );

    const irNode: IRObjectNode = Object.freeze({
      id,
      props,
      children: Object.freeze(children) as ReadonlyArray<IRObjectNode>,
    });

    registry[id] = irNode;

    return irNode;
  }

  // ast is guaranteed to be a SceneNode here
  const sceneAst = ast as AstNode & { type: "scene" };
  const sizeVal  = sceneAst.props["size"];

  const topLevelChildren: IRObjectNode[] = sceneAst.children.map((child) =>
    buildObjectNode(child, `scene.${child.name}`)
  );

  const sceneIR: IRSceneNode = Object.freeze({
    kind:       "scene",
    width:      sizeVal?.kind === "point" ? sizeVal.x : 800,
    height:     sizeVal?.kind === "point" ? sizeVal.y : 600,
    background: resolveColor(sceneAst.props, "background", "#000000"),
    scaleMode:  resolveScaleMode(sceneAst.props),
    children:   Object.freeze(topLevelChildren) as ReadonlyArray<IRObjectNode>,
    registry:   Object.freeze(registry) as Readonly<Record<IRObjectId, IRObjectNode>>,
  });

  return sceneIR;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface TypeCheckResult {
  /** Type errors found.  Empty array means the program is valid. */
  readonly errors: ReadonlyArray<string>;
  /**
   * The fully-resolved Scene IR.  Present only when errors is empty.
   * The AST is not accessible after this point.
   */
  readonly ir: IRSceneNode | null;
}

/**
 * Run the type-checker over the AST.
 *
 * On success (no errors) it constructs and returns the immutable Scene IR.
 * On failure it returns the error list and a null IR.
 * The AST must not be passed to the renderer under any circumstance.
 */
export function typeCheck(ast: AstNode): TypeCheckResult {
  const errors = collectErrors(ast);
  if (errors.length > 0) {
    return { errors, ir: null };
  }
  const ir = buildIR(ast);
  return { errors: [], ir };
}