import { describe, it, expect, vi } from "vitest";
import { Container } from "pixi.js";
import { buildNode } from "./builder";
import { sampleFrames } from "./frameSampler";
import { SceneRuntime } from "./sceneRuntime";
import { MatterWorld } from "./physicsWorld";
import { hashFrames } from "../export/frameHash";
import { planExport } from "../export/exportContract";
import { lex } from "../lexer";
import { parse } from "../parser";
import { typeCheck } from "../typeChecker";
import type { IRSceneNode, IRObjectNode } from "../sceneIR";
import type { SamplerPlan } from "../export/exportContract";

function irFor(source: string): IRSceneNode {
  const { ast } = parse(lex(source));
  const { ir, errors } = typeCheck(ast!);
  if (!ir) throw new Error(`fixture did not compile: ${errors.map(e => e.message).join("; ")}`);
  return ir;
}

/** A 5s scene: one circle sliding right, one falling body. No `text`. */
const SOURCE = `
scene {
  size: (800, 600)
  duration: 5

  circle slider {
    position: (100, 100)
    radius: 20
    color: cyan
    animate { property: position, to: (700, 100), duration: 4, easing: linear }
  }

  circle faller {
    position: (400, 50)
    radius: 15
    color: magenta
    physics { gravity: (0, 980), duration: indefinitely, collideBounds: true }
  }
}
`;

function buildRoot(ir: IRSceneNode): Container {
  const root = new Container();
  for (const node of ir.children) root.addChild(buildNode(node as IRObjectNode));
  return root;
}

function runExport(fps: number): { frames: ReturnType<typeof sampleFrames>; plan: SamplerPlan } {
  const ir = irFor(SOURCE);
  const result = planExport(ir, { fps });
  if (!result.ok) throw new Error(`plan failed: ${result.diagnostics.map(d => d.code).join(",")}`);
  const world = new MatterWorld(ir.width, ir.height);
  const root = buildRoot(ir);
  const runtime = new SceneRuntime(world, root);
  const frames = sampleFrames(runtime, root, result.plan);
  runtime.destroy();
  return { frames, plan: result.plan };
}

describe("sampleFrames · exact frame counts (Gate B criterion 1)", () => {
  it.each([[24, 120], [30, 150], [60, 300]])(
    "produces %i frames at %ifps for a 5s scene",
    (fps, expected) => {
      expect(runExport(fps).frames).toHaveLength(expected);
    },
  );

  it("samples frame 0 at tick 0, before any advance", () => {
    const { frames } = runExport(30);
    expect(frames[0].index).toBe(0);
    expect(frames[0].tick).toBe(0);
  });

  it("spaces frames by exactly ticksPerFrame", () => {
    const { frames, plan } = runExport(30);
    for (let i = 0; i < frames.length; i++) {
      expect(frames[i].tick).toBe(i * plan.ticksPerFrame);
    }
  });
});

describe("sampleFrames · repeated exports are identical (Gate B criterion 2)", () => {
  it("produces the same hash twice from cold", () => {
    expect(hashFrames(runExport(30).frames)).toBe(hashFrames(runExport(30).frames));
  });

  it("produces a hash that actually depends on the frames", () => {
    // Guards the other direction: a constant hash would satisfy the test above
    // vacuously (AGENT-LESSONS §2a — name the change that would make it fail).
    expect(hashFrames(runExport(30).frames)).not.toBe(hashFrames(runExport(60).frames));
  });
});

describe("sampleFrames · frame pacing cannot affect exported state (Gate B criterion 3)", () => {
  it("agrees between 30fps and 60fps on every coincident frame", () => {
    const at30 = runExport(30).frames;
    const at60 = runExport(60).frames;
    // 30fps frame k and 60fps frame 2k sample the same tick, so their objects
    // must be identical. If the sampler painted once per *frame* instead of
    // once per tick, the two rates would diverge here.
    for (let k = 0; k < at30.length; k++) {
      expect(at30[k].tick).toBe(at60[2 * k].tick);
      expect(at30[k].objects).toEqual(at60[2 * k].objects);
    }
  });

  it("agrees between 24fps and 60fps on the frames that coincide", () => {
    const at24 = runExport(24).frames;
    const at60 = runExport(60).frames;
    // 24fps frame k is tick 5k; 60fps frame j is tick 2j. They coincide when
    // 5k is even, i.e. on even k.
    for (let k = 0; k < at24.length; k += 2) {
      expect(at24[k].objects).toEqual(at60[(5 * k) / 2].objects);
    }
  });
});

describe("sampleFrames · uses the tick-aligned paint, not the wall-clock one", () => {
  // Closes a gap the Step 6 delete-and-run check found: swapping
  // `paintExactTick()` for `paint(0)` left every other test in this file
  // green, because the resulting one-tick physics lag is a function of tick
  // alone and so cancels out in every frame-rate-comparison assertion. This
  // pins the call itself, which is the only thing that distinguishes the two.
  it("calls paintExactTick once per advanced tick and never calls paint", () => {
    const spyExact = vi.spyOn(SceneRuntime.prototype, "paintExactTick");
    const spyPaint = vi.spyOn(SceneRuntime.prototype, "paint");
    try {
      const { plan } = runExport(30);
      const expectedCalls = (plan.frameCount - 1) * plan.ticksPerFrame;
      expect(spyExact).toHaveBeenCalledTimes(expectedCalls);
      expect(spyPaint).not.toHaveBeenCalled();
    } finally {
      spyExact.mockRestore();
      spyPaint.mockRestore();
    }
  });
});

describe("sampleFrames · snapshot shape", () => {
  it("carries every object in the scene, keyed by its IR id", () => {
    const { frames } = runExport(30);
    // Top-level IR ids are scoped as `scene.<name>` (typeChecker/builder.ts),
    // not the bare declared name — the brief's fixture asserted the latter.
    expect(frames[0].objects.map((o) => o.id)).toEqual(["scene.slider", "scene.faller"]);
  });

  it("records the slider moving and the faller falling", () => {
    const { frames } = runExport(30);
    const first = frames[0];
    const last = frames[frames.length - 1];
    const sliderOf = (f: typeof first) => f.objects.find((o) => o.id === "scene.slider")!;
    const fallerOf = (f: typeof first) => f.objects.find((o) => o.id === "scene.faller")!;
    expect(sliderOf(last).x).toBeGreaterThan(sliderOf(first).x + 500);
    expect(fallerOf(last).y).toBeGreaterThan(fallerOf(first).y + 100);
  });

  it("freezes each snapshot", () => {
    const { frames } = runExport(30);
    expect(Object.isFrozen(frames[0])).toBe(true);
    expect(Object.isFrozen(frames[0].objects[0])).toBe(true);
  });
});
