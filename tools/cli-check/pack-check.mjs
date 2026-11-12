/**
 * `npm run check:pack`: packs the publishable package, installs the tarball
 * into an empty directory, and exercises the CLI, the library and the player from there
 * (spec Phase 6 §2.1-2.4, §9.2 — exit criterion 1, "the package builds and
 * installs from a clean checkout").
 *
 * 1. `npm run build:package` (`build:lib`, `build:player`, `build:export-page`, `build:cli`).
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
 * 7. `marey-lang/player` resolves through the package `exports` to
 *    `dist/player/marey-player.mjs`. The entry's static import closure (not
 *    the entry file alone) must hold no `render-*.mjs` and no "pixi", and the
 *    lazy-only closure (reached through `import()`) must be non-empty: the
 *    two-stage split, proved on the built bundle.
 * 8. The installed `dist/player/` is served over HTTP to headless Chromium
 *    with a page holding `<marey-player autoplay>` and an inline scene that
 *    has `text`. The element must fire `ready`, mount a `<canvas>` in its
 *    shadow root and raise no page error or console error, and the page must
 *    itself have requested the scene font at `fonts/JetBrainsMono-Regular.ttf`
 *    and got a 200. The request comes from the render chunk's own font URL,
 *    so a wrong font path there fails this check.
 * 9. The tarball's file count equals `EXPECTED_FILE_COUNT`.
 *
 * Each check prints one line; the script stops and exits 1 at the first
 * failure. Both temporary directories are removed in `finally`.
 *
 * Usage:
 *   npm run check:pack
 */
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

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

/**
 * The tarball's file count. It must change whenever `files` in package.json or
 * a build's outputs change (a new chunk, a new asset): it is the tarball's own
 * list from `npm pack --json`, measured and not predicted.
 */
const EXPECTED_FILE_COUNT = 127;

/**
 * Chromium flags for headless WebGL. A literal copy of `EXPORT_LAUNCH_ARGS`
 * in `src/cli/exportDriver.ts`: this script is plain JS and cannot import the
 * TypeScript source. Keep the two in step.
 */
const PLAYER_LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"];

const PLAYER_FONT_PATH = "/fonts/JetBrainsMono-Regular.ttf";

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

/**
 * The player's module graph in the installed `dist/player/`. `staticFiles` is
 * the closure of `marey-player.mjs` over static imports (`from "./x.mjs"` and
 * `import "./x.mjs"`) only: what a page loads before any scene mounts.
 * `lazyFiles` is everything else reachable once `import("./x.mjs")` is
 * followed. Rolldown puts shared modules in chunks, so the PixiJS boundary has
 * to be checked over the whole static closure, not the entry file alone.
 */
function playerClosures(dir) {
  const STATIC = /\b(?:import|export)\s*(?:[\w$*{}\s,]*?\bfrom\s*)?["']\.\/([^"']+)["']/g;
  const DYNAMIC = /\bimport\(\s*["']\.\/([^"']+)["']\s*\)/g;
  const edges = (file) => {
    const text = readFileSync(join(dir, file), "utf8");
    return {
      static: [...text.matchAll(STATIC)].map((m) => m[1]),
      dynamic: [...text.matchAll(DYNAMIC)].map((m) => m[1]),
    };
  };
  const walk = (start, kinds) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const e = edges(queue.pop());
      for (const next of kinds.flatMap((k) => e[k])) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  };
  const entry = "marey-player.mjs";
  const staticSet = walk(entry, ["static"]);
  const all = walk(entry, ["static", "dynamic"]);
  return {
    staticFiles: [...staticSet].sort(),
    lazyFiles: [...all].filter((f) => !staticSet.has(f)).sort(),
  };
}

/** `check` for an async body. */
async function checkAsync(label, fn) {
  const started = Date.now();
  let detail;
  let ok;
  try {
    detail = await fn();
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

const CONTENT_TYPES = { ".mjs": "text/javascript", ".html": "text/html", ".ttf": "font/ttf", ".txt": "text/plain" };

/** Serves `playerDir` plus a generated index.html on a free port. */
async function serveStatic(playerDir, indexHtml) {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "content-type": "text/html" }).end(indexHtml);
      return;
    }
    const file = resolve(playerDir, `.${path}`);
    if (!file.startsWith(playerDir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, port: server.address().port };
}

let packDir = null;
let installDir = null;

