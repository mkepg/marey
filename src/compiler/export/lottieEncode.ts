import { rgb01OfInt, type LayerSpec, type LottieShapeSpec } from "./lottieGeometry";
import type { FrameSnapshot, ObjectSnapshot } from "../renderer/frameSampler";
import type { SamplerPlan } from "./exportContract";
import { fitKeyframes, DEFAULT_HANDLE_RANGE, LOTTIE_FIT_TOLERANCE, type FitOptions } from "./lottieFit";

/**
 * The Lottie document, and the half of the exporter that never sees the IR.
 *
 * **This module imports nothing from the Scene IR module and nothing from
 * PixiJS** (Global Constraint 4, design §2.2). That is the phase's headline
 * structural claim made an import-level fact rather than an assertion: an
 * encoder that cannot name `IRSceneNode` cannot reach back through it into a
 * runtime, a world or a clock. `LayerSpec` arrives as a type from
 * `lottieGeometry.ts`, which owns the IR walk; everything this file receives
 * is inert data. The check is a grep for those two module names over this
 * file, so neither is written out here even in prose — a guard whose only
 * hits are the sentence describing it stops being a guard.
 *
 * **Every unit mismatch in design §3 lives here**, and each one produces a
 * file that parses without error, plays without warning, and shows the wrong
 * thing:
 *
 * | snapshot | Lottie | conversion |
 * |---|---|---|
 * | `rotation` radians | `r` degrees, clockwise | `× 180 / Math.PI` |
 * | `scaleX`/`scaleY` multiplier | `s` percent | `× 100` |
 * | `alpha` 0–1 | `o` 0–100 | `× 100` |
 * | colour 0–1 floats | fill `c` 0–1 floats | none (done in `lottieGeometry`) |
 * | colour 0–1 floats | solid `sc` `#rrggbb` | {@link hexOf} — the one place the format is inconsistent with itself |
 *
 * The arithmetic is exact rather than approximate at every value this suite
 * exercises, which is why the tests assert with `===` (design §8.3):
 * `(Math.PI / 2) × 180 / Math.PI` is `90`, `0.25 × 100` is `25`, and doubles
 * round-trip through `JSON.parse`/`stringify` at full precision.
 *
 * **Three choices here rested on a design §11 item the published
 * specification did not settle. Task 4 measured all three in a real player**
 * (lottie-web 5.13.0, Chromium — see design §11's 2026-09-12 dated
 * correction for the fixtures and pixel evidence) **and confirmed every one
 * of this module's assumptions; none was falsified:**
 *
 * 1. **§11.1 — stacking order.** {@link encodeLottie} reverses the layer
 *    array because array-earlier layers draw *above* later ones (§6.1).
 *    Confirmed with an overlapping fixture: the array-earlier (later-declared)
 *    layer rendered on top.
 * 2. **§11.2 — whether parenting propagates opacity.** {@link composedOpacity}
 *    flattens the ancestor product because it does *not* propagate. Confirmed
 *    with a nested-alpha fixture: the flattened 25% is what rendered, not the
 *    12.5% double-application would have produced.
 * 3. **§11.5 — whether `op` is inclusive or exclusive.** `op = frameCount`
 *    for frames indexed `0 … frameCount − 1`. Confirmed exclusive: sampling
 *    frame `op` itself renders nothing at all, background included.
 *
 * Two §11 items were settled without a browser, by reading the sources
 * directly: §11.3's shape-list field is `shapes` (the published layers page),
 * and §11.6's easing handles must be present and explicit on every keyframe
 * that starts a segment — omitting them leaves the property unevaluated.
 *
 * **Keyframes are fitted, not one per frame.** Design §7.1's per-frame linear
 * keyframes are superseded by `docs/specs/2026-11-13-marey-lottie-fitted-keyframes-design.md`:
 * each animated track goes through `fitKeyframes` (`lottieFit.ts`), which
 * writes a few cubic-eased keyframes whose `s` values are copied samples and
 * whose curves reproduce every frame within a per-channel tolerance. An
 * animated position is written as separate `x` and `y` dimensions, the layout
 * both measured players honour. A track that never varies still collapses to
 * a static property (design §7.2).
 */

/** A keyframe's easing handle: one component per value component, or one for all. */
export interface LottieBezierHandle {
  readonly x: ReadonlyArray<number>;
  readonly y: ReadonlyArray<number>;
}

