export type IRColor = string;

export interface IRPoint {
  readonly x: number;
  readonly y: number;
}

export type IRPointList = ReadonlyArray<IRPoint>;
export type IRSceneFit = "contain" | "cover" | "fill" | "none";

export interface IRTransform {
  readonly position: IRPoint;
  readonly rotation: number;
  readonly scale: IRPoint;
  readonly anchor: IRPoint;
}

export interface IRVisualBase {
  readonly color: IRColor;
  readonly alpha: number;
  readonly position: IRPoint;
  readonly rotation: number;
  readonly scale: IRPoint;
  readonly anchor: IRPoint;
  readonly z: number;
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
  readonly alpha: number;
  readonly z: number;
}

export type IRObjectProps =
  | IRCircleProps
  | IRRectangleProps
  | IRPolygonProps
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