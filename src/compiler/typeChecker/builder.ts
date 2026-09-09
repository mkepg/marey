import type { AstNode, ObjectNode, PointValue } from "../types";
import type {
  IRSceneNode,
  IRObjectNode,
  IRObjectId,
  IRObjectProps,
  IRCircleProps,
  IRRectangleProps,
  IRPolygonProps,
  IRLineProps,
  IRTextProps,
  IRGroupProps,
  IRTransform,
  IRAnimation,
  IRPhysics,
  IRPhysicsDuration,
  IRSequence,
  IRSequenceStep,
  IRParallelStep,
} from "../sceneIR";
import {
  resolveColor,
  resolveNumber,
  resolvePoint,
  resolveScale,
  resolveFit,
  resolveBoolean,
  resolveEasing,
  getReqAnimProperty,
  resolveAnimToValue,
  getReqNumber,
  getReqPoint,
  getReqString,
  getReqPointList,
  contractBooleanDefault,
  contractNumberDefault,
  contractPointDefault,
  contractStringDefault,
  contractDerivedPositionDefault,
} from "./resolvers";

function buildAnimationFromNode(an: ObjectNode): IRAnimation {
  return {
    property: getReqAnimProperty(an.props, "property"),
    to:       resolveAnimToValue(an.props, "to"),
    duration: getReqNumber(an.props, "duration"),
    delay:    resolveNumber(an.props, "delay", contractNumberDefault("animate", "delay")),
    easing:   resolveEasing(an.props, "easing", contractStringDefault("animate", "easing")),
    loop:     resolveBoolean(an.props, "loop", contractBooleanDefault("animate", "loop")),
    yoyo:     resolveBoolean(an.props, "yoyo", contractBooleanDefault("animate", "yoyo")),
    handoff:  resolveBoolean(an.props, "handoff", contractBooleanDefault("animate", "handoff")),
  };
}

function buildPhysicsFromNode(physicsNode: ObjectNode): IRPhysics {
  const pp = physicsNode.props;
  const durVal = pp["duration"];
  let duration: IRPhysicsDuration;

  if (durVal?.kind === "indefinitely") {
    duration = "indefinitely";
  } else {
    duration = getReqNumber(pp, "duration");
  }

  return {
    velocity:      resolvePoint(pp, "velocity", contractPointDefault("physics", "velocity")),
    gravity:       resolvePoint(pp, "gravity", contractPointDefault("physics", "gravity")),
    airDrag:       resolveNumber(pp, "airDrag", contractNumberDefault("physics", "airDrag")),
    bounce:        resolveNumber(pp, "bounce", contractNumberDefault("physics", "bounce")),
    collideBounds: resolveBoolean(pp, "collideBounds", contractBooleanDefault("physics", "collideBounds")),
    duration,
  };
}

function buildSequencesFromChildren(children: ObjectNode[]): ReadonlyArray<IRSequence> {
  const seqNodes = children.filter(c => c.type === "sequence");
  return seqNodes.map((seqNode): IRSequence => {
    const steps: IRSequenceStep[] = [];
    
    for (const child of seqNode.children) {
      if (child.type === "animate") {
        steps.push(buildAnimationFromNode(child));
      } else if (child.type === "physics") {
        steps.push(buildPhysicsFromNode(child));
      } else if (child.type === "parallel") {
        const parallelSteps: (IRAnimation | IRPhysics)[] = [];
        for (const pChild of child.children) {
          if (pChild.type === "animate") {
            parallelSteps.push(buildAnimationFromNode(pChild));
          } else if (pChild.type === "physics") {
            parallelSteps.push(buildPhysicsFromNode(pChild));
          }
        }
        
        const parallelStep: IRParallelStep = { 
          type: "parallel", 
          steps: Object.freeze(parallelSteps) 
        };
        steps.push(parallelStep);
      }
    }
    
    return { steps: Object.freeze(steps) };
  });
}