/**
 * One keyframe. `s` is an array even for a scalar property (design §3), and
 * `t` is the output-frame index directly — the sampler emits one frame per
 * output frame and `fr` equals its `fps`, so there is no time conversion and
 * no rounding to get wrong (§7.1).
 */
export interface LottieKeyframe {
  readonly t: number;
  readonly s: ReadonlyArray<number>;
  /** Absent only on the last keyframe, which starts no segment. */
  readonly i?: LottieBezierHandle;
  readonly o?: LottieBezierHandle;
  /**
   * An easing name, written only when dotlottie-web would otherwise draw this
   * keyframe with another keyframe's curve (see `nameCollidingEasings`).
   */
  readonly n?: string;
}

/** An animatable scalar: `{a: 0, k: value}` static, `{a: 1, k: [...]}` animated. */
export type LottieScalarProperty =
  | { readonly a: 0; readonly k: number }
  | { readonly a: 1; readonly k: ReadonlyArray<LottieKeyframe> };

/** An animatable vector, same two shapes with an array-valued static case. */
export type LottieVectorProperty =
  | { readonly a: 0; readonly k: ReadonlyArray<number> }
  | { readonly a: 1; readonly k: ReadonlyArray<LottieKeyframe> };

/**
 * A colour is `[r, g, b]` in 0–1, static when the shape never changes colour
 * and keyframed when it does (Phase 7 spec §2.4).
 */
export type LottieColorProperty = LottieVectorProperty;

/**
 * A position with its dimensions animated separately (`s: true`). Written only
 * when either coordinate moves; a static position stays a combined vector.
 */
export interface LottieSplitPosition {
  readonly s: true;
  readonly x: LottieScalarProperty;
  readonly y: LottieScalarProperty;
}

/** A layer transform. `r` is degrees clockwise, `s` percent, `o` 0–100. */
export interface LottieTransform {
  readonly a: LottieVectorProperty;
  readonly p: LottieVectorProperty | LottieSplitPosition;
  readonly s: LottieVectorProperty;
  readonly r: LottieScalarProperty;
  readonly o: LottieScalarProperty;
}

/** A closed straight-edged path. `i`/`o` are relative to their own vertex. */
export interface LottieBezier {
  readonly i: ReadonlyArray<ReadonlyArray<number>>;
  readonly o: ReadonlyArray<ReadonlyArray<number>>;
  readonly v: ReadonlyArray<ReadonlyArray<number>>;
  readonly c: boolean;
}

export type LottieShapeItem =
  | { readonly ty: "el"; readonly nm: string; readonly p: LottieVectorProperty; readonly s: LottieVectorProperty }
  | { readonly ty: "rc"; readonly nm: string; readonly p: LottieVectorProperty; readonly s: LottieVectorProperty; readonly r: LottieScalarProperty }
  | { readonly ty: "sh"; readonly nm: string; readonly ks: { readonly a: 0; readonly k: LottieBezier } }
  | { readonly ty: "fl"; readonly nm: string; readonly c: LottieColorProperty; readonly o: LottieScalarProperty; readonly r: 1 }
  | {
      readonly ty: "st";
      readonly nm: string;
      readonly c: LottieColorProperty;
      readonly o: LottieScalarProperty;
      readonly w: LottieScalarProperty;
      readonly lc: 1;
      readonly lj: 1;
      readonly ml: number;
    };

interface LottieLayerBase {
  readonly ddd: 0;
  readonly ind: number;
  readonly nm: string;
  readonly sr: 1;
  readonly ks: LottieTransform;
  readonly ao: 0;
  readonly ip: number;
  readonly op: number;
  readonly st: 0;
  readonly bm: 0;
  /** Another layer's `ind`, never an array position — so reversing is safe. */
  readonly parent?: number;
}

/**
 * A layer mask: a closed path in the layer's own space. `mode: "a"` adds
 * (the layer shows only inside it), `x` is expansion, `o` opacity 0-100.
 */
export interface LottieMask {
  readonly nm: string;
  readonly mode: "a";
  readonly inv: false;
  readonly o: LottieScalarProperty;
  readonly x: LottieScalarProperty;
  readonly pt: { readonly a: 0; readonly k: LottieBezier };
}

/** `ty: 4`. Its `shapes` list is drawn bottom-up: geometry first, fill after. */
export interface LottieShapeLayer extends LottieLayerBase {
  readonly ty: 4;
  readonly shapes: ReadonlyArray<LottieShapeItem>;
  /** Only on a text layer whose glyphs reach outside the layout box. */
  readonly hasMask?: true;
  readonly masksProperties?: ReadonlyArray<LottieMask>;
}

