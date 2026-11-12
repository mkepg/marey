# Phase 9B GitHub Action Implementation Plan

**Goal:** A composite GitHub Action at the repository root that checks every
tracked `.marey` file, puts each diagnostic on its line as an annotation, and
optionally exports the scenes as a workflow artifact. A starter fixture and a
workflow in this repository prove Gate C on a pull-request run.

**Architecture:** `marey check` gains a `--reporter github` that prints
workflow commands. `action.yml` installs the published `marey-lang` at its own
version, then hands over to `action/run.mjs`, a dependency-free Node script.
The script lists the files with `git ls-files`, runs the check, and exports
each scene into a mirrored directory. `.github/workflows/action.yml` runs the
action against `examples/starter/` from a tarball of the branch.

**Tech stack:** TypeScript (CLI), plain ESM on Node built-ins (action script),
GitHub Actions composite action, Vitest.

**Spec:** `docs/specs/2026-11-12-marey-phase-9b-github-action-design.md`

## Global Constraints

- Every commit passes the four `AGENTS.md` checks: `npm test`, `npx vitest run --config eval/vitest.config.ts`, `npm run build`, and `npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')`.
- Stage paths explicitly and read `git diff --staged` before committing. Never `git add -A`, `git add .` or `git add -f`.
- Commit subjects are Conventional Commits with scope `9b`, for example `feat(9b): ...`. Commit messages have no trailers naming a tool or assistant.
- Committed text describes the engineering only. It never mentions the assistant workflow, a skill, a plan-execution mode or a tool-specific path.
- `core.autocrlf` is on. Judge what changed with `git diff --stat -- <path>`, not `git status`.
- `action/run.mjs` uses only Node built-ins and needs no build step.
- The README's fenced blocks may only be tagged `marey`, `text` or `bash` (`src/compiler/languageDocs.test.ts`). YAML and HTML in the README go in a `text` fence.
- Do not change `netlify.toml`. Do not add `public/_redirects`.
- `npm run check:pack` still reports 127 files. `action/` and `examples/` are not in the package's `files`.
- Do not create git tags, publish to npm or push. Those are outside every task.

---

### Task 1: `marey check --reporter github`

**Files:**
- Modify: `src/cli/check.ts`
- Test: `src/cli/check.test.ts`
- Modify: `src/cli/main.test.ts`, only if it asserts the usage text

**Interfaces:**
- Produces: `export type Reporter = "text" | "github"`. `CheckArgs` gains `readonly reporter: Reporter`. New exports: `escapeData(s: string): string`, `escapeProperty(s: string): string`, `formatGithubAnnotation(file: string, e: { line?: number; col?: number; message: string }, title?: string): string`.
- `CHECK_USAGE` becomes exactly `marey check  [--export-ready] [--fps <n>] [--reporter <text|github>] <file...>`.

- [ ] **Step 1: Write the failing tests** in `src/cli/check.test.ts`. Add `escapeData`, `escapeProperty` and `formatGithubAnnotation` to the existing import from `./check`.

