/**
 * `npm run check:pack`: packs the publishable package, installs the tarball
 * into an empty directory, and exercises the CLI and the library from there
 * (spec Phase 6 §2.1-2.4, §9.2 — exit criterion 1, "the package builds and
 * installs from a clean checkout").
 *
 * 1. `npm run build:package` (`build:lib`, `build:export-page`, `build:cli`).
 * 2. `npm pack --json` into a temporary directory. The tarball's file list
 *    must hold nothing under `docs/`, `eval/`, `tools/`, `src/` or `public/`
 *    — a leak past the `files` allowlist.
 * 3. `npm init -y`, then `npm install --offline <tarball>`, in a second,
 *    empty temporary directory: a real npm install of the published shape.
 *    Offline, because the tarball's only dependency is playwright-core,
 *    already in the npm cache from installing this repository.
 * 4. From that directory: `npx marey --version`; `npx marey check` on a copy
 *    of a canonical scene; `npx marey export ... --format lottie`, which
 *    uses the machine's already-installed Chromium (no environment variable
 *    is set); and a bare `import { compile } from "marey"` script.
 * 5. The consumer typecheck (spec §2.3): a small file that imports
 *    `compile`, `IRSceneNode` and `CompilerError` from "marey", compiled
 *    with this repository's own `tsc --noEmit --strict`, once under
 *    `--module esnext --moduleResolution bundler` and once under
 *    `--module nodenext --moduleResolution nodenext`. nodenext is the mode a
 *    plain Node consumer resolves under, and the one `fix-dts-extensions.mjs`
 *    (part of `build:lib`) exists to satisfy: `tsc` emits relative
 *    specifiers with no extension, which `bundler` resolution accepts and
 *    `nodenext` does not.
 *
 *    Both runs pass `--types` with no following value rather than the empty
 *    string: tsc's list-option parser rejects a literal `""` argument
 *    outright ("Compiler option 'types' expects an argument", TS6044,
 *    thrown before the list parser — which would otherwise happily turn ""
 *    into `[]` — ever runs). Followed immediately by the next `--` flag,
 *    `--types` is left with nothing to consume and resolves to an explicit
 *    `types: []`, the same "no ambient @types" result the empty string was
 *    meant to express. There is no `@types/*` package in the install
 *    directory either way, so this only guards against one appearing later.
 * 6. `node_modules/marey/dist/lib/marey.mjs` must not contain "pixi": the
 *    library's boundary (spec §2.3, enforced in-repo by
 *    `src/package/boundary.test.ts`) also holds in the shipped bundle.
 *
 * Each check prints one line; the script stops and exits 1 at the first
 * failure. Both temporary directories are removed in `finally`.
 *
 * Usage:
 *   npm run check:pack
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PACKAGE_VERSION = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version;
const SCENE_PATH = resolve(ROOT, "eval/scenes-3b/radial-dots.marey");
const TSC = resolve(ROOT, "node_modules/typescript/bin/tsc");

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

/** A files-allowlist leak: nothing packed may come from these directories. */
const FORBIDDEN_PREFIXES = ["docs/", "eval/", "tools/", "src/", "public/"];

/** `--noEmit --strict`, common to both resolution modes (see step 5 above for the bare `--types`). */
const TSC_BASE_ARGS = ["--noEmit", "--strict", "--skipLibCheck", "false", "--lib", "ES2022", "--types"];

/**
 * Runs `cmd` with `args`; never throws on a non-zero exit so the caller can
 * report it. `npm.cmd`/`npx.cmd` need `shell: true` on Windows: Node refuses
 * to spawn a `.cmd`/`.bat` file directly (EINVAL) since the Windows
 * argument-injection fix in Node 18.20.2/20.12.2/22 (GHSA-hjrf-2m68-5959).
 */
function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", shell: cmd.endsWith(".cmd"), ...options });
  if (result.error) throw result.error;
  return result;
}

const describe = (r) => `exit ${r.status}\n${r.stdout}${r.stderr}`.trim();

/** Runs one check, prints its line, and throws (already reported) on failure so the caller stops. */
function check(label, fn) {
  const started = Date.now();
  let detail;
  let ok;
  try {
    detail = fn();
    ok = true;
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
    ok = false;
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1).padStart(6);
  console.log(`${ok ? "ok  " : "FAIL"}  ${label.padEnd(42)} ${seconds} s  ${detail}`);
  if (!ok) {
    const stop = new Error(`stopped after: ${label}`);
    stop.alreadyReported = true;
    throw stop;
  }
}

let packDir = null;
let installDir = null;

