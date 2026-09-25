import type { IRColor, IRObjectId, IRObjectNode, IRObjectProps, IRPointList, IRSceneNode, IRTextProps } from "../sceneIR";
// Types only: `textOutline.ts` owns the harfbuzzjs import, and this module
// must never import harfbuzzjs itself (spec §7, `exportBoundary.test.ts`).
// A `TextLayout` and a `TextGlyphRun` are plain numbers and arrays measured
// by the pipeline (`lottiePipeline.ts`'s `collectTextLayouts`).
import type { Contour, MissingGlyph, TextGlyphRun, TextLayout } from "./textOutline";

/**
 * Diagnostics for a scene the Lottie exporter refuses to bake.
 *
 * Prefixed `LOTTIE_` rather than `EXPORT_`: these fire against the bounded
 * shape subset Phase 5A's Lottie exporter supports, which is a different
 * concern from `exportContract.ts`'s `EXPORT_*` codes (those gate export
 * *timing* — fps, duration, frame budget — not scene *content*). Modelled
 * on that module: every applicable diagnostic is returned, not just the
 * first, and every message begins `[CODE] `.
 */
export type LottieDiagnosticCode = "LOTTIE_TEXT_MISSING_GLYPH";

export interface LottieDiagnostic {
  readonly code: LottieDiagnosticCode;
  readonly message: string;
}

/**
 * The shape a supported IR node bakes down to for the Lottie encoder
 * (Task 3). `group` carries no shape data of its own — in Lottie a group
 * becomes a layer that other layers parent to, not a drawn primitive.
 */
export type LottieShapeSpec =
  | { readonly kind: "circle"; readonly radius: number }
  | { readonly kind: "rectangle"; readonly width: number; readonly height: number }
  | { readonly kind: "polygon"; readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }> }
  | { readonly kind: "line"; readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>; readonly thickness: number }
  /**
   * A text object as its glyph outlines (spec §6.3-6.4): closed contours in
   * text-local pixels, y down, the same space `builder.ts`'s `Text` child
   * draws in. The encoder fills them all with one nonzero `fl`. Phase 5A's
   * cut of `text` (R17) was about Lottie's *text layer*; this is shape
   * data, not a text layer, so R17's reason does not apply to it.
   */
  | {
      readonly kind: "text";
      readonly contours: ReadonlyArray<Contour>;
      /**
       * Present only when some glyph reaches outside the layout box: the
       * encoder then masks the layer to `(0,0)-(width,height)`, the box pixi
       * draws the text's texture into (see {@link textClip}).
       */
      readonly clip?: { readonly width: number; readonly height: number };
    }
  | { readonly kind: "group" };

/**
 * One exportable IR object, ready for Task 2's geometry conversion and
 * Task 3's Lottie encoding. Defined here, in Task 1, rather than in Task 2,
 * because `planLottie`'s signature must be stable across both tasks and
 * `LottiePlanResult` names it below.
 *
 * The scene background is deliberately **not** a `LayerSpec`: it has no IR
 * object id, no parent and no animation, and a synthetic id would collide
 * with the frame-snapshot lookup a later task does by id.
 */
export interface LayerSpec {
  readonly id: IRObjectId;
  readonly name: string;
  readonly shape: LottieShapeSpec;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly color: readonly [number, number, number] | null;
  readonly parentId: IRObjectId | null;
}

export type LottiePlanResult =
  | { readonly ok: true; readonly layers: ReadonlyArray<LayerSpec> }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<LottieDiagnostic> };

/**
 * A shape's local bounding box, before any origin is applied — the same
 * `min`/`size` shape `builder.ts`'s `LocalBBox` uses, reproduced here in
 * plain numbers because this module must not import from `builder.ts` (that
 * file is full of `pixi.js`, and Global Constraint 4 forbids importing it
 * even for a type).
 */
interface LocalBBox {
  readonly min: { readonly x: number; readonly y: number };
  readonly size: { readonly x: number; readonly y: number };
}

