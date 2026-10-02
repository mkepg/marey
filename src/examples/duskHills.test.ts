import { beforeAll, describe, expect, it } from "vitest";
import { Container } from "pixi.js";
import duskSource from "./dusk-hills.marey?raw";
import { compileSource } from "../compiler/compileSource";
import { planExport } from "../compiler/export/exportContract";
import { buildNode } from "../compiler/renderer/builder";
import { SceneRuntime } from "../compiler/renderer/sceneRuntime";
import { MatterWorld } from "../compiler/renderer/physicsWorld";
import { snapshotFor, type ObjectSnapshot } from "../compiler/renderer/frameSampler";
import { encodeCode, MAX_SHARE_LENGTH } from "../lib/share";
import type { IRAnimation, IRObjectNode, IRPoint, IRSceneNode } from "../compiler/sceneIR";

const TICKS_PER_SECOND = 120;
const outcome = compileSource(duskSource);
const ir = outcome.ir as IRSceneNode;

function* walk(nodes: ReadonlyArray<IRObjectNode>): Generator<IRObjectNode> {
  for (const n of nodes) {
    yield n;
    yield* walk(n.children);
  }
}

function buildRoot(scene: IRSceneNode): Container {
  const root = new Container();
  for (const node of scene.children) root.addChild(buildNode(node));
  return root;
}

describe("dusk-hills.marey", () => {
  it("compiles with no errors, at 800 × 600, 12 s, contain", () => {
    expect(outcome.errors).toEqual([]);
    expect(ir.width).toBe(800);
    expect(ir.height).toBe(600);
    expect(ir.duration).toBe(12);
    expect(ir.fit).toBe("contain");
  });

  it("exports as loaded, at the buttons' 30 fps", () => {
    const planned = planExport(ir, { fps: 30 });
    expect(planned.ok ? [] : planned.diagnostics).toEqual([]);
  });

  it("is small enough to share", () => {
    const encoded = encodeCode(duskSource);
    expect(encoded).not.toBeNull();
    expect(encoded!.length).toBeLessThanOrEqual(MAX_SHARE_LENGTH);
  });

  it("obeys the seamless-loop rule in every animation (spec §6)", () => {
    const anims: Array<{ id: string; a: IRAnimation }> = [];
    for (const n of walk(ir.children)) {
      expect(n.props.sequences, `${n.id} has a sequence`).toEqual([]);
      expect(n.props.physics, `${n.id} has physics`).toBeUndefined();
      for (const a of n.props.animations) anims.push({ id: n.id, a });
    }
    expect(anims.length).toBeGreaterThan(10);
    for (const { id, a } of anims) {
      const where = `${id} animate ${a.property}`;
      expect(a.loop, `${where}: loop`).toBe(true);
      expect(a.delay, `${where}: delay`).toBe(0);
      const cycles = 12 / (a.duration * (a.yoyo ? 2 : 1));
      expect(Math.abs(cycles - Math.round(cycles)), `${where}: period divides 12`).toBeLessThan(1e-9);
    }
  });

  it("is the same scene at 12 s as at 0 s, and a different one at 6 s", () => {
    const root = buildRoot(ir);
    const runtime = new SceneRuntime(new MatterWorld(ir.width, ir.height), root);
    const at0 = JSON.stringify(snapshotFor(root));
    let at6 = "";
    for (let t = 1; t <= 12 * TICKS_PER_SECOND; t++) {
      runtime.advanceOneTick();
      runtime.paintExactTick();
      if (t === 6 * TICKS_PER_SECOND) at6 = JSON.stringify(snapshotFor(root));
    }
    const at12 = JSON.stringify(snapshotFor(root));
    runtime.destroy();
    expect(at6).not.toEqual(at0);
    expect(at12).toEqual(at0);
  });
});

