# Phase 10A results: `from`, spring easing and portable trigonometry

Measured on 2026-11-27 on branch `phase-10a`, at `91f5703` plus the commit
carrying this file. Every number below was produced by the command beside it
on that tree, re-run for this document; none is quoted from an earlier record.
Raw output came from `.visual-check/10a/t8/` and `.visual-check/10a/`
(git-ignored; re-run the commands to regenerate). The one exception is the
"before" half of the cross-engine table in section 4, which is the output
recorded at `db4a07a`, before the trigonometry fix existed, and is labelled as
such.

Design: `docs/specs/2026-11-27-marey-phase-10a-from-spring-and-determinism-design.md`
(exit evidence in section 6, as amended). Plan:
`docs/plans/2026-11-27-phase-10a-from-spring-and-determinism.md`. Phase base:
`e6a63b4` (the plan's commit).

Scope of every browser number: Playwright 1.62.1's Chromium 151.0.7922.34
(headless, SwiftShader) against Node 22.13.1 (V8 12.4.254.21-node.22), on one
Windows machine. Both engines are V8 builds; see "What this does not show".

Browser runs against a dev or preview server used `--port 5199 --strictPort`.
Each server was stopped afterwards, and `netstat` showed no listener on 5199.

Two commits were added while gathering this evidence, each because a check
failed or was thin:

- `2790343` `test(export): cap the spring track's keyframe count`. The spring
  Lottie test asserted only `keyframes > 0`. It now also asserts
  `keyframes <= 16`, the measured count, which is the rule the file's
  `CEILINGS` follow for the canonical scenes (each ceiling is the measured
  count). With the ceiling at 15 the test fails with
  `expected 16 to be less than or equal to 15`.
- `91f5703` `chore(pack): expect 129 files in the tarball`. `check:pack` failed
  on the first run (section 7): the tarball holds 129 files, not the 127
  pinned through 0.7.0. The two extra files are `dist/lib/types/compiler/detMath.d.ts`
  and `dist/player/types/compiler/detMath.d.ts`; removing them from
  `npm pack --dry-run --json`'s list leaves 127. The pin was moved with a
  comment.

## 1. `from` and `spring` reach every output

Scene: `site/gallery/spring-cards.marey` (the gallery entry added in Task 7).
It uses `from` on `scale`, `alpha` and `position`, held through each card's
`delay`, and `easing: spring` with a different `bounce` per card (0, 0.2, 0.4,
0.6, 0.9) and a default-bounce spring on the title. It has text, so it is
hashed through the export's frame hash, not the headless baseline.

### 1.1 The five exports

`marey export` after `npm run build:package`. The flags come from the CLI's
own usage line, `marey export <file> --format <png|apng|webm|mp4|lottie>
[--fps <n>] [--duration <s>] [--out <path>]` (the CLI has no `--help`; it
printed that line when given one). The scene is 3 s, so 90 frames at 30 fps.

```
node bin/marey.mjs export site/gallery/spring-cards.marey --format <f> --fps 30 --out .visual-check/10a/out-export/spring-cards.<ext>
```

| Format | Result | Size | SHA-256 (prefix) | Frame hash |
|---|---|---|---|---|
| png | 90 frames, 960x540 | 2 924 553 B | `45c40f2ddca331c7` | `636d8b6c` |
| apng | 90 frames, 960x540 | 2 915 320 B | `0dc80513a1ae53c9` | `636d8b6c` |
| webm | 90 frames, 1920x1080 | 378 481 B | `d7f1ea7f5a417427` | `636d8b6c` |
| mp4 | 90 frames, 1920x1080 | 305 502 B | `6228bc7fdfb1d839` | `636d8b6c` |
| lottie | 90 frames, 960x540 | 156 769 B | `8ca72174c955427f` | `636d8b6c` |

All five exited 0. Video is at twice the scene's size, as the export contract
says (`VIDEO_SCALE`). The PNG frames were opened: at frame 30 (1.0 s) cards 1 to
3 stand at full size, card 4 is mid-pop and card 5 is not yet drawn (held at
its `from`); by frame 50 all five are settled. Full output:
`.visual-check/10a/t8/export-cli.txt`.

### 1.2 The Lottie file passes the fitted tolerance, and its keyframe count

Two measurements.

**The unit test.** `npx vitest run src/compiler/export/lottieFitted.test.ts -t spring --disable-console-intercept`:

```
lottieFitted: spring-scale, 45 frames at 30 fps, 16 keyframes
 Tests  1 passed | 19 skipped (20)
```

The test exports a scale spring (`from: 0.4`, `to: 1`, `bounce: 0.5`), asserts
the sampled scale overshoots 1 and ends on exactly 1, reads every layer's
properties back through the player-faithful evaluator and compares each within
`LOTTIE_FIT_TOLERANCE`. 16 keyframes is the count the ceiling now caps. The full
file passes: 20 tests.

**The browser harness on spring-cards.** `lottie-fit-check.mjs` takes no scene
argument. It takes a per-frame document, a fitted document and a PNG
directory. The per-frame document is the export the fitter replaced, so it was
built from the same frames: the base commit's `lottieEncode.ts` (`cd14c3d`) was
put in the working tree for one export and restored with `git checkout`
(`git diff --stat` empty afterwards; `dist` rebuilt from HEAD). It gave
`frames 636d8b6c`, the same frame hash as every export above, and the fitted
document written afterwards is byte-identical to the one in 1.1 (SHA-256
`8ca72174...`). The PNG frames and the seam's fitted document came from
`lottie-check.mjs --compare-png` with the dev server up; its `doc.json`
deep-equals the CLI's fitted document.

```
node tools/visual-check/lottie-check.mjs --scene site/gallery/spring-cards.marey --compare-png --fps 30 --frames 0,10,20,30,36,42,48,54,60,75,89 --renderer lottie-web --out .visual-check/10a/t8/lottie
node tools/visual-check/lottie-fit-check.mjs --per-frame .visual-check/10a/t8/spring-cards.perframe.json --fitted .visual-check/10a/t8/spring-cards.fitted.json --png-dir .visual-check/10a/t8/lottie --frames 0,10,20,30,36,42,48,54,60,75,89 --renderer <lottie-web|dotlottie-web> --out <dir>
```

Both renderers exit 0 with `PASS`. lottie-web geometry, worst |fitted -
per-frame| over the 13 layers and 11 frames:

```
position 2.34e-3 px, scale 3.81e-4 points, rotation 0, opacity 5.97e-13 (of 100); overshoot of the bare tolerance: 0 -> within tolerance
```

The pixel bound and the share bound are `met` at every frame in both players.
At every frame the fitted file's maximum channel delta equals the per-frame
file's (for example 138 at frame 10 in lottie-web, 139 in dotlottie-web, and
120 at frames 30 to 89 in lottie-web). The 120 is at (425, 88), inside the title
text, which the Lottie file and the PNG export rasterise differently; it is the same in the
per-frame file, so it is not something the fit introduced.

