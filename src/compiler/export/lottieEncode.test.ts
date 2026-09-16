import { describe, it, expect } from "vitest";
import { encodeLottie, type LottieDoc } from "./lottieEncode";
import { planExport, type SamplerPlan } from "./exportContract";
import type { LayerSpec } from "./lottieGeometry";
import type { FrameSnapshot, ObjectSnapshot } from "../renderer/frameSampler";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import { TICK_HZ } from "../sceneIR";

/**
 * The whole point of the two-module split (design §2.2): every input below is
 * hand-built inert data. No compiler, no renderer, no PixiJS — except for the
 * one `planFor` call, because `SamplerPlan` is branded
 * (`exportContract.ts:42-50`) and deliberately cannot be written by hand.
 */
const SCENE = { width: 100, height: 50, background: [0, 0, 0] as const, name: "t" };

/**
 * A validated plan yielding exactly `frames` frames at `fps`.
 *
 * The duration is derived from `TICK_HZ`, never hardcoded (Global Constraint
 * 6): `frames × ticksPerFrame` ticks is `frames × (TICK_HZ / fps) / TICK_HZ`
 * seconds. The `frameCount` assertion below is what makes a wrong duration
 * fail loudly here rather than silently handing the tests a plan of a
 * different length.
 */
function planFor(frames: number, fps: number): SamplerPlan {
  const seconds = (frames * (TICK_HZ / fps)) / TICK_HZ;
  const source = `scene { size: (100, 50) duration: ${seconds} circle c { position: (0,0), radius: 1 } }`;
  const { ast } = parse(lex(source));
  const { ir, errors } = typeCheck(ast!);
  if (!ir) throw new Error(`planFor fixture did not compile: ${errors.map((e) => e.message).join("; ")}`);
  const result = planExport(ir, { fps });
  if (!result.ok) throw new Error(`planFor(${frames}, ${fps}): ${result.diagnostics.map((d) => d.code).join(",")}`);
  if (result.plan.frameCount !== frames) {
    throw new Error(`planFor(${frames}, ${fps}) planned ${result.plan.frameCount} frames, not ${frames}`);
  }
  return result.plan;
}

const circle = (id: string, parentId: string | null = null): LayerSpec => ({
  id,
  name: id.split(".").pop()!,
  shape: { kind: "circle", radius: 5 },
  anchor: { x: 5, y: 5 },
  color: [1, 0, 0],
  parentId,
});

const snap = (id: string, over: Partial<ObjectSnapshot> = {}): ObjectSnapshot => ({
  id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, alpha: 1, visible: true, ...over,
});

/**
 * `tick` is a label the encoder never reads — keyframe `t` values are the
 * frame indices directly (design §7.1) — but it is part of `FrameSnapshot`,
 * so it is filled with the value `sampleFrames` would write at 30fps rather
 * than left as a meaningless constant.
 */
const framesOf = (...objs: ObjectSnapshot[][]): FrameSnapshot[] =>
  objs.map((objects, index) => ({ index, tick: index * (TICK_HZ / 30), objects }));

