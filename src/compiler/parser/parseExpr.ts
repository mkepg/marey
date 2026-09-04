import type { AstValue, FitMode, Token } from "../types";
import { NAMED_COLORS, type ExpressionWord } from "../lexer";
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
 * - `struct` bounds how deep points and lists nest inside one another. Only a
 *   point *coordinate* charges it — a list entry does not, so a chain that
 *   alternates the two costs one structural level per point, whether or not
 *   lists are interleaved.
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
 *   parsePrimary      | parseExpr         | intoUnary    (unary 'not')
 *   parsePrimary      | parseListLiteral  | (dispatch — no transition)
 *   parsePrimary      | parseParenOrPoint | (dispatch — no transition)
 *   parseListLiteral  | parseExpr         | intoGroup       (entry)
 *   parseParenOrPoint | parseExpr         | intoCoordinate  (point x)
 *   parseParenOrPoint | parseExpr         | intoCoordinate  (point y)
 *   parseParenOrPoint | parseExpr         | intoGroup       (grouped expr)
 *
 * Ten call edges; the three no-transition ones are strict descents within a
 * level, and every edge that can close a cycle advances `total`.
 *
 * The 'not' edge is the one Task 5 added. It re-enters `parseExpr` rather than
 * `parsePrimary` (unlike unary '-'), so it closes a cycle and must advance
 * `total` — which `intoUnary` already does, since a prefix operand costs the
 * same whichever prefix it belongs to.
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

/** Into the operand of a unary prefix — '-' or 'not'. */
function intoUnary(c: ExprCtx): ExprCtx {
  return { expr: c.expr + 1, struct: c.struct, total: c.total + 1 };
}

function checkNesting(state: ParserState, ctx: ExprCtx): void {
  if (ctx.expr > MAX_EXPR_DEPTH) {
    state.throwError(`In ${state.currentContext}: Math expression is too deeply nested. Maximum depth is ${MAX_EXPR_DEPTH}.`, state.peek());
  }
  if (ctx.struct > MAX_STRUCTURAL_DEPTH) {
    state.throwError(`In ${state.currentContext}: Points and lists are nested too deeply. Maximum nesting depth is ${MAX_STRUCTURAL_DEPTH}.`, state.peek());
  }
  if (ctx.total > MAX_TOTAL_DEPTH) {
    state.throwError(`In ${state.currentContext}: This value nests too deeply overall. Maximum total nesting is ${MAX_TOTAL_DEPTH}.`, state.peek());
  }
}

/**
 * What a row is keyed by: the token type for an operator spelled as a symbol,
 * the reserved word itself for one spelled as a word.
 *
 * `EXPR_KEYWORD` is deliberately excluded, so the row that would break this
 * cannot be written at all. See `OPERATORS` below.
 */
type OperatorKey = Exclude<Token["type"], "EXPR_KEYWORD"> | ExpressionWord;

/**
 * The binary operators, declared once.
 *
 * Token type, spelling, precedence and associativity live in a single row, so
 * adding an operator cannot half-land. A previous shape — `operatorOf`
 * returning a bare `string` plus a separate `Record<string, number>` of
 * precedences — could be updated in one place and not the other, and the
 * result was silent: the precedence lookup missed, the loop broke, and the
 * operator token was left unconsumed to be reported later as "Expected a
 * property name", which is exactly what an operator the parser genuinely does
 * not know looks like. Neither table's `string` key could catch that at
 * compile time. `assoc` lives here for the same reason: a separate
 * `NON_ASSOCIATIVE` set is a second list to forget.
 *
 * **How `and` and `or` are keyed, and what it costs.** Task 3 gave all eleven
 * reserved expression words one token type, `EXPR_KEYWORD`, distinguished
 * only by the token's value — so a token type no longer identifies an
 * operator. Keying a row `EXPR_KEYWORD` would make `in`, `to`, `if`, `then`,
 * `else`, `not`, `sin`, `cos` and `length` all bind as whichever operator that
 * row named, silently, in the middle of an expression; `OperatorKey` excludes
 * that type so the mistake does not compile. Word operators are keyed by the
 * word instead, and the two key spaces cannot collide because every token type
 * is upper-case and no reserved word is.
 *
 * The cost is that a row's key is no longer a single field of `Token`, so
 * `operatorFor` computes it. That is one branch in one place — the alternative,
 * a second word-keyed table beside this one, is again two lists to keep in
 * step. The compile-time guarantee that a row without a handler fails the
 * build is untouched either way: it comes from `name` feeding `applyBinary`'s
 * exhaustive switch, not from the key.
 *
 * Precedence 4 is left free on purpose: `to` takes it in Task 9, between the
 * comparisons and `+`/`-`, per design section 4.2.
 */
