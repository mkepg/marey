import type { AstNode, ObjectNode, PointValue } from "../types";
import type { IRSceneNode, IRObjectNode, IRObjectId, IRObjectProps, IRCircleProps, IRRectangleProps, IRPolygonProps, IRLineProps, IRTextProps, IRGroupProps, IRTransform, IRAnimation } from "../sceneIR";
import { resolveColor, resolveNumber, resolvePoint, resolveScale, resolveSceneFit, resolveBoolean, resolveEasing, getReqAnimProperty, resolveAnimToValue, getReqNumber, getReqPoint, getReqString, getReqPointList } from "./resolvers";
export function buildIR(ast: AstNode): IRSceneNode {
  const registry: Record<IRObjectId, IRObjectNode> = {};
  
  function buildObjectNode(node: ObjectNode, scopePath: string): IRObjectNode {
    if (node.type === "animate") {
      throw new Error("[IR] 'animate' nodes should not be passed to buildObjectNode");
    }
    const id: IRObjectId = scopePath;
    const p = node.props;
    
    const animNodes = node.children.filter(c => c.type === "animate");
    const visualNodes = node.children.filter(c => c.type !== "animate");
    
    const animations: IRAnimation[] = animNodes.map(an => ({
        property: getReqAnimProperty(an.props, "property"),
        to: resolveAnimToValue(an.props, "to"),
        duration: getReqNumber(an.props, "duration"),
        easing: resolveEasing(an.props, "easing", "easeInOut"),
        loop: resolveBoolean(an.props, "loop", false),
        yoyo: resolveBoolean(an.props, "yoyo", false),
    }));

    let props: IRObjectProps;
    switch (node.type) {
      case "circle": {
        const circleProps: IRCircleProps = {
          kind:     "circle",
          position: getReqPoint(p, "position"),
          radius:   getReqNumber(p, "radius"),
          color:    resolveColor(p, "color", "#ffffff"),
          alpha:    resolveNumber(p, "alpha", 1.0),
          rotation: resolveNumber(p, "rotation", 0),
          scale:    resolveScale(p, "scale", { x: 1, y: 1 }),
          anchor:   resolvePoint(p, "anchor", { x: 0, y: 0 }),
          z:        resolveNumber(p, "z", 0),
          animations
        };
        props = circleProps;
        break;
      }
      case "rectangle": {
        const sizeVal = p["size"] as PointValue;
        const rectProps: IRRectangleProps = {
          kind:     "rectangle",
          position: getReqPoint(p, "position"),
          width:    sizeVal.x,
          height:   sizeVal.y,
          color:    resolveColor(p, "color", "#ffffff"),
          alpha:    resolveNumber(p, "alpha", 1.0),
          rotation: resolveNumber(p, "rotation", 0),
          scale:    resolveScale(p, "scale", { x: 1, y: 1 }),
          anchor:   resolvePoint(p, "anchor", { x: 0, y: 0 }),
          z:        resolveNumber(p, "z", 0),
          animations
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
          kind:     "polygon",
          points:   pts,
          color:    resolveColor(p, "color", "#ffffff"),
          alpha:    resolveNumber(p, "alpha", 1.0),
          position: resolvePoint(p, "position", { x: defaultX, y: defaultY }),
          rotation: resolveNumber(p, "rotation", 0),
          scale:    resolveScale(p, "scale", { x: 1, y: 1 }),
          anchor:   resolvePoint(p, "anchor", { x: 0, y: 0 }),
          z:        resolveNumber(p, "z", 0),
          animations
        };
        props = polyProps;
        break;
      }
      case "line": {
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
        const lineProps: IRLineProps = {
          kind:      "line",
          points:    pts,
          thickness: getReqNumber(p, "thickness"),
          color:     resolveColor(p, "color", "#ffffff"),
          alpha:     resolveNumber(p, "alpha", 1.0),
          position:  resolvePoint(p, "position", { x: defaultX, y: defaultY }),
          rotation:  resolveNumber(p, "rotation", 0),
          scale:     resolveScale(p, "scale", { x: 1, y: 1 }),
          anchor:    resolvePoint(p, "anchor", { x: 0, y: 0 }),
          z:         resolveNumber(p, "z", 0),
          animations
        };
        props = lineProps;
        break;
      }
      case "text": {
        const textProps: IRTextProps = {
          kind:     "text",
          position: getReqPoint(p, "position"),
          content:  getReqString(p, "content"),
          fontSize: resolveNumber(p, "fontSize", 16),
          color:    resolveColor(p, "color", "#ffffff"),
          alpha:    resolveNumber(p, "alpha", 1.0),
          rotation: resolveNumber(p, "rotation", 0),
          scale:    resolveScale(p, "scale", { x: 1, y: 1 }),
          anchor:   resolvePoint(p, "anchor", { x: 0, y: 0 }),
          z:        resolveNumber(p, "z", 0),
          animations
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
          animations
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
  const sizeVal  = sceneAst.props["size"] as PointValue;
  
  const visualNodes = sceneAst.children.filter(c => c.type !== "animate");
  
  const topLevelChildrenNodes = visualNodes.map((child, index) => ({
    node: buildObjectNode(child, `scene.${child.name}`),
    index
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