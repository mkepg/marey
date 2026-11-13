import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { encodeLottie, thorvgEasingKey, type LottieDoc, type LottieKeyframe } from "./lottieEncode";
import { evaluateProperty } from "./lottieEvaluate";
import { LOTTIE_FIT_TOLERANCE } from "./lottieFit";
import { planLottie, hexToRgb01, rgb01OfInt, type LayerSpec } from "./lottieGeometry";
import { planExport } from "./exportContract";
import { sampleFrames, type FrameSnapshot, type ObjectSnapshot } from "../renderer/frameSampler";
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
  /** Wall-clock milliseconds spent in `encodeLottie` alone. */
  readonly encodeMs: number;
}

/** Compiles, plans, builds and samples `source` at `fps`, then times the encode step on its own. */
function runSource(name: string, source: string, fps: number): Run {
  const out = compileSource(source);
  if (!out.ir) throw new Error(`${name} did not compile: ${out.errors.map((e) => e.message).join("; ")}`);
  const ir = out.ir;
  const geo = planLottie(ir);
  if (!geo.ok) throw new Error(`planLottie failed: ${geo.diagnostics.map((d) => d.code).join(",")}`);
  const exp = planExport(ir, { fps });
  if (!exp.ok) throw new Error(`planExport failed: ${exp.diagnostics.map((d) => d.code).join(",")}`);
  const root = new Container();
  for (const node of ir.children) root.addChild(buildNode(node as IRObjectNode));
  const runtime = new SceneRuntime(new MatterWorld(ir.width, ir.height), root);
  const frames = sampleFrames(runtime, root, exp.plan);
  runtime.destroy();
  const start = performance.now();
  const doc = encodeLottie(geo.layers, frames, exp.plan, {
    width: ir.width, height: ir.height, background: hexToRgb01(ir.background), name,
  });
  const encodeMs = performance.now() - start;
  return { doc, layers: geo.layers, frames, encodeMs };
}

const RUNS = new Map<string, Run>();
const runOf = (name: string, fps = 30): Run => {
  const key = `${name}@${fps}`;
  let r = RUNS.get(key);
  if (!r) RUNS.set(key, (r = runSource(name, sourceOf(name), fps)));
  return r;
};

/** Each frame's snapshots by object id, so a lookup is not a scan of the frame. */
const snapshotIndex = (frames: ReadonlyArray<FrameSnapshot>): ReadonlyArray<ReadonlyMap<string, ObjectSnapshot>> =>
  frames.map((f) => new Map(f.objects.map((o) => [o.id, o])));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLayer = any;

/** The Lottie layer each spec was encoded as, keyed by spec id and found by its `ind`. */
function lottieLayers(run: Run): ReadonlyMap<string, AnyLayer> {
  const byInd = new Map<number, AnyLayer>((run.doc.layers as ReadonlyArray<AnyLayer>).map((l) => [l.ind, l]));
  return new Map(run.layers.map((spec, i) => [spec.id, byInd.get(i + 1)!]));
}

/** Every fill and stroke colour property of a layer. */
function colorProperties(layer: { shapes?: ReadonlyArray<{ ty: string; c?: unknown }> }): unknown[] {
  return (layer.shapes ?? []).filter((item) => item.ty === "fl" || item.ty === "st").map((item) => item.c);
}

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
// stay well above the count a per-component fit would give. Measured again
// with opacity held exact at 0 and 100 (`exactValues`): every count is
// unchanged on these five scenes. Measured again with the run-growth
// shortcuts and galloping of spec F10: every document is byte-identical.
// Measured again with colour fitted one-sided (`COLOR_FIT_BAND`): Dusk Hills,
// the only one of the five whose colours animate, rose from 3731 to 3941; the
// others are byte-identical. Section 4 of `eval/RESULTS-LOTTIE-FITTED.md` has
// the exported examples' counts.
//
//   scene          per-frame   fitted (= ceiling)
//   compound-logo        480       99
//   radial-dots            0        0   (nothing moves)
//   physics-pile       16800     2718
//   ledges             14040     1958
//   dusk-hills         23760     3941
//
// `marey export ledges.marey --format lottie --fps 30` writes 4256 keyframes,
// not 1958, at the same 270 frames and 38 layers. Two differences in the
// simulation account for it. `runSource` builds `new MatterWorld(width, height)`,
// which has all four walls, while ledges declares `bounds: [left, right,
// bottom]`; the export builds the world with `createWorldForScene`, so its
// tiles fall in through the open top, and here they land on the top wall and
// settle early. Built with `createWorldForScene` in Node, ledges fits to 4136
// keyframes. The remaining 120 come from Node and the export's Chromium
// drifting apart: the first differing sample is crate_2 at frame 78, 3e-4 px,
// and the bodies diverge from there. physics-pile and dusk-hills declare all
// four walls and match the export's counts.
const CEILINGS: Record<string, number> = {
  "compound-logo": 99,
  "radial-dots": 0,
  "physics-pile": 2718,
  "ledges": 1958,
  "dusk-hills": 3941,
};

