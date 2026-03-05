import type { CompileResult, LogEntry, CompilerError } from "./types";
import { lex }            from "./lexer";
import { parse }          from "./parser";
import { typeCheck }      from "./typeChecker";
import { renderScene }    from "./renderer";

export interface CompileResultWithCleanup extends CompileResult {
  cleanup: (() => void) | null;
}

function normaliseError(raw: unknown): { phase: string; message: string; location: string } {
  if (
    raw !== null &&
    typeof raw === "object" &&
    "phase" in raw &&
    "message" in raw
  ) {
    const e = raw as CompilerError;
    const location =
      e.line !== undefined && e.col !== undefined
        ? ` — line ${e.line}, column ${e.col}`
        : "";
    return {
      phase:    (e.phase ?? "error").toLowerCase(),
      message:  e.message,
      location,
    };
  }
  if (raw instanceof Error) {
    return { phase: "runtime", message: raw.message, location: "" };
  }
  return {
    phase:    "error",
    message:  String(raw),
    location: "",
  };
}

/**
 * Full compile pipeline:
 *
 *   Source → Lexer → Parser → Type Checker → Scene IR → Renderer Adapter → Canvas Output
 *
 * The AST is not accessible after the type-checking stage.
 * The renderer adapter receives only the Scene IR.
 */
export async function compile(
  source: string,
  hostElement: HTMLDivElement,
  isDark: boolean
): Promise<CompileResultWithCleanup> {
  const logs: LogEntry[] = [];
  const t0 = performance.now();

  try {
    // Stage 1: Lexer
    logs.push({ kind: "info", text: "[lexer]   tokenizing..." });
    const tokens = lex(source);
    logs.push({ kind: "ok", text: `[lexer]   ${tokens.length - 1} tokens` });

    // Stage 2: Parser
    logs.push({ kind: "info", text: "[parser]  building AST..." });
    const ast = parse(tokens);
    logs.push({
      kind: "ok",
      text: `[parser]  AST root: scene, ${ast.children.length} top-level object(s)`,
    });

    // Stage 3: Type Checker → Scene IR
    logs.push({ kind: "info", text: "[type]    checking + building Scene IR..." });
    const { errors, ir } = typeCheck(ast);

    if (errors.length > 0 || ir === null) {
      errors.forEach((msg) =>
        logs.push({ kind: "error", text: `[type]    ${msg}` })
      );
      return { logs, success: false, cleanup: null };
    }

    logs.push({ kind: "ok", text: `[type]    no errors — Scene IR ready (${Object.keys(ir.registry).length} node(s))` });

    // Stage 4: Renderer Adapter (consumes Scene IR only — AST is no longer referenced)
    logs.push({ kind: "info", text: "[pixi]    initialising renderer..." });
    const cleanup = await renderScene(ir, hostElement, isDark);

    const elapsed = (performance.now() - t0).toFixed(1);
    logs.push({
      kind: "ok",
      text: `[pixi]    rendered via WebGL/WebGPU in ${elapsed}ms`,
    });

    return { logs, success: true, cleanup };
  } catch (raw: unknown) {
    const { phase, message, location } = normaliseError(raw);
    logs.push({
      kind:  "error",
      text:  `[${phase}]  ${message}${location}`,
    });
    return { logs, success: false, cleanup: null };
  }
}

export type { CompileResult, LogEntry, LogKind } from "./types";