import type { AstValue, FitMode, Token } from "../types";
import { NAMED_COLORS } from "../lexer";
import { ParserState, describeToken } from "./state";

/**
 * Nesting budgets.
 *
 * The three compose rather than being alternatives, which is the whole reason
 * the third exists:
 *
 * - `expr` bounds one expression's own operator/paren nesting. A point
 *   *coordinate* resets it to 0, because that is what the pre-refactor parser
 *   did (`de9bf39:parseValue.ts:128,130,166,168`) and source relying on the
 *   reset must keep compiling. Nothing else resets it — see
 *   `parseListLiteral` on why a list entry does not.
 * - `struct` bounds how deep points and point lists nest inside one another.
 *   It must not reset at a coordinate, since that reset is exactly what left
 *   the recursion unbounded once `((x, y))` made a point reachable from
 *   inside an expression.
 * - `total` bounds the *product*. Each of the 50 permitted structural levels
 *   carries a fresh 50-level expression budget, so `expr` and `struct` can
 *   both stay legal while the stack depth reaches 50 x 50. A few thousand
 *   characters of `"("xG + "(1, " + inner + ")" + ")"xG` overflowed the stack
 *   that way — and `RangeError` is not a `ParseException`, so it escapes
 *   `parse()` (`parser/index.ts:143` rethrows) and reaches the user with no
 *   line or col at all.
 *
 * `total` is a stack *depth*, not a count: `ExprCtx` is passed by value down
 * the call chain, so sibling recursions (`1+1+1+…`, which the precedence
 * climb unrolls iteratively) do not accumulate against it.
 *
 * 400 is generous next to the two 50s, so neither of their boundaries moves,
 * and ~3x that in real frames stays far below where V8 gives out.
 */
const MAX_EXPR_DEPTH = 50;
const MAX_STRUCTURAL_DEPTH = 50;
const MAX_TOTAL_DEPTH = 400;

/**
 * The three budgets, threaded together so an edge cannot advance one and
 * forget another.
 *
 * Every recursive edge in this module goes through one named transition
 * below. Re-derived from the call graph:
 *
 *   from              | to                | transition
 *   ------------------|-------------------|---------------------------------
 *   parseExpr         | parsePrimary      | (same level — no transition)
 *   parseExpr         | parseExpr         | intoOperand  (binary RHS)
 *   parsePrimary      | parsePrimary      | intoUnary    (unary '-')
 *   parsePrimary      | parseListLiteral  | (dispatch — no transition)
 *   parsePrimary      | parseParenOrPoint | (dispatch — no transition)
 *   parseListLiteral  | parseExpr         | intoGroup       (entry)
 *   parseParenOrPoint | parseExpr         | intoCoordinate  (point x)
 *   parseParenOrPoint | parseExpr         | intoCoordinate  (point y)
 *   parseParenOrPoint | parseExpr         | intoGroup       (grouped expr)
 *
 * Nine call edges; the three no-transition ones are strict descents within a
 * level, and every edge that can close a cycle advances `total`.
 */
interface ExprCtx {
  readonly expr: number;
  readonly struct: number;
  readonly total: number;
}

export const ROOT_CTX: ExprCtx = { expr: 0, struct: 0, total: 0 };

/** Into a point coordinate: the expression budget restarts. */
function intoCoordinate(c: ExprCtx): ExprCtx {
  return { expr: 0, struct: c.struct + 1, total: c.total + 1 };
}

/** Into a parenthesised sub-expression or a list entry: deeper, but structurally flat. */
function intoGroup(c: ExprCtx): ExprCtx {
  return { expr: c.expr + 1, struct: c.struct, total: c.total + 1 };
}

/** Into the right-hand operand of a binary operator. */
function intoOperand(c: ExprCtx): ExprCtx {
  return { expr: c.expr + 1, struct: c.struct, total: c.total + 1 };
}

