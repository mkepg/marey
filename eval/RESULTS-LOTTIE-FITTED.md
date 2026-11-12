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
layout. The probe's exit code follows the half-frame verdict, so it is 1 today: the only failing non-diagnostic row is dotlottie-web per-component easing. dotlottie-web
cannot render fractional frames (it draws 15.5 as a whole frame), so
fractional-frame behaviour is established for lottie-web only.

The four rows the plan asks for, plus diagnostics for the one real failure:

| Question | Renderer | Max delta (per-frame reference) | Max delta, whole frames only | Max delta (half-frame reference) | Verdict | Verdict (half-frame reference) |
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
bare final keyframe) raised no dialog and showed the rectangle. I did not
scrub the timeline, so this run does not show whether the layer moves or how
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
differing pixels is the usable baseline signal for Task 4.

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
