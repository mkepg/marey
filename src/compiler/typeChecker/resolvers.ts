import type { AstValue, NumberValue, PointValue, StringValue, PointListValue, ColorValue, BooleanValue, EasingValue, AnimPropertyValue } from "../types";
import type { IRColor, IRPoint, IRPointList, IRFit, IREasing } from "../sceneIR";
import { EASING_VALUES as CONTRACT_EASING_VALUES, FIT_VALUES, propertyDefault } from "../languageContract";
import type { ContractDefault } from "../languageContract";

function requireContractDefault(block: string, key: string): ContractDefault {
  const value = propertyDefault(block, key);
  if (value === undefined) {
    throw new Error(`[IR] No default configured for contract property '${block}.${key}'.`);
  }
  return value;
}

function invalidContractDefault(block: string, key: string, expected: string): never {
  throw new Error(`[IR] Contract default '${block}.${key}' must be ${expected}.`);
}

export function contractNumberDefault(block: string, key: string): number {
  const value = requireContractDefault(block, key);
  return typeof value === "number" ? value : invalidContractDefault(block, key, "a number");
}

export function contractBooleanDefault(block: string, key: string): boolean {
  const value = requireContractDefault(block, key);
  return typeof value === "boolean" ? value : invalidContractDefault(block, key, "a boolean");
}

export function contractPointDefault(block: string, key: string): IRPoint {
  const value = requireContractDefault(block, key);
  return typeof value === "object"
    ? { x: value.x, y: value.y }
    : invalidContractDefault(block, key, "a point");
}

export function contractStringDefault(block: string, key: string): string {
  const value = requireContractDefault(block, key);
  return typeof value === "string" ? value : invalidContractDefault(block, key, "a string");
}

function isFit(value: string): value is IRFit {
  return (FIT_VALUES as readonly string[]).includes(value);
}

function isEasing(value: string): value is IREasing {
  return (CONTRACT_EASING_VALUES as readonly string[]).includes(value);
}

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
export function resolveFit(
  props: Record<string, AstValue>,
  fallback: string = contractStringDefault("scene", "fit"),
): IRFit {
  const v = props["fit"];
  if (v?.kind === "fit" && isFit(v.value)) return v.value;
  if (isFit(fallback)) return fallback;
  throw new Error(`[IR] Invalid fit fallback '${fallback}'.`);
}
export function resolveBoolean(props: Record<string, AstValue>, key: string, fallback: boolean): boolean {
  const v = props[key];
  if (v?.kind === "boolean") return (v as BooleanValue).value;
  return fallback;
}
export function resolveEasing(
  props: Record<string, AstValue>,
  key: string,
  fallback: string = contractStringDefault("animate", "easing"),
): IREasing {
  const v = props[key];
  if (v?.kind === "easing") {
    const easing = (v as EasingValue).value;
    if (isEasing(easing)) return easing;
  }
  if (isEasing(fallback)) return fallback;
  throw new Error(`[IR] Invalid easing fallback '${fallback}'.`);
}
export function getReqAnimProperty(props: Record<string, AstValue>, key: string): string {
  return (props[key] as AnimPropertyValue).value;
}
export function resolveAnimToValue(props: Record<string, AstValue>, key: string): number | IRPoint | IRColor {
  const v = props[key];
  if (v === undefined) {
    throw new Error(`[IR] Required animation property '${key}' is missing.`);
  }
  if (v.kind === "number") return v.value;
  if (v.kind === "point") return { x: v.x, y: v.y };
  throw new Error(`[IR] Animation property '${key}' must be a number or point.`);
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