// ─── Placement (spec §6) ────────────────────────────────────────────────────
//
// The coordinate mapping, read from `src/compiler/renderer/builder.ts`:
//
// - A leaf shape's geometry lives in its own point space. A polygon or line is
//   drawn at its `points`; a circle is drawn centred on (r, r). Its bounding
//   box is the points' extent (polygon, line; stroke width not included) or
//   (0, 0)–(2r, 2r) (circle).
// - The container's pivot is `bboxMin + origin * bboxSize`, and `position`
//   places that pivot in the parent. So a point p maps to the parent as
//   `position + rotate(rotation, scale * (p - pivot))`. At the default origin
//   the pivot is the bbox centre, which is why a polygon's `points` are not
//   simply offsets from `position` unless its bbox is centred on (0, 0).
// - A group's pivot is always its own (0, 0), so a child's parent-space point
//   maps up the same way with pivot (0, 0), group by group, to the scene.
//
// Geometry (points, radius, origin, thickness) comes from the IR. The
// transform of every object (position, rotation, scale) comes from the
// runtime's own snapshot at the tick being judged, so the t = 6 s checks read
// where the animations actually put the sun, not where the source says they
// should.

type Pose = ReadonlyMap<string, ObjectSnapshot>;

function poseAt(scene: IRSceneNode, seconds: number): Pose {
  const root = buildRoot(scene);
  const runtime = new SceneRuntime(new MatterWorld(scene.width, scene.height), root);
  for (let t = 1; t <= seconds * TICKS_PER_SECOND; t++) {
    runtime.advanceOneTick();
    runtime.paintExactTick();
  }
  const pose = new Map(snapshotFor(root).map((s) => [s.id, s]));
  runtime.destroy();
  return pose;
}

const parentMaps = new WeakMap<IRSceneNode, Map<string, IRObjectNode | null>>();

function parentsOf(scene: IRSceneNode): Map<string, IRObjectNode | null> {
  const cached = parentMaps.get(scene);
  if (cached) return cached;
  const parents = new Map<string, IRObjectNode | null>();
  const visit = (nodes: ReadonlyArray<IRObjectNode>, parent: IRObjectNode | null): void => {
    for (const n of nodes) {
      parents.set(n.id, parent);
      visit(n.children, n);
    }
  };
  visit(scene.children, null);
  parentMaps.set(scene, parents);
  return parents;
}

function pivotOf(node: IRObjectNode): IRPoint {
  const p = node.props;
  if (p.kind === "group") return { x: 0, y: 0 };
  let min: IRPoint;
  let size: IRPoint;
  if (p.kind === "circle") {
    min = { x: 0, y: 0 };
    size = { x: 2 * p.radius, y: 2 * p.radius };
  } else if (p.kind === "polygon" || p.kind === "line") {
    const xs = p.points.map((q) => q.x);
    const ys = p.points.map((q) => q.y);
    min = { x: Math.min(...xs), y: Math.min(...ys) };
    size = { x: Math.max(...xs) - min.x, y: Math.max(...ys) - min.y };
  } else {
    throw new Error(`placement helpers do not handle ${p.kind}`);
  }
  return { x: min.x + p.origin.x * size.x, y: min.y + p.origin.y * size.y };
}

/** A point in `node`'s own space, mapped all the way to scene coordinates. */
function toScene(scene: IRSceneNode, pose: Pose, node: IRObjectNode, p: IRPoint): IRPoint {
  const parents = parentsOf(scene);
  let current: IRObjectNode | null = node;
  let pt = p;
  while (current) {
    const s = pose.get(current.id)!;
    const pivot = pivotOf(current);
    const dx = (pt.x - pivot.x) * s.scaleX;
    const dy = (pt.y - pivot.y) * s.scaleY;
    const c = Math.cos(s.rotation);
    const sn = Math.sin(s.rotation);
    pt = { x: s.x + dx * c - dy * sn, y: s.y + dx * sn + dy * c };
    current = parents.get(current.id) ?? null;
  }
  return pt;
}

/** The product of every |scale y| from `node` up to the scene. */
function scaleYToScene(scene: IRSceneNode, pose: Pose, node: IRObjectNode): number {
  const parents = parentsOf(scene);
  let k = 1;
  for (let n: IRObjectNode | null = node; n; n = parents.get(n.id) ?? null) {
    k *= Math.abs(pose.get(n.id)!.scaleY);
  }
  return k;
}

