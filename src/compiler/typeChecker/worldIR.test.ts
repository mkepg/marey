import { describe, it, expect } from "vitest";
import { compileSource } from "../compileSource";
import type { IRPhysics, IRSceneNode } from "../sceneIR";

function irOf(src: string): IRSceneNode {
  const out = compileSource(src);
  expect(out.errors).toEqual([]);
  return out.ir!;
}

function scene(body: string, world = ""): string {
  return `scene {\n  size: (800, 600)\n${world}\n${body}\n}`;
}

function worldWith(inner: string): string {
  return `  world { ${inner} }`;
}

function crate(physics: string, name = "crate"): string {
  return `  rectangle ${name} {\n    position: (200, 200)\n    size: (50, 50)\n    physics { ${physics} }\n  }`;
}

function physicsOf(ir: IRSceneNode, id = "scene.crate"): IRPhysics {
  return ir.registry[id].props.physics!;
}

describe("IR: walls, locks, spin and world gravity", () => {
  it("defaults: four walls, gravity (0, 980), no lock, no spin", () => {
    const ir = irOf(scene(crate("duration: 2")));
    expect(ir.walls).toEqual(["left", "right", "top", "bottom"]);
    const ph = physicsOf(ir);
    expect(ph.gravity).toEqual({ x: 0, y: 980 });
    expect(ph.lockPosition).toBe(false);
    expect(ph.lockRotation).toBe(false);
    expect(ph.spin).toBe(0);
  });

  it("world gravity is the fallback; a block's own gravity wins", () => {
    const w = worldWith("gravity: (0, 300)");
    expect(physicsOf(irOf(scene(crate("duration: 2"), w))).gravity).toEqual({ x: 0, y: 300 });
    expect(physicsOf(irOf(scene(crate("duration: 2, gravity: (0, -200)"), w))).gravity).toEqual({ x: 0, y: -200 });
  });

  it("world gravity reaches physics steps in a sequence and in a parallel", () => {
    const src = scene(
      `  rectangle crate {
    position: (200, 200)
    size: (50, 50)
    sequence {
      physics { duration: 1 }
      parallel {
        physics { duration: 1 }
        animate { property: alpha, to: 0.5, duration: 1 }
      }
      physics { duration: 1, gravity: (5, 6) }
    }
  }`,
      worldWith("gravity: (0, 300)"),
    );
    const steps = irOf(src).registry["scene.crate"].props.sequences[0].steps;
    expect((steps[0] as IRPhysics).gravity).toEqual({ x: 0, y: 300 });
    const par = steps[1] as { steps: ReadonlyArray<IRPhysics> };
    expect(par.steps[0].gravity).toEqual({ x: 0, y: 300 });
    expect((steps[2] as IRPhysics).gravity).toEqual({ x: 5, y: 6 });
  });

  it("walls come out in canonical order, and [] means none", () => {
    expect(irOf(scene("", worldWith("bounds: [bottom, left]"))).walls).toEqual(["left", "bottom"]);
    expect(irOf(scene("", worldWith("bounds: []"))).walls).toEqual([]);
    expect(irOf(scene("", worldWith("gravity: (0, 1)"))).walls).toEqual(["left", "right", "top", "bottom"]);
  });

  it("a locked block is written as what the body does", () => {
    const expected = {
      velocity: { x: 0, y: 0 },
      gravity: { x: 0, y: 0 },
      airDrag: 0,
      bounce: 0.4,
      collideBounds: true,
      duration: "indefinitely",
      lockPosition: true,
      lockRotation: false,
      spin: 0,
    };
    expect(physicsOf(irOf(scene(crate("lockPosition: true, bounce: 0.4"))))).toEqual(expected);
    expect(
      physicsOf(irOf(scene(crate("lockPosition: true, bounce: 0.4"), worldWith("gravity: (0, 500)")))),
    ).toEqual(expected);
  });

  it("spin and lockRotation pass through", () => {
    const spun = physicsOf(irOf(scene(crate("duration: 2, spin: 90"))));
    expect(spun.spin).toBe(90);
    expect(spun.lockRotation).toBe(false);
    const fixed = physicsOf(irOf(scene(crate("duration: 2, lockRotation: true"))));
    expect(fixed.lockRotation).toBe(true);
    expect(fixed.spin).toBe(0);
  });

  it("walls is frozen", () => {
    expect(Object.isFrozen(irOf(scene("", worldWith("bounds: [left]"))).walls)).toBe(true);
    expect(Object.isFrozen(irOf(scene("")).walls)).toBe(true);
  });
});
