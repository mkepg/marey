// The action's run step. Plain ESM on Node built-ins only, so the action
// needs no build. action.yml installs marey-lang and passes its CLI entry in
// MAREY_CLI. Spec: docs/specs/2026-11-12-marey-phase-9b-github-action-design.md §3.3.
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FORMATS = ["png", "apng", "webm", "mp4", "lottie"];

// The rate `marey export` samples at when no --fps is given: EXPORT_FPS in
// src/compiler/export/exportDefaults.ts, which run.test.ts compares with this
// copy. The check is given it so the frame budget, which depends on the rate,
// is judged at the rate the export will use.
export const EXPORT_FPS = 30;

// Kept identical to src/cli/check.ts's escapeData and escapeProperty. A test in
// run.test.ts compares them, because this file cannot import TypeScript.
export function escapeData(s) {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
export function escapeProperty(s) {
  return escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

export function parseFiles(raw) {
  const list = (raw ?? "").split(/\s+/).filter(Boolean);
  return list.length === 0 ? ["*.marey"] : list;
}

export function parseFormats(raw) {
  const list = [...new Set((raw ?? "").split(/[\s,]+/).filter(Boolean))];
  return { formats: list.filter((f) => FORMATS.includes(f)), unknown: list.filter((f) => !FORMATS.includes(f)) };
}

/** `scenes/a/logo.marey` exports into `<exportDir>/scenes/a/`. Git paths always use `/`. */
export function exportCwd(exportDir, file) {
  const cut = file.lastIndexOf("/");
  return cut < 0 ? exportDir : join(exportDir, ...file.slice(0, cut).split("/"));
}

export function countErrors(stdout) {
  return stdout.split(/\r?\n/).filter((l) => l.startsWith("::error")).length;
}

// The merge keeps PATH and the rest of the runner's environment for the children,
// while letting tests inject extra variables through `env`.
// A spawn that fails outright (missing binary, ENOBUFS) yields status null, an
// `error`, and possibly null output, so normalise the result here.
function run(cmd, args, cwd, env) {
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, signal: r.signal ?? null, error: r.error, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function logLines(text, log) {
  for (const line of text.split(/\r?\n/)) if (line !== "") log(line);
}

/**
 * Why a child failed: what it printed, else how it ended. A child killed by a
 * signal (an out-of-memory kill, say) often prints nothing, and its status is
 * null, so the signal is named.
 */
export function failureDetail(r) {
  if (r.error) return r.error.message;
  const text = r.stderr.trim() || r.stdout.trim().split(/\r?\n/).slice(-3).join("\n");
  if (r.signal) return text ? `${text} (killed by ${r.signal})` : `killed by ${r.signal}`;
  return text || `exit ${r.status}`;
}

function writeOutputs(env, outputs) {
  if (!env.GITHUB_OUTPUT) return;
  appendFileSync(env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(""));
}

function checkFormats(env, log) {
  const { unknown } = parseFormats(env.INPUT_EXPORT);
  if (unknown.length === 0) return 0;
  log(`::error title=marey action::Unknown export format '${escapeData(unknown[0])}'. Valid formats: ${FORMATS.join(", ")}`);
  return 1;
}

/**
 * The validate step. Its `export` output says whether any format survives
 * parsing, so action.yml's later steps follow the parsed formats rather than
 * the raw input: `export: ","` installs no browser and uploads nothing.
 */
function validate(env, log) {
  if (checkFormats(env, log) !== 0) return 1;
  writeOutputs(env, { export: parseFormats(env.INPUT_EXPORT).formats.length > 0 });
  return 0;
}

export async function main(argv, env, cwd, rawLog) {
  if (argv[0] === "validate") return validate(env, rawLog);

  const annotations = [];
  const log = (s) => {
    if (s.startsWith("::error")) annotations.push(s);
    rawLog(s);
  };
  // The step outputs, and the same values plus every annotation in the file
  // MAREY_SUMMARY names, when it names one. The action's own workflow reads
  // that file to assert why a failed run failed.
  const finish = (outputs, code) => {
    writeOutputs(env, outputs);
    if (env.MAREY_SUMMARY) writeFileSync(env.MAREY_SUMMARY, `${JSON.stringify({ ...outputs, annotations })}\n`);
    return code;
  };

  if (checkFormats(env, log) !== 0) return finish({ checked: 0, errors: 1, "export-dir": "" }, 1);

  const patterns = parseFiles(env.INPUT_FILES);
  const { formats } = parseFormats(env.INPUT_EXPORT);
  const exportDir = env.INPUT_EXPORT_DIR || "marey-export";
  const cli = env.MAREY_CLI;

  const listed = run("git", ["ls-files", "-z", "--", ...patterns], cwd, env);
  if (listed.error || listed.status !== 0) {
    log(`::error title=marey check::git ls-files failed: ${escapeData(failureDetail(listed))}`);
    return finish({ checked: 0, errors: 1, "export-dir": "" }, 1);
  }
  const files = listed.stdout.split("\0").filter(Boolean);
  if (files.length === 0) {
    log(`::error title=marey check::No tracked file matches ${escapeData(patterns.join(" "))}`);
    return finish({ checked: 0, errors: 1, "export-dir": "" }, 1);
  }

  const exportReady = formats.length > 0 ? ["--export-ready", "--fps", String(EXPORT_FPS)] : [];
  const checked = run(process.execPath, [cli, "check", "--reporter", "github", ...exportReady, ...files], cwd, env);
  logLines(checked.stdout, log);
  logLines(checked.stderr, log);
  const errors = countErrors(checked.stdout);
  if (checked.error || checked.status !== 0) {
    // A spawn failure, a crash or a usage error prints no diagnostic of its
    // own, and a failed run with no annotation shows nothing in the checks UI.
    if (errors === 0) log(`::error title=marey check::${escapeData(failureDetail(checked))}`);
    return finish({ checked: files.length, errors: Math.max(errors, 1), "export-dir": "" }, 1);
  }
  if (formats.length === 0) return finish({ checked: files.length, errors: 0, "export-dir": "" }, 0);

  let failed = 0;
  for (const file of files) {
    const dir = resolve(cwd, exportCwd(exportDir, file));
    mkdirSync(dir, { recursive: true });
    for (const format of formats) {
      const r = run(process.execPath, [cli, "export", resolve(cwd, file), "--format", format], dir, env);
      logLines(r.stdout, log);
      if (r.error || r.status !== 0) {
        failed++;
        log(`::error file=${escapeProperty(file)},title=marey export::${escapeData(failureDetail(r))}`);
      }
    }
  }

  return finish({ checked: files.length, errors: failed, "export-dir": exportDir }, failed > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), process.env, process.cwd(), (s) => process.stdout.write(`${s}\n`));
}
