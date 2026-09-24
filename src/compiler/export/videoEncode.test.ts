import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import { planExport } from "./exportContract";
import { planVideo, type VideoContainer, type VideoPlan } from "./videoContract";
import { encodeVideo } from "./videoEncode";

/**
 * What `encodeVideo` hands to mediabunny, with mediabunny replaced by
 * recorders (whole-branch review I-3, ruling R44).
 *
 * `videoContract.test.ts` pins the config *objects*; this file pins that
 * `videoEncode.ts` passes them on unchanged. Before it existed, deleting
 * `latencyMode` from the `VideoSampleSource` call, forcing
 * `hardwareAcceleration: "prefer-hardware"`, reverting the keyframe
 * frames-to-seconds conversion, writing timestamps in microseconds, or
 * setting `fastStart: false` each left the whole suite green. WebCodecs is not
 * available headlessly, so the real encoder cannot run here; the decode-back
 * harness (`video-check.mjs`) is what proves the bytes. What this file can
 * prove is what `encodeVideo` *asked* for, and that is the part the harness
 * cannot see: its byte-identity check compares two runs of the same code, so
 * a dropped field is invisible to it.
 */

interface RecordedSample {
  readonly source: unknown;
  readonly init: { timestamp: number; duration: number };
  closed: boolean;
}

const rec = vi.hoisted(() => ({
  sourceConfigs: [] as Record<string, unknown>[],
  mp4Options: [] as unknown[],
  webmOptions: [] as unknown[],
  trackOptions: [] as unknown[],
  samples: [] as RecordedSample[],
  added: [] as unknown[],
}));

vi.mock("mediabunny", () => {
  class BufferTarget {
    buffer: ArrayBuffer | null = null;
  }
  class Mp4OutputFormat {
    constructor(options: unknown) {
      rec.mp4Options.push(options);
    }
  }
  class WebMOutputFormat {
    constructor(options: unknown) {
      rec.webmOptions.push(options);
    }
  }
  class Output {
    private readonly target: BufferTarget;
    constructor(init: { target: BufferTarget }) {
      this.target = init.target;
    }
    addVideoTrack(_source: unknown, options: unknown): void {
      rec.trackOptions.push(options);
    }
    async start(): Promise<void> {}
    async finalize(): Promise<void> {
      this.target.buffer = new Uint8Array([1, 2, 3]).buffer;
    }
    async cancel(): Promise<void> {}
  }
  class VideoSampleSource {
    constructor(config: Record<string, unknown>) {
      rec.sourceConfigs.push(config);
    }
    async add(sample: unknown): Promise<void> {
      rec.added.push(sample);
    }
  }
  class VideoSample implements RecordedSample {
    readonly source: unknown;
    readonly init: { timestamp: number; duration: number };
    closed = false;
    constructor(source: unknown, init: { timestamp: number; duration: number }) {
      this.source = source;
      this.init = init;
      rec.samples.push(this);
    }
    close(): void {
      this.closed = true;
    }
  }
  return {
    BufferTarget,
    Mp4OutputFormat,
    WebMOutputFormat,
    Output,
    VideoSampleSource,
    VideoSample,
  };
});

function planFor(size: string, fps: number, container: VideoContainer): VideoPlan {
  const { ast } = parse(lex(`scene { size: ${size} duration: 1 }`));
  const { ir } = typeCheck(ast!);
  if (!ir) throw new Error("fixture did not compile");
  const sampler = planExport(ir, { fps });
  if (!sampler.ok) throw new Error("fixture sampler plan failed");
  const video = planVideo(ir, sampler.plan, { container });
  if (!video.ok) throw new Error("fixture video plan failed");
  return video.plan;
}

/** Stand-ins for rasterized canvases: identity is all `encodeVideo` may use. */
function fakeCanvases(n: number): CanvasImageSource[] {
  return Array.from({ length: n }, (_, i) => ({ frame: i }) as unknown as CanvasImageSource);
}

