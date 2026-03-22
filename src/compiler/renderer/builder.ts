import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { IRObjectNode, IRObjectProps, IRAnimation } from "../sceneIR";

declare module "pixi.js" {
    interface Container {
        __declareLayout?: {
            localAnchorX: number;
            localAnchorY: number;
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
    }
}

function applyAnchorAndPivot(
  wrapper: Container,
  props: {
    position: { x: number, y: number },
    rotation: number,
    scale: { x: number, y: number },
    anchor: { x: number, y: number },
    alpha: number
  },
  localAnchor: { x: number, y: number },
  localPivot: { x: number, y: number }
) {
  wrapper.pivot.set(localPivot.x, localPivot.y);
  
  wrapper.__declareLayout = {
      localAnchorX: localAnchor.x, localAnchorY: localAnchor.y,
      localPivotX: localPivot.x, localPivotY: localPivot.y,
      currentPos: { x: props.position.x, y: props.position.y },
      currentScale: { x: props.scale.x, y: props.scale.y }
  };
  
  wrapper.__updateLayout = () => {
      const layout = wrapper.__declareLayout!;
      const ax = (layout.localAnchorX - layout.localPivotX) * layout.currentScale.x;
      const ay = (layout.localAnchorY - layout.localPivotY) * layout.currentScale.y;
      wrapper.position.set(layout.currentPos.x - ax, layout.currentPos.y - ay);
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
      const localAnchor = {
        x: props.anchor.x * (props.radius * 2),
        y: props.anchor.y * (props.radius * 2)
      };
      applyAnchorAndPivot(wrapper, props, localAnchor, localPivot);
      const gfx = new Graphics()
        .circle(props.radius, props.radius, props.radius)
        .fill(props.color);
      wrapper.addChild(gfx);
      break;
    }
    case "rectangle": {
      wrapper = new Container();
      const localPivot = { x: props.width / 2, y: props.height / 2 };
      const localAnchor = {
        x: props.anchor.x * props.width,
        y: props.anchor.y * props.height
      };
      applyAnchorAndPivot(wrapper, props, localAnchor, localPivot);
      const gfx = new Graphics()
        .rect(0, 0, props.width, props.height)
        .fill(props.color);
      wrapper.addChild(gfx);
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
      const localPivot = { x: w / 2, y: h / 2 };
      const localAnchor = {
        x: props.anchor.x * w,
        y: props.anchor.y * h
      };
      applyAnchorAndPivot(wrapper, props, localAnchor, localPivot);
      const flatPoints = new Array(len * 2);
      for (let i = 0; i < len; i++) {
        flatPoints[i * 2] = props.points[i].x - minX;
        flatPoints[i * 2 + 1] = props.points[i].y - minY;
      }
      const gfx = new Graphics()
        .poly(flatPoints, true)
        .fill(props.color);
      wrapper.addChild(gfx);
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
      const localPivot = { x: w / 2, y: h / 2 };
      const localAnchor = {
        x: props.anchor.x * w,
        y: props.anchor.y * h
      };
      applyAnchorAndPivot(wrapper, props, localAnchor, localPivot);
      const flatPoints = new Array(len * 2);
      for (let i = 0; i < len; i++) {
        flatPoints[i * 2] = props.points[i].x - minX;
        flatPoints[i * 2 + 1] = props.points[i].y - minY;
      }
      const gfx = new Graphics()
        .poly(flatPoints, false)
        .stroke({ width: props.thickness, color: props.color });
      wrapper.addChild(gfx);
      break;
    }
    case "text": {
      wrapper = new Container();
      const style = new TextStyle({
        fontFamily: "'JetBrains Mono', monospace",
        fontSize:   props.fontSize,
        fill:       props.color,
      });
      const textObj = new Text({ text: props.content, style });
      const localPivot = { x: textObj.width / 2, y: textObj.height / 2 };
      const localAnchor = {
        x: props.anchor.x * textObj.width,
        y: props.anchor.y * textObj.height
      };
      applyAnchorAndPivot(wrapper, props, localAnchor, localPivot);
      wrapper.addChild(textObj);
      break;
    }
    case "group": {
      wrapper = new Container();
      for (const child of node.children) {
        wrapper.addChild(buildNode(child));
      }
      const localPivot = { x: 0, y: 0 };
      const localAnchor = { x: 0, y: 0 };
      applyAnchorAndPivot(wrapper, {
        position: props.transform.position,
        rotation: props.transform.rotation,
        scale: props.transform.scale,
        anchor: { x: 0, y: 0 },
        alpha: props.alpha
      }, localAnchor, localPivot);
      break;
    }
    default: {
      const _never: never = props;
      throw new Error(`[PixiAdapter] Unknown IR node kind: ${String((_never as IRObjectProps).kind)}`);
    }
  }

  wrapper.__animations = props.animations;
  
  let startPos = { x: 0, y: 0 };
  let startScale = { x: 1, y: 1 };
  let startRot = 0;
  let startAlpha = 1;

  if (props.kind === "group") {
     startPos = props.transform.position;
     startScale = props.transform.scale;
     startRot = props.transform.rotation;
     startAlpha = props.alpha;
  } else {
     startPos = (props as any).position;
     startScale = (props as any).scale;
     startRot = (props as any).rotation;
     startAlpha = (props as any).alpha;
  }

  wrapper.__startProps = {
     position: { x: startPos.x, y: startPos.y },
     rotation: startRot,
     scale: { x: startScale.x, y: startScale.y },
     alpha: startAlpha
  };

  return wrapper;
}