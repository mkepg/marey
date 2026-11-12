// The action's run step. Plain ESM on Node built-ins only, so the action
// needs no build. action.yml installs marey-lang and passes its CLI entry in
// MAREY_CLI. Spec: docs/specs/2026-11-12-marey-phase-9b-github-action-design.md §3.3.
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FORMATS = ["png", "apng", "webm", "mp4", "lottie"];

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

function run(cmd, args, cwd, env) {
  return spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function writeOutputs(env, outputs) {
  if (!env.GITHUB_OUTPUT) return;
  appendFileSync(env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(""));
}

function validate(env, log) {
  const { unknown } = parseFormats(env.INPUT_EXPORT);
  if (unknown.length === 0) return 0;
  log(`::error title=marey action::Unknown export format '${escapeData(unknown[0])}'. Valid formats: ${FORMATS.join(", ")}`);
  return 1;
}

export async function main(argv, env, cwd, log) {
  if (argv[0] === "validate") return validate(env, log);
  if (validate(env, log) !== 0) return 1;

  const patterns = parseFiles(env.INPUT_FILES);
  const { formats } = parseFormats(env.INPUT_EXPORT);
  const exportDir = env.INPUT_EXPORT_DIR || "marey-export";
  const cli = env.MAREY_CLI;

  const listed = run("git", ["ls-files", "-z", "--", ...patterns], cwd, env);
  if (listed.status !== 0) {
    log(`::error title=marey check::git ls-files failed: ${escapeData(listed.stderr.trim())}`);
    return 1;
  }
  const files = listed.stdout.split("\0").filter(Boolean);
  if (files.length === 0) {
    log(`::error title=marey check::No tracked file matches ${escapeData(patterns.join(" "))}`);
    writeOutputs(env, { checked: 0, errors: 1, "export-dir": "" });
    return 1;
  }

  const checkArgs = [cli, "check", "--reporter", "github", ...(formats.length > 0 ? ["--export-ready"] : []), ...files];
  const checked = run(process.execPath, checkArgs, cwd, env);
  for (const line of checked.stdout.split(/\r?\n/)) if (line !== "") log(line);
  for (const line of (checked.stderr ?? "").split(/\r?\n/)) if (line !== "") log(line);
  let errors = countErrors(checked.stdout);
  if (checked.status !== 0) {
    writeOutputs(env, { checked: files.length, errors: Math.max(errors, 1), "export-dir": "" });
    return 1;
  }

  for (const file of files) {
    for (const format of formats) {
      const dir = resolve(cwd, exportCwd(exportDir, file));
      mkdirSync(dir, { recursive: true });
      const r = run(process.execPath, [cli, "export", resolve(cwd, file), "--format", format], dir, env);
      for (const line of r.stdout.split(/\r?\n/)) if (line !== "") log(line);
      if (r.status !== 0) {
        errors++;
        const detail = (r.stderr ?? "").trim() || `exit ${r.status}`;
        log(`::error file=${escapeProperty(file)},title=marey export::${escapeData(detail)}`);
      }
    }
  }

  writeOutputs(env, { checked: files.length, errors, "export-dir": formats.length > 0 ? exportDir : "" });
  return errors > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), process.env, process.cwd(), (s) => process.stdout.write(`${s}\n`));
}
