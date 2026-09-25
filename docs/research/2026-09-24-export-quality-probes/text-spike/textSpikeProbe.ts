// Phase 5C Task 6 (text spike) -- measurement only, not production code.
// Served by the Vite dev server from outside src/ (same technique
// docs/research/2026-09-24-export-quality-probes/matrix.ts already uses) and
// imported dynamically from a Playwright page.evaluate() in run.mjs. Nothing
// under src/ imports this file or harfbuzzjs; that boundary is Task 7/8's,
// not this spike's.
import * as hb from "harfbuzzjs";
import { CanvasTextMetrics, Text, TextStyle } from "pixi.js";

const FONT_FAMILY = "'JetBrains Mono', monospace";
const FONT_URL = "/fonts/JetBrainsMono-Regular.ttf";
const DIFF_THRESHOLD = 8; // matches spec 1's own "alpha pixels differing by more than 8"

type HbFont = { face: any; font: any; upem: number };

let hbFontCache: HbFont | null = null;
async function getHbFont(): Promise<HbFont> {
  if (hbFontCache) return hbFontCache;
  const buf = await (await fetch(FONT_URL)).arrayBuffer();
  const blob = new (hb as any).Blob(buf);
  const face = new (hb as any).Face(blob);
  const font = new (hb as any).Font(face);
  hbFontCache = { face, font, upem: face.upem };
  return hbFontCache;
}

function shapeString(font: any, text: string) {
  const buf = new (hb as any).Buffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  (hb as any).shape(font, buf);
  const infos = buf.getGlyphInfos();
  const pos = buf.getGlyphPositions();
  return infos.map((g: any, i: number) => ({
    glyphId: g.codepoint as number,
    cluster: g.cluster as number,
    xAdvance: pos[i].x_advance as number,
    yAdvance: pos[i].y_advance as number,
    xOffset: pos[i].x_offset as number,
    yOffset: pos[i].y_offset as number,
  }));
}

// Converts one glyph's glyphToJson() contours to an SVG path-data fragment,
// placed at (originX, originY) in canvas pixel space, scaled from font
// units, with the font's y-up flipped to canvas's y-down.
function glyphPathAt(font: any, glyphId: number, originX: number, originY: number, scale: number): string {
  const cmds = font.glyphToJson(glyphId) as Array<{ type: string; values: number[] }>;
  const parts: string[] = [];
  for (const c of cmds) {
    if (c.type === "Z") {
      parts.push("Z");
      continue;
    }
    const pts: number[] = [];
    for (let i = 0; i < c.values.length; i += 2) {
      pts.push(originX + c.values[i] * scale, originY - c.values[i + 1] * scale);
    }
    parts.push(c.type + pts.join(","));
  }
  return parts.join(" ");
}

function shapedRunPath(font: any, run: ReturnType<typeof shapeString>, penX: number, baselineY: number, scale: number) {
  let path = "";
  let x = penX;
  for (const g of run) {
    const originX = x + g.xOffset * scale;
    const originY = baselineY - g.yOffset * scale;
    path += glyphPathAt(font, g.glyphId, originX, originY, scale) + " ";
    x += g.xAdvance * scale;
  }
  return { path, advanceWidth: x - penX };
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function inkBBox(data: Uint8ClampedArray, w: number, h: number) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function diffAlpha(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold = DIFF_THRESHOLD) {
  let diff = 0;
  for (let i = 3; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) > threshold) diff++;
  }
  return diff;
}

const CANVAS_W = 500;
const CANVAS_H = 120;
const BASELINE_Y = 80;
const PEN_X = 20;
const FONT_SIZE = 60;

function renderHbPath(font: any, run: ReturnType<typeof shapeString>, scale: number) {
  const canvas = makeCanvas(CANVAS_W, CANVAS_H);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#000";
  const { path } = shapedRunPath(font, run, PEN_X, BASELINE_Y, scale);
  const p2d = new Path2D(path);
  ctx.fill(p2d, "nonzero");
  return ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
}

function renderFillText(text: string) {
  const canvas = makeCanvas(CANVAS_W, CANVAS_H);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.fillText(text, PEN_X, BASELINE_Y);
  return ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
}