/** `ty: 3`. A `group` draws nothing; it exists for its children to parent to. */
export interface LottieNullLayer extends LottieLayerBase {
  readonly ty: 3;
}

/** `ty: 1`, the scene background. `sc` is `#rrggbb`, not a float triple. */
export interface LottieSolidLayer extends LottieLayerBase {
  readonly ty: 1;
  readonly sc: string;
  readonly sw: number;
  readonly sh: number;
}

export type LottieLayer = LottieShapeLayer | LottieNullLayer | LottieSolidLayer;

/**
 * A whole Lottie animation. Defined here because this is the only module that
 * knows the document shape — `lottieGeometry.ts` stops at inert specs.
 *
 * `v` rather than `ver`, and a dotted string rather than a 6-digit integer:
 * design §11.4 records that the community specification documents `ver` as
 * `MMmmpp` while shipped bodymovin files carry `v` as `"5.7.4"`, and directs
 * implementation to prefer what real files use. `@lottie-animation-community/
 * lottie-types@1.3.0` types it `v?: string` with a `5.5.2` default, which is
 * the same reading. **Confirmed in lottie-web 5.13.0 (Task 4): `v` is the
 * only field its own `checkVersion()` ever reads** (five call sites; `ver`
 * is read nowhere in the bundle) — the Marey shape subset never reaches the
 * version-gated branches those calls guard, so a document could not have
 * discriminated by rendering differently, but the source reading is direct.
 */
export interface LottieDoc {
  readonly v: string;
  readonly ddd: 0;
  readonly fr: number;
  readonly ip: number;
  readonly op: number;
  readonly w: number;
  readonly h: number;
  readonly nm: string;
  readonly assets: ReadonlyArray<never>;
  readonly layers: ReadonlyArray<LottieLayer>;
}

/** The scene facts the envelope needs. `background` is `[r, g, b]` in 0–1. */
export interface LottieSceneInfo {
  readonly width: number;
  readonly height: number;
  readonly background: readonly [number, number, number];
  readonly name: string;
}

/**
 * The version string every emitted file carries. Not derived from the repo's
 * own version: it names the *Lottie* feature level the document targets.
 */
const LOTTIE_VERSION = "5.5.2";

/** 0–1 float triple → `#rrggbb`, for a solid layer's `sc` and nothing else. */
function hexOf(rgb: readonly [number, number, number]): string {
  const byte = (v: number): string => {
    // `round`, and clamped: `hexToRgb01` produces exact n/255 values, so this
    // is an identity for every colour the compiler can emit. It exists for
    // the case a future caller hands over a computed colour.
    const n = Math.max(0, Math.min(255, Math.round(v * 255)));
    return n.toString(16).padStart(2, "0");
  };
  return `#${byte(rgb[0])}${byte(rgb[1])}${byte(rgb[2])}`;
}

/**
 * Fitter settings from the player measurements: the last keyframe carries no
 * handles, and a fitted easing may overshoot within the default range.
 */
const FIT_OPTIONS = { finalHandles: false, handleRange: DEFAULT_HANDLE_RANGE } as const;

/**
 * Opacity keeps 0 and 100 exactly (spec §4, "Opacity at its bounds is
 * exact"). Players quantise opacity, and full and zero opacity are what a
 * scene holds longest, so a fitted 99.96 inside the 0.05 tolerance darkens a
 * held layer by a level over its whole area.
 */
const OPACITY_FIT_OPTIONS = { ...FIT_OPTIONS, exactValues: [0, 100] } as const;

/** A static property: the collapsed form of a track that never varies. */
function staticVector(value: ReadonlyArray<number>): LottieVectorProperty {
  return { a: 0, k: value };
}

function staticScalar(value: number): LottieScalarProperty {
  return { a: 0, k: value };
}

/**
 * Turn a per-frame track into either a static property or a keyframe array.
 *
 * **The constant-track collapse (design §7.2).** A 240-frame scene with
 * twenty static objects is 24,000 keyframes, nearly all identical, and
 * legibility is a product property here — roadmap §2 names the niche as
 * "motion graphics as readable, generative source code".
 *
 * "Never varies" is **exact equality against the first frame's value, over
 * every frame**. Not an epsilon (two values differing in the last bit are
 * different values, and a track drifting by one ULP per frame is animating),
 * and not first-versus-last: a bounce, a pulse or a full rotation returns to
 * where it started, and collapsing on the endpoints alone would silently
 * delete the entire motion of every one of them.
 *
 * It is a judgment call in the AGENT-LESSONS §2d sense — the file is correct
 * either way — so `lottieEncode.test.ts` pins both the collapse and the
 * all-frames comparison that decides it.
 */
