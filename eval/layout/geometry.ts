/**
 * World-space geometry for the layout briefs.
 *
 * Reads the compiled scene IR and returns every drawn shape's axis-aligned
 * bounding box at rest (tick 0, before any animation). It composes group
 * transforms itself and imports only the IR types, so it shares no code with
 * the renderer or with any compiler layout code.
 *
 * Conventions, confirmed against the renderer's transform algebra: angles are
 * written in degrees, y points down, and a positive rotation turns clockwise
 * on screen. A node's local transform is translate(position) · rotate · scale,
 * so scale applies before rotation, and a child's position is expressed in its
 * parent's already-scaled-and-rotated frame.
 */
import type { IRObjectNode, IRPoint, IRSceneNode } from "../../src/compiler/sceneIR";

export interface WorldShape {
  kind: "circle" | "rectangle" | "polygon" | "line" | "text";
  id: string;
  box: { minX: number; minY: number; maxX: number; maxY: number };
  pivot: { x: number; y: number };
  /** Declared, unscaled: rectangle width/height, circle 2r. */
  size: { w: number; h: number };
  /** World rotation, degrees. */
  rotation: number;
  /** World scale. */
  scale: { x: number; y: number };
}

/** Affine map [a c e; b d f]: x' = a x + c y + e, y' = b x + d y + f. */
interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function mul(p: Affine, q: Affine): Affine {
  return {
    a: p.a * q.a + p.c * q.b,
    b: p.b * q.a + p.d * q.b,
    c: p.a * q.c + p.c * q.d,
    d: p.b * q.c + p.d * q.d,
    e: p.a * q.e + p.c * q.f + p.e,
    f: p.b * q.e + p.d * q.f + p.f,
  };
}

/** translate(position) · rotate(degrees) · scale. */
function local(position: IRPoint, rotationDeg: number, scale: IRPoint): Affine {
  const r = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    a: cos * scale.x,
    b: sin * scale.x,
    c: -sin * scale.y,
    d: cos * scale.y,
    e: position.x,
    f: position.y,
  };
}

function apply(m: Affine, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

function boxOf(points: { x: number; y: number }[]): WorldShape["box"] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function pointsExtent(points: ReadonlyArray<IRPoint>) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

export function worldBoxes(ir: IRSceneNode): WorldShape[] {
  const out: WorldShape[] = [];

  const walk = (node: IRObjectNode, parent: Affine, parentRot: number, parentScale: IRPoint) => {
    const props = node.props;
    if (props.kind === "group") {
      const t = props.transform;
      const m = mul(parent, local(t.position, t.rotation, t.scale));
      const rot = parentRot + t.rotation;
      const sc = { x: parentScale.x * t.scale.x, y: parentScale.y * t.scale.y };
      for (const child of node.children) walk(child, m, rot, sc);
      return;
    }

    const m = mul(parent, local(props.position, props.rotation, props.scale));
    const rotation = parentRot + props.rotation;
    const scale = { x: parentScale.x * props.scale.x, y: parentScale.y * props.scale.y };
    const pivot = apply(m, 0, 0);
    const shared = { id: node.id, pivot, rotation, scale };

    // `origin` is a fraction of the shape's own bounding box; the shape's
    // local points are measured from the pivot it names.
    const ox = props.origin.x;
    const oy = props.origin.y;

    switch (props.kind) {
      case "rectangle": {
        const { width: w, height: h } = props;
        const corners = [
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ].map(([x, y]) => apply(m, x - ox * w, y - oy * h));
        out.push({ kind: "rectangle", ...shared, box: boxOf(corners), size: { w, h } });
        break;
      }
      case "circle": {
        const d = props.radius * 2;
        // A circle under a non-uniform scale plus rotation is an ellipse; its
        // exact axis-aligned extent is the centre's image plus or minus the
        // row norms of the linear part, scaled by the radius.
        const centre = apply(m, d / 2 - ox * d, d / 2 - oy * d);
        const hx = props.radius * Math.hypot(m.a, m.c);
        const hy = props.radius * Math.hypot(m.b, m.d);
        out.push({
          kind: "circle",
          ...shared,
          box: { minX: centre.x - hx, minY: centre.y - hy, maxX: centre.x + hx, maxY: centre.y + hy },
          size: { w: d, h: d },
        });
        break;
      }
      case "polygon":
      case "line": {
        const ext = pointsExtent(props.points);
        const px = ext.minX + ox * ext.w;
        const py = ext.minY + oy * ext.h;
        const pts = props.points.map((p) => apply(m, p.x - px, p.y - py));
        out.push({ kind: props.kind, ...shared, box: boxOf(pts), size: { w: ext.w, h: ext.h } });
        break;
      }
      case "text": {
        out.push({
          kind: "text",
          ...shared,
          box: { minX: pivot.x, minY: pivot.y, maxX: pivot.x, maxY: pivot.y },
          size: { w: 0, h: 0 },
        });
        break;
      }
    }
  };

  for (const child of ir.children) walk(child, IDENTITY, 0, { x: 1, y: 1 });
  return out;
}
