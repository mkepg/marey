// ─────────────────────────────────────────────────────────────────────────────
// Declare Compiler — Shared Types
// ─────────────────────────────────────────────────────────────────────────────

// ── Tokens ────────────────────────────────────────────────────────────────────

export type TokenType =
  | "KEYWORD"
  | "IDENT"
  | "NUMBER"
  | "HEX_COLOR"
  | "NAMED_COLOR"
  | "STRING"
  | "LBRACE"
  | "RBRACE"
  | "LBRACKET"
  | "RBRACKET"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "COLON"
  | "EOF";

export interface Token {
  readonly type: TokenType;
  readonly value: string | number | null;
  readonly line: number;
  readonly col: number;
}

// ── AST Value Nodes ───────────────────────────────────────────────────────────

export interface NumberValue {
  readonly kind: "number";
  readonly value: number;
}

export interface ColorValue {
  readonly kind: "color";
  readonly value: string; // always resolved to #rrggbb or #rgb
}

export interface StringValue {
  readonly kind: "string";
  readonly value: string;
}

export interface PointValue {
  readonly kind: "point";
  readonly x: number;
  readonly y: number;
}

export interface PointListValue {
  readonly kind: "pointList";
  readonly value: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export type AstValue =
  | NumberValue
  | ColorValue
  | StringValue
  | PointValue
  | PointListValue;

// ── AST Nodes ─────────────────────────────────────────────────────────────────

export type ObjectType = "circle" | "rectangle" | "polygon" | "text" | "group";

export interface ObjectNode {
  readonly type: ObjectType;
  readonly name: string;
  readonly props: Record<string, AstValue>;
  readonly children: ObjectNode[];
}

export interface SceneNode {
  readonly type: "scene";
  readonly props: Record<string, AstValue>;
  readonly children: ObjectNode[];
}

export type AstNode = SceneNode | ObjectNode;

// ── Compiler Error ────────────────────────────────────────────────────────────

export interface CompilerError {
  readonly phase: "LEX" | "PARSE" | "TYPE" | "RENDER";
  readonly message: string;
  readonly line?: number;
  readonly col?: number;
}

// ── Log Entry ─────────────────────────────────────────────────────────────────

export type LogKind = "info" | "ok" | "error" | "sys";

export interface LogEntry {
  readonly kind: LogKind;
  readonly text: string;
}

// ── Compile Result ────────────────────────────────────────────────────────────

export interface CompileResult {
  readonly logs: LogEntry[];
  readonly success: boolean;
}
