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
  h264LevelFor,
  vp9LevelFor,
  H264_LEVELS,
  VP9_LEVELS,
  videoSourceConfig,
  videoOutputFormatOptions,
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
// A second, differently-sized even fixture. EVEN alone cannot distinguish
// "planVideo passes the scene's own dimensions through" from "planVideo
// hardcodes 800x600" -- both produce the same numbers against EVEN. Only a
// fixture with different dimensions makes that distinction load-bearing.
const OTHER_EVEN = irFor(`scene { size: (640, 480) duration: 5 }`);

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
  it("resolves 800x600 mp4 at 30 fps to H.264 baseline level 3.1", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.container).toBe("mp4");
    // Literal: the string the phase's MP4 evidence was measured with. If
    // this changes, that evidence has to be re-measured.
    expect(r.plan.fullCodecString).toBe("avc1.42001f");
    expect(r.plan.mediabunnyCodec).toBe("avc");
  });

  it("resolves 800x600 webm at 30 fps to VP9 profile 0 level 3.1", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "webm" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.container).toBe("webm");
    // Not the old pin `vp09.00.10.08` (level 1), which declared a level 13x
    // too small for this frame size.
    expect(r.plan.fullCodecString).toBe("vp09.00.31.08");
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

  it("passes through a different scene's dimensions, not a hardcoded 800x600", () => {
    const r = planVideo(OTHER_EVEN, planFor(OTHER_EVEN), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.width).toBe(640);
    expect(r.plan.height).toBe(480);
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
    // Literal, not toBeGreaterThan(0): a keyFrameInterval of 1 (a keyframe
    // every frame) is > 0 and would still pass a sign check, but it is not
    // the pinned value and silently changes the emitted bitstream. toBe(30)
    // strictly subsumes the sign check, so the weaker assertion is replaced
    // rather than kept alongside it.
    expect(r.plan.encoderOptions.keyFrameInterval).toBe(30);
  });

  it("uses an explicit bitrate rather than a library default", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4" });
    expect(r.ok).toBe(true);
    // Literal, not toBeGreaterThan(0), for the same reason as
    // keyFrameInterval above: a sign check cannot tell 8_000_000 apart from
    // 1, and DEFAULT_BITRATE is a pinned value the spec requires exact.
    if (r.ok) expect(r.plan.bitrate).toBe(8_000_000);
  });

  it("lets the request override the bitrate", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4", bitrate: 12_345_678 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.bitrate).toBe(12_345_678);
  });
});

/**
 * The codec level is chosen per plan (whole-branch review I-5, ruling R43).
 * Every expected value below was worked by hand from the standards' tables
 * (H.264 Table A-1; libvpx `vp9_level_defs`), not read back from the code.
 */
describe("h264LevelFor", () => {
  const BR = 8_000_000;
  it.each([
    // [width, height, fps, bitrate, level, why]
    [800, 600, 30, BR, "3.1", "1,900 MBs > level 3 MaxFS 1,620"],
    [800, 600, 60, BR, "3.2", "114,000 MB/s > 3.1 MaxMBPS 108,000, as the encoder wrote at 60 fps"],
    [1280, 720, 30, BR, "3.1", "exactly 3,600 MBs, the 3.1 MaxFS"],
    [1296, 720, 30, BR, "3.2", "3,645 MBs, one column over the 3.1 MaxFS"],
    [1920, 1080, 30, BR, "4", "8,160 MBs, 1080 rounds up to 68 rows"],
    [1080, 1920, 30, BR, "4", "portrait, 120 MB rows within Sqrt(8192*8) = 256"],
    [1000, 1000, 30, BR, "3.2", "3,969 MBs"],
    [1920, 1080, 60, BR, "4.2", "489,600 MB/s > 4.1 MaxMBPS 245,760"],
    [4096, 16, 30, BR, "4", "256 MBs wide needs Sqrt(MaxFS*8) >= 256, so MaxFS 8,192"],
    [100, 100, 30, 50_000, "1", "49 MBs, 1,470 MB/s, 50 kbit/s"],
    [100, 100, 30, BR, "3", "same frame, but 8 Mbit/s needs MaxBR >= 8,000"],
    [3840, 2160, 30, BR, "5.1", "32,400 MBs, 972,000 MB/s"],
  ])("%ix%i at %i fps, %i bit/s -> level %s (%s)", (w, h, fps, bitrate, level) => {
    expect(h264LevelFor(w, h, fps, bitrate)?.name).toBe(level);
  });

  it.each([
    [4096, 2304, 30, "36,864 MBs fits the 5.1 MaxFS, but 1,105,920 MB/s exceeds its 983,040"],
    [7680, 4320, 30, "129,600 MBs"],
  ])("%ix%i at %i fps fits no supported level (%s)", (w, h, fps) => {
    expect(h264LevelFor(w, h, fps, 8_000_000)).toBeNull();
  });

  it("covers Table A-1 from level 1 to 5.1 with limits never decreasing", () => {
    expect(H264_LEVELS.map((l) => l.name)).toEqual([
      "1", "1.1", "1.2", "1.3", "2", "2.1", "2.2", "3", "3.1", "3.2", "4", "4.1", "4.2", "5", "5.1",
    ]);
    for (let i = 1; i < H264_LEVELS.length; i++) {
      expect(H264_LEVELS[i].maxFrameMbs).toBeGreaterThanOrEqual(H264_LEVELS[i - 1].maxFrameMbs);
      expect(H264_LEVELS[i].maxMbPerSecond).toBeGreaterThanOrEqual(H264_LEVELS[i - 1].maxMbPerSecond);
    }
  });
});