function track(values: ReadonlyArray<ReadonlyArray<number>>, tolerance: number): LottieVectorProperty {
  const first = values[0];
  const constant = values.every((v) => v.length === first.length && v.every((n, i) => n === first[i]));
  if (constant) return staticVector(first);
  return { a: 1, k: fitKeyframes(values, tolerance, FIT_OPTIONS) };
}

/** The scalar form of {@link track}: a static `k` is a bare number. */
function scalarTrack(
  values: ReadonlyArray<number>,
  tolerance: number,
  options: FitOptions = FIT_OPTIONS,
): LottieScalarProperty {
  const first = values[0];
  if (values.every((v) => v === first)) return staticScalar(first);
  return { a: 1, k: fitKeyframes(values.map((v) => [v]), tolerance, options) };
}

/**
 * Position: combined while it never moves, separated into `x` and `y` as soon
 * as either coordinate does, each axis collapsing and fitting on its own.
 */
function positionTrack(values: ReadonlyArray<ReadonlyArray<number>>): LottieVectorProperty | LottieSplitPosition {
  const x = scalarTrack(values.map((v) => v[0]), LOTTIE_FIT_TOLERANCE.position);
  const y = scalarTrack(values.map((v) => v[1]), LOTTIE_FIT_TOLERANCE.position);
  if (x.a === 0 && y.a === 0) return staticVector([x.k, y.k]);
  return { s: true, x, y };
}

/**
 * The opacity asymmetry — design §5, and the decision most likely to be
 * "simplified" away by someone who does not know why it is there.
 *
 * PixiJS multiplies a container's `alpha` into its children and `visible:
 * false` hides a whole subtree. Lottie parenting, inheriting After Effects'
 * model, propagates **only the transform**. So a Marey `group { alpha: 0.5 }`
 * around three shapes renders at 0.5 in Marey and 1.0 in Lottie, in a file
 * that parses without complaint.
 *
 * The resolution is deliberately asymmetric and must stay that way:
 * **transforms stay parented, opacity flattens.** Composing a transform down
 * the tree is what parenting exists to avoid — rotation with non-uniform
 * scale produces a shear, expressible only through `sk`/`sa`, whose
 * decomposition varies between players. Composing a scalar is associative,
 * exact, and loses nothing.
 *
 * `visible` folds into the same product because Lottie has no per-frame
 * visibility flag at all: `ip`/`op` are per-layer, so they cannot express
 * "hidden for frames 40–70". Baking a cull as opacity 0 is visually identical
 * and is the only encoding the format offers.
 */
function composedOpacity(
  chain: ReadonlyArray<string>,
  snapshotFor: (id: string) => ObjectSnapshot,
): number {
  let product = 1;
  for (const id of chain) {
    const snap = snapshotFor(id);
    product *= snap.visible ? snap.alpha : 0;
  }
  return product;
}

/**
 * A layer's id followed by every ancestor's, outermost last.
 *
 * Built once per layer rather than walked per frame, which is also what makes
 * the two link failures loud in one place: a `parentId` that names no layer,
 * and a parent cycle. Neither is reachable through `planLottie` — it assigns
 * `parentId` from the enclosing node during a depth-first walk, and returns
 * no layers at all when it has any diagnostic — but a cycle reached here
 * would *hang* rather than throw, and `lottie §layers` forbids reference
 * cycles outright.
 */
function ancestorChain(spec: LayerSpec, byId: ReadonlyMap<string, LayerSpec>): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: LayerSpec = spec;
  for (;;) {
    if (seen.has(current.id)) {
      throw new Error(
        `[export] Lottie layer '${spec.id}' has a parent cycle through '${current.id}', so its composed opacity has no fixed point. Lottie forbids reference cycles between layers.`,
      );
    }
    seen.add(current.id);
    chain.push(current.id);
    if (current.parentId === null) return chain;
    const parent = byId.get(current.parentId);
    if (!parent) {
      throw new Error(
        `[export] Lottie layer '${current.id}' names parent '${current.parentId}', which is not a layer in this export. A parent link that resolves to nothing would silently place the child in scene space instead of its group's.`,
      );
    }
    current = parent;
  }
}

