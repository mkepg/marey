import { describe, it, expect } from "vitest";
import Matter from "matter-js";
import {
  MATTER_R,
  airDragToFrictionAir,
  pxPerSecToMatter,
  matterToPxPerSec,
  gravityToTickDelta,
  MatterWorld,
  type PhysicsParams,
} from "./physicsWorld";
import { TICK_HZ } from "./clock";

describe("matter-js interop", () => {
  it("resolves the default export with the modules this phase uses", () => {
    expect(typeof Matter.Engine.create).toBe("function");
    expect(typeof Matter.Bodies.circle).toBe("function");
    expect(typeof Matter.Body.setVelocity).toBe("function");
    expect(typeof Matter.Sleeping.update).toBe("function");
    expect(typeof Matter.Vertices.hull).toBe("function");
  });

  it("is the version whose internals spec 6.3 and 6.4 were derived from", () => {
    // This phase depends on Matter internals that are not the documented API:
    // Body._baseDelta normalisation, and the phase order inside Engine.update.
    // If this fails, re-derive the conversions before bumping the dependency.
    expect(Matter.Common._baseDelta).toBe(1000 / 60);
  });
});

/**
 * What the old NativePhysicsEngine did to a velocity over one second:
 * a factor of pow(1 - airDrag, step * 60) applied once per tick, 120 times.
 * This is the oracle the conversion has to reproduce.
 */
function legacyOneSecondDamping(airDrag: number): number {
  let f = 1;
  for (let i = 0; i < TICK_HZ; i++) {
    f *= Math.pow(1 - airDrag, (1 / TICK_HZ) * 60);
  }
  return f;
}

/** What Matter does to a velocity over one second at the given frictionAir. */
function matterOneSecondDamping(frictionAir: number): number {
  let f = 1;
  for (let i = 0; i < TICK_HZ; i++) {
    f *= 1 - frictionAir * MATTER_R;
  }
  return f;
}

describe("airDragToFrictionAir", () => {
  it("reproduces one second of the old engine's damping", () => {
    for (const airDrag of [0, 0.006, 0.05, 0.25, 0.5, 0.9]) {
      const got = matterOneSecondDamping(airDragToFrictionAir(airDrag));
      expect(got).toBeCloseTo(legacyOneSecondDamping(airDrag), 6);
    }
  });

  it("makes airDrag 1.0 a full stop, which the original formula could not", () => {
    // The formula this replaced gave frictionAir 1, i.e. a half-per-tick decay,
    // so "maximum resistance" was unreachable.
    expect(matterOneSecondDamping(airDragToFrictionAir(1))).toBe(0);
  });

  it("leaves a vacuum undamped", () => {
    expect(airDragToFrictionAir(0)).toBe(0);
  });

  it("never damps more than fully in one tick", () => {
    for (const airDrag of [0, 0.5, 1]) {
      const perTick = 1 - airDragToFrictionAir(airDrag) * MATTER_R;
      expect(perTick).toBeGreaterThanOrEqual(0);
      expect(perTick).toBeLessThanOrEqual(1);
    }
  });
});

describe("pxPerSecToMatter", () => {
  it("converts to px per 1/60s, not px per tick", () => {
    // Body.setVelocity normalises against Body._baseDelta = 1000/60,
    // so its units do not follow the tick rate.
    expect(pxPerSecToMatter(600)).toBeCloseTo(10, 9);
  });

  it("round-trips", () => {
    expect(matterToPxPerSec(pxPerSecToMatter(347.5))).toBeCloseTo(347.5, 9);
  });
});

describe("gravityToTickDelta", () => {
  it("reaches the stated acceleration after one second of ticks", () => {
    // 980 px/s^2 for one second is 980 px/s, which in Matter units is 980/60.
    const perTick = gravityToTickDelta(980);
    expect(perTick * TICK_HZ).toBeCloseTo(pxPerSecToMatter(980), 9);
  });
});

const VACUUM: PhysicsParams = {
  gravityX: 0,
  gravityY: 0,
  airDrag: 0,
  bounce: 0,
  collideBounds: true,
};

/** An isoceles triangle whose centroid sits well below its bbox centre. */
const TRIANGLE = [
  { x: 0, y: -30 },
  { x: 26, y: 15 },
  { x: -26, y: 15 },
];

