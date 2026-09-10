import type { AstNode, ObjectNode, AstValue, CompilerError } from "../types";
import {
  ANIMATABLE_PROPERTIES,
  KIND_LABEL,
  LANGUAGE_CONTRACT,
  LIST_ELEMENT_NOUN_PLURAL,
  listTooLargeCode,
  PROP_TYPES,
  REQUIRED_PROPS,
} from "../languageContract";
import type { PropertySpec } from "../languageContract";
import {
  countPhysicsCost,
  hasPhysicsDescendant,
  MAX_PHYSICS_BODIES,
  MAX_PHYSICS_PARTS,
  ownsPhysics,
} from "./physicsCost";
import { resolveHandoffTarget, yoyoIsTrue } from "./handoff";
// `secondsToTicks` lives in `../sceneIR.ts`, the pipeline-neutral module both
// the typeChecker and the renderer already import — not `renderer/clock.ts`,
// which would make the type-check stage reach into the render stage (Fix 4,
// Phase 3A review). It exists specifically so this comparison and the
// runtime's own (`sceneRuntime.ts`'s `spawnAnim`/`spawnPhysics`, via
// `clock.ts`'s re-export of the same function) share one implementation
// instead of a second `Math.round(seconds * 120)` drifting out of step.
import { secondsToTicks } from "../sceneIR";

type PropKind = AstValue["kind"];
type PropContract = PropKind | readonly PropKind[];

export { KIND_LABEL, PROP_TYPES, REQUIRED_PROPS } from "../languageContract";

