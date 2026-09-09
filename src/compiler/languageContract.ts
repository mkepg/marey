/** The value categories understood by the Marey type checker. */
export type ValueKind =
  | "number" | "color" | "string" | "point" | "list"
  | "fit" | "boolean" | "easing" | "animProperty" | "indefinitely";

export type ContractDefault = number | string | boolean | Readonly<{ x: number; y: number }>;

export type LocalConstraint =
  | Readonly<{ kind: "range"; min: number; max: number }>
  | Readonly<{ kind: "positive" }>
  | Readonly<{ kind: "nonNegative" }>
  | Readonly<{ kind: "positivePoint" }>
  | Readonly<{ kind: "positiveScale" }>
  | Readonly<{ kind: "maxLength"; max: number }>
  | Readonly<{ kind: "listOf"; element: ValueKind; min: number; max: number }>;

/**
 * A named strategy for computing an optional property's fallback value from
 * its own object's other properties, for the cases where a fixed contract
 * `default` cannot express it (the fallback depends on that instance's data,
 * not a constant). Naming it here — even though the computation itself still
 * lives with its consumer (see `resolvers.ts`'s `contractDerivedPositionDefault`)
 * — keeps the contract the single place that knows *every* optional property
 * has some documented fallback, so `languageContract.test.ts` can enumerate
 * them structurally instead of a gap like `polygon.position` going unnoticed.
 *
 * `polygonMinPoint`: the minimum x and minimum y across the polygon's
 * `points`, matching what a bounding box's top-left corner would be in local
 * point-space. This is the fallback `typeChecker/builder.ts` computed
 * privately before Fix 1.
 */
export type DerivedDefaultStrategy = "polygonMinPoint";

export interface PropertySpec {
  readonly kinds: ValueKind | readonly ValueKind[];
  readonly required?: true;
  readonly default?: ContractDefault;
  readonly derivedDefault?: DerivedDefaultStrategy;
  readonly constraint?: LocalConstraint;
  readonly description: string;
  readonly example: string;
  readonly placeholder: string;
}

export interface BlockContract {
  readonly properties: Readonly<Record<string, PropertySpec>>;
}

export const FIT_VALUES = ["contain", "cover", "fill", "none"] as const;
export const BOOLEAN_VALUES = ["true", "false"] as const;
export const EASING_VALUES = ["linear", "easeIn", "easeOut", "easeInOut"] as const;
export const DURATION_VALUES = ["indefinitely"] as const;
export const ANIMATABLE_PROPERTIES = ["position", "rotation", "scale", "alpha"] as const;

export const NAMED_COLORS = {
  red: "#ff0000", green: "#008000", blue: "#0000ff", white: "#ffffff",
  black: "#000000", yellow: "#ffff00", cyan: "#00ffff",
  magenta: "#ff00ff", orange: "#ffa500",
} as const;

const point = (x: number, y: number): Readonly<{ x: number; y: number }> =>
  Object.freeze({ x, y });

type PropertyOptions = Readonly<{
  required?: true;
  default?: ContractDefault;
  derivedDefault?: DerivedDefaultStrategy;
  constraint?: LocalConstraint;
}>;

function property(
  kinds: PropertySpec["kinds"],
  description: string,
  example: string,
  placeholder: string,
  options: PropertyOptions = {},
): PropertySpec {
  return Object.freeze({ kinds, description, example, placeholder, ...options });
}

