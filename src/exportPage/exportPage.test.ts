import { describe, expect, it } from "vitest";
import { toBase64 } from "./protocol";
import { EXPORT_FONT_FAMILY, EXPORT_FONT_URL } from "../compiler/export/exportFonts";
import indexHtml from "./index.html?raw";
import exportPageConfigSource from "../../vite.exportpage.config.ts?raw";

describe("toBase64", () => {
  it("matches one btoa over the whole input, across the chunk boundary", () => {
    // Two full 0x8000-byte chunks and a partial third, with every byte value.
    const bytes = new Uint8Array(0x8000 * 2 + 3).map((_, i) => (i * 31 + (i >> 8)) & 0xff);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    expect(toBase64(bytes)).toBe(btoa(binary));
  });

  it("encodes an empty array as an empty string", () => {
    expect(toBase64(new Uint8Array(0))).toBe("");
  });
});

/**
 * The export font's path is written in three places the page depends on,
 * none of which can derive from another: the page's `@font-face`, the
 * constant `fetchExportFont` requests (`EXPORT_FONT_URL`), and the file the
 * page's build emits. If they drift, the page's text exports refuse with
 * `EXPORT_FONT_UNAVAILABLE`, but only in a browser, which this suite cannot
 * run. This pins them together here. (The app's own `@font-face`, in
 * `src/styles/global.scss`, is not readable here: Vitest turns stylesheets
 * into empty modules.)
 */
describe("the export page's font", () => {
  it("is declared by index.html at EXPORT_FONT_URL, and emitted there by its build", () => {
    const fontFace = /@font-face\s*\{[^}]*\}/.exec(indexHtml)?.[0] ?? "";
    expect(fontFace).toContain(`font-family: '${EXPORT_FONT_FAMILY}';`);
    expect(fontFace).toContain(`url('${EXPORT_FONT_URL}')`);
    expect(fontFace).toContain("font-display: block;");
    expect(exportPageConfigSource).toContain(`const EXPORT_FONT_FILE = "${EXPORT_FONT_URL.slice(1)}";`);
  });

  it("is the page's only markup besides the module script", () => {
    expect(indexHtml).toContain('<script type="module" src="/main.ts"></script>');
    expect(indexHtml).not.toMatch(/<body|<div|<link|<meta/);
  });
});
