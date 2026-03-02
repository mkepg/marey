import type { CompileResult, LogEntry, CompilerError } from "./types";
import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";
import { renderScene } from "./renderer";

// ─────────────────────────────────────────────────────────────────────────────
// Declare Compiler — Pipeline Orchestrator
//
// The render stage is now async (PixiJS v8 requires await app.init()).
// compile() therefore returns a Promise that resolves to a CompileResult
// plus an optional cleanup function to destroy the PixiJS app between runs.
// ─────────────────────────────────────────────────────────────────────────────

export interface CompileResultWithCleanup extends CompileResult {
  /** Destroys the PixiJS Application and frees GPU resources. Call before
   *  every subsequent compile to prevent context/memory leaks. */
  cleanup: (() => void) | null;
}

export async function compile(
  source: string,
  hostElement: HTMLDivElement,
  isDark: boolean
): Promise<CompileResultWithCleanup> {
  const logs: LogEntry[] = [];
  const t0 = performance.now();

  try {
    logs.push({ kind: "info", text: "[lexer]   tokenizing..." });
    const tokens = lex(source);
    logs.push({ kind: "ok", text: `[lexer]   ${tokens.length - 1} tokens` });

    logs.push({ kind: "info", text: "[parser]  building AST..." });
    const ast = parse(tokens);
    logs.push({
      kind: "ok",
      text: `[parser]  AST root: scene, ${ast.children.length} top-level object(s)`,
    });

    logs.push({ kind: "info", text: "[type]    checking..." });
    const typeErrors = typeCheck(ast);
    if (typeErrors.length > 0) {
      typeErrors.forEach((e) => logs.push({ kind: "error", text: `[type]    ${e}` }));
      return { logs, success: false, cleanup: null };
    }
    logs.push({ kind: "ok", text: "[type]    no errors" });

    logs.push({ kind: "info", text: "[pixi]    initialising renderer..." });
    const cleanup = await renderScene(ast, hostElement, isDark);
    const elapsed = (performance.now() - t0).toFixed(1);
    logs.push({ kind: "ok", text: `[pixi]    rendered via WebGL/WebGPU in ${elapsed}ms` });

    return { logs, success: true, cleanup };
  } catch (raw: unknown) {
    const e = raw as CompilerError;
    const loc = e.line ? ` (${e.line}:${e.col})` : "";
    const phase = (e.phase ?? "error").toLowerCase();
    logs.push({ kind: "error", text: `[${phase}]  ${e.message}${loc}` });
    return { logs, success: false, cleanup: null };
  }
}

// Re-export types consumed by the rest of the app
export type { CompileResult, LogEntry, LogKind } from "./types";
