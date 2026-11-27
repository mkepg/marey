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

  it("moves the body to a first step's from at tick 0, and holds it there until the step runs", () => {
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
    // Tick 0, before any tick or paint: nothing precedes the first step, so
    // its from is already on the body and the drawing.
    expect(world.readState(id, 1)).toMatchObject({ x: 100, y: 100 });
    expect(layoutPos(obj)).toEqual({ x: 100, y: 100 });
    // The sequence schedules its first step at the end of tick 1; the delay
    // of 60 ticks then holds from through tick 61.
    for (let tick = 1; tick <= 61; tick++) {
      step(runtime);
      expect(world.readState(id, 1), `body at tick ${tick}`).toMatchObject({ x: 100, y: 100 });
      expect(layoutPos(obj), `drawing at tick ${tick}`).toEqual({ x: 100, y: 100 });
    }
    step(runtime);
    expect(world.readState(id, 1)!.x).toBeCloseTo(100 + 100 / 60, 9);
  });
});

describe("from: on a sequence's first step", () => {
  // The first step is scheduled at the end of tick 1 and runs ticks 2..61.
  const FIRST = `scene {
  size: (200, 200)
  circle c {
    position: (100, 100)
    radius: 10
    alpha: 1
    sequence {
      animate { property: alpha, from: 0, to: 1, duration: 0.5, easing: linear }
    }
  }
}`;

  it("shows from at tick 0, and the motion still starts one tick later", () => {
    const trace = alphaTrace(FIRST, 61);
    expect(trace[0]).toBe(0);
    expect(trace[1]).toBe(0);
    expect(trace[2]).toBeCloseTo(1 / 60, 12);
    expect(trace[31]).toBeCloseTo(0.5, 12);
    expect(trace[61]).toBe(1);
  });

  it("changes nothing after tick 0: every later tick matches a scene whose resting value is from", () => {
    // The same sequence on an object that already rests at 0 is the
    // reference: tick 0 was the only frame that differed.
    const reference = alphaTrace(FIRST.replace("alpha: 1\n", "alpha: 0\n"), 61);
    expect(alphaTrace(FIRST, 61)).toEqual(reference);
  });

  it("shows every from in a first parallel step at tick 0, and leaves an animation without from alone", () => {
    const { obj } = build(`scene {
  size: (200, 200)
  circle c {
    position: (100, 100)
    radius: 10
    alpha: 1
    sequence {
      parallel {
        animate { property: alpha, from: 0, to: 1, duration: 0.5 }
        animate { property: scale, from: 0.25, to: 1, duration: 0.5, easing: spring, bounce: 0.5 }
        animate { property: rotation, to: 90, duration: 0.5 }
      }
    }
  }
}`);
    expect(obj.alpha).toBe(0);
    expect(obj.__mareyLayout!.currentScale).toEqual({ x: 0.25, y: 0.25 });
    expect(obj.rotation).toBe(0);
  });

  it("places a scaled body at tick 0 exactly where the step's own spawn places it", () => {
    // A bottom origin puts the pivot off the body's centre, so a scale from
    // must also move the body; the tick-0 write has to make the same
    // correction the step makes when it is scheduled at the end of tick 1.
    const { world, runtime, obj } = build(`scene {
  size: (400, 300)
  rectangle r {
    position: (200, 200)
    size: (40, 40)
    origin: (0.5, 1)
    sequence {
      animate { property: scale, from: 0.5, to: 1, duration: 0.5, delay: 0.5, easing: linear }
      physics { duration: 1 }
    }
  }
}`);
    const id = bodyOf(obj);
    const atZero = world.readState(id, 1)!;
    step(runtime);
    const atOne = world.readState(id, 1)!;
    expect(atZero.x).toBe(atOne.x);
    expect(atZero.y).toBe(atOne.y);
    // And it is not the declared placement: the half-size body sits lower.
    expect(atZero.y).toBeCloseTo(190, 9);
  });

  it("holds a delayed first step at from from tick 0 through the delay", () => {
    // delay 0.5 s is 60 ticks after the step is scheduled at the end of tick 1.
    const trace = alphaTrace(FIRST.replace("easing: linear", "easing: linear, delay: 0.5"), 122);
    for (let tick = 0; tick <= 61; tick++) expect(trace[tick], `tick ${tick}`).toBe(0);
    expect(trace[62]).toBeCloseTo(1 / 60, 12);
    expect(trace[121]).toBe(1);
  });

  it("does not show a first step's from at tick 0 when a top-level animation runs before the sequence", () => {
    // The sequence waits for the top-level animation, so its first step is
    // scheduled after it like any later step: at the end of tick 60, the
    // tick the rotation completes on.
    const trace = alphaTrace(`scene {
  size: (200, 200)
  circle c {
    position: (100, 100)
    radius: 10
    alpha: 1
    animate { property: rotation, to: 90, duration: 0.5 }
    sequence {
      animate { property: alpha, from: 0, to: 1, duration: 0.5, easing: linear }
    }
  }
}`, 62);
    for (let tick = 0; tick <= 59; tick++) expect(trace[tick], `tick ${tick}`).toBe(1);
    expect(trace[60]).toBe(0);
    expect(trace[61]).toBeCloseTo(1 / 60, 12);
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

describe("from: converted the way 'to' is", () => {
  // `from` reaches the runner through `runnerValue`, as `to` does. Without the
  // conversion a rotation would start at 90 radians and a colour at a string.
  it("starts a rotation at from in radians at tick 0", () => {
    const { obj } = build(`scene {
  size: (200, 200)
  circle c {
    position: (100, 100)
    radius: 10
    animate { property: rotation, from: 90, to: 180, duration: 1 }
  }
}`);
    expect(obj.rotation).toBe(Math.PI / 2);
  });

  it("starts a colour at from as an integer at tick 0", () => {
    const { obj } = build(`scene {
  size: (200, 200)
  circle c {
    position: (100, 100)
    radius: 10
    color: blue
    animate { property: color, from: #ff0000, to: blue, duration: 1 }
  }
}`);
    expect(obj.__mareyLayout!.currentColor).toBe(0xff0000);
  });
});
