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
 *   parseExpr         | parseConditional  | (dispatch — no transition)
 *   parseExpr         | parsePrimary      | (same level — no transition)
 *   parseExpr         | parseExpr         | intoOperand  (binary RHS)
 *   parseConditional  | parseExpr         | intoOperand  (condition)
 *   parseConditional  | parseExpr         | intoOperand  (then branch)
 *   parseConditional  | parseExpr         | intoOperand  (else branch)
 *   parsePrimary      | parsePrimary      | intoUnary    (unary '-')
 *   parsePrimary      | parseExpr         | intoUnary    (unary 'not')
 *   parsePrimary      | parseListLiteral  | (dispatch — no transition)
 *   parsePrimary      | parseParenOrPoint | (dispatch — no transition)
 *   parseListLiteral  | parseExpr         | intoGroup       (entry)
 *   parseParenOrPoint | parseExpr         | intoCoordinate  (point x)
 *   parseParenOrPoint | parseExpr         | intoCoordinate  (point y)
 *   parseParenOrPoint | parseExpr         | intoGroup       (grouped expr)
 *
 * Fourteen call edges; the four no-transition ones are strict descents within
 * a level, and every edge that can close a cycle advances `total`.
 *
 * The 'not' edge is the one Task 5 added. It re-enters `parseExpr` rather than
 * `parsePrimary` (unlike unary '-'), so it closes a cycle and must advance
 * `total` — which `intoUnary` already does, since a prefix operand costs the
 * same whichever prefix it belongs to.
 *
 * That advance looks unobservable and is not. `total` can only be the cap that
 * fires below an `expr` reset, `intoCoordinate` is the only reset, and a
 * coordinate must be a number — so no *valid* program has a `not` below one.
 * But `checkNesting` runs on the way down and `requireCoordinate` on the way
 * back up, so an invalid one still reports whichever it reaches first, and that
 * differs between charging this edge and not. `parseExpr.test.ts` pins it at
 * total 400 exactly ("charges the total budget for the 'not' operand").
 *
 * The three `parseConditional` edges are Task 6's, and they are pinned the same
 * way — one fixture per edge, each at total 399 with a redundant `(…)` in that
 * one position, so exactly one edge's advance is what tips it over 400. All
 * three take `intoOperand` because `if`/`then`/`else` is a ternary *operator*
 * and these are its operands: one expression level each, no structural level
 * (a conditional is not a point or a list), and no reset.
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

/**
 * Into an operand of an operator: the right-hand side of a binary one, or any
 * of the three sub-expressions of the `if`/`then`/`else` ternary.
 */
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
 * The reserved words that are binary operators — two of the eleven.
 *
 * Written as `Extract` from `ExpressionWord` rather than as a bare
 * `"and" | "or"` so the two are tied to the lexer's list: if a word is renamed
 * or dropped in `lexer/constants.ts`, `Extract` drops it here too and the
 * `OPERATORS` row that names it stops compiling, instead of the row surviving
 * against a spelling the lexer no longer produces.
 */
type OperatorWord = Extract<ExpressionWord, "and" | "or">;

/**
 * The three words of the conditional, tied to the lexer's list for the same
 * reason `OperatorWord` is: rename one in `lexer/constants.ts` and `Extract`
 * drops it here, so the `parseConditional` call that names it stops compiling
 * rather than silently looking for a spelling the lexer no longer produces.
 */
type ConditionalWord = Extract<ExpressionWord, "if" | "then" | "else">;

/**
 * What a row is keyed by: the token type for an operator spelled as a symbol,
 * the reserved word itself for one spelled as a word.
 *
 * `EXPR_KEYWORD` is deliberately excluded, and the word half is `OperatorWord`
 * rather than all of `ExpressionWord`, so neither shape of the row that would
 * break this can be written at all. See `OPERATORS` below.
 */
type OperatorKey = Exclude<Token["type"], "EXPR_KEYWORD"> | OperatorWord;

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
 * Excluding the *type* is only half of it, and the half that was missing let
 * the same bug through one row at a time. While the word half of `OperatorKey`
 * was all of `ExpressionWord`, a row keyed `if` — or `sin`, or `then` —
 * satisfied the constraint and compiled clean, and `let x = 1 if 2` folded to
 * `3` with no diagnostic: `operatorFor` looks a word token up by its value, so
 * any reserved word with a row is an operator, whatever the row's key was
 * meant to mean. `OperatorWord` narrows that half to the two words that are
 * operators, which is what makes the guarantee hold in both directions.
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

/** Whether `t` is the reserved word `word`. */
function isWord(t: Token, word: ConditionalWord): boolean {
  return t.type === "EXPR_KEYWORD" && t.value === word;
}

/**
 * Consumes the `then` or `else` that structures a conditional.
 *
 * Written as its own check rather than `state.consume("EXPR_KEYWORD")` because
 * that token type is shared by all eleven reserved words, so consuming by type
 * would take `if c else x` as a well-formed `if … then …` and go looking for a
 * second `else`. It also throws *before* consuming: `consume()` with no
 * expected type advances `pos` even on a mismatch, which is what moved
 * `synchronize()`'s resume point and produced a spurious extra diagnostic when
 * `parseGenerate` switched to it (`languageCuts.test.ts`, "parseGenerate's 'to'
 * bound recovery").
 */
