/**
 * The nine layout briefs as lists of tagged geometric clauses.
 *
 * A brief's shapes are picked by kind and declared (unscaled) size; shapes of
 * any other kind or size, such as a background rectangle, are ignored. Shapes
 * are never identified by name. Tolerance is 0.5 px on every length and 0.5
 * degrees on every angle.
 *
 * A clause tagged `brief` says the author misread what to draw (wrong count,
 * sizes or order); every other tag names the layout primitive whose
 * arithmetic the clause tests.
 */
import { compileSource } from "../../src/compiler/compileSource";
import { worldBoxes, type WorldShape } from "./geometry";

export type BriefId = "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7" | "L8" | "L9";
export type ClauseTag = "brief" | "row" | "align" | "distribute" | "grid" | "radial";

export interface Clause {
  name: string;
  tag: ClauseTag;
  check(shapes: WorldShape[]): boolean;
}

const TOL = 0.5;
const ANGLE_TOL = 0.5;
const CENTRE = { x: 400, y: 300 };

const near = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol;
const cx = (s: WorldShape) => (s.box.minX + s.box.maxX) / 2;
const cy = (s: WorldShape) => (s.box.minY + s.box.maxY) / 2;
const sized = (s: WorldShape, w: number, h: number) => near(s.size.w, w) && near(s.size.h, h);
const rect = (w: number, h: number) => (s: WorldShape) => s.kind === "rectangle" && sized(s, w, h);
const circle = (r: number) => (s: WorldShape) => s.kind === "circle" && near(s.size.w, 2 * r);

function union(shapes: WorldShape[]) {
  return {
    minX: Math.min(...shapes.map((s) => s.box.minX)),
    minY: Math.min(...shapes.map((s) => s.box.minY)),
    maxX: Math.max(...shapes.map((s) => s.box.maxX)),
    maxY: Math.max(...shapes.map((s) => s.box.maxY)),
  };
}

/** The union box is centred on the scene centre, on the axes given. */
function unionCentred(shapes: WorldShape[], axes: "x" | "y" | "xy"): boolean {
  const u = union(shapes);
  const okX = near((u.minX + u.maxX) / 2, CENTRE.x);
  const okY = near((u.minY + u.maxY) / 2, CENTRE.y);
  return axes === "x" ? okX : axes === "y" ? okY : okX && okY;
}

/** Edge gaps between neighbours along an axis, in position order. */
function gapsAlong(shapes: WorldShape[], axis: "x" | "y"): number[] {
  const lo = (s: WorldShape) => (axis === "x" ? s.box.minX : s.box.minY);
  const hi = (s: WorldShape) => (axis === "x" ? s.box.maxX : s.box.maxY);
  const sorted = [...shapes].sort((p, q) => lo(p) - lo(q));
  return sorted.slice(1).map((s, i) => lo(s) - hi(sorted[i]));
}

const allNear = (xs: number[], v: number) => xs.every((x) => near(x, v));
const allEqual = (xs: number[]) => xs.length > 0 && Math.max(...xs) - Math.min(...xs) <= TOL;

/** Cluster sorted values; a value joins the cluster when within the tolerance of the previous one. */
function cluster(values: number[]): number[][] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const v of sorted) {
    const g = groups[groups.length - 1];
    if (g && v - g[g.length - 1] <= TOL) g.push(v);
    else groups.push([v]);
  }
  return groups;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Angle of a shape's centre about the scene centre, degrees clockwise from 12 o'clock, [0, 360). */
function ringAngle(s: WorldShape): number {
  const a = (Math.atan2(cx(s) - CENTRE.x, -(cy(s) - CENTRE.y)) * 180) / Math.PI;
  return (a + 360) % 360;
}
const ringDistance = (s: WorldShape) => Math.hypot(cx(s) - CENTRE.x, cy(s) - CENTRE.y);
/** Signed difference of two angles normalised to (-180, 180]. */
function angleDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * A brief is its picker, its expected cardinality, and clauses over the
 * picked set. A wrong cardinality fails the count clause and, because the
 * picked set cannot then be judged, every other clause too.
 */
