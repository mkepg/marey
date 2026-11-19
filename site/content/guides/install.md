---
title: Install and check
description: Install the marey-lang package, check scene files with marey check, read its output and exit codes, and compile scenes from JavaScript with the library entry point.
---

The npm package `marey-lang` holds three things: the `marey` command, which
checks and exports scene files; the compiler as a JavaScript function; and the
`<marey-player>` element, which [the embed guide](/guides/embed/) covers. This
guide installs the package and covers `marey check` and the library.
[Export](/guides/export/) covers `marey export`.

:::note
This site documents the language and tools on Marey's `main` branch, which is
version 0.7.0. Everything on this page also works on 0.6.0, except
`--reporter`, which needs 0.7.0 or later; the section on it says so. The
commands below install the newest version npm has.
:::

## Install

`marey-lang` needs Node 22 or later. Add it to a project as a development
dependency:

```bash
npm install --save-dev marey-lang
npx marey --version
```

The package installs one command, `marey`. `npx marey` runs the copy in the
project. `--version` (or `-v`) prints the version you have, and `--help` (or
`-h`) lists every command with its options:

```text
Usage:
marey check  [--export-ready] [--fps <n>] [--reporter <text|github>] <file...>
marey export <file> --format <png|apng|webm|mp4|lottie>
             [--fps <n>] [--duration <s>] [--out <path>]
marey --help
marey --version
```

That is 0.7.0's list. 0.6.0 prints the same lines without
`[--reporter <text|github>]`. When this page and your version's `--help`
disagree, `--help` describes the version you are running.

To run the command once without adding it to a project, name the package and
pin its version:

```bash
npx --yes marey-lang@0.6.0 check scene.marey
```

`--yes` lets npx download the package without asking, which a script or a CI
job needs.

## Check a file

`marey check` compiles each file it is given and prints one line for each file
that compiles:

```bash
npx marey check lighthouse.marey
```

```text
lighthouse.marey: ok
```

A file that does not compile gets one line per diagnostic instead: the file,
the line and the column, then the compiler's message, the same message a
sample on this site or the playground shows. Save this as `broken.marey`:

```marey error
scene {
  size: (960, 540)
  duration: 2
  circle lamp { position: (480, 270), radius: 60, color: #ffd84d, alpha: 1.5 }
}
```

and check it beside a file that is fine:

```bash
npx marey check broken.marey lighthouse.marey
```

```text
broken.marey:4:74: 'circle' object 'lamp': 'alpha' must be between 0.0 and 1.0 inclusive, but got 1.5.
lighthouse.marey: ok
```

Every file is checked, even after one fails. A file that cannot be read is
reported with the system's message, and checking goes on with the next.
[Reading errors](/guides/errors/) explains how the messages are put together
and walks through a dozen common ones.

## Exit codes

`marey check` exits with:

| Code | When |
|---|---|
| `0` | Every file compiled, and with `--export-ready`, every file can be exported. |
| `1` | Any file failed or could not be read, or the command line was wrong. |

A wrong command line prints one line saying what is wrong, followed by the
usage, and checks nothing. These are the cases:

- no file names (`no files given`);
- an option `check` does not have, including `--fps=30`, which it reads as an
  unknown option rather than as a file name;
- `--fps` without `--export-ready` (next section);
- a `--reporter` value other than `text` or `github`.

Diagnostics and `ok` lines go to standard output. Command-line errors go to
standard error, and so does a file that cannot be read, unless the reporter is
`github`.

## Ready to export

A scene can compile and still be impossible to export. `--export-ready` adds
the checks an export makes before it starts:

```bash
npx marey check --export-ready scenes/*.marey
```

Without `--fps`, it asks one question: does the scene have an end? A scene with
no `duration` runs forever, so it has no last frame to write. Checked with
`--export-ready`, a `lamp.marey` with no `duration` gets:

```text
lamp.marey: [EXPORT_UNBOUNDED_SCENE] This scene declares no 'duration', so it has no finite length to export. Add 'duration: <seconds>' to the scene block, or pass an explicit export bound.
```

With `--fps <n>`, it also checks the scene at that frame rate. The rate must
divide 120, the simulation's ticks per second, so that every frame lands on a
tick: 24, 30 and 60 do, 25 does not. And the export must come to 7,200 frames
or fewer, which is 4 minutes at 30 frames a second:

```bash
npx marey check --export-ready --fps 60 lighthouse.marey
```

`--fps` means something only with `--export-ready`. `check --fps 30` on its own
is refused rather than reporting `ok` for a check it did not make:

```text
--fps has no effect without --export-ready. Usage: marey check  [--export-ready] [--fps <n>] [--reporter <text|github>] <file...>
```

The export bound that the message about `duration` mentions is
`marey export --duration`, which [Export](/guides/export/) covers. `check` has
no `--duration`, so a scene without a `duration` always fails
`--export-ready`.

## Annotations on GitHub

:::warn
`--reporter` needs `marey-lang` 0.7.0 or later. Version 0.6.0 refuses it:

```text
Unrecognized option '--reporter'. Usage: marey check  [--export-ready] [--fps <n>] <file...>
```
:::

`--reporter github` prints each diagnostic as a GitHub Actions workflow
command. Run inside a workflow, each one becomes an error annotation on its
file and line, in the run and in the pull request's diff:

```bash
npx marey check --reporter github broken.marey lighthouse.marey
```

```text
::error file=broken.marey,line=4,col=74,title=marey check::'circle' object 'lamp': 'alpha' must be between 0.0 and 1.0 inclusive, but got 1.5.
lighthouse.marey: ok
```

A diagnostic with no position, such as every `--export-ready` one, becomes an
annotation on the file alone, and so does a file that cannot be read. The exit
codes are the same as with the default,
`--reporter text`. [Check scenes in CI](/guides/ci/) puts this in a workflow.

## The compiler as a library

The package's main entry point is the compiler, as one pure, synchronous
function. It needs no browser and draws nothing:

```text
import { compile } from "marey-lang";

const result = compile(source);   // { ok, ir, errors }
if (!result.ok) {
  for (const e of result.errors) console.error(`${e.line}:${e.col} ${e.message}`);
}
```

- `ok` is `true` when the scene compiled with no errors.
- `ir` is the Scene IR, the compiler's typed output: every object, its
  properties and its timeline, in seconds. It is `null` when compiling failed.
- `errors` lists each diagnostic with its `message`, and its `line` and `col`
  when it has a position. Some diagnostics have none, so check before using
  them.

The IR's types and the error type, `CompilerError`, are exported too, so a
TypeScript project gets them with the function. `marey check` is this function
plus the file reading and the export checks.