describe("lottieFitted · canonical scenes", () => {
  for (const name of SCENE_NAMES) {
    describe(name, () => {
      it("every sampled frame round-trips within tolerance", { timeout: 30_000 }, () => {
        const run = runOf(name);
        const { layers, frames } = run;
        const byId = new Map(layers.map((l) => [l.id, l]));
        const snaps = snapshotIndex(frames);
        const lottie = lottieLayers(run);
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
            const s = snaps[f].get(cur.id)!;
            product *= s.visible ? s.alpha : 0;
          }
          return product * 100;
        };
        for (const spec of layers) {
          const layer = lottie.get(spec.id)!;
          for (let f = 0; f < frames.length; f++) {
            const snap = snaps[f].get(spec.id)!;
            const at = `${name} ${spec.id} frame ${f}`;
            near(evaluateProperty(layer.ks.p, f), [snap.x, snap.y], LOTTIE_FIT_TOLERANCE.position, `${at} p`);
            near(evaluateProperty(layer.ks.s, f), [snap.scaleX * 100, snap.scaleY * 100], LOTTIE_FIT_TOLERANCE.scale, `${at} s`);
            near(evaluateProperty(layer.ks.r, f), [(snap.rotation * 180) / Math.PI], LOTTIE_FIT_TOLERANCE.rotation, `${at} r`);
            near(evaluateProperty(layer.ks.o, f), [opacityOf(spec.id, f)], LOTTIE_FIT_TOLERANCE.opacity, `${at} o`);
            if (spec.color !== null) {
              const want = [...rgb01OfInt(snap.color!)];
              for (const c of colorProperties(layer)) near(evaluateProperty(c, f), want, LOTTIE_FIT_TOLERANCE.color, `${at} colour`);
            }
          }
        }
      });

      it("no two distinct easings resolve to one cached curve in either player", { timeout: 30_000 }, () => {
        // ThorVG: a named keyframe is cached by its name, any other by the
        // two-decimal key. lottie-web: by name, else by the full-precision key.
        const thorvg = new Map<string, string>();
        const lottieWeb = new Map<string, string>();
        const claim = (cache: Map<string, string>, key: string, tuple: string, player: string) => {
          const prior = cache.get(key);
          expect(prior === undefined || prior === tuple, `${name} ${player} key ${key}: ${prior} vs ${tuple}`).toBe(true);
          cache.set(key, tuple);
        };
        const visit = (node: unknown): void => {
          if (Array.isArray(node)) return void node.forEach(visit);
          if (node === null || typeof node !== "object") return;
          const rec = node as Record<string, unknown>;
          if (rec.a === 1 && Array.isArray(rec.k)) {
            for (const kf of rec.k as LottieKeyframe[]) {
              if (!kf.i || !kf.o) continue;
              const tuple = `${kf.i.x[0]}_${kf.i.y[0]}_${kf.o.x[0]}_${kf.o.y[0]}`;
              claim(thorvg, kf.n !== undefined ? `n:${kf.n.slice(0, 20)}` : `k:${thorvgEasingKey(kf)}`, tuple, "thorvg");
              claim(lottieWeb, kf.n ?? `bez_${kf.o.x}_${kf.o.y}_${kf.i.x}_${kf.i.y}`.replace(/\./g, "p"), tuple, "lottie-web");
            }
            return;
          }
          Object.values(rec).forEach(visit);
        };
        visit(runOf(name).doc.layers);
      });

      it("keyframe counts stay under their ceilings", { timeout: 30_000 }, () => {
        const total = countKeyframes(runOf(name).doc);
        expect(total).toBeLessThanOrEqual(CEILINGS[name]);
      });
    });
  }
});

