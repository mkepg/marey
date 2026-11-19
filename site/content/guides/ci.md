---
title: Check scenes in CI
description: Check every Marey scene in a repository on each push with GitHub Actions, using a plain workflow step or the Marey action, its inputs and outputs, annotations, exported artifacts, pinning by commit SHA, and the starter folder.
---

A check on every push keeps a broken scene out of the main branch. There are
two ways to run one on GitHub Actions: a workflow step that runs `marey check`
itself, which works with the version on npm today, and the Marey action, which
annotates each error on its line and can export every scene, and needs a
version that is not published yet.

## With the published version

`marey-lang` 0.6.0 is on npm. This workflow, saved as
`.github/workflows/marey.yml` in your repository, sets up Node 22 and checks
every scene in a `scenes` folder on each push and pull request:

```yaml
name: Marey
on: [push, pull_request]
jobs:
  scenes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npx --yes marey-lang@0.6.0 check scenes/*.marey
```

The shell expands `scenes/*.marey` to the file names. `check` prints each
error with its file, line and column, and exits with 1 when any file fails,
which fails the step and the run. Add `--export-ready` to also fail a scene
that cannot be exported ([Install and check](/guides/install/#ready-to-export)).

With 0.7.0, the same step can print each error as a GitHub annotation, which
shows on its line in the pull request's diff:

```yaml
      - run: npx --yes marey-lang@0.7.0 check --reporter github scenes/*.marey
```

0.6.0 has no `--reporter` and stops with `Unrecognized option '--reporter'`, so
use this form only once 0.7.0 is on npm.

## The Marey action

The Marey repository is also a GitHub Action. It checks every tracked scene
that matches a pattern, annotates each diagnostic on its file and line, and,
when every scene passes, can export each one and upload the files as a
workflow artifact.

:::warn
The action runs `check --reporter github`, which 0.6.0 does not have, so it
needs **`marey-lang` 0.7.0 or later**, and 0.7.0 is not published yet. Until it
is, the action stops at its install step with:

```text
marey-lang@0.7.0 is not published to npm yet. Pin this action to a commit whose version is published, or set the 'package' input.
```
:::

Once 0.7.0 is on npm, this workflow checks every `.marey` file in the
repository and exports each one as an animated PNG and as Lottie:

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

### Pin it by commit

Replace `<commit-sha>` with the full 40-character hash of a commit in
`mkepg/marey` whose `package.json` names a published version. The action
installs `marey-lang` at the `version` in `package.json` at the commit you pin,
so the commit decides the version. A full hash cannot be moved to other code
later, as a branch can. There are no release tags to pin instead: the
repository's old `v0.x` tags predate the npm versions and do not match them.

`@main` works too, once `main`'s version is published, and follows every
change to it.

### Inputs

| Input | Default | Meaning |
|---|---|---|
| `files` | `*.marey` | Git pathspecs of the scenes to check, separated by spaces or new lines. Only tracked files are listed. |
| `export` | (empty) | Formats to export when every scene passes: `png`, `apng`, `webm`, `mp4`, `lottie`, separated by spaces or commas. Empty means check only. |
| `export-dir` | `marey-export` | Directory the exports go into. |
| `upload` | `true` | Upload `export-dir` as a workflow artifact after a fully successful export. |
| `artifact-name` | `marey-export` | Name of the uploaded artifact. |
| `package` | (empty) | An npm install spec to use instead of `marey-lang` at the action's own version, such as a tarball path. |

`files` matches the way `git ls-files` does, against tracked files only, so a
scene that is not committed is not checked. Give file patterns such as
`scenes/*.marey` rather than a directory: `scenes` alone lists every tracked
file under it, images included, and the action tries to compile each. A
pattern cannot contain a space, because `files` is split on spaces; match a
space with `?`. A pattern that matches no file fails the run. An unknown
format in `export` fails it before anything is installed.

The action lists files in the workspace, so check out the repository at its
root: a checkout into a subdirectory (`path:` on `actions/checkout`) is not
found.

### Outputs

| Output | Meaning |
|---|---|
| `checked` | How many files were checked. |
| `errors` | Diagnostics reported by the check, plus exports that failed. |
| `export-dir` | The export directory, or empty when nothing was exported. |

A later step reads them through the step's `id`:

```yaml
      - id: marey
        uses: mkepg/marey@<commit-sha>
      - run: echo "Checked ${{ steps.marey.outputs.checked }} scenes"
```

### Annotations

Each diagnostic becomes an error annotation on its file and line, in the run
and in the pull request's diff. A diagnostic with no position, such as
a scene that cannot be exported, is annotated on its file. A check that fails
with no diagnostic of its own, such as a command that cannot start, still
leaves one annotation saying why.

GitHub shows a limited number of annotations: 10 errors per step and 50
annotations per job, by the figures in the actions/toolkit documentation.
Every diagnostic is always in the run's log.

### Exports and artifacts

With `export` set, the action installs the export browser, then checks every
scene with `--export-ready` at 30 frames a second, the rate it exports at. If
any scene fails, nothing is exported. Otherwise it exports each scene in each
format, at the scene's own `duration`, with [`marey export`](/guides/export/).

The export directory mirrors the scenes' paths, so `scenes/intro/logo.marey`
exports to `marey-export/scenes/intro/logo.json`, and two scenes with the same
name in different folders do not overwrite each other. Each file keeps the
default name for its format.

When every export succeeds and `upload` is `true`, the directory is uploaded as
one artifact named by `artifact-name`, which the run's summary page offers for
download. If any export fails, its error is annotated on the scene and nothing
is uploaded.

### Node and runners

`marey-lang` needs Node 22. When the runner's Node is older, the action sets up
Node 22 with `actions/setup-node`, and that Node stays on `PATH` for the rest of
the job. The action is tested on `ubuntu-latest` only.

## The starter folder

[`examples/starter/`](https://github.com/mkepg/marey/tree/main/examples/starter)
in the Marey repository is a complete repository root: one scene,
`hello.marey`, a workflow that runs the action on it, and a README. From a
clone of the Marey repository, copy the folder's contents, including the hidden
`.github/` directory, to the root of a new repository:

```bash
cp -r examples/starter/. my-scenes/
```

`cp -r examples/starter/. <dir>` copies the hidden directory too;
`cp examples/starter/* <dir>` leaves it behind. The starter's workflow uses
`mkepg/marey@main`, which fails at the install step until 0.7.0 is on npm;
pin a commit from after the publish instead. When the check passes, the run
uploads `hello.png`, an animated PNG, and `hello.json`, a Lottie file. Commit
the PNG and it plays in your README with no script.

The Marey repository runs the action against this folder on every pull
request.