export function buildIR(ast: AstNode): IRSceneNode {
  const registry: Record<IRObjectId, IRObjectNode> = {};

  function buildObjectNode(node: ObjectNode, scopePath: string): IRObjectNode {
    if (node.type === "animate" || node.type === "physics" || node.type === "sequence" || node.type === "parallel") {
      throw new Error(`[IR] '${node.type}' nodes should not be passed directly to buildObjectNode`);
    }

    const id: IRObjectId = scopePath;
    const p = node.props;

    const animNodes   = node.children.filter(c => c.type === "animate");
    const physicsNode = node.children.find(c => c.type === "physics");
    
    const visualNodes = node.children.filter(
      c => c.type !== "animate" && c.type !== "physics" && c.type !== "sequence" && c.type !== "parallel"
    );

    const animations: IRAnimation[] = animNodes.map(buildAnimationFromNode);

    let physics: IRPhysics | undefined;
    if (physicsNode) {
      physics = buildPhysicsFromNode(physicsNode);
    }

    const sequences = buildSequencesFromChildren(node.children);

    let props: IRObjectProps;

    switch (node.type) {
      case "circle": {
        const circleProps: IRCircleProps = {
          kind:      "circle",
          position:  getReqPoint(p, "position"),
          radius:    getReqNumber(p, "radius"),
          color:     resolveColor(p, "color", contractStringDefault("circle", "color")),
          alpha:     resolveNumber(p, "alpha", contractNumberDefault("circle", "alpha")),
          rotation:  resolveNumber(p, "rotation", contractNumberDefault("circle", "rotation")),
          scale:     resolveScale(p, "scale", contractPointDefault("circle", "scale")),
          layer:     resolveNumber(p, "layer", contractNumberDefault("circle", "layer")),
          animations,
          physics,
          sequences,
        };
        props = circleProps;
        break;
      }
      case "rectangle": {
        const sizeVal = p["size"] as PointValue;
        const rectProps: IRRectangleProps = {
          kind:      "rectangle",
          position:  getReqPoint(p, "position"),
          width:     sizeVal.x,
          height:    sizeVal.y,
          color:     resolveColor(p, "color", contractStringDefault("rectangle", "color")),
          alpha:     resolveNumber(p, "alpha", contractNumberDefault("rectangle", "alpha")),
          rotation:  resolveNumber(p, "rotation", contractNumberDefault("rectangle", "rotation")),
          scale:     resolveScale(p, "scale", contractPointDefault("rectangle", "scale")),
          layer:     resolveNumber(p, "layer", contractNumberDefault("rectangle", "layer")),
          animations,
          physics,
          sequences,
        };
        props = rectProps;
        break;
      }
      case "polygon": {
        const pts = getReqPointList(p, "points");
        const polyProps: IRPolygonProps = {
          kind:      "polygon",
          points:    pts,
          color:     resolveColor(p, "color", contractStringDefault("polygon", "color")),
          alpha:     resolveNumber(p, "alpha", contractNumberDefault("polygon", "alpha")),
          position:  resolvePoint(p, "position", contractDerivedPositionDefault("polygon", "position", pts)),
          rotation:  resolveNumber(p, "rotation", contractNumberDefault("polygon", "rotation")),
          scale:     resolveScale(p, "scale", contractPointDefault("polygon", "scale")),
          layer:     resolveNumber(p, "layer", contractNumberDefault("polygon", "layer")),
          animations,
          physics,
          sequences,
        };
        props = polyProps;
        break;
      }
      case "line": {
        const linePts = getReqPointList(p, "points");
        const lineProps: IRLineProps = {
          kind:      "line",
          points:    linePts,
          thickness: getReqNumber(p, "thickness"),
          color:     resolveColor(p, "color", contractStringDefault("line", "color")),
          alpha:     resolveNumber(p, "alpha", contractNumberDefault("line", "alpha")),
          position:  getReqPoint(p, "position"),
          rotation:  resolveNumber(p, "rotation", contractNumberDefault("line", "rotation")),
          scale:     resolveScale(p, "scale", contractPointDefault("line", "scale")),
          layer:     resolveNumber(p, "layer", contractNumberDefault("line", "layer")),
          animations,
          physics,
          sequences,
        };
        props = lineProps;
        break;
      }
      case "text": {
        const textProps: IRTextProps = {
          kind:      "text",
          position:  getReqPoint(p, "position"),
          content:   getReqString(p, "content"),
          fontSize:  resolveNumber(p, "fontSize", contractNumberDefault("text", "fontSize")),
          color:     resolveColor(p, "color", contractStringDefault("text", "color")),
          alpha:     resolveNumber(p, "alpha", contractNumberDefault("text", "alpha")),
          rotation:  resolveNumber(p, "rotation", contractNumberDefault("text", "rotation")),
          scale:     resolveScale(p, "scale", contractPointDefault("text", "scale")),
          layer:     resolveNumber(p, "layer", contractNumberDefault("text", "layer")),
          animations,
          physics,
          sequences,
        };
        props = textProps;
        break;
      }
      case "group": {
        const transform: IRTransform = {
          position: resolvePoint(p, "position", contractPointDefault("group", "position")),
          rotation: resolveNumber(p, "rotation", contractNumberDefault("group", "rotation")),
          scale:    resolveScale(p, "scale", contractPointDefault("group", "scale")),
        };

        const groupProps: IRGroupProps = {
          kind:      "group",
          transform,
          alpha:     resolveNumber(p, "alpha", contractNumberDefault("group", "alpha")),
          layer:     resolveNumber(p, "layer", contractNumberDefault("group", "layer")),
          animations,
          physics,
          sequences,
        };
        props = groupProps;
        break;
      }
      default: {
        const _never: never = node.type;
        throw new Error(`[IR] Unknown object type: ${String(_never)}`);
      }
    }

    const childrenNodes = visualNodes.map((child, index) => ({
      node: buildObjectNode(child, `${id}.${child.name}`),
      index,
    }));

    childrenNodes.sort((a, b) => {
      const diff = a.node.props.layer - b.node.props.layer;
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
  const sizeVal  = sceneAst.props["size"] as PointValue;

  const visualNodes = sceneAst.children.filter(
    c => c.type !== "animate" && c.type !== "physics" && c.type !== "sequence" && c.type !== "parallel"
  );

  const topLevelChildrenNodes = visualNodes.map((child, index) => ({
    node: buildObjectNode(child, `scene.${child.name}`),
    index,
  }));

  topLevelChildrenNodes.sort((a, b) => {
    const diff = a.node.props.layer - b.node.props.layer;
    if (diff !== 0) return diff;
    return a.index - b.index;
  });

  return Object.freeze({
    kind:       "scene",
    width:      sizeVal.x,
    height:     sizeVal.y,
    background: resolveColor(sceneAst.props, "background", contractStringDefault("scene", "background")),
    fit:        resolveFit(sceneAst.props, contractStringDefault("scene", "fit")),
    children:   Object.freeze(topLevelChildrenNodes.map(x => x.node)) as ReadonlyArray<IRObjectNode>,
    registry:   Object.freeze(registry) as Readonly<Record<IRObjectId, IRObjectNode>>,
  });
}
