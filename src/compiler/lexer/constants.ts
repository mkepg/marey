import type { TokenType } from "../types";
import {
  BOOLEAN_VALUES as CONTRACT_BOOLEAN_VALUES,
  DURATION_VALUES,
  EASING_VALUES as CONTRACT_EASING_VALUES,
  FIT_VALUES,
  LANGUAGE_CONTRACT,
  NAMED_COLORS as CONTRACT_NAMED_COLORS,
} from "../languageContract";

export const KEYWORDS = new Set<string>([
  ...Object.keys(LANGUAGE_CONTRACT),
  "def",
  "generate",
  "template",
  "use",
]);

export const NAMED_COLORS: Readonly<Record<string, string>> = CONTRACT_NAMED_COLORS;

export const SCENE_FIT_VALUES = new Set<string>(FIT_VALUES);

export const BOOLEAN_VALUES = new Set<string>(CONTRACT_BOOLEAN_VALUES);
export const EASING_VALUES = new Set<string>(CONTRACT_EASING_VALUES);
export const DURATION_INDEFINITELY_VALUES = new Set<string>(DURATION_VALUES);

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
