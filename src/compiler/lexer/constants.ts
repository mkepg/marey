import type { TokenType } from "../types";

export const KEYWORDS = new Set<string>([
  "scene",
  "circle",
  "rectangle",
  "polygon",
  "text",
  "group",
  "def",
  "generate", // NEW
  "from",     // NEW
  "to",       // NEW
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