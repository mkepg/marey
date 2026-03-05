/**
 * PixiJS Renderer Adapter
 *
 * This module is a renderer adapter — a consumer of the Scene IR.
 * It has no dependency on the AST, the lexer, the parser, or the
 * type-checker.  It receives only an IRSceneNode and produces canvas output.
 *
 * A second adapter (e.g. Canvas2D or a JSON serialiser) can be built by
 * implementing the IRendererAdapter interface against the same IRSceneNode
 * without modifying any language-core files.
 */

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

// ─── Scene-graph builder ──────────────────────────────────────────────────────

function buildNode(node: IRObjectNode): Container {
  const props: IRObjectProps = node.props;

  switch (props.kind) {
    case "circle": {
      const wrapper = new Container();
      wrapper.x = props.position.x;
      wrapper.y = props.position.y;
      wrapper.alpha = props.alpha;
      const gfx = new Graphics()
        .circle(0, 0, props.radius)
        .fill(props.color);
      wrapper.addChild(gfx);
      return wrapper;
    }

    case "rectangle": {
      const wrapper = new Container();
      wrapper.x = props.position.x;
      wrapper.y = props.position.y;
      wrapper.alpha = props.alpha;
      const gfx = new Graphics()
        .rect(0, 0, props.width, props.height)
        .fill(props.color);
      wrapper.addChild(gfx);
      return wrapper;
    }

    case "polygon": {
      const wrapper = new Container();
      wrapper.alpha = props.alpha;
      // Polygon points are in absolute logical space; no additional translation.
      const flatPoints = props.points.flatMap((pt) => [pt.x, pt.y]);
      const gfx = new Graphics()
        .poly(flatPoints, true)
        .fill(props.color);
      wrapper.addChild(gfx);
      return wrapper;
    }

    case "text": {
      const wrapper = new Container();
      wrapper.x = props.position.x;
      wrapper.y = props.position.y;
      wrapper.alpha = props.alpha;
      const style = new TextStyle({
        fontFamily: "'JetBrains Mono', monospace",
        fontSize:   props.fontSize,
        fill:       props.color,
      });
      const textObj = new Text({ text: props.content, style });
      wrapper.addChild(textObj);
      return wrapper;
    }

    case "group": {
      const { transform } = props;
      const wrapper = new Container();
      wrapper.x        = transform.position.x;
      wrapper.y        = transform.position.y;
      wrapper.scale.set(transform.scale);
      wrapper.rotation = transform.rotation * (Math.PI / 180);
      for (const child of node.children) {
        wrapper.addChild(buildNode(child));
      }
      return wrapper;
    }

    default: {
      // Exhaustive guard — IR construction guarantees all cases are handled.
      const _never: never = props;
      throw new Error(`[PixiAdapter] Unknown IR node kind: ${String((_never as IRObjectProps).kind)}`);
    }
  }
}

// ─── Renderer adapter implementation ─────────────────────────────────────────

/**
 * PixiJS renderer adapter.
 * Implements IRendererAdapter; consumes IRSceneNode exclusively.
 */
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
    const scaleMode     = scene.scaleMode;

    function updateLayout(): void {
      const sw = app.screen.width;
      const sh = app.screen.height;

      if (scaleMode === "contain") {
        const s = Math.min(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.scale.set(s);
        sceneRoot.position.set(
          (sw - logicalWidth  * s) / 2,
          (sh - logicalHeight * s) / 2
        );
      } else if (scaleMode === "cover") {
        const s = Math.max(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.scale.set(s);
        sceneRoot.position.set(
          (sw - logicalWidth  * s) / 2,
          (sh - logicalHeight * s) / 2
        );
      } else if (scaleMode === "fill") {
        sceneRoot.scale.set(sw / logicalWidth, sh / logicalHeight);
        sceneRoot.position.set(0, 0);
      } else {
        // "none" — 1:1 mapping
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

// Re-export renderScene as a convenience wrapper for existing call sites.
export async function renderScene(
  scene: IRSceneNode,
  hostElement: HTMLDivElement,
  isDark: boolean
): Promise<() => void> {
  return pixiRendererAdapter.render(scene, hostElement, isDark);
}