/**
 * Layers are a discriminated union on `ty`, and every assertion below reaches
 * through `ks` into a property whose `k` is itself a union of "static value"
 * and "keyframe array". Narrowing each one at every use would bury the
 * assertions, so the lookup is typed loose in exactly one place.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const layerNamed = (doc: LottieDoc, nm: string): any =>
  (doc.layers as ReadonlyArray<{ nm: string }>).find((l) => l.nm === nm)!;

describe("encodeLottie · units", () => {
  it("writes rotation in degrees, scale in percent and opacity in 0-100", () => {
    const plan = planFor(2, 30);
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf(
        [snap("scene.c")],
        [snap("scene.c", { rotation: Math.PI / 2, scaleX: 2, scaleY: 0.5, alpha: 0.25 })],
      ),
      plan, SCENE,
    );
    const layer = layerNamed(doc, "c");
    // Exact, not toBeCloseTo: this is the same computation the encoder does,
    // so if it is not exact that is a finding, not a tolerance to widen.
    // Verified independently before this test was written:
    // (Math.PI / 2) * 180 / Math.PI === 90 exactly, 0.25 * 100 === 25
    // exactly, and 2 / 0.5 × 100 are 200 / 50 exactly.
    expect(layer.ks.r.k[1].s[0]).toBe(90);
    expect(layer.ks.s.k[1].s).toEqual([200, 50]);
    expect(layer.ks.o.k[1].s[0]).toBe(25);
  });

  it("writes the identity transform as 0 degrees, 100 percent and 100 opacity", () => {
    // Guards the other direction of each conversion: an encoder that emitted
    // radians would still write 0 for an unrotated object, and one that
    // emitted a multiplier would still write 1 — the test above only sees the
    // varying frame. Frame 0 is the scene as authored.
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf(
        [snap("scene.c")],
        [snap("scene.c", { rotation: Math.PI / 2, scaleX: 2, scaleY: 0.5, alpha: 0.25 })],
      ),
      planFor(2, 30), SCENE,
    );
    const layer = layerNamed(doc, "c");
    expect(layer.ks.r.k[0].s[0]).toBe(0);
    expect(layer.ks.s.k[0].s).toEqual([100, 100]);
    expect(layer.ks.o.k[0].s[0]).toBe(100);
  });
});

describe("encodeLottie · the opacity asymmetry", () => {
  it("multiplies a group's alpha into its child but does not compose transforms", () => {
    const doc = encodeLottie(
      [circle("scene.g"), circle("scene.g.inner", "scene.g")],
      framesOf([
        snap("scene.g", { alpha: 0.5, x: 10 }),
        snap("scene.g.inner", { alpha: 0.5, x: 3 }),
      ]),
      planFor(1, 30), SCENE,
    );
    const inner = layerNamed(doc, "inner");
    // 0.5 * 0.5 = 0.25 -> 25. Lottie parenting does NOT propagate opacity
    // (design §5; §11.2 was open on this until Task 4 confirmed it in
    // lottie-web 5.13.0 — a nested-alpha fixture read 25%, not the 12.5% a
    // double-application would produce), so without this flattening the
    // child renders at 50% instead of 25%.
    expect(inner.ks.o.k).toBe(25);          // static: one frame, constant
    // The transform is NOT composed: 3, not 13.
    expect(inner.ks.p.k).toEqual([3, 0]);
  });

  it("composes alpha through two levels of ancestry, not just the immediate parent", () => {
    // "itself and every ancestor" (design §5). A single-level product would
    // pass the test above and silently drop the grandparent here.
    const doc = encodeLottie(
      [circle("scene.g"), circle("scene.g.m", "scene.g"), circle("scene.g.m.leaf", "scene.g.m")],
      framesOf([
        snap("scene.g", { alpha: 0.5 }),
        snap("scene.g.m", { alpha: 0.5 }),
        snap("scene.g.m.leaf", { alpha: 0.5 }),
      ]),
      planFor(1, 30), SCENE,
    );
    expect(layerNamed(doc, "leaf").ks.o.k).toBe(12.5);
  });

  it("keeps a child's own transform parented rather than flattened", () => {
    // The `parent` link is the other half of the asymmetry: transforms go
    // through Lottie's parenting mechanism unchanged. Without the link the
    // `p.k = [3, 0]` above would place the child at scene (3, 0) instead of
    // group-local (3, 0).
    const doc = encodeLottie(
      [circle("scene.g"), circle("scene.g.inner", "scene.g")],
      framesOf([snap("scene.g"), snap("scene.g.inner")]),
      planFor(1, 30), SCENE,
    );
    const g = layerNamed(doc, "g");
    const inner = layerNamed(doc, "inner");
    expect(inner.parent).toBe(g.ind);
    expect(g.parent).toBeUndefined();
  });

  it("bakes an invisible object as opacity 0", () => {
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf([snap("scene.c")], [snap("scene.c", { visible: false })]),
      planFor(2, 30), SCENE,
    );
    expect(layerNamed(doc, "c").ks.o.k[1].s[0]).toBe(0);
  });

  it("bakes an invisible ANCESTOR as opacity 0 on its child", () => {
    // `visible: false` hides a whole subtree in PixiJS. Lottie has no
    // per-frame visibility flag at all (design §5), so the only encoding is
    // the ancestor product — and a `visible` check applied to the layer's own
    // snapshot only would leave the child fully opaque here.
    const doc = encodeLottie(
      [circle("scene.g"), circle("scene.g.inner", "scene.g")],
      framesOf(
        [snap("scene.g"), snap("scene.g.inner")],
        [snap("scene.g", { visible: false }), snap("scene.g.inner")],
      ),
      planFor(2, 30), SCENE,
    );
    expect(layerNamed(doc, "inner").ks.o.k[1].s[0]).toBe(0);
  });
});

describe("encodeLottie · constant-track collapse", () => {
  it("emits a static property for a track that never varies", () => {
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf([snap("scene.c", { x: 7 })], [snap("scene.c", { x: 7 })]),
      planFor(2, 30), SCENE,
    );
    const p = layerNamed(doc, "c").ks.p;
    expect(p.a).toBe(0);
    expect(p.k).toEqual([7, 0]);
  });

  it("emits keyframes for a track that varies by even one frame", () => {
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf([snap("scene.c", { x: 7 })], [snap("scene.c", { x: 8 })]),
      planFor(2, 30), SCENE,
    );
    const p = layerNamed(doc, "c").ks.p;
    expect(p.a).toBe(1);
    expect(p.k.map((kf: { t: number }) => kf.t)).toEqual([0, 1]);
  });

  it("does not collapse a track whose first and last frames agree but whose middle does not", () => {
    // Design §7.2: "never varies" is exact equality against the first frame's
    // value, over EVERY frame. Comparing only the first and last frames is the
    // cheap wrong implementation, and it silently deletes the entire motion of
    // anything that returns to where it started — a bounce, a pulse, a full
    // rotation. The two-frame fixtures above cannot tell the two apart.
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf(
        [snap("scene.c", { x: 7 })],
        [snap("scene.c", { x: 99 })],
        [snap("scene.c", { x: 7 })],
      ),
      planFor(3, 30), SCENE,
    );
    const p = layerNamed(doc, "c").ks.p;
    expect(p.a).toBe(1);
    expect(p.k.map((kf: { t: number }) => kf.t)).toEqual([0, 1, 2]);
    expect(p.k.map((kf: { s: number[] }) => kf.s[0])).toEqual([7, 99, 7]);
  });

  it("does not collapse a SCALAR track whose first and last frames agree but whose middle does not", () => {
    // The test above only covers `p`/`s`. `r` and `o` are scalars and go
    // through a separate code path, and the Step 4 delete-and-run check
    // measured the gap directly: collapsing the scalar path on first-vs-last
    // left all 810 tests green. A full rotation, a pulse, or a fade out and
    // back is exactly the motion that would then vanish into a static value.
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf(
        [snap("scene.c", { rotation: 0, alpha: 1 })],
        [snap("scene.c", { rotation: Math.PI / 2, alpha: 0.5 })],
        [snap("scene.c", { rotation: 0, alpha: 1 })],
      ),
      planFor(3, 30), SCENE,
    );
    const ks = layerNamed(doc, "c").ks;
    expect(ks.r.a).toBe(1);
    expect(ks.r.k.map((kf: { s: number[] }) => kf.s[0])).toEqual([0, 90, 0]);
    expect(ks.o.a).toBe(1);
    expect(ks.o.k.map((kf: { s: number[] }) => kf.s[0])).toEqual([100, 50, 100]);
  });

  it("collapses each track independently", () => {
    // A layer that moves but never rotates must still get a static `r`, and
    // an all-or-nothing collapse (one flag for the whole transform) would
    // emit three identical keyframes for every one of them.
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf([snap("scene.c", { x: 1 })], [snap("scene.c", { x: 2 })]),
      planFor(2, 30), SCENE,
    );
    const ks = layerNamed(doc, "c").ks;
    expect(ks.p.a).toBe(1);
    expect(ks.r.a).toBe(0);
    expect(ks.s.a).toBe(0);
    expect(ks.o.a).toBe(0);
  });

  it("gives every keyframe explicit linear easing handles", () => {
    // Design §11.6 was open on what a player does when `i`/`o` are absent,
    // until Task 4 measured lottie-web 5.13.0 directly: omitting the handles
    // throws no exception and fires no 'error' event, at integer frames as
    // well as sub-frame ones -- the position property is simply never
    // evaluated, so it keeps lottie-web's own uninitialised sentinel value
    // and the layer draws off-canvas. (0,0)/(1,1) hits `BezierEaser.js:98`'s
    // `mX1 === mY1 && mX2 === mY2` linear fast path exactly, confirmed at a
    // discriminating sample (design §11's dated correction).
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf([snap("scene.c", { x: 1 })], [snap("scene.c", { x: 2 })]),
      planFor(2, 30), SCENE,
    );
    for (const kf of layerNamed(doc, "c").ks.p.k) {
      expect(kf.o).toEqual({ x: [0], y: [0] });
      expect(kf.i).toEqual({ x: [1], y: [1] });
    }
  });
});

describe("encodeLottie · the document envelope", () => {
  it("takes fr and op from the plan and w/h/nm from the scene", () => {
    const plan = planFor(2, 30);
    const doc = encodeLottie([circle("scene.c")], framesOf([snap("scene.c")], [snap("scene.c")]), plan, SCENE);
    expect(doc.fr).toBe(30);
    expect(doc.ip).toBe(0);
    expect(doc.op).toBe(2);
    expect(doc.w).toBe(100);
    expect(doc.h).toBe(50);
    expect(doc.nm).toBe("t");
  });

  it("gives every layer an ip/op envelope matching the composition", () => {
    // `ip`/`op` are REQUIRED on a Lottie layer, not optional: a layer whose
    // out point defaulted to 0 would never be drawn at all.
    const doc = encodeLottie([circle("scene.c")], framesOf([snap("scene.c")]), planFor(1, 30), SCENE);
    for (const layer of doc.layers) {
      expect(layer.ip).toBe(0);
      expect(layer.op).toBe(1);
    }
  });

  it("writes the Lottie version as a dotted string under 'v', never an integer under 'ver'", () => {
    // Design §11.4, resolved empirically in Task 4's browser harness
    // (dated correction appended to design §11): lottie-web 5.13.0 reads
    // `animationData.v` directly (its own `checkVersion()`, which expects a
    // dotted string like "5.5.2" to `.split('.')`) and never reads `ver`
    // anywhere in the bundle. A doc carrying only `ver` rendered
    // pixel-identical to one carrying `v` for supported content, precisely
    // because nothing reads it.
    //
    // The gap this test closes is narrower than a field-name swap: `v` is
    // REQUIRED on `LottieDoc`, so replacing it with `ver` is a compile error
    // (`tsc`: "Property 'v' is missing in type ... but required in type
    // 'LottieDoc'", TS2741) and was never the unguarded case. What `tsc` has
    // NO opinion about is the STRING VALUE: `LottieDoc.v` is typed as a bare
    // `string`, so `LOTTIE_VERSION` drifting to the wrong string (e.g. the
    // community spec's `"550502"`, still a string) type-checks cleanly and
    // would have passed every other test in this file — confirmed by mutating
    // exactly that, restoring, and re-confirming green (Task 4 fix round 1's
    // report). That is the AGENT-LESSONS §2d judgment call this test pins.
    const doc = encodeLottie([circle("scene.c")], framesOf([snap("scene.c")]), planFor(1, 30), SCENE);
    expect(doc.v).toBe("5.5.2");
    expect("ver" in doc).toBe(false);
  });
});

describe("encodeLottie · layer order and the background", () => {
  it("puts the background solid at the bottom of the stack, sized to the scene", () => {
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf([snap("scene.c")]),
      planFor(1, 30),
      { ...SCENE, background: [1, 0.5, 0] as const },
    );
    // Design §6.1 reverses the array because array-earlier layers draw ABOVE
    // later ones, so "bottom of the stack" is the LAST entry.
    const bg = doc.layers[doc.layers.length - 1];
    expect(bg.ty).toBe(1);
    if (bg.ty !== 1) throw new Error("unreachable");
    // Solid `sc` is a `#rrggbb` hex string, not the 0-1 float triple every
    // other colour in Lottie uses — the one place the format is inconsistent.
    expect(bg.sc).toBe("#ff8000");
    expect(bg.sw).toBe(100);
    expect(bg.sh).toBe(50);
  });

  it("emits the drawn layers in reverse IR order", () => {
    // Design §6.1: IR child order IS paint order, and Lottie draws
    // array-earlier layers above later ones, so the array is the reverse.
    // §11.1 was open on the stacking direction until Task 4 confirmed it in
    // a real player — this pins the design's choice so that a browser
    // finding contradicting it would have been a deliberate edit here rather
    // than a silent one (AGENT-LESSONS §2d). Nothing headless can see draw
    // order; what this can see is the order the encoder chose.
    const doc = encodeLottie(
      [circle("scene.first"), circle("scene.second"), circle("scene.third")],
      framesOf([snap("scene.first"), snap("scene.second"), snap("scene.third")]),
      planFor(1, 30), SCENE,
    );
    expect(doc.layers.map((l) => l.nm)).toEqual(["third", "second", "first", "background"]);
  });

  it("keeps parent links valid across the reversal", () => {
    // `parent` holds another layer's `ind`, which is an identifier rather
    // than an array position, so reversing must not renumber anything.
    const doc = encodeLottie(
      [circle("scene.g"), circle("scene.g.inner", "scene.g")],
      framesOf([snap("scene.g"), snap("scene.g.inner")]),
      planFor(1, 30), SCENE,
    );
    expect(doc.layers.map((l) => l.nm)).toEqual(["inner", "g", "background"]);
    const inner = layerNamed(doc, "inner");
    expect(inner.parent).toBe(layerNamed(doc, "g").ind);
    // …and the ind it points at is genuinely present in the array.
    expect(doc.layers.some((l) => l.ind === inner.parent)).toBe(true);
  });

  it("gives every layer, background included, a distinct ind", () => {
    const doc = encodeLottie(
      [circle("scene.a"), circle("scene.b")],
      framesOf([snap("scene.a"), snap("scene.b")]),
      planFor(1, 30), SCENE,
    );
    const inds = doc.layers.map((l) => l.ind);
    expect(new Set(inds).size).toBe(inds.length);
  });
});

describe("encodeLottie · per-kind geometry", () => {
  const only = (spec: LayerSpec): LottieDoc =>
    encodeLottie([spec], framesOf([snap(spec.id)]), planFor(1, 30), SCENE);

  it("draws a circle as an ellipse centred at (r, r), not at the layer origin", () => {
    // `buildNode` emits `.circle(radius, radius, radius)` (builder.ts:215),
    // so the drawn centre is (r, r) in local space. Lottie's `el` `p` is the
    // ellipse's centre, so `[0, 0]` would offset it by one radius on both
    // axes — a file that parses and is visibly wrong (design §4.2).
    const doc = only({
      id: "scene.c", name: "c", shape: { kind: "circle", radius: 5 },
      anchor: { x: 5, y: 5 }, color: [1, 0, 0], parentId: null,
    });
    const layer = layerNamed(doc, "c");
    expect(layer.ty).toBe(4);
    expect(layer.shapes[0]).toMatchObject({ ty: "el", p: { a: 0, k: [5, 5] }, s: { a: 0, k: [10, 10] } });
  });

  it("draws a rectangle centred at (w/2, h/2), not at its corner", () => {
    // `.rect(0, 0, w, h)` (builder.ts:230) puts the TOP-LEFT at the local
    // origin; Lottie's `rc` `p` is the rectangle's centre.
    const doc = only({
      id: "scene.r", name: "r", shape: { kind: "rectangle", width: 40, height: 20 },
      anchor: { x: 20, y: 10 }, color: [0, 1, 0], parentId: null,
    });
    expect(layerNamed(doc, "r").shapes[0]).toMatchObject({
      ty: "rc", p: { a: 0, k: [20, 10] }, s: { a: 0, k: [40, 20] },
    });
  });

  it("draws a polygon as a closed path with tangents relative to each vertex", () => {
    // Bezier `i`/`o` are relative to their own vertex (design §3), so a
    // straight-edged polygon's are all [0, 0]. Writing the vertex there
    // instead — the obvious "absolute" misreading — curves every edge.
    const doc = only({
      id: "scene.p", name: "p",
      shape: { kind: "polygon", points: [{ x: 0, y: -30 }, { x: 26, y: 15 }, { x: -26, y: 15 }] },
      anchor: { x: 0, y: -7.5 }, color: [0, 0, 1], parentId: null,
    });
    const path = layerNamed(doc, "p").shapes[0];
    expect(path.ty).toBe("sh");
    expect(path.ks.k.v).toEqual([[0, -30], [26, 15], [-26, 15]]);
    expect(path.ks.k.i).toEqual([[0, 0], [0, 0], [0, 0]]);
    expect(path.ks.k.o).toEqual([[0, 0], [0, 0], [0, 0]]);
    expect(path.ks.k.c).toBe(true);
  });

  it("emits a fill after the shape it fills, in 0-1 floats", () => {
    // lottie-web's `searchShapes` walks the item list BACKWARDS
    // (`elements/svgElements/SVGShapeElement.js:247`) collecting styles and
    // applying them to items at lower indices, so a fill placed before its
    // path paints nothing at all.
    const doc = only({
      id: "scene.c", name: "c", shape: { kind: "circle", radius: 5 },
      anchor: { x: 5, y: 5 }, color: [1, 0.5, 0], parentId: null,
    });
    const shapes = layerNamed(doc, "c").shapes;
    expect(shapes.map((s: { ty: string }) => s.ty)).toEqual(["el", "fl"]);
    expect(shapes[1].c).toEqual({ a: 0, k: [1, 0.5, 0] });
  });

  it("emits a group as a null layer carrying no shapes", () => {
    const doc = only({
      id: "scene.g", name: "g", shape: { kind: "group" },
      anchor: { x: 0, y: 0 }, color: null, parentId: null,
    });
    const layer = layerNamed(doc, "g");
    expect(layer.ty).toBe(3);
    expect(layer.shapes).toBeUndefined();
  });

  it("writes the spec's anchor onto the layer transform unchanged", () => {
    // `a` is the point in layer-local space that `p` places, which is exactly
    // what a Marey pivot is — so this is a copy, not a computation, and a
    // hardcoded [0, 0] would silently break every non-default `origin`.
    const doc = only({
      id: "scene.r", name: "r", shape: { kind: "rectangle", width: 4, height: 6 },
      anchor: { x: 2, y: 6 }, color: [0, 1, 0], parentId: null,
    });
    expect(layerNamed(doc, "r").ks.a).toEqual({ a: 0, k: [2, 6] });
  });
});

/**
 * The two guards design §3's precedent (`pngSequence.ts`'s `__updateLayout`
 * throw) requires. Neither is reachable through `planLottie` + `sampleFrames`
 * today — the report records the argument — but both are reachable at
 * `encodeLottie`'s own boundary, which is what these tests exercise, and
 * deleting either guard turns the matching test red.
 */
