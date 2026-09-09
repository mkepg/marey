/**
 * The fixed simulation rate. 120Hz is chosen so that common export frame
 * rates divide evenly into it (24 → 5 ticks, 30 → 4, 60 → 2), which keeps
 * exported frames on exact simulation states rather than interpolations.
 *
 * This lives here rather than in `renderer/clock.ts` because it — and
 * `secondsToTicks` below — are needed by both pipeline stages: the renderer
 * for the simulation clock itself, and the typeChecker's validator for
 * comparing durations in the same unit the runtime does (`TYPE_HANDOFF_DURATION`).
 * `sceneIR.ts` already sits at the pipeline-neutral level both import, so
 * this is the one implementation; `clock.ts` re-exports it rather than
 * keeping its own copy.
 */
export const TICK_HZ = 120;

/** Convert a duration in seconds to whole simulation ticks. */
export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_HZ));
}

export type IRColor = string;

export interface IRPoint {
  readonly x: number;
  readonly y: number;
}

export type IRPointList = ReadonlyArray<IRPoint>;

export type IRFit = "contain" | "cover" | "fill" | "none";
export type IREasing = "linear" | "easeIn" | "easeOut" | "easeInOut";

export interface IRTransform {
  readonly position: IRPoint;
  readonly rotation: number;
  readonly scale: IRPoint;
}

export interface IRAnimation {
  readonly property: string;
  readonly to: number | IRPoint | IRColor;
  readonly duration: number;
  /** Seconds to wait before this animation begins. */
  readonly delay: number;
  readonly easing: IREasing;
  readonly loop: boolean;
  readonly yoyo: boolean;
  readonly handoff: boolean;
}

export type IRPhysicsDuration = number | "indefinitely";

export interface IRPhysics {
  readonly velocity: IRPoint;
  readonly gravity: IRPoint;
  readonly airDrag: number;
  readonly bounce: number;
  readonly collideBounds: boolean;
  readonly duration: IRPhysicsDuration;
}

export interface IRParallelStep {
  readonly type: "parallel";
  readonly steps: ReadonlyArray<IRAnimation | IRPhysics>;
}

export type IRSequenceStep = IRAnimation | IRPhysics | IRParallelStep;

export interface IRSequence {
  readonly steps: ReadonlyArray<IRSequenceStep>;
}

export interface IRVisualBase {
  readonly color: IRColor;
  readonly alpha: number;
  readonly position: IRPoint;
  readonly rotation: number;
  readonly scale: IRPoint;
  readonly origin: IRPoint;
  readonly layer: number;
  readonly animations: ReadonlyArray<IRAnimation>;
  readonly physics?: IRPhysics;
  readonly sequences: ReadonlyArray<IRSequence>;
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

export interface IRLineProps extends IRVisualBase {
  readonly kind: "line";
  readonly points: IRPointList;
  readonly thickness: number;
}

export interface IRTextProps extends IRVisualBase {
  readonly kind: "text";
  readonly content: string;
  readonly fontSize: number;
}

export interface IRGroupProps {
  readonly kind: "group";
  readonly transform: IRTransform;
  readonly alpha: number;
  readonly layer: number;
  readonly animations: ReadonlyArray<IRAnimation>;
  readonly physics?: IRPhysics;
  readonly sequences: ReadonlyArray<IRSequence>;
}

export type IRObjectProps =
  | IRCircleProps
  | IRRectangleProps
  | IRPolygonProps
  | IRLineProps
  | IRTextProps
  | IRGroupProps;

export type IRObjectId = string;

export interface IRObjectNode {
  readonly id: IRObjectId;
  readonly props: IRObjectProps;
  readonly children: ReadonlyArray<IRObjectNode>;
}

export interface IRSceneNode {
  readonly kind: "scene";
  readonly width: number;
  readonly height: number;
  readonly background: IRColor;
  readonly fit: IRFit;
  readonly children: ReadonlyArray<IRObjectNode>;
  readonly registry: Readonly<Record<IRObjectId, IRObjectNode>>;
}

export interface IRendererAdapter {
  render(scene: IRSceneNode, host: HTMLDivElement, isDark: boolean): Promise<() => void>;
}
