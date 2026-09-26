/**
 * Glyph outlines for Lottie `text` export (Phase 5C, spec §6.3, owner
 * decision O4): HarfBuzz shapes each line and hands back glyph outlines,
 * which become closed Lottie contours in text-local pixels.
 *
 * **The only module that imports `harfbuzzjs`** (spec §7). It imports no
 * pixi.js and no Scene IR either: what it knows about a text object arrives
 * as a `TextLayout` of plain numbers and strings, measured by pixi in the
 * pipeline (`lottiePipeline.ts`'s `collectTextLayouts`, spec §6.2, O5).
 * `exportBoundary.test.ts` pins all three rules.
 *
 * harfbuzzjs 1.6.2 initialises its wasm with a top-level `await` inside its
 * own entry module, so by the time `import * as hb` resolves, `hb.Blob`,
 * `hb.Face` and friends are usable. Rolldown rewrites the loader's wasm URL
 * in a production build with no `?url` wiring (Task 6, Q1).
 */
import * as hb from "harfbuzzjs";

/**
 * One closed contour, shaped for a Lottie `sh` path: vertices `v`, and each
 * vertex's in-tangent `i` and out-tangent `o` **relative to that vertex**, in
 * text-local pixels with y pointing down. Lottie draws a closed path's
 * closing segment from `o[last]` to `i[0]`.
 */
export interface Contour {
  readonly v: ReadonlyArray<readonly [number, number]>;
  readonly i: ReadonlyArray<readonly [number, number]>;
  readonly o: ReadonlyArray<readonly [number, number]>;
}

/**
 * What pixi measured for one text object, as plain numbers (spec §6.2).
 *
 * - `width`/`height`: the built wrapper's `__baseSize`, the box `builder.ts`
 *   pivoted on.
 * - `ascent`: `fontProperties.ascent`, pixi's baseline offset for line 0.
 * - `lineHeight`: `metrics.lineHeight`, the distance between baselines.
 * - `padding`: `style._getFinalPadding()`. Recorded, but it does not move
 *   the glyphs in text-local space; see `outline`.
 * - `lines`: `metrics.lines`, the content exactly as pixi split it.
 */
export interface TextLayout {
  readonly width: number;
  readonly height: number;
  readonly ascent: number;
  readonly lineHeight: number;
  readonly padding: number;
  readonly lines: ReadonlyArray<string>;
}

/** A character the font has no glyph for (HarfBuzz shaped it to glyph 0). */
export interface MissingGlyph {
  readonly char: string;
  readonly codePoint: number;
}

/**
 * A text object's outlines: every glyph's contours, in text-local pixels,
 * one flat list across all lines (Lottie fills them with one nonzero `fl`,
 * so there is nothing per-glyph to keep). `missing` lists each character
 * that shaped to `.notdef`, once, in first-seen order; T8 turns a non-empty
 * list into `LOTTIE_TEXT_MISSING_GLYPH`.
 */
export interface TextGlyphRun {
  readonly contours: ReadonlyArray<Contour>;
  readonly missing: ReadonlyArray<MissingGlyph>;
}

/** One shaped glyph, in font units. Exposed so tests can assert on glyph ids. */
export interface ShapedGlyph {
  readonly glyphId: number;
  /** Index into the shaped string's UTF-16 code units. */
  readonly cluster: number;
  readonly xAdvance: number;
  readonly xOffset: number;
  readonly yOffset: number;
}

export interface TextOutliner {
  /** Units per em of the loaded face. */
  readonly upem: number;
  /**
   * Shape one line with HarfBuzz's default features (so `calt`, `ccmp` and
   * `mark` apply as they do in Chromium), after the canvas whitespace rule
   * (`canvasWhitespace`).
   */
  shapeLine(line: string): ReadonlyArray<ShapedGlyph>;
  /**
   * One glyph's outline as HarfBuzz's SVG path data, in font units with y
   * up (the input `pathToContours` takes). Exposed so a test can build the
   * contours a shaped line should produce from its glyph ids, independently
   * of `outline`'s own loop.
   */
  glyphPath(glyphId: number): string;
  /** Every line of `layout`, shaped and outlined at `fontSize` px. */
  outline(layout: TextLayout, fontSize: number): TextGlyphRun;
  /** Drop the face and font. Any later call throws. */
  destroy(): void;
}

