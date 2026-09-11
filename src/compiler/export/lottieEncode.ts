import type { LayerSpec, LottieShapeSpec } from "./lottieGeometry";
import type { FrameSnapshot, ObjectSnapshot } from "../renderer/frameSampler";
import type { SamplerPlan } from "./exportContract";

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
 * **Three choices here rest on a design §11 item the published specification
 * did not settle, and Task 4 resolves them in a real player:**
 *
 * 1. **§11.1 — stacking order.** {@link encodeLottie} reverses the layer
 *    array because the design assumes array-earlier layers draw *above* later
 *    ones (§6.1). A browser must confirm that with an overlapping fixture.
 * 2. **§11.2 — whether parenting propagates opacity.** {@link composedOpacity}
 *    flattens the ancestor product on the assumption that it does *not*. If
 *    lottie-web propagates it, every nested alpha double-applies.
 * 3. **§11.5 — whether `op` is inclusive or exclusive.** `op = frameCount`
 *    for frames indexed `0 … frameCount − 1`.
 *
 * Two §11 items *are* settled here, by reading the sources rather than
 * assuming: §11.3's shape-list field is `shapes` (the published layers page),
 * and §11.6's easing handles must be present and explicit — see
 * {@link LINEAR_IN}.
 */

/** A keyframe's easing handle: one component per value component, or one for all. */
export interface LottieBezierHandle {
  readonly x: ReadonlyArray<number>;
  readonly y: ReadonlyArray<number>;
}

/**
 * Linear interpolation, written out rather than omitted.
 *
 * Design §11.6 left open what a player does when `i`/`o` are absent.
 * **Measured against lottie-web 5.13.0 rather than assumed:**
 * `interpolateValue` reads `keyData.o.x.constructor`
 * (`player/js/utils/PropertyFactory.js:146`) with no guard whenever the
 * requested frame falls strictly between two keyframes, so omitting the
 * handles is a `TypeError` at the first sub-frame sample, not a default. A
 * 60Hz display showing a 30fps export samples sub-frame constantly, so this
 * is the common case, not the corner.
 *
 * `(0, 0)` → `(1, 1)` is the identity cubic. `BezierEaser.js:98` short-circuits
 * it — `if (mX1 === mY1 && mX2 === mY2) return x; // linear` — so this is
 * exactly linear rather than approximately so, which matters because design
 * §7.1 chose linear over hold precisely for sub-frame sampling.
 */
const LINEAR_OUT: LottieBezierHandle = { x: [0], y: [0] };
const LINEAR_IN: LottieBezierHandle = { x: [1], y: [1] };

/**
 * One keyframe. `s` is an array even for a scalar property (design §3), and
 * `t` is the output-frame index directly — the sampler emits one frame per
 * output frame and `fr` equals its `fps`, so there is no time conversion and
 * no rounding to get wrong (§7.1).
 */
export interface LottieKeyframe {
  readonly t: number;
  readonly s: ReadonlyArray<number>;
  readonly i: LottieBezierHandle;
  readonly o: LottieBezierHandle;
}

/** An animatable scalar: `{a: 0, k: value}` static, `{a: 1, k: [...]}` animated. */
export type LottieScalarProperty =
  | { readonly a: 0; readonly k: number }
  | { readonly a: 1; readonly k: ReadonlyArray<LottieKeyframe> };

/** An animatable vector, same two shapes with an array-valued static case. */
export type LottieVectorProperty =
  | { readonly a: 0; readonly k: ReadonlyArray<number> }
  | { readonly a: 1; readonly k: ReadonlyArray<LottieKeyframe> };

/** A colour is a static `[r, g, b]` in 0–1 — Marey has no colour animation. */
export interface LottieColorProperty {
  readonly a: 0;
  readonly k: ReadonlyArray<number>;
}

/** A layer transform. `r` is degrees clockwise, `s` percent, `o` 0–100. */
export interface LottieTransform {
  readonly a: LottieVectorProperty;
  readonly p: LottieVectorProperty;
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
  | { readonly ty: "fl"; readonly nm: string; readonly c: LottieColorProperty; readonly o: LottieScalarProperty; readonly r: 1 };

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

/** `ty: 4`. Its `shapes` list is drawn bottom-up: geometry first, fill after. */
export interface LottieShapeLayer extends LottieLayerBase {
  readonly ty: 4;
  readonly shapes: ReadonlyArray<LottieShapeItem>;
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
 * the same reading. A browser must confirm it (Task 4).
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
function track(values: ReadonlyArray<ReadonlyArray<number>>): LottieVectorProperty {
  const first = values[0];
  const constant = values.every((v) => v.length === first.length && v.every((n, i) => n === first[i]));
  if (constant) return staticVector(first);
  return {
    a: 1,
    k: values.map((s, t) => ({ t, s, i: LINEAR_IN, o: LINEAR_OUT })),
  };
}

/** The scalar form of {@link track}: a static `k` is a bare number. */
function scalarTrack(values: ReadonlyArray<number>): LottieScalarProperty {
  const first = values[0];
  if (values.every((v) => v === first)) return staticScalar(first);
  return {
    a: 1,
    k: values.map((v, t) => ({ t, s: [v], i: LINEAR_IN, o: LINEAR_OUT })),
  };
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
function shapeItemsFor(shape: LottieShapeSpec, color: LayerSpec["color"], name: string): LottieShapeItem[] {
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
    case "group":
      // Unreachable: the caller emits a null layer for a group and never asks
      // for its shape items.
      throw new Error(`[export] shapeItemsFor was called for group '${name}', which draws nothing.`);
  }
  if (color !== null) {
    // AFTER the geometry, not before. lottie-web's `searchShapes` walks the
    // item list backwards (`elements/svgElements/SVGShapeElement.js:247`),
    // collecting styles and applying them to items at LOWER indices — so a
    // fill placed first paints nothing at all and the shape vanishes.
    items.push({ ty: "fl", nm: `${name} fill`, c: { a: 0, k: [...color] }, o: staticScalar(100), r: 1 });
  }
  return items;
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
        p: track(positions),
        s: track(scales),
        r: scalarTrack(rotations),
        o: scalarTrack(opacities),
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
    return { ...base, ty: 4, shapes: shapeItemsFor(spec.shape, spec.color, spec.name) };
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
  // §11.1 records that the published specification does not settle the
  // stacking direction; Task 4 confirms it in a real player.
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
    layers: Object.freeze([...encoded].reverse().concat(background)),
  });
}
