/**
 * Compile every .declare file in eval/scenes and report the result.
 *
 * Baseline for the machine-authorability question: how reliably can a model
 * with no training data on Declare produce a scene that compiles? Captured
 * before phase 3 rewrites the grammar and the error messages, so there is a
 * before-number to compare against afterwards.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, normalize } from "node:path";
import { lex } from "../src/compiler/lexer";
import { parse } from "../src/compiler/parser";
import { typeCheck } from "../src/compiler/typeChecker";

const DIR = process.env.EVAL_DIR ?? "eval/scenes";

/**
 * Maps an eval scene directory to the report file it writes, deterministically.
 *
 * `eval/scenes` (the R1 corpus) writes `eval/report.json`. A directory named
 * `scenes-<suffix>` writes `report-<suffix>.json` beside it, so `eval/scenes-r2`
 * writes `eval/report-r2.json` and never collides with R1. Any other basename
 * falls back to `report-<basename>.json`, keeping the whole name rather than
 * guessing at a suffix.
 *
 * This replaces the previous logic, which always wrote `${DIR}/../report.json`
 * regardless of which corpus DIR pointed at — so an R2 run silently overwrote
 * R1's report.
 */
export function reportPathForEvalDir(dir: string): string {
  const normalized = normalize(dir);
  const parent = dirname(normalized);
  const base = basename(normalized);
  if (base === "scenes") return join(parent, "report.json");
  if (base.startsWith("scenes-") && base.length > "scenes-".length) {
    return join(parent, `report-${base.slice("scenes-".length)}.json`);
  }
  return join(parent, `report-${base}.json`);
}

describe("reportPathForEvalDir", () => {
  it("maps the R1 corpus directory to report.json", () => {
    expect(reportPathForEvalDir("eval/scenes")).toBe(normalize("eval/report.json"));
  });

  it("maps a scenes-<suffix> corpus directory to report-<suffix>.json", () => {
    expect(reportPathForEvalDir("eval/scenes-r2")).toBe(normalize("eval/report-r2.json"));
  });

  it("maps an arbitrary scenes-<suffix> path to report-<suffix>.json beside it", () => {
    expect(reportPathForEvalDir("C:/tmp/scenes-alt")).toBe(normalize("C:/tmp/report-alt.json"));
  });

  it("falls back to report-<basename>.json when there is no scenes- prefix", () => {
    expect(reportPathForEvalDir("C:/tmp/custom")).toBe(normalize("C:/tmp/report-custom.json"));
  });
});

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
  writeFileSync(reportPathForEvalDir(DIR), JSON.stringify(results, null, 2));
});
