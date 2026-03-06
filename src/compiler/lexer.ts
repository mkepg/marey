import type { Token, TokenType, SceneFit } from "./types";

export const KEYWORDS = new Set<string>([
  "scene",
  "circle",
  "rectangle",
  "polygon",
  "text",
  "group",
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
  let i    = 0;
  let line = 1;
  let col  = 1;

  const err = (message: string): never => {
    throw { phase: "LEX" as const, message, line, col };
  };

  const push = (type: TokenType, value: Token["value"]): void => {
    tokens.push({ type, value, line, col });
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      line++;
      col = 1;
      i++;
      continue;
    }

    if (ch === "\n") {
      line++;
      col = 1;
      i++;
      continue;
    }

    if (ch === " " || ch === "\t") {
      col++;
      i++;
      continue;
    }

    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n" && src[i] !== "\r") i++;
      continue;
    }

    if (ch === "/") {
      err(
        "Unexpected character '/'. " +
        "Single-line comments must start with '//' (two forward slashes)."
      );
    }

    const singleType = SINGLE_CHAR_MAP[ch];
    if (singleType) {
      push(singleType, ch);
      col++;
      i++;
      continue;
    }

    if (ch === "#") {
      let j = i + 1;
      while (j < src.length && /[0-9a-fA-F]/i.test(src[j])) j++;
      const digits = j - (i + 1);
      const raw    = src.slice(i, j);

      if (digits === 0) {
        err(
          "'#' must be followed by a hex color code. " +
          "Use 3 digits (e.g. #f00) or 6 digits (e.g. #ff0000)."
        );
      }
      if (digits !== 3 && digits !== 6) {
        err(
          `Invalid color '${raw}': expected 3 or 6 hex digits after '#', got ${digits}. ` +
          `Use '#rgb' (e.g. #f00) or '#rrggbb' (e.g. #ff0000). To adjust opacity, use the 'alpha' property instead.`
        );
      }

      push("HEX_COLOR", raw);
      col += raw.length;
      i = j;
      continue;
    }

    if (ch === '"') {
      const startLine = line;
      const startCol  = col;
      let j = i + 1;
      let s = "";

      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\n" || src[j] === "\r") {
          throw {
            phase: "LEX" as const,
            message:
              `String opened at line ${startLine}, column ${startCol} was not closed ` +
              `before the end of the line. String values cannot span multiple lines.`,
            line: startLine,
            col:  startCol,
          };
        }

        if (src[j] === '\\' && j + 1 < src.length) {
          j++;
          const esc = src[j];
          switch (esc) {
            case 'n': s += '\n'; break;
            case 't': s += '\t'; break;
            case '"': s += '"'; break;
            case '\\': s += '\\'; break;
            default: s += '\\' + esc; break;
          }
          j++;
        } else {
          s += src[j++];
        }
      }

      if (j >= src.length) {
        throw {
          phase: "LEX" as const,
          message:
            `String opened at line ${startLine}, column ${startCol} was never closed. ` +
            `Add a closing double-quote (" ) before end of file.`,
          line: startLine,
          col:  startCol,
        };
      }

      push("STRING", s);
      col += j - i + 1;
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "-" && i + 1 < src.length && /[0-9]/.test(src[i + 1]))) {
      let j = i;
      if (src[j] === "-") j++;
      while (j < src.length && /[0-9]/.test(src[j])) j++;

      if (j < src.length && src[j] === ".") {
        j++;
        if (j >= src.length || !/[0-9]/.test(src[j])) {
          const raw = src.slice(i, j);
          err(
            `Invalid number '${raw}': a decimal point must be followed by at least one digit ` +
            `(e.g. ${raw}0).`
          );
        }
        while (j < src.length && /[0-9]/.test(src[j])) j++;
      }

      if (j < src.length && (src[j] === "e" || src[j] === "E")) {
        const raw = src.slice(i, j + 1);
        err(
          `Invalid number '${raw}': scientific notation is not supported. ` +
          `Use a plain decimal literal instead (e.g. 100000).`
        );
      }

      const rawNumStr = src.slice(i, j);
      const parsedVal = parseFloat(rawNumStr);

      if (!isFinite(parsedVal)) {
        err(`Invalid number '${rawNumStr}': value is too large and evaluates to Infinity.`);
      }

      push("NUMBER", parsedVal);
      col += j - i;
      i = j;
      continue;
    }

    if (ch === "-") {
      err(
        "Unexpected '-'. A minus sign must be immediately followed by a digit " +
        "to form a negative number (e.g. -10 or -3.14)."
      );
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);

      if (KEYWORDS.has(word)) {
        push("KEYWORD", word);
      } else if (word in NAMED_COLORS) {
        push("NAMED_COLOR", word);
      } else if (SCENE_FIT_VALUES.has(word)) {
        push("SCENE_FIT", word as SceneFit);
      } else {
        push("IDENT", word);
      }

      col += j - i;
      i = j;
      continue;
    }

    const code = ch.charCodeAt(0);
    const display =
      code >= 0x20 && code < 0x7f
        ? `'${ch}'`
        : `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;

    err(
      `Unexpected character ${display}. ` +
      `Declare source may only contain letters, digits, and the following ` +
      `symbols: # " { } [ ] ( ) : , // -`
    );
  }

  tokens.push({ type: "EOF", value: null, line, col });
  return tokens;
}