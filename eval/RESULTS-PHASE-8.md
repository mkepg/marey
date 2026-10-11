# Phase 8 results: physics authoring syntax

Measured on 2026-10-11 on branch `phase-8`, at `14cf66d` plus the version bump
and documentation edits the commit carrying this file contains. Every number
below was produced by the command beside it on that tree. Captures and logs
came from `.visual-check/phase8/final/` (git-ignored; re-run the commands to
regenerate). Vite ran on 5199 with `--strictPort` and was stopped afterwards
(no listener on 5199).

Design: `docs/specs/2026-10-11-marey-phase-8-physics-authoring-syntax-design.md`
(criteria in section 7). Plan: `docs/plans/2026-10-11-phase-8-physics-authoring-syntax.md`.
Phase base (the spec's commit): `daec822`.

## E1: the behaviours are measured

Command:

```
npx vitest run src/compiler/renderer/phase8Runtime.test.ts src/compiler/renderer/physicsWorld.test.ts
```

`phase8Runtime.test.ts` alone: 25 tests pass (`npx vitest run
src/compiler/renderer/phase8Runtime.test.ts`). Each test below compiles source
with `compileSource` and runs it through `buildNode`, `createWorldForScene` and
`SceneRuntime`, as the sampler's callers do.

| Spec item | Test | Measured |
|---|---|---|
| 1. World gravity `(0, 980)` gives 980 px/s after 1 s; an own `gravity: (0, -200)` gives -200 | `world gravity > is the gravity of a physics block that has none of its own`, `... > gives way to a block's own gravity` | Both pass: speed over the last tick of the first second is within 0.5 px/s of 980 and of -200 |
| 2. `spin: 360` in a vacuum turns exactly 2 pi in 120 ticks, tolerance 1e-9 | `spin > spin: 360 in a vacuum has turned exactly 2π after 120 ticks` | Passes: `abs(rotation - 2 pi) < 1e-9` |
| 3. A `lockRotation` box dropped corner-first onto a locked ramp keeps its angle exactly for 600 ticks while its position changes | `lockRotation > a locked crate keeps its angle exactly for 600 ticks ...`, with the control `an unlocked crate tips on the ramp, so the locked cases below can tell` | Passes: all 600 sampled angles equal the first, which is within 1e-12 of the 30 degree start; the crate fell more than 50 px. The unlocked control turns by more than 0.1 rad. Four more tests hold the lock through a sequence step, a scale animation, a second physics block in a parallel step, and a lock that arrives after a sibling block's spin was flushed (it fails without the angular-velocity reset) |
| 4. A locked body struck by a falling body does not move (1e-9); a locked body under `animate position` is at the animation's value at every tick and stays there | `lockPosition > (a)`, `(b)`, `(c)`, `(d)`, and `exit criteria measured through the compiled pipeline > a locked paddle is at its animation's value on every tick ...` | (a) ledge at (200, 200) within 5e-10 after 600 ticks with a circle resting on it; (c) the same for a locked group. The last test samples the paddle on each of 300 ticks against the closed form `100 + 200 * min(tick, 120) / 120`: worst deviation under 1e-9, a ball striking it after the animation ends |
| 5. `bounds: [left, right, bottom]` lets a body from `y = -100` fall in and rest on the floor; `bounds: []` lets a body fall out, be culled, and the runtime go idle | `exit criteria measured ... > bounds: [left, right, bottom] lets a body start above the scene ...`, `world bounds > a scene with bounds: [] lets its body fall out ...`, and `MatterWorld walls` in `physicsWorld.test.ts` | Compiled pipeline: after 1200 ticks the circle rests with y between 280 and 300 in a 300 px scene and the runtime is idle. `bounds: []`: the body is gone from the world after 2400 ticks and the runtime is idle. `MatterWorld` level: a body from y = -150 rests above 500 with the three walls, stays above the scene with all four, and ends below 600 with none |

**Two gaps closed by `14cf66d`.** Spec item 4 asks for the paddle at the animation's value on every tick to 1e-9, and the existing test `(b)` sampled ticks 60, 120 and 600 to 1e-6. Item 5's first half was pinned at the `MatterWorld` level only. `14cf66d` adds the two tests in the `exit criteria measured through the compiled pipeline` block. Each was shown load-bearing: moving the paddle's expected plateau from tick 120 to 119 fails the first, and changing the world to `bounds: []` fails the second.

### Finding: a body asleep on a moving pinned body hung in mid-air

Found after the example (`4638e9c`) was written. A body that fell asleep on a
`lockPosition` paddle stayed where it slept when the paddle later moved away,
because Matter's sleeping bodies are not touched by a pinned body's sync. The
same applied to a paddle that tilted, shrank, or moved into a sleeper. Fixed in
`physicsWorld.ts` by `ae5b017` (a pinned body that moves, turns or scales wakes
the sleeping bodies it leaves or reaches) and `dab265a` (it also holds awake the
bodies resting on it for as long as it moves). `4845102` moved the playback
corpus onto `createWorldForScene` so the corpus exercises the production world.

The tests that pin it are in `phase8Runtime.test.ts`, "a pinned body that moves
wakes the bodies asleep against it" (7 tests). Re-run with the fix on the tree:
24 of 24 pass. Re-run with the fix patch reversed (`git diff 4638e9c HEAD -- src
':!*.test.ts'`, applied with `git apply -R`, then restored with `git checkout --
src`): **6 of the 7 fail** (the slide-out, the lowered paddle, the slowly lowered
paddle, the tilt, the shrink and the move-into-the-sleeper cases) and the
seventh, the control "a crate asleep on a locked paddle that does not move stays
asleep", still passes, as it should. The tree was clean afterwards.

### A spec decision taken during execution

A body given a nonzero `spin` may sleep only when its rim speed plus linear
speed is below Matter's linear sleep threshold (spec section 5.4).
Matter measures `speed^2 + angularSpeed^2` against one threshold, in different
units, so a body turning in place below about 972 degrees per second counted as
still, and `spin: 360` in a vacuum slept on tick 120, one tick short of a full
turn. Bodies never given a spin keep Matter's rule, which E3 confirms below. The
landing case is pinned by `spin > a spun body that lands and settles on the
floor still falls asleep, and the runtime goes idle`.

## E2: every diagnostic fires with its exact wording, and each is load-bearing

Command:

```
npx vitest run src/compiler/parser/world.test.ts src/compiler/typeChecker/phase8Diagnostics.test.ts
```

Result: 13 and 19 tests pass (32 in total). The type-error tests assert the
whole `[CODE] sentence` string from spec section 2.2; the parse-error tests
assert the whole message of section 2.1.

Delete-and-run: for each rule, the line that implements it was neutralised (the
guarding condition replaced by `false`, or the call removed), the two files above
were run, and the source was restored with `git checkout`. The harness is
`.visual-check/phase8/final/mutate.mjs` (local), its output
`.visual-check/phase8/final/mutate.txt`. `git diff --stat -- src` was empty after
the run.

| Rule | Deleted | Tests that fail |
|---|---|---|
| `world` outside the scene (entry check in `parseObject`) | `&& !allowWorld` guard | `rejects a world block produced by generate in the scene` |
| `world` inside a shape's body (second site in `parseObject`) | the `world` branch | `rejects a world block inside a circle` |
| second `world` | `worldNode !== undefined` check | `rejects a second world block` |
| nested block inside `world` | the `NAMELESS_BLOCKS` guard | `rejects a nested block inside world` (and 23 others, since the guard is shared with `physics` and `animate`) |
| `bounds` element that is not a bare word | `if (type !== "IDENT") reject()` | `rejects a bounds element that is not a bare word` |
| `TYPE_BOUNDS_EDGE` | the edge-name test | `TYPE_BOUNDS_EDGE names a bounds word that is not a scene edge` |
| `TYPE_BOUNDS_DUPLICATE` | the `seen` test | `TYPE_BOUNDS_DUPLICATE fires once, on the repeat` |
| `TYPE_LOCK_IGNORED` | the `if (written)` push | 7 tests, one per ignored property (`velocity`, `gravity`, `airDrag`, `spin`, `lockRotation`, `collideBounds`, `duration`) |
| `TYPE_LOCK_IN_SEQUENCE` | the lock test in a step | 2 tests, sequence and parallel |
| `TYPE_LOCK_WITH_SEQUENCE` | the sibling-sequence test | `TYPE_LOCK_WITH_SEQUENCE fires for a locked physics beside a sequence` |
| `TYPE_LOCK_HANDOFF` | the locked-receiver branch | `TYPE_LOCK_HANDOFF is the only handoff diagnostic for a locked receiver` |
| `TYPE_SPIN_LOCKED` | the spin-with-lockRotation test | `TYPE_SPIN_LOCKED fires for spin with lockRotation: true` |
| the `bounds` kind label (`a list of scene edges, such as [left, right, bottom]`) | the label text | `a non-list bounds is the generic kind mismatch, naming scene edges` |

All 13 deletions failed at least one test. Two notes on what this does and does
not show:

- The placement rule has two code sites in `parseObject.ts` (the entry check and
  the check inside a shape's body). Each failed exactly one test when deleted
  alone. `rejects a world block inside a group` failed under neither single
  deletion, so a group is rejected by whichever of the two is present and that
  test is not pinned to either one.
- The nested-block deletion also removes the guard for `physics` and `animate`
  blocks, which is why it failed 24 tests; the world-specific test is among them.

## E3: nothing that existed changes

Command:

```
npx vitest run src/compiler/renderer/sceneFrameHashes.test.ts
```

Result: 1 test passes. It samples 4 s at 30 fps from every headless first-party
scene and compares `hashFrames` to a table of **25** recorded hashes (the same
corpus as `playback.test.ts`: `src/examples/`, `eval/scenes-3b/` and
`tools/visual-check/scenes/`).

- The test and its table were committed in `fc6d365`, before the first
  production change of the phase (`ab5a9ec`). The only later edit to the file
  is `2ef143c`, which switched the world's construction from `new MatterWorld`
  to `createWorldForScene`; `git diff fc6d365..HEAD -- <file>` shows those two
  lines and no hash.
- **Coverage limit.** The 17 scenes that contain `text` are skipped, because
  text needs a DOM that the Node test does not have. Their frames are not hash
  compared by this test. `playback.test.ts` skips the same 17. Scenes added
  after the baseline (such as `ledges.marey`) are not in the table.
- Determinism snapshot: `git diff daec822..HEAD --stat -- src/compiler/__snapshots__`
  shows `determinism.test.ts.snap | 54 +++++`, 54 insertions and no deletion.
  Counting the added lines: `"spin": 0`, `"lockRotation": false` and
  `"lockPosition": false` 12 times each (36 lines), and a `"walls"` array of
  `left`, `right`, `top`, `bottom` three times (18 lines). Those are the new
  defaulted IR fields and nothing else.

## E4: the new example is a real artifact

Example: `src/examples/ledges.marey`. 800 x 600, 9 s, so 270 frames at 30 fps.
`node bin/marey.mjs check --export-ready src/examples/ledges.marey`:
`ok`.

**Identical hashes on two runs in every format.** `marey export ... --fps 30`
was run twice per format, and the library call that the CLI wraps
(`exportScene`) twice per format, from a built `dist/cli/marey.mjs`:

```
npm run build:package
node bin/marey.mjs export src/examples/ledges.marey --format <png|apng|webm|mp4|lottie> --fps 30 --out <path>
```

| Format | Frames | Size | Output SHA-256 across two runs | Simulation hash (`hashFrames`) across two runs |
|---|---|---|---|---|
| png | 270 | 800 x 600 | identical (sha256 of the 270 per-file digests, `82daf66c...`) | `0ec0752e`, `0ec0752e` |
| apng | 270 | 800 x 600 | identical (`f0956a07...`) | `0ec0752e`, `0ec0752e` |
| webm | 270 | 1600 x 1200 | identical (`97085711...`) | `0ec0752e`, `0ec0752e` |
| mp4 | 270 | 1600 x 1200 | **differs** (`efa4a1c7...` against `60f23957...`) | `0ec0752e`, `0ec0752e` |
| lottie | 270 | 800 x 600 | identical (`78fd1e58...`) | `0ec0752e`, `0ec0752e` |

MP4 bytes differ between runs and are not gated, for the reason
`eval/RESULTS-PHASE-6.md` and `tools/cli-check/export-matrix.mjs` give (R47:
WebCodecs' H.264 is not byte-identical between runs). Its simulation hash is
identical and so is its frame count and coded size. The export matrix itself
(`npm run check:export`) covers the four canonical scenes, not this example.
The library run is `.visual-check/phase8/final/export-twice.mjs` (local): per
format it calls `exportScene({ source, format, fps: 30, durationSeconds: null })`
twice and compares `hash` and a SHA-256 of the output.

**Plays in lottie-web.** Command:

```
npx vite --port 5199 --strictPort
node tools/visual-check/lottie-check.mjs --scene src/examples/ledges.marey --fps 30 --compare-png --frames 0,30,90,180,269 --at 400,300 --out .visual-check/phase8/final/lottie
```

Exit 0; 0 page errors, 0 console errors, 0 lottie-web `error` events. Both
exports report `fps 30, frameCount 270, hash 0ec0752e`, so the Lottie document
and the PNG export sampled the same run. Lottie against the PNG export:

| Frame | Mismatching pixels (of 480,000) | Share | maxDelta | Ink bounding box edge delta (half coverage and any ink) |
|---|---|---|---|---|
| 0 | 2208 | 0.46% | 80 | 0 |
| 30 | 3605 | 0.75% | 81 | 0 |
| 90 | 5019 | 1.05% | 88 | 0 |
| 180 | 4489 | 0.94% | 81 | 0 |
| 269 | 4284 | 0.89% | 76 | 0 |

`frame_90_diff.png` was opened: the red marks are one pixel outlines of the
ledges and crates, the antialiasing-at-edges pattern
`eval/RESULTS-PHASE-5A.md` describes, with no filled interior. Ledges is built
from rectangles (no text), so there is no glyph outline in the diff. The share
is about twice Phase 7's colour fixture's because the scene is made of many
rotated rectangle edges.

**Seek equals play, and the playground.** Command (Vite on 5199 running):

```
node tools/visual-check/transport-check.mjs --out .visual-check/phase8/final/transport
```

Exit 0, **25 of 25 requirements pass**, no console or page error. `ledges` is
one of the five examples it drives through the Examples menu: seek equals
reference at ticks 0, 37, 120 and the end (1080) in shuffled order (backward
seeks 120 to 37 in 49.8 ms, 1080 to 0 in 12.5 ms), live play for 1.5 s then pause
equals reference (tick 180), and it stops at exactly 1080 of 1080 and restarts
below tick 30. `node tools/visual-check/playground-check.mjs --out
.visual-check/phase8/final/playground`: 46 of 46 assertions pass, 0 console
errors.

## E6: the package is ready to publish as 0.5.0

```
npm version 0.5.0 --no-git-tag-version
npm run build:package
npm run check:pack
```

`check:pack: all passed`: 57 files, 585,977 B packed, 1,814,581 B unpacked;
`npx marey --version` prints `0.5.0` from the installed tarball; both consumer
typechecks report 0 errors; no pixi in the installed library bundle.
`package.json` and `package-lock.json` both read 0.5.0. Nothing was published:
`npm publish` is the owner's step after the merge.

## Other checks run on this tree

| Command | Result |
|---|---|
| `npm test` | 74 files, 1479 tests passed |
| `npx vitest run --config eval/vitest.config.ts` | 1 file, 5 tests passed |
| `npm run build` | built (typecheck included; Vite's chunk size notice only) |
| `npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')` | 86 files, every one `ok`, exit 0 |
| `npm run check:export` | `matrix: all passed` (140.6 s) |
| `npm run check:pack` | `check:pack: all passed` |

## What this does not show

- Frame hashes of the 17 text scenes are not compared (E3 coverage limit above).
- `ledges` is checked in Chromium through lottie-web; no other third-party
  player was run on it this phase.
- The independent whole-branch review that spec E5 requires has not run at the
  time of this file; it follows the commit.
