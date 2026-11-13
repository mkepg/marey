# Lottie fitted keyframes: measurements

Sections 1 and 2 are measured against base commit `cd14c3d`, with the encoder
unchanged: their numbers describe the per-frame encoder and the two players as
they are before the fitted-keyframe change. Sections 3 to 9 measure the fitted
encoder, each at the commit it names.

## 1. Player layout facts (before the change)

`tools/visual-check/lottie-layout-probe.mjs` writes four layouts as
hand-made 200x200, 60-frame, 30 fps documents with one 40x40 rectangle layer.
Each candidate is rendered next to a reference with one linear keyframe per
frame, whose values are the candidate's cubic evaluated at every frame. Both
go through `lottie-render-worker.mjs` in `lottie-web` and `dotlottie-web` at
frames 0, 7, 15, 15.5, 30, 44 and 59, and are compared pixel by pixel. A row
passes at a maximum channel delta of 2 or less.

```
node tools/visual-check/lottie-layout-probe.mjs --out .visual-check/lottie-probe
```

Two columns go beyond the plan. At frame 15.5, lottie-web draws the candidate's
curve and the per-frame reference's straight chord, so a delta there can come
from the reference instead of the layout. The probe therefore also compares
against a reference keyed every half frame; "whole frames only" drops frame
15.5. For both lottie-web rows that fail the plan's rule, every whole frame is
identical and the half-frame reference is identical at 15.5 too, so the delta
is chord error. dotlottie-web draws 15.5 as a whole frame (its delta there is
0 in every row).

The half-frame reference decides the layout, not the plan's per-frame one: the
per-frame reference draws a straight chord between samples, which is wrong at
fractional frames, so a delta at 15.5 against it is not evidence about the
layout. The probe's exit code follows the half-frame verdict, so it is 1
today: the only failing non-diagnostic row is dotlottie-web per-component
easing. dotlottie-web cannot render fractional frames (it draws 15.5 as a
whole frame), so fractional-frame behaviour is established for lottie-web
only.

The four rows the plan asks for, plus rows marked "(diagnostic)". Diagnostic
rows never affect the probe's exit code: the scale-only and colour-only splits
of the per-component-easing failure, and three ways of writing one shared
easing (scalar handles, one-element arrays, per-component arrays):

| Question | Renderer | Max delta (per-frame reference) | Max delta, whole frames only | Max delta (half-frame reference) | Verdict (per-frame reference, superseded) | Verdict (half-frame reference) |
|---|---|---|---|---|---|---|
| split-position | lottie-web | 2 | 0 | 0 | pass | pass |
| split-position | dotlottie-web | 0 | 0 | 0 | pass | pass |
| per-component-ease | lottie-web | 0 | 0 | 0 | pass | pass |
| per-component-ease | dotlottie-web | 218 | 218 | 218 | fail | fail |
| overshoot-handles | lottie-web | 7 | 0 | 0 | fail | pass |
| overshoot-handles | dotlottie-web | 0 | 0 | 0 | pass | pass |
| bare-final-key | lottie-web | 10 | 0 | 0 | fail | pass |
| bare-final-key | dotlottie-web | 0 | 0 | 0 | pass | pass |
| (diagnostic) per-component-ease/scale-only | lottie-web | 0 | 0 | 0 | pass | pass |
| (diagnostic) per-component-ease/scale-only | dotlottie-web | 199 | 199 | 199 | fail | fail |
| (diagnostic) per-component-ease/colour-only | lottie-web | 0 | 0 | 0 | pass | pass |
| (diagnostic) per-component-ease/colour-only | dotlottie-web | 56 | 56 | 56 | fail | fail |
| (diagnostic) shared-ease/scalar-handles | lottie-web | 0 | 0 | 0 | pass | pass |
| (diagnostic) shared-ease/scalar-handles | dotlottie-web | 1 | 1 | 1 | pass | pass |
| (diagnostic) shared-ease/one-element-arrays | lottie-web | 0 | 0 | 0 | pass | pass |
| (diagnostic) shared-ease/one-element-arrays | dotlottie-web | 1 | 1 | 1 | pass | pass |
| (diagnostic) shared-ease/per-component-arrays | lottie-web | 0 | 0 | 0 | pass | pass |
| (diagnostic) shared-ease/per-component-arrays | dotlottie-web | 1 | 1 | 1 | pass | pass |

Reading the table:

