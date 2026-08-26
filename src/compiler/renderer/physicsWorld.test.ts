import { describe, it, expect } from "vitest";
import Matter from "matter-js";
import {
  MATTER_R,
  airDragToFrictionAir,
  pxPerSecToMatter,
  matterToPxPerSec,
  gravityToTickDelta,
} from "./physicsWorld";
import { TICK_HZ } from "./clock";

declare module "matter-js" {
  namespace Common {
    const _baseDelta: number;
  }
  namespace Sleeping {
    function update(bodies: Matter.Body[], delta: number): void;
  }
}

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
