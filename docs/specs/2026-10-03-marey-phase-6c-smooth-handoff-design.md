# Marey Phase 6C — Smooth Handoff

**Date:** 2026-10-03
**Status:** Design. On 2026-10-03 the owner chose to reshape the curve and
keep the momentum, and approved the rule and the curves (§2.1, §2.2). They
approved the rest without reviewing it section by section.
**Parent:** `2026-09-27-marey-phase-6-packaging-and-legibility-design.md`.
6C was split out of the 6B redesign (6B spec, decision D10). It runs on the
`phase-6c` branch, before the parent's Tasks 13–15.

**Preserves:**
- Every animation without `handoff: true`: its curve, its tick-level timing and its
  exported frames.
- The six compile rules for `handoff` (`docs/LANGUAGE.md`, "handoff") and their
  error codes.
- The `linear` curve everywhere, and `easeIn` on a forward handoff.

**Replaces:**
- The fixed exit-velocity multipliers (`getEasingDerivativeAtEnd` in
  `src/compiler/renderer/sceneRuntime.ts`) with the velocity the animation
  actually has in its final tick (§2.1).
- The `easeOut` and `easeInOut` curves of a forward handoff, and the `easeIn`
  and `easeInOut` curves of a yoyo handoff (§2.2).
- The release timing of a handoff whose `physics` block runs alongside the
  animation (§2.3).
- How the live preview paints animations between ticks (§2.4). Exports
  are unaffected.

---

## 1. The problem, measured

The owner reported during 6B that a handoff "is not as smooth as it should
be". A throwaway probe measured it. It drove `SceneRuntime` against the real
`MatterWorld` and moved a body 200 px over 1 s (120 ticks) with
`handoff: true`. Gravity and air drag were both zero, so any change in speed
at the seam comes from the handoff alone. The figures below are the body's
displacement per tick, in px, around the release. A smooth handoff keeps the
same displacement on both sides of the seam.

**Arrangement A: `physics` in a `sequence` after the animation.**

| Easing | Last animated tick | First free tick | Ratio |
|---|---|---|---|
| `linear` | 1.6667 | 1.6667 | 1.00 |
| `easeIn` | 3.3194 | 3.3333 | 1.004 |
| `easeOut` | 0.0139 | 0.8333 | **60** |
| `easeInOut` | 0.0278 | 0.8333 | **30** |
| `linear`, yoyo | 1.6667 | 1.6667 | 1.00 |
| `easeIn`, yoyo | 0.0139 | 3.3333 | **240** |
| `easeOut`, yoyo | 3.3194 | 0.8333 | **0.25** |
| `easeInOut`, yoyo | 0.0278 | 0.8333 | **30** |

**Arrangement B: `physics` beside the animation, on the same object.** The
release tick moves the body twice: once for the animation's last step and
once more for the physics step. For `linear`, the sequence around the
release reads 1.6667, 1.6667, **3.3333**, 1.6667. Every easing shows the same
extra step, on top of the ratios above. For `easeOut` it reads 0.0694,
0.0417, **0.8472**, 0.8333.

**The live preview.** Those figures are per tick, which is what an export
paints (`paintExactTick`). The live preview paints with `paint(alpha)`
instead, and there the two subsystems are a tick apart. An animation paints
at `elapsedTicks + alpha`, half a tick ahead, while a body paints between
ticks N−1 and N, half a tick behind. When an object passes from one to the
other it loses that tick. The probe painted at alpha 0.5 after every tick. In
arrangement A the painted displacement for `linear` reads 1.6667, 1.6667,
**0.8333, 0.8333**, 1.6667: two frames at half speed, a hitch even where the
tick figures are perfect. In arrangement B the early release in defect 3
below happens to hide this, which is why `linear` looks smooth there today.
`renderer.md` and the `paintExactTick` docstring call this offset "invisible"
live. Between two objects it is, but on one object crossing the seam it is
not.

That makes four defects:

1. **The handed-off speed is not the curve's speed.** It is a fixed multiplier
   of the average speed (`linear` 1, `easeIn` 2, `easeOut` 0.5, `easeInOut`
   0.5). `easeOut` and `easeInOut` reach their end at rest, then get pushed
   to half the average speed. That includes the default easing, `easeInOut`.