```ts
describe("--reporter", () => {
  it("defaults to text", () => {
    expect(parseArgs(["a.marey"]).reporter).toBe("text");
  });

  it("reads --reporter github", () => {
    const a = parseArgs(["--reporter", "github", "a.marey"]);
    expect(a.reporter).toBe("github");
    expect(a.error).toBeNull();
    expect(a.files).toEqual(["a.marey"]);
  });

  it("rejects an unknown reporter", () => {
    expect(parseArgs(["--reporter", "xml", "a.marey"]).error).toBe(
      "Unrecognized reporter 'xml'. Usage: marey check  [--export-ready] [--fps <n>] [--reporter <text|github>] <file...>"
    );
  });

  it("rejects --reporter with no value", () => {
    expect(parseArgs(["--reporter"]).error).toContain("Unrecognized reporter 'nothing'");
  });
});

describe("workflow-command escaping", () => {
  it("escapes %, CR and LF in data", () => {
    expect(escapeData("100% a\r\nb")).toBe("100%25 a%0D%0Ab");
  });

  it("also escapes : and , in a property", () => {
    expect(escapeProperty("a:b,c%")).toBe("a%3Ab%2Cc%25");
  });
});

describe("formatGithubAnnotation", () => {
  it("puts file, line and column on an error command", () => {
    expect(formatGithubAnnotation("scenes/a.marey", { line: 4, col: 7, message: "[TYPE_X] bad" })).toBe(
      "::error file=scenes/a.marey,line=4,col=7,title=marey check::[TYPE_X] bad"
    );
  });

  it("leaves the position out when the diagnostic has none", () => {
    expect(formatGithubAnnotation("a.marey", { message: "unbounded" })).toBe(
      "::error file=a.marey,title=marey check::unbounded"
    );
  });

  it("escapes the file as a property and the message as data", () => {
    expect(formatGithubAnnotation("x,y.marey", { message: "50%\nmore" })).toBe(
      "::error file=x%2Cy.marey,title=marey check::50%25%0Amore"
    );
  });

  it("takes another title", () => {
    expect(formatGithubAnnotation("a.marey", { message: "m" }, "marey export")).toBe(
      "::error file=a.marey,title=marey export::m"
    );
  });
});

describe("checkOne with the github reporter", () => {
  const broken = "scene {\n  size: (100, 100)\n  circle c { radius: oops }\n}\n";

  it("reports a compile error as an annotation on its line and column", () => {
    const r = checkOne("b.marey", broken, parseArgs(["--reporter", "github", "b.marey"]));
    expect(r.ok).toBe(false);
    expect(r.lines[0]).toMatch(/^::error file=b\.marey,line=3,col=22,title=marey check::In 'circle' object 'c': Undefined variable 'oops'\./);
  });

  it("keeps the text reporter's output unchanged", () => {
    const r = checkOne("b.marey", broken, parseArgs(["b.marey"]));
    expect(r.lines[0]).toMatch(/^b\.marey:3:22: In 'circle' object 'c'/);
  });
});
```

Also add one `checkOne` test for `--export-ready` with `--reporter github`. Reuse the unbounded-scene fixture the file's existing `--export-ready` tests already use. Assert that the line starts with `::error file=<that file>,title=marey check::` and has no `line=`.

- [ ] **Step 2: Run `npx vitest run src/cli/check.test.ts`.** Expect failures, because the exports do not exist yet.

- [ ] **Step 3: Implement** in `src/cli/check.ts`:

```ts
export type Reporter = "text" | "github";
const REPORTERS: readonly Reporter[] = ["text", "github"];

export const CHECK_USAGE =
  "marey check  [--export-ready] [--fps <n>] [--reporter <text|github>] <file...>";

/** Workflow-command data escaping, as GitHub's runner decodes it. */
export function escapeData(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** A property value is data with `:` and `,` escaped as well. */
export function escapeProperty(s: string): string {
  return escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

/**
 * One `::error` workflow command. GitHub shows it as an annotation on the
 * file, and on the line when the diagnostic has a position. Position-less
 * diagnostics (every `--export-ready` one) get a file-level annotation.
 */
export function formatGithubAnnotation(
  file: string,
  e: { readonly line?: number; readonly col?: number; readonly message: string },
  title = "marey check"
): string {
  const props = [`file=${escapeProperty(file)}`];
  if (e.line !== undefined && e.col !== undefined) props.push(`line=${e.line}`, `col=${e.col}`);
  props.push(`title=${escapeProperty(title)}`);
  return `::error ${props.join(",")}::${escapeData(e.message)}`;
}
```

- `parseArgs`: add `let reporter: Reporter = "text"`, and handle `--reporter` the way `--fps` is handled. Take the next token. If it is in `REPORTERS`, set it. Otherwise, when `error === null`, set it to ``Unrecognized reporter '${raw ?? "nothing"}'. Usage: ${CHECK_USAGE}``. Return `reporter` in the result.
- `checkOne`: wherever a diagnostic becomes a line, use `formatGithubAnnotation(file, e)` when `args.reporter === "github"` and `formatDiagnostic(file, e)` otherwise. Use one small local helper for this, not two copies of the ternary.
- `runCheck`: on a read failure with the github reporter, print `formatGithubAnnotation(file, { message })` with `console.log`, to stdout. The text reporter keeps its current `console.error` line. `<file>: ok` stays the same for both reporters.
- Update the comment above `CHECK_USAGE` if it claims anything the new line breaks.