function brief(
  pick: (shapes: WorldShape[]) => WorldShape[],
  count: number,
  clauses: { name: string; tag: ClauseTag; test: (picked: WorldShape[]) => boolean }[],
): Clause[] {
  return [
    {
      name: "count",
      tag: "brief",
      check: (shapes) => pick(shapes).length === count,
    },
    ...clauses.map(
      (c): Clause => ({
        name: c.name,
        tag: c.tag,
        check: (shapes) => {
          const picked = pick(shapes);
          return picked.length === count && c.test(picked);
        },
      }),
    ),
  ];
}

/** Shapes in left-to-right order of their centres. */
const byX = (shapes: WorldShape[]) => [...shapes].sort((a, b) => cx(a) - cx(b));
const byY = (shapes: WorldShape[]) => [...shapes].sort((a, b) => cy(a) - cy(b));

const squares60 = rect(60, 60);

// L2: reading choice: a bar is any rectangle 50 tall with one of the four widths.
const L2_WIDTHS = [40, 120, 80, 60];
// L4: any rectangle 30 tall with one of the three widths.
const L4_WIDTHS = [300, 180, 240];
// L3: circles of the five radii.
const L3_RADII = [10, 30, 20, 40, 15];

const isTick = (s: WorldShape) =>
  s.kind === "rectangle" &&
  ((near(s.size.w, 4) && (near(s.size.h, 16) || near(s.size.h, 32))) ||
    (near(s.size.h, 4) && (near(s.size.w, 16) || near(s.size.w, 32))));
const isLongTick = (s: WorldShape) => Math.max(s.size.w, s.size.h) > 24;

/** Angle (degrees, mod 180) of a tick's long side in world space. */
function longAxisAngle(s: WorldShape): number {
  // Reading choice: the long side is the local y axis when taller than wide,
  // otherwise the local x axis; the world angle adds the composed rotation.
  // Non-uniform scale skew is not modelled; the briefs use none.
  return (s.rotation + (s.size.h > s.size.w ? 90 : 0)) % 180;
}

