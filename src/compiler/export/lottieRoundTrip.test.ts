import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { encodeLottie, type LottieDoc } from "./lottieEncode";
import { planLottie, type LayerSpec } from "./lottieGeometry";
import { planExport, type SamplerPlan } from "./exportContract";
import { sampleFrames, type FrameSnapshot } from "../renderer/frameSampler";
import { buildNode } from "../renderer/builder";
import { SceneRuntime } from "../renderer/sceneRuntime";
import { MatterWorld } from "../renderer/physicsWorld";
import { compileSource } from "../compileSource";
import type { IRSceneNode, IRObjectNode, IRColor } from "../sceneIR";

/**
 * Step 6: the whole headless pipeline — compile → plan → build → sample →
 * encode — exercised on a real `.marey` scene rather than hand-built specs
 * and snapshots. `compound-logo.marey` is the one canonical scene (design
 * §9, exit criterion 1) that genuinely animates in, hands off to physics and
 * settles, and it declares no `text`, so — per `builder.test.ts`'s header
 * comment and `frameSampler.test.ts`'s own corpus split — the entire path is
 * buildable in plain Node with no canvas.
 *
 * **On "reuse its scene-loading helper" (task brief, Step 6).**
 * `frameSampler.test.ts`'s `irForCanonical`/`CORPUS_BY_FILE` pair is not
 * exported — it is `const`, local to that test file — and this task's
 * allowed file list is exactly `lottieEncode.ts`, `lottieEncode.test.ts` and
 * this file, so editing `frameSampler.test.ts` to export it is out of
 * bounds. What follows reproduces that file's identical
 * `import.meta.glob("../../../eval/scenes-3b/*.marey", …)` technique rather
 * than inventing a second, different one — the same pattern, not a second
 * pattern, which is the spirit of "reuse" that is actually available given
 * the scope limit. Reported as a deviation rather than silently either
 * skipping the instruction or exceeding scope.
 */
const CORPUS: Record<string, string> = import.meta.glob("../../../eval/scenes-3b/*.marey", {
  query: "?raw",
  import: "default",
  eager: true,
});

const CORPUS_BY_FILE: Record<string, string> = Object.fromEntries(
  Object.entries(CORPUS).map(([path, source]) => [path.slice(path.lastIndexOf("/") + 1), source]),
);

function irForCanonical(file: string): IRSceneNode {
  const source = CORPUS_BY_FILE[file];
  if (source === undefined) throw new Error(`${file} is not in eval/scenes-3b/`);
  const out = compileSource(source);
  if (!out.ir) throw new Error(`${file} did not compile: ${out.errors.map((e) => e.message).join("; ")}`);
  return out.ir;
}

/** Identical to `frameSampler.test.ts`'s `buildRoot`, for the same reason above. */
function buildRoot(ir: IRSceneNode): Container {
  const root = new Container();
  for (const node of ir.children) root.addChild(buildNode(node as IRObjectNode));
  return root;
}

/**
 * `lottieGeometry.ts`'s hex→0-1-float conversion is not exported either
 * (`hexToRgb01` is a private function there, and that file is not in this
 * task's allowed list), so the scene background needs the same one-line
 * conversion reproduced here to build the `LottieSceneInfo` `encodeLottie`
 * requires.
 */
function hexToRgb01(hex: IRColor): readonly [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r / 255, g / 255, b / 255];
}

interface Pipeline {
  readonly ir: IRSceneNode;
  readonly layers: ReadonlyArray<LayerSpec>;
  readonly frames: ReadonlyArray<FrameSnapshot>;
  readonly plan: SamplerPlan;
  readonly doc: LottieDoc;
}

