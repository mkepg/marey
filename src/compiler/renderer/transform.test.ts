import { describe, it, expect } from "vitest";
import {
  IDENTITY, compose, toWorld, toLocal, rotateScaleVector, type LocalTransform,
} from "./transform";

const DEG = Math.PI / 180;

describe("compose", () => {
  it("adds translation when there is no rotation or scale", () => {
    const parent: LocalTransform = { x: 100, y: 50, rot: 0, sx: 1, sy: 1 };
    expect(compose(parent, { x: 10, y: 5 }, 0, { x: 1, y: 1 })).toEqual({
      x: 110, y: 55, rot: 0, sx: 1, sy: 1,
    });
  });

  it("rotates the child's offset into the parent's frame", () => {
    const parent: LocalTransform = { x: 0, y: 0, rot: 90 * DEG, sx: 1, sy: 1 };
    const c = compose(parent, { x: 10, y: 0 }, 0, { x: 1, y: 1 });
    expect(c.x).toBeCloseTo(0, 10);
    expect(c.y).toBeCloseTo(10, 10);
  });

  it("scales the child's offset before rotating it", () => {
    const parent: LocalTransform = { x: 0, y: 0, rot: 90 * DEG, sx: 2, sy: 3 };
    const c = compose(parent, { x: 10, y: 0 }, 0, { x: 1, y: 1 });
    expect(c.x).toBeCloseTo(0, 10);
    expect(c.y).toBeCloseTo(20, 10);
  });

  it("sums rotations and multiplies scales", () => {
    const parent: LocalTransform = { x: 0, y: 0, rot: 30 * DEG, sx: 2, sy: 4 };
    const c = compose(parent, { x: 0, y: 0 }, 45 * DEG, { x: 3, y: 0.5 });
    expect(c.rot).toBeCloseTo(75 * DEG, 10);
    expect(c.sx).toBeCloseTo(6, 10);
    expect(c.sy).toBeCloseTo(2, 10);
  });

  it("composing with identity is a no-op", () => {
    const child = compose(IDENTITY, { x: 7, y: -3 }, 0.4, { x: 1.5, y: 2 });
    expect(child).toEqual({ x: 7, y: -3, rot: 0.4, sx: 1.5, sy: 2 });
  });
});

describe("toWorld and toLocal", () => {
  it("toWorld places a local point through translation, rotation and scale", () => {
    const t: LocalTransform = { x: 400, y: 300, rot: 90 * DEG, sx: 2, sy: 1 };
    const w = toWorld(t, 10, 0);
    expect(w.x).toBeCloseTo(400, 10);
    expect(w.y).toBeCloseTo(320, 10);
  });

  it("toLocal is the exact inverse of toWorld", () => {
    const t: LocalTransform = { x: -37, y: 214, rot: 1.234, sx: 2.5, sy: 0.4 };
    const w = toWorld(t, 13, -29);
    const back = toLocal(t, w.x, w.y);
    expect(back.x).toBeCloseTo(13, 8);
    expect(back.y).toBeCloseTo(-29, 8);
  });

  it("round-trips under identity", () => {
    expect(toWorld(IDENTITY, 5, 9)).toEqual({ x: 5, y: 9 });
    expect(toLocal(IDENTITY, 5, 9)).toEqual({ x: 5, y: 9 });
  });
});

describe("rotateScaleVector", () => {
  it("applies rotation and scale but not translation", () => {
    // A velocity must not pick up the parent's position.
    const t: LocalTransform = { x: 1000, y: 1000, rot: 90 * DEG, sx: 1, sy: 1 };
    const v = rotateScaleVector(t, 60, 0);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(60, 10);
  });
});
