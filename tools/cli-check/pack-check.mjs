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
 * 3. `npm init -y`, then `npm install --prefer-offline <tarball>`, in a
 *    second, empty temporary directory: a real npm install of the published
 *    shape. npm documents `--prefer-offline` as bypassing staleness
 *    checks for cached data and requesting only missing data from the server.
 *    It is not offline: the install may still contact the registry (a
 *    2026-10-07 run on a warm cache logged a metadata GET marked "cache
 *    stale" and an audit POST). The tarball's only dependency is
 *    playwright-core. On a cold cache (CI, after `npm ci`) the
 *    cache holds playwright-core's tarball but not its registry metadata,
 *    which an install into an empty directory needs to resolve the version,
 *    so `--offline` fails there with ENOTCACHED; `--prefer-offline` fetches
 *    that metadata.
 * 4. From that directory: `npx marey --version`; `npx marey check` on a copy
 *    of a canonical scene; `npx marey export ... --format lottie`, which
 *    uses the machine's already-installed Chromium (no environment variable
 *    is set); and a bare `import { compile } from "marey-lang"` script.
 * 5. The consumer typecheck (spec §2.3): a small file that imports
 *    `compile`, `IRSceneNode` and `CompilerError` from "marey-lang", compiled
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
 * 6. `node_modules/marey-lang/dist/lib/marey.mjs` must not contain "pixi": the
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
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PACKAGE_VERSION = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version;
const SCENE_PATH = resolve(ROOT, "eval/scenes-3b/radial-dots.marey");
const TSC = resolve(ROOT, "node_modules/typescript/bin/tsc");

/**
 * `npm-cli.js` / `npx-cli.js`, run directly through this process's own
 * `node` rather than through the `npm`/`npx` launcher (`npm.cmd`/`npx.cmd`
 * on Windows). Spawning a `.cmd` file needs `shell: true` on Windows since
 * Node's argument-injection fix (GHSA-hjrf-2m68-5959), and `shell: true`
 * joins an args array with plain spaces and does no quoting of its own — so
 * any argument containing a space (a tarball or scene path under
 * `os.tmpdir()`, which has one for a Windows user like `C:\Users\Jane
 * Doe\...`) silently splits into two arguments. Invoking the CLI's own JS
 * entry point through `process.execPath` sidesteps both problems: it is a
 * plain executable, not a shell built-in, so Node quotes each array element
 * itself (as it already does for the `tsc`/`node` calls below), on every
 * platform.
 *
 * `npm_execpath` is `npm-cli.js`'s own path, set by npm whenever a script
 * runs the way `check:pack` is meant to run, through `npm run`; `npx-cli.js`
 * is always its sibling in the same `bin/` directory. The fallback (checked
 * near the running `node` binary, where a Node install that bundles npm
 * keeps it) only matters for a bare `node tools/cli-check/pack-check.mjs`.
 */
function resolveNpmCli(name) {
  const npmExecPath = process.env.npm_execpath;
  const bin =
    npmExecPath !== undefined
      ? dirname(npmExecPath)
      : [
          resolve(dirname(process.execPath), "node_modules/npm/bin"),
          resolve(dirname(process.execPath), "../lib/node_modules/npm/bin"),
        ].find(existsSync);
  const file = bin && join(bin, `${name}-cli.js`);
  if (file === undefined || !existsSync(file)) {
    throw new Error(`cannot locate ${name}-cli.js; run this script through \`npm run check:pack\``);
  }
  return file;
}

const NPM_CLI = resolveNpmCli("npm");
const NPX_CLI = resolveNpmCli("npx");

/** A files-allowlist leak: nothing packed may come from these directories. */
const FORBIDDEN_PREFIXES = ["docs/", "eval/", "tools/", "src/", "public/"];

/** `--noEmit --strict`, common to both resolution modes (see step 5 above for the bare `--types`). */
const TSC_BASE_ARGS = ["--noEmit", "--strict", "--skipLibCheck", "false", "--lib", "ES2022", "--types"];

/** Runs `cmd` with `args`; never throws on a non-zero exit so the caller can report it. */
function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

/** `npm <args>`, through `npm-cli.js` (see `resolveNpmCli` above). */
const runNpm = (args, options) => run(process.execPath, [NPM_CLI, ...args], options);

/**
 * `npx <args>`, through `npx-cli.js`: still npx, still the check that the
 * installed package's bin link actually works, just invoked without a shell.
 */
const runNpx = (args, options) => run(process.execPath, [NPX_CLI, ...args], options);

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
    const r = runNpm(["run", "build:package"], { cwd: ROOT });
    if (r.status !== 0) throw new Error(describe(r));
    return "built dist/lib, dist/export-page, dist/cli";
  });

  let tarballPath;
  packDir = mkdtempSync(join(tmpdir(), "marey-pack-"));
  check("npm pack --json", () => {
    const r = runNpm(["pack", "--json", "--pack-destination", packDir], { cwd: ROOT });
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
    const r = runNpm(["init", "-y"], { cwd: installDir });
    if (r.status !== 0) throw new Error(describe(r));
    return "package.json created";
  });

  check("npm install --prefer-offline <tarball>", () => {
    const r = runNpm(["install", "--prefer-offline", tarballPath], { cwd: installDir });
    if (r.status !== 0) throw new Error(describe(r));
    return "installed";
  });

  check("npx marey --version", () => {
    const r = runNpx(["marey", "--version"], { cwd: installDir });
    const version = r.stdout.trim();
    if (r.status !== 0 || version !== PACKAGE_VERSION) {
      throw new Error(`printed '${version}', expected '${PACKAGE_VERSION}' (${describe(r)})`);
    }
    return version;
  });

  const sceneCopy = join(installDir, "radial-dots.marey");
  check("npx marey check <copy of radial-dots.marey>", () => {
    cpSync(SCENE_PATH, sceneCopy);
    const r = runNpx(["marey", "check", sceneCopy], { cwd: installDir });
    if (r.status !== 0) throw new Error(describe(r));
    return r.stdout.trim().split(/\r?\n/).at(-1) ?? "";
  });

  check("npx marey export <copy> --format lottie", () => {
    const r = runNpx(["marey", "export", sceneCopy, "--format", "lottie"], { cwd: installDir });
    const line = r.stdout.trim().split(/\r?\n/).at(-1) ?? "";
    if (r.status !== 0 || !line.startsWith("wrote ")) throw new Error(describe(r));
    return line;
  });

  check('node -e "import { compile } from \'marey-lang\'"', () => {
    const script =
      "import { compile } from 'marey-lang'; " +
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
      'import { compile, type IRSceneNode, type CompilerError } from "marey-lang";',
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
    const bundlePath = join(installDir, "node_modules", "marey-lang", "dist", "lib", "marey.mjs");
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