Keyframes in spring-cards' Lottie, counted over every layer's animated
properties:

| Document | Layers | Keyframes |
|---|---|---|
| per-frame (`cd14c3d` encoder) | 13 | 1620 |
| fitted (HEAD) | 13 | 165 |

### 1.3 The player's frame hash equals `marey export`'s

`player-check.mjs` has fixed scenes in its `AGREEMENT_SCENES` and a fixed page
(`tools/visual-check/player/agreement.html`); it takes no scene argument. It was
run twice.

**Standing run, unchanged:** `node tools/visual-check/player-check.mjs --out .visual-check/10a/player`:

```
44/44 checks passed
```

(including physics, reveal and text scenes: live hash equals export hash for
each, with a shifted-tick control hashing differently.)

**With spring-cards substituted.** A throwaway copy of the script with the
reveal scene replaced by `site/gallery/spring-cards.marey`, and the page with
one extra `<marey-player>`, both reverted (the copy deleted, the page restored
with `git checkout`; `git status` empty afterwards):

```
node tools/visual-check/player-check-spring.tmp.mjs --only agreement --out .visual-check/10a/player-spring
reference spring: 90 frames, frames 636d8b6c  (--fps 30)
PASS  1 agreement  from+spring text: liveFramesHash over 90 ticks equals the export's frames hash  live 636d8b6c, export 636d8b6c (site/gallery/spring-cards.marey)
PASS  1 agreement  from+spring text: the comparison can fail (ticks shifted by one hash differently)  shifted 8de07a78
14/14 checks passed
```

The player's `636d8b6c` is the export's `636d8b6c` from 1.1.

## 2. Spring end-exactness

`bounce` in {0, 0.25, 0.5, 0.9}. A temporary probe test (deleted afterwards)
called `evaluateEasing(t, "spring", null, bounce)` and ran the same curve through
the runtime. Output: `.visual-check/10a/t8/probe-end-exact.txt`.

ω, from `npx vitest run src/compiler/renderer/easing.test.ts src/compiler/renderer/springRuntime.test.ts --disable-console-intercept`
(76 tests pass):

```
springOmega over bounce [0, 0.9] by 0.001: min 10.916954628129243, max 92.15365539902938; w(0) = 11.75637122249542, w(0.25) = 12.831572878091222, w(0.5) = 18.708362816404147, w(0.9) = 92.15365539902938
```

The bisection bracket is [1, 200]; every ω in the sweep is inside it.

| bounce | ω | y(0) | y(1) | `1 - y(1 - 1e-12)` as a fraction of ε | `1 - y(119/120)` | max y over 121 samples |
|---|---|---|---|---|---|---|
| 0 | 11.75637122249542 | 0 | 1 | 1.0000000000110 | 1.0945e-4 | 1.00000 |
| 0.25 | 12.831572878091222 | 0 | 1 | 0.2131 | 3.05e-5 | 1.02835 |
| 0.5 | 18.708362816404147 | 0 | 1 | -0.9996 | -1.0664e-4 | 1.16289 |
| 0.9 | 92.15365539902938 | 0 | 1 | -0.8845 | -1.0381e-4 | 1.72656 |

