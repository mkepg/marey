# Lottie fitted keyframes: editable Lottie export

**Date:** 2026-11-13
**Status:** Approved design. The owner asked for this work on 2026-11-13 and
delegated every design call. The calls below are recorded as decisions, not as
owner rulings.
**Builds on:** `2026-11-06-marey-lottie-keyframe-recovery-design.md` (the
proposal: problem, baseline, the cubic-easing finding, two approaches and the
open decisions). This document settles that proposal's §4 and adds what the
proposal did not cover: how a fitted file has to be laid out for an editor.
**Supersedes:** Phase 5A design §7.1 (`2026-09-11-marey-phase-5a-baked-lottie-design.md`),
"one linear keyframe per output frame".

---

## 0. Why

A Marey Lottie file plays correctly everywhere, but it cannot be edited. Each
property that varies carries one linear keyframe per output frame, so a
two-second `easeOut` slide arrives in an editor as 60 keyframes. Retiming it,
changing its easing or moving one beat means editing every one of them.

The goal: **a person who opens a Marey Lottie file in a Lottie editor sees
roughly the keyframes they would have set by hand, with easing curves they
can drag, and can retime the motion without re-exporting.** Smaller files
follow from the same change.

Success is measured, not argued (§6). The baseline is the proposal's §1
table: Dusk Hills has 23,760 keyframes (2,036,666 B) and Ledges 14,040
(1,229,171 B) at 30 fps.

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| F1 | **Fit in the encoder, from the samples** (the proposal's approach B). `lottieEncode.ts` keeps receiving inert per-frame snapshots and turns each per-frame track into keyframes by fitting cubic runs. | It needs no change to the encoder boundary (`renderer.md`, "The Lottie encoder boundary"). One mechanism covers `animate`, `sequence`, physics and anything else. What does not fit falls back to shorter runs, down to today's one keyframe per frame, so no input is encoded worse than now. |
| F2 | **Fitted keyframes are the only encoding.** There is no `--keyframes` flag and no per-frame mode. | A second encoding is a second thing to test, document and keep correct, for a user who has not been identified. The per-frame encoding is a special case of the fitted one (every run is one frame long), so nothing that worked stops being expressible. If a player is ever found that misreads fitted handles, the flag can be added then, with that player as its test. |
| F3 | **A visual tolerance per channel**, in the Lottie file's own units, with every sampled frame inside it: position 0.01 px, scale 0.01 percentage points, rotation 0.01°, opacity 0.1 points on the 0 to 100 scale, colour 0.49/255 per channel on the 0 to 1 scale. The constants live in one exported table and a test pins each value. | Below a hundredth of a pixel, a difference cannot show in an 8-bit raster. Exact-to-float-noise fitting would leave every colour track at one keyframe per frame, because colour is rounded to whole 8-bit channels each frame (LANGUAGE.md, "Animating colour"). With 0.49/255, rounding the fitted value recovers the original 8-bit channel at every sampled frame. This is an engineering-lessons §2d judgment call, so the pin is a test. |
| F4 | **Keyframe values are exact samples.** A keyframe's `s` is the sampled value at that frame, copied, never a fitted value. Only the frames between keyframes are approximated, and each lies inside F3's tolerance. | The claim is then simple: the file is exact at every keyframe and within tolerance everywhere else. A fitter that moved keyframe values to lower its error would make that untrue for no visible gain. |
| F4b | **Between samples, a fitted curve stays between its neighbours.** Inside a run, in each interval between two consecutive frames, the curve stays within the range of the two samples at its ends, widened by the tolerance. Since a cubic is monotonic between its critical points, it is enough to check the curve's at most two critical points: one that falls inside an interval must lie in that interval's range. | Players draw fractional frames: a 30 fps file on a 60 Hz display is sampled halfway between frames. A cubic that matches every sample can still overshoot between two of them. For example, a step from 0 to 100 can be fitted through the frames after it with a curve that swings past 100 between samples. The per-frame encoding never did this, because a straight line stays between its ends. Without this rule the fitted file would be exact at every frame and visibly wrong between them. |
| F5 | **Runs are fitted greedily, left to right, longest first.** From each run's start, the run is extended while one cubic per component, pinned to the samples at both ends, reproduces every sample inside it within tolerance. When the next frame would break the fit, a keyframe is written at the last frame that fitted, and the next run starts there. | It is simple and deterministic, and it puts keyframes where motion changes character: where an `animate` starts, ends, reverses or splits (`easeInOut` splits at its midpoint). The proposal's §4.3 asks whether that matches what an editor user expects. §6 checks it on the canonical scenes rather than assuming it. |
| F6 | **The handles carry the cubic.** With x handles at 1/3 and 2/3, time is linear in the curve parameter, so the y handles encode any cubic in time (proposal §2). Lottie stores a segment's easing on the keyframe that **starts** the segment: that keyframe carries both `o = {x: 1/3, y: P1}` and `i = {x: 2/3, y: P2}`, where `P1` and `P2` are the fitted Bernstein control values normalised to the run's start and end values. This is how lottie-web reads them and how the current encoder already writes them. (The proposal's §2 says "the arriving keyframe's `i`", which describes the curve, not where the field is stored.) A component is **flat** on a run when its start and end samples differ by no more than its tolerance. A flat component gets linear handles, and its interior samples must lie within tolerance of the straight line between its two exact end samples. A component that is not flat must normalise to handles inside **[−1, 2]**. A run that needs handles outside that range (a bump that returns near its start, or a normalisation by a tiny difference) does not fit and is split. On a combined vector (scale, colour) one component's split splits the whole vector, because the components share keyframe times. | Lottie easing is normalised: the curve maps 0 to 1 in value, so a component that barely changes across a run has nothing safe to normalise against. The [−1, 2] bound keeps every handle within reach of an editor's curve view and admits every Marey easing and handoff curve, whose handles all lie inside [0, 1] (proposal §2's coefficients give, for example, `o.y = 2/3`, `i.y = 5/6` for the `easeOut` handoff). The round-trip test (§5) evaluates the curve exactly as a player does, so these edge cases are tested, not reasoned about. |
| F7 | **Position is written as separate dimensions** (`p: {s: true, x: …, y: …}`) whenever it is animated, so x and y are fitted and keyframed independently. A static position stays the combined `[x, y]`. Scale and colour stay combined vectors, with one handle per component (`x` and `y` arrays as long as the value). | x and y usually move differently (a parabola is linear in x and quadratic in y), so one shared run boundary would cut both tracks wherever either one changes. Editors show separated position as two plain value curves, and in After Effects terms these are "separate dimensions", not a spatial path that needs `to`/`ti` tangents. Scale and colour are not spatial, so per-component easing is enough. A layout probe measures all three layouts in both players before anything depends on them (§4). |
| F8 | Handles outside 0 to 1 in y, within F6's bound, are written as they come (overshoot). They are not clamped. | A fitted run can need them: a value that passes its end value and comes back inside one run. Clamping a handle changes the motion. Lottie allows y outside 0 to 1; only x is confined to it. |
| F9 | The fitter is **deterministic**: plain IEEE arithmetic in a fixed order, no randomness, and no dependence on object iteration order beyond the encoder's existing layer order. | `marey export` prints the file's `sha256`, and `tools/cli-check/export-matrix.mjs` byte-compares two runs. |
| F10 | **Encoding time has a budget.** In Node, encoding Dusk Hills at 60 fps takes under 1 s, measured in the test suite, which fails above 2 s. The algorithm is the builder's choice within that budget. | Greedy extension that refits from scratch on every step is O(n²) per track. That is fine at 30 fps and 12 s, and it is the kind of cost that quietly grows when someone exports a 60 s scene at 60 fps. A measured ceiling keeps it honest. |
| F11 | **Layer names, hierarchy and shape types are unchanged.** Groups stay null layers that parent their children, shapes stay parametric `el` and `rc` items where they are today, and names stay the object's own name (`band_3`, `sail`). | These already suit an editor. The proposal's problem was the keyframes. Changing the layer structure as well would make the measurements in §6 compare two changes at once. |
| F12 | The **package version stays 0.7.0**. 0.7.0 has not been published. It will carry 9B and this change together, and the 9B status lines say so. | A version that has never shipped has no users who could see the export bytes change under it. |

## 2. What changes in the file

Before, for a circle that slides right in two seconds with `easeOut` at 30 fps:

```text
p: { a: 1, k: [ {t:0, s:[100,300], i:LIN, o:LIN}, {t:1, …}, … 60 keyframes … ] }
```

After:

```text
p: { s: true,
     x: { a: 1, k: [ {t:0,  s:[100], o:{x:[0.3333], y:[0.6667]}, i:{x:[0.6667], y:[1]}},
                     {t:60, s:[700]} ] },
     y: { a: 0, k: 300 } }
```

That is two keyframes, an `easeOut` handle an editor can drag, and a static y.
The handle values shown are rounded for the page; the file carries full
doubles.

The last keyframe of a track carries `t` and `s` only. That is the form Lottie
editors write, and the layout probe confirms both players read it. If either player needs
`i`/`o` on the final keyframe, it gets linear handles instead, and the result
is recorded.

## 3. What does not change

- Sampling: `frameSampler` and the export plan are untouched. The fitter sees
  the same snapshots the encoder sees today.
- The constant-track collapse (Phase 5A §7.2): a track whose every sample
  equals its first is still a static property. Exact equality, as now.
- The opacity asymmetry: transforms stay parented, opacity is the flattened
  ancestor product, and the inert group-null alpha stays as documented in
  `renderer.md`.
- Static geometry, text outlines, masks, the background solid, `ip`/`op`,
  `fr`, and layer order.

## 4. Real-player facts to measure first

The Lottie specification does not settle these, and both players must answer
them before the encoder depends on them. A layout probe builds hand-written fixture
documents and renders them in lottie-web 5.13 and dotlottie-web through
`tools/visual-check/lottie-render-worker.mjs`, comparing pixels against a
per-frame reference document rendered the same way:

1. Split position (`p.s: true`) with independently keyframed `x` and `y`.
2. Per-component easing on a combined vector (scale and colour) with `x`/`y`
   arrays of the value's length.
3. A y handle outside 0 to 1 (overshoot), and a cubic easing evaluated at
   whole and fractional frames.
4. A final keyframe with no `i`/`o`.

The item 1 fixture is also opened in an editor (Glaxnimate, if it can be
installed on this machine), because the point of the change is editing, and
finding late that an editor cannot read separated position would force a
rework.

A fact either player gets wrong changes the layout, not the plan:

- a failed item 1 (or an editor that cannot read it) means combined position,
  fitted as a vector with shared run boundaries;
- a failed item 2 means one easing per keyframe, shared by every component,
  with run boundaries shared too;
- a failed item 3 (a player that clamps y to 0 to 1) narrows F6's handle range
  to [0, 1], so overshooting runs split rather than clamp;
- a failed item 4 gives the final keyframe linear handles.

Each fallback is recorded in this document as a dated correction.

### Correction, 2026-11-13: measured layouts

`eval/RESULTS-LOTTIE-FITTED.md` §1 holds the measurements.

- Item 1 (split position) passes in both players. Glaxnimate 0.6.0 reported
  `Invalid value for box.Transform.position` on the hand-made split-position
  document and accepted the combined-position one. The cause is in
  Glaxnimate's importer (`src/core/io/lottie/lottie_importer.hpp` at tag
  `v0.6.0`). `load_transform` first calls the generic `load_basic`, whose
  field table maps `p` to `position` and warns because a split `p` has no
  `k`. It then reads `p.x` and `p.y` and joins them into one position
  (`JoinAnimatables`). The warning is therefore cosmetic, the motion is
  imported, and Glaxnimate shows it as a single position property. **Split
  position stays as F7 says.** The editor check (§6.4) confirms the imported
  motion.
- Item 2 (per-component easing) fails in dotlottie-web: a scale and a colour
  track with different handles per component render with a maximum channel
  delta of 218 against the per-frame reference (scale alone 199, colour alone
  56), while lottie-web is exact. **Fallback chosen: one easing per keyframe,
  shared by every component of a scale or colour vector, with run boundaries
  shared too.** The same documents with one shared easing pass in both players.
  F6 and F7 change accordingly for scale and colour: a combined run is fitted
  with one cubic shared by its components, which splits it more often than
  per-component fitting would. Position is unaffected, because each separated
  dimension is already a single component.
- Item 3 (y handles outside 0 to 1) passes in both players, so F6's `[-1, 2]`
  handle range stays. A fractional frame needs a reference keyed finer than
  one keyframe per frame, because between two samples lottie-web draws the
  curve and the per-frame reference draws a chord.
- Item 4 (a final keyframe with only `t` and `s`) passes in both players, so
  the final keyframe stays bare.

### Correction, 2026-11-13: tighter tolerances after the real-player measurement

The first fitted export missed §6.2's acceptance bound. `eval/RESULTS-LOTTIE-FITTED.md`
holds the numbers. F3's tolerances were set in each property's own units, but a
player's error shows up in pixels:

- **Rotation and scale act through a lever arm.** 0.01° on a point 300 px from
  its pivot moves it 0.05 px. 0.01 percentage points of scale on a 1,000 px
  shape moves its edge 0.05 px. On an antialiased edge that is about a dozen
  levels. That matches the misses on Ledges, Logo reveal and Physics pile in
  dotlottie-web and lottie-web (+8 to +11 over the per-frame file).
- **Position at 0.01 px is about 2.5 levels on an edge**, above the +2 bound.
  That matches the handoff fixture's miss (+3).
- **Colour at 0.49/255 leaves no margin for the player's own easing
  inversion.** The samples are whole 8-bit levels, and a value within 0.49 of
  one rounds back to it only if the player evaluates the curve exactly. Its
  curve solver is accurate to about 1e-3 in progress. Dusk Hills' sky then came
  out 1 level off over a quarter of the frame. The maximum delta was unchanged,
  but the claim in F3's rationale ("rounding the fitted value recovers the
  original 8-bit channel at every sampled frame") did not hold in a real
  player.

The tolerances are tightened, as §6.2 allows. They are never loosened:

| Channel | Was | Now | Worst case on screen |
|---|---|---|---|
| position | 0.01 px | 0.004 px | 1 level on an edge |
| scale | 0.01 points | 0.0004 points | 0.004 px at 1,000 px from the pivot |
| rotation | 0.01° | 0.0002° | 0.0035 px at 1,000 px from the pivot |
| opacity | 0.1 (of 100) | 0.05 | 0.13 levels |
| colour | 0.49/255 | 0.25/255 | half a level of margin for the player |

Every Marey easing is an exact cubic, so `animate` tracks still fit to within
float noise and are unaffected. Physics, composed opacity and colour fit
shorter runs. The new keyframe counts are recorded beside the old ones.

### Correction, 2026-11-13: dotlottie-web's easing cache, and a pixel bound the rasterizers cannot resolve

Tighter tolerances still left four rows over §6.2's bound. A diagnosis
evaluated every layer in Node and read lottie-web's live `finalTransform`
matrices. It found that every property at every failing frame is within
tolerance, so the fitter's arithmetic is not the cause. There were two
separate causes.

- **dotlottie-web (ThorVG) caches easing curves under a rounded key.** When
  a keyframe has no `n` name, ThorVG's parser keys the interpolator it builds
  by `"%.2f_%.2f_%.2f_%.2f"` of the handles. The format string ships in
  `dotlottie-player.wasm`. Every later keyframe whose handles agree to two
  decimals reuses the first curve. Fitted handles are full-precision, so
  distinct curves collided. Objects were drawn up to 0.96 px off, and the
  physics-pile 206 and logo-reveal 81 misses came from this. That is a real
  defect in the file as ThorVG reads it. **Fix: a keyframe whose ThorVG key
  collides with a different handle tuple in the same document carries an `n`
  name. The name is derived from the handle values, not from a counter,**
  so one name always means one curve. A player that caches curves by `n`
  (ThorVG within a document; lottie-web's `BezierFactory.getBezierEasing`,
  whose cache every animation on a page shares, on its spatial path) then
  cannot give a keyframe another keyframe's curve, within a file or across
  Marey files on one page, while a counter such as `m1` would name a
  different curve in every file. lottie-web ignores `n` on the array-handle
  path Marey writes (`interpolateValue` calls `getBezierEasing` without it),
  so there the name changes nothing. (Corrected the same day: an earlier
  wording said a counter would make two Marey files share curves in
  lottie-web, which reads `n` only on the spatial path.) The
  name is `e` followed by 16 hex digits: two FNV-1a hashes of the
  full-precision handle values, 17 characters in all. The first draft spelled
  it like lottie-web's own default key (`bez_0p3333…`). That was measured to
  fail, because ThorVG compares names over their first 20 characters and
  every such name shares its first 20. Keyframes with no collision get no
  name.
- **lottie-web's two misses are measurement artifacts.** Chromium's canvas
  and ThorVG both turn sub-pixel position into a step function. As a control,
  shifting the *per-frame* file's positions by 0.001 px, a quarter of the
  position tolerance, moves single edge pixels by up to 46 levels in
  lottie-web and 63 in dotlottie-web. Shifting one object of the per-frame
  file by +0.0015 px reproduces the fitted render of physics-pile frame 70
  exactly. No encoding that is not byte-identical can reliably meet "max ≤
  per-frame max + 2".

**§6.2's acceptance is restated, not loosened.** A pixel maximum on edges
cannot tell a correct encoding from a wrong one at this scale, so it is
replaced by measurements that can:

1. **Geometry in the player.** In lottie-web, every layer's `finalTransform`
   at every compared frame of the fitted file is within F3's tolerances of
   the per-frame file's, translated to pixels the way the tolerance table
   states, plus 1e-4 px. The extra 1e-4 px covers one translation that was
   measured 9e-6 px over the bare tolerance. The cause is lottie-web storing
   the per-frame file's positions in a `Float32Array`, not the easing solver
   an earlier draft of this correction named. The value compared is the
   player's evaluated property value (`pv`), the value it computes from the
   file at that frame. The drawn value `v` can lag behind it, because
   lottie-web skips changes under 1e-5 of its internal units (5.7e-4° of
   rotation, 1e-3 points of scale). That holds for any file, so it measures
   the player, not the encoding. The lag was measured on Ledges at frame 255:
   `pv` matched the fit and the sample exactly, while `v` held frame 180's
   value.
2. **Pixels with a calibrated bound.** In both players, the fitted file's
   maximum delta does not exceed the worst maximum over the per-frame file
   and its copies with positions shifted by ±0.001, ±0.002 and ±0.004 px,
   plus 2. The shifts span the position tolerance, because a fitted position
   anywhere inside the tolerance is correct by F3, and a pixel result that a
   tolerance-sized shift of the reference also produces cannot count against
   it. The share of differing pixels is reported beside the calibrated
   range. It fails only when it exceeds the range's highest share by more
   than 0.5 percentage points. Sub-pixel noise moves the share by hundredths
   of a point. A systematic error moves it by whole points; the colour
   tolerance's first value moved Dusk Hills' share from 0.97% to 25.9%. The
   share is judged on every compared frame, not only on the row's worst one.

**Opacity at its bounds is exact.** A sample of exactly 0 or exactly 100
opacity is reproduced exactly by the fit, not merely within F3's 0.05. Players
quantise opacity, and dotlottie-web drew Logo reveal's sun one level darker
at a fitted 99.963 that F3 allowed. That moved the frame's share by 0.59
points over the calibrated range. Full and zero opacity are the values a
scene holds longest, so an error there is spread over the most pixels. Runs
through those samples therefore fit to them exactly, at the cost of a few
more keyframes on fades.

The original bound and its misses stay recorded in
`eval/RESULTS-LOTTIE-FITTED.md`, beside the restated measurements.

### Correction, 2026-11-13: colour is drawn by truncation

The correction on tighter tolerances above explains the colour misses by "the
player's own easing inversion", "accurate to about 1e-3 in progress". That
explanation is wrong. With x handles at 1/3 and 2/3 the x curve is the
identity, and lottie-web's inversion returns the progress exactly: its first
Newton step on `x(u) = u` lands on the answer. The mechanism is truncation.
lottie-web draws a fill or stroke channel as `Math.floor(255 · c)`
(`bmFloor` in `renderFill` and on its canvas style path), so a fitted value a
hair under the sampled level k/255, which a symmetric tolerance allows, is
drawn as k − 1. The same mechanism is the likely cause of Dusk Hills' share
of 25.9% under the first tolerance, 0.49/255 on both sides, where rounding
would have recovered every level. That document was not re-measured to
confirm it.

The ±0.25/255 tolerance still let it through. Evaluated in double precision,
199 channel-frames over Dusk Hills' ten colour tracks at 30 fps (230 at
60 fps) truncated one level low, against none in the per-frame file. lottie-web
holds an animated vector in a `Float32Array`, which absorbs undershoots smaller
than its resolution. Modelled with that, 48 channel-frames on 42 frames were
drawn one level dark, all in the two lowest sky bands (`band_4` and `band_5`)
between frames 51 and 305. The acceptance frames happened to miss all of
them.

