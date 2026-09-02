/**
 * First tests for `builder.ts`.
 *
 * Phase 1's execution notes recorded that this layer needed "a DOM and a
 * PixiJS Application". It does not: PixiJS `Container` and `Graphics`
 * construct and compute `getLocalBounds()` in plain Node under this repo's
 * `environment: "node"` vitest config. Only `Text` needs a canvas, which is
 * why no `text` fixture appears here.
 */
import { describe, it, expect } from "vitest";
import { buildNode } from "./builder";
import type { IRObjectNode, IRObjectProps } from "../sceneIR";
import type { BodyPart } from "./physicsWorld";

const DEG = Math.PI / 180;

function circle(name: string, x: number, y: number, radius: number, over: Partial<IRObjectProps> = {}): IRObjectNode {
  return {
    id: name,
    props: {
      kind: "circle", position: { x, y }, radius, color: "#ff0000",
      rotation: 0, scale: { x: 1, y: 1 }, alpha: 1, layer: 0,
      animations: [], sequences: [],
      ...over,
    } as IRObjectProps,
    children: [],
  };
}

function rect(name: string, x: number, y: number, w: number, h: number, over: Partial<IRObjectProps> = {}): IRObjectNode {
  return {
    id: name,
    props: {
      kind: "rectangle", position: { x, y }, width: w, height: h, color: "#ff0000",
      rotation: 0, scale: { x: 1, y: 1 }, alpha: 1, layer: 0,
      animations: [], sequences: [],
      ...over,
    } as IRObjectProps,
    children: [],
  };
}

function group(name: string, children: IRObjectNode[], over: Partial<IRObjectProps> = {}): IRObjectNode {
  return {
    id: name,
    props: {
      kind: "group",
      transform: { position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
      alpha: 1, layer: 0, animations: [], sequences: [],
      ...over,
    } as IRObjectProps,
    children,
  };
}

function partsOf(node: IRObjectNode): ReadonlyArray<BodyPart> {
  const shape = buildNode(node).__bodyShape;
  if (!shape || shape.kind !== "compound") {
    throw new Error(`expected a compound, got ${shape ? shape.kind : "undefined"}`);
  }
  return shape.parts;
}

describe("builder · group compound geometry", () => {
  it("gives a group one part per child, at the child's own local offset", () => {
    // The defect this replaces: the group got ONE rectangle sized from
    // getLocalBounds() but positioned at the origin, so an asymmetric group's
    // collision box sat 100px from its content.
    expect(partsOf(group("g", [circle("c", 100, 0, 30)]))).toEqual([
      { kind: "circle", radius: 30, x: 100, y: 0 },
    ]);
  });

  it("keeps the group's origin as the parts' frame, not the content's centre", () => {
    const parts = partsOf(group("g", [
      rect("a", -50, 0, 20, 20),
      rect("b", 50, 0, 60, 60),
    ]));
    expect(parts).toEqual([
      { kind: "rectangle", width: 20, height: 20, x: -50, y: 0, angle: 0 },
      { kind: "rectangle", width: 60, height: 60, x: 50, y: 0, angle: 0 },
    ]);
  });

  it("bakes a child's rotation into its part's angle", () => {
    const parts = partsOf(group("g", [
      rect("bar", 0, 0, 100, 10, { rotation: 90 } as Partial<IRObjectProps>),
    ]));
    expect(parts).toHaveLength(1);
    const p = parts[0];
    expect(p.kind).toBe("rectangle");
    if (p.kind !== "rectangle") throw new Error("unreachable");
    expect(p.angle).toBeCloseTo(90 * DEG, 10);
    expect(p.width).toBe(100);
  });

  it("bakes a child's scale into its part's dimensions", () => {
    const parts = partsOf(group("g", [
      rect("r", 0, 0, 40, 20, { scale: { x: 2, y: 3 } } as Partial<IRObjectProps>),
    ]));
    expect(parts).toEqual([
      { kind: "rectangle", width: 80, height: 60, x: 0, y: 0, angle: 0 },
    ]);
  });

  it("uses the mean radius for a non-uniformly scaled circle, since Matter has no ellipse", () => {
    const parts = partsOf(group("g", [
      circle("c", 0, 0, 10, { scale: { x: 2, y: 4 } } as Partial<IRObjectProps>),
    ]));
    expect(parts).toEqual([{ kind: "circle", radius: 30, x: 0, y: 0 }]);
  });

  it("flattens a nested group into the same part list (D18)", () => {
    const parts = partsOf(group("outer", [
      circle("a", 10, 0, 5),
      group("inner", [circle("b", 5, 0, 5)], {
        transform: { position: { x: 100, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
      } as Partial<IRObjectProps>),
    ]));
    expect(parts).toEqual([
      { kind: "circle", radius: 5, x: 10, y: 0 },
      { kind: "circle", radius: 5, x: 105, y: 0 },
    ]);
  });

  it("rotates a nested group's children into the outer group's frame", () => {
    const parts = partsOf(group("outer", [
      group("inner", [circle("b", 10, 0, 5)], {
        transform: { position: { x: 0, y: 0 }, rotation: 90, scale: { x: 1, y: 1 } },
      } as Partial<IRObjectProps>),
    ]));
    expect(parts).toHaveLength(1);
    expect(parts[0].x).toBeCloseTo(0, 10);
    expect(parts[0].y).toBeCloseTo(10, 10);
  });

  it("gives an empty group a compound with no parts", () => {
    // physicsWorld falls back to a unit rectangle; the builder does not guess.
    expect(partsOf(group("g", []))).toEqual([]);
  });

  it("expresses a polygon child's points relative to its own bbox centre", () => {
    // The triangle's bbox centre is (0, -7.5), not its centroid (0, 0) — the
    // same distinction D15 exists to correct.
    const tri: IRObjectNode = {
      id: "t",
      props: {
        kind: "polygon", position: { x: 40, y: 0 },
        points: [{ x: 0, y: -30 }, { x: 26, y: 15 }, { x: -26, y: 15 }],
        color: "#ff0000", rotation: 0, scale: { x: 1, y: 1 }, alpha: 1, layer: 0,
        animations: [], sequences: [],
      } as IRObjectProps,
      children: [],
    };
    const parts = partsOf(group("g", [tri]));
    expect(parts).toHaveLength(1);
    const p = parts[0];
    if (p.kind !== "polygon") throw new Error("expected a polygon part");
    expect(p.x).toBe(40);
    expect(p.points.map((q) => ({ x: q.x, y: q.y }))).toEqual([
      { x: 0, y: -22.5 }, { x: 26, y: 22.5 }, { x: -26, y: 22.5 },
    ]);
  });
});

describe("builder · leaf shapes keep their existing geometry", () => {
  it("a circle is still a circle", () => {
    expect(buildNode(circle("c", 0, 0, 12)).__bodyShape).toEqual({ kind: "circle", radius: 12 });
  });

  it("a rectangle is still a rectangle", () => {
    expect(buildNode(rect("r", 0, 0, 30, 40)).__bodyShape).toEqual({
      kind: "rectangle", width: 30, height: 40,
    });
  });
});
