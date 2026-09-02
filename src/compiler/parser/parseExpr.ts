import type { AstValue, FitMode, Token } from "../types";
import { NAMED_COLORS } from "../lexer";
import { ParserState, describeToken } from "./state";

export const MAX_EXPR_DEPTH = 50;

/** Canonical operator name for a token, or null if it is not a binary operator. */
export function operatorOf(t: Token): string | null {
  switch (t.type) {
    case "PLUS":  return "+";
    case "MINUS": return "-";
    case "STAR":  return "*";
    case "SLASH": return "/";
    default:      return null;
  }
}

const PRECEDENCE: Readonly<Record<string, number>> = {
  "+": 5, "-": 5,
  "*": 6, "/": 6,
};

function span(from: AstValue, to: AstValue) {
  return { line: from.line, col: from.col, endLine: to.endLine, endCol: to.endCol };
}

/**
 * An operand paired with the token it starts at.
 *
 * The token is what a rejected operand is reported *at*. Reporting at
 * `state.peek()` instead would land on whatever follows the whole binary
 * expression — for a property value, the next property, on the next line.
 */
interface Operand {
  readonly value: AstValue;
  readonly tok: Token;
}

function requireNumber(state: ParserState, operand: Operand, op: string, side: string): number {
  const v = operand.value;
  if (v.kind !== "number") {
    state.throwError(
      `In ${state.currentContext}: The ${side} operand of '${op}' must be a number, but got ${v.kind}.`,
      operand.tok,
    );
  }
  return v.value;
}

/**
 * A point's `x`/`y` are plain numbers on `PointValue`, so a coordinate that
 * evaluates to any other kind has to be rejected here rather than carried.
 */
function requireCoordinate(state: ParserState, v: AstValue, tok: Token): number {
  if (v.kind !== "number") {
    state.throwError(
      `In ${state.currentContext}: A point coordinate must be a number, but got ${v.kind}.`,
      tok,
    );
  }
  return v.value;
}

function applyBinary(
  state: ParserState,
  op: string,
  left: Operand,
  right: Operand,
  opTok: Token,
): AstValue {
  const l = requireNumber(state, left, op, "left");
  const r = requireNumber(state, right, op, "right");
  let value: number;
  switch (op) {
    case "+": value = l + r; break;
    case "-": value = l - r; break;
    case "*": value = l * r; break;
    case "/":
      if (r === 0) state.throwError(`In ${state.currentContext}: Division by zero.`, opTok);
      value = l / r;
      break;
    default:
      state.throwError(`In ${state.currentContext}: Unknown operator '${op}'.`, opTok);
  }
  return { kind: "number", value, ...span(left.value, right.value) };
}

/**
 * `[(x, y), ...]` — ported from the pre-refactor `parseValue.ts:113-146`.
 *
 * Takes no depth: every coordinate below starts a fresh budget, and entry to
 * the literal was already depth-checked by `parsePrimary`.
 */
function parseListLiteral(state: ParserState): AstValue {
  const openTok = state.consume("LBRACKET");
  const pts: Array<{ x: number; y: number }> = [];

  while (state.peek().type !== "RBRACKET") {
    if (state.peek().type === "EOF") {
      state.throwError(`In ${state.currentContext}: Point list opened at line ${openTok.line}, column ${openTok.col} was not closed before end of file. Add a closing ']'.`, openTok);
    }

    if (state.peek().type !== "LPAREN") {
      const bad = state.peek();
      state.throwError(`In ${state.currentContext}: Expected a point '(x, y)' inside the point list, but found ${describeToken(bad)}. Each entry in a point list must be a point, e.g. [(0,0), (100,0), (50,80)].`, bad);
    }

    const ptOpen = state.consume("LPAREN");
    const xTok = state.peek();
    const x = requireCoordinate(state, parseExpr(state, 0, 0), xTok);
    state.consume("COMMA");
    const yTok = state.peek();
    const y = requireCoordinate(state, parseExpr(state, 0, 0), yTok);

    if (state.peek().type !== "RPAREN") {
      const bad = state.peek();
      state.throwError(`In ${state.currentContext}: Expected ')' to close the point opened at line ${ptOpen.line}, column ${ptOpen.col}, but found ${describeToken(bad)}.`, bad);
    }
    state.consume("RPAREN");

    pts.push({ x, y });

    if (state.peek().type !== "RBRACKET") {
      state.consume("COMMA");
    }
  }
  const endTok = state.consume("RBRACKET");
  return {
    kind: "pointList",
    value: pts,
    line: openTok.line,
    col: openTok.col,
    endLine: endTok.line,
    endCol: endTok.endCol,
  };
}