2. **A yoyo uses the wrong end of the curve.** A yoyo releases at the curve's
   *start*, but the multiplier describes its end. A yoyo `easeIn` is at rest
   and gets thrown at 2×. A yoyo `easeOut` moving at 2× drops to 0.5×.
3. **Arrangement B releases a tick early.** On the release tick the body is
   placed at `to` and then stepped with the new velocity, so it covers two
   ticks' distance in one.
4. **The preview paints animation and physics a tick apart,** so an object
   handing off loses a tick on screen.

---

## 2. The design

### 2.1 The rule

**A handoff gives the body exactly the velocity the animation had in its
final tick:** the displacement of that tick, times `TICK_HZ`. That makes the
first free tick cover the same distance as the last animated one.

This replaces the multiplier table. The velocity comes from the curve, so
the two can no longer disagree. A non-looping yoyo's final tick is the last
tick of its return leg, so its direction comes out right without a special
case.

This is the per-tick meaning of "the velocity it is moving at when it ends".
It differs from the curve's slope at the end by under 1% for a 1 s `easeIn`,
and by less as the duration grows. The owner's §2.2 table states slopes; the
runtime hands off the final tick.

### 2.2 Curves that would release at rest

A handoff's curve changes only when two things are both true: `handoff: true`
is set, and the curve would reach its release end at rest. In that case the
release end is reshaped so that it arrives moving at **0.5× the average
speed**. This is today's release speed for the two ease-outs, so existing
throws keep roughly the same arc. The other end of the curve keeps its usual
slope, so an `easeOut` still starts fast and an `easeInOut` still starts from
rest.

The reshaped curves are the cubic Hermite curves that start at 0, end at 1,
and have the slopes shown.

| Animation | Releases at | Curve E(t) | Slope at 0 | Slope at 1 |
|---|---|---|---|---|
| `easeOut`, forward | end | `2t − 1.5t² + 0.5t³` | 2 | 0.5 |
| `easeInOut`, forward | end | `2.5t² − 1.5t³` | 0 | 0.5 |
| `easeIn`, yoyo | start | `0.5t + 0.5t³` | 0.5 | 2 |
| `easeInOut`, yoyo | start | `0.5t + 2t² − 1.5t³` | 0.5 | 0 |

Every other combination keeps its usual curve: `linear`, a forward `easeIn`,
a yoyo `easeOut` and a yoyo `linear`. Each of those already moves at its
release end. A looping animation cannot hand off (`TYPE_HANDOFF_LOOP`), so it
is never reshaped.

All four curves rise monotonically on [0, 1], so none goes backwards or
overshoots `to`. Their slopes are `2 − 3t + 1.5t²` (smallest value 0.5, at
t = 1), `5t − 4.5t²`, `0.5 + 1.5t²` and `0.5 + 4t − 4.5t²`. All four are
positive on [0, 1] except where the table puts a zero: `5t − 4.5t²` is 0 only
at t = 0, `0.5 + 1.5t²` is never below 0.5, and `0.5 + 4t − 4.5t²` is 0 only
at t = 1.

The resulting release speeds, as multiples of the average speed:

| Animation | Before | After |
|---|---|---|
| `linear` | 1 | 1 |
| `easeIn` | 2 | 2 |
| `easeOut` | 0.5, from rest | 0.5, moving |
| `easeInOut` | 0.5, from rest | 0.5, moving |
| `linear`, yoyo | 1 | 1 |
| `easeIn`, yoyo | 2, from rest | **0.5**, moving |
| `easeOut`, yoyo | 0.5, while moving at 2 | **2** |
| `easeInOut`, yoyo | 0.5, from rest | 0.5, moving |

The two yoyo rows in bold are behaviour changes. A scene that relied on the
old numbers will throw differently.

### 2.3 Release timing

**Both arrangements release on the same tick.** The body is let go after the
step of the tick in which the animation reaches its release value, so that
step leaves it at that value. The first tick it moves freely is the one
after. Arrangement A already does this. In arrangement B, a handoff
animation's position pin (`POS_ANIM`) is released after `world.step()` on the
completion tick, not before it. That release is also when the parked velocity
is flushed.

