# Rigid-Body Physics and the Deterministic Clock

**Date:** 2026-08-26
**Status:** Approved design. Phase 0 implemented and merged; Phase 1 in progress.
**Supersedes:** `physics-upgrade-plan-custom.txt`, `physics-upgrade-plan-matter.txt`

---

## 1. Context

Declare compiles a declarative scene DSL to a PixiJS scene graph. Physics today is
`NativePhysicsEngine` in `src/compiler/renderer/adapter.ts`: per-object trajectory
integration with bounds collision. Objects do not see each other.

Two prior plans proposed replacing this with rigid-body simulation — one custom-built,
one on Matter.js. Both were written assuming Declare is a **simulation** language. This
design records a decision that it is a **motion-graphics** language, and re-scopes the
work accordingly.

### 1.1 Direction

Declare is a small, readable, diffable text format for declarative 2D motion, sitting in
a gap the existing tools leave open:

- **GSAP** is a JS library you call, not a format you write. No macro system, no physics.
- **Lottie** is a format, but machine-generated from After Effects and not hand-writable.
- **Rive** is the closest product, but GUI-authored and proprietary.

Declare's `template`/`use`/`generate` layer over a diffable text file is a real position
between them. Physics is valuable here as a source of *believable motion*, not as
simulation fidelity.

### 1.2 What this changes about the prior plans

Roughly a third of their content survives. Body-to-body collision, impact-driven
rotation, compound groups, and settling are high-value. The property list is mostly
simulation-authoring knobs and is cut. And both plans omit the one requirement motion
graphics imposes that simulation does not: **determinism**, without which export is
impossible.

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Matter.js via npm, added to `package.json` | Every needed feature maps 1:1 to an existing API. Currently present in `node_modules` but recorded in neither `package.json` nor the lockfile — it would vanish on `npm ci`. |
| D2 | Best-effort continuity; breaking existing scene behavior is acceptable | No test suite exists; chasing parity against a solver we do not control would cost more than the feature. |
| D3 | Frame-indexed clock at 120Hz, converted before the engine swap | Behavior-preserving, so it has a verifiable oracle. Also avoids re-tuning scenes twice. |
| D4 | `duration` expiry freezes the body in place, still collidable | Settled objects become scenery for later ones — a choreography tool. Freeze is reversible. |
| D5 | Freeze always fires at expiry, including mid-air | Simplest rule, no new syntax. Revisit with an explicit end-behavior property only if it proves wrong. |
| D6 | Kinematic bodies are static but **not** sensors | An animated object flying in should knock a pile over. Both prior plans specified sensors, making animated objects ghosts. |
| D7 | `animate scale` rescales the body during sync via `Body.scale` | Keeps Phase 1 renderer-only and supports a legitimate shot. |
| D8 | `animate rotation` pins the angle; physics does not integrate it | Consistent with how position already behaves. |
| D9 | Physics module must not import from `pixi.js` | Enables headless snapshot tests in Node for the phase with the weakest verification. |
| D10 | Export is designed for, not built yet | Phase 1 must satisfy export's constraints; the exporter itself is Phase 5. |
| D11 | Renames of existing properties break old share links; no aliases | Deliberate, accepted at v0.3.x. Keeps the parser free of legacy spellings. |
| D12 | Mass is left to Matter's area × density default | A motion designer thinks "heavy," not "500kg." |
| D13 | A body exists only for an object that declares `physics` — directly or inside a `sequence` | Physicality stays visible in the diff, which is the whole position in §1.1. The alternative makes a bare `rectangle` a silent collider with no opt-out, since §3 cut collision filtering as syntax. Revisited in Phase 4 (§9). |
| D14 | Declare's per-body gravity is injected as a velocity delta, and the sleeping pass is driven manually | `Sleeping.update` force-wakes any body carrying a force, and runs *before* gravity inside `Engine.update`. Applying gravity as `body.force` therefore stops anything ever sleeping, which removes both §6.7's frozen-vs-asleep distinction and §6.9's idle detection. See §6.4. |
| D15 | The centroid-vs-bbox-centre offset lands in Phase 1, not Phase 2 | §7's rationale — "zero for every symmetric shape" — does not hold for `polygon`, and Phase 1 is the first time physics rotates anything. Without it a tumbling triangle renders visibly off its own collision shape. |

Corrections D13–D15 were added on 2026-08-26 while scoping Phase 1. D14 and the unit
corrections in §6.3 are defects in the original §6.2, found by reading Matter 0.20.0's
source; they are recorded here rather than silently fixed in code.