const OPERATORS = {
  or:      { name: "or", prec: 1, assoc: "left" },
  and:     { name: "and", prec: 2, assoc: "left" },
  EQ_EQ:   { name: "==", prec: 3, assoc: "none" },
  BANG_EQ: { name: "!=", prec: 3, assoc: "none" },
  LT:      { name: "<",  prec: 3, assoc: "none" },
  GT:      { name: ">",  prec: 3, assoc: "none" },
  LT_EQ:   { name: "<=", prec: 3, assoc: "none" },
  GT_EQ:   { name: ">=", prec: 3, assoc: "none" },
  PLUS:    { name: "+",  prec: 5, assoc: "left" },
  MINUS:   { name: "-",  prec: 5, assoc: "left" },
  STAR:    { name: "*",  prec: 6, assoc: "left" },
  SLASH:   { name: "/",  prec: 6, assoc: "left" },
  PERCENT: { name: "%",  prec: 6, assoc: "left" },
} as const satisfies Partial<Record<OperatorKey, { name: string; prec: number; assoc: "left" | "none" }>>;

type Operator = (typeof OPERATORS)[keyof typeof OPERATORS];
type OperatorName = Operator["name"];

/**
 * The minimum precedence `not`'s operand is parsed at.
 *
 * `parseExpr` consumes an operator only when its precedence is *greater* than
 * the minimum it was given, so parsing the operand at `and`'s precedence takes
 * in everything binding tighter than `and` — the comparisons at 3 and the
 * arithmetic below them — and leaves `and` (2) and `or` (1) to the caller.
 * That is what gives `not a == b` the reading `not (a == b)`, the only useful
 * one, while `not a and b` still reads `(not a) and b`.
 *
 * Unary '-' does it differently, and the difference is not an oversight: '-'
 * calls `parsePrimary`, taking no binary operator at all, because `-a * b` has
 * to be `(-a) * b`. `not` cannot do that — `not a == b` would become
 * `(not a) == b`, i.e. `not` applied to a number, which is always an error and
 * never what was written.
 *
 * Read off the table rather than written as `2`, so the two cannot drift.
 */
const NOT_OPERAND_MIN_PREC: number = OPERATORS.and.prec;

