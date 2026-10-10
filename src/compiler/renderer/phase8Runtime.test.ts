import { describe, it, expect } from "vitest";
import { Container } from "pixi.js";
import { buildNode } from "./builder";
import { createWorldForScene } from "./physicsWorld";
import { SceneRuntime } from "./sceneRuntime";
import { compileSource } from "../compileSource";

const guardSources = import.meta.glob(["./adapter.ts", "../export/rasterExport.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Compile a scene and build its runtime the way the sampler's callers do. */
export function build(source: string) {
  const out = compileSource(source);
  if (!out.ir) throw new Error("scene did not compile");
  const ir = out.ir;
  const root = new Container();
  for (const node of ir.children) root.addChild(buildNode(node));
  const world = createWorldForScene(ir);
  const runtime = new SceneRuntime(world, root);
  return { ir, root, world, runtime };
}

export function advance(runtime: SceneRuntime, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    runtime.advanceOneTick();
    runtime.paintExactTick();
  }
}

describe("world bounds", () => {
  it("a scene with bounds: [] lets its body fall out, be culled, and the runtime go idle", () => {
    const { root, world, runtime } = build(`scene {
  size: (400, 300)
  world { bounds: [] }
  circle c {
    position: (200, 50)
    radius: 10
    physics { duration: indefinitely }
  }
}`);
    const id = (root.children[0] as Container & { __body?: string }).__body!;
    expect(id).toBeDefined();
    expect(world.hasBody(id)).toBe(true);
    advance(runtime, 2400);
    expect(world.hasBody(id)).toBe(false);
    expect(runtime.isIdle()).toBe(true);
  });
});

describe("one world factory", () => {
  it("both the live adapter and the raster export build their world through createWorldForScene", () => {
    const entries = Object.entries(guardSources);
    expect(entries).toHaveLength(2);
    for (const [path, text] of entries) {
      expect(text, path).not.toContain("new MatterWorld(");
      expect(text, path).toContain("createWorldForScene(");
    }
  });
});

const bodyOf = (c: Container) => (c as Container & { __body?: string }).__body!;
const posOf = (world: ReturnType<typeof build>["world"], c: Container) => {
  const s = world.readState(bodyOf(c), 1)!;
  return { x: s.x, y: s.y };
};

describe("lockPosition", () => {
  const LEDGE = `scene {
  size: (400, 300)
  rectangle ledge {
    position: (200, 200)
    size: (360, 20)
    physics { lockPosition: true }
  }
  circle ball {
    position: (200, 50)
    radius: 10
    physics { duration: indefinitely }
  }
}`;

  it("(a) a locked ledge does not move and a dropped circle rests on it", () => {
    const { root, world, runtime } = build(LEDGE);
    const [ledge, ball] = root.children as Container[];
    advance(runtime, 600);
    const p = posOf(world, ledge);
    expect(p.x).toBeCloseTo(200, 9);
    expect(p.y).toBeCloseTo(200, 9);
    expect(posOf(world, ball).y).toBeLessThan(200);
  });

  it("(b) a locked body follows its position animation and stays where it ends", () => {
    const { root, world, runtime } = build(`scene {
  size: (400, 300)
  rectangle paddle {
    position: (100, 200)
    size: (40, 20)
    physics { lockPosition: true }
    animate { property: position, to: (300, 200), duration: 1, easing: linear }
  }
  circle ball {
    position: (300, 100)
    radius: 10
    physics { velocity: (0, 50), gravity: (0, 0), duration: indefinitely }
  }
}`);
    const paddle = root.children[0] as Container;
    advance(runtime, 60);
    expect(Math.abs(posOf(world, paddle).x - 200)).toBeLessThan(1e-6);
    advance(runtime, 60);
    expect(Math.abs(posOf(world, paddle).x - 300)).toBeLessThan(1e-6);
    // The ball reaches the paddle after its animation has ended; a paddle
    // that is merely unpinned would be shoved off its mark.
    advance(runtime, 480);
    const end = posOf(world, paddle);
    expect(Math.abs(end.x - 300)).toBeLessThan(1e-6);
    expect(Math.abs(end.y - 200)).toBeLessThan(1e-6);
  });

  it("(c) a locked physics group stays put when a circle lands on it", () => {
    const { root, world, runtime } = build(`scene {
  size: (400, 300)
  group shelf {
    position: (0, 0)
    rectangle left {
      position: (100, 200)
      size: (220, 20)
    }
    rectangle right {
      position: (300, 200)
      size: (220, 20)
    }
    physics { lockPosition: true }
  }
  circle ball {
    position: (200, 50)
    radius: 10
    physics { duration: indefinitely }
  }
}`);
    const shelf = root.children[0] as Container;
    const ball = root.children[1] as Container;
    advance(runtime, 1);
    const before = posOf(world, shelf);
    advance(runtime, 599);
    const after = posOf(world, shelf);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(posOf(world, ball).y).toBeLessThan(200);
  });

  it("(d) the runtime goes idle once the circle sleeps", () => {
    const { runtime } = build(LEDGE);
    advance(runtime, 600);
    expect(runtime.isIdle()).toBe(true);
  });
});

describe("spin", () => {
  it("spin: 360 in a vacuum has turned exactly 2π after 120 ticks", () => {
    const { root, runtime } = build(`scene {
  size: (800, 600)
  world { gravity: (0, 0) }
  rectangle r {
    position: (400, 300)
    size: (40, 40)
    physics { spin: 360, duration: indefinitely }
  }
}`);
    advance(runtime, 120);
    expect(Math.abs((root.children[0] as Container).rotation - 2 * Math.PI)).toBeLessThan(1e-9);
    // Matter alone would have put it to sleep on this very tick.
    expect(runtime.isIdle()).toBe(false);
  });

  it("a spun body that lands and settles on the floor still falls asleep, and the runtime goes idle", () => {
    const { root, world, runtime } = build(`scene {
  size: (800, 600)
  rectangle r {
    position: (400, 300)
    size: (40, 40)
    physics { spin: 360, duration: indefinitely }
  }
}`);
    const id = bodyOf(root.children[0] as Container);
    advance(runtime, 120);
    expect(runtime.isIdle()).toBe(false);
    let idleAt = -1;
    for (let t = 121; t <= 2400 && idleAt < 0; t++) {
      advance(runtime, 1);
      if (runtime.isIdle()) idleAt = t;
    }
    expect(idleAt).toBeGreaterThan(0);
    expect(world.isAsleep(id)).toBe(true);
    // It came to rest on the floor, not in mid-air.
    expect(posOf(world, root.children[0] as Container).y).toBeGreaterThan(560);
  });
});

describe("world gravity", () => {
  /** Vertical speed over the last tick of the first second, in px/s. */
  function speedAfterOneSecond(source: string): number {
    const { root, world, runtime } = build(source);
    const ball = root.children[0] as Container;
    advance(runtime, 119);
    const before = posOf(world, ball).y;
    advance(runtime, 1);
    return (posOf(world, ball).y - before) * 120;
  }

  it("is the gravity of a physics block that has none of its own", () => {
    const vy = speedAfterOneSecond(`scene {
  size: (800, 600)
  world { gravity: (0, 980), bounds: [] }
  circle c {
    position: (400, 50)
    radius: 10
    physics { duration: indefinitely }
  }
}`);
    expect(Math.abs(vy - 980)).toBeLessThan(0.5);
  });

  it("gives way to a block's own gravity", () => {
    const vy = speedAfterOneSecond(`scene {
  size: (800, 600)
  world { gravity: (0, 980), bounds: [] }
  circle c {
    position: (400, 300)
    radius: 10
    physics { gravity: (0, -200), duration: indefinitely }
  }
}`);
    expect(Math.abs(vy - -200)).toBeLessThan(0.5);
  });
});

describe("lockRotation", () => {
  /** A crate dropped corner-first onto a locked ramp, its physics written by `physics`. */
  const rampScene = (crateBody: string) => `scene {
  size: (800, 600)
  rectangle ramp {
    position: (400, 450)
    size: (500, 20)
    rotation: -12
    physics { lockPosition: true }
  }
  rectangle crate {
    position: (400, 200)
    size: (50, 50)
    rotation: 30
    ${crateBody}
  }
}`;

  function dropCrate(crateBody: string) {
    const { root, world, runtime } = build(rampScene(crateBody));
    const crate = root.children[1] as Container;
    const startY = posOf(world, crate).y;
    const angles: number[] = [];
    for (let i = 0; i < 600; i++) {
      advance(runtime, 1);
      angles.push(world.readState(bodyOf(crate), 1)!.angle);
    }
    return { angles, fell: posOf(world, crate).y - startY, rotation: crate.rotation };
  }

  const START = (30 * Math.PI) / 180;

  it("an unlocked crate tips on the ramp, so the locked cases below can tell", () => {
    const free = dropCrate("physics { duration: indefinitely }");
    expect(free.fell).toBeGreaterThan(50);
    expect(Math.abs(free.angles.at(-1)! - START)).toBeGreaterThan(0.1);
  });

  it("a locked crate keeps its angle exactly for 600 ticks while it falls onto a locked ramp", () => {
    const locked = dropCrate("physics { lockRotation: true, duration: indefinitely }");
    expect(locked.fell).toBeGreaterThan(50);
    for (const a of locked.angles) expect(a).toBe(locked.angles[0]);
    expect(Math.abs(locked.angles[0] - START)).toBeLessThan(1e-12);
    expect(Math.abs(locked.rotation - START)).toBeLessThan(1e-12);
  });

  it("a lock in a sequence step holds too, though the step's params arrive while the body is pinned", () => {
    const locked = dropCrate("sequence { physics { lockRotation: true, duration: 5 } }");
    expect(locked.fell).toBeGreaterThan(50);
    for (const a of locked.angles) expect(a).toBe(locked.angles[0]);
  });

  it("a lock holds through a scale animation, which recomputes the body's inertia every tick", () => {
    const locked = dropCrate(`physics { lockRotation: true, duration: indefinitely }
    animate { property: scale, to: (1.5, 1.5), duration: 2 }`);
    expect(locked.fell).toBeGreaterThan(50);
    for (const a of locked.angles) expect(a).toBe(locked.angles[0]);
  });

  it("a lock that reaches a body already free holds too: the second of two physics blocks in one parallel step", () => {
    // The first block's spawn releases the body's pin, so the second block's
    // params land on a dynamic body and no unpin follows them.
    const locked = dropCrate(
      "sequence { parallel { physics { duration: 5 } physics { lockRotation: true, duration: 5 } } }"
    );
    expect(locked.fell).toBeGreaterThan(50);
    for (const a of locked.angles) expect(a).toBe(locked.angles[0]);
  });
});