/**
 * The canvas `fillText` text-preparation rule: every ASCII whitespace
 * character (U+0009, U+000A, U+000C, U+000D, U+0020) becomes U+0020 before
 * the text is shaped (HTML, "text preparation algorithm", step 1). pixi
 * hands `\t` to `fillText` unchanged (Task 6, Q3), so the preview draws a tab
 * as a space; HarfBuzz itself maps U+0009 to glyph 0. Line breaks never reach
 * here, because `TextLayout.lines` is already split.
 */
export function canvasWhitespace(line: string): string {
  return line.replace(/[\t\n\f\r ]/g, " ");
}

/**
 * Create an outliner over one font file's bytes. One per export: harfbuzzjs
 * frees its wasm objects through a `FinalizationRegistry`, so `destroy`
 * drops the references rather than calling a native destructor.
 */
export async function createTextOutliner(fontBytes: ArrayBuffer): Promise<TextOutliner> {
  let face: hb.Face | null = new hb.Face(new hb.Blob(fontBytes));
  let font: hb.Font | null = new hb.Font(face);
  const upem = face.upem;

  const live = (): hb.Font => {
    if (!font) throw new Error("[export] TextOutliner used after destroy().");
    return font;
  };

  const shapeLine = (line: string): ShapedGlyph[] => {
    const f = live();
    const buffer = new hb.Buffer();
    buffer.addText(canvasWhitespace(line));
    buffer.guessSegmentProperties();
    hb.shape(f, buffer);
    const infos = buffer.getGlyphInfos();
    // camelCase in harfbuzzjs 1.6.2 (Task 6, Q2): the C API's `x_advance`
    // reads `undefined` here.
    const positions = buffer.getGlyphPositions();
    return infos.map((info, k) => ({
      glyphId: info.codepoint,
      cluster: info.cluster,
      xAdvance: positions[k].xAdvance,
      xOffset: positions[k].xOffset,
      yOffset: positions[k].yOffset,
    }));
  };

  const outline = (layout: TextLayout, fontSize: number): TextGlyphRun => {
    const f = live();
    const scale = fontSize / upem;
    const contours: Contour[] = [];
    const missing: MissingGlyph[] = [];
    const seen = new Set<number>();

    layout.lines.forEach((line, lineIndex) => {
      // pixi's own placement, `CanvasTextGenerator.mjs` (pixi.js 8.16.0,
      // `_renderTextToCanvas`): line j's baseline is at
      // `j * lineHeight + fontProperties.ascent` (+ half the stroke width,
      // + `(lineHeight - fontSize) / 2` when a `lineHeight` style is set;
      // Marey sets neither, so both are 0), and x starts at 0 for `align:
      // left`. It draws at `+ padding` inside a texture that
      // `updateTextBounds.mjs` then places at `-padding` in the Text's local
      // space, so the padding cancels. Spec §6.3 step 4 adds `padding` to
      // both coordinates; that would double-count it. Marey's padding is 0
      // (Task 6, Q3), so the two readings agree on every Marey scene today,
      // and a test pins this one.
      const baseline = lineIndex * layout.lineHeight + layout.ascent;
      const glyphs = shapeLine(line);
      let penX = 0;
      for (const g of glyphs) {
        if (g.glyphId === 0) {
          const codePoint = line.codePointAt(g.cluster);
          if (codePoint !== undefined && !seen.has(codePoint)) {
            seen.add(codePoint);
            missing.push({ char: String.fromCodePoint(codePoint), codePoint });
          }
        } else {
          const x = penX + g.xOffset * scale;
          const y = baseline - g.yOffset * scale;
          contours.push(...pathToContours(f.glyphToPath(g.glyphId), scale, x, y));
        }
        penX += g.xAdvance * scale;
      }
    });

    return { contours, missing };
  };

  return {
    upem,
    shapeLine,
    glyphPath: (glyphId: number) => live().glyphToPath(glyphId),
    outline,
    destroy() {
      font = null;
      face = null;
    },
  };
}

