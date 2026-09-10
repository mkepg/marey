import { describe, it, expect } from "vitest";
import { parseArgs, formatDiagnostic, checkOne } from "./check";

describe("parseArgs", () => {
  it("collects file arguments", () => {
    expect(parseArgs(["a.marey", "b.marey"]).files).toEqual(["a.marey", "b.marey"]);
  });

  it("defaults to no export check and no fps", () => {
    const a = parseArgs(["a.marey"]);
    expect(a.exportReady).toBe(false);
    expect(a.fps).toBeNull();
  });

  it("reads --export-ready and --fps", () => {
    const a = parseArgs(["--export-ready", "--fps", "30", "a.marey"]);
    expect(a.exportReady).toBe(true);
    expect(a.fps).toBe(30);
  });

  it("rejects a non-numeric fps", () => {
    expect(parseArgs(["--fps", "soon", "a.marey"]).error).toContain("--fps");
  });

  it("rejects an empty file list", () => {
    expect(parseArgs([]).error).toContain("no files");
  });
});

describe("formatDiagnostic", () => {
  it("renders file, line and column", () => {
    const line = formatDiagnostic("scenes/a.marey", {
      phase: "TYPE", message: "[TYPE_X] bad", line: 4, col: 7,
    });
    expect(line).toContain("scenes/a.marey:4:7");
    expect(line).toContain("[TYPE_X] bad");
  });

  it("renders a diagnostic with no position without inventing one", () => {
    const line = formatDiagnostic("a.marey", { phase: "SYSTEM", message: "boom" });
    expect(line).toContain("a.marey");
    expect(line).not.toContain(":undefined");
  });
});

describe("checkOne", () => {
  const plain = parseArgs(["x.marey"]);
  const ready = parseArgs(["--export-ready", "x.marey"]);
  const ready30 = parseArgs(["--export-ready", "--fps", "30", "x.marey"]);

  it("passes a valid scene", () => {
    expect(checkOne("x.marey", `scene { size: (8, 6) }`, plain).ok).toBe(true);
  });

  it("fails an invalid scene and names the diagnostic", () => {
    const out = checkOne("x.marey", `scene { size: (8, 6) circle c { position: (1,2), radius: -3 } }`, plain);
    expect(out.ok).toBe(false);
    // The brief's fixture asserted "greater than zero" (spelled out), but
    // compileSource.test.ts:51 already established — by running the
    // validator on this exact source — that the "positive" constraint
    // branch (validator.ts) produces "greater than 0" with a digit.
    // AGENT-LESSONS §3d: a verbatim fixture is a claim to check, not paste.
    expect(out.lines.join("\n")).toContain("greater than 0");
  });

  it("ignores export-readiness unless asked", () => {
    expect(checkOne("x.marey", `scene { size: (8, 6) }`, plain).ok).toBe(true);
  });

  it("reports an unbounded scene under --export-ready with no fps", () => {
    const out = checkOne("x.marey", `scene { size: (8, 6) }`, ready);
    expect(out.ok).toBe(false);
    expect(out.lines.join("\n")).toContain("EXPORT_UNBOUNDED_SCENE");
  });

  it("accepts a bounded scene under --export-ready with an fps", () => {
    expect(checkOne("x.marey", `scene { size: (8, 6) duration: 2 }`, ready30).ok).toBe(true);
  });

  it("reports an unsupported fps only when an fps was given", () => {
    const at25 = parseArgs(["--export-ready", "--fps", "25", "x.marey"]);
    const out = checkOne("x.marey", `scene { size: (8, 6) duration: 2 }`, at25);
    expect(out.lines.join("\n")).toContain("EXPORT_UNSUPPORTED_FPS");
    expect(checkOne("x.marey", `scene { size: (8, 6) duration: 2 }`, ready).ok).toBe(true);
  });

  // None of the fixtures above actually exercise the --fps-omitted filter:
  // the scene either has no diagnostics at the probe rate, or its one
  // diagnostic (EXPORT_UNBOUNDED_SCENE) is rate-independent, so it survives
  // the filter either way. Confirmed by deleting the filter outright and
  // re-running this file: all cases above still passed. This case picks a
  // duration whose frame count at the 30fps probe rate (300s * 30 = 9000
  // frames) exceeds MAX_EXPORT_FRAMES (7,200 — exportContract.ts), so
  // EXPORT_FRAME_BUDGET fires only because of *which rate the probe used*.
  // Without --fps that must not surface; with the same rate given
  // explicitly, it must.
  it("does not surface a frame-budget overflow caused only by the probe rate", () => {
    const longScene = `scene { size: (8, 6) duration: 300 }`;
    expect(checkOne("x.marey", longScene, ready).ok).toBe(true);

    const at30 = parseArgs(["--export-ready", "--fps", "30", "x.marey"]);
    const withFps = checkOne("x.marey", longScene, at30);
    expect(withFps.ok).toBe(false);
    expect(withFps.lines.join("\n")).toContain("EXPORT_FRAME_BUDGET");
  });
});
