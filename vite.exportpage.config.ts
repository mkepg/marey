import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { thirdPartyLicenses } from "./vite-plugins/thirdPartyLicenses";

/**
 * The export page's build (spec §4.2): `src/exportPage/` into
 * `dist/export-page/`, the page `marey export` loads in headless Chromium. It
 * holds the pipelines, the export font and the HarfBuzz wasm, and no UI.
 *
 * `public/` is not copied: the page needs one file from it, the export font,
 * and none of the site's own (`favicon.svg`, `og-image.png`, ...).
 * `publicDir` still points at it, because the licence plugin reads the font
 * licences from there. That plugin lists every font in `public/fonts/`, so
 * the page's licence file also names the Syne fonts it does not ship. That
 * over-lists, which is the safe direction for a notices file.
 */
const EXPORT_FONT_FILE = "fonts/JetBrainsMono-Regular.ttf";

/**
 * Emits the one font the page uses, at the path its `@font-face` and
 * `EXPORT_FONT_URL` (`src/compiler/export/exportFonts.ts`) both load from.
 */
function exportFont(): Plugin {
  return {
    name: "marey:export-font",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: EXPORT_FONT_FILE,
        source: readFileSync(resolve("public", EXPORT_FONT_FILE)),
      });
    },
  };
}

export default defineConfig({
  root: "src/exportPage",
  base: "/",
  publicDir: resolve("public"),
  // `root` is `src/exportPage`, so the licence plugin is told where the
  // repository root, and its `vite-plugins/licenses/`, is.
  plugins: [thirdPartyLicenses({ projectRoot: resolve(".") }), exportFont()],
  build: {
    outDir: resolve("dist/export-page"),
    emptyOutDir: true,
    copyPublicDir: false,
  },
});