| Question | Answer | Layout selected |
|---|---|---|
| 1. Split position, `x` and `y` keyframed at different times | Both players pass (lottie-web 2, only at frame 15.5; dotlottie-web 0). | Split position, `p: {s: true, x, y}`, as F7 says. |
| 2. Per-component easing on scale and colour | lottie-web passes (0). dotlottie-web fails (218): scale alone 199, colour alone 56. One easing shared by every component passes in both players, written as scalar handles, one-element arrays or full-length arrays (dotlottie-web delta 1). | One easing per keyframe, shared by every component, with run boundaries shared too (spec §4 fallback for item 2). |
| 3. `o.y = 1.4`, `i.y = 1.2` | Both players pass against the half-frame reference (lottie-web 0, dotlottie-web 0). Against the per-frame reference lottie-web reads 7, at frame 15.5 only. | Handle range `[-1, 2]` stays. |
| 4. Final keyframe with `t` and `s` only | Both players pass against the half-frame reference (0 and 0). Against the per-frame reference lottie-web reads 10, at frame 15.5 only. | Bare final keyframe stays. |

Editor smoke test. Glaxnimate 0.6.0 (`winget install --id KDE.Glaxnimate`)
installed and ran. Opening the question 1 candidate showed an "Issues"
dialog, `Invalid value for box.Transform.position`, and the rectangle
appeared at a fixed place. Opening the question 4 candidate (combined position,
bare final keyframe) raised no dialog and showed the rectangle. The timeline
was not scrubbed. The cause of the question 1 warning was then found in
Glaxnimate's importer source (spec §4, "Correction, 2026-11-13: measured
layouts"): `load_transform` first runs the generic field loader, which maps `p`
to `position` and warns because a split `p` has no `k`, and then reads `p.x`
and `p.y` and joins them into one position. The warning is cosmetic and the
motion is imported, so split position stays. Section 6 confirms it from
Glaxnimate's own re-export of a fitted file.

## 2. Per-frame baseline

Base commit `cd14c3d`. Vite on port 5199 (`npx vite --port 5199 --strictPort`),
`npm run build:cli` first. Each row is one run of

```
node tools/visual-check/lottie-check.mjs --scene <scene> --compare-png --fps 30 --frames <frames> --renderer <renderer> --out .visual-check/lottie-baseline/<scene>-<renderer>
```

with `<renderer>` `lottie-web` and `dotlottie-web`. The maximum channel delta is
the largest per-pixel difference between the Lottie player's frame and the
app's PNG export over the listed frames; the share is the worst frame's
fraction of pixels that differ at all. The six fixtures use the plan's frames;
the examples use frames spread over each scene's own duration (12 s, 9 s, 5 s,
5 s and 7 s). Every run exited 0 with no page, console or lottie errors. On the
examples these deltas are mostly antialiasing and text differences between the
two rasterizers, not motion error. The example-scene maximum channel delta
(77 to 140) saturates on rasterizer and text antialiasing, so the share of
differing pixels is the usable signal for comparing the fitted encoder against this baseline.

| Scene | Frames | Renderer | Max channel delta | Share of differing pixels (worst frame) |
|---|---|---|---|---|
| lottie-ease-linear | 0,15,30,45,60,75 | lottie-web | 0 | 0.0000% |
| lottie-ease-linear | 0,15,30,45,60,75 | dotlottie-web | 0 | 0.0000% |
| lottie-ease-in | 0,15,30,45,60,75 | lottie-web | 0 | 0.0000% |
| lottie-ease-in | 0,15,30,45,60,75 | dotlottie-web | 0 | 0.0000% |
| lottie-ease-out | 0,15,30,45,60,75 | lottie-web | 0 | 0.0000% |
| lottie-ease-out | 0,15,30,45,60,75 | dotlottie-web | 0 | 0.0000% |
| lottie-ease-inout | 0,15,30,45,60,75 | lottie-web | 0 | 0.0000% |
| lottie-ease-inout | 0,15,30,45,60,75 | dotlottie-web | 0 | 0.0000% |
| lottie-ease-handoff | 0,15,30,45,60,75 | lottie-web | 0 | 0.0000% |
| lottie-ease-handoff | 0,15,30,45,60,75 | dotlottie-web | 0 | 0.0000% |
| lottie-ease-handoff-yoyo | 0,15,30,45,60,75 | lottie-web | 3 | 0.0108% |
| lottie-ease-handoff-yoyo | 0,15,30,45,60,75 | dotlottie-web | 0 | 0.0000% |
| dusk-hills | 0,60,120,180,240,330 | lottie-web | 91 | 0.9725% |
| dusk-hills | 0,60,120,180,240,330 | dotlottie-web | 77 | 1.0910% |
| ledges | 0,45,90,135,180,255 | lottie-web | 88 | 1.0456% |
| ledges | 0,45,90,135,180,255 | dotlottie-web | 128 | 1.1671% |
| bar-chart-reveal | 0,25,50,75,100,140 | lottie-web | 140 | 0.8400% |
| bar-chart-reveal | 0,25,50,75,100,140 | dotlottie-web | 139 | 0.8410% |
| logo-reveal | 0,25,50,75,100,140 | lottie-web | 103 | 2.4646% |
| logo-reveal | 0,25,50,75,100,140 | dotlottie-web | 109 | 3.9712% |
| physics-pile | 0,35,70,105,140,200 | lottie-web | 102 | 0.9623% |
| physics-pile | 0,35,70,105,140,200 | dotlottie-web | 96 | 1.0471% |

