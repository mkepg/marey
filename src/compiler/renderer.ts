import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  AlphaFilter
} from "pixi.js";
import type {
  IRSceneNode,
  IRObjectNode,
  IRObjectProps,
  IRendererAdapter,
} from "./sceneIR";

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

  const vx = sx * (localAnchor.x - localPivot.x);
  const vy = sy * (localAnchor.y - localPivot.y);

  const vrx = vx * Math.cos(r) - vy * Math.sin(r);
  const vry = vx * Math.sin(r) + vy * Math.cos(r);

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
      const len = props.points.length;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

      // Fast O(N) bounds calculation
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

      // Localize pivot and anchor relative to a zero-indexed bounding box
      const localPivot = { x: w / 2, y: h / 2 };
      const localAnchor = {
        x: props.anchor.x * w,
        y: props.anchor.y * h
      };

      applyAnchorAndPivot(wrapper, props, localAnchor, localPivot);

      // Localize geometry points so they draw relative to wrapper.position
      const flatPoints = new Array(len * 2);
      for (let i = 0; i < len; i++) {
        flatPoints[i * 2] = props.points[i].x - minX;
        flatPoints[i * 2 + 1] = props.points[i].y - minY;
      }

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
      const wrapper = new Container();
      
      // Build children first to compute spatial bounds
      for (const child of node.children) {
        wrapper.addChild(buildNode(child));
      }

      // Compute local bounds for accurate anchoring
      const bounds = wrapper.getLocalBounds();
      
      // Prevent degenerate bounds if the group is empty
      const bx = isFinite(bounds.x) ? bounds.x : 0;
      const by = isFinite(bounds.y) ? bounds.y : 0;
      const bw = isFinite(bounds.width) ? bounds.width : 0;
      const bh = isFinite(bounds.height) ? bounds.height : 0;

      const localPivot = { x: bx + bw / 2, y: by + bh / 2 };
      const localAnchor = {
        x: bx + props.transform.anchor.x * bw,
        y: by + props.transform.anchor.y * bh
      };

      // Set alpha to 1.0 here to prevent individual child blending
      applyAnchorAndPivot(wrapper, {
        position: props.transform.position,
        rotation: props.transform.rotation,
        scale: props.transform.scale,
        anchor: props.transform.anchor,
        alpha: 1.0 
      }, localAnchor, localPivot);

      // Apply grouped Alpha Blending via Filter if less than 1.0
      if (props.alpha < 1.0) {
         wrapper.filters = [new AlphaFilter({ alpha: props.alpha })];
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