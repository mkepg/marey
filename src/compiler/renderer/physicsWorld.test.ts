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

  it("interpolates a held-but-changing angle between ticks instead of snapping", () => {
    // Every other test in this file reads at alpha 0 or 1, which is exactly
    // why applying the override immediately (rather than recording it for
    // step() to apply after capturing prevAngle) was invisible: prevAngle and
    // the current angle only ever differ when you sample a fractional alpha.
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "rectangle", width: 40, height: 20 }, 400, 300,
      0, { ...VACUUM, collideBounds: false });

    w.overrideAngle("a", 0);
    w.step();
    w.overrideAngle("a", 1.0);
    w.step();

    const mid = w.readState("a", 0.5)!.angle;
    expect(mid).toBeCloseTo(0.5, 6);
    expect(mid).not.toBeCloseTo(0, 3);
    expect(mid).not.toBeCloseTo(1.0, 3);
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

  it("takes two releases when two reasons of the same kind hold the pin", () => {
    // Two `animate position` blocks on one object take two holds. A Set
    // collapsed them, so the first to finish handed the body back to the
    // solver while the second was still driving it.
    const w = new MatterWorld(800, 600);
    w.addBody("a", { kind: "circle", radius: 10 }, 100, 100, 0, VACUUM);
    w.pin("a", "POS_ANIM");
    w.pin("a", "POS_ANIM");
    w.unpin("a", "POS_ANIM");
    expect(w.isPinned("a")).toBe(true);
    w.unpin("a", "POS_ANIM");
    expect(w.isPinned("a")).toBe(false);
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

describe("compound bodies (spec D16, D18)", () => {
  it("welds parts into one body whose reference point is the local origin", () => {
    // Two squares either side of the group origin, the right one heavier, so
    // the centre of mass is NOT the origin. That is the whole point of D16:
    // a group's reference point is its origin, not its content's centre.
    const world = new MatterWorld(800, 600);
    world.addBody("g", {
      kind: "compound",
      parts: [
        { kind: "rectangle", width: 20, height: 20, x: -50, y: 0, angle: 0 },
        { kind: "rectangle", width: 60, height: 60, x: 50, y: 0, angle: 0 },
      ],
    }, 400, 100, 0, VACUUM);

    const state = world.readState("g", 1)!;
    expect(state.x).toBeCloseTo(400, 6);
    expect(state.y).toBeCloseTo(100, 6);
    world.destroy();
  });

  it("keeps the reference point on the origin through a rotation", () => {
    const world = new MatterWorld(800, 600);
    world.addBody("g", {
      kind: "compound",
      parts: [
        { kind: "rectangle", width: 20, height: 20, x: -50, y: 0, angle: 0 },
        { kind: "rectangle", width: 60, height: 60, x: 50, y: 0, angle: 0 },
      ],
    }, 400, 100, Math.PI / 2, VACUUM);

    // Rotating 90deg about the centre of mass at (440, 100) carries the origin
    // from (400, 100) to (440, 60). Measured against Matter 0.20.0.
    const state = world.readState("g", 1)!;
    expect(state.x).toBeCloseTo(440, 4);
    expect(state.y).toBeCloseTo(60, 4);
    world.destroy();
  });

  it("collides using the real parts, not the parent's convex hull", () => {
    // An L: the notch must let a small body through. If Matter collided on the
    // auto-hull the notch would be solid.
    const world = new MatterWorld(800, 600);
    world.addBody("L", {
      kind: "compound",
      parts: [
        { kind: "rectangle", width: 200, height: 20, x: 0, y: 90, angle: 0 },
        { kind: "rectangle", width: 20, height: 200, x: -90, y: 0, angle: 0 },
      ],
    }, 400, 400, 0, VACUUM);
    world.pin("L", "NO_RUNNER");

    // Dropped into the notch — clear of both arms.
    world.addBody("ball", { kind: "circle", radius: 6 }, 440, 330, 0, {
      ...VACUUM, gravityY: 980,
    });

    for (let i = 0; i < TICK_HZ; i++) world.step();

    // It rests on the horizontal arm at y ~= 400 + 90 - 10 - 6, not on the hull
    // top at y ~= 400 - 100 - 6.
    const y = world.readState("ball", 1)!.y;
    expect(y).toBeGreaterThan(400);
    world.destroy();
  });

  it("falls back to a unit rectangle for a compound with no parts", () => {
    // An empty group. Body.create({parts: []}) would silently return Matter's
    // default 40x40 body.
    const world = new MatterWorld(800, 600);
    world.addBody("empty", { kind: "compound", parts: [] }, 400, 100, 0, VACUUM);
    const state = world.readState("empty", 1)!;
    expect(state.x).toBeCloseTo(400, 6);
    expect(state.y).toBeCloseTo(100, 6);
    world.destroy();
  });

  it("sets deltaTime on the parent, which is the only one Matter reads", () => {
    // Body.create defaults deltaTime to 1000/60 on the parent AND every part.
    // Body.update and setVelocity/getVelocity read only the parent's, so the
    // parent is the correct place — but this is exactly the class of unstated
    // normalisation the 6.3 conversions got wrong once.
    const world = new MatterWorld(800, 600);
    world.addBody("g", {
      kind: "compound",
      parts: [{ kind: "rectangle", width: 40, height: 40, x: 0, y: 0, angle: 0 }],
    }, 400, 100, 0, { ...VACUUM, collideBounds: false });

    // A vacuum body given 600 px/s must travel 600px in one second, exactly as
    // the single-body assertion in this file requires.
    //
    // collideBounds must be off: at 600 px/s from x=400 the body reaches the
    // right wall in well under a second and stops dead against it at x=780,
    // which looks like a velocity-conversion bug and is not one.
    world.setVelocity("g", 600, 0);
    for (let i = 0; i < TICK_HZ; i++) world.step();
    expect(world.readState("g", 1)!.x).toBeCloseTo(1000, 0);
    world.destroy();
  });

  it("scales a compound about its centre of mass, keeping visual and body aligned (D7)", () => {
    const world = new MatterWorld(800, 600);
    world.addBody("g", {
      kind: "compound",
      parts: [
        { kind: "rectangle", width: 20, height: 20, x: -50, y: 0, angle: 0 },
        { kind: "rectangle", width: 60, height: 60, x: 50, y: 0, angle: 0 },
      ],
    }, 400, 100, 0, VACUUM);

    world.setScale("g", 2, 2);

    // The centre of mass holds at (440, 100); the origin is offset (-40, 0)
    // from it at scale 1, so at scale 2 it reads 80px to its left.
    const state = world.readState("g", 1)!;
    expect(state.x).toBeCloseTo(360, 4);
    expect(state.y).toBeCloseTo(100, 4);
    world.destroy();
  });

  it("bakes a part's own angle into a rotated rectangle part", () => {
    const world = new MatterWorld(800, 600);
    world.addBody("g", {
      kind: "compound",
      parts: [
        { kind: "rectangle", width: 100, height: 10, x: 0, y: 0, angle: Math.PI / 2 },
      ],
    }, 400, 100, 0, VACUUM);
    // A 100x10 bar rotated 90deg is 10 wide and 100 tall.
    const b = world.boundsOf("g")!;
    expect(b.max.x - b.min.x).toBeCloseTo(10, 4);
    expect(b.max.y - b.min.y).toBeCloseTo(100, 4);
    world.destroy();
  });
});

describe("single concave polygon: no concave decomposition / roadmap cut", () => {
  // spec 3 / roadmap section 4 deliberately do not ship poly-decomp, so a
  // *single* polygon (unlike a compound — see "collides using the real
  // parts, not the parent's convex hull" above, which keeps concavity via
  // separate parts) is never decomposed. `polygonBodyAtBboxCentre` in
  // physicsWorld.ts hulls it (`hullOf(points)`, line 244) before handing it
  // to Matter at all.
  //
  // A "U": an outer 200x200 square with a rectangular notch cut out of the
  // top-centre. Its convex hull drops the two notch-bottom vertices and the
  // two points colinear with the top edge, leaving the plain square — so the
  // notch is filled in completely, and filled *flat*, which matters below.
  const CONCAVE_U = [
    { x: -100, y: -100 },
    { x: -30, y: -100 },
    { x: -30, y: -40 },
    { x: 30, y: -40 },
    { x: 30, y: -100 },
    { x: 100, y: -100 },
    { x: 100, y: 100 },
    { x: -100, y: 100 },
  ] as const;

  // A concave L: two arms sharing one reflex vertex at (-80, 80). Unlike the
  // U above, its hull is asymmetric, so the L is what exposes the offset
  // difference the second test below depends on.
  const CONCAVE_L = [
    { x: -100, y: -100 },
    { x: -80, y: -100 },
    { x: -80, y: 80 },
    { x: 100, y: 80 },
    { x: 100, y: 100 },
    { x: -100, y: 100 },
  ] as const;

  it("rests a dropped body on the notch the hull fills in, instead of letting it fall through", () => {
    // This is the cut's directly observable effect: verified with
    // Matter.Vertices.isConvex(CONCAVE_U) === false and
    // Matter.Vertices.hull(CONCAVE_U) reducing to the plain 200x200 square
    // (no decomposition). If the concave outline governed collision instead,
    // a ball dropped straight down the notch would fall past the hulled
    // resting point and hit the U's solid base ~60px lower.
    //
    // Note this assertion alone does not pin `hullOf` at physicsWorld.ts:244
    // specifically: Matter.Bodies.fromVertices falls back to Vertices.hull
    // internally whenever it receives concave vertices and no decomp library
    // is registered (matter-js src/factory/Bodies.js: `isConcave && !canDecomp`
    // -> `vertices = Vertices.hull(vertices)`), and this project does not ship
    // poly-decomp (next test). So the resulting collision shape is identical
    // whether physicsWorld.ts hulls up front or not — this test pins the
    // roadmap cut's behaviour, not that one call site. The next test is the
    // one that fails if `hullOf` is removed from that line specifically.
    const world = new MatterWorld(800, 800);
    world.addBody("U", { kind: "polygon", points: CONCAVE_U }, 400, 400, 0, VACUUM);
    world.pin("U", "NO_RUNNER");

    // Directly above the notch's centre. The hull's top edge sits at world
    // y = 300 (local y = -100); the concave outline's solid base starts at
    // world y = 360 (local y = -40).
    world.addBody("ball", { kind: "circle", radius: 6 }, 400, 260, 0, {
      ...VACUUM, gravityY: 980,
    });

    for (let i = 0; i < TICK_HZ; i++) world.step();

    const y = world.readState("ball", 1)!.y;
    // Resting on the filled hull settles at y ~= 294 (300 - radius). Falling
    // into an open concave notch would settle at y ~= 354 (360 - radius), and
    // an entirely unobstructed fall would be far further still. Both alternatives
    // clear this band by a wide margin.
    expect(y).toBeGreaterThan(285);
    expect(y).toBeLessThan(305);
    world.destroy();
  });

  it("computes the bbox-centre reference offset from the hulled vertices, not the concave outline's own centroid", () => {
    // This is the assertion that actually regresses if `hullOf` is removed
    // from physicsWorld.ts:244. `polygonBodyAtBboxCentre` computes the D15/D16
    // reference-point offset as `bboxCentre(hull) - Vertices.centre(hull)`.
    // A concave polygon's own centroid sits at a different point than its
    // hull's centroid, because hulling adds the notch's area (and so its
    // mass) back in, pulling the centroid toward it — even though, per the
    // previous test's note, Matter's own vertices end up hulled either way.
    // Rotating the body exposes that offset vector in the reported position;
    // at angle 0 the two calculations coincide (both report the origin back
    // unchanged), so the rotation is required to observe the difference.
    //
    // Verified concretely (not via a committed mutation) by reimplementing
    // `polygonBodyAtBboxCentre` with the `hullOf` call deleted — i.e. computing
    // `Vertices.centre`/`Bounds.create` from CONCAVE_L directly — against the
    // same matter-js in node_modules: it predicts (400, 485.263) at 90 degrees
    // instead of the (400, 454.454) asserted below, because the concave
    // centroid (-42.632, 42.632 relative to the shape's local origin) differs
    // from the hulled one (-27.227, 27.227).
    const world = new MatterWorld(2000, 2000);
    world.addBody("L", { kind: "polygon", points: CONCAVE_L }, 400, 400, 0, VACUUM);

    const s0 = world.readState("L", 0)!;
    expect(s0.x).toBeCloseTo(400, 6);
    expect(s0.y).toBeCloseTo(400, 6);

    world.overrideAngle("L", Math.PI / 2);
    world.step();
    const s1 = world.readState("L", 1)!;

    // Measured against Matter 0.20.0.
    expect(s1.x).toBeCloseTo(400, 4);
    expect(s1.y).toBeCloseTo(454.453782, 4);
    world.destroy();
  });
});

describe("roadmap cut: poly-decomp is not a dependency", () => {
  it("is absent from package.json (spec 3 / roadmap section 4)", async () => {
    // Cheap, direct pin on the *packaging* half of the cut, separate from the
    // behavioural half proven above: a future implementer could `npm install
    // poly-decomp` and wire it up via `Common.setDecomp` without changing
    // any observable collision geometry this file already checks (a
    // single convex-hull-shaped notch and a concave decomposition produce
    // different shapes only when poly-decomp is actually registered).
    const pkg = (await import("../../../package.json")) as {
      default: {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
    };
    const allDeps = {
      ...pkg.default.dependencies,
      ...pkg.default.devDependencies,
      ...pkg.default.optionalDependencies,
      ...pkg.default.peerDependencies,
    };
    expect(Object.keys(allDeps)).not.toContain("poly-decomp");
  });
});
