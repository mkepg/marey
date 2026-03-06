import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";
import type { LogEntry, CompilerError } from "./types";

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

self.addEventListener("message", (e: MessageEvent) => {
  const { id, source } = e.data;
  const logs: LogEntry[] = [];

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

    // Stage 3: Type Checker & IR Generation
    logs.push({ kind: "info", text: "[type]    checking + building Scene IR..." });
    const { errors, ir } = typeCheck(ast);

    if (errors.length > 0 || ir === null) {
      errors.forEach((msg) =>
        logs.push({ kind: "error", text: `[type]    ${msg}` })
      );
      self.postMessage({ id, success: false, logs, ir: null });
      return;
    }

    logs.push({ 
      kind: "ok", 
      text: `[type]    no errors — Scene IR ready (${Object.keys(ir.registry).length} node(s))` 
    });
    
    // Post the successful SceneIR back to the main thread
    self.postMessage({ id, success: true, logs, ir });

  } catch (raw: unknown) {
    const { phase, message, location } = normaliseError(raw);
    logs.push({
      kind:  "error",
      text:  `[${phase}]  ${message}${location}`,
    });
    self.postMessage({ id, success: false, logs, ir: null });
  }
});