---

## 3. Cut list

| Item | Disposition | Reason |
|---|---|---|
| `mass` | Cut | Simulation-authoring knob. Matter derives it from area already. |
| `friction` | Cut | Tuning coefficient; a second 0–1 knob beside `airDrag` invites confusion. |
| Concave decomposition | Cut for now | A convex hull reads identically to a viewer in nearly every real scene. |
| `poly-decomp-es` vendoring | Cut | Follows from the above. Nothing to vendor until a scene needs it. |
| Collision filtering as syntax | Cut | Keep the machinery to implement `collideBounds`; do not expose categories and masks. |
| `isStatic` | Kept, deferred to Phase 4, renamed `lockPosition` | A static ledge objects cascade off is a genuine motion-graphics shot. |
| `angularVelocity` | Kept, deferred to Phase 4, renamed `spin` | Directly expressive; pairs with `velocity`. |
| `lockRotation` | Kept, deferred to Phase 4 | Cheap; now has a matched sibling in `lockPosition`. |

---

## 4. Naming

New properties ship correctly named in Phase 4, so they need no migration. Renames of
existing names land in Phase 3 alongside the property-table unification, which is what
makes them one-place edits instead of four-place ones.

| Current | New | Reason |
|---|---|---|
| `isStatic` | `lockPosition` | The `is` prefix is a JS/Matter convention no other Declare property uses. Pairs with `lockRotation`. |
| `angularVelocity` | `spin` | A third the length; pairs with `velocity` as angular-to-linear. |
| `handOff` | `handoff` | "Handoff" is one word. Every other camelCase property joins two genuine words (`airDrag`, `collideBounds`, `fontSize`). |
| `sceneFit` | `fit` | Inside a `scene` block the prefix is redundant. |
| `z` | `layer` | The only single-letter name in the language. `layer` is the motion-graphics term. |
| `def` | `let` | It is `def name = value`, lexically scoped, immutable, shadowable — exactly `let` semantics. `def` reads as "define a function." |

**Kept deliberately:** `airDrag` (the inversion in `edc6998` made the name correct — the
number now means how much drag), `bounce` (clearer than `restitution`; only its hover doc
needs fixing), `yoyo`, `duration`, `generate`, `template`, `use`, `sequence`, `parallel`.

**Borderline, not changing:** `collideBounds`. "Bounds" is ambiguous between an object's
bounding box and the scene edges, but the rename buys little once `world { bounds: ... }`
exists to pair with it.

**Internal:** `IPhysicsEngine` → `IPhysicsWorld` (it is world-shaped now, not body-shaped);
`__physicsState` → `__body`.

---

## 5. Phase 0 — Deterministic clock

**Renderer-only. Behavior-preserving. Has an oracle.**

### 5.1 Why first

Converting the timeline to frame-indexed time is the same fixed timestep already present
at `adapter.ts:72-78`, counted differently. Existing scenes should look identical
afterward and now replay identically — so unlike every other phase, correctness is
checkable against current behavior. It also lets the Matter swap land as a
single-variable change rather than two entangled timing changes at once.

### 5.2 The reframe

With millisecond accumulators, the substep clamp that prevents a death spiral discards
machine-dependent amounts of time, and determinism leaks. With **frame** accumulators it
does not: dropping frames under load cannot change what frame 300 looks like, only
whether frame 299 is displayed. The state sequence is deterministic; the wall-clock rate
at which it is walked is not. Pacing is irrelevant to export.

### 5.3 Components

```
SceneClock      frame: integer, monotonic
                advance()  →  step physics once, tick every runner once

LiveDriver      accumulator += ticker.deltaMS
                n = min(floor(accumulator / TICK_MS), MAX_CATCHUP)
                repeat n × clock.advance()
                alpha = remainder / TICK_MS
```

`step()` takes no time argument, ever. This is the property that makes an export driver a
different *caller* rather than a different engine.

### 5.4 Tick rate: 120Hz

Chosen by export math — export frame rates must divide the tick rate evenly or every
output frame is an interpolation of two states.

| Tick rate | 24fps | 30fps | 60fps |
|---|---|---|---|
| 60Hz | ✗ 2.5 | ✓ 2 | ✓ 1 |
| **120Hz** | **✓ 5** | **✓ 4** | **✓ 2** |

