import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runPngExport } from "../compiler/export/pngPipeline";
import { runApngExport } from "../compiler/export/apngPipeline";
import { runVideoExport } from "../compiler/export/videoPipeline";
import { runLottieExport } from "../compiler/export/lottiePipeline";
import type { LottieDoc } from "../compiler/export/lottieEncode";
import type { VideoPlan } from "../compiler/export/videoContract";
import type { FrameSnapshot } from "../compiler/renderer/frameSampler";
import { hashFrames } from "../compiler/export/frameHash";
import { EXPORT_ORIGIN, FRAME_PATH, toBase64, type CliExportRequest, type CliExportResult } from "./protocol";

/**
 * The export page's own behaviour, headlessly: the four pipelines are
 * replaced by fakes that report what a real run reports (sampled frames, a
 * plan, bytes, a document), `window` and `fetch` are stubbed, and the test
 * calls `window.__mareyCliExport` exactly as the CLI will. What is under test
 * is `main.ts`'s mapping from those reports to a `CliExportResult`: where each
 * size comes from, the frame POSTs and their refusal, the refusals when a
 * pipeline reports less than expected, and verbatim error messages. The
 * pipelines themselves are tested elsewhere and need a browser.
 */
vi.mock("../compiler/export/pngPipeline", () => ({ runPngExport: vi.fn() }));
vi.mock("../compiler/export/apngPipeline", () => ({ runApngExport: vi.fn() }));
vi.mock("../compiler/export/videoPipeline", () => ({ runVideoExport: vi.fn() }));
vi.mock("../compiler/export/lottiePipeline", () => ({ runLottieExport: vi.fn() }));

const FRAMES = [0, 1, 2].map((index) => ({ index, tick: index * 4, objects: [] })) as unknown as FrameSnapshot[];
const HASH = hashFrames(FRAMES);
const fetchMock = vi.fn<typeof fetch>();

let cliExport: (request: CliExportRequest) => Promise<CliExportResult>;

beforeAll(async () => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("fetch", fetchMock);
  await import("./main");
  cliExport = window.__mareyCliExport!;
});

afterEach(() => {
  vi.mocked(runPngExport).mockReset();
  vi.mocked(runApngExport).mockReset();
  vi.mocked(runVideoExport).mockReset();
  vi.mocked(runLottieExport).mockReset();
  fetchMock.mockReset();
});

const request = (format: string): CliExportRequest =>
  ({ source: "scene {}", format, fps: 30, durationSeconds: 1 }) as CliExportRequest;

