export type IRColor = string;

export interface IRPoint {
  readonly x: number;
  readonly y: number;
}

export type IRPointList = ReadonlyArray<IRPoint>;

export type IRSceneFit = "contain" | "cover" | "fill" | "none";

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
  readonly easing: IREasing;
  readonly loop: boolean;
  readonly yoyo: boolean;
  readonly handOff: boolean;
}

/**
 * A physics duration is either a finite number of seconds, or the sentinel
 * value `"indefinitely"` which means the simulation runs forever.
 * `"indefinitely"` is only valid when physics is NOT inside a sequence block.
 */
export type IRPhysicsDuration = number | "indefinitely";

export interface IRPhysics {
  readonly velocity: IRPoint;
  readonly gravity: IRPoint;
  readonly friction: number;
  readonly bounce: number;
  readonly collideBounds: boolean;
  /** How long this physics simulation runs before handing off. */
  readonly duration: IRPhysicsDuration;
}

/**
 * A sequence step is either an IRAnimation or an IRPhysics block.
 * Both run in parallel within the same sequence step (the gate
 * opens when ALL children complete).
 */
export type IRSequenceStep = IRAnimation | IRPhysics;

/**
 * A sequence block: runs after all peer animations/physics on the parent
 * object complete. Multiple sequences are chained in source order.
 * Each sequence contains at least one animate or physics child.
 */
export interface IRSequence {
  readonly steps: ReadonlyArray<IRSequenceStep>;
}

export interface IRVisualBase {
  readonly color: IRColor;
  readonly alpha: number;
  readonly position: IRPoint;
  readonly rotation: number;
  readonly scale: IRPoint;
  readonly anchor: IRPoint;
  readonly z: number;
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
  readonly z: number;
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
  readonly sceneFit: IRSceneFit;
  readonly children: ReadonlyArray<IRObjectNode>;
  readonly registry: Readonly<Record<IRObjectId, IRObjectNode>>;
}

export interface IRendererAdapter {
  render(scene: IRSceneNode, host: HTMLDivElement, isDark: boolean): Promise<() => void>;
}