**Colour's tolerance is one-sided.** At every sampled frame the fitted value
lies in `[sample, sample + 0.25/255]`, on the 0 to 1 scale, and F4b's
between-frame bound for colour becomes `[min(neighbours), max(neighbours) +
0.25/255]`. A value in that band truncates and rounds to the sampled level, so
F3's original claim, "rounding the fitted value recovers the original 8-bit
channel at every sampled frame", now holds for truncation too. The fitter
takes it as a general asymmetric band (`band` in `FitOptions`, the tolerance
below and above each sample) and fits toward the band's middle; only colour
uses it. Dusk Hills rises from 3731 to 3941 keyframes; the other measured
scenes have no animated colour and are byte-identical. The real-player
measurement, including the frames that drew dark, is in
`eval/RESULTS-LOTTIE-FITTED.md`.

### Correction, 2026-11-13: encoding time

F5's greedy extension re-checked every interior sample each time a run grew by
a frame, so a run of length L cost O(L²). Physics pile lengthened to 60 s at
60 fps (3,600 frames, nearly all a heap at rest) took 3.7 to 11.6 s to encode
in single runs on a loaded machine, against F10's 1 s target. The fitter now
decides two kinds of run in constant time per frame, with the verdict the full
check would give: an exactly constant run, and a run whose components are all
flat, where every interior sample bounds the slope of the straight line
between the run's ends independently of the run's length. A body at rest is
one or the other. A run that is neither and reaches 64 frames grows by
galloping: its end advances by 1, 2, 4, … frames until a candidate does not
fit, and the last fitting end is found by bisection, each candidate checked in
full. **F5 is amended for runs past 64 frames:** the end found is never
earlier than the frame-by-frame greedy end, because every shorter run fits,
and it can be later only where a run fails at one length and fits again at a
longer one. Every canonical scene's document is byte-identical under the
change. The suite enforces F10 on Dusk Hills at 60 fps and on the lengthened
Physics pile.

