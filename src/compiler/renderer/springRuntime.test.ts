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
});

describe("spring overshoot is clamped to the ranges scale and alpha allow", () => {
  it("never reads a scale below 0 on any tick, and ends on the double every easing ends on", () => {
    // At bounce 0.9 the curve peaks near 1.73, so the unclamped lerp from 1
    // toward 0.05 would reach about 1 - 0.95 * 1.73, well below zero.
    const peak = Math.max(...Array.from({ length: 121 }, (_, k) => evaluateEasing(k / 120, "spring", null, 0.9)));
    expect(1 + (0.05 - 1) * peak).toBeLessThan(-0.5);

    const source = `scene {
  size: (400, 300)
  circle c {
    position: (200, 150)
    radius: 20
    animate { property: scale, from: 1, to: 0.05, duration: 1, easing: spring, bounce: 0.9 }
  }
}`;
    const { runtime, obj } = build(source);
    const layout = obj.__mareyLayout!;
    let clampedTicks = 0;
    for (let tick = 1; tick <= 120; tick++) {
      step(runtime);
      expect(layout.currentScale.x, `scale x at tick ${tick}`).toBeGreaterThanOrEqual(0);
      expect(layout.currentScale.y, `scale y at tick ${tick}`).toBeGreaterThanOrEqual(0);
      if (layout.currentScale.x === 0) clampedTicks++;
    }
    // The clamp did act, on more than one tick.
    expect(clampedTicks).toBeGreaterThan(1);
    // The end is the runner's lerp at eased progress exactly 1, which every
    // easing shares: 1 + (0.05 - 1) rounds to 0.050000000000000044, not 0.05.
    // The spring lands on the same double an easeOut does.
    const easeOut = build(source.replace("easing: spring, bounce: 0.9", "easing: easeOut"));
    for (let tick = 1; tick <= 120; tick++) step(easeOut.runtime);
    const end = 1 + (0.05 - 1) * 1;
    expect(easeOut.obj.__mareyLayout!.currentScale).toEqual({ x: end, y: end });
    expect(layout.currentScale).toEqual({ x: end, y: end });
    expect(Math.abs(layout.currentScale.x - 0.05)).toBeLessThan(1e-15);
  });

  it("never reads an alpha above 1 or below 0", () => {
    const trace = (from: number, to: number) => {
      const { runtime, obj } = build(`scene {
  size: (400, 300)
  circle c {
    position: (200, 150)
    radius: 20
    animate { property: alpha, from: ${from}, to: ${to}, duration: 1, easing: spring, bounce: 0.5 }
  }
}`);
      const out: number[] = [];
      for (let tick = 1; tick <= 120; tick++) {
        step(runtime);
        out.push(obj.alpha);
      }
      return out;
    };
    // Unclamped, bounce 0.5 overshoots by about 16% of the travel.
    const up = trace(0, 1);
    expect(Math.max(...up)).toBe(1);
    expect(up.filter((a) => a === 1).length).toBeGreaterThan(1);
    expect(up[119]).toBe(1);
    const down = trace(1, 0);
    expect(Math.min(...down)).toBe(0);
    expect(down.filter((a) => a === 0).length).toBeGreaterThan(1);
    expect(down[119]).toBe(0);
  });
});
