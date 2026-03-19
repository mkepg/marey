import type { Token } from "../types";
import { LexerState } from "./state";
import { SINGLE_CHAR_MAP } from "./constants";
import { handleString, handleColor, handleNumber, handleWord } from "./handlers";

export function lex(src: string): Token[] {
  const state = new LexerState(src);

  while (state.i < state.src.length) {
    const ch = state.peek();

    if (ch === "\r") {
      if (state.peek(1) === "\n") {
         state.i++;
      }
      state.advanceLine();
      continue;
    }
    if (ch === "\n") {
      state.advanceLine();
      continue;
    }
    if (ch === " " || ch === "\t") {
      state.advance();
      continue;
    }

    if (ch === "/" && state.peek(1) === "/") {
      while (state.i < state.src.length && state.peek() !== "\n" && state.peek() !== "\r") {
        state.advance();
      }
      continue;
    }

    const singleType = SINGLE_CHAR_MAP[ch];
    if (singleType) {
      state.push(singleType, ch, 1);
      state.advance();
      continue;
    }

    if (ch === "#") {
      handleColor(state);
      continue;
    }

    if (ch === '"') {
      handleString(state);
      continue;
    }

    if (/[0-9]/.test(ch)) {
      handleNumber(state);
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      handleWord(state);
      continue;
    }

    const code = ch.charCodeAt(0);
    const display = code >= 0x20 && code < 0x7f ? `'${ch}'` : `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
    state.err(`Unexpected character ${display}. Declare source may only contain letters, digits, and the following symbols: # " { } [ ] ( ) : , // + - * / =`);
  }

  state.tokens.push({ type: "EOF", value: null, line: state.line, col: state.col, endCol: state.col });
  return state.tokens;
}

export { KEYWORDS, NAMED_COLORS } from "./constants";