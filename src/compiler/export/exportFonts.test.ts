import { afterEach, describe, it, expect, vi } from "vitest";
import { CanvasTextMetrics } from "pixi.js";
import { compileSource } from "../compileSource";
import type { IRSceneNode } from "../sceneIR";
import { ensureExportFonts, exportFontSizes, fetchExportFont, type ExportFontSet } from "./exportFonts";
import { withRasterExport } from "./rasterExport";
import { runApngExport } from "./apngPipeline";
import { runLottieExport } from "./lottiePipeline";

function compile(source: string): IRSceneNode {
  const outcome = compileSource(source);
  if (!outcome.ok || !outcome.ir) {
    throw new Error(`fixture did not compile: ${outcome.errors.map((e) => e.message).join(" | ")}`);
  }
  return outcome.ir;
}

const TEXT_SCENE = compile(`scene {
  size: (400, 300)
  duration: 1
  text a { position: (10, 10), content: "big", fontSize: 60 }
  group g {
    position: (0, 100)
    text b { position: (0, 0), content: "small", fontSize: 16 }
    text c { position: (0, 40), content: "big again", fontSize: 60 }
  }
}`);

const TEXT_FREE_SCENE = compile(`scene {
  size: (400, 300)
  duration: 1
  circle c { position: (50, 50), radius: 10 }
}`);

/**
 * A `FontFaceSet` stand-in that records every call it receives, in order,
 * in one log, so a test can read both which specs were loaded and whether
 * `check` came after `load` (AGENT-LESSONS §3d: the fake must record what
 * the assertion reads).
 */
function recordingFonts(opts: { available: boolean; loadRejects?: boolean }) {
  const calls: string[] = [];
  const fonts: ExportFontSet = {
    load: async (spec: string) => {
      calls.push(`load ${spec}`);
      if (opts.loadRejects) throw new DOMException("A network error occurred.", "NetworkError");
      return [];
    },
    check: (spec: string) => {
      calls.push(`check ${spec}`);
      return opts.available;
    },
  };
  return { fonts, calls };
}

describe("exportFontSizes", () => {
  it("lists each text node's fontSize once, ascending, including text inside groups", () => {
    expect(exportFontSizes(TEXT_SCENE)).toEqual([16, 60]);
  });

  it("is empty for a scene with no text", () => {
    expect(exportFontSizes(TEXT_FREE_SCENE)).toEqual([]);
  });
});

describe("ensureExportFonts", () => {
  it("loads, then checks, the export font once per distinct size", async () => {
    const { fonts, calls } = recordingFonts({ available: true });
    await ensureExportFonts(TEXT_SCENE, fonts);
    expect(calls).toEqual([
      "load 16px 'JetBrains Mono'",
      "check 16px 'JetBrains Mono'",
      "load 60px 'JetBrains Mono'",
      "check 60px 'JetBrains Mono'",
    ]);
  });

  it("makes no call at all for a text-free scene", async () => {
    const { fonts, calls } = recordingFonts({ available: true });
    await ensureExportFonts(TEXT_FREE_SCENE, fonts);
    expect(calls).toEqual([]);
  });

  it("does not reach for document.fonts when the scene has no text (so it runs in Node)", async () => {
    // This suite runs with `environment: "node"`: there is no `document`, so
    // a default that read `document.fonts` eagerly would throw here.
    expect(typeof document).toBe("undefined");
    await expect(ensureExportFonts(TEXT_FREE_SCENE)).resolves.toBeUndefined();
  });

  it("refuses with EXPORT_FONT_UNAVAILABLE, naming the family, when check is still false after load", async () => {
    const { fonts } = recordingFonts({ available: false });
    const error = await ensureExportFonts(TEXT_SCENE, fonts).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message.startsWith("[EXPORT_FONT_UNAVAILABLE] ")).toBe(true);
    expect(message).toContain("'JetBrains Mono'");
    expect(message).toContain("16px");
  });

  it("refuses with EXPORT_FONT_UNAVAILABLE, not the raw network error, when load itself rejects", async () => {
    const { fonts, calls } = recordingFonts({ available: false, loadRejects: true });
    const message = await ensureExportFonts(TEXT_SCENE, fonts).then(
      () => "resolved",
      (e: unknown) => (e as Error).message,
    );
    expect(message.startsWith("[EXPORT_FONT_UNAVAILABLE] ")).toBe(true);
    expect(message).not.toContain("NetworkError");
    expect(calls[0]).toBe("load 16px 'JetBrains Mono'");
  });
});

