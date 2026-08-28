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
  physics:   ["duration"],
  group:     [],
  sequence:  [],
  parallel:  [],
};

export const PROP_TYPES: Readonly<Record<string, Readonly<Record<string, PropContract>>>> = {
  scene:     { background: "color", size: "point", sceneFit: "sceneFit" },
  circle:    { position: "point", radius: "number", color: "color", alpha: "number", rotation: "number", scale: ["number", "point"], z: "number" },
  rectangle: { position: "point", size: "point",   color: "color", alpha: "number", rotation: "number", scale: ["number", "point"], z: "number" },
  polygon:   { position: "point", points: "pointList", color: "color", alpha: "number", rotation: "number", scale: ["number", "point"], z: "number" },
  line:      { position: "point", points: "pointList", thickness: "number", color: "color", alpha: "number", rotation: "number", scale: ["number", "point"], z: "number" },
  text:      { position: "point", content: "string", fontSize: "number", color: "color", alpha: "number", rotation: "number", scale: ["number", "point"], z: "number" },
  animate:   { property: "animProperty", to: ["number", "point"], duration: "number", easing: "easing", loop: "boolean", yoyo: "boolean", handOff: "boolean" },
  physics:   { velocity: "point", gravity: "point", airDrag: "number", bounce: "number", collideBounds: "boolean", duration: ["number", "indefinitely"] },
  group:     { position: "point", rotation: "number", scale: ["number", "point"], alpha: "number", z: "number" },
  sequence:  {},
  parallel:  {},
};

export const KIND_LABEL: Readonly<Record<PropKind, string>> = {
  number:       "a number",
  color:        "a color (hex code or named color keyword)",
  string:       "a quoted string",
  point:        "a point (x, y)",
  pointList:    "a point list [(x,y), ...]",
  sceneFit:     "a sceneFit keyword (contain, cover, fill, or none)",
  boolean:      "a boolean (true or false)",
  easing:       "an easing keyword (e.g. easeInOut, linear)",
  animProperty: "an animatable property name (e.g. position, rotation, scale, alpha)",
  indefinitely: "the keyword 'indefinitely'",
};

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
        if (!["position", "rotation", "scale", "alpha"].includes(p)) {
          errors.push({ phase: "TYPE", message: `[TYPE_ANIM_PROP] Cannot animate property '${p}'. Supported properties are: position, rotation, scale, alpha.`, line: propVal.line, col: propVal.col, endLine: propVal.endLine, endCol: propVal.endCol });
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

      const handOffVal = node.props["handOff"];
      if (handOffVal?.kind === "boolean" && handOffVal.value === true) {
        if (propVal?.kind === "animProperty" && propVal.value !== "position") {
          errors.push({ phase: "TYPE", message: `[TYPE_HANDOFF_PROP] 'handOff: true' is only valid on 'property: position' animations.`, line: handOffVal.line, col: handOffVal.col, endLine: handOffVal.endLine, endCol: handOffVal.endCol });
        }
        const loopVal = node.props["loop"];
        if (loopVal?.kind === "boolean" && loopVal.value === true) {
          errors.push({ phase: "TYPE", message: `[TYPE_HANDOFF_LOOP] 'loop: true' and 'handOff: true' cannot coexist. A looping animation never ends.`, line: handOffVal.line, col: handOffVal.col, endLine: handOffVal.endLine, endCol: handOffVal.endCol });
        }
        
        if (parentNode) {
          const physicsNode = parentNode.children.find(c => c.type === "physics");
          if (!physicsNode) {
            errors.push({ phase: "TYPE", message: `[TYPE_HANDOFF_PHYSICS] 'handOff: true' requires a sibling 'physics' block on the same object.`, line: handOffVal.line, col: handOffVal.col, endLine: handOffVal.endLine, endCol: handOffVal.endCol });
          } else if (physicsNode.props["velocity"] !== undefined) {
            const velNode = physicsNode.props["velocity"];
            errors.push({ phase: "TYPE", message: `[TYPE_HANDOFF_AMBIGUITY] When 'handOff: true' is used, the 'physics' block cannot define an initial 'velocity' because the animation's exit momentum will completely overwrite it. Remove 'velocity' from the physics block.`, line: velNode.line, col: velNode.col, endLine: velNode.endLine, endCol: velNode.endCol });
          }
        }
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

      const effectiveExpected = (typeName === "physics" && key === "duration")
        ? (["number", "indefinitely"] as readonly PropKind[])
        : expected;

      const isExpected = Array.isArray(effectiveExpected)
        ? (effectiveExpected as readonly string[]).includes(val.kind)
        : effectiveExpected === val.kind;

      if (!isExpected) {
        if (key === "sceneFit" && val.kind === "string") {
          errors.push({ phase: "TYPE", message: `${label}: 'sceneFit' must be an unquoted keyword. Remove the quotes around the value.`, ...errPos });
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

      if (key === "duration" && val.kind === "number") {
        if (val.value <= 0) errors.push({ phase: "TYPE", message: `${label}: 'duration' must be strictly greater than 0, but got ${val.value}.`, ...errPos });
      }
      if (key === "alpha" && val.kind === "number") {
        if (val.value < 0 || val.value > 1) errors.push({ phase: "TYPE", message: `${label}: 'alpha' must be between 0.0 and 1.0 inclusive, but got ${val.value}.`, ...errPos });
      }
      if ((key === "airDrag" || key === "bounce") && val.kind === "number") {
        if (val.value < 0 || val.value > 1) errors.push({ phase: "TYPE", message: `${label}: '${key}' must be between 0.0 and 1.0 inclusive, but got ${val.value}.`, ...errPos });
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
      if (key === "scale") {
        if (val.kind === "number" && val.value <= 0) {
          errors.push({ phase: "TYPE", message: `[TYPE_INVALID_SCALE] ${label}: 'scale' must be greater than zero.`, ...errPos });
        } else if (val.kind === "point" && (val.x <= 0 || val.y <= 0)) {
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
  return errors;
}