import { TICK_HZ } from "./clock";
import Matter from "matter-js";

/**
 * `@types/matter-js` omits several members this phase relies on that exist at
 * runtime (verified against `../matter-js-master/src`):
 *  - `Common._seed`: the module-global seed for Matter's internal PRNG.
 *  - `Sleeping.update` / `Sleeping.afterCollisions`: we drive the sleeping
 *    pass ourselves (spec 6.4).
 *  - `Body.deltaTime`: the per-body delta Matter normalises velocity against;
 *    set once so the first tick after `Body.create` (which defaults it to
 *    1000/60) doesn't apply a spurious time-correction factor at 120Hz.
 * This augmentation is global, so the test file sees it without re-declaring.
 */
declare module "matter-js" {
  namespace Common {
    const _baseDelta: number;
    let _seed: number;
  }
  namespace Sleeping {
    function update(bodies: Matter.Body[], delta: number): void;
    function afterCollisions(pairs: Matter.Pair[]): void;
  }
  interface Body {
    deltaTime: number;
  }
}

/**
 * Matter normalises velocity and air friction against `Common._baseDelta`
 * (1000/60 ms), independently of the delta actually passed to `Engine.update`.
 * `MATTER_R` is our tick expressed in those units.
 *
 * Every conversion below is written in terms of it rather than hard-coded for
 * 120Hz, so changing TICK_HZ cannot silently halve or double anything.
 */
export const MATTER_R = 60 / TICK_HZ;

/** Milliseconds of one fixed tick, as Matter wants it. */
export const MATTER_DELTA_MS = 1000 / TICK_HZ;

/** Matter's own velocity unit: pixels per 1/60 of a second. */
const MATTER_BASE_HZ = 60;

/**
 * Declare's `airDrag` is 0 = vacuum, 1 = maximum resistance, and was defined by
 * the old engine as `pow(1 - airDrag, 1/60)` applied once per tick.
 *
 * Matter damps by `1 - frictionAir * MATTER_R` once per tick. Matching one
 * second of the two gives `1 - fa*r = (1 - airDrag)^r`.
 */
export function airDragToFrictionAir(airDrag: number): number {
  const clamped = airDrag < 0 ? 0 : airDrag > 1 ? 1 : airDrag;
  return (1 - Math.pow(1 - clamped, MATTER_R)) / MATTER_R;
}

/** px/s (Declare) → px per 1/60s (Matter's `Body.setVelocity`). */
export function pxPerSecToMatter(pxPerSec: number): number {
  return pxPerSec / MATTER_BASE_HZ;
}

/** px per 1/60s (Matter) → px/s (Declare). */
export function matterToPxPerSec(matterVel: number): number {
  return matterVel * MATTER_BASE_HZ;
}

/**
 * px/s^2 (Declare) → the velocity delta, in Matter units, to add once per tick.
 *
 * This is deliberately not a force. See spec 6.4: a force set before
 * `Engine.update` is still in the buffer when Matter's sleeping pass reads it,
 * so nothing would ever sleep.
 */
export function gravityToTickDelta(pxPerSecSq: number): number {
  return pxPerSecToMatter(pxPerSecSq) / TICK_HZ;
}

/** Why a body is currently pinned. Reason-counted, so two holds need two releases. */
export type PinReason = "NO_RUNNER" | "POS_ANIM" | "FROZEN";

/**
 * A point in a body's own local space. Spelled inline rather than imported,
 * because this module must not depend on `pixi.js` (D9) and does not depend on
 * the IR either.
 */
export interface LocalPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * One shape inside a compound, placed in the group's local space.
 *
 * `x`/`y` locate the shape's own pivot — its centre for a circle or rectangle,
 * its bounding-box centre for a polygon — which is the same point `builder.ts`
 * pivots the drawn shape about. `angle` is radians.
 */
export type BodyPart =
  | { readonly kind: "circle"; readonly radius: number; readonly x: number; readonly y: number }
  | {
      readonly kind: "rectangle";
      readonly width: number; readonly height: number;
      readonly x: number; readonly y: number; readonly angle: number;
    }
  | {
      readonly kind: "polygon";
      readonly points: ReadonlyArray<LocalPoint>;
      readonly x: number; readonly y: number; readonly angle: number;
    };

/**
 * Plain geometry, in the container's own local space. Deliberately free of
 * any PixiJS type (spec D9).
 *
 * `addBody` places the geometry's **reference point** at the (x, y) it is
 * given. Each kind defines its own, and the stored offset is always
 * `referencePoint − centreOfMass` (spec D16, which generalises D15):
 *
 * | kind        | reference point            | offset            |
 * |-------------|----------------------------|-------------------|
 * | `circle`    | shape centre               | zero              |
 * | `rectangle` | shape centre               | zero              |
 * | `polygon`   | bounding-box centre        | bbox − centroid   |
 * | `compound`  | the group's local origin   | origin − centre   |
 *
 * That is what keeps the drawn shape aligned with its collision shape as a
 * body rotates, and what makes a group rotate about its declared origin
 * rather than about its content's centre of mass.
 */
export type BodyGeometry =
  | { readonly kind: "circle"; readonly radius: number }
  | { readonly kind: "rectangle"; readonly width: number; readonly height: number }
  | { readonly kind: "polygon"; readonly points: ReadonlyArray<LocalPoint> }
  | { readonly kind: "compound"; readonly parts: ReadonlyArray<BodyPart> };

/** Declare's physics properties, in Declare's units. px/s, px/s^2, 0..1. */
export interface PhysicsParams {
  readonly gravityX: number;
  readonly gravityY: number;
  readonly airDrag: number;
  readonly bounce: number;
  readonly collideBounds: boolean;
}