This applies only to animations with `handoff: true`. A non-handoff position
animation alongside physics keeps its current release order, so its frames
do not change.

### 2.4 Painting the seam

**`paint(alpha)` paints animations backward across [N−1, N], as physics
already does.** The animation's painted progress becomes the lerp, by alpha,
from the progress it had at tick N−1 to the progress it has at tick N. That
is the same interpolation `readState` uses. With both subsystems a tick
behind the simulation, an object crossing the seam keeps an even pace.

`AnimTime` records the previous tick's elapsed count, so this holds at the
ticks where "N minus one step" is wrong:
- At a yoyo's turning tick, the direction has just flipped.
- On the tick a runner completes, the old code painted straight at the final
  value. Now it paints from the N−1 value to the final one.
- At a looping animation's wrap tick, elapsed jumps from `durationTicks − 1`
  back to 0. Lerping between those would sweep backwards through the whole
  path in one frame. Instead, the wrap tick paints from tick N−1's progress
  to the end of the cycle (progress 1), and the next tick paints from 0. That
  matches what the preview shows today, where the jump back to the start
  happens between frames.

Delay handling and clamping stay as they are.

`paintExactTick()` paints what it painted before, both subsystems at tick N. Exported
frames therefore do not change because of this section. The cost is that
the preview shows every animation 8.3 ms later than it does now, the same
lag physics already has. `paintExactTick` keeps reading an animation's
tick-exact progress directly, rather than painting at alpha 1. The two give
the same value except on a loop's wrap tick. There, alpha 1 means the end of
the cycle, while the exact tick is the start of the next one, and the export
must keep painting the start. The `paintExactTick` docstring and
`renderer.md` are updated, because the explanation of "opposite temporal
directions" no longer applies.

### 2.5 Where the code changes

- **`src/compiler/renderer/easing.ts` (new).** This holds the pure curve
  functions, moved out of `sceneRuntime.ts`: `evaluateEasing(t, easing,
  release)` and `releaseEndOf(anim)`. They import nothing from `pixi.js`, so
  they run in Node like `clock.ts` and `timeline.ts`.
- **`src/compiler/renderer/sceneRuntime.ts`.**
  - Every place that evaluates a curve (`applyAnim`, `pushAnimToWorld` and
    `tickScaleOf`) passes the animation's release end, so the body and the
    painted object follow the same curve.
  - `getEasingDerivativeAtEnd` is deleted. The velocity is the final tick's
    displacement times `TICK_HZ` (§2.1).
  - The arrangement B release moves to after `world.step()` (§2.3).
- **`src/compiler/renderer/timeline.ts`.** `AnimTime` gains the previous
  tick's elapsed count, and the progress used for painting interpolates from
  it (§2.4). The tick phase (`pushAnimToWorld`, `tickScaleOf` and the
  completion snap) keeps reading tick N exactly.
- **Unchanged:** the type checker, the compile rules, the IR, the Lottie and
  video exports. The exports sample the runtime, so they pick up the new
  curves without being touched.

### 2.6 What else changes

- **`docs/LANGUAGE.md`, "handoff".** The paragraph about the multiplier is
  replaced by the rule in §2.1, the release-speed table in §2.2 and one
  sentence on the reshaped curves. The yoyo paragraph is updated to match.
- **`docs/architecture/renderer.md` and the `paintExactTick` docstring.**
  Both now say that the two subsystems interpolate in the same direction
  (§2.4). Each also records the measurement that showed the old offset was
  visible at a handoff.
- **Scene comments that state the old multipliers.** These are
  `eval/scenes-3b/compound-logo.marey` (lines 44–48) and any comment the
  implementer finds by grepping for `multiplier`, `average speed` and
  `handoff`.
- **Affected scenes.** Every scene with `handoff: true` either keeps its
  frames or changes for a reason given in §2.1–§2.3:
  - `eval/scenes-3b/compound-logo.marey` is arrangement A with `linear`, so
    its motion should not change. One caveat: the final-tick velocity equals
    the old `linear` velocity only to within the last bits of a double. For
    200 px over 120 ticks it is 199.99999999999886 px/s, not 200. That can
    move the frame hash (`26cca4e9` in `docs/determinism.md`) without any
    visible change. §3 says how this is checked.
  - The scenes that may change are `eval/scenes/throw-arc.marey`,
    `eval/scenes-r2/throw-arc.marey`,
    `tools/visual-check/scenes/test-card.marey` and
    `tools/visual-check/scenes/hello-face.marey`.
  - None of the five examples uses `handoff`.