ε = `SPRING_EPSILON` = 1e-4.

- **The value at the last tick is what every other easing ends on.** For
  `from (0.3, 100)` to `(0.9, 100)` over 1 s (120 ticks), a case chosen because
  `0.3 + (0.9 - 0.3) * 1` is `0.9000000000000001`, not `0.9`, the runtime's x at
  the last tick is `0.9000000000000001` for linear, easeIn, easeOut,
  easeInOut and for spring at all four bounces. The spring ends on the shared
  lerp at progress 1, as spec section 6.2 says.
- **The step at t = 1 is at most ε.** The step is the snap from the curve's
  limit at 1 to exactly 1. For bounces 0.25, 0.5 and 0.9 it is below ε (0.21,
  0.9996 and 0.88 ε). For bounce 0 it is ε to within 1.1e-11 of ε: ω solves the
  defining equation exactly, so the limit is ε by construction, and the
  measurement at `1 - 1e-12` lands 1.1e-15 above it. `easing.test.ts` asserts
  `<= ε` for 0.25, 0.5 and 0.9 and `ε(1 ± 1e-10)` for 0. This is the one place
  spec section 6 item 2's "at most ε" holds to float noise rather than strictly.
- **A different reading of "step" would fail, and it is recorded here.** The
  last tick-to-tick move, `1 - y(119/120)`, is 1.09 ε at bounce 0 and 1.04 to
  1.07 ε at bounces 0.5 and 0.9, because the curve is still travelling between
  those two ticks. That is the curve's own slope, not a discontinuity, and the
  spec bounds the discontinuity, and this document reads it that way.
- **Not just at one frame.** `springRuntime.test.ts` runs a looping, yoyoing
  spring for 5 cycles (600 ticks): every leg ends exactly on its end value and
  every tick of every cycle equals cycle 1's bit for bit.

Tests: `easing.test.ts` (`bounce N: starts at exactly 0 and ends at exactly
1`, `bounce N: has settled to within the tolerance just before the end`, `solves
w to these exact doubles`, `keeps w inside the bisection bracket over the whole
bounce range`) and `springRuntime.test.ts` (`ends every loop-and-yoyo cycle
exactly where the first one does, with no drift`, `never reads a scale below 0
on any tick, and ends on the double every easing ends on`).

## 3. `detMath` accuracy

Command: `npx vitest run src/compiler/detMath.test.ts --disable-console-intercept`
(23 tests pass):

```
detMath sweep, every 0.01 deg on [-720, 720]: sinDeg max 0.7000 ulp at -491.57, cosDeg max 0.7000 ulp at -498.43
detMath wide magnitudes: max 0.5778 ulp at 43.84
detMath sweep, every 0.001 on [-50, 0]: detExp max 0.8562 ulp at -29.427
detMath sweep, every 0.1 on [-700, 700]: detExp max 0.8010 ulp at 116.8
```

Reference: a BigInt fixed-point reference written in the test file, at 2^-160
(about 48 decimal digits), with pi, ln 2 and e carried to 45 decimals and
cross-checked against a direct series. It never uses `Math.sin`, `Math.cos` or
`Math.exp`. Errors are in ulps of the reference's binade.

| Function | Sweep | Max error | Asserted bound |
|---|---|---|---|
| `sinDeg` | every 0.01 deg on [-720, 720] | 0.7000 ulp | below 0.72 |
| `cosDeg` | the same | 0.7000 ulp | below 0.72 |
| `sinDeg`, `cosDeg` | large and tiny magnitudes | 0.5778 ulp | 1 |
| `detExp` | every 0.001 on [-50, 0] | 0.8562 ulp | 2 |
| `detExp` | every 0.1 on [-700, 700] | 0.8010 ulp | none (monotone and finite; error logged, not bounded) |

The last row is a measurement the test does not bound; it is reported as logged.
Exactness: `are exact at the cardinal angles` (0, 90, 180, 270 degrees, also
negative and past one turn, and `360e12 + 90`), `give exactly 1/2 at 30 degrees
and its reflections`, `give the correctly rounded sqrt(1/2) at 45 degrees, from
both kernels`, `return +0, never -0, for an exact zero`. The source scans
(`calls no Math function but floor, abs and trunc`, `uses no exponentiation
operator and imports nothing`) pin portability.

## 4. Cross-engine hashes

