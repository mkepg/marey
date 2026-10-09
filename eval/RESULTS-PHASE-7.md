# Phase 7 results: colour across every output

Measured on 2026-10-09. Every number below comes from a file under
`.visual-check/phase7/` (git-ignored; re-run the commands to regenerate), cited
beside it.

## What was measured

- **Commit measured:** `1ccf3c5` (branch `phase-7`), which contains the colour
  runtime (`74b6e61`, `f5a7e4f`, `bf8ecad`) and the playback work after it.
- **Static-colour baseline:** `c5d9627`, the commit before the colour runtime.
- **Fixture:** `tools/visual-check/scenes/color-sequence.marey`, 800 x 600,
  `duration: 2` (60 frames at 30 fps, frame N at tick N x 4). Four shapes, each
  with `animate { property: color }`:
  - `swatch`, a rectangle at (200, 300): a two-step `sequence`, red to blue and
    then blue to `#00ff80`, 1 s each, `easeInOut`.
  - `pulse`, a circle at (450, 300): `#202020` to yellow, 0.5 s, `linear`,
    `loop: true`, `yoyo: true`.
  - `stroke`, a line of thickness 24 through (650, 300): white to magenta, 2 s,
    `linear`.
  - `label`, text at (400, 520): cyan to orange, 2 s, `easeIn`.
- Vite on 5199 with `--strictPort`; stopped afterwards. Only TIME_WAIT sockets
  remained on 5199, no listener.

## PNG: `color-check.mjs`

Command:

```
node tools/visual-check/color-check.mjs --scene tools/visual-check/scenes/color-sequence.marey --out .visual-check/phase7/color/png
```

Output: `.visual-check/phase7/color/png/report.json` and `frame_{0000,0015,0030,0045,0059}.png`.
Exit 0, 0 page errors, **max channel delta 0** (limit 1). Expected values come
from the script's own model of the easing curves and spec 2.2, not from the
renderer. Text is not sampled: a glyph has no reliable centre pixel, so `label`
is covered by the Lottie comparison below.

| Frame | Tick | Shape | Expected RGB | Actual RGB | Delta |
|---|---|---|---|---|---|
| 0 | 0 | swatch | 255, 0, 0 | 255, 0, 0 | 0, 0, 0 |
| 0 | 0 | pulse | 32, 32, 32 | 32, 32, 32 | 0, 0, 0 |
| 0 | 0 | stroke | 255, 255, 255 | 255, 255, 255 | 0, 0, 0 |
| 15 | 60 | swatch | 132, 0, 123 | 132, 0, 123 | 0, 0, 0 |
| 15 | 60 | pulse | 255, 255, 0 | 255, 255, 0 | 0, 0, 0 |
| 15 | 60 | stroke | 255, 191, 255 | 255, 191, 255 | 0, 0, 0 |
| 30 | 120 | swatch | 0, 0, 255 | 0, 0, 255 | 0, 0, 0 |
| 30 | 120 | pulse | 32, 32, 32 | 32, 32, 32 | 0, 0, 0 |
| 30 | 120 | stroke | 255, 128, 255 | 255, 128, 255 | 0, 0, 0 |
| 45 | 180 | swatch | 0, 123, 194 | 0, 123, 194 | 0, 0, 0 |
| 45 | 180 | pulse | 255, 255, 0 | 255, 255, 0 | 0, 0, 0 |
| 45 | 180 | stroke | 255, 64, 255 | 255, 64, 255 | 0, 0, 0 |
| 59 | 236 | swatch | 0, 254, 128 | 0, 254, 128 | 0, 0, 0 |
| 59 | 236 | pulse | 47, 47, 30 | 47, 47, 30 | 0, 0, 0 |
| 59 | 236 | stroke | 255, 4, 255 | 255, 4, 255 | 0, 0, 0 |

The five frames cover both legs of `pulse`'s yoyo (frames 15 and 45 sit at the
top of a leg, 30 at the bottom, 59 on the way back up) and both steps of
`swatch`'s sequence.