- [ ] **Step 4: Run `npx vitest run src/cli`.** Everything passes. If `main.test.ts` pins the usage text, update it to the new `CHECK_USAGE`.

- [ ] **Step 5: Check by hand.** Run `npm run build:cli`, then run `node bin/marey.mjs check --reporter github` on a scratch copy of the broken scene above, outside the repository. Expect the annotation line and exit code 1.

- [ ] **Step 6: Run the four checks, then commit** `src/cli/check.ts src/cli/check.test.ts` (and `src/cli/main.test.ts` if it changed) as `feat(9b): marey check --reporter github prints diagnostics as workflow annotations`.

---

### Task 2: `action/run.mjs`

**Files:**
- Create: `action/run.mjs`
- Create: `action/run.test.ts`
- Modify: `vitest.config.ts`. Add `"action/**/*.test.ts"` to `include`.

**Interfaces:**
- Consumes: the CLI contract from Task 1, `check --reporter github [--export-ready] <files…>`, and the existing `export <file> --format <f>`, which writes the CLI's default file name into its working directory.
- Produces: `action/run.mjs`. When run as `node action/run.mjs validate`, it only validates `INPUT_EXPORT`. When run as `node action/run.mjs`, it does the whole run.
  - Environment: `MAREY_CLI` (the CLI entry file), `INPUT_FILES`, `INPUT_EXPORT`, `INPUT_EXPORT_DIR` and `GITHUB_OUTPUT` (optional).
  - Outputs: `checked`, `errors` and `export-dir`.
  - Exports: `FORMATS`, `parseFiles`, `parseFormats`, `exportCwd`, `countErrors`, `escapeData`, `escapeProperty`, `main`.

- [ ] **Step 1: Write `action/run.test.ts`.** Unit tests:
  - `parseFiles("")` → `["*.marey"]`; `parseFiles(" a.marey\n scenes/*.marey ")` → `["a.marey", "scenes/*.marey"]`.
  - `parseFormats("apng, lottie apng")` → `{ formats: ["apng", "lottie"], unknown: [] }`; `parseFormats("gif")` → `unknown: ["gif"]`; `parseFormats("")` → `formats: []`.
  - `exportCwd("marey-export", "scenes/a/logo.marey")` → `join("marey-export", "scenes", "a")`; `exportCwd("marey-export", "hello.marey")` → `"marey-export"`.
  - `countErrors("a: ok\n::error file=b::x\n::error file=c::y\n")` → `2`.
  - **Parity with the CLI.** `import { escapeData as cliData, escapeProperty as cliProp } from "../src/cli/check"`. For each of `["", "plain", "100%", "a\r\nb", "x:y,z", "%0A literal"]`, both pairs give identical output. This is the one guard against the two copies drifting.

  End-to-end tests call `main(argv, env, cwd, log)`, with `log` collecting lines into an array.
  - **Setup.** Make a temp directory, run `git init -q` in it, write the scene files, and `git add` them. Write a stub CLI `stub-cli.mjs` that appends `JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() })` plus a newline to `process.env.STUB_LOG`.
  - **Stub `check`.** For every argument ending in `bad.marey`, it prints `::error file=<arg>,line=1,col=1,title=marey check::boom`. Every other `.marey` argument prints `<arg>: ok`. It exits 1 when any argument was bad.
  - **Stub `export`.** It exits 1 with `cannot export` on stderr when the file ends in `noexport.marey`. Otherwise it prints `wrote x` and exits 0.
  - **Environment.** Pass `MAREY_CLI` (the stub) and `STUB_LOG`. Point `GITHUB_OUTPUT` at a temp file, and read it back to assert the outputs.

  The end-to-end cases:
  1. Check only: files `a.marey` and `scenes/b.marey`, with `INPUT_EXPORT` empty. Exit 0. Outputs are `checked=2`, `errors=0` and `export-dir=` (empty). The one stub call is `check --reporter github a.marey scenes/b.marey`, with no `--export-ready`.
  2. Check failure: `a.marey` and `bad.marey`, with `INPUT_EXPORT=apng`. Exit 1 and `errors=1`. The only stub call is `check`, with `--export-ready`. No `export` call happens, and `marey-export` does not exist.
  3. Export: `a.marey` and `scenes/b.marey`, with `INPUT_EXPORT="apng, lottie"` and `INPUT_EXPORT_DIR=out`. Exit 0. There are four export calls. Each passes the **absolute** path of the scene and its `--format`. The cwd is `<tmp>/out` for `a.marey` and `<tmp>/out/scenes` for `scenes/b.marey`. Both directories exist. The outputs include `export-dir=out`.
  4. Export failure carries on: `a.marey` and `noexport.marey`, with `INPUT_EXPORT=apng`. Exit 1 and `errors=1`. `a.marey` was still exported. The log has a line starting `::error file=noexport.marey,title=marey export::cannot export`.
  5. Empty match: `INPUT_FILES="nothing/*.marey"`. Exit 1, with the log line `::error title=marey check::No tracked file matches nothing/*.marey`.
  6. `main(["validate"], { INPUT_EXPORT: "apng gif" }, …)` exits 1. Its log line is `::error title=marey action::Unknown export format 'gif'. Valid formats: png, apng, webm, mp4, lottie`, and the stub is never called. `main(["validate"], { INPUT_EXPORT: "apng" }, …)` exits 0.

