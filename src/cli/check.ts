import { readFileSync } from "node:fs";
import { compileSource } from "../compiler/compileSource";
import { planExport, type ExportDiagnosticCode } from "../compiler/export/exportContract";
import type { CompilerError } from "../compiler/types";

export interface CheckArgs {
  readonly files: readonly string[];
  readonly exportReady: boolean;
  readonly fps: number | null;
  readonly error: string | null;
}

/**
 * The rate `--export-ready` probes with when the caller gave no `--fps`.
 *
 * It divides TICK_HZ (120), so `planExport`'s own EXPORT_UNSUPPORTED_FPS can
 * never fire *because of this particular value* — the point is not to guess
 * a frame rate the user would want, it is to ask a rate-independent question
 * ("is this scene bounded at all?") using a rate that cannot itself be the
 * problem. Its exact value is otherwise unobservable: every diagnostic whose
 * meaning depends on *which* rate was picked is filtered out below, in
 * RATE_DEPENDENT_CODES, precisely because no rate was actually requested and
 * the output must not pretend one was.
 */
const PROBE_FPS = 30;

const RATE_DEPENDENT_CODES: ReadonlySet<ExportDiagnosticCode> = new Set([
  "EXPORT_UNSUPPORTED_FPS",
  "EXPORT_EMPTY_SEQUENCE",
  "EXPORT_FRAME_BUDGET",
]);

const USAGE = "Usage: marey check [--export-ready] [--fps <n>] <file...>";

/** Pure. Never touches argv beyond what is passed in. */
export function parseArgs(argv: readonly string[]): CheckArgs {
  const files: string[] = [];
  let exportReady = false;
  let fps: number | null = null;
  let error: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--export-ready") {
      exportReady = true;
      continue;
    }
    if (arg === "--fps") {
      const raw = argv[i + 1];
      i++;
      const parsed = raw === undefined ? NaN : Number(raw);
      if (error === null) {
        if (!Number.isFinite(parsed)) {
          error = `--fps requires a numeric value, got ${raw ?? "nothing"}`;
        } else {
          fps = parsed;
        }
      }
      continue;
    }
    // Any other `--`-prefixed token is a typo'd or unsupported flag, not a
    // filename — e.g. `--fps=30` (the more common CLI idiom, which this
    // parser does not accept) must not be silently read as a file to open.
    // Left uncaught, that produced a misleading ENOENT blaming a "missing
    // file" for what was actually a flag-syntax mistake.
    if (arg.startsWith("--")) {
      if (error === null) {
        error = `Unrecognized option '${arg}'. ${USAGE}`;
      }
      continue;
    }
    files.push(arg);
  }

  // --fps only means anything alongside --export-ready (checkOne never reads
  // args.fps otherwise). Silently accepting it as a no-op would let a
  // mistyped flag pair (e.g. forgetting --export-ready) report "ok" for a
  // scene that would actually fail an export check — a false pass from a
  // tool whose entire job is to not produce one.
  if (error === null && fps !== null && !exportReady) {
    error = `--fps has no effect without --export-ready. ${USAGE}`;
  }

  if (error === null && files.length === 0) {
    error = `no files given. ${USAGE}`;
  }

  return { files, exportReady, fps, error };
}

/**
 * Pure. `e` is typed as `CompilerError`, but this also formats
 * `ExportDiagnostic`s from `checkOne` below via an inline `{ phase, message }`
 * literal — both shapes carry a `message`, and only `CompilerError` carries a
 * position, so a diagnostic with no `line`/`col` renders with no position
 * rather than `:undefined:undefined`.
 */
export function formatDiagnostic(file: string, e: CompilerError): string {
  const position = e.line !== undefined && e.col !== undefined ? `:${e.line}:${e.col}` : "";
  return `${file}${position}: ${e.message}`;
}

/** Pure: compiles `source` in memory and never touches the filesystem. */
export function checkOne(
  file: string,
  source: string,
  args: CheckArgs
): { readonly ok: boolean; readonly lines: readonly string[] } {
  const outcome = compileSource(source);

  if (!outcome.ok) {
    return { ok: false, lines: outcome.errors.map((e) => formatDiagnostic(file, e)) };
  }

  if (!args.exportReady) {
    return { ok: true, lines: [] };
  }

  // outcome.ok === true guarantees outcome.ir !== null (compileSource.ts's
  // own contract: `ok: errors.length === 0 && ir !== null`).
  const fps = args.fps ?? PROBE_FPS;
  const result = planExport(outcome.ir!, { fps });

  if (result.ok) {
    return { ok: true, lines: [] };
  }

  // No --fps means no rate was actually requested, so drop every diagnostic
  // whose meaning depends on which rate was picked (see PROBE_FPS above).
  // What survives answers only "is this scene bounded at all?".
  const diagnostics =
    args.fps === null
      ? result.diagnostics.filter((d) => !RATE_DEPENDENT_CODES.has(d.code))
      : result.diagnostics;

  if (diagnostics.length === 0) {
    return { ok: true, lines: [] };
  }

  return {
    ok: false,
    lines: diagnostics.map((d) => formatDiagnostic(file, { phase: "EXPORT", message: d.message })),
  };
}

/**
 * The only impure part: reads files, prints, and reports an exit code.
 *
 * `argv` is `process.argv.slice(2)` from `bin/marey.mjs`, i.e. it still
 * carries the `check` subcommand token (`marey check <files>`). `check` is
 * the only command today, so this only strips that one token rather than
 * building out a subcommand table for a single entry.
 */
export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command !== "check") {
    console.error(`Unknown command '${command ?? ""}'. The only command is 'check'.`);
    return 1;
  }

  const args = parseArgs(rest);
  if (args.error !== null) {
    console.error(args.error);
    return 1;
  }

  let allOk = true;
  for (const file of args.files) {
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch (err) {
      console.error(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      allOk = false;
      continue;
    }

    const { ok, lines } = checkOne(file, source, args);
    for (const line of lines) console.log(line);
    if (ok) {
      console.log(`${file}: ok`);
    } else {
      allOk = false;
    }
  }

  return allOk ? 0 : 1;
}
