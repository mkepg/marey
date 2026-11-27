import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { buildNode } from "./builder";
import { createWorldForScene } from "./physicsWorld";
import { SceneRuntime } from "./sceneRuntime";
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
  return { root, world, runtime, obj: root.children[0] as Container };
}

/** Advance one tick and paint it exactly, as the frame sampler does. */
function step(runtime: SceneRuntime): void {
  runtime.advanceOneTick();
  runtime.paintExactTick();
}

/** Alpha after each tick from 1 to `ticks`; index 0 is tick 0, read before any tick or paint. */
function alphaTrace(source: string, ticks: number): number[] {
  const { runtime, obj } = build(source);
  const trace = [obj.alpha];
  for (let i = 1; i <= ticks; i++) {
    step(runtime);
    trace.push(obj.alpha);
  }
  return trace;
}

const bodyOf = (c: Container) => (c as Container & { __body?: string }).__body!;
const layoutPos = (c: Container) => {
  const p = c.__mareyLayout!.currentPos;
  return { x: p.x, y: p.y };
};

describe("from: held through the delay", () => {
  // delay 1 s is 120 ticks; the animation then runs ticks 121..240.
  const DELAYED = `scene {
  size: (200, 200)
  circle c {
    position: (100, 100)
    radius: 10
    alpha: 1
    animate { property: alpha, from: 0, to: 1, duration: 1, delay: 1 }
  }
}`;

  it("shows from at once and through the delay, then rises and ends on to", () => {
    const trace = alphaTrace(DELAYED, 240);
    // Tick 0 is read before any tick or paint: from is written when the
    // animation is scheduled, not when its first paint happens.
    expect(trace[0]).toBe(0);
    expect(trace[1]).toBe(0);
    expect(trace[60]).toBe(0);
    expect(trace[119]).toBe(0);
    expect(trace[120]).toBe(0);
    expect(trace[121]).toBeGreaterThan(0);
    expect(trace[180]).toBeGreaterThan(trace[150]);
    expect(trace[180]).toBeLessThan(1);
    expect(trace[240]).toBe(1);
  });
});

describe("from: inside a sequence", () => {
  // Step 1 starts at the end of tick 1 and runs ticks 2..61; step 2 is
  // scheduled at the end of tick 61.
  const SEQ = `scene {
  size: (200, 200)
  circle c {
    position: (100, 100)
    radius: 10
    alpha: 1
    sequence {
      animate { property: alpha, to: 0.5, duration: 0.5, easing: linear }
      animate { property: alpha, from: 0.2, to: 1, duration: 0.5, easing: linear }
    }
  }
}`;

  it("has no effect before its step is scheduled, then starts the step at from", () => {
    const trace = alphaTrace(SEQ, 122);
    expect(trace[0]).toBe(1);
    expect(trace[1]).toBe(1);
    expect(trace[1]).not.toBe(0.2);
    // Step 1 runs from the object's own value, not from step 2's start.
    expect(trace[31]).toBeCloseTo(0.75, 12);
    // Step 2 is scheduled at the end of tick 61 and shows its start there,
    // where step 1 alone would have left 0.5.
    expect(trace[61]).toBe(0.2);
    expect(trace[62]).toBeCloseTo(0.2 + 0.8 / 60, 12);
    expect(trace[121]).toBe(1);
  });
});

describe("from: position under a physics block", () => {
  it("holds the body and the drawing at from through the delay, never at the declared position", () => {
    const { world, runtime, obj } = build(`scene {
  size: (400, 300)
  circle c {
    position: (300, 200)
    radius: 10
    animate { property: position, from: (100, 100), to: (200, 100), duration: 0.5, delay: 0.5, easing: linear }
    sequence { physics { duration: 1 } }
  }
}`);
    const id = bodyOf(obj);
    expect(id).toBeDefined();
    // Tick 0, before any tick or paint: the body was created at the declared
    // position, and scheduling the animation has already moved it to from.
    expect(world.readState(id, 1)).toMatchObject({ x: 100, y: 100 });
    expect(layoutPos(obj)).toEqual({ x: 100, y: 100 });
    // The delay is 60 ticks; through every one of them both read from.
    for (let tick = 1; tick <= 60; tick++) {
      step(runtime);
      expect(world.readState(id, 1), `body at tick ${tick}`).toMatchObject({ x: 100, y: 100 });
      expect(layoutPos(obj), `drawing at tick ${tick}`).toEqual({ x: 100, y: 100 });
    }
    // Then it moves toward to, and the physics step starts from there.
    for (let tick = 61; tick <= 120; tick++) step(runtime);
    expect(world.readState(id, 1)!.x).toBeCloseTo(200, 9);
    expect(world.readState(id, 1)!.y).toBeCloseTo(100, 9);
  });

  it("moves the body to from when a sequence step schedules it, not one tick later", () => {
    const { world, runtime, obj } = build(`scene {
  size: (400, 300)
  circle c {
    position: (300, 200)
    radius: 10
    sequence {
      animate { property: position, from: (100, 100), to: (200, 100), duration: 0.5, delay: 0.5, easing: linear }
      physics { duration: 1 }
    }
  }
}`);
    const id = bodyOf(obj);
    // Before the step is scheduled, from has no effect.
    expect(world.readState(id, 1)).toMatchObject({ x: 300, y: 200 });
    // The sequence schedules its first step at the end of tick 1.
    step(runtime);
    expect(world.readState(id, 1)).toMatchObject({ x: 100, y: 100 });
    for (let tick = 2; tick <= 61; tick++) {
      step(runtime);
      expect(world.readState(id, 1), `body at tick ${tick}`).toMatchObject({ x: 100, y: 100 });
    }
  });
});

describe("from: loop and yoyo", () => {
  it("restarts each loop cycle at from", () => {
    // Without from this animation would run from 1 to 1 and never move.
    const trace = alphaTrace(`scene {
  size: (200, 200)
  circle c {
    position: (100, 100)
    radius: 10
    alpha: 1
    animate { property: alpha, from: 0, to: 1, duration: 1, easing: linear, loop: true }
  }
}`, 360);
    expect(trace[0]).toBe(0);
    expect(trace[60]).toBeCloseTo(0.5, 12);
    // Each wrap tick paints the start of the next cycle.
    expect(trace[120]).toBe(0);
    expect(trace[180]).toBeCloseTo(0.5, 12);
    expect(trace[240]).toBe(0);
    expect(trace[360]).toBe(0);
  });

  it("returns a yoyo to from and ends there", () => {
    const trace = alphaTrace(`scene {
  size: (200, 200)
  circle c {
    position: (100, 100)
    radius: 10
    alpha: 1
    animate { property: alpha, from: 0, to: 0.6, duration: 1, easing: linear, yoyo: true }
  }
}`, 300);
    expect(trace[0]).toBe(0);
    expect(trace[120]).toBeCloseTo(0.6, 12);
    expect(trace[180]).toBeCloseTo(0.3, 12);
    expect(trace[240]).toBe(0);
    expect(trace[300]).toBe(0);
  });
});
