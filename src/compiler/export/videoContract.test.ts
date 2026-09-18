import { describe, it, expect } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import { planExport } from "./exportContract";
import {
  planVideo,
  frameTimestampSeconds,
  frameDurationSeconds,
  noWebCodecsDiagnostic,
  unsupportedCodecDiagnostic,
  MP4_CODEC_STRING,
  WEBM_CODEC_STRING,
} from "./videoContract";
import type { IRSceneNode } from "../sceneIR";
import type { SamplerPlan } from "./exportContract";

function irFor(source: string): IRSceneNode {
  const { ast } = parse(lex(source));
  const { ir, errors } = typeCheck(ast!);
  if (!ir) throw new Error(`fixture did not compile: ${errors.map(e => e.message).join("; ")}`);
  return ir;
}

const EVEN = irFor(`scene { size: (800, 600) duration: 5 }`);
const ODD = irFor(`scene { size: (801, 601) duration: 5 }`);

function planFor(ir: IRSceneNode, fps = 30): SamplerPlan {
  const r = planExport(ir, { fps });
  if (!r.ok) throw new Error(`fixture plan failed: ${r.diagnostics.map(d => d.code).join(", ")}`);
  return r.plan;
}

function codes(r: ReturnType<typeof planVideo>): string[] {
  return r.ok ? [] : r.diagnostics.map((d) => d.code);
}

describe("frameTimestampSeconds", () => {
  // mediabunny takes SECONDS, not microseconds (VideoSampleInit.timestamp is
  // documented "in seconds"). Passing microseconds produces a file whose
  // frames are 1,000,000x too far apart -- which still plays, and still
  // decodes the right frame count, so nothing else in this suite would catch
  // the unit being wrong. That is why this is pinned explicitly.
  it.each([
    [0, 30, 0],
    [1, 30, 1 / 30],
    [29, 30, 29 / 30],
    [1, 24, 1 / 24],
    [1, 60, 1 / 60],
  ])("frame %i at %ifps is at %f seconds", (index, fps, expected) => {
    expect(frameTimestampSeconds(index, fps)).toBeCloseTo(expected, 12);
  });

  it("gives each frame a duration of exactly one frame period", () => {
    expect(frameDurationSeconds(30)).toBeCloseTo(1 / 30, 12);
    expect(frameDurationSeconds(24)).toBeCloseTo(1 / 24, 12);
  });

  it("advances monotonically with no accumulated drift across a long export", () => {
    // Computed from the index each time rather than accumulated, so frame
    // 7199 is exactly 7199/30 and not 7199 additions of 1/30. Exact equality
    // (not toBeCloseTo) is deliberate: 7199 accumulated additions of 1/30
    // drift from 7199/30 by about 1.1e-11 (measured), which toBeCloseTo(...,
    // 9)'s ~5e-10 tolerance is too loose to catch. A single division by
    // definition produces the same float every time, so exact equality is
    // not fragile here -- it is the only assertion an accumulating
    // implementation cannot also satisfy.
    expect(frameTimestampSeconds(7_199, 30)).toBe(7_199 / 30);
  });
});

describe("planVideo · container and codec", () => {
  it("resolves mp4 to pinned H.264 baseline", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.container).toBe("mp4");
    expect(r.plan.fullCodecString).toBe(MP4_CODEC_STRING);
    // Pinned against the literal, not just against the re-imported constant:
    // comparing only to `MP4_CODEC_STRING` can never fail, since planVideo
    // and the assertion would drift together (AGENT-LESSONS §2c). This is
    // the assertion mutation 1 in the task report actually needs.
    expect(r.plan.fullCodecString).toBe("avc1.42001f");
    expect(r.plan.mediabunnyCodec).toBe("avc");
  });

  it("resolves webm to pinned VP9", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "webm" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.container).toBe("webm");
    expect(r.plan.fullCodecString).toBe(WEBM_CODEC_STRING);
    expect(r.plan.fullCodecString).toBe("vp09.00.10.08");
    expect(r.plan.mediabunnyCodec).toBe("vp9");
  });

  it("carries the scene's dimensions and the plan's frame rate and count", () => {
    const r = planVideo(EVEN, planFor(EVEN, 24), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.width).toBe(800);
    expect(r.plan.height).toBe(600);
    expect(r.plan.fps).toBe(24);
    expect(r.plan.frameCount).toBe(120);
  });
});

describe("planVideo · pinned encoder configuration", () => {
  // AGENT-LESSONS 2d: each of these was measured to change the emitted
  // bitstream (spec M4), and the code looks correct with any value. Without
  // this test, changing any one of them leaves the whole suite green and
  // silently makes exports non-reproducible.
  it("pins every field that was measured to change the bitstream", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.encoderOptions).toMatchObject({
      hardwareAcceleration: "prefer-software",
      latencyMode: "quality",
      bitrateMode: "constant",
    });
    expect(r.plan.encoderOptions.keyFrameInterval).toBeGreaterThan(0);
  });

  it("uses an explicit bitrate rather than a library default", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.bitrate).toBeGreaterThan(0);
  });

  it("lets the request override the bitrate", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4", bitrate: 12_345_678 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.bitrate).toBe(12_345_678);
  });
});

describe("planVideo · diagnostics", () => {
  it("refuses odd dimensions, naming both the width and the height", () => {
    const out = planVideo(ODD, planFor(ODD), { container: "mp4" });
    expect(codes(out)).toContain("VIDEO_ODD_DIMENSIONS");
    if (!out.ok) {
      expect(out.diagnostics[0].message).toContain("801");
      expect(out.diagnostics[0].message).toContain("601");
    }
  });

  it("accepts odd dimensions for webm, where 4:2:0 is not forced", () => {
    // If Task 4 Q2 measures that VP9 also requires even dimensions, this test
    // is the one that must change -- and that change is a finding to report.
    expect(codes(planVideo(ODD, planFor(ODD), { container: "webm" }))).toEqual([]);
  });
});

// Neither factory is called by planVideo -- Tasks 2/3/5 call them directly
// once WebCodecs support and codec-support checks exist, which this task
// does not implement. Deleting both functions leaves this suite green unless
// they are tested here directly (AGENT-LESSONS 2c rung 4: "no test exists at
// all" is the rung reading a diff cannot catch).
describe("noWebCodecsDiagnostic", () => {
  it("names the code and points at the secure-context requirement", () => {
    const d = noWebCodecsDiagnostic();
    expect(d.code).toBe("VIDEO_NO_WEBCODECS");
    expect(d.message).toContain("VIDEO_NO_WEBCODECS");
    expect(d.message).toContain("VideoEncoder");
    expect(d.message).toContain("secure context");
  });
});

describe("unsupportedCodecDiagnostic", () => {
  it("names the code and includes the codec string and container", () => {
    const d = unsupportedCodecDiagnostic("avc1.42001f", "mp4");
    expect(d.code).toBe("VIDEO_UNSUPPORTED_CODEC");
    expect(d.message).toContain("VIDEO_UNSUPPORTED_CODEC");
    expect(d.message).toContain("avc1.42001f");
    expect(d.message).toContain("MP4");
  });

  it("uppercases the container name for webm too", () => {
    const d = unsupportedCodecDiagnostic("vp09.00.10.08", "webm");
    expect(d.message).toContain("WEBM");
  });
});