- [ ] **Step 2: Run `npx vitest run action`.** It fails, because `run.mjs` does not exist yet.

- [ ] **Step 3: Write `action/run.mjs`:**

```js
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

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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

  const listed = run("git", ["ls-files", "-z", "--", ...patterns], cwd);
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
  const checked = run(process.execPath, checkArgs, cwd);
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
      const r = run(process.execPath, [cli, "export", resolve(cwd, file), "--format", format], dir);
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
```

A check that fails with no `::error` line, such as a crash, still counts as at least one error. That is why `Math.max(errors, 1)` is there.

- [ ] **Step 4: Run `npx vitest run action`, then `npm test`.** All pass.

- [ ] **Step 5: Run the four checks, then commit** `action/run.mjs action/run.test.ts vitest.config.ts` as `feat(9b): the action's run step lists, checks and exports scenes into a mirrored directory`.

---

### Task 3: `action.yml`, the starter fixture and the Gate C workflow

**Files:**
- Create: `action.yml`
- Create: `examples/starter/hello.marey`, `examples/starter/README.md`, `examples/starter/.github/workflows/marey.yml`
- Create: `.github/workflows/action.yml`
- Modify: `.github/workflows/ci.yml` (header comment only)

**Interfaces:**
- Consumes: `action/run.mjs` from Task 2 (its `validate` mode, its environment variables and its `checked`, `errors` and `export-dir` outputs).
- Produces: the action's public inputs and outputs, exactly as spec §3.1 lists them. Task 4's README and Task 5's evidence read these names.

- [ ] **Step 1: Write `action.yml`:**

