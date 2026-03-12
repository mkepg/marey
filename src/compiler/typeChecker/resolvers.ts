import type { AstValue, NumberValue, PointValue, StringValue, PointListValue, ColorValue } from "../types";
import type { IRColor, IRPoint, IRPointList, IRSceneFit } from "../sceneIR";

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