describe("vp9LevelFor", () => {
  const BR = 8_000_000;
  it.each([
    [800, 600, 30, BR, "3.1", "fits level 3 size and rate, but 8 Mbit/s > its 7,200 kbit/s"],
    [800, 600, 30, 5_000_000, "3", "the same frame at 5 Mbit/s"],
    [1920, 1080, 30, BR, "4", "2,073,600 samples > the 3.1 limit 983,040"],
    [1080, 1920, 30, BR, "4", "portrait, 1920 within the level 4 breadth 4,160"],
    [3000, 16, 30, BR, "4", "3000 wide > the 3.1 breadth 2,752"],
    [7680, 4320, 30, BR, "6", "33,177,600 samples > the 5.2 limit 8,912,896"],
  ])("%ix%i at %i fps, %i bit/s -> level %s (%s)", (w, h, fps, bitrate, level) => {
    expect(vp9LevelFor(w, h, fps, bitrate)?.name).toBe(level);
  });

  it("returns null beyond the level 6.2 breadth", () => {
    expect(vp9LevelFor(17_000, 16, 30, 8_000_000)).toBeNull();
  });

  it("covers every VP9 level from 1 to 6.2", () => {
    expect(VP9_LEVELS.map((l) => l.code)).toEqual([
      "10", "11", "20", "21", "30", "31", "40", "41", "50", "51", "52", "60", "61", "62",
    ]);
  });
});

describe("planVideo · codec string per plan", () => {
  it.each([
    ["(800, 600)", 60, "mp4", "avc1.420020"],
    ["(1920, 1080)", 30, "mp4", "avc1.420028"],
    ["(1080, 1920)", 30, "mp4", "avc1.420028"],
    ["(1000, 1000)", 30, "mp4", "avc1.420020"],
    ["(1920, 1080)", 60, "mp4", "avc1.42002a"],
    ["(1920, 1080)", 30, "webm", "vp09.00.40.08"],
  ] as const)("size %s at %i fps as %s -> %s", (size, fps, container, codec) => {
    const ir = irFor(`scene { size: ${size} duration: 1 }`);
    const r = planVideo(ir, planFor(ir, fps), { container });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.fullCodecString).toBe(codec);
  });

  it("refuses an mp4 no H.264 level admits, naming the real reason, and accepts it as webm", () => {
    const ir = irFor(`scene { size: (7680, 4320) duration: 1 }`);
    const r = planVideo(ir, planFor(ir), { container: "mp4" });
    expect(codes(r)).toEqual(["VIDEO_EXCEEDS_CODEC_LEVELS"]);
    if (!r.ok) {
      const message = r.diagnostics[0].message;
      expect(message).toContain("7680x4320 scene at 30fps");
      expect(message).toContain("too large or too fast for MP4 export");
      expect(message).toContain("H.264 level 5.1");
      // Not the browser-blaming wording of VIDEO_UNSUPPORTED_CODEC.
      expect(message).not.toContain("does not support");
    }
    expect(planVideo(ir, planFor(ir), { container: "webm" }).ok).toBe(true);
  });

  it("reports an oversize mp4 and odd dimensions together", () => {
    const ir = irFor(`scene { size: (7681, 4321) duration: 1 }`);
    expect(codes(planVideo(ir, planFor(ir), { container: "mp4" }))).toEqual([
      "VIDEO_ODD_DIMENSIONS",
      "VIDEO_EXCEEDS_CODEC_LEVELS",
    ]);
  });

  it("refuses a webm beyond the top VP9 level", () => {
    const ir = irFor(`scene { size: (17000, 16) duration: 1 }`);
    const r = planVideo(ir, planFor(ir), { container: "webm" });
    expect(codes(r)).toEqual(["VIDEO_EXCEEDS_CODEC_LEVELS"]);
    if (!r.ok) {
      expect(r.diagnostics[0].message).toContain("VP9 level 6.2");
      expect(r.diagnostics[0].message).not.toContain("export WebM");
    }
  });
});

