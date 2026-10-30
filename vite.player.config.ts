import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { thirdPartyLicenses } from "./vite-plugins/thirdPartyLicenses";

/**
 * The embeddable player's build: `src/player/index.ts` into `dist/player/`,
 * shipped as `marey-lang/player`. The entry holds the element, the controller
 * and the compiler; the renderer (PixiJS, Matter.js) sits in lazily loaded
 * chunks reached through the dynamic `import("./render")` in `element.ts`, so
 * a page that never mounts a scene never downloads it.
 */
const PLAYER_FONT_FILE = "fonts/JetBrainsMono-Regular.ttf";

/**
 * Emits the scene font beside the chunks. `src/player/render.ts` resolves it
 * as `new URL("./fonts/JetBrainsMono-Regular.ttf", import.meta.url)`, written
 * through a variable so Vite leaves the URL alone instead of inlining the font
 * as a base64 data URL.
 */
function playerFont(): Plugin {
  return {
    name: "marey:player-font",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: PLAYER_FONT_FILE,
        source: readFileSync(resolve("public", PLAYER_FONT_FILE)),
      });
    },
  };
}

export default defineConfig({
  publicDir: resolve("public"),
  plugins: [thirdPartyLicenses({ projectRoot: resolve(".") }), playerFont()],
  build: {
    outDir: "dist/player",
    emptyOutDir: true,
    copyPublicDir: false,
    target: "es2022",
    lib: {
      entry: "src/player/index.ts",
      formats: ["es"],
      // A literal name, for the reason vite.lib.config.ts gives.
      fileName: () => "marey-player.mjs",
    },
    rolldownOptions: {
      output: { chunkFileNames: "[name]-[hash].mjs" },
    },
  },
});