// Every visual is wrapped in a container whose pivot is its `origin`, a
// bounding-box fraction that defaults to (0.5, 0.5) — the bounding box's
// centre, which coincides with the shape's *geometric* centre only for
// circle, rectangle and text (docs/architecture/renderer.md, decision D15).
// Polygon and line
// share a distinct description because for an asymmetric shape the
// bounding-box midpoint is not the centroid. `position` places wherever the
// origin currently is, not unconditionally the centre/midpoint — see the
// `origin` property just below.
const centerPosition = property(
  "point",
  "Sets the (x, y) scene coordinates the object's origin is placed at, which defaults to its geometric center. 'origin' can move that point elsewhere in the bounding box; 'scale' and 'rotation' always act about wherever it currently is.",
  "position: (100, 200)",
  "(0, 0)",
);
const bboxMidpointPosition = property(
  "point",
  "Sets the (x, y) scene coordinates the object's origin is placed at, which defaults to the shape's bounding-box midpoint — the point 'points' are positioned around by default. For an asymmetric shape this default is not the same as the centroid. 'origin' can move this point elsewhere in the bounding box; 'scale' and 'rotation' always act about wherever it currently is.",
  "position: (100, 200)",
  "(0, 0)",
);
const color = property(
  "color",
  "The fill color. Can be a named color or a hex code.",
  "color: red or color: #ff0000",
  "#ffffff",
  { default: "#ffffff" },
);
const alpha = property(
  "number",
  "Transparency level from 0.0 (invisible) to 1.0 (fully opaque).",
  "alpha: 0.5",
  "1.0",
  { default: 1, constraint: { kind: "range", min: 0, max: 1 } },
);
const rotation = property(
  "number",
  "Rotation angle in degrees.",
  "rotation: 45",
  "0",
  { default: 0 },
);
const scale = property(
  ["number", "point"],
  "Scales the object. Can be a uniform number or a point for independent X/Y scaling.",
  "scale: 1.5 or scale: (2, 0.5)",
  "1.0",
  { default: point(1, 1), constraint: { kind: "positiveScale" } },
);
const layer = property(
  "number",
  "Layer for rendering order. Objects with higher layer values are drawn on top.",
  "layer: 10",
  "0",
  { default: 0 },
);
const origin = property(
  "point",
  "The point that 'position' places, and that 'scale' and 'rotation' act around, as a fraction of the object's bounding box: (0, 0) is its top-left corner, (1, 1) its bottom-right, (0.5, 0.5) its centre. Values outside 0..1 place the origin outside the box.",
  "origin: (0.5, 1)",
  "(0.5, 0.5)",
  { default: point(0.5, 0.5) },
);

const visualProperties = Object.freeze({
  color,
  alpha,
  rotation,
  scale,
  layer,
  origin,
});

const sceneProperties = Object.freeze({
  background: property(
    "color",
    "The background color of the scene.",
    "background: #222222",
    "#000000",
    { default: "#000000" },
  ),
  size: property(
    "point",
    "Sets the width and height of the scene.",
    "size: (600, 400)",
    "(600, 400)",
    { required: true, constraint: { kind: "positivePoint" } },
  ),
  fit: property(
    "fit",
    "How the scene scales to the preview window.",
    "fit: contain",
    "contain",
    { default: "contain" },
  ),
});

const circleProperties = Object.freeze({
  position: property(centerPosition.kinds, centerPosition.description, centerPosition.example, centerPosition.placeholder, { required: true }),
  radius: property(
    "number",
    "Sets the radius of a circle.",
    "radius: 50",
    "50",
    { required: true, constraint: { kind: "positive" } },
  ),
  ...visualProperties,
});

const rectangleProperties = Object.freeze({
  position: property(centerPosition.kinds, centerPosition.description, centerPosition.example, centerPosition.placeholder, { required: true }),
  size: property(
    "point",
    "Sets the width and height of a rectangle.",
    "size: (200, 150)",
    "(200, 150)",
    { required: true, constraint: { kind: "positivePoint" } },
  ),
  ...visualProperties,
});

const polygonProperties = Object.freeze({
  // Optional: unlike the other shapes, a polygon's position may be omitted
  // and derived from its own points (Fix 1 — see DerivedDefaultStrategy).
  position: property(
    bboxMidpointPosition.kinds,
    bboxMidpointPosition.description,
    bboxMidpointPosition.example,
    bboxMidpointPosition.placeholder,
    { derivedDefault: "polygonMinPoint" },
  ),
  points: property(
    "list",
    "Defines the vertices of a polygon.",
    "points: [(0,0), (100,0), (50,100)]",
    "[(0, 0), (100, 0), (50, 100)]",
    { required: true, constraint: { kind: "listOf", element: "point", min: 3, max: 10000 } },
  ),
  ...visualProperties,
});

const lineProperties = Object.freeze({
  position: property(bboxMidpointPosition.kinds, bboxMidpointPosition.description, bboxMidpointPosition.example, bboxMidpointPosition.placeholder, { required: true }),
  points: property(
    "list",
    "Defines the vertices of a line.",
    "points: [(0,0), (100,0), (50,100)]",
    "[(0, 0), (100, 0)]",
    { required: true, constraint: { kind: "listOf", element: "point", min: 2, max: 10000 } },
  ),
  thickness: property(
    "number",
    "Sets the stroke width in pixels for a line.",
    "thickness: 4",
    "4",
    { required: true, constraint: { kind: "positive" } },
  ),
  ...visualProperties,
});

const textProperties = Object.freeze({
  position: property(centerPosition.kinds, centerPosition.description, centerPosition.example, centerPosition.placeholder, { required: true }),
  content: property(
    "string",
    "The text string to display.",
    "content: \"Hello World\"",
    "\"Hello World\"",
    { required: true, constraint: { kind: "maxLength", max: 500 } },
  ),
  fontSize: property(
    "number",
    "The size of the text font.",
    "fontSize: 24",
    "24",
    { default: 16, constraint: { kind: "positive" } },
  ),
  ...visualProperties,
});

