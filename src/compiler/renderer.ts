import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
} from "pixi.js";
import type {
  IRSceneNode,
  IRObjectNode,
  IRObjectProps,
  IRendererAdapter,
} from "./sceneIR";

/**
 * Advanced transform logic:
 * Ensures that objects rotate exactly around their geometric pivot 
 * while keeping their defined Anchor precisely pinned to the World Position.
 * This prevents anchor drifting and shearing when nested inside non-uniform scaled parent groups.
 */
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
  const sx = props.scale.x;
  const sy = props.scale.y;
  const r = props.rotation * (Math.PI / 180);

  // 1. Calculate the scaled distance vector from the Pivot to the Anchor
  const vx = sx * (localAnchor.x - localPivot.x);
  const vy = sy * (localAnchor.y - localPivot.y);

  // 2. Apply the rotation matrix to this distance vector
  // This ensures the anchor point mathematically tracks the rotation
  const vrx = vx * Math.cos(r) - vy * Math.sin(r);
  const vry = vx * Math.sin(r) + vy * Math.cos(r);

  // 3. Pin the wrapper position exactly to the requested position minus the rotated offset
  wrapper.pivot.set(localPivot.x, localPivot.y);
  wrapper.position.set(
    props.position.x - vrx,
    props.position.y - vry
  );
  
  wrapper.scale.set(sx, sy);
  wrapper.rotation = r;
  wrapper.alpha = props.alpha;
}

function buildNode(node: IRObjectNode): Container {
  const props: IRObjectProps = node.props;

  switch (props.kind) {
    case "circle": {
      const wrapper = new Container();

      // Local bounds derived from Graphics.circle(R, R, R) where bounds are [0, 2R]
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
      return wrapper;
    }
    
    case "rectangle": {
      const wrapper = new Container();
      
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
      return wrapper;
    }
    
    case "polygon": {
      const wrapper = new Container();
      
      // Bounding Box approach: Foolproof for Convex, Concave, and Complex shapes
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of props.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      
      if (minX === Infinity) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
      
      const w = maxX - minX;
      const h = maxY - minY;
      
      const localPivot = { x: minX + w / 2, y: minY + h / 2 };
      const localAnchor = { 
        x: minX + props.anchor.x * w, 
        y: minY + props.anchor.y * h 
      };
      
      applyAnchorAndPivot(wrapper, props, localAnchor, localPivot);

      const flatPoints = props.points.flatMap((pt) => [pt.x, pt.y]);
      const gfx = new Graphics()
        .poly(flatPoints, true)
        .fill(props.color);
      
      wrapper.addChild(gfx);
      return wrapper;
    }
    
    case "text": {
      const wrapper = new Container();

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
      return wrapper;
    }
    
    case "group": {
      const { transform, alpha } = props as any; // Groups default to 1.0 alpha implicitly
      const wrapper = new Container();
      
      // Groups act strictly as mathematical transform matrices with no implicit bounds
      const localPivot = { x: 0, y: 0 };
      const localAnchor = { x: 0, y: 0 };
      
      applyAnchorAndPivot(wrapper, {
        position: transform.position,
        rotation: transform.rotation,
        scale: transform.scale,
        anchor: transform.anchor,
        alpha: alpha ?? 1.0
      }, localAnchor, localPivot);

      for (const child of node.children) {
        wrapper.addChild(buildNode(child));
      }
      return wrapper;
    }
    
    default: {
      const _never: never = props;
      throw new Error(`[PixiAdapter] Unknown IR node kind: ${String((_never as IRObjectProps).kind)}`);
    }
  }
}

export const pixiRendererAdapter: IRendererAdapter = {
  async render(
    scene: IRSceneNode,
    hostElement: HTMLDivElement,
    _isDark: boolean
  ): Promise<() => void> {
    await document.fonts.ready;

    const app = new Application();
    await app.init({
      resizeTo:        hostElement,
      backgroundColor: scene.background,
      autoStart:       false,
      antialias:       true,
      resolution:      window.devicePixelRatio || 1,
      autoDensity:     true,
    });
    hostElement.appendChild(app.canvas);

    const sceneRoot = new Container();
    app.stage.addChild(sceneRoot);

    for (const node of scene.children) {
      sceneRoot.addChild(buildNode(node));
    }

    const logicalWidth  = scene.width;
    const logicalHeight = scene.height;
    const sceneFit     = scene.sceneFit;

    function updateLayout(): void {
      const sw = app.screen.width;
      const sh = app.screen.height;

      if (sceneFit === "contain") {
        const s = Math.min(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.scale.set(s);
        sceneRoot.position.set(
          (sw - logicalWidth  * s) / 2,
          (sh - logicalHeight * s) / 2
        );
      } else if (sceneFit === "cover") {
        const s = Math.max(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.scale.set(s);
        sceneRoot.position.set(
          (sw - logicalWidth  * s) / 2,
          (sh - logicalHeight * s) / 2
        );
      } else if (sceneFit === "fill") {
        sceneRoot.scale.set(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.position.set(0, 0);
      } else {
        sceneRoot.scale.set(1);
        sceneRoot.position.set(0, 0);
      }
      app.render();
    }

    let lastW = -1;
    let lastH = -1;

    const layoutTick = (): void => {
      if (app.screen.width !== lastW || app.screen.height !== lastH) {
        lastW = app.screen.width;
        lastH = app.screen.height;
        updateLayout();
      }
    };

    app.ticker.add(layoutTick);
    updateLayout();

    return () => {
      app.ticker.remove(layoutTick);
      app.destroy(true, { children: true });
    };
  },
};

export async function renderScene(
  scene: IRSceneNode,
  hostElement: HTMLDivElement,
  isDark: boolean
): Promise<() => void> {
  return pixiRendererAdapter.render(scene, hostElement, isDark);
}