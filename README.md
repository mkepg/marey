# Marey

Marey is a small language and a compiler for 2D motion graphics. A scene is
written as text: shapes, animations, an optional physics simulation and a
timeline. The compiler turns it into files that play without Marey: Lottie
JSON, MP4 and WebM video, animated PNG, or one PNG per frame. It is not a game
engine or a general-purpose animation library. PixiJS (drawing) and Matter.js
(physics) are used internally and are not part of its interface.

The same source produces the same frames on every run, physics included. The
simulation advances on a fixed 120 Hz tick, painting only reads its state, and
every export prints a hash of the sampled frames so two runs can be compared.
[`docs/determinism.md`](docs/determinism.md) states exactly what is and is not
claimed, and how each claim is checked.

[![CI](https://github.com/mkepg/marey/actions/workflows/ci.yml/badge.svg)](https://github.com/mkepg/marey/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[Try it in the browser](https://marey.pages.dev/)**

<img src="docs/media/bars-reveal.png" width="400" alt="Seven light-blue bars of different heights grow upward from a common baseline, one after another, on a dark navy background.">

This animated PNG is the unedited output of `marey export` on the source below
([`docs/media/bars-reveal.marey`](docs/media/bars-reveal.marey)). Regenerate it
from a checkout with `npm run build:export-page && npm run build:cli && node bin/marey.mjs export docs/media/bars-reveal.marey --format apng --out docs/media/bars-reveal.png`.

```marey
let sky    = #38bdf8
let values = [3, 7, 2, 9, 5, 8, 4]
let count  = length(values)
let step   = 800 / (count + 1)

scene {
  size: (800, 600)
  background: #0a0e1a
  duration: 2

  generate v, i in values {
    rectangle bar {
      position: (step * (i + 1), 500)
      size: (step - 30, v * 40)
      color: sky
      origin: (0.5, 1)
      scale: (1, 0)
      animate {
        property: scale
        to: (1, 1)
        duration: 0.55
        delay: 0.05 + i * 0.14
        easing: easeOut
      }
    }
  }
}
```

No coordinate here is computed by hand. `step` derives the spacing from the
length of the list, so adding an eighth value re-lays-out the whole row.
`origin: (0.5, 1)` puts each bar's pivot on its bottom edge, so scaling in y
grows the bar upward out of the baseline, and the reveal needs one animation
instead of a `position` and a `scale` moving in lockstep. `delay` staggers the
starts by the bar's index.

The test suite compiles this example on every run, and checks that it is
identical to the file the image was exported from. Every example in
[the language reference](docs/LANGUAGE.md) is compiled the same way.

## Install and use

Marey needs Node 22 or later. The npm package is `marey-lang`, and it installs
a command named `marey`.

```bash
npx marey-lang check scene.marey
npx marey-lang export scene.marey --format mp4
```

`check` compiles and type-checks one or more files and prints `ok` or the
errors with their line numbers. With `--export-ready` it also checks that the
scene can be exported: a bounded duration, and a frame count within budget at
the rate given by `--fps`.

`export` writes one output per run:

| `--format` | Output (default name) |
|---|---|
| `png` | A directory of numbered frames (`scene-frames/frame_0000.png`, ...) |
| `apng` | An animated PNG (`scene.png`) |
| `webm` | VP9 video (`scene.webm`) |
| `mp4` | H.264 video (`scene.mp4`) |
| `lottie` | Lottie JSON (`scene.json`) |

`--fps` defaults to 30 and must divide 120, so every frame lands on a
simulation tick. `--duration <s>` overrides the scene's own `duration`, and
`--out <path>` names the output. On success it prints one line, for example:

```text
wrote docs/media/bars-reveal.png  60 frames @ 30 fps  800x600  717577 B  sha256 d56c2e03…  frames 35ebdda6
```

`sha256` is the hash of the file's bytes and `frames` is the hash of every
object's sampled state at every frame. Running the same export twice and
comparing the two lines is the determinism check. MP4 is the one format whose
bytes differ between runs: its `frames` hash matches, and the difference is
inside the browser's H.264 encoder.

`export` renders in headless Chromium, with the same pipeline the app's export
button uses. `check` needs no browser. Install the pinned browser once before
the first export:

```bash
npx --package playwright-core@1.62.1 playwright-core install chromium-headless-shell
```

Without it, `export` stops with `[EXPORT_BROWSER_MISSING]` and prints that
command.

### As a library

The package also exports the compiler as a pure function, with no DOM and no
rendering:

```text
import { compile } from "marey-lang";

const result = compile(source);   // { ok, ir, errors }
if (!result.ok) {
  for (const e of result.errors) console.error(e.line, e.message);
}
```

`ir` is the Scene IR, the compiler's typed output, and its types are exported
too. It is the same structure every exporter consumes.

## What's actually hard about this

### Determinism, and checking it

The world advances on a fixed tick
([`sceneIR.ts`](src/compiler/sceneIR.ts) owns `TICK_HZ` and the one
seconds-to-ticks conversion the type checker and renderer share). The live
preview interpolates between ticks for smooth display, and nothing the
simulation reads may depend on that interpolation. Exports sample tick state
only.

Getting that boundary wrong is invisible to a headless test suite. A body
frozen in mid-air kept its interpolated painted position instead of its tick
position, so it rested in one of two places depending on page-load timing. All
94 headless tests passed. A browser harness that loads a scene twice from cold
and compares the frames caught it, and `1ce8307` fixed it. A scene that
settles would have hidden the bug, because a pile reaches the same resting
state even when its path differed; the test scene has to freeze mid-motion.
[`docs/determinism.md`](docs/determinism.md) has the full account, including
what is not claimed (identical output across JavaScript engines, and MP4
bytes).

### Compiling to something that doesn't need Marey

`lex → parse → typeCheck → buildIR → render`. The IR
([`sceneIR.ts`](src/compiler/sceneIR.ts)) is the frozen, `readonly` contract
between the compiler and everything downstream, and it is the only thing an
exporter sees.

The Lottie export is a bounded subset: circle, rectangle, polygon, line, group
and text geometry, with position, rotation, scale and opacity baked per frame
at a fixed duration and frame rate. Physics, easing and sequencing are
evaluated at export and stored as keyframes, so the file plays with no Marey
and no Matter.js code present at playback, and with no Lottie expressions.
Text does not use Lottie's text layer, whose specification is still unsettled:
HarfBuzz shapes each line in the export font, and the glyph outlines become
ordinary shape paths, so any Lottie player draws them without the font. A
character the font has no glyph for is refused with
`[LOTTIE_TEXT_MISSING_GLYPH]` instead of being drawn differently from the
preview.

### Keeping one language honest across four consumers

The parser, the type checker, the editor's hovers and completions, and the
reference documentation all need to agree about which properties exist and
what they accept. Four hand-maintained copies of that list drifted apart in
this repository's history. Every property is now declared once, in
[`languageContract.ts`](src/compiler/languageContract.ts), and the compiler
and the editor derive their tables from it when they load, so adding a
property is one edit. The reference is prose, so it is held to the language
the other way: the suite compiles every example in it.

## Working on Marey

```bash
npm install
npm run dev      # Vite dev server: editor, live preview, terminal
npm test         # vitest, single pass
npm run build    # tsc -b && vite build (typecheck is part of the build)
```

To run the CLI from a checkout, build it and call it through `bin/`:

```bash
npm run build:export-page && npm run build:cli
node bin/marey.mjs check path/to/scene.marey
```

The suite is over 1,300 tests; run `npm test` for the current figure.
[CI](.github/workflows/ci.yml) runs it on every push to `main` and every pull
request, along with the build, `marey check` on every tracked `.marey` file, a
pack-and-install of the package, and `marey export` of every canonical scene
in every format, twice, compared against itself.

The test suite is headless by design and cannot see a canvas. Anything that
needs one (does a scene render, does the ticker stop, does a scene replay
identically across a reload) goes through the browser harness in
[`tools/visual-check/README.md`](tools/visual-check/README.md). That harness
is not in CI: it needs a real browser and a person to read the captures.

## Reading further

| Document | What's in it |
|---|---|
| [`docs/LANGUAGE.md`](docs/LANGUAGE.md) | The language reference. Behaviour, units, and edge cases, every example compiled by the suite. |
| [`docs/determinism.md`](docs/determinism.md) | What "the same output every time" means, how the renderer makes it hold, how it is checked, and the bug that showed the checks had a hole. |
| [`docs/specs/2026-09-09-marey-engineering-roadmap-design.md`](docs/specs/2026-09-09-marey-engineering-roadmap-design.md) | The roadmap, its decisions, and the research that overturned the previous one. |
| [`docs/architecture/`](docs/architecture/) | Architecture notes by subsystem: parser, renderer, language contract, share links. |
| [`docs/engineering-lessons.md`](docs/engineering-lessons.md) | A running record of process mistakes made building this, each with its evidence. Mostly about the ways a green test suite can be wrong. |
| [`docs/research/`](docs/research/) | Primary-source research on where this could go, including the case against the direction it didn't take. |

## Status

Version 0.4.0. The CLI has two commands, `check` and `export`, and every
format above is implemented. Below 1.0, a minor release may change the
language and the Scene IR, and the remaining phases of the roadmap will. Breaking
syntax changes are weighed on which language is better to live with.

Development runs in numbered phases against a written roadmap with an explicit
finish line; the project is complete when the language, the export pipeline
and the packaging work are done.

## License

[MIT](LICENSE).

The web app bundles third-party code and fonts under their own licences. A
build generates `third-party-licenses.txt` listing each one; the app serves it
and links to it from the bottom of the top bar's export menu.