describe("lottieFitted · colour as lottie-web draws it", () => {
  // lottie-web multiplies a fill or stroke colour by 255 and truncates each
  // channel (`bmFloor` in `renderFill` and on the static-colour path), so a
  // fitted channel a hair under its sampled level k/255 is drawn as k - 1.
  // The colour tolerance is one-sided for that reason: every fitted channel
  // lies at or above its sample and truncates back to the sampled level.
  // This check truncates the double-precision value, which is stricter than
  // the player: lottie-web holds an animated vector in a `Float32Array`, which
  // absorbs undershoots below its resolution. With the symmetric tolerance it
  // failed on 199 channel-frames at 30 fps and 230 at 60 fps.
  for (const fps of [30, 60]) {
    it(`Dusk Hills at ${fps} fps draws every sampled colour channel at its own level`, { timeout: 60_000 }, () => {
      const run = runOf("dusk-hills", fps);
      const snaps = snapshotIndex(run.frames);
      const lottie = lottieLayers(run);
      let checked = 0;
      const wrong: string[] = [];
      for (const spec of run.layers) {
        if (spec.color === null) continue;
        const props = colorProperties(lottie.get(spec.id)!);
        for (let f = 0; f < run.frames.length; f++) {
          const want = rgb01OfInt(snaps[f].get(spec.id)!.color!);
          for (const prop of props) {
            const got = evaluateProperty(prop, f);
            for (let c = 0; c < 3; c++) {
              checked++;
              const drawn = Math.floor(255 * got[c]);
              const level = Math.round(255 * want[c]);
              if (drawn !== level) wrong.push(`${spec.id} frame ${f} channel ${c}: drawn ${drawn}, sampled ${level}`);
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
      expect(wrong.length, `${wrong.length} channel-frames, first: ${wrong.slice(0, 10).join("; ")}`).toBe(0);
    });
  }
});

describe("lottieFitted · encoding budget (spec F10)", () => {
  // Only `encodeLottie` is timed; compiling and sampling happen outside the
  // timed region. The spec's target is under 1 s; the test fails above 2 s.
  const BUDGET_MS = 2000;

  it("encodes Dusk Hills at 60 fps inside the budget", { timeout: 120_000 }, () => {
    const { encodeMs, frames } = runOf("dusk-hills", 60);
    console.log(`encodeLottie: dusk-hills, ${frames.length} frames at 60 fps, ${encodeMs.toFixed(0)} ms`);
    expect(encodeMs).toBeLessThan(BUDGET_MS);
  });

  it("encodes a 60 s settled physics scene at 60 fps inside the budget", { timeout: 300_000 }, () => {
    // Physics pile lengthened from 7 s to 60 s, with its bodies simulated to
    // the end rather than frozen at 7 s: 3,600 frames, nearly all of them a
    // heap at rest.
    const source = sourceOf("physics-pile")
      .replace(/^let end(\s*)= 7\b/m, "let end$1= 60")
      .replace(/^(\s*)duration: 7\b/m, "$1duration: 60");
    expect(source).toMatch(/^let end\s*= 60\b/m);
    expect(source).toMatch(/^\s*duration: 60\b/m);
    const run = runSource("physics-pile-60s", source, 60);
    console.log(`encodeLottie: physics-pile at 60 s, ${run.frames.length} frames at 60 fps, ${run.encodeMs.toFixed(0)} ms, ${countKeyframes(run.doc)} keyframes`);
    expect(run.frames.length).toBe(3600);
    expect(run.encodeMs).toBeLessThan(BUDGET_MS);
  });
});
