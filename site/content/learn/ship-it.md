---
title: Ship it
summary: Take a scene out of the browser. Check it with the command line, export it as video, an animated PNG or Lottie, prove two exports are the same, and put it on a web page.
description: Lesson 14 of the Marey course. Installing marey-lang, marey check and --export-ready, marey export and its formats, the frames hash, embedding a scene with the marey-player element, and checking scenes in CI with the GitHub Action.
minutes: 20
learn:
- Check scene files with marey check, and know when a scene is ready to export
- Export a scene as frames, video, an animated PNG or Lottie
- Prove two exports are the same with the frames hash
- Put a scene on a web page with the marey-player element
- Check every scene in a repository on each push
embed: lighthouse
---

Every scene in this course has run in a player on this site. To use one
anywhere else you need it as a file, and something that reads the file: a
command that checks it, a command that turns it into a video or an animation
file, or a player on your own web page. The scene above is the Lighthouse from
the gallery, and it is not a lesson sample: it is the element you will put on
your own page at the end of this lesson, with the scene's whole source inside
it.

## Install

The command line tool needs Node 22 or later. It comes in the npm package
`marey-lang`, and installs a command named `marey`:

```bash
npm install --save-dev marey-lang
npx marey --version
```

The second line prints the version you installed. `npx marey --help` lists the
commands and the options that version has, which is the list to trust if it
and this page ever disagree.

Save a scene as a file to try the commands on: a `.marey` file is the scene's
text, exactly what you write in a sample. The Lighthouse's source is on
[its gallery page](/gallery/lighthouse/), with a Copy button; the commands
below use it saved as `lighthouse.marey`.

## Check a scene

`marey check` compiles one or more files and reports on each:

```bash
npx marey check lighthouse.marey
```

```text
lighthouse.marey: ok
```

A file with a mistake gets the same messages a sample on this site shows, each
with the file, the line and the column. This scene has an `alpha` the compiler
does not accept:

```marey error
scene {
  size: (960, 540)
  background: #101433
  duration: 4
  circle lamp { position: (480, 270), radius: 60, color: #ffd84d, alpha: 1.5 }
}
```

Saved as `broken.marey` and checked beside the Lighthouse:

```bash
npx marey check broken.marey lighthouse.marey
```

```text
broken.marey:5:74: 'circle' object 'lamp': 'alpha' must be between 0.0 and 1.0 inclusive, but got 1.5.
lighthouse.marey: ok
```

Every file is checked even after one fails. The command exits with 0 when
every file is ok and 1 when any is not, so a script or a build can stop on it.

## Ready to export

A scene can compile and still be impossible to export. A scene with no
`duration` has no end, as the players in the first lesson showed with their
`∞`, so there is no last frame to write. This one compiles:

```marey
scene {
  size: (960, 540)
  background: #101433
  circle lamp { position: (480, 270), radius: 60, color: #ffd84d }
}
```

`--export-ready` adds the checks an export needs. Saved as `lamp.marey`, it
passes `check` and fails `check --export-ready`:

```bash
npx marey check lamp.marey
npx marey check --export-ready lamp.marey
```

```text
lamp.marey: ok
lamp.marey: [EXPORT_UNBOUNDED_SCENE] This scene declares no 'duration', so it has no finite length to export. Add 'duration: <seconds>' to the scene block, or pass an explicit export bound.
```

`--fps <n>` checks the scene at the frame rate you mean to export at. The
simulation runs 120 ticks a second, and a frame rate must divide 120 so that
every frame lands on a tick:

```bash
npx marey check --export-ready --fps 25 lighthouse.marey
```

```text
lighthouse.marey: [EXPORT_UNSUPPORTED_FPS] Frame rate 25 is not supported. It must be a positive whole number that divides the 120Hz simulation rate exactly, so every exported frame lands on a simulation tick. Supported rates include 24, 30 and 60.
```

`--fps` means something only with `--export-ready`, and `check` refuses it on
its own rather than report `ok` for a check it did not make.

## Export

`marey export` writes one output per run: a file, or for `png` a directory of
frames. It draws the frames in a headless Chromium, the same way the
playground's export button does, so it needs that browser installed once
before the first export:

```bash
npx --package playwright-core@1.62.1 playwright-core install chromium-headless-shell
```

Then name the scene and a format:

```bash
npx marey export lighthouse.marey --format apng
```

| `--format` | What it writes | Default name |
|---|---|---|
| `png` | A directory of numbered frames | `lighthouse-frames/` |
| `apng` | An animated PNG | `lighthouse.png` |
| `webm` | VP9 video | `lighthouse.webm` |
| `mp4` | H.264 video | `lighthouse.mp4` |
| `lottie` | Lottie JSON | `lighthouse.json` |