describe("encodeLottie · invariant violations throw rather than degrade", () => {
  it("throws, naming the id and the frame, when a spec has no snapshot in some frame", () => {
    // Asserted on wording only this guard produces, not a short substring a
    // neighbouring message could also emit (AGENT-LESSONS §2b).
    const run = () =>
      encodeLottie(
        [circle("scene.c")],
        framesOf([snap("scene.c")], [snap("scene.other")]),
        planFor(2, 30), SCENE,
      );
    expect(run).toThrow("no snapshot for object 'scene.c'");
    expect(run).toThrow("Frame 1");
  });

  it("throws when a parentId names no layer in the array", () => {
    expect(() =>
      encodeLottie(
        [circle("scene.inner", "scene.ghost")],
        framesOf([snap("scene.inner")]),
        planFor(1, 30), SCENE,
      ),
    ).toThrow("names parent 'scene.ghost', which is not a layer in this export");
  });

  it("throws on a parent cycle rather than walking it forever", () => {
    // Not one of the brief's two guards. Added because the alternative to
    // throwing here is a HANG, not a wrong file: the ancestor walk has no
    // other termination condition, and `lottie §layers` forbids reference
    // cycles outright. Unreachable through `planLottie`, which assigns
    // `parentId` from the enclosing node of a depth-first walk.
    expect(() =>
      encodeLottie(
        [circle("scene.a", "scene.b"), circle("scene.b", "scene.a")],
        framesOf([snap("scene.a"), snap("scene.b")]),
        planFor(1, 30), SCENE,
      ),
    ).toThrow("has a parent cycle through");
  });
});

describe("encodeLottie · the emitted document survives JSON", () => {
  it("round-trips through JSON.parse(JSON.stringify(...)) unchanged", () => {
    const doc = encodeLottie(
      [circle("scene.c")],
      framesOf([snap("scene.c", { x: 1.5 })], [snap("scene.c", { x: 2.25, rotation: Math.PI })]),
      planFor(2, 30), SCENE,
    );
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });
});