beforeEach(() => {
  for (const list of Object.values(rec)) list.length = 0;
  vi.stubGlobal("VideoEncoder", {
    isConfigSupported: async () => ({ supported: true }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("encodeVideo · what reaches mediabunny", () => {
  it("opens the video source with exactly the planned config, and nothing else", async () => {
    await encodeVideo(planFor("(800, 600)", 30, "mp4"), fakeCanvases(2));
    expect(rec.sourceConfigs).toHaveLength(1);
    // Literals written here, not `videoSourceConfig(plan)`: comparing against
    // the function under test would pass whatever it returned.
    // Phase 5C: was "avc1.42001f" (H.264 level 3.1) when `planFor` resolved
    // the codec from the scene's own 800x600 size. `fullCodecString` is now
    // chosen from the CODED (2x) size, 1600x1200, which needs level 4 (see
    // `videoContract.test.ts`, "planVideo · container and codec").
    expect(rec.sourceConfigs[0]).toStrictEqual({
      codec: "avc",
      bitrate: 8_000_000,
      fullCodecString: "avc1.420028",
      hardwareAcceleration: "prefer-software",
      latencyMode: "quality",
      bitrateMode: "constant",
      keyFrameInterval: 1,
    });
  });

  it("passes the keyframe interval in seconds at a rate other than 30", async () => {
    await encodeVideo(planFor("(800, 600)", 24, "webm"), fakeCanvases(1));
    expect(rec.sourceConfigs[0].keyFrameInterval).toBe(30 / 24);
    expect(rec.sourceConfigs[0].codec).toBe("vp9");
  });

  it("adds the onEncoderConfig observer only when one is given", async () => {
    const onEncoderConfig = (): void => {};
    await encodeVideo(planFor("(800, 600)", 30, "mp4"), fakeCanvases(1), { onEncoderConfig });
    expect(rec.sourceConfigs[0].onEncoderConfig).toBe(onEncoderConfig);
    expect(rec.sourceConfigs[0].latencyMode).toBe("quality");
  });

  it("writes an mp4 with fastStart in-memory, and a webm with no options", async () => {
    await encodeVideo(planFor("(800, 600)", 30, "mp4"), fakeCanvases(1));
    expect(rec.mp4Options).toStrictEqual([{ fastStart: "in-memory" }]);
    expect(rec.webmOptions).toHaveLength(0);

    await encodeVideo(planFor("(800, 600)", 30, "webm"), fakeCanvases(1));
    expect(rec.webmOptions).toHaveLength(1);
    expect(rec.mp4Options).toHaveLength(1);
  });

  it("declares the track's frame rate as the plan's", async () => {
    await encodeVideo(planFor("(800, 600)", 24, "mp4"), fakeCanvases(1));
    expect(rec.trackOptions).toStrictEqual([{ frameRate: 24 }]);
  });
});

describe("encodeVideo · frames", () => {
  it("encodes every canvas once, in order, stamped in seconds, and closes each", async () => {
    const canvases = fakeCanvases(4);
    const progress: [number, number][] = [];
    await encodeVideo(planFor("(800, 600)", 30, "mp4"), canvases, {
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(rec.samples.map((s) => s.source)).toEqual(canvases);
    expect(rec.added).toEqual(rec.samples);
    // Seconds (mediabunny's unit), computed from the index. Microseconds
    // would make these 1e6 times larger.
    expect(rec.samples.map((s) => s.init.timestamp)).toEqual([0, 1 / 30, 2 / 30, 3 / 30]);
    expect(rec.samples.every((s) => s.init.duration === 1 / 30)).toBe(true);
    expect(rec.samples.every((s) => s.closed)).toBe(true);
    // `total` is the plan's frame count (1 s at 30 fps), not the iterable's
    // length, which the encoder cannot know in advance for a lazy source.
    expect(progress).toEqual([
      [1, 30],
      [2, 30],
      [3, 30],
      [4, 30],
    ]);
  });
});
