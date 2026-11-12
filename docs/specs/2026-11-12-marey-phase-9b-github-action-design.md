# Phase 9B — GitHub Action and Gate C

**Date:** 2026-11-12
**Status:** Approved design. The owner delegated every design call in the
roadmap §13 group on 2026-10-30 (see the Phase 9A spec, §0). The calls below
are recorded as decisions, not as owner rulings.
**Roadmap:** `2026-09-09-marey-engineering-roadmap-design.md` §13, and the
Phase 9A spec's §7, which recorded what 9B would cover.
**Gate C** (old product roadmap `2026-09-01-marey-product-roadmap-design.md`
§11.3): "A new user can clone a repository, edit one canonical scene, receive
a CI validation result, and embed the generated artifact without opening the
Marey IDE or loading the Marey runtime in production."

---

## 0. Decisions

| # | Decision | Why |
|---|---|---|
| B1 | The action installs the **published package** from npm. Its default spec is `marey-lang@<version>`, where `<version>` is the `version` in `package.json` at the action's own ref. A `package` input overrides the spec with any npm install spec, such as a tarball path. | The CLI then runs from the same files `npm install marey-lang` gives a user. At any published commit, the action's logic and the CLI it runs come from the same version. Building from source would `npm ci` every dev dependency (Monaco, PixiJS, Vite) on every user's run. |
| B2 | Files come from `git ls-files` with the `files` input as git pathspecs. The default is `*.marey`, which matches at any depth. **Every matching tracked file is checked, not just the changed ones.** | `check` takes milliseconds per file and needs no browser. Changed-file detection depends on the event payload and the fetch depth, and a wrong base would pass a broken scene silently. Checking everything is the version that cannot give a false pass. |
| B3 | A pattern list that matches **no file is a failure**. | A typo in `files` that checks nothing and reports green is a false pass. |
| B4 | Annotations come from the CLI: `marey check --reporter github` prints GitHub workflow commands. There is no problem matcher, and the action does not parse the text output. | The text format is for people and has no stability promise. A reporter is a pure function the unit suite can test, including the escaping. `export` already uses `--format`, so `check` takes `--reporter`. |
| B5 | Exports mirror the source tree under `export-dir` (default `marey-export`), so `scenes/a/logo.marey` exports to `marey-export/scenes/a/logo.json`. The action runs `marey export` with the mirrored directory as its working directory and keeps the CLI's default file name. | Two scenes with the same base name in different folders cannot overwrite each other. The CLI's `defaultOutPath` stays the one owner of the format-to-extension mapping, so the action never copies the list. |
| B6 | When `export` is set, the check runs with `--export-ready`, and nothing exports unless every file passes. | An unbounded scene then fails with the exporter's own diagnostic, on the check step, before any browser starts. |
| B7 | The export directory is uploaded as one workflow artifact, **only when the whole run succeeded**. `upload: false` turns this off. | A failed check has nothing worth publishing, and a partial export would look complete. |
| B8 | Node is set up only when the runner's Node is older than 22, the package's `engines` floor. | `actions/setup-node` changes the `PATH` for the rest of the user's job. The action does that only when it has to. |
| B9 | The browser is installed only when `export` is set, with the `playwright-core` that `marey-lang` itself depends on (`install --with-deps chromium-headless-shell`). | `check` needs no browser. Using the package's own `playwright-core` means the browser always matches the version `export` launches. |
| B10 | The action is tested on `ubuntu-latest` only, and the docs say so. | Export's browser and system dependencies are only exercised there. No claim is made about a platform this phase has not run. |
| B11 | **No release tags.** The repository already carries tags `v0.1.0` to `v0.26.1` from the project's history before the rename, and `v0.6.0` and `v0.7.0` among them point at March 2026 commits. The docs tell users to pin the action by **commit SHA**. A tag scheme for the action is the owner's call. | Moving a published tag rewrites published history, which needs the owner. Pinning by full SHA is GitHub's own hardening advice for third-party actions. |
| B12 | Gate C is proved on a **pull request run** in this repository, before the merge. The branch is pushed and a PR is opened, so the new workflow runs from the branch. The evidence is read back from the GitHub API and from the downloaded artifact. | A workflow can only be shown to work by running it on GitHub. A PR runs the branch's own workflow files, so the gate is measured before `main` changes. |
| B13 | The starter fixture lives in `examples/starter/`. It is laid out exactly as a new repository's root would be: a scene, a README that embeds the exported APNG with a plain `<img>`, and `.github/workflows/marey.yml`. The scene is a small original bounded scene, not a copy of a canonical one. | "Copy this folder's contents into a new repository" is then the whole set of instructions. A copied canonical scene would drift from its original. A bounded scene can be exported. |
| B14 | A separate template repository is **not created**. | It is outward-facing and was recorded as the owner's call in the 9A spec, §7. |
| B15 | The package version for 9B is **0.7.0**. The owner publishes, as for 0.6.0. | `--reporter` is a new CLI option, which is a minor version. The action's default install spec reads this version, so the action only works from `main` once 0.7.0 is on npm. §5 records that window. |

