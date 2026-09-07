# Phase 3B — Generative Expressiveness Implementation Plan

**Goal:** Give Declare lists, iteration over them, indexing, `length`, modulo, comparison, boolean combinators, a conditional value expression, and degree-based `sin`/`cos`, so that `bar-chart`, `radial-dots` and `timeline-ticks` stop being hand-unrolled.

**Architecture:** Declare has no expression layer — the parser evaluates everything to a literal `AstValue` at parse time (`parser/parseValue.ts:46-75`), and `generate` re-parses its body with a rebound environment (`parser/parseGenerate.ts:87-98`). Every construct here is therefore a *parse-time* addition: the type checker and the Scene IR see only folded literals, so `sceneIR.ts` is untouched. The one type-system change that reaches the contract is folding `pointList` into a single `list` value kind with a `listOf` constraint.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), Vitest, Vite, PixiJS, Matter.js 0.20.0.

**Spec:** `docs/specs/2026-09-02-phase-3b-generative-expressiveness-design.md`. Read §2 (the governing line) before writing any syntax.

---

## Global constraints

Every task must respect these. They are not restated per task.

1. **Never state a behaviour you have not read in the source.** Cite `file:line`. The report is a claim; the diff is the evidence.
2. **A green suite proves less than it looks.** For any test guarding a fix, establish it would genuinely fail if the fix were reverted — revert, watch it fail, restore. Phase 3A shipped six tests that never had a red.
3. **New property or value metadata goes in `src/compiler/languageContract.ts` and nowhere else.** Do not start a fifth hand-synced list.
4. **`eval/scenes/` and `eval/scenes-r2/` keep their evidence.** The *only* permitted edit in either directory, in the whole phase, is Task 10's mechanical `generate ... from` → `generate ... in` rename — the same kind of vocabulary migration Phase 3A performed and recorded at `eval/RESULTS.md:7-12`. **No fixture may be rewritten to use the new expression layer**; the hand-unrolled repetition is the measurement. `eval/report.json` and `eval/report-r2.json` must stay byte-identical throughout, including after Task 10 — every affected header starts at 0, so the ordinal suffix equals the old loop value and no object name changes. A moved report byte is a defect.
5. **A moving golden snapshot is a decision, never a re-record.** Only the snapshot changes listed in Task 15 are permitted. `npx vitest run -u` is forbidden.
6. Run `npx tsc -b --noEmit` before every commit. The build typechecks.
7. Commit at the end of every task. Work on branch `phase-3b-generative-expressiveness`. Do not merge or push.
8. **`parseExpr`'s signature is `parseExpr(state, minPrec, ctx: ExprCtx)`.** **Do not construct a context inline.** Pick one of the named transitions on `ExprCtx` — `intoCoordinate`, `intoGroup`, `intoOperand`, `intoUnary` — so each new recursive edge states its intent. `ROOT_CTX` is the entry value.

   Tasks 7–9 were rewritten against `77f9297` and are current. **Tasks 10–16 have not been**, and were drafted before Task 2 introduced `ExprCtx` and before d02320b unified `operatorOf`/`PRECEDENCE`/`NON_ASSOCIATIVE` into one `OPERATORS` table. Treat their code sketches as intent, not as text to paste, and re-derive every signature from source before using one. Rewrite a task's body when it becomes active rather than working around it in place.

   `ExprCtx` carries three budgets with deliberately different semantics, all three of which were live defects during Task 2: `expr` **resets at a coordinate** (pre-refactor parity, `de9bf39:parseValue.ts:128,130,166,168`); `struct` bounds point/list nesting and **never resets**; `total` bounds the *product* of the other two and **never resets**, because 50 structural levels each carrying a fresh 50-level expression budget still overflowed the stack at ~5 KB of source. All three are pinned by `parseExpr.test.ts`. Read the block comment above `ExprCtx` before touching any of them.

   **Adding an operator means adding one row to `OPERATORS` (`parseExpr.ts:113`) and one `case` to `applyBinary`.** Token type, spelling and precedence live in that one row; `Operator` and `OperatorName` derive from it, so `op` is a union, not `string`. `applyBinary`'s switch is exhaustive with no `default`, so a row added without a matching case is a **compile error** (`TS2454: Variable 'value' is used before being assigned`), not a silent mis-parse. Do not add a `default` branch to "fix" that error — it is the guardrail.

   The one mistake the types still cannot catch is a new edge that forgets to advance `total`, since all three budgets are plain `number`. If your task adds several edges, re-derive the edge table above `ExprCtx` and check each one.
9. **Use `git diff`, never `git status`, to prove a file is unchanged.** This repo has `core.autocrlf=true` and no `.gitattributes`, so regenerating a file with LF endings makes `git status --porcelain` report ` M` even when the content is byte-identical after normalisation. `git diff --stat -- <path>` printing nothing is the reliable check; `git status` is not. `src/compiler/__snapshots__/determinism.test.ts.snap` has shown as modified from before this branch existed for exactly this reason, with an empty content diff — that is the artifact, not a change. For the same reason, do **not** compare raw `md5` of a worktree file against its committed blob; normalise line endings first, or just use `git diff`.

### Commands

```bash
npm test                                                   # full suite, single pass
npx vitest run src/compiler/languageCuts.test.ts            # one file
npx vitest run -t "rejects '%' modulo"                      # one test by name
npx tsc -b --noEmit                                         # typecheck alone
npm run build                                               # production build
npx vitest run --config eval/vitest.config.ts              # R1 corpus
EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts   # R2 corpus
```

---

## File map

### New files

| Path | Responsibility |
|---|---|
| `src/compiler/parser/parseExpr.ts` | The whole expression grammar: precedence climbing, unary, postfix index, primary, and typed binary/unary application. Owns every new operator. |
| `src/compiler/parser/parseExpr.test.ts` | Unit tests for the expression parser, driven through `lex`/`parse`. |
| `eval/scenes-3b/bar-chart.declare` | Rewritten acceptance scene. |
| `eval/scenes-3b/radial-dots.declare` | Rewritten acceptance scene. |
| `eval/scenes-3b/timeline-ticks.declare` | Rewritten acceptance scene. |
| `eval/scenes-3b/README.md` | States this is a demonstration corpus, not an authorability round. |
| `eval/RESULTS-3B.md` | Before/after metrics against the hand-unrolled baselines. |

### Principal modified files

| Path | Change |
|---|---|
| `src/compiler/types.ts` | New token types; `PointListValue` → `ListValue`. |
| `src/compiler/lexer/constants.ts` | `%`, `<`, `>` in `SINGLE_CHAR_MAP`; new `TWO_CHAR_MAP`; new `EXPRESSION_WORDS`. |
| `src/compiler/lexer/index.ts` | Two-char operator path before the single-char path; `!` diagnostic; allowed-symbols message. |
| `src/compiler/lexer/handlers.ts` | `EXPRESSION_WORDS` → `EXPR_KEYWORD` in `handleWord`. |
| `src/compiler/parser/parseValue.ts` | Shrinks to a thin context-sensitive wrapper over `parseExpr`. |
| `src/compiler/parser/state.ts` | `describeToken` / `expectedTypeDescription` cases for the new tokens. |
| `src/compiler/parser/parseObject.ts` | Property-name gate and reserved-object-name check admit `EXPR_KEYWORD`. |
| `src/compiler/parser/parseUse.ts` | Property-name gate admits `EXPR_KEYWORD`. |
| `src/compiler/parser/parseGenerate.ts` | `in`-form header, list iteration, ordinal name suffixing. |
| `src/compiler/languageContract.ts` | `ValueKind` `pointList`→`list`; `listOf` constraint; `KIND_LABEL`; `points` entries. |
| `src/compiler/typeChecker/validator.ts` | `listOf` constraint case; `TYPE_ONE_PHYSICS` rule. |
| `src/compiler/typeChecker/resolvers.ts` | `getReqPointList` narrows list elements to points. |
| `src/compiler/languageCuts.test.ts` | Lifted cuts become permissions; §2's line becomes rejections. |
| `docs/LANGUAGE.md` | "Current limits" replaced; new syntax documented with the line. |
| `src/components/Editor/MonacoEditor/constants.ts` | `generate` hover rewritten for the new header. |
| `src/components/Editor/MonacoEditor/scanner.ts` | `"pointList"` binding kind → `"list"`. |

---

## Task 1: Lex the new operator symbols

**Files:**
- Modify: `src/compiler/types.ts:1-25`
- Modify: `src/compiler/lexer/constants.ts:27-41`
- Modify: `src/compiler/lexer/index.ts:35-40`, `:64`
- Modify: `src/compiler/parser/state.ts:3-28`
- Test: `src/compiler/lexer/lexer.test.ts` (create if absent), `src/compiler/languageCuts.test.ts:202-230`

Nothing consumes these tokens yet. `%`, `<`, `==` remain rejected — the rejection just moves from the lexer to the parser, so the two `languageCuts` cases change message. That is expected and is updated in this task.

- [ ] **Step 1: Write the failing lexer test**

Create `src/compiler/lexer/lexer.test.ts` if it does not exist; otherwise append.

```ts
import { describe, expect, it } from "vitest";
import { lex } from "./index";

describe("operator tokens", () => {
  it("lexes the single-character operators", () => {
    expect(lex("% < >").map((t) => t.type)).toEqual(["PERCENT", "LT", "GT", "EOF"]);
  });

  it("lexes two-character operators as one token, not two", () => {
    expect(lex("== != <= >=").map((t) => t.type))
      .toEqual(["EQ_EQ", "BANG_EQ", "LT_EQ", "GT_EQ", "EOF"]);
  });

  it("still lexes a lone '=' as EQUALS so 'let' keeps working", () => {
    expect(lex("=").map((t) => t.type)).toEqual(["EQUALS", "EOF"]);
  });

  it("records the two-character operator's end column across both characters", () => {
    const [tok] = lex("==");
    expect(tok.col).toBe(1);
    expect(tok.endCol).toBe(3);
  });

  it("rejects a bare '!' with a hint naming both replacements", () => {
    expect(() => lex("!")).toThrow(/'!=' or 'not'/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/compiler/lexer/lexer.test.ts`
Expected: FAIL — `lex("%")` throws `Unexpected character '%'`.

- [ ] **Step 3: Add the token types**

In `src/compiler/types.ts`, extend the `TokenType` union (it currently ends `| "EQUALS" | "EOF"`):

```ts
  | "EQUALS"
  | "PERCENT"
  | "LT"
  | "GT"
  | "LT_EQ"
  | "GT_EQ"
  | "EQ_EQ"
  | "BANG_EQ"
  | "EOF";
```

- [ ] **Step 4: Add the lexer maps**

In `src/compiler/lexer/constants.ts`, add `%`, `<`, `>` to `SINGLE_CHAR_MAP` and add a new map above it:

```ts
/**
 * Two-character operators, matched before SINGLE_CHAR_MAP. Order matters:
 * '=' is already in SINGLE_CHAR_MAP, so without this pass '==' would lex as
 * two EQUALS tokens and become indistinguishable from 'let x = = y'.
 */
export const TWO_CHAR_MAP: Readonly<Record<string, TokenType>> = {
  "==": "EQ_EQ",
  "!=": "BANG_EQ",
  "<=": "LT_EQ",
  ">=": "GT_EQ",
};
```

and inside `SINGLE_CHAR_MAP`:

```ts
  "%": "PERCENT",
  "<": "LT",
  ">": "GT",
```

- [ ] **Step 5: Wire the two-character path into the lexer**

In `src/compiler/lexer/index.ts`, import `TWO_CHAR_MAP` alongside `SINGLE_CHAR_MAP`, and insert this **immediately before** the `const singleType = SINGLE_CHAR_MAP[ch];` block at `:35`:

```ts
    const twoType = TWO_CHAR_MAP[ch + state.peek(1)];
    if (twoType) {
      state.push(twoType, ch + state.peek(1), 2);
      state.advance(2);
      continue;
    }

    if (ch === "!") {
      state.err("Unexpected character '!'. Declare has no '!' operator — write '!=' for inequality, or 'not' to negate a condition.");
    }
```

`LexerState.peek(offset)` returns `""` past the end (`lexer/state.ts:22-24`), so `ch + state.peek(1)` is safe at EOF.

- [ ] **Step 6: Update the allowed-symbols message**

`src/compiler/lexer/index.ts:64` enumerates the legal symbols and is user-facing. Replace its trailing list:

```ts
    state.err(`Unexpected character ${display}. Declare source may only contain letters, digits, and the following symbols: # " { } [ ] ( ) : , // + - * / % = == != < > <= >=`);
```

- [ ] **Step 7: Describe the new tokens in parser diagnostics**

In `src/compiler/parser/state.ts`, add to `describeToken`'s switch (before `default`):

```ts
    case "PERCENT":     return "'%'";
    case "LT":          return "'<'";
    case "GT":          return "'>'";
    case "LT_EQ":       return "'<='";
    case "GT_EQ":       return "'>='";
    case "EQ_EQ":       return "'=='";
    case "BANG_EQ":     return "'!='";
```

- [ ] **Step 8: Update the two cut cases whose message moved**

In `src/compiler/languageCuts.test.ts`, the `%` case at `:202-210` and the `<` case at `:212-220` currently assert a *lex* error. They are still cuts — `%` and `<` are now tokens the parser has no rule for — so update only the message and keep the position assertions:

```ts
  it("rejects '%' modulo — lexed, but the parser has no rule for it yet", () => {
    const source = `let x = 1 % 2 scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("must begin with the 'scene' keyword");
    expect(diags[0].message).toContain("found '%'");
    const pos = posAt(source, "%");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });

  it("rejects '<' comparison — lexed, but the parser has no rule for it yet", () => {
    const source = `let x = 1 < 2 scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("must begin with the 'scene' keyword");
    expect(diags[0].message).toContain("found '<'");
    const pos = posAt(source, "<");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });
```

If the actual messages differ from these, **read the real output and assert what it says** — do not adjust the source to fit the assertion.

- [ ] **Step 9: Run the full suite and typecheck**

Run: `npx vitest run src/compiler/lexer/lexer.test.ts && npm test && npx tsc -b --noEmit`
Expected: all pass. If any test outside `languageCuts.test.ts` and `lexer.test.ts` changed behaviour, that is a defect in this task — investigate, do not update the test.

- [ ] **Step 10: Commit**

```bash
git add src/compiler/types.ts src/compiler/lexer src/compiler/parser/state.ts src/compiler/languageCuts.test.ts
git commit -m "feat(lexer): tokenize % < > == != <= >=

Two-character operators are matched before SINGLE_CHAR_MAP, which
consumes '=' unconditionally at lexer/index.ts:35 — without that
ordering '==' would lex as two EQUALS and be indistinguishable from
'let x = = y'. A bare '!' now names both replacements.

No parser rule consumes these yet, so % and < remain rejected; the two
languageCuts cases move from a lex error to a parse error and keep
their position assertions."
```

---

## Task 2: Refactor the math parser into a general expression parser

**Files:**
- Create: `src/compiler/parser/parseExpr.ts`
- Modify: `src/compiler/parser/parseValue.ts` (whole file)
- Test: existing suite, unchanged

**This task adds no capability and must change no behaviour.** Its success criterion is that the entire existing suite passes *without editing a single test*. Everything after it depends on this being true, so do not proceed if a test needed adjusting.

Today `parseMathExpr` returns a JavaScript `number` (`parser/parseValue.ts:46-75`). Every new operator produces or consumes non-numeric values, so the evaluator must return `AstValue`.

- [ ] **Step 1: Create the expression parser with only today's operators**

Create `src/compiler/parser/parseExpr.ts`:

```ts
import type { AstValue, Token } from "../types";
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

function requireNumber(state: ParserState, v: AstValue, op: string, side: string): number {
  if (v.kind !== "number") {
    state.throwError(
      `In ${state.currentContext}: The ${side} operand of '${op}' must be a number, but got ${v.kind}.`,
      state.peek(),
    );
  }
  return v.value;
}

function applyBinary(
  state: ParserState,
  op: string,
  left: AstValue,
  right: AstValue,
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
  return { kind: "number", value, ...span(left, right) };
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

  if (t.type === "LBRACKET") return parseListLiteral(state, depth);
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

  let left = parsePrimary(state, depth);

  while (true) {
    const t = state.peek();
    const op = operatorOf(t);
    if (op === null) break;
    const prec = PRECEDENCE[op];
    if (prec === undefined || prec <= minPrec) break;

    state.consume();
    const right = parseExpr(state, prec, depth + 1);
    left = applyBinary(state, op, left, right, t);
  }

  return left;
}
```

`parseListLiteral` and `parseParenOrPoint` are lifted verbatim from the current `parseValue.ts:113-146` (point list) and `:148-180` (point-vs-paren lookahead), with `parseMathExpr(state, 0, 0)` replaced by `parseExpr(state, 0, depth + 1)` and the resulting numbers read off the returned `AstValue`. **Read those two blocks and port them exactly**, including every error message and the `nesting` scan at `:150-161`; they carry diagnostics the suite pins.

`FitMode` must be imported as a type: `import type { AstValue, FitMode, Token } from "../types";`.

- [ ] **Step 2: Reduce `parseValue.ts` to a wrapper**

`parseValue` keeps only what is context-sensitive — the `currentKey === "property"` case that produces an `animProperty` from a bare identifier (`parser/parseValue.ts:194-197`):

```ts
import type { AstValue } from "../types";
import type { ParserState } from "./state";
import { parseExpr } from "./parseExpr";

export function parseValue(state: ParserState, currentKey?: string): AstValue {
  const t = state.peek();

  // `property: position` names an animatable property rather than referencing
  // a binding, so it is resolved before the expression grammar sees a bare
  // identifier it would try to look up in `state.env`.
  if (t.type === "IDENT" && currentKey === "property") {
    const tok = state.consume("IDENT");
    return {
      kind: "animProperty",
      value: tok.value as string,
      line: t.line, col: t.col, endLine: t.line, endCol: tok.endCol,
    };
  }

  return parseExpr(state, 0, 0);
}
```

- [ ] **Step 3: Run the full suite — it must pass with zero test edits**

Run: `npm test && npx tsc -b --noEmit`
Expected: **every test passes and no test file was modified in this task.**

If a test fails on an error *position*, the port dropped a span. Today a number's span runs from the first token to `state.tokens[state.pos - 1]` (`parser/parseValue.ts:186-188`); the new code spans left-operand start to right-operand end. Fix the span, not the test.

- [ ] **Step 4: Confirm both eval corpora are byte-identical**

```bash
npx vitest run --config eval/vitest.config.ts
EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts
git diff --stat -- eval/          # content check, NOT git status — see Global Constraint 8
```
Expected: both report 20/20, and `git diff --stat -- eval/` prints **nothing**.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/parser/parseExpr.ts src/compiler/parser/parseValue.ts
git commit -m "refactor(parser): evaluate expressions to AstValue, not number

parseMathExpr returned a JavaScript number (parseValue.ts:46-75), which
cannot carry the non-numeric results every Phase 3B operator produces.
Precedence climbing now runs over AstValue and dispatches on operand
kind. Behaviour-preserving: the full suite passes with no test edited
and both eval corpora reproduce their committed reports byte for byte."
```

