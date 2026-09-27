import { runCheck, CHECK_USAGE } from "./check";
import packageJson from "../../package.json";

/**
 * A plain, mutable object — not `Object.freeze`d — so a test can
 * `vi.spyOn(COMMANDS, "check")` to replace a command with a mock. `main`
 * below looks a command up as `COMMANDS[name]` at call time rather than
 * destructuring this at module load, so that replacement is actually seen.
 *
 * Task 7 adds `export: runExport` here.
 */
export const COMMANDS: Readonly<Record<string, (rest: readonly string[]) => Promise<number>>> = {
  check: runCheck,
};

/**
 * Lists every command's synopsis (spec Phase 6 §3), so `--help` and the
 * no-argument case both name every command instead of just the one that was
 * typed wrong. `check`'s synopsis is composed from `CHECK_USAGE` — the one
 * copy that `check.ts`'s own error messages also use — rather than retyped
 * here. `export` is not in `COMMANDS` yet (Task 7 adds it), so its synopsis
 * is a literal for now; Task 6 replaces this line with an `EXPORT_USAGE`
 * constant `check.ts`-style.
 */
const USAGE = [
  CHECK_USAGE,
  "marey export <file> --format <png|apng|webm|mp4|lottie>",
  "             [--fps <n>] [--duration <s>] [--out <path>]",
  "marey --help",
  "marey --version",
].join("\n");

/** The bundle entry `bin/marey.mjs` calls with `process.argv.slice(2)`. */
export async function main(argv: readonly string[]): Promise<number> {
  // A bare `marey` (empty argv) is a request for guidance, not a typo'd
  // command name — printing `Unknown command ''.` reads as a bug report
  // about the empty quotes, and buries USAGE (below) under a confusing
  // message instead of showing it.
  if (argv.length === 0) {
    console.error(USAGE);
    return 1;
  }

  const [name, ...rest] = argv;

  if (name === "--help" || name === "-h") {
    console.log(USAGE);
    return 0;
  }

  if (name === "--version" || name === "-v") {
    console.log(packageJson.version);
    return 0;
  }

  const command = COMMANDS[name];
  if (command === undefined) {
    console.error(`Unknown command '${name}'. Commands: ${Object.keys(COMMANDS).join(", ")}.`);
    return 1;
  }

  return command(rest);
}