type Point = readonly [number, number];

const ZERO: Point = [0, 0];

/**
 * SVG path data in font units → closed contours in pixels, y down.
 *
 * A font-unit point `(x, y)` lands at `(dx + x·scale, dy − y·scale)`: `dx`
 * is the glyph's pen position and `dy` its baseline, both already in pixels.
 * Exported for the unit test.
 *
 * - `M` starts a contour. `Z` closes it; so does a following `M` or the end
 *   of the data (a glyph outline is always closed).
 * - `L` adds a vertex with zero tangents.
 * - `Q` is raised to the exact cubic: for `P0, Q, P1` the controls are
 *   `C1 = P0 + ⅔(Q − P0)` and `C2 = P1 + ⅔(Q − P1)`, stored relative to
 *   their own vertex, so `o[k] = ⅔(Q − P0)` and `i[k+1] = ⅔(Q − P1)`.
 *   Computed as `2·d / 3` rather than `(2/3)·d`, which is exact for the
 *   integer-and-half coordinates TrueType outlines use.
 * - `C` passes its controls through the same way.
 * - When a contour's last vertex lands exactly on its first (harfbuzzjs
 *   emits this for most JetBrains Mono glyphs), the duplicate is dropped and
 *   its in-tangent moves to vertex 0, so the closing segment keeps its curve.
 * - Anything else throws: silently dropping a command would drop ink.
 */
export function pathToContours(d: string, scale: number, dx: number, dy: number): Contour[] {
  const contours: Contour[] = [];
  let v: Point[] = [];
  let ins: Point[] = [];
  let outs: Point[] = [];

  // `+ 0` turns a `-0` into `0`, so a flipped zero compares equal to `0`.
  const px = (x: number): number => dx + x * scale + 0;
  const py = (y: number): number => dy - y * scale + 0;
  const rel = (a: Point, b: Point): Point => [a[0] - b[0] + 0, a[1] - b[1] + 0];
  const twoThirds = (a: Point, b: Point): Point => [(2 * (a[0] - b[0])) / 3 + 0, (2 * (a[1] - b[1])) / 3 + 0];

  const close = () => {
    if (v.length === 0) return;
    const last = v.length - 1;
    if (last > 0 && v[last][0] === v[0][0] && v[last][1] === v[0][1]) {
      ins[0] = ins[last];
      v = v.slice(0, last);
      ins = ins.slice(0, last);
      outs = outs.slice(0, last);
    }
    contours.push({ v, i: ins, o: outs });
    v = [];
    ins = [];
    outs = [];
  };

  const addVertex = (p: Point, inTangent: Point) => {
    v.push(p);
    ins.push(inTangent);
    outs.push(ZERO);
  };

  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let t = 0;
  const num = (): number => {
    const token = tokens[t++];
    const value = Number(token);
    if (token === undefined || Number.isNaN(value)) {
      throw new Error(`[export] pathToContours: malformed path data near token ${t - 1} of "${d}".`);
    }
    return value;
  };
  const point = (): Point => {
    const x = num();
    return [px(x), py(num())];
  };

  while (t < tokens.length) {
    const command = tokens[t++];
    switch (command) {
      case "M":
        close();
        addVertex(point(), ZERO);
        break;
      case "L":
        addVertex(point(), ZERO);
        break;
      case "Q": {
        const p0 = v[v.length - 1];
        const q = point();
        const p1 = point();
        outs[outs.length - 1] = twoThirds(q, p0);
        addVertex(p1, twoThirds(q, p1));
        break;
      }
      case "C": {
        const p0 = v[v.length - 1];
        const c1 = point();
        const c2 = point();
        const p1 = point();
        outs[outs.length - 1] = rel(c1, p0);
        addVertex(p1, rel(c2, p1));
        break;
      }
      case "Z":
      case "z":
        close();
        break;
      default:
        throw new Error(`[export] pathToContours: unsupported path command '${command}' in "${d}".`);
    }
  }
  close();
  return contours;
}
