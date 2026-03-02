import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
} from "pixi.js";
import type { SceneNode, ObjectNode, ColorValue } from "./types";

function toPixiColor(cv: ColorValue | undefined, fallback: string): string {
  return cv?.kind === "color" ? cv.value : fallback;
}

function buildNode(node: ObjectNode): Container {
  const p = node.props;
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
    if (rotProp?.kind   === "number") wrapper.rotation = rotProp.value * (Math.PI / 180);
    if (scaleProp?.kind === "number") wrapper.scale.set(scaleProp.value);
    
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
    const contentProp  = p["content"];
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
  // Ensure fonts are fully loaded before calculating any text metrics
  // This prevents discrepancies between the first render and subsequent renders.
  await document.fonts.ready;

  const bgProp = ast.props["background"];
  const backgroundColor =
    bgProp?.kind === "color"
      ? bgProp.value
      : isDark ? "#0f0f0f" : "#ffffff";

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

  app.render();

  return () => {
    app.destroy(true, { children: true });
  };
}