## 5. Tests

- **Unit tests on the fitter** (pure functions, no IR):
  - each Marey easing (`linear`, `easeIn`, `easeOut`, `easeInOut`, and the four
    handoff variants) sampled at 30 and 60 fps fits as one keyframe pair, or as
    two segments for `easeInOut`, split at its midpoint;
  - a yoyo fits as two segments, split at the turn when the curve still moves
    there and wherever the first segment stops fitting when it arrives at rest,
    and an `easeInOut` yoyo fits as four, two of its splits fixed at each leg's
    midpoint (added 2026-11-13, when the yoyo cases were first tested);
  - a sampled parabola fits as one pair;
  - a step discontinuity splits exactly at the step;
  - a run whose start and end match but whose middle moves is split;
  - a constant run is linear;
  - the output is identical across two runs;
  - the tolerance table's values are pinned.
- **A round-trip evaluator in the test suite**: a small function that
  evaluates a keyframed Lottie property at a frame the way lottie-web does
  (cubic Bézier easing with x inverted numerically). Every canonical scene's
  fitted file, evaluated at every sampled frame, matches the per-frame samples
  within F3's tolerance. This is the test that would catch a handle formula
  written backwards.
- **The rewritten encoder tests.** "gives every keyframe explicit linear easing
  handles" encodes §7.1 and is rewritten to assert the fitted form, not
  deleted.