Three more options shape the output:

- `--fps <n>` is the frame rate, 30 unless you give one. It must divide 120.
- `--duration <s>` exports that many seconds instead of the scene's own
  `duration`.
- `--out <path>` names the file.

This exports the first two seconds of the Lighthouse at 10 frames a second:

```bash
npx marey export lighthouse.marey --format apng --fps 10 --duration 2 --out lighthouse.png
```

```text
wrote lighthouse.png  20 frames @ 10 fps  960x540  675430 B  sha256 01ef2c26a14fe6d3af98e62f9f8b4134ff5afddf14ba7c02c5483d3fbfb962ff  frames 1221a648
```

The line says what it wrote: the file, 20 frames at 10 a second, the size in
pixels and in bytes, and two hashes. A Lottie export of the whole scene, at the
default 30 frames a second, is 360 frames:

```bash
npx marey export lighthouse.marey --format lottie
```

```text
wrote lighthouse.json  360 frames @ 30 fps  960x540  243532 B  sha256 d10f271d2b2a0fac24eb12e459ba41aae0711858f664115c455621df604fcb01  frames 679a454e
```

That line comes from 0.7.0, the version this site documents, which is not on
npm yet. Version 0.6.0 writes the same scene as a different Lottie file, from
an older encoder:

```text
wrote lighthouse.json  360 frames @ 30 fps  960x540  1304303 B  sha256 bd81f6c23bfa32c046a7708db8849626c0e937d05bc625496e7d3cdfddb61241  frames 679a454e
```

The bytes and the `sha256` differ, and the `frames` hash, `679a454e`, is the
same, which is what the next section is about. The APNG line above is the same
from both versions.

## The frames hash

The two hashes answer two questions. `sha256` is the hash of the file's bytes.
`frames` is a hash of every object's state at every frame that was sampled: its
position, rotation, scale, alpha and colour, physics bodies included. Run the
same export twice and compare the lines:

```text
wrote lighthouse.png  20 frames @ 10 fps  960x540  675430 B  sha256 01ef2c26a14fe6d3af98e62f9f8b4134ff5afddf14ba7c02c5483d3fbfb962ff  frames 1221a648
wrote lighthouse.png  20 frames @ 10 fps  960x540  675430 B  sha256 01ef2c26a14fe6d3af98e62f9f8b4134ff5afddf14ba7c02c5483d3fbfb962ff  frames 1221a648
```

Both match: the same source gave the same file and the same motion. That is
the check to run when you want to know that a change to a scene, or to a
computer, changed nothing. MP4 is the one format whose bytes differ between
runs: its `frames` hash matches, and the difference is inside the browser's
H.264 encoder. [Determinism](/reference/determinism/) says exactly what is
promised and under what conditions.

## Put it on a page

The `<marey-player>` element plays a scene on any web page. Load it once with
a script tag, then give each player a scene, either as a file it fetches with
`src` or written inline in a `<script type="text/marey">` inside it:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/marey-lang@0.6.0/dist/player/marey-player.mjs"></script>

<marey-player src="lighthouse.marey" autoplay loop controls></marey-player>