/** The drawn items for one spec, geometry first and fill after. */
function shapeItemsFor(shape: LottieShapeSpec, color: LottieColorProperty | null, name: string): LottieShapeItem[] {
  const items: LottieShapeItem[] = [];
  switch (shape.kind) {
    case "circle":
      // `buildNode` draws `.circle(radius, radius, radius)` (builder.ts:215),
      // so the centre is at (r, r) in local space and Lottie's `el` `p` — the
      // ellipse's centre — must say so. `[0, 0]` offsets it by one radius on
      // both axes and still parses (design §4.2).
      items.push({
        ty: "el", nm: name,
        p: staticVector([shape.radius, shape.radius]),
        s: staticVector([shape.radius * 2, shape.radius * 2]),
      });
      break;
    case "rectangle":
      // `.rect(0, 0, w, h)` (builder.ts:230) puts the TOP-LEFT at the local
      // origin; `rc` `p` is the centre.
      items.push({
        ty: "rc", nm: name,
        p: staticVector([shape.width / 2, shape.height / 2]),
        s: staticVector([shape.width, shape.height]),
        r: staticScalar(0),
      });
      break;
    case "polygon": {
      // Bezier `i`/`o` are relative to their OWN vertex (design §3), so a
      // straight-edged polygon's tangents are all [0, 0]. Repeating the
      // vertex there — the absolute misreading — curves every edge.
      const v = shape.points.map((p) => [p.x, p.y]);
      const zeros = v.map(() => [0, 0]);
      items.push({ ty: "sh", nm: name, ks: { a: 0, k: { i: zeros, o: zeros, v, c: true } } });
      break;
    }
    case "line": {
      // An open path (c: false) with straight edges — pixi's `.poly(points,
      // false)`. Bezier tangents are all [0, 0], same reasoning as polygon.
      const v = shape.points.map((p) => [p.x, p.y]);
      const zeros = v.map(() => [0, 0]);
      items.push({ ty: "sh", nm: name, ks: { a: 0, k: { i: zeros, o: zeros, v, c: false } } });
      break;
    }
    case "text": {
      // Spec §6.4: one CLOSED path per glyph contour, in text-local pixels
      // (`textOutline.ts` already produced Lottie-shaped `v`/`i`/`o`, with
      // tangents relative to their own vertex), and one fill for all of
      // them, pushed by the shared fill branch below. Copied rather than
      // aliased, so the document owns plain arrays.
      const copy = (points: ReadonlyArray<readonly [number, number]>) => points.map((p) => [p[0], p[1]]);
      for (const contour of shape.contours) {
        items.push({
          ty: "sh",
          nm: name,
          ks: { a: 0, k: { i: copy(contour.i), o: copy(contour.o), v: copy(contour.v), c: true } },
        });
      }
      break;
    }
    case "group":
      // Unreachable: the caller emits a null layer for a group and never asks
      // for its shape items.
      throw new Error(`[export] shapeItemsFor was called for group '${name}', which draws nothing.`);
  }
  if (shape.kind === "line" && color !== null) {
    // A line gets a STROKE, never a fill — an open path has no interior to
    // fill. AFTER the path, for the same backward-`searchShapes` reason the
    // fill below is (see that branch's comment for the citation): a stroke
    // placed before its path paints nothing.
    //
    // pixi.js 8.16.0 `GraphicsContext.defaultStrokeStyle`: alignment 0.5
    // (centred, which is the only alignment a Lottie stroke has — Lottie's
    // `st` has no alignment concept at all), cap "butt" (lc 1), join "miter"
    // (lj 1, the default), miterLimit 10 (ml). Whether pixi's miterLimit and
    // Lottie's `ml` mean the same ratio was measured, not assumed — see
    // design §3.4 and this task's report/evidence for the three lottie-web
    // measurements (miter, non-uniform scale, caps).
    items.push({
      ty: "st",
      nm: `${name} stroke`,
      c: color,
      o: staticScalar(100),
      w: staticScalar(shape.thickness),
      lc: 1,
      lj: 1,
      ml: 10,
    });
  } else if (color !== null) {
    // AFTER the geometry, not before. lottie-web's `searchShapes` walks the
    // item list backwards, collecting styles and applying them to items at
    // LOWER indices — so a fill placed first paints nothing at all and the
    // shape vanishes. `SVGShapeElement` and `CVShapeElement` each implement
    // `searchShapes` separately (not via a shared mixin) but with the same
    // backward-iteration ordering; every browser measurement in this phase
    // used the canvas renderer (`tools/visual-check/lottie-check.mjs`
    // configures `renderer: "canvas"`), so the renderer that actually matters
    // here is `elements/canvasElements/CVShapeElement.js:186`, the backward
    // loop inside `CVShapeElement.prototype.searchShapes` (`.js:175`).
    //
    // `r: 1` is nonzero winding, the rule canvas `fill()` and pixi's text
    // rasterizer use. For circle/rectangle/polygon a single simple path
    // makes the rule moot, but for `text` it is load-bearing: a glyph's
    // counters and overlapping contours are separate `sh` items under this
    // one fill, and Task 6 Q4 found 19 of 100 JetBrains Mono glyphs (`a`,
    // `e`, `8` among them) render differently under even-odd (`r: 2`).
    items.push({ ty: "fl", nm: `${name} fill`, c: color, o: staticScalar(100), r: 1 });
  }
  return items;
}