const animateProperties = Object.freeze({
  property: property(
    "animProperty",
    "The specific property targeted by the animation block.",
    "property: rotation",
    "position",
    { required: true },
  ),
  to: property(
    ["number", "point"],
    "The target value for the animation.",
    "to: 360",
    "(0, 0)",
    { required: true },
  ),
  duration: property(
    "number",
    "How long the animation runs in seconds.",
    "duration: 2.5",
    "1.0",
    { required: true, constraint: { kind: "positive" } },
  ),
  delay: property(
    "number",
    "Seconds to wait before this animation begins. Applied once, before the first iteration -- a looping animation's period stays 'duration'.",
    "delay: 0.25",
    "0.25",
    { default: 0, constraint: { kind: "nonNegative" } },
  ),
  easing: property(
    "easing",
    "The rate of change over time.",
    "easing: easeInOut",
    "easeInOut",
    { default: "easeInOut" },
  ),
  loop: property(
    "boolean",
    "Whether the animation repeats endlessly.",
    "loop: true",
    "false",
    { default: false },
  ),
  yoyo: property(
    "boolean",
    "Whether the animation smoothly reverses back to its starting position at the end of its duration.",
    "yoyo: true",
    "false",
    { default: false },
  ),
  handoff: property(
    "boolean",
    "Allows an animation to transfer its final momentum to the physics engine once completed. Requires a sibling physics block.",
    "handoff: true",
    "false",
    { default: false },
  ),
});

const physicsProperties = Object.freeze({
  velocity: property(
    "point",
    "The initial momentum vector of the object in pixels per second.",
    "velocity: (200, -500)",
    "(0, 0)",
    { default: point(0, 0) },
  ),
  gravity: property(
    "point",
    "The continuous acceleration applied to the object, in pixels per second squared. It is injected once per fixed simulation tick (120 ticks per second) as a velocity delta, never once per rendered frame, so it stays independent of display frame rate. (0, 980) mimics real-world downward gravity.",
    "gravity: (0, 980)",
    "(0, 980)",
    { default: point(0, 980) },
  ),
  airDrag: property(
    "number",
    "The frame-rate independent drag coefficient between 0.0 and 1.0. 0.0 means no air drag (vacuum). Higher values increase resistance.",
    "airDrag: 0.006",
    "0.006",
    { default: 0, constraint: { kind: "range", min: 0, max: 1 } },
  ),
  bounce: property(
    "number",
    "The restitution coefficient for collisions with other objects and scene boundaries. Matter combines two objects' restitution using the higher value.",
    "bounce: 0.65",
    "0.65",
    { default: 0.65, constraint: { kind: "range", min: 0, max: 1 } },
  ),
  collideBounds: property(
    "boolean",
    "Determines whether the object participates in collisions with the logical edges of the scene window.",
    "collideBounds: true",
    "true",
    { default: true },
  ),
  duration: property(
    ["number", "indefinitely"],
    "How long the physics simulation runs in seconds. Top-level physics may also run indefinitely.",
    "duration: 2.5 or duration: indefinitely",
    "indefinitely",
    { required: true, constraint: { kind: "positive" } },
  ),
});

// A group's pivot is its local origin and is never derived from where its
// children sit (docs/architecture/renderer.md, decision D16) — a distinct
// description from
// centerPosition/bboxMidpointPosition above, both of which describe a pivot
// computed from the object's own visual extent.
const groupPosition = property(
  "point",
  "Sets the (x, y) coordinates of the group's local origin in the scene. Unlike other blocks' pivot, this is never derived from where the group's children sit — children are positioned relative to this fixed origin, and rotation and scale act about it.",
  "position: (100, 200)",
  "(0, 0)",
  { default: point(0, 0) },
);

const groupProperties = Object.freeze({
  position: groupPosition,
  rotation,
  scale,
  alpha,
  layer,
});

const emptyProperties = Object.freeze({});

function block(properties: Readonly<Record<string, PropertySpec>>): BlockContract {
  return Object.freeze({ properties: Object.freeze(properties) });
}

export const LANGUAGE_CONTRACT = Object.freeze({
  scene: block(sceneProperties),
  circle: block(circleProperties),
  rectangle: block(rectangleProperties),
  polygon: block(polygonProperties),
  line: block(lineProperties),
  text: block(textProperties),
  animate: block(animateProperties),
  physics: block(physicsProperties),
  group: block(groupProperties),
  sequence: block(emptyProperties),
  parallel: block(emptyProperties),
});

