/** The value categories understood by the Declare type checker. */
export type ValueKind =
  | "number" | "color" | "string" | "point" | "pointList"
  | "sceneFit" | "boolean" | "easing" | "animProperty" | "indefinitely";

export type ContractDefault = number | string | boolean | Readonly<{ x: number; y: number }>;

export type LocalConstraint =
  | Readonly<{ kind: "range"; min: number; max: number }>
  | Readonly<{ kind: "positive" }>
  | Readonly<{ kind: "positivePoint" }>
  | Readonly<{ kind: "maxLength"; max: number }>
  | Readonly<{ kind: "pointCount"; min: number; max: number }>;

export interface PropertySpec {
  readonly kinds: ValueKind | readonly ValueKind[];
  readonly required?: true;
  readonly default?: ContractDefault;
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

const position = property(
  "point",
  "Sets the (x, y) coordinates of the object's geometric center in the scene.",
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
  { default: point(1, 1), constraint: { kind: "positivePoint" } },
);
const layer = property(
  "number",
  "Z-index for rendering order. Objects with higher z values are drawn on top.",
  "z: 10",
  "0",
  { default: 0 },
);

const visualProperties = Object.freeze({
  color,
  alpha,
  rotation,
  scale,
  z: layer,
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
  sceneFit: property(
    "sceneFit",
    "How the scene scales to the preview window.",
    "sceneFit: contain",
    "contain",
    { default: "contain" },
  ),
});

const circleProperties = Object.freeze({
  position: property(position.kinds, position.description, position.example, position.placeholder, { required: true }),
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
  position: property(position.kinds, position.description, position.example, position.placeholder, { required: true }),
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
  position,
  points: property(
    "pointList",
    "Defines the vertices of a polygon.",
    "points: [(0,0), (100,0), (50,100)]",
    "[(0, 0), (100, 0), (50, 100)]",
    { required: true, constraint: { kind: "pointCount", min: 3, max: 10000 } },
  ),
  ...visualProperties,
});

const lineProperties = Object.freeze({
  position: property(position.kinds, position.description, position.example, position.placeholder, { required: true }),
  points: property(
    "pointList",
    "Defines the vertices of a line.",
    "points: [(0,0), (100,0), (50,100)]",
    "[(0, 0), (100, 0)]",
    { required: true, constraint: { kind: "pointCount", min: 2, max: 10000 } },
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
  position: property(position.kinds, position.description, position.example, position.placeholder, { required: true }),
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
  handOff: property(
    "boolean",
    "Allows an animation to transfer its final momentum to the physics engine once completed. Requires a sibling physics block.",
    "handOff: true",
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
    "The continuous acceleration applied each frame. (0, 980) mimics real-world downward gravity.",
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

const groupPosition = property(
  position.kinds,
  position.description,
  position.example,
  position.placeholder,
  { default: point(0, 0) },
);

const groupProperties = Object.freeze({
  position: groupPosition,
  rotation,
  scale,
  alpha,
  z: layer,
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
  pointList: "a point list [(x,y), ...]",
  sceneFit: "a sceneFit keyword (contain, cover, fill, or none)",
  boolean: "a boolean (true or false)",
  easing: "an easing keyword (e.g. easeInOut, linear)",
  animProperty: "an animatable property name (e.g. position, rotation, scale, alpha)",
  indefinitely: "the keyword 'indefinitely'",
};

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

export const LEGACY_SOURCE_FORMS = Object.freeze({
  keyword: Object.freeze({ def: "let" }),
  property: Object.freeze({ handOff: "handoff", sceneFit: "fit", z: "layer" }),
});