## 1. What a repository author writes

`.github/workflows/marey.yml` in their repository:

```yaml
name: Marey
on: [push, pull_request]
jobs:
  scenes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: mkepg/marey@<commit-sha>
        with:
          export: apng lottie
```

Every tracked `.marey` file is checked. A diagnostic appears as an error
annotation on its file and line, in the run and in the pull request's diff.
When every file passes, each one is exported as an APNG and a Lottie JSON, and
the `marey-export` artifact holds them under their source paths. An APNG is
embedded with `<img src="hello.png">`, which needs no Marey code at all.

## 2. The CLI reporter

`marey check` gains `--reporter <text|github>`. The default is `text`.

- **`text`** is today's output, byte for byte.
- **`github`** prints one line per diagnostic:
  `::error file=<file>,line=<line>,col=<col>,title=marey check::<message>`.
  - `line` and `col` are left out when the diagnostic has no position, as
    `--export-ready` diagnostics have none. They are the same 1-based numbers
    the text reporter prints.
  - A file that cannot be read prints the same command, with the read error as
    the message and no position, to **stdout**. The runner reads workflow
    commands from stdout.
  - A file that passes still prints `<file>: ok`.
  - Escaping follows the workflow-command rules. In the message, `%`, `\r`
    and `\n` become `%25`, `%0D` and `%0A`. In a property value, `:` and `,`
    also become `%3A` and `%2C`.
- An unknown reporter is a usage error:
  `Unrecognized reporter '<x>'. Usage: <CHECK_USAGE>`.
- `CHECK_USAGE` becomes
  `marey check  [--export-ready] [--fps <n>] [--reporter <text|github>] <file...>`.
- The exit code is unchanged: 0 when every file passes, 1 otherwise.

## 3. The action

### 3.1 Interface

`action.yml` at the repository root, `runs.using: composite`.

| Input | Default | Meaning |
|---|---|---|
| `files` | `*.marey` | Git pathspecs, separated by whitespace or newlines. |
| `export` | (empty) | Formats to export, separated by whitespace or commas: `png`, `apng`, `webm`, `mp4`, `lottie`. Empty means check only. |
| `export-dir` | `marey-export` | Where exports go, relative to the workspace. |
| `upload` | `true` | Upload `export-dir` as an artifact after a fully successful export. |
| `artifact-name` | `marey-export` | The uploaded artifact's name. |
| `package` | (empty) | An npm install spec that replaces `marey-lang@<version>` (B1). |

| Output | Meaning |
|---|---|
| `checked` | How many files were checked. |
| `errors` | How many diagnostics the check reported, plus how many exports failed. |
| `export-dir` | The export directory, or empty when nothing was exported. |

An unknown format in `export` fails the run before anything is installed. The
message lists the five valid formats.

### 3.2 Steps

1. **Node.** Read the runner's Node major version. Run `actions/setup-node`
   with `node-version: 22` only when it is below 22 (B8).
2. **Install.** Run `npm install --no-save --ignore-scripts --prefix
   "$RUNNER_TEMP/marey-cli" <spec>`. If the default spec is not on npm, the
   step fails with a message saying that version is not published yet, and
   that it can be fixed by pinning a published commit or setting `package`.
3. **Browser**, only when `export` is set: run the installed
   `playwright-core` with `install --with-deps chromium-headless-shell` (B9).
4. **Run** `node "$GITHUB_ACTION_PATH/action/run.mjs"`, with the inputs
   passed as environment variables and the CLI's entry file
   (`<prefix>/node_modules/marey-lang/bin/marey.mjs`) as `MAREY_CLI`.
5. **Upload**, when `upload` is `true`, `export` is set and step 4 succeeded,
   with `actions/upload-artifact@v7` (B7).

### 3.3 `action/run.mjs`

Plain ESM that uses only Node built-ins, so the action needs no build step. It
exports its pure parts for the unit suite and runs `main()` only when it is
executed directly.

1. Parse `files` and `export`. Validate the formats against the five names,
   and fail on an unknown one.
2. List the files with `git ls-files -z -- <pathspecs>`. Fail with
   `::error title=marey check::No tracked file matches <patterns>` when the
   list is empty (B3).
3. Run `node $MAREY_CLI check --reporter github [--export-ready --fps 30] <files…>`,
   streaming its stdout into the log. Count the lines that start with
   `::error`. 30 is `marey export`'s default rate, so the frame budget is
   judged at the rate the export uses.
4. When the check failed, write the outputs and exit 1. Nothing is exported
   (B6). A failed check that printed no `::error` line of its own (a crash, a
   usage error) gets one `::error title=marey check::` annotation with what it
   printed. With no formats, write the outputs and stop here.