Keyframes and bytes, as proposal §1 measured them
(`npm run build:export-page` first, then
`node bin/marey.mjs export src/examples/<scene>.marey --format lottie --fps 30 --out <tmp>`).
"Animated properties" counts objects with `a: 1` and an array `k`;
"keyframes" is the length of those arrays; "gzip" is `gzip -c | wc -c`.

| Scene | Animated properties | Keyframes | JSON bytes | gzip bytes |
|---|---|---|---|---|
| Dusk Hills | 66 | 23760 | 2036666 | 167892 |
| Ledges | 52 | 14040 | 1229171 | 179698 |
| Bar chart reveal | 14 | 2100 | 202059 | 14186 |
| Logo reveal | 13 | 1950 | 142990 | 8516 |

## 3. After: real players

The restated tables below measure fitted documents exported at `8ac67eb`
(tolerances 0.004 px, 0.0004 points, 0.0002 degrees, 0.05 opacity, 0.25/255
colour, `n` easing names, and opacity exact at 0 and 100), judged by
`lottie-fit-check.mjs` at `7c69e00`. No run raised a page,
console or lottie error.

### Original pixel bound and the two superseded fitted runs

The spec's first bound (§6.2): on every compared frame, fitted maximum channel
delta at most the per-frame maximum plus 2. It was applied to the same 22 rows
as section 2 (`lottie-check.mjs --compare-png`, same scenes, frames and
renderers).

First fitted run (superseded), tolerances 0.01 px, 0.01 points, 0.01 degrees,
0.1 opacity, 0.49/255 colour. Missed on:

| Scene | Renderer | Frame | Per-frame | Fitted |
|---|---|---|---|---|
| lottie-ease-handoff | lottie-web | 60 | 0 | 3 |
| ledges | dotlottie-web | 45 | 96 | 104 |
| logo-reveal | dotlottie-web | 25 | 70 | 81 |
| physics-pile | lottie-web | 70 | 85 | 88 |

It also inflated the share of differing pixels: Dusk Hills 0.97% to 25.9%
(sky band 1 level off, from the 0.49/255 colour tolerance), and 0.0000% to
1.2346% on `lottie-ease-linear` and `lottie-ease-inout`.

Second fitted run (superseded), tolerances tightened to the values above.
Shares returned to baseline everywhere. Missed on:

| Scene | Renderer | Frame | Per-frame | Fitted |
|---|---|---|---|---|
| ledges | lottie-web | 180 | 81 | 109 |
| logo-reveal | dotlottie-web | 25 | 70 | 81 |
| physics-pile | lottie-web | 70 | 85 | 88 |
| physics-pile | dotlottie-web | 105 | 90 | 206 |

### Diagnosis, in brief

The fitter's arithmetic was not at fault: in Node, and in lottie-web's own
`finalTransform`, every property at every failing frame was within tolerance.
Two separate causes:

- **dotlottie-web caches easing curves by a rounded key.** ThorVG keys the
  interpolator of a keyframe without `n` by `"%.2f_%.2f_%.2f_%.2f"` of the
  handles. Fitted handles are full-precision, so different curves that agree to
  two decimals were drawn with the first one's curve. A Node emulation of the
  cache reproduced the player's output byte for byte (physics-pile frame 105:
  206 at (503,275)). Over every frame it drew 445 of 2612 physics-pile
  segments, 1382 of 4177 ledges segments, 613 of 3665 Dusk Hills segments and
  15 of 57 logo-reveal segments with another keyframe's handles, up to 0.96 px
  off (crate_0, physics-pile frame 102). Tighter tolerances made it worse: more
  keyframes, more distinct handle pairs, more collisions. This is the cause of
  the dotlottie-web misses. The fix is an `n` on every keyframe whose key is
  shared with a different handle tuple. A first spelling, lottie-web's own
  default key, was measured to be worse than no name: ThorVG compares names
  over their first 20 characters and every such name starts
  `bez_0p33333333333333` (physics-pile frames 70 and 105 read 147 and 228). The
  name is `e` plus 16 hex digits of two FNV-1a hashes of the handle values.
- **The pixel maximum cannot resolve sub-pixel position in lottie-web or
  dotlottie-web.** Both rasterizers turn position into a step function. Moving
  one object of the per-frame file by 0.001 px moves up to 50 edge pixels by up
  to 55 levels. Shifting ledges' `tile_23` by -0.001 px in the per-frame file
  reproduces the 109 exactly, and shifting physics-pile's `wedge_2` by
  +0.0015 px reproduces the 88 exactly, while -0.0005 px changes nothing. These
  two lottie-web rows are measurement artifacts.

