import { Application } from "pixi.js";
import type { IRSceneNode } from "../compiler/sceneIR";
import { mountScene } from "../compiler/renderer/mountScene";
import {
  EXPORT_FONT_FAMILY,
  exportFontSizes,
  exportFontSpec,
} from "../compiler/export/exportFonts";
import { hashFrames } from "../compiler/export/frameHash";
import type { FrameSnapshot } from "../compiler/renderer/frameSampler";
import { PlayerError } from "./controller";
import type { PlayerMount } from "./controller";

// A variable, not a literal: Vite rewrites `new URL("literal", import.meta.url)`
// and, in library mode, inlines the asset as base64.
const FONT_FILE = "./fonts/JetBrainsMono-Regular.ttf";
const FONT_URL = new URL(FONT_FILE, import.meta.url).href;

let fontLoad: Promise<void> | null = null;

/** Loads the scene face once per page; a failure clears the cache so a later element retries. */
function loadFontOnce(): Promise<void> {
  fontLoad ??= (async () => {
    const face = new FontFace(EXPORT_FONT_FAMILY, `url(${FONT_URL})`);
    await face.load();
    document.fonts.add(face);
  })().catch((e: unknown) => {
    fontLoad = null;
    throw e;
  });
  return fontLoad;
}

async function ensureSceneFont(ir: IRSceneNode): Promise<void> {
  const sizes = exportFontSizes(ir);
  if (sizes.length === 0) return;
  try {
    await loadFontOnce();
  } catch (e) {
    throw new PlayerError(
      "PLAYER_FONT_UNAVAILABLE",
      `The scene font could not be loaded: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  for (const size of sizes) {
    if (!document.fonts.check(exportFontSpec(size))) {
      throw new PlayerError(
        "PLAYER_FONT_UNAVAILABLE",
        `The font ${exportFontSpec(size)} is not available.`,
      );
    }
  }
}

/** The WebGL context's loseContext extension, when the renderer is WebGL and offers it. */
function loseContextExtension(app: Application): WEBGL_lose_context | null {
  const renderer = app.renderer as { gl?: WebGL2RenderingContext };
  return renderer.gl?.getExtension("WEBGL_lose_context") ?? null;
}

export async function mountPlayer(
  host: HTMLDivElement,
  ir: IRSceneNode,
  start: { tick: number; playing: boolean },
): Promise<PlayerMount> {
  await ensureSceneFont(ir);

  const app = new Application();
  let lose: WEBGL_lose_context | null = null;
  let mounted: ReturnType<typeof mountScene>;
  try {
    await app.init({
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      autoStart: true,
    });
    lose = loseContextExtension(app);
    host.appendChild(app.canvas);
    mounted = mountScene(app, ir, host, start);
  } catch (e) {
    try {
      app.destroy({ removeView: true }, { children: true, texture: true });
    } catch {
      // The application may not have finished initialising.
    }
    lose?.loseContext();
    throw new PlayerError("PLAYER_RENDER_FAILED", e instanceof Error ? e.message : String(e));
  }

  const playback = mounted.playback;
  let destroyed = false;
  return {
    play: () => playback.play(),
    pause: () => playback.pause(),
    seek: (tick) => playback.seek(tick),
    restart: () => playback.restart(),
    subscribe: (l) => playback.subscribe(l),
    getState: () => playback.getState(),
    async liveFramesHash(ticks) {
      playback.pause();
      const frames: FrameSnapshot[] = [];
      ticks.forEach((tick, i) => {
        playback.inner.seek(tick);
        playback.inner.frame(0);
        frames.push({ index: i, tick, objects: playback.inner.snapshot() });
      });
      return hashFrames(frames);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      mounted.cleanup();
      app.destroy({ removeView: true }, { children: true, texture: true });
      lose?.loseContext();
    },
  };
}