try {
  check("build:package", () => {
    const r = run(NPM, ["run", "build:package"], { cwd: ROOT });
    if (r.status !== 0) throw new Error(describe(r));
    return "built dist/lib, dist/export-page, dist/cli";
  });

  let tarballPath;
  packDir = mkdtempSync(join(tmpdir(), "marey-pack-"));
  check("npm pack --json", () => {
    const r = run(NPM, ["pack", "--json", "--pack-destination", packDir], { cwd: ROOT });
    if (r.status !== 0) throw new Error(describe(r));
    const [info] = JSON.parse(r.stdout);
    tarballPath = join(packDir, info.filename);
    const leaked = info.files.filter((f) => FORBIDDEN_PREFIXES.some((p) => f.path.startsWith(p)));
    if (leaked.length > 0) {
      throw new Error(`${leaked.length} path(s) outside the files allowlist: ${leaked.map((f) => f.path).join(", ")}`);
    }
    return `${info.entryCount} files, ${info.size} B packed, ${info.unpackedSize} B unpacked`;
  });

  installDir = mkdtempSync(join(tmpdir(), "marey-install-"));
  check("npm init -y", () => {
    const r = run(NPM, ["init", "-y"], { cwd: installDir });
    if (r.status !== 0) throw new Error(describe(r));
    return "package.json created";
  });

  check("npm install --offline <tarball>", () => {
    const r = run(NPM, ["install", "--offline", tarballPath], { cwd: installDir });
    if (r.status !== 0) throw new Error(describe(r));
    return "installed";
  });

  check("npx marey --version", () => {
    const r = run(NPX, ["marey", "--version"], { cwd: installDir });
    const version = r.stdout.trim();
    if (r.status !== 0 || version !== PACKAGE_VERSION) {
      throw new Error(`printed '${version}', expected '${PACKAGE_VERSION}' (${describe(r)})`);
    }
    return version;
  });

  const sceneCopy = join(installDir, "radial-dots.marey");
  check("npx marey check <copy of radial-dots.marey>", () => {
    cpSync(SCENE_PATH, sceneCopy);
    const r = run(NPX, ["marey", "check", sceneCopy], { cwd: installDir });
    if (r.status !== 0) throw new Error(describe(r));
    return r.stdout.trim().split(/\r?\n/).at(-1) ?? "";
  });

  check("npx marey export <copy> --format lottie", () => {
    const r = run(NPX, ["marey", "export", sceneCopy, "--format", "lottie"], { cwd: installDir });
    const line = r.stdout.trim().split(/\r?\n/).at(-1) ?? "";
    if (r.status !== 0 || !line.startsWith("wrote ")) throw new Error(describe(r));
    return line;
  });

  check('node -e "import { compile } from \'marey\'"', () => {
    const script =
      "import { compile } from 'marey'; " +
      "const r = compile('scene { size: (10, 10) }'); " +
      "if (!r.ok) process.exit(1);";
    const r = run(process.execPath, ["--input-type=module", "-e", script], { cwd: installDir });
    if (r.status !== 0) throw new Error(describe(r));
    return "compiled a 10x10 scene";
  });

  const consumerPath = join(installDir, "consumer.ts");
  writeFileSync(
    consumerPath,
    [
      'import { compile, type IRSceneNode, type CompilerError } from "marey";',
      'const r = compile("scene { size: (10, 10) }");',
      "const ir: IRSceneNode | null = r.ir;",
      "const e: ReadonlyArray<CompilerError> = r.errors;",
      "export { ir, e };",
      "",
    ].join("\n"),
  );

  check("consumer typecheck: esnext / bundler", () => {
    const r = run(
      process.execPath,
      [TSC, ...TSC_BASE_ARGS, "--module", "esnext", "--moduleResolution", "bundler", consumerPath],
      { cwd: installDir },
    );
    if (r.status !== 0) throw new Error(describe(r));
    return "0 errors";
  });

  check("consumer typecheck: nodenext / nodenext", () => {
    const r = run(
      process.execPath,
      [TSC, ...TSC_BASE_ARGS, "--module", "nodenext", "--moduleResolution", "nodenext", consumerPath],
      { cwd: installDir },
    );
    if (r.status !== 0) throw new Error(describe(r));
    return "0 errors";
  });

  check("no pixi in the installed library bundle", () => {
    const bundlePath = join(installDir, "node_modules", "marey", "dist", "lib", "marey.mjs");
    const text = readFileSync(bundlePath, "utf8");
    const count = (text.match(/pixi/g) ?? []).length;
    if (count !== 0) throw new Error(`grep -c pixi: ${count}`);
    return "grep -c pixi: 0";
  });

  console.log("\ncheck:pack: all passed");
} catch (e) {
  if (!e.alreadyReported) console.error(e);
  process.exitCode = 1;
} finally {
  if (packDir !== null) rmSync(packDir, { recursive: true, force: true });
  if (installDir !== null) rmSync(installDir, { recursive: true, force: true });
}
