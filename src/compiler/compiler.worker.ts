import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";
import type { LogEntry, CompilerError, AstNode, ObjectNode, LintResult } from "./types";

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

function doLint(source: string): LintResult {
  try {
    const tokens = lex(source);
    const { ast, errors: parseErrors, env } = parse(tokens);
    
    const symbols = new Set<string>();
    if (env) {
      Object.keys(env).forEach(k => symbols.add(k));
    }

    if (parseErrors.length > 0) {
      return { errors: parseErrors, symbols: Array.from(symbols) };
    }

    if (ast) {
      const { errors } = typeCheck(ast);
      const astSymbols = getAstSymbols(ast);
      astSymbols.forEach(s => symbols.add(s));
      
      return {
        errors: errors.map(msg => ({ phase: "TYPE", message: msg })),
        symbols: Array.from(symbols)
      };
    }
    
    return { errors: [], symbols: Array.from(symbols) };
  } catch (raw: unknown) {
    return { errors: [normaliseError(raw)], symbols: [] };
  }
}

self.addEventListener("message", (e: MessageEvent) => {
  const { id, source, action = "compile" } = e.data;

  if (action === "lint") {
    const result = doLint(source);
    self.postMessage({ id, action: "lint", errors: result.errors, symbols: result.symbols });
    return;
  }

  const logs: LogEntry[] = [];
  const outErrors: CompilerError[] = [];

  try {
    logs.push({ kind: "info", text: "[lexer]   tokenizing..." });
    const tokens = lex(source);
    logs.push({ kind: "ok", text: `[lexer]   ${tokens.length - 1} tokens` });

    logs.push({ kind: "info", text: "[parser]  building AST..." });
    const { ast, errors: parseErrors } = parse(tokens);

    if (parseErrors.length > 0) {
      parseErrors.forEach(err => {
        logs.push({ kind: "error", text: `[parser]  ${err.message}` });
        outErrors.push(err);
      });
      self.postMessage({ id, action: "compile", success: false, logs, errors: outErrors, ir: null });
      return;
    }

    if (ast) {
      logs.push({
        kind: "ok",
        text: `[parser]  AST root: scene, ${ast.children.length} top-level object(s)`,
      });

      logs.push({ kind: "info", text: "[type]    checking + building Scene IR..." });
      const { errors, ir } = typeCheck(ast);

      if (errors.length > 0 || ir === null) {
        errors.forEach((msg) => {
          logs.push({ kind: "error", text: `[type]    ${msg}` });
          outErrors.push({ phase: "TYPE", message: msg });
        });
        self.postMessage({ id, action: "compile", success: false, logs, errors: outErrors, ir: null });
        return;
      }

      logs.push({
        kind: "ok",
        text: `[type]    no errors — Scene IR ready (${Object.keys(ir.registry).length} node(s))`
      });

      self.postMessage({ id, action: "compile", success: true, logs, errors: [], ir });
    }
  } catch (raw: unknown) {
    const err = normaliseError(raw);
    const location = err.line !== undefined && err.col !== undefined
        ? ` — line ${err.line}, column ${err.col}`
        : "";

    logs.push({
      kind:  "error",
      text:  `[${err.phase.toLowerCase()}]  ${err.message}${location}`,
    });
    outErrors.push(err);

    self.postMessage({ id, action: "compile", success: false, logs, errors: outErrors, ir: null });
  }
});