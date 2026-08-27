/**
 * Compile every .declare file in eval/scenes and report the result.
 *
 * Baseline for the machine-authorability question: how reliably can a model
 * with no training data on Declare produce a scene that compiles? Captured
 * before phase 3 rewrites the grammar and the error messages, so there is a
 * before-number to compare against afterwards.
 */
import { it } from "vitest";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { lex } from "../src/compiler/lexer";
import { parse } from "../src/compiler/parser";
import { typeCheck } from "../src/compiler/typeChecker";

const DIR = process.env.EVAL_DIR ?? "eval/scenes";

it("compiles every scene and writes a report", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".declare")).sort();
  const results = files.map((f) => {
    const src = readFileSync(`${DIR}/${f}`, "utf8");
    let parseErrors: string[] = [];
    let typeErrors: string[] = [];
    let nodeCount = 0;
    try {
      const { ast, errors } = parse(lex(src));
      parseErrors = errors.map((e) => `L${e.line ?? "?"}: ${e.message}`);
      if (ast) {
        const { errors: te, ir } = typeCheck(ast);
        typeErrors = te.map((e) => `L${e.line ?? "?"}: ${e.message}`);
        nodeCount = ir ? Object.keys(ir.registry).length : 0;
      }
    } catch (err) {
      parseErrors.push(`THREW: ${String(err).slice(0, 200)}`);
    }
    return {
      file: f,
      ok: parseErrors.length === 0 && typeErrors.length === 0,
      parseErrors,
      typeErrors,
      nodeCount,
    };
  });

  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.file}${r.ok ? `  (${r.nodeCount} nodes)` : ""}`);
    for (const e of [...r.parseErrors, ...r.typeErrors]) console.log(`        ${e}`);
  }
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} compiled clean (${results.length ? ((pass / results.length) * 100).toFixed(0) : 0}%)`);
  writeFileSync(`${DIR}/../report.json`, JSON.stringify(results, null, 2));
});
