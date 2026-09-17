import { describe, it, expect } from "vitest";
import { Container, Matrix } from "pixi.js";
import { encodeLottie, type LottieLayer, type LottieVectorProperty, type LottieScalarProperty } from "./lottieEncode";
import { planLottie } from "./lottieGeometry";
import { planExport } from "./exportContract";
import { sampleFrames } from "../renderer/frameSampler";
import { buildNode } from "../renderer/builder";
import { SceneRuntime } from "../renderer/sceneRuntime";
import { MatterWorld } from "../renderer/physicsWorld";
import { compileSource } from "../compileSource";
import type { IRObjectNode } from "../sceneIR";

/**
 * The gap `lottieRoundTrip.test.ts:175` names but does not close: `scene.mark`
 * in that suite's fixture has no parent, so its ancestor chain is itself
 * alone and nothing there exercises composing a Lottie layer's transform
 * through a non-trivial parent chain. Every other Lottie test in this phase
 * pins a *unit* conversion (radians→degrees, multiplier→percent, alpha→0–100)
 * in isolation; none pins that a player composing `T(p)·R(r)·S(s)·T(-a)` up
 * `layer.parent` links actually reproduces the same point-in-scene-space that
 * PixiJS computes by composing `Container.localTransform` up `container.parent`
 * links. A regression in the anchor term, the parent-chain walk, or a unit
 * (radians left un-converted to degrees) would be invisible to every other
 * test in this suite and, per design's own methodology, catchable only by a
 * browser pixel check — see `tools/visual-check` and
 * `eval/RESULTS-PHASE-5A.md`'s Criterion 2.
 *
 * The scene below is the hard case: a parent `group` with its own rotation
 * and non-uniform scale, wrapping three shapes that each carry their own
 * rotation, non-uniform scale and off-centre `origin`. Nothing animates —
 * the point under test is the transform composition, not the sampler — so a
 * one-frame export is enough.
 */
const SRC = `
scene {
  size: (400, 300)
  duration: 0.0333333333

  group g {
    position: (100, 80)
    rotation: 30
    scale: (2, 0.5)

    rectangle r {
      position: (20, 10)
      size: (40, 20)
      origin: (0.2, 0.8)
      rotation: 20
      scale: (1.5, 3)
      color: #ff0000
    }
    circle c {
      position: (-15, 25)
      radius: 7
      origin: (0, 1)
      rotation: -40
      color: #00ff00
    }
    polygon p {
      position: (5, -20)
      points: [(0,-10), (12,6), (-9,8)]
      origin: (0.9, 0.1)
      rotation: 15
      scale: (0.7, 1.3)
      color: #0000ff
    }
  }
}
`;

/**
 * One layer's own Lottie transform: `T(p)·R(r)·S(s)·T(-a)` — design §3's
 * documented order, matching lottie-web's `TransformElement` (a translate to
 * the anchor's negative, then scale, then rotate, then translate to `p`).
 * Reads either the static (`a: 0`) or single-keyframe (`a: 1`) shape a
 * `LottieVectorProperty`/`LottieScalarProperty` can take — this scene is
 * static, so every property here collapses to the static form, but reading
 * both keeps this helper honest about the type it is actually given.
 */
function lottieLocal(ks: LottieLayer["ks"]): Matrix {
  const vec = (prop: LottieVectorProperty): readonly number[] => (prop.a === 0 ? prop.k : prop.k[0].s);
  const scalar = (prop: LottieScalarProperty): number => (prop.a === 0 ? prop.k : prop.k[0].s[0]);
  const [px, py] = vec(ks.p);
  const [ax, ay] = vec(ks.a);
  const [sx, sy] = vec(ks.s);
  const rad = (scalar(ks.r) * Math.PI) / 180;
  return new Matrix().translate(-ax, -ay).scale(sx / 100, sy / 100).rotate(rad).translate(px, py);
}