export const BRIEFS: Record<BriefId, Clause[]> = {
  // L1: six 60x60 squares; centres share one y; edge gaps all 20; union centred.
  L1: brief((s) => s.filter(squares60), 6, [
    // Reading choice: sharing one y is row arithmetic (tag row).
    { name: "centreline", tag: "row", test: (p) => allEqual(p.map(cy)) },
    { name: "gaps", tag: "row", test: (p) => allNear(gapsAlong(p, "x"), 20) },
    { name: "centred", tag: "row", test: (p) => unionCentred(p, "xy") },
  ]),

  // L2: four widths left to right; edge gaps 16; bottoms on 400; union x-centre 400.
  L2: brief(
    (s) => s.filter((x) => x.kind === "rectangle" && near(x.size.h, 50) && L2_WIDTHS.some((w) => near(x.size.w, w))),
    4,
    [
      {
        name: "order",
        tag: "brief",
        test: (p) => byX(p).every((s, i) => near(s.size.w, L2_WIDTHS[i])),
      },
      { name: "gaps", tag: "row", test: (p) => allNear(gapsAlong(p, "x"), 16) },
      { name: "centred", tag: "row", test: (p) => unionCentred(p, "x") },
      { name: "bottom", tag: "align", test: (p) => p.every((s) => near(s.box.maxY, 400)) },
    ],
  ),

  // L3: five circles in radius order; centres at y 300; ends at 100 and 700; four equal gaps.
  L3: brief((s) => s.filter((x) => L3_RADII.some((r) => circle(r)(x))), 5, [
    {
      name: "order",
      tag: "brief",
      test: (p) => byX(p).every((s, i) => near(s.size.w, 2 * L3_RADII[i])),
    },
    // Reading choice: the shared centre line belongs to the brief's primitive (distribute).
    { name: "centreline", tag: "distribute", test: (p) => p.every((s) => near(cy(s), 300)) },
    { name: "left-edge", tag: "distribute", test: (p) => near(union(p).minX, 100) },
    { name: "right-edge", tag: "distribute", test: (p) => near(union(p).maxX, 700) },
    { name: "equal-gaps", tag: "distribute", test: (p) => allEqual(gapsAlong(p, "x")) },
  ]),

  // L4: widths top to bottom; left edges at 120; edge gaps 30; union y-centre 300.
  L4: brief((s) => s.filter((x) => x.kind === "rectangle" && near(x.size.h, 30) && L4_WIDTHS.some((w) => near(x.size.w, w))), 3, [
    {
      name: "order",
      tag: "brief",
      test: (p) => byY(p).every((s, i) => near(s.size.w, L4_WIDTHS[i])),
    },
    { name: "left", tag: "align", test: (p) => p.every((s) => near(s.box.minX, 120)) },
    { name: "gaps", tag: "row", test: (p) => allNear(gapsAlong(p, "y"), 30) },
    { name: "centred", tag: "row", test: (p) => unionCentred(p, "y") },
  ]),

  // L5: five badges, each a circle r30 and a 20x20 square sharing a centre;
  // neighbouring centres 100 apart on one y; union centred.
  // The picked set is the five discs and the five pips, ten shapes. Badge
  // centres are the discs' centres.
  L5: (() => {
    const discs = (s: WorldShape[]) => s.filter(circle(30));
    const pips = (s: WorldShape[]) => s.filter(rect(20, 20));
    return brief((s) => [...discs(s), ...pips(s)], 10, [
      {
        name: "pairing",
        tag: "brief",
        test: (p) => {
          const d = p.filter(circle(30));
          const q = p.filter(rect(20, 20));
          return d.length === 5 && q.length === 5 && d.every((c) => q.some((r) => near(cx(r), cx(c)) && near(cy(r), cy(c))));
        },
      },
      {
        name: "spacing",
        tag: "row",
        test: (p) => {
          const d = byX(p.filter(circle(30)));
          return d.slice(1).every((s, i) => near(cx(s) - cx(d[i]), 100));
        },
      },
      { name: "centreline", tag: "row", test: (p) => allEqual(p.filter(circle(30)).map(cy)) },
      { name: "centred", tag: "row", test: (p) => unionCentred(p, "xy") },
    ]);
  })(),

  // L6: twelve 120x80 cards on a 3x4 lattice; edge gaps 24 both ways; union centred.
  L6: brief((s) => s.filter(rect(120, 80)), 12, [
    { name: "lattice", tag: "grid", test: (p) => isLattice(p, 3, 4) },
    { name: "hgap", tag: "grid", test: (p) => isLattice(p, 3, 4) && columnGaps(p, 24) },
    { name: "vgap", tag: "grid", test: (p) => isLattice(p, 3, 4) && rowGaps(p, 24) },
    { name: "centred", tag: "grid", test: (p) => unionCentred(p, "xy") },
  ]),

  // L7: twelve 40x40 squares in three columns of four; in-column gaps 10;
  // between-column gaps 80; union centred.
  L7: brief((s) => s.filter(rect(40, 40)), 12, [
    { name: "columns", tag: "grid", test: (p) => isLattice(p, 3, 4) },
    { name: "vgap", tag: "grid", test: (p) => isLattice(p, 3, 4) && rowGaps(p, 10) },
    { name: "hgap", tag: "grid", test: (p) => isLattice(p, 3, 4) && columnGaps(p, 80) },
    { name: "centred", tag: "grid", test: (p) => unionCentred(p, "xy") },
  ]),

  // L8: twelve r10 circles, centres 200 from the scene centre; the first at
  // (400, 100); consecutive centres 30 degrees apart, clockwise on screen.
  // Reading choice: "first" and "consecutive" follow the scene's object order,
  // which is the order a careful author writes the ring in.
  L8: brief((s) => s.filter(circle(10)), 12, [
    { name: "distance", tag: "radial", test: (p) => p.every((s) => near(ringDistance(s), 200)) },
    { name: "start", tag: "radial", test: (p) => near(cx(p[0]), 400) && near(cy(p[0]), 100) },
    { name: "step", tag: "radial", test: (p) => consecutive(p).every(([a, b]) => Math.abs(angleDelta(ringAngle(a), ringAngle(b))) >= 30 - ANGLE_TOL && Math.abs(angleDelta(ringAngle(a), ringAngle(b))) <= 30 + ANGLE_TOL) },
    { name: "direction", tag: "radial", test: (p) => consecutive(p).every(([a, b]) => angleDelta(ringAngle(a), ringAngle(b)) > 0) },
  ]),

  // L9: sixty 4x16 / 4x32 ticks, centres 220 from the scene centre and 6
  // degrees apart; every long axis passes through the centre; exactly twelve
  // are 4x32, every fifth around the ring.
  // Reading choices: either width/height orientation of the declared size is
  // a tick; "6 degrees apart" is judged between angular neighbours, so a ring
  // may start anywhere and run either way; the long ones are every fifth
  // position of that ring in whatever phase.
  L9: brief((s) => s.filter(isTick), 60, [
    { name: "longcount", tag: "brief", test: (p) => p.filter(isLongTick).length === 12 },
    { name: "distance", tag: "radial", test: (p) => p.every((s) => near(ringDistance(s), 220)) },
    {
      name: "step",
      tag: "radial",
      test: (p) => {
        const a = p.map(ringAngle).sort((x, y) => x - y);
        return a.every((v, i) => near(angleDelta(v, a[(i + 1) % a.length]), 6, ANGLE_TOL));
      },
    },
    {
      name: "orient",
      tag: "radial",
      test: (p) =>
        p.every((s) => {
          // Angle between the long side and the line from the tick to the
          // scene centre, taken mod 180 (a line has no direction).
          const toCentre = (Math.atan2(CENTRE.y - cy(s), CENTRE.x - cx(s)) * 180) / Math.PI;
          const d = (((longAxisAngle(s) - toCentre) % 180) + 180) % 180;
          return d <= ANGLE_TOL || 180 - d <= ANGLE_TOL;
        }),
    },
    {
      name: "fifth",
      tag: "radial",
      test: (p) => {
        const ring = [...p].sort((a, b) => ringAngle(a) - ringAngle(b));
        const idx = ring.map((s, i) => (isLongTick(s) ? i : -1)).filter((i) => i >= 0);
        if (idx.length !== 12) return false;
        return idx.every((v, i) => (idx[(i + 1) % idx.length] - v + ring.length) % ring.length === 5);
      },
    },
  ]),
};

