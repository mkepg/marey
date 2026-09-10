import {
  BOOLEAN_VALUES,
  DURATION_VALUES,
  EASING_VALUES,
  FIT_VALUES,
  KIND_LABEL,
  LANGUAGE_CONTRACT,
  NAMED_COLORS,
  REQUIRED_PROPS,
} from "../../../compiler/languageContract";
import type { PropertySpec, ValueKind } from "../../../compiler/languageContract";

type ContractBlockName = keyof typeof LANGUAGE_CONTRACT;

const propertySections = (blockName: ContractBlockName): string => {
  const required = REQUIRED_PROPS[blockName] ?? [];
  const properties = LANGUAGE_CONTRACT[blockName].properties;
  const optional = Object.keys(properties).filter((property) => !required.includes(property));
  const sections: string[] = [];

  if (required.length > 0) {
    sections.push(`**Required Properties:** \`${required.join(" | ")}\``);
  }
  if (optional.length > 0) {
    sections.push(`**Optional Properties:** \`${optional.join(" | ")}\``);
  }
  return sections.join("\n\n");
};

const namedColors = Object.keys(NAMED_COLORS);

export const KEYWORD_DOCS: Record<string, string> = {
  template: `### \`template\`\nDefines a reusable component template structure.\n\n**Required Elements:** \`TemplateName | (parameters)\`\n\n**Example:**\n\`\`\`marey\ntemplate Star(color) {\n  group {\n    circle { radius: 10, color: color }\n  }\n}\n\`\`\``,
  use: `### \`use\`\nInstantiates a template into the scene.\n\n**Required Elements:** \`TemplateName | (arguments) | instanceName\`\n\n**Example:**\n\`\`\`marey\nuse Star(#ef4444) myStar {\n  position: (100, 100)\n  scale: 1.5\n}\n\`\`\``,
  generate: `### \`generate\`\nCreates objects from a literal list or range. The first variable is the element; an optional second variable is its 0-based ordinal.\n\n**Required Elements:** \`variable [, index] | in | list\`\n\n**Example:**\n\`\`\`marey\ngenerate i in 1 to 5 {\n  circle dot {\n    position: (i * 50, 100)\n    radius: 10\n  }\n}\n\`\`\``,
  let: `### \`let\`\nDeclares a constant variable. Variables in Marey are strictly block-scoped and immutable.\n\n**Required Elements:** \`variableName | = | value\`\n\n**Example:**\n\`\`\`marey\nlet spacing = 50\n\`\`\``,
  sequence: `### \`sequence\`\nA timeline block that executes its child \`animate\` or \`physics\` steps in exact order.\n\n**Required Elements:** \`animate\`, \`physics\`, or \`parallel\` child blocks\n\n**Example:**\n\`\`\`marey\nsequence {\n  animate {\n    property: alpha\n    to: 0.0\n    duration: 0.4\n    easing: easeIn\n  }\n}\n\`\`\``,
  parallel: `### \`parallel\`\nA wrapper that explicitly groups multiple \`animate\` or \`physics\` steps to execute simultaneously. It can *only* be used inside a \`sequence\` block.\n\n**Required Elements:** \`animate\` or \`physics\` child blocks\n\n**Example:**\n\`\`\`marey\nparallel {\n  animate { property: scale, to: 2.0, duration: 1.0 }\n  animate { property: alpha, to: 0.0, duration: 1.0 }\n}\n\`\`\``,
  scene: `### \`scene\`\nThe root block of a Marey program. Contains all objects and global scene properties.\n\n${propertySections("scene")}\n\n**Example:**\n\`\`\`marey\nscene {\n  size: (800, 600)\n  background: #080811\n  fit: contain\n}\n\`\`\``,
  circle: `### \`circle\`\nA renderable circle object.\n\n${propertySections("circle")}\n\n**Example:**\n\`\`\`marey\ncircle myCircle {\n  position: (400, 300)\n  radius: 50\n  color: #38bdf8\n  alpha: 0.8\n  rotation: 45\n  scale: (1.5, 1.5)\n  origin: (0.5, 0.5)\n  layer: 10\n}\n\`\`\``,
  rectangle: `### \`rectangle\`\nA renderable rectangle object.\n\n${propertySections("rectangle")}\n\n**Example:**\n\`\`\`marey\nrectangle myRect {\n  position: (100, 100)\n  size: (200, 150)\n  color: #4ade80\n  alpha: 1.0\n  rotation: 0\n  scale: 1.0\n  origin: (0.5, 1)\n  layer: 5\n}\n\`\`\``,
  polygon: `### \`polygon\`\nA renderable polygon object formed by a list of points.\n\n${propertySections("polygon")}\n\n**Example:**\n\`\`\`marey\npolygon myPoly {\n  position: (0, 0)\n  points: [(50,0), (100,100), (0,100)]\n  color: #a78bfa\n  alpha: 0.9\n  rotation: 180\n  scale: 2.0\n  origin: (0.5, 0.5)\n  layer: 2\n}\n\`\`\``,
  line: `### \`line\`\nA renderable line object connecting a list of points.\n\n${propertySections("line")}\n\n**Example:**\n\`\`\`marey\nline myLine {\n  position: (0, 0)\n  points: [(10,10), (200,10), (200,200)]\n  thickness: 4\n  color: #f87171\n  alpha: 1.0\n  rotation: 0\n  scale: 1.0\n  origin: (0.5, 0.5)\n  layer: 1\n}\n\`\`\``,
  text: `### \`text\`\nA renderable text object.\n\n${propertySections("text")}\n\n**Example:**\n\`\`\`marey\ntext myText {\n  position: (400, 300)\n  content: "Marey UI"\n  fontSize: 24\n  color: #f8fafc\n  alpha: 1.0\n  rotation: 0\n  scale: 1.0\n  origin: (0.5, 0.5)\n  layer: 10\n}\n\`\`\``,
  group: `### \`group\`\nA container object that groups multiple child objects together.\n\n${propertySections("group")}\n\n**Example:**\n\`\`\`marey\ngroup myGroup {\n  position: (100, 100)\n  rotation: 45\n  scale: (1.5, 1.5)\n  alpha: 0.8\n  layer: 5\n\n  circle {\n    position: (0, 0)\n    radius: 20\n  }\n}\n\`\`\``,
  physics: `### \`physics\`\nA block that applies a 2D physics simulation to its parent object.\n\n${propertySections("physics")}\n\n**Example:**\n\`\`\`marey\nphysics {\n  duration: indefinitely\n  velocity: (200, -500)\n  gravity: (0, 980)\n  airDrag: 0.02\n  bounce: 0.65\n  collideBounds: true\n}\n\`\`\``,
  animate: `### \`animate\`\nA block that animates a specific property of its parent object over time.\n\n${propertySections("animate")}\n\n**Example:**\n\`\`\`marey\nanimate {\n  property: position\n  to: (500, 300)\n  duration: 2.5\n  delay: 0.25\n  easing: easeInOut\n  loop: true\n  yoyo: true\n  handoff: false\n}\n\`\`\``,
};

