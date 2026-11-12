# Lottie Fitted Keyframes Implementation Plan

**Goal:** Lottie export writes a few keyframes with real cubic easing per
animated property instead of one linear keyframe per frame, so an exported
file can be retimed and re-eased in a Lottie editor, and is smaller.

**Architecture:** A new pure module, `src/compiler/export/lottieFit.ts`, turns
a per-frame track into keyframes by greedy cubic-run fitting within a
per-channel tolerance. `lottieEncode.ts` calls it from `track`/`scalarTrack`
and writes animated position as separate x and y dimensions. A test-side
evaluator, `lottieEvaluate.ts`, plays a property back the way lottie-web does,
so the round trip is checked frame by frame. Real players are measured
before the encoder depends on them (Task 1) and after (Task 4).

**Tech stack:** TypeScript, Vitest, Playwright + lottie-web 5.13 +
dotlottie-web through the existing `tools/visual-check/` harness.

**Spec:** `docs/specs/2026-11-13-marey-lottie-fitted-keyframes-design.md`
(builds on `docs/specs/2026-11-06-marey-lottie-keyframe-recovery-design.md`).

## Global Constraints

- Every commit passes the four `AGENTS.md` checks: `npm test`, `npx vitest run --config eval/vitest.config.ts`, `npm run build`, and `npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')`.
- Run Vitest from a working directory spelled with a capital `C:` (engineering lessons §6): a lower-case drive letter makes every file report "no tests".
- Stage paths explicitly and read `git diff --staged` before committing. Never `git add -A`, `git add .` or `git add -f`.
- Commit subjects are Conventional Commits with scope `lottie`, for example `feat(lottie): ...`. No trailers naming a tool or assistant.
- Committed text describes the engineering only. It never mentions the assistant workflow, a skill, a plan-execution mode or a tool-specific path.
- `core.autocrlf` is on. Judge what changed with `git diff --stat -- <path>`, not `git status`.
- `lottieEncode.ts`, `lottieFit.ts` and `lottieEvaluate.ts` import nothing from `pixi.js`, `sceneIR` or `harfbuzzjs`, in any form (`renderer.md`, "The Lottie encoder boundary").
- Tolerances (spec F3), exactly: position `0.01` px, scale `0.01` percentage points, rotation `0.01` degrees, opacity `0.1` on the 0-100 scale, colour `0.49 / 255` on the 0-1 scale.
- Keyframe `s` values are copied samples, never fitted values (spec F4).
- The fitter is deterministic: no randomness, no `Date`, no dependence on `Map`/object iteration order beyond the input arrays' order (spec F9).
- For the browser harness: start Vite with `npx vite --port 5199 --strictPort`, kill it afterwards, and confirm the port is free.
- The package version stays `0.7.0` (spec F12). `npm run check:pack` still reports 127 files.
- Do not change `netlify.toml`. Do not add `public/_redirects`. Do not push, tag or publish.

## Review Focus

- **A component that is flat across a run while another moves** (scale `(1, 0)` to `(1, 1)`): the flat component must get linear handles, not a division by zero producing `NaN` or `Infinity` in the JSON. Task 2 pins it.
- **A track whose endpoints differ by float noise only** (a body at rest drifting by 1e-13): normalising by that difference would produce enormous handles. Spec F6's rejection rule and Task 2's handle bound pin it.
- **Very short tracks**: a two-frame or three-frame scene, and a run with zero or one interior sample. Task 2 pins both.
- **Physics apex**: a ball thrown up and caught at the same height returns to its start value inside one run. That run must split, not encode as a flat line. Task 2 pins it.
- **The JSON shape consumers read**: every existing test or harness that reads `ks.p.k` expects a combined position. Task 3 moves each to the evaluator, and Task 4's real-player runs catch any harness left reading the old shape.

---

### Task 1: Measure the players, and record the per-frame baseline

**Files:**
- Create: `tools/visual-check/lottie-layout-probe.mjs`
- Create: `tools/visual-check/scenes/lottie-ease-linear.marey`, `lottie-ease-in.marey`, `lottie-ease-out.marey`, `lottie-ease-inout.marey`, `lottie-ease-handoff.marey`, `lottie-ease-handoff-yoyo.marey`
- Create: `eval/RESULTS-LOTTIE-FITTED.md` (baseline sections only)
- Modify: `tools/visual-check/README.md` (a row for the probe)