/** Into the operand of unary '-'. */
function intoUnary(c: ExprCtx): ExprCtx {
  return { expr: c.expr + 1, struct: c.struct, total: c.total + 1 };
}

function checkNesting(state: ParserState, ctx: ExprCtx): void {
  if (ctx.expr > MAX_EXPR_DEPTH) {
    state.throwError(`In ${state.currentContext}: Math expression is too deeply nested. Maximum depth is ${MAX_EXPR_DEPTH}.`, state.peek());
  }
  if (ctx.struct > MAX_STRUCTURAL_DEPTH) {
    state.throwError(`In ${state.currentContext}: Points and point lists are nested too deeply. Maximum nesting depth is ${MAX_STRUCTURAL_DEPTH}.`, state.peek());
  }
  if (ctx.total > MAX_TOTAL_DEPTH) {
    state.throwError(`In ${state.currentContext}: This value nests too deeply overall. Maximum total nesting is ${MAX_TOTAL_DEPTH}.`, state.peek());
  }
}

/**
 * The binary operators, declared once.
 *
 * Token type, spelling and precedence live in a single row, so adding an
 * operator cannot half-land. A previous shape — `operatorOf` returning a bare
 * `string` plus a separate `Record<string, number>` of precedences — could be
 * updated in one place and not the other, and the result was silent: the
 * precedence lookup missed, the loop broke, and the operator token was left
 * unconsumed to be reported later as "Expected a property name", which is
 * exactly what an operator the parser genuinely does not know looks like.
 * Neither table's `string` key could catch that at compile time.
 */
const OPERATORS = {
  PLUS:  { name: "+", prec: 5 },
  MINUS: { name: "-", prec: 5 },
  STAR:  { name: "*", prec: 6 },
  SLASH: { name: "/", prec: 6 },
} as const;

type Operator = (typeof OPERATORS)[keyof typeof OPERATORS];
type OperatorName = Operator["name"];

/** The operator a token denotes, or null if it is not a binary operator. */
function operatorFor(t: Token): Operator | null {
  return (OPERATORS as Partial<Record<Token["type"], Operator>>)[t.type] ?? null;
}

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

function requireNumber(state: ParserState, operand: Operand, op: OperatorName, side: string): number {
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
  op: OperatorName,
  left: Operand,
  right: Operand,
  opTok: Token,
): AstValue {
  const l = requireNumber(state, left, op, "left");
  const r = requireNumber(state, right, op, "right");
  // No default branch: the switch is exhaustive over `OperatorName`, so
  // adding a row to OPERATORS without handling it here leaves `value` unassigned
  // and fails the build.
  let value: number;
  switch (op) {
    case "+": value = l + r; break;
    case "-": value = l - r; break;
    case "*": value = l * r; break;
    case "/":
      if (r === 0) state.throwError(`In ${state.currentContext}: Division by zero.`, opTok);
      value = l / r;
      break;
  }
  return { kind: "number", value, ...span(left.value, right.value) };
}

/**
 * `[a, b, c]` — a list of values, ported from the pre-refactor
 * `parseValue.ts:113-146`, which admitted only points.
 *
 * There is one list kind, so an entry is any expression and "every element is
 * a point" is no longer a parse rule: it is the `listOf` element constraint
 * `polygon.points` and `line.points` carry in `languageContract.ts`, reported
 * by the type checker at the offending element's own span.
 *
 * **Depth budget for an entry (resolved from Task 2's handoff).** An entry
 * follows the *grouped-expression* rule, not the coordinate one — `[` costs
 * one expression level exactly as `(` does, and does not reset the budget.
 * Three reasons:
 *
 *  1. The coordinate reset exists only for parity with the pre-refactor
 *     parser's hard-coded 0 at its four *coordinate* sites
 *     (`de9bf39:parseValue.ts:128,130,166,168`). An entry is not one of them;
 *     pre-refactor there was no entry expression at all to be parity with.
 *  2. It leaves a point list's arithmetic exactly as it was. A point entry's
 *     own coordinates still reset `expr` and advance `struct` one level inside
 *     `parseParenOrPoint`, so the coordinate sits at the same `struct` and the
 *     same zeroed `expr` this function used to pass directly — which is what
 *     keeps `parseExpr.test.ts`'s 50/51 point-list-coordinate boundary and its
 *     alternating list/point structural cap where they are. `intoCoordinate`
 *     here would instead charge `struct` twice per level, halving how deeply
 *     lists and points may alternate.
 *  3. Every edge out of an entry still advances `expr` and `total`, so bare
 *     `[[[…]]]` nesting — newly expressible now that an entry need not be a
 *     point — is bounded by the expression cap rather than recursing free.
 */