Frame hash of 4 s at 30 fps, `--fps 30 --duration 4`. Headless: a throwaway
vitest file (deleted afterwards) running `compileSource`, `buildNode`,
`createWorldForScene`, `SceneRuntime`, `planExport`, `sampleFrames` and
`hashFrames` in Node. Chromium: `node tools/visual-check/export-check.mjs
--scene <scene> --fps 30 --duration 4 --out .visual-check/10a/out`, with
`npx vite --port 5199 --strictPort` running, which prints `runA snapshot hash`.
Script: `.visual-check/10a/t8/measure.sh`; output
`.visual-check/10a/t8/cross-engine-head.txt`.

### 4.1 `radial-dots` and the others, before and after

"Before" is the raw output recorded at `db4a07a` (the commit before the
trigonometry fix), kept in `.visual-check/10a/cross-engine.txt`. "After" was
re-run on this tree.

| Scene | Before: Node | Before: Chromium | After: Node | After: Chromium |
|---|---|---|---|---|
| eval/scenes-3b/radial-dots | 07dcbbd7 | 22cc9337 **differ** | 16109237 | 16109237 |
| eval/scenes-3b/compound-logo | 39dfd698 | 39dfd698 | 39dfd698 | 39dfd698 |
| eval/scenes-r2/radial-dots | ede3658f | ede3658f | ede3658f | ede3658f |
| site/gallery/aurora | 9c9d257c | 9c9d257c | fc3c6e30 | fc3c6e30 |
| site/gallery/fireworks | bbc6f366 | 3560306b **differ** | eca6dc52 | eca6dc52 |
| site/gallery/lighthouse | db91b0cf | db91b0cf | db91b0cf | db91b0cf |
| tools/visual-check/scenes/lottie-line-miter | 53c47bff | 53c47bff | 53c47bff | 53c47bff |
| src/examples/dusk-hills | 18c4b41d | 18c4b41d | 64a175b5 | 64a175b5 |

Before: two of eight differed. `eval/scenes-3b/radial-dots` was the known one;
`site/gallery/fireworks` was found while measuring and was not in the spec.
After: all eight agree. The two scenes that differed agree on their new hash.
Aurora and dusk-hills agreed before and agree after, on their new hashes.

### 4.2 Every non-physics, non-text scene

