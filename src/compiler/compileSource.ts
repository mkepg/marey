import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";
import type { IRSceneNode } from "./sceneIR";
import type { AstNode, CompilerError, ObjectNode, Token } from "./types";

export interface CompileOutcome {
  readonly ok: boolean;
  readonly errors: ReadonlyArray<CompilerError>;
  readonly ir: IRSceneNode | null;
  readonly symbols: ReadonlyArray<string>;
  // Two reported facts about the compilation that are cheap to carry here and
  // otherwise unrecoverable by a consumer: `lex()`'s raw output length
  // (Step 4's judgment call — widening this one field is better than a
  // consumer re-lexing the same source for a log line) and the parsed AST's
  // top-level child count (the AST itself is not part of this contract, only
  // the typechecked `ir` is, so this would otherwise be lost between parse
  // and type-check). Both are 0 when the stage that would produce them did
  // not complete. `tokenCount` includes the EOF sentinel; trimming that is a
  // presentation choice left to the caller, same as all other log
  // formatting.
  readonly tokenCount: number;
  readonly topLevelObjectCount: number;
}

function normaliseError(raw: unknown): CompilerError {
  if (
    raw !== null &&
    typeof raw === "object" &&
    "phase" in raw &&
    "message" in raw
  ) {
    const e = raw as CompilerError;
    return {
      phase:    (e.phase ?? "error").toUpperCase(),
      message:  e.message,
      line:     e.line,
      col:      e.col,
      endLine:  e.endLine,
      endCol:   e.endCol
    };
  }
  if (raw instanceof Error) {
    return { phase: "RUNTIME", message: raw.message };
  }
  return {
    phase:    "ERROR",
    message:  String(raw),
  };
}

function getAstSymbols(ast: AstNode): string[] {
  const names: string[] = [];
  function walk(node: AstNode) {
    if (node.type !== "scene") {
      names.push((node as ObjectNode).name);
    }
    node.children.forEach(walk);
  }
  walk(ast);
  return names;
}

/**
 * The one `lex -> parse -> typeCheck` pipeline.
 *
 * Imports nothing from the DOM, the Web Worker API, or PixiJS, so it runs
 * unchanged in the worker, in Node under Vitest, and in the CLI. Before this
 * existed the pipeline was written out independently in `compiler.worker.ts`
 * and `eval/compile.test.ts`, and a third copy was about to be written for
 * `marey check` — the hand-synced-list anti-pattern at module scale.
 *
 * Log formatting deliberately stays with its consumers: the worker's `[lexer]`
 * / `[parser]` / `[type]` lines are presentation for one particular terminal
 * pane, and the CLI wants none of them. `tokenCount` and
 * `topLevelObjectCount` on `CompileOutcome` are the two raw counts those
 * lines are built from, not the formatted lines themselves — reported facts
 * about the compilation that would otherwise be unrecoverable once this
 * function returns, not a step toward baking any one consumer's log shape in
 * here.
 */
export function compileSource(source: string): CompileOutcome {
  // Hoisted out of the `try` so the catch block below can still report how
  // many tokens `lex()` produced when a *later* stage is what throws — e.g.
  // the parser's 50-error abort (`parser/state.ts:112-115`,`:137-139`), which
  // is reachable from ordinary (if badly malformed) user input, not only an
  // internal invariant. Without this, the worker's `[lexer]   N tokens` line
  // — one of the three Global Constraint 3 names by hand — silently dropped
  // out of the log for any source that lexes cleanly but accumulates more
  // than 50 parse errors.
  let tokens: Token[] = [];
  try {
    tokens = lex(source);
    const { ast, errors: parseErrors, env } = parse(tokens);

    const symbols = new Set<string>();
    if (env) for (const k of Object.keys(env)) symbols.add(k);

    if (parseErrors.length > 0) {
      return { ok: false, errors: parseErrors, ir: null, symbols: Array.from(symbols), tokenCount: tokens.length, topLevelObjectCount: 0 };
    }
    if (!ast) {
      return { ok: false, errors: [], ir: null, symbols: Array.from(symbols), tokenCount: tokens.length, topLevelObjectCount: 0 };
    }

    for (const s of getAstSymbols(ast)) symbols.add(s);
    const { errors, ir } = typeCheck(ast);

    return {
      ok: errors.length === 0 && ir !== null,
      errors,
      ir,
      symbols: Array.from(symbols),
      tokenCount: tokens.length,
      topLevelObjectCount: ast.children.length,
    };
  } catch (raw: unknown) {
    // `tokens` is `[]` (length 0) if `lex()` itself is what threw, and the
    // real token count if lexing finished and a later stage threw — see the
    // hoist comment above.
    return { ok: false, errors: [normaliseError(raw)], ir: null, symbols: [], tokenCount: tokens.length, topLevelObjectCount: 0 };
  }
}
