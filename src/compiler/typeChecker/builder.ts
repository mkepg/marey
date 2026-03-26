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
  resolveSceneFit,
  resolveBoolean,
  resolveEasing,
  getReqAnimProperty,
  resolveAnimToValue,
  getReqNumber,
  getReqPoint,
  getReqString,
  getReqPointList,
} from "./resolvers";

function buildAnimationFromNode(an: ObjectNode): IRAnimation {
  return {
    property: getReqAnimProperty(an.props, "property"),
    to:       resolveAnimToValue(an.props, "to"),
    duration: getReqNumber(an.props, "duration"),
    easing:   resolveEasing(an.props, "easing", "easeInOut"),
    loop:     resolveBoolean(an.props, "loop", false),
    yoyo:     resolveBoolean(an.props, "yoyo", false),
    handOff:  resolveBoolean(an.props, "handOff", false),
  };
}

function buildPhysicsFromNode(physicsNode: ObjectNode): IRPhysics {
  const pp = physicsNode.props;
  const durVal = pp["duration"];
  let duration: IRPhysicsDuration;

  if (durVal?.kind === "indefinitely") {
    duration = "indefinitely";
  } else {
    duration = resolveNumber(pp, "duration", 0);
  }

  return {
    velocity:      resolvePoint(pp, "velocity", { x: 0, y: 0 }),
    gravity:       resolvePoint(pp, "gravity", { x: 0, y: 980 }),
    airDrag:       resolveNumber(pp, "airDrag", 0.999),
    bounce:        resolveNumber(pp, "bounce", 0.65),
    collideBounds: resolveBoolean(pp, "collideBounds", true),
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
          color:     resolveColor(p, "color", "#ffffff"),
          alpha:     resolveNumber(p, "alpha", 1.0),
          rotation:  resolveNumber(p, "rotation", 0),
          scale:     resolveScale(p, "scale", { x: 1, y: 1 }),
          z:         resolveNumber(p, "z", 0),
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
          color:     resolveColor(p, "color", "#ffffff"),
          alpha:     resolveNumber(p, "alpha", 1.0),
          rotation:  resolveNumber(p, "rotation", 0),
          scale:     resolveScale(p, "scale", { x: 1, y: 1 }),
          z:         resolveNumber(p, "z", 0),
          animations,
          physics,
          sequences,
        };
        props = rectProps;
        break;
      }
      case "polygon": {
        const pts = getReqPointList(p, "points");
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
          kind:      "polygon",
          points:    pts,
          color:     resolveColor(p, "color", "#ffffff"),
          alpha:     resolveNumber(p, "alpha", 1.0),
          position:  resolvePoint(p, "position", { x: defaultX, y: defaultY }),
          rotation:  resolveNumber(p, "rotation", 0),
          scale:     resolveScale(p, "scale", { x: 1, y: 1 }),
          z:         resolveNumber(p, "z", 0),
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
          color:     resolveColor(p, "color", "#ffffff"),
          alpha:     resolveNumber(p, "alpha", 1.0),
          position:  resolvePoint(p, "position", { x: 0, y: 0 }),
          rotation:  resolveNumber(p, "rotation", 0),
          scale:     resolveScale(p, "scale", { x: 1, y: 1 }),
          z:         resolveNumber(p, "z", 0),
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
          fontSize:  resolveNumber(p, "fontSize", 16),
          color:     resolveColor(p, "color", "#ffffff"),
          alpha:     resolveNumber(p, "alpha", 1.0),
          rotation:  resolveNumber(p, "rotation", 0),
          scale:     resolveScale(p, "scale", { x: 1, y: 1 }),
          z:         resolveNumber(p, "z", 0),
          animations,
          physics,
          sequences,
        };
        props = textProps;
        break;
      }
      case "group": {
        const transform: IRTransform = {
          position: resolvePoint(p, "position", { x: 0, y: 0 }),
          rotation: resolveNumber(p, "rotation", 0),
          scale:    resolveScale(p, "scale", { x: 1, y: 1 }),
        };

        const groupProps: IRGroupProps = {
          kind:      "group",
          transform,
          alpha:     resolveNumber(p, "alpha", 1.0),
          z:         resolveNumber(p, "z", 0),
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
  const sizeVal  = sceneAst.props["size"] as PointValue;

  const visualNodes = sceneAst.children.filter(
    c => c.type !== "animate" && c.type !== "physics" && c.type !== "sequence" && c.type !== "parallel"
  );

  const topLevelChildrenNodes = visualNodes.map((child, index) => ({
    node: buildObjectNode(child, `scene.${child.name}`),
    index,
  }));

  topLevelChildrenNodes.sort((a, b) => {
    const diff = a.node.props.z - b.node.props.z;
    if (diff !== 0) return diff;
    return a.index - b.index;
  });

  return Object.freeze({
    kind:       "scene",
    width:      sizeVal.x,
    height:     sizeVal.y,
    background: resolveColor(sceneAst.props, "background", "#000000"),
    sceneFit:   resolveSceneFit(sceneAst.props),
    children:   Object.freeze(topLevelChildrenNodes.map(x => x.node)) as ReadonlyArray<IRObjectNode>,
    registry:   Object.freeze(registry) as Readonly<Record<IRObjectId, IRObjectNode>>,
  });
}