function parseListLiteral(state: ParserState, ctx: ExprCtx): AstValue {
  const openTok = state.consume("LBRACKET");
  const entries: AstValue[] = [];

  while (state.peek().type !== "RBRACKET") {
    if (state.peek().type === "EOF") {
      state.throwError(`In ${state.currentContext}: List opened at line ${openTok.line}, column ${openTok.col} was not closed before end of file. Add a closing ']'.`, openTok);
    }

    entries.push(parseExpr(state, 0, intoGroup(ctx)));

    if (state.peek().type !== "RBRACKET") {
      state.consume("COMMA");
    }
  }
  const endTok = state.consume("RBRACKET");
  return {
    kind: "list",
    value: entries,
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
 * The two transitions below differ deliberately, and that asymmetry is the
 * pre-refactor behaviour: a *grouped* expression is one expression-level
 * deeper than the `(` it sits in, while a point *coordinate* restarts the
 * expression budget and instead advances the structural one.
 */
function parseParenOrPoint(state: ParserState, ctx: ExprCtx): AstValue {
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
    const x = requireCoordinate(state, parseExpr(state, 0, intoCoordinate(ctx)), xTok);
    state.consume("COMMA");
    const yTok = state.peek();
    const y = requireCoordinate(state, parseExpr(state, 0, intoCoordinate(ctx)), yTok);

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
  const inner = parseExpr(state, 0, intoGroup(ctx));
  const bad = state.peek();
  if (bad.type !== "RPAREN") {
    state.throwError(`In ${state.currentContext}: Expected ')' to close the math expression, but found ${describeToken(bad)}.`, bad);
  }
  const closeTok = state.consume("RPAREN");
  // The span covers the brackets themselves, matching the pre-refactor
  // `parseValue.ts:187`, which ended a parenthesised value at its ')'.
  return { ...inner, line: openTok.line, col: openTok.col, endLine: closeTok.line, endCol: closeTok.endCol };
}

function parsePrimary(state: ParserState, ctx: ExprCtx): AstValue {
  checkNesting(state, ctx);

  const t = state.peek();
  const { line, col } = t;

  if (t.type === "MINUS") {
    const minusTok = state.consume("MINUS");
    const operand = parsePrimary(state, intoUnary(ctx));
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

  if (t.type === "LBRACKET") return parseListLiteral(state, ctx);
  if (t.type === "LPAREN")   return parseParenOrPoint(state, ctx);

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

export function parseExpr(state: ParserState, minPrec: number, ctx: ExprCtx): AstValue {
  checkNesting(state, ctx);

  // The start token of the whole accumulated left-hand side. A folded left is
  // always a number — otherwise `applyBinary` would have thrown — so this is
  // only ever read back when the very first primary was the bad operand.
  const leftTok = state.peek();
  let left = parsePrimary(state, ctx);

  while (true) {
    const t = state.peek();
    const op = operatorFor(t);
    if (op === null || op.prec <= minPrec) break;

    state.consume();
    const rightTok = state.peek();
    const right = parseExpr(state, op.prec, intoOperand(ctx));
    left = applyBinary(state, op.name, { value: left, tok: leftTok }, { value: right, tok: rightTok }, t);
  }

  return left;
}