**Interfaces:**
- Produces: the four answers of spec §4 plus the editor smoke test, used by Tasks 2 and 3 to choose the layout: split or combined position; per-component or shared easing; handle range `[-1, 2]` or `[0, 1]`; final keyframe bare or with linear handles.

- [ ] **Step 1: Write the six easing fixtures.** Each is a 960x540 scene, `duration: 3`, with one 80x80 rectangle moving from (160, 270) to (800, 270) over 2 s with the named easing, and the same rectangle's colour animating `#38bdf8` to `#f97316` over the same 2 s. The handoff fixtures add `handoff: true` and a `physics { gravity: (0, 0), collideBounds: false, duration: indefinitely }` sibling. The yoyo one uses `yoyo: true` with a 1 s duration. Check them: `npm run build:cli && node bin/marey.mjs check --export-ready tools/visual-check/scenes/lottie-ease-*.marey` prints no error.

- [ ] **Step 2: Write `lottie-layout-probe.mjs`.** It needs no Marey code. For each of the four questions, it builds two hand-written Lottie documents in Node: a **candidate** using the layout in question, and a **reference** encoding the same motion as one linear keyframe per frame, computed by evaluating the candidate's cubic at every frame. Both have a 200x200 composition, 60 frames at 30 fps and one 40x40 rectangle layer:
  1. split position: `p: {s: true, x: {…}, y: {…}}`, with x eased `easeOut` (`o.y = 2/3`, `i.y = 1`) over 0 to 59, and y keyframed at different times, 0 to 30 and 30 to 59;
  2. per-component easing on scale `[sx, sy]` (sx linear, sy easeIn: `o.y = [1/3, 0]`, `i.y = [2/3, 1/3]`) and on a fill colour;
  3. an overshoot handle: `o.y = 1.4`, `i.y = 1.2`;
  4. a final keyframe with `t` and `s` only.

  Render each document with `lottie-render-worker.mjs` in both renderers (`lottie-web` and `dotlottie-web`) at frames `0, 7, 15, 15.5, 30, 44, 59`. Compare candidate against reference pixel by pixel and print a table: question, renderer, maximum channel delta, verdict (`pass` when the maximum delta is 2 or less). Write the table to `--out <dir>/report.json` too. Reuse the worker's input/output contract as its header comment documents.

- [ ] **Step 3: Run the probe.** `node tools/visual-check/lottie-layout-probe.mjs --out .visual-check/lottie-probe`. Expected: eight rows, each with a measured delta. Read the frame PNGs the worker wrote for any failing row.

- [ ] **Step 3b: Editor smoke test.** Try to install Glaxnimate (`winget install --id Glaxnimate.Glaxnimate`, or the portable build from its official site). If it runs, open question 1's candidate document and record whether the layer moves and whether x and y show as separate keyframed properties. If it cannot be installed or run, write that down and continue. The players' answers still decide the layout.