- **Keyframe counts as regression ceilings.** On the scenes that can be
  sampled in Node (the text-free scenes of `eval/scenes-3b/`, and
  `src/examples/` Dusk Hills, Ledges and Physics pile), the fitted keyframe
  count is pinned at or below a measured ceiling, so a change that silently
  returns to per-frame output fails.
- **The performance budget** of F10.

## 6. Evidence the change owes

Recorded in `eval/RESULTS-LOTTIE-FITTED.md`:

1. **Size and count.** The proposal's §1 table re-measured with the same
   command, beside the old numbers. Add Bar chart reveal and Logo reveal.
2. **Real players.** `tools/visual-check/lottie-check.mjs --compare-png` on
   the canonical scenes and on one fixture per easing, in lottie-web and in
   dotlottie-web, comparing the fitted file against Marey's own PNG frames.
   Report the maximum channel delta and the share of differing pixels, beside
   the same measurement for the per-frame file at the commit before the change.
   **Acceptance:** the fitted file's maximum delta exceeds the per-frame file's
   by no more than 2 channel levels on any compared frame. A miss may be
   answered by tightening F3's tolerances, never by loosening them or the
   acceptance bound, and the tightened table is pinned and recorded.
3. **Fractional frames.** Sample a 30 fps fitted export at frames `n + 0.5` in
   lottie-web and confirm the motion is continuous (no jump against the
   neighbouring whole frames beyond the motion's own speed).
4. **An editor.** Open one fitted export in a Lottie editor that can run on
   this machine without an account (Glaxnimate, which imports Lottie JSON),
   and record what it shows for one `animate` block: the keyframe count, the
   keyframe times and whether the easing handle is editable. If no editor can
   be run, say so plainly and do not claim editor behaviour.
5. **Determinism.** `npm run check:export` passes (the byte comparison across
   two runs).
6. **Hashes.** Lottie `sha256` values recorded in earlier `eval/RESULTS-*.md`
   files describe the per-frame encoding. The results file says that a
   re-export will not match them, and why.

## 7. Documentation

- Phase 5A design: a dated note under §7.1 saying it is superseded and
  pointing here.
- `docs/architecture/renderer.md`'s Lottie section: describe the fitted
  encoding, the tolerance table, separated position, and where the fitter
  lives.
- The proposal document's status line: "accepted 2026-11-13, designed in
  `2026-11-13-marey-lottie-fitted-keyframes-design.md`".
- `roadmap-and-process.md`: the "Proposed, not scheduled" bullet becomes a
  status bullet.
- The README's export section: one sentence saying Lottie output has editable
  keyframes and easing. The user-facing guide to editing an export is part of
  the 9C documentation site (`2026-11-13-marey-phase-9c-docs-site-and-gallery-design.md`,
  §5.4), which describes the file this change produces.

## 8. Left to the builder

- The fitting arithmetic: least squares over the run's interior samples with
  the endpoints pinned is the expected method, but any method that meets F3 to
  F6 and F10 is acceptable.
- File layout: a new `export/lottieFit.ts` beside `lottieEncode.ts` is
  expected. It must obey the same import rule as the encoder (no PixiJS, no
  Scene IR), and the boundary test that greps `lottieEncode.ts` is extended to
  cover it.
- The per-easing fixture scenes for §6.2 go in `tools/visual-check/scenes/`.
