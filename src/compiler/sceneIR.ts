/**
 * Scene IR — Intermediate Representation
 *
 * This module defines the fully-resolved, engine-agnostic intermediate
 * representation produced by the type-checker and consumed by renderer
 * adapters.  The IR has no dependency on PixiJS or any other rendering
 * engine.  All optional-property defaults are applied and all values are
 * normalised before the IR is constructed.  Once built, the IR is treated
 * as immutable.
 */

// ─── Scalar / value types ────────────────────────────────────────────────────

/** A resolved 24-bit RGB hex color string, always in full #rrggbb form. */
export type IRColor = string;

/** A 2-D coordinate pair in logical pixels. */
export interface IRPoint {
  readonly x: number;
  readonly y: number;
}

/** A non-empty ordered list of 2-D points (used by polygon). */
export type IRPointList = ReadonlyArray<IRPoint>;

/** Supported scale modes for the scene viewport. */
export type IRScaleMode = "contain" | "cover" | "fill" | "none";

// ─── Transform model ─────────────────────────────────────────────────────────

/**
 * The local transform carried by a group node.
 * Primitives carry only a position (translation); groups carry the full set.
 * Composition order: Scale → Rotation → Translation.
 */
export interface IRTransform {
  /** Translation in the parent's coordinate space. */
  readonly position: IRPoint;
  /** Clockwise rotation in degrees. */
  readonly rotation: number;
  /** Uniform scale factor (> 0). */
  readonly scale: number;
}

// ─── Visual properties ───────────────────────────────────────────────────────

/** Properties common to all drawable primitives (circle, rectangle, polygon, text). */
export interface IRVisualBase {
  /** Fill color in #rrggbb form. */
  readonly color: IRColor;
  /** Opacity in [0.0, 1.0]. */
  readonly alpha: number;
  /** Position in the parent's coordinate space. */
  readonly position: IRPoint;
}

export interface IRCircleProps extends IRVisualBase {
  readonly kind: "circle";
  readonly radius: number;
}

export interface IRRectangleProps extends IRVisualBase {
  readonly kind: "rectangle";
  readonly width: number;
  readonly height: number;
}

export interface IRPolygonProps extends IRVisualBase {
  readonly kind: "polygon";
  readonly points: IRPointList;
}

export interface IRTextProps extends IRVisualBase {
  readonly kind: "text";
  readonly content: string;
  readonly fontSize: number;
}

export interface IRGroupProps {
  readonly kind: "group";
  readonly transform: IRTransform;
}

export type IRObjectProps =
  | IRCircleProps
  | IRRectangleProps
  | IRPolygonProps
  | IRTextProps
  | IRGroupProps;

// ─── Object identity ─────────────────────────────────────────────────────────

/**
 * A stable, deterministic identifier for each IR node, derived from its
 * declaration scope and name (e.g. "scene.enemySquad.enemy1").
 * Compiler-internal in v1.0 — not exposed in Declare source syntax.
 */
export type IRObjectId = string;

// ─── IR node types ───────────────────────────────────────────────────────────

/**
 * A single resolved object node in the Scene IR.
 * Children are only present when props.kind === "group".
 */
export interface IRObjectNode {
  /** Stable deterministic identifier (scope path). */
  readonly id: IRObjectId;
  /** Resolved, normalised properties for this object. */
  readonly props: IRObjectProps;
  /** Ordered child nodes (non-empty only for groups). */
  readonly children: ReadonlyArray<IRObjectNode>;
}

/**
 * The root of the Scene IR — the fully-resolved scene graph.
 * This is the sole artifact produced by the type-checker and the sole
 * input accepted by renderer adapters.
 */
export interface IRSceneNode {
  readonly kind: "scene";
  /** Logical canvas dimensions. */
  readonly width: number;
  readonly height: number;
  /** Background fill color. */
  readonly background: IRColor;
  /** Viewport scaling strategy. */
  readonly scaleMode: IRScaleMode;
  /** Top-level object nodes in declaration order. */
  readonly children: ReadonlyArray<IRObjectNode>;
  /**
   * Flat registry mapping each IRObjectId to its node.
   * Enables O(1) lookup by identity without re-traversing the tree.
   */
  readonly registry: Readonly<Record<IRObjectId, IRObjectNode>>;
}

// ─── Renderer contract ───────────────────────────────────────────────────────

/**
 * The interface every renderer adapter must satisfy.
 * Adapters receive only a Scene IR — they must not import or reference
 * any compiler internals (AST types, lexer, parser, or type-checker).
 *
 * The returned cleanup function must release all resources allocated by
 * the adapter (canvas elements, WebGL contexts, timers, etc.).
 */
export interface IRendererAdapter {
  render(scene: IRSceneNode, host: HTMLDivElement, isDark: boolean): Promise<() => void>;
}