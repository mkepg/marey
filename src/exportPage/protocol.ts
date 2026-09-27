/**
 * The request/result protocol between `marey export` (Node) and the export
 * page (`main.ts`, headless Chromium), spec §4.2-4.4.
 *
 * Both sides import this module, so it holds types, constants and one pure
 * function, and imports nothing: the CLI's project (`tsconfig.cli.json`)
 * must be able to load it without pulling in the pipelines, and nothing here
 * may touch the DOM at runtime (`exportBoundary.test.ts` pins both).
 */

/**
 * The origin the CLI serves the page from, through `page.route`. It has to be
 * `https://`: a plain `http://` custom origin is not a secure context, and has
 * no `VideoEncoder` (spec §4.2). `page.route` opens no socket, so there is no
 * port to collide with.
 */
export const EXPORT_ORIGIN = "https://marey.export";

/**
 * Frames-out formats `POST` each frame's PNG bytes to
 * `EXPORT_ORIGIN + FRAME_PATH + frame.index`. The CLI places a frame by that
 * index, never by the order requests arrive in (5C ruling T4-R2).
 */
export const FRAME_PATH = "/frame/";

export type CliExportFormat = "png" | "apng" | "webm" | "mp4" | "lottie";

export interface CliExportRequest {
  readonly source: string;
  readonly format: CliExportFormat;
  readonly fps: number;
  readonly durationSeconds?: number;
}

export type CliExportResult =
  | {
      readonly ok: true;
      readonly fps: number;
      readonly frameCount: number;
      readonly width: number;
      readonly height: number;
      /** hashFrames over the sampled snapshots. */
      readonly hash: string;
      /** apng, webm, and mp4 when it goes through WebCodecs: the whole file. */
      readonly fileBase64: string | null;
      /** lottie: JSON.stringify(doc), the exact string the button downloads. */
      readonly text: string | null;
    }
  | { readonly ok: false; readonly message: string };

declare global {
  interface Window {
    /**
     * Installed by the export page (`main.ts`) for `marey export`. Unlike the
     * `__mareyExport*` dev seams, this one ships: it lives only in the
     * separate `dist/export-page/` build, never in the app's.
     */
    __mareyCliExport?: (request: CliExportRequest) => Promise<CliExportResult>;
  }
}

/**
 * Base64 without a FileReader round trip. Chunked because spreading a whole
 * file into one `String.fromCharCode` call exceeds the engine's argument
 * limit. The one copy: the export page and the dev seams all import it.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