120Hz also roughly doubles solver accuracy and reduces high-refresh stutter. PAL rates
(25/50fps) still do not divide evenly and would need interpolation at export time — an
accepted limitation.

### 5.5 Work

- `SceneClock` and `LiveDriver`.
- Convert every accumulator in `adapter.ts` to frames: `tickAnim` (`ra.elapsed`),
  `PhysicsRunner` (`pr.elapsed`, `durationMs`), the sequence runner.
- The IR keeps `duration` in seconds. Runners convert at creation:
  `durationFrames = round(duration × 120)`.
- Step `NativePhysicsEngine` from the clock instead of its own accumulator.
- Add a manual render path decoupled from `autoStart` (`adapter.ts:379`) — an export
  constraint, cheap to satisfy now.

### 5.6 Animation interpolation is free

Easing is a pure function of progress, so animations evaluate at fractional frame
(`elapsedFrames + alpha`) with no buffer. Only physics needs a previous-state buffer,
because it is stateful. This falls out of the design rather than costing anything.

### 5.7 Verification

Existing scenes render the same. Re-running a scene produces an identical state sequence.

---

## 6. Phase 1 — Shared world

**Renderer-only. The prize.**

### 6.1 Interface

```
IPhysicsWorld
  addBody(id, geometry, physics)     lifecycle
  removeBody(id)
  pin(id, reason) / unpin(id, reason)   reason-counted; see §6.6
  setTransform(id, x, y, angle)      drives a pinned body
  setVelocity(id, vx, vy)            spawn and handoff, px/s
  setScale(id, sx, sy)               D7
  overrideAngle(id, radians)         post-step angle forcing
  step()                             no time argument
  readState(id, alpha) → {x, y, angle}  interpolated, for sync
  isIdle()
  destroy()
```

Per D9, this module takes plain geometry in and plain transforms out. It must not import
from `pixi.js`, so it stays testable headlessly in Node (§6.10). All conversion between
Declare units and Matter units happens behind this interface — a caller passes px/s and
radians and never sees `_baseDelta`.

Two modules sit above and below it:

| Module | Imports `pixi.js` | Owns |
|---|---|---|
| `renderer/physicsWorld.ts` | no | this interface, the Matter engine, units, walls, sleeping |
| `renderer/physicsSync.ts` | yes | container → geometry, pin bookkeeping, read-back, scale, culling |
| `renderer/adapter.ts` | yes | app, ticker, animation and sequence runners, lifecycle |

`NativePhysicsEngine` and `IPhysicsEngine` are deleted by this phase.

### 6.2 Which objects get a body (D13)

A container gets a body **iff it declares a `physics` block** — either directly, or in any
step of any `sequence` it owns. That is a single predicate over `__physics` and
`__sequences`, evaluated once at collect time.

The body is created at scene start, not when its physics runner spawns, and it lives until
teardown or culling. Creating it early is what satisfies D6: through the `animate` step of
`sequence { animate position …; physics … }` the object is a pinned static body, so it
genuinely shoves a pile on its way in rather than ghosting through.

Objects with only `animate` blocks get no body and stay non-colliding, exactly as today.
The alternative — every visual object becomes a body — is discussed and deferred in §9.

### 6.3 Translation

**These conversions were corrected on 2026-08-26.** The original table was written against
Matter 0.19 semantics. Matter 0.20.0 normalises both velocity and air friction against
`Common._baseDelta = 1000/60`, independently of the delta actually passed to
`Engine.update`, which changes two of the six rows.

Let `r = TICK_MS / Common._baseDelta = 60 / TICK_HZ`, which is `0.5` at 120Hz.

| Declare | Matter 0.20 | Conversion |
|---|---|---|
| `gravity` (per object, px/s²) | velocity delta added once per tick, in the px-per-1/60 s units of the row below | `÷ (TICK_HZ × 60)` = `÷ 7200`. `engine.gravity.scale = 0`; see §6.4 for why this is a velocity delta and not a force. |
| `velocity` (px/s) | `Body.setVelocity`, px per 1/60 s | `÷ 60`. Convert at spawn **and** at handoff. |
| `airDrag` | `frictionAir` | `(1 − (1 − airDrag)^r) / r` |
| `bounce` | `restitution` | Direct. |
| `collideBounds` | `collisionFilter.mask` | Toggles the wall category. |
| mass, `friction` | Matter defaults | Not overridden (D12); `friction` is cut by §3. |