5. For each file and each format, run `node $MAREY_CLI export <absolute file>
   --format <f>`, with the working directory set to `<export-dir>/<the file's
   directory>`, created first (B5). On a non-zero exit, print
   `::error file=<file>,title=marey export::<stderr, escaped>`, count it, and
   continue with the next export.
6. Write `checked`, `errors` and `export-dir` to `$GITHUB_OUTPUT` and exit 1
   if `errors` > 0.

The tests in `action/run.test.ts` cover the parsing, the format validation,
the mirrored working directory and the empty-match failure. They also run
`main()` end to end against a stub CLI script, which records its argv and
working directory and fails on cue. The test never runs the real CLI. The
vitest `include` gains `action/**/*.test.ts`.

## 4. Gate C in this repository

### 4.1 Fixture

`examples/starter/` holds the following. It is checked by the root
`marey check $(git ls-files '*.marey')` like every other scene.

- `hello.marey`, a small original scene with a `duration`.
- `README.md`, saying "copy this folder's contents into a new repository".
  It shows the exported APNG embedded with `<img src="hello.png">`.
- `.github/workflows/marey.yml`, the workflow from §1. It uses
  `mkepg/marey@main`, with a comment telling the user to pin a commit SHA.

### 4.2 Workflow

`.github/workflows/action.yml`, which runs on `pull_request` and on `push` to
`main`. Both jobs build the package and `npm pack` it, and pass the tarball's
absolute path as `package`. That tests the branch's own CLI through the same
install path a user takes, short of the registry fetch.

- **`starter`** runs `uses: ./` with `files: examples/starter/*.marey`,
  `export: apng lottie` and `artifact-name: starter-export`. It then asserts
  three things:
  - `outputs.errors` is `0` and `outputs.checked` is `1`;
  - `marey-export/examples/starter/hello.png` exists and carries an `acTL`
    chunk;
  - `hello.json` parses as JSON with a `layers` array.

  The `wrote …` line each export prints stays in the job log, and §4.3 reads
  its `frames` hash from there.
- **`broken-scene`** edits the tracked `examples/starter/hello.marey` in the
  runner's checkout, the "edit one scene" of Gate C. It injects one undefined
  variable at a known line, then runs `uses: ./` with `continue-on-error: true`
  and `export: apng`. It asserts that the step's outcome is `failure` and that
  `marey-export` does not exist.

The header comment of `.github/workflows/ci.yml` says a published action is
deliberately not there and is past the finish line. That stops being true, and
the comment is corrected to point at the new workflow.

### 4.3 Evidence

`eval/RESULTS-PHASE-9B.md` records the following, measured from the PR run:

1. The run's URL, and both jobs' conclusions.
2. The `broken-scene` job's annotations, from `gh api
   repos/<owner>/<repo>/check-runs/<id>/annotations`. The path must be
   `examples/starter/hello.marey`, and the line and column must be where the
   injection put the error.
3. The `starter-export` artifact, downloaded with `gh run download`. Record the
   APNG's sha256 and its frame count (`acTL` `num_frames`). Compare the
   `frames` hash in the CI log's `wrote …` line with the one a local `marey
   export` of the same scene prints on the development machine. The `frames`
   hashes must match. Whether the bytes match across the two operating systems
   is recorded as measured, not assumed.
4. That the APNG renders in a plain HTML page through `<img>` with no script
   on the page.

## 5. Out of scope, and known limits

- Changed-file-only checking (B2).
- Windows and macOS runners (B10).
- Release tags, a Marketplace listing and a template repository (B11, B14).
  Listing the action needs the owner's account. A repository with
  `action.yml` at its root works with `uses:` without a listing.
- **The window between merge and publish.** From the merge until the owner
  publishes 0.7.0, `mkepg/marey@main` asks npm for a version that does not
  exist, and the install step fails with the §3.2 message. Pinning any commit
  from after the publish avoids it, and so does setting `package`.
- Committing exports back to the repository, or deploying them to Pages.
  Gate C needs the artifact to be embeddable, and the README shows how.

## 6. Exit criteria

1. `marey check --reporter github` passes its unit tests, including escaping
   and position-less diagnostics, and `--reporter text` output is unchanged.
2. `action/run.test.ts` passes, including the end-to-end run against the stub
   CLI.
3. The four repository checks in `AGENTS.md` pass, and `npm run check:pack`
   still reports 127 files.
4. On the PR run, both jobs conclude `success`. `broken-scene` succeeds
   because its asserted failure happened.
5. The annotation read back from the API is on `examples/starter/hello.marey`,
   at the injected line and column.
6. The `frames` hash of the CI APNG export matches the local export's, and
   the downloaded APNG's frame count matches the scene's duration at 30 fps.
7. `eval/RESULTS-PHASE-9B.md`, the README section and the status lines in
   `docs/architecture/` record what was measured.
