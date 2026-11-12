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
| F7 | **Position is written as separate dimensions** (`p: {s: true, x: …, y: …}`) whenever it is animated, so x and y are fitted and keyframed independently. A static position stays the combined `[x, y]`. Scale and colour stay combined vectors, with one handle per component (`x` and `y` arrays as long as the value). | x and y usually move differently (a parabola is linear in x and quadratic in y), so one shared run boundary would cut both tracks wherever either one changes. Editors show separated position as two plain value curves, and in After Effects terms these are "separate dimensions", not a spatial path that needs `to`/`ti` tangents. Scale and colour are not spatial, so per-component easing is enough. Task 1 measures all three layouts in both players before anything depends on them (§4). |
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
editors write, and Task 1 confirms both players read it. If either player needs
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
them before the encoder depends on them. Task 1 builds hand-written fixture
documents and renders them in lottie-web 5.13 and dotlottie-web through
`tools/visual-check/lottie-render-worker.mjs`, comparing pixels against a
per-frame reference document rendered the same way:

1. Split position (`p.s: true`) with independently keyframed `x` and `y`.
2. Per-component easing on a combined vector (scale and colour) with `x`/`y`
   arrays of the value's length.
3. A y handle outside 0 to 1 (overshoot), and a cubic easing evaluated at
   whole and fractional frames.
4. A final keyframe with no `i`/`o`.

Task 1 also opens the item 1 fixture in an editor (Glaxnimate, if it can be
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

## 5. Tests

- **Unit tests on the fitter** (pure functions, no IR):
  - each Marey easing (`linear`, `easeIn`, `easeOut`, `easeInOut`, and the four
    handoff variants) sampled at 30 and 60 fps fits as one keyframe pair, or as
    two for `easeInOut` and the yoyo cases;
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