/**
 * Looks up a property's hover doc, preferring the description declared by
 * `blockType` when given. Several property names (e.g. `position`) mean
 * different things on different blocks — `centerPosition` on circle,
 * rectangle and text, `bboxMidpointPosition` on polygon/line (D15), the
 * group's local origin (D16) — so falling back to whichever block happens to
 * declare the name first in `LANGUAGE_CONTRACT` (circle, for `position`)
 * would show the wrong description whenever the cursor is actually inside a
 * different block. The first-appearance fallback below only fires when no
 * block context is available (e.g. hovering a bare identifier outside any
 * block).
 */
export function propertyHoverMarkdown(property: string, blockType?: string): string | undefined {
  const contractBlockName = blockType as ContractBlockName | undefined;
  const blockSpec = contractBlockName
    ? LANGUAGE_CONTRACT[contractBlockName]?.properties[property]
    : undefined;
  const appearances = Object.values(LANGUAGE_CONTRACT)
    .map((block) => block.properties[property])
    .filter((spec): spec is PropertySpec => spec !== undefined);
  const spec = blockSpec ?? appearances[0];
  if (!spec) return undefined;
  const kinds: readonly ValueKind[] = Array.isArray(spec.kinds) ? spec.kinds : [spec.kinds];
  const accepted = kinds
    .map((kind) => KIND_LABEL[kind]).join(" or ");
  return `### \`${property}\`\n${spec.description}\n\n**Accepts:** ${accepted}\n**Example:** \`${spec.example}\``;
}

