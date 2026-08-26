# Rigid-Body Physics and the Deterministic Clock

**Date:** 2026-08-26
**Status:** Approved design, not yet implemented
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
  pin(id, reason) / unpin(id, reason)
  overrideAngle(id, radians)         post-step angle forcing
  step()                             no time argument
  readState(id) → {x, y, angle}      for sync
  isIdle()
  destroy()
```

Per D9, this module takes plain geometry in and plain transforms out. It must not import
from `pixi.js`. `adapter.ts` owns all Pixi interaction and all lifecycle.

### 6.2 Translation

| Declare | Matter | Note |
|---|---|---|
| `gravity` (per object, px/s²) | per-body force `F = mass × a` | `engine.gravity.scale = 0`. Matter has one world gravity; Declare's is per-block. |
| `velocity` (px/s) | px/tick | Divide by 120. Convert at spawn **and** at handoff (`adapter.ts:227`). |
| `airDrag` | `frictionAir = 1 - sqrt(1 - airDrag)` | Not 1:1 at 120Hz. `airDrag` is defined per 1/60s (`pow(1 - airDrag, step × 60)` at `adapter.ts:84`), while `frictionAir` applies once per tick. Matching one second of damping gives `(1 - frictionAir)^120 = (1 - airDrag)^60`, hence the square root. Getting this wrong doubles the drag on every existing scene. |
| `bounce` | `restitution` | Direct. |
| `collideBounds` | `collisionFilter.mask` | Toggles the wall category. |
| mass | Matter default | Not overridden (D12). |

### 6.3 Body geometry

- `circle` → `Bodies.circle`
- `rectangle` → `Bodies.rectangle`
- `polygon` → `Bodies.fromVertices`, convex hull (no decomposition)
- `line` → bounding box inflated to at least `thickness`. A line has no area and a
  horizontal or vertical one has a degenerate box. Preserves today's behavior rather than
  silently dropping the object. A validator error replaces this in Phase 3.
- `text` → bounding box from `__baseSize`
- `group` → single body from `getLocalBounds()`. `__baseSize` is `{w: 0, h: 0}` at
  `builder.ts:187` and would produce a zero-area body. Phase 2 replaces this with real
  welded parts.

### 6.4 State machine

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

**Angle override (D8) is separate.** A rotation animation must own the angle while
position stays dynamic, and Matter has no such mode. Implemented as a post-step override:
after `Engine.update`, force `Body.setAngle` and zero the angular velocity. Phase 4's
`lockRotation` uses the same mechanism.

### 6.5 Freeze semantics (D4, D5)

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

### 6.6 Determinism work

- Reset Matter's seeded RNG (`Common._seed`) at world creation. It persists across world
  creations in a page session, so re-running without resetting can diverge from a cold
  load. One line, entirely non-obvious.
- Constant delta into `Engine.update`, always. Matter applies a correction factor for
  varying timesteps and degrades under jitter regardless of reproducibility concerns.

**Residual, accepted:** `Math.sin`/`cos`/`pow` are implementation-defined in ECMAScript
and Matter uses trig throughout rotation, so cross-machine results are close but not
guaranteed. Export sidesteps this entirely — the artifact is baked on one machine and is
identical everywhere by construction.

### 6.7 Other work

- Four static wall bodies at logical scene bounds on their own collision category,
  created at render start and destroyed on cleanup.
- `Body.scale` during sync from the per-frame delta ratio (D7).
- Previous-state buffer and `alpha` interpolation for rendered physics positions.
- Culling of bodies beyond a margin outside the scene.
- Idle means every body asleep or pinned, plus no running animations and no pending
  sequences.

### 6.8 Verification

Headless snapshot tests in Node, enabled by D9 and D3: run a fixture scene 120 ticks,
snapshot every body's position and angle, diff. No browser, Pixi, or canvas required.
This is available in Phase 1 rather than waiting for Phase 3's harness.

### 6.9 Expected behavior change

The default scene at `store/index.ts:75-96` will look different — five cubes that
currently ignore each other will collide. Per D8 their scheduled rotation animation still
wins over physics, which preserves the unphysical scheduled spin the upgrade is partly
meant to fix. Worth revisiting the default scene once compound groups land.

---

## 7. Phase 2 — Compound groups

**Renderer plus one validator rule.**

A `group` carrying a `physics` block welds its children into one body via
`Body.create({ parts })`; child transforms become shape offsets in the group's local
space. The centroid-vs-(0.5, 0.5) offset lands here rather than in Phase 1, because it is
zero for every symmetric shape and only matters once bodies are asymmetric.

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

---

## 9. Phase 4 — Physics syntax

**Full pipeline. First breaking syntax change.**

- `lockPosition`, `lockRotation`, `spin` — correctly named from day one, no migration.
- `world { gravity, bounds }` so gravity is declared once rather than per object.
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
| 4 — Physics syntax | Medium | Yes | Yes | Yes |
| 5 — Export | Large | Yes | Yes | Yes |

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