```yaml
name: Marey
description: Check Marey scenes, annotate each diagnostic on its line, and export the scenes as APNG, video, Lottie or PNG frames.
branding:
  icon: film
  color: blue

inputs:
  files:
    description: Git pathspecs of the scenes to check, separated by whitespace or newlines. Only tracked files are listed.
    default: "*.marey"
  export:
    description: "Formats to export when every scene passes: png, apng, webm, mp4, lottie, separated by whitespace or commas. Empty means check only."
    default: ""
  export-dir:
    description: Directory the exports go into, mirroring each scene's path.
    default: marey-export
  upload:
    description: Upload the export directory as a workflow artifact after a fully successful export.
    default: "true"
  artifact-name:
    description: Name of the uploaded artifact.
    default: marey-export
  package:
    description: An npm install spec to use instead of marey-lang at this action's own version, such as a tarball path.
    default: ""

outputs:
  checked:
    description: How many files were checked.
    value: ${{ steps.run.outputs.checked }}
  errors:
    description: Diagnostics reported by the check plus exports that failed.
    value: ${{ steps.run.outputs.errors }}
  export-dir:
    description: The export directory, or empty when nothing was exported.
    value: ${{ steps.run.outputs.export-dir }}

runs:
  using: composite
  steps:
    - name: Validate the inputs
      shell: bash
      env:
        INPUT_EXPORT: ${{ inputs.export }}
      run: node "$GITHUB_ACTION_PATH/action/run.mjs" validate

    # marey-lang needs Node 22. setup-node changes PATH for the rest of the
    # job, so it only runs when the runner's Node is older.
    - name: Check the Node version
      id: node
      shell: bash
      run: |
        major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
        if [ "$major" -lt 22 ]; then echo "setup=true" >> "$GITHUB_OUTPUT"; else echo "setup=false" >> "$GITHUB_OUTPUT"; fi
    - if: steps.node.outputs.setup == 'true'
      uses: actions/setup-node@v4
      with:
        node-version: 22

    - name: Install marey-lang
      shell: bash
      env:
        INPUT_PACKAGE: ${{ inputs.package }}
      run: |
        spec="$INPUT_PACKAGE"
        if [ -z "$spec" ]; then
          version=$(node -p 'require(process.argv[1]).version' "$GITHUB_ACTION_PATH/package.json")
          spec="marey-lang@$version"
          if ! npm view "$spec" version >/dev/null 2>&1; then
            echo "::error title=marey action::$spec is not published to npm yet. Pin this action to a commit whose version is published, or set the 'package' input."
            exit 1
          fi
        fi
        npm install --no-save --ignore-scripts --no-audit --no-fund --prefix "$RUNNER_TEMP/marey-cli" "$spec"

    - name: Install the export browser
      if: inputs.export != ''
      shell: bash
      run: node "$RUNNER_TEMP/marey-cli/node_modules/playwright-core/cli.js" install --with-deps chromium-headless-shell

    - name: Check and export
      id: run
      shell: bash
      env:
        MAREY_CLI: ${{ runner.temp }}/marey-cli/node_modules/marey-lang/bin/marey.mjs
        INPUT_FILES: ${{ inputs.files }}
        INPUT_EXPORT: ${{ inputs.export }}
        INPUT_EXPORT_DIR: ${{ inputs.export-dir }}
      run: node "$GITHUB_ACTION_PATH/action/run.mjs"

    - name: Upload the exports
      if: inputs.upload == 'true' && inputs.export != ''
      uses: actions/upload-artifact@v4
      with:
        name: ${{ inputs.artifact-name }}
        path: ${{ inputs.export-dir }}
        if-no-files-found: error
```

A composite step that fails skips every later step, so the upload only ever runs after a fully successful run (spec B7).

- [ ] **Step 2: Write `examples/starter/hello.marey`.**
  - It is a small original scene: `size`, `background` and a `duration` of 2 seconds or less, with one or two animated shapes and no `text`.
  - It must pass `node bin/marey.mjs check --export-ready examples/starter/hello.marey`.
  - Export it locally with `node bin/marey.mjs export examples/starter/hello.marey --format apng --out <scratch dir outside the repo>/hello.png`, and look at the `wrote` line. This needs the browser from the README's install command.
  - Pick the line the broken-scene job will break. It is a line whose value is replaced by the bare name `missing`, for example the `background:` line becoming `  background: missing`.
  - Apply that edit to a scratch copy and run `node bin/marey.mjs check --reporter github <copy>`. Record the exact `line=` and `col=` it prints. Step 4's comment states them.