- **`eval/RESULTS-PHASE-6.md`** gains a 6C section with the before and after
  tables from §3.

---

## 3. Checks

**The seam test.** A new test drives `SceneRuntime` against the real
`MatterWorld`, using the probe's setup: 200 px over 1 s, gravity 0, air drag 0
and no bounds. It covers 16 cases: 2 arrangements × forward or yoyo × 4
easings. For each one it asserts:

1. The first free tick's displacement equals the last animated tick's,
   within 0.1%.
2. The last animated tick's displacement equals the curve's final step,
   `|E(p_last) − E(p_prev)| × 200` px, within 0.1%. This rules out a doubled
   or a stalled release tick.
3. The release tick is the same in both arrangements: tick 120 for a forward
   animation and tick 240 for a yoyo, counted from the animation's first
   tick.

4. The painted path follows the tick path, across the seam too. Let `d[k]`
   be the tick-level displacement of tick k. For alpha a in {0.25, 0.5, 0.75}
   and k from N−3 to N+3, the painted step between `paint(a)` after tick
   k−1 and `paint(a)` after tick k equals `(1 − a)·d[k−1] + a·d[k]`, within
   1%. The tolerance is looser than in checks 1–3 because an animation
   paints the curve at an interpolated progress, not a straight line between
   two ticks. Where the curve bends at its release end, that differs by up to
   a(1 − a)·|E''|·D / (2·TICK_HZ²) px. That is 0.007 px, or 0.8% of a step,
   for the reshaped `easeInOut`. The defect being caught is 0.83 px. Together
   with checks 1 and 2, this means the preview shows no
   hitch.

The test is written before the fix, and it fails on the current code. The
failing numbers go into `eval/RESULTS-PHASE-6.md`.

**Painting tests (`timeline.test.ts`, `sceneRuntime.test.ts`).**
- Painted progress at alpha 0 equals tick N−1's progress, and at alpha 1
  equals tick N's. This is checked for a forward animation, at a yoyo's
  turning tick, on a completion tick, at a loop's wrap tick and during a
  delay.
- `paintExactTick()` still paints both subsystems at tick N. The existing
  "paints an animation at its current tick" and "paints a free body at its
  current tick" tests stay green.
- The existing `paint(alpha)` expectation that assumes forward
  extrapolation (`(200 × 1.75) / TICK_HZ`) is rewritten to the backward
  value, and the test says why.

**Curve unit tests (`easing.test.ts`).** For every easing and every release
end, they check that:
- E(0) = 0 and E(1) = 1;
- E is non-decreasing at 1,000 sample points;
- the numerical slope at each end is within 1e-3 of the §2.2 table;
- with no release end, the curve is identical to today's at the same sample
  points.

**Regression guards.**
- The existing `sceneRuntime.test.ts` handoff tests for `linear` and yoyo
  `linear` still expect ±200 px/s. They move from exact equality to
  `toBeCloseTo(…, 6)` because of the rounding described in §2.6.
- `compound-logo` keeps its motion. Export it as PNG before and after the
  change (`node bin/marey.mjs export eval/scenes-3b/compound-logo.marey
  --format png --out <dir>`). If the `frames` hash is unchanged, that is the
  evidence. If it changes, compare the two runs frame by frame. The largest
  per-channel difference over all 240 frames goes in the RESULTS section,
  and it must be at most 1 (out of 255). `docs/determinism.md` records a
  dated run and is not edited.
- The four repository checks in `AGENTS.md` pass.

**Browser harness.** This is a renderer change, so `tools/visual-check/`
runs once after the fix: `check.mjs` for `test-card`, plus a look at the
handoff ball's arc in the capture. Its numbers go into the RESULTS section.

---

## 4. Out of scope

- A user-chosen release speed, such as a `handoffSpeed` property. The 0.5 is
  fixed.
- Easings beyond the four that exist.
- Handing off rotation or scale.
- The parked finding that a body waiting for its physics step is already solid
  (6B ledger, Task 5).