**Velocity is per 1/60 s, not per tick.** `Body.setVelocity` scales its argument by
`body.deltaTime / Body._baseDelta`, so its units do not follow the tick rate. The original
"divide by 120" would launch every object, and every `handOff`, at half speed.

**Air drag carries the same `r` factor.** `Body.update` computes its damping as
`1 − body.frictionAir × (deltaTime / Common._baseDelta)` — that `× 0.5` at 120Hz is what
the original derivation omitted. Matching one second of damping against the old engine's
`(1 − airDrag)^60` gives `1 − fa·r = (1 − airDrag)^r`, hence the formula above; at 120Hz it
reduces to `2 × (1 − √(1 − airDrag))`, exactly twice the original figure. The original
would also make `airDrag: 1.0` unreachable — it yields a half-per-tick decay rather than
the full stop the property promises.

Both are written in terms of `r` rather than hard-coded for 120Hz, so a future tick-rate
change does not silently re-introduce the bug.

One more, easy to miss: **set `body.deltaTime = TICK_MS` at creation.** `Body.create`
defaults it to `1000/60`, so without this the very first tick runs with Matter's time
correction at `0.5`.

### 6.4 Step ordering, gravity, and sleeping (D14)

Declare's gravity is per-block; Matter's is per-world. The obvious translation is to zero
`engine.gravity` and push a per-body force instead. **That silently disables sleeping.**

`Engine.update` runs its phases in this order:

```
Sleeping.update(bodies, delta)        ← force-wakes any body with a non-zero force
Engine._bodiesApplyGravity(...)       ← world gravity is applied here
Engine._bodiesUpdate(...)             ← integrate
…solve…
Engine._bodiesClearForces(bodies)     ← forces zeroed for next time
```

Matter's own gravity is applied *after* the sleeping pass and cleared before the next one,
so at the moment `Sleeping.update` runs, every force buffer is zero. A force we set
ourselves before calling `Engine.update` is still there when the sleeping pass reads it, so
every gravity-affected body is woken on every tick and nothing ever sleeps. That would take
out both §6.7's frozen-vs-asleep distinction and §6.9's idle detection. Matter 0.20 has no
per-body `gravityScale` to fall back on.

The fix is to keep Matter's phase order but supply our own gravity inside it:

```
step()
  Sleeping.update(bodies, TICK_MS)        // engine.enableSleeping is false
  applyPerBodyGravity()                   // awake, non-static bodies only
  Engine.update(engine, TICK_MS)
  applyAngleOverrides()                   // D8
  Sleeping.afterCollisions(engine.pairs.list)
```

Gravity is injected as a velocity delta through `Body.getVelocity`/`setVelocity`, never as
`body.force`, so the sleeping pass never sees a force. `Matter.Sleeping` is a public module,
and `_bodiesUpdate` and every `Resolver` path already honour `body.isSleeping`
independently of `engine.enableSleeping`, so turning the engine's own pass off is safe.

Two accepted approximations:

- The gravity delta is damped by `frictionAir` in the tick it is added, where Matter's force
  path escapes one tick of damping. At `airDrag: 0.006` that shifts terminal velocity by
  about 0.3%.
- `Sleeping.afterCollisions` runs one tick later than it would inside `Engine.update`, so a
  sleeping body struck by another wakes on the following tick. Not observable at 120Hz.

### 6.5 Body geometry

- `circle` → `Bodies.circle`
- `rectangle` → `Bodies.rectangle`
- `polygon` → `Bodies.fromVertices` on vertices we hull ourselves via `Vertices.hull`, so no
  decomposition is needed. Hulling up front rather than relying on Matter's internal
  fallback also avoids its `warnOnce` about the missing `poly-decomp`, which would
  otherwise fire on every concave polygon in every scene.
- `line` → bounding box inflated to at least `thickness`. A line has no area and a
  horizontal or vertical one has a degenerate box. Preserves today's behavior rather than
  silently dropping the object. A validator error replaces this in Phase 3.
- `text` → bounding box from `__baseSize`
- `group` → single body from `getLocalBounds()`. `__baseSize` is `{w: 0, h: 0}` at
  `builder.ts:187` and would produce a zero-area body. Phase 2 replaces this with real
  welded parts.

### 6.6 State machine

Two body states, plus an independent angle override.

| State | Matter integrates | Sync direction |
|---|---|---|
| **Dynamic** | yes | body → container |
| **Pinned** | no (static) | container → body |