/** C's `%.2f`, which rounds an exact binary tie to even where `toFixed` rounds it up. */
function cFixed2(v: number): string {
  const negative = v < 0 || Object.is(v, -0);
  const a = Math.abs(v);
  // An exact binary tie is an odd multiple of 1/8; everything else rounds the same way in both.
  if (Number.isInteger(a * 8) && (a * 8) % 2 === 1) {
    const lo = Math.floor(a * 100);
    const even = lo % 2 === 0 ? lo : lo + 1;
    return `${negative ? "-" : ""}${Math.floor(even / 100)}.${String(even % 100).padStart(2, "0")}`;
  }
  return (negative && !a.toFixed(2).startsWith("-") ? "-" : "") + a.toFixed(2);
}

/**
 * The cache key dotlottie-web's ThorVG gives a keyframe that has no `n`:
 * `"%.2f_%.2f_%.2f_%.2f"` of `i.x, i.y, o.x, o.y` (the first element of each
 * handle), cut to the 19 characters its 20-byte buffer holds. Exported for the
 * test that models the cache.
 */
export function thorvgEasingKey(kf: LottieKeyframe): string {
  const i = kf.i!;
  const o = kf.o!;
  return `${cFixed2(i.x[0])}_${cFixed2(i.y[0])}_${cFixed2(o.x[0])}_${cFixed2(o.y[0])}`.slice(0, 19);
}

/**
 * A short name derived from the keyframe's exact handle values: "e" and 16 hex
 * digits of two FNV-1a hashes of the full-precision tuple, 17 characters.
 * ThorVG compares easing names over their first 20 characters, so a longer
 * name (lottie-web's own default key is about 70) would make every name equal.
 */
export function easingName(kf: LottieKeyframe): string {
  const text = `${kf.i!.x[0]}_${kf.i!.y[0]}_${kf.o!.x[0]}_${kf.o!.y[0]}`;
  const fnv = (seed: number): string => {
    let h = seed;
    for (let c = 0; c < text.length; c++) h = Math.imul(h ^ text.charCodeAt(c), 16777619);
    return (h >>> 0).toString(16).padStart(8, "0");
  };
  return `e${fnv(2166136261)}${fnv(0x9747b28c)}`;
}

/** The exact handle tuple, at full precision. */
function easingTuple(kf: LottieKeyframe): string {
  return `${kf.i!.x[0]}_${kf.i!.y[0]}_${kf.o!.x[0]}_${kf.o!.y[0]}`;
}

/**
 * dotlottie-web's ThorVG caches the easing curve it builds for a keyframe
 * under a key rounded to two decimals, and every later keyframe with the same
 * key reuses the first curve. Fitted handles are full-precision, so distinct
 * curves can share a key and be drawn up to a pixel off (spec §4, "Correction,
 * 2026-11-13: dotlottie-web's easing cache"). A keyframe whose key is shared
 * with a different handle tuple anywhere in the document gets an `n`; ThorVG
 * then keys on the name instead.
 *
 * The name is derived from the values, never from a counter: lottie-web keeps
 * its curve cache per page and keys it by `n` on its spatial path, so a counter
 * would make two Marey files on one page share curves. It is short because
 * ThorVG compares names over 20 characters.
 */
