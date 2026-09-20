# Marey

A text-first compiler for generative, deterministic 2D motion graphics.

You describe motion as readable source — shapes, animations, a physics
simulation, a timeline — and Marey compiles it to portable artifacts that play
without Marey anywhere in the loop. Scenes are text, so they diff, review and
parameterize like the rest of your code.

Marey is **not** trying to be a more general animation API than GSAP, a visual
editor like Rive, a replacement playback format for Lottie, or a game engine.
PixiJS and Matter.js are implementation machinery, not the product. The niche is
narrow on purpose: *motion graphics as readable, generative source code.*

## A scene

Seven bars rise out of a baseline, one after another, sized from data:

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

Nothing here is a hand-computed coordinate. `step` derives the spacing from the
length of the list, so adding an eighth value re-lays-out the whole row.
`origin: (0.5, 1)` puts each bar's pivot on its bottom edge, so scaling in y
grows it *upward* out of the baseline rather than outward from its middle —
which is why the reveal needs one animation instead of a `position` and a
`scale` moving in lockstep. `delay` staggers the starts as a function of the
bar's index.

That example is compiled by the test suite on every run. So is every example in
[the language reference](docs/LANGUAGE.md) — if the language changes underneath
them, the build goes red rather than the docs going quietly stale.

## What's actually hard about this

Three things, in rough order of how much thought they took.

### Determinism, and the tick/paint boundary

The same scene must produce the same frames every time it runs — otherwise a
baked export is a lie, and re-exporting a scene after a one-line edit produces a
diff nobody can read.

That is harder than it sounds once a physics engine is involved. Marey separates
*simulation* from *presentation*: the world advances on a fixed 120 Hz tick
([`sceneIR.ts`](src/compiler/sceneIR.ts) owns `TICK_HZ` and the single
seconds-to-ticks conversion the type checker and renderer share), while painting
interpolates between ticks for display smoothness. Frames come from tick state,
never from painted state.

**Getting that boundary wrong is invisible to a headless test suite.** A body
frozen by `duration` expiry kept its alpha-interpolated *painted* position, so it
came to rest up to one tick of motion away from where the simulation actually
stopped it — differently on each page load. All 94 headless tests passed. It was
caught by a browser harness that loads the same scene twice from cold and
compares the at-rest frames byte-for-byte, and fixed in `f9de4a9`.

The harness lives in [`tools/visual-check/`](tools/visual-check/).
Its notes record the trap underneath the trap: a scene that *settles* is a weak
determinism test, because a pile converging on a stable resting configuration
reaches the same fixed point even when the trajectory diverged. Testing a
trajectory needs a scene that freezes mid-motion, which is what
`scenes/freeze.marey` exists to do.

### Compiling to something that doesn't need Marey

`lex → parse → typeCheck → buildIR → render`. The IR
([`sceneIR.ts`](src/compiler/sceneIR.ts)) is the frozen, `readonly` contract
between the compiler and everything downstream, and it is deliberately the only
thing an exporter sees.

Marey emits a bounded [Lottie](https://lottiefiles.github.io/lottie-docs/)
subset — static circle, rectangle, polygon and group geometry, with baked
position, rotation, scale and alpha at a fixed duration and frame rate — that
plays with **no Marey and no Matter.js code present at playback**. Deciding what
to leave out was most of the work. Lottie `text` is refused outright rather than
half-supported, because the Lottie specification's own tracker has carried "Add
Text Layer" open for 19 months; the shape-layer subset is the only
normative-and-stable part to target.

### Keeping one language honest across four consumers

The lexer, the type checker, the editor's autocomplete and the reference
documentation all need to agree about what properties exist and what they accept.
Four hand-maintained copies of that list drift — this repo has the scar tissue to
prove it. There is now a single [`languageContract.ts`](src/compiler/languageContract.ts)
that the others derive from, shaped so that a half-landed change is a *compile*
error rather than a runtime surprise.

Compilation itself runs in a Web Worker
([`compiler.worker.ts`](src/compiler/compiler.worker.ts)) so the editor stays
responsive; the worker returns the IR as JSON and the main thread hands it to the
renderer.

## Status

Pre-release and unpublished. Marey has never been distributed, there are no
external users, and every `.marey` file in existence is first-party and lives in
this repository — which is why breaking syntax changes are weighed on which
language is better to live with, not on migration cost.

The suite is upwards of 800 tests — run `npm test` for the current figure rather
than trusting a number written here, which is the kind of claim that rots.
Development runs in numbered phases against a written roadmap with an explicit
finish line; the project is complete when the language, the export pipeline and
the packaging work are done, and not before.

The CLI currently exposes one command, `check`. `export` is not implemented yet.

## Running it

```bash
npm install
npm run dev      # Vite dev server — editor, live preview, terminal
npm test         # vitest, single pass
npm run build    # tsc -b && vite build (typecheck is part of the build)
```

To type-check a scene file from the command line:

```bash
npm run check -- path/to/scene.marey
```

The test suite is headless by design and cannot see a canvas. Anything that needs
one — does a scene actually render, does the ticker stop, does a scene replay
identically across a reload — goes through the browser harness described in
[`tools/visual-check/SKILL.md`](tools/visual-check/SKILL.md).

## Reading further

| Document | What's in it |
|---|---|
| [`docs/LANGUAGE.md`](docs/LANGUAGE.md) | The language reference. Behaviour, units, and edge cases — every example compiled by the suite. |
| [`docs/specs/2026-09-09-marey-engineering-roadmap-design.md`](docs/specs/2026-09-09-marey-engineering-roadmap-design.md) | The roadmap, its decisions, and the research that overturned the previous one. |
| [`docs/architecture/`](docs/architecture/) | Architecture notes by subsystem — parser, renderer, language contract, share links. |
| [`docs/engineering-lessons.md`](docs/engineering-lessons.md) | A running record of process mistakes made building this, each with its evidence. Mostly about the ways a green test suite can be wrong. |
| [`docs/research/`](docs/research/) | Primary-source research on where this could go, including the case against the direction it didn't take. |

## License

[MIT](LICENSE).