---

## Task 3: Reserve the expression words

**Files:**
- Modify: `src/compiler/types.ts` (add `"EXPR_KEYWORD"`)
- Modify: `src/compiler/lexer/constants.ts`, `src/compiler/lexer/handlers.ts:81-103`
- Modify: `src/compiler/parser/state.ts` (`describeToken`)
- Modify: `src/compiler/parser/parseObject.ts:176-178`, `:281`
- Modify: `src/compiler/parser/parseUse.ts:73`
- Test: `src/compiler/languageCuts.test.ts:163-176`, `:234-242`, `:340-353`

Reserving `in to if then else and or not sin cos length` is the phase's breaking change. It is verified zero-cost across the corpus: no `.declare` file, and no non-comment line of `src/store/defaultScene.ts`, uses any of them as an identifier.

They must **not** join `KEYWORDS` (`lexer/constants.ts:11`), which means "names a block" — `parseValue` reports any `KEYWORD` in value position as *"is an object keyword"* (`parser/parseValue.ts:208-210`), which would be false for `if`.

- [ ] **Step 1: Write the failing tests**

Append to `src/compiler/lexer/lexer.test.ts`:

```ts
describe("expression keywords", () => {
  it.each(["in", "to", "if", "then", "else", "and", "or", "not", "sin", "cos", "length"])(
    "lexes '%s' as EXPR_KEYWORD, not IDENT or KEYWORD",
    (word) => {
      const [tok] = lex(word);
      expect(tok.type).toBe("EXPR_KEYWORD");
      expect(tok.value).toBe(word);
    },
  );

  it("keeps block keywords as KEYWORD", () => {
    expect(lex("circle")[0].type).toBe("KEYWORD");
  });
});
```

Append to `src/compiler/languageCuts.test.ts`, in the `Phase 3A permission neighbors` describe:

```ts
  // Phase 3B reserves these as expression operators. They were ordinary
  // identifiers until this phase; the roadmap authority is 8.1 and the
  // grammar is settled in the Phase 3B design, section 6.1.
  it.each(["if", "then", "else", "and", "or", "not", "sin", "cos", "length", "in"])(
    "reserves expression word '%s' so it cannot be an object name",
    (word) => {
      const source = `scene { size: (10, 10) circle ${word} { position: (0, 0), radius: 5 } }`;
      const diags = diagnosticsFor(source);
      expect(diags).toHaveLength(1);
      expect(diags[0].message).toContain("reserved");
    },
  );

  it("still allows 'to' as a property name, because animate declares one", () => {
    const source = `
      scene {
        size: (100, 100)
        circle c {
          position: (0, 0)
          radius: 10
          animate { property: position, to: (10, 10), duration: 1 }
        }
      }
    `;
    expect(messagesFor(source)).toEqual([]);
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/compiler/lexer/lexer.test.ts src/compiler/languageCuts.test.ts`
Expected: FAIL — the words lex as `IDENT` today.

- [ ] **Step 3: Add the token type and the word set**

`src/compiler/types.ts`: add `| "EXPR_KEYWORD"` to `TokenType`.

`src/compiler/lexer/constants.ts`:

```ts
/**
 * Words that are operators in the expression grammar, not block names.
 *
 * Deliberately separate from KEYWORDS: KEYWORDS is `Object.keys(LANGUAGE_CONTRACT)`
 * plus the macro keywords and means "names a block", and parseValue reports any
 * KEYWORD found in value position as "is an object keyword and cannot be used as
 * a property value" (parser/parseValue.ts:208-210) — false for 'if'.
 *
 * 'to' is reserved here and is *also* legal as a property name, because
 * `animate { to: ... }` exists. That works because property names are consumed
 * positionally by consumePropertyName (parser/parseProperty.ts:5-16), and the
 * gates at parseObject.ts:281 and parseUse.ts:73 admit EXPR_KEYWORD for exactly
 * the reason they already admit FIT, NAMED_COLOR, BOOLEAN and EASING.
 */
export const EXPRESSION_WORDS = new Set<string>([
  "in", "to", "if", "then", "else", "and", "or", "not", "sin", "cos", "length",
]);
```

- [ ] **Step 4: Lex them**

In `src/compiler/lexer/handlers.ts`, import `EXPRESSION_WORDS` and add a branch to `handleWord` immediately after the `KEYWORDS.has(word)` branch at `:86-87`:

```ts
  } else if (EXPRESSION_WORDS.has(word)) {
    state.push("EXPR_KEYWORD", word, length);
```

- [ ] **Step 5: Describe it and admit it where property names are read**

`src/compiler/parser/state.ts`, in `describeToken`:

```ts
    case "EXPR_KEYWORD": return `reserved word '${t.value as string}'`;
```

`src/compiler/parser/parseObject.ts:281` and `src/compiler/parser/parseUse.ts:73` — add `EXPR_KEYWORD` to each gate:

```ts
      if (peekType === "IDENT" || peekType === "FIT" || peekType === "NAMED_COLOR" || peekType === "BOOLEAN" || peekType === "EASING" || peekType === "EXPR_KEYWORD") {
```

- [ ] **Step 6: Reject them as object and binding names**

`src/compiler/parser/parseObject.ts:160-178` rejects a non-`IDENT` where a name is expected, so `circle if { }` already fails — but with a message that does not say "reserved". Add a hint beside the existing ones at `:163-166`:

```ts
      else if (bad.type === "EXPR_KEYWORD") hint = ` '${bad.value}' is a reserved expression word.`;
```

`parseBinding` (`parser/parseBinding.ts:7-10`) already requires `IDENT` after `let`, so `let sin = 5` fails there. Confirm its message and, if it does not contain "reserved", extend it the same way rather than changing the test.

- [ ] **Step 7: Update the three cuts cases whose position changed**

The trig cases at `languageCuts.test.ts:163-176` and the conditional case at `:234-242` currently assert `Undefined variable 'sin'` / `'if'`. Those words no longer reach the undefined-variable path. Run the tests, read the real messages, and assert them — these are still rejections, just differently worded.

Delete `if`, `sin` and `cos` from the identifier-permission list at `:340-353`; `function import fetch while plugin world` stay.

- [ ] **Step 8: Run everything**

Run: `npm test && npx tsc -b --noEmit`
Expected: pass.

- [ ] **Step 9: Verify the corpora are still untouched**

```bash
npx vitest run --config eval/vitest.config.ts
EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts
git diff --stat -- eval/          # content check, NOT git status — see Global Constraint 8
```
Expected: 20/20 both, empty `git status`. If a scene now fails, a first-party file *did* use a reserved word and the §6.2 verification was wrong — report it rather than renaming quietly.

- [ ] **Step 10: Commit**

```bash
git add src/compiler/types.ts src/compiler/lexer src/compiler/parser src/compiler/languageCuts.test.ts
git commit -m "feat(lexer): reserve the expression words as EXPR_KEYWORD

in to if then else and or not sin cos length. Kept out of KEYWORDS,
which means 'names a block' and drives a diagnostic that would be false
for 'if'. 'to' stays legal as a property name because animate declares
one — property names are consumed positionally, so the gates at
parseObject.ts:281 and parseUse.ts:73 admit the new class alongside FIT,
NAMED_COLOR, BOOLEAN and EASING.

languageCuts drops its identifier-permission cases for if/sin/cos: they
were permissions under Phase 3A and are reservations from here."
```

---

## Task 4: One list kind — fold `pointList` into `list`

**Files:**
- Modify: `src/compiler/types.ts:72-79`, `:127-137`
- Modify: `src/compiler/languageContract.ts:2-4`, `:8-14`, `:199-205`, `:211-217`, `:384-395`
- Modify: `src/compiler/typeChecker/validator.ts:109-118`
- Modify: `src/compiler/typeChecker/resolvers.ts:1`, `:166-169`
- Modify: `src/compiler/parser/parseExpr.ts` (`parseListLiteral`)
- Modify: `src/components/Editor/MonacoEditor/scanner.ts:130`
- Test: `src/compiler/languageContract.test.ts`, `src/compiler/languageCuts.test.ts:179-187`

`sceneIR.ts` is **not** touched. `IRPointList` stays; lists are erased at parse time.

- [ ] **Step 1: Write the failing tests**

Append to `src/compiler/languageContract.test.ts`:

```ts
describe("one list kind (Phase 3B)", () => {
  it("declares points as a list constrained to point elements", () => {
    expect(LANGUAGE_CONTRACT.polygon.properties.points.kinds).toBe("list");
    expect(LANGUAGE_CONTRACT.polygon.properties.points.constraint)
      .toEqual({ kind: "listOf", element: "point", min: 3, max: 10000 });
    expect(LANGUAGE_CONTRACT.line.properties.points.constraint)
      .toEqual({ kind: "listOf", element: "point", min: 2, max: 10000 });
  });

  it("labels the list kind", () => {
    expect(KIND_LABEL.list).toBe("a list [a, b, c]");
  });
});
```

Append to `src/compiler/languageCuts.test.ts`, replacing the bare-number-list rejection at `:179-187` with a permission (it is a lifted cut — roadmap §8.1):