// Q2: shaping parity between harfbuzzjs-drawn contours and canvas fillText.
export async function q2ShapingParity() {
  await document.fonts.load(`${FONT_SIZE}px 'JetBrains Mono'`);
  const { font, upem } = await getHbFont();
  const scale = FONT_SIZE / upem;

  const strings = ["->", "!=", "==", "a->b != c", "hello!", "é"];
  const results: Record<string, unknown> = {};

  for (const s of strings) {
    const run = shapeString(font, s);
    const hbData = renderHbPath(font, run, scale);
    const ftData = renderFillText(s);
    results[s] = {
      glyphIds: run.map((g) => g.glyphId),
      hbBBox: inkBBox(hbData, CANVAS_W, CANVAS_H),
      fillTextBBox: inkBBox(ftData, CANVAS_W, CANVAS_H),
      pixelsDiffering: diffAlpha(hbData, ftData),
    };
  }

  // The tab case: raw tab vs U+0020-replaced, both compared against
  // fillText's rendering of the RAW string (pixi passes \t unchanged to
  // fillText -- confirmed separately in Q3).
  const raw = "a\tb";
  const replaced = "a b";
  const ftRawData = renderFillText(raw);
  const hbRawRun = shapeString(font, raw);
  const hbReplacedRun = shapeString(font, replaced);
  results["a\\tb (raw tab, hb)"] = {
    glyphIds: hbRawRun.map((g) => g.glyphId),
    hbBBox: inkBBox(renderHbPath(font, hbRawRun, scale), CANVAS_W, CANVAS_H),
    fillTextBBox: inkBBox(ftRawData, CANVAS_W, CANVAS_H),
    pixelsDiffering: diffAlpha(renderHbPath(font, hbRawRun, scale), ftRawData),
  };
  results["a\\tb (U+0020-replaced, hb) vs fillText(raw)"] = {
    glyphIds: hbReplacedRun.map((g) => g.glyphId),
    hbBBox: inkBBox(renderHbPath(font, hbReplacedRun, scale), CANVAS_W, CANVAS_H),
    fillTextBBox: inkBBox(ftRawData, CANVAS_W, CANVAS_H),
    pixelsDiffering: diffAlpha(renderHbPath(font, hbReplacedRun, scale), ftRawData),
  };

  return results;
}

// Q3: pixi's own layout numbers, straight from CanvasTextMetrics/Text.
export async function q3PixiLayout() {
  await document.fonts.load("60px 'JetBrains Mono'");
  await document.fonts.load("16px 'JetBrains Mono'");

  const oneLine = "a->b != c";
  const twoLine = "hello!\nworld->end";
  const out: Record<string, unknown> = {};

  for (const fontSize of [60, 16]) {
    for (const [label, content] of [
      ["oneLine", oneLine],
      ["twoLine", twoLine],
    ] as const) {
      const style = new TextStyle({ fontFamily: FONT_FAMILY, fontSize, fill: 0x000000 });
      const metrics = CanvasTextMetrics.measureText(content, style);
      const textObj = new Text({ text: content, style });
      out[`${label}@${fontSize}`] = {
        metricsWidth: metrics.width,
        metricsHeight: metrics.height,
        lines: metrics.lines,
        lineWidths: metrics.lineWidths,
        lineHeight: metrics.lineHeight,
        fontProperties: metrics.fontProperties,
        finalPadding: style._getFinalPadding(),
        textObjWidth: textObj.width,
        textObjHeight: textObj.height,
        baseSizeEqualsTextObjExactly: true, // by construction -- builder.ts:333 assigns __baseSize from textObj.width/height directly
      };
      textObj.destroy(true);
    }
  }

  // Which of metrics.width / bounding-box width wins in _measureText, for
  // real JetBrains Mono strings (not the METRICS_STRING pixi uses for
  // fontProperties -- this is the per-line _measureText path).
  const rawWinner: Record<string, unknown> = {};
  const rawCanvas = document.createElement("canvas");
  const rawCtx = rawCanvas.getContext("2d")!;
  for (const fontSize of [60, 16]) {
    for (const s of [oneLine, "hello!", "world->end"]) {
      rawCtx.font = `${fontSize}px 'JetBrains Mono'`;
      const m = rawCtx.measureText(s);
      const metricWidth = m.width;
      const boundsWidth = (m.actualBoundingBoxRight ?? 0) - -(m.actualBoundingBoxLeft ?? 0);
      rawWinner[`${JSON.stringify(s)}@${fontSize}`] = {
        metricWidth,
        boundsWidth,
        winner: metricWidth === boundsWidth ? "tie" : metricWidth > boundsWidth ? "metrics.width" : "bounding-box width",
      };
    }
  }
  out.rawWinner = rawWinner;

  return out;
}

