import type { CompileResult, LogEntry, CompilerError } from "./types";
import { lex }         from "./lexer";
import { parse }       from "./parser";
import { typeCheck }   from "./typeChecker";
import { renderScene } from "./renderer";

export interface CompileResultWithCleanup extends CompileResult {
  cleanup: (() => void) | null;
}

// ─── Error normalisation ──────────────────────────────────────────────────────

/**
 * Safely extracts a structured CompilerError from anything that was thrown.
 * The compiler throws plain objects conforming to CompilerError, but third-party
 * code (e.g. PixiJS) may throw native Error instances or arbitrary values.
 */
function normaliseError(raw: unknown): { phase: string; message: string; location: string } {
  // Our own structured errors
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

  // Native Error (e.g. from PixiJS or an unexpected runtime fault)
  if (raw instanceof Error) {
    return { phase: "runtime", message: raw.message, location: "" };
  }

  // Absolute fallback
  return {
    phase:   "error",
    message: String(raw),
    location: "",
  };
}

// ─── Compile pipeline ─────────────────────────────────────────────────────────

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
      typeErrors.forEach((msg) =>
        logs.push({ kind: "error", text: `[type]    ${msg}` })
      );
      return { logs, success: false, cleanup: null };
    }
    logs.push({ kind: "ok", text: "[type]    no errors" });

    logs.push({ kind: "info", text: "[pixi]    initialising renderer..." });
    const cleanup = await renderScene(ast, hostElement, isDark);
    const elapsed = (performance.now() - t0).toFixed(1);
    logs.push({
      kind: "ok",
      text: `[pixi]    rendered via WebGL/WebGPU in ${elapsed}ms`,
    });

    return { logs, success: true, cleanup };

  } catch (raw: unknown) {
    const { phase, message, location } = normaliseError(raw);
    logs.push({
      kind: "error",
      text: `[${phase}]  ${message}${location}`,
    });
    return { logs, success: false, cleanup: null };
  }
}

export type { CompileResult, LogEntry, LogKind } from "./types";