export function nameCollidingEasings<T>(root: T): T {
  const tuplesByKey = new Map<string, Set<string>>();
  const visit = (node: unknown, fn: (kf: LottieKeyframe) => void): void => {
    if (Array.isArray(node)) {
      for (const v of node) visit(v, fn);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    if (rec.a === 1 && Array.isArray(rec.k)) {
      for (const kf of rec.k as LottieKeyframe[]) if (kf.i && kf.o) fn(kf);
      return;
    }
    for (const v of Object.values(rec)) visit(v, fn);
  };
  visit(root, (kf) => {
    const key = thorvgEasingKey(kf);
    const set = tuplesByKey.get(key) ?? new Set<string>();
    set.add(easingTuple(kf));
    tuplesByKey.set(key, set);
  });
  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (node === null || typeof node !== "object") return node;
    const rec = node as Record<string, unknown>;
    if (rec.a === 1 && Array.isArray(rec.k)) {
      return {
        ...rec,
        k: (rec.k as LottieKeyframe[]).map((kf) =>
          kf.i && kf.o && tuplesByKey.get(thorvgEasingKey(kf))!.size > 1
            ? { ...kf, n: easingName(kf) }
            : kf,
        ),
      };
    }
    return Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, rewrite(v)]));
  };
  return rewrite(root) as T;
}

/**
 * Encode a planned scene's layer specs and sampled frames into one Lottie
 * document.
 *
 * `layers` is in IR order, which is already paint order — `typeChecker/
 * builder.ts` sorts children by `layer` ascending with a stable tiebreak and
 * nothing after it re-sorts. `frames` is one snapshot per output frame, and
 * `plan` supplies exactly two things: `fps` → `fr` and `frameCount` → `op`.
 *
 * **Invariant violations throw rather than degrade**, following the precedent
 * Phase 4 set when it made `pngSequence.ts`'s silent optional call throw: a
 * spec with no matching snapshot in some frame, a `parentId` naming no layer
 * in the array, and (see {@link ancestorChain}) a parent cycle. None is
 * reachable through `planLottie` + `sampleFrames` today — `planLottie` emits
 * a spec per built IR node and `snapshotFor` emits a snapshot per built
 * container, and `planLottie` returns no layers at all when it has any
 * diagnostic — but all three are reachable at this function's own boundary,
 * and each would otherwise be silent or worse: an object frozen where it was
 * built, a child drawn in scene space instead of its group's, or a hang.
 */
