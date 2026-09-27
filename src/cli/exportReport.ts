/**
 * The one-line summary a successful `marey export` prints (spec §3, global
 * constraint 9), and the mapping of Playwright's own missing-executable
 * error onto Marey's `[EXPORT_BROWSER_MISSING]` diagnostic (spec §3.1).
 */
export interface ExportSummary {
  readonly out: string;
  readonly frameCount: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly hash: string;
  /** The x264 version, present only for an MP4 that went through ffmpeg. */
  readonly ffmpeg?: string;
}

/**
 * Exactly:
 * `wrote <out>  <n> frames @ <fps> fps  <w>x<h>  <bytes> B  sha256 <hex>  frames <hash>`,
 * with `  ffmpeg <version>` appended for an x264 MP4. Repeating an export and
 * comparing two lines is then the whole determinism check a reader needs
 * (spec §3), so the format is fixed rather than merely documented.
 */
export function summaryLine(s: ExportSummary): string {
  const line = `wrote ${s.out}  ${s.frameCount} frames @ ${s.fps} fps  ${s.width}x${s.height}  ${s.bytes} B  sha256 ${s.sha256}  frames ${s.hash}`;
  return s.ffmpeg === undefined ? line : `${line}  ffmpeg ${s.ffmpeg}`;
}

/**
 * Pinned to Marey's own Playwright version (spec §3.1): a bare
 * `npx playwright-core install` could resolve a different Playwright, and so
 * a different browser build than the one the rest of the pipeline was
 * measured against.
 */
export const BROWSER_INSTALL_COMMAND =
  "npx --package playwright-core@1.62.1 playwright-core install chromium-headless-shell";

export function browserMissingMessage(): string {
  return `[EXPORT_BROWSER_MISSING] The pinned headless Chromium is not installed. Run: ${BROWSER_INSTALL_COMMAND}`;
}

/**
 * Measured 2026-09-27 by launching Chromium with `PLAYWRIGHT_BROWSERS_PATH`
 * pointed at an empty directory (task-6-report.md, Step 1): Playwright's own
 * message is `browserType.launch: Executable doesn't exist at <path>`,
 * followed by an install hint naming a different, unpinned command. This is
 * the smallest substring that distinctively identifies that error rather
 * than any other launch failure.
 */
const MISSING_EXECUTABLE_SUBSTRING = "Executable doesn't exist";

/** The [EXPORT_BROWSER_MISSING] message if `error` is Playwright's missing-executable error, else null. */
export function mapLaunchError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  if (!message.includes(MISSING_EXECUTABLE_SUBSTRING)) return null;
  return browserMissingMessage();
}