```ts
  it("allows a bare number list, which Phase 3B lifts", () => {
    expect(messagesFor(`let nums = [1,2,3] scene { size:(10,10) }`)).toEqual([]);
  });

  it("still rejects a non-point element on 'points', now from the contract", () => {
    const source = `scene { size:(100,100) polygon p { position:(0,0), points: [(0,0), 5, (5,10)] } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("element 1");
    expect(diags[0].message).toContain("a list of a point (x, y) values");
    const pos = posAt(source, "5,");
    expect(diags[0].line).toBe(pos.line);
    expect(diags[0].col).toBe(pos.col);
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/compiler/languageContract.test.ts src/compiler/languageCuts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Replace the value type**

`src/compiler/types.ts` — replace `PointListValue` at `:72-79`:

```ts
export interface ListValue {
  readonly kind: "list";
  readonly value: ReadonlyArray<AstValue>;
  readonly line: number;
  readonly col: number;
  readonly endLine: number;
  readonly endCol: number;
}
```

and in the `AstValue` union at `:127-137`, replace `| PointListValue` with `| ListValue`.

- [ ] **Step 4: Update the contract**

`src/compiler/languageContract.ts`:

- `ValueKind` at `:2-4`: `"pointList"` → `"list"`.
- `LocalConstraint` at `:8-14`: replace the `pointCount` member with

```ts
  | Readonly<{ kind: "listOf"; element: ValueKind; min: number; max: number }>
```

- `polygon.points` at `:199-205`: `"pointList"` → `"list"`, and `{ kind: "pointCount", min: 3, max: 10000 }` → `{ kind: "listOf", element: "point", min: 3, max: 10000 }`.
- `line.points` at `:211-217`: same, `min: 2`.
- `KIND_LABEL` at `:384-395`: `pointList: "a point list [(x,y), ...]"` → `list: "a list [a, b, c]"`.

`KIND_LABEL` is a total `Record<ValueKind, string>`, so the typecheck fails until this is done — that tripwire is intended.

- [ ] **Step 5: Handle the constraint in the validator**

`src/compiler/typeChecker/validator.ts` — replace the `pointCount` case at `:109-118`:

```ts
    case "listOf":
      if (val.kind === "list") {
        const badIdx = val.value.findIndex((el) => el.kind !== constraint.element);
        if (badIdx !== -1) {
          const el = val.value[badIdx];
          return {
            phase: "TYPE",
            message: `${label}: '${key}' expects a list of ${KIND_LABEL[constraint.element]} values, but element ${badIdx} is ${KIND_LABEL[el.kind]}.`,
            line: el.line, col: el.col, endLine: el.endLine, endCol: el.endCol,
          };
        }
        if (val.value.length < constraint.min) {
          return error(`${label}: '${typeName}' requires at least ${constraint.min} points.`);
        }
        if (val.value.length > constraint.max) {
          return error(`[TYPE_POLYGON_TOO_LARGE] ${label}: '${typeName}' exceeds the maximum safe limit of ${formatPointCount(constraint.max)} points.`);
        }
      }
      return undefined;
```

The two count messages are unchanged strings — existing tests pin them. The element check runs first because it is the more informative diagnostic when both apply.

- [ ] **Step 6: Narrow the list when building IR**

`src/compiler/typeChecker/resolvers.ts` — change the import at `:1` from `PointListValue` to `ListValue`, and replace `getReqPointList` at `:166-169`:

```ts
export function getReqPointList(props: Record<string, AstValue>, key: string): IRPointList {
  const v = props[key];
  if (v === undefined || v.kind !== "list") {
    throw new Error(`[IR] Required point list '${key}' is missing or is not a list.`);
  }
  return (v as ListValue).value.map((el) => {
    if (el.kind !== "point") {
      throw new Error(`[IR] Point list '${key}' contains a '${el.kind}' element; the validator should have rejected this.`);
    }
    return { x: el.x, y: el.y };
  });
}
```

- [ ] **Step 7: Generalise the list literal in the parser**

In `src/compiler/parser/parseExpr.ts`, `parseListLiteral` currently requires each entry to be `LPAREN`-led and builds `{x, y}` pairs. Replace its body so each entry is a general `parseExpr` call, collect the `AstValue`s, and return `{ kind: "list", value: entries, ... }`. Keep the unterminated-list error at `parser/parseValue.ts:118-120` verbatim, adjusting only the words "point list" → "list". The per-entry *"Each entry in a point list must be a point"* error is deleted — that rule now lives in the contract.

**Handoff note from Task 2, which you must resolve deliberately.** Task 2 established that a *coordinate* expression resets the depth budget to `0` (matching the pre-refactor parser at `de9bf39:parseValue.ts:128,130,166,168`), while a *grouped* expression inherits `depth + 1`. Because every list entry was a coordinate, `parseListLiteral` ended up with no use for its `depth` parameter and Task 2 dropped it — `noUnusedParameters` is on. Generalising list entries to arbitrary expressions changes that: a list entry is no longer necessarily a coordinate, so you must decide and record which rule a general entry follows, and re-add the parameter if it needs one. Getting this wrong is invisible to the suite except through Task 2's `parseExpr.test.ts` depth tests — read them first. **Do not "tidy up" the `depth + 1` at the grouped-expression site; it is deliberate and carries a comment saying so.**

- [ ] **Step 8: Update the Monaco binding scanner**

`src/components/Editor/MonacoEditor/scanner.ts:130` records a binding's kind as the string `"pointList"` when it sees `[`. Change it to `"list"` and follow the value through to wherever the scanner consumes it — grep for `pointList` in `src/components/` and fix every hit.

- [ ] **Step 9: Run everything**

Run: `npm test && npx tsc -b --noEmit && npm run build`
Expected: pass.

- [ ] **Step 10: Verify the corpora and goldens did not move**

```bash
npx vitest run --config eval/vitest.config.ts
EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts
git diff --stat -- eval/ src/compiler/__snapshots__/   # content check, NOT git status
```
Expected: 20/20 both, empty `git status`. A moved snapshot here is a defect — the IR shape did not change.

- [ ] **Step 11: Commit**

```bash
git add src/compiler src/components/Editor/MonacoEditor/scanner.ts
git commit -m "feat(contract): one list kind, replacing pointList

[...] is now a list of values, and polygon/line 'points' is a list
constrained to point elements by a new listOf LocalConstraint. Indexing
and length therefore work on point lists too, instead of every list
operation needing a second specification.

sceneIR.ts is untouched: the parser folds every expression to a literal,
so no list reaches the IR and IRPointList stays exactly as it was. The
non-point-element diagnostic moves from a parse error to a contract-
driven type error, which is where every other property-shape rule has
lived since Phase 3A."
```

---

## Task 5: Modulo, comparisons, and boolean combinators

**Files:**
- Modify: `src/compiler/parser/parseExpr.ts`
- Test: `src/compiler/parser/parseExpr.test.ts` (create), `src/compiler/languageCuts.test.ts`

Precedence (spec §4.2), higher binds tighter: `or` 1, `and` 2, comparisons 3 (non-associative), `to` 4, `+ -` 5, `* / %` 6. `not` is a unary prefix whose operand is parsed at minimum precedence 3, giving `not a == b` the reading `not (a == b)`.

- [ ] **Step 1: Write the failing tests**

Create `src/compiler/parser/parseExpr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lex } from "../lexer";
import { parse } from "./index";

/** Compiles a scene whose circle radius is `expr`, and returns the folded radius. */
function radiusOf(expr: string): number {
  const result = parse(lex(`scene { size:(100,100) circle c { position:(0,0), radius: ${expr} } }`));
  expect(result.errors).toEqual([]);
  const radius = result.ast!.children[0].props.radius;
  expect(radius.kind).toBe("number");
  return (radius as { value: number }).value;
}

/** Returns the diagnostics for a scene whose circle radius is `expr`. */
function errorsFor(expr: string): string[] {
  const result = parse(lex(`scene { size:(100,100) circle c { position:(0,0), radius: ${expr} } }`));
  return result.errors.map((e) => e.message);
}

describe("modulo", () => {
  it("computes a remainder", () => {
    expect(radiusOf("17 % 5")).toBe(2);
  });

  it("binds as tightly as multiplication", () => {
    expect(radiusOf("1 + 7 % 5")).toBe(3);
  });

  it("rejects modulo by zero rather than returning NaN", () => {
    expect(errorsFor("5 % 0").join()).toContain("Modulo by zero");
  });
});

describe("comparison and boolean operators", () => {
  it.each([
    ["1 == 1", true], ["1 == 2", false],
    ["1 != 2", true], ["1 != 1", false],
    ["1 < 2", true],  ["2 < 1", false],
    ["2 > 1", true],  ["1 > 2", false],
    ["1 <= 1", true], ["2 <= 1", false],
    ["1 >= 1", true], ["1 >= 2", false],
  ])("evaluates %s", (expr, expected) => {
    const result = parse(lex(`let b = ${expr} scene { size:(10,10) }`));
    expect(result.errors).toEqual([]);
    expect(result.env.b).toMatchObject({ kind: "boolean", value: expected });
  });

  it.each([
    ["true and false", false], ["true and true", true],
    ["false or true", true],   ["false or false", false],
    ["not false", true],       ["not true", false],
  ])("evaluates %s", (expr, expected) => {
    const result = parse(lex(`let b = ${expr} scene { size:(10,10) }`));
    expect(result.errors).toEqual([]);
    expect(result.env.b).toMatchObject({ kind: "boolean", value: expected });
  });

  it("reads 'not a == b' as 'not (a == b)'", () => {
    const result = parse(lex(`let b = not 1 == 2 scene { size:(10,10) }`));
    expect(result.errors).toEqual([]);
    expect(result.env.b).toMatchObject({ kind: "boolean", value: true });
  });

  it("compares equal kinds only, rejecting a number against a color", () => {
    expect(errorsFor("1 == red").join()).toContain("compares two values of the same kind");
  });

  it("rejects an ordering comparison on non-numbers", () => {
    expect(errorsFor("red < blue").join()).toContain("must be a number");
  });

  it("rejects a chained comparison rather than regrouping it", () => {
    expect(errorsFor("1 < 2 < 3").join()).toContain("cannot be chained");
  });

  it("rejects a non-boolean operand to 'and'", () => {
    expect(errorsFor("1 and true").join()).toContain("must be a boolean");
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/compiler/parser/parseExpr.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend `operatorOf` and the precedence table**

In `src/compiler/parser/parseExpr.ts`:

```ts
export function operatorOf(t: Token): string | null {
  switch (t.type) {
    case "PLUS":    return "+";
    case "MINUS":   return "-";
    case "STAR":    return "*";
    case "SLASH":   return "/";
    case "PERCENT": return "%";
    case "LT":      return "<";
    case "GT":      return ">";
    case "LT_EQ":   return "<=";
    case "GT_EQ":   return ">=";
    case "EQ_EQ":   return "==";
    case "BANG_EQ": return "!=";
    case "EXPR_KEYWORD":
      return t.value === "and" || t.value === "or" ? (t.value as string) : null;
    default:        return null;
  }
}

const PRECEDENCE: Readonly<Record<string, number>> = {
  or: 1,
  and: 2,
  "==": 3, "!=": 3, "<": 3, ">": 3, "<=": 3, ">=": 3,
  "+": 5, "-": 5,
  "*": 6, "/": 6, "%": 6,
};

/** Operators that may not chain: `a < b < c` is an error, not a regrouping. */
const NON_ASSOCIATIVE = new Set(["==", "!=", "<", ">", "<=", ">="]);
```

- [ ] **Step 4: Extend `applyBinary`**

Replace `applyBinary` so numeric, ordering, equality and boolean operators are handled separately, and `requireNumber` is used only where a number is genuinely required:

```ts
const NUMERIC_OPS = new Set(["+", "-", "*", "/", "%"]);
const ORDERING_OPS = new Set(["<", ">", "<=", ">="]);
const EQUALITY_OPS = new Set(["==", "!="]);
const COMPARABLE_KINDS = new Set(["number", "string", "boolean", "color"]);

function equalValues(a: AstValue, b: AstValue): boolean {
  if (a.kind === "point" && b.kind === "point") return a.x === b.x && a.y === b.y;
  return (a as { value?: unknown }).value === (b as { value?: unknown }).value;
}

function applyBinary(state, op, left, right, opTok): AstValue {
  const at = span(left, right);

  if (NUMERIC_OPS.has(op)) {
    const l = requireNumber(state, left, op, "left", opTok);
    const r = requireNumber(state, right, op, "right", opTok);
    if ((op === "/" || op === "%") && r === 0) {
      state.throwError(
        `In ${state.currentContext}: ${op === "/" ? "Division" : "Modulo"} by zero.`,
        opTok,
      );
    }
    const value =
      op === "+" ? l + r :
      op === "-" ? l - r :
      op === "*" ? l * r :
      op === "/" ? l / r :
                   l % r;
    return { kind: "number", value, ...at };
  }

  if (ORDERING_OPS.has(op)) {
    const l = requireNumber(state, left, op, "left", opTok);
    const r = requireNumber(state, right, op, "right", opTok);
    const value = op === "<" ? l < r : op === ">" ? l > r : op === "<=" ? l <= r : l >= r;
    return { kind: "boolean", value, ...at };
  }

  if (EQUALITY_OPS.has(op)) {
    if (left.kind !== right.kind) {
      state.throwError(
        `In ${state.currentContext}: '${op}' compares two values of the same kind, but got ${left.kind} and ${right.kind}. Comparing different kinds is an error rather than always false, so a mismatch is visible instead of silently rendering the wrong thing.`,
        opTok,
      );
    }
    if (!COMPARABLE_KINDS.has(left.kind)) {
      state.throwError(
        `In ${state.currentContext}: '${op}' cannot compare ${left.kind} values. Comparable kinds are number, string, boolean and color.`,
        opTok,
      );
    }
    const eq = equalValues(left, right);
    return { kind: "boolean", value: op === "==" ? eq : !eq, ...at };
  }

  if (op === "and" || op === "or") {
    const l = requireBoolean(state, left, op, "left", opTok);
    const r = requireBoolean(state, right, op, "right", opTok);
    return { kind: "boolean", value: op === "and" ? l && r : l || r, ...at };
  }

  state.throwError(`In ${state.currentContext}: Unknown operator '${op}'.`, opTok);
}
```

Add `requireBoolean` beside `requireNumber`, with the message `The ${side} operand of '${op}' must be a boolean, but got ${v.kind}. Declare has no truthiness — write an explicit comparison.` Both helpers take `opTok` and report at the operator, not at `state.peek()`, so the position is stable.

- [ ] **Step 5: Enforce non-associativity and add `not`**

In `parseExpr`'s loop, after computing `left = applyBinary(...)`:

```ts
    if (NON_ASSOCIATIVE.has(op)) {
      const next = operatorOf(state.peek());
      if (next !== null && PRECEDENCE[next] === prec) {
        state.throwError(
          `In ${state.currentContext}: Comparisons cannot be chained. Write 'a ${op} b and b ${next} c' instead of 'a ${op} b ${next} c'.`,
          state.peek(),
        );
      }
    }
```

In `parsePrimary`, before the `MINUS` branch:

```ts
  if (t.type === "EXPR_KEYWORD" && t.value === "not") {
    const notTok = state.consume();
    const operand = parseExpr(state, 2, depth + 1);
    if (operand.kind !== "boolean") {
      state.throwError(`In ${state.currentContext}: 'not' requires a boolean, but got ${operand.kind}.`, notTok);
    }
    return { kind: "boolean", value: !operand.value, line: notTok.line, col: notTok.col, endLine: operand.endLine, endCol: operand.endCol };
  }
```

Parsing the operand at minimum precedence 2 lets comparisons (precedence 3) bind inside `not` while `and`/`or` (1 and 2) stay outside it.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/compiler/parser/parseExpr.test.ts && npm test && npx tsc -b --noEmit`
Expected: pass. The `%`, `<` and `==` cases in `languageCuts.test.ts` now fail — they are lifted cuts. Convert each into a permission case with a comment naming roadmap §8.1 and the Phase 3B design §4.1 as authority, mirroring the style of the existing permission cases at `:245-335`.

- [ ] **Step 7: Verify the corpora**

```bash
npx vitest run --config eval/vitest.config.ts
EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts
git diff --stat -- eval/          # content check, NOT git status — see Global Constraint 8
```
Expected: 20/20 both, empty output.

- [ ] **Step 8: Commit**

```bash
git add src/compiler/parser src/compiler/languageCuts.test.ts
git commit -m "feat(parser): modulo, comparisons, and boolean combinators

% == != < > <= >= and or not. Mixed-kind equality is an error rather than
always-false, so a mismatch is visible instead of silently rendering the
wrong thing; ordering is numbers only; there is no truthiness. Chained
comparisons are rejected rather than regrouped.

Lifts three roadmap cuts. Their languageCuts cases invert from rejections
to permissions, each citing roadmap 8.1."
```

---

## Task 6: The conditional value expression

**Files:**
- Modify: `src/compiler/parser/parseExpr.ts`
- Test: `src/compiler/parser/parseExpr.test.ts`, `src/compiler/languageCuts.test.ts`

`if C then A else B` is the loosest construct and is right-associative, so `if a then x else if b then y else z` chains through the else branch. Spec §4.3 requires `C` boolean and **`A` and `B` the same kind**.

- [ ] **Step 1: Write the failing tests**

Append to `src/compiler/parser/parseExpr.test.ts`:

```ts
describe("conditional value expression", () => {
  it("takes the then branch", () => {
    expect(radiusOf("if 1 == 1 then 10 else 20")).toBe(10);
  });

  it("takes the else branch", () => {
    expect(radiusOf("if 1 == 2 then 10 else 20")).toBe(20);
  });

  it("chains through the else branch", () => {
    expect(radiusOf("if false then 1 else if true then 2 else 3")).toBe(2);
  });

  it("carries a non-numeric kind through", () => {
    const result = parse(lex(`let c = if true then red else blue scene { size:(10,10) }`));
    expect(result.errors).toEqual([]);
    expect(result.env.c).toMatchObject({ kind: "color", value: "#ff0000" });
  });

  it("requires a boolean condition", () => {
    expect(errorsFor("if 1 then 2 else 3").join()).toContain("condition must be a boolean");
  });

  it("requires both branches to be the same kind", () => {
    expect(errorsFor("if true then 5 else red").join()).toContain("same kind");
  });

  it("reports the mismatch even when the taken branch is valid on its own", () => {
    // The condition is true, so a naive implementation returns 5 and never
    // looks at the else branch — making a value's kind data-dependent.
    expect(errorsFor("if true then 5 else red")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/compiler/parser/parseExpr.test.ts -t conditional`
Expected: FAIL.

- [ ] **Step 3: Implement it**

At the top of `parseExpr`, before `parsePrimary` is called:

```ts
  if (state.peek().type === "EXPR_KEYWORD" && state.peek().value === "if") {
    return parseConditional(state, depth);
  }
```

and:

```ts
function expectWord(state: ParserState, word: string, after: string): Token {
  const t = state.peek();
  if (t.type !== "EXPR_KEYWORD" || t.value !== word) {
    state.throwError(
      `In ${state.currentContext}: Expected '${word}' after ${after}, but found ${describeToken(t)}.`,
      t,
    );
  }
  return state.consume();
}

function parseConditional(state: ParserState, depth: number): AstValue {
  if (depth > MAX_EXPR_DEPTH) {
    state.throwError(`In ${state.currentContext}: Expression is too deeply nested. Maximum depth is ${MAX_EXPR_DEPTH}.`, state.peek());
  }
  const ifTok = state.consume();

  const condition = parseExpr(state, 0, depth + 1);
  if (condition.kind !== "boolean") {
    state.throwError(
      `In ${state.currentContext}: An 'if' condition must be a boolean, but got ${condition.kind}. Declare has no truthiness — write an explicit comparison such as 'i % 5 == 0'.`,
      ifTok,
    );
  }

  expectWord(state, "then", "the 'if' condition");
  const whenTrue = parseExpr(state, 0, depth + 1);

  expectWord(state, "else", "the 'then' value");
  const whenFalse = parseExpr(state, 0, depth + 1);

  // Both branches are evaluated and kind-checked even though only one is
  // taken. Skipping the untaken branch would make a value's kind depend on
  // data, which is exactly what the design's section 2 line forbids.
  if (whenTrue.kind !== whenFalse.kind) {
    state.throwError(
      `In ${state.currentContext}: Both branches of an 'if' must be the same kind, but 'then' is ${whenTrue.kind} and 'else' is ${whenFalse.kind}.`,
      ifTok,
    );
  }

  const chosen = condition.value ? whenTrue : whenFalse;
  return { ...chosen, line: ifTok.line, col: ifTok.col, endLine: whenFalse.endLine, endCol: whenFalse.endCol };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/compiler/parser/parseExpr.test.ts && npm test && npx tsc -b --noEmit`
Expected: pass, except the conditional cut at `languageCuts.test.ts:234-242`.

- [ ] **Step 5: Invert the lifted cut**

Replace that case with a permission, citing roadmap §8.1 and R4:

```ts
  // Lifted by Phase 3B (roadmap 8.1, R4: "'every fifth item differs' requires
  // a decision as well as a remainder"). The conditional lives in *value*
  // position only — the emission-guard form is rejected below.
  it("allows an inline conditional value", () => {
    const source = `scene { size:(10,10) circle c { position:(0,0), radius: if true then 1 else 2 } }`;
    expect(messagesFor(source)).toEqual([]);
  });
```

- [ ] **Step 6: Commit**

```bash
git add src/compiler/parser src/compiler/languageCuts.test.ts
git commit -m "feat(parser): if/then/else as a value expression

Right-associative, so 'else if' chains. The condition must be boolean and
both branches must be the same kind — the untaken branch is kind-checked
too, because skipping it would make a value's kind depend on data, which
is the one place the design's section 2 line is easiest to cross by
accident.

Lifts the conditional cut (roadmap 8.1, R4)."
```

---

## Task 7: Indexing and `length`

**Files:**
- Modify: `src/compiler/parser/parseExpr.ts`
- Test: `src/compiler/parser/parseExpr.test.ts`, `src/compiler/languageCuts.test.ts`
  (the `describe("Phase 3B: one list kind; indexing still excluded")` block)

**Preconditions, read off `77f9297` rather than off this plan.** Tasks 1–6 changed
the shapes these steps used to name; what follows is what is actually there.

- `parseExpr(state, minPrec, ctx: ExprCtx)`, and every helper takes `(state, ctx)`.
  **Never build a context inline.** Use a named transition — `intoGroup`,
  `intoCoordinate`, `intoOperand`, `intoUnary`. `ROOT_CTX` is the entry value.
- `length` is already an `EXPR_KEYWORD` (Task 3 reserved all eleven words). This
  task adds *handling*; there is no lexer work.
- `parseExpr.test.ts` helpers are `foldOf`, `bindingOf`, `diagnosticsForExpr`,
  `diagnosticsFor`, `posAt`. There is no `errorsFor` and no `radiusOf`.
  `languageCuts.test.ts` has `messagesFor`, `diagnosticsFor`, `posAt`.

**The decision this task makes, which nothing else will pin.** Design §4.2 puts
postfix `[…]` at level 10 and unary `-` at 9, so `-v[0]` means `-(v[0])`. The
unary-minus branch in `parsePrimary` currently calls `parsePrimary` directly
(`parseExpr.ts:575`); it must call the postfix wrapper instead, or `-v[0]` tries
to negate a list. Both readings compile a suite that never writes `-v[0]`, so
write the test that tells them apart — this is exactly the shape AGENT-LESSONS
§2d names.

- [ ] **Step 1: Write the failing tests**

```ts
describe("indexing and length", () => {
  it("reads an element by index", () => {
    expect(foldOf("[3,7,2][1]")).toMatchObject({ kind: "number", value: 7 });
  });

  it("indexes a point list, which is the same list kind", () => {
    expect(foldOf("[(1,2),(3,4)][0]")).toMatchObject({ kind: "point", x: 1, y: 2 });
  });

  it("chains through nested lists", () => {
    expect(foldOf("[[1,2],[3,4]][1][0]")).toMatchObject({ kind: "number", value: 3 });
  });

  it("indexes a name bound with 'let'", () => {
    const parsed = parse(lex(`let v = [3,7,2]\nlet x = v[1]\nscene { size: (100, 100) }`));
    expect(parsed.errors).toEqual([]);
    expect(parsed.env.x).toMatchObject({ kind: "number", value: 7 });
  });

  it("reports length", () => {
    expect(foldOf("length([3,7,2])")).toMatchObject({ kind: "number", value: 3 });
  });

  // Design 4.2: postfix binds tighter than unary '-'. If the minus branch calls
  // parsePrimary instead of parsePostfix this reads as -( [1,2] ) and errors.
  it("binds tighter than unary minus, so '-v[0]' negates the element", () => {
    expect(foldOf("-[5,9][1]")).toMatchObject({ kind: "number", value: -9 });
  });

  // The index is a full expression, and it is a *group*: it does not reset the
  // expression budget the way a point coordinate does.
  it("takes a whole expression as the index", () => {
    expect(foldOf("[10,20,30][1 + 1]")).toMatchObject({ kind: "number", value: 30 });
  });

  it("rejects an out-of-range index, naming the index and the length", () => {
    const msg = diagnosticsForExpr("[1,2][5]")[0].message;
    expect(msg).toContain("index 5");
    expect(msg).toContain("length 2");
  });

  it("rejects a non-integer index", () => {
    expect(diagnosticsForExpr("[1,2][0.5]")[0].message).toContain("whole number");
  });

  it("rejects a negative index rather than wrapping", () => {
    const msg = diagnosticsForExpr("[1,2][-1]")[0].message;
    expect(msg).toContain("index -1");
  });

  it("rejects indexing a non-list, naming the kind", () => {
    expect(diagnosticsForExpr("5[0]")[0].message).toContain("only a list can be indexed");
  });

  it("rejects length of a non-list, naming the kind", () => {
    expect(diagnosticsForExpr("length(5)")[0].message).toContain("'length' requires a list");
  });

  it("anchors an out-of-range index at the '[', not at the end of the expression", () => {
    const source = bindingOf("[1,2][5]");
    const diags = diagnosticsFor(source);
    expect(diags[0]).toMatchObject(posAt(source, "["));
  });
});
```

The last one is not decoration. Task 2's `requireNumber` regression anchored an
error at `state.peek()` — the token *after* the whole expression — and reported
on the next line's property. Anchor on the opening bracket and pin it.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/compiler/parser/parseExpr.test.ts -t "indexing and length"`
Expected: FAIL, every case.

- [ ] **Step 3: Add `parsePostfix` and the `length` primary**

`parsePostfix` wraps a primary and consumes index brackets in a loop:

```ts
/**
 * `l[i]`, chainable as `grid[r][c]` (design 4.2, level 10).
 *
 * A loop rather than recursion, so a chain costs no stack: `ctx` is not
 * advanced between links, and `v[0][0][0]…` is bounded by source length alone.
 * Only the index *expression* is a new level, and it takes `intoGroup` — the
 * bracket is a grouping construct exactly as `(` is, and like a list entry it
 * does not reset the expression budget the way a point coordinate does.
 */
function parsePostfix(state: ParserState, ctx: ExprCtx): AstValue {
  let value = parsePrimary(state, ctx);

  while (state.peek().type === "LBRACKET") {
    const openTok = state.consume("LBRACKET");
    const index = parseExpr(state, 0, intoGroup(ctx));

    if (state.peek().type !== "RBRACKET") {
      state.throwError(
        `In ${state.currentContext}: Expected ']' to close the index opened at line ${openTok.line}, column ${openTok.col}, but found ${describeToken(state.peek())}.`,
        state.peek(),
      );
    }
    const closeTok = state.consume("RBRACKET");

    // Every rejection anchors on `openTok`. `state.peek()` is by now the token
    // after the whole index and reports on the following property — the Task 2
    // diagnostic regression, which is pinned above.
    if (value.kind !== "list") {
      state.throwError(`In ${state.currentContext}: Cannot index a ${value.kind} — only a list can be indexed.`, openTok);
    }
    if (index.kind !== "number") {
      state.throwError(`In ${state.currentContext}: A list index must be a number, but got ${index.kind}.`, openTok);
    }
    if (!Number.isInteger(index.value)) {
      state.throwError(`In ${state.currentContext}: A list index must be a whole number, but got ${index.value}.`, openTok);
    }
    if (index.value < 0 || index.value >= value.value.length) {
      state.throwError(`In ${state.currentContext}: Index ${index.value} is out of range for a list of length ${value.value.length}. Valid indices run 0 to ${value.value.length - 1}; there is no negative indexing and no wrap-around.`, openTok);
    }

    // The element keeps its own kind but takes the span of the whole index
    // expression, so a later error about it points at `v[2]` and not at
    // wherever the list literal was written.
    value = { ...value.value[index.value], line: value.line, col: value.col, endLine: closeTok.line, endCol: closeTok.endCol };
  }

  return value;
}
```

Then redirect the two call sites that mean "a primary and its postfixes":

1. `parseExpr`'s `let left = parsePrimary(state, ctx)` → `parsePostfix(state, ctx)`.
2. `parsePrimary`'s unary-minus branch, `parsePrimary(state, intoUnary(ctx))` →
   `parsePostfix(state, intoUnary(ctx))`. This is the `-v[0]` decision above.

`not`'s operand is already `parseExpr(state, NOT_OPERAND_MIN_PREC, intoUnary(ctx))`
and reaches postfix through it — leave it alone.

In `parsePrimary`, add the `length` call beside the `not` branch:

```ts
  if (t.type === "EXPR_KEYWORD" && t.value === "length") {
    const nameTok = state.consume();
    if (state.peek().type !== "LPAREN") {
      state.throwError(`In ${state.currentContext}: 'length' is a function and needs parentheses — write 'length(values)'.`, state.peek());
    }
    state.consume("LPAREN");
    const arg = parseExpr(state, 0, intoGroup(ctx));
    const closeTok = state.consume("RPAREN");
    if (arg.kind !== "list") {
      state.throwError(`In ${state.currentContext}: 'length' requires a list, but got ${arg.kind}.`, nameTok);
    }
    return { kind: "number", value: arg.value.length, line: nameTok.line, col: nameTok.col, endLine: closeTok.line, endCol: closeTok.endCol };
  }
```

- [ ] **Step 4: Verify the decisions, not just the behaviour**

Run: `npx vitest run src/compiler/parser/parseExpr.test.ts && npm test && npx tsc -b --noEmit`

Then, per AGENT-LESSONS §2c, delete-and-run each of these separately and report
the real output. Anything still green is unguarded:

1. The `parsePostfix` call in the unary-minus branch, reverted to `parsePrimary`.
   Expect the `-v[0]` case to fail. If it does not, that test is not pinning it.
2. The `index.value < 0` half of the range check. Expect the negative-index case
   to fail on its own.
3. The `Number.isInteger` check.
4. `intoGroup(ctx)` in the index expression, swapped for a bare `ctx`. If nothing
   fails, the index expression's budget is unpinned — add a nesting case rather
   than leaving it.

- [ ] **Step 5: Invert the lifted cut**

The indexing cut in `languageCuts.test.ts` now fails. Replace it with a
permission citing roadmap §8.1 and design §11 deviation 2 — indexing ships
*alongside* direct iteration, for parallel lists:

```ts
  it("allows indexing, which Phase 3B lifts for parallel lists", () => {
    expect(messagesFor(`let pts = [(0,0),(1,1)] let first = pts[0] scene { size:(10,10) }`)).toEqual([]);
  });
```

- [ ] **Step 6: Commit**

```bash
git add src/compiler/parser src/compiler/languageCuts.test.ts
git commit -m "feat(parser): list indexing and length

Postfix [i] chains, so nested lists work, and binds tighter than unary
'-' per design 4.2 — '-v[0]' negates the element. Out-of-range,
non-integer and negative indices are compile errors naming the index and
the length; there is no wrap-around. Every rejection anchors on the '[',
not on the token after the index.

Ships alongside direct iteration rather than instead of it (design
section 11, deviation 2) because parallel lists — values with labels —
need it."
```

---

## Task 8: `sin` and `cos`, in degrees

**Files:**
- Modify: `src/compiler/parser/parseExpr.ts`
- Test: `src/compiler/parser/parseExpr.test.ts`, `src/compiler/languageCuts.test.ts`
  (the trig cuts)

Degrees, matching `rotation` — the only other angle in the language
(`languageContract.ts:111-117`). **No π constant**: design §11 deviation 1.

`sin` and `cos` are already `EXPR_KEYWORD`s from Task 3. Same precondition list
as Task 7: `(state, ctx)`, named transitions, real test helpers.

- [ ] **Step 1: Write the failing tests**

```ts
describe("trigonometry", () => {
  it.each([
    ["sin(0)", 0], ["sin(90)", 1], ["sin(180)", 0], ["sin(270)", -1],
    ["cos(0)", 1], ["cos(90)", 0], ["cos(180)", -1], ["cos(270)", 0],
  ])("evaluates %s in degrees", (expr, expected) => {
    expect(foldOf(expr)).toMatchObject({ kind: "number", value: expected });
  });

  // toMatchObject above is exact equality, which is the point: Math.sin(Math.PI)
  // is 1.2246e-17, and a naive radian conversion fails these four outright.
  it("returns exactly 0 and exactly 1 at the cardinal angles", () => {
    expect((foldOf("sin(180)") as { value: number }).value).toBe(0);
    expect((foldOf("cos(90)") as { value: number }).value).toBe(0);
  });

  it("reduces angles outside 0-360 before the cardinal check", () => {
    expect(foldOf("sin(-90)")).toMatchObject({ value: -1 });
    expect(foldOf("cos(720)")).toMatchObject({ value: 1 });
  });

  it("is still approximate off the cardinal angles", () => {
    expect((foldOf("sin(30)") as { value: number }).value).toBeCloseTo(0.5, 10);
  });

  it("places a dot on a circle without hand-computed coordinates", () => {
    // 180 * cos(0) = 180 exactly; the radial-dots case.
    expect(foldOf("400 + 180 * cos(0)")).toMatchObject({ value: 580 });
  });

  it("takes a whole expression as the argument", () => {
    expect(foldOf("sin(45 + 45)")).toMatchObject({ value: 1 });
  });

  it("rejects a non-numeric argument, naming the kind", () => {
    expect(diagnosticsForExpr("sin(red)")[0].message).toContain("requires a number");
  });

  it("has no pi constant", () => {
    expect(diagnosticsForExpr("sin(pi)")[0].message).toContain("Undefined variable 'pi'");
  });
});
```

The exactness cases matter beyond tidiness: `Math.sin(Math.PI)` is `1.22e-16`, so
a plain radian conversion puts every dot in a radial layout a fraction of a pixel
off and leaves float noise in the committed IR goldens Task 15 has to diff.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/compiler/parser/parseExpr.test.ts -t trigonometry`
Expected: FAIL.

- [ ] **Step 3: Implement with exact cardinal angles**

```ts
/**
 * sin/cos in degrees, exact at multiples of 90.
 *
 * Math.sin(Math.PI) is 1.2246e-16, not 0, so a plain radian conversion puts
 * every dot in a radial layout a fraction of a pixel off its true position and
 * makes committed IR goldens carry float noise. Reducing the angle modulo 360
 * and returning the exact value at the four cardinal angles avoids that, and
 * matches what an author writing `cos(180)` expects to see.
 *
 * The modulo is written twice so a negative input lands in [0, 360): plain
 * `-90 % 360` is `-90` in JavaScript, which would miss the `270` arm.
 */
function sinDegrees(deg: number): number {
  const d = ((deg % 360) + 360) % 360;
  if (d === 0) return 0;
  if (d === 90) return 1;
  if (d === 180) return 0;
  if (d === 270) return -1;
  return Math.sin((d * Math.PI) / 180);
}

/** cos(d) = sin(d + 90); the reduction inside `sinDegrees` handles the wrap. */
function cosDegrees(deg: number): number {
  return sinDegrees(deg + 90);
}
```

and one primary branch handling both, beside `length`:

```ts
  if (t.type === "EXPR_KEYWORD" && (t.value === "sin" || t.value === "cos")) {
    const nameTok = state.consume();
    const fn = nameTok.value as "sin" | "cos";
    if (state.peek().type !== "LPAREN") {
      state.throwError(`In ${state.currentContext}: '${fn}' is a function and needs parentheses — write '${fn}(45)'.`, state.peek());
    }
    state.consume("LPAREN");
    const arg = parseExpr(state, 0, intoGroup(ctx));
    const closeTok = state.consume("RPAREN");
    if (arg.kind !== "number") {
      state.throwError(`In ${state.currentContext}: '${fn}' requires a number of degrees, but got ${arg.kind}.`, nameTok);
    }
    return { kind: "number", value: fn === "sin" ? sinDegrees(arg.value) : cosDegrees(arg.value), line: nameTok.line, col: nameTok.col, endLine: closeTok.line, endCol: closeTok.endCol };
  }
```

- [ ] **Step 4: Verify the decisions**

Run: `npx vitest run src/compiler/parser/parseExpr.test.ts && npm test && npx tsc -b --noEmit`

Then, separately, and report the output of each:

1. Replace `sinDegrees`'s body with the bare `Math.sin((deg * Math.PI) / 180)`.
   Expect the cardinal cases to fail. If they pass, the exactness is unguarded
   and the goldens in Task 15 will carry noise nothing explains.
2. Delete the `((d % 360) + 360) % 360` correction, leaving `deg % 360`. Expect
   `sin(-90)` to fail.
3. Change `cosDegrees` to `sinDegrees(deg - 90)`. Expect the `cos` rows to fail.

- [ ] **Step 5: Invert the lifted cut**

Replace the trig rejections in `languageCuts.test.ts` with a permission plus a
retained cut for the constant:

```ts
  // Lifted by Phase 3B (roadmap 8.1, R5). Angles are in DEGREES, matching
  // `rotation` — the only other angle in the language.
  it.each(["sin(45)", "cos(45)"])("allows trig function '%s' in degrees", (expr) => {
    expect(messagesFor(`scene { size:(10,10) circle c { position:(0,0), radius: 100 + ${expr} } }`)).toEqual([]);
  });

  // Deliberately NOT shipped — design section 11, deviation 1. A pi constant
  // beside degree-based trig is a trap: sin(pi) would be 0.0548, not 0.
  it("has no pi constant", () => {
    const source = `scene { size:(10,10) circle c { position:(0,0), radius: sin(pi) } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("Undefined variable 'pi'");
  });
```

Those cuts currently assert `Undefined variable 'sin'`, which no longer reaches
that path (see the note at this plan's line 639). Run them, read the real
messages, and assert what they say.

- [ ] **Step 6: Commit**

```bash
git add src/compiler/parser src/compiler/languageCuts.test.ts
git commit -m "feat(parser): sin and cos in degrees

Degrees match rotation, the only other angle in the language, so Declare
has exactly one angle unit. No pi constant — a deliberate deviation from
roadmap 8.1, recorded in the design's section 11: sin(pi) would be
0.0548, not 0, which is a trap sitting next to the functions it looks
like it belongs to.

Cardinal angles return exact values. Math.sin(Math.PI) is 1.22e-16, which
would put every dot in a radial layout a fraction of a pixel off and leave
float noise in committed IR goldens.

Lifts the trig cut (roadmap 8.1, R5)."
```

---

## Task 9: The `A to B` range

**Files:**
- Modify: `src/compiler/parser/parseExpr.ts`, `src/compiler/parser/state.ts`
- Test: `src/compiler/parser/parseExpr.test.ts`

`to` sits at precedence 4 — between the comparisons (3) and additive (5) — so
`0 to count - 1` reads as `0 to (count - 1)`. It is non-associative. Level 4 was
left free in `OPERATORS` for exactly this.

### The blocking problem: `to` is also a property name

**Resolve this before writing any code.** `animate { to: … }` is a real property,
and property separators are *optional*: `parseObject.ts:295` consumes commas in a
`while` loop, so zero commas is well-formed. Every `animate` block in the
protected `eval/` corpus is written without them —

```declare
animate {
  property: alpha
  to: 0.0
  duration: 2.0
}
```

Once `to` has a row in `OPERATORS`, parsing the value of `property:` folds
`alpha`, then `parseExpr`'s loop peeks `to`, finds precedence 4 > 0, consumes it
as a range operator, and fails on the `:`. **That breaks every animate block in
`eval/`**, which is protected material.

The plan's earlier test for this — `animate { property: position, to: (10,10) }` —
passes anyway, because it was written *with* commas. It is a test shaped to its
fixture (AGENT-LESSONS §2a) and it would have shipped the break.

**Recommended resolution: one token of lookahead.** A `to` followed by `:` is a
property name, not an operator. `ParserState.peek()` takes no offset today, so add
one:

```ts
  peek(offset = 0): Token {
    return this.tokens[this.pos + offset] || this.tokens[this.tokens.length - 1];
  }
```

and break out of the operator loop before consuming:

```ts
    // `to` is both an operator and a legal property name, and property
    // separators are optional (`parseObject.ts:295` consumes commas in a
    // `while`), so in a comma-free `animate` block the token after a folded
    // value is the reserved word `to`. Without this the loop takes it as a
    // range operator and dies on the ':'. Every animate block in `eval/` is
    // written this way, so the cost of getting it wrong is the whole corpus.
    if (op.name === "to" && state.peek(1).type === "COLON") break;
```

This is a judgment call with a plausible alternative — parsing property values at
a minimum precedence above 4, which would instead forbid ranges in property
position. Per AGENT-LESSONS §2d, implement one, flip to the other, and confirm the
suite distinguishes them. If it does not, the test below is not doing its job.

- [ ] **Step 1: Write the failing tests**

```ts
describe("range", () => {
  it("builds an inclusive list of integers", () => {
    const r = foldOf("0 to 3") as { kind: string; value: Array<{ value: number }> };
    expect(r.kind).toBe("list");
    expect(r.value.map((v) => v.value)).toEqual([0, 1, 2, 3]);
  });

  it("binds looser than subtraction, so '0 to n - 1' is a range of n items", () => {
    const parsed = parse(lex(`let n = 12\nlet r = 0 to n - 1\nscene { size: (100, 100) }`));
    expect(parsed.errors).toEqual([]);
    expect((parsed.env.r as { value: unknown[] }).value).toHaveLength(12);
  });

  it("binds tighter than comparison, so '0 to 3 == x' compares the list", () => {
    // Precedence 4 sits below comparison at 3, so the range folds first and the
    // '==' then rejects a list operand. The diagnostic naming 'list' is what
    // distinguishes this from 'to' having been given precedence 2.
    expect(diagnosticsForExpr("0 to 3 == 1")[0].message).toContain("list");
  });

  it("yields the empty list when the end precedes the start", () => {
    expect((foldOf("5 to 1") as { value: unknown[] }).value).toHaveLength(0);
  });

  it("rejects non-integer bounds", () => {
    expect(diagnosticsForExpr("0 to 2.5")[0].message).toContain("whole numbers");
  });

  it("rejects a range longer than the list ceiling", () => {
    expect(diagnosticsForExpr("0 to 10001")[0].message).toContain("10,000");
  });

  it("applies the same ceiling to a list literal", () => {
    const literal = `[${Array.from({ length: 10001 }, (_, i) => i).join(",")}]`;
    expect(diagnosticsForExpr(literal)[0].message).toContain("10,000");
  });

  it("rejects a chained range rather than regrouping it", () => {
    expect(diagnosticsForExpr("0 to 3 to 5")[0].message).toContain("cannot be chained");
  });

  // The corpus shape. Commas between properties are optional and no .eval scene
  // uses them, so this — not the comma'd version — is what protects the corpus.
  it("still allows 'to' as a property name with no separating comma", () => {
    const src = `scene { size:(100,100)\n circle c { position:(0,0)\n radius:5\n animate {\n property: alpha\n to: 0.5\n duration: 1\n } } }`;
    expect(parse(lex(src)).errors).toEqual([]);
  });

  it("still allows 'to' as a property name with a comma", () => {
    const src = `scene { size:(100,100) circle c { position:(0,0), radius:5 animate { property: position, to: (10,10), duration: 1 } } }`;
    expect(parse(lex(src)).errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/compiler/parser/parseExpr.test.ts -t range`
Expected: FAIL.

- [ ] **Step 3: Implement**

There is no `operatorOf`, no `PRECEDENCE` and no `NON_ASSOCIATIVE` any more —
d02320b unified all three into `OPERATORS`, and `OperatorWord` narrows the word
half of the key space to the words that really are operators. So:

1. Widen the key type to admit the word:
   `type OperatorWord = Extract<ExpressionWord, "and" | "or" | "to">;`
2. Add one row: `to: { name: "to", prec: 4, assoc: "none" },`
3. Add `MAX_LIST_LENGTH` beside the depth budgets and enforce it in
   `parseListLiteral` as well as here — design §8 makes it one ceiling for
   literals and ranges alike, which is what lets `parseGenerate.ts:47-49`'s
   separate `end - start > 10000` check fold into it in Task 10:

```ts
/** Design 8: one ceiling for list literals and ranges alike. */
const MAX_LIST_LENGTH = 10000;
```

4. Add a `case` to `applyBinary`'s switch — not an `if` before it. The switch is
   exhaustive over `OperatorName` with no default, which is what makes a row
   without a handler fail the build; adding an early `if` would forfeit that.
   Note `requireNumber` takes four arguments, `(state, operand, op, side)`:

```ts
    case "to": {
      const from = requireNumber(state, left, op, "left");
      const until = requireNumber(state, right, op, "right");
      if (!Number.isInteger(from) || !Number.isInteger(until)) {
        state.throwError(`In ${state.currentContext}: Range bounds must be whole numbers, but got ${from} and ${until}.`, opTok);
      }
      // '5 to 1' is empty, not an error: it is the honest reading of an
      // inclusive range, and iterating it emits nothing.
      const count = Math.max(0, until - from + 1);
      if (count > MAX_LIST_LENGTH) {
        state.throwError(`In ${state.currentContext}: A range of ${count.toLocaleString("en-US")} values exceeds the maximum list length of ${MAX_LIST_LENGTH.toLocaleString("en-US")}.`, opTok);
      }
      const entries: AstValue[] = [];
      for (let n = from; n <= until; n++) entries.push({ kind: "number", value: n, ...at });
      return { kind: "list", value: entries, ...at };
    }
```

5. Apply the property-name lookahead from the section above.

6. Generalise the non-associativity message. The check at `parseExpr.ts:780-788`
   already covers `to` — it keys off `assoc === "none"` and equal precedence —
   but its text is comparison-specific and reads wrong for a range:

```ts
        state.throwError(
          `In ${state.currentContext}: '${op.name}' cannot be chained. Write 'a ${op.name} b and b ${next.name} c' rather than 'a ${op.name} b ${next.name} c'.`,
          state.peek(),
        );
```

   `to` and the comparisons are at different precedence levels, so they never
   pair with each other and the `and` phrasing stays true for the only chains
   that can reach this branch. If that changes, split the message.

   `parseExpr.test.ts:627` asserts the old wording, `"Comparisons cannot be
   chained."`. Run it, read the real output, and assert what it says.

- [ ] **Step 4: Verify the decisions**

Run: `npm test && npx tsc -b --noEmit`

Then, separately, reporting each result:

1. **Confirm the corpus is intact.** `git diff --stat -- eval/` must be empty —
   *not* `git status --porcelain`, which reports phantom modifications on this
   machine (`core.autocrlf=true`, no `.gitattributes`; AGENT-LESSONS §6).
   Then re-run the `.eval` harness and diff the reports.
2. Delete the `op.name === "to" && peek(1) is COLON` guard. Expect the comma-free
   animate test to fail. If it passes, that test is not protecting the corpus and
   the guard is unpinned.
3. Change the row to `prec: 2`. Expect the two precedence tests to fail.
4. Change `assoc` to `"left"`. Expect the chaining test to fail.
5. Drop the `Math.max(0, …)`. Expect nothing to fail on `5 to 1` — the loop is
   already empty — which is why the count matters only for the ceiling check.
   Confirm that reading rather than assuming it.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/parser
git commit -m "feat(parser): 'A to B' builds an inclusive integer list

Precedence 4, between comparison and additive, so '0 to n - 1' reads as
'0 to (n - 1)' — the form every rewritten scene uses. Non-associative.
'5 to 1' is the empty list, the honest reading of an inclusive range.

'to' is also a property name and property separators are optional, so a
comma-free 'animate { property: alpha  to: 0.5 }' — the shape every
.eval scene uses — would otherwise parse 'to' as a range operator and
fail on the colon. A 'to' followed by ':' is a property name.

Making a range an ordinary list value is what lets generate have one
header shape instead of two, and folds parseGenerate's separate
10,000-iteration cap into one list-length ceiling."
```

---

## Task 10: `generate NAME [, INDEX] in LIST`

**Files:**
- Modify: `src/compiler/parser/parseGenerate.ts` (whole header + loop)
- Modify: `eval/scenes-3b/` is not yet created; migrate `tools/visual-check/scenes/*.declare`, `src/store/defaultScene.ts`, `docs/LANGUAGE.md`, `src/components/Editor/MonacoEditor/constants.ts:35`
- Test: `src/compiler/parser/parseGenerate.test.ts` (create if absent)

**Twelve `.eval` fixtures use `from` and must be migrated in this task** — six in `eval/scenes/`, six in `eval/scenes-r2/`. This is the one permitted edit to either corpus in the whole phase: a mechanical `from` → `in` rename and nothing else, matching the vocabulary migration Phase 3A performed and recorded at `eval/RESULTS.md:7-12`. **Do not touch anything else in those files** — not the hand-unrolled rectangles, not the literal coordinates, not the author comments explaining why they were written that way. Every affected header starts at 0, so no object name changes and both report JSONs must stay byte-identical.

**Since this section was drafted, Task 9 landed a temporary stopgap in exactly the code this task rewrites, because giving `to` an `OPERATORS` row broke `generate`'s own `from`/`to` header the same way it briefly threatened to break `animate { to: … }`.** Re-derive against current source before writing the dispatch (per AGENT-LESSONS §7b) — this is not a prediction, it is read directly off the branch as of commit `414d1f8`:

- `src/compiler/parser/parseGenerate.ts` grew an import (`parseExpr, ROOT_CTX, GENERATE_START_MIN_PREC` from `./parseExpr`, currently `:6`) and its start-bound parse changed from `parseValue(state)` to `parseExpr(state, GENERATE_START_MIN_PREC, ROOT_CTX)` (currently `:35`), with an 8-line comment explaining why. **This task's rewrite deletes all of it** — the new `in`-header code below needs none of those three names, so the import line should simply disappear rather than be edited down.
- `src/compiler/parser/parseExpr.ts` gained the `GENERATE_START_MIN_PREC` export and its doc comment (currently `:330-368`). It exists only to serve the call site above. **Delete both together** — leaving the export behind with no caller is exactly the orphaned-scaffolding this stopgap's own comment says Task 10 should remove.
- `src/compiler/parser/parseExpr.test.ts` gained a test documenting a known limitation of the stopgap (currently `:1334-1372`, `it("known limitation: a conditional generate start bound still collides with 'to' …")`) — it pins that `generate i from if 1 < 2 then 0 else 1 to 2 { … }` throws "Both branches of an 'if' must be the same kind…". **Delete this test, do not migrate it.** Once this task's rewrite lands, that fixture's `from` is rejected by the new `[PARSE_RENAMED_KEYWORD]` check (see Step 3) before any bound is ever parsed, so it can no longer reach the branch-kind-mismatch error the test pins — keeping it would pin a message the new code cannot produce, the exact "assertion the pipeline cannot produce" shape a later task already had to fix once this phase (Task 9's own `listOf`/`MAX_LIST_LENGTH` round).

Confirm all three against source before dispatching — this task's own commit may have moved since this note was written, same as everything else in this plan.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { lex } from "../lexer";
import { parse } from "./index";

function namesOf(src: string): string[] {
  const result = parse(lex(src));
  expect(result.errors).toEqual([]);
  return result.ast!.children.map((c) => c.name);
}

describe("generate ... in", () => {
  it("iterates a range", () => {
    expect(namesOf(`scene { size:(100,100) generate i in 0 to 2 { circle dot { position:(i*10,0), radius:1 } } }`))
      .toEqual(["dot_0", "dot_1", "dot_2"]);
  });

  it("iterates a list, binding the element", () => {
    const src = `let v = [7,8] scene { size:(100,100) generate r in v { circle dot { position:(0,0), radius: r } } }`;
    const result = parse(lex(src));
    expect(result.errors).toEqual([]);
    expect(result.ast!.children.map((c) => (c.props.radius as { value: number }).value)).toEqual([7, 8]);
  });

  it("binds an ordinal index when a second name is given", () => {
    const src = `let v = [7,8] scene { size:(100,100) generate r, i in v { circle dot { position:(i*10,0), radius: r } } }`;
    const result = parse(lex(src));
    expect(result.errors).toEqual([]);
    expect(result.ast!.children.map((c) => (c.props.position as { x: number }).x)).toEqual([0, 10]);
  });

  it("suffixes names with the ordinal, not the element value", () => {
    expect(namesOf(`let v = [7,8] scene { size:(100,100) generate r in v { circle dot { position:(0,0), radius: r } } }`))
      .toEqual(["dot_0", "dot_1"]);
  });

  it("emits nothing for an empty list", () => {
    expect(namesOf(`let v = 5 to 1 scene { size:(100,100) generate r in v { circle dot { position:(0,0), radius: 1 } } }`))
      .toEqual([]);
  });

  it("rejects the removed 'from' header, naming the replacement", () => {
    const msg = parse(lex(`scene { size:(100,100) generate i from 0 to 2 { circle d { position:(0,0), radius:1 } } }`))
      .errors.map((e) => e.message).join();
    // Step 3's [PARSE_RENAMED_KEYWORD] message is deliberately templated —
    // 'A to B' is a fixed illustration, not the fixture's actual '0 to 2' —
    // because the check fires before any bound is parsed, and re-deriving the
    // original bound text from tokens not yet consumed is not worth doing for
    // a diagnostic whose useful information is entirely "from is now in".
    // A version of this test asserting `toContain("generate i in 0 to 2")`
    // will not pass: confirm the real message before pinning it.
    expect(msg).toContain("generate i in A to B");
  });

  it("rejects iterating a non-list", () => {
    const msg = parse(lex(`scene { size:(100,100) generate i in 5 { circle d { position:(0,0), radius:1 } } }`))
      .errors.map((e) => e.message).join();
    expect(msg).toContain("requires a list");
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/compiler/parser/parseGenerate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite the header**

In `src/compiler/parser/parseGenerate.ts`, replace the whole `from`/`to` header-parsing block — the `from`/`to` parsing, the integer check, and the 10,000 cap, currently `:20-59` (shifted from this plan's original `:19-49` by Task 9's now-obsolete stopgap; confirm against source, this has already moved once) — with:

```ts
  let indexVar: string | null = null;
  if (state.peek().type === "COMMA") {
    state.consume("COMMA");
    if (state.peek().type !== "IDENT") {
      state.throwError(`In ${state.currentContext}: Expected an index variable name after ',', but found ${describeToken(state.peek())}.`, state.peek());
    }
    indexVar = state.consume("IDENT").value as string;
  }

  const inTok = state.peek();
  if (inTok.type === "IDENT" && inTok.value === "from") {
    state.throwError(
      `[PARSE_RENAMED_KEYWORD] 'generate ${loopVar} from A to B' was replaced by 'generate ${loopVar} in A to B'. 'A to B' is now an ordinary list, so 'generate' has one header shape for both ranges and data lists.`,
      inTok,
    );
  }
  if (inTok.type !== "EXPR_KEYWORD" || inTok.value !== "in") {
    state.throwError(`In ${state.currentContext}: Expected 'in' after the loop variable, but found ${describeToken(inTok)}.`, inTok);
  }
  state.consume();

  const prevContext = state.currentContext;
  state.currentContext = `generate block collection`;
  const collection = parseValue(state);
  state.currentContext = prevContext;

  if (collection.kind !== "list") {
    state.throwError(`In ${state.currentContext}: 'generate' requires a list to iterate, but got ${collection.kind}. Write a list literal, a range such as '0 to 9', or a 'let' bound to one.`, inTok);
  }
  const items = collection.value;
```

The `from` branch tests for `IDENT`, not `EXPR_KEYWORD`: `from` is **not** in `EXPRESSION_WORDS` and still lexes as an identifier, so this named diagnostic is reachable. Confirm that by running the test in Step 1 that asserts it.

- [ ] **Step 4: Rewrite the loop**

Replace the `for (let i = start; i <= end; i++)` loop at `:76` with an ordinal loop over `items`, binding both names and suffixing with the ordinal:

```ts
  for (let ordinal = 0; ordinal < items.length; ordinal++) {
    if (state.errors.length > initialErrorCount) break;

    state.globalNodeCount++;
    if (state.globalNodeCount > 15000) {
      state.throwError(`In ${state.currentContext}: Global iteration limit exceeded (>15,000) to prevent freezing.`, state.peek());
    }

    state.pos = blockStartPos;
    state.env = Object.create(prevEnv);
    state.env[loopVar] = { ...items[ordinal], line: loopVarTok.line, col: loopVarTok.col, endLine: loopVarTok.line, endCol: loopVarTok.endCol };
    if (indexVar !== null) {
      state.env[indexVar] = { kind: "number", value: ordinal, line: loopVarTok.line, col: loopVarTok.col, endLine: loopVarTok.line, endCol: loopVarTok.endCol };
    }
    // ... body unchanged, except every `_${i}` suffix becomes `_${ordinal}`
  }
```

Change the three suffix sites at `:117`, `:124` and `:130` from `` `${sn.name}_${i}` `` to `` `${sn.name}_${ordinal}` ``.

- [ ] **Step 5: Migrate the first-party `generate` headers**

Every `generate X from A to B` becomes `generate X in A to B`. Find them:

```bash
grep -rn "generate [a-zA-Z_][a-zA-Z0-9_]* from" --include=*.declare --include=*.ts --include=*.md . | grep -v node_modules
```

Fix every hit, **including** the twelve under `eval/` — that rename and nothing else. Also covered: `tools/visual-check/scenes/*.declare`, `src/store/defaultScene.ts`, `docs/LANGUAGE.md`, and the `generate` hover string at `src/components/Editor/MonacoEditor/constants.ts:35` — whose prose says *"Required Elements: `variable | from | startValue | to | endValue`"* and must be rewritten for the new header, including its example.

- [ ] **Step 5b: Prove the `.eval` diff is the rename and nothing else**

```bash
git diff --stat eval/
git diff eval/ | grep -E "^[-+]" | grep -v "^[-+][-+]" | grep -v "generate "
```
Expected: the second command prints **nothing** — every changed line in `eval/` contains `generate`. Paste the real output into the task report.

```bash
npx vitest run --config eval/vitest.config.ts
EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts
git diff --stat -- eval/report.json eval/report-r2.json    # content check, NOT git status
```
Expected: 20/20 both, and the third command prints **nothing** — the reports are byte-identical because no object name changed.

- [ ] **Step 6: Run everything**

Run: `npm test && npx tsc -b --noEmit && npm run build`
Expected: pass.

`languageCuts.test.ts` has two `from`-using cases, at different lines than this plan originally cited (`:282-292` is stale — confirm current numbers, approximately `:353-359` and `:399-409` as of `414d1f8`, and re-check since this too may have moved again):

- **`"allows 'generate' to produce a run of objects"`** — a plain `generate i from 0 to 2 { … }`. This one is Step 5's mechanical rename: becomes `generate i in 0 to 2 { … }`, nothing else changes.
- **`"reports exactly two diagnostics for a 'generate' missing its 'to' bound, not three"`** — **not a mechanical rename.** Its fixture (`generate i from 0 }`) and its two pinned messages (`"Expected 'to' after start bound, but found '}'."`, then the `"Unexpected '}' after the scene block closed."` knock-on) both name the *old* grammar's error shape directly. Under the new grammar, `generate i from 0 }` hits the `[PARSE_RENAMED_KEYWORD]` check immediately (before any bound is parsed at all), which is an entirely different diagnostic — a blind rename would leave this test asserting a message the new code cannot produce, the same "assertion the pipeline cannot produce" shape Task 9's own `listOf`/`MAX_LIST_LENGTH` fix round already had to correct once this phase. The test's own comment (`:345-352`) explains what regression it guards: a historical bug where an untyped `consume()` advanced position even on a mismatch, shifting where `synchronize()` resumes and adding a spurious diagnostic. That regression class is still possible in the new `in`-check code (it uses the same peek-then-throw-then-consume shape, now for `in` instead of `to`), so the underlying guard is still worth having — but the fixture and both messages need re-deriving against whatever the new grammar's actual malformed-header shape produces (e.g. `generate i in }` or similar), not copied forward. Do this at dispatch time against current source, not from this note.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(parser): generate NAME [, INDEX] in LIST

One header shape for ranges and data lists, because 'A to B' is now an
ordinary list. 'from' is rejected with a named diagnostic pointing at the
replacement, not silently accepted.

Name suffixing moves from the loop value to the 0-based ordinal — the
only choice that generalises to a list of colors or strings. Observable
only for a range whose start is not 0, and the sole such header anywhere
in the repo was inside a Monaco hover string, so no compiled scene's
object names change.

Twelve .eval fixtures are migrated by the same mechanical rename Phase 3A
applied for def/handOff/sceneFit/z, and nothing else in them is touched:
the hand-unrolled repetition those fixtures record is the measurement
Phase 3B is judged against. Both report JSONs stay byte-identical."
```

---

## Task 11: `TYPE_ONE_PHYSICS` — the silent-drop defect

**Files:**
- Modify: `src/compiler/typeChecker/validator.ts` (beside `TYPE_ONE_STORY` at `:166-173`)
- Test: `src/compiler/typeChecker/validator.test.ts`

`typeChecker/builder.ts:118-119` collects `animate` children with `.filter` but `physics` children with `.find`, and `:127-130` attaches only that one. A second direct `physics` block compiles with zero errors and vanishes. Present since `8390e58`; deferred by Phase 3A (`docs/plans/2026-09-01-phase-3a-language-foundations.md:1644-1664`). Spec §9.

- [ ] **Step 1: Write the failing test**

Append to `src/compiler/typeChecker/validator.test.ts`:

```ts
describe("TYPE_ONE_PHYSICS", () => {
  it("rejects a second direct physics block instead of silently dropping it", () => {
    const src = `
      scene {
        size: (100, 100)
        circle c {
          position: (0, 0)
          radius: 10
          physics { duration: 1 }
          physics { duration: 2 }
        }
      }
    `;
    const errors = errorsFor(src);   // use this file's existing helper
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("[TYPE_ONE_PHYSICS]");
    expect(errors[0].message).toContain("maximum of one 'physics' block");
  });

  it("fires with no handoff anywhere — the existing rule only covers the handoff shape", () => {
    const src = `
      scene {
        size: (100, 100)
        rectangle r {
          position: (0, 0)
          size: (10, 10)
          physics { duration: 1 }
          physics { duration: 1 }
        }
      }
    `;
    expect(errorsFor(src).map((e) => e.message).join()).toContain("[TYPE_ONE_PHYSICS]");
  });

  it("still allows one direct physics block alongside a sequence that also has one", () => {
    const src = `
      scene {
        size: (100, 100)
        circle c {
          position: (0, 0)
          radius: 10
          physics { duration: 5 }
          sequence { physics { duration: 1 } }
        }
      }
    `;
    expect(errorsFor(src)).toEqual([]);
  });
});
```

Match the third case against the real validator: if an existing rule already rejects that shape, assert what it actually says rather than changing the rule. Read `validator.ts` before assuming.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/compiler/typeChecker/validator.test.ts -t TYPE_ONE_PHYSICS`
Expected: FAIL — zero errors, which is the defect.

- [ ] **Step 3: Add the rule**

In `collectErrors`'s `checkNode`, immediately after the `TYPE_ONE_STORY` block at `:166-173`:

```ts
    // Only the first direct 'physics' child reaches the IR — typeChecker/builder.ts
    // uses `.find` for physics where it uses `.filter` for animate — so a second
    // one is silent data loss, not a runtime race. The existing
    // TYPE_HANDOFF_SCHEDULE_AMBIGUOUS rule covers only the shape where a
    // handoff animation is also present; this covers the general case.
    const directPhysics = node.children.filter((c) => c.type === "physics");
    if (directPhysics.length > 1) {
      errors.push({
        phase: "TYPE",
        message: `[TYPE_ONE_PHYSICS] An object can have a maximum of one 'physics' block. Found ${directPhysics.length} on '${nodeName}'. Only the first would simulate; the rest would be silently discarded.`,
        line: directPhysics[1].line, col: directPhysics[1].col,
        endLine: directPhysics[1].endLine, endCol: directPhysics[1].endCol,
      });
    }
```

Positioning the error at the *second* block, not at the object, points the author at the block that would vanish.

- [ ] **Step 4: Run, then mutation-test**

Run: `npx vitest run src/compiler/typeChecker/validator.test.ts && npm test`
Expected: pass.

Now prove the test is not vacuous:

```bash
# Comment out the errors.push in the new rule, then:
npx vitest run src/compiler/typeChecker/validator.test.ts -t TYPE_ONE_PHYSICS
# Expected: FAIL on all cases that assert the rule fires. Restore the code.
```

Record in the task report the exact failure output seen with the rule disabled. A test that passes both with and without the fix is worthless, and Phase 3A shipped six of those.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/typeChecker/validator.ts src/compiler/typeChecker/validator.test.ts
git commit -m "fix(typeChecker): reject a second direct physics block

builder.ts:118-119 keeps only the first direct physics child (.find,
where animate uses .filter), so a second one compiled with zero errors
and never reached the IR — silent data loss present since 8390e58.

Phase 3A found and deferred this. That deferral is reversed here for the
reason its own external review gave about the handoff seconds/ticks gap:
Phase 4 is export, and a silently dropped physics block that bakes into a
frame sequence is unrecoverable and emits no runtime signal.

The rule is general and independent of handoff; the error is positioned
at the discarded block, not the object. Mutation-tested against the
disabled rule."
```

---

## Task 12: Make the line executable in `languageCuts.test.ts`

**Files:**
- Modify: `src/compiler/languageCuts.test.ts`

Spec §2 is only a design boundary if a test notices when it is crossed. Every case here must be **verified to fail for the stated reason** — run each, read the actual diagnostic, and assert that. Do not assert a message you guessed.

- [ ] **Step 1: Add the new rejection matrix**

```ts
describe("Phase 3B line: data determines values, source structure determines shape", () => {
  // Design section 2.1. Reading the source alone tells you how many objects a
  // program emits and what they are named. A predicate may never gate emission.

  it("rejects a conditional used as an emission guard", () => {
    const source = `scene { size:(10,10) if true { circle c { position:(0,0), radius:1 } } }`;
    const diags = diagnosticsFor(source);
    expect(diags.length).toBeGreaterThan(0);
  });

  it("rejects a filter clause on generate", () => {
    const source = `scene { size:(10,10) generate i in 0 to 4 where i % 2 == 0 { circle c { position:(0,0), radius:1 } } }`;
    expect(diagnosticsFor(source).length).toBeGreaterThan(0);
  });

  it.each([["while", "while true { }"], ["break", "break"], ["continue", "continue"]])(
    "rejects the loop-control construct '%s'",
    (_word, stmt) => {
      const source = `scene { size:(10,10) generate i in 0 to 1 { ${stmt} } }`;
      expect(diagnosticsFor(source).length).toBeGreaterThan(0);
    },
  );

  it("rejects calling a 'let'-bound name as if it were a function", () => {
    const source = `let f = 5 scene { size:(10,10) circle c { position:(0,0), radius: f(2) } }`;
    expect(diagnosticsFor(source).length).toBeGreaterThan(0);
  });

  it("rejects defining an operator or function", () => {
    const source = `function double(x) { } scene { size:(10,10) }`;
    expect(diagnosticsFor(source).length).toBeGreaterThan(0);
  });

  it("rejects assigning to a list element", () => {
    const source = `let v = [1,2] v[0] = 5 scene { size:(10,10) }`;
    expect(diagnosticsFor(source).length).toBeGreaterThan(0);
  });

  it("rejects rebinding a list, since bindings stay immutable", () => {
    const source = `let v = [1,2] let v = [3,4] scene { size:(10,10) }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("already defined in this immediate scope");
  });

  it("still rejects string concatenation", () => {
    const source = `scene { size:(10,10) text t { position:(0,0), content: "a" + "b" } }`;
    const diags = diagnosticsFor(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("String concatenation using '+' is not supported.");
  });
});
```

- [ ] **Step 2: Tighten every loose assertion**

`expect(...).length.toBeGreaterThan(0)` is a weak assertion that would pass on an unrelated error. For each case above, run it, read the diagnostic, and replace the loose assertion with `toHaveLength(1)` plus a `toContain` on the real message and a `posAt` position check, matching the style of every other case in this file. **A case that cannot be made specific is a case that is not really testing the line — report it rather than leaving it loose.**

- [ ] **Step 3: Run**

Run: `npx vitest run src/compiler/languageCuts.test.ts && npm test`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/compiler/languageCuts.test.ts
git commit -m "test(cuts): make the Phase 3B line executable

Design section 2 — data determines values, source structure determines
shape — now has a rejection case per clause: emission guards, generate
filtering, loop control, calling a binding, defining a function, list
mutation. Without these it is a paragraph of intent a later phase can
cross with nothing noticing, which is the failure mode this file exists
to prevent."
```

---

## Task 13: Documentation

**Files:**
- Modify: `docs/LANGUAGE.md:690-840` (Arithmetic, `generate`, Current limits)
- Modify: `src/components/Editor/MonacoEditor/constants.ts`
- Test: `src/compiler/languageDocs.test.ts`

`languageDocs.test.ts` compiles every `declare` fence in the reference and rejects any fence tag but `declare` or `text`. It does **not** check prose — three false statements survived a green suite in Phase 3A. Read the prose.

- [ ] **Step 1: Replace the "Arithmetic" section**

`docs/LANGUAGE.md:690-698` currently says *"There is no modulo operator, no exponent, and no comparison operator."* Two thirds of that is now false. Rewrite the section to cover the full operator set and the precedence table from spec §4.2, with a worked `declare` example that compiles.

- [ ] **Step 2: Replace the `generate` section**

`docs/LANGUAGE.md:718-740` documents the `from` header, inclusive bounds, the 10,000 span cap, and value-based name suffixing. All four change. Document `generate NAME [, INDEX] in LIST`, the ordinal suffix, and the single list-length ceiling.

- [ ] **Step 3: Replace "Current limits"**

`docs/LANGUAGE.md:816-840` states the three gaps this phase closes, and its opening line — *"These are known gaps in the reuse layer, not deliberate design positions"* — is now wrong about all three. Replace the section with two parts:

1. What the expression layer does: lists, ranges, indexing, `length`, the operators, the conditional, degree-based trig.
2. **What it deliberately does not do, and why** — spec §2's line, in the reference's own voice. A reader needs the boundary as much as the capability. State plainly that there is no π constant and why.

- [ ] **Step 4: Add a worked data-driven example**

Add one `declare` fence showing the bar-chart pattern end to end — a literal list, `generate v, i in values`, and a conditional colour. It compiles as part of `languageDocs.test.ts`, so it cannot rot.

- [ ] **Step 5: Update Monaco**

`src/components/Editor/MonacoEditor/constants.ts:35`'s `generate` hover names `from | startValue | to | endValue` and shows `generate i from 1 to 5`. Rewrite both. Then grep the Monaco directory for any other prose describing removed syntax:

```bash
grep -rn "from\b" src/components/Editor/MonacoEditor/ | grep -i generate
```

Hovers, completions and snippets for *properties* derive from `LANGUAGE_CONTRACT` and need no edit — verify that by reading `constants.ts`'s derivation rather than assuming.

- [ ] **Step 6: Run**

Run: `npx vitest run src/compiler/languageDocs.test.ts && npm test && npx tsc -b --noEmit && npm run build`
Expected: pass.

- [ ] **Step 7: Re-read the prose against the source**

For every behavioural claim added or left in `docs/LANGUAGE.md`, confirm it against the file that implements it and cite `file:line`. Report the list of claims checked. The test does not do this for you.

- [ ] **Step 8: Commit**

```bash
git add docs/LANGUAGE.md src/components/Editor/MonacoEditor
git commit -m "docs: document the expression layer and the line it stops at

'Current limits' described exactly the three gaps this phase closes and
called them 'not deliberate design positions'; it is replaced by what the
expression layer does and, equally, what it deliberately does not do.
Arithmetic and generate are rewritten for the new operator set and the
'in' header. Monaco's generate hover no longer documents removed syntax."
```

---

## Task 14: The three acceptance scenes and the evidence

**Files:**
- Create: `eval/scenes-3b/{bar-chart,radial-dots,timeline-ticks}.declare`, `eval/scenes-3b/README.md`, `eval/RESULTS-3B.md`
- Modify: `eval/RESULTS.md`, `eval/RESULTS-R2.md` (a dated note only)
- **Do not modify** `eval/scenes/`, `eval/scenes-r2/`, `eval/report.json`, `eval/report-r2.json`

- [ ] **Step 1: Write the three scenes**

Use spec §7.1–7.3 as the starting point, but write them to be *good scenes*, not minimal ones — each baseline has a title, an axis, and colour bindings that should survive. Each must be a faithful rewrite of its baseline: same visual result, same data.

- [ ] **Step 2: Write the corpus README**

`eval/scenes-3b/README.md`:

```markdown
# Phase 3B demonstration corpus

Three scenes rewritten with Phase 3B's expression layer, to be compared
against their hand-unrolled baselines in `eval/scenes/` (R1) and
`eval/scenes-r2/` (R2).

**This is not an authorability round.** R1 and R2 measured what authors with
no access to the compiler wrote blind. These three were written by the
implementer of the feature they exercise, so they measure whether the
capability removes the hand-unrolling — not whether an unfamiliar author
would find it. The blind round that `eval/RESULTS.md`'s "Re-running after
phase 3" section describes is a separate exercise and has not been run.

Run: `EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts`
```

- [ ] **Step 3: Compile the new corpus**

Run: `EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts`
Expected: 3/3, writing `eval/report-3b.json`.

- [ ] **Step 4: Record the metrics**

Write `eval/RESULTS-3B.md` with, per scene, roadmap §5's measures against **both** baselines:

- source lines (baseline → new);
- literal-coordinate count;
- hand-unrolled object count;
- the diff size for one representative change — add an eighth bar; 12 dots → 24; 11 ticks → 21. Make each change, run `git diff --numstat`, record the real number, revert.

Count these; do not estimate. State the command used for each number so it can be re-derived.

- [ ] **Step 5: Record the vocabulary migration on both corpora**

Task 10 migrated twelve fixtures from `generate ... from` to `generate ... in`. Append a dated note to `eval/RESULTS.md` and `eval/RESULTS-R2.md`, in the same voice as the existing Phase 3A note at `eval/RESULTS.md:7-12`, recording that the rename is mechanical, that nothing else in the fixtures changed, and that the findings and conclusions are unaffected.

State plainly in the note that the hand-unrolled `bar-chart`, `radial-dots` and `timeline-ticks` fixtures are **deliberately** left hand-unrolled: they are the "before" that `eval/RESULTS-3B.md` measures against, and rewriting them would destroy the comparison.

- [ ] **Step 6: Prove the corpora carry only the rename**

```bash
git diff HEAD~N --stat eval/scenes eval/scenes-r2     # N = commits back to before Task 10
git diff --stat -- eval/report.json eval/report-r2.json    # content check, NOT git status
grep -c "rectangle bar" eval/scenes/bar-chart.declare   # expect 7 — still hand-unrolled
grep -c "circle dot" eval/scenes-r2/radial-dots.declare # expect 12 — still hand-unrolled
```
Expected: the report JSONs are unmodified, and both baselines still contain their full hand-unrolled repetition. Paste the actual output into the task report.

- [ ] **Step 7: Commit**

```bash
git add eval/scenes-3b eval/RESULTS-3B.md eval/report-3b.json eval/RESULTS.md eval/RESULTS-R2.md
git commit -m "eval: add the Phase 3B demonstration corpus and its metrics

bar-chart, radial-dots and timeline-ticks rewritten with the expression
layer, measured against their baselines. Those baselines keep every
hand-unrolled rectangle, every literal coordinate and every author
comment explaining why they were written that way — that repetition is
the measurement, and Task 10's from/in rename is the only edit either
corpus received.

Records the migration in both RESULTS files, as RESULTS.md:7-12 already
does for Phase 3A's renames."
```

---

## Task 15: Goldens and the trig correctness assertion

**Files:**
- Modify: `src/compiler/determinism.test.ts`
- Modify: `src/compiler/__snapshots__/determinism.test.ts.snap` (added entry only)

`radial-dots` compiles whether or not `sin`/`cos` are correct, so compilation proves nothing. Spec §12 item 9.

- [ ] **Step 1: Add the trig correctness test**

```ts
describe("trigonometry produces the coordinates it claims", () => {
  it("places twelve dots on a circle of radius 180 about (400, 300)", () => {
    const src = `
      scene {
        size: (800, 600)
        generate i in 0 to 11 {
          let angle = i * 30
          circle dot {
            position: (400 + 180 * cos(angle), 300 + 180 * sin(angle))
            radius: 9
          }
        }
      }
    `;
    const ir = irFor(src);
    const positions = ir!.children.map((c) => (c.props as { position: { x: number; y: number } }).position);
    expect(positions).toHaveLength(12);

    // Computed here from first principles, not read out of the compiler.
    for (let i = 0; i < 12; i++) {
      const rad = (i * 30 * Math.PI) / 180;
      expect(positions[i].x).toBeCloseTo(400 + 180 * Math.cos(rad), 9);
      expect(positions[i].y).toBeCloseTo(300 + 180 * Math.sin(rad), 9);
    }

    // Every dot is exactly 180 from the centre — the property a sign error breaks.
    for (const p of positions) {
      expect(Math.hypot(p.x - 400, p.y - 300)).toBeCloseTo(180, 9);
    }

    // ...and they are twelve distinct points, not one point twelve times.
    expect(new Set(positions.map((p) => `${p.x},${p.y}`)).size).toBe(12);
  });
});
```

- [ ] **Step 2: Add one new golden fixture**

Add a `PHASE_3B_GOLDEN_SOURCE` exercising a list, `generate ... in` with an index, indexing, `%`, a comparison, a conditional and trig — then a new `it(...)` with `toMatchSnapshot()`. This **adds** a snapshot entry; it must not modify an existing one.

- [ ] **Step 3: Run and verify exactly one snapshot was added**

```bash
npx vitest run src/compiler/determinism.test.ts
git diff --stat src/compiler/__snapshots__/determinism.test.ts.snap
git diff src/compiler/__snapshots__/determinism.test.ts.snap | grep "^-" | grep -v "^---"
```
Expected: the third command prints **nothing** — no line was removed, so no existing golden moved. If it prints anything, stop: a golden moved, and per the global constraints that is a decision, not a re-record. Report exactly which and why before proceeding.

- [ ] **Step 4: Mutation-test the trig assertion**

Change `sinDegrees` to return `-Math.sin(...)` and confirm the new test fails. Restore. Record the failure output.

- [ ] **Step 5: Commit**

```bash
git add src/compiler/determinism.test.ts src/compiler/__snapshots__/determinism.test.ts.snap
git commit -m "test(determinism): pin trig coordinates and a Phase 3B golden

radial-dots compiles with the signs wrong, so compilation proves nothing.
The new assertion computes all twelve coordinates from first principles,
checks every dot is exactly 180 from the centre, and checks they are
twelve distinct points. Mutation-tested by negating sinDegrees.

One snapshot entry added, none modified — verified by diffing the snapshot
file for removed lines."
```

---

## Task 16: Integrated review, browser checks, and execution notes

**Files:**
- Modify: `docs/plans/2026-09-02-phase-3b-generative-expressiveness.md` (this file: add "Execution notes")
- Modify: `AGENTS.md`, `AGENTS.md` (roadmap status, gotchas that changed)

- [ ] **Step 1: Full verification**

```bash
npm test
npx tsc -b --noEmit
npm run build
EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts
git diff --stat -- eval/report.json eval/report-r2.json    # content check, NOT git status
```

Record the **actual** numbers — test-file and test counts, build result, corpus result. Do not carry a number forward from an earlier task's report; re-derive it here.

- [ ] **Step 2: Chromium checks**

Use the `visual-check` skill. Capture the default scene plus a scene using the new syntax — a radial layout is the one whose failure mode is invisible to the headless suite. Confirm `compiled: true`, `rendered: true`, zero `consoleErrors` / `pageErrors`.

**Kill the Vite server on port 5199 when done.** It blocked a worktree deletion at the end of Phase 3A.

- [ ] **Step 3: Update project guidance**

In both `AGENTS.md` (they are near-identical; the diff is confined to the header and the visual-check section — verify with `diff AGENTS.md AGENTS.md` before editing):

- Flip the Phase 3B roadmap entry to its real status.
- The Metaprogramming section describes `generate i from A to B`. Rewrite it.
- The "Colour animation is half-built" gotcha is unchanged; the `pointList` mention in any gotcha is not.
- Add a gotcha for anything this phase made non-obvious — at minimum, that expressions are folded at parse time so nothing reaches the IR, and that `sin`/`cos` are exact at cardinal angles on purpose.

- [ ] **Step 4: Write the execution notes**

Append an "Execution notes" section to this plan with, at minimum:

- **Final evidence** — the real counts from Step 1, and the Chromium result.
- **Defects found in source beyond the plan.**
- **Defects found in this plan** — where the plan's premise did not hold.
- **The spec-versus-implementation conflict from Task 14 Step 5** and how it was resolved.
- **Deliberate gaps and deferrals**, each with the reason.
- **Every golden that moved**, with its reason, or an explicit statement that none did.
- **Every mutation test performed**, with the failure output seen.

Write it from the diff, not from the task reports. Phase 3A's process note records four separate reports that overstated or misattributed their own work, every one caught by diffing rather than by reading (`docs/plans/2026-09-01-phase-3a-language-foundations.md:1666-1680`).

- [ ] **Step 5: Independent external review**

Budget for a review by someone with no stake in the prior reasoning. Phase 3A passed eleven task-scoped reviews and a whole-branch review, and *then* an outside reviewer found four Important defects, two of which made published exit criteria false.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: Phase 3B execution notes, guidance, and final evidence"
```

---

## Self-review

Checked after writing, against the spec:

| Spec section | Task |
|---|---|
| §2 the line | 6 (value-position conditional), 12 (executable) |
| §3 no IR change | 4 (asserted by unmoved goldens), 15 |
| §4.1 values and operators | 4, 5, 6, 7, 8, 9 |
| §4.2 precedence | 5, 9 |
| §4.3 type rules | 5, 6, 7, 8 |
| §4.4 iteration | 10 |
| §5 type-system changes | 4 |
| §6 lexer and reserved words | 1, 3 |
| §7 acceptance scenes | 14 |
| §8 limits and diagnostics | 5 (÷0, %0), 7 (index), 9 (list ceiling) |
| §9 physics silent drop | 11 |
| §10.1 corpora keep their evidence | 10 (rename only), 14, and a check in 2, 3, 4, 5 |
| §10.2 goldens | 15 |
| §10.3 cuts test | 4, 5, 6, 7, 8, 12 |
| §10.4 documentation | 13 |
| §11 deviations | 8 (no π), 7 (indexing alongside) |
| §12 exit criteria | 16 |

**One conflict found and resolved during this review.** The first draft declared both `.eval` corpora byte-frozen while Task 10 removes the `generate ... from` header twelve of their fixtures use — so spec §12 item 5 (both corpora compile 20/20) and §10.1 (edit nothing) could not both hold. The resolution came from precedent: Phase 3A migrated those same fixtures for `def`→`let` and recorded it at `eval/RESULTS.md:7-12`. "Frozen" was the wrong word for the right idea. Spec §10.1 and §12 item 5 now separate **mechanical vocabulary migration** (allowed, precedented, and provably evidence-preserving here — every affected header starts at 0, so no object name changes and both report JSONs stay byte-identical) from **semantic rewriting** (forbidden, because the hand-unrolled repetition is the measurement).

**Naming consistency:** `parseExpr`, `parsePrimary`, `parsePostfix`, `parseConditional`, `parseListLiteral`, `parseParenOrPoint`, `operatorOf`, `applyBinary`, `requireNumber`, `requireBoolean`, `sinDegrees`, `cosDegrees`, `MAX_EXPR_DEPTH`, `MAX_LIST_LENGTH`, `EXPRESSION_WORDS`, `TWO_CHAR_MAP`, `ListValue`, `listOf`, `TYPE_ONE_PHYSICS` — each is defined in exactly one task and used consistently after it.

---

## Running observation log (CHECKED by Task 16 — see "Execution notes" below)

These are claims collected from task reports and reviews as execution proceeded.
**They were not evidence when written.** Task 16 wrote the real execution notes
from `git diff` and the SDD ledger, and checked every line below against source
before promoting any of it.

**Result of that check: no line below was found false.** Four were confirmed
first-hand at HEAD `1645cef` rather than taken on the log's word, because they
are the ones a reader is most likely to rely on — the unpinned allowed-symbols
string (still unpinned: `git grep "may only contain letters" -- "*.test.ts"`
returns nothing), the doubled `ch + state.peek(1)` (still doubled,
`lexer/index.ts:35,37`), `de9bf39`'s commit message saying "the two
languageCuts cases" while its diff changes three (`%`, `<`, and the `=`→`==`
property-name case), and the computed-`Infinity` gap (still open through `*`;
`Number.isFinite` appears exactly once in `parseExpr.ts`, at `:772`, in the
trig branch only, with a comment at `:765-771` explaining why it was guarded
there and not at `*`). The section below is the record; this log is kept as
the trail that led to it, not as a second source of truth.

### Task 1 — lexer operators (`de9bf39`)
- Quality review raised two Minors, both accepted, neither fixed: the allowed-symbols
  string at `lexer/index.ts` is a third hand-maintained list of the same facts as
  `SINGLE_CHAR_MAP`/`TWO_CHAR_MAP` and nothing pins it; and `ch + state.peek(1)` is
  built twice rather than bound once.
- The `!` error wording had to change from the plan's literal text to satisfy the
  test's contiguous-substring regex.
- A third `languageCuts` case (`==`) needed updating beyond the two the plan named,
  because `==` now lexes as one token. The commit message says "the two cases".

### Task 2 — expression parser (`7bd8f22`, fixed in `9cf6088` and after)
- **Claimed behaviour-preserving; it was not.** Implementer reported 2 changes from a
  68-source A/B corpus. Two independent reviewer corpora (80, then 106 sources) found
  23 then 29 differing cases, including a **narrowing** the implementer missed:
  coordinate expressions inside points and point lists started one depth level down
  instead of resetting, so a point containing 50 nested parens compiled before and
  errored after. Fixed.
- **Diagnostic regression:** `requireNumber` anchored errors at `state.peek()`, which
  by then is the token after the whole expression, so `radius: true + 1` reported on
  the *next line's* property. Fixed; the fix restores pre-refactor columns exactly.
- **Two widenings kept and pinned.** `((1,2))` now parses as a point. And
  `property: position` now resolves to the animatable property even when a binding
  of that name is in scope — a latent bug where any `let position = …` in a file
  broke every `animate` block naming that property.
- **Half a fix shipped unguarded.** The reviewer re-introduced the narrowing in
  `parseListLiteral` alone and all 370 tests passed. The point-coordinate test did
  not guard the list path.
- **Widening 1 left point recursion unbounded** — ~2000 nested points raised
  `RangeError: Maximum call stack size exceeded` where `de9bf39` gave a clean
  positioned error. Reachable under `MAX_SHARE_LENGTH`.
- Two report-accuracy corrections the implementer accepted: its "md5-identical to the
  committed blobs" claim was false as worded (`git show` pipes the blob, comparing
  LF-to-LF and hiding the CRLF question), and `eval/` going ` M` was caused by its
  own harness runs, not a pre-existing condition.
- 26 message/position changes on inputs that error at both commits: accepted, unpinned.

- Computed `Infinity` reaches the IR silently: the lexer rejects an *Infinite literal*
  (`lexer/handlers.ts:73-75`) and scientific notation (`:67-70`), but no binary-operator
  path checks `isFinite` on a *result*, so repeated multiplication of long literals
  overflows unnoticed. **Verified pre-existing** — `de9bf39:parseValue.ts:63-72` has no
  such guard either. Not introduced by this phase; recorded so it is not rediscovered.

### Process observations
- A review subagent left `src/compiler/parser/__probe.test.ts` behind when it was cut
  off mid-run. The runner picked it up and the suite reported **379** tests instead of
  378 — a count that looks right unless you know the baseline. Reviewers must delete
  probe files before reporting, and any suite count quoted in the execution notes must
  be re-derived on a clean tree.

- **Quality review: the two nesting caps multiply.** Counter *threading* was verified
  correct across all 9 recursive edges, but because `depth` resets at every coordinate,
  50 structural levels each carry a fresh 50-level expression budget — so a
  **3,212-character** source still raised `RangeError` and surfaced through the worker
  with no position. The guard closed the instance, not the class, while its own comment
  claimed completeness. Third, never-resetting total-recursion counter added.
- **Two hand-synced tables re-introduced in miniature.** `operatorOf` returns bare
  `string` and `PRECEDENCE` is `Record<string, number>`, so adding an operator to one
  and not the other leaves the token unconsumed and produces a `parseObject` error
  byte-identical to the ordinary case. TypeScript cannot catch it. Exactly the
  anti-pattern `AGENTS.md` names, and Tasks 4-9 add operators seven more times.
  Unified into one table before Task 4.
- **One test in 378 stood between a mis-threaded counter and a green suite** (measured by
  revert experiment). That is why the numeric parameters were collapsed into a named
  `ExprCtx` with intent-named transitions before Tasks 4-9 add more recursive edges.

### Plan defects found during execution
- Seven verification steps used `git status --porcelain` to prove `eval/` unchanged.
  `core.autocrlf=true` with no `.gitattributes` makes that report modifications on
  content-identical files. Changed to `git diff --stat` in `44f8221`.
- Task 2 dropped `parseListLiteral`'s `depth` parameter as unused; Task 4 generalises
  list entries and reopens the question. Recorded into Task 4 in `4f24edd`.
- **Task 9's `to` operator would have broken every `animate` block in `eval/`, and
  its own test would have passed anyway.** Property separators are optional —
  `parseObject.ts:295` consumes commas in a `while` loop — and no `.eval` scene uses
  them, so `property: alpha` / newline / `to: 0.0` puts the reserved word `to`
  directly after a folded value. Giving `to` a row in `OPERATORS` makes the
  precedence loop consume it as a range operator and fail on the `:`. The plan's
  guard test wrote `animate { property: position, to: (10,10) }` **with** commas, so
  it exercised a shape the corpus never uses and would have stayed green through the
  break — rung 3 of the weak-test scale (AGENT-LESSONS §2a). Found by reading
  `parseObject.ts` while rewriting Tasks 7–9 against current source, not by running
  anything. Task 9 now names the problem, proposes one-token lookahead, and requires
  a comma-free test drawn from the corpus shape.

---

## Execution notes

Written 2026-09-08 at the close of Task 16, from `git diff aa4ba0f..HEAD` and
the SDD ledger
(`.sdd/2026-09-02-phase-3b-generative-expressiveness/progress.md`,
the controller-maintained record that already reflects independent verification
at every step) — **not** from any individual task's self-report. Every number in
"Final evidence" was re-derived on a clean tree at HEAD `1645cef` while writing
this, not carried forward. Where a claim below is quoted from the ledger rather
than re-run here, it says so.

### Final evidence

| Check | Command | Result |
|---|---|---|
| Unit suite | `npm test` | **20 files / 602 tests / exit 0** |
| Typecheck | `npx tsc -b --noEmit` | exit 0 |
| Production build | `npm run build` | exit 0; only the pre-existing >500 kB chunk-size advisory and the `vite:preact-jsx` esbuild-deprecation notice |
| Demonstration corpus | `EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts` | 5/5 harness tests; **3/3 scenes compiled clean (100%)** — 9, 13, 13 IR nodes |
| R1 corpus | `npx vitest run --config eval/vitest.config.ts` | **20/20 compiled clean (100%)** |
| R2 corpus | `EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts` | **20/20 compiled clean (100%)** |
| Reports unmoved | `git diff --stat -- eval/report.json eval/report-r2.json eval/report-3b.json` | empty — checked **after** all three corpus runs had regenerated all three files |
| Tree | `git status --porcelain -uall`; `find src -iname "*probe*" -o -iname "*scratch*"` | empty; none |

Branch shape: **62 commits**, `aa4ba0f..1645cef`, **75 files, +12,594 / −1,101**.
`src/compiler/sceneIR.ts` does not appear in that diffstat at all — design §3.2's
"no IR change" is a property of the diff, not a claim about it.

**Chromium** (`visual-check`, headless Chromium on SwiftShader, dev server
started with `npx vite --port 5199 --strictPort`):

| Scene | compiled | rendered | consoleErrors | pageErrors | deterministic across a cold reload |
|---|---|---|---|---|---|
| `default` | true | true | 0 / 0 (runs A, B) | 0 / 0 | n/a — `loop: true` animations never come to rest, so the measure is meaningless here (`SKILL.md` says so) |
| `eval/scenes-3b/radial-dots.declare` | true | true | 0 / 0 | 0 / 0 | **true** — rest frame `1ee6c18a44ab3cb6` in both runs; `cpu at rest` 0.018 s over a 2 s wall window, so the ticker genuinely stopped |

The PNGs were looked at, not just the JSON. `radial-dots` renders twelve evenly
spaced amber dots on a ring around the dim centre marker, radius visually
uniform; the default card renders its four easing tracks, the bar row, the
handoff square and ball, and the circle-and-triangle group, with the letterboxing
`fit: contain` implies. This is
the check that earns its keep for this phase specifically: a sign error in
`sin`/`cos` still compiles, still type-checks, and still produces thirteen IR
nodes — it is only visible in the geometry. The Vite server was killed
afterwards and the port confirmed free (no `LISTENING` socket on 5199; `curl`
connection refused).

### Exit criteria (design §12), each with the evidence that settles it

| # | Criterion | Evidence |
|---|---|---|
| 1 | `bar-chart`: one data list, one loop, zero hand-unrolled rectangles | `grep -cE '^\s*generate ' ` → 1; `grep -c "rectangle bar"` → 1 (inside the loop), against R1's 7 |
| 2 | `radial-dots`: one loop, zero hand-computed coordinates | one `generate`; one `circle dot` against R1's 12. Two literal coordinate pairs remain in the whole file — `size: (800, 600)` and the centre marker's `position: (400, 300)` — and **neither is a dot position**; R1 hand-writes 13 `position: (…)` literals. Every dot coordinate is `400 + ring * cos(angle)` / `300 + ring * sin(angle)` |
| 3 | `timeline-ticks`: one loop, not two | one `generate` against R1's 2. `grep -n layer` on the 3B scene matches only a comment saying nothing needs it; R1 has a real `layer: 1` at `:53` — the overdraw the second loop existed to fix |
| 4 | Materially shorter, with the change cost recorded | Re-derived by `wc -l`: 3B 42 / 28 / 47 against R1 76 / 40 / 56 (**−45% / −30% / −16%**) and R2 45 / 26 / 47 (**−7% / +8% / 0%**). Met against R1 in all three. **Not met against R2 on raw lines for `radial-dots`** — see "The spec-versus-implementation conflict" below. `eval/RESULTS-3B.md` records all of it, including the column that reads badly |
| 5 | Corpora differ by nothing but the `from` → `in` rename; both compile 20/20; reports byte-unchanged | `git diff aa4ba0f..HEAD -- eval/scenes eval/scenes-r2` is **32 lines: 16 removed, 16 added, every pair identical but for `from`→`in`**, same variable, same bounds. Every start bound is `0`, so the ordinal suffix equals the old loop value and no object name changed. Both report JSONs content-identical after a fresh run |
| 6 | Every `declare` fence compiles; "Current limits" no longer claims closed gaps | `languageDocs.test.ts` 41/41 within the full suite; Task 13 rewrote the section and 11 drifted citations besides |
| 7 | Lifted cuts have permission tests; retained cuts keep rejections; §2's line has a rejection per clause | `languageCuts.test.ts` is +501 lines across the branch, 81 tests in the file |
| 8 | `TYPE_ONE_PHYSICS` mutation-verified against reverted code | Re-run first-hand at Task 16 — see "Mutation tests", rows 1 and 2 |
| 9 | `sin`/`cos` proven by an IR-level assertion, confirmed by a Chromium capture | Re-run first-hand at Task 16 — see "Mutation tests", rows 3 and 4, plus the Chromium table above |
| 10 | Typecheck, build, suite, doc tests green | Table above |
| 11 | Repeat compilation deterministic; every moved golden listed in §10.2 | `determinism.test.ts` 6/6. **No golden moved** — see "Goldens" |

### The spec-versus-implementation conflict

Step 4 of Task 16 asks for "the spec-versus-implementation conflict from Task 14
Step 5." That citation is stale: Task 14's actual Step 5 is "record the
vocabulary migration on both corpora," a documentation step with no conflict in
it. There are two real candidates. **Both are recorded here, because they are
different kinds of conflict and a reader needs both** — but if the bullet meant
one, it meant the second: it sits in a list of things found *during* execution,
and the second is the only one that could not have existed when the plan was
drafted.

**(a) "Byte-frozen corpora" versus a header rename Task 10 could not avoid —
a plan-drafting-time conflict, resolved before execution began.** The plan's
first draft declared both `.eval` corpora byte-frozen while Task 10 removes the
`generate ... from` header twelve of their fixtures use, so spec §12 item 5
(both corpora compile 20/20) and §10.1 (edit nothing) could not both hold.
Resolved from Phase 3A's precedent — that phase migrated the same fixtures for
`def`→`let` and recorded it at `eval/RESULTS.md:7-12` — by separating
**mechanical vocabulary migration** (allowed) from **semantic rewriting**
(forbidden, because the hand-unrolled repetition *is* the measurement). The full
resolution is in this plan's own "Self-review" section. Task 16 confirms the
resolution held in practice, and that it was provably evidence-preserving: the
migration is 16 header tokens and nothing else, and all three report JSONs are
content-identical (exit criterion 5 above).

**(b) Design §12.4's "materially shorter than its baseline" versus the R2
numbers — a conflict that emerged during Task 14's actual execution.** §12.4
says each rewrite must be "materially shorter than its baseline." There are two
baselines, written blind by different authors with different conventions, and
the criterion holds cleanly against R1 for all three scenes (−45% / −30% /
−16%) but **not against R2 on raw source lines for `radial-dots`, which is 2
lines *longer* (+8%)**. Re-derived first-hand by `wc -l` at Task 16; the figures
match `eval/RESULTS-3B.md` exactly.

Resolved as follows, and the reasoning is worth keeping because the tempting
resolutions are all worse. §12.4 says "materially shorter than **its**
baseline," singular, and every worked example in design §7 is demonstrably
modelled on R1's specific parameters — R1's `scale`/`baseline` naming, radius
180 with dot radius 9, the amber/sky thickness-3/2 styling — not R2's `unit`,
radius 200, or monochrome ticks. So "its baseline" for these rewrites is R1, and
the criterion is met. The R2 shortfall is a real, reported fact about formatting
convention (R2 has no titles, no centre marker, no `let` bindings in
`radial-dots`, writes one object per line, and carries much larger comment
blocks), not a defect in the rewrite. Three ways to make the number disappear
were identified and rejected: compressing the rewrite, deleting R2's
explanatory comment, and reporting only the R1 column. The decisive argument
against the most tempting one — adding a title to `radial-dots` so its line
count rises on both sides — is that it would push the scene to 14 emitted
objects against R1's 13 and break the object-count equivalence `RESULTS-3B.md`
uses as its *primary* faithfulness evidence. Two independent parties reached the
same conclusion by different routes (design-citation tracing, and object-count
reasoning) before it was accepted.

**The honest residual:** design §12.4 is worded for one baseline and this phase
has two. That is a defect in the criterion, not in the work, and it is recorded
here rather than smoothed over. Measure 4 in `RESULTS-3B.md` — the diff size for
one representative change — is the measure that holds against *both* baselines,
and is the better criterion for a future phase to write.

### Defects found in source beyond the plan

All reproduced first-hand at Task 16 unless marked otherwise.

1. **`parseParenOrPoint` misreads a parenthesised list literal as a point.**
   `let x = ([1,2,3])` → *"In variable declaration 'x': A point coordinate must
   be a number, but got list."* The point-detection forward scan counts
   `LPAREN`/`RPAREN` only, so a list's internal comma at `nesting === 1` sets
   `isPoint`. **Pre-existing**, not introduced by this phase — but indexing makes
   `([1,2,3])[0]` a natural thing to write, so it is now far more reachable.
2. **The generalised non-associativity message gives invalid advice for a
   `to`-`to` chain.** `let x = 1 to 2 to 3` → *"'to' cannot be chained. Write 'a
   to b and b to c' rather than 'a to b to c'."* — but `and` requires booleans,
   so the suggested rewrite does not compile. Introduced by Task 9's
   generalisation of a message that was previously comparison-only, where the
   advice was correct.
3. **`[][0]` reports a nonsensical valid range.** *"Index 0 is out of range for
   a list of length 0. Valid indices run 0 to -1…"*. Correct rejection, absurd
   hint.
4. **Three missing-parens diagnostics are correct and completely untested.**
   `length [1,2]`, `sin 45`, `cos 45` each produce a good message (*"'length' is
   a function and needs parentheses — write 'length(values)'."*), and
   `git grep "is a function and needs parentheses" -- "*.test.ts"` returns
   nothing. Rung 4 of AGENT-LESSONS §2c: there is nothing in the diff to read.
5. **Three editor-autocomplete defects at
   `src/components/Editor/MonacoEditor/scanner.ts:88.`** The line still reads
   `else if (expectingGenName && word !== "from" && word !== "to")`. It (i) sets
   `expectingGenName = false` after one word, so the ordinal binder in
   `generate v, i in list` never gets a scope entry; (ii) still filters `from`, a
   word the new grammar does not use here and which was **never reserved**
   (design §6.1 reserves `to`, not `from`), so an author naming their element
   variable `from` has it skipped and the reserved `in` registered as a variable
   in its place; (iii) writes into `scopes[scopes.length - 1]`, the *enclosing*
   scope. None reaches compiled output — editor autocomplete only.
6. **Computed `Infinity` still reaches the IR silently.** The lexer rejects an
   infinite literal and scientific notation, but no binary path checks
   `isFinite` on a *result*, so repeated multiplication of long literals
   overflows unnoticed. `Number.isFinite` occurs exactly once in `parseExpr.ts`
   (`:772`), in the trig branch, with a comment at `:765-771` stating that
   guarding `*` is a wider numeric-limits decision than that task owned.
   **Verified pre-existing** at `de9bf39`.
7. **A dead conditional in `validator.ts:576-580`,** where both arms of
   `if (c.type !== "sequence" && c.type !== "parallel") { checkNode(...) } else
   { checkNode(...) }` are identical, so the condition does nothing.
   Pre-existing; untouched by this phase's diff.
8. **The physics silent-drop defect itself** (design §9) — Phase 3A found it and
   deferred it; this phase fixed it as Task 11. Recorded here because the
   deferral was judged wrong in Phase 3A's own external review, and it is the
   one item on this list that *was* closed.

### Defects found in this plan

Where the plan's own premise did not hold. Most were caught by a pre-flight scan
of the task body against current source *before* dispatch — cheap, and it worked
repeatedly. The two most expensive ones were not findable that way, and are
grouped last.

**Fixture and assertion defects — caught by reading:**

1. Task 7's Step 1 asserted `toContain("index 5")` and `toContain("index -1")`
   against a message its own Step 3 spells `Index 5 is out of range…`.
   `toContain` is case-sensitive; neither assertion could hold.
2. Task 7's anchor test located the bracket with `posAt(source, "[")` on
   `let value = [1,2][5]`, which `indexOf` resolves to the **list literal's**
   bracket at col 13, while the implementation anchors on the **index's** at col
   18 — and the plan's own prose two lines below says the point is the index
   bracket.
3. Task 11's Step 1 fixtures called `.message` on the result of `errorsFor`,
   which returns `string[]`, not objects. One fixture would have thrown; the
   other mapped every string to `undefined` and **could never pass under any
   implementation**.
4. Task 13's Steps 2 and 5 (rewrite the `generate` docs; rewrite the Monaco
   hover) were **already done** — Task 10's own commits had to update both to
   keep `languageDocs.test.ts` green through its grammar rewrite. Treating a
   stale brief as pending work risks regressing text two reviewers had already
   verified.
5. Task 16's own Step 3 named `AGENTS.md`/`AGENTS.md` as its edit targets. Commit
   `4c70781`, landed *within this phase* and before Task 7 started, had reduced
   both to byte-identical 8-line forwarding stubs; none of Step 3's literal
   targets existed in them any more. (The corrected brief said "9 lines"; `wc
   -l` says 8. Immaterial, corrected here for the record.)
6. Task 16's Step 4 cited "the spec-versus-implementation conflict from Task 14
   Step 5"; Task 14's Step 5 is a documentation step containing no conflict. See
   the section above.

**Verification steps that could not have failed — the more dangerous class:**

7. Seven verification steps used `git status --porcelain` to prove `eval/` was
   unchanged. With `core.autocrlf=true` and no `.gitattributes`, that reports
   modification on content-identical files. Changed to `git diff --stat` in
   `44f8221` and promoted to Global Constraint 9.
8. Task 8's Step 4 said "delete the `+360` correction, expect `sin(-90)` to
   fail." `Math.sin(-Math.PI/2)` is exactly `-1`, so the reverted code returns
   the right answer; `cos(720)` survives for a different reason (`810 % 360` is
   already positive). **Both** rows of that test were green against the code
   they existed to catch. `sin(-180)` discriminates and was added.
9. Task 9's Step 4 claimed a `prec: 2` mutation would break both precedence
   tests. It breaks the comparison one; the "binds looser than subtraction" one
   does not discriminate, because `-` is precedence 5 and folds inside `to`'s
   right-hand parse at any floor below 5. A `prec: 5` mutation does discriminate
   — though by a different mechanism than predicted (the non-associativity chain
   check fires first).
10. Task 15's Step 1 shipped the comment *"Every dot is exactly 180 from the
    centre — the property a sign error breaks."* Task 16 re-ran the canonical
    sign-error mutation and confirmed **that property survives it untouched**.
    The comment is false as written; only the per-index assertion catches the
    mutation. Filed, not fixed (cosmetic, and the commit message and report
    already carry the correction).

**Design and sequencing gaps the plan did not anticipate.** Items 11 and 12 are
the two that no amount of reading would have found — both surfaced only because
a mandated verification step was actually run (the corpus regression, and the
full suite). Items 13–15 were found by reading, but by a *reviewer* reading the
finished code, not by a pre-flight scan of the task text:

11. **`generate i from X to Y` breaks the moment `to` becomes an operator, and
    nothing in the plan named it.** The header's bounds parse through
    `parseValue` with no `currentKey`, falling through to
    `parseExpr(state, 0, ROOT_CTX)` — and unlike the property-name collision the
    plan *did* anticipate, there is no `COLON` for the lookahead fix to key off.
    `0 to 2` folds to `[0,1,2]` as the whole start bound. Blast radius: six
    scenes per corpus plus `src/store/defaultScene.ts`. Found by Task 9's
    mandated corpus-regression run, not by any pre-flight scan — the file was
    never in Task 9's stated file list.
12. **Task 9's own new `MAX_LIST_LENGTH` silently preempted an existing coded
    diagnostic.** Design §8 deliberately unified the list ceiling with the
    point-list ceiling at 10,000 — but parsing precedes type-checking, so the
    parser's ceiling now fires first and `[TYPE_POLYGON_TOO_LARGE]` became
    **permanently** unreachable through the ordinary pipeline. The two numbers
    were unified on purpose; the layering consequence of unifying them was
    traced by nobody until it broke two tests.
13. **Task 10's grammar opened a design-boundary hole the plan did not see.**
    `generate v in if flag then [1] else [1,2] { … }` makes the emitted object
    count depend on a predicate — a direct violation of design §2.1, reachable
    the moment `generate` accepts a general collection expression. The first fix
    (reject conditionally-selected *lists*) was itself only partial: cardinality
    can be laundered through a range bound, `length`, arithmetic, an index, or a
    `let` alias. It took a second round to close it under the whole expression
    graph.
14. **Task 11's Step 3 contained complete, verbatim, and *wrong* code.** The
    unconditional `directPhysics.length > 1` rule, inserted exactly where
    instructed, rejects a legitimate `sequence { physics {…} physics {…} }` —
    two sequential physics phases, which `buildSequencesFromChildren` has always
    built correctly, because the `.find` truncation that motivates the whole
    rule lives only in `buildObjectNode`. Task 16 confirmed this first-hand:
    deleting the sequence/parallel exclusion fails **6 tests, four of them
    pre-existing Phase 3A handoff tests**. A brief containing complete code is
    not a brief whose code is correct.
15. Task 10's Step 5 instructed a sweep of "every hit" of the old `from` syntax.
    Read literally that is 41 matches, including the design spec (which must
    keep recording that `from` was removed), historical plans, and the
    deliberate legacy-rejection fixture. A mechanical sweep would have erased
    the evidence and rewritten a test into asserting a lie.

### Deliberate gaps and deferrals

Each with what makes it harmless *today*, per AGENT-LESSONS §7 — not merely
inconvenient to fix.

| Deferred | Why it is safe to defer |
|---|---|
| `parseParenOrPoint`'s `([1,2,3])` misread | It is a **spurious rejection with a position**, not silent data loss: the author sees an error rather than wrong output. This is exactly the distinction §7 draws against the physics case, which had no runtime signal at all. Should not defer indefinitely — indexing made it more reachable. Proposed as a follow-up task, not an in-place fix |
| The `to`-`to` chain message's invalid advice | Wrong *hint* on a correctly rejected program. Cosmetic in consequence, though embarrassing |
| `[][0]`'s "Valid indices run 0 to -1" | Same shape: correct rejection, absurd hint. Suppressing the clause for an empty list is a behaviour change beyond any task's brief |
| Untested missing-parens diagnostics (`length`, `sin`, `cos`) | The messages are correct and were read from source; only the pins are missing. Adjacent-behaviour gap, filed rather than fixed under the standing scope rule |
| `scanner.ts:88`'s three autocomplete defects | None reaches compiled output. A proper fix (register the ordinal's type; handle an element variable named `from`; stop leaking into the enclosing scope) is a small design decision in its own right, in a file outside every task's stated scope |
| Computed `Infinity` through `*` | Pre-existing, verified at `de9bf39`. Reaching it needs ~160-digit literals multiplied — the lexer rejects scientific notation and any single literal evaluating to `Infinity`. Guarding `*` would make `Infinity` an error for the first time, which is a numeric-limits decision, not a trig one |
| `[TYPE_POLYGON_TOO_LARGE]`'s unreachability | **A decision, not an oversight.** The alternative was decoupling the two 10,000 ceilings by inventing a larger arbitrary number, contradicting design §8's explicit "matching the existing point-list ceiling." The check is kept with a comment marking it defensively unreachable — the same precedent as this codebase's unreachable-`consume` arms |
| Nested ranges amplifying list-literal node counts ~1000× | Matters only for scenes the playground did not author locally. No corpus scene, acceptance scene or default scene comes near it |
| Task 10's dry-run-placeholder residue (a parameter-driven `generate` nested one level deeper; a malformed index inside a never-`use`d template) | Both are loud parse-time rejections one level past the three flows the round required. Nothing in the corpora, the default scene, or the three acceptance scenes writes either construct |
| `validator.ts:576-580`'s dead conditional | Pre-existing, behaviour-neutral (both arms identical) |
| No π constant; no `sqrt`/`atan2`/`pow`/`abs`/`min`/`max`/`floor`/`round`; no semantic layout; no R3 blind-author round; no string ops beyond equality; no colour arithmetic | Design §11.1 and §13 — deliberate scope, argued there. In particular the π deviation is *strengthened* by degree-based trig, not weakened: `sin(pi)` would be `0.0548`, not `0` (re-derived: `0.054803665148789524`) |

### Goldens

**No golden snapshot moved.** `git diff aa4ba0f..HEAD --
src/compiler/__snapshots__/determinism.test.ts.snap` contains **zero deleted
lines** across the entire phase, so both pre-existing goldens — "keeps macro,
sequence, parallel, and physics IR stable" and "keeps primitive defaults and
layer order in the Scene IR" — are byte-unchanged. The file gained exactly one
new entry, `keeps list, indexed generate, modulo, comparison, conditional, and
trig IR stable`, added by Task 15.

That is the outcome design §10.2 required, and it is load-bearing rather than
lucky: the phase added a whole expression layer, so an unchanged golden is the
strongest available evidence that nothing new reaches the IR. `generate`'s move
from loop-value to ordinal name suffixing could have moved a golden, and did
not, for the reason §10.2 recorded in advance: at design time the only
non-zero-start range header anywhere in the repo sat inside a Monaco hover
string, not in a compiled scene — so the ordinal and the old loop value agree
everywhere a snapshot could see them.

`npx vitest run -u` was never run.

### Mutation tests

Rows 1–4 were re-run first-hand while writing these notes, on a clean tree at
`1645cef`, with both mutated files restored and `git diff --stat` confirmed
empty afterwards. Rows 5 onward are the ledger's record of checks performed
during the tasks themselves.

| # | Mutation | Observed |
|---|---|---|
| 1 | Neutralise the `TYPE_ONE_PHYSICS` rule (`directPhysics.length > 1` → `false`) | **4 failed / 46 passed.** The fourth failure is the informative one: `expected '[TYPE_HANDOFF_SCHEDULE_AMBIGUOUS] Thi…' to contain '[TYPE_ONE_PHYSICS]'` — proving the pre-existing handoff rule does *not* already cover the case, exactly as design §9 claims |
| 2 | Delete the sequence/parallel exclusion from the same rule | **6 failed / 44 passed**, including four *pre-existing Phase 3A* handoff tests (`picks the first later physics step…`, `allows a sequence handoff with two later physics steps…`). This is the evidence that the plan's own literal Step 3 code was wrong |
| 3 | Negate `sinDegrees`'s fallback line only (`return -Math.sin(...)`), leaving the four cardinal early-returns intact | **2 failed / 4 passed.** `AssertionError: expected 244.11542731880104 to be close to 555.884572681199, received difference is 311.7691453623979` at `determinism.test.ts:221`, plus the Phase 3B golden going red on `"x": 510 → 290`, `"y": 109.47… → 490.52…` |
| 4 | Same mutation, with the per-index assertion removed | **1 passed.** The distance-from-centre and twelve-distinct-points assertions **do not discriminate a sign error** — negating the fallback reflects each non-cardinal point through the scene centre, and a 30°-spaced sample maps onto itself under that reflection, preserving both magnitude and cardinality. Only the per-index comparison against independently computed `Math.cos`/`Math.sin` catches it |
| 5 | *(ledger)* Swap the index expression's and `length` argument's `ExprCtx` transition `intoGroup` → bare `ctx` | 516/516 and 518/518 **still green** — the decision was unpinned. Two boundary fixtures added, each then shown to catch its own revert |
| 6 | *(ledger)* Delete `parseExpr.ts`'s `index.kind !== "number"` guard | 518/518 **still green** — a required behaviour with no fixture at all (rung 4). Fixture added; the guard was then reverted two ways (message neutralised, then whole guard deleted, which falls through to `Number.isInteger` and a different wrong message — no crash, no false pass) |
| 7 | *(ledger)* Delete the `+360` angle correction | Only the newly added `sin(-180)` row failed; the brief's own `sin(-90)` and `cos(720)` rows stayed **green** — see plan defect 8 |
| 8 | *(ledger)* `ExprCtx` flips on the trig argument | `intoOperand` 536/536, `intoUnary` 536/536 (**unobservable** — identical bodies, proved rather than tested), `intoCoordinate` 535/536, bare `ctx` 535/536. Both observable alternatives pinned by one new boundary fixture |
| 9 | *(ledger)* `to`'s precedence 4 → 2, then 4 → 5 | prec 2: only the comparison test red. prec 5: discriminates, via the non-associativity chain check rather than the predicted `requireNumber`-on-list path |
| 10 | *(ledger)* Delete the `generate` start-bound stopgap | Exactly the 16 `generate`-collision failures, and no others |
| 11 | *(ledger)* Revert `GENERATE_START_MIN_PREC` to test the conditional-bound limitation | **The check is impossible.** `parseConditional` bypasses `minPrec` entirely, so the fixture was never protected by the constant — which is precisely why it is pinned as a *known limitation* rather than a fix. Reported as an impossible verification (AGENT-LESSONS §2f) instead of a passing one |
| 12 | *(ledger)* Task 10 fix round 3, each of three findings mutated out separately | Finding 1 alone → exactly its 4 tests; finding 2 alone → exactly 3 (correctly excluding the already-working final-child case); finding 3's three sub-parts each → exactly the tests requiring them |
| 13 | *(ledger)* Mutation-testing a *proposed test*, not the code | "preserves a following template-body sibling after duplicate binders" **could not discriminate** on its definition-only fixture (1 error and a non-null AST either way, for unrelated reasons). Rewritten with a real `use` expansion: 5 errors / empty children reverted, versus 2 errors / `["good"]` fixed |
| 14 | *(observation log, Task 2)* Re-introduce the coordinate-depth narrowing in `parseListLiteral` alone | **All 370 tests passed.** The point-coordinate test did not guard the list path — half a fix, shipped unguarded |
| 15 | *(observation log, Task 2)* Mis-thread the recursion counter | Exactly **one test in 378** stood between the defect and a green suite |
| 16 | *(AGENT-LESSONS §2d)* Swap the list-entry recursion budget to the other defensible rule | **411/411 green.** The suite had no opinion about a choice that halves how deeply lists and points may nest — a missing test for a *decision*, not for a behaviour |

The pattern across all sixteen: **reading finds contradictions; only execution
finds coincidences.** Rows 4, 5, 6, 7, 11, 13, 14 and 16 — half the table — are
cases where the check that already existed, or the check the plan itself
specified, was **green against the very defect it existed to catch**. None of
them was found by reading the code; every one was found by running the mutation
and looking at what actually failed.

### Process, for the next phase

- **Cost.** ~4,700 subagent tokens per net implementation line, measured twice
  under different context-routing regimes and statistically flat between them.
  The lever is fix-loop compression, not input routing: one Task 7 fix round
  cost 282,971 tokens against a `+37/−5` diff, because each round pays a full
  context reload regardless of how small the fix is. Written up in
  `docs/harness/2026-09-04-context-routing-experiment-result.md`.
- **Tiering worked where it was applied.** Task 1 (a six-line token-map change)
  originally received the same ceremony as Task 2 (a full expression-evaluator
  rewrite). The Mechanical/Integration/Architecture tiering adopted mid-phase
  held for Tasks 7–15 — with one instructive miss: Task 11 was tiered Mechanical
  because its brief contained complete code, and that code was wrong.
- **Task 2 should have been two or three tasks.** "Refactor the math parser into
  a general expression parser" ran five rounds, consumed 1.04M tokens, and forced
  Tasks 4–9 to be re-briefed twice as its signature moved underneath them. The
  test for task sizing: if a single task needs more than two implementer rounds,
  it should have been two tasks.
- **Every language-behaviour ambiguity was surfaced rather than guessed.** The
  ledger records four occasions explicitly: the `to`-as-property-name collision,
  the `generate` `from`/`to` collision, the
  `MAX_LIST_LENGTH`/`TYPE_POLYGON_TOO_LARGE` diagnostic loss, and the
  conditional-collection cardinality rule (twice — the narrow list-only version,
  then the general provenance closure). The dividing line that held every time —
  *if the resolution changes what a Declare author can write or see, ask; if it
  is purely implementation sequencing, rule on it and record why* — is worth
  carrying forward verbatim.
- **What is still owed:** an independent whole-branch review by someone with no
  stake in the prior reasoning — this plan's own Task 16 Step 5, and
  AGENT-LESSONS §8. Phase 3A passed eleven task reviews and a whole-branch
  review and *then* an outside reviewer found four Important defects, two of
  which made published exit criteria false. That review is deliberately **not**
  part of Task 16's own dispatch (an implementer reviewing its own branch is not
  independent of the reasoning that produced it) and had not run when these
  notes were written. **Phase 3B is not done until it has.**
