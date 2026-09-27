import { runCheck, CHECK_USAGE } from "./check";
import { EXPORT_USAGE } from "./exportArgs";
import { runExport } from "./exportDriver";
import packageJson from "../../package.json";

/**
 * A plain, mutable object — not `Object.freeze`d — so a test can
 * `vi.spyOn(COMMANDS, "check")` to replace a command with a mock. `main`
 * below looks a command up as `COMMANDS[name]` at call time rather than
 * destructuring this at module load, so that replacement is actually seen.
 */
export const COMMANDS: Readonly<Record<string, (rest: readonly string[]) => Promise<number>>> = {
  check: runCheck,
  export: runExport,
};

/**
 * Re-exported so the bundle (`dist/cli/marey.mjs`) carries them: the export
 * checks drive `exportScene` directly and launch with the same flags.
 */
export { exportScene, EXPORT_LAUNCH_ARGS } from "./exportDriver";

/**
 * Lists every command's synopsis (spec Phase 6 §3), so `--help` and the
 * no-argument case both name every command instead of just the one that was
 * typed wrong. `check` and `export`'s lines are composed from `CHECK_USAGE`
 * and `EXPORT_USAGE` — the one copy of each that `check.ts` and
 * `exportArgs.ts`'s own error messages also use (PF-R4) — under a single
 * "Usage:" heading, rather than each command labelling its own line: spec
 * §3's synopsis is one block with one heading, and `check`/`export`'s
 * bracketed arguments share a column (`marey check  ` and `marey export `
 * are both 13 characters) precisely because neither constant carries its own
 * "Usage: " prefix.
 */
const USAGE = ["Usage:", CHECK_USAGE, EXPORT_USAGE, "marey --help", "marey --version"].join("\n");

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