describe("MatterWorld body lifecycle", () => {
  it("reports a circle back at the position it was given", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 100, 200, 0, VACUUM);
    expect(w.readState("a", 0)).toEqual({ x: 100, y: 200, angle: 0 });
    w.destroy();
  });

  it("returns null for an unknown id rather than throwing", () => {
    const w = new MatterWorld(800, 600);
    expect(w.readState("nope", 0)).toBe(null);
    expect(w.hasBody("nope")).toBe(false);
    w.destroy();
  });

  it("forgets a removed body", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 100, 200, 0, VACUUM);
    w.removeBody("a");
    expect(w.hasBody("a")).toBe(false);
    expect(w.readState("a", 0)).toBe(null);
    w.destroy();
  });

  it("reports a polygon at its bbox centre, not its centroid", () => {
    // Without the D15 offset this comes back ~5px low, and the drawn shape
    // would drift off its collision shape as soon as the body rotates.
    const w = new MatterWorld(800, 600);
    w.addBody("t", { kind: "polygon", points: TRIANGLE }, 400, 300, 0, VACUUM);
    const s = w.readState("t", 0)!;
    expect(s.x).toBeCloseTo(400, 6);
    expect(s.y).toBeCloseTo(300, 6);
    w.destroy();
  });

  it("rotates the polygon offset with the body", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("t", { kind: "polygon", points: TRIANGLE }, 400, 300, 0, VACUUM);
    w.overrideAngle("t", Math.PI / 2);
    w.step();
    const s = w.readState("t", 1)!;
    // The bbox centre is still the bbox centre after a quarter turn about the
    // centre of mass — it just orbits, so it must not read back as (400, 300).
    expect(s.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(Math.hypot(s.x - 400, s.y - 300)).toBeGreaterThan(1);
    w.destroy();
  });

  it("round-trips a position through setPosition for a polygon", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("t", { kind: "polygon", points: TRIANGLE }, 400, 300, 0, VACUUM);
    w.pin("t", "NO_RUNNER");
    w.setPosition("t", 120, 90);
    const s = w.readState("t", 1)!;
    expect(s.x).toBeCloseTo(120, 6);
    expect(s.y).toBeCloseTo(90, 6);
    w.destroy();
  });
});

describe("MatterWorld walls", () => {
  it("stops a falling body with collideBounds", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 20 }, 400, 100,
      0, { ...VACUUM, gravityY: 2000 });
    for (let i = 0; i < 600; i++) w.step();
    const s = w.readState("a", 1)!;
    expect(s.y).toBeLessThanOrEqual(600);
    expect(s.y).toBeGreaterThan(500);
    w.destroy();
  });

  it("lets a body fall straight through without collideBounds", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 20 }, 400, 100,
      0, { ...VACUUM, gravityY: 2000, collideBounds: false });
    for (let i = 0; i < 600; i++) w.step();
    expect(w.readState("a", 1)!.y).toBeGreaterThan(600);
    w.destroy();
  });

  it("still collides two bodies with each other when neither uses collideBounds", () => {
    // collideBounds toggles only the wall category. Objects always see objects.
    const w = new MatterWorld(800, 600);
    const params = { ...VACUUM, collideBounds: false };
    w.addBody("lower", { kind: "circle", radius: 20 }, 400, 300, 0, params);
    w.pin("lower", "FROZEN");
    w.addBody("upper", { kind: "circle", radius: 20 }, 400, 200,
      0, { ...params, gravityY: 2000 });
    for (let i = 0; i < 240; i++) w.step();
    expect(w.readState("upper", 1)!.y).toBeLessThan(300);
    w.destroy();
  });
});

/**
 * Declare-unit velocity of a body, measured from one tick to the next.
 *
 * Note this advances the world by one tick. To measure the velocity at tick N,
 * step N-1 times first.
 */
function measureVelocityPxPerSec(w: MatterWorld, id: string): { x: number; y: number } {
  const before = w.readState(id, 1)!;
  w.step();
  const after = w.readState(id, 1)!;
  return {
    x: (after.x - before.x) * TICK_HZ,
    y: (after.y - before.y) * TICK_HZ,
  };
}