export const KIND_LABEL: Readonly<Record<ValueKind, string>> = {
  number: "a number",
  color: "a color (hex code or named color keyword)",
  string: "a quoted string",
  point: "a point (x, y)",
  list: "a list [a, b, c]",
  fit: "a fit keyword (contain, cover, fill, or none)",
  boolean: "a boolean (true or false)",
  easing: "an easing keyword (e.g. easeInOut, linear)",
  animProperty: "an animatable property name (e.g. position, rotation, scale, alpha)",
  indefinitely: "the keyword 'indefinitely'",
};

/**
 * Plural noun for a `listOf` element kind, used only by `validator.ts`'s
 * `listOf` case for its "requires at least N ___" / "exceeds ... N ___"
 * counting messages. Deliberately a separate table from `KIND_LABEL` above,
 * not a derivation of it: `KIND_LABEL`'s entries are singular noun phrases
 * *with an article*, written for the "expects X, but got Y" frame ("a point
 * (x, y)", "a number"). Dropped into a count they would read as "requires at
 * least 3 a point (x, y)" — this project has already shipped exactly that
 * class of bug once by composing an article-bearing phrase into the wrong
 * sentence shape (see `KIND_LABEL`'s own history). Every `ValueKind` needs an
 * entry, and TypeScript enforces that exhaustively, even though only `point`
 * is used by any contract entry today.
 */
export const LIST_ELEMENT_NOUN_PLURAL: Readonly<Record<ValueKind, string>> = {
  number: "numbers",
  color: "colors",
  string: "strings",
  point: "points",
  list: "lists",
  fit: "fit keywords",
  boolean: "booleans",
  easing: "easing keywords",
  animProperty: "animatable property names",
  indefinitely: "'indefinitely' keywords",
};

/**
 * Diagnostic code for a `listOf` value exceeding its `max` element count.
 * `TYPE_POLYGON_TOO_LARGE` predates the general list feature (Phase 3B) —
 * coined back when the only `listOf` constraint that existed described a
 * shape's `points` — and `languageContract.test.ts` pins its exact text for
 * `polygon`. Keying it off `element === "point"` rather than the block name
 * changes nothing about today's actual behaviour: a `line` exceeding its max
 * already produced this same code before this function existed, since
 * `line.points` is also `element: "point"`. What it does change is every
 * *future* non-point `listOf` constraint: instead of silently inheriting a
 * code whose name claims the offending object is a polygon, it gets an
 * honest generic code. A confidently wrong diagnostic is worse than a merely
 * generic one — see docs/architecture/README.md's process rules.
 */
export function listTooLargeCode(element: ValueKind): string {
  return element === "point" ? "TYPE_POLYGON_TOO_LARGE" : "TYPE_LIST_TOO_LARGE";
}

export const REQUIRED_PROPS = Object.fromEntries(
  Object.entries(LANGUAGE_CONTRACT).map(([name, contract]) => [
    name,
    Object.entries(contract.properties)
      .filter(([, spec]) => spec.required)
      .map(([propertyName]) => propertyName),
  ])
) as Readonly<Record<string, readonly string[]>>;

export const PROP_TYPES = Object.fromEntries(
  Object.entries(LANGUAGE_CONTRACT).map(([name, contract]) => [
    name,
    Object.fromEntries(
      Object.entries(contract.properties).map(([propertyName, spec]) => [propertyName, spec.kinds])
    ),
  ])
) as Readonly<Record<string, Readonly<Record<string, ValueKind | readonly ValueKind[]>>>>;

export const RESERVED_PROPERTY_NAMES = new Set(
  Object.values(LANGUAGE_CONTRACT).flatMap((contract) => Object.keys(contract.properties))
);

export function propertyDefault(blockName: string, propertyName: string): ContractDefault | undefined {
  const contract = LANGUAGE_CONTRACT[blockName as keyof typeof LANGUAGE_CONTRACT];
  const configured = contract?.properties[propertyName]?.default;
  if (configured === undefined) return undefined;
  if (typeof configured === "object") {
    return Object.freeze({ x: configured.x, y: configured.y });
  }
  return configured;
}

/** The named derived-default strategy configured for a property, if any. */
export function derivedDefaultStrategy(
  blockName: string,
  propertyName: string,
): DerivedDefaultStrategy | undefined {
  const contract = LANGUAGE_CONTRACT[blockName as keyof typeof LANGUAGE_CONTRACT];
  return contract?.properties[propertyName]?.derivedDefault;
}

export const LEGACY_SOURCE_FORMS = Object.freeze({
  keyword: Object.freeze({ def: "let" }),
  property: Object.freeze({ handOff: "handoff", sceneFit: "fit", z: "layer" }),
});
