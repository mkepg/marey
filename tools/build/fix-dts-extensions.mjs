// Rewrites the relative specifiers in the library's emitted declarations
// (dist/lib/types/**/*.d.ts) so they carry an explicit extension: `./x`
// becomes `./x.js`, or `./x/index.js` when `x` is a directory with an
// `index.d.ts`. `tsc` emits them extensionless, as written in the source
// under `moduleResolution: "bundler"`, and a consumer compiling with
// `moduleResolution: "nodenext"` cannot resolve an extensionless specifier.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/lib/types");

// `from "./x"`, `import("./x")` and bare `import "./x"`, with either quote.
const SPECIFIER = /((?:from|import)\s*\(?\s*)(["'])(\.{1,2}\/[^"']*)\2/g;

function declarationFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return declarationFiles(path);
    return path.endsWith(".d.ts") ? [path] : [];
  });
}

function withExtension(file, spec) {
  if (/\.(?:m|c)?js$/.test(spec)) return spec;
  const target = resolve(dirname(file), spec);
  if (existsSync(`${target}.d.ts`)) return `${spec}.js`;
  if (existsSync(join(target, "index.d.ts"))) return `${spec}/index.js`;
  throw new Error(`${file}: cannot resolve the relative specifier "${spec}" to a declaration file`);
}

if (!existsSync(ROOT)) {
  throw new Error(`${ROOT} does not exist: run \`tsc -p tsconfig.lib.json\` first`);
}

let rewritten = 0;
for (const file of declarationFiles(ROOT)) {
  const before = readFileSync(file, "utf8");
  const after = before.replace(SPECIFIER, (_m, lead, quote, spec) => `${lead}${quote}${withExtension(file, spec)}${quote}`);
  if (after !== before) {
    writeFileSync(file, after);
    rewritten += 1;
  }
}
console.log(`fix-dts-extensions: ${rewritten} declaration file(s) rewritten under ${ROOT}`);
