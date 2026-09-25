import type { IRObjectNode, IRSceneNode } from "../sceneIR";

/**
 * Fonts first, for every export (Phase 5C, spec §6.1).
 *
 * `builder.ts` gives every `text` node `fontFamily: "'JetBrains Mono',
 * monospace"`, and the face is declared by `@font-face` in
 * `src/styles/global.scss`. A browser loads a `@font-face` lazily, on first
 * use, so on a cold page the first thing that measures or draws text gets
 * the `monospace` fallback. Task 6 Q6 measured that race on a fresh page:
 * `document.fonts.check` false before `load`, a pixi `Text` measuring
 * 494.82 px wide in the fallback against 540 px in JetBrains Mono.
 *
 * `ensureExportFonts` is called by `rasterExport.ts`'s `withRasterExport`,
 * the one export prefix, before any pixi object is built, so it covers
 * video, APNG, Lottie and the PNG dev seam by construction rather than by
 * four call sites.
 *
 * `EXPORT_FONT_UNAVAILABLE` lives here, not in `exportContract.ts`: that
 * module gates timing (global constraint 9), and whether a font file
 * arrived is a property of the page, not of the scene.
 */

/** The family `builder.ts` asks for, without its `monospace` fallback. */
export const EXPORT_FONT_FAMILY = "JetBrains Mono";

/**
 * The URL `@font-face` loads the family from (`src/styles/global.scss`),
 * which `lottiePipeline.ts` fetches again for HarfBuzz. A root-relative
 * literal, exactly as the stylesheet writes it: the built CSS keeps
 * `url(/fonts/JetBrainsMono-Regular.ttf)` unhashed and `BASE_URL` is `/`
 * (Task 6, Q5), so the two requests name the same file.
 */
export const EXPORT_FONT_URL = "/fonts/JetBrainsMono-Regular.ttf";

/** The two `FontFaceSet` members this module uses; tests pass a fake. */
export type ExportFontSet = Pick<FontFaceSet, "load" | "check">;

/** The CSS font shorthand `ensureExportFonts` loads and checks for `size`. */
export function exportFontSpec(size: number): string {
  return `${size}px '${EXPORT_FONT_FAMILY}'`;
}

/** Each distinct `fontSize` of every `text` node in the scene, ascending. */
export function exportFontSizes(ir: IRSceneNode): number[] {
  const sizes = new Set<number>();
  const visit = (node: IRObjectNode): void => {
    if (node.props.kind === "text") sizes.add(node.props.fontSize);
    node.children.forEach(visit);
  };
  ir.children.forEach(visit);
  return [...sizes].sort((a, b) => a - b);
}

/**
 * Load the export font at every size the scene's text uses, and refuse the
 * export if it is still unavailable afterwards.
 *
 * `load` resolves once every face matching the spec has loaded, and rejects
 * if one fails (a network error, a 404). Either way `check` is the verdict:
 * it is true only when a face for the family is loaded and nothing would
 * fall back. A rejection is not rethrown, because its `NetworkError` text
 * names nothing a person could act on; the diagnostic below does.
 *
 * A text-free scene makes no call at all, and never reads `document`, so
 * the Node suite can run a text-free export's prefix.
 */
export async function ensureExportFonts(ir: IRSceneNode, fonts?: ExportFontSet): Promise<void> {
  const sizes = exportFontSizes(ir);
  if (sizes.length === 0) return;
  const fontSet = fonts ?? document.fonts;
  for (const size of sizes) {
    const spec = exportFontSpec(size);
    try {
      await fontSet.load(spec);
    } catch {
      // Judged by `check` below.
    }
    if (!fontSet.check(spec)) {
      throw fontUnavailable(`did not load at ${size}px`);
    }
  }
}

/**
 * The export font file's bytes, for HarfBuzz (`textOutline.ts`).
 *
 * Fetched once per export that has text. Not a cache hit under `vite
 * preview`, which sends `Cache-Control: no-cache` for `public/` files, so
 * this revalidates about 115 KB over the network (Task 6, Q5); the plan
 * accepts that rather than adding a cache layer. A failure is the same
 * refusal as a font that did not load: without the bytes there are no
 * outlines to export.
 */
export async function fetchExportFont(fetchImpl: typeof fetch = fetch): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetchImpl(EXPORT_FONT_URL);
  } catch {
    throw fontUnavailable("could not be fetched from " + EXPORT_FONT_URL);
  }
  if (!response.ok) {
    throw fontUnavailable(`could not be fetched from ${EXPORT_FONT_URL} (HTTP ${response.status})`);
  }
  return response.arrayBuffer();
}

/** The one place `EXPORT_FONT_UNAVAILABLE`'s wording lives. */
function fontUnavailable(what: string): Error {
  return new Error(
    `[EXPORT_FONT_UNAVAILABLE] The export font '${EXPORT_FONT_FAMILY}' ${what}, ` +
      `so this scene's text cannot be exported to match the preview. ` +
      `Check the connection and export again.`,
  );
}
