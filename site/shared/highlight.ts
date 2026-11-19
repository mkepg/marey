/**
 * Marey source to highlighted HTML, shared by the documentation build and the
 * browser editor. It imports the lexer only, so it runs in Node and in a page.
 *
 * The output is `<span class="tk-K">` runs around the lexer's tokens, with the
 * text between tokens (whitespace and `//` comments) kept as it was. Taking the
 * tags off and decoding the entities gives back the input exactly, including
 * when the lexer rejects part of it.
 */
import { lex } from "../../src/compiler/lexer";
import type { TokenType } from "../../src/compiler/types";

export type TokenClass =
  | "keyword"
  | "prop"
  | "ident"
  | "number"
  | "string"
  | "color"
  | "const"
  | "op"
  | "punct"
  | "comment"
  | "error";

/**
 * One class per token type. Typed over `TokenType`, so a new token type fails
 * to compile here until it is given a class. `IDENT` is refined by position
 * (`prop` when a colon follows), and `EOF` is not drawn.
 */
export const TOKEN_CLASSES: Readonly<Record<TokenType, TokenClass | null>> = {
  KEYWORD: "keyword",
  EXPR_KEYWORD: "op",
  IDENT: "ident",
  NUMBER: "number",
  HEX_COLOR: "color",
  NAMED_COLOR: "color",
  FIT: "const",
  STRING: "string",
  BOOLEAN: "const",
  EASING: "const",
  DURATION_INDEFINITELY: "const",
  LBRACE: "punct",
  RBRACE: "punct",
  LBRACKET: "punct",
  RBRACKET: "punct",
  LPAREN: "punct",
  RPAREN: "punct",
  COMMA: "punct",
  COLON: "punct",
  PLUS: "punct",
  MINUS: "punct",
  STAR: "punct",
  SLASH: "punct",
  EQUALS: "punct",
  PERCENT: "punct",
  LT: "punct",
  GT: "punct",
  LT_EQ: "punct",
  GT_EQ: "punct",
  EQ_EQ: "punct",
  BANG_EQ: "punct",
  EOF: null,
};

interface Run {
  readonly start: number;
  readonly end: number;
  readonly cls: TokenClass;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Where each line starts, counting lines the way the lexer does: `\r\n`, `\n` or a lone `\r`. */
function lineStarts(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      starts.push(i + 1);
    } else if (ch === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

function endOfLine(src: string, from: number): number {
  let i = from;
  while (i < src.length && src[i] !== "\n" && src[i] !== "\r") i++;
  return i;
}

/** The classified runs of `src`, with offsets relative to the start of `src`. */
function tokenRuns(src: string): Run[] {
  const runs: Run[] = [];
  let base = 0;
  while (base <= src.length) {
    const rest = src.slice(base);
    let failure: { line?: unknown; col?: unknown };
    try {
      pushTokens(runs, rest, base, lex(rest));
      break;
    } catch (e) {
      failure = e !== null && typeof e === "object" ? (e as { line?: unknown; col?: unknown }) : {};
    }

    // The lexer throws away the tokens it had made. Every error it raises is at
    // the start of the offending token, so the text before that point lexes to
    // the same tokens again.
    const starts = lineStarts(rest);
    const line = typeof failure.line === "number" ? failure.line : 1;
    const col = typeof failure.col === "number" ? failure.col : 1;
    const lineStart = starts[Math.min(Math.max(line, 1), starts.length) - 1] ?? 0;
    const bad = Math.min(Math.max(lineStart + col - 1, 0), rest.length);
    const before = rest.slice(0, bad);
    try {
      pushTokens(runs, before, base, lex(before));
    } catch {
      // Unreachable while every lexer error sits at a token start; the text is
      // then drawn plain rather than lost.
    }

    // The bad part runs to the end of its line; the next line is lexed afresh.
    const eol = Math.max(endOfLine(rest, bad), Math.min(bad + 1, rest.length));
    runs.push({ start: base + bad, end: base + eol, cls: "error" });
    if (eol >= rest.length) break;
    base += eol;
  }
  return runs;
}

function pushTokens(
  runs: Run[],
  text: string,
  base: number,
  tokens: ReadonlyArray<{ type: TokenType; line: number; col: number; endCol: number }>,
): void {
  const starts = lineStarts(text);
  const offset = (line: number, col: number): number => (starts[line - 1] ?? 0) + col - 1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    let cls = TOKEN_CLASSES[t.type];
    if (cls === null) continue;
    if (t.type === "IDENT" && tokens[i + 1]?.type === "COLON") cls = "prop";
    const start = offset(t.line, t.col);
    runs.push({ start: base + start, end: base + start + (t.endCol - t.col), cls });
  }
}

/** Plain text between runs: `//` comments become comment spans, the rest stays plain. */
function gap(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(/\/\/[^\r\n]*/g)) {
    out += escapeText(text.slice(last, m.index));
    out += `<span class="tk-comment">${escapeText(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + escapeText(text.slice(last));
}

export function highlightMarey(source: string): string {
  const runs = tokenRuns(source).sort((a, b) => a.start - b.start);
  let out = "";
  let at = 0;
  for (const run of runs) {
    if (run.start < at || run.end <= run.start) continue;
    out += gap(source.slice(at, run.start));
    out += `<span class="tk-${run.cls}">${escapeText(source.slice(run.start, run.end))}</span>`;
    at = run.end;
  }
  return out + gap(source.slice(at));
}
