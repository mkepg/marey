import { describe, it, expect, vi } from "vitest";
import { Container } from "pixi.js";
import { buildNode } from "./builder";
import { sampleFrames, snapshotFor } from "./frameSampler";
import { SceneRuntime } from "./sceneRuntime";
import { MatterWorld } from "./physicsWorld";
import { hashFrames } from "../export/frameHash";
import { applySnapshot } from "../export/pngSequence";
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

/** The built container carrying an IR id, for reading its drawn transform. */
function containerFor(root: Container, id: string): Container {
  const hit = root.children
    .map((c) => c as Container)
    .find((c) => c.__mareyId === id);
  if (!hit) throw new Error(`no container with id ${id}`);
  return hit;
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
    // The labels above are implementation literals compared to the same
    // literals (frameSampler.ts writes `{ index: 0, tick: 0 }` verbatim), so
    // they cannot fail if the label is simply wrong — Step 6 mutation 3 found
    // exactly that: deleting the frame-0 push and starting the loop at index
    // 0 left `frames[0].tick` reading `0 * ticksPerFrame`, still `0`, even
    // though the world had already been advanced. Pin the *content* frame 0
    // is required to have: the scene exactly as authored, before any tick or
    // paint. Verified independently (not taken from the brief): builder.ts's
    // `applyAnchorAndPivot` writes `currentPos`/`currentScale`/`rotation`/
    // `alpha` once at construction from `props.position`/`props.scale`(default
    // 1.0)/`props.rotation`(default 0)/`props.alpha`(default 1.0)
    // (languageContract.ts), and neither `bindPhysicsBodies` (physicsSync.ts)
    // nor `spawnAnim`/`spawnPhysics` (sceneRuntime.ts) — the only code that
    // runs between construction and this first snapshot — writes to any of
    // those fields.
    expect(frames[0].objects).toEqual([
      { id: "scene.slider", x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1, alpha: 1 },
      { id: "scene.faller", x: 400, y: 50, rotation: 0, scaleX: 1, scaleY: 1, alpha: 1 },
    ]);
  });

  it("spaces frames by exactly ticksPerFrame", () => {
    const { frames, plan } = runExport(30);
    for (let i = 0; i < frames.length; i++) {
      expect(frames[i].tick).toBe(i * plan.ticksPerFrame);
    }
  });

  it("frame intervals are uniform in simulated time, not just labelled that way", () => {
    // The test above compares the `tick` label to the same formula the
    // implementation writes it with (`index * plan.ticksPerFrame`), so a
    // mislabelled frame that still carries a stale tick's *state* would not
    // be caught — again what mutation 3 demonstrated. This asserts the
    // physical consequence instead, using the falling body's own motion as
    // the probe.
    //
    // Under constant gravity with this engine's semi-implicit-Euler stepping
    // (velocity updated then position updated once per tick, from rest), the
    // displacement between tick 0 and tick n is proportional to n(n+1)/2. At
    // 60fps (2 ticks/frame) the first two frame-to-frame displacements are
    // therefore proportional to D(2)-D(0)=3 and D(4)-D(2)=7, a ratio of 7/3 ≈
    // 2.33 (derived and checked against this suite's own measurements, not
    // copied from the review that requested this test). A sampler that reads
    // one tick short on every interval *except* the first — exactly what
    // `paint(0)` in place of `paintExactTick()` produces, since frame 0 is
    // captured before any paint at all — instead gives D(1)=1 and D(3)-D(1)=5,
    // a ratio of 5/1 = 5: a factor-of-two gap no plausible damping closes.
    const { frames } = runExport(60);
    const fallerY = (f: (typeof frames)[number]) =>
      f.objects.find((o) => o.id === "scene.faller")!.y;
    const d1 = fallerY(frames[1]) - fallerY(frames[0]);
    const d2 = fallerY(frames[2]) - fallerY(frames[1]);
    expect(d2 / d1).toBeLessThan(3);
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

  it("distinguishes two same-length sequences that differ only in content", () => {
    // The test above compares a 150-frame sequence to a 300-frame one, so it
    // cannot tell a real content hash from one that is sensitive to sequence
    // *length* alone (e.g. `frames => frames.length.toString(16)`), which
    // would satisfy both hash tests above vacuously. Hold length fixed and
    // perturb one coordinate instead.
    const { frames } = runExport(30);
    const perturbed = frames.map((f, i) =>
      i === 0
        ? {
            ...f,
            objects: f.objects.map((o, j) => (j === 0 ? { ...o, x: o.x + 1 } : o)),
          }
        : f,
    );
    expect(frames).toHaveLength(perturbed.length);
    expect(hashFrames(frames)).not.toBe(hashFrames(perturbed));
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
  // alone and so cancels out in every frame-rate-comparison assertion.
  //
  // This pins WHICH method is used, deliberately not how often. An earlier
  // version of this test also asserted the call count equalled
  // `(frameCount - 1) * ticksPerFrame` — i.e. once per tick — which silently
  // promoted `sampleFrames`'s docstring-disclaimed choice of painting every
  // tick (rather than every frame) into a hard contract, contradicting the
  // same docstring three lines away and misfiring on two of the Step 6
  // mutations for a reason unrelated to what the test's own name claimed. Per-
  // tick painting is kept as the conservative default (see the docstring on
  // `sampleFrames`), but is not proven necessary by this suite, so nothing
  // here may assert a specific call count again.
  it("uses paintExactTick to paint, never paint", () => {
    const spyExact = vi.spyOn(SceneRuntime.prototype, "paintExactTick");
    const spyPaint = vi.spyOn(SceneRuntime.prototype, "paint");
    try {
      runExport(30);
      expect(spyExact).toHaveBeenCalled();
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

/**
 * A 2s scene whose three objects each animate a DIFFERENT non-position
 * property, so `applySnapshot` writing only some fields cannot pass.
 *
 * `SOURCE` above animates `position` and nothing else, which leaves
 * `rotation`, `scaleX/Y` and `alpha` at their authored defaults for every
 * frame of every test in this file — so a snapshot applier that dropped those
 * four fields entirely would round-trip perfectly against it. This fixture is
 * what makes each of them load-bearing.
 */
const MOTION_SOURCE = `
scene {
  size: (400, 300)
  duration: 2

  rectangle spinner {
    position: (60, 60)
    size: (40, 20)
    color: yellow
    animate { property: rotation, to: 90, duration: 2, easing: linear }
  }

  circle grower {
    position: (200, 150)
    radius: 10
    color: cyan
    animate { property: scale, to: (3, 2), duration: 2, easing: linear }
  }

  circle fader {
    position: (320, 100)
    radius: 10
    color: magenta
    animate { property: alpha, to: 0.25, duration: 2, easing: linear }
  }
}
`;

describe("applySnapshot", () => {
  it("round-trips: applying a frame's snapshot moves the tree to exactly that state", () => {
    // `sampleFrames` leaves `root` at frame[frames.length - 1]'s exact state
    // (the loop's last iteration snapshots the tree immediately after the
    // last tick, with no further mutation) — so applying that same last
    // frame straight after sampling is a no-op *before* `applySnapshot` runs
    // at all, and would pass identically with an empty function body. Moving
    // the tree to an earlier frame first makes the final apply a real write.
    const ir = irFor(SOURCE);
    const result = planExport(ir, { fps: 30 });
    if (!result.ok) throw new Error("plan failed");
    const world = new MatterWorld(ir.width, ir.height);
    const root = buildRoot(ir);
    const runtime = new SceneRuntime(world, root);
    const frames = sampleFrames(runtime, root, result.plan);
    const last = frames[frames.length - 1];

    applySnapshot(root, frames[0]);
    // Guard the guard: if frame 0 and the last frame coincided, the
    // assertion below would pass whether or not this second apply did
    // anything.
    expect(JSON.stringify(snapshotFor(root))).not.toBe(JSON.stringify(last.objects));

    applySnapshot(root, last);
    expect(snapshotFor(root)).toEqual(last.objects);

    runtime.destroy();
  });

  it("moves the tree to an earlier frame's state", () => {
    const ir = irFor(SOURCE);
    const result = planExport(ir, { fps: 30 });
    if (!result.ok) throw new Error("plan failed");
    const world = new MatterWorld(ir.width, ir.height);
    const root = buildRoot(ir);
    const runtime = new SceneRuntime(world, root);
    const frames = sampleFrames(runtime, root, result.plan);

    applySnapshot(root, frames[0]);
    // Ids are scope-qualified (`typeChecker/builder.ts`), so the bare declared
    // name never matches — same correction the snapshot-shape tests above make.
    const slider = snapshotFor(root).find((o) => o.id === "scene.slider")!;
    expect(slider.x).toBeCloseTo(100, 6);

    // …and on the container itself, not only in the layout bookkeeping.
    // `snapshotFor` reads `layout.currentPos`, so the assertion above holds
    // even if nothing is ever pushed onto the container — an object that moves
    // in the JSON and stands still in the PNG, which is precisely the class of
    // failure this task exists to prevent. `__updateLayout()` is what pushes
    // it, and this is the assertion that fails when that call is dropped.
    expect(containerFor(root, "scene.slider").position.x).toBeCloseTo(100, 6);
    expect(containerFor(root, "scene.slider").position.y).toBeCloseTo(100, 6);

    runtime.destroy();
  });

  it("restores rotation, scale and alpha, not only position", () => {
    const ir = irFor(MOTION_SOURCE);
    const result = planExport(ir, { fps: 30 });
    if (!result.ok) throw new Error("plan failed");
    const world = new MatterWorld(ir.width, ir.height);
    const root = buildRoot(ir);
    const runtime = new SceneRuntime(world, root);
    const frames = sampleFrames(runtime, root, result.plan);

    // Sampling leaves the tree at the LAST frame, so rewinding to a
    // mid-animation frame is a real move on every one of the three properties.
    const mid = frames[20];
    const end = frames[frames.length - 1];
    const fieldOf = (
      fs: ReadonlyArray<{ id: string; rotation: number; scaleX: number; alpha: number }>,
      id: string,
    ) => fs.find((o) => o.id === id)!;
    // Guard the guard: if the fixture stopped animating, the assertion below
    // would pass by coincidence rather than by restoration (AGENT-LESSONS §2a).
    expect(fieldOf(mid.objects, "scene.spinner").rotation)
      .not.toBeCloseTo(fieldOf(end.objects, "scene.spinner").rotation, 6);
    expect(fieldOf(mid.objects, "scene.grower").scaleX)
      .not.toBeCloseTo(fieldOf(end.objects, "scene.grower").scaleX, 6);
    expect(fieldOf(mid.objects, "scene.fader").alpha)
      .not.toBeCloseTo(fieldOf(end.objects, "scene.fader").alpha, 6);

    applySnapshot(root, mid);
    expect(snapshotFor(root)).toEqual(mid.objects);
    // Scale's own write-through, for the reason spelled out in the test above.
    expect(containerFor(root, "scene.grower").scale.x)
      .toBeCloseTo(fieldOf(mid.objects, "scene.grower").scaleX, 6);

    runtime.destroy();
  });
});
