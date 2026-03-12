import type { Token } from "../types";
import { LexerState } from "./state";
import { SINGLE_CHAR_MAP } from "./constants";
import { handleString, handleColor, handleNumber, handleWord } from "./handlers";

export function lex(src: string): Token[] {
  const state = new LexerState(src);

  while (state.i < state.src.length) {
    const ch = state.peek();

    // Handle newlines
    if (ch === "\r") {
      if (state.peek(1) === "\n") {
         state.i++; // Skip the \r
      }
      state.advanceLine();
      continue;
    }

    if (ch === "\n") {
      state.advanceLine();
      continue;
    }

    // Handle whitespace
    if (ch === " " || ch === "\t") {
      state.advance();
      continue;
    }

    // Handle comments
    if (ch === "/" && state.peek(1) === "/") {
      while (state.i < state.src.length && state.peek() !== "\n" && state.peek() !== "\r") {
        state.advance();
      }
      continue;
    }

    if (ch === "/") {
      state.err("Unexpected character '/'. Single-line comments must start with '//' (two forward slashes).");
    }

    // Handle single-character symbols
    const singleType = SINGLE_CHAR_MAP[ch];
    if (singleType) {
      state.push(singleType, ch);
      state.advance();
      continue;
    }

    // Handle Hex Colors
    if (ch === "#") {
      handleColor(state);
      continue;
    }

    // Handle Strings
    if (ch === '"') {
      handleString(state);
      continue;
    }

    // Handle Numbers
    if (/[0-9]/.test(ch) || (ch === "-" && state.i + 1 < state.src.length && /[0-9]/.test(state.peek(1)))) {
      handleNumber(state);
      continue;
    }

    if (ch === "-") {
      state.err("Unexpected '-'. A minus sign must be immediately followed by a digit to form a negative number (e.g. -10 or -3.14).");
    }

    // Handle Identifiers, Keywords, and Named Colors
    if (/[a-zA-Z_]/.test(ch)) {
      handleWord(state);
      continue;
    }

    // Handle completely invalid characters
    const code = ch.charCodeAt(0);
    const display = code >= 0x20 && code < 0x7f ? `'${ch}'` : `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
    state.err(`Unexpected character ${display}. Declare source may only contain letters, digits, and the following symbols: # " { } [ ] ( ) : , // -`);
  }

  state.tokens.push({ type: "EOF", value: null, line: state.line, col: state.col });
  return state.tokens;
}

// Re-export constants for parser use
export { KEYWORDS, NAMED_COLORS } from "./constants";