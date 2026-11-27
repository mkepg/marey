import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { buildNode } from "./builder";
import { createWorldForScene } from "./physicsWorld";
import { SceneRuntime } from "./sceneRuntime";
import { evaluateEasing } from "./easing";
import { compileSource } from "../compileSource";

/** Compile a scene and build its runtime the way the sampler's callers do. */
function build(source: string) {
  const out = compileSource(source);
  if (!out.ir) {
    throw new Error(`scene did not compile:\n${out.errors.map((e) => e.message).join("\n")}`);
  }
  const root = new Container();
  for (const node of out.ir.children) root.addChild(buildNode(node));
  const world = createWorldForScene(out.ir);
  const runtime = new SceneRuntime(world, root);
  return { world, runtime, obj: root.children[0] as Container };
}

/** Advance one tick and paint it exactly, as the frame sampler does. */
function step(runtime: SceneRuntime): void {
  runtime.advanceOneTick();
  runtime.paintExactTick();
}

const bodyOf = (c: Container) => (c as Container & { __body?: string }).__body!;

/**
 * The eased value a spring with `bounce` gives at tick `k` of `n`. Every test
 * here uses bounce 0.5, not the default 0.25, so a call site that drops
 * `bounce` evaluates a different curve and fails.
 */
const sprung = (from: number, to: number, k: number, n: number) =>
  from + (to - from) * evaluateEasing(k / n, "spring", null, 0.5);

describe("spring easing at runtime", () => {
  it("ends every loop-and-yoyo cycle exactly where the first one does, with no drift", () => {
    // 0.5 s is 60 ticks a leg, so one cycle (out and back) is 120 ticks.
    const { runtime, obj } = build(`scene {
  size: (400, 300)
  circle c {
    position: (100, 100)
    radius: 10
    animate { property: position, to: (300, 100), duration: 0.5, easing: spring, bounce: 0.5, loop: true, yoyo: true }
  }
}`);
    const trace = [obj.__mareyLayout!.currentPos.x];
    for (let tick = 1; tick <= 600; tick++) {
      step(runtime);
      trace.push(obj.__mareyLayout!.currentPos.x);
    }
    for (let cycle = 0; cycle < 5; cycle++) {
      // Each leg ends exactly on its end value.
      expect(trace[cycle * 120 + 60], `cycle ${cycle + 1} far end`).toBe(300);
      expect(trace[cycle * 120 + 120], `cycle ${cycle + 1} return`).toBe(100);
      // And every tick of every cycle repeats the first cycle bit for bit.
      for (let k = 0; k <= 120; k++) {
        expect(trace[cycle * 120 + k], `cycle ${cycle + 1} tick ${k}`).toBe(trace[k]);
      }
    }
    // The painted value follows the spring with this animation's bounce
    // (applyAnim's call site).
    for (let k = 1; k < 60; k++) expect(trace[k], `tick ${k}`).toBeCloseTo(sprung(100, 300, k, 60), 9);
    // The spring overshoots its far end on the way out.
    expect(Math.max(...trace.slice(0, 61))).toBeGreaterThan(300);
  });

  it("pushes the spring with its bounce into the physics world", () => {
    // pushAnimToWorld's call site: the body's position is the runner's own
    // tick-aligned lerp, never the painted one.
    const { world, runtime, obj } = build(`scene {
  size: (400, 300)
  circle c {
    position: (100, 100)
    radius: 10
    animate { property: position, to: (200, 100), duration: 0.5, easing: spring, bounce: 0.5 }
    sequence { physics { duration: 1 } }
  }
}`);
    const id = bodyOf(obj);
    for (let k = 1; k < 60; k++) {
      step(runtime);
      expect(world.readState(id, 1)!.x, `body at tick ${k}`).toBeCloseTo(sprung(100, 200, k, 60), 9);
    }
  });

  it("corrects a bottom-origin body's centre by the spring scale with its bounce", () => {
    // scaleOf's call site. A 40x20 rectangle with origin (0.5, 1) has its
    // body's centre 10 px above its pivot at scale 1, and 10 * sy above at
    // scale sy. The scale runner is declared first and the position runner
    // second, so the position push lands last, and it places the centre by
    // `tickScaleOf`, which asks the scale runner for its own value.
    const { world, runtime, obj } = build(`scene {
  size: (400, 600)
  rectangle r {
    position: (100, 500)
    size: (40, 20)
    origin: (0.5, 1)
    animate { property: scale, to: (1, 3), duration: 0.5, easing: spring, bounce: 0.5 }
    animate { property: position, to: (140, 500), duration: 0.5, easing: linear }
    physics { duration: indefinitely, gravity: (0, 0) }
  }
}`);
    const id = bodyOf(obj);
    for (let k = 1; k < 60; k++) {
      step(runtime);
      const sy = sprung(1, 3, k, 60);
      expect(world.readState(id, 1)!.y, `centre at tick ${k}`).toBeCloseTo(500 - 10 * sy, 9);
    }
  });
});