/**
 * `localPivot = bbox.min + origin × bbox.size` — `builder.ts`'s
 * `applyAnchorAndPivot` (`builder.ts:86-89`). `ObjectSnapshot.x`/`y` *is*
 * that pivot's parent-local position, because PixiJS places a container by
 * its pivot, so this value is exactly the `anchor` a `LayerSpec` carries.
 */
function localPivot(origin: { readonly x: number; readonly y: number }, bbox: LocalBBox): { x: number; y: number } {
  return {
    x: bbox.min.x + origin.x * bbox.size.x,
    y: bbox.min.y + origin.y * bbox.size.y,
  };
}

/**
 * A polygon's bounding box, computed the same way `builder.ts`'s `polygon`
 * case does (`builder.ts:239-250`): a min/max scan over the raw points, with
 * an empty list defaulting to a zero-size box at the origin.
 */
function polygonBBox(points: IRPointList): LocalBBox {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (minX === Infinity) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
  return { min: { x: minX, y: minY }, size: { x: maxX - minX, y: maxY - minY } };
}

/**
 * `IRColor` is always a normalised six-digit `#rrggbb` string by the time it
 * reaches the IR (`resolvers.ts`'s `normaliseColor`), so no validation is
 * needed here — just the hex-to-0..1-float conversion Lottie's `sc`/`c`
 * colour values want.
 *
 * Exported (Task 3): `lottiePipeline.ts` and `lottieRoundTrip.test.ts` each
 * used to carry their own copy of this exact function, because this file was
 * outside their editing task's allowed file list. That restriction was
 * specific to those tasks; this file owns the one implementation now.
 */
export function hexToRgb01(hex: IRColor): readonly [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r / 255, g / 255, b / 255];
}

/** The last dot-separated segment of a scope-qualified id, for Lottie `nm`. */
function lastSegment(id: IRObjectId): string {
  const i = id.lastIndexOf(".");
  return i === -1 ? id : id.slice(i + 1);
}

/**
 * Map one supported IR node's props to its Lottie shape, anchor and colour.
 * Every row is measured against `builder.ts`'s `buildNode` switch — see
 * `docs/architecture/renderer.md` and the module docstring above for the
 * per-kind bbox this derives from. `text` never reaches here: its box is
 * not a property of the IR at all but the pipeline's measurement, so
 * `planLottie`'s walk handles it with {@link textGeometryFor}.
 */
function shapeGeometryFor(
  props: IRObjectProps
): { readonly shape: LottieShapeSpec; readonly anchor: { readonly x: number; readonly y: number }; readonly color: readonly [number, number, number] | null } {
  switch (props.kind) {
    case "circle": {
      const bbox: LocalBBox = { min: { x: 0, y: 0 }, size: { x: props.radius * 2, y: props.radius * 2 } };
      return {
        shape: { kind: "circle", radius: props.radius },
        anchor: localPivot(props.origin, bbox),
        color: hexToRgb01(props.color),
      };
    }
    case "rectangle": {
      const bbox: LocalBBox = { min: { x: 0, y: 0 }, size: { x: props.width, y: props.height } };
      return {
        shape: { kind: "rectangle", width: props.width, height: props.height },
        anchor: localPivot(props.origin, bbox),
        color: hexToRgb01(props.color),
      };
    }
    case "polygon": {
      const bbox = polygonBBox(props.points);
      return {
        shape: { kind: "polygon", points: props.points },
        anchor: localPivot(props.origin, bbox),
        color: hexToRgb01(props.color),
      };
    }
    case "line": {
      // `builder.ts`'s "line" case (builder.ts:280-317) scans the raw points
      // for a min/max bbox exactly the way its "polygon" case does — so this
      // reuses `polygonBBox` rather than a second copy of the same scan.
      const bbox = polygonBBox(props.points);
      return {
        shape: { kind: "line", points: props.points, thickness: props.thickness },
        anchor: localPivot(props.origin, bbox),
        color: hexToRgb01(props.color),
      };
    }
    case "group": {
      // D16: a group's pivot is always its own local origin, never derived
      // from its children — `builder.ts:351-361` passes a fixed `{0,0}`
      // origin and a zero-size bbox into the same `applyAnchorAndPivot` the
      // leaf shapes use, which is why this reuses `localPivot` rather than
      // special-casing the return value: fed those same fixed inputs, the
      // general formula already collapses to `(0, 0)`.
      return {
        shape: { kind: "group" },
        anchor: localPivot({ x: 0, y: 0 }, { min: { x: 0, y: 0 }, size: { x: 0, y: 0 } }),
        color: null,
      };
    }
    default: {
      // Unreachable: `walk` below routes `text` to `textGeometryFor` and
      // calls this only for the five IR-measurable kinds.
      throw new Error(`[LOTTIE] shapeGeometryFor called with unsupported kind '${(props as { kind: string }).kind}'`);
    }
  }
}

