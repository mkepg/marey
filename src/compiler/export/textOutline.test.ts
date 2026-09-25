import { beforeAll, describe, it, expect } from "vitest";
import fontDataUrl from "../../../public/fonts/JetBrainsMono-Regular.ttf?inline";
import { createTextOutliner, pathToContours, type TextLayout, type TextOutliner } from "./textOutline";

/**
 * `pathToContours` is the pure core of spec §6.3 step 5: harfbuzzjs's
 * `glyphToPath` SVG path data (font units, y up) to Lottie-shaped contours
 * (pixels, y down, tangents relative to their own vertex).
 *
 * The grammar these fixtures use is the one harfbuzzjs 1.6.2 actually emits
 * for JetBrains Mono, measured in Node before this file was written:
 * `M140,290L140,370L460,370L460,290L140,290Z` for `-`, and for `a` a run of
 * `Q` segments whose last one ends exactly on the `M` point before `Z`
 * (`...Q329,-10 252,-10Z` after `M252,-10`). So no command letter is ever
 * separated from its first number by a space, pairs are comma-joined, and
 * the two pairs of a `Q` are space-separated.
 */
describe("pathToContours", () => {
  it("converts a quadratic to the exact cubic (2/3 rule), flipping y and scaling", () => {
    // M0,0 Q30,60 60,0 Z at scale 1, baseline dy = 100: y flips to 100 - y.
    const [c] = pathToContours("M0,0Q30,60 60,0Z", 1, 0, 100);
    expect(c.v).toEqual([[0, 100], [60, 100]]);
    expect(c.o[0]).toEqual([20, -40]); // (2/3)·((30,40) − (0,100)) relative to v0
    expect(c.i[1]).toEqual([-20, -40]); // (2/3)·((30,40) − (60,100)) relative to v1
  });

  it("applies scale and the x offset before taking tangent differences", () => {
    // Same curve at scale 0.5, pen at x = 7, baseline at y = 50.
    const [c] = pathToContours("M0,0Q30,60 60,0Z", 0.5, 7, 50);
    expect(c.v).toEqual([[7, 50], [37, 50]]);
    expect(c.o[0]).toEqual([10, -20]);
    expect(c.i[1]).toEqual([-10, -20]);
  });

  it("gives straight segments zero tangents", () => {
    const [c] = pathToContours("M0,0L10,0L10,10Z", 1, 0, 0);
    expect(c.v).toHaveLength(3);
    expect(c.i.every(([x, y]) => x === 0 && y === 0)).toBe(true);
    expect(c.o.every(([x, y]) => x === 0 && y === 0)).toBe(true);
  });

  it("splits on M into separate contours (a glyph with a counter)", () => {
    const contours = pathToContours("M0,0L1,0L1,1ZM2,2L3,2L3,3Z", 1, 0, 0);
    expect(contours).toHaveLength(2);
    expect(contours[1].v[0]).toEqual([2, -2]);
  });

  it("treats an M with no Z before it as closing the previous contour", () => {
    const contours = pathToContours("M0,0L1,0L1,1M2,2L3,2L3,3Z", 1, 0, 0);
    expect(contours.map((c) => c.v.length)).toEqual([3, 3]);
  });

  it("drops the duplicate closing vertex when a contour ends where it began", () => {
    const [c] = pathToContours("M0,0L10,0L0,0Z", 1, 0, 0);
    expect(c.v).toEqual([[0, 0], [10, 0]]);
    expect(c.i).toHaveLength(2);
    expect(c.o).toHaveLength(2);
  });

  it("keeps the closing curve's in-tangent on the first vertex when it drops the duplicate", () => {
    // The shape harfbuzzjs emits for `a`: the last Q lands exactly on the M
    // point. Dropping that duplicate vertex must not drop its curve -- the
    // closing segment (last vertex -> v0) still bends, so its second control
    // point becomes v0's in-tangent. Lottie draws a closed path's closing
    // segment from o[last] to i[0].
    const [c] = pathToContours("M0,0L10,0Q10,10 0,0Z", 1, 0, 0);
    expect(c.v).toEqual([[0, 0], [10, 0]]);
    // Q control (10,10) flips to (10,-10). From v1 = (10,0): (2/3)(0,-10).
    expect(c.o[1][0]).toBeCloseTo(0, 12);
    expect(c.o[1][1]).toBeCloseTo(-20 / 3, 12);
    // Into v0 = (0,0): (2/3)((10,-10) − (0,0)).
    expect(c.i[0][0]).toBeCloseTo(20 / 3, 12);
    expect(c.i[0][1]).toBeCloseTo(-20 / 3, 12);
  });

  it("passes a cubic's control points through, relative to their own vertices", () => {
    const [c] = pathToContours("M0,0C0,10 10,10 10,0Z", 1, 0, 0);
    expect(c.v).toEqual([[0, 0], [10, 0]]);
    expect(c.o[0]).toEqual([0, -10]);
    expect(c.i[1]).toEqual([0, -10]);
  });

  it("returns no contours for an empty path (a space glyph)", () => {
    expect(pathToContours("", 1, 0, 0)).toEqual([]);
  });

  it("refuses a path command it does not understand rather than dropping it", () => {
    expect(() => pathToContours("M0,0A5,5 0 0 1 10,0Z", 1, 0, 0)).toThrow(/unsupported path command 'A'/);
  });
});