### Restated acceptance (spec §4, corrections of 2026-11-13)

1. Geometry, lottie-web: every layer's transform, as the player evaluates it
   from the file (`pv`), at every compared frame is within F3's tolerance of
   the per-frame file's, plus 1e-4 px on position. The 1e-4 px covers
   lottie-web storing the per-frame file's combined position in a
   `Float32Array`.
2. Pixels, both players: fitted maximum at most the worst maximum over the
   per-frame file and its copies shifted by +-0.001, +-0.002 and +-0.004 px,
   plus 2, per compared frame. The share of differing pixels fails when it
   exceeds the same calibrated range's highest share by more than 0.5
   percentage points, per compared frame.

```
node tools/visual-check/lottie-fit-check.mjs --per-frame <section 2 doc.json> --fitted <this head's doc.json>   --png-dir <lottie-check --compare-png output> --frames <frames> --renderer <renderer>
```

The per-frame document is the export at base commit `cd14c3d`
(`git worktree add <dir> cd14c3d`, `npm run build:export-page`, `marey export
... --format lottie --fps 30`); the fitted document and the PNG frames
(`frame_<n>_pngexport.png`) come from `lottie-check.mjs --compare-png` at
`8ac67eb`, with Vite on port 5199.

All 22 rows pass both checks.

Pixels. The maximum columns are the worst over each row's frames; the
verdict is per frame. The share columns are taken at the frame where the
fitted share stands highest above that frame's calibrated range, which is the
frame the share verdict turns on; "excess" is the fitted share minus the
range's highest share, in percentage points.

| Scene | Renderer | Max, per-frame | Max, calibrated | Max, fitted | Max verdict | Share frame | Share, per-frame | Share, calibrated range | Share, fitted | Excess (points) | Share verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| lottie-ease-linear | lottie-web | 0 | 2 | 0 | met | 30 | 0.0000% | 0.0000% to 0.0108% | 0.0000% | -0.0108 | met |
| lottie-ease-linear | dotlottie-web | 0 | 0 | 0 | met | 0 | 0.0000% | 0.0000% to 0.0000% | 0.0000% | +0.0000 | met |
| lottie-ease-in | lottie-web | 0 | 2 | 0 | met | 0 | 0.0000% | 0.0000% to 0.0216% | 0.0000% | -0.0216 | met |
| lottie-ease-in | dotlottie-web | 0 | 0 | 0 | met | 0 | 0.0000% | 0.0000% to 0.0000% | 0.0000% | +0.0000 | met |
| lottie-ease-out | lottie-web | 0 | 2 | 0 | met | 15 | 0.0000% | 0.0000% to 0.0108% | 0.0000% | -0.0108 | met |
| lottie-ease-out | dotlottie-web | 0 | 0 | 0 | met | 0 | 0.0000% | 0.0000% to 0.0000% | 0.0000% | +0.0000 | met |
| lottie-ease-inout | lottie-web | 0 | 2 | 0 | met | 30 | 0.0000% | 0.0000% to 0.0108% | 0.0000% | -0.0108 | met |
| lottie-ease-inout | dotlottie-web | 0 | 0 | 0 | met | 0 | 0.0000% | 0.0000% to 0.0000% | 0.0000% | +0.0000 | met |
| lottie-ease-handoff | lottie-web | 0 | 2 | 1 | met | 15 | 0.0000% | 0.0000% to 0.0108% | 0.0108% | +0.0000 | met |
| lottie-ease-handoff | dotlottie-web | 0 | 0 | 0 | met | 0 | 0.0000% | 0.0000% to 0.0000% | 0.0000% | +0.0000 | met |
| lottie-ease-handoff-yoyo | lottie-web | 3 | 4 | 3 | met | 75 | 0.0108% | 0.0108% to 0.0108% | 0.0108% | +0.0000 | met |
| lottie-ease-handoff-yoyo | dotlottie-web | 0 | 0 | 0 | met | 0 | 0.0000% | 0.0000% to 0.0000% | 0.0000% | +0.0000 | met |
| dusk-hills | lottie-web | 91 | 91 | 91 | met | 120 | 0.8425% | 0.8421% to 0.8425% | 0.8425% | +0.0000 | met |
| dusk-hills | dotlottie-web | 77 | 78 | 77 | met | 330 | 1.0517% | 1.0508% to 1.0527% | 1.0698% | +0.0171 | met |
| ledges | lottie-web | 88 | 113 | 109 | met | 135 | 0.9542% | 0.9494% to 0.9550% | 0.9542% | -0.0008 | met |
| ledges | dotlottie-web | 128 | 129 | 128 | met | 90 | 1.1671% | 1.1644% to 1.1671% | 1.1671% | +0.0000 | met |
| bar-chart-reveal | lottie-web | 140 | 140 | 140 | met | 0 | 0.7135% | 0.7135% to 0.7135% | 0.7135% | +0.0000 | met |
| bar-chart-reveal | dotlottie-web | 139 | 139 | 139 | met | 0 | 0.7123% | 0.7123% to 0.7123% | 0.7123% | +0.0000 | met |
| logo-reveal | lottie-web | 103 | 103 | 103 | met | 0 | 0.0000% | 0.0000% to 0.0000% | 0.0000% | +0.0000 | met |
| logo-reveal | dotlottie-web | 109 | 112 | 109 | met | 0 | 0.0000% | 0.0000% to 0.0000% | 0.0000% | +0.0000 | met |
| physics-pile | lottie-web | 102 | 102 | 102 | met | 140 | 0.9617% | 0.9606% to 0.9629% | 0.9660% | +0.0031 | met |
| physics-pile | dotlottie-web | 96 | 96 | 96 | met | 0 | 0.1790% | 0.1790% to 0.1794% | 0.1790% | -0.0004 | met |