Spec section 6 item 4 says "every non-physics, non-text scene". The table above
is eight scenes, chosen in Task 3: the no-text scenes of `eval/scenes-3b`
(compound-logo has a physics block) plus the trigonometry scenes elsewhere. That is not every one,
so this section measures the rest. The set: every one of the 78 hashed entries
in `sceneFrameHashes.test.ts`'s baseline whose source has no `physics` word
(50 scenes; 28 contain the word. `eval/scenes-3b/radial-dots` mentions it only in
a comment, and `eval/scenes-3b/compound-logo` has a physics block on a group;
both are in 4.1 regardless).
Each was run through Chromium at 4 s and 30 fps and compared with its baseline
entry (the Node value, which `npm test`'s `matches the recorded baseline` pins).

| Scene | Node (baseline) | Chromium | |
|---|---|---|---|
| docs/media/bars-reveal.marey | 43daf7ed | 43daf7ed | match |
| eval/scenes-r2/arc-row.marey | efb158e3 | efb158e3 | match |
| eval/scenes-r2/bar-chart.marey | 26e2c16b | 26e2c16b | match |
| eval/scenes-r2/cross-fade.marey | 9da3d089 | 9da3d089 | match |
| eval/scenes-r2/grid-16.marey | 31aacdaf | 31aacdaf | match |
| eval/scenes-r2/param-easing.marey | ade13aeb | ade13aeb | match |
| eval/scenes-r2/pulse-dot.marey | 496d226f | 496d226f | match |
| eval/scenes-r2/radial-dots.marey | ede3658f | ede3658f | match |
| eval/scenes-r2/repeated-badge.marey | 3ca13e27 | 3ca13e27 | match |
| eval/scenes-r2/scale-ramp.marey | 497be997 | 497be997 | match |
| eval/scenes-r2/slide-card.marey | 19227344 | 19227344 | match |
| eval/scenes-r2/spin-triangle.marey | 4688688c | 4688688c | match |
| eval/scenes-r2/stagger-bars.marey | 5fc1433a | 5fc1433a | match |
| eval/scenes-r2/timeline-ticks.marey | ec55ded3 | ec55ded3 | match |
| eval/scenes/cross-fade.marey | 01745c81 | 01745c81 | match |
| eval/scenes/grid-16.marey | 3484e16f | 3484e16f | match |
| eval/scenes/pulse-dot.marey | 83af4d37 | 83af4d37 | match |
| eval/scenes/radial-dots.marey | 30b0eacb | 30b0eacb | match |
| eval/scenes/repeated-badge.marey | 3dd2df8f | 3dd2df8f | match |
| eval/scenes/slide-card.marey | 19227344 | 19227344 | match |
| eval/scenes/spin-triangle.marey | 013d9036 | 013d9036 | match |
| eval/scenes/stagger-bars.marey | 0a974a0c | 0a974a0c | match |
| examples/starter/hello.marey | 6166ea56 | 6166ea56 | match |
| site/gallery/aurora.marey | fc3c6e30 | fc3c6e30 | match |
| site/gallery/day-to-night.marey | e593bfb3 | e593bfb3 | match |
| site/gallery/fireworks.marey | eca6dc52 | eca6dc52 | match |
| site/gallery/forest.marey | d679d5fc | d679d5fc | match |
| site/gallery/lighthouse.marey | db91b0cf | db91b0cf | match |
| site/gallery/metronome.marey | ce519e9f | ce519e9f | match |
| site/gallery/ripple.marey | d0184acb | d0184acb | match |
| site/gallery/sunrise.marey | 1d86398c | 1d86398c | match |
| tools/visual-check/scenes/fit-contain.marey | 7251531b | 7251531b | match |
| tools/visual-check/scenes/fit-cover.marey | 7251531b | 7251531b | match |
| tools/visual-check/scenes/fit-fill.marey | 7251531b | 7251531b | match |
| tools/visual-check/scenes/fit-none.marey | 7251531b | 7251531b | match |
| tools/visual-check/scenes/linear-motion.marey | 03ed227f | 03ed227f | match |
| tools/visual-check/scenes/lottie-ease-in.marey | 19c03279 | 19c03279 | match |
| tools/visual-check/scenes/lottie-ease-inout.marey | 378aa964 | 378aa964 | match |
| tools/visual-check/scenes/lottie-ease-linear.marey | 1105d04e | 1105d04e | match |
| tools/visual-check/scenes/lottie-ease-out.marey | a2bdf655 | a2bdf655 | match |
| tools/visual-check/scenes/lottie-easing-halfframe.marey | 6842c45c | 6842c45c | match |
| tools/visual-check/scenes/lottie-layer-order.marey | 486ce2fb | 486ce2fb | match |
| tools/visual-check/scenes/lottie-line-caps.marey | 7a1c0af7 | 7a1c0af7 | match |
| tools/visual-check/scenes/lottie-line-miter.marey | 53c47bff | 53c47bff | match |
| tools/visual-check/scenes/lottie-line-scale.marey | a840db9f | a840db9f | match |
| tools/visual-check/scenes/lottie-opacity-flatten.marey | 0e715d13 | 0e715d13 | match |
| tools/visual-check/scenes/lottie-outpoint.marey | 44e44158 | 44e44158 | match |
| tools/visual-check/scenes/lottie-version-field.marey | 28d446a7 | 28d446a7 | match |
| tools/visual-check/scenes/spring-from.marey | 59bc2edc | 59bc2edc | match |

The first run, at `91f5703`, covered the 49 scenes above `spring-from`: 48 ran in its loop and all 48 matched, and the 49th, `src/examples/dusk-hills`, was skipped by the loop (its input list had no trailing newline) and is measured in 4.1: Node and Chromium both `64a175b5`. Output: `.visual-check/10a/t8/chromium-all.txt`.

`tools/visual-check/scenes/spring-from.marey` was added after the whole-branch
review, because no hashed scene used `from` or `spring`: every tracked scene
that did had text. It has no text and no physics, and uses `from` and
`easing: spring` at `bounce` 0, 0.25 and 0.9 across scale, position and alpha,
with a sequence whose first step has a `from`. With the runtime change that
shows a first step's `from` at tick 0 reverted, it hashes `ded39bc7` in Node,
so the entry also pins that change. The whole set of 50 was then run again
through Chromium on the final tree, with the input list ending in a newline.
47 matched in the loop; three (`eval/scenes/slide-card`, `spin-triangle` and
`stagger-bars`) printed no hash, while a full `npm test` ran beside the loop
and loaded the machine, and on a rerun alone each printed its baseline hash
(`19227344`, `013d9036`, `0a974a0c`). So 50 of 50 match, and none differs.
Output: `.visual-check/10a/fixwave/chromium-all.txt` and
`chromium-rerun.txt`.

## 5. Hash movement

The baseline table `src/compiler/renderer/sceneFrameHashes.test.ts` was added at
`e606d11`, before any behaviour changed. Derived from git:
`git diff e606d11..HEAD -- src/compiler/renderer/sceneFrameHashes.test.ts`
changes these lines and no others:

| Scene | Before | After | Commit | Reason |
|---|---|---|---|---|
| eval/scenes-3b/radial-dots | 07dcbbd7 | 16109237 | `1e3a2cc` | calls `sin`/`cos` |
| site/gallery/aurora | 9c9d257c | fc3c6e30 | `1e3a2cc` | calls `sin`/`cos` |
| site/gallery/domino-run | 1dfe6c7e | b77f71d6 | `1e3a2cc` | calls `sin`/`cos` |
| site/gallery/fireworks | bbc6f366 | eca6dc52 | `1e3a2cc` | calls `sin`/`cos` |
| src/examples/dusk-hills | 18c4b41d | 64a175b5 | `1e3a2cc` | calls `sin`/`cos` |
| site/gallery/spring-cards | (absent) | `"text"` | `af1bbd3` | a new scene, with text, so not hashed |

Each reason checked: `git ls-files '*.marey' | xargs grep -lE "\b(sin|cos)\("`
lists 14 tracked scenes, and the five that moved are among them:

```
eval/scenes-3b/radial-dots  eval/scenes-r2/radial-dots  site/gallery/aurora  site/gallery/domino-run
site/gallery/fireworks  site/gallery/hourglass  site/gallery/lighthouse  site/gallery/postcard
site/gallery/toy-box  src/examples/dusk-hills  tools/share-image/share-image
tools/visual-check/scenes/hello-face  tools/visual-check/scenes/lottie-line-miter  tools/visual-check/scenes/ring-pulse
```

The other nine either did not move (eval/scenes-r2/radial-dots, hourglass,
lighthouse, lottie-line-miter: the folded values are the same doubles) or are
text scenes with no hash (postcard, toy-box, share-image, hello-face,
ring-pulse). No scene without `sin` or `cos` moved. The 25 hashes recorded
before Phase 8 are unchanged, and so is every other entry: the diff above has
no other `-` line.

`from` alone and `spring` alone moved no hash. Only two commits since `e606d11`
touch the table: `1e3a2cc` (the five moves above) and `af1bbd3`, whose diff of
the file is the single added `spring-cards` line. The language commits (`from`,
`spring`) leave it alone, and the suite stayed green through them.

**Snapshot literals.** `git diff e606d11..HEAD -- src/compiler/__snapshots__/determinism.test.ts.snap`:

```
-          "y": 490.52558883257655,          +          "y": 490.5255888325765,
-          "x": 289.9999999999999,           +          "x": 290,
-          "y": 109.47441116742354,          +          "y": 109.47441116742351,
```

(each pair appears twice, once per snapshot), from `sin(30)`-style folds
(`1e3a2cc`). The rest of the snapshot diff is additive: every animation record
gains `"from": null` and `"bounce": 0.25`, the two new IR fields at their
defaults.

**The table is closed over every tracked scene.** `git ls-files '*.marey' | wc
-l` was 111 at `91f5703`: the 110 scenes of Task 1 plus `spring-cards`.
`spring-from` (section 4.2) makes it 112, with 78 hashed entries. A script that
normalises the table's keys (relative to `src/compiler/renderer/`) and diffs
them against `git ls-files '*.marey'`:

```
table keys 111 git ls-files 111
in table not git: []
in git not table: []
classes { hash: 77, text: 34 }
```

The test `has an entry for every first-party scene and no stale entries` is the
in-suite half of this; the cross-check against git is the manual half (the test
cannot call `node:fs`). Sources are in `.visual-check/10a/t8/closed-table.txt`.

## 6. Each new diagnostic is pinned by a test that fails when its rule is deleted

For each of the four codes, the guard in front of its `errors.push` in
`src/compiler/typeChecker/validator.ts` was replaced so the push cannot run
(`slice(1)` became `slice(1000)` for the loop; `if (...)` became `if (false &&
...)` for the others), the covering test file was run, and the file was
restored from a copy. `git diff --stat` printed nothing after each restore, and
the file passes again. Output: `.visual-check/10a/t8/revert-outputs.txt`.

| Code | Covering file | Red with the rule deleted | Green after restore |
|---|---|---|---|
| `TYPE_PARALLEL_ONE_PHYSICS` | `phase8Diagnostics.test.ts` | 3 failed, 20 passed | 23 passed |
| `TYPE_BOUNCE_WITHOUT_SPRING` | `springDiagnostics.test.ts` | 2 failed, 9 passed | 11 passed |
| `TYPE_HANDOFF_SPRING` | `springDiagnostics.test.ts` | 1 failed, 10 passed | 11 passed |
| `TYPE_SPRING_SCALE_PHYSICS` | `springDiagnostics.test.ts` | 3 failed, 8 passed | 11 passed |

The red output:

```
TYPE_PARALLEL_ONE_PHYSICS  (for (const extra of parallelPhysics.slice(1000)))
 FAIL ... > TYPE_PARALLEL_ONE_PHYSICS > rejects a second physics block in one parallel
AssertionError: expected [] to deeply equal [ Array(1) ]
 FAIL ... > TYPE_PARALLEL_ONE_PHYSICS > reports one diagnostic per extra block when there are three
AssertionError: expected [] to deeply equal [ …(2) ]
 FAIL ... > TYPE_PARALLEL_ONE_PHYSICS > rejects the split spin and lockRotation case
AssertionError: expected [] to deeply equal [ Array(1) ]

TYPE_BOUNCE_WITHOUT_SPRING  (if (false && bounceVal !== undefined && ...))
 FAIL ... > TYPE_BOUNCE_WITHOUT_SPRING names the easing written
 FAIL ... > TYPE_BOUNCE_WITHOUT_SPRING names the default easing when none is written
AssertionError: expected [] to deeply equal [ Array(1) ]   (both)

TYPE_HANDOFF_SPRING  (if (false && easing === "spring") { ... [TYPE_HANDOFF_SPRING] ...)
 FAIL ... > TYPE_HANDOFF_SPRING rejects a spring that would hand off
AssertionError: expected [] to deeply equal [ Array(1) ]

TYPE_SPRING_SCALE_PHYSICS  (if (false && easing === "spring" && propVal?.kind === "animProperty" && ...))
 FAIL ... > TYPE_SPRING_SCALE_PHYSICS > fires on an object that declares physics, at the easing value
 FAIL ... > TYPE_SPRING_SCALE_PHYSICS > fires on a child of a group that declares physics
AssertionError: expected [] to deeply equal [ Array(1) ]   (both)
 FAIL ... > TYPE_SPRING_SCALE_PHYSICS > fires on a group whose child declares physics, inside a sequence
AssertionError: expected [ Array(1) ] to include '[TYPE_SPRING_SCALE_PHYSICS] The \'ani…'
```

### The Phase 8 follow-ups are closed

`eval/RESULTS-PHASE-8.md` (a dated record, not edited) listed one case open
under "What this does not show": `spin` and `lockRotation` coming from sibling
physics blocks in one `parallel`. A second `physics` block in a `parallel` was
the other follow-up (it compiled and one block's settings silently won).
`TYPE_PARALLEL_ONE_PHYSICS` closes both: two `physics` blocks directly under
one `parallel` is a compile error, one diagnostic per block after the first.
The tests, all in `phase8Diagnostics.test.ts` under
`TYPE_PARALLEL_ONE_PHYSICS`, red above with the rule deleted:

- `rejects a second physics block in one parallel`
- `reports one diagnostic per extra block when there are three`
- `rejects the split spin and lockRotation case` (the Phase 8 case)
- `allows physics blocks in separate sequence steps` (guards a non-change; passes
  either way)

## 7. The checks

All run after the last code commit (`91f5703`), in this order.

### 7.1 The four `AGENTS.md` checks

```
$ npm test
 Test Files  121 passed (121)
      Tests  2212 passed (2212)
   Duration  19.76s

$ npx vitest run --config eval/vitest.config.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)

$ npm run build
✓ built in 2.53s        (tsc -b passed; Vite's chunk size notice only)
exit 0

$ npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')
✓ built in 50ms
check exit 0; 111 files, 111 lines ending ": ok", 0 other lines
```

### 7.2 `npm run check:export`

```
matrix: all passed  (109.2 s)
```

20 cases (bar-chart, radial-dots, compound-logo, timeline-ticks, each in png,
apng, webm, mp4 and lottie; each run twice with equal hashes and byte-equal
output for the gated formats; the mp4 SHA-256 differences are reported, not
gated, as R47 records) and the font-refusal case (`[EXPORT_FONT_UNAVAILABLE]`).
`check:export` runs the canonical scenes; spring-cards was exported by hand in
section 1.

### 7.3 `npm run check:pack`

The first run, before `91f5703`:

```
ok    npm pack --json   129 files, 910125 B packed, 2998736 B unpacked
FAIL  tarball file count   129 files, expected 127
```

After moving the pin (section above):

```
ok    npm pack --json                    129 files, 910125 B packed, 2998736 B unpacked
ok    tarball file count                 129 files
check:pack: all passed
```

with the install, `marey --version` (0.7.0), `marey check`, a Lottie export
from the installed package, the library import, both consumer typechecks, the
no-PixiJS library bundle, the player's static import closure and the player's
inline draw in Chromium all `ok`. `package.json`'s version was not touched.

### 7.4 `site-check.mjs`

Against `npm run build`'s `dist/`, served by `npx vite preview --port 5199
--strictPort` (the check refuses a development server), stopped afterwards:

```
node tools/visual-check/site-check.mjs --out .visual-check/10a/site
...
pages /gallery/spring-cards/: 1/1 ready, pooled max 1, 0 problem(s), 1.8 s
budget: largest /learn/ship-it/ 44.6 kB gzipped
pool: 1280x900: at most 12 players connected; at most 9 cards on screen, 0 without a player once still
pool: 1280x2400: at most 12 players connected; at most 18 cards on screen, 6 without a player once still
shots: 37 screenshots
site-check: all passed
```

All 52 pages report `0 problem(s)`; the run took 11 min 29 s.

### 7.5 After the whole-branch review

The review's fixes landed as three code commits after `9bde596`: `26fa106`
(a sequence's first-step `from` is shown at tick 0), `96c9834` (one
`TYPE_ANIM_COLOR_TARGET` per block, and truer wordings for
`TYPE_PARALLEL_ONE_PHYSICS` and `TYPE_SPRING_SCALE_PHYSICS`) and `658f583`
(the `spring-from` fixture and the free-body lock's fall). No existing
frame hash moved. The four checks passed on the tree of each of the three
commits (2218, 2219 and 2220 tests; 111, 111 and 112 files checked), and on
the final tree:

```
$ npm test
 Test Files  121 passed (121)
      Tests  2220 passed (2220)

$ npx vitest run --config eval/vitest.config.ts
      Tests  5 passed (5)

$ npm run build
✓ built in 3.45s        exit 0

$ npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')
check exit 0; 112 lines, 112 ending ": ok"
```

The closed table against `git ls-files '*.marey'`: 112 keys and 112 files,
none missing on either side, 78 hashes and 34 `"text"`
(`.visual-check/10a/fixwave/closed-table.txt`). Section 4.2's Chromium run
was repeated on this tree. `check:export`, `check:pack` and `site-check.mjs`
were not re-run: the fixes change no export, packaging or site code, only
the runtime's tick-0 state for a sequence whose first step has a `from`, and
no first-party scene outside `spring-from` has one.

## What this does not show

- **Matter.js's own trigonometry.** `detMath` makes Marey's own `sin`, `cos`
  and the spring's `exp` portable. Matter.js calls `Math.sin`, `Math.cos` and
  friends inside its engine, and a physics scene's trajectory depends on them.
  Nothing here makes a physics scene hash the same across engines.
- **Other engines.** Node and Chromium are both V8. The two V8 builds differed
  before (their `Math.sin` and `Math.cos` are not the same function), and agree
  now. SpiderMonkey and JavaScriptCore were not run. What `detMath` uses
  (`floor`, `abs`, `trunc`, multiplication, addition) is specified exactly by
  IEEE 754 and ECMAScript, so agreement is expected, but it was not measured.
  That depends on no engine contracting `a * b + c` into a fused multiply-add;
  ECMAScript forbids it, and `detMath.ts` states the requirement for a port.
- **Text scenes have no hashes.** 34 of the 112 tracked scenes (including
  spring-cards) are recorded as `"text"` in the baseline because text needs a
  DOM. Their agreement was not compared headless against Chromium. For
  spring-cards the player-versus-export hash (1.3) is the only hash evidence;
  `spring-from` (4.2) is the hashed, cross-engine evidence for `from` and
  `spring`.
- **`site/gallery/domino-run`'s moved hash was not measured across engines.**
  It is a physics scene and calls `sin`/`cos`, so its new hash `b77f71d6` is
  recorded in the baseline but measured only in Node, and it could still differ
  in Chromium through Matter's own trigonometry (the first item).
- **The `wasFree` angular-velocity zeroing in `physicsWorld.ts` is unreachable.**
  Task 4 tried a sentinel (`wasFree && angularVelocity !== 0` throws) and a runtime
  probe of seven shapes; nothing reached it, and disabling the zeroing leaves the
  suite green. The branch stays, with a comment naming why. No test pins it.
  (The free-body lock at `setParams` is reachable and is pinned.)
- **The two `evaluateEasing` calls in `finalTickVelocity` are unreachable for
  `spring`.** `finalTickVelocity` runs only for `handoff: true`, and
  `TYPE_HANDOFF_SPRING` rejects handoff with spring. They pass `bounce` through
  anyway; a sentinel throwing on a spring there left 2192 of 2192 tests green.
  No test covers them. The other three call sites (`applyAnim`, `scaleOf`,
  `pushAnimToWorld`) were each reverted separately and each failed a test.
- **Alpha endpoints are not range-checked.** `animate { property: alpha, to: 1.5 }`
  compiles; only the spring's overshoot is clamped to [0, 1], and no other
  easing is clamped (a test pins that an authored alpha above 1 still reads as
  written). Filed, not fixed.
- **`spring` is now a reserved word.** It lexes as an easing keyword like
  `easeIn`, so a scene that names an object, a `let` or a template parameter
  `spring` stops compiling. No tracked scene does (`marey check` passes on all
  112), and `LANGUAGE.md` says so, but a third-party scene would break, and the
  parser still gives no hint for an easing token used as a name.
- **The cross-engine claim is limited to the scenes listed.** Section 4.1 is
  eight scenes; 4.2 is the non-physics, non-text scenes of the baseline, matched
  by the absence of the word `physics` in the source. A scene that builds a
  physics body without the word (none is known) would be in 4.2
  by accident, and a non-physics scene with `physics` in a comment would be
  left out of it.
- **A test failure that was not reproduced.** During Task 3 one `npm test` run
  reported 1 failed of 2136 and the failing test was not recorded; three later
  full runs and every run for this document (121 files, 2212 tests) were green.
  There is no explanation for it. It may have been a timeout under load.
- **Lottie on spring-cards is judged against the per-frame encoder's output on
  the same frames,** not against an independent oracle, in lottie-web and
  dotlottie-web only. The text in it differs from the PNG export by up to 120 levels
  in both the per-frame and the fitted file.
- **Version numbers.** The site's version notes read "0.8.0 or later" and
  `package.json` is still 0.7.0; the version moves once, at the end of 10D.