const [trueValue, falseValue] = BOOLEAN_VALUES;
const [durationValue] = DURATION_VALUES;
const [containValue, coverValue, fillValue, noneValue] = FIT_VALUES;
const [linearValue, easeInValue, easeOutValue, easeInOutValue] = EASING_VALUES;

export const VALUE_DOCS: Record<string, string> = {
  [trueValue]: `### \`${trueValue}\`\n**Type:** boolean\n\nRepresents a boolean true value.\n\n**Example:** \`loop: ${trueValue}\``,
  [falseValue]: `### \`${falseValue}\`\n**Type:** boolean\n\nRepresents a boolean false value.\n\n**Example:** \`collideBounds: ${falseValue}\``,
  [durationValue]: `### \`${durationValue}\`\n**Type:** duration\n\nA special duration keyword for \`physics\` blocks. Means the simulation runs forever with no time limit.\n\nOnly valid on a top-level \`physics\` block (not inside a \`sequence\`). An object using \`duration: ${durationValue}\` cannot have a \`sequence\` block, because the sequence can never activate.\n\n**Example:** \`duration: ${durationValue}\``,
  [containValue]: `### \`${containValue}\`\n**Type:** fit\n\nScales the scene to fit inside the preview window while preserving aspect ratio. The entire scene is visible, but there may be letterboxing.\n\n**Example:** \`fit: ${containValue}\``,
  [coverValue]: `### \`${coverValue}\`\n**Type:** fit\n\nScales the scene to cover the entire preview window while preserving aspect ratio. The scene may be cropped.\n\n**Example:** \`fit: ${coverValue}\``,
  [fillValue]: `### \`${fillValue}\`\n**Type:** fit\n\nStretches the scene to exactly fill the preview window, ignoring aspect ratio.\n\n**Example:** \`fit: ${fillValue}\``,
  [noneValue]: `### \`${noneValue}\`\n**Type:** fit\n\nDisables scaling; the scene is displayed at its original size.\n\n**Example:** \`fit: ${noneValue}\``,
  [linearValue]: `### \`${linearValue}\`\n**Type:** easing\n\nConstant speed animation. No acceleration or deceleration.\n\n**Example:** \`easing: ${linearValue}\``,
  [easeInValue]: `### \`${easeInValue}\`\n**Type:** easing\n\nStarts slow and accelerates towards the end. Useful for objects leaving the screen.\n\n**Example:** \`easing: ${easeInValue}\``,
  [easeOutValue]: `### \`${easeOutValue}\`\n**Type:** easing\n\nStarts fast and decelerates to a stop. Creates a natural landing effect.\n\n**Example:** \`easing: ${easeOutValue}\``,
  [easeInOutValue]: `### \`${easeInOutValue}\`\n**Type:** easing\n\nStarts slow, speeds up, then slows down. Gives a smooth, professional feel.\n\n**Example:** \`easing: ${easeInOutValue}\``,
};

const propertyPlaceholder = (blockName: ContractBlockName, property: string): string =>
  LANGUAGE_CONTRACT[blockName].properties[property]?.placeholder ?? "value";

export function physicsSnippet(inSequence: boolean): string {
  if (inSequence) {
    return `physics {\n\tduration: \${1:${propertyPlaceholder("animate", "duration")}}\n\tgravity: \${2:${propertyPlaceholder("physics", "gravity")}}\n\tairDrag: \${3:${propertyPlaceholder("physics", "airDrag")}}\n\tbounce: \${4:${propertyPlaceholder("physics", "bounce")}}\n\t$0\n}`;
  }
  return `physics {\n\tduration: \${1:${propertyPlaceholder("physics", "duration")}}\n\tvelocity: \${2:${propertyPlaceholder("physics", "velocity")}}\n\tgravity: \${3:${propertyPlaceholder("physics", "gravity")}}\n\tairDrag: \${4:${propertyPlaceholder("physics", "airDrag")}}\n\tbounce: \${5:${propertyPlaceholder("physics", "bounce")}}\n\t$0\n}`;
}

export { namedColors };
