import type { SceneFit } from "../types";
import { KEYWORDS, NAMED_COLORS, SCENE_FIT_VALUES } from "./constants";
import type { LexerState } from "./state";

export function handleColor(state: LexerState): void {
  const startI = state.i;
  let j = startI + 1;
  while (j < state.src.length && /[0-9a-fA-F]/i.test(state.src[j])) j++;
  const digits = j - (startI + 1);
  const raw = state.src.slice(startI, j);
  if (digits === 0) {
    state.err("'#' must be followed by a hex color code. Use 3 digits (e.g. #f00) or 6 digits (e.g. #ff0000).");
  }
  if (digits !== 3 && digits !== 6) {
    state.err(`Invalid color '${raw}': expected 3 or 6 hex digits after '#', got ${digits}. Use '#rgb' (e.g. #f00) or '#rrggbb' (e.g. #ff0000). To adjust opacity, use the 'alpha' property instead.`);
  }
  state.push("HEX_COLOR", raw, raw.length);
  state.advance(raw.length);
}

export function handleString(state: LexerState): void {
  const startLine = state.line;
  const startCol = state.col;
  let j = state.i + 1;
  let s = "";
  while (j < state.src.length && state.src[j] !== '"') {
    if (state.src[j] === "\n" || state.src[j] === "\r") {
      throw { phase: "LEX" as const, message: `String opened at line ${startLine}, column ${startCol} was not closed before the end of the line. String values cannot span multiple lines.`, line: startLine, col: startCol, endCol: startCol + 1 };
    }
    if (state.src[j] === '\\' && j + 1 < state.src.length) {
      j++;
      const esc = state.src[j];
      switch (esc) {
        case 'n': s += '\n'; break;
        case 't': s += '\t'; break;
        case '"': s += '"'; break;
        case '\\': s += '\\'; break;
        default: s += '\\' + esc; break;
      }
      j++;
    } else {
      s += state.src[j++];
    }
  }
  if (j >= state.src.length) {
    throw { phase: "LEX" as const, message: `String opened at line ${startLine}, column ${startCol} was never closed. Add a closing double-quote (" ) before end of file.`, line: startLine, col: startCol, endCol: startCol + 1 };
  }
  const length = j - state.i + 1;
  state.push("STRING", s, length);
  state.advance(length);
}

export function handleNumber(state: LexerState): void {
  let j = state.i;
  while (j < state.src.length && /[0-9]/.test(state.src[j])) j++;
  if (j < state.src.length && state.src[j] === ".") {
    j++;
    if (j >= state.src.length || !/[0-9]/.test(state.src[j])) {
      const raw = state.src.slice(state.i, j);
      state.err(`Invalid number '${raw}': a decimal point must be followed by at least one digit (e.g. ${raw}0).`);
    }
    while (j < state.src.length && /[0-9]/.test(state.src[j])) j++;
  }
  if (j < state.src.length && (state.src[j] === "e" || state.src[j] === "E")) {
    const raw = state.src.slice(state.i, j + 1);
    state.err(`Invalid number '${raw}': scientific notation is not supported. Use a plain decimal literal instead (e.g. 100000).`);
  }
  const rawNumStr = state.src.slice(state.i, j);
  const parsedVal = parseFloat(rawNumStr);
  if (!isFinite(parsedVal)) {
    state.err(`Invalid number '${rawNumStr}': value is too large and evaluates to Infinity.`);
  }
  const length = j - state.i;
  state.push("NUMBER", parsedVal, length);
  state.advance(length);
}

export function handleWord(state: LexerState): void {
  let j = state.i;
  while (j < state.src.length && /[a-zA-Z0-9_]/.test(state.src[j])) j++;
  const word = state.src.slice(state.i, j);
  const length = j - state.i;
  
  if (KEYWORDS.has(word)) {
    state.push("KEYWORD", word, length);
  } else if (word in NAMED_COLORS) {
    state.push("NAMED_COLOR", word, length);
  } else if (SCENE_FIT_VALUES.has(word)) {
    state.push("SCENE_FIT", word as SceneFit, length);
  } else {
    state.push("IDENT", word, length);
  }
  state.advance(length);
}