- [ ] **Step 3: Write `examples/starter/README.md` and `examples/starter/.github/workflows/marey.yml`.**
  - The workflow is spec §1's workflow, with `uses: mkepg/marey@main` and this comment above it: `# Pin a full commit SHA of mkepg/marey instead of main for a reproducible build.`
  - The README is short. It covers four things:
    - copy this folder's contents to the root of a new repository and push;
    - every push and pull request checks `hello.marey`, and a mistake shows up as an annotation on its line;
    - when the check passes, the `marey-export` artifact holds `hello.png` (APNG) and `hello.json` (Lottie);
    - embed the APNG with `<img src="hello.png" alt="...">`. It plays with no script on the page.

    The README is not in the `languageDocs` set, but use `text` and `bash` fences anyway, to match the repository README.

- [ ] **Step 4: Write `.github/workflows/action.yml`:**

```yaml
# Runs the action at the repository root against examples/starter/, the way a
# new repository would use it, so Gate C (spec
# docs/specs/2026-11-12-marey-phase-9b-github-action-design.md §4) is measured
# on every pull request. Both jobs install the branch's own package from an
# `npm pack` tarball through the action's `package` input, so the run tests
# this commit's CLI by the same install path a user's run takes, short of the
# registry fetch.
name: Action

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: action-${{ github.ref }}
  cancel-in-progress: true

jobs:
  starter:
    name: the starter checks and exports
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Pack this commit's package
        id: pack
        run: |
          npm run build:package
          file=$(npm pack --silent | tail -n 1)
          echo "tarball=$GITHUB_WORKSPACE/$file" >> "$GITHUB_OUTPUT"
      - id: marey
        uses: ./
        with:
          files: examples/starter/*.marey
          export: apng lottie
          artifact-name: starter-export
          package: ${{ steps.pack.outputs.tarball }}
      - name: One scene checked, no errors, an APNG and a Lottie file
        env:
          CHECKED: ${{ steps.marey.outputs.checked }}
          ERRORS: ${{ steps.marey.outputs.errors }}
        run: |
          test "$CHECKED" = 1
          test "$ERRORS" = 0
          node -e '
            const fs = require("node:fs");
            const png = fs.readFileSync("marey-export/examples/starter/hello.png");
            if (!png.includes(Buffer.from("acTL"))) throw new Error("hello.png has no acTL chunk, so it is not an APNG");
            const lottie = JSON.parse(fs.readFileSync("marey-export/examples/starter/hello.json", "utf8"));
            if (!Array.isArray(lottie.layers)) throw new Error("hello.json has no layers array");
          '

  broken-scene:
    name: a broken scene fails with an annotation and exports nothing
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Pack this commit's package
        id: pack
        run: |
          npm run build:package
          file=$(npm pack --silent | tail -n 1)
          echo "tarball=$GITHUB_WORKSPACE/$file" >> "$GITHUB_OUTPUT"
      # <comment from Task 3 Step 2: the edit, and the exact line and column
      # the annotation must carry>
      - name: Edit the scene so it no longer compiles
        run: <the sed command from Step 2>
      - id: marey
        continue-on-error: true
        uses: ./
        with:
          files: examples/starter/*.marey
          export: apng
          package: ${{ steps.pack.outputs.tarball }}
      - name: The action failed and exported nothing
        env:
          OUTCOME: ${{ steps.marey.outcome }}
        run: |
          test "$OUTCOME" = failure
          test ! -e marey-export
```

Replace the two `<…>` placeholders with the comment and `sed -i` command that Step 2 settled. The `sed` must replace exactly one line.

- [ ] **Step 5: Correct the header of `.github/workflows/ci.yml`.** Its first paragraph says a published action is deliberately not there and is past the finish line. Replace it with one that says:
  - this workflow runs the repository's own checks;
  - the action that other repositories use is `action.yml` at the root;
  - `.github/workflows/action.yml` tests that action.

  Change nothing below the header comment.

- [ ] **Step 6: Run local checks.**
  - The four checks. The root check now includes `examples/starter/hello.marey`, and it must pass.
  - `npm test`, which must not newly fail on a test that counts or lists `.marey` files.
  - Then run the action's steps locally with Git Bash, in a scratch clone or a temp copy, simulating the composite:
    1. `npm run build:package && npm pack`;
    2. `npm install --no-save --ignore-scripts --prefix <tmp>/marey-cli <tarball>`;
    3. `MAREY_CLI=<tmp>/marey-cli/node_modules/marey-lang/bin/marey.mjs INPUT_FILES='examples/starter/*.marey' INPUT_EXPORT='apng lottie' INPUT_EXPORT_DIR=<tmp>/out node action/run.mjs` from the repository root.

  Record in the report:
  - the `wrote` lines;
  - that `<tmp>/out/examples/starter/hello.png` and `hello.json` exist;
  - the exit code.

  Delete the tarball and the temp directories afterwards. The tarball must not be staged.

