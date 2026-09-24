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
  h264CodecString,
  H264_LEVELS,
  VP9_LEVELS,
  videoSourceConfig,
  videoOutputFormatOptions,
  VIDEO_SCALE,
  DEFAULT_BITRATE,
  deviceLimitDiagnostic,
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

// Fixture builders for the 2x-video tests below. `sceneOf`/`samplerPlan`
// stand for the task brief's names; they are built from the helpers this
// file already has (`irFor`, `planExport`) rather than duplicating them,
// per the brief's "do not add new ones if equivalents exist" instruction.
// The two are independent: `samplerPlan`'s ir argument only matters for
// `planExport`'s EXPORT_UNBOUNDED_SCENE check, which an explicit
// `durationSeconds` bypasses, so any ir will do.
function sceneOf(width: number, height: number): IRSceneNode {
  return irFor(`scene { size: (${width}, ${height}) duration: 5 }`);
}

function samplerPlan(fps: number, frameCount: number): SamplerPlan {
  const r = planExport(EVEN, { fps, durationSeconds: frameCount / fps });
  if (!r.ok) throw new Error(`fixture plan failed: ${r.diagnostics.map((d) => d.code).join(", ")}`);
  return r.plan;
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
  // Phase 5C: `width`/`height` are now the CODED size (scene size x
  // VIDEO_SCALE), so an 800x600 scene's coded size is 1600x1200, which needs
  // a higher H.264 level than the scene size alone did (was level 3.1,
  // "avc1.42001f"; the phase's MP4 evidence pinned that literal at 1x). Now
  // level 4: 100x75 macroblocks = 7,500 MBs, over level 3.1's 3,600-MB cap
  // but within level 4's 8,192.
  it("resolves 800x600 (scene) / 1600x1200 (coded) mp4 at 30 fps to H.264 level 4", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.container).toBe("mp4");
    expect(r.plan.fullCodecString).toBe("avc1.420028");
    expect(r.plan.mediabunnyCodec).toBe("avc");
  });

  // Same reasoning as above: 1600x1200 has 1,920,000 luma samples, over VP9
  // level 3.1's 983,040-sample cap (was level 3.1, "vp09.00.31.08" at 1x) but
  // within level 4's 2,228,224.
  it("resolves 800x600 (scene) / 1600x1200 (coded) webm at 30 fps to VP9 level 4", () => {
    const r = planVideo(EVEN, planFor(EVEN), { container: "webm" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.container).toBe("webm");
    expect(r.plan.fullCodecString).toBe("vp09.00.40.08");
    expect(r.plan.mediabunnyCodec).toBe("vp9");
  });

  // `width`/`height` are the coded (2x) size; `sceneWidth`/`sceneHeight` are
  // the scene's own declared size (Phase 5C). Was: `width`/`height` pinned
  // to 800/600 directly, before the coded/scene split existed.
  it("carries the coded size, the scene's own size, and the plan's frame rate and count", () => {
    const r = planVideo(EVEN, planFor(EVEN, 24), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.width).toBe(1600);
    expect(r.plan.height).toBe(1200);
    expect(r.plan.sceneWidth).toBe(800);
    expect(r.plan.sceneHeight).toBe(600);
    expect(r.plan.fps).toBe(24);
    expect(r.plan.frameCount).toBe(120);
  });

  // Was: `width`/`height` pinned to 640/480 (the scene's own size) directly.
  // Now the coded size, 1280/960, with the scene's own size kept separately.
  it("passes through a different scene's dimensions, doubled, not a hardcoded 800x600", () => {
    const r = planVideo(OTHER_EVEN, planFor(OTHER_EVEN), { container: "mp4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.width).toBe(1280);
    expect(r.plan.height).toBe(960);
    expect(r.plan.sceneWidth).toBe(640);
    expect(r.plan.sceneHeight).toBe(480);
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
  // Phase 5C: each `size` below is the SCENE's own declared size; the codec
  // is chosen from its doubled (coded) size. Every expected value here was
  // re-derived by running the coded size through `h264LevelFor`/
  // `vp9LevelFor` directly, not by re-deriving the standards tables by hand
  // a second time -- those tables are already pinned by the `h264LevelFor`/
  // `vp9LevelFor` describe blocks above.
  it.each([
    // was 60fps -> "avc1.420020" (level 3) at the scene's own 1x size;
    // 1600x1200 coded needs level 4.2 (7,500 MBs * 60fps = 450,000 MB/s,
    // over level 4's 245,760 cap, within level 4.2's 522,240).
    ["(800, 600)", 60, "mp4", "avc1.42002a"],
    // was "avc1.420028" (level 4) at 1x; 3840x2160 coded needs level 5.1
    // (32,400 MBs, over level 5's 22,080 cap, within level 5.1's 36,864).
    ["(1920, 1080)", 30, "mp4", "avc1.420033"],
    ["(1080, 1920)", 30, "mp4", "avc1.420033"],
    // was "avc1.420020" (level 3) at 1x; 2000x2000 coded (15,625 MBs) needs
    // level 5 (over level 4.2's 8,704-MB cap, within level 5's 22,080).
    ["(1000, 1000)", 30, "mp4", "avc1.420032"],
    // was "vp09.00.40.08" (level 4) at 1x; 3840x2160 coded (8,294,400
    // samples) needs level 5 (over level 4.1's 2,228,224-sample cap, within
    // level 5's 8,912,896).
    ["(1920, 1080)", 30, "webm", "vp09.00.50.08"],
  ] as const)("scene size %s at %i fps as %s -> coded codec %s", (size, fps, container, codec) => {
    const ir = irFor(`scene { size: ${size} duration: 1 }`);
    const r = planVideo(ir, planFor(ir, fps), { container });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.fullCodecString).toBe(codec);
  });

  // Was part of the it.each table above ("(1920, 1080)", 60, "mp4",
  // "avc1.42002a"): at 1x, a 1920x1080 scene at 60fps fit H.264 level 4.2.
  // At 2x its CODED size is 3840x2160, whose macroblock rate (32,400 MBs *
  // 60fps = 1,944,000 MB/s) exceeds even the top level 5.1's 983,040 cap, so
  // the scene that used to fit now has no admitting level at all -- moved
  // out of the table into its own refusal test rather than silently dropped.
  it("refuses a scene whose 1x size fit every H.264 level once doubled", () => {
    const ir = irFor(`scene { size: (1920, 1080) duration: 1 }`);
    const r = planVideo(ir, planFor(ir, 60), { container: "mp4" });
    expect(codes(r)).toEqual(["VIDEO_EXCEEDS_CODEC_LEVELS"]);
    if (!r.ok) {
      const message = r.diagnostics[0].message;
      expect(message).toContain("1920x1080 scene");
      expect(message).toContain("3840x2160 video");
    }
  });

  // Phase 5C: was scene (7680, 4320), whose CODED size (15360x8640) now
  // exceeds every VP9 level too (132,710,400 samples vs level 6.2's
  // 35,651,584 cap), so it could no longer demonstrate "webm still accepts
  // it" -- that would be testing a webm refusal, not an acceptance. Replaced
  // with (2000, 1500), whose coded size (4000x3000, 12,000,000 samples)
  // still exceeds every H.264 level (47,000 MBs vs level 5.1's 36,864 cap)
  // while fitting VP9 level 6 (35,651,584-sample cap), preserving the
  // asymmetry this test exists to pin.
  it("refuses an mp4 no H.264 level admits, naming both sizes and the 2x factor, and accepts it as webm", () => {
    const ir = irFor(`scene { size: (2000, 1500) duration: 1 }`);
    const r = planVideo(ir, planFor(ir), { container: "mp4" });
    expect(codes(r)).toEqual(["VIDEO_EXCEEDS_CODEC_LEVELS"]);
    if (!r.ok) {
      const message = r.diagnostics[0].message;
      expect(message).toContain("exports at 2x the scene's size");
      expect(message).toContain("2000x1500 scene");
      expect(message).toContain("4000x3000 video");
      expect(message).toContain("too large or too fast for MP4 export");
      expect(message).toContain("H.264 level 5.1");
      // Not the browser-blaming wording of VIDEO_UNSUPPORTED_CODEC.
      expect(message).not.toContain("does not support");
    }
    expect(planVideo(ir, planFor(ir), { container: "webm" }).ok).toBe(true);
  });

  // Phase 5C: was "reports an oversize mp4 and odd dimensions together",
  // pinning both VIDEO_ODD_DIMENSIONS and VIDEO_EXCEEDS_CODEC_LEVELS firing
  // at once. VIDEO_ODD_DIMENSIONS is now evaluated on the CODED size
  // (`videoContract.ts`'s comment on the check), and doubling an odd scene
  // dimension (7681, 4321) always lands on an even coded one (15362, 8642),
  // so the odd-dimensions diagnostic can no longer co-occur with the
  // codec-levels one at the current `VIDEO_SCALE`. Only the reachable
  // diagnostic is pinned here; `videoContract.test.ts`'s "2x video (Phase
  // 5C)" describe block separately pins that an odd scene now plans `ok`.
  it("reports only the codec-levels refusal for an oversize, odd scene, since 2x makes it even", () => {
    const ir = irFor(`scene { size: (7681, 4321) duration: 1 }`);
    expect(codes(planVideo(ir, planFor(ir), { container: "mp4" }))).toEqual([
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
    // Phase 5C: was "avc1.42001f" (H.264 level 3.1 at the scene's 1x size,
    // 800x600). `fullCodecString` is chosen from the coded (2x) size,
    // 1600x1200, which needs level 4 -- see "planVideo · container and
    // codec" above for the macroblock arithmetic.
    expect(videoSourceConfig(planOf(EVEN, 30, "mp4"))).toStrictEqual({
      codec: "avc",
      bitrate: 8_000_000,
      fullCodecString: "avc1.420028",
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
  // Phase 5C: was "refuses odd dimensions, naming both the width and the
  // height", pinning that an 801x601 scene refuses mp4 export outright.
  // VIDEO_ODD_DIMENSIONS is now evaluated on the CODED size, and doubling
  // any integer scene dimension always lands on an even one (801*2=1602,
  // 601*2=1202), so this exact scene can no longer trigger the refusal at
  // the current `VIDEO_SCALE` -- moved to "2x video (Phase 5C)" above
  // ("keeps the odd-dimension check on the coded size..."), which pins the
  // new truth (`ok` is `true`) with the same fixture shape. The refusal
  // itself is not deleted (see `videoContract.ts`'s comment on the check);
  // it is provably unreachable while `VIDEO_SCALE` is even, not untested by
  // oversight.
  it("no longer refuses an odd scene at 2x, since doubling makes the coded size even", () => {
    const out = planVideo(ODD, planFor(ODD), { container: "mp4" });
    expect(codes(out)).not.toContain("VIDEO_ODD_DIMENSIONS");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect([out.plan.width, out.plan.height]).toEqual([1602, 1202]);
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

describe("2x video (Phase 5C)", () => {
  it("pins the scale at exactly 2", () => {
    expect(VIDEO_SCALE).toBe(2);
  });

  it("plans the coded size at twice the scene size and keeps the scene size", () => {
    const r = planVideo(sceneOf(800, 600), samplerPlan(30, 180), { container: "mp4" });
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    expect([r.plan.width, r.plan.height]).toEqual([1600, 1200]);
    expect([r.plan.sceneWidth, r.plan.sceneHeight]).toEqual([800, 600]);
    expect(r.plan.scale).toBe(2);
  });

  it("chooses the codec level from the coded size, not the scene size", () => {
    // 800x600 at 1x selected avc1.42001f (level 3.1). 1600x1200 = 7,500 MBs > 3.1's 3,600.
    const r = planVideo(sceneOf(800, 600), samplerPlan(30, 180), { container: "mp4" });
    if (!r.ok) throw new Error("unexpected refusal");
    expect(r.plan.fullCodecString).not.toBe("avc1.42001f");
    expect(r.plan.fullCodecString).toBe(h264CodecString(h264LevelFor(1600, 1200, 30, DEFAULT_BITRATE)!));
  });

  it("names both sizes and the 2x factor when no codec level fits", () => {
    const r = planVideo(sceneOf(2400, 1600), samplerPlan(30, 30), { container: "mp4" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const msg = r.diagnostics[0].message;
    expect(msg).toContain("exports at 2x the scene's size");
    expect(msg).toContain("2400x1600 scene");
    expect(msg).toContain("4800x3200 video");
  });

  it("refuses a coded size above the device texture or renderbuffer limit", () => {
    const r = planVideo(sceneOf(1200, 800), samplerPlan(30, 30), { container: "webm" });
    if (!r.ok) throw new Error("unexpected refusal");
    expect(deviceLimitDiagnostic(r.plan, 2048, 4096)?.code).toBe("VIDEO_EXCEEDS_DEVICE_LIMITS");
    expect(deviceLimitDiagnostic(r.plan, 4096, 2048)?.code).toBe("VIDEO_EXCEEDS_DEVICE_LIMITS");
    expect(deviceLimitDiagnostic(r.plan, 2400, 2400)).toBeNull(); // 2400 = coded width: allowed
    expect(deviceLimitDiagnostic(r.plan, 2399, 4096)?.message).toContain(
      "this device can render at most 2399x2399 pixels",
    );
  });

  it("keeps the odd-dimension check on the coded size, where 2x makes it unreachable", () => {
    const r = planVideo(sceneOf(801, 601), samplerPlan(30, 30), { container: "mp4" });
    expect(r.ok).toBe(true); // 1602x1202: even
  });
});
