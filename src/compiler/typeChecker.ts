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
  IRSceneFit,
  IRTransform,
} from "./sceneIR";

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
  group:     { position: "point", rotation: "number", scale: ["number", "point"], anchor: "point", z: "number" },
};

const KIND_LABEL: Readonly<Record<PropKind, string>> = {
  number:    "a number",
  color:     "a color (hex code or named color keyword)",
  string:    "a quoted string",
  point:     "a point (x, y)",
  pointList: "a point list [(x,y), ...]",
  sceneFit:  "a sceneFit keyword (contain, cover, fill, or none)",
};

function normaliseColor(raw: string): IRColor {
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

function resolveScale(props: Record<string, AstValue>, key: string, fallback: IRPoint): IRPoint {
  const v = props[key];
  if (v?.kind === "number") return { x: v.value, y: v.value };
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

function resolveSceneFit(props: Record<string, AstValue>): IRSceneFit {
  const v = props["sceneFit"];
  if (v?.kind === "sceneFit") return v.value as IRSceneFit;
  return "contain";
}

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

      const isExpected = Array.isArray(expected) ? expected.includes(val.kind) : expected === val.kind;

      if (!isExpected) {
        if (key === "sceneFit" && val.kind === "string") {
          errors.push(
            `${label}: 'sceneFit' must be an unquoted keyword — ` +
            `contain, cover, fill, or none. ` +
            `Remove the quotes around the value (e.g. sceneFit: contain).`
          );
        } else if (val.kind === "string" && (!Array.isArray(expected) && expected !== "string")) {
          const expStr = Array.isArray(expected) ? expected.map(e => KIND_LABEL[e as PropKind] ?? e).join(" or ") : KIND_LABEL[expected as PropKind] ?? expected;
          errors.push(
            `${label}: property '${key}' expects ${expStr}, ` +
            `but a quoted string was given. Remove the quotes and use the correct literal form.`
          );
        } else {
          const expStr = Array.isArray(expected) ? expected.map(e => KIND_LABEL[e as PropKind] ?? e).join(" or ") : KIND_LABEL[expected as PropKind] ?? expected;
          errors.push(
            `${label}: property '${key}' expects ${expStr}, ` +
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

      if (key === "anchor" && val.kind === "point") {
        if (val.x < 0 || val.x > 1 || val.y < 0 || val.y > 1) {
          errors.push(
            `[TYPE_ANCHOR_OUT_OF_RANGE] ${label}: 'anchor' must be in range [0.0, 1.0], but got (${val.x}, ${val.y}).`
          );
        }
      }

      if (key === "scale") {
        if (val.kind === "number" && val.value === 0) {
          errors.push(`[TYPE_NONPOSITIVE_SCALE] ${label}: 'scale' cannot be zero.`);
        } else if (val.kind === "point" && (val.x === 0 || val.y === 0)) {
          errors.push(`[TYPE_NONPOSITIVE_SCALE] ${label}: 'scale' components cannot be zero, but got (${val.x}, ${val.y}).`);
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
          rotation: resolveNumber(p, "rotation", 0),
          scale:    resolveScale(p, "scale", { x: 1, y: 1 }),
          anchor:   resolvePoint(p, "anchor", { x: 0, y: 0 }),
          z:        resolveNumber(p, "z", 0),
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
          rotation: resolveNumber(p, "rotation", 0),
          scale:    resolveScale(p, "scale", { x: 1, y: 1 }),
          anchor:   resolvePoint(p, "anchor", { x: 0, y: 0 }),
          z:        resolveNumber(p, "z", 0),
        };
        props = rectProps;
        break;
      }
      case "polygon": {
        const pts = resolvePointList(p, "points");
        
        // Calculate bounding box min to use as the default position if omitted
        let defaultX = 0, defaultY = 0;
        if (pts.length > 0) {
          let minX = Infinity, minY = Infinity;
          for (const pt of pts) {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
          }
          defaultX = minX;
          defaultY = minY;
        }

        const polyProps: IRPolygonProps = {
          kind:     "polygon",
          points:   pts,
          color:    resolveColor(p, "color", "#ffffff"),
          alpha:    resolveNumber(p, "alpha", 1.0),
          position: resolvePoint(p, "position", { x: defaultX, y: defaultY }),
          rotation: resolveNumber(p, "rotation", 0),
          scale:    resolveScale(p, "scale", { x: 1, y: 1 }),
          anchor:   resolvePoint(p, "anchor", { x: 0, y: 0 }),
          z:        resolveNumber(p, "z", 0),
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
          rotation: resolveNumber(p, "rotation", 0),
          scale:    resolveScale(p, "scale", { x: 1, y: 1 }),
          anchor:   resolvePoint(p, "anchor", { x: 0, y: 0 }),
          z:        resolveNumber(p, "z", 0),
        };
        props = textProps;
        break;
      }
      case "group": {
        const transform: IRTransform = {
          position: resolvePoint(p, "position", { x: 0, y: 0 }),
          rotation: resolveNumber(p, "rotation", 0),
          scale:    resolveScale(p, "scale", { x: 1, y: 1 }),
          anchor:   resolvePoint(p, "anchor", { x: 0, y: 0 }),
        };
        const groupProps: IRGroupProps = {
          kind:      "group",
          transform,
          z:         resolveNumber(p, "z", 0),
        };
        props = groupProps;
        break;
      }
      default: {
        const _never: never = node.type;
        throw new Error(`[IR] Unknown object type: ${String(_never)}`);
      }
    }

    const childrenNodes = node.children.map((child, index) => ({
      node: buildObjectNode(child, `${id}.${child.name}`),
      index
    }));

    childrenNodes.sort((a, b) => {
      const diff = a.node.props.z - b.node.props.z;
      if (diff !== 0) return diff;
      return a.index - b.index;
    });

    const irNode: IRObjectNode = Object.freeze({
      id,
      props,
      children: Object.freeze(childrenNodes.map(x => x.node)) as ReadonlyArray<IRObjectNode>,
    });
    
    registry[id] = irNode;
    return irNode;
  }

  const sceneAst = ast as AstNode & { type: "scene" };
  const sizeVal  = sceneAst.props["size"];

  const topLevelChildrenNodes = sceneAst.children.map((child, index) => ({
    node: buildObjectNode(child, `scene.${child.name}`),
    index
  }));

  topLevelChildrenNodes.sort((a, b) => {
    const diff = a.node.props.z - b.node.props.z;
    if (diff !== 0) return diff;
    return a.index - b.index;
  });

  const sceneIR: IRSceneNode = Object.freeze({
    kind:       "scene",
    width:      sizeVal?.kind === "point" ? sizeVal.x : 800,
    height:     sizeVal?.kind === "point" ? sizeVal.y : 600,
    background: resolveColor(sceneAst.props, "background", "#000000"),
    sceneFit:   resolveSceneFit(sceneAst.props),
    children:   Object.freeze(topLevelChildrenNodes.map(x => x.node)) as ReadonlyArray<IRObjectNode>,
    registry:   Object.freeze(registry) as Readonly<Record<IRObjectId, IRObjectNode>>,
  });

  return sceneIR;
}

export interface TypeCheckResult {
  readonly errors: ReadonlyArray<string>;
  readonly ir: IRSceneNode | null;
}

export function typeCheck(ast: AstNode): TypeCheckResult {
  const errors = collectErrors(ast);
  if (errors.length > 0) {
    return { errors, ir: null };
  }

  const ir = buildIR(ast);
  return { errors: [], ir };
}