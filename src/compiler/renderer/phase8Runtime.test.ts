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

describe("a pinned body that moves wakes the bodies asleep against it", () => {
  /** A 40 px crate dropped onto a locked paddle under 980 px/s² of world gravity. */
  const scene = (paddle: string, crateX = 300) => `scene {
  size: (800, 600)
  duration: 9
  world { gravity: (0, 980) }
  rectangle paddle {
    ${paddle}
  }
  rectangle crate {
    position: (${crateX}, 300), size: (40, 40), color: yellow
    physics { bounce: 0.1, duration: indefinitely }
  }
}`;
  const WIDE = "position: (300, 400), size: (400, 14), color: orange\n    physics { lockPosition: true }";
  /** Where a 40 px crate rests on the floor of a 600 px scene. */
  const FLOOR_Y = 580;

  function run(source: string) {
    const { root, world, runtime } = build(source);
    const [paddle, crate] = root.children as Container[];
    return { world, runtime, paddle, crate, crateId: bodyOf(crate) };
  }

  it("a crate the paddle slides out from under falls instead of hanging where it slept", () => {
    // The reproduction from the Ledges work: without a wake, the crate fell
    // asleep on the moving paddle at tick 182, at (300, 373), and stayed there,
    // touching nothing, for the rest of the scene.
    const { world, runtime, crate, crateId } = run(scene(
      `${WIDE}
    animate { property: position, to: (560, 400), duration: 3, easing: easeInOut, loop: true, yoyo: true }`
    ));
    // A body touching a pinned body that moves is held awake, so the crate is
    // awake on every tick until it has fallen. By tick 360 the paddle's left
    // edge (x 360) is past the crate's right edge (x 320).
    for (let t = 1; t <= 360; t++) {
      advance(runtime, 1);
      expect(world.isAsleep(crateId), `tick ${t}`).toBe(false);
    }
    expect(posOf(world, crate).y).toBeGreaterThan(400);
    advance(runtime, 720);
    expect(Math.abs(posOf(world, crate).y - FLOOR_Y)).toBeLessThan(1);
    expect(world.isAsleep(crateId)).toBe(true);
  });

  it("a crate asleep on a locked paddle that does not move stays asleep", () => {
    // Twice: once with no animation at all, and once with a position animation
    // to where the paddle already is, which pushes an unchanged position every tick.
    for (const paddle of [WIDE, `${WIDE}\n    animate { property: position, to: (300, 400), duration: 9 }`]) {
      const { world, runtime, crateId } = run(scene(paddle));
      let firstAsleep = -1;
      for (let t = 1; t <= 1080; t++) {
        advance(runtime, 1);
        if (firstAsleep < 0 && world.isAsleep(crateId)) firstAsleep = t;
        if (firstAsleep > 0) expect(world.isAsleep(crateId), `tick ${t}`).toBe(true);
      }
      expect(firstAsleep).toBeGreaterThan(0);
      expect(firstAsleep).toBeLessThan(240);
    }
  });

  /** Runs a scene whose paddle starts moving at 2 s, after the crate has fallen asleep on it. */
  function afterSleeping(source: string) {
    const r = run(source);
    advance(r.runtime, 230);
    expect(r.world.isAsleep(r.crateId)).toBe(true);
    advance(r.runtime, 850);
    return r;
  }

  it("a paddle lowered from under a sleeping crate takes the crate down with it", () => {
    // The paddle drops 0.42 px a tick, far more than the 0.025 px the crate
    // rests sunk into it, so only a contact taken before the move sees the crate.
    const { world, crate } = afterSleeping(scene(
      `${WIDE}
    animate { property: position, to: (300, 500), duration: 2, delay: 2, easing: linear }`
    ));
    // On the paddle's top face: 500 - 7 - 20.
    expect(Math.abs(posOf(world, crate).y - 473)).toBeLessThan(1);
  });

  it("a crate riding a slowly lowered paddle rides it all the way down", () => {
    // At 10 px/s the paddle drops 0.083 px a tick and the solver carries the
    // crate down by position correction alone, so Matter reads the crate's
    // motion as zero and counts it to sleep while it rides. Left to that
    // count, it fell asleep on the tick a move had just opened a 0.058 px gap
    // under it, out of reach of any contact test, and hung 30 px above the
    // paddle's final top face.
    const { world, crate, crateId } = afterSleeping(scene(
      `${WIDE}
    animate { property: position, to: (300, 440), duration: 4, delay: 2, easing: linear }`
    ));
    // On the paddle's top face: 440 - 7 - 20.
    expect(Math.abs(posOf(world, crate).y - 413)).toBeLessThan(1);
    expect(world.isAsleep(crateId)).toBe(true);
  });

  it("a paddle tilted away from under a sleeping crate lets it go", () => {
    const { world, crate } = afterSleeping(scene(
      `${WIDE}
    animate { property: rotation, to: 30, duration: 2, delay: 2 }`,
      440
    ));
    expect(posOf(world, crate).y).toBeGreaterThan(450);
  });

  it("a paddle shrunk from under a sleeping crate lets it go", () => {
    // Half as wide, it spans x 200 to 400; the crate spans 420 to 460.
    const { world, crate } = afterSleeping(scene(
      `${WIDE}
    animate { property: scale, to: (0.5, 1), duration: 2, delay: 2 }`,
      440
    ));
    expect(Math.abs(posOf(world, crate).y - FLOOR_Y)).toBeLessThan(1);
  });

  it("a paddle whose last move ends inside a sleeping crate pushes the crate out", () => {
    // The crate sleeps on the floor spanning x 280 to 320. The paddle's right
    // edge moves 1.34 px a tick and stops at 280.5: one tick earlier it was at
    // 279.2, clear of the crate, so only a contact taken after the move sees it.
    const { world, runtime, paddle, crateId } = run(scene(
      `position: (100, 575), size: (40, 14), color: orange
    physics { lockPosition: true }
    animate { property: position, to: (260.5, 575), duration: 1, delay: 2, easing: linear }`
    ));
    advance(runtime, 230);
    expect(world.isAsleep(crateId)).toBe(true);
    advance(runtime, 850);
    const overlap = world.boundsOf(bodyOf(paddle))!.max.x - world.boundsOf(crateId)!.min.x;
    expect(Math.abs(posOf(world, paddle).x - 260.5)).toBeLessThan(1e-9);
    expect(overlap).toBeLessThan(0.1);
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

describe("exit criteria measured through the compiled pipeline", () => {
  it("a locked paddle is at its animation's value on every tick and stays there afterwards", () => {
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
    let worst = 0;
    for (let tick = 1; tick <= 300; tick++) {
      advance(runtime, 1);
      const expectedX = 100 + (200 * Math.min(tick, 120)) / 120;
      const p = posOf(world, paddle);
      worst = Math.max(worst, Math.abs(p.x - expectedX), Math.abs(p.y - 200));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it("bounds: [left, right, bottom] lets a body start above the scene, fall in and rest on the floor", () => {
    const { root, world, runtime } = build(`scene {
  size: (400, 300)
  world { bounds: [left, right, bottom] }
  circle c {
    position: (200, -100)
    radius: 10
    physics { duration: indefinitely }
  }
}`);
    const c = root.children[0] as Container;
    advance(runtime, 1200);
    const y = posOf(world, c).y;
    expect(y).toBeGreaterThan(280);
    expect(y).toBeLessThanOrEqual(300);
    expect(runtime.isIdle()).toBe(true);
  });
});
