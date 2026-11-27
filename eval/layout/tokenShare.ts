/**
 * Layout-token share of a scene's source: a descriptive number for the layout
 * measurement, not part of its decision.
 *
 * Tokens are identifiers, numbers, the two-character operators (`==`, `!=`,
 * `<=`, `>=`) and single punctuation characters, with `//` comments removed.
 * A `#` colour and a quoted string are one token each, as the lexer reads
 * them. Layout tokens are every token on a layout line: a `let` line
 * (including the continuation lines of a `let` whose brackets stay open past
 * its first line), a `generate` header line, or a line holding `position:`.
 * The whole line counts, so a one-line shape such as
 * `circle c { position: (0, 0), radius: 30 }` is all layout tokens.
 *
 * This is broader than "every `let` feeding a position": it counts every
 * `let`, including one that feeds a size or a colour.
 *
 * Self-contained: it shares no code with the compiler's lexer.
 */

export interface Token {
  text: string;
  /** Zero-based line index. */
  line: number;
  /** Offset of the token's first character in the whole source. */
  offset: number;
}

const TOKEN = /\/\/.*|#[0-9A-Fa-f]*|"(?:[^"\\\n]|\\.)*"|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|==|!=|<=|>=|\S/g;

/** Every token of `source` in order, `//` comments dropped. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let lineStart = 0;
  source.split("\n").forEach((text, line) => {
    for (const m of text.matchAll(TOKEN)) {
      if (m[0].startsWith("//")) break;
      tokens.push({ text: m[0], line, offset: lineStart + m.index! });
    }
    lineStart += text.length + 1;
  });
  return tokens;
}

export interface TokenShare {
  tokens: number;
  layoutTokens: number;
  /** layoutTokens / tokens, or 0 for an empty source. */
  share: number;
}

export function tokenShare(source: string): TokenShare {
  const tokens = tokenize(source);
  const byLine = new Map<number, Token[]>();
  for (const t of tokens) {
    const row = byLine.get(t.line);
    if (row) row.push(t);
    else byLine.set(t.line, [t]);
  }

  const layoutLines = new Set<number>();
  let openLet = 0; // bracket depth of a `let` still open from an earlier line
  for (const line of [...byLine.keys()].sort((a, b) => a - b)) {
    const row = byLine.get(line)!;
    const first = row[0].text;
    const isLet = first === "let" || openLet > 0;
    const isGenerate = first === "generate";
    const isPosition = row.some((t, i) => t.text === "position" && row[i + 1]?.text === ":");
    if (isLet || isGenerate || isPosition) layoutLines.add(line);
    if (isLet) {
      for (const t of row) {
        if (t.text === "(" || t.text === "[") openLet++;
        else if (t.text === ")" || t.text === "]") openLet--;
      }
      if (openLet < 0) openLet = 0;
    }
  }

  const layoutTokens = tokens.filter((t) => layoutLines.has(t.line)).length;
  return { tokens: tokens.length, layoutTokens, share: tokens.length === 0 ? 0 : layoutTokens / tokens.length };
}