*Frozen*, *animating position*, and the future `lockPosition` are all the same Pinned
state entered for different reasons. Pinning is **reason-counted**, generalizing the
existing `__kinematicPosAnimCount` at `adapter.ts:63` — an object can be pinned for two
reasons and releasing one must not release the other.

Because pinned means container → body, a body that freezes while a sibling animation
still runs keeps following that animation. A naive "frozen = don't touch" implementation
would silently drift the collision shape away from the visual.

The three reasons a body is pinned:

| Reason | Added | Removed |
|---|---|---|
| `NO_RUNNER` | at body creation (§6.2) | `spawnPhysics` |
| `POS_ANIM` | `spawnAnim` for `property: position` | on that animation's completion tick |
| `FROZEN` | physics `duration` expiry | `spawnAnim` / `spawnPhysics` (§6.7) |

Pinning is `Body.setStatic(true)`, unpinning `setStatic(false)` followed by an explicit
`setVelocity`, because `setStatic` collapses `positionPrev` onto `position` and so leaves
the body at rest.

`setStatic` also zeroes `restitution` and sets `friction` to 1 on the pinned body. That is
harmless but worth stating, because it looks alarming: Matter combines a contact's
`restitution` with `max` and its `friction` with `min`, so a dynamic partner's `bounce`
still wins against a pinned body and against the walls, which are static for their whole
lives.

**Angle override (D8) is separate.** A rotation animation must own the angle while
position stays dynamic, and Matter has no such mode. Implemented as a post-step override:
after `Engine.update`, force `Body.setAngle` and zero the angular velocity. Phase 4's
`lockRotation` uses the same mechanism.

### 6.7 Freeze semantics (D4, D5)

- On `duration` expiry, add the `FROZEN` pin reason.
- `spawnAnim` (`adapter.ts:261`) and `spawnPhysics` (`adapter.ts:284`) are the only places
  a new runner attaches to a container. Remove `FROZEN` there.
- The sequence runner advances on a subsequent tick, so there is a one-frame frozen gap
  before the next step un-pins. Visually irrelevant; specified so it is not rediscovered.
- **Culling is checked before freeze**, so a `collideBounds: false` body that falls out of
  the scene is removed rather than frozen into an invisible off-screen obstacle.

**Frozen and asleep look identical and behave oppositely.** `duration: 3` at rest is
frozen — static, infinite mass, unmoved by impact. `duration: indefinitely` at rest is
asleep — dynamic, dormant, moves when hit. This is how scenery is distinguished from
props, but it is invisible in the rendered frame, so hover docs must state it loudly.

### 6.8 Determinism work

- Reset Matter's seeded RNG (`Common._seed`) at world creation. It persists across world
  creations in a page session, so re-running without resetting can diverge from a cold
  load. One line, entirely non-obvious.
- Constant delta into `Engine.update`, always. Matter applies a correction factor for
  varying timesteps and degrades under jitter regardless of reproducibility concerns.

**Residual, accepted:** `Math.sin`/`cos`/`pow` are implementation-defined in ECMAScript
and Matter uses trig throughout rotation, so cross-machine results are close but not
guaranteed. Export sidesteps this entirely — the artifact is baked on one machine and is
identical everywhere by construction.

### 6.9 Other work

- Four static wall bodies at logical scene bounds on their own collision category,
  created at render start and destroyed on cleanup.
- `Body.scale` during sync from the per-tick delta ratio (D7).
- Previous-state buffer and `alpha` interpolation for rendered physics positions. This also
  closes the judder deferred out of Phase 0 — see that plan's execution notes.
- **Centroid offset (D15).** `Bodies.fromVertices` places a body's centre of mass at the
  given point, while a Declare container's pivot is its bounding-box centre. Store
  `bboxCentre − centroid` in body-local space and rotate it by `body.angle` on read-back.
  Zero for `circle` and `rectangle`; non-zero for `polygon`, which this phase tumbles.
- Culling of bodies beyond a margin outside the scene, checked before freeze (§6.7).
- Idle means every body asleep or pinned, plus no running animations and no pending
  sequences. This is also a fix: `duration: indefinitely` currently keeps the ticker
  running forever, because its runner never completes.

### 6.10 Verification

Headless snapshot tests in Node, enabled by D9 and D3: run a fixture scene 120 ticks,
snapshot every body's position and angle, diff. No browser, Pixi, or canvas required.
This is available in Phase 1 rather than waiting for Phase 3's harness.

The corrected conversions in §6.3 get direct assertions rather than only snapshots, since
both were wrong in the original spec and a snapshot would have happily frozen the wrong
number:

