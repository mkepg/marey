import type { AstNode, ObjectNode, AstValue, CompilerError } from "../types";
import {
  ANIMATABLE_PROPERTIES,
  KIND_LABEL,
  LANGUAGE_CONTRACT,
  PROP_TYPES,
  REQUIRED_PROPS,
} from "../languageContract";
import type { PropertySpec } from "../languageContract";
import {
  countPhysicsCost,
  MAX_PHYSICS_BODIES,
  MAX_PHYSICS_PARTS,
  ownsPhysics,
} from "./physicsCost";

type PropKind = AstValue["kind"];
type PropContract = PropKind | readonly PropKind[];

export { KIND_LABEL, PROP_TYPES, REQUIRED_PROPS } from "../languageContract";

function formatConstraintNumber(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

function formatPointCount(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function validateLocalConstraint(
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

    case "maxLength":
      if (val.kind === "string" && val.value.length > constraint.max) {
        return error(`[TYPE_TEXT_TOO_LONG] ${label}: '${key}' string is too long (${val.value.length} chars). Maximum allowed is ${constraint.max} characters to prevent rendering crashes.`);
      }
      return undefined;

    case "pointCount":
      if (val.kind === "pointList") {
        if (val.value.length < constraint.min) {
          return error(`${label}: '${typeName}' requires at least ${constraint.min} points.`);
        }
        if (val.value.length > constraint.max) {
          return error(`[TYPE_POLYGON_TOO_LARGE] ${label}: '${typeName}' exceeds the maximum safe limit of ${formatPointCount(constraint.max)} points.`);
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
          const yoyoVal = child.props["yoyo"];
          if (yoyoVal?.kind === "boolean" && yoyoVal.value === true) {
            errors.push({
              phase: "TYPE",
              message: `[TYPE_SEQ_YOYO] 'yoyo: true' is not allowed inside a '${typeName}' block — a yoyo animation never fully finishes and would prevent the timeline from advancing.`,
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
      let ownerIdx = ancestors.length - 1;
      while (
        ownerIdx >= 0 &&
        (ancestors[ownerIdx].type === "sequence" || ancestors[ownerIdx].type === "parallel")
      ) {
        ownerIdx--;
      }

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
        
        if (parentNode) {
          const physicsNode = parentNode.children.find(c => c.type === "physics");
          if (!physicsNode) {
            errors.push({ phase: "TYPE", message: `[TYPE_HANDOFF_PHYSICS] 'handoff: true' requires a sibling 'physics' block on the same object.`, line: handoffVal.line, col: handoffVal.col, endLine: handoffVal.endLine, endCol: handoffVal.endCol });
          } else if (physicsNode.props["velocity"] !== undefined) {
            const velNode = physicsNode.props["velocity"];
            errors.push({ phase: "TYPE", message: `[TYPE_HANDOFF_AMBIGUITY] When 'handoff: true' is used, the 'physics' block cannot define an initial 'velocity' because the animation's exit momentum will completely overwrite it. Remove 'velocity' from the physics block.`, line: velNode.line, col: velNode.col, endLine: velNode.endLine, endCol: velNode.endCol });
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
        const knownList = Object.keys(contract).map((k) => `'${k}'`).join(", ");
        errors.push({ phase: "TYPE", message: `${label} has an unknown property '${key}'. Valid properties for '${typeName}' are: ${knownList}.`, ...errPos });
        continue;
      }

      const effectiveExpected: PropContract = expected;

      const isExpected = Array.isArray(effectiveExpected)
        ? (effectiveExpected as readonly string[]).includes(val.kind)
        : effectiveExpected === val.kind;

      if (!isExpected) {
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

      if (key === "scale") {
        if (val.kind === "number" && val.value <= 0) {
          errors.push({ phase: "TYPE", message: `[TYPE_INVALID_SCALE] ${label}: 'scale' must be greater than zero.`, ...errPos });
        } else if (val.kind === "point" && (val.x <= 0 || val.y <= 0)) {
          errors.push({ phase: "TYPE", message: `[TYPE_INVALID_SCALE] ${label}: 'scale' components must be greater than zero, but got (${val.x}, ${val.y}).`, ...errPos });
        }
      } else {
        const spec = LANGUAGE_CONTRACT[typeName as keyof typeof LANGUAGE_CONTRACT]?.properties[key];
        const localError = spec
          ? validateLocalConstraint(label, typeName, key, val, spec)
          : undefined;
        if (localError) errors.push(localError);
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