function consumeWord(state: ParserState, word: ConditionalWord, after: string): void {
  const t = state.peek();
  if (!isWord(t, word)) {
    state.throwError(
      `In ${state.currentContext}: Expected '${word}' after the ${after} of an 'if', but found ${describeToken(t)}.`,
      t,
    );
  }
  state.consume();
}

/**
 * `if C then A else B` (design 4.2, 4.3).
 *
 * It gets no row in `OPERATORS` and could not have one: that table is keyed by
 * the single token an operator *is*, and a conditional is spelled with three,
 * two of which are separators rather than the thing being dispatched on.
 *
 * **All three sub-expressions are parsed at minimum precedence 0.** For the
 * condition and the `then` branch that costs nothing in ambiguity: neither
 * `then` nor `else` is a binary operator, so the precedence climb stops at them
 * of its own accord, and parsing at 0 is what lets `if a or b then …` and
 * `if c then 1 + 2 else …` mean what they read as. For the `else` branch it is
 * the whole point — it is what makes the conditional the *loosest* construct,
 * so `if c then 1 else 2 + 3` is `if c then 1 else (2 + 3)` rather than
 * `(if c then 1 else 2) + 3`. Those two disagree whenever the condition is
 * true, which is what `parseExpr.test.ts` pins.
 *
 * **Right-associativity is structural, not a rule.** `else if` chains because
 * the else branch re-enters `parseExpr`, which dispatches back here on a
 * leading `if`; the inner conditional consumes its own `else`, so a trailing
 * `else` always belongs to the nearest unclosed `if`. There is nothing to
 * choose: the left-associative reading would require the *outer* `if` to claim
 * an `else` the inner one has already taken.
 *
 * **Both branches are folded and kind-checked whichever one is selected.**
 * Returning early on the taken branch would make `radius: if flag then 5 else red`
 * legal whenever `flag` is true — a value whose *kind* depends on data, which
 * is the one place design 2.1 ("data determines values; the source's literal
 * structure determines shape") is easiest to cross by accident.
 */
function parseConditional(state: ParserState, ctx: ExprCtx): AstValue {
  const ifTok = state.consume();

  // Anchored at the condition, not at the `if`: exactly one sub-expression is
  // at fault, so this follows `requireNumber`'s operand anchoring rather than
  // `compareEqual`'s at-the-operator anchoring.
  const condTok = state.peek();
  const condition = parseExpr(state, 0, intoOperand(ctx));
  if (condition.kind !== "boolean") {
    state.throwError(
      `In ${state.currentContext}: An 'if' condition must be a boolean, but got ${condition.kind}. Declare has no truthiness — write an explicit comparison such as 'i % 5 == 0'.`,
      condTok,
    );
  }

  consumeWord(state, "then", "condition");
  const whenTrue = parseExpr(state, 0, intoOperand(ctx));

  consumeWord(state, "else", "'then' branch");
  const whenFalse = parseExpr(state, 0, intoOperand(ctx));

  // Reported at the `if`, like the mixed-kind equality in `compareEqual`:
  // neither branch is the wrong one on its own, it is the pairing that fails.
  if (whenTrue.kind !== whenFalse.kind) {
    state.throwError(
      `In ${state.currentContext}: Both branches of an 'if' must be the same kind, but 'then' is ${whenTrue.kind} and 'else' is ${whenFalse.kind}. Both branches are checked whichever one the condition selects, so a value's kind never depends on data.`,
      ifTok,
    );
  }

  const chosen = condition.value ? whenTrue : whenFalse;
  // The span covers the whole construct, the way a parenthesised expression
  // takes its brackets' span rather than the inner value's.
  return { ...chosen, line: ifTok.line, col: ifTok.col, endLine: whenFalse.endLine, endCol: whenFalse.endCol };
}

export function parseExpr(state: ParserState, minPrec: number, ctx: ExprCtx): AstValue {
  checkNesting(state, ctx);

  // The conditional is dispatched here rather than from `parsePrimary`, where
  // the other prefix forms ('-' and 'not') live, because it is the loosest
  // construct in the grammar and a primary is the tightest thing there is: an
  // expression is *either* a conditional or a precedence climb. The one
  // observable consequence is that `-if c then 1 else 2` is rejected — unary
  // '-' takes a primary — where `-(if c then 1 else 2)` is fine.
  //
  // `minPrec` is deliberately not consulted. A conditional may begin any
  // expression, including one an operator is already waiting on, and it then
  // runs to the end of its own else branch; `1 + if c then 2 else 3` is legal
  // and means `1 + (if c then 2 else 3)`. Gating on `minPrec === 0` instead
  // would reject that while still admitting `if if a then b else c then …`,
  // since a condition is itself parsed at 0 — so it would buy no readability,
  // only an exception to state.
  //
  // Returning rather than feeding the loop below is a formality and no test can
  // tell the two apart, which was checked rather than assumed: the else branch
  // is parsed at minimum precedence 0, so its own loop runs until
  // `operatorFor(peek())` is null or its precedence is <= 0, and the lowest
  // precedence in `OPERATORS` is 1. Whatever follows a conditional is therefore
  // never a binary operator, and the loop would break on its first iteration.
  if (isWord(state.peek(), "if")) return parseConditional(state, ctx);

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