/** The operator a token denotes, or null if it is not a binary operator. */
function operatorFor(t: Token): Operator | null {
  const key = t.type === "EXPR_KEYWORD" ? (t.value as string) : t.type;
  return (OPERATORS as Partial<Record<string, Operator>>)[key] ?? null;
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
 * `and`/`or` take booleans and nothing else. There is no truthiness in this
 * language (design section 4.3), so the message says so rather than leaving
 * the author to guess that `1 and true` might have worked.
 */
function requireBoolean(state: ParserState, operand: Operand, op: OperatorName, side: string): boolean {
  const v = operand.value;
  if (v.kind !== "boolean") {
    state.throwError(
      `In ${state.currentContext}: The ${side} operand of '${op}' must be a boolean, but got ${v.kind}. Declare has no truthiness — write an explicit comparison.`,
      operand.tok,
    );
  }
  return v.value;
}

/**
 * The kinds `==` and `!=` are defined over: exactly those whose whole payload
 * is one primitive `value` (design section 4.3). A `point` has two numbers and
 * a `list` has an arbitrary tree, so equality on them is a further decision
 * with its own edge cases (element-wise? by length?) that no phase has taken.
 * `indefinitely` has no payload at all.
 */
const COMPARABLE_KINDS = ["number", "string", "boolean", "color"] as const;
type ComparableValue = Extract<AstValue, { kind: (typeof COMPARABLE_KINDS)[number] }>;

function isComparable(v: AstValue): v is ComparableValue {
  return (COMPARABLE_KINDS as readonly string[]).includes(v.kind);
}

/**
 * Whether the two operands of `==`/`!=` are equal, rejecting the pairs where
 * the question has no honest answer.
 *
 * A mismatch of kinds is an error rather than `false`: a silent `false`
 * compiles, renders something wrong, and gives the author nothing to read.
 *
 * Both errors are reported at the operator, not at either operand, because
 * neither operand is the wrong one on its own — it is the pairing that fails.
 * That is the opposite of `requireNumber`/`requireBoolean`, where exactly one
 * side is at fault and the diagnostic anchors there.
 *
 * A named color compares by the hex it resolves to, since that is all the
 * lexer keeps (`red == #ff0000` is true).
 */
function compareEqual(state: ParserState, op: OperatorName, left: Operand, right: Operand, opTok: Token): boolean {
  const l = left.value;
  const r = right.value;
  if (l.kind !== r.kind) {
    state.throwError(
      `In ${state.currentContext}: '${op}' compares two values of the same kind, but got ${l.kind} and ${r.kind}. Comparing different kinds is an error rather than always false, so a mismatch is visible instead of silently rendering the wrong thing.`,
      opTok,
    );
  }
  if (!isComparable(l) || !isComparable(r)) {
    state.throwError(
      `In ${state.currentContext}: '${op}' cannot compare ${l.kind} values. Comparable kinds are number, string, boolean and color.`,
      opTok,
    );
  }
  return l.value === r.value;
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
  const at = span(left.value, right.value);

  // No default branch and no trailing return: the switch is exhaustive over
  // `OperatorName`, so adding a row to OPERATORS without handling it here
  // leaves a path that falls out of a function declared to return `AstValue`,
  // and fails the build.
  //
  // The inner switches are exhaustive over their own narrowed families and
  // give the same guarantee one level down (`value` used before assigned). A
  // chain of ternaries would not: a new operator listed in a `case` above but
  // forgotten in the chain would silently inherit the last branch's arithmetic.
  switch (op) {
    case "+": case "-": case "*": case "/": case "%": {
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
        case "%":
          // Matching '/' rather than yielding NaN: `x % 0` is NaN in
          // JavaScript, and a NaN folded into the IR reaches the renderer as
          // a coordinate no error ever mentions.
          if (r === 0) state.throwError(`In ${state.currentContext}: Modulo by zero.`, opTok);
          value = l % r;
          break;
      }
      return { kind: "number", value, ...at };
    }

    case "<": case ">": case "<=": case ">=": {
      const l = requireNumber(state, left, op, "left");
      const r = requireNumber(state, right, op, "right");
      let value: boolean;
      switch (op) {
        case "<":  value = l < r;  break;
        case ">":  value = l > r;  break;
        case "<=": value = l <= r; break;
        case ">=": value = l >= r; break;
      }
      return { kind: "boolean", value, ...at };
    }

    case "==": case "!=": {
      const equal = compareEqual(state, op, left, right, opTok);
      let value: boolean;
      switch (op) {
        case "==": value = equal; break;
        case "!=": value = !equal; break;
      }
      return { kind: "boolean", value, ...at };
    }

    case "and": case "or": {
      // Not short-circuiting, and there is nothing to short-circuit: both
      // operands were folded to literals before this call, and the language
      // has no runtime. `false and (1 / 0 > 1)` is still a division-by-zero
      // error, exactly as it would be outside the `and`.
      const l = requireBoolean(state, left, op, "left");
      const r = requireBoolean(state, right, op, "right");
      let value: boolean;
      switch (op) {
        case "and": value = l && r; break;
        case "or":  value = l || r; break;
      }
      return { kind: "boolean", value, ...at };
    }
  }
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
 *  2. It leaves a list of points — the only list this language could write
 *     until now — costing exactly what it used to. A point entry's own
 *     coordinates still reset `expr` and advance `struct` one level inside
 *     `parseParenOrPoint`, so the coordinate sits at the same `struct` and the
 *     same zeroed `expr` this function used to pass directly — which is what
 *     keeps `parseExpr.test.ts`'s 50/51 coordinate-inside-a-list boundary and
 *     its alternating list/point structural cap where they are. `intoCoordinate`
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

  // `not` is a prefix, so it is reached from primary position — but its
  // operand is a whole expression down to `and`, not a primary. See
  // NOT_OPERAND_MIN_PREC for why, and for why unary '-' below is different.
  if (t.type === "EXPR_KEYWORD" && t.value === "not") {
    const notTok = state.consume();
    const operand = parseExpr(state, NOT_OPERAND_MIN_PREC, intoUnary(ctx));
    if (operand.kind !== "boolean") {
      state.throwError(
        `In ${state.currentContext}: 'not' requires a boolean, but got ${operand.kind}. Declare has no truthiness — write an explicit comparison.`,
        notTok,
      );
    }
    return { kind: "boolean", value: !operand.value, line: notTok.line, col: notTok.col, endLine: operand.endLine, endCol: operand.endCol };
  }

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

    // `a < b < c` is rejected here rather than regrouped. Without this the
    // loop would fold it left-associatively into `(a < b) < c` and complain
    // that the left operand of the second '<' is a boolean — a description of
    // the consequence rather than of the mistake. Comparing precedence rather
    // than `assoc` on the *next* operator is deliberate: `a < b == c` chains
    // just as much as `a < b < c` does, and both are level 3.
    if (op.assoc === "none") {
      const next = operatorFor(state.peek());
      if (next !== null && next.prec === op.prec) {
        state.throwError(
          `In ${state.currentContext}: Comparisons cannot be chained. Write 'a ${op.name} b and b ${next.name} c' rather than 'a ${op.name} b ${next.name} c'.`,
          state.peek(),
        );
      }
    }
  }

  return left;
}
