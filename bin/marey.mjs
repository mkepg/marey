#!/usr/bin/env node
// Thin launcher. The CLI is built to dist/cli/ by `npm run build:cli`, because
// the compiler's relative imports are extensionless under
// moduleResolution: "bundler" and Node's native type stripping cannot resolve
// them. (erasableSyntaxOnly is already on, so the source is strip-compatible;
// the resolution problem is separate and is not fixed by it.)
import { main } from "../dist/cli/marey.mjs";
// Not process.exit(): that forces the process down even with async work
// still pending, including a pending `process.stdout` write. stdout to a
// pipe (`marey check ... | tee log`, or most CI runners) is asynchronous on
// POSIX, so process.exit() here could truncate this tool's own diagnostic
// output while still reporting exit 1 — a linter silently dropping the
// output it exists to produce. process.exitCode lets Node exit naturally
// once stdout has drained; the exit-code contract is unchanged.
process.exitCode = await main(process.argv.slice(2));
