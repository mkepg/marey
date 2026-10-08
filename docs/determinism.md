# Determinism in Marey

Marey scenes can contain a physics simulation (Matter.js), and they export to
files. This document says what "the same output every time" means for those
files, how the renderer makes it hold, how it is checked, and the one bug
that showed the checks had a hole.

Every claim below points at the command that checks it or the file that
holds it. Run commands from the repository
root after `npm install`. The export commands also need the pinned browser
(`npx --package playwright-core@1.62.1 playwright-core install chromium-headless-shell`)
and a build of the CLI and its export page:

```bash
npm run build:export-page && npm run build:cli
```

## 1. What is claimed

Given the same source and the same engine build:

- **The simulation state at every output frame is identical.** `hashFrames`
  (`src/compiler/export/frameHash.ts`) hashes the sampled state of every
  object at every frame, as `snapshotFor` (`frameSampler.ts`) reads it: its
  id, position, rotation, scale, alpha, visibility and colour (null for a
  group), with each frame's index and tick. The values are not rounded
  first, so a difference in the last bit changes the hash. `marey export`
  prints this hash as `frames <hash>`.
- **The file bytes are identical** for `png`, `apng`, `webm` and `lottie`.
  `marey export` prints their SHA-256 as `sha256 <hex>`.

MP4 is the exception, covered in the next section.

Check it by exporting twice and comparing the two lines:

```bash
node bin/marey.mjs export eval/scenes-3b/compound-logo.marey --format png --out .visual-check/determinism/run1
node bin/marey.mjs export eval/scenes-3b/compound-logo.marey --format png --out .visual-check/determinism/run2
```

Section 4 shows the output.

## 2. What is not claimed

- **Identical output across JavaScript engines.** `sin` and `cos` in a scene
  are folded to numbers when the source compiles, and `Math.sin` is not
  required to be correctly rounded. Node's V8 and Chromium's V8 disagree by
  about one unit in the last place at 240°:

  ```bash
  node -e "console.log(Math.sin(240*Math.PI/180).toPrecision(20))"
  # -0.86602540378443848557   (Node 22.13.1)
  ```

  The same expression evaluated in a Chromium page gives
  `-0.86602540378443837454`; the command and the versions are in
  `eval/RESULTS-GATE-B.md`.

  So `radial-dots.marey` hashes differently when compiled in Node and in
  Chromium, while `compound-logo.marey`, which has no trig, matches
  (`eval/RESULTS-GATE-B.md`). This is why `marey export` compiles the source
  again inside the browser: the file comes from the same engine the export
  button uses.
- **Identical output across machines.** Exports rasterize on SwiftShader, a
  CPU renderer, forced by `EXPORT_LAUNCH_ARGS` in `src/cli/exportDriver.ts`.
  That makes cross-machine identity plausible. It is untested, because the
  project has been measured on one machine.
- **Identical MP4 bytes.** MP4 goes through Chromium's WebCodecs H.264
  encoder, the same path as the export button. Two runs give the same
  `frames` hash and different file bytes. The lossless frames fed to the
  encoder are identical, so the difference is inside the encoder. See
  "The container determinism asymmetry" in `docs/architecture/renderer.md`.
  A separate x264 encoder was measured and failed the gate, so this path
  stays; see `eval/RESULTS-PHASE-6.md`, "Task 1: x264 gate".
