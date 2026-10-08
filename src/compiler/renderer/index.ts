import type { IRSceneNode } from "../sceneIR";
import { pixiRendererAdapter } from "./adapter";
import type { LivePlayback } from "./adapter";
import type { PlaybackStart } from "./playback";

export async function renderScene(
  scene: IRSceneNode,
  hostElement: HTMLDivElement,
  isDark: boolean,
  start?: PlaybackStart,
): Promise<{ cleanup: () => void; playback: LivePlayback }> {
  return pixiRendererAdapter.render(scene, hostElement, isDark, start);
}

export { pixiRendererAdapter };
export type { LivePlayback };