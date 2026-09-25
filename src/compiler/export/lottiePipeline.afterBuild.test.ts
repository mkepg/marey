import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { CanvasTextMetrics } from "pixi.js";
import fontDataUrl from "../../../public/fonts/JetBrainsMono-Regular.ttf?inline";
import type { FrameSnapshot } from "../renderer/frameSampler";
import { runLottieExport } from "./lottiePipeline";

/**
 * `runLottieExport` end to end in Node, past the point `lottiePipeline.test.ts`
 * can reach (Phase 5C Task 8, ruling T8-R1).
 *
 * Lottie now plans in `withRasterExport`'s `afterBuild`: after the export
 * `Application` and the tree exist, before a single frame is sampled. In
 * Node, a real `new Application().init()` fails on the missing DOM, so
 * nothing after it could be tested here. This file replaces exactly the
 * parts of the environment Node lacks, and nothing that decides the result:
 *
 * - `Application` is a stand-in whose `init` resolves and which has no
 *   `renderer` (so `withRasterExport`'s `finally` skips `destroyExportApp`).
 *   A Lottie export never renders or extracts anything, so nothing reads it.
 * - `CanvasTextMetrics.measureText`, which needs a 2D canvas, returns fixed
 *   JetBrains Mono-like numbers (36 px per character, ascent 60, line height
 *   71 at 60 px: Task 6 Q3's measured values). The browser check
 *   (`text-check.mjs`) measures the real ones.
 * - `document.fonts` reports the font as loaded, and `fetch` serves the real
 *   TTF (through Vite's `?inline`, as `textOutline.test.ts` does).
 *
 * Everything else is the product: compile, both export contracts, the font
 * step, `buildNode`, `collectTextLayouts`, real HarfBuzz shaping of the real
 * font, `planLottie`, the physics world, `sampleFrames` and `encodeLottie`.
 */
vi.mock("pixi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pixi.js")>();
  class StandInApplication {
    async init(): Promise<void> {}
  }
  return { ...actual, Application: StandInApplication };
});

function decodeDataUrl(dataUrl: string): ArrayBuffer {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let k = 0; k < binary.length; k++) bytes[k] = binary.charCodeAt(k);
  return bytes.buffer;
}

const FONT_BYTES = decodeDataUrl(fontDataUrl);

/** What the stand-ins recorded during one export. */
interface Recorded {
  fetches: string[];
  measured: string[];
}

let recorded: Recorded;

beforeEach(() => {
  recorded = { fetches: [], measured: [] };
  vi.stubGlobal("document", {
    fonts: { load: async () => [], check: () => true },
  });
  vi.stubGlobal("fetch", async (input: unknown) => {
    recorded.fetches.push(String(input));
    return new Response(FONT_BYTES.slice(0), { status: 200 });
  });
  vi.spyOn(CanvasTextMetrics, "measureText").mockImplementation((text) => {
    const content = String(text);
    recorded.measured.push(content);
    const lines = content.split(/(?:\r\n|\r|\n)/);
    const lineWidths = lines.map((line) => 36 * [...line].length);
    return {
      text: content,
      width: Math.max(...lineWidths),
      height: 71 * lines.length,
      lines,
      lineWidths,
      lineHeight: 71,
      maxLineWidth: Math.max(...lineWidths),
      fontProperties: { ascent: 60, descent: 11, fontSize: 71 },
    } as unknown as CanvasTextMetrics;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Run the export, counting `onSampled` calls, and settle either way. */
async function exportCounting(source: string) {
  const sampled: Array<ReadonlyArray<FrameSnapshot>> = [];
  const outcome = await runLottieExport({
    source,
    fps: 30,
    observer: { onSampled: (frames) => sampled.push(frames) },
  }).then(
    (doc) => ({ ok: true as const, doc }),
    (error: unknown) => ({ ok: false as const, message: error instanceof Error ? error.message : String(error) }),
  );
  return { outcome, sampled };
}

describe("runLottieExport · text refusals arrive after the build and before sampling (T8-R1)", () => {
  it("refuses a missing glyph verbatim, and never samples a frame", async () => {
    const { outcome, sampled } = await exportCounting(
      'scene { size: (400, 200) duration: 1 text t { position: (100, 100), content: "a日b", fontSize: 60 } }',
    );
    if (outcome.ok) throw new Error("expected a refusal");
    expect(outcome.message.startsWith("[LOTTIE_TEXT_MISSING_GLYPH] ")).toBe(true);
    expect(outcome.message).toContain("'scene.t'");
    expect(outcome.message).toContain("U+65E5");
    // Verbatim: no pipeline prefix, and only the one diagnostic.
    expect(outcome.message).not.toContain("[export]");
    expect(outcome.message.split(" | ")).toHaveLength(1);
    // The refusal is a property of the scene, not of the frames.
    expect(sampled).toHaveLength(0);
    // ...and it came from after the build: the built Text was measured and
    // the font was fetched for outlining. A pre-build refusal does neither.
    expect(recorded.measured).toContain("a日b");
    expect(recorded.fetches).toEqual(["/fonts/JetBrainsMono-Regular.ttf"]);
  });

  it("joins two objects' missing-glyph diagnostics with ' | ', still sampling nothing", async () => {
    const { outcome, sampled } = await exportCounting(
      'scene { size: (400, 200) duration: 1 text t1 { position: (100, 50), content: "日" } text t2 { position: (100, 150), content: "x🙂" } }',
    );
    if (outcome.ok) throw new Error("expected a refusal");
    const parts = outcome.message.split(" | ");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^\[LOTTIE_TEXT_MISSING_GLYPH\] Text 'scene\.t1' .*U\+65E5/);
    expect(parts[1]).toMatch(/^\[LOTTIE_TEXT_MISSING_GLYPH\] Text 'scene\.t2' .*U\+1F642/);
    expect(sampled).toHaveLength(0);
  });

  it("control: a text scene whose glyphs all exist samples once and encodes the text as glyph paths", async () => {
    const { outcome, sampled } = await exportCounting(
      'scene { size: (400, 200) duration: 1 text t { position: (100, 100), content: "hi", fontSize: 60, color: #ffffff } }',
    );
    if (!outcome.ok) throw new Error(`unexpected refusal: ${outcome.message}`);
    expect(sampled).toHaveLength(1);
    expect(sampled[0]).toHaveLength(30);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = (outcome.doc.layers as ReadonlyArray<any>).find((l) => l.nm === "t");
    expect(layer.ty).toBe(4);
    const kinds: string[] = layer.shapes.map((s: { ty: string }) => s.ty);
    // `h` and `i` are several closed contours between them, then one fill.
    expect(kinds.length).toBeGreaterThan(2);
    expect(kinds.slice(0, -1).every((k) => k === "sh")).toBe(true);
    expect(kinds.at(-1)).toBe("fl");
    expect(layer.shapes.at(-1).r).toBe(1);
    // The anchor is the measured box's centre: "hi" is 72 x 71 in the
    // stand-in metrics, so (36, 35.5). The IR has no width to recompute
    // this from, so it can only have come through collectTextLayouts.
    expect(layer.ks.a).toEqual({ a: 0, k: [36, 35.5] });
    expect(recorded.fetches).toHaveLength(1);
  });

  it("control: a text-free scene fetches no font and samples once", async () => {
    const { outcome, sampled } = await exportCounting(
      "scene { size: (400, 200) duration: 1 circle c { position: (100, 100), radius: 10 } }",
    );
    if (!outcome.ok) throw new Error(`unexpected refusal: ${outcome.message}`);
    expect(sampled).toHaveLength(1);
    expect(recorded.fetches).toEqual([]);
  });
});
