import type { AstValue, NumberValue, PointValue, StringValue, PointListValue, ColorValue, BooleanValue, EasingValue, AnimPropertyValue } from "../types";
import type { IRColor, IRPoint, IRPointList, IRSceneFit, IREasing } from "../sceneIR";
function normaliseColor(raw: string): IRColor {
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (hex.length === 3) {
    const [r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return `#${hex}`;
}
export function resolveColor(props: Record<string, AstValue>, key: string, fallback: IRColor): IRColor {
  const v = props[key];
  if (v?.kind === "color") return normaliseColor((v as ColorValue).value);
  return fallback;
}
export function resolveNumber(props: Record<string, AstValue>, key: string, fallback: number): number {
  const v = props[key];
  if (v?.kind === "number") return (v as NumberValue).value;
  return fallback;
}
export function resolvePoint(props: Record<string, AstValue>, key: string, fallback: IRPoint): IRPoint {
  const v = props[key];
  if (v?.kind === "point") return { x: (v as PointValue).x, y: (v as PointValue).y };
  return fallback;
}
export function resolveScale(props: Record<string, AstValue>, key: string, fallback: IRPoint): IRPoint {
  const v = props[key];
  if (v?.kind === "number") {
    return { x: (v as NumberValue).value, y: (v as NumberValue).value };
  }
  if (v?.kind === "point") {
    return { x: (v as PointValue).x, y: (v as PointValue).y };
  }
  return fallback;
}
export function resolveSceneFit(props: Record<string, AstValue>): IRSceneFit {
  const v = props["sceneFit"];
  if (v?.kind === "sceneFit") return v.value as IRSceneFit;
  return "contain";
}
export function resolveBoolean(props: Record<string, AstValue>, key: string, fallback: boolean): boolean {
  const v = props[key];
  if (v?.kind === "boolean") return (v as BooleanValue).value;
  return fallback;
}
export function resolveEasing(props: Record<string, AstValue>, key: string, fallback: IREasing): IREasing {
  const v = props[key];
  if (v?.kind === "easing") return (v as EasingValue).value as IREasing;
  return fallback;
}
export function getReqAnimProperty(props: Record<string, AstValue>, key: string): string {
  return (props[key] as AnimPropertyValue).value;
}
export function resolveAnimToValue(props: Record<string, AstValue>, key: string): number | IRPoint | IRColor {
  const v = props[key];
  if (v.kind === "number") return v.value;
  if (v.kind === "point") return { x: v.x, y: v.y };
  if (v.kind === "color") return resolveColor(props, key, "#000");
  return 0;
}
export function getReqNumber(props: Record<string, AstValue>, key: string): number {
  return (props[key] as NumberValue).value;
}
export function getReqPoint(props: Record<string, AstValue>, key: string): IRPoint {
  const v = props[key] as PointValue;
  return { x: v.x, y: v.y };
}
export function getReqString(props: Record<string, AstValue>, key: string): string {
  return (props[key] as StringValue).value;
}
export function getReqPointList(props: Record<string, AstValue>, key: string): IRPointList {
  const v = props[key] as PointListValue;
  return v.value.map((pt) => ({ x: pt.x, y: pt.y }));
}