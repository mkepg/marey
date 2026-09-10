#!/usr/bin/env node
// Thin launcher. The CLI is built to dist/cli/ by `npm run build:cli`, because
// the compiler's relative imports are extensionless under
// moduleResolution: "bundler" and Node's native type stripping cannot resolve
// them. (erasableSyntaxOnly is already on, so the source is strip-compatible;
// the resolution problem is separate and is not fixed by it.)
import { main } from "../dist/cli/marey.mjs";
process.exit(await main(process.argv.slice(2)));