/** compile → planLottie → planExport → build → sample → encode, once. */
function runPipeline(fps: number): Pipeline {
  const ir = irForCanonical("compound-logo.marey");
  const planResult = planLottie(ir);
  if (!planResult.ok) {
    throw new Error(`planLottie failed: ${planResult.diagnostics.map((d) => d.code).join(",")}`);
  }
  const exportResult = planExport(ir, { fps });
  if (!exportResult.ok) {
    throw new Error(`planExport failed: ${exportResult.diagnostics.map((d) => d.code).join(",")}`);
  }

  const world = new MatterWorld(ir.width, ir.height);
  const root = buildRoot(ir);
  const runtime = new SceneRuntime(world, root);
  const frames = sampleFrames(runtime, root, exportResult.plan);
  runtime.destroy();

  const doc = encodeLottie(planResult.layers, frames, exportResult.plan, {
    width: ir.width,
    height: ir.height,
    background: hexToRgb01(ir.background),
    name: "compound-logo",
  });

  return { ir, layers: planResult.layers, frames, plan: exportResult.plan, doc };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const layerNamed = (doc: unknown, nm: string): any =>
  (doc as { layers: ReadonlyArray<{ nm: string }> }).layers.find((l) => l.nm === nm)!;

/** Reads a vector property (`p`/`s`/`a`) at a given output-frame index. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function vectorAt(prop: any, frame: number): readonly number[] {
  if (prop.a === 0) return prop.k;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kf = prop.k.find((k: any) => k.t === frame);
  if (!kf) throw new Error(`no keyframe at frame ${frame}`);
  return kf.s;
}

/** Reads a scalar property (`r`/`o`) at a given output-frame index. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scalarAt(prop: any, frame: number): number {
  if (prop.a === 0) return prop.k;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kf = prop.k.find((k: any) => k.t === frame);
  if (!kf) throw new Error(`no keyframe at frame ${frame}`);
  return kf.s[0];
}

describe("lottieRoundTrip · compound-logo.marey, the whole headless pipeline", () => {
  it("planLottie returns ok for this scene", () => {
    const ir = irForCanonical("compound-logo.marey");
    const result = planLottie(ir);
    expect(result.ok).toBe(true);
  });

  it("takes fr from the plan's fps and op from its frameCount", () => {
    const { doc, plan } = runPipeline(30);
    expect(doc.fr).toBe(plan.fps);
    expect(doc.op).toBe(plan.frameCount);
  });

  it("emits one layer per IR object plus the background solid", () => {
    // The scene is a group ('mark') with three welded rectangles
    // ('stem'/'armTop'/'armMid') — four IR objects total
    // (`frameSampler.test.ts`'s own "compound-logo genuinely animates in…"
    // test pins the same four ids). `+1` is the background solid §6.2 adds.
    const { doc, layers } = runPipeline(30);
    expect(layers.map((l) => l.id).sort()).toEqual(
      ["scene.mark", "scene.mark.stem", "scene.mark.armTop", "scene.mark.armMid"].sort(),
    );
    expect(doc.layers.length).toBe(layers.length + 1);
  });

  it("round-trips through JSON with exact numeric equality against the sampled snapshot", () => {
    // §8.3's "numeric, headless, exact" obligation, on a real scene rather
    // than a hand-built fixture: re-parse the emitted JSON and assert every
    // value equals what the encoder's own documented arithmetic computes
    // from the ObjectSnapshot that fed it — with `===`, not `toBeCloseTo`.
    const { frames, doc } = runPipeline(30);
    const reread = JSON.parse(JSON.stringify(doc)) as unknown;

    // Frame 100 of 240 (8s @ 30fps): past the 1.6s animate-in (frame 48) and
    // well before settling (~5.5s, frame 165), so the mark is genuinely
    // tumbling under physics here — rotation and position are animated
    // tracks, not collapsed statics, exercising both branches of
    // `vectorAt`/`scalarAt` below (scale and opacity stay constant all
    // scene long and DO collapse, since nothing here animates them).
    const FRAME = 100;
    const snap = frames[FRAME].objects.find((o) => o.id === "scene.mark")!;

    // `scene.mark` has no parent, so its ancestor chain is itself alone:
    // composedOpacity is exactly `visible ? alpha : 0`, unaffected by the
    // ancestor-product logic §5 adds for nested layers.
    const expectedP = [snap.x, snap.y];
    const expectedR = (snap.rotation * 180) / Math.PI;
    const expectedS = [snap.scaleX * 100, snap.scaleY * 100];
    const expectedO = (snap.visible ? snap.alpha : 0) * 100;

    const mark = layerNamed(reread, "mark");
    expect(vectorAt(mark.ks.p, FRAME)).toEqual(expectedP);
    expect(scalarAt(mark.ks.r, FRAME)).toBe(expectedR);
    expect(vectorAt(mark.ks.s, FRAME)).toEqual(expectedS);
    expect(scalarAt(mark.ks.o, FRAME)).toBe(expectedO);
  });

  it("contains no reference to Matter or Marey (exit criterion 1, checkable rather than assertable)", () => {
    const { doc } = runPipeline(30);
    const json = JSON.stringify(doc).toLowerCase();
    expect(json).not.toContain("matter");
    expect(json).not.toContain("marey");
  });
});