- **That paint cadence cannot matter for a scene with a `sequence`.** The
  sampler paints after every tick. Painting once per frame instead was tried
  in Phase 4, and the 30-vs-60 fps coincident-frame test still passed. The
  recorded reason: a completing animation's value is already snapped to its
  tick in the tick phase, so nothing in that test's fixture was left for
  paint cadence to affect. That fixture has no `sequence` block. Since
  Phase 7, `playback.test.ts` plays every first-party scene without text at
  the live cadence and compares it with the sampler's loop, and both
  `sequence`-bearing scenes in that corpus, `physics-pile.marey` and
  `compound-logo.marey`, agree (`frameSampler.ts`'s docstring). Two scenes
  are evidence, not a proof for every scene, so painting every tick is kept
  as the conservative choice.

## 3. The mechanism

**One clock, one conversion.** The simulation runs at a fixed 120 ticks per
second (`TICK_HZ` in `src/compiler/sceneIR.ts`). Every duration in the
language becomes whole ticks through one function, `secondsToTicks`, which
the type checker and the renderer share. An export frame rate must divide
120 (`EXPORT_UNSUPPORTED_FPS` otherwise), so every frame lands exactly on a
tick: at 30 fps, frame *k* is tick 4*k*.

**Ticks change state; paints only draw.** `advanceOneTick()` advances exactly
one tick and takes no time argument. The live preview converts wall-clock
time into a whole number of ticks and paints once per screen frame, using the
leftover fraction of a tick, `alpha`, to draw smoothly between ticks. Nothing
that feeds the physics world may depend on `alpha`. The renderer's
invariants are in `docs/architecture/renderer.md`.

**Both subsystems read `alpha` backward.** Since Phase 6C, `paint(alpha)`
paints an animation at `paintProgress` (`timeline.ts`), the lerp from tick
N-1's progress to tick N's, and a physics body at `readState`, which lerps
from its previous position to tick N. Each is exact at `alpha = 1`, so one
`alpha` puts both on the same moment. Exports still paint with
`paintExactTick()`, which reads tick-exact values: animations through
`animProgress(…, 0)`, physics at `readState(…, 1)`. That is the same picture
as `paint(1)` except on a looping animation's wrap tick, where alpha 1 is the
end of the cycle and the exact tick is the start of the next one. Before 6C
an animation extended forward from tick N, so the two subsystems sat a tick
apart live (`docs/architecture/renderer.md` has the measurement).

**The sampler never sees a clock.** `sampleFrames` (`frameSampler.ts`) turns
a frame index into a tick count and calls `advanceOneTick()` that many
times. Frame 0 is tick 0, the scene as written.

**A sought or paused frame is a sampled frame.** The preview's playback
(`src/compiler/renderer/playback.ts`) has no seek of its own. Jumping back
rebuilds the scene and replays it from tick 0 with the sampler's loop,
`advanceOneTick(); paintExactTick();` per tick. Jumping forward continues
from the current tick with the same loop, so it reaches the same state
without a rebuild. Pausing repaints the current tick with
`paintExactTick()`. So the frame on screen after a seek or
a pause is the frame an exporter samples at that tick. `Playback`'s
`referenceHash(tick)` builds a fresh tree, runs that loop and hashes the
result with `hashFrames`; `snapshotHash()` hashes the tree on screen. Both run
in the same engine, so they can be compared exactly, and
`src/compiler/renderer/playback.test.ts` requires them to agree on every
first-party scene without text, whether it was reached by seeking or by
playing live and pausing:

```bash
npx vitest run src/compiler/renderer/playback.test.ts
```

**Encoders never advance the simulation.** All sampling happens first, in
`withRasterExport` (`src/compiler/export/rasterExport.ts`). The encoders
receive finished frames and cannot change what was sampled.

**Physics is kept on a narrow path.** In `physicsWorld.ts`:

- gravity is applied as a change in velocity, not as a force, because a
  force is still in Matter's buffer when its sleeping pass reads it, and then
  nothing ever sleeps;
- the sleeping pass is run by Marey, with `engine.enableSleeping = false`;
- `matter-js` is pinned to `0.20.0` with no caret, because the code depends
  on internals that are not part of Matter's documented API.

## 4. How it is verified

**The headless determinism tests.**

```bash
npx vitest run src/compiler/determinism.test.ts src/compiler/renderer/frameSampler.test.ts
#  Test Files  2 passed (2)
#       Tests  37 passed (37)
```

These check that compiling the same source twice gives the same AST and IR,
that frame counts and tick spacing are exact, that sampling from cold twice
gives the same hash, that 30 fps and 60 fps agree on every frame they share,
and that the sampler paints with `paintExactTick()`.

**The browser harness.** The headless tests cannot see a canvas. The harness
in `tools/visual-check/` loads a scene in Chromium twice from cold and
compares the resting frames byte for byte. `freeze-midair.marey` is one box
in free fall, frozen after 0.5 s, with nothing to collide with:

```bash
npx vite --port 5199 --strictPort        # leave running in another terminal
node tools/visual-check/check.mjs \
  --scene tools/visual-check/scenes/freeze-midair.marey \
  --at 300,1500 --settle 4000 --out .visual-check/freeze-midair
# deterministic    true   (identical pixels at rest across a reload)
#   runA rest sha  d373697300ab788a
#   runB rest sha  d373697300ab788a
```

The two hashes are of screenshots, so expect your own values; what matters
is that they are equal. Stop the server afterwards. Read
`tools/visual-check/README.md` before writing a browser check of your own.

**The CLI, run twice.** The commands from section 1 printed, on
2026-09-30:

```
wrote .visual-check/determinism/run1  240 frames @ 30 fps  800x600  3289789 B  sha256 79f3f2947d9c4407e665ef3917264ddf742f44d3a50d71c1e9b561e4bdbe7b5d  frames 26cca4e9
wrote .visual-check/determinism/run2  240 frames @ 30 fps  800x600  3289789 B  sha256 79f3f2947d9c4407e665ef3917264ddf742f44d3a50d71c1e9b561e4bdbe7b5d  frames 26cca4e9
```

The same check on MP4 shows the exception from section 2. Two exports of
`eval/scenes-3b/bar-chart.marey` gave 23,860 and 22,987 bytes, different
SHA-256s, and the same `frames 0adcc9f9`. Two WebM exports of the same scene
gave lines identical apart from the output path.

`npm run check:export` repeats this for the four canonical scenes in all five
formats. It gates on the hash and on the bytes for every format but MP4. The
recorded run and its timings are in `eval/RESULTS-PHASE-6.md`.

## 5. The bug the harness caught (`1ce8307`)

**What happened.** A physics block can stop after a `duration`. When it
does, the body is frozen: pinned so the simulation no longer moves it. In
August 2026, a single box with no contacts, frozen in mid-air, drew to one
of two different pixel results depending on the page load.

**Why.** The paint step copies each body's position onto its drawing, but
it skips pinned bodies, and freezing pins. So a frozen box kept the position
from the last paint before the freeze. That paint had used the wall-clock
`alpha`, so the box sat up to one tick of motion away from where the
simulation stopped it. The box in `freeze-midair.marey` falls under gravity
900 px/s² for 0.5 s, reaching 450 px/s, and one tick at 450 px/s is 3.75 px.
Where in that range the last paint fell depended on frame timing, and it
rounded to one of two pixel positions.

**The fix.** `1ce8307` ("fix(physics): snap a container to its body when the
body freezes", 2026-08-27) added `snapContainerToBody`. At the moment of the
freeze it reads the body at `alpha = 1`, the exact tick, and writes that
onto the drawing. The commit records the probe scene as byte-identical
across six page loads afterwards, where before it alternated between two
results.

**Why the headless suite could not see it.** At the fix's parent the suite
had 94 tests in 5 files: the clock, the timeline, the physics world, the
body sync, and the default scene. The freeze logic lived inside the pixi
adapter's render loop, which had no tests, and no test ran a freeze through
a paint at a wall-clock `alpha`. The count was measured, not copied:

```bash
git worktree add ../marey-at-fix 1ce8307
# link ../marey-at-fix/node_modules to ./node_modules
# (Windows: cmd /c mklink /J <link> <target>; elsewhere: ln -s), then:
git -C ../marey-at-fix checkout -q 1ce8307^
(cd ../marey-at-fix && npx vitest run)     # Tests  94 passed (94)
git -C ../marey-at-fix checkout -q 1ce8307
(cd ../marey-at-fix && npx vitest run)     # Tests  97 passed (97)
```

When done, remove the `node_modules` link first, then the worktree.

**What the fix's own tests guarded.** `1ce8307` added three tests, all of
`snapContainerToBody` itself. Copied back to the parent, they fail with a
`TypeError`, only because the function does not exist there yet. Deleting
the one line that calls it on freeze, at `1ce8307`, left all 97 tests
passing. So the fix shipped with nothing to catch its removal. A mutation
pass the next day found that and added a test at the call site (`68863c5`).
Today the freeze code is in `sceneRuntime.ts`, and deleting that call fails
two tests:

```bash
# with the snapContainerToBody(...) call in sceneRuntime.ts's freeze loop deleted:
npx vitest run src/compiler/renderer
#   FAIL  ... tick phase > snaps a frozen container to the body's tick-aligned state, not its painted one
#   FAIL  ... frame pacing must not reach the world > freezes a growing bottom-origin object at the same place at every pacing
```

**Why a settling scene hides this.** Four scenes that settle had all passed
the same reload comparison before a scene that freezes mid-motion showed the
bug (Phase 1 plan, execution notes). A pile that settles reaches the same
resting state even if its path there differed, so equal frames at rest say
little about the path. A scene that freezes in motion keeps whatever error
the path had. The records disagree on which frozen scene showed it first,
but they agree it reproduces with a single box and no contacts, and that is
`freeze-midair.marey`: one object, frozen in free fall, so nothing can
absorb a difference. `logo-freeze.marey` does the same for a compound body
mid-tumble.