**A sequence starts one tick late, and the first model of this check was wrong
about it.** The first run of the script modelled the sequence's first step as
starting at tick 0 and the step boundary at tick 120. `swatch` came out 4 to 5
levels off at frames 15 and 45. The renderer starts a sequence's first step at
the end of tick 1 (`sceneRuntime.test.ts` records this: "The sequence starts
its first step at the end of tick 1"), so step 1 has elapsed `tick - 1` and
ends on tick 121, where step 2 is spawned. Spec 2.2 and `docs/LANGUAGE.md` do
not say when a sequence's first step starts, so there is no disagreement to
report; the spec's criterion text names a step boundary "at tick 120", which is
off by this one tick. The script now models the one-tick start explicitly
(`SEQUENCE_START`), and the model matches all 15 rows exactly. The one-tick
offset is existing sequence behaviour, not a colour defect: a direct
`animate` (`pulse`, `stroke`) starts at tick 0 and matches without it.

## Lottie against PNG: `lottie-check.mjs --compare-png`

Command:

```
node tools/visual-check/lottie-check.mjs --scene tools/visual-check/scenes/color-sequence.marey --fps 30 --compare-png --frames 0,15,30,45,59 --at 200,300 --at 450,300 --at 650,300 --out .visual-check/phase7/color/lottie
```

Output: `.visual-check/phase7/color/lottie/report.json`, `doc.json`,
`frame_N.png`, `frame_N_pngexport.png`, `frame_N_diff.png`. Exit 0; 0 page
errors, 0 console errors, 0 lottie-web error events.

**`--at` samples.** Lottie (lottie-web, no Marey code) against the PNG export's
pixel at the same frame and coordinate, `report.json` against
`.visual-check/phase7/color/png/report.json`: all 15 samples are identical, a
**maximum delta of 0 per channel** (limit 2).

| Frame | Mismatching pixels (of 480,000) | Share | maxDelta | At |
|---|---|---|---|---|
| 0 | 3021 | 0.6294% | 139 | (467, 515) |
| 15 | 3065 | 0.6385% | 136 | (467, 515) |
| 30 | 3017 | 0.6285% | 126 | (467, 515) |
| 45 | 3055 | 0.6365% | 110 | (467, 515) |
| 59 | 3059 | 0.6373% | 134 | (467, 515) |

**What the diff images show.** `frame_15_diff.png` and `frame_59_diff.png` were
opened. The red marks are thin one-pixel outlines: the circle's rim, the
line's four sides, and the glyph outlines of "colour". The rectangle shows no
red at all, and no flat interior of the circle, line or glyphs is filled. The
largest delta is inside the text at (467, 515), which is a glyph edge. This is
the antialiasing-at-edges pattern `eval/RESULTS-PHASE-5A.md` describes as
expected. The mismatch share is in the range 0.63% to 0.64%, dominated by the
text outline. The ink bounding boxes agree to within 1 px (`maxEdgeDelta=1` at
half coverage, in every frame). `frame_59.png` shows the text at orange, the
swatch at `#00fe80`-ish green, the line magenta and `pulse` dim yellow-grey, as
the table above says.

## APNG: `apng-check.mjs`

Command:

```
node tools/visual-check/apng-check.mjs --scene tools/visual-check/scenes/color-sequence.marey --fps 30 --out .visual-check/phase7/color/apng
```

Output: `.visual-check/phase7/color/apng/report.json`, `.visual-check/phase7/color/apng.log`.
Exit 0. 60 decoded frames against 60 references, **0 differing bytes across 0
frames**; 0 `fcTL` problems (60 chunks, delay 1/30); 0 frames with a bad
duration; the two cold runs are byte-identical (1,310,972 B, sha256
`d99b0224251f626b…`).

## Video: `quality-check.mjs`

Command:

```
node tools/visual-check/quality-check.mjs --scene tools/visual-check/scenes/color-sequence.marey --containers mp4,webm --fps 30 --out .visual-check/phase7/color/quality
```

Output: `.visual-check/phase7/color/quality/report.json`, `.visual-check/phase7/color/quality.log`.
Exit 0; default `gpu` scorer; both containers coded at 1600 x 1200 (2x the
scene), 60 decoded frames against 60 references.

| Container | PSNR (RGB) | Specks per frame | Total specks | kbit/s |
|---|---|---|---|---|
| mp4 | 41.60 dB | 136.7 | 8199 | 1837 |
| webm | 42.51 dB | 42.9 | 2571 | 1639 |

`quality-check.mjs` itself never gates on quality. The standing gate is the
PSNR window of 42.03 dB plus or minus 0.5 that Phase 5C's spec 9.1 set for the
default scene (`eval/RESULTS-PHASE-5C.md`, "criterion 1, re-run"), 41.53 to
42.53 dB. Both containers fall inside it: mp4 by 0.07 dB above the lower edge,
webm by 0.02 dB below the upper edge. The window was set from the default
scene, not this fixture. The fixture is made of large saturated flat fills and
a dark background, and it has more specks per frame in mp4 (136.7) than the
default scene's 62.8, which the window does not judge. The specks come from
the same lossy-codec edge noise 5C measured, and the colour animation does not
add a distinct failure: the PNG frames the codec was handed are the ones
`color-check.mjs` measured exactly.

## Static colours are unchanged

The baseline at `c5d9627` (`.visual-check/phase7/baseline/`, commands in
`commands.txt`) was re-exported with the same commands, `baseline` replaced by
`after`, from `1ccf3c5` (`.visual-check/phase7/after/`, commands in
`after-commands.txt`, log in `after-export.log`), and the sha256 manifests were
compared (`.visual-check/phase7/after/manifest.txt`, same format and sort order
as the baseline's, which the recipe reproduces byte for byte).

- 9 scenes, each exported as a PNG sequence and a Lottie document: 1689 files.
- **1680 of 1680 PNG frames are byte-identical** to the baseline.
- **7 of 9 Lottie documents are byte-identical.**
- 2 Lottie documents differ: `dusk-hills/lottie.json` and
  `yellow-flowers/lottie.json`. Neither difference is colour.

**Attribution.** The baseline predates two renderer fixes on this branch:
`8650e40` (rotated compound or polygon physics body placement) and `3a32c8a`
(a rotation animation is kept in radians, which changes rounding at about
1e-15 rad). To separate them from the colour work, both scenes were re-exported
with the same command from a temporary worktree at `bf8ecad` (colour runtime
present, those two fixes absent; the export page and CLI built there, the worktree removed
afterwards). Both files, `.visual-check/phase7/bf8ecad-dusk-hills.json` and
`.visual-check/phase7/bf8ecad-yellow-flowers.json`, are **byte-identical to the
baseline** (`cmp`; sha256 `8c3b6b88…` and `75b1e598…`). The colour runtime
therefore changes no static output, and the two differences belong to the
rotation fix, measured with
`.visual-check/phase7/lottiediff.mjs` against `1ccf3c5`'s files
(`lottiediff-dusk-hills.json`, `lottiediff-yellow-flowers.json`):

| Document | Numbers compared | Numbers that differ | Structural differences | Largest absolute difference |
|---|---|---|---|---|
| dusk-hills | 149,845 | 1,056 | 0 | 7.1e-15 |
| yellow-flowers | 676,694 | 4,769 | 0 | 1.8e-15 |

Every differing value is a rotation keyframe start (`ks.r.k[*].s[0]`), in the
last digit of a double (for example `1.4222222222222225` against
`1.4222222222222223`). The relative difference is under 1e-9 everywhere except
`yellow-flowers` layer 208, where the baseline holds `-4.44e-16` and the new
file holds `0`: a rounding residue replaced by an exact zero. No keyframe
count, easing handle, position, scale, opacity or colour value differs.

## Frame hashes

Frame hashes changed once in Phase 7: snapshots gained a `color` field, so the
simulation hash of every scene, including scenes with no colour animation, is
different from before. Hashes recorded in earlier RESULTS files (Gate B,
Phases 5A to 6) were taken on snapshots without the field and predate it; they
are not comparable with a hash measured now, and a mismatch against one of
them is expected, not a regression. The pixels are unchanged, as the
static-colour section above shows.

# Phase 7 results: playback

Measured on 2026-10-09 against the same branch (`phase-7`), with Vite on 5199
`--strictPort`, stopped afterwards (nothing listening on 5199). Every
number comes from `.visual-check/phase7/transport/` (git-ignored; re-run the
command to regenerate).

## Headless: `playback.test.ts`

`npx vitest run src/compiler/renderer/playback.test.ts`: 35 tests pass. The
corpus is every `.marey` file under `src/examples/`, `eval/` and
`tools/visual-check/scenes/` (42 files). **25 scenes are compared** (the
comparison per scene: tick 0 against the sampler's frame 0, a straight replay
to T, seek forward to T, back to T/3 and forward again, and a live-cadence run
in bursts of 1, 7 and 12 ticks with paints between), and **17 are skipped,
all because they contain `text`**, which needs a DOM that the Node test has
not got. The skip list is pinned in the test, so a scene cannot leave the
comparison unnoticed. The corpus includes `physics-pile` (named in the test)
and, by the test's own assertions, at least one scene with a `sequence`, one
with a `handoff` and one with physics. The text scenes are covered in the
browser, where text renders: `bar-chart-reveal` and `logo-reveal` are two of
the five examples below.

## Browser: `transport-check.mjs`

Command:

```
node tools/visual-check/transport-check.mjs --out .visual-check/phase7/transport
```

Output: `report.json`, `run.log`, `transport-{light,dark}.png` and
`transport-{light,dark}-strip.png`. Exit 0, **25 of 25 requirements pass**, no
console error and no page error. Seven `Canceled` rejections from Monaco's own
`Delayer.cancel` (raised when the editor's text is replaced) are counted in `report.json` as `monacoCancellations` and left out of
the error list; they come from the editor library, not from Marey. Each example is chosen through the
Examples menu (with the "Replace your code?" confirmation); the colour fixture
is loaded through a share link and then edited by replacing the editor's text.

**What a seek promise means.** `await __mareyPlayback.seek(t)` resolves after
the seek has been performed, not when it is recorded: across all 36 seeks in
the run, `state().tick === t` and `playing === false` held at the moment the
promise resolved, with no exceptions (`seekResolution` in `report.json`). The
script therefore awaits it directly.

| Requirement | Result |
|---|---|
| 1. Seek equals reference at ticks 0, 37, 120 and the end, in a fixed-seed shuffled order | Pass on all five examples: `snapshotHash() === referenceHash(t)` at every tick. The order is `120, 37, end, 0` for every example (seed 7), after the playhead's own starting tick (74 to 107, from the autoplay before the pause), so each run has two forward and two backward seeks; the order is in `report.json` (`seekTimes[...].order`). None of the five is indefinite, so the 480 fallback end was not used |
| 2. Live play 1.5 s, pause, compare at the tick read | Pass on all five: ticks 167 to 182 reached, hashes equal |
| 3. Stops at its end, toggle restarts below tick 30 | Pass on all five: stopped exactly at `endTick` (840, 600, 600, 1920, 1440). The tick read two animation frames after the click was 0 on four examples and 4 on `dusk-hills`. The bound is deliberate and not `=== 0`: the restart is performed on a frame, and a frame can pump up to 12 ticks |
| 4a. Fixture paused at the colour frames' ticks 0, 60, 120, 180, 236 | Pass: preview hash equals reference at each |
| 4b. Fixture played from 230 | Pass: stops at exactly tick 240 (`endTick` 240), hashes equal |
| 4c. Paused at 90, `to: blue` to `to: green` | Pass: tick 90, still paused, readout `0.75 / 2.00 s`, hashes equal, and the reference hash at 90 changed (the new scene is the one on screen) |
| 4d. Playing, three recompiles (`duration: 20`, so the scene cannot end) | Pass, three samples, each reading the tick and the page clock before the edit and after the compile lands, then pausing and comparing hashes (`playingSamples` in `report.json`): 131 to 366 in 3068 ms, 406 to 661 in 3710 ms, 700 to 951 in 3381 ms. Each stayed playing, never went back, stayed under the wall-clock ceiling (512, 864 and 1118) and had `snapshotHash() === referenceHash(tick)`. The gains (235, 255 and 251 ticks) are far below the ceiling because the elapsed time includes the compile, the mount and a 500 ms settle, during which the scene is not advancing |
| 4e. Paused at 90, `duration: 2` to `0.5` | Pass: tick 60, `endTick` 60, paused, hashes equal |
| 4f. Five edits 100 ms apart while playing (durations 30 to 34 s, so the playhead stays far from the end) | Pass (`rapidEdits` in `report.json`): after the last compile settled, `endTick` is 4080, the last edit's 34 s, so the displayed scene is the last edit's; `snapshotHash() === referenceHash(tick)`; the tick went from 37 before the burst to 484 after 10238 ms, not below 37 and under the ceiling of 1278. This pins which scene is on screen and that the playhead continued from the old one. It does not by itself pin the rule that a stale compile result never becomes the remembered playhead; see the note after the table |
| 5. Pause at 90, choose another example | Pass: the new scene's first state, read on the frame it mounted, is exactly tick 0, playing, `endTick` 840. The new file autoplays from 0, so tick 0 can only be read at mount; it was read by polling `referenceHash(0)` on every animation frame until it changed |
| 6. Transport in both themes | `transport-light.png` and `transport-dark.png` (1440 x 900), plus a strip crop of each. Both were looked at: play, restart, the scrub bar at 0.75 / 2.00 s, and the readout sit in a 691 x 32 px strip at the pane's bottom edge, outside the canvas, legible in both themes |

The wall-clock ceiling in rows 4d and 4f is `tick before + elapsed ms x 120 /
1000 + 13`. The 13 is the most one frame can add: the pump is capped at 12 ticks
a frame (`MAX_CATCHUP_TICKS` in `clock.ts`), and the accumulator carries under
one more tick. A playhead that jumped ahead of the clock, for example to a
newer or a clamped value, would break it.

**What pins the stale-result rule.** The rule that a compile result arriving
after a newer compile has started must not become the remembered playhead lives
in `src/hooks/useCompile.ts`, as the `currentId !== compileIdRef.current` guard
before the result's controller is subscribed. There is no unit test of it:
`src/lib/playhead.test.ts` tests `nextStart` and `formatPlayhead`, and no test
file names `compileIdRef` or `rememberedRef`. The browser burst above exercises
the consequence (scene identity and playhead continuity across a burst) but a
burst this slow may never produce a late result, so it cannot show the guard
firing. The guard is therefore unpinned by any automated check.

**Backward-seek times** (milliseconds from `performance.now()` around the
awaited seek, so each includes the wait for the next animation frame and the
paint; `report.json`, `seekTimes`; two backward seeks per example, in the
shuffled order: `120 to 37` and `end to 0`):

| Example | Ticks (end) | 120 to 37 | end to 0 |
|---|---|---|---|
| `physics-pile` | 840 | 71.4 | 9.4 |
| `bar-chart-reveal` | 600 | 26.5 | 24.1 |
| `logo-reveal` | 600 | 38.3 | 4.1 |
| `yellow-flowers` | 1920 | 251 | 35.8 |
| `dusk-hills` | 1440 | 47.5 | 22.7 |

The 251 ms for `yellow-flowers` is a single outlier: the same seek took 20 to
68 ms in three earlier runs of this check, and the other nine seeks here ran
from 4 to 71 ms. One sample cannot say whether it is a garbage
collection pause or a real cost, so it is reported as measured.

Spec 3.6 measured a headless replay from tick 0 of 96 ms (`physics-pile`, 600
ticks, first run with JIT warm-up), 11 ms (`dusk-hills`) and 3 ms
(`yellow-flowers`), and predicted a backward seek costs at most about 0.1 s.
The browser figures mostly agree: nine of the ten are 72 ms or less, and `yellow-flowers` 120 to 37 is the 251 ms outlier above, over the 0.1 s prediction. They are not
the same quantity: a backward seek in the browser replays only up to the
target tick (37 or 0 here), so the replay is short whatever the scene's length, and it adds a rebuild, a paint and a frame wait. The
heaviest case spec 3.6 names, a long indefinite physics scene, is not among
the five examples and stays a recorded limit.

## Spec 4 criteria

1. **Colour matches across every output: met.** PNG max channel delta 0,
   Lottie against PNG max delta 0 on the 15 samples with edge-only diffs, APNG
   0 differing bytes in 60 frames, both video containers inside the PSNR
   window (sections above). The last bullet, the live preview, is the
   `transport-check` row 4a: the preview's `snapshotHash()` equals
   `referenceHash(tick)` at ticks 0, 60, 120, 180 and 236. Text is compared
   by Lottie against PNG only, as the criterion says.
2. **Static colours are unchanged: met.** 1680 of 1680 PNG frames
   byte-identical; 7 of 9 Lottie documents byte-identical and the other two
   differ only by the rotation-radians fix (`3a32c8a`), not by colour (section
   above).
3. **Seeking equals playing: met.** Headless on 25 scenes (35 tests; 17 `text`
   scenes skipped, pinned), including `physics-pile`, sequence and handoff
   scenes; in the browser through `__mareyPlayback` on all five examples,
   `bar-chart-reveal` (text) included (rows 1 and 2).
4. **An edit keeps the playhead: met.** Rows 4c to 4f and 5: paused at 90
   stays 90 with a matching hash; across three playing recompiles the playhead
   never moves back and stays within the wall-clock ceiling; shortening below
   the playhead clamps to `endTick`; a burst of five edits ends with the last
   edit's scene on screen and the playhead continued; another example starts at
   0. The stale-result guard in `useCompile.ts` has no unit test (see the note
   after the table).
5. **Playback stops at `duration`: met.** At `endTick` on all five examples
   (row 3; 840, 600, 600, 1920 and 1440 ticks), and the toggle restarts below
   tick 30. The spec's own example, the 2 s fixture, played from tick 230,
   stops at exactly 240 (row 4b).
6. **Nothing else regresses: met.** Run on 2026-10-09 after the last change to
   `transport-check.mjs` and this file: `npm test`, 65 files, 1380 tests
   passed; `npx vitest run --config eval/vitest.config.ts`, 1 file, 5 tests
   passed; `npm run build` built; `npm run build:cli` then `marey check` on
   every tracked `.marey` file, none failed; `npm run check:export`, "matrix:
   all passed" (131.1 s); `npm run check:pack`, "all passed".
