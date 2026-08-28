import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { IRObjectNode, IRObjectProps, IRAnimation, IRPhysics, IRSequence } from "../sceneIR";
import type { BodyGeometry } from "./physicsWorld";

declare module "pixi.js" {
  interface Container {
    __declareLayout?: {
      localPivotX: number;
      localPivotY: number;
      currentPos: { x: number; y: number };
      currentScale: { x: number; y: number };
    };
    __updateLayout?: () => void;
    __animations?: ReadonlyArray<IRAnimation>;
    __startProps?: {
      position: { x: number; y: number };
      rotation: number;
      scale: { x: number; y: number };
      alpha: number;
    };
    __physics?: IRPhysics;
    /** Id of this container's body in the shared world, if it has one. */
    __body?: string;
    /** Exit velocity written by a `handOff` animation, in px/s. */
    __pendingVelocity?: { x: number; y: number };
    /** Collision shape, in local space with the origin at the bbox centre. */
    __bodyShape?: BodyGeometry;
    __sequences?: ReadonlyArray<IRSequence>;
    __baseSize?: { w: number; h: number };
  }
}

function applyAnchorAndPivot(
  wrapper: Container,
  props: {
    position: { x: number; y: number };
    rotation: number;
    scale: { x: number; y: number };
    alpha: number;
  },
  localPivot: { x: number; y: number }
): void {
  wrapper.pivot.set(localPivot.x, localPivot.y);

  wrapper.__declareLayout = {
    localPivotX: localPivot.x,
    localPivotY: localPivot.y,
    currentPos: { x: props.position.x, y: props.position.y },
    currentScale: { x: props.scale.x, y: props.scale.y },
  };

  wrapper.__updateLayout = () => {
    const layout = wrapper.__declareLayout!;
    
    // With anchor strictly enforced at 0.5, 0.5, PIXI position IS the exact geometric center. 
    // No translation math needed!
    wrapper.position.set(layout.currentPos.x, layout.currentPos.y);
    wrapper.scale.set(layout.currentScale.x, layout.currentScale.y);
  };

  wrapper.__updateLayout();
  wrapper.rotation = props.rotation * (Math.PI / 180);
  wrapper.alpha = props.alpha;
}

export function buildNode(node: IRObjectNode): Container {
  const props: IRObjectProps = node.props;
  let wrapper: Container;

  switch (props.kind) {
    case "circle": {
      wrapper = new Container();
      const localPivot = { x: props.radius, y: props.radius };
      applyAnchorAndPivot(wrapper, props, localPivot);
      
      const gfx = new Graphics()
        .circle(props.radius, props.radius, props.radius)
        .fill(props.color);
      wrapper.addChild(gfx);
      wrapper.__baseSize = { w: props.radius * 2, h: props.radius * 2 };
      wrapper.__bodyShape = { kind: "circle", radius: props.radius };
      break;
    }
    case "rectangle": {
      wrapper = new Container();
      const localPivot = { x: props.width / 2, y: props.height / 2 };
      applyAnchorAndPivot(wrapper, props, localPivot);
      
      const gfx = new Graphics()
        .rect(0, 0, props.width, props.height)
        .fill(props.color);
      wrapper.addChild(gfx);
      wrapper.__baseSize = { w: props.width, h: props.height };
      wrapper.__bodyShape = { kind: "rectangle", width: props.width, height: props.height };
      break;
    }
    case "polygon": {
      wrapper = new Container();
      const len = props.points.length;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < len; i++) {
        const p = props.points[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if (minX === Infinity) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
      const w = maxX - minX;
      const h = maxY - minY;

      const localPivot = { x: minX + w / 2, y: minY + h / 2 };
      applyAnchorAndPivot(wrapper, props, localPivot);

      const flatPoints = new Array(len * 2);
      for (let i = 0; i < len; i++) {
        flatPoints[i * 2]     = props.points[i].x;
        flatPoints[i * 2 + 1] = props.points[i].y;
      }

      const gfx = new Graphics()
        .poly(flatPoints, true)
        .fill(props.color);
      wrapper.addChild(gfx);
      wrapper.__baseSize = { w, h };
      wrapper.__bodyShape = {
        kind: "polygon",
        points: props.points.map((p) => ({
          x: p.x - localPivot.x,
          y: p.y - localPivot.y,
        })),
      };
      break;
    }
    case "line": {
      wrapper = new Container();
      const len = props.points.length;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < len; i++) {
        const p = props.points[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if (minX === Infinity) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
      const w = maxX - minX;
      const h = maxY - minY;

      const localPivot = { x: minX + w / 2, y: minY + h / 2 };
      applyAnchorAndPivot(wrapper, props, localPivot);

      const flatPoints = new Array(len * 2);
      for (let i = 0; i < len; i++) {
        flatPoints[i * 2]     = props.points[i].x;
        flatPoints[i * 2 + 1] = props.points[i].y;
      }

      const gfx = new Graphics()
        .poly(flatPoints, false)
        .stroke({ width: props.thickness, color: props.color });
      wrapper.addChild(gfx);
      wrapper.__baseSize = { w, h };
      wrapper.__bodyShape = {
        kind: "rectangle",
        width: Math.max(w, props.thickness),
        height: Math.max(h, props.thickness),
      };
      break;
    }
    case "text": {
      wrapper = new Container();
      const style = new TextStyle({
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: props.fontSize,
        fill: props.color,
      });
      const textObj = new Text({ text: props.content, style });

      const localPivot = { x: textObj.width / 2, y: textObj.height / 2 };
      applyAnchorAndPivot(wrapper, props, localPivot);

      wrapper.addChild(textObj);
      wrapper.__baseSize = { w: textObj.width, h: textObj.height };
      wrapper.__bodyShape = {
        kind: "rectangle",
        width: textObj.width,
        height: textObj.height,
      };
      break;
    }
    case "group": {
      wrapper = new Container();
      for (const child of node.children) {
        wrapper.addChild(buildNode(child));
      }

      const localPivot = { x: 0, y: 0 };
      applyAnchorAndPivot(
        wrapper,
        {
          position: props.transform.position,
          rotation: props.transform.rotation,
          scale: props.transform.scale,
          alpha: props.alpha,
        },
        localPivot
      );
      const groupBounds = wrapper.getLocalBounds();
      wrapper.__baseSize = { w: groupBounds.width, h: groupBounds.height };
      wrapper.__bodyShape = {
        kind: "rectangle",
        width: Math.max(groupBounds.width, 1),
        height: Math.max(groupBounds.height, 1),
      };
      break;
    }
    default: {
      const _never: never = props;
      throw new Error(`[PixiAdapter] Unknown IR node kind: ${String((_never as IRObjectProps).kind)}`);
    }
  }

  wrapper.__animations = props.animations;
  wrapper.__sequences  = props.sequences;

  let startPos   = { x: 0, y: 0 };
  let startScale = { x: 1, y: 1 };
  let startRot   = 0;
  let startAlpha = 1;

  if (props.kind === "group") {
    startPos   = props.transform.position;
    startScale = props.transform.scale;
    startRot   = props.transform.rotation;
    startAlpha = props.alpha;
  } else {
    startPos   = { x: props.position.x, y: props.position.y };
    startScale = { x: props.scale.x, y: props.scale.y };
    startRot   = props.rotation;
    startAlpha = props.alpha;
  }

  wrapper.__startProps = {
    position: { x: startPos.x, y: startPos.y },
    rotation: startRot,
    scale:    { x: startScale.x, y: startScale.y },
    alpha:    startAlpha,
  };

  wrapper.__physics = props.physics;

  return wrapper;
}