- One second of `airDrag` damping must match the old engine's `(1 − airDrag)^60` to within
  floating-point tolerance, checked across several `airDrag` values including `1.0`.
- A body given `velocity: (600, 0)` in a vacuum must travel 600px in one second.
- A body under `gravity: (0, 980)` must reach 980 px/s after one second.

Plus: a two-body stack that must not interpenetrate, a re-run equality check on a
100-tick state sequence, and a fixture that falls, settles, sleeps, and is then woken by a
second body — which is the case D14 exists to protect.

### 6.11 Expected behavior change

The default scene has been replaced since this was written; it now lives in
`store/defaultScene.ts` as a motion test card. Two of its objects declare `physics` —
`launcher` (a circle, `duration: indefinitely`) and `stepper` (a rectangle, the last step of
a `sequence`). Under a shared world they can now collide with each other, and `stepper`
will tumble on impact instead of landing flat, since this is the first phase in which
physics rotates anything.

The card's header comment currently reads *"falling objects pass through each other and
land in a heap. That is expected — objects do not yet collide with one another."* That
becomes false and must be rewritten as part of this phase. Per D8, `stepper`'s scheduled
rotation animation completes before its physics step begins, so the two do not fight.

---

## 7. Phase 2 — Compound groups

**Renderer plus one validator rule.**

A `group` carrying a `physics` block welds its children into one body via
`Body.create({ parts })`; child transforms become shape offsets in the group's local
space.

*(The centroid-vs-(0.5, 0.5) offset was originally scheduled here. It moved to Phase 1 as
D15 — the stated reason for deferring it, that it is zero for every symmetric shape, does
not hold for `polygon`, and Phase 1 is where bodies first rotate.)*

Validator rejects `physics` blocks on children of a physics group.

*Ships:* a multi-part logo tumbles as one coherent object instead of exploding.

---

## 8. Phase 3 — Foundations and renames

**Compiler and editor. No new capability.**

`RESERVED_PROPS` at `parseObject.ts:9-15` is a hand-maintained duplicate of `PROP_TYPES`
and **has already drifted** — it still reserves `anchor`, `width`, and `height`, none of
which are real properties (`sceneIR.ts:57` records anchor's removal; rectangles take
`size`). Adding a property today means editing four hand-synced lists: `RESERVED_PROPS`,
`PROP_TYPES`, Monaco hovers in `constants.ts`, and completions in `language.ts`.

- Collapse all four into one table.
- Fix the drift, and the Monaco snippets at `language.ts:383` and `language.ts:423` that
  still insert `airDrag: 0.99` — under the inverted semantics from `edc6998` that is now
  near-total drag, so the snippets teach the opposite of their intent.
- Replace `Math.random()` in `animate` node names (`parseObject.ts:164`) with positional
  naming, as `parallel` already does. A non-deterministic AST forecloses memoization and
  reproducible output.
- Build the golden-file IR snapshot harness.
- Land the existing-name renames from §4. Old share links break (D11).
- Add validator rules: `line` + `physics`; and the handoff/duration ordering bug — nothing
  currently requires a physics block's `duration` to outlast a `handoff` animation, so
  handoff can write velocity into an already-completed runner and silently do nothing.
- Add a body-count ceiling. The compiler caps objects at 15,000; Matter cannot carry that
  many dynamic bodies.
- **Fix the non-completing yoyo.** `advanceAnimTime` reverses at `durationTicks`
  when `yoyo` is set, but on returning to 0 it only restarts if `loop` is also
  set (`timeline.ts:37-43`). A `yoyo: true` without `loop: true` therefore never
  reports completion: the runner is never spliced, so `isIdle()` never becomes
  true and the ticker runs forever, and a `POS_ANIM` pin is never released, so a
  body on the same object stays pinned permanently. The validator already
  rejects this shape inside a `sequence` (`TYPE_SEQ_YOYO`) for exactly this
  reason; the top-level case is unguarded. Found while writing
  `docs/LANGUAGE.md`, which documents the current behaviour and warns against it.
- **Update `docs/LANGUAGE.md` for the renames.** Its examples are compiled by
  `src/compiler/languageDocs.test.ts`, so `def` → `let` and `handOff` →
  `handoff` will break the build until the reference is updated. That is the
  intended mechanism, not an obstacle.

### 8.1 Phase 3b — Macro-layer expressiveness

*Added 2026-08-27. Placed here rather than given its own number because it needs
the parser already open, which is what §8 does. Like §10.1, it is recorded
because this roadmap had no slot for it at all.*

`eval/RESULTS.md` finding 1: the metaprogramming layer **cannot express the cases
that justify it**. `generate` handles "N of the same thing, spaced linearly." It does
not handle data. Three of four data-driven briefs had to be partly hand-unrolled —
precisely the work the layer exists to eliminate:

| Missing | Observed consequence |
|---|---|
| No arrays or indexing | A bar chart over seven literal values could not be looped. Seven `rectangle` blocks were written by hand. **This makes the data-driven use case largely unreachable.** |
| No trigonometry | A radial layout of twelve dots could not be looped. All twelve coordinates were hand-computed. Any radial, circular or wave layout is out of reach. |
| No modulo, no conditionals | "Every fifth tick is longer" needed two overlapping `generate` loops, drawing short ticks underneath long ones. |

**Why this matters more than its size suggests.** §1.1 stakes Declare's whole position
on `template`/`use`/`generate` over a diffable text file being a real gap between GSAP,
Lottie and Rive. A macro layer that cannot iterate data does not differentiate. This is
the roadmap's only item that defends the stated position directly.

**Why it sits with Phase 3 rather than earlier or later.** Phase 3 already reopens the
parser and collapses the four property tables. Adding a literal list to iterate and a
modulo operator is a far smaller change while that work is in pieces than as a separate
excavation. It also lands before Phase 5's export, so exported artifacts can be
data-driven from the start.

**Minimum worth shipping:** a literal list bindable with `def` and iterable by
`generate`, plus modulo. Trig is desirable and strictly larger — decide its inclusion
when this is scoped, not now. Note the parser already accepts a `pointList` value and
`def` can already bind one (`parseDef.ts` restricts nothing); what is missing is any
syntax to read an element out of it, which makes the increment smaller than it looks.

**How it is measured.** Re-run `.eval` and ask whether `radial-dots`, `bar-chart` and
`timeline-ticks` can be written without hand-unrolling. That is the direct test of
finding 1, and unlike compile rate it is not already at ceiling.

---

## 9. Phase 4 — Physics syntax

**Full pipeline. First breaking syntax change.**

- `lockPosition`, `lockRotation`, `spin` — correctly named from day one, no migration.
- `world { gravity, bounds }` so gravity is declared once rather than per object.
- **Revisit D13.** Phase 1 gives a body only to objects that declare `physics`, because
  §3 cut collision filtering and so left no way to say "this label is not a wall." Once
  `lockPosition` and `world { }` exist, an author *can* say it, and the alternative reading
  of D6 — every visual object is a collider — becomes available. It is the better first-run
  experience: draw a ledge, drop a ball, it lands. The competing consideration is that it
  makes physicality invisible in the diff, which is the position §1.1 stakes everything on.
  Decide it here, with the opt-out in hand; widening D13 is compatible, narrowing it later
  would not be.
- **Scene-level duration.** Nominally a syntax feature, actually an export prerequisite:
  `duration: indefinitely` has no end frame, so export has nothing to bound.

---

## 10. Phase 5 — Export

**New subsystem. The adoption unlock.**

Declare currently has no way to get output out — no export, embed, package, or CLI. Other
developers can only view it in the playground. This is arguably a larger barrier than any
feature discussed above.

```
ExportDriver    for f in 0..totalFrames:
                  clock.advance()
                  renderer.render()
                  encoder.encode(f)
```

No wall clock. Frame-accurate by construction, given Phase 0.

- **PNG sequence** first — nearly free once frames render on demand.
- **WebM/MP4 via WebCodecs** plus a muxer. `MediaRecorder` is the tempting shortcut and
  the wrong one: it captures in real time and drops frames under load, discarding the
  determinism Phase 0 bought.
- **Lottie baked keyframes** last, and the strategic target. Physics cannot be *authored*
  as keyframes but can be *baked* into them: run the deterministic sim, record each
  object's position/rotation/scale/opacity per frame, emit Lottie keyframes — exactly the
  properties Lottie expresses. Output plays in every existing Lottie player on web, iOS,
  and Android with no Declare runtime. Lottie has no physics; After Effects only fakes it.
  Reachable only because the simulation is frame-deterministic.

GIF is easy and looks poor. SVG/SMIL cannot carry baked per-frame data at reasonable size.

### 10.1 Phase 5b — Documentation site