/**
 * What the export pipeline measured for every `text` node, by IR id (spec
 * §6.2-6.3): pixi's layout of the built `Text` and HarfBuzz's glyph
 * outlines for it. Plain data; see `textOutline.ts` for both shapes.
 */
export interface LottieTextInput {
  readonly layouts: ReadonlyMap<IRObjectId, TextLayout>;
  readonly runs: ReadonlyMap<IRObjectId, TextGlyphRun>;
}

/** `U+65E5`, `U+1F642`: at least four hex digits, upper case, never a surrogate. */
function codePointLabel(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * The one place `LOTTIE_TEXT_MISSING_GLYPH`'s wording lives (spec §6.3).
 *
 * Glyph 0 (`.notdef`) from shaping means JetBrains Mono has no glyph for
 * the character. The preview does not draw tofu there: Chromium falls back
 * to a system font (a real CJK glyph, a colour emoji; Task 6 Q7), which a
 * Lottie file of glyph outlines cannot reproduce. So the export refuses,
 * naming the object and every such character, once each.
 */
function missingGlyphDiagnostic(id: IRObjectId, missing: ReadonlyArray<MissingGlyph>): LottieDiagnostic {
  const one = missing.length === 1;
  const chars = missing.map((m) => `'${m.char}' (${codePointLabel(m.codePoint)})`).join(", ");
  return {
    code: "LOTTIE_TEXT_MISSING_GLYPH",
    message:
      `[LOTTIE_TEXT_MISSING_GLYPH] Text '${id}' uses ${one ? "a character" : "characters"} the export font ` +
      `'JetBrains Mono' has no glyph for: ${chars}. The preview draws ${one ? "it" : "them"} from a fallback ` +
      `font, which a Lottie file cannot reproduce. Remove or replace ${one ? "it" : "them"} before exporting.`,
  };
}

/**
 * The clip a text's outlines need to look like the preview, or none.
 *
 * pixi draws a `Text` into a canvas texture sized to its measured box and
 * places it at `(0,0)-(width,height)` in the text's own space, so any ink
 * outside that box is cut off in the preview and in every raster export.
 * Measured (Task 8, `text-check.mjs`, `lottie-text-mark.marey`): the ring
 * below in `B` + U+0325 + U+0301 hangs past both the descent and the last
 * advance, and Marey's PNG stops exactly at the box's last row and column
 * while unclipped outlines drew 4 px more on each of those edges. The
 * Lottie reproduces the cut with a mask, but only when a glyph actually
 * reaches outside: a curve never leaves the hull of its vertices and control
 * points, so if every one of those is inside the box, a mask would change
 * nothing and is not emitted.
 */
function textClip(
  contours: ReadonlyArray<Contour>,
  layout: TextLayout,
): { readonly width: number; readonly height: number } | undefined {
  const outside = (x: number, y: number) => x < 0 || y < 0 || x > layout.width || y > layout.height;
  for (const { v, i, o } of contours) {
    for (let k = 0; k < v.length; k++) {
      const [x, y] = v[k];
      if (outside(x, y) || outside(x + i[k][0], y + i[k][1]) || outside(x + o[k][0], y + o[k][1])) {
        return { width: layout.width, height: layout.height };
      }
    }
  }
  return undefined;
}

/**
 * A text node's shape, anchor and colour, from the pipeline's measurements.
 *
 * The anchor box is the layout's `width` x `height`, which is the built
 * wrapper's `__baseSize`: the exact box `builder.ts`'s text case pivoted on
 * (`min (0,0)`, `size (textObj.width, textObj.height)`), so the anchor
 * matches the sampled snapshots by construction. It is deliberately not
 * recomputed from the glyphs: pixi's line width is `max(advance, ink)`
 * (Task 7 measured 202 px against an advance sum of 180 for a string with
 * combining marks), and the snapshots were taken against pixi's number.
 *
 * Both entries are required. A text node with no layout or no glyph run is
 * a pipeline bug, not a property of the scene, so it throws rather than
 * becoming a diagnostic a person would be asked to act on.
 */
function textGeometryFor(
  id: IRObjectId,
  props: IRTextProps,
  text: LottieTextInput | undefined,
): { readonly geometry: ReturnType<typeof shapeGeometryFor>; readonly missing: ReadonlyArray<MissingGlyph> } {
  const layout = text?.layouts.get(id);
  const run = text?.runs.get(id);
  if (!layout || !run) {
    throw new Error(`[LOTTIE] text node '${id}' has no layout from the export pipeline`);
  }
  const bbox: LocalBBox = { min: { x: 0, y: 0 }, size: { x: layout.width, y: layout.height } };
  const clip = textClip(run.contours, layout);
  return {
    geometry: {
      shape: { kind: "text", contours: run.contours, ...(clip ? { clip } : {}) },
      anchor: localPivot(props.origin, bbox),
      color: hexToRgb01(props.color),
    },
    missing: run.missing,
  };
}

/**
 * Walk the Scene IR and decide whether it can be exported to Lottie at all.
 *
 * Depth-first over every node's `children`, so an unsupported node nested
 * inside a `group` (or nested groups) is still found. Collects one
 * diagnostic per unsupported node rather than stopping at the first, so a
 * caller sees everything wrong with the scene in one pass — the same rule
 * `exportContract.ts`'s `planExport` follows.
 *
 * There is no diagnostic for colour. `IRColor` is always a normalised
 * six-digit `#rrggbb` by the time it reaches the IR — three-digit hex is
 * expanded and named colours are resolved upstream in
 * `typeChecker/builder.ts`'s `resolveColor`, and anything else never lexes
 * as a colour at all (a `PARSE` error, long before an IR exists). A colour
 * diagnostic here would be a branch no input can reach.
 *
 * `text` (Phase 5C Task 8) needs what only the built tree knows: pixi's
 * layout and HarfBuzz's outlines, passed in as `text`. It is optional, so a
 * text-free caller (and every test that has no text) is unchanged; a text
 * node with no entry in both maps throws (see {@link textGeometryFor}).
 * Because of that, `runLottieExport` calls this after the build and before
 * sampling (ruling T8-R1), not before the build as Phase 5A did.
 */
export function planLottie(ir: IRSceneNode, text?: LottieTextInput): LottiePlanResult {
  const diagnostics: LottieDiagnostic[] = [];
  const layers: LayerSpec[] = [];

  // One depth-first walk produces both the diagnostics and the specs; there
  // is no second traversal. `parentId` threads the enclosing object's id
  // down to each child, `null` at the top level.
  function walk(node: IRObjectNode, parentId: IRObjectId | null): void {
    switch (node.props.kind) {
      case "text": {
        const { geometry, missing } = textGeometryFor(node.id, node.props, text);
        if (missing.length > 0) {
          diagnostics.push(missingGlyphDiagnostic(node.id, missing));
          break;
        }
        layers.push({ id: node.id, name: lastSegment(node.id), ...geometry, parentId });
        break;
      }
      default: {
        const { shape, anchor, color } = shapeGeometryFor(node.props);
        layers.push({
          id: node.id,
          name: lastSegment(node.id),
          shape,
          anchor,
          color,
          parentId,
        });
        break;
      }
    }

    // `node.children` is already layer-sorted (typeChecker/builder.ts sorts
    // by `layer` ascending with a stable index tiebreak, and nothing after
    // it re-sorts), so this walk must not re-sort — IR order IS paint order.
    for (const child of node.children) {
      walk(child, node.id);
    }
  }

  for (const child of ir.children) {
    walk(child, null);
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: Object.freeze(diagnostics) };
  }

  return { ok: true, layers: Object.freeze(layers) };
}
