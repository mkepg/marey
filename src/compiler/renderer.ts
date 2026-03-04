import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
} from "pixi.js";
import type { SceneNode, ObjectNode, ColorValue, ScaleModeValue } from "./types";

function toPixiColor(cv: ColorValue | undefined, fallback: string): string {
  return cv?.kind === "color" ? cv.value : fallback;
}

function buildNode(node: ObjectNode): Container {
  const p       = node.props;
  const wrapper = new Container();

  const posX = p["position"]?.kind === "point" ? p["position"].x : 0;
  const posY = p["position"]?.kind === "point" ? p["position"].y : 0;
  wrapper.x = posX;
  wrapper.y = posY;

  const alphaProp = p["alpha"];
  if (alphaProp?.kind === "number") wrapper.alpha = alphaProp.value;

  if (node.type === "group") {
    const rotProp   = p["rotation"];
    const scaleProp = p["scale"];
    // Transform order per spec §1.3: scale → rotation → translation
    if (scaleProp?.kind === "number") wrapper.scale.set(scaleProp.value);
    if (rotProp?.kind   === "number") wrapper.rotation = rotProp.value * (Math.PI / 180);
    for (const child of node.children) {
      wrapper.addChild(buildNode(child));
    }
    return wrapper;
  }

  if (node.type === "circle") {
    const radiusProp = p["radius"];
    if (radiusProp?.kind !== "number") return wrapper;
    const color = toPixiColor(p["color"] as ColorValue | undefined, "#ffffff");
    const gfx = new Graphics()
      .circle(0, 0, radiusProp.value)
      .fill(color);
    wrapper.addChild(gfx);
    return wrapper;
  }

  if (node.type === "rectangle") {
    const sizeProp = p["size"];
    if (sizeProp?.kind !== "point") return wrapper;
    const color = toPixiColor(p["color"] as ColorValue | undefined, "#ffffff");
    const gfx = new Graphics()
      .rect(0, 0, sizeProp.x, sizeProp.y)
      .fill(color);
    wrapper.addChild(gfx);
    return wrapper;
  }

  if (node.type === "polygon") {
    const pointsProp = p["points"];
    if (pointsProp?.kind !== "pointList" || pointsProp.value.length < 3) return wrapper;
    const flatPoints = pointsProp.value.flatMap((pt) => [
      pt.x - posX,
      pt.y - posY,
    ]);
    const color = toPixiColor(p["color"] as ColorValue | undefined, "#ffffff");
    const gfx = new Graphics()
      .poly(flatPoints, true)
      .fill(color);
    wrapper.addChild(gfx);
    return wrapper;
  }

  if (node.type === "text") {
    const contentProp = p["content"];
    if (contentProp?.kind !== "string") return wrapper;
    const fontSizeProp = p["fontSize"];
    const fontSize     = fontSizeProp?.kind === "number" ? fontSizeProp.value : 16;
    const fill         = toPixiColor(p["color"] as ColorValue | undefined, "#ffffff");
    const style = new TextStyle({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize,
      fill,
    });
    const textObj = new Text({ text: contentProp.value, style });
    wrapper.addChild(textObj);
    return wrapper;
  }

  return wrapper;
}

export async function renderScene(
  ast: SceneNode,
  hostElement: HTMLDivElement,
  isDark: boolean
): Promise<() => void> {
  await document.fonts.ready;

  const bgProp          = ast.props["background"];
  const backgroundColor = bgProp?.kind === "color" ? bgProp.value : (isDark ? "#0f0f0f" : "#ffffff");

  const sizeProp    = ast.props["size"];
  const logicalWidth  = sizeProp?.kind === "point" ? sizeProp.x : 800;
  const logicalHeight = sizeProp?.kind === "point" ? sizeProp.y : 600;

  // 1.2 — scaleMode is now a ScaleModeValue (kind: "scaleMode"), not a string.
  const scaleModeProp = ast.props["scaleMode"] as ScaleModeValue | undefined;
  const scaleMode     = scaleModeProp?.kind === "scaleMode" ? scaleModeProp.value : "contain";

  const app = new Application();
  await app.init({
    resizeTo:    hostElement,
    backgroundColor,
    autoStart:   false,
    antialias:   true,
    resolution:  window.devicePixelRatio || 1,
    autoDensity: true,
  });
  hostElement.appendChild(app.canvas);

  const sceneRoot = new Container();
  app.stage.addChild(sceneRoot);

  for (const node of ast.children) {
    sceneRoot.addChild(buildNode(node));
  }

  function updateLayout(): void {
    const sw = app.screen.width;
    const sh = app.screen.height;
    const lw = logicalWidth;
    const lh = logicalHeight;

    if (scaleMode === "contain") {
      const scale = Math.min(sw / lw, sh / lh);
      sceneRoot.scale.set(scale);
      sceneRoot.position.set((sw - lw * scale) / 2, (sh - lh * scale) / 2);
    } else if (scaleMode === "cover") {
      const scale = Math.max(sw / lw, sh / lh);
      sceneRoot.scale.set(scale);
      sceneRoot.position.set((sw - lw * scale) / 2, (sh - lh * scale) / 2);
    } else if (scaleMode === "fill") {
      sceneRoot.scale.set(sw / lw, sh / lh);
      sceneRoot.position.set(0, 0);
    } else {
      // "none" — 1:1 logical-to-display pixel mapping
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
}