/** A PNG signature and an IHDR chunk header: width and height distinct, so a swapped read shows. */
function apngFixture(width: number, height: number, type = "IHDR"): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([...type].map((c) => c.charCodeAt(0)), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("the export page's window.__mareyCliExport", () => {
  it("installs itself on window", () => {
    expect(typeof cliExport).toBe("function");
  });

  describe("png", () => {
    function fakePng(): void {
      vi.mocked(runPngExport).mockImplementation(async (opts) => {
        opts.observer?.onSampled?.(FRAMES);
        for (const frame of FRAMES) await opts.onPng(frame, new Uint8Array([frame.index, 9]));
        return { fps: 30, frameCount: 3, width: 640, height: 360 };
      });
    }

    it("POSTs each frame's bytes to EXPORT_ORIGIN + FRAME_PATH + frame.index and reports the pipeline's size", async () => {
      fakePng();
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
      const result = await cliExport(request("png"));
      expect(result).toEqual({
        ok: true,
        fps: 30,
        frameCount: 3,
        width: 640,
        height: 360,
        hash: HASH,
        fileBase64: null,
        text: null,
      });
      expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method, [...(init?.body as Uint8Array)]])).toEqual([
        [`${EXPORT_ORIGIN}${FRAME_PATH}0`, "POST", [0, 9]],
        [`${EXPORT_ORIGIN}${FRAME_PATH}1`, "POST", [1, 9]],
        [`${EXPORT_ORIGIN}${FRAME_PATH}2`, "POST", [2, 9]],
      ]);
      expect(vi.mocked(runPngExport).mock.calls[0][0]).toMatchObject({ source: "scene {}", fps: 30, durationSeconds: 1 });
    });

    it("refuses the export, and stops, when the CLI refuses a frame", async () => {
      fakePng();
      fetchMock.mockImplementation(async (url) =>
        new Response(null, { status: String(url).endsWith("/1") ? 500 : 204 }),
      );
      const result = await cliExport(request("png"));
      expect(result).toEqual({ ok: false, message: "[export] The CLI refused frame 1 (HTTP 500)." });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("apng", () => {
    it("reads width and height from the file's IHDR, and returns the whole file", async () => {
      const bytes = apngFixture(800, 600);
      vi.mocked(runApngExport).mockImplementation(async (opts) => {
        opts.observer?.onSampled?.(FRAMES);
        return bytes;
      });
      const result = await cliExport(request("apng"));
      expect(result).toEqual({
        ok: true,
        fps: 30,
        frameCount: 3,
        width: 800,
        height: 600,
        hash: HASH,
        fileBase64: toBase64(bytes),
        text: null,
      });
    });

    it("refuses a file whose first chunk is not IHDR", async () => {
      vi.mocked(runApngExport).mockImplementation(async (opts) => {
        opts.observer?.onSampled?.(FRAMES);
        return apngFixture(800, 600, "acTL");
      });
      expect(await cliExport(request("apng"))).toEqual({
        ok: false,
        message: "[export] The APNG does not start with an IHDR chunk, so its size cannot be read.",
      });
    });
  });

  describe.each(["webm", "mp4"] as const)("%s", (container) => {
    it("reports the VideoPlan's fps, frame count and coded size, and passes the container through", async () => {
      const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
      vi.mocked(runVideoExport).mockImplementation(async (opts) => {
        // Deliberately unlike the request (30 fps) and the scene: the page
        // must report the plan's numbers, not re-derive them.
        opts.observer?.onPlanned?.({ fps: 24, frameCount: 7, width: 1600, height: 1200 } as VideoPlan);
        opts.observer?.onSampled?.(FRAMES);
        return bytes;
      });
      const result = await cliExport(request(container));
      expect(result).toEqual({
        ok: true,
        fps: 24,
        frameCount: 7,
        width: 1600,
        height: 1200,
        hash: HASH,
        fileBase64: toBase64(bytes),
        text: null,
      });
      expect(vi.mocked(runVideoExport).mock.calls[0][0]).toMatchObject({ container, fps: 30, durationSeconds: 1 });
    });

    it("refuses when the pipeline returns without reporting a plan", async () => {
      vi.mocked(runVideoExport).mockImplementation(async (opts) => {
        opts.observer?.onSampled?.(FRAMES);
        return new Uint8Array(1);
      });
      expect(await cliExport(request(container))).toEqual({
        ok: false,
        message: "[export] runVideoExport returned without reporting a plan.",
      });
    });
  });

  describe("lottie", () => {
    it("returns JSON.stringify(doc), with fps and size from the document", async () => {
      const doc = { v: "5.5.2", fr: 30, ip: 0, op: 3, w: 800, h: 600, nm: "Marey scene", layers: [] };
      vi.mocked(runLottieExport).mockImplementation(async (opts) => {
        opts.observer?.onSampled?.(FRAMES);
        return doc as unknown as LottieDoc;
      });
      const result = await cliExport(request("lottie"));
      expect(result).toEqual({
        ok: true,
        fps: 30,
        frameCount: 3,
        width: 800,
        height: 600,
        hash: HASH,
        fileBase64: null,
        text: JSON.stringify(doc),
      });
    });
  });

  describe("failures", () => {
    it("returns a pipeline's error message verbatim", async () => {
      const message = "[EXPORT_UNSUPPORTED_FPS] Frame rate 7 is not supported.";
      vi.mocked(runLottieExport).mockRejectedValue(new Error(message));
      expect(await cliExport(request("lottie"))).toEqual({ ok: false, message });
    });

    it("returns a non-Error throw as its string", async () => {
      vi.mocked(runApngExport).mockRejectedValue("plain string");
      expect(await cliExport(request("apng"))).toEqual({ ok: false, message: "plain string" });
    });

    it.each(["png", "apng", "webm", "mp4", "lottie"])(
      "%s: refuses when the pipeline returns without reporting its sampled frames",
      async (format) => {
        vi.mocked(runPngExport).mockResolvedValue({ fps: 30, frameCount: 3, width: 640, height: 360 });
        vi.mocked(runApngExport).mockResolvedValue(apngFixture(800, 600));
        vi.mocked(runVideoExport).mockImplementation(async (opts) => {
          opts.observer?.onPlanned?.({ fps: 30, frameCount: 3, width: 1600, height: 1200 } as VideoPlan);
          return new Uint8Array(1);
        });
        vi.mocked(runLottieExport).mockResolvedValue({ fr: 30, w: 800, h: 600 } as unknown as LottieDoc);
        expect(await cliExport(request(format))).toEqual({
          ok: false,
          message: "[export] The pipeline returned without reporting its sampled frames.",
        });
      },
    );

    it("refuses an unknown format by name", async () => {
      expect(await cliExport(request("gif"))).toEqual({
        ok: false,
        message: "[export] Unknown export format 'gif'.",
      });
    });
  });
});
