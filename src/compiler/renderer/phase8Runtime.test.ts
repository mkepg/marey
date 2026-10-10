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
