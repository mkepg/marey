import type { Token, TokenType } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Declare Lexer
// ─────────────────────────────────────────────────────────────────────────────

export const KEYWORDS = new Set<string>([
  "scene",
  "circle",
  "rectangle",
  "polygon",
  "text",
  "group",
]);

export const NAMED_COLORS: Readonly<Record<string, string>> = {
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  white: "#ffffff",
  black: "#000000",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  orange: "#ffa500",
};

const SINGLE_CHAR_MAP: Readonly<Record<string, TokenType>> = {
  "{": "LBRACE",
  "}": "RBRACE",
  "[": "LBRACKET",
  "]": "RBRACKET",
  "(": "LPAREN",
  ")": "RPAREN",
  ",": "COMMA",
  ":": "COLON",
};

export function lex(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const err = (message: string): never => {
    throw { phase: "LEX" as const, message, line, col };
  };

  const push = (type: TokenType, value: Token["value"]): void => {
    tokens.push({ type, value, line, col });
  };

  while (i < src.length) {
    const ch = src[i];

    // Whitespace
    if (/\s/.test(ch)) {
      if (ch === "\n") { line++; col = 1; } else col++;
      i++;
      continue;
    }

    // Single-line comment
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }

    // Single-character tokens
    const singleType = SINGLE_CHAR_MAP[ch];
    if (singleType) {
      push(singleType, ch);
      col++;
      i++;
      continue;
    }

    // Hex color  #rgb | #rrggbb
    if (ch === "#") {
      let j = i + 1;
      while (j < src.length && /[0-9a-fA-F]/.test(src[j])) j++;
      const hex = src.slice(i, j);
      if (hex.length !== 4 && hex.length !== 7) {
        err(`Invalid hex color: '${hex}' (expected #rgb or #rrggbb)`);
      }
      push("HEX_COLOR", hex);
      col += hex.length;
      i = j;
      continue;
    }

    // String literal
    if (ch === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\n") err("Unterminated string literal");
        s += src[j++];
      }
      if (j >= src.length) err("Unterminated string literal");
      push("STRING", s);
      col += j - i + 1;
      i = j + 1;
      continue;
    }

    // Number (optional leading minus)
    if (/[0-9]/.test(ch) || (ch === "-" && i + 1 < src.length && /[0-9]/.test(src[i + 1]))) {
      let j = i;
      if (src[j] === "-") j++;
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      if (src[j] === ".") {
        j++;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
      }
      const raw = src.slice(i, j);
      push("NUMBER", parseFloat(raw));
      col += j - i;
      i = j;
      continue;
    }

    // Identifier / keyword / named color
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      if (KEYWORDS.has(word)) push("KEYWORD", word);
      else if (word in NAMED_COLORS) push("NAMED_COLOR", word);
      else push("IDENT", word);
      col += j - i;
      i = j;
      continue;
    }

    err(`Unexpected character: '${ch}'`);
  }

  tokens.push({ type: "EOF", value: null, line, col });
  return tokens;
}
