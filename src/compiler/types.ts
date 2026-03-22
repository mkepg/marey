export type TokenType =
  | "KEYWORD"
  | "IDENT"
  | "NUMBER"
  | "HEX_COLOR"
  | "NAMED_COLOR"
  | "SCENE_FIT"
  | "STRING"
  | "BOOLEAN"
  | "EASING"
  | "DURATION_INDEFINITELY"
  | "LBRACE"
  | "RBRACE"
  | "LBRACKET"
  | "RBRACKET"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "COLON"
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  | "EQUALS"
  | "EOF";

export interface Token {
  readonly type: TokenType;
  readonly value: string | number | boolean | null;
  readonly line: number;
  readonly col: number;
  readonly endCol: number;
}

export interface NumberValue {
  readonly kind: "number";
  readonly value: number;
  readonly line: number;
  readonly col: number;
}

export interface ColorValue {
  readonly kind: "color";
  readonly value: string;
  readonly line: number;
  readonly col: number;
}

export interface StringValue {
  readonly kind: "string";
  readonly value: string;
  readonly line: number;
  readonly col: number;
}

export interface PointValue {
  readonly kind: "point";
  readonly x: number;
  readonly y: number;
  readonly line: number;
  readonly col: number;
}

export interface PointListValue {
  readonly kind: "pointList";
  readonly value: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly line: number;
  readonly col: number;
}

export type SceneFit = "contain" | "cover" | "fill" | "none";

export interface SceneFitValue {
  readonly kind: "sceneFit";
  readonly value: SceneFit;
  readonly line: number;
  readonly col: number;
}

export interface BooleanValue {
  readonly kind: "boolean";
  readonly value: boolean;
  readonly line: number;
  readonly col: number;
}

export interface EasingValue {
  readonly kind: "easing";
  readonly value: string;
  readonly line: number;
  readonly col: number;
}

export interface AnimPropertyValue {
  readonly kind: "animProperty";
  readonly value: string;
  readonly line: number;
  readonly col: number;
}

/**
 * Represents the special `indefinitely` keyword used as a physics duration.
 * Only valid on physics blocks that are NOT inside a sequence block.
 */
export interface IndefinitelyValue {
  readonly kind: "indefinitely";
  readonly line: number;
  readonly col: number;
}

export type AstValue =
  | NumberValue
  | ColorValue
  | StringValue
  | PointValue
  | PointListValue
  | SceneFitValue
  | BooleanValue
  | EasingValue
  | AnimPropertyValue
  | IndefinitelyValue;

export type ObjectType =
  | "circle"
  | "rectangle"
  | "polygon"
  | "line"
  | "text"
  | "group"
  | "animate"
  | "physics"
  | "sequence";

export interface ObjectNode {
  readonly type: ObjectType;
  readonly name: string;
  readonly props: Record<string, AstValue>;
  readonly children: ObjectNode[];
  readonly line: number;
  readonly col: number;
  readonly isUse?: boolean;
}

export interface SceneNode {
  readonly type: "scene";
  readonly props: Record<string, AstValue>;
  readonly children: ObjectNode[];
  readonly line: number;
  readonly col: number;
}

export type AstNode = SceneNode | ObjectNode;

export interface CompilerError {
  readonly phase: string;
  readonly message: string;
  readonly line?: number;
  readonly col?: number;
  readonly endLine?: number;
  readonly endCol?: number;
}

export interface TemplateDef {
  readonly name: string;
  readonly params: string[];
  readonly startPos: number;
  readonly endPos: number;
}

export interface ParseResult {
  readonly ast: SceneNode | null;
  readonly errors: CompilerError[];
  readonly env: Record<string, AstValue>;
  readonly templates: Record<string, TemplateDef>;
}

export interface LintResult {
  readonly errors: CompilerError[];
  readonly symbols: string[];
}

export type LogKind = "info" | "ok" | "error" | "sys";

export interface LogEntry {
  readonly kind: LogKind;
  readonly text: string;
}

export interface CompileResult {
  readonly logs: LogEntry[];
  readonly errors: CompilerError[];
  readonly success: boolean;
}