<marey-player autoplay loop controls>
  <script type="text/marey">
    scene {
      size: (400, 300)
      duration: 2
      circle dot { position: (200, 150), radius: 30, color: #38bdf8 }
    }
  </script>
</marey-player>
```

The script tag pins a version: `0.6.0`, the first `marey-lang` release with the
player. Put the newest version npm lists in its place (`npm view marey-lang
version` prints it). In a project that uses a bundler, install the package
and write `import "marey-lang/player";` instead of the script tag.

Three attributes say how it plays:

| Attribute | Effect |
|---|---|
| `autoplay` | Start playing once the scene is ready, unless the reader's system asks for reduced motion. |
| `loop` | Start again from the beginning at the end. A scene with no `duration` never ends, so it has nothing to loop. |
| `controls` | Show the control bar: play and pause, a seek bar, the time, and an "Open in playground" link when the source is short enough to share. |

The player at the top of this page is the inline form: a `<marey-player>`
with `autoplay`, `loop` and `controls`, and the Lighthouse's source inside its
`<script type="text/marey">`. Only the script tag is different: this site
defines the element from its own build of the player, so it always plays the
language as this course teaches it.

## Check scenes on every push

A workflow that runs `marey check` on each push stops a broken scene before it
is merged. With the published version, 0.6.0, write the step yourself. This one,
at `.github/workflows/marey.yml` in your repository, sets up Node 22 and
checks every scene in a `scenes` folder:

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

The shell expands `scenes/*.marey` to the file names, `check` prints each
error with its file, line and column, and its exit code of 1 fails the step,
and with it the run.

The Marey repository is also a GitHub Action, which does more: it puts each
error on its line in the pull request's diff, and can export every scene. It
runs `check` with an option 0.6.0 does not have, so **the action needs
`marey-lang` 0.7.0 or later**, which is not published yet. It installs the
version named in the `package.json` of the commit you pin, and stops with a
message saying so when npm does not have that version. Once 0.7.0 is on npm,
this workflow uses it:

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

Replace `<commit-sha>` with the full hash of a commit whose `package.json`
names a published version. The action checks every tracked file that matches
its `files` input, `*.marey` unless you give one. Each diagnostic becomes an
annotation on its file and line, in the run and in the pull request's diff.
When every scene passes, each is exported in each format listed in `export`
and uploaded as a workflow artifact; if any scene fails, nothing is exported.

## Where to go from here

You can now read every line of the scenes in [the gallery](/gallery/), and
each one has notes on how it is made and links back to the lessons it uses.
[The guides](/guides/) cover what this lesson has only touched: every option
of [`marey check`](/guides/install/) and [`marey export`](/guides/export/),
[the player's](/guides/embed/) events and its JavaScript methods, all
[the action's](/guides/ci/) inputs and outputs, what is inside
[a Lottie export](/guides/lottie/), and how to read
[the compiler's errors](/guides/errors/). [The language reference](/reference/language/)
states every rule formally, and
[the property reference](/reference/properties/) lists every property of every
object.

## Try this

:::try Make it ready to export
This lamp compiles, but `marey check --export-ready` rejects it, and its
player shows `∞`. Give it a length, and make its glow pulse while you are at
it.

```marey
scene {
  size: (960, 540)
  background: #101433

  circle glow { position: (480, 270), radius: 120, color: #ffd84d, alpha: 0.15 }
  circle lamp { position: (480, 270), radius: 60, color: #ffd84d }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  circle glow {
    position: (480, 270)
    radius: 120
    color: #ffd84d
    alpha: 0.15
    animate { property: alpha, to: 0.4, duration: 2, loop: true, yoyo: true }
  }
  circle lamp { position: (480, 270), radius: 60, color: #ffd84d }
}
```

`duration: 4` gives the scene an end, so the player shows its length and
`--export-ready` reports `ok`. The pulse takes 2 seconds to brighten and 2 to
fade, so at 4 seconds the glow is back where it started.
:::

:::try Make it loop without a jump
Embedded with `loop`, this scene jumps each time it starts again. Make the
restart invisible without changing the scene's `duration`.

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  circle glow {
    position: (480, 270)
    radius: 120
    color: #ffd84d
    alpha: 0.15
    animate { property: alpha, to: 0.4, duration: 1.5, loop: true, yoyo: true }
  }
  circle lamp { position: (480, 270), radius: 60, color: #ffd84d }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  circle glow {
    position: (480, 270)
    radius: 120
    color: #ffd84d
    alpha: 0.15
    animate { property: alpha, to: 0.4, duration: 1, loop: true, yoyo: true }
  }
  circle lamp { position: (480, 270), radius: 60, color: #ffd84d }
}
```

With `duration: 1.5` a yoyo goes there and back every 3 seconds, which does
not divide 4, so at 4 seconds the glow is part of the way up and the restart
drops it back to 0.15. With `duration: 1` it goes there and back every 2
seconds, twice in the scene, and ends where it started, as
[the lesson on timing](/learn/timing/) showed.
:::

## Recap

- `marey check` compiles scene files and prints `ok` or each error with its
  line and column, and exits with 1 if any file fails. `--export-ready` adds
  the export checks: a scene needs a `duration`, and `--fps` must divide 120.
  ([Scene model](/reference/language/#scene-model))
- `marey export` writes `png` frames, `apng`, `webm`, `mp4` or `lottie`, at
  `--fps` frames a second (30 unless given), for `--duration` seconds, to
  `--out`. ([Export](/guides/export/))
- Each export prints a `sha256` of the file and a `frames` hash of the sampled
  motion; the same export run twice prints the same hashes.
  ([Determinism](/reference/determinism/))
- `<marey-player>` plays a scene from `src` or from an inline
  `<script type="text/marey">`, with the `autoplay`, `loop` and `controls`
  attributes. ([Embed a scene](/guides/embed/))
- A workflow step running `npx --yes marey-lang@0.6.0 check` checks scenes on
  each push today. The GitHub Action, which needs 0.7.0, annotates each error on
  its line and can export and upload the results.
  ([Check scenes in CI](/guides/ci/))