Two dotlottie-web rows move the share more than the others:

- Dusk Hills: 1.0985% against a calibrated highest of 1.0910% at frame 60
  (+0.0075 points), and +0.0171 points at frame 330, the largest excess in the
  row. That is the sub-pixel noise the 0.5-point gate allows for. Both figures
  were read again from the run under "One-sided colour" below, on the
  document with one-sided colour, and are unchanged.
- Logo reveal: at frame 50 the fitted share is 1.7846% against 3.9712% for
  the per-frame file, about half. Swapping only the opacity tracks between the
  two files makes their dotlottie-web renders identical at that frame, so the
  difference is opacity. The renders differ by exactly one level on 16,406
  pixels, all in rows 301 to 390, where the ridge layers are mid-fade (one
  at 20.0556 in the per-frame file and 20.0520 fitted, inside the 0.05
  tolerance), and the fitted render is the closer to the PNG export.
  Why dotlottie-web shifts the per-frame file's ridges by a level there is
  not isolated. lottie-web shows no such shift on this scene.

Geometry, lottie-web, worst |fitted − per-frame| over each row's frames, in
the file's units (px, percentage points, degrees, 0 to 100):

| Scene | Position | Scale | Rotation | Opacity | Verdict |
|---|---|---|---|---|---|
| lottie-ease-linear | 6.82e-13 | 0 | 0 | 0 | met |
| lottie-ease-in | 1.88e-12 | 0 | 0 | 0 | met |
| lottie-ease-out | 5.80e-12 | 0 | 0 | 0 | met |
| lottie-ease-inout | 6.82e-13 | 0 | 0 | 0 | met |
| lottie-ease-handoff | 1.23e-3 | 0 | 0 | 0 | met |
| lottie-ease-handoff-yoyo | 2.70e-10 | 0 | 0 | 0 | met |
| dusk-hills | 5.45e-4 | 0 | 2.93e-14 | 4.29e-2 | met |
| ledges | 4.01e-3 | 0 | 1.90e-4 | 0 | met |
| bar-chart-reveal | 0 | 0 | 0 | 2.61e-2 | met |
| logo-reveal | 1.67e-3 | 0 | 0 | 5.04e-3 | met |
| physics-pile | 3.94e-3 | 0 | 1.62e-4 | 0 | met |

The only overshoot of a bare tolerance is position, 9.4e-6 px at ledges
`tile_5` frame 180, inside the 1e-4 px allowance. It is float32 storage, not
the easing solver: lottie-web stores the per-frame file's combined position
in a `Float32Array`, which rounds the sample 363.690083347462 to
363.6900939941406 (+1.06e-5 px). The fitted file's split position is read in
float64 and lies 3.9988e-3 px from the exact sample. Geometry is not read from
dotlottie-web, which exposes no transform matrices.

### Superseded acceptance runs

The geometry check committed at `08e8f60` compared lottie-web's
`finalTransform` values unconverted. lottie-web holds rotation in radians and
scale and opacity as ratios (`degToRads` and a 0.01 multiplier in its
`TransformProperty`), so rotation was checked 57 times and scale and opacity
100 times more loosely than F3, and that run's statement that every property
was inside tolerance was not established. That run also reported the share
without gating it.

Run again at `2e0dc41` on the documents exported at `aabd370` (before opacity
was kept exact), in the file's units and on the drawn value `v`, two rows
failed:

- Geometry, ledges, lottie-web: `tile_17` rotation at frame 255 read 4.37e-4°
  against 2e-4°. The fitted keyframes hold `tile_17` flat at
  −326.2670432225297° from frame 246 to 269; `lottieEvaluate.ts`, the
  per-frame sample and lottie-web's evaluated value `pv` all read
  −326.2670432225297° there. The drawn value `v` read −326.26747978652645°,
  the value held from frame 180, the previous compared frame. lottie-web's
  `setVValue` replaces `v` only when the new value differs from the held one
  by more than 1e-5 of its internal units (1e-5 rad, 5.7e-4°); the fitted
  file's rotation moved 4.37e-4° between the two frames and the per-frame
  file's 5.8e-4°. The check now reads `pv`, which the threshold does not
  touch, so it measures the file rather than the player's redraw skipping.
- Share, logo-reveal, dotlottie-web, frame 25: 0.8171% against a calibrated
  highest of 0.2302%, 0.587 points over the calibrated range's highest share
  and 0.087 points over the 0.5-point gate. The fitted file held the
  sun, its disc and its rim at 99.963 opacity, inside the 0.05 tolerance,
  where the per-frame file has 100, and dotlottie-web drew the whole sun one
  level darker: (253, 184, 62) against (254, 185, 62), 2988 pixels differing
  by exactly 1. Opacity is now kept exact at 0 and 100 (`8ac67eb`), and the
  same frame reads 0.2298%, inside its calibrated range.

Against the original bound, the dotlottie-web rows all pass now. Two lottie-web
rows still read above it and are the artifacts above: ledges frame 180
(81 against 109, while the calibrated copies reach 113) and physics-pile frame
70 (85 against 88, calibrated 88).

### One-sided colour, re-measured on Dusk Hills

The tables above judge Dusk Hills' document with a symmetric colour tolerance,
±0.25/255. lottie-web draws a fill channel as `Math.floor(255 * c)`, so a
fitted channel under its sampled level k/255 is drawn as k - 1 (spec §4,
"Correction, 2026-11-13: colour is drawn by truncation"). Colour is now fitted
one-sided, in `[k/255, (k + 0.25)/255]`, at `002bc36`. Only Dusk Hills
changes: Ledges, Bar chart reveal, Logo reveal and Physics pile export
byte-identical documents, so their rows above stand.

How many channel-frames draw a level low, over all 360 frames and Dusk Hills'
ten animated colour tracks (`band_0` to `band_5`, `ridge_0` to `ridge_3`),
counted with `lottieEvaluate.ts`:

| Document | Truncated in double precision | Truncated as lottie-web stores it (`Float32Array`) |
|---|---|---|
| per-frame (`cd14c3d`) | 0 | 0 |
| symmetric (`8ac67eb`) | 199 (230 at 60 fps) | 48, on 42 frames |
| one-sided (`002bc36`) | 0 (0 at 60 fps) | 0 |

lottie-web holds an animated vector property in a `Float32Array`, which absorbs
an undershoot smaller than its resolution. 151 of the 199 are undershoots of at
most 3e-14 of a level, among them frames 21, 29, 331 and 345, and the player
draws them at the right level. The 48 that survive are undershoots of 0.088
to 0.244 of a level, all in `band_4` and `band_5`, on frames 51 to 305.

Both documents were judged with `lottie-fit-check.mjs` against the same
per-frame document and PNG frames, the PNGs from `lottie-check.mjs
--compare-png` with the encoder as committed at `002bc36`, with Vite on
port 5199:

```
node tools/visual-check/lottie-check.mjs --scene src/examples/dusk-hills.marey --compare-png --fps 30 --frames 0,21,29,60,120,180,240,330,331,345 --renderer <renderer> --out <dir>
node tools/visual-check/lottie-fit-check.mjs --per-frame <cd14c3d doc.json> --fitted <doc.json> --png-dir <dir> --frames 0,21,29,60,120,180,240,330,331,345 --renderer <renderer>
```

and again at frames 58, 61, 122 and 238, four of the 42. Share of differing
pixels against the PNG export. The maximum channel delta is not shown: for both
documents, in both players, at every frame it equals the per-frame file's, so
it is met in every row.

