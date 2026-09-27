import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { routeAction, assertSameFrameCount, exportScene, runExport, EXPORT_LAUNCH_ARGS } from "./exportDriver";

afterEach(() => vi.restoreAllMocks());

const ROOT = join(tmpdir(), "marey-export-page");

const BOUNDED = `scene {
  size: (80, 60)
  duration: 1
  circle c { position: (40, 30), radius: 5, color: #ffffff }
}`;

const UNBOUNDED = `scene {
  size: (80, 60)
  circle c { position: (40, 30), radius: 5, color: #ffffff }
}`;

/** A page root holding an index.html, so exportScene gets past its build check. */
function builtPageRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "marey-page-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html>");
  return dir;
}

describe("EXPORT_LAUNCH_ARGS", () => {
  it("forces SwiftShader with the flags the visual checks use", () => {
    expect(EXPORT_LAUNCH_ARGS).toEqual(["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"]);
  });
});

describe("routeAction", () => {
  it("serves / as index.html", () => {
    expect(routeAction("GET", "/", ROOT)).toEqual({
      kind: "file",
      path: join(ROOT, "index.html"),
      contentType: "text/html",
    });
  });

  it.each([
    ["/assets/index-abc.js", "text/javascript"],
    ["/assets/harfbuzz-abc.wasm", "application/wasm"],
    ["/fonts/JetBrainsMono-Regular.ttf", "font/ttf"],
    ["/THIRD-PARTY-LICENSES.txt", "text/plain"],
  ])("serves %s as %s from the page root", (pathname, contentType) => {
    expect(routeAction("GET", pathname, ROOT)).toEqual({
      kind: "file",
      path: join(ROOT, pathname.slice(1)),
      contentType,
    });
  });

  it("refuses a path that would leave the page root", () => {
    expect(routeAction("GET", "/%2e%2e/secret.txt", ROOT)).toEqual({ kind: "status", status: 404 });
  });

  it("reads a frame's index from its URL", () => {
    expect(routeAction("POST", "/frame/17", ROOT)).toEqual({ kind: "frame", index: 17 });
  });

  it("refuses a frame URL that carries no index", () => {
    expect(routeAction("POST", "/frame/x", ROOT)).toEqual({ kind: "status", status: 400 });
  });

  it("refuses a POST anywhere but the frame path", () => {
    expect(routeAction("POST", "/index.html", ROOT)).toEqual({ kind: "status", status: 405 });
  });

  it("aborts a listed path, before serving or receiving it", () => {
    const abortPaths = ["/fonts/JetBrainsMono-Regular.ttf", "/frame/3"];
    expect(routeAction("GET", "/fonts/JetBrainsMono-Regular.ttf", ROOT, abortPaths)).toEqual({ kind: "abort" });
    expect(routeAction("POST", "/frame/3", ROOT, abortPaths)).toEqual({ kind: "abort" });
    expect(routeAction("GET", "/", ROOT, abortPaths).kind).toBe("file");
  });
});

describe("assertSameFrameCount", () => {
  it("names both counts when the page and the plan disagree", () => {
    expect(() => assertSameFrameCount(29, 30)).toThrow(
      "[export] The export page produced 29 frames, but Node planned 30.",
    );
  });

  it("accepts equal counts", () => {
    expect(() => assertSameFrameCount(30, 30)).not.toThrow();
  });
});

describe("exportScene before the browser", () => {
  it("refuses an unbounded scene without launching a browser", async () => {
    const launch = vi.spyOn(chromium, "launch").mockRejectedValue(new Error("launched"));
    await expect(
      exportScene({ source: UNBOUNDED, format: "png", fps: 30, durationSeconds: null, pageRoot: builtPageRoot() }),
    ).rejects.toThrow("[EXPORT_UNBOUNDED_SCENE]");
    expect(launch).not.toHaveBeenCalled();
  });

  it("refuses a scene that does not compile, with its position, without launching a browser", async () => {
    const launch = vi.spyOn(chromium, "launch").mockRejectedValue(new Error("launched"));
    await expect(
      exportScene({ source: "scene {", format: "png", fps: 30, durationSeconds: null, pageRoot: builtPageRoot() }),
    ).rejects.toThrow(/^\d+:\d+: /);
    expect(launch).not.toHaveBeenCalled();
  });

  it("refuses when the export page is not built, without launching a browser", async () => {
    const launch = vi.spyOn(chromium, "launch").mockRejectedValue(new Error("launched"));
    const empty = mkdtempSync(join(tmpdir(), "marey-page-"));
    await expect(
      exportScene({ source: BOUNDED, format: "png", fps: 30, durationSeconds: null, pageRoot: empty }),
    ).rejects.toThrow("[export] The export page is not built");
    expect(launch).not.toHaveBeenCalled();
  });

  it("launches with EXPORT_LAUNCH_ARGS and maps a missing executable to EXPORT_BROWSER_MISSING", async () => {
    const launch = vi
      .spyOn(chromium, "launch")
      .mockRejectedValue(new Error("browserType.launch: Executable doesn't exist at /nowhere"));
    await expect(
      exportScene({ source: BOUNDED, format: "png", fps: 30, durationSeconds: null, pageRoot: builtPageRoot() }),
    ).rejects.toThrow(/^\[EXPORT_BROWSER_MISSING\] .*playwright-core@1\.62\.1/);
    expect(launch).toHaveBeenCalledWith({ args: [...EXPORT_LAUNCH_ARGS] });
  });
});

describe("runExport", () => {
  it("prints the usage error and exits 1 without a file", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runExport(["--format", "png"])).toBe(1);
    expect(String(err.mock.calls[0][0])).toContain("Usage: marey export");
  });

  it("prints 'file: message' and exits 1 when the export fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const dir = mkdtempSync(join(tmpdir(), "marey-scene-"));
    const file = join(dir, "open.marey");
    writeFileSync(file, UNBOUNDED);
    expect(await runExport([file, "--format", "png", "--out", join(dir, "out")])).toBe(1);
    expect(String(err.mock.calls[0][0])).toMatch(new RegExp(`^${file.replace(/[\\.]/g, "\\$&")}: \\[EXPORT_UNBOUNDED_SCENE\\]`));
  });
});
