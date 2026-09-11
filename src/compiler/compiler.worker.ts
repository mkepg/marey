import { compileSource } from "./compileSource";
import type { LogEntry, CompilerError } from "./types";

// `check.mjs:89` filters the Terminal's output on exactly six prefixes:
// /^\[(lexer|parser|type|pixi|render|system)\]/. A raw `err.phase` is not one
// of them for either reachable thrown phase — LEX renders as `[lex]`, and the
// parser's 51-error abort renders as `[runtime]` — so both lines were dropped
// from every scraped visual-check capture. The IDE was unaffected
// (`Terminal.tsx` renders text verbatim and styles by `kind`), which is why
// this survived a manual browser observation.
const PHASE_PREFIX: Record<string, string> = {
  LEX: "[lexer]   ",
  PARSE: "[parser]  ",
  TYPE: "[type]    ",
};

const prefixFor = (phase: string): string => PHASE_PREFIX[phase] ?? "[system]  ";

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
  // (normaliseError) carries some other phase — "LEX" for a lexer error, or
  // "RUNTIME"/"SYSTEM"/"ERROR" for a stage past lexing throwing instead of
  // returning structured errors. The most common of those is the parser's
  // 50-error abort (`parser/state.ts`) — reachable from ordinary (if badly
  // malformed) user input, e.g. pasting a large non-Marey document into the
  // editor, not an internal invariant. `out.tokenCount > 0` disambiguates
  // "lexing itself failed" (nothing else was logged before the throw in the
  // original per-phase try/catch either) from "lexing succeeded and a later
  // stage threw" (the original would have already logged the lexer and
  // "building AST..." lines by that point, so this does too).
  //
  // The one case this still cannot reconstruct precisely: a throw from
  // *inside* `typeCheck()` after a fully successful parse (the IR builder's
  // `default: { const _never: never = ... }` exhaustiveness arm) would, in
  // the original code, additionally have logged "[parser]  AST root: ..."
  // and "[type]    checking..." first. `compileSource`'s flat outcome has no
  // way to tell "threw during parse" apart from "threw during type-check"
  // without hoisting the AST too, which was judged not worth widening the
  // contract for — that arm is a true invariant (TypeScript's own exhaustiveness
  // check on `ObjectType`), not reachable by any AST the parser can produce.
  const firstPhase = out.errors[0]?.phase;
  const thrown = out.errors.length > 0 && firstPhase !== "PARSE" && firstPhase !== "TYPE";

  // Same catch-block format on both `thrown` exits below, regardless of how
  // many info/ok lines preceded it.
  const postThrown = (err: CompilerError) => {
    const location = err.line !== undefined && err.col !== undefined
        ? ` — line ${err.line}, column ${err.col}`
        : "";
    logs.push({
      kind:  "error",
      text:  `${prefixFor(err.phase)}${err.message}${location}`,
    });
    outErrors.push(err);
    self.postMessage({ id, action: "compile", success: false, logs, errors: outErrors, ir: null });
  };

  logs.push({ kind: "info", text: "[lexer]   tokenizing..." });

  if (thrown && out.tokenCount === 0) {
    postThrown(out.errors[0]);
    return;
  }

  logs.push({ kind: "ok", text: `[lexer]   ${out.tokenCount - 1} tokens` });
  logs.push({ kind: "info", text: "[parser]  building AST..." });

  if (thrown) {
    postThrown(out.errors[0]);
    return;
  }

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