describe("MatterWorld step", () => {
  it("accelerates a body at the stated px/s^2", () => {
    const w = new MatterWorld(800, 6000);
    w.addBody("a", { kind: "circle", radius: 5 }, 400, 100,
      0, { ...VACUUM, gravityY: 980, collideBounds: false });
    // One tick short: the helper's own step is the 120th.
    for (let i = 0; i < TICK_HZ - 1; i++) w.step();
    expect(measureVelocityPxPerSec(w, "a").y).toBeCloseTo(980, 0);
    w.destroy();
  });

  it("keeps a launched body at its launch speed in a vacuum", () => {
    const w = new MatterWorld(8000, 600);
    w.addBody("a", { kind: "circle", radius: 5 }, 100, 300,
      0, { ...VACUUM, collideBounds: false });
    w.setVelocity("a", 600, 0);
    for (let i = 0; i < TICK_HZ; i++) w.step();
    // 600 px/s for one second, with no gravity and no drag.
    expect(w.readState("a", 1)!.x).toBeCloseTo(700, 0);
    w.destroy();
  });

  it("damps a launched body by airDrag over one second", () => {
    const w = new MatterWorld(8000, 600);
    w.addBody("a", { kind: "circle", radius: 5 }, 100, 300,
      0, { ...VACUUM, airDrag: 0.05, collideBounds: false });
    w.setVelocity("a", 600, 0);
    // One tick short: the helper's own step is the 120th.
    for (let i = 0; i < TICK_HZ - 1; i++) w.step();
    // The old engine's oracle: 600 * (1 - airDrag)^60.
    const expected = 600 * Math.pow(1 - 0.05, 60);
    expect(measureVelocityPxPerSec(w, "a").x).toBeCloseTo(expected, 0);
    w.destroy();
  });

  it("holds an overridden angle and releases it back to the solver", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "rectangle", width: 40, height: 20 }, 400, 300,
      0, { ...VACUUM, collideBounds: false });
    w.overrideAngle("a", 1.25);
    for (let i = 0; i < 10; i++) w.step();
    expect(w.readState("a", 1)!.angle).toBeCloseTo(1.25, 9);
    w.overrideAngle("a", null);
    w.step();
    expect(w.readState("a", 1)!.angle).toBeCloseTo(1.25, 9);
    w.destroy();
  });

  it("lets a settled body fall asleep", () => {
    // The whole point of spec 6.4. If gravity is applied as a force this
    // never becomes true, because Sleeping.update force-wakes it every tick.
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 20 }, 400, 100,
      0, { ...VACUUM, gravityY: 980 });
    for (let i = 0; i < TICK_HZ * 6; i++) w.step();
    expect(w.isIdle()).toBe(true);
    w.destroy();
  });

  it("wakes a sleeping body when another lands on it", () => {
    const w = new MatterWorld(800, 600);
    const falling = { ...VACUUM, gravityY: 980 };
    w.addBody("bottom", { kind: "circle", radius: 20 }, 400, 100, 0, falling);
    for (let i = 0; i < TICK_HZ * 6; i++) w.step();
    expect(w.isAsleep("bottom")).toBe(true);

    const restingY = w.readState("bottom", 1)!.y;
    w.addBody("top", { kind: "circle", radius: 20 }, 400, 100, 0, falling);

    // Sample across the whole window rather than at one instant: the pile
    // settles and both bodies re-sleep well inside it.
    let bottomWoke = false;
    for (let i = 0; i < TICK_HZ * 4; i++) {
      w.step();
      if (!w.isAsleep("bottom")) bottomWoke = true;
    }
    expect(bottomWoke).toBe(true);

    // Having been disturbed, it must settle again.
    expect(w.isIdle()).toBe(true);

    // And the stack must not interpenetrate: two r=20 circles rest 40px apart.
    const gap = restingY - w.readState("top", 1)!.y;
    expect(gap).toBeGreaterThan(30);
    w.destroy();
  });

  it("produces an identical state sequence on a second run", () => {
    const run = () => {
      const w = new MatterWorld(800, 600);
      const p = { ...VACUUM, gravityY: 980, bounce: 0.5 };
      w.addBody("a", { kind: "circle", radius: 18 }, 380, 80, 0, p);
      w.addBody("b", { kind: "rectangle", width: 40, height: 40 }, 410, 20, 0.3, p);
      w.addBody("c", { kind: "polygon", points: TRIANGLE }, 395, 160, 0, p);
      const trace: number[] = [];
      for (let i = 0; i < 300; i++) {
        w.step();
        for (const id of ["a", "b", "c"]) {
          const s = w.readState(id, 1)!;
          trace.push(s.x, s.y, s.angle);
        }
      }
      w.destroy();
      return trace;
    };
    expect(run()).toEqual(run());
  });
});

