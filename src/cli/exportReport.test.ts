import { describe, it, expect } from "vitest";
import { summaryLine, mapLaunchError, BROWSER_INSTALL_COMMAND } from "./exportReport";

describe("summaryLine", () => {
  const base = { out: "logo.webm", frameCount: 240, fps: 30, width: 1600, height: 1200, bytes: 123456, sha256: "ab".repeat(32), hash: "26cca4e9" };
  it("is exactly the documented format", () => {
    expect(summaryLine(base)).toBe(`wrote logo.webm  240 frames @ 30 fps  1600x1200  123456 B  sha256 ${"ab".repeat(32)}  frames 26cca4e9`);
  });
  it("appends the ffmpeg version when there is one", () => {
    expect(summaryLine({ ...base, ffmpeg: "7.1" })).toMatch(/  frames 26cca4e9  ffmpeg 7\.1$/);
  });
});

describe("mapLaunchError", () => {
  it("maps Playwright's missing-executable error to EXPORT_BROWSER_MISSING with the pinned install command", () => {
    // Fixture text: the substring "Executable doesn't exist at <path>" is what
    // `playwright` actually prints (measured 2026-09-27 by launching Chromium
    // against an empty PLAYWRIGHT_BROWSERS_PATH — see task-6-report.md Step
    // 1); the path below generalizes the measured one, which was this
    // machine's own working copy.
    const m = mapLaunchError(
      new Error(
        "browserType.launch: Executable doesn't exist at C:\\Users\\dev\\.cache\\ms-playwright\\chromium_headless_shell-1234\\chrome-headless-shell-win64\\chrome-headless-shell.exe"
      )
    );
    expect(m).toMatch(/^\[EXPORT_BROWSER_MISSING\] /);
    expect(m).toContain(BROWSER_INSTALL_COMMAND);
  });
  it("leaves any other launch error alone", () => {
    expect(mapLaunchError(new Error("spawn EACCES"))).toBeNull();
  });
});
