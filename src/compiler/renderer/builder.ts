import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { IRObjectNode, IRObjectProps, IRAnimation, IRPhysics, IRSequence } from "../sceneIR";
import type { BodyGeometry, BodyPart } from "./physicsWorld";
import { compose, IDENTITY, type LocalTransform } from "./transform";

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
    /**
     * The constant transform from this container's local space to the scene's.
     *
     * Set by `bindPhysicsBodies` on any container that owns a body. It is
     * constant for the scene's life because D17's validator rules reject
     * `physics` under a group that animates — which is what keeps it free of
     * `driver.alpha` and so keeps the simulation independent of frame rate.
     */
    __bodyTransform?: LocalTransform;
    /** Exit velocity written by a `handoff` animation, in px/s. */
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

/**
 * One placed part for a leaf shape, with the child's scale baked into its
 * dimensions and its accumulated rotation carried as `angle`.
 *
 * A group's own scale is deliberately NOT baked in here — it goes through
 * `world.setScale` and `Body.scale`, which scales vertices on each axis
 * independently about a point, exactly as PixiJS does. Baking it here as well
 * would apply it twice.
 */
function placePart(shape: BodyGeometry, t: LocalTransform): BodyPart | null {
  if (shape.kind === "circle") {
    // Matter has no ellipse. A non-uniformly scaled circle collides as a
    // circle of the mean radius; the common uniform case is exact.
    const meanScale = (Math.abs(t.sx) + Math.abs(t.sy)) / 2;
    return { kind: "circle", radius: shape.radius * meanScale, x: t.x, y: t.y };
  }
  if (shape.kind === "rectangle") {
    return {
      kind: "rectangle",
      width: shape.width * Math.abs(t.sx),
      height: shape.height * Math.abs(t.sy),
      x: t.x, y: t.y, angle: t.rot,
    };
  }
  if (shape.kind === "polygon") {
    return {
      kind: "polygon",
      points: shape.points.map((p) => ({ x: p.x * t.sx, y: p.y * t.sy })),
      x: t.x, y: t.y, angle: t.rot,
    };
  }
  // A nested compound is flattened by the caller, never placed whole.
  return null;
}

/**
 * Walk a group's built children and flatten every leaf shape into one part
 * list, in the group's own local space (spec D18).
 *
 * Reads the children's already-computed `__bodyShape`, so there is no second
 * copy of the per-kind geometry mapping to drift out of sync with the switch
 * in `buildNode`. A nested group recurses rather than contributing its own
 * compound, which is what makes nesting need no special case.
 */
function collectBodyParts(container: Container, t: LocalTransform, out: BodyPart[]): void {
  for (const raw of container.children) {
    const child = raw as Container;
    const shape = child.__bodyShape;
    const layout = child.__declareLayout;
    // A `Graphics` or `Text` leaf inside a shape's wrapper has neither.
    if (!shape || !layout) continue;

    const childT = compose(t, layout.currentPos, child.rotation, layout.currentScale);

    if (shape.kind === "compound") {
      collectBodyParts(child, childT, out);
    } else {
      const part = placePart(shape, childT);
      if (part) out.push(part);
    }
  }
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

      // A group welds its children into one compound body (spec 7). The parts
      // are expressed in the group's own local space, so the body's reference
      // point is the group's origin — the same point its pivot sits at, and
      // the same point `position` places (spec D16).
      //
      // What this replaces: a single rectangle SIZED from getLocalBounds() but
      // POSITIONED at the origin. The two disagreed for any group whose
      // children sat asymmetrically around it.
      const parts: BodyPart[] = [];
      collectBodyParts(wrapper, IDENTITY, parts);
      wrapper.__bodyShape = { kind: "compound", parts };
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
