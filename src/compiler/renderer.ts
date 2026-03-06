import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle
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
  // Leverage native PixiJS transform properties instead of custom trigonometry
  wrapper.pivot.set(localPivot.x, localPivot.y);
  
  // Calculate the offset required by the anchor
  const anchorOffsetX = (localAnchor.x - localPivot.x) * props.scale.x;
  const anchorOffsetY = (localAnchor.y - localPivot.y) * props.scale.y;
  
  wrapper.position.set(
    props.position.x - anchorOffsetX,
    props.position.y - anchorOffsetY
  );
  
  wrapper.scale.set(props.scale.x, props.scale.y);
  wrapper.rotation = props.rotation * (Math.PI / 180); // Pixi expects radians
  wrapper.alpha = props.alpha; // Native alpha (no filters required)
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
      for (const child of node.children) {
        wrapper.addChild(buildNode(child));
      }

      const bounds = wrapper.getLocalBounds();
      const bx = isFinite(bounds.x) ? bounds.x : 0;
      const by = isFinite(bounds.y) ? bounds.y : 0;
      const bw = isFinite(bounds.width) ? bounds.width : 0;
      const bh = isFinite(bounds.height) ? bounds.height : 0;

      const localPivot = { x: bx + bw / 2, y: by + bh / 2 };
      const localAnchor = {
        x: bx + props.transform.anchor.x * bw,
        y: by + props.transform.anchor.y * bh
      };

      // Pass the actual group alpha to the wrapper, no filters needed!
      applyAnchorAndPivot(wrapper, {
        position: props.transform.position,
        rotation: props.transform.rotation,
        scale: props.transform.scale,
        anchor: props.transform.anchor,
        alpha: props.alpha 
      }, localAnchor, localPivot);

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
      autoStart:       true, // Changed to true to allow native rendering cycles
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
    const sceneFit      = scene.sceneFit;

    function updateLayout(): void {
      if (!app.canvas) return; // Guard against destroyed app

      const sw = hostElement.clientWidth;
      const sh = hostElement.clientHeight;

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
    }

    // Replace ticker with highly efficient ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
        updateLayout();
    });
    
    resizeObserver.observe(hostElement);
    updateLayout();

    return () => {
      resizeObserver.disconnect();
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