try {
  check("build:package", () => {
    const r = runNpm(["run", "build:package"], { cwd: ROOT });
    if (r.status !== 0) throw new Error(describe(r));
    return "built dist/lib, dist/player, dist/export-page, dist/cli";
  });

  let tarballPath;
  let entryCount = 0;
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
    entryCount = info.entryCount;
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

  check("marey-lang/player resolves through exports", () => {
    const r = run(
      process.execPath,
      ["--input-type=module", "-e", "console.log(import.meta.resolve('marey-lang/player'))"],
      { cwd: installDir },
    );
    const url = r.stdout.trim();
    if (r.status !== 0 || !url.startsWith("file:") || !url.endsWith("node_modules/marey-lang/dist/player/marey-player.mjs")) {
      throw new Error(`resolved '${url}' (${describe(r)})`);
    }
    return "dist/player/marey-player.mjs";
  });

  const playerDir = join(installDir, "node_modules", "marey-lang", "dist", "player");
  check("player's static import closure holds no PixiJS", () => {
    const { staticFiles, lazyFiles } = playerClosures(playerDir);
    const bytes = (names) => names.reduce((n, f) => n + statSync(join(playerDir, f)).size, 0);
    const problems = [];
    for (const f of staticFiles) {
      if (/^render-.*\.mjs$/.test(f)) problems.push(`${f} is in the static closure`);
      if (readFileSync(join(playerDir, f), "utf8").includes("pixi")) problems.push(`${f} contains "pixi"`);
    }
    if (lazyFiles.length === 0) problems.push("the lazy closure is empty: the renderer is not split out");
    if (problems.length > 0) throw new Error(problems.join("; "));
    return (
      `static ${staticFiles.length} files ${bytes(staticFiles)} B [${staticFiles.join(", ")}]; ` +
      `lazy-only ${lazyFiles.length} files ${bytes(lazyFiles)} B [${lazyFiles.join(", ")}]`
    );
  });

  await checkAsync("player draws an inline scene in Chromium", async () => {
    const page =
      "<!doctype html><meta charset=utf-8>" +
      "<style>body{margin:0}marey-player{display:block;width:320px;height:180px}</style>" +
      '<marey-player id="p" autoplay><script type="text/marey">' +
      "scene { size: (320, 180) duration: 2 circle c { position: (160, 90), radius: 30 } " +
      'text t { position: (20, 20), content: "marey", fontSize: 24 } }' +
      "</script></marey-player>" +
      // The listener is attached before the module can run, so `ready` cannot be missed.
      '<script>window.__ready = new Promise((ok) => document.getElementById("p").addEventListener("ready", () => ok(true), { once: true }));</script>' +
      '<script type="module" src="./marey-player.mjs"></script>';
    const { server, port } = await serveStatic(playerDir, page);
    let browser;
    try {
      browser = await chromium.launch({ args: [...PLAYER_LAUNCH_ARGS] });
      const tab = await browser.newPage();
      const problems = [];
      const fontResponses = [];
      tab.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      tab.on("console", (m) => {
        if (m.type() === "error") problems.push(`console error: ${m.text()}`);
      });
      tab.on("response", (r) => {
        if (new URL(r.url()).pathname === PLAYER_FONT_PATH) fontResponses.push(r.status());
      });
      let timer;
      try {
        await tab.goto(`http://127.0.0.1:${port}/`);
        await Promise.race([
          tab.evaluate(() => window.__ready),
          new Promise((_, no) => {
            timer = setTimeout(() => no(new Error("no ready event within 20 s")), 20_000);
          }),
        ]);
        await tab.waitForFunction(() => document.getElementById("p").shadowRoot.querySelector("canvas") !== null, null, {
          timeout: 20_000,
        });
      } catch (e) {
        // What the page reported is usually why it never got ready.
        throw new Error([e instanceof Error ? e.message : String(e), ...problems].join("; "));
      } finally {
        clearTimeout(timer);
      }
      if (fontResponses.join() !== "200") {
        throw new Error(`the player's requests for ${PLAYER_FONT_PATH} answered [${fontResponses.join(", ")}], expected one 200`);
      }
      if (problems.length > 0) throw new Error(problems.join("; "));
      return "ready, canvas mounted, the player fetched its font (200)";
    } finally {
      if (browser) await browser.close();
      await new Promise((done) => server.close(done));
    }
  });

  check("tarball file count", () => {
    if (entryCount !== EXPECTED_FILE_COUNT) {
      throw new Error(`${entryCount} files, expected ${EXPECTED_FILE_COUNT}`);
    }
    return `${entryCount} files`;
  });

  console.log("\ncheck:pack: all passed");
} catch (e) {
  if (!e.alreadyReported) console.error(e);
  process.exitCode = 1;
} finally {
  if (packDir !== null) rmSync(packDir, { recursive: true, force: true });
  if (installDir !== null) rmSync(installDir, { recursive: true, force: true });
}