describe("lottieTransformCompose · composed CTM through a parent chain", () => {
  it("Lottie's composed CTM equals Pixi's own world transform, for every layer", () => {
    const out = compileSource(SRC);
    if (!out.ir) throw new Error(out.errors.map((e) => e.message).join("; "));
    const ir = out.ir;

    const geo = planLottie(ir);
    if (!geo.ok) throw new Error(`planLottie failed: ${geo.diagnostics.map((d) => d.code).join(",")}`);

    const exportResult = planExport(ir, { fps: 30 });
    if (!exportResult.ok) {
      throw new Error(`planExport failed: ${exportResult.diagnostics.map((d) => d.code).join(",")}`);
    }

    const root = new Container();
    for (const node of ir.children) root.addChild(buildNode(node as IRObjectNode));

    const world = new MatterWorld(ir.width, ir.height);
    const runtime = new SceneRuntime(world, root);
    const frames = sampleFrames(runtime, root, exportResult.plan);
    runtime.destroy();

    const doc = encodeLottie(geo.layers, frames, exportResult.plan, {
      width: ir.width,
      height: ir.height,
      background: [0, 0, 0],
      name: "compose-probe",
    });

    // Pixi's OWN world transform per built container, keyed by IR id.
    // `Container.getGlobalTransform()` recalculates the whole parent chain
    // itself (`getGlobalMixin.js`) rather than reading a cached
    // `worldTransform` that would require a render pass to populate — so this
    // is Pixi's real transform-composition algorithm, not a second
    // hand-written implementation that could happen to agree with a bug in
    // the first. Confirmed against a synthetic two-container chain before
    // writing this test that `parent.localTransform.clone().append(child
    // .localTransform)` reproduces exactly what `getGlobalTransform()`
    // returns — which is the same `.append` order used below for the Lottie
    // side, so both halves of this test compose parent-then-child the same
    // way.
    const pixiWorld = new Map<string, Matrix>();
    const collect = (c: Container): void => {
      if (c.__mareyId !== undefined) pixiWorld.set(c.__mareyId, c.getGlobalTransform());
      for (const child of c.children) collect(child as Container);
    };
    collect(root);

    // Lottie's composed CTM per layer, walking `parent` (an `ind`, never an
    // array position — `lottieEncode.ts`'s own comment on `LottieLayerBase
    // .parent`) up to the root.
    const byInd = new Map<number, LottieLayer>(doc.layers.map((l) => [l.ind, l]));
    const ctmCache = new Map<number, Matrix>();
    const ctm = (layer: LottieLayer): Matrix => {
      const cached = ctmCache.get(layer.ind);
      if (cached) return cached;
      const local = lottieLocal(layer.ks);
      const composed = layer.parent === undefined ? local : ctm(byInd.get(layer.parent)!).clone().append(local);
      ctmCache.set(layer.ind, composed);
      return composed;
    };

    expect(geo.layers.length).toBeGreaterThan(0);

    for (const spec of geo.layers) {
      const layer = doc.layers.find((l): l is LottieLayer => l.nm === spec.name);
      if (!layer) throw new Error(`no Lottie layer named '${spec.name}' for id '${spec.id}'`);
      const lottieMatrix = ctm(layer);
      const pixiMatrix = pixiWorld.get(spec.id);
      if (!pixiMatrix) throw new Error(`no Pixi world transform recorded for '${spec.id}'`);

      // Named component-by-component, not `toEqual` on the two matrices,
      // so a failure names which layer and which of the six components
      // diverged instead of dumping two opaque objects.
      const checks: ReadonlyArray<{ readonly name: string; readonly lottie: number; readonly pixi: number }> = [
        { name: "a", lottie: lottieMatrix.a, pixi: pixiMatrix.a },
        { name: "b", lottie: lottieMatrix.b, pixi: pixiMatrix.b },
        { name: "c", lottie: lottieMatrix.c, pixi: pixiMatrix.c },
        { name: "d", lottie: lottieMatrix.d, pixi: pixiMatrix.d },
        { name: "tx", lottie: lottieMatrix.tx, pixi: pixiMatrix.tx },
        { name: "ty", lottie: lottieMatrix.ty, pixi: pixiMatrix.ty },
      ];
      for (const { name, lottie, pixi } of checks) {
        expect(
          lottie,
          `layer '${spec.id}' (${spec.name}): component '${name}' diverged — lottie=${lottie}, pixi=${pixi}`,
        ).toBeCloseTo(pixi, 6);
      }
    }
  });
});