/**
 * `createTextOutliner` against the real shipped font, headlessly.
 *
 * The bytes arrive through Vite's `?inline` (a base64 `data:` URL, declared
 * by `vite/client`), not `node:fs`: `tsconfig.app.json` carries no Node types
 * (`exportBoundary.test.ts`'s header). Measured before choosing: `?inline`
 * decodes to 114,904 bytes, the file's size on disk; `?url` resolves to
 * `/public/fonts/JetBrainsMono-Regular.ttf`, which Node's `fetch` rejects
 * with "Failed to parse URL".
 */

function decodeDataUrl(dataUrl: string): ArrayBuffer {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let k = 0; k < binary.length; k++) bytes[k] = binary.charCodeAt(k);
  return bytes.buffer;
}

/** A layout with pixi's measured JetBrains Mono numbers at 60 px (Task 6, Q3). */
function layout60(lines: string[], overrides: Partial<TextLayout> = {}): TextLayout {
  return { width: 0, height: 0, ascent: 60, lineHeight: 71, padding: 0, lines, ...overrides };
}

describe("createTextOutliner (JetBrains Mono, real font)", () => {
  let outliner: TextOutliner;
  beforeAll(async () => {
    const bytes = decodeDataUrl(fontDataUrl);
    expect(bytes.byteLength).toBe(114904);
    outliner = await createTextOutliner(bytes);
  });

  const ids = (line: string) => outliner.shapeLine(line).map((g) => g.glyphId);

  it("applies contextual alternates: `->` shapes to glyphs other than its characters' own", () => {
    // Each character alone has no context, so it shapes to its cmap glyph.
    const perCharacter = [...ids("-"), ...ids(">")];
    const shaped = ids("->");
    // The brief expected the glyph COUNT to differ. Measured: it does not.
    // JetBrains Mono's ligatures keep one glyph per character (a spacer plus
    // a wide arrow half), so what `calt` changes is the ids.
    expect(shaped).toHaveLength(perCharacter.length);
    expect(shaped).not.toEqual(perCharacter);
    expect(shaped.every((id) => id !== 0)).toBe(true);
  });

  it("outlines a ligature from the shaped glyphs, not from each character on its own", () => {
    // Task 8, mutation (b): outlining `->` one character at a time keeps the
    // advances (JetBrains Mono is monospaced) and the ink box, so neither
    // browser check that binds can see it; only the pixels change (Criterion
    // 2 on the ligature fixture: maxDelta 101 -> 255). This pins it in Node.
    // Per character, `-` sits at pen 0 and `>` at pen 36 (after one
    // 600-unit advance, which a leading space reproduces without context).
    const shaped = outliner.outline(layout60(["->"]), 60).contours;
    const perCharacter = [
      ...outliner.outline(layout60(["-"]), 60).contours,
      ...outliner.outline(layout60([" >"]), 60).contours,
    ];
    expect(perCharacter.length).toBeGreaterThan(0);
    expect(shaped).not.toEqual(perCharacter);
    // And positively (so an empty or wrong output fails too): the contours
    // are exactly those of the glyph ids HarfBuzz shaped `->` to, each at
    // its pen position on the line-0 baseline (ascent 60 at 60 px).
    const scale = 60 / outliner.upem;
    const glyphs = outliner.shapeLine("->");
    const expected: ReturnType<typeof pathToContours> = [];
    let pen = 0;
    for (const g of glyphs) {
      expected.push(...pathToContours(outliner.glyphPath(g.glyphId), scale, pen + g.xOffset * scale, 60 - g.yOffset * scale));
      pen += g.xAdvance * scale;
    }
    expect(expected.length).toBeGreaterThan(0);
    expect(shaped).toEqual(expected);
  });

  it("applies ccmp: e + combining acute shapes to the same single glyph as precomposed é", () => {
    expect(ids("e\u0301")).toEqual(ids("\u00e9"));
    expect(ids("e\u0301")).toHaveLength(1);
  });

  it("reports a character the font lacks, with its code point, and draws nothing for it", () => {
    const run = outliner.outline(layout60(["日"]), 60);
    expect(run.missing).toEqual([{ char: "日", codePoint: 0x65e5 }]);
    expect(run.contours).toHaveLength(0);
  });

  it("reports an astral-plane character by its full code point, once", () => {
    const run = outliner.outline(layout60(["🙂a🙂"]), 60);
    expect(run.missing).toEqual([{ char: "🙂", codePoint: 0x1f642 }]);
    expect(run.contours.length).toBeGreaterThan(0); // the `a` still outlines
  });

  it("shapes a tab exactly as a space (the canvas whitespace rule)", () => {
    expect(outliner.shapeLine("a\tb")).toEqual(outliner.shapeLine("a b"));
    const withTab = outliner.outline(layout60(["a\tb"]), 60);
    expect(withTab).toEqual(outliner.outline(layout60(["a b"]), 60));
    expect(withTab.missing).toEqual([]);
  });

  it("puts line 0's baseline at `ascent` and the pen at x = 0", () => {
    // `-` in JetBrains Mono is the rectangle M140,290 L140,370 L460,370
    // L460,290 Z (font units, measured). At 60 px, scale = 60/1000.
    const [bar] = outliner.outline(layout60(["-"]), 60).contours;
    const expected = [[8.4, 60 - 17.4], [8.4, 60 - 22.2], [27.6, 60 - 22.2], [27.6, 60 - 17.4]];
    expect(bar.v).toHaveLength(4);
    bar.v.forEach(([x, y], k) => {
      expect(x).toBeCloseTo(expected[k][0], 9);
      expect(y).toBeCloseTo(expected[k][1], 9);
    });
  });

  it("advances the pen by each glyph's advance", () => {
    // A space (advance 600 units, no contours) before the bar moves it 36 px.
    const [bar] = outliner.outline(layout60([" -"]), 60).contours;
    expect(bar.v[0][0]).toBeCloseTo(36 + 8.4, 9);
  });

  it("applies GPOS mark offsets: x adds xOffset, y subtracts yOffset (y up in font units)", () => {
    // Measured in Node: in `x` + U+0301 the acute (glyph 1078) has offsets
    // (0, 0); stacked on `B` + U+0325 it is the same glyph at xOffset -570,
    // yOffset 180. Both sit at pen x = 36 px, after one 600-unit advance. So
    // the stacked acute's contour is the plain one moved by (-570, -180) *
    // 0.06 px.
    const stackedText = "B̥́";
    const stacked = outliner.shapeLine(stackedText);
    expect(stacked.map((g) => g.glyphId)).toEqual([26, 1092, 1078]);
    expect([stacked[2].xOffset, stacked[2].yOffset]).toEqual([-570, 180]);
    const plain = outliner.outline(layout60(["x́"]), 60).contours.at(-1)!;
    const moved = outliner.outline(layout60([stackedText]), 60).contours.at(-1)!;
    expect(moved.v).toHaveLength(plain.v.length);
    moved.v.forEach(([x, y], k) => {
      expect(x - plain.v[k][0]).toBeCloseTo(-34.2, 9);
      expect(y - plain.v[k][1]).toBeCloseTo(-10.8, 9);
    });
  });

  it("places the second line's baseline exactly `lineHeight` below the first", () => {
    const run = outliner.outline(layout60(["a", "a"]), 60);
    const half = run.contours.length / 2;
    expect(half).toBeGreaterThan(0);
    for (let c = 0; c < half; c++) {
      const first = run.contours[c];
      const second = run.contours[c + half];
      second.v.forEach(([x, y], k) => {
        expect(x).toBe(first.v[k][0]);
        expect(y - first.v[k][1]).toBeCloseTo(71, 9);
      });
      // Tangents are differences, so the 71 px shift cancels -- up to the
      // last bits of a float, hence closeness rather than equality.
      for (const key of ["i", "o"] as const) {
        second[key].forEach(([x, y], k) => {
          expect(x).toBeCloseTo(first[key][k][0], 9);
          expect(y).toBeCloseTo(first[key][k][1], 9);
        });
      }
    }
  });

  it("scales outlines with fontSize", () => {
    const [at60] = outliner.outline(layout60(["-"]), 60).contours;
    const [at30] = outliner.outline(layout60(["-"], { ascent: 30 }), 30).contours;
    expect(at30.v[0][0]).toBeCloseTo(at60.v[0][0] / 2, 9);
  });

  it("does not move glyphs by `padding` (pixi's texture offset cancels it in text-local space)", () => {
    // Judgment call, pinned (AGENT-LESSONS §2d). Spec §6.3 step 4 adds
    // `padding`; pixi draws at `+padding` inside a texture it places at
    // `-padding` (`updateTextBounds.mjs`), so in the Text's own space the
    // glyphs sit where they would with no padding. See `outline`'s comment.
    expect(outliner.outline(layout60(["ab"], { padding: 5 }), 60)).toEqual(
      outliner.outline(layout60(["ab"]), 60),
    );
  });

  it("refuses to be used after destroy()", async () => {
    const own = await createTextOutliner(decodeDataUrl(fontDataUrl));
    own.destroy();
    expect(() => own.outline(layout60(["a"]), 60)).toThrow(/after destroy/);
  });
});