describe("MatterWorld pinning", () => {
  it("holds a pinned body still under gravity", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 400, 100,
      0, { ...VACUUM, gravityY: 980 });
    w.pin("a", "FROZEN");
    for (let i = 0; i < TICK_HZ; i++) w.step();
    expect(w.readState("a", 1)!.y).toBeCloseTo(100, 6);
    w.destroy();
  });

  it("needs every reason released before it moves again", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 400, 100,
      0, { ...VACUUM, gravityY: 980 });
    w.pin("a", "NO_RUNNER");
    w.pin("a", "POS_ANIM");

    w.unpin("a", "NO_RUNNER");
    expect(w.isPinned("a")).toBe(true);
    for (let i = 0; i < 30; i++) w.step();
    expect(w.readState("a", 1)!.y).toBeCloseTo(100, 6);

    w.unpin("a", "POS_ANIM");
    expect(w.isPinned("a")).toBe(false);
    for (let i = 0; i < 30; i++) w.step();
    expect(w.readState("a", 1)!.y).toBeGreaterThan(100);
    w.destroy();
  });

  it("ignores an unpin for a reason that was never applied", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 400, 100,
      0, { ...VACUUM, gravityY: 980 });
    w.pin("a", "FROZEN");
    w.unpin("a", "POS_ANIM");
    expect(w.isPinned("a")).toBe(true);
    w.destroy();
  });

  it("starts from rest when unpinned, not from accumulated velocity", () => {
    const w = new MatterWorld(800, 6000);
    w.addBody("a", { kind: "circle", radius: 10 }, 400, 100,
      0, { ...VACUUM, gravityY: 980, collideBounds: false });
    w.pin("a", "NO_RUNNER");
    for (let i = 0; i < TICK_HZ * 2; i++) w.step();
    w.unpin("a", "NO_RUNNER");
    expect(measureVelocityPxPerSec(w, "a").y).toBeLessThan(20);
    w.destroy();
  });

  it("still bounces off a wall after being pinned and unpinned", () => {
    // Body.setStatic zeroes restitution and restores it from _original on
    // release. If that restore is missed, bounce silently stops working.
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 400, 100,
      0, { ...VACUUM, gravityY: 980, bounce: 0.8 });
    w.pin("a", "FROZEN");
    w.unpin("a", "FROZEN");
    for (let i = 0; i < TICK_HZ * 3; i++) w.step();
    expect(w.readState("a", 1)!.y).toBeLessThan(560);
    w.destroy();
  });
});

describe("MatterWorld scale", () => {
  it("grows the collision shape so a scaled body rests higher", () => {
    const small = new MatterWorld(800, 600);
    small.addBody("a", { kind: "rectangle", width: 40, height: 40 }, 400, 100,
      0, { ...VACUUM, gravityY: 980 });
    for (let i = 0; i < TICK_HZ * 4; i++) small.step();
    const restSmall = small.readState("a", 1)!.y;
    small.destroy();

    const big = new MatterWorld(800, 600);
    big.addBody("a", { kind: "rectangle", width: 40, height: 40 }, 400, 100,
      0, { ...VACUUM, gravityY: 980 });
    big.setScale("a", 2, 2);
    for (let i = 0; i < TICK_HZ * 4; i++) big.step();
    const restBig = big.readState("a", 1)!.y;
    big.destroy();

    expect(restBig).toBeLessThan(restSmall - 15);
  });

  it("is idempotent when the scale does not change", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "rectangle", width: 40, height: 40 }, 400, 300,
      0, { ...VACUUM, collideBounds: false });
    w.setScale("a", 1.5, 1.5);
    const area = w.readState("a", 1)!;
    for (let i = 0; i < 20; i++) w.setScale("a", 1.5, 1.5);
    expect(w.readState("a", 1)).toEqual(area);
    w.destroy();
  });
});

describe("MatterWorld culling", () => {
  it("reports only bodies past the margin", () => {
    const w = new MatterWorld(800, 600);
    w.addBody("inside", { kind: "circle", radius: 10 }, 400, 300, 0, VACUUM);
    w.addBody("nearby", { kind: "circle", radius: 10 }, -400, 300, 0, VACUUM);
    w.addBody("gone", { kind: "circle", radius: 10 }, 400, 2400, 0, VACUUM);
    expect(w.idsOutsideBounds(800).sort()).toEqual(["gone"]);
    w.destroy();
  });

  it("reports nothing when the world is empty", () => {
    const w = new MatterWorld(800, 600);
    expect(w.idsOutsideBounds(800)).toEqual([]);
    w.destroy();
  });
});
