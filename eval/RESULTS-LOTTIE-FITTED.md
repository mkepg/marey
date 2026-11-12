# Lottie fitted keyframes: measurements

Measured against base commit `cd14c3d`. The encoder is unchanged: every number
below describes the per-frame encoder and the two players as they are before
the fitted-keyframe change.

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
was not scrubbed, so this run does not show whether the layer moves or how
the position track appears in the editor. The cause of the question 1
warning is not isolated: it may be the split layout itself or a field
Glaxnimate expects that the probe document leaves out. Spec §4 says an
editor that cannot read split position means combined position; the plan
says the players decide. That conflict is left to the owner (see the
correction under spec §4).

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

Fitted documents exported at `aabd370` (encoder with tolerances 0.004 px,
0.0004 points, 0.0002 degrees, 0.05 opacity, 0.25/255 colour, and `n` easing
names). The encoder is unchanged through `2e0dc41`, whose
`lottie-fit-check.mjs` produced the restated tables below. No run raised a
page, console or lottie error.

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

### Restated acceptance (spec §4, correction of 2026-11-13)

1. Geometry, lottie-web: every layer's `finalTransform` properties at every
   compared frame are within F3's tolerance of the per-frame file's, plus
   1e-4 px on position for lottie-web's own Newton/float32 easing solver.
2. Pixels, both players: fitted maximum at most the worst maximum over the
   per-frame file and its copies shifted by +-0.001, +-0.002 and +-0.004 px,
   plus 2, per compared frame. The share of differing pixels fails when it
   exceeds the same calibrated range's highest share by more than 0.5
   percentage points, per compared frame.

```
node tools/visual-check/lottie-fit-check.mjs --per-frame <section 2 doc.json> --fitted <this head's doc.json> \
  --png-dir <lottie-check --compare-png output> --frames <frames> --renderer <renderer>
```

The per-frame document is the export at base commit `cd14c3d`
(`git worktree add <dir> cd14c3d`, `npm run build:export-page`, `marey export
... --format lottie --fps 30`); the PNG frames are `frame_<n>_pngexport.png`
from `lottie-check.mjs --compare-png` on this head.

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
| logo-reveal | dotlottie-web | 109 | 112 | 109 | met | 25 | 0.2298% | 0.2290% to 0.2302% | 0.8171% | +0.5869 | MISSED |
| physics-pile | lottie-web | 102 | 102 | 102 | met | 140 | 0.9617% | 0.9606% to 0.9629% | 0.9660% | +0.0031 | met |
| physics-pile | dotlottie-web | 96 | 96 | 96 | met | 0 | 0.1790% | 0.1790% to 0.1794% | 0.1790% | -0.0004 | met |

Two dotlottie-web rows move the share more than the others:

- Dusk Hills: 1.0985% against a calibrated highest of 1.0910% at frame 60
  (+0.0075 points), and +0.0171 points at frame 330, the largest excess in the
  row. That is the sub-pixel noise the 0.5-point gate allows for.
- Logo reveal: the fitted share is 1.9538% at frame 50 against 3.9712% for the
  per-frame file, about half, and 0.8171% at frame 25 against a calibrated
  highest of 0.2302%, 0.587 points over, past the gate. Swapping only the
  opacity tracks between the two files makes their dotlottie-web renders
  identical at both frames, so the whole difference is opacity. At frame 25
  the fitted file holds the sun, its disc and its rim at 99.963 opacity,
  inside the 0.05 tolerance, where the per-frame file has 100, and
  dotlottie-web draws the whole sun one level darker: (253, 184, 62) against
  (254, 185, 62), 2988 pixels differing by exactly 1. At frame 50 the two
  renders differ by one level on 17,650 pixels, and the fitted one is the
  closer to the PNG export; how dotlottie-web turns that frame's opacities
  into a one-level shift is not isolated. lottie-web shows neither shift on
  this scene.

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
| ledges | 4.01e-3 | 0 | 4.37e-4 | 0 | MISSED |
| bar-chart-reveal | 0 | 0 | 0 | 2.61e-2 | met |
| logo-reveal | 1.67e-3 | 0 | 0 | 3.65e-2 | met |
| physics-pile | 3.94e-3 | 0 | 1.62e-4 | 0 | met |

lottie-web holds rotation in radians and scale and opacity as ratios
(`degToRads` and a 0.01 multiplier in its `TransformProperty`). The check
converts them to the file's units before comparing. The version committed
at `08e8f60` compared them unconverted, which made rotation 57 times and
scale and opacity 100 times looser than F3, so its statement that every
property was inside tolerance was not established.

One property exceeds its tolerance: ledges `tile_17` rotation at frame 255,
4.37e-4° against 2e-4°. The fitted keyframes hold `tile_17` flat at
−326.2670432225297° from frame 246 to 269. At frame 255, `lottieEvaluate.ts`
returns −326.2670432225297° for those keyframes, the per-frame sample is
−326.2670432225297°, and lottie-web's own interpolated value (`r.pv`, in degrees) is
−326.2670432225297°. The value lottie-web draws (`r.v`, converted to degrees) is
−326.26747978652645°, the value it held at frame 180, the previous compared
frame. lottie-web's `setVValue` replaces `v` only when the new value differs
from the held one by more than 1e-5 in its internal units: 1e-5 rad, 5.7e-4°,
for rotation, and 1e-3 percentage points for scale, both larger than F3's
tolerances. From frame 180 to 255 the fitted file's rotation moves 4.37e-4°,
under that threshold, and the per-frame file's moves 5.8e-4°, over it.
Frame 255 read on its own draws −326.2670432225297° from the fitted file.
The check reads the frames in sequence, so it compares two held values. The
geometry check fails on this row.

The position overshoot of the bare 0.004 px tolerance, 9.4e-6 px at ledges
`tile_5` frame 180, is float32 storage, not the easing solver: lottie-web
stores the per-frame file's combined position in a `Float32Array`, which
rounds the sample 363.690083347462 to 363.6900939941406 (+1.06e-5 px). The
fitted file's split position is read in float64 and lies 3.9988e-3 px from
the exact sample. Geometry is not read from dotlottie-web, which exposes no
transform matrices.

Against the original bound, the dotlottie-web rows all pass now. Two lottie-web
rows still read above it and are the artifacts above: ledges frame 180
(81 against 109, while the calibrated copies reach 113) and physics-pile frame
70 (85 against 88, calibrated 88).

## 4. After: size and keyframes

Measured on the final head with
`node bin/marey.mjs export src/examples/<scene>.marey --format lottie --fps 30`
after `npm run build:export-page`. "Properties" counts objects with `a: 1` and
an array `k`; a fitted position counts `x` and `y` separately, which is why
Ledges has more properties than before. "Named" counts keyframes carrying `n`.

| Scene | Properties | Keyframes before | Keyframes after (named) | JSON bytes before | JSON bytes after | gzip before | gzip after |
|---|---|---|---|---|---|---|---|
| Dusk Hills | 66 | 23760 | 3731 (3125) | 2036666 | 718929 | 167892 | 37629 |
| Ledges | 52 to 79 | 14040 | 4256 (3124) | 1229171 | 704174 | 179698 | 136590 |
| Bar chart reveal | 14 | 2100 | 76 (0) | 202059 | 72759 | 14186 | 9746 |
| Logo reveal | 13 | 1950 | 70 (24) | 142990 | 20931 | 8516 | 3459 |

The names cost bytes (Dusk Hills 2.9% of gzip) and buy correctness in
dotlottie-web. Ledges' keyframe count includes colour and position tracks that
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
about the editor's timeline UI.

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