/** A circle's outline, sampled every half degree, in scene coordinates. */
function circleOutline(scene: IRSceneNode, pose: Pose, node: IRObjectNode): IRPoint[] {
  if (node.props.kind !== "circle") throw new Error(`${node.id} is not a circle`);
  const r = node.props.radius;
  const out: IRPoint[] = [];
  for (let i = 0; i < 720; i++) {
    const a = (i / 2) * (Math.PI / 180);
    out.push(toScene(scene, pose, node, { x: r + r * Math.cos(a), y: r + r * Math.sin(a) }));
  }
  return out;
}

/** A polygon's vertices in scene coordinates. */
function polygonInScene(scene: IRSceneNode, pose: Pose, node: IRObjectNode): IRPoint[] {
  if (node.props.kind !== "polygon") throw new Error(`${node.id} is not a polygon`);
  return node.props.points.map((q) => toScene(scene, pose, node, q));
}

/**
 * The topmost y at which the vertical line through `x` meets the polygon's
 * outline: its top edge there. Exact for straight edges, which is all a
 * polygon draws. Infinity when the line misses the polygon.
 */
function topEdgeAt(poly: ReadonlyArray<IRPoint>, x: number): number {
  let top = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) continue;
    const y = a.x === b.x ? Math.min(a.y, b.y) : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
    top = Math.min(top, y);
  }
  return top;
}

/** The lowest top edge across [x0, x1]; checks every vertex inside the span. */
function lowestTopAcross(poly: ReadonlyArray<IRPoint>, x0: number, x1: number): number {
  const xs = [x0, x1, ...poly.map((p) => p.x).filter((x) => x > x0 && x < x1)];
  return Math.max(...xs.map((x) => topEdgeAt(poly, x)));
}

/** The highest top edge across [x0, x1]: the ridge surface nearest from above. */
function highestTopAcross(poly: ReadonlyArray<IRPoint>, x0: number, x1: number): number {
  const xs = [x0, x1, ...poly.map((p) => p.x).filter((x) => x > x0 && x < x1)];
  return Math.min(...xs.map((x) => topEdgeAt(poly, x)));
}

/** Looks an object up by its path below the scene, e.g. `sun.body.mouth`. */
function byId(scene: IRSceneNode, path: string): IRObjectNode {
  const id = `scene.${path}`;
  const node = scene.registry[id];
  if (!node) throw new Error(`no object ${id}; have ${Object.keys(scene.registry).join(", ")}`);
  return node;
}

function descendants(node: IRObjectNode): IRObjectNode[] {
  return [...walk(node.children)];
}

describe("placement helpers", () => {
  // Worked by hand from the mapping above. The group sits at (100, 50) and
  // doubles everything inside it.
  //   flat:   default origin, pivot = bbox centre (20, 10). Top edge
  //           50 + 2 * (30 - 10) = 90; left edge 100 + 2 * (20 - 20) = 100.
  //   corner: origin (0, 1), pivot = (0, 20). Top edge 50 + 2 * (30 - 20) = 70;
  //           left edge 100 + 2 * (20 - 0) = 140.
  //   turned: rotation 90 about pivot (20, 10): (0, 0) - pivot = (-20, -10)
  //           turns to (10, -20), so the top edge is 50 + 2 * (30 - 20) = 70.
  //   dot:    radius 10 at (-30, 0): top 50 + 2 * (0 - 10) = 30.
  const fixture = compileSource(`
scene {
  size: (400, 300)
  group g {
    position: (100, 50)
    scale: (2, 2)
    polygon flat   { position: (20, 30), points: [(0, 0), (40, 0), (40, 20), (0, 20)] }
    polygon corner { position: (20, 30), points: [(0, 0), (40, 0), (40, 20), (0, 20)], origin: (0, 1) }
    polygon turned { position: (20, 30), points: [(0, 0), (40, 0), (40, 20), (0, 20)], rotation: 90 }
    circle dot     { position: (-30, 0), radius: 10 }
  }
}`);
  const scene = fixture.ir as IRSceneNode;

  it("maps a shape's geometry to scene coordinates the way the builder draws it", () => {
    expect(fixture.errors).toEqual([]);
    const pose = poseAt(scene, 0);
    const top = (id: string) => Math.min(...polygonInScene(scene, pose, byId(scene, `g.${id}`)).map((p) => p.y));
    const left = (id: string) => Math.min(...polygonInScene(scene, pose, byId(scene, `g.${id}`)).map((p) => p.x));
    expect(top("flat")).toBeCloseTo(90, 9);
    expect(left("flat")).toBeCloseTo(100, 9);
    expect(top("corner")).toBeCloseTo(70, 9);
    expect(left("corner")).toBeCloseTo(140, 9);
    expect(top("turned")).toBeCloseTo(70, 9);
    const dotTop = Math.min(...circleOutline(scene, pose, byId(scene, "g.dot")).map((p) => p.y));
    expect(dotTop).toBeCloseTo(30, 9);
  });

  it("reads a polygon's top edge between its vertices", () => {
    const pose = poseAt(scene, 0);
    const flat = polygonInScene(scene, pose, byId(scene, "g.flat"));
    expect(topEdgeAt(flat, 150)).toBeCloseTo(90, 9);
    expect(topEdgeAt(flat, 99)).toBe(Infinity);
  });
});

