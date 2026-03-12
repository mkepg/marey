import type { IRSceneNode } from "../sceneIR";
import { pixiRendererAdapter } from "./adapter";

export async function renderScene(
  scene: IRSceneNode,
  hostElement: HTMLDivElement,
  isDark: boolean
): Promise<() => void> {
  return pixiRendererAdapter.render(scene, hostElement, isDark);
}

export { pixiRendererAdapter };