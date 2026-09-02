/**
 * 2D transform algebra, shared by the builder's group flattening and
 * `physicsSync`'s ancestor composition.
 *
 * Deliberately dependency-free — no `pixi.js`, no IR, no Matter. It exists as
 * its own module because two callers need the identical composition and a
 * second copy would drift.
 *
 * `rot` is in radians, matching `Container.rotation`. Declare source writes
 * degrees; `builder.ts` converts on the way in.
 */
export interface LocalTransform {
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly sx: number;
  readonly sy: number;
}

export const IDENTITY: LocalTransform = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };

/**
 * Place a child's local transform inside its parent's frame.
 *
 * Scale applies before rotation, which is the order PixiJS's own scene graph
 * uses, so a scaled-then-rotated child lands where it is drawn.
 */
export function compose(
  parent: LocalTransform,
  localPos: { x: number; y: number },
  localRot: number,
  localScale: { x: number; y: number }
): LocalTransform {
  const c = Math.cos(parent.rot);
  const s = Math.sin(parent.rot);
  const px = localPos.x * parent.sx;
  const py = localPos.y * parent.sy;
  return {
    x: parent.x + px * c - py * s,
    y: parent.y + px * s + py * c,
    rot: parent.rot + localRot,
    sx: parent.sx * localScale.x,
    sy: parent.sy * localScale.y,
  };
}

/** A point in `t`'s local space, expressed in the space `t` is defined in. */
export function toWorld(t: LocalTransform, x: number, y: number): { x: number; y: number } {
  const c = Math.cos(t.rot);
  const s = Math.sin(t.rot);
  const px = x * t.sx;
  const py = y * t.sy;
  return { x: t.x + px * c - py * s, y: t.y + px * s + py * c };
}

/**
 * The exact inverse of `toWorld`.
 *
 * Used for physics write-back: the world reports a body's position in scene
 * space, but a container's `currentPos` is relative to its parent.
 */
export function toLocal(t: LocalTransform, x: number, y: number): { x: number; y: number } {
  const c = Math.cos(t.rot);
  const s = Math.sin(t.rot);
  const dx = x - t.x;
  const dy = y - t.y;
  return {
    x: (dx * c + dy * s) / t.sx,
    y: (-dx * s + dy * c) / t.sy,
  };
}

/**
 * Rotate and scale a vector, without translating it.
 *
 * A velocity is a direction and a magnitude, not a position, so it must not
 * pick up the parent's offset. `handoff` needs this.
 */
export function rotateScaleVector(
  t: LocalTransform,
  x: number,
  y: number
): { x: number; y: number } {
  const c = Math.cos(t.rot);
  const s = Math.sin(t.rot);
  const px = x * t.sx;
  const py = y * t.sy;
  return { x: px * c - py * s, y: px * s + py * c };
}