function formatConstraintNumber(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

function formatPointCount(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

type ErrPos = Pick<CompilerError, "line" | "col" | "endLine" | "endCol">;

function errPosOf(val: AstValue): ErrPos {
  return { line: val.line, col: val.col, endLine: val.endLine, endCol: val.endCol };
}

/** `(1, 0)` for a point, `0` for a number — the value as the author wrote it. */
function scaleValueText(val: AstValue): string {
  return val.kind === "point" ? `(${val.x}, ${val.y})` : val.kind === "number" ? `${val.value}` : "";
}

function scaleHasZeroComponent(val: AstValue): boolean {
  if (val.kind === "number") return val.value === 0;
  if (val.kind === "point") return val.x === 0 || val.y === 0;
  return false;
}

/**
 * The sign half of the scale rule, in one place.
 *
 * Two call sites reach it: the `nonNegativeScale` contract arm below, for a
 * declared `scale` property, and `collectErrors`'s `animate` branch, for a
 * `property: scale` block's `to`. Before Phase 3C only the first existed, so
 * `to: (-3, 1)` compiled with zero errors while `scale: (-3, 1)` one line
 * above did not (design §2.2) — a rule enforced on the declaration site and
 * not on the property whose entire purpose is to change that value over time.
 * Bringing `to` under it is a narrowing, with the regression test §5.4
 * requires.
 *
 * `subject` is the noun phrase naming the offending value, so both frames read
 * as English either way: "'scale' cannot be negative, but got -2." and
 * "the scale target 'to' cannot have a negative component, but got (-3, 1)."
 *
 * The wording names *negativity* and says nothing about zero. It said "must be
 * greater than zero" until Phase 3C, which stopped being true when zero became
 * legal off the physics seam — and an author who read it wrote `scale: 0.001`,
 * the workaround this phase exists to delete (design §5.1). The
 * TYPE_INVALID_SCALE code is kept: the category (an unusable scale value) is
 * unchanged, and the code is what tooling greps for.
 */
function negativeScaleError(
  label: string,
  subject: string,
  val: AstValue,
): CompilerError | undefined {
  if (val.kind === "number" && val.value < 0) {
    return {
      phase: "TYPE",
      message: `[TYPE_INVALID_SCALE] ${label}: ${subject} cannot be negative, but got ${val.value}.`,
      ...errPosOf(val),
    };
  }
  if (val.kind === "point" && (val.x < 0 || val.y < 0)) {
    return {
      phase: "TYPE",
      message: `[TYPE_INVALID_SCALE] ${label}: ${subject} cannot have a negative component, but got (${val.x}, ${val.y}).`,
      ...errPosOf(val),
    };
  }
  return undefined;
}

/**
 * Why this object participates in physics, as a sentence naming the culprit —
 * or `null` if it does not participate and a zero scale is therefore harmless.
 *
 * The three clauses are design §2.4's, and each is a distinct hazard rather
 * than three spellings of one:
 *
 *  1. the object owns a body (`ownsPhysics`, so D13's sequence/parallel steps
 *     count) — `physicsWorld.setScale` clamps `|s| < 1e-4`, so this one is
 *     bounded rather than broken, but a silently degenerate collider is still
 *     not something to let an author write;
 *  2. it is inside a group that owns a body — its geometry is baked into that
 *     group's compound body by `builder.collectBodyParts`, and Matter's
 *     `Vertices.centre` divides a polygon part by its own area, which a zero
 *     scale makes zero;
 *  3. it is a group with a body beneath it — its scale composes into
 *     `__bodyTransform`, which `renderer/transform.ts`'s `toLocal` divides by.
 *
 * Clause 2 uses `ownsPhysics` rather than "has a direct `physics` child" so it
 * matches TYPE_LINE_PHYSICS's existing ancestor test and D13: a group whose
 * physics runs as a sequence step still welds its children into one body.
 * That choice is load-bearing and pinned — "rejects a zero scale under a group
 * whose physics is a sequence step" in validator.test.ts.
 *
 * The clause *order*, by contrast, is deliberately not pinned, and this is the
 * reason rather than an omission (AGENT-LESSONS §2d). Reordering the three
 * leaves the whole suite green, and no clean program can tell the difference:
 * two clauses can only match the same object when physics is nested inside
 * physics, which D17 already rejects with TYPE_PHYSICS_IN_PHYSICS_GROUP. Any
 * source that could distinguish the orders is invalid for another reason
 * first. Most-specific-first is kept because it blames the nearest cause.
 */
function physicsParticipationReason(
  node: ObjectNode,
  ancestors: readonly ObjectNode[],
): string | null {
  if (ownsPhysics(node)) {
    return `'${node.name}' declares 'physics', and a zero-scaled body has no usable collision geometry.`;
  }
  // Innermost first: the nearest enclosing physics group is the one whose body
  // this object's geometry is actually welded into.
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const anc = ancestors[i];
    if (anc.type === "group" && ownsPhysics(anc)) {
      return `'${node.name}' is inside group '${anc.name}', which declares 'physics' and bakes its children's geometry into one body.`;
    }
  }
  if (node.type === "group" && hasPhysicsDescendant(node)) {
    return `Group '${node.name}' contains an object with 'physics', and the group's scale is composed into that body's transform.`;
  }
  return null;
}

/**
 * The zero half of the scale rule. Negative is banned outright (see
 * `negativeScaleError`); zero is banned only where it reaches a divisor, which
 * is the physics seam and nothing else — design §2.3 established that PixiJS
 * inverts no matrix Marey can reach.
 */
function zeroScalePhysicsError(
  label: string,
  subject: string,
  val: AstValue,
  owner: ObjectNode,
  ownerAncestors: readonly ObjectNode[],
): CompilerError | undefined {
  if (!scaleHasZeroComponent(val)) return undefined;
  const reason = physicsParticipationReason(owner, ownerAncestors);
  if (reason === null) return undefined;
  const clause = val.kind === "point"
    ? "cannot have a zero component"
    : "cannot be zero";
  return {
    phase: "TYPE",
    message: `[TYPE_ZERO_SCALE_PHYSICS] ${label}: ${subject} ${clause} on an object that participates in physics, but got ${scaleValueText(val)}. ${reason}`,
    ...errPosOf(val),
  };
}

/**
 * Index in `ancestors` of the renderable that owns a block, skipping the
 * `sequence`/`parallel` wrappers D13 says are not owners; `-1` if the block
 * has no owning object at all (an `animate` or `physics` at the scene root,
 * which its own branch reports separately).
 */
function ownerIndex(ancestors: readonly ObjectNode[]): number {
  let i = ancestors.length - 1;
  while (i >= 0 && (ancestors[i].type === "sequence" || ancestors[i].type === "parallel")) {
    i--;
  }
  return i;
}

// Exported only as a test seam (validator.test.ts's "generic listOf path"
// describe block): no real contract entry gives `listOf` a non-point
// `element` today, so the generic branch below is otherwise unreachable
// through the normal parse -> typeCheck pipeline `collectErrors` drives.
// This function is otherwise still called exclusively from `collectErrors`
// in this file.
export function validateLocalConstraint(
  label: string,
  typeName: string,
  key: string,
  val: AstValue,
  spec: PropertySpec,
): CompilerError | undefined {
  const constraint = spec.constraint;
  if (!constraint) return undefined;

  const errPos = {
    line: val.line,
    col: val.col,
    endLine: val.endLine,
    endCol: val.endCol,
  };
  const error = (message: string): CompilerError => ({ phase: "TYPE", message, ...errPos });

  switch (constraint.kind) {
    case "range":
      if (val.kind === "number" && (val.value < constraint.min || val.value > constraint.max)) {
        return error(`${label}: '${key}' must be between ${formatConstraintNumber(constraint.min)} and ${formatConstraintNumber(constraint.max)} inclusive, but got ${val.value}.`);
      }
      return undefined;

    case "positive":
      if (val.kind === "number" && val.value <= 0) {
        if (key === "duration") {
          return error(`${label}: 'duration' must be strictly greater than 0, but got ${val.value}.`);
        }
        return error(`${label}: '${key}' must be greater than 0, but got ${val.value}.`);
      }
      return undefined;

    case "nonNegative":
      if (val.kind === "number" && val.value < 0) {
        return error(`${label}: '${key}' must be 0 or greater, but got ${val.value}.`);
      }
      return undefined;

    case "positivePoint":
      if (val.kind === "point") {
        if (val.x <= 0 && val.y <= 0) {
          return error(`${label}: '${key}' width and height must both be greater than 0.`);
        }
        if (val.x <= 0) {
          return error(`${label}: '${key}' width must be greater than 0, but got ${val.x}.`);
        }
        if (val.y <= 0) {
          return error(`${label}: '${key}' height must be greater than 0, but got ${val.y}.`);
        }
      }
      return undefined;

    // `scale` is the only property whose kind is `["number", "point"]` and
    // whose sign check differs by which of those two the value is — a plain
    // number gets one message, a point gets another, both carrying
    // TYPE_INVALID_SCALE. This used to be a bespoke `key === "scale"` branch
    // in `collectErrors` that short-circuited before ever reaching this
    // function, leaving `scale`'s `positivePoint` contract entry dead data
    // no consumer read.
    //
    // Only the *sign* rule is a local constraint, because it is the only half
    // of the rule a value can answer on its own. Zero depends on where the
    // object sits in the scene tree (TYPE_ZERO_SCALE_PHYSICS, applied in
    // `collectErrors` where the ancestor chain is in hand), which no
    // `LocalConstraint` can see.
    case "nonNegativeScale":
      return negativeScaleError(label, `'${key}'`, val);

    case "maxLength":
      if (val.kind === "string" && val.value.length > constraint.max) {
        return error(`[TYPE_TEXT_TOO_LONG] ${label}: '${key}' string is too long (${val.value.length} chars). Maximum allowed is ${constraint.max} characters to prevent rendering crashes.`);
      }
      return undefined;

    // One list kind, so a list's *element* rule is a contract constraint
    // rather than a parse error: `[...]` parses as a list of anything, and
    // `points` is the property that additionally requires every element to be
    // a point. The element check runs before the count checks because it is
    // the more informative diagnostic when both apply, and it reports at the
    // offending element's own span rather than the whole list's.
    case "listOf":
      if (val.kind === "list") {
        const badIdx = val.value.findIndex((el) => el.kind !== constraint.element);
        if (badIdx !== -1) {
          const el = val.value[badIdx];
          return {
            phase: "TYPE",
            message: `${label}: '${key}' expects a list where every element is ${KIND_LABEL[constraint.element]}, but element ${badIdx} is ${KIND_LABEL[el.kind]}.`,
            line: el.line, col: el.col, endLine: el.endLine, endCol: el.endCol,
          };
        }
        // The noun and the too-large diagnostic code both vary by element
        // kind (`LIST_ELEMENT_NOUN_PLURAL` / `listTooLargeCode` in
        // languageContract.ts), not hardcoded to "points" — see those two
        // exports' doc comments for why this was a real bug (a future
        // non-point `listOf` would have been told it needed more "points")
        // and why the too-large code stays `TYPE_POLYGON_TOO_LARGE` only for
        // `element: "point"`. `typeName` (not `key`) stays the subject of
        // the sentence unchanged from before this generic-ized version, to
        // keep the pinned polygon/line messages byte-for-byte identical.
        const noun = LIST_ELEMENT_NOUN_PLURAL[constraint.element];
        if (val.value.length < constraint.min) {
          return error(`${label}: '${typeName}' requires at least ${constraint.min} ${noun}.`);
        }
        // Currently unreachable through the ordinary parse -> typeCheck
        // pipeline: `parser/parseExpr.ts`'s `MAX_LIST_LENGTH` (10,000) throws
        // a parse error for any list literal — or range fold — over that
        // length before this function ever runs, and it is the identical
        // number as every `listOf` constraint's `max` in this file
        // (`polygon.points`, `line.points`; the only two `listOf` constraints
        // that exist), so a too-large `points:` list is always rejected at
        // parse time first. Kept rather than deleted, per this codebase's
        // standing practice for a currently-dead branch (see
        // `parser/parseExpr.ts` / `parser/state.ts` and
        // `docs/engineering-lessons.md` §2f): if the two ceilings are
        // ever changed independently, this is the fallback that still
        // produces the specific, coded diagnostic instead of a silent gap.
        if (val.value.length > constraint.max) {
          const code = listTooLargeCode(constraint.element);
          return error(`[${code}] ${label}: '${typeName}' exceeds the maximum safe limit of ${formatPointCount(constraint.max)} ${noun}.`);
        }
      }
      return undefined;

    default: {
      const _never: never = constraint;
      return _never;
    }
  }
}

export function collectErrors(ast: AstNode): CompilerError[] {
  const errors: CompilerError[] = [];
  const MAX_TEXT_NODES = 500;
  let textNodeCount = 0;

  function checkNode(
    node: AstNode,
    parentNode: AstNode | null = null,
    parentType: string | null = null,
    ancestors: ObjectNode[] = []
  ): void {
    if (errors.length >= 50) return;

    const typeName = node.type;
    const isScene  = typeName === "scene";
    const nodeName = isScene ? "scene" : (node as ObjectNode).name;
    const isUseBlock = !isScene && (node as ObjectNode).isUse;

    const label = isScene
        ? "The scene block"
        : typeName === "animate" || typeName === "physics" || typeName === "sequence" || typeName === "parallel"
        ? `The '${typeName}' block`
        : `'${isUseBlock ? "use" : typeName}' ${isUseBlock ? "block" : "object"} '${nodeName}'`;

    const required = REQUIRED_PROPS[typeName] ?? [];
    const contract = PROP_TYPES[typeName]    ?? {};

    // `physics.duration` accepts `indefinitely`, so an author will try it here.
    // A named diagnostic beats the generic kind mismatch the contract would
    // otherwise produce, because the fix is not "write a different value" — it
    // is "write no value at all", which no type error can suggest. The property
    // loop below skips 'duration' on the same condition (see its own comment)
    // so this fires exactly once rather than alongside a second, generic
    // kind-mismatch diagnostic for the same value.
    const sceneDurationVal = node.props["duration"];
    if (isScene && sceneDurationVal?.kind === "indefinitely") {
      errors.push({
        phase: "TYPE",
        message: "[TYPE_SCENE_DURATION_INDEFINITE] The scene block: 'duration' does not accept 'indefinitely'. A scene with no fixed length is written by leaving 'duration' out — omit 'duration' instead.",
        ...errPosOf(sceneDurationVal),
      });
    }

    if (typeName === "text") {
      textNodeCount++;
      if (textNodeCount > MAX_TEXT_NODES) {
        errors.push({
          phase: "TYPE",
          message: `[TYPE_TEXT_LIMIT] Scene contains too many 'text' objects (${textNodeCount}). Maximum allowed is ${MAX_TEXT_NODES} to prevent VRAM exhaustion and browser crashes.`,
          line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol
        });
        return;
      }
    }

    const seqChildren = node.children.filter(c => c.type === "sequence");
    if (seqChildren.length > 1) {
      errors.push({
        phase: "TYPE",
        message: `[TYPE_ONE_STORY] An object can have a maximum of one 'sequence' block. Found ${seqChildren.length} on '${nodeName}'. Please combine them into a single timeline.`,
        line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol
      });
    }

    // Only the first direct 'physics' child reaches the IR — typeChecker/builder.ts
    // uses `.find` for physics where it uses `.filter` for animate — so a second
    // one is silent data loss, not a runtime race. The existing
    // TYPE_HANDOFF_SCHEDULE_AMBIGUOUS rule covers only the shape where a
    // handoff animation is also present; this covers the general case, and both
    // diagnostics are allowed to fire on the same object (as TYPE_ONE_STORY and a
    // sequence's own "must be inside a renderable" check already do elsewhere).
    // Sequences and parallels are excluded: a timeline step's physics children are
    // built by buildSequencesFromChildren (typeChecker/builder.ts) with a plain
    // loop, not `.find`, so two sequential (or two parallel) physics phases build
    // correctly today and are not the defect this rule guards against.
    if (typeName !== "sequence" && typeName !== "parallel") {
      const directPhysics = node.children.filter((c) => c.type === "physics");
      if (directPhysics.length > 1) {
        errors.push({
          phase: "TYPE",
          message: `[TYPE_ONE_PHYSICS] An object can have a maximum of one 'physics' block. Found ${directPhysics.length} on '${nodeName}'. Only the first would simulate; the rest would be silently discarded.`,
          line: directPhysics[1].line, col: directPhysics[1].col,
          endLine: directPhysics[1].endLine, endCol: directPhysics[1].endCol,
        });
      }
    }

    if (typeName === "sequence" || typeName === "parallel") {
      const isParallel = typeName === "parallel";

      if (isParallel) {
        const isValidParent = parentType === "sequence";
        if (!isValidParent) {
          errors.push({
            phase: "TYPE",
            message: "A 'parallel' block must be placed directly inside a 'sequence' block.",
            line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol,
          });
        }
      } else {
        const isValidParent = parentType !== null
          && parentType !== "scene"
          && parentType !== "animate"
          && parentType !== "physics"
          && parentType !== "sequence"
          && parentType !== "parallel";
        if (!isValidParent) {
          errors.push({
            phase: "TYPE",
            message: "A 'sequence' block must be placed inside a renderable object (e.g., circle, group), not at the scene root or inside another sequence.",
            line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol,
          });
        }
      }

      const blockChildren = (node as ObjectNode).children;
      const validTarget = isParallel ? "animate' or 'physics" : "animate', 'physics', or 'parallel";
      
      const hasValidChild = blockChildren.some(c => 
        c.type === "animate" || c.type === "physics" || (!isParallel && c.type === "parallel")
      );
      
      if (!hasValidChild) {
        errors.push({
          phase: "TYPE",
          message: `A '${typeName}' block must contain at least one '${validTarget}' child.`,
          line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol,
        });
      }

      for (const child of blockChildren) {
        if (child.type === "animate") {
          const loopVal = child.props["loop"];
          if (loopVal?.kind === "boolean" && loopVal.value === true) {
            errors.push({
              phase: "TYPE",
              message: `[TYPE_SEQ_LOOP] 'loop: true' is not allowed inside a '${typeName}' block — a looping animation never finishes and would prevent the timeline from advancing.`,
              line: loopVal.line, col: loopVal.col, endLine: loopVal.endLine, endCol: loopVal.endCol,
            });
          }
          // Unlike TYPE_SEQ_LOOP above, this rule no longer rests on a yoyo
          // never finishing — a top-level non-looping yoyo completes after its
          // return leg (P3A-10). It stays because a step is one leg of a
          // timeline: a step whose runtime silently doubles is a step whose
          // schedule the reader cannot see, and the two-step form is both
          // explicit and already supported.
          const yoyoVal = child.props["yoyo"];
          if (yoyoVal?.kind === "boolean" && yoyoVal.value === true) {
            errors.push({
              phase: "TYPE",
              message: "[TYPE_SEQ_YOYO] 'yoyo: true' is not supported inside a sequence or parallel step. Express the return leg as a second explicit animation step.",
              line: yoyoVal.line, col: yoyoVal.col, endLine: yoyoVal.endLine, endCol: yoyoVal.endCol,
            });
          }
        }
        if (child.type === "physics") {
          const durVal = child.props["duration"];
          if (!durVal) {
            errors.push({
              phase: "TYPE",
              message: `[TYPE_SEQ_PHYSICS_DUR] A 'physics' block inside a '${typeName}' requires a numeric 'duration'. Add 'duration: <seconds>'.`,
              line: child.line, col: child.col, endLine: child.endLine, endCol: child.endCol,
            });
          } else if (durVal.kind === "indefinitely") {
            errors.push({
              phase: "TYPE",
              message: `[TYPE_SEQ_PHYSICS_INDEFINITELY] 'duration: indefinitely' is not allowed inside a '${typeName}' block — the simulation would never finish, so the timeline could never advance. Use a numeric duration instead.`,
              line: durVal.line, col: durVal.col, endLine: durVal.endLine, endCol: durVal.endCol,
            });
          }
        }
      }

      for (const child of blockChildren) {
        checkNode(child, node as AstNode, typeName, [...ancestors, node as ObjectNode]);
      }
      return;
    }

    if (typeName === "physics") {
      if (parentType === "scene") {
        errors.push({ phase: "TYPE", message: "A 'physics' block must be placed inside a renderable object, not at the root of the scene.", line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol });
      }
      // D17: a body inside a group needs its ancestor chain composed in at
      // bind time, which is only sound while that chain is constant. A group
      // that declares physics welds its children into its own body instead, and
      // a group that animates would make the composed transform stale.
      //
      // `ancestors` is every enclosing object, so a physics block reached
      // through a `sequence` or `parallel` is covered by the same walk.
      //
      // The owner is exempt: this block *is* the group's own physics, and a
      // group is allowed — indeed required — to declare physics on itself.
      // Per D13 a `sequence`/`parallel` wrapper is not an owner, so skip past
      // those to find the renderable object the block actually belongs to.
      const ownerIdx = ownerIndex(ancestors);

      for (let i = ownerIdx - 1; i >= 0; i--) {
        const anc = ancestors[i];
        if (anc.type !== "group") continue;

        const ancHasPhysics = anc.children.some((c) => c.type === "physics");
        const ancAnimates = anc.children.some(
          (c) => c.type === "animate" || c.type === "sequence"
        );

        if (ancHasPhysics) {
          errors.push({
            phase: "TYPE",
            message: `[TYPE_PHYSICS_IN_PHYSICS_GROUP] Group '${anc.name}' already declares physics, so its children are welded into its body and cannot simulate separately. Remove this 'physics' block.`,
            line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol,
          });
          break;
        }
        if (ancAnimates) {
          errors.push({
            phase: "TYPE",
            message: `[TYPE_PHYSICS_IN_ANIMATED_GROUP] Group '${anc.name}' is animated, so a physics body inside it cannot be placed deterministically. Move the 'physics' block onto '${anc.name}', or remove its animation.`,
            line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol,
          });
          break;
        }
      }

      const durVal = node.props["duration"];
      if (durVal?.kind === "indefinitely") {
        if (parentNode && parentNode.children.some(c => c.type === "sequence")) {
          errors.push({
            phase: "TYPE",
            message: "[TYPE_INDEFINITELY_WITH_SEQ] 'duration: indefinitely' cannot be used on an object that also has a 'sequence' block, because the sequence can never activate after an indefinite simulation.",
            line: durVal.line, col: durVal.col, endLine: durVal.endLine, endCol: durVal.endCol,
          });
        }
      }
    }

    if (typeName === "animate") {
      if (parentType === "scene") {
        errors.push({ phase: "TYPE", message: "An 'animate' block must be placed inside a renderable object (e.g., circle, group, etc.), not at the root of the scene.", line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol });
      }

      const propVal = node.props["property"];
      const toVal = node.props["to"];

      if (propVal && toVal && propVal.kind === "animProperty") {
        const p = propVal.value as string;
        if (!(ANIMATABLE_PROPERTIES as readonly string[]).includes(p)) {
          errors.push({ phase: "TYPE", message: `[TYPE_ANIM_PROP] Cannot animate property '${p}'. Supported properties are: ${ANIMATABLE_PROPERTIES.join(", ")}.`, line: propVal.line, col: propVal.col, endLine: propVal.endLine, endCol: propVal.endCol });
        }
        if (p === "position" && toVal.kind !== "point") {
          errors.push({ phase: "TYPE", message: `[TYPE_ANIM_MISMATCH] Property 'position' expects a point for 'to' (e.g., to: (100, 100)).`, line: toVal.line, col: toVal.col, endLine: toVal.endLine, endCol: toVal.endCol });
        }
        if (p === "scale" && toVal.kind !== "point" && toVal.kind !== "number") {
          errors.push({ phase: "TYPE", message: `[TYPE_ANIM_MISMATCH] Property 'scale' expects a number or point for 'to'.`, line: toVal.line, col: toVal.col, endLine: toVal.endLine, endCol: toVal.endCol });
        }
        if ((p === "rotation" || p === "alpha") && toVal.kind !== "number") {
          errors.push({ phase: "TYPE", message: `[TYPE_ANIM_MISMATCH] Property '${p}' expects a number for 'to'.`, line: toVal.line, col: toVal.col, endLine: toVal.endLine, endCol: toVal.endCol });
        }

        // A `to` reaches exactly the same runtime state a declared `scale`
        // does, so both scale rules apply to it (design §5.3). Until Phase 3C
        // this block validated `to` by *kind* alone, which is why the ban on
        // the declaration site was never an invariant: `to: (-3, 1)` and
        // `to: (1, 0)` both compiled.
        if (p === "scale") {
          const signError = negativeScaleError(label, "the scale target 'to'", toVal);
          if (signError) errors.push(signError);

          // Zero is a question about the *object*, not the animate block, so
          // it needs the renderable this block belongs to — which is not
          // necessarily `parentNode`, because a `sequence`/`parallel` may sit
          // between them (D13).
          const ownerIdx = ownerIndex(ancestors);
          if (ownerIdx >= 0) {
            const zeroError = zeroScalePhysicsError(
              label,
              "the scale target 'to'",
              toVal,
              ancestors[ownerIdx],
              ancestors.slice(0, ownerIdx),
            );
            if (zeroError) errors.push(zeroError);
          }
        }
      }

      const handoffVal = node.props["handoff"];
      if (handoffVal?.kind === "boolean" && handoffVal.value === true) {
        if (propVal?.kind === "animProperty" && propVal.value !== "position") {
          errors.push({ phase: "TYPE", message: `[TYPE_HANDOFF_PROP] 'handoff: true' is only valid on 'property: position' animations.`, line: handoffVal.line, col: handoffVal.col, endLine: handoffVal.endLine, endCol: handoffVal.endCol });
        }
        const loopVal = node.props["loop"];
        if (loopVal?.kind === "boolean" && loopVal.value === true) {
          errors.push({ phase: "TYPE", message: `[TYPE_HANDOFF_LOOP] 'loop: true' and 'handoff: true' cannot coexist. A looping animation never ends.`, line: handoffVal.line, col: handoffVal.col, endLine: handoffVal.endLine, endCol: handoffVal.endCol });
        }

        const target = resolveHandoffTarget(node as ObjectNode, parentNode, ancestors);
        if (!target) {
          errors.push({ phase: "TYPE", message: `[TYPE_HANDOFF_PHYSICS] 'handoff: true' requires a sibling 'physics' block on the same object.`, line: handoffVal.line, col: handoffVal.col, endLine: handoffVal.endLine, endCol: handoffVal.endCol });
        } else if (target.ambiguousPhysics) {
          // More than one 'physics' block starts alongside this handoff.
          // Each spawns its own PhysicsRunner against the same body, and
          // whichever freezes first is the one that matters — checking a
          // duration relationship against only the first one `find` happens
          // to return would validate the wrong runner. Reject rather than
          // pick a runner to model, matching this validator's existing
          // conservative posture (D13's explicit-body rule).
          errors.push({
            phase: "TYPE",
            message: `[TYPE_HANDOFF_SCHEDULE_AMBIGUOUS] This object starts more than one 'physics' block at the same time as the handoff animation, so it is not clear which one determines when the body freezes. 'handoff: true' requires exactly one concurrent 'physics' block.`,
            line: handoffVal.line, col: handoffVal.col, endLine: handoffVal.endLine, endCol: handoffVal.endCol,
          });
        } else if (target.ambiguousPosAnim) {
          // More than one position animation starts alongside this handoff.
          // Every position animation holds the body's POS_ANIM pin reason for
          // its own duration, reason-counted — two holds need two releases.
          // If the other one is still running when this handoff completes,
          // the body stays pinned, and if the physics runner freezes in that
          // window the parked velocity is never flushed. This is the exact
          // defect confirmed live in Phase 3A's review.
          errors.push({
            phase: "TYPE",
            message: `[TYPE_HANDOFF_SCHEDULE_AMBIGUOUS] This object starts more than one 'property: position' animation at the same time as the handoff, so it is not clear which one releases the body last. 'handoff: true' requires the handoff animation to be the only concurrent position animation.`,
            line: handoffVal.line, col: handoffVal.col, endLine: handoffVal.endLine, endCol: handoffVal.endCol,
          });
        } else {
          const velNode = target.physics.props["velocity"];
          if (velNode !== undefined) {
            errors.push({ phase: "TYPE", message: `[TYPE_HANDOFF_AMBIGUITY] When 'handoff: true' is used, the 'physics' block cannot define an initial 'velocity' because the animation's exit momentum will completely overwrite it. Remove 'velocity' from the physics block.`, line: velNode.line, col: velNode.col, endLine: velNode.endLine, endCol: velNode.endCol });
          }

          const animDuration = node.props["duration"];
          const physicsDuration = target.physics.props["duration"];
          if (
            target.scheduling === "concurrent" &&
            animDuration?.kind === "number" &&
            physicsDuration?.kind === "number"
          ) {
            const yoyoMultiplier = yoyoIsTrue(node as ObjectNode) ? 2 : 1;
            // Seconds, for the human-readable message only.
            const effectiveAnimDuration = animDuration.value * yoyoMultiplier;
            // Ticks, for the actual pass/fail decision — the runtime never
            // compares seconds. `secondsToTicks` is the same function
            // `spawnAnim`/`spawnPhysics` (sceneRuntime.ts) convert with, so a
            // physics duration whose *tick count* does not clear the
            // animation's cannot slip through just because it is larger in
            // seconds: Math.round(1 * 120) === Math.round(1.001 * 120), and
            // the runtime writes the pending velocity and freezes the body on
            // that same tick.
            const effectiveAnimDurationTicks = secondsToTicks(animDuration.value) * yoyoMultiplier;
            const physicsDurationTicks = secondsToTicks(physicsDuration.value);
            if (physicsDurationTicks <= effectiveAnimDurationTicks) {
              errors.push({
                phase: "TYPE",
                message: `[TYPE_HANDOFF_DURATION] The receiving physics duration (${physicsDuration.value}s) must be greater than the handoff animation runtime (${effectiveAnimDuration}s).`,
                line: physicsDuration.line, col: physicsDuration.col, endLine: physicsDuration.endLine, endCol: physicsDuration.endCol,
              });
            }
          }
        }
      }
    }

    if (typeName === "line") {
      const hasPhysicalGroupAncestor = ancestors.some(
        (ancestor) => ancestor.type === "group" && ownsPhysics(ancestor)
      );
      if (ownsPhysics(node as ObjectNode) || hasPhysicalGroupAncestor) {
        errors.push({
          phase: "TYPE",
          message: `[TYPE_LINE_PHYSICS] Line '${nodeName}' cannot have physics because lines do not produce collision geometry.`,
          line: node.line,
          col: node.col,
          endLine: node.endLine,
          endCol: node.endCol,
        });
      }
    }

    for (const prop of required) {
      if (!(prop in node.props)) {
        errors.push({ phase: "TYPE", message: `${label} is missing the required property '${prop}'.`, line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol });
      }
    }

    for (const [key, val] of Object.entries(node.props)) {
      const expected = contract[key];
      const errPos = { line: val.line, col: val.col, endLine: val.endLine, endCol: val.endCol };

      if (expected === undefined) {
        if (typeName === "group" && key === "origin") {
          errors.push({ phase: "TYPE", message: `[TYPE_ORIGIN_ON_GROUP] ${label} cannot set 'origin': a group's origin is its own local (0, 0), not a fraction of a bounding box, so place its children relative to that point instead.`, ...errPos });
          continue;
        }
        const knownList = Object.keys(contract).map((k) => `'${k}'`).join(", ");
        errors.push({ phase: "TYPE", message: `${label} has an unknown property '${key}'. Valid properties for '${typeName}' are: ${knownList}.`, ...errPos });
        continue;
      }

      const effectiveExpected: PropContract = expected;

      const isExpected = Array.isArray(effectiveExpected)
        ? (effectiveExpected as readonly string[]).includes(val.kind)
        : effectiveExpected === val.kind;

      if (!isExpected) {
        if (isScene && key === "duration" && val.kind === "indefinitely") {
          // Already reported above as TYPE_SCENE_DURATION_INDEFINITE, whose
          // wording names the fix ("omit 'duration' instead"); the generic
          // kind-mismatch message below would only say "expects a number",
          // which cannot suggest that. Skip it so this value gets exactly one
          // diagnostic instead of two describing the same problem.
          continue;
        }
        if (key === "fit" && val.kind === "string") {
          errors.push({ phase: "TYPE", message: `${label}: 'fit' must be an unquoted keyword. Remove the quotes around the value.`, ...errPos });
        } else if (val.kind === "string" && (!Array.isArray(effectiveExpected) && effectiveExpected !== "string")) {
          const expStr = Array.isArray(effectiveExpected)
            ? (effectiveExpected as readonly PropKind[]).map(e => KIND_LABEL[e] ?? e).join(" or ")
            : KIND_LABEL[effectiveExpected as PropKind] ?? effectiveExpected;
          errors.push({ phase: "TYPE", message: `${label}: property '${key}' expects ${expStr}, but a quoted string was given.`, ...errPos });
        } else {
          const expStr = Array.isArray(effectiveExpected)
            ? (effectiveExpected as readonly PropKind[]).map(e => KIND_LABEL[e] ?? e).join(" or ")
            : KIND_LABEL[effectiveExpected as PropKind] ?? effectiveExpected;
          errors.push({ phase: "TYPE", message: `${label}: property '${key}' expects ${expStr}, but got ${KIND_LABEL[val.kind] ?? val.kind}.`, ...errPos });
        }
        continue;
      }

      // `scale`'s sign check (TYPE_INVALID_SCALE) is a `nonNegativeScale`
      // constraint like any other property's — see validateLocalConstraint —
      // rather than a bespoke branch here that never consulted the contract.
      const spec = LANGUAGE_CONTRACT[typeName as keyof typeof LANGUAGE_CONTRACT]?.properties[key];
      const localError = spec
        ? validateLocalConstraint(label, typeName, key, val, spec)
        : undefined;
      if (localError) errors.push(localError);

      // The other half of the scale rule. It cannot be a `LocalConstraint`
      // like the sign check above, because whether a zero component is legal
      // depends on the object's place in the scene tree rather than on the
      // value — `validateLocalConstraint` sees neither the node nor its
      // ancestors. `scale` is not on the scene block, so `node` is an
      // ObjectNode wherever this fires.
      if (key === "scale" && !isScene) {
        const zeroError = zeroScalePhysicsError(
          label, `'${key}'`, val, node as ObjectNode, ancestors,
        );
        if (zeroError) errors.push(zeroError);
      }
    }

    const hasVisualChildren = node.children.some(
      c => c.type !== "animate" && c.type !== "physics" && c.type !== "sequence" && c.type !== "parallel"
    );

    if (!isScene && typeName !== "group" && hasVisualChildren) {
      errors.push({ phase: "TYPE", message: `${label} contains nested visual objects, but only 'group' blocks may have visual children.`, line: node.line, col: node.col, endLine: node.endLine, endCol: node.endCol });
    }

    const childAncestors = isScene ? ancestors : [...ancestors, node as ObjectNode];
    for (const c of node.children) {
      if (c.type !== "sequence" && c.type !== "parallel") {
        checkNode(c, node as AstNode, typeName, childAncestors);
      } else {
        checkNode(c, node as AstNode, typeName, childAncestors);
      }
    }
  }

  checkNode(ast);

  const physicsCost = countPhysicsCost(ast);
  if (physicsCost.bodyLimitNode !== null && errors.length < 50) {
    errors.push({
      phase: "TYPE",
      message: `[TYPE_PHYSICS_BODY_LIMIT] Scene contains too many physics bodies (${formatPointCount(physicsCost.bodies)}). Maximum allowed is ${formatPointCount(MAX_PHYSICS_BODIES)}.`,
      line: physicsCost.bodyLimitNode.line,
      col: physicsCost.bodyLimitNode.col,
      endLine: physicsCost.bodyLimitNode.endLine,
      endCol: physicsCost.bodyLimitNode.endCol,
    });
  }
  if (physicsCost.partLimitNode !== null && errors.length < 50) {
    errors.push({
      phase: "TYPE",
      message: `[TYPE_PHYSICS_PART_LIMIT] Scene contains too many physics collision parts (${formatPointCount(physicsCost.parts)}). Maximum allowed is ${formatPointCount(MAX_PHYSICS_PARTS)}.`,
      line: physicsCost.partLimitNode.line,
      col: physicsCost.partLimitNode.col,
      endLine: physicsCost.partLimitNode.endLine,
      endCol: physicsCost.partLimitNode.endCol,
    });
  }

  return errors;
}