- [ ] **Step 7: Commit.** Stage `action.yml`, `examples/starter/hello.marey`, `examples/starter/README.md`, `examples/starter/.github/workflows/marey.yml`, `.github/workflows/action.yml` and `.github/workflows/ci.yml`. Commit as `feat(9b): the composite action, a starter fixture, and a workflow that tests both on every pull request`.

---

### Task 4: Docs and 0.7.0

**Files:**
- Modify: `README.md`, `package.json`, `package-lock.json`, `docs/architecture/README.md`, `docs/architecture/roadmap-and-process.md`, `docs/specs/2026-09-09-marey-engineering-roadmap-design.md` (the §13 "Amended 2026-10-30" note only)
- Modify: any file under `docs/architecture/` that lists the repository's top-level directories or CI workflows. Find them with `git grep -n "tools/cli-check\|workflows/ci.yml" -- docs/architecture`.

**Interfaces:**
- Consumes: the CLI option from Task 1, the inputs and outputs from Task 3, and spec §5's limits.

- [ ] **Step 1: Write a README section, "Check scenes in CI".** Put it after the CLI section and before "Embed a scene". It shows:
  - spec §1's workflow, in a `text` fence;
  - the inputs and outputs, as a table;
  - that every tracked file matching `files` is checked;
  - that annotations land on the diagnostic's line;
  - that the artifact mirrors source paths;
  - pinning by full commit SHA, with the reason (the repository's old `v0.x` tags predate the npm versions);
  - that it is tested on `ubuntu-latest`;
  - a pointer to `examples/starter/`.
- [ ] **Step 2: Document the option in the README's CLI section.** Add one sentence and an example for `marey check --reporter github`.
- [ ] **Step 3: Bump the version to 0.7.0.** Set `"version": "0.7.0"` in `package.json`, and the two matching `version` fields at the top of `package-lock.json` (the root and `packages[""]`). Then run `npm install --package-lock-only --ignore-scripts` and confirm that `git diff --stat -- package-lock.json` shows only those lines.
- [ ] **Step 4: Update the status lines.**
  - Add a 9B line to `docs/architecture/README.md` and `roadmap-and-process.md`, next to the 9A lines: "9B (GitHub Action and Gate C) implemented on a branch; Gate C measured on its pull-request run; evidence in `eval/RESULTS-PHASE-9B.md`".
  - Add one sentence to the roadmap §13 note, saying 9B's spec is `2026-11-12-marey-phase-9b-github-action-design.md`.
  - Update any directory or workflow listing found above for `action.yml`, `action/`, `examples/starter/` and `.github/workflows/action.yml`.
- [ ] **Step 5: Run the four checks and `npm run check:pack`.** The pack check must still report 127 files and name 0.7.0. Then commit the changed files as `docs(9b): document the action and the reporter, and bump to 0.7.0`.

---

### Task 5: Gate C evidence

Run after the branch's pull-request run has finished. The data comes from the
GitHub API and the downloaded artifact. The dispatch brief carries it as a
file, and this task writes it up.

**Files:**
- Create: `eval/RESULTS-PHASE-9B.md`
- Modify: the 9B status lines from Task 4, to say the evidence is recorded

- [ ] **Step 1: Write `eval/RESULTS-PHASE-9B.md`.** It has one section per spec §4.3 item, plus a table mapping each spec §6 exit criterion to its evidence. Every number in it comes from the data file. It states which of the bytes and the `frames` hash matched across operating systems, as measured.
- [ ] **Step 2: Run the four checks and commit** as `docs(9b): record the Gate C evidence from the pull-request run`.