| Frame | lottie-web, calibrated range | symmetric | one-sided | dotlottie-web, calibrated range | symmetric | one-sided |
|---|---|---|---|---|---|---|
| 0 | 0.8708% to 0.8740% | 0.8717% | 0.8717% | 0.9873% to 0.9892% | 0.9892% | 0.9892% |
| 21 | 1.0075% to 1.0088% | 1.0081% | 1.0081% | 1.1227% to 1.1242% | 1.1279% | 1.1279% |
| 29 | 0.9973% to 0.9983% | 0.9981% | 0.9981% | 1.1019% to 1.1040% | 1.1117% | 1.1117% |
| 58 | 0.9775% to 0.9783% | **8.8104%** | 0.9783% | 1.1025% to 1.1040% | **8.9121%** | 1.0981% |
| 60 | 0.9723% to 0.9731% | 0.9725% | 0.9725% | 1.0894% to 1.0910% | 1.0985% | 1.0985% |
| 61 | 0.9846% to 0.9862% | **8.8654%** | 0.9842% | 1.0885% to 1.0902% | **8.9540%** | 1.0904% |
| 120 | 0.8421% to 0.8425% | 0.8425% | 0.8425% | 0.9521% to 0.9527% | 0.9569% | 0.9569% |
| 122 | 0.8504% to 0.8510% | **11.1377%** | 0.8508% | 0.9540% to 0.9544% | **11.2183%** | 0.9544% |
| 180 | 0.7783% to 0.7783% | 0.7783% | 0.7783% | 0.8904% to 0.8904% | 0.8904% | 0.8904% |
| 238 | 0.8508% to 0.8510% | **11.1377%** | 0.8508% | 0.9535% to 0.9546% | **11.2183%** | 0.9544% |
| 240 | 0.8425% to 0.8427% | 0.8427% | 0.8427% | 0.9515% to 0.9523% | 0.9515% | 0.9515% |
| 330 | 0.9667% to 0.9683% | 0.9619% | 0.9619% | 1.0508% to 1.0527% | 1.0698% | 1.0698% |
| 331 | 0.9615% to 0.9625% | 0.9623% | 0.9623% | 1.0648% to 1.0671% | 1.0750% | 1.0750% |
| 345 | 0.9588% to 0.9594% | 0.9592% | 0.9592% | 1.0760% to 1.0790% | 1.0798% | 1.0798% |

The bold cells miss the share gate: the symmetric document draws a sky band one
level dark over 8 to 11% of the frame, in lottie-web where the truncation model
says it does. dotlottie-web draws the same frames dark, so it also turns these
values into the level below; how ThorVG converts a colour was not read. The
one-sided document passes both checks at all 14 frames in both players. At
frames 21, 29, 331 and 345 the two documents draw identically, as the
`Float32Array` storage predicts. lottie-web geometry at the 14 frames,
one-sided document: worst position 5.74e-4 px, scale 0, rotation 3.02e-14°,
opacity 4.58e-2, all within tolerance. No run raised a page, console or
lottie error.

## 4. After: size and keyframes

Measured at `8ac67eb` (opacity exact at 0 and 100), and Dusk Hills again at
`002bc36` (colour one-sided), with
`node bin/marey.mjs export src/examples/<scene>.marey --format lottie --fps 30`
after `npm run build:export-page`. "Properties" counts objects with `a: 1` and
an array `k`; a fitted position counts `x` and `y` separately, which is why
Ledges has more properties than before. "Named" counts keyframes carrying `n`.

| Scene | Properties | Keyframes before | Keyframes after (named) | JSON bytes before | JSON bytes after | gzip before | gzip after |
|---|---|---|---|---|---|---|---|
| Dusk Hills | 66 | 23760 | 3941 (3383) | 2036666 | 768839 | 167892 | 39792 |
| Dusk Hills, symmetric colour (`8ac67eb`, superseded) | 66 | 23760 | 3731 (2822) | 2036666 | 711442 | 167892 | 37561 |
| Ledges | 52 to 79 | 14040 | 4256 (3124) | 1229171 | 704174 | 179698 | 136590 |
| Bar chart reveal | 14 | 2100 | 76 (0) | 202059 | 72759 | 14186 | 9746 |
| Logo reveal | 13 | 1950 | 74 (24) | 142990 | 21455 | 8516 | 3477 |

Keeping opacity exact at 0 and 100 changed two scenes against the export at
`aabd370`: Logo reveal's four fading layers (`name`, `sun`, `disc`, `rim`)
each gained a keyframe where the fade reaches 100 (70 to 74 keyframes), and
Dusk Hills' `spark` keyframe at frame 189 moved to frame 180, where its
opacity peaks at exactly 100 (the count stays 3731). Ledges and Bar chart
reveal are byte-identical. Fewer handle tuples collide in Dusk Hills after the
move, so fewer keyframes carry a name (3125 to 2822).

Fitting colour one-sided changed Dusk Hills only. Its ten colour tracks went
from 2018 to 2228 keyframes, a few more segments each, and the other tracks
are unchanged (3731 to 3941 in all); more distinct handle tuples collide, so
more keyframes carry a name (2822 to 3383). Ledges, Bar chart reveal and Logo
reveal export byte-identical documents.

The names cost bytes and buy correctness in dotlottie-web: removing every `n`
from Dusk Hills takes its gzip size from 39792 to 35599 bytes, so the names
are 10.5% of it (at `8ac67eb`, 37561 to 34061, 9.3%). Ledges' keyframe count includes colour and position tracks that
each split into short runs under the tightened tolerances.

## 5. Fractional frames

`lottie-ease-out.marey` at 30 fps in lottie-web, left edge of the rectangle on
row y = 270, from the edge pixel's coverage:

