# Lottie keyframe recovery — proposal

**Status: Accepted 2026-11-13; designed in
`2026-11-13-marey-lottie-fitted-keyframes-design.md`.** This note records the problem, a measured baseline, the finding
that makes the change tractable, and the open decisions, so the work can be
picked up without redoing the investigation.

## 1. The problem

The Lottie exporter writes **one keyframe per output frame on every property
that varies**, with linear easing between them. That is Phase 5A's decision
§7.1 (`docs/specs/2026-09-11-marey-phase-5a-baked-lottie-design.md`), and it
was the right first encoding: it is exact at every sampled frame, it needs no
knowledge of where a value came from, and it bakes physics the same way it
bakes an `animate` block.

Its cost is that an animation that a person would author as two keyframes and
a curve arrives as hundreds of linear segments. Two consequences:

- **Size.** Files are far larger than hand-authored Lottie of similar
  complexity.
- **Editability.** A Lottie editor (After Effects, the LottieFiles editor)
  shows a keyframe on every frame. Retiming a motion, changing its easing or
  shifting a beat means editing hundreds of keyframes, so in practice it means
  re-exporting from Marey. Colours stay editable, because a colour that never
  changes is already a single static fill (§7.2's constant-track collapse).

### Baseline

Measured on 2026-11-06 with `node bin/marey.mjs export <scene> --format lottie --fps 30`,
counting every property with `a: 1` and the keyframes in it:

| Scene | Frames | Layers | Animated tracks | Keyframes | JSON | gzip |
|---|---|---|---|---|---|---|
| `src/examples/dusk-hills.marey` (animation only) | 360 | 89 | 66 | 23,760 | 2,036,666 B | 163,959 B |
| `src/examples/ledges.marey` (mostly physics) | 270 | 38 | 52 | 14,040 | 1,229,171 B | 171,478 B |

Dusk Hills has no physics at all. Every one of its 66 tracks comes from
`animate` blocks with `loop`/`yoyo` on 6 s and shorter periods, which an
author would key as a handful of keyframes per track.

## 2. The finding that makes this tractable

**Every easing Marey evaluates is a polynomial of degree at most 3 in linear
progress**, so every segment of an `animate` block is exactly representable as
one Lottie keyframe pair. From `src/compiler/renderer/easing.ts`:

| Easing | Eased progress `E(t)` |
|---|---|
| `linear` | `t` |
| `easeIn` | `t²` |
| `easeOut` | `t(2 − t)` |
| `easeInOut` | `2t²` for `t < 0.5`, `−1 + (4 − 2t)t` after: **piecewise**, split at 0.5 |
| handoff, release at end | `easeOut`: `t(2 − 1.5t + 0.5t²)`; `easeInOut`: `t²(2.5 − 1.5t)` |
| handoff, release at start | `easeIn`: `t(0.5 + 0.5t²)`; `easeInOut`: `t(0.5 + 2t − 1.5t²)` |

A Lottie keyframe's easing is a cubic Bézier whose x axis is time. With the
x handles at 1/3 and 2/3, `x(u) = u` exactly, so the y handles can encode **any
cubic in time**. For `E(t) = a·t + b·t² + c·t³` (with `E(1) = a + b + c = 1`),
the Bernstein form gives:

- the leaving keyframe's `o` = `{ x: [1/3], y: [a / 3] }`
- the arriving keyframe's `i` = `{ x: [2/3], y: [(2a + b) / 3] }`

For `easeOut` (`a = 2, b = −1`), that is `o.y = 2/3`, `i.y = 1`. Handles
outside 0–1 are legal Lottie (overshoot), and the handoff curves need them.

`easeInOut` becomes two keyframe pairs, meeting at the midpoint. Players
evaluate an easing by inverting `x(u)` numerically (lottie-web's
`BezierEaser`); with `x` linear the inversion is trivial, but how close a real
player lands is a measurement to make, not an assumption (§5).

## 3. Two ways to get the keyframes

### A. From the source: emit keyframes from the IR's animations

Map each `animate` block (with `delay`, `loop`, `yoyo`, `sequence`,
`parallel`) straight to keyframes. Keyframes would land exactly on the
author's beats. It is also the harder route:

- **It crosses the encoder boundary.** `lottieEncode.ts` may not import the
  Scene IR (`docs/architecture/renderer.md`, "The Lottie encoder boundary").
  `lottieGeometry.ts` would have to plan motion as well as geometry.
- **Starts fall between frames.** The clock ticks at 120 Hz and the output
  is 30 fps or less, so a `delay` or a sequence step rarely starts on an
  output frame.
- **Several things compose into one track.** Opacity is the flattened product
  of every ancestor's `visible ? alpha : 0` (the opacity asymmetry). Two
  animated alphas multiply into a degree-6 polynomial, which no single
  keyframe pair represents.
- **Several things change a curve.** Handoff reshapes the curve, colour is
  rounded to whole 8-bit channels every frame, and a `sequence` can hand an
  object from an `animate` step to a `physics` step mid-track.

### B. From the samples: fit the per-frame tracks in the encoder

Keep sampling exactly as today. In `track`/`scalarTrack`, greedily extend a
run of frames while one cubic (fitted through the run) reproduces every sample
in it within a tolerance. Emit a keyframe at each run boundary, with the run's
handles.

- It stays inside the encoder boundary. The input is still inert snapshots.
- Keyframes fall where the motion changes character, which for `animate`
  blocks is where the blocks start, end, reverse and split. Not exactly on a
  sub-frame start, but on the nearest frames around it.
- An interval that contains a sub-frame boundary becomes a short linear
  segment between two exact samples. That is the same fidelity the file has
  today.
- It applies to anything polynomial, not just `animate`. Free fall without
  air drag should be close to quadratic between collisions, so physics may
  compress partially; how much is unmeasured. A collision ends a run.
- Composed opacity, rounded colour, and anything else that does not fit
  simply produces shorter runs, down to today's one keyframe per frame. No
  case is worse than the current encoding.

**Recommended: B.** It needs no change to the boundary rules, it degrades to
the present behaviour rather than failing, and it covers every source of
motion with one mechanism. A could be added later on top of B, as a pass that
snaps run boundaries to the author's beats where the IR says they are.

## 4. Decisions this leaves open

1. **The tolerance.** Either exact up to floating-point noise (relative
   1e-9: lossless at every sampled frame, but colour tracks will not compress
   because of per-frame 8-bit rounding), or a visual tolerance per unit (for
   example 0.01 px, 0.01°, 0.01 % scale, 0.1 opacity, half a colour step).
   The first keeps §7.2's "not an epsilon" reasoning intact. The second is
   what makes physics and colour shrink. Either way it is a judgment call in
   the engineering-lessons §2d sense, and must be pinned by a test that fails
   if it is changed.
2. **Default or opt-in.** Replace §7.1 outright, or add
   `marey export --format lottie --keyframes per-frame|fitted` and keep the
   current encoding available.
3. **Run-splitting rule.** Greedy longest-run-first is simple and
   deterministic. Whether it puts boundaries where an editor user expects
   them (for example `easeInOut` splitting at exactly its midpoint) should be
   checked on the canonical scenes before choosing anything cleverer.
4. **Hash and byte gates.** `marey export` prints the file's `sha256`, and
   `tools/cli-check/export-matrix.mjs` byte-compares Lottie output across two
   runs, so the fitter must be deterministic (a fixed iteration order and no
   unseeded randomness). No test pins a Lottie hash. The `sha256` values
   recorded in the `eval/RESULTS-*.md` evidence describe the current encoding
   and will not match a re-export, so a change should say so where it reports
   new ones.

## 5. What a change would owe

- **Supersede §7.1 explicitly** in the Phase 5A design with a dated note, and
  update `docs/architecture/renderer.md`'s Lottie section. The
  `lottieEncode.test.ts` case "gives every keyframe explicit linear easing
  handles" encodes the old decision and has to be rewritten, not deleted.
- **Measure in real players.** Re-run `tools/visual-check/lottie-check.mjs`
  (a real lottie-web player in a separate process) on the canonical scenes and on a fixture per
  easing, including `easeInOut` and both handoff variants. Confirm the
  rendered frames still match the PNG export within the existing tolerance,
  and measure sub-frame playback on a 60 Hz display of a 30 fps export.
- **Re-measure the table in §1** and report it beside the old numbers.
- **Open one exported file in a Lottie editor** and confirm that the
  keyframes and their easing handles are what a person would expect to edit.
