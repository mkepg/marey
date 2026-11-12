import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { encodeLottie, type LottieDoc } from "./lottieEncode";
import { evaluateProperty } from "./lottieEvaluate";
import { LOTTIE_FIT_TOLERANCE } from "./lottieFit";
import { planLottie, hexToRgb01, rgb01OfInt, type LayerSpec } from "./lottieGeometry";
import { planExport } from "./exportContract";
import { sampleFrames, type FrameSnapshot } from "../renderer/frameSampler";
import { buildNode } from "../renderer/builder";
import { SceneRuntime } from "../renderer/sceneRuntime";
import { MatterWorld } from "../renderer/physicsWorld";
import { compileSource } from "../compileSource";
import type { IRObjectNode } from "../sceneIR";

/**
 * The fitted encoder on the canonical scenes that build in plain Node:
 * compile, plan, build, sample at 30 fps, encode, then read every property of
 * every layer back through the player-faithful evaluator and compare it with
 * the value the encoder computed from the snapshots.
 *
 * Scenes that declare `text` need a canvas to measure glyphs and cannot be
 * sampled here. Skipped by name: `bar-chart.marey` and `timeline-ticks.marey`
 * (in `eval/scenes-3b/`), and `bar-chart-reveal.marey` and `logo-reveal.marey`
 * (in `src/examples/`, outside the set this file lists). The real-player
 * harness covers them.
 */
const SCENES: Record<string, string> = {
  ...import.meta.glob("../../../eval/scenes-3b/*.marey", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../../examples/{physics-pile,ledges,dusk-hills}.marey", { query: "?raw", import: "default", eager: true }),
} as Record<string, string>;

const SCENE_NAMES = ["compound-logo", "radial-dots", "physics-pile", "ledges", "dusk-hills"];

const sourceOf = (name: string): string => {
  const hit = Object.entries(SCENES).find(([path]) => path.endsWith(`/${name}.marey`));
  if (!hit) throw new Error(`${name}.marey was not found`);
  return hit[1];
};

interface Run {
  readonly doc: LottieDoc;
  readonly layers: ReadonlyArray<LayerSpec>;
  readonly frames: ReadonlyArray<FrameSnapshot>;
}

function run(name: string): Run {
  const out = compileSource(sourceOf(name));
  if (!out.ir) throw new Error(`${name} did not compile: ${out.errors.map((e) => e.message).join("; ")}`);
  const ir = out.ir;
  const geo = planLottie(ir);
  if (!geo.ok) throw new Error(`planLottie failed: ${geo.diagnostics.map((d) => d.code).join(",")}`);
  const exp = planExport(ir, { fps: 30 });
  if (!exp.ok) throw new Error(`planExport failed: ${exp.diagnostics.map((d) => d.code).join(",")}`);
  const root = new Container();
  for (const node of ir.children) root.addChild(buildNode(node as IRObjectNode));
  const runtime = new SceneRuntime(new MatterWorld(ir.width, ir.height), root);
  const frames = sampleFrames(runtime, root, exp.plan);
  runtime.destroy();
  const doc = encodeLottie(geo.layers, frames, exp.plan, {
    width: ir.width, height: ir.height, background: hexToRgb01(ir.background), name,
  });
  return { doc, layers: geo.layers, frames };
}

const RUNS = new Map<string, Run>();
const runOf = (name: string): Run => {
  let r = RUNS.get(name);
  if (!r) RUNS.set(name, (r = run(name)));
  return r;
};

/** Every keyframe written anywhere in the document. */
function countKeyframes(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((n: number, v) => n + countKeyframes(v), 0);
  if (node === null || typeof node !== "object") return 0;
  const o = node as Record<string, unknown>;
  let n = o.a === 1 && Array.isArray(o.k) ? o.k.length : 0;
  for (const v of Object.values(o)) n += countKeyframes(v);
  return n;
}

// Total keyframes per scene at 30 fps: measured when this test was written,
// against the one-keyframe-per-frame encoding it replaced. The fitter is
// deterministic, so each ceiling is the measured count. A vector whose
// components ease differently (a linear sx with an easeIn sy) fits one
// keyframe per frame under the shared easing, which is why the physics scenes
// stay well above the count a per-component fit would give.
//
//   scene          per-frame   fitted (= ceiling)
//   compound-logo        480       81
//   radial-dots            0        0   (nothing moves)
//   physics-pile       16800     2204
//   ledges             14040     1581
//   dusk-hills         23760     3292
const CEILINGS: Record<string, number> = {
  "compound-logo": 81,
  "radial-dots": 0,
  "physics-pile": 2204,
  "ledges": 1581,
  "dusk-hills": 3292,
};

describe("lottieFitted · canonical scenes", () => {
  for (const name of SCENE_NAMES) {
    describe(name, () => {
      it("every sampled frame round-trips within tolerance", () => {
        const { doc, layers, frames } = runOf(name);
        const byId = new Map(layers.map((l) => [l.id, l]));
        const lottieLayer = (spec: LayerSpec) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (doc.layers as ReadonlyArray<any>).find((l) => l.ind === layers.indexOf(spec) + 1)!;
        const EPS = 1e-9;
        const near = (got: ReadonlyArray<number>, want: ReadonlyArray<number>, tol: number, what: string) => {
          expect(got.length, what).toBe(want.length);
          for (let i = 0; i < want.length; i++) {
            expect(Math.abs(got[i] - want[i]), `${what}[${i}]: ${got[i]} vs ${want[i]}`).toBeLessThanOrEqual(tol + EPS);
          }
        };
        const opacityOf = (id: string, f: number): number => {
          let product = 1;
          for (let cur: LayerSpec | undefined = byId.get(id); cur; cur = cur.parentId === null ? undefined : byId.get(cur.parentId)) {
            const s = frames[f].objects.find((o) => o.id === cur!.id)!;
            product *= s.visible ? s.alpha : 0;
          }
          return product * 100;
        };
        for (const spec of layers) {
          const layer = lottieLayer(spec);
          for (let f = 0; f < frames.length; f++) {
            const snap = frames[f].objects.find((o) => o.id === spec.id)!;
            const at = `${name} ${spec.id} frame ${f}`;
            near(evaluateProperty(layer.ks.p, f), [snap.x, snap.y], LOTTIE_FIT_TOLERANCE.position, `${at} p`);
            near(evaluateProperty(layer.ks.s, f), [snap.scaleX * 100, snap.scaleY * 100], LOTTIE_FIT_TOLERANCE.scale, `${at} s`);
            near(evaluateProperty(layer.ks.r, f), [(snap.rotation * 180) / Math.PI], LOTTIE_FIT_TOLERANCE.rotation, `${at} r`);
            near(evaluateProperty(layer.ks.o, f), [opacityOf(spec.id, f)], LOTTIE_FIT_TOLERANCE.opacity, `${at} o`);
            if (spec.color !== null) {
              const want = [...rgb01OfInt(snap.color!)];
              for (const item of layer.shapes as ReadonlyArray<{ ty: string; c?: unknown }>) {
                if (item.ty === "fl" || item.ty === "st") {
                  near(evaluateProperty(item.c, f), want, LOTTIE_FIT_TOLERANCE.color, `${at} ${item.ty}`);
                }
              }
            }
          }
        }
      });

      it("keyframe counts stay under their ceilings", () => {
        const total = countKeyframes(runOf(name).doc);
        expect(total).toBeLessThanOrEqual(CEILINGS[name]);
      });
    });
  }
});