- [ ] **Step 4: Measure the per-frame baseline.** With Vite on 5199, run `lottie-check.mjs --compare-png --fps 30 --frames 0,15,30,45,60,75` in both renderers on: the six fixtures; `src/examples/dusk-hills.marey`, `ledges.marey`, `bar-chart-reveal.marey`, `logo-reveal.marey` and `physics-pile.marey` (pick frames inside each scene's duration). Record each run's maximum channel delta and share of differing pixels. Then measure keyframes and bytes as the proposal's §1 did (`node bin/marey.mjs export <scene> --format lottie --fps 30 --out <tmp>`, counting properties with `a: 1` and their keyframes, plus `gzip -c | wc -c`) for Dusk Hills, Ledges, Bar chart reveal and Logo reveal.

- [ ] **Step 5: Write `eval/RESULTS-LOTTIE-FITTED.md`** with two sections, "1. Player layout facts (before the change)" (the probe's table and the layout each answer selects) and "2. Per-frame baseline" (both tables, the base commit's hash, the exact commands). If any probe row fails, also append a dated correction to spec §4 stating the fallback layout chosen.

- [ ] **Step 6: Commit** the probe, the fixtures, the README row and the results file: `test(lottie): measure the fitted layouts in both players and record the per-frame baseline`.

### Task 2: The fitter and the evaluator

**Files:**
- Create: `src/compiler/export/lottieFit.ts`, `src/compiler/export/lottieFit.test.ts`
- Create: `src/compiler/export/lottieEvaluate.ts`, `src/compiler/export/lottieEvaluate.test.ts`
- Modify: `src/compiler/export/exportBoundary.test.ts` (extend the no-pixi/no-sceneIR/no-harfbuzz guard to both new modules)

**Interfaces:**
- Produces, in `lottieFit.ts`:
  - `export const LOTTIE_FIT_TOLERANCE: { readonly position: 0.01; readonly scale: 0.01; readonly rotation: 0.01; readonly opacity: 0.1; readonly color: number }`, where `color` is `0.49 / 255`.
  - `export const DEFAULT_HANDLE_RANGE: readonly [number, number] = [-1, 2]` (spec F6).
  - `export interface FitOptions { readonly finalHandles: boolean; readonly handleRange: readonly [number, number] }`
  - `export interface FitHandle { readonly x: ReadonlyArray<number>; readonly y: ReadonlyArray<number> }`
  - `export interface FittedKeyframe { readonly t: number; readonly s: ReadonlyArray<number>; readonly o?: FitHandle; readonly i?: FitHandle }`
  - `export function fitKeyframes(values: ReadonlyArray<ReadonlyArray<number>>, tolerance: number, options: FitOptions): FittedKeyframe[]`. Here `values[f]` is frame `f`'s value, each the same length `d ≥ 1`, and `values.length ≥ 2`. `finalHandles` is Task 1's answer 4: when `true`, the last keyframe carries linear handles. `handleRange` is `DEFAULT_HANDLE_RANGE` unless Task 1's answer 3 failed, in which case the encoder passes `[0, 1]`.
- Produces, in `lottieEvaluate.ts`:
  - `export function evaluateKeyframes(k: ReadonlyArray<FittedKeyframe>, frame: number): number[]`, which evaluates like lottie-web: it finds the segment, solves the Bézier x for the curve parameter numerically (Newton with a bisection fallback, as `BezierEaser` does), applies the y curve per component, and clamps before the first and after the last keyframe.
  - `export function evaluateProperty(prop: unknown, frame: number): number[]`, accepting a static `{a: 0, k}`, an animated `{a: 1, k: [...]}` or a split position `{s: true, x, y}`, returning the value as an array.

- [ ] **Step 1: Write the evaluator tests.** In `lottieEvaluate.test.ts`:
  - `linear handles reproduce a lerp`: keyframes `t:0 s:[0]` and `t:10 s:[100]` with `o {x:[1/3], y:[1/3]}`, `i {x:[2/3], y:[2/3]}` give `50` at frame 5.
  - `easeOut handles match t(2 − t)`: `o.y = [2/3]`, `i.y = [1]` give `100 × 0.75` at frame 5 within `1e-9`.
  - `clamps outside the keyframes`: frame −3 gives the first value and frame 99 the last.
  - `reads a split position`: `{s: true, x: {a:0, k: 4}, y: {a:1, k: [...]}}` gives `[4, y(frame)]`.

- [ ] **Step 2: Write the fitter tests.** In `lottieFit.test.ts`, with a helper `sample(f: (t: number) => number, frames: number)` that returns `[[f(0)], [f(1/(frames−1))], …]`, a constant `OPTS = { finalHandles: false, handleRange: DEFAULT_HANDLE_RANGE }`, and a helper `roundTrip(values, tol)` asserting that `evaluateKeyframes(fitKeyframes(values, tol, OPTS), f)` is within `tol` of `values[f]` for every frame:
  - `fits each Marey easing as one segment`: `linear`, `easeIn`, `easeOut` and the four handoff curves of proposal §2, scaled to 0 to 640 px, sampled at 61 frames, each produce exactly 2 keyframes and pass `roundTrip` at `0.01`.
  - `splits easeInOut near its midpoint`: 61 frames of `easeInOut` give 3 keyframes, the middle one at frame 30, and pass `roundTrip`.
  - `fits a sampled parabola as one segment`: `y = 300 + 400t − 300t²`… chosen to be monotonic on [0, 1], over 45 frames, gives 2 keyframes.
  - `splits a run that returns to its start`: a thrown ball `y = 400 − 1600t + 1600t²` (it leaves and returns to 400) gives at least 3 keyframes, one within a frame of the apex, and passes `roundTrip`.
  - `splits exactly at a step`: 20 frames at 0 then 20 at 100 give keyframes at frames 0, 19, 20 and 39.
  - `gives a flat component linear handles`: a `[x, y]` track where x moves and y stays at 5 gives finite handles, y's handles `x:1/3,y:1/3` and `x:2/3,y:2/3`, and no `NaN` anywhere (`JSON.stringify` contains no `null`).
  - `treats float noise as flat`: a track that is constant at 100 except for `+1e-13` on its last frame, under tolerance `0.01`, gives 2 keyframes with exactly linear handles (`y` `1/3` and `2/3`).
  - `keeps every handle inside the range`: on the thrown-ball and step tracks, every `o.y` and `i.y` lies in `[-1, 2]`, and with `handleRange: [0, 1]` every one lies in `[0, 1]` and `roundTrip` still passes.
  - `handles two and three frame tracks`: `[[0],[1]]` gives 2 keyframes; `[[0],[5],[1]]` passes `roundTrip`.
  - `copies samples into keyframes`: every keyframe's `s` is reference-equal in value (`toBe` per component) to `values[t]`.
  - `is deterministic`: two calls on the same 300-frame physics-like track give `JSON.stringify`-equal output.
  - `pins the tolerance table`: `LOTTIE_FIT_TOLERANCE` deep-equals `{ position: 0.01, scale: 0.01, rotation: 0.01, opacity: 0.1, color: 0.49 / 255 }`.
  - `stays inside the encoding budget`: 66 tracks of 720 frames each, half piecewise cubic with 2 s segments and half a deterministic pseudo-random walk (a fixed linear congruential generator, seed 1), fit in under 2000 ms measured with `performance.now()`. Log the measured time.
  - `writes the final keyframe bare unless asked`: with `finalHandles: false`, the last keyframe has no `i` or `o`; with `true` it has linear ones.
  - `puts both handles on the segment's first keyframe`: for a two-keyframe easeOut fit, keyframe 0 carries `o` and `i`, and keyframe 1 carries neither (spec F6).

- [ ] **Step 3: Run them and see them fail.** `npx vitest run src/compiler/export/lottieFit.test.ts src/compiler/export/lottieEvaluate.test.ts`. Expected: fail on missing modules.

- [ ] **Step 4: Implement `lottieEvaluate.ts`, then `lottieFit.ts`.** The fitter extends each run one frame at a time from its start (spec F5) and stops at the first frame that fails. For a run from frame `a` to `b` with `n = b − a`, sample `j` sits at `u = (j − a) / n`. Per component, solve for the two inner Bernstein control values `c1`, `c2` by least squares over the interior samples with the endpoints fixed at `values[a]` and `values[b]`. With exactly one interior sample, use the quadratic through the three points, raised to a cubic. With none, use linear. A component whose end samples differ by no more than the tolerance is flat: it gets linear handles (`y` `1/3` and `2/3`), and its interior samples must lie within tolerance of the straight line between its two end samples. Otherwise normalise: `y1 = (c1 − v0) / (v1 − v0)`, `y2 = (c2 − v0) / (v1 − v0)`. **The run fits** only when every normalised handle lies in `options.handleRange` and the curve rebuilt from the normalised handles (the numbers that will be written) reproduces every interior sample within tolerance. Handles are `o = {x: d copies of 1/3, y: [y1…]}` and `i = {x: d copies of 2/3, y: [y2…]}`. Keep the per-step cost bounded so the budget test passes. Running sums of the powers of `j` make each least-squares solve O(1) per component; the error check stays O(run).

- [ ] **Step 5: Extend the boundary guard.** In `exportBoundary.test.ts`, import `./lottieFit.ts?raw` and `./lottieEvaluate.ts?raw`, and assert `importsModule(src, "pixi\\.js")`, `"sceneIR"` and `"harfbuzzjs"` are all `false` for each, beside the existing `lottieEncode.ts` case.

- [ ] **Step 6: Run the tests until they pass**, then the four repository checks.

- [ ] **Step 7: Commit:** `feat(lottie): fit per-frame tracks into cubic keyframe runs`.

### Task 3: The encoder writes fitted keyframes

**Files:**
- Modify: `src/compiler/export/lottieEncode.ts`
- Modify: `src/compiler/export/lottieEncode.test.ts`, `lottieRoundTrip.test.ts`, `lottieTransformCompose.test.ts`, `lottiePipeline.afterBuild.test.ts` (wherever they read keyframes by index or `ks.p` as a combined vector)
- Create: `src/compiler/export/lottieFitted.test.ts` (canonical-scene round trip and keyframe ceilings)
- Modify: `docs/architecture/renderer.md` (Lottie section), `docs/specs/2026-09-11-marey-phase-5a-baked-lottie-design.md` (dated note under §7.1), `docs/specs/2026-11-06-marey-lottie-keyframe-recovery-design.md` (status line), `README.md` (one sentence in the export section)

**Interfaces:**
- Consumes: `fitKeyframes`, `LOTTIE_FIT_TOLERANCE`, `FittedKeyframe` (Task 2); `evaluateProperty` (Task 2, tests only); Task 1's three layout answers.
- Produces: `LottieKeyframe` gains optional `i`/`o` (the last keyframe). `LottieTransform.p` becomes `LottieVectorProperty | LottieSplitPosition`, with `export interface LottieSplitPosition { readonly s: true; readonly x: LottieScalarProperty; readonly y: LottieScalarProperty }`.

- [ ] **Step 1: Rewrite the tests that encode §7.1.** In `lottieEncode.test.ts`:
  - "gives every keyframe explicit linear easing handles" becomes **`writes a linear ramp as two keyframes with linear handles`**: x going 0, 1, 2 over three frames gives `ks.p.s === true`, `ks.p.x.k` of length 2 at `t` 0 and 2, the first with `o {x:[1/3], y:[1/3]}`, `i {x:[2/3], y:[2/3]}`, and `ks.p.y` static.
  - The collapse tests keep their meaning on the new shape. A static position stays `{a: 0, k: [x, y]}`, and a moving one reads `ks.p.x`/`ks.p.y`. "does not collapse a track whose first and last frames agree" still asserts motion survives: x `7, 99, 7` keeps `ks.p.x.a === 1`, and its evaluated value at frame 1 is 99.
  - `rotation`, `scale`, `opacity` and colour assertions that index `k[1]` instead evaluate with `evaluateProperty(prop, 1)`.
  - Add **`uses the per-channel tolerance`**: a rotation track within 0.004 degrees of a straight line over 30 frames gives 2 keyframes, and one 0.02 degrees off gives more than 2.
  - Add **`keeps keyframe values exact`**: every keyframe `s` in an encoded fixture equals the snapshot-derived value for its frame with `toBe`.

- [ ] **Step 2: Write `lottieFitted.test.ts`.** For each headless canonical scene (`eval/scenes-3b/*.marey` through `import.meta.glob`, plus `src/examples/physics-pile.marey`, `ledges.marey` and `dusk-hills.marey`; scenes with `text` need a canvas, so skip them by name and list the skipped ones in a comment), run compile → plan → build → sample → encode at 30 fps as `lottieRoundTrip.test.ts` does, then:
  - `every sampled frame round-trips within tolerance`: for every layer and every frame, `evaluateProperty` on `p`, `s`, `r`, `o` and each fill or stroke colour matches the per-frame value (computed the way the encoder computes it, from the snapshots) within that channel's tolerance;
  - `keyframe counts stay under their ceilings`: total keyframes per scene ≤ a pinned ceiling. Set each ceiling to the count measured when the test is first written, and record the measured value in the test's comment.

- [ ] **Step 3: Run them and see them fail** against the per-frame encoder.

- [ ] **Step 4: Change `lottieEncode.ts`.** `track(values, tolerance)` and `scalarTrack(values, tolerance)` keep the exact constant-track collapse (spec §3), and otherwise emit `{a: 1, k: fitKeyframes(…)}`. Position becomes a `LottieSplitPosition` when either coordinate varies, each axis through `scalarTrack` with `LOTTIE_FIT_TOLERANCE.position`. A fully static position stays combined. Scale uses `.scale`, rotation `.rotation`, opacity `.opacity`, and fill and stroke colours `.color`. Apply Task 1's layout answers: a failed split-position answer means combined position, fitted as a vector; a failed per-component answer means the fitter shares one easing across components. If either fallback is needed, add a `sharedEasing` option to `fitKeyframes` in this task, with its own tests. Update the module's header comment: it currently documents §7.1, so replace that account with the fitted encoding and a pointer to the spec, and keep the §11 measurements that still hold.

- [ ] **Step 5: Run every Lottie test and the four repository checks.** Expected: all pass. Report the keyframe ceilings measured.

- [ ] **Step 6: Documentation.** In `renderer.md`'s Lottie section, add a "Fitted keyframes" subsection covering: where the fitter sits and its import rule; the tolerance table; separated position; exact keyframe values; the handle bound; the final-keyframe form; and the round-trip test. Under Phase 5A design §7.1, add a dated note: "Superseded 2026-11-13 by `2026-11-13-marey-lottie-fitted-keyframes-design.md`." Change the proposal's status line to "Accepted 2026-11-13; designed in `2026-11-13-marey-lottie-fitted-keyframes-design.md`." In the README's export section, add one sentence: Lottie files carry a few keyframes per motion with real easing curves, so they can be retimed in a Lottie editor. The README's fences stay `marey`, `text` or `bash`.

- [ ] **Step 7: Commit:** `feat(lottie): export fitted keyframes with cubic easing and separated position`.

### Task 4: Evidence after the change

**Files:**
- Modify: `eval/RESULTS-LOTTIE-FITTED.md` (sections 3 to 7)
- Modify: `docs/architecture/roadmap-and-process.md` (the "Proposed, not scheduled" bullet becomes a status bullet)

**Interfaces:**
- Consumes: Task 1's commands and baseline numbers, run again on this branch's head.

- [ ] **Step 1: Re-run Task 1 Step 4's measurements** on the head commit with the same commands, scenes, frames and renderers. Record both tables beside the baseline. Acceptance (spec §6.2): on every compared frame, the fitted maximum delta is at most the per-frame maximum plus 2. If a row misses it, stop and report it rather than loosening anything.

- [ ] **Step 2: Fractional frames.** Export `lottie-ease-out.marey` at 30 fps, and sample the rectangle's left edge in lottie-web at frames `10, 10.5, 11, 30, 30.5, 31`. Record the edge x at each and confirm it is monotonic.

- [ ] **Step 3: An editor.** Try to install Glaxnimate (`winget install --id Glaxnimate.Glaxnimate` or the portable build from its official site). If it runs, open the fitted `lottie-ease-out.json`. Record its keyframe count, the keyframe times, and whether the easing handle is shown and can be dragged (a screenshot read back, or Glaxnimate's own export of the file inspected). If it cannot be run, write that plainly and claim nothing about editors.

- [ ] **Step 4: Determinism.** `npm run check:export` passes. Record its summary line.

- [ ] **Step 5: Write the results file's remaining sections**:
  - "3. After: real players";
  - "4. After: size and keyframes", with the proposal's §1 table re-measured beside the old numbers, and the gzip column;
  - "5. Fractional frames";
  - "6. Editor";
  - "7. Hashes", which says that Lottie `sha256` values in earlier results files describe the per-frame encoding, so a re-export no longer matches them.

- [ ] **Step 6: Status bullet.** In `roadmap-and-process.md`, replace the "Proposed, not scheduled — Lottie keyframe recovery" bullet with a status bullet that names the design, the plan and the results file, and gives the measured Dusk Hills keyframe count before and after.

- [ ] **Step 7: Commit:** `docs(lottie): record fitted-keyframe evidence in real players`.
