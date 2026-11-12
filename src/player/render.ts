import { Application } from "pixi.js";
import type { IRSceneNode } from "../compiler/sceneIR";
import { mountScene } from "../compiler/renderer/mountScene";
import { exportFontSizes } from "../compiler/export/exportFonts";
import { hashFrames } from "../compiler/export/frameHash";
import type { FrameSnapshot } from "../compiler/renderer/frameSampler";
import { PlayerError } from "./controller";
import type { PlayerMount } from "./controller";

// A variable, not a literal: Vite rewrites `new URL("literal", import.meta.url)`
// and, in library mode, inlines the asset as base64.
const FONT_FILE = "./fonts/JetBrainsMono-Regular.ttf";
const FONT_URL = new URL(FONT_FILE, import.meta.url).href;

/**
 * The family the player registers JetBrains Mono under, and the one its
 * scenes' `text` asks for (`mountScene`'s `fontFamily`). Not "JetBrains
 * Mono": a page that declares its own JetBrains Mono, as a docs site styling
 * its code does, would then share the family with the player. Measured on
 * `tools/visual-check/player/font-host.html` before this name existed:
 * `document.fonts.check` also judged the page's not yet used face and refused
 * the scene with PLAYER_FONT_UNAVAILABLE, and the player's face, added after
 * the page's own, took over the page's JetBrains Mono text. The file is the
 * one `marey export` draws with, so every width, and the frame hash, is the same.
 */
const PLAYER_FONT_FAMILY = "Marey JetBrains Mono";

let fontLoad: Promise<void> | null = null;

/**
 * Loads the scene face once per page; a failure clears the cache so a later
 * element retries. The face is judged by its own status, not by
 * `document.fonts.check`, which looks at every face of a family in the document.
 */
function loadFontOnce(): Promise<void> {
  fontLoad ??= (async () => {
    const face = new FontFace(PLAYER_FONT_FAMILY, `url(${FONT_URL})`);
    await face.load();
    if (face.status !== "loaded") throw new Error(`the face's status is ${face.status}`);
    document.fonts.add(face);
  })().catch((e: unknown) => {
    fontLoad = null;
    throw e;
  });
  return fontLoad;
}

async function ensureSceneFont(ir: IRSceneNode): Promise<void> {
  if (exportFontSizes(ir).length === 0) return;
  try {
    await loadFontOnce();
  } catch (e) {
    throw new PlayerError(
      "PLAYER_FONT_UNAVAILABLE",
      `The scene font could not be loaded: ${e instanceof Error ? e.message : String(e)}`,
    );
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
    mounted = mountScene(app, ir, host, start, { fontFamily: PLAYER_FONT_FAMILY });
  } catch (e) {
    try {
      // This loses the context itself (see destroy() below).
      app.destroy({ removeView: true }, { children: true, texture: true });
    } catch {
      // The application may not have finished initialising: release the
      // context by hand, if it got one.
      lose?.loseContext();
    }
    throw new PlayerError("PLAYER_RENDER_FAILED", e instanceof Error ? e.message : String(e));
  }

  const playback = mounted.playback;
  let destroyed = false;
  return {
    play: () => playback.play(),
    pause: () => playback.pause(),
    seek: (tick) => playback.seek(tick),
    hasPendingSeek: () => playback.inner.hasPendingSeek(),
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
      // No loseContext() here: app.destroy() already loses the context, in
      // PixiJS 8.16's GlContextSystem.destroy()
      // (node_modules/pixi.js/lib/rendering/renderers/gl/context/GlContextSystem.mjs:198).
      // A second call only logs "WebGL: INVALID_OPERATION: loseContext:
      // context already lost".
      app.destroy({ removeView: true }, { children: true, texture: true });
    },
  };
}
