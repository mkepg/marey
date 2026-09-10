import { compileSource } from "./compileSource";
import type { LogEntry, CompilerError } from "./types";

self.addEventListener("message", (e: MessageEvent) => {
  const { id, source, action = "compile" } = e.data;

  if (action === "lint") {
    const result = compileSource(source);
    self.postMessage({ id, action: "lint", errors: result.errors, symbols: result.symbols });
    return;
  }

  const logs: LogEntry[] = [];
  const outErrors: CompilerError[] = [];

  const out = compileSource(source);

  // `parse()` and `typeCheck()` only ever return "PARSE"/"TYPE"-phase errors
  // (never throw them); everything compileSource's own catch produces
  // (normaliseError) carries some other phase — "LEX" for the common case of
  // a lexer error, or "RUNTIME"/"SYSTEM"/"ERROR" for the pipeline's internal
  // "should never happen" throws (parser's 50-error abort, an unreachable
  // exhaustiveness check in the IR builder). compileSource's flat outcome
  // does not say which stage those pathological throws interrupted, so —
  // same as the old per-phase try/catch, which logged nothing past the
  // point of the throw — this reports only the one error line for them, with
  // no preceding "N tokens" / "building AST..." lines. That degradation only
  // reaches a source this repository's corpora never produce (no `THREW:`
  // entry in any committed eval report); the common, tested path is LEX.
  const firstPhase = out.errors[0]?.phase;
  const thrown = out.errors.length > 0 && firstPhase !== "PARSE" && firstPhase !== "TYPE";

  logs.push({ kind: "info", text: "[lexer]   tokenizing..." });

  if (thrown) {
    const err = out.errors[0];
    const location = err.line !== undefined && err.col !== undefined
        ? ` — line ${err.line}, column ${err.col}`
        : "";
    logs.push({
      kind:  "error",
      text:  `[${err.phase.toLowerCase()}]  ${err.message}${location}`,
    });
    outErrors.push(err);
    self.postMessage({ id, action: "compile", success: false, logs, errors: outErrors, ir: null });
    return;
  }

  logs.push({ kind: "ok", text: `[lexer]   ${out.tokenCount - 1} tokens` });
  logs.push({ kind: "info", text: "[parser]  building AST..." });

  if (firstPhase === "PARSE") {
    out.errors.forEach(err => {
      logs.push({ kind: "error", text: `[parser]  ${err.message}` });
      outErrors.push(err);
    });
    self.postMessage({ id, action: "compile", success: false, logs, errors: outErrors, ir: null });
    return;
  }

  logs.push({
    kind: "ok",
    text: `[parser]  AST root: scene, ${out.topLevelObjectCount} top-level object(s)`,
  });

  logs.push({ kind: "info", text: "[type]    checking + building Scene IR..." });

  if (firstPhase === "TYPE") {
    out.errors.forEach((err) => {
      logs.push({ kind: "error", text: `[type]    ${err.message}` });
      outErrors.push(err);
    });
    self.postMessage({ id, action: "compile", success: false, logs, errors: outErrors, ir: null });
    return;
  }

  logs.push({
    kind: "ok",
    text: `[type]    no errors — Scene IR ready (${Object.keys(out.ir!.registry).length} node(s))`
  });

  // Optimization: JSON stringify to avoid structured clone bottleneck on massive IR payloads
  const irPayload = JSON.stringify(out.ir);
  self.postMessage({ id, action: "compile", success: true, logs, errors: [], ir: irPayload });
});
