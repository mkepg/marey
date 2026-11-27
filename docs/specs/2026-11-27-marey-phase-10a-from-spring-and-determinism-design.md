# Phase 10A — `from`, spring easing, portable trigonometry and the Phase 8 follow-ups

Status: design, 2026-11-27. Past the finish line, like Phase 9 (roadmap §13).

## 0. Where this sits

On 2026-11-27 the owner asked for the rest of roadmap §13 to be built, with
no questions and every decision delegated. It is split into four sub-phases,
each with its own spec, plan, branch, review and merge:

| Sub-phase | Scope | §13 group |
|---|---|---|
| **10A** (this document) | `from` on `animate`, spring easing, portable trigonometry, Phase 8 follow-ups | Language and motion |
| 10B | Layout primitives, after measuring whether the corpora justify them (R11) | Language and motion |
| 10C | Derived artifacts: reduced-motion variant, text description, locale variants, text metrics | Derived artifacts |
| 10D | A second, non-browser runtime | Other runtimes |

10A goes first because 10C's reduced-motion rewrite and 10D's runtime both
consume the easing set. Fixing that set before them means each is built once.

Every decision below was made under the owner's delegation, and is marked
**(call)** where a reasonable implementation could have chosen otherwise.

## 1. Intent

Three gaps an author hits today:

1. **No `from`.** An animation always starts from the object's current value.
   A staggered fade-in therefore needs `opacity: 0` on the object and an
   `animate { to: 1 }`. That puts the object's resting look in the wrong place:
   reading the shape, it looks invisible. Every competitor has a start value
   (CSS keyframes `from`, GSAP `fromTo`, Lottie's first keyframe).
2. **No spring.** The easing set is `linear`, `easeIn`, `easeOut` and
   `easeInOut`. Motion-graphics work leans on overshoot and settle, and today
   that means two or three hand-tuned sequence steps.
3. **Trigonometry differs between engines.** Phase 4 measured
   `radial-dots.marey` hashing differently in Node and Chromium. The cause was
   `Math.sin`, which ECMA-262 lets each engine approximate. A spring needs
   `exp` and `cos`, so adding one through `Math` would widen that gap to every
   spring scene. 10D's C runtime would then be unable to match the browser
   bit for bit.

The Phase 8 follow-ups are recorded in `eval/RESULTS-PHASE-8.md`, "What this
does not show", and in the open follow-ups of `roadmap-and-process.md`:

- a `spin` / `lockRotation` pair split across sibling physics blocks in one
  `parallel`;
- no diagnostic for two physics blocks in one `parallel`;
- a frame-hash corpus that leaves out `eval/scenes`, `eval/scenes-r2`,
  `site/gallery`, `examples/starter` and every scene added after Phase 8.

## 2. Goals, non-goals, anti-goals

**Goals**

- G1. `from` on `animate`, for every animatable property, validated exactly
  like `to`.
- G2. `easing: spring`, with a `bounce` property tuning overshoot. It must end
  exactly on `to` at exactly `duration`, so sequence scheduling, `handoff`
  ordering and export stay tick-exact.
- G3. A portable math module (`src/compiler/detMath.ts`). It computes `sin` and
  `cos` in degrees, and `exp`, with IEEE-754 `+ - * /` and exact range
  reduction only, never `Math.sin`, `Math.cos` or `Math.exp`. Parse-time
  `sin` and `cos` and the spring curve use it.
- G4. `radial-dots.marey` hashes identically in Node and in Playwright's
  Chromium. Every scene without physics should then hash the same across
  engines, because no other engine-approximated function reaches simulation
  state outside Matter.js.
- G5. One diagnostic for two physics blocks in one `parallel`. It closes the
  split `spin` / `lockRotation` case too, which can then no longer be written.
- G6. A frame-hash table covering every first-party `.marey` file. A file
  missing from the table fails the test, so nothing added later goes silently
  uncompared.

**Non-goals**

- Spring physics driven by velocity. The spring here is an easing curve over
  a fixed duration, not a simulated body.
- Making Matter.js itself portable. Its internal `Math.cos` and `Math.sin`
  stay, so physics scenes with rotation keep their engine dependence. The
  claim in G4 is scoped to say so.
- Text-scene hashes. They still need a DOM (`sceneFrameHashes.test.ts`). 10C
  revisits this once headless text metrics exist.
- Any easing beyond `spring`. A `cubicBezier(...)` easing was considered and
  left out (§4).

**Anti-goals** (failure even if it works)

- A spring that runs past `duration`, or stops short of `to` and snaps. Either
  breaks the tick-exact scheduling every output relies on.
- Any change to an existing scene's frames from `from` or `spring` alone. Only
  G3 may move existing hashes, and only in scenes that call `sin` or `cos`
  (§6.4).
- A new determinism claim the evidence does not measure.

## 3. Design

### 3.1 `from`

```marey
circle dot {
  position: (200, 300)
  animate { property: alpha, from: 0, to: 1, duration: 0.6, delay: 0.2 }
}
```

- **Contract.** `from` is an optional `animate` property with the same kinds as
  `to` (`number`, `point`, `color`) and no default. In the IR it is
  `from: number | IRPoint | IRColor | null`, `null` when absent. Every
  validation that applies to `to` applies to `from` under the same codes:
  property/kind agreement, negative scale (`TYPE_INVALID_SCALE`), zero scale
  on a physics object (`TYPE_ZERO_SCALE_PHYSICS`), colour on a kind that
  cannot change colour, and so on. **Do instead:** route both through one
  function, so the two lists cannot drift (engineering-lessons §5).
- **When it applies (call).** `from` is written to the object **when the
  animation is scheduled**, and held through its `delay`. A top-level
  animation, or one inside a top-level `parallel`, is scheduled at tick 0.
  One inside a `sequence` is scheduled when its step begins.
  - Why: the use that motivates `from` is a staggered reveal. If the object
    showed its resting value during the delay, then jumped to `from` when the
    delay ended, a fade-in would flash. CSS has the same rule
    (`animation-fill-mode: backwards`).
  - Before scheduling, a sequence step's `from` has no effect. An object
    therefore never shows a later step's start value at tick 0.
  - **Amended 2026-11-27: a first step's `from` is shown at tick 0.** As
    first written, the rule above also covered a sequence's first step,
    which is scheduled at the end of the first tick. A sequence opening with
    `animate { property: alpha, from: 0, to: 1 }` then showed the object at
    its resting value at frame 0: every export's first frame and the paused
    player. Nothing precedes a first step, so writing its `from` at tick 0
    overwrites nothing earlier. The runtime now writes the first step's
    `from` values when the sequence runner is created, for an `animate`
    step and for every `animate` in a `parallel` step, and a first step's
    `delay` holds `from` from tick 0, as for a top-level animation. The step
    is still scheduled at the end of the first tick, so the one-tick delay
    of its motion is unchanged; only the first frame's value changes. When
    the object also has top-level `animate` or `physics` blocks, the
    sequence waits for them, so its first step is preceded and is treated
    like any later step: its `from` waits until it is scheduled. A later
    step's `from` still never shows at tick 0.
- **The start value.** With `from`, the runner's start value is `from`, not
  the current value. A `loop` restarts at `from`. A `yoyo` returns to `from`.
- **Position and physics.** A `from` on `position` holds the object at `from`
  through the delay, under the same `POS_ANIM` pin the animation already
  takes. A body never simulates from a position it was never drawn at.
- **Two animations on one property.** Every existing rule for concurrent
  animations of one property applies unchanged. `from` adds no new conflict
  case, so the validator needs no new code for it. Confirm by reading the
  existing rule.

### 3.2 `easing: spring` and `bounce`

```marey
animate { property: scale, from: 0.4, to: 1, duration: 0.8, easing: spring, bounce: 0.35 }
```

- **Contract.** `EASING_VALUES` gains `spring`. `animate` gains `bounce`, a
  number in `[0, 0.9]` with default `0.25`. In the IR, `IRAnimation.bounce`
  is always present, defaulted, so the IR stays total.
  - Why the name: SwiftUI's duration-based spring uses it, `.spring(duration:,
    bounce:)`, and it reads well next to `duration`.
  - It shares a name with `physics { bounce }` but sits in another block. The
    contract is per block (`languageContract.ts`), so nothing collides.
- **Diagnostics.**
  - `TYPE_BOUNCE_WITHOUT_SPRING`: `bounce` written with any other easing.
    Its message names the easing actually in effect, including the default
    `easeInOut`.
  - `TYPE_HANDOFF_SPRING`: `handoff: true` with `easing: spring`. A spring
    settles at rest, so it has no momentum to hand over. Phase 6C's handoff
    rule replaces a curve that arrives at rest with a moving one, and an
    oscillating curve has no such replacement. The message says so and
    suggests `easeOut`.
- **The curve (call).** For linear progress `t` in `[0, 1]`, damping
  `ζ = 1 − bounce` and settle tolerance `ε = 1e-4`:
  - `ζ = 1` (critically damped):
    `y(t) = 1 − e^(−ωt)·(1 + ωt)`, with `ω` chosen so that
    `e^(−ω)(1 + ω) = ε`.
  - `ζ < 1` (underdamped):
    `y(t) = 1 − e^(−ζωt)·(cos(ω_d t) + (ζω/ω_d)·sin(ω_d t))`, where
    `ω_d = ω·√(1 − ζ²)` and `ω` is chosen so that the envelope
    `e^(−ζω)/√(1 − ζ²)` equals `ε`.
  - `evaluateEasing` already returns exactly `1` at `t ≥ 1`. Because the
    residual at `t = 1` is at most `ε` of the travel by construction, the
    snap is at most 0.05 px on a 500 px move.
  - The duration is therefore when the spring has **settled**. Marey needs a
    finite end tick for sequence scheduling. SwiftUI's "perceptual duration"
    does not have one.
  - Compute `ω` once per `bounce` value, with a fixed-iteration solve (bisection
    or Newton, a fixed count, no data-dependent exit) that uses only `detMath`.
    That way the value is portable too.
  - `bounce` is capped at `0.9` (ζ ≥ 0.1). At 0.9 the curve swings about 11
    times inside its duration. Beyond that it reads as vibration, not
    overshoot.
- **Where it lives.** In `easing.ts`, beside the other curves, through
  `detMath`. `easing.ts` must still import nothing from `pixi.js`.
- **Overshoot and the protected ranges (amended 2026-11-27, after the
  design review of Task 6).**
  A spring's value goes past `to`. At `bounce: 0.9`, `y` reaches about
  1.73. So a scale spring toward a small target can go negative, and
  `alpha` can leave `[0, 1]`. The validator only sees the authored
  endpoints. **(call)**
  - **Clamp at runtime, for spring only.** A spring runner's value is
    clamped: `scale` to `≥ 0` on each component, and `alpha` to `[0, 1]`.
    The clamp is limited to spring because `animate` does not range-check
    alpha endpoints, so `to: 1.5` compiles. Clamping every easing would
    change such a scene's output. That range check is filed separately.
    Overshoot toward a near-zero target is lost, which is acceptable for a
    property the language already forbids below zero.
  - **New diagnostic `TYPE_SPRING_SCALE_PHYSICS`.** It fires for
    `easing: spring` on `property: scale` on an object that takes part in
    physics, using the same participation test as `TYPE_ZERO_SCALE_PHYSICS`.
    A collider swinging through zero is the hazard that rule already
    guards against.
- **Yoyo.** The return leg plays the same curve on reversed progress, as every
  easing already does. The oscillation then sits at the far end of the return
  leg. That is consistent, if odd-looking, and the language reference says so
  in one sentence.
- **Export.** PNG, APNG, video and the player sample runtime state, so they
  need no change. Lottie fitting (`lottieFit.ts`) fits sampled tracks, so a
  spring becomes more keyframes, not a new code path. The spec requires a
  spring scene to pass the existing fitted-Lottie tolerance test, and its
  keyframe count is recorded in the evidence.

### 3.3 `detMath`

- `src/compiler/detMath.ts` exports `sinDeg(d)`, `cosDeg(d)` and `exp(x)`,
  and `sinRad` and `cosRad` if the spring needs them.
- **Algorithm.** Exact argument reduction, then fixed-degree polynomials
  evaluated with `+ - * /` only:
  - Degrees reduce through `%`. ECMA-262's `%` on doubles is exact.
  - Then fold by quadrant and octant symmetry into `[0°, 45°]`, so `sin(30)`
    can come out at exactly `0.5`, and convert with a single multiply.
  - **Amended 2026-11-27: the conversion is not a single multiply.** One
    rounded `d * (pi/180)` gives `sin(30) = 0.49999999999999994`, and
    without the pi/180 tail `sin(45)` comes out one ulp below the double
    nearest `sqrt(1/2)`. `detMath.ts`
    instead forms the radian angle as a head and a tail: Dekker's exact
    product of `d` (Veltkamp-split with `2^27 + 1`) and `DEG_TO_RAD`, the
    double nearest pi/180 split into `DEG_TO_RAD_HI + DEG_TO_RAD_LO`, plus
    `d * DEG_TO_RAD_TAIL`, the rounding error of `DEG_TO_RAD` against
    pi/180. The kernels take the low part as their tail argument.
    `firstOctant`'s comment records why each of `sin(30)` and `sin(45)`
    needs it.
  - `exp` reduces by `ln 2`, splitting the constant in two (Cody–Waite) so the
    reduction is exact, and scales by a power of two built exactly.
- **No fused multiply-add.** JavaScript never fuses `a * b + c`. 10D's C port
  must compile with `-ffp-contract=off`, which this file's header states.
- **Accuracy.** Within 1 ulp of the correctly rounded result is the aim.
  Within 2 ulp is required, measured against a high-precision reference over
  a dense sweep in a test. The cardinal angles stay exact, as `sinDegrees`
  guarantees today.
- **Call sites.**
  - `parseExpr.ts`'s `sinDegrees`. Its docstring moves to `detMath`.
  - The spring curve.
  - Nothing else in 10A. `transform.ts`'s physics-seam trigonometry stays on
    `Math` because Matter.js rotates the same bodies with `Math` regardless,
    so changing it would move hashes and buy no portability.

### 3.4 One physics block per `parallel`

`TYPE_PARALLEL_ONE_PHYSICS`: a `parallel` holding more than one `physics`
block for its object.

- Today the runtime keeps the last block (`sceneRuntime.ts`'s `spawnPhysics`
  comment), so this is a silent drop. Engineering-lessons §7 says fix it, not
  defer it.
- The diagnostic sits on the second and later blocks.
- With it in place, the split `spin` / `lockRotation` case in
  `RESULTS-PHASE-8.md` can no longer be written. That needs a test, not an
  argument: the fixture from that note must now fail with the new code.
- Run `marey check` over every first-party file before landing it. If any
  file uses two physics blocks in one `parallel`, migrate it and record the
  migration.
- The comment in `spawnPhysics` that describes last-block-wins is updated to
  say the case is now rejected upstream.

### 3.5 The frame-hash corpus

`sceneFrameHashes.test.ts` grows to every first-party `.marey` file
(`git ls-files '*.marey'`, through `import.meta.glob` as today).

- Each entry in the table is a hash, `"text"` (skipped because it needs a DOM)
  or `"error"` (an intentional error sample that must fail to compile).
- **A file on disk with no entry fails the test**, and so does an entry with
  no file. Adding a scene forces a decision.
- The new entries are recorded **before** any production change in this phase
  (the Phase 8 E3 discipline), in their own commit.

## 4. Approaches considered

| Approach | Trade-off | Taken? |
|---|---|---|
| Spring as a duration-based easing curve with `bounce` (this design) | Fits every output and the tick-exact scheduler unchanged. Less physically "true" than a velocity-driven spring. | **Yes** |
| A velocity-driven spring simulated per tick, ending when it settles | Natural interruptions, but the end tick depends on the data, which breaks `sequence` scheduling and the deterministic duration. | No |
| `cubicBezier(x1, y1, x2, y2)` easing | General, maps straight to Lottie and CSS. But it needs function-call values in a property position, a new syntax class for one property, and it cannot overshoot-and-settle more than once, which is the reason to want a spring. Recorded for later. | No |
| Spring through `Math.exp` and `Math.cos` | Shorter, but widens the Phase 4 cross-engine divergence to every spring scene, and 10D could not match it. | No |
| `from` applied only once the delay ends | Simpler runner, but flashes on every staggered reveal. | No |

## 5. Constraints

- Every repository rule in `AGENTS.md`. Branch `phase-10a`, merged to `main`
  with a merge commit, pushed, branch deleted.
- The determinism snapshot (`determinism.test.ts`) gains exactly the new
  defaulted IR fields (`from: null`, `bounce: 0.25`). Its trig case may also
  move folded `sin`/`cos` literals in their last digits when `detMath` lands
  (§3.3). Nothing else changes. Each diff is checked line by line, and every
  moved literal is listed in the evidence.
- `docs/LANGUAGE.md` documents `from`, `spring`, `bounce` and the new
  diagnostics. Its examples compile under `languageDocs.test.ts`. The site
  reference regenerates from it.
- The site's animation lesson (the one covering easing in `site/learn`)
  gains `from` and `spring` with one live sample each. One gallery entry
  shows both. `site-check.mjs` passes.
- Version notes on the site read "0.8.0 or later". `package.json` moves to
  `0.8.0` once, at the end of 10D, and the owner publishes.
- Run the shell from `C:\…` with a capital drive letter (engineering-lessons
  §6).

## 6. Exit evidence (`eval/RESULTS-PHASE-10A.md`)

1. `from` and `spring` reach every output. One scene using both exports to
   PNG, APNG, WebM, MP4 and Lottie.
   - The Lottie file passes the fitted tolerance test, with its keyframe count
     recorded.
   - The player's frame hash equals `marey export`'s (the 9A harness).
2. Spring end-exactness: for `bounce` in {0, 0.25, 0.5, 0.9}, the value at the
   last tick equals what every other easing ends on. That is the same lerp at
   progress 1, `from + (to − from)`, which can differ from `to` in its last
   bit, as it does today for every easing. The largest step at `t = 1` is at most `ε` of
   the travel.
3. `detMath` accuracy: the sweep's maximum ulp error for each function, with
   the reference named.
4. Cross-engine hashes:
   - `radial-dots.marey` hashes the same in Node and Chromium after this
     phase. Before it the two differed; record both hashes.
   - Every non-physics, non-text scene matches across the two engines.
5. Hash movement: for every scene whose hash moved, the reason (it calls
   `sin` or `cos`). Every other hash unchanged.
6. Each new diagnostic pinned by a test that fails when its rule is deleted,
   with the failure output recorded.
7. The four checks in `AGENTS.md`, `check:export`, `check:pack` and
   `site-check.mjs`, with their output.

## 7. Left to implementation

- Exact polynomial degrees and coefficients, and whether to use a minimax or
  a Taylor fit, provided §3.3's accuracy bound is met and measured.
- How `ω(bounce)` is cached, provided the solve is fixed-iteration and
  portable.
- Gallery entry design and naming.

## 8. Process note

No separate review of this document was held before planning: the owner
delegated every decision, so its open questions had no one else to go to.
The plan's scan against current source and the review of each task stand in
for it.
