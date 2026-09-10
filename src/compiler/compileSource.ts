import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";
import type { IRSceneNode } from "./sceneIR";
import type { AstNode, CompilerError, ObjectNode } from "./types";

export interface CompileOutcome {
  readonly ok: boolean;
  readonly errors: ReadonlyArray<CompilerError>;
  readonly ir: IRSceneNode | null;
  readonly symbols: ReadonlyArray<string>;
  // Widened rather than re-lexing for a log line (Step 4's judgment call):
  // the worker's `[lexer] N tokens` line needs a count, and lexing the same
  // source twice to get it would be worse than one extra field here. This is
  // the raw `lex()` output length, EOF sentinel included; trimming it to the
  // human-facing count is the worker's presentation concern, not this
  // module's.
  readonly tokenCount: number;
  // Same reasoning, for the worker's `[parser] AST root: scene, N top-level
  // object(s)` line: the AST itself is not part of this contract (only the
  // typechecked `ir` is), so the raw child count would otherwise be lost
  // between parse and type-check. `ast.children.length` when parsing
  // succeeds, 0 when it does not (the worker only reads this after a
  // successful parse, same as before).
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
 * pane, and the CLI wants none of them.
 */
export function compileSource(source: string): CompileOutcome {
  try {
    const tokens = lex(source);
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
    return { ok: false, errors: [normaliseError(raw)], ir: null, symbols: [], tokenCount: 0, topLevelObjectCount: 0 };
  }
}