export function encodeLottie(
  layers: ReadonlyArray<LayerSpec>,
  frames: ReadonlyArray<FrameSnapshot>,
  plan: SamplerPlan,
  scene: LottieSceneInfo,
): LottieDoc {
  const byId = new Map<string, LayerSpec>(layers.map((l) => [l.id, l]));

  // Resolved once, before any track is built: a parent link that resolves to
  // nothing is a property of the spec array, not of any one frame, and
  // reporting it per frame would bury it under `frameCount` copies.
  const chains = new Map<string, ReadonlyArray<string>>(
    layers.map((spec) => [spec.id, ancestorChain(spec, byId)]),
  );

  const snapshotsPerFrame = frames.map(
    (f) => new Map<string, ObjectSnapshot>(f.objects.map((o) => [o.id, o])),
  );

  const snapshotFor = (id: string, frameIndex: number): ObjectSnapshot => {
    const snap = snapshotsPerFrame[frameIndex].get(id);
    if (!snap) {
      throw new Error(
        `[export] Frame ${frameIndex} has no snapshot for object '${id}', which the Lottie layer specs require. The specs and the frames came from different compilations.`,
      );
    }
    return snap;
  };

  // `ind` is assigned in spec order and is an identifier, not a position, so
  // the reversal below leaves every `parent` link pointing at the same layer.
  const indOf = new Map<string, number>(layers.map((l, i) => [l.id, i + 1]));

  const encoded: LottieLayer[] = layers.map((spec): LottieLayer => {
    const positions: number[][] = [];
    const scales: number[][] = [];
    const rotations: number[] = [];
    const opacities: number[] = [];
    const colors: number[][] = [];

    for (let f = 0; f < frames.length; f++) {
      const snap = snapshotFor(spec.id, f);
      positions.push([snap.x, snap.y]);
      // Percent, not a multiplier: `100` is identity in Lottie (design §3).
      scales.push([snap.scaleX * 100, snap.scaleY * 100]);
      // Degrees clockwise, from the snapshot's radians. Note the snapshot and
      // the IR disagree — `IRVisualBase.rotation` is in degrees and
      // `applyAnchorAndPivot` converts at `builder.ts:121` — and the snapshot
      // is what this module sees.
      rotations.push((snap.rotation * 180) / Math.PI);
      // 0–100, from the flattened ancestor product of `visible ? alpha : 0`.
      opacities.push(composedOpacity(chains.get(spec.id)!, (id) => snapshotFor(id, f)) * 100);
      if (spec.color !== null) {
        if (snap.color === null) {
          throw new Error(
            `[export] Frame ${f} carries no colour for object '${spec.id}', which the Lottie layer spec draws. The specs and the frames came from different compilations.`,
          );
        }
        colors.push([...rgb01OfInt(snap.color)]);
      }
    }

    const base = {
      ddd: 0 as const,
      ind: indOf.get(spec.id)!,
      nm: spec.name,
      sr: 1 as const,
      ks: {
        // The anchor is the point in layer-local space that `p` places, which
        // is exactly what a Marey pivot is — so this is a copy, not a
        // computation, and it is never animated.
        a: staticVector([spec.anchor.x, spec.anchor.y]),
        p: positionTrack(positions),
        s: track(scales, LOTTIE_FIT_TOLERANCE.scale),
        r: scalarTrack(rotations, LOTTIE_FIT_TOLERANCE.rotation),
        o: scalarTrack(opacities, LOTTIE_FIT_TOLERANCE.opacity, OPACITY_FIT_OPTIONS),
      },
      ao: 0 as const,
      ip: 0,
      op: plan.frameCount,
      st: 0 as const,
      bm: 0 as const,
      ...(spec.parentId !== null ? { parent: indOf.get(spec.parentId)! } : {}),
    };

    if (spec.shape.kind === "group") {
      return { ...base, ty: 3 };
    }
    const shapes = shapeItemsFor(spec.shape, spec.color === null ? null : track(colors, LOTTIE_FIT_TOLERANCE.color), spec.name);
    if (spec.shape.kind === "text" && spec.shape.clip) {
      // pixi's texture box (see `lottieGeometry.ts`'s `textClip`): the
      // preview cuts off ink outside it, so the Lottie does too. In layer
      // space, the same space as the glyph contours and the anchor.
      const { width: w, height: h } = spec.shape.clip;
      const zeros = [[0, 0], [0, 0], [0, 0], [0, 0]];
      const box: LottieMask = {
        nm: "layout box",
        mode: "a",
        inv: false,
        o: staticScalar(100),
        x: staticScalar(0),
        pt: { a: 0, k: { v: [[0, 0], [w, 0], [w, h], [0, h]], i: zeros, o: zeros, c: true } },
      };
      return { ...base, ty: 4, shapes, hasMask: true, masksProperties: [box] };
    }
    return { ...base, ty: 4, shapes };
  });

  /**
   * Lottie's animation object has no normative background-colour field, so a
   * scene `background` becomes a solid layer sized to the scene (design
   * §6.2). Without it the artifact renders on transparency while Marey's PNG
   * renders on the scene colour, and every pixel comparison would be
   * measuring the background rather than the motion.
   */
  const background: LottieSolidLayer = {
    ddd: 0,
    ind: layers.length + 1,
    ty: 1,
    nm: "background",
    sr: 1,
    ks: {
      a: staticVector([0, 0]),
      p: staticVector([0, 0]),
      s: staticVector([100, 100]),
      r: staticScalar(0),
      o: staticScalar(100),
    },
    ao: 0,
    sc: hexOf(scene.background),
    sw: scene.width,
    sh: scene.height,
    ip: 0,
    op: plan.frameCount,
    st: 0,
    bm: 0,
  };

  // Reversed: Lottie draws array-earlier layers ABOVE later ones, the
  // opposite of PixiJS child order, so the array is the reverse of traversal
  // order and the background — the bottom of the stack — is last. Design
  // §11.1 records that the published specification did not settle the
  // stacking direction; Task 4 confirmed it in a real player (design §11's
  // 2026-09-12 dated correction) — array-earlier draws above, as assumed.
  return Object.freeze({
    v: LOTTIE_VERSION,
    ddd: 0,
    fr: plan.fps,
    ip: 0,
    op: plan.frameCount,
    w: scene.width,
    h: scene.height,
    nm: scene.name,
    assets: Object.freeze([]),
    layers: Object.freeze(nameCollidingEasings([...encoded].reverse().concat(background))),
  });
}