function consecutive(p: WorldShape[]): [WorldShape, WorldShape][] {
  return p.slice(1).map((s, i): [WorldShape, WorldShape] => [p[i], s]);
}

/** `cols` x `rows` lattice: every cell holds exactly one shape. */
function isLattice(p: WorldShape[], cols: number, rows: number): boolean {
  const xs = cluster(p.map(cx));
  const ys = cluster(p.map(cy));
  if (xs.length !== cols || ys.length !== rows) return false;
  return xs.every((gx) => gx.length === rows) && ys.every((gy) => gy.length === cols);
}

/** Edge gaps between neighbouring columns equal `gap`, from the columns' mean centres and shared width. */
function columnGaps(p: WorldShape[], gap: number): boolean {
  const xs = cluster(p.map(cx)).map(mean);
  const w = p[0].size.w;
  return xs.slice(1).every((x, i) => near(x - xs[i] - w, gap));
}
function rowGaps(p: WorldShape[], gap: number): boolean {
  const ys = cluster(p.map(cy)).map(mean);
  const h = p[0].size.h;
  return ys.slice(1).every((y, i) => near(y - ys[i] - h, gap));
}

export interface SceneCheck {
  compiled: boolean;
  results: { clause: string; tag: string; pass: boolean }[];
}

export function checkScene(briefId: BriefId, source: string): SceneCheck {
  const outcome = compileSource(source);
  if (!outcome.ok || !outcome.ir) return { compiled: false, results: [] };
  const shapes = worldBoxes(outcome.ir);
  return {
    compiled: true,
    results: BRIEFS[briefId].map((c) => ({ clause: c.name, tag: c.tag, pass: c.check(shapes) })),
  };
}