export interface BodyState {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface IPhysicsWorld {
  addBody(
    id: string,
    geometry: BodyGeometry,
    x: number,
    y: number,
    angle: number,
    params: PhysicsParams
  ): void;
  removeBody(id: string): void;
  hasBody(id: string): boolean;
  setParams(id: string, params: PhysicsParams): void;
  pin(id: string, reason: PinReason): void;
  unpin(id: string, reason: PinReason): void;
  isPinned(id: string): boolean;
  /** Drives a pinned body. px, scene space, at the bounding-box centre. */
  setPosition(id: string, x: number, y: number): void;
  /** px/s, converted internally. */
  setVelocity(id: string, vx: number, vy: number): void;
  setScale(id: string, sx: number, sy: number): void;
  /** Radians to hold the angle at, or null to release it back to the solver. */
  overrideAngle(id: string, radians: number | null): void;
  /** Advance exactly one fixed tick. Takes no time argument, ever. */
  step(): void;
  readState(id: string, alpha: number): BodyState | null;
  idsOutsideBounds(margin: number): string[];
  isIdle(): boolean;
  /** Whether a body is currently dormant. A sleeping body still collides. */
  isAsleep(id: string): boolean;
  /** A body's world-space AABB. Test-facing; the renderer does not need it. */
  boundsOf(id: string): Matter.Bounds | null;
  destroy(): void;
}

const CATEGORY_OBJECT = 0x0001;
const CATEGORY_WALL = 0x0002;

/** How far outside the scene the walls sit, and how thick they are. */
const WALL_THICKNESS = 200;

interface BodyRecord {
  readonly body: Matter.Body;
  gravityX: number;
  gravityY: number;
  /** Local vector from centre of mass to the geometry's reference point, at scale 1. */
  readonly offsetX: number;
  readonly offsetY: number;
  scaleX: number;
  scaleY: number;
  /** Why this body is pinned, and how many holds each reason has. */
  readonly pinReasons: Map<PinReason, number>;
  angleOverride: number | null;
  prevX: number;
  prevY: number;
  prevAngle: number;
}

/**
 * Matter's `Vertices.hull` is typed as taking `Matter.Vertex[]`
 * (index/body/isInternal), but the real implementation
 * (`../matter-js-master/src/geometry/Vertices.js`) only ever reads `.x`/`.y`
 * off each entry, so plain points are safe at runtime.
 *
 * Hulling up front rather than letting Matter fall back internally also avoids
 * its `warnOnce` about the `poly-decomp` we deliberately do not ship (spec 3).
 */
function hullOf(points: ReadonlyArray<LocalPoint>): Matter.Vertex[] {
  return Matter.Vertices.hull(
    points.map((p) => ({ x: p.x, y: p.y })) as Matter.Vertex[]
  );
}

/** Rotate points about the local origin. */
function rotatePoints(points: ReadonlyArray<LocalPoint>, angle: number): LocalPoint[] {
  if (angle === 0) return points.map((p) => ({ x: p.x, y: p.y }));
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return points.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

/**
 * A polygon body whose *bounding-box centre* lands at (x, y).
 *
 * `Bodies.fromVertices` places the centre of MASS at the point it is given, and
 * for an asymmetric polygon those are different points — 7.5px apart for the
 * default scene's own triangle. This is D15.
 */
function polygonBodyAtBboxCentre(
  points: ReadonlyArray<LocalPoint>,
  x: number,
  y: number
): Matter.Body {
  // Matter.Vertex extends Vector, so the hull passes straight to fromVertices.
  const hull = hullOf(points);
  const centroid = Matter.Vertices.centre(hull);
  const bounds = Matter.Bounds.create(hull);
  const offX = (bounds.min.x + bounds.max.x) / 2 - centroid.x;
  const offY = (bounds.min.y + bounds.max.y) / 2 - centroid.y;
  return Matter.Bodies.fromVertices(x - offX, y - offY, [hull]);
}

/**
 * One Matter body for a part, with the part's own pivot placed at
 * (originX + p.x, originY + p.y).
 *
 * A rotated rectangle takes `angle` as an option, because a rectangle's pivot
 * is its centre and `Bodies.rectangle` rotates about that. A rotated polygon
 * instead has its *points* rotated first, because its pivot is the bounding-box
 * centre and `Body.setAngle` would rotate it about the centre of mass.
 */
function createPartBody(p: BodyPart, originX: number, originY: number): Matter.Body {
  const x = originX + p.x;
  const y = originY + p.y;

  if (p.kind === "circle") {
    return Matter.Bodies.circle(x, y, Math.max(p.radius, 0.5));
  }
  if (p.kind === "rectangle") {
    return Matter.Bodies.rectangle(
      x, y,
      Math.max(p.width, 1),
      Math.max(p.height, 1),
      { angle: p.angle }
    );
  }
  return polygonBodyAtBboxCentre(rotatePoints(p.points, p.angle), x, y);
}

export class MatterWorld implements IPhysicsWorld {
  private readonly engine: Matter.Engine;
  private readonly records = new Map<string, BodyRecord>();
  private readonly width: number;
  private readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    // Matter's seeded RNG is module-global and survives between worlds in a
    // page session, so a second run would otherwise diverge from a cold load.
    Matter.Common._seed = 0;

    this.engine = Matter.Engine.create();
    // Declare's gravity is per object, so the world has none of its own.
    this.engine.gravity.scale = 0;
    // We run the sleeping pass ourselves; see step() and spec 6.4.
    this.engine.enableSleeping = false;

    Matter.Composite.add(this.engine.world, this.createWalls());
  }

  private createWalls(): Matter.Body[] {
    const t = WALL_THICKNESS;
    const w = this.width;
    const h = this.height;
    const opts = {
      isStatic: true,
      collisionFilter: { category: CATEGORY_WALL, mask: CATEGORY_OBJECT, group: 0 },
    };
    return [
      Matter.Bodies.rectangle(w / 2, -t / 2, w + t * 2, t, opts),
      Matter.Bodies.rectangle(w / 2, h + t / 2, w + t * 2, t, opts),
      Matter.Bodies.rectangle(-t / 2, h / 2, t, h + t * 2, opts),
      Matter.Bodies.rectangle(w + t / 2, h / 2, t, h + t * 2, opts),
    ];
  }

  addBody(
    id: string,
    geometry: BodyGeometry,
    x: number,
    y: number,
    angle: number,
    params: PhysicsParams
  ): void {
    // Every branch places the geometry's REFERENCE POINT at (x, y); the offset
    // then falls out as `(x, y) − centreOfMass` uniformly. See BodyGeometry's
    // table and spec D16.
    let body: Matter.Body;

    if (geometry.kind === "circle") {
      body = Matter.Bodies.circle(x, y, Math.max(geometry.radius, 0.5));
    } else if (geometry.kind === "rectangle") {
      body = Matter.Bodies.rectangle(
        x, y,
        Math.max(geometry.width, 1),
        Math.max(geometry.height, 1)
      );
    } else if (geometry.kind === "polygon") {
      body = polygonBodyAtBboxCentre(geometry.points, x, y);
    } else if (geometry.parts.length === 0) {
      // An empty group. Body.create({parts: []}) would silently hand back
      // Matter's default 40x40 body; a unit rectangle preserves what a
      // zero-area group did before compounds existed.
      body = Matter.Bodies.rectangle(x, y, 1, 1);
    } else {
      body = Matter.Body.create({
        parts: geometry.parts.map((p) => createPartBody(p, x, y)),
      });
    }

    // Captured before setAngle, so it is a body-LOCAL vector: at angle 0 the
    // body's local axes and the world's coincide.
    const offsetX = x - body.position.x;
    const offsetY = y - body.position.y;

    // Body.create defaults deltaTime to 1000/60. Left alone, the first tick
    // would run with Matter's time correction at 0.5. Parts inherit the same
    // default, but Body.update and setVelocity/getVelocity read only the
    // parent's, so the parent is the only one that needs it.
    body.deltaTime = MATTER_DELTA_MS;
    Matter.Body.setAngle(body, angle);

    const rec: BodyRecord = {
      body,
      gravityX: params.gravityX,
      gravityY: params.gravityY,
      offsetX,
      offsetY,
      scaleX: 1,
      scaleY: 1,
      pinReasons: new Map(),
      angleOverride: null,
      prevX: body.position.x,
      prevY: body.position.y,
      prevAngle: body.angle,
    };
    this.records.set(id, rec);
    this.applyParams(rec, params);
    Matter.Composite.add(this.engine.world, body);
  }

  private applyParams(rec: BodyRecord, params: PhysicsParams): void {
    rec.gravityX = params.gravityX;
    rec.gravityY = params.gravityY;
    rec.body.restitution = params.bounce;
    rec.body.frictionAir = airDragToFrictionAir(params.airDrag);
    rec.body.collisionFilter.category = CATEGORY_OBJECT;
    rec.body.collisionFilter.mask = params.collideBounds
      ? CATEGORY_OBJECT | CATEGORY_WALL
      : CATEGORY_OBJECT;
  }

  setParams(id: string, params: PhysicsParams): void {
    const rec = this.records.get(id);
    if (rec) this.applyParams(rec, params);
  }

  removeBody(id: string): void {
    const rec = this.records.get(id);
    if (!rec) return;
    Matter.Composite.remove(this.engine.world, rec.body);
    this.records.delete(id);
  }

  hasBody(id: string): boolean {
    return this.records.has(id);
  }

  /** Local offset rotated into world space at the body's current angle and scale. */
  private rotatedOffset(rec: BodyRecord): { x: number; y: number } {
    if (rec.offsetX === 0 && rec.offsetY === 0) return { x: 0, y: 0 };
    const ox = rec.offsetX * rec.scaleX;
    const oy = rec.offsetY * rec.scaleY;
    const c = Math.cos(rec.body.angle);
    const s = Math.sin(rec.body.angle);
    return { x: ox * c - oy * s, y: ox * s + oy * c };
  }

  readState(id: string, alpha: number): BodyState | null {
    const rec = this.records.get(id);
    if (!rec) return null;
    const off = this.rotatedOffset(rec);
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    return {
      x: rec.prevX + (rec.body.position.x - rec.prevX) * a + off.x,
      y: rec.prevY + (rec.body.position.y - rec.prevY) * a + off.y,
      angle: rec.prevAngle + (rec.body.angle - rec.prevAngle) * a,
    };
  }

  setPosition(id: string, x: number, y: number): void {
    const rec = this.records.get(id);
    if (!rec) return;
    const off = this.rotatedOffset(rec);
    Matter.Body.setPosition(rec.body, { x: x - off.x, y: y - off.y });
  }

  pin(id: string, reason: PinReason): void {
    const rec = this.records.get(id);
    if (!rec) return;
    const wasPinned = rec.pinReasons.size > 0;
    // Counted, not a set: two position animations on one object take two holds
    // and must take two releases. A Set silently collapsed them, so the first
    // animation to finish handed the body back to the solver while the second
    // was still driving it.
    rec.pinReasons.set(reason, (rec.pinReasons.get(reason) ?? 0) + 1);
    if (!wasPinned) Matter.Body.setStatic(rec.body, true);
  }

  unpin(id: string, reason: PinReason): void {
    const rec = this.records.get(id);
    if (!rec) return;
    const held = rec.pinReasons.get(reason);
    if (held === undefined) return;
    if (held > 1) {
      rec.pinReasons.set(reason, held - 1);
      return;
    }
    rec.pinReasons.delete(reason);
    if (rec.pinReasons.size > 0) return;
    // setStatic collapses positionPrev onto position, so the body resumes from
    // rest. Callers that want momentum carried across call setVelocity after.
    Matter.Body.setStatic(rec.body, false);
    Matter.Sleeping.set(rec.body, false);
  }

  isPinned(id: string): boolean {
    const rec = this.records.get(id);
    return rec ? rec.pinReasons.size > 0 : false;
  }

  setVelocity(id: string, vx: number, vy: number): void {
    const rec = this.records.get(id);
    if (!rec) return;
    Matter.Body.setVelocity(rec.body, {
      x: pxPerSecToMatter(vx),
      y: pxPerSecToMatter(vy),
    });
  }

  setScale(id: string, sx: number, sy: number): void {
    const rec = this.records.get(id);
    if (!rec) return;
    const safeX = Math.abs(sx) < 1e-4 ? 1e-4 : Math.abs(sx);
    const safeY = Math.abs(sy) < 1e-4 ? 1e-4 : Math.abs(sy);
    if (safeX === rec.scaleX && safeY === rec.scaleY) return;
    Matter.Body.scale(rec.body, safeX / rec.scaleX, safeY / rec.scaleY);
    rec.scaleX = safeX;
    rec.scaleY = safeY;
  }

  /**
   * Hold this body's angle, or pass null to hand it back to the solver.
   *
   * Recording only: the value is applied inside `step()`, after the previous-
   * state buffer has been captured. Applying it here instead would overwrite
   * `body.angle` before `step()` reads it, making `prevAngle` equal the current
   * angle and collapsing `readState`'s interpolation to a per-tick snap.
   */
  overrideAngle(id: string, radians: number | null): void {
    const rec = this.records.get(id);
    if (rec) rec.angleOverride = radians;
  }

  /**
   * Advance exactly one fixed tick.
   *
   * The phase order matters and mirrors Engine.update's own. Matter applies
   * world gravity AFTER its sleeping pass and clears forces before the next
   * one, so at the moment Sleeping.update runs every force buffer is zero.
   * A force we set ourselves would still be there, and Sleeping.update
   * force-wakes anything carrying one — so nothing would ever sleep.
   *
   * We therefore drive the sleeping pass ourselves (enableSleeping is false)
   * and inject gravity as a velocity delta, which the sleeping pass cannot see.
   */
  step(): void {
    const allBodies = Matter.Composite.allBodies(this.engine.world);

    for (const rec of this.records.values()) {
      rec.prevX = rec.body.position.x;
      rec.prevY = rec.body.position.y;
      rec.prevAngle = rec.body.angle;
    }

    Matter.Sleeping.update(allBodies, MATTER_DELTA_MS);

    for (const rec of this.records.values()) {
      if (rec.body.isStatic || rec.body.isSleeping) continue;
      if (rec.gravityX === 0 && rec.gravityY === 0) continue;
      const v = Matter.Body.getVelocity(rec.body);
      Matter.Body.setVelocity(rec.body, {
        x: v.x + gravityToTickDelta(rec.gravityX),
        y: v.y + gravityToTickDelta(rec.gravityY),
      });
    }

    Matter.Engine.update(this.engine, MATTER_DELTA_MS);

    // D8: a rotation animation owns the angle while position stays dynamic.
    // Matter has no such mode, so force it back after the solver has run.
    for (const rec of this.records.values()) {
      if (rec.angleOverride === null) continue;
      Matter.Body.setAngle(rec.body, rec.angleOverride);
      Matter.Body.setAngularVelocity(rec.body, 0);
    }

    Matter.Sleeping.afterCollisions(this.engine.pairs.list);
  }

  idsOutsideBounds(margin: number): string[] {
    const out: string[] = [];
    for (const [id, rec] of this.records) {
      const { x, y } = rec.body.position;
      if (x < -margin || y < -margin || x > this.width + margin || y > this.height + margin) {
        out.push(id);
      }
    }
    return out;
  }

  isIdle(): boolean {
    for (const rec of this.records.values()) {
      if (!rec.body.isSleeping && !rec.body.isStatic) return false;
    }
    return true;
  }

  /** Whether a body is currently dormant. A sleeping body still collides. */
  isAsleep(id: string): boolean {
    const rec = this.records.get(id);
    return rec ? rec.body.isSleeping : false;
  }

  /** A body's world-space AABB. Test-facing; the renderer does not need it. */
  boundsOf(id: string): Matter.Bounds | null {
    const rec = this.records.get(id);
    return rec ? rec.body.bounds : null;
  }

  destroy(): void {
    Matter.Composite.clear(this.engine.world, false, true);
    Matter.Engine.clear(this.engine);
    this.records.clear();
  }
}