*Added 2026-08-27. Placed here rather than given its own number because it is the same
push as §10: this roadmap had no documentation or adoption track at all, which is the
gap being closed.*

The Declare website is today only the playground IDE. It becomes a full documentation
site — tutorials, guides, examples, getting-started — structured along the lines of the
Matter.js site, **https://brm.io/matter-js/**.

**Why it pairs with export rather than standing alone.** §10 opens by observing that no
way to get output out is "arguably a larger barrier than any feature discussed above."
Export and documentation are that same barrier from two sides. A polished site for a tool
whose output cannot leave the playground documents a toy; export that nobody can find how
to use ships a capability into silence. These are the only two items on this roadmap whose
purpose is adoption rather than capability, and neither converts a visitor alone.

**Why not earlier.** Phase 3 renames `def`, `handOff`, `z` and `sceneFit` (§4), and Phase 4
adds `lockPosition`, `lockRotation`, `spin` and `world { }` (§9) — the last planned syntax
break. A site built before both is rewritten after them, and unlike `docs/LANGUAGE.md` it
has no compiled-examples test to make that rewrite a red build rather than a slow rot.

**Why it is cheaper than it looks.** The bulk of the Matter.js site is a live demo gallery.
Declare's share links already carry an entire scene in the URL hash fragment, so a gallery
entry is a link rather than a build artifact. The expensive half is already paid for.

`docs/LANGUAGE.md` — specified in `2026-08-27-language-reference-design.md` and written
before Phase 2 — is expected to survive this as the reference layer beneath the site. The
site supplies the narrative material that reference deliberately excludes.

---

## 11. Phase 6+ — Motion-graphics core and editor payoff

**Language:** finish color animation — currently half-built across three layers
(`IRAnimation.to` admits `IRColor` and `resolveAnimToValue` handles it, but `PROP_TYPES`
rejects color, the validator allows only position/rotation/scale/alpha, and `tickAnim`
has no color branch). Then `stagger`/`delay` and spring easing.

**Editor, unlocked by Phase 0:**

- **Live editing without losing your place.** `autoRun` recompiles on an 800ms debounce
  and restarts from frame 0, so a settle can never be watched while being tuned. With a
  deterministic clock, recompile and replay to the current frame.
- **A scrubber.** Transport controls are close to table stakes for a motion-graphics tool.
  Scrubbing a stateful simulation is normally impossible; with determinism it is
  replay-to-frame-N — the same mechanism, so these are one feature.

---

## 12. Shape and risks

| Phase | Size | Visible | Compiler | Verifiable |
|---|---|---|---|---|
| 0 — Clock | Small | No | No | **Yes — oracle** |
| 1 — Shared world | Large | **Yes** | No | Yes — headless snapshots |
| 2 — Compound groups | Medium | Yes | 1 rule | Partly |
| 3 — Foundations | Medium | No | Yes | Yes |
| 3b — Expressiveness | Medium | **Yes** | Yes | **Yes — the eval tests it directly** |
| 4 — Physics syntax | Medium | Yes | Yes | Yes |
| 5 — Export | Large | Yes | Yes | Yes |
| 5b — Docs site | Medium | **Yes** | No | Partly — links rot silently |

**Phases 0 and 3 ship nothing a user can see**, which makes them the ones most tempting to
skip. Phase 0 is what makes export possible at all; Phase 3 is what stops the four-way
property-table drift from compounding.

**Open risks:**

- Runtime errors have nowhere to go. Compile errors are coded, positioned, and hinted; a
  Matter failure on degenerate geometry surfaces as a console error and a blank preview.
  Physics introduces a class of failures that occur *after* a successful compile.
- Main-thread contention. Compilation runs in a worker; rendering and physics do not. A
  heavy scene simulating during typing will make Monaco stutter. Measure rather than
  discover.
- `IPhysicsWorld` preserves an escape hatch. Rapier (Rust/WASM) offers cross-platform
  determinism Matter structurally cannot — not a reason to revisit D1, but a reason the
  abstraction earns its keep.
- **Matter's private surface.** D14 depends on `Sleeping.update`, `Sleeping.afterCollisions`
  and the phase order inside `Engine.update`; §6.3 depends on `Body._baseDelta` semantics.
  These are stable across 0.20.x but are not the documented API, so the `matter-js`
  dependency should be pinned rather than floated on a caret range, and a version bump needs
  the §6.10 conversion assertions re-run deliberately rather than trusted.
