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
