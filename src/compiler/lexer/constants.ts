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
  "let",
  "generate",
  "template",
  "use",
]);

export const NAMED_COLORS: Readonly<Record<string, string>> = CONTRACT_NAMED_COLORS;

export const FIT_VALUE_WORDS = new Set<string>(FIT_VALUES);

export const BOOLEAN_VALUES = new Set<string>(CONTRACT_BOOLEAN_VALUES);
export const EASING_VALUES = new Set<string>(CONTRACT_EASING_VALUES);
export const DURATION_INDEFINITELY_VALUES = new Set<string>(DURATION_VALUES);

/**
 * Words that are operators in the expression grammar, not block names.
 *
 * Deliberately separate from KEYWORDS: KEYWORDS is `Object.keys(LANGUAGE_CONTRACT)`
 * plus the macro keywords and means "names a block", and parseValue reports any
 * KEYWORD found in value position as "is an object keyword and cannot be used as
 * a property value" — false for 'if'.
 *
 * 'to' is reserved here and is *also* legal as a property name, because
 * `animate { to: ... }` exists. That works because property names are consumed
 * positionally by consumePropertyName (parser/parseProperty.ts:5-16), and the
 * gates in parseObject.ts and parseUse.ts admit EXPR_KEYWORD for exactly the
 * reason they already admit FIT, NAMED_COLOR, BOOLEAN and EASING.
 */
export const EXPRESSION_WORDS = new Set<string>([
  "in", "to", "if", "then", "else", "and", "or", "not", "sin", "cos", "length",
]);

/**
 * Two-character operators, matched before SINGLE_CHAR_MAP. Order matters:
 * '=' is already in SINGLE_CHAR_MAP, so without this pass '==' would lex as
 * two EQUALS tokens and become indistinguishable from 'let x = = y'.
 */
export const TWO_CHAR_MAP: Readonly<Record<string, TokenType>> = {
  "==": "EQ_EQ",
  "!=": "BANG_EQ",
  "<=": "LT_EQ",
  ">=": "GT_EQ",
};

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
  "%": "PERCENT",
  "<": "LT",
  ">": "GT",
};
