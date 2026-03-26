import type { TokenType } from "../types";

export const KEYWORDS = new Set<string>([
  "scene",
  "circle",
  "rectangle",
  "polygon",
  "line",
  "text",
  "group",
  "def",
  "generate",
  "template",
  "use",
  "animate",
  "physics",
  "sequence",
  "parallel", // ADDED: parallel keyword
]);

export const NAMED_COLORS: Readonly<Record<string, string>> = {
  red:     "#ff0000",
  green:   "#008000",
  blue:    "#0000ff",
  white:   "#ffffff",
  black:   "#000000",
  yellow:  "#ffff00",
  cyan:    "#00ffff",
  magenta: "#ff00ff",
  orange:  "#ffa500",
};

export const SCENE_FIT_VALUES = new Set<string>([
  "contain",
  "cover",
  "fill",
  "none",
]);

export const BOOLEAN_VALUES = new Set<string>(["true", "false"]);
export const EASING_VALUES = new Set<string>(["linear", "easeIn", "easeOut", "easeInOut"]);
export const DURATION_INDEFINITELY_VALUES = new Set<string>(["indefinitely"]);

export const SINGLE_CHAR_MAP: Readonly<Record<string, TokenType>> = {
  "{": "LBRACE",
  "}": "RBRACE",
  "[": "LBRACKET",
  "]": "RBRACKET",
  "(": "LPAREN",
  ")": "RPAREN",
  ",": "COMMA",
  ":": "COLON",
  "+": "PLUS",
  "-": "MINUS",
  "*": "STAR",
  "/": "SLASH",
  "=": "EQUALS",
};