/**
 * `(` opens either a point or a grouped expression. Ported from the
 * pre-refactor `parseValue.ts:148-180`; the forward scan for a top-level
 * `,` is what tells the two apart.
 *
 * Note the asymmetry in the depth argument below, which is the pre-refactor
 * behaviour: a *grouped* expression is one level deeper than the `(` it sits
 * in, but a point *coordinate* starts a fresh budget.
 */
function parseParenOrPoint(state: ParserState, depth: number): AstValue {
  const t = state.peek();
  const { line, col } = t;

  let isPoint = false;
  let nesting = 0;
  for (let i = state.pos; i < state.tokens.length; i++) {
    const tok = state.tokens[i];
    if (tok.type === "LPAREN") nesting++;
    else if (tok.type === "RPAREN") {
      nesting--;
      if (nesting === 0) break;
    } else if (tok.type === "COMMA" && nesting === 1) {
      isPoint = true;
      break;
    }
  }

  if (isPoint) {
    const openTok = state.consume("LPAREN");
    const xTok = state.peek();
    const x = requireCoordinate(state, parseExpr(state, 0, 0), xTok);
    state.consume("COMMA");
    const yTok = state.peek();
    const y = requireCoordinate(state, parseExpr(state, 0, 0), yTok);

    if (state.peek().type === "COMMA") {
      const extra = state.peek();
      state.throwError(`In ${state.currentContext}: A point takes exactly two numbers, but found an extra ',' at line ${extra.line}, column ${extra.col}. Point syntax is (x, y) — for example (400, 300).`, extra);
    }
    if (state.peek().type !== "RPAREN") {
      const bad = state.peek();
      state.throwError(`In ${state.currentContext}: Expected ')' to close the point opened at line ${openTok.line}, column ${openTok.col}, but found ${describeToken(bad)}.`, bad);
    }
    const endTok = state.consume("RPAREN");
    return { kind: "point", x, y, line, col, endLine: endTok.line, endCol: endTok.endCol };
  }

  const openTok = state.consume("LPAREN");
  const inner = parseExpr(state, 0, depth + 1);
  const bad = state.peek();
  if (bad.type !== "RPAREN") {
    state.throwError(`In ${state.currentContext}: Expected ')' to close the math expression, but found ${describeToken(bad)}.`, bad);
  }
  const closeTok = state.consume("RPAREN");
  // The span covers the brackets themselves, matching the pre-refactor
  // `parseValue.ts:187`, which ended a parenthesised value at its ')'.
  return { ...inner, line: openTok.line, col: openTok.col, endLine: closeTok.line, endCol: closeTok.endCol };
}

function parsePrimary(state: ParserState, depth: number): AstValue {
  if (depth > MAX_EXPR_DEPTH) {
    state.throwError(`In ${state.currentContext}: Math expression is too deeply nested. Maximum depth is ${MAX_EXPR_DEPTH}.`, state.peek());
  }

  const t = state.peek();
  const { line, col } = t;

  if (t.type === "MINUS") {
    const minusTok = state.consume("MINUS");
    const operand = parsePrimary(state, depth + 1);
    if (operand.kind !== "number") {
      state.throwError(`In ${state.currentContext}: Unary '-' requires a number, but got ${operand.kind}.`, minusTok);
    }
    return { kind: "number", value: -operand.value, line: minusTok.line, col: minusTok.col, endLine: operand.endLine, endCol: operand.endCol };
  }

  if (t.type === "NUMBER") {
    const tok = state.consume("NUMBER");
    return { kind: "number", value: tok.value as number, line, col, endLine: line, endCol: tok.endCol };
  }

  if (t.type === "BOOLEAN") {
    const tok = state.consume();
    return { kind: "boolean", value: tok.value as boolean, line, col, endLine: line, endCol: tok.endCol };
  }
  if (t.type === "EASING") {
    const tok = state.consume();
    return { kind: "easing", value: tok.value as string, line, col, endLine: line, endCol: tok.endCol };
  }
  if (t.type === "HEX_COLOR") {
    const tok = state.consume();
    return { kind: "color", value: tok.value as string, line, col, endLine: line, endCol: tok.endCol };
  }
  if (t.type === "NAMED_COLOR") {
    const tok = state.consume();
    return { kind: "color", value: NAMED_COLORS[tok.value as string], line, col, endLine: line, endCol: tok.endCol };
  }
  if (t.type === "STRING") {
    const strTok = state.consume();
    if (state.peek().type === "PLUS") {
      state.throwError(`In ${state.currentContext}: String concatenation using '+' is not supported.`, state.peek());
    }
    return { kind: "string", value: strTok.value as string, line, col, endLine: line, endCol: strTok.endCol };
  }
  if (t.type === "FIT") {
    const tok = state.consume();
    return { kind: "fit", value: tok.value as FitMode, line, col, endLine: line, endCol: tok.endCol };
  }
  if (t.type === "DURATION_INDEFINITELY") {
    const tok = state.consume();
    return { kind: "indefinitely", line, col, endLine: line, endCol: tok.endCol };
  }

  if (t.type === "LBRACKET") return parseListLiteral(state);
  if (t.type === "LPAREN")   return parseParenOrPoint(state, depth);

  if (t.type === "IDENT") {
    const nameTok = state.consume("IDENT");
    const varName = nameTok.value as string;
    if (!(varName in state.env)) {
      state.throwError(`In ${state.currentContext}: Undefined variable '${varName}'. Bare names cannot be used as values unless they are declared with 'let'. Variables defined inside 'generate' blocks are strictly block-scoped and cannot be accessed outside of them.`, nameTok);
    }
    return { ...state.env[varName], line, col, endLine: line, endCol: nameTok.endCol };
  }

  if (t.type === "KEYWORD") {
    state.throwError(`In ${state.currentContext}: '${t.value as string}' is an object keyword and cannot be used as a property value.`, t);
  }

  state.throwError(`In ${state.currentContext}: Unexpected ${describeToken(t)} where a property value was expected.`, t);
}

export function parseExpr(state: ParserState, minPrec: number, depth: number): AstValue {
  if (depth > MAX_EXPR_DEPTH) {
    state.throwError(`In ${state.currentContext}: Math expression is too deeply nested. Maximum depth is ${MAX_EXPR_DEPTH}.`, state.peek());
  }

  // The start token of the whole accumulated left-hand side. A folded left is
  // always a number — otherwise `applyBinary` would have thrown — so this is
  // only ever read back when the very first primary was the bad operand.
  const leftTok = state.peek();
  let left = parsePrimary(state, depth);

  while (true) {
    const t = state.peek();
    const op = operatorOf(t);
    if (op === null) break;
    const prec = PRECEDENCE[op];
    if (prec === undefined || prec <= minPrec) break;

    state.consume();
    const rightTok = state.peek();
    const right = parseExpr(state, prec, depth + 1);
    left = applyBinary(state, op, { value: left, tok: leftTok }, { value: right, tok: rightTok }, t);
  }

  return left;
}