| Frame | 10 | 10.5 | 11 | 30 | 30.5 | 31 |
|---|---|---|---|---|---|---|
| Edge x | 315.559 | 324.401 | 333.156 | 600.000 | 605.289 | 610.492 |

Monotonic.

## 6. Editor

Glaxnimate 0.6.0, GUI only (its command-line export crashed). Opening the
fitted `lottie-ease-out.json` showed the "Invalid value for
box.Transform.position" issue dialog and the rectangle at its start position.
The timeline was not scrubbed and no handle was dragged, so nothing is claimed
about the editor's timeline UI. In particular, spec §6.4 asks whether the
easing handle is editable, and that was not checked: no handle was dragged in
Glaxnimate. What the evidence shows is that Glaxnimate imports the keyframes
and their easing and writes them back out.

Glaxnimate's own re-export (File > Save As, Lottie, not pretty), read back,
has one combined position property with 3 keyframes at t = 0, 60 and 89, the
same times as the fitted `x` track, each with easing handles:

| Keyframe | Written by Marey (`o`, `i`) | Re-exported by Glaxnimate (`o`, `i`) |
|---|---|---|
| t = 0 | (0.3333, 0.6667), (0.6667, 1.0) | (0.167, 0.333), (0.833, 1) |
| t = 60 | (0.3333, 0.3333), (0.6667, 0.6667) | (0.167, 0.167), (0.833, 0.833) |

Computed from those numbers: the start slope `o.y / o.x` is 0.6667 / 0.3333 =
2 in the fitted file and 0.333 / 0.167 = 2 in Glaxnimate's, and both end
slopes are 0 (`i.y = 1`).

## 7. Hashes

`sha256` values for Lottie exports in earlier results files describe the
per-frame encoding. A re-export on this branch no longer matches them. The
sampled-frame hash (`frames`) is unchanged.

## 8. Encoding time

Spec F10: encoding Dusk Hills at 60 fps in Node takes under 1 s, and the suite
fails above 2 s. Growing a run frame by frame re-checked every interior sample,
so a long run was quadratic. At `c020827` the fitter decides exactly
constant runs and all-flat runs in constant time per frame, and gallops any
other run past 64 frames (spec §4, "Correction, 2026-11-13: encoding time").

`encodeLottie` alone, in Node, with compiling and sampling outside the timed
region. Each figure is a single run of a throwaway probe test, with the
previous fitter (`c020827`'s parent) and with the new one. The machine's
load varied between runs, which is why two "before" figures for one input
differ by up to a factor of three:

| Input | Frames | Before | After |
|---|---|---|---|
| Dusk Hills, 60 fps | 720 | 68 ms, 240 ms | 59 ms, 46 ms |
| Physics pile at 60 s, 60 fps (bodies simulated to the end; they sleep in a heap) | 3,600 | 3,714 ms, 11,632 ms | 109 ms, 81 ms |
| 40 rectangles, each rotating linearly and moving with easeInOut for 60 s, 60 fps | 3,600 | 4,433 ms | 160 ms, 152 ms |

The first two rows are the suite's budget tests (`lottieFitted.test.ts`,
"encoding budget", which fail above 2 s); in a run of `npx vitest run
src/compiler/export/` at `c020827`, 20 files in parallel, they read
155 ms and 235 ms. The third is a scene
written to check a long run that is neither constant nor flat, and is not in
the suite; `lottieFit.test.ts` covers the same case on synthetic 3,600-frame
tracks.

The change does not alter any measured output. With the shortcuts and the
galloping in place, and before colour went one-sided, the SHA-256 of
`JSON.stringify` of every encoded document was compared against the previous
fitter: compound-logo, radial-dots, physics-pile, ledges and dusk-hills at 30
and 60 fps, Physics pile at 60 s both with its bodies frozen at 7 s and
simulated to the end, and the 40-rectangle scene, all identical.

## 9. Determinism (`npm run check:export`)

Spec §6.5 asks for the byte comparison CI runs. `npm run check:export`, at
`132361f` after `npm run build:export-page` and `npm run build:cli`, exported
every canonical scene (bar-chart, radial-dots, compound-logo, timeline-ticks)
in every format twice and compared the runs: `matrix: all passed` (144.8 s),
exit code 0. The Lottie rows matched byte for byte across the two runs:

| Scene | Frames | Lottie `sha256` |
|---|---|---|
| bar-chart | 30 | `79aa2ffc7216b022` |
| radial-dots | 30 | `5aba4b1aff965c8f` |
| compound-logo | 240 | `b6c88fb7e814ca0c` |
| timeline-ticks | 30 | `38c44cdd8fff0b15` |

The mp4 rows report a differing `sha256` between the two runs, which the
matrix reports and does not gate (R47).
