import { describe, it, expect } from "vitest";
import { parseExportArgs, defaultOutPath, frameFileName } from "./exportArgs";

describe("parseExportArgs", () => {
  it("reads the file, format and defaults", () => {
    const a = parseExportArgs(["scenes/logo.marey", "--format", "webm"]);
    expect(a).toMatchObject({ file: "scenes/logo.marey", format: "webm", fps: 30, durationSeconds: null, out: "logo.webm", error: null });
  });
  it("reads --fps, --duration and --out", () => {
    const a = parseExportArgs(["a.marey", "--format", "png", "--fps", "24", "--duration", "2.5", "--out", "x"]);
    expect(a).toMatchObject({ fps: 24, durationSeconds: 2.5, out: "x", error: null });
  });
  it("requires --format", () => {
    expect(parseExportArgs(["a.marey"]).error).toContain("--format");
  });
  it("rejects an unknown format, naming the real ones", () => {
    const e = parseExportArgs(["a.marey", "--format", "gif"]).error!;
    expect(e).toContain("'gif'");
    for (const f of ["png", "apng", "webm", "mp4", "lottie"]) expect(e).toContain(f);
  });
  it("rejects a --scale flag rather than reading it as a file (spec §3: no --scale)", () => {
    expect(parseExportArgs(["a.marey", "--format", "mp4", "--scale", "1"]).error).toContain("Unrecognized option '--scale'");
  });
  it("rejects two input files", () => {
    expect(parseExportArgs(["a.marey", "b.marey", "--format", "png"]).error).toContain("one file");
  });
  it("rejects a non-numeric or non-positive --duration", () => {
    expect(parseExportArgs(["a.marey", "--format", "png", "--duration", "soon"]).error).toContain("--duration");
    expect(parseExportArgs(["a.marey", "--format", "png", "--duration", "0"]).error).toContain("--duration");
  });
});

describe("defaultOutPath", () => {
  it("matches the button's file names, in the working directory", () => {
    expect(defaultOutPath("dir/logo.marey", "mp4")).toBe("logo.mp4");
    expect(defaultOutPath("dir/logo.marey", "webm")).toBe("logo.webm");
    expect(defaultOutPath("dir/logo.marey", "apng")).toBe("logo.png");
    expect(defaultOutPath("dir/logo.marey", "lottie")).toBe("logo.json");
    expect(defaultOutPath("dir/logo.marey", "png")).toBe("logo-frames");
  });
});

describe("frameFileName", () => {
  it("pads to four digits, or more when the count needs it", () => {
    expect(frameFileName(7, 240)).toBe("frame_0007.png");
    expect(frameFileName(7, 12000)).toBe("frame_00007.png");
  });
});