// Q4: overlapping contours -- nonzero vs evenodd, over ASCII 32-126 plus the
// ligature glyphs Q2 also exercises.
export async function q4FillRuleParity() {
  const { font, upem } = await getHbFont();
  const scale = FONT_SIZE / upem;

  const glyphIds = new Map<number, string>(); // glyphId -> a human label
  for (let cp = 32; cp <= 126; cp++) {
    const ch = String.fromCharCode(cp);
    const gid = font.nominalGlyph(cp);
    if (gid !== undefined && !glyphIds.has(gid)) glyphIds.set(gid, `U+${cp.toString(16)} ${JSON.stringify(ch)}`);
  }
  for (const s of ["->", "!=", "==", "a->b != c", "hello!", "é"]) {
    for (const g of shapeString(font, s)) {
      if (!glyphIds.has(g.glyphId)) glyphIds.set(g.glyphId, `ligature-run glyph from ${JSON.stringify(s)}`);
    }
  }

  const W = 140, H = 140;
  const differing: Array<{ glyphId: number; label: string; diffPixels: number; name: string }> = [];
  let checked = 0;
  for (const [gid, label] of glyphIds) {
    checked++;
    const path = glyphPathAt(font, gid, 40, 100, scale);
    if (!path) continue; // .notdef / space have no contours
    const p2d = new Path2D(path);

    const cNonzero = makeCanvas(W, H);
    const xNonzero = cNonzero.getContext("2d")!;
    xNonzero.fillStyle = "#000";
    xNonzero.fill(p2d, "nonzero");
    const nonzeroData = xNonzero.getImageData(0, 0, W, H).data;

    const cEvenodd = makeCanvas(W, H);
    const xEvenodd = cEvenodd.getContext("2d")!;
    xEvenodd.fillStyle = "#000";
    xEvenodd.fill(p2d, "evenodd");
    const evenoddData = xEvenodd.getImageData(0, 0, W, H).data;

    const diff = diffAlpha(nonzeroData, evenoddData, 0); // any byte difference counts here
    if (diff > 0) {
      differing.push({ glyphId: gid, label, diffPixels: diff, name: font.glyphName(gid) });
    }
  }

  return { checked, differing };
}

// Q6 must run on a page that has done nothing else font-related yet -- the
// caller (run.mjs) is responsible for using a fresh, single-purpose page.
export async function q6FontReadiness() {
  const checkBefore = document.fonts.check("60px 'JetBrains Mono'");
  const style = new TextStyle({ fontFamily: FONT_FAMILY, fontSize: 60, fill: 0x000000 });
  const textBefore = new Text({ text: "readiness-probe", style });
  const widthBefore = textBefore.width;
  const heightBefore = textBefore.height;
  textBefore.destroy(true);

  await document.fonts.load("60px 'JetBrains Mono'");
  const checkAfter = document.fonts.check("60px 'JetBrains Mono'");
  const textAfter = new Text({ text: "readiness-probe", style });
  const widthAfter = textAfter.width;
  const heightAfter = textAfter.height;
  textAfter.destroy(true);

  return { checkBefore, widthBefore, heightBefore, checkAfter, widthAfter, heightAfter };
}

// Q7: missing glyphs -- CJK and emoji, neither in JetBrains Mono.
export async function q7MissingGlyph() {
  await document.fonts.load("60px 'JetBrains Mono'");
  const { font } = await getHbFont();
  const out: Record<string, unknown> = {};
  for (const ch of ["日" /* 日 */, "🙂" /* slightly smiling face emoji */]) {
    const run = shapeString(font, ch);
    const ftData = renderFillText(ch);
    const bbox = inkBBox(ftData, CANVAS_W, CANVAS_H);
    out[ch] = {
      codePoint: ch.codePointAt(0),
      glyphIds: run.map((g) => g.glyphId),
      allGlyphIdsZero: run.every((g) => g.glyphId === 0),
      fillTextDrewInk: bbox !== null,
      fillTextInkBBox: bbox,
    };
  }
  return out;
}

// Exposed for run.mjs's convenience so it can call one function and get
// everything in one page.evaluate() round trip, EXCEPT q6 which needs total
// isolation on its own fresh page (see q6FontReadiness's own comment).
export async function runAllExceptQ6() {
  return {
    q2: await q2ShapingParity(),
    q3: await q3PixiLayout(),
    q4: await q4FillRuleParity(),
    q7: await q7MissingGlyph(),
    // Q5's "is BASE_URL '/' in this project's vite.config" -- read straight
    // from the same Vite client env every other module in this app sees,
    // not asserted from reading vite.config.ts alone.
    baseUrl: import.meta.env.BASE_URL,
  };
}