/**
 * The wiring: `withRasterExport` (the one export prefix) calls
 * `ensureExportFonts`, so every exporter built on it waits for the font.
 *
 * Node has no `document`, so each test installs one whose only member is a
 * recording `fonts`. What proves the call happens BEFORE `new
 * Application()` is the message: in Node, `new Application()` fails for its
 * own reason (no DOM), so a rejection reading `[EXPORT_FONT_UNAVAILABLE]`
 * can only have come from ahead of it. The text-free control reaches past
 * the font step and fails on that other reason instead.
 */
describe("ensureExportFonts is wired into the shared export prefix", () => {
  const TEXT_SOURCE = `scene { size: (100, 100) duration: 1 text t { position: (0, 0), content: "hi", fontSize: 24 } }`;
  const TEXT_FREE_SOURCE = `scene { size: (100, 100) duration: 1 circle c { position: (0, 0), radius: 10 } }`;

  async function messageOf(run: () => Promise<unknown>): Promise<string> {
    try {
      await run();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error("expected a rejection");
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("withRasterExport refuses a text scene whose font is unavailable, before any Application exists", async () => {
    const { fonts, calls } = recordingFonts({ available: false });
    vi.stubGlobal("document", { fonts });
    const message = await messageOf(() =>
      withRasterExport({ source: TEXT_SOURCE, fps: 30 }, async () => "used"),
    );
    expect(message.startsWith("[EXPORT_FONT_UNAVAILABLE] ")).toBe(true);
    expect(calls).toEqual(["load 24px 'JetBrains Mono'", "check 24px 'JetBrains Mono'"]);
  });

  it("the text-free control makes no font call and fails later, on the missing DOM", async () => {
    const { fonts, calls } = recordingFonts({ available: false });
    vi.stubGlobal("document", { fonts });
    const message = await messageOf(() =>
      withRasterExport({ source: TEXT_FREE_SOURCE, fps: 30 }, async () => "used"),
    );
    expect(calls).toEqual([]);
    expect(message).not.toContain("EXPORT_FONT_UNAVAILABLE");
    expect(message).not.toContain("Source did not compile");
  });

  it("runApngExport, a pipeline built on the prefix, inherits the refusal", async () => {
    const { fonts, calls } = recordingFonts({ available: false });
    vi.stubGlobal("document", { fonts });
    const message = await messageOf(() => runApngExport({ source: TEXT_SOURCE, fps: 30 }));
    expect(message.startsWith("[EXPORT_FONT_UNAVAILABLE] ")).toBe(true);
    expect(calls[0]).toBe("load 24px 'JetBrains Mono'");
  });

  it("runs after beforeBuild: a pipeline's own pre-build refusal arrives with no font call", async () => {
    // Order is a judgment call (AGENT-LESSONS §2d), pinned here: a refusal
    // a pipeline owns before the build (video's codec probe, today) must not
    // wait behind a font download. This used to be pinned through Lottie's
    // pre-build text refusal, which Task 8 removed (ruling T8-R1: Lottie now
    // plans in `afterBuild`); a `beforeBuild` that refuses is the direct
    // form of the same order.
    const { fonts, calls } = recordingFonts({ available: false });
    vi.stubGlobal("document", { fonts });
    const message = await messageOf(() =>
      withRasterExport(
        {
          source: TEXT_SOURCE,
          fps: 30,
          beforeBuild: () => {
            throw new Error("[TEST_PRE_BUILD_REFUSAL] refused before the build");
          },
        },
        async () => "used",
      ),
    );
    expect(message).toBe("[TEST_PRE_BUILD_REFUSAL] refused before the build");
    expect(calls).toEqual([]);
  });

  it("Lottie's text planning waits for the font: an unavailable font refuses a text scene first", async () => {
    // The other side of T8-R1: `runLottieExport` measures and outlines text
    // after the build, so a text scene reaches the font step before any
    // Lottie diagnostic can exist. With the font unavailable, the refusal
    // is the font's own, not a Lottie one.
    const { fonts, calls } = recordingFonts({ available: false });
    vi.stubGlobal("document", { fonts });
    const message = await messageOf(() => runLottieExport({ source: TEXT_SOURCE, fps: 30 }));
    expect(message.startsWith("[EXPORT_FONT_UNAVAILABLE] ")).toBe(true);
    expect(message).not.toContain("[LOTTIE");
    expect(calls[0]).toBe("load 24px 'JetBrains Mono'");
  });

  it("waits for the font when it is available, then goes on to build", async () => {
    const { fonts, calls } = recordingFonts({ available: true });
    vi.stubGlobal("document", { fonts });
    const message = await messageOf(() =>
      withRasterExport({ source: TEXT_SOURCE, fps: 30 }, async () => "used"),
    );
    expect(calls).toEqual(["load 24px 'JetBrains Mono'", "check 24px 'JetBrains Mono'"]);
    expect(message).not.toContain("EXPORT_FONT_UNAVAILABLE");
  });
});

/**
 * Addendum item 5: pixi's font-metrics cache.
 *
 * `CanvasTextMetrics.measureFont` caches ascent/descent/fontSize in the
 * private static `_fonts`, keyed by the CSS font string alone, with no
 * font-load state in the key. Measured on a fresh page (`text-plumbing/
 * cache-run.mjs`): one fallback measurement before the font loaded left the
 * real export prefix building a 504 x 126 text box (lineHeight 63, ascent 51)
 * where a warm page builds 504 x 142 (lineHeight 71, ascent 60). So the
 * prefix must empty that cache once the font is in. This test seeds a stale
 * entry the way a cold preview would, and requires the prefix to drop it
 * before it builds anything.
 */
describe("the export prefix drops pixi's stale font metrics once the font is loaded", () => {
  const TEXT_SOURCE = `scene { size: (100, 100) duration: 1 text t { position: (0, 0), content: "hi", fontSize: 24 } }`;
  const fontCache = () => (CanvasTextMetrics as unknown as { _fonts: Record<string, unknown> })._fonts;
  const STALE_KEY = "normal normal normal 24px 'JetBrains Mono',monospace";

  afterEach(() => {
    vi.unstubAllGlobals();
    CanvasTextMetrics.clearMetrics();
  });

  it("empties the cache before building", async () => {
    fontCache()[STALE_KEY] = { ascent: 51, descent: 12, fontSize: 63 };
    const { fonts } = recordingFonts({ available: true });
    vi.stubGlobal("document", { fonts });
    let cacheAtBuild: Record<string, unknown> | undefined;
    // `new Application()` fails in Node (no DOM), so nothing is built and
    // nothing re-measures: read the cache when that rejection arrives, by
    // which point the font step has run.
    await withRasterExport({ source: TEXT_SOURCE, fps: 30 }, async () => "used").catch(() => {
      cacheAtBuild = { ...fontCache() };
    });
    expect(cacheAtBuild).toBeDefined();
    expect(cacheAtBuild).not.toHaveProperty([STALE_KEY]);
  });

  it("control: a refusal before the font step leaves the cache alone", async () => {
    fontCache()[STALE_KEY] = { ascent: 51, descent: 12, fontSize: 63 };
    const { fonts } = recordingFonts({ available: false });
    vi.stubGlobal("document", { fonts });
    await withRasterExport({ source: TEXT_SOURCE, fps: 30 }, async () => "used").catch(() => undefined);
    expect(fontCache()).toHaveProperty([STALE_KEY]);
  });
});

describe("fetchExportFont", () => {
  it("fetches the URL @font-face loads and returns its bytes", async () => {
    const requested: string[] = [];
    const bytes = new Uint8Array([0, 1, 0, 0]).buffer;
    const got = await fetchExportFont(async (input) => {
      requested.push(String(input));
      return new Response(bytes, { status: 200 });
    });
    expect(requested).toEqual(["/fonts/JetBrainsMono-Regular.ttf"]);
    expect(new Uint8Array(got)).toEqual(new Uint8Array([0, 1, 0, 0]));
  });

  it("refuses with EXPORT_FONT_UNAVAILABLE on an HTTP error, naming the status", async () => {
    const message = await fetchExportFont(async () => new Response("nope", { status: 404 })).then(
      () => "resolved",
      (e: unknown) => (e as Error).message,
    );
    expect(message.startsWith("[EXPORT_FONT_UNAVAILABLE] ")).toBe(true);
    expect(message).toContain("HTTP 404");
    expect(message).toContain("'JetBrains Mono'");
  });

  it("refuses with EXPORT_FONT_UNAVAILABLE when the request itself fails", async () => {
    const message = await fetchExportFont(async () => {
      throw new TypeError("Failed to fetch");
    }).then(
      () => "resolved",
      (e: unknown) => (e as Error).message,
    );
    expect(message.startsWith("[EXPORT_FONT_UNAVAILABLE] ")).toBe(true);
  });
});