describe("dusk-hills.marey placement (spec §6)", () => {
  const ridges = () => [0, 1, 2, 3].map((i) => byId(ir, `ridge_${i}`));
  const sun = () => byId(ir, "sun");

  it("draws the backmost ridge first", () => {
    expect(ridges().map((r) => (r.props.kind === "polygon" ? r.props.color : null))).toEqual([
      "#6b4a7a", "#4a3560", "#2f2444", "#1c1630",
    ]);
    const order = ir.children.map((n) => n.id);
    expect(order.indexOf("scene.ridge_0")).toBeGreaterThan(order.indexOf("scene.sun"));
  });

  let at0: Pose;
  let at6: Pose;
  beforeAll(() => {
    at0 = poseAt(ir, 0);
    at6 = poseAt(ir, 6);
  });

  // The smile is the line `smile`; its stroke reaches thickness / 2 below its
  // lowest vertex, and its end dots are circles.
  function mouthStroke(): { bottom: number; left: number; right: number } {
    const smile = byId(ir, "sun.body.mouth.smile");
    if (smile.props.kind !== "line") throw new Error("smile is not a line");
    const half = (smile.props.thickness / 2) * scaleYToScene(ir, at0, smile);
    const pts = smile.props.points.map((q) => toScene(ir, at0, smile, q));
    const dots = descendants(byId(ir, "sun.body.mouth"))
      .filter((n) => n.props.kind === "circle")
      .flatMap((n) => circleOutline(ir, at0, n));
    const all = [...pts.map((p) => ({ x: p.x, y: p.y + half })), ...dots];
    return {
      bottom: Math.max(...all.map((p) => p.y)),
      left: Math.min(...pts.map((p) => p.x)) - half,
      right: Math.max(...pts.map((p) => p.x)) + half,
    };
  }

  function mouthBottomAt0(): number {
    return mouthStroke().bottom;
  }

  // The nearest ridge surface below the mouth: the highest top edge of any of
  // the four ridges, anywhere across the mouth's width.
  function ridgeTopUnderMouth(): number {
    const { left, right } = mouthStroke();
    return Math.min(...ridges().map((r) => highestTopAcross(polygonInScene(ir, at0, r), left, right)));
  }

  function sunOutlineAt6(): IRPoint[] {
    return [sun(), ...descendants(sun())]
      .filter((n) => n.props.kind === "circle")
      .flatMap((n) => circleOutline(ir, at6, n));
  }

  function sunTopAt6(): number {
    return Math.min(...sunOutlineAt6().map((p) => p.y));
  }

  // The backmost ridge's lowest top edge across the sun's whole width at 6 s.
  function backRidgeTopAcrossSun(): number {
    const outline = sunOutlineAt6();
    const left = Math.min(...outline.map((p) => p.x));
    const right = Math.max(...outline.map((p) => p.x));
    return lowestTopAcross(polygonInScene(ir, at6, ridges()[0]), left, right);
  }

  it("rests with the mouth at least 30 units above the ridge beneath it", () => {
    expect(ridgeTopUnderMouth() - mouthBottomAt0()).toBeGreaterThanOrEqual(30);
  });

  it("is completely hidden behind the backmost ridge at 6 s", () => {
    expect(sunTopAt6()).toBeGreaterThan(backRidgeTopAcrossSun()); // y grows downward
  });
});