/**
 * What actually reaches mediabunny (whole-branch review I-3, ruling R44).
 * The `planVideo` tests above pin `VideoPlan`'s values; these pin the object
 * built from them, including the one field that is converted rather than
 * copied. `toStrictEqual` rather than `toEqual`: `toEqual` ignores a key whose
 * value is `undefined`, so a config that set `latencyMode: undefined` would
 * pass it.
 */
describe("videoSourceConfig", () => {
  function planOf(ir: IRSceneNode, fps: number, container: "mp4" | "webm") {
    const r = planVideo(ir, planFor(ir, fps), { container });
    if (!r.ok) throw new Error(`fixture video plan failed: ${codes(r).join(", ")}`);
    return r.plan;
  }

  it("builds the full mp4 config at 30 fps, keyframe interval in seconds", () => {
    expect(videoSourceConfig(planOf(EVEN, 30, "mp4"))).toStrictEqual({
      codec: "avc",
      bitrate: 8_000_000,
      fullCodecString: "avc1.42001f",
      hardwareAcceleration: "prefer-software",
      latencyMode: "quality",
      bitrateMode: "constant",
      // 30 frames at 30 fps is one second. Passing the frame count through
      // unconverted (Task 2's measured bug) would make this 30.
      keyFrameInterval: 1,
    });
  });

  it("divides by the plan's own fps, not a fixed 30", () => {
    // A conversion hardcoded to `/ 30`, or one that used EXPORT_FPS, would
    // pass the 30 fps test above and fail these.
    expect(videoSourceConfig(planOf(EVEN, 24, "mp4")).keyFrameInterval).toBe(30 / 24);
    expect(videoSourceConfig(planOf(EVEN, 60, "webm")).keyFrameInterval).toBe(0.5);
  });

  it("builds the webm config with mediabunny's vp9 codec name", () => {
    const config = videoSourceConfig(planOf(EVEN, 30, "webm"));
    expect(config.codec).toBe("vp9");
    expect(config.fullCodecString).toBe(planOf(EVEN, 30, "webm").fullCodecString);
    expect(config.hardwareAcceleration).toBe("prefer-software");
    expect(config.latencyMode).toBe("quality");
    expect(config.bitrateMode).toBe("constant");
  });

  it("carries a request's bitrate override through to the encoder", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4", bitrate: 12_345_678 });
    if (!r.ok) throw new Error("fixture video plan failed");
    expect(videoSourceConfig(r.plan).bitrate).toBe(12_345_678);
  });
});

describe("videoOutputFormatOptions", () => {
  it("asks for an mp4 with moov written before mdat", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4" });
    if (!r.ok) throw new Error("fixture video plan failed");
    expect(videoOutputFormatOptions(r.plan)).toStrictEqual({
      container: "mp4",
      fastStart: "in-memory",
    });
  });

  it("gives webm no container options", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "webm" });
    if (!r.ok) throw new Error("fixture video plan failed");
    expect(videoOutputFormatOptions(r.plan)).toStrictEqual({ container: "webm" });
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
