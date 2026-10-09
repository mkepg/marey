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
