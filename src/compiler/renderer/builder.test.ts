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
      origin: { x: 0.5, y: 0.5 },
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
      origin: { x: 0.5, y: 0.5 },
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
        origin: { x: 0.5, y: 0.5 },
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

describe("builder · group compound geometry with a moved origin", () => {
  // A part is a Matter body part, and Matter places a body at its CENTRE OF
  // MASS — but a child's `currentPos` places its pivot, which `origin` may
  // have moved anywhere in its bounding box.

  it("places a bottom-origin child's part at the child's centre, not its origin point", () => {
    // 40x20 with origin (0.5, 1): the declared y is its bottom edge, so the
    // part sits half its height (10px) above.
    const parts = partsOf(group("g", [
      rect("r", 0, 100, 40, 20, { origin: { x: 0.5, y: 1 } } as Partial<IRObjectProps>),
    ]));
    expect(parts).toEqual([
      { kind: "rectangle", width: 40, height: 20, x: 0, y: 90, angle: 0 },
    ]);
  });

  it("scales the offset with the child's own scale, alongside its dimensions", () => {
    // Stretched 3x on y, the bottom edge is 30px below the centre, not 10.
    const parts = partsOf(group("g", [
      rect("r", 0, 100, 40, 20, {
        origin: { x: 0.5, y: 1 },
        scale: { x: 1, y: 3 },
      } as Partial<IRObjectProps>),
    ]));
    expect(parts).toEqual([
      { kind: "rectangle", width: 40, height: 60, x: 0, y: 70, angle: 0 },
    ]);
  });

  it("offsets a polygon child's placement without touching its already-centre-relative points", () => {
    // The double-correction trap. A polygon's `__bodyShape` points are ALREADY
    // expressed relative to its bbox centre, so only the PLACEMENT needs the
    // offset. Points identical to the default-origin case above is the
    // assertion that no second correction crept in.
    const tri: IRObjectNode = {
      id: "t",
      props: {
        kind: "polygon", position: { x: 40, y: 0 },
        points: [{ x: 0, y: -30 }, { x: 26, y: 15 }, { x: -26, y: 15 }],
        color: "#ff0000", rotation: 0, scale: { x: 1, y: 1 }, alpha: 1, layer: 0,
        origin: { x: 0, y: 0 },
        animations: [], sequences: [],
      } as IRObjectProps,
      children: [],
    };
    const parts = partsOf(group("g", [tri]));
    expect(parts).toHaveLength(1);
    const p = parts[0];
    if (p.kind !== "polygon") throw new Error("expected a polygon part");
    // bbox min (-26, -30), centre (0, -7.5): the pivot-to-centre offset is
    // (26, 22.5), so the part lands there relative to the declared position.
    expect(p.x).toBe(66);
    expect(p.y).toBe(22.5);
    expect(p.points.map((q) => ({ x: q.x, y: q.y }))).toEqual([
      { x: 0, y: -22.5 }, { x: 26, y: 22.5 }, { x: -26, y: 22.5 },
    ]);
  });

  it("rotates the offset into the child's own frame before the group's", () => {
    // The child's quarter turn sends "10px above the pivot" along +x instead.
    const parts = partsOf(group("g", [
      rect("r", 0, 100, 40, 20, {
        origin: { x: 0.5, y: 1 },
        rotation: 90,
      } as Partial<IRObjectProps>),
    ]));
    expect(parts).toHaveLength(1);
    expect(parts[0].x).toBeCloseTo(10, 10);
    expect(parts[0].y).toBeCloseTo(100, 10);
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

describe("origin", () => {
  it("defaults to the bounding-box centre, reproducing the pre-origin pivot", () => {
    const c = buildNode(rect("r", 0, 0, 40, 20));
    expect(c.pivot.x).toBe(20);
    expect(c.pivot.y).toBe(10);
  });

  it("places the pivot at the bottom-centre for origin (0.5, 1)", () => {
    const c = buildNode(rect("r", 0, 0, 40, 20, {
      origin: { x: 0.5, y: 1 },
    } as Partial<IRObjectProps>));
    expect(c.pivot.x).toBe(20);
    expect(c.pivot.y).toBe(20);
  });

  it("records the pivot-to-centre offset, which is zero at the default origin", () => {
    const c = buildNode(rect("r", 0, 0, 40, 20));
    expect(c.__mareyLayout!.centreOffsetX).toBe(0);
    expect(c.__mareyLayout!.centreOffsetY).toBe(0);
  });

  it("records a pivot-to-centre offset pointing up from a bottom origin", () => {
    const c = buildNode(rect("r", 0, 0, 40, 20, {
      origin: { x: 0.5, y: 1 },
    } as Partial<IRObjectProps>));
    expect(c.__mareyLayout!.centreOffsetX).toBe(0);
    expect(c.__mareyLayout!.centreOffsetY).toBe(-10);
  });

  it("offsets a circle's pivot within its 2r bounding box", () => {
    const c = buildNode(circle("c", 0, 0, 10, {
      origin: { x: 0, y: 0 },
    } as Partial<IRObjectProps>));
    expect(c.pivot.x).toBe(0);
    expect(c.pivot.y).toBe(0);
    expect(c.__mareyLayout!.centreOffsetX).toBe(10);
  });

  it("moves a polygon's pivot to its bbox corner for origin (0, 0), leaving its collision shape anchored to the bbox centre", () => {
    // Same triangle as "expresses a polygon child's points relative to its
    // own bbox centre" above (bbox centre (0, -7.5), not the centroid). This
    // is the one shape kind the rest of this file's origin coverage never
    // exercises with a non-default origin — added after Step 11's revert
    // check found reverting only the polygon call site to a hard-coded
    // origin left the whole suite green (622/622).
    const poly: IRObjectNode = {
      id: "t",
      props: {
        kind: "polygon", position: { x: 0, y: 0 },
        points: [{ x: 0, y: -30 }, { x: 26, y: 15 }, { x: -26, y: 15 }],
        color: "#ff0000", rotation: 0, scale: { x: 1, y: 1 }, alpha: 1, layer: 0,
        origin: { x: 0, y: 0 },
        animations: [], sequences: [],
      } as IRObjectProps,
      children: [],
    };
    const c = buildNode(poly);
    expect(c.pivot.x).toBe(-26);
    expect(c.pivot.y).toBe(-30);
    expect(c.__mareyLayout!.centreOffsetX).toBe(26);
    expect(c.__mareyLayout!.centreOffsetY).toBe(22.5);
    // The collision shape stays relative to the bbox centre regardless of
    // origin — identical points to the default-origin case.
    expect(c.__bodyShape).toEqual({
      kind: "polygon",
      points: [{ x: 0, y: -22.5 }, { x: 26, y: 22.5 }, { x: -26, y: 22.5 }],
    });
  });

  it("moves a line's pivot to its bbox corner for origin (0, 0), leaving its collision shape origin-independent", () => {
    // Points chosen so both minX and minY are nonzero (10, 20), so the
    // bbox-min term in localPivot = bboxMin + origin*bboxSize is actually
    // exercised — a line whose bbox started at (0, 0) couldn't distinguish
    // that term from the size term. Added because `line` (like `text`, which
    // is untestable headlessly per this file's header comment) had no origin
    // coverage at all: reverting its origin call site to a hard-coded
    // (0.5, 0.5) left the whole suite green.
    const ln: IRObjectNode = {
      id: "l",
      props: {
        kind: "line", position: { x: 0, y: 0 },
        points: [{ x: 10, y: 20 }, { x: 50, y: 20 }, { x: 30, y: 60 }],
        thickness: 4,
        color: "#ff0000", rotation: 0, scale: { x: 1, y: 1 }, alpha: 1, layer: 0,
        origin: { x: 0, y: 0 },
        animations: [], sequences: [],
      } as IRObjectProps,
      children: [],
    };
    const c = buildNode(ln);
    expect(c.pivot.x).toBe(10);
    expect(c.pivot.y).toBe(20);
    expect(c.__mareyLayout!.centreOffsetX).toBe(20);
    expect(c.__mareyLayout!.centreOffsetY).toBe(20);
    // The collision shape is a bbox rectangle sized from width/height/
    // thickness alone — it never reads the pivot, so it must stay identical
    // to whatever the default-origin case would produce.
    expect(c.__bodyShape).toEqual({
      kind: "rectangle", width: 40, height: 40,
    });
  });

  it("permits an origin outside the bounding box", () => {
    const c = buildNode(rect("r", 0, 0, 40, 20, {
      origin: { x: 0.5, y: 2 },
    } as Partial<IRObjectProps>));
    expect(c.pivot.y).toBe(40);
    expect(c.__mareyLayout!.centreOffsetY).toBe(-30);
  });
});
