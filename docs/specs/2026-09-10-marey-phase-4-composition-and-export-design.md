# Marey Phase 4 — Composition and Export Foundation

**Date:** 2026-09-10
**Status:** Approved design.
**Authority:** Implements §6 of
`2026-09-09-marey-engineering-roadmap-design.md`, which is authoritative from
Phase 3C onward. New §6 opens *"Unchanged from the previous roadmap §9, and
still authoritative as written there"*, so §§9.1–9.4 of
`2026-09-01-marey-product-roadmap-design.md` are re-adopted by reference and
are authority for this phase — the single exception to that document's
otherwise-historical status. Old §5, which defines the three canonical scenes,
is authority for what "the three canonical scenes" names; see §2 below.
**Preserves:** D13 (explicit bodies), D15 (bbox centre vs centroid), D16 (a
group's pivot is its local origin), D17 (physics only under a static group),
D18 (an `animate` inside a physics group is visual-only), R6 (export ahead of
physics breadth), R7 (frame sampling separate from encoders), the language cuts
of roadmap §4, and the three renderer invariants of
`docs/architecture/renderer.md`.

**A numbering convention, because three documents collide.** Bare `§x` in this
document means *this* document. A reference to the 2026-09-09 engineering
roadmap is written **"roadmap §x"**; a reference to the superseded 2026-09-01
product roadmap is written **"old §x"**. Section 1 is the exception and states
which document it means in every sentence, because comparing the two is its
subject.

---

## 1. Two documents, and where they disagree

Phase 4 is the one phase that must be read out of both roadmaps. New §6 says so
itself. Read against each other, §§6.1–6.4 and §§9.1–9.4 carry **the same
requirements in the same order**: §6.1↔§9.1 (composition contract), §6.2↔§9.2
(frame sampling, identical pipeline diagram), §6.4↔§9.4 (five identical exit
criteria, relabelled from "Product Gate B" to "Gate B"). §6.3 is a strict
superset of §9.3 — it adds the `preserveDrawingBuffer` trap paragraph and
changes nothing else.

**There is exactly one contradiction, and it is not inside Phase 4.** New §16
states that the previous roadmap "is superseded from Phase 4 onward", while new
§6 states that §9 is "still authoritative as written there". Those cannot both
be true of §9. This design reads the specific statement as governing the
general one — §6 re-adopts §9 by reference — which costs nothing, because the
two texts do not disagree about any requirement. Recorded here rather than
resolved silently. `docs/architecture/roadmap-and-process.md` should carry one
corrective sentence when this phase closes.

---

## 2. The three canonical scenes — what the phrase names

Gate B's fifth criterion is *"The three canonical scenes export through the same
sampler."* The phrase has been used for **two different sets of files**, and
settling which one Gate B means is a prerequisite, not a detail.

- **Old §5 defines the term.** 5.1 a data-driven bar chart; 5.2 a radial
  composition; 5.3 a **physics-driven compound logo**. The new roadmap's
  `Preserves:` line explicitly carries "the canonical scenes" forward, and §5 is
  the only place in either document where they are defined.
- **Old §8.3 — Product Gate A — names a different list**: `bar-chart`,
  `radial-dots`, `timeline-ticks`. That is Phase 3B's exit criterion, not §5.
- **Phase 3C then used the phrase for the Gate A list**, treating
  `eval/scenes-3b/`'s three files as "the three canonical scenes" in its own
  exit-criteria table.

`timeline-ticks` is therefore Gate A's third scene, not §5.3. This design takes
**§5's definition**, because §5 is the defining section and the section the new
roadmap preserves by name.

| §5 | File | Status on `main` |
|---|---|---|
| 5.1 data-driven bar chart | `eval/scenes-3b/bar-chart.marey` | exists |
| 5.2 radial composition | `eval/scenes-3b/radial-dots.marey` | exists |
| 5.3 physics-driven compound logo | **none** | must be written |

**5.3 does not exist anywhere in the repository.** The only multi-part `group`
carrying `physics` are `tools/visual-check/scenes/logo.marey` and
`logo-freeze.marey`. `logo.marey` is the closest candidate and fails old §5.3 twice:
it has no `animate` block, so nothing "animates into" the simulation as old §5.3
requires, and it is `duration: indefinitely`, which is precisely the shape roadmap §6.1
says cannot be exported. Only two files in the repository use `handoff` at all
(`throw-arc` in the R1 and R2 corpora), and neither is a compound.

**Decision.** Write a new canonical fixture, `eval/scenes-3b/compound-logo.marey`:
a multi-part `group` that animates in, hands off to physics, settles, and
declares a finite scene `duration`. `logo.marey` is left untouched —
`visual-check/SKILL.md` says to add a scene rather than edit one, because the
standing scenes are regression checks and their expected images are their value.

Gate B's export set is **four** files: the three canonical scenes plus
`timeline-ticks.marey`, which costs nothing and covers Phase 3C's reading of the
phrase as well as this one.

### 2.1 A limit of that criterion, stated rather than discovered

`bar-chart.marey` and `radial-dots.marey` are **entirely static** — no
`animate`, no `physics`. Exporting them proves exact frame counting and proves
nothing about motion. `compound-logo.marey` therefore carries the motion and
physics half of criterion 5 by itself, which makes it load-bearing rather than a
fourth nice-to-have.

`bar-chart.marey` additionally contains a `text` object, and PixiJS `Text`
requires a canvas (`builder.test.ts`'s header comment has recorded this since
before Phase 3C). Its headless coverage is therefore the sampler's frame
arithmetic; its motion coverage is the browser harness.

---

## 3. The measured seam: two opposite alpha conventions

Working out what `alpha` the sampler should paint at exposed a discrepancy in
the existing paint contract. It was found by reading and **settled by
measurement**, per AGENT-LESSONS §3b — reading finds contradictions, only
execution finds coincidences.

The two subsystems interpret `alpha` in opposite temporal directions:

- `animProgress` (`renderer/timeline.ts:91`) computes
  `(elapsedTicks + alpha) / durationTicks`. Alpha extends **forward** from the
  just-completed tick N into N+1, so `alpha = 0` is exact.
- `readState` (`renderer/physicsWorld.ts:426`) lerps `prevX → body.position` by
  alpha, and `prevX` is captured at the **top** of `step()`
  (`renderer/physicsWorld.ts:522`), so it interpolates **backward** across
  [N−1, N] and `alpha = 1` is exact. `snapContainerToBody`'s docstring
  (`renderer/physicsSync.ts:291-292`) already states this half in prose:
  *"Reading at alpha 1 is what makes it tick-aligned."*

A throwaway probe drove a real `MatterWorld` for 60 ticks with a freely falling
body and, separately, a linear position animation, then painted at each alpha:

```
PHYSICS paint(0): painted.y=220.458333  readState(1).y=224.541667  skew = -4.083333
PHYSICS paint(1): painted.y=224.541667  readState(1).y=224.541667  skew =  0
ANIM    paint(0): painted.x=155.000000  exact-at-tick-60=155.000000 skew =  0
ANIM    paint(1): painted.x=155.916667  exact-at-tick-60=155.000000 skew = +0.916667
```

`−4.083333` is exactly one tick of fall at that speed; `+0.916667` is exactly
one tick of that animation. **The skew is real, exactly one tick, and runs in
opposite directions.** There is no single alpha at which `paint()` places both
subsystems at tick N.

Live this is 8.3 ms and invisible. Baked into every exported frame it is a
systematic one-tick disagreement between animated and simulated objects, frozen
into the artifact — which is exactly what a composition-and-export foundation
must not ship.

### 3.1 `paintExactTick()`

`SceneRuntime` gains one method and one private helper:

- `paintAt(animAlpha, physicsAlpha)` holds the existing body of `paint`.
- `paint(alpha)` → `paintAt(alpha, alpha)`. Behaviour byte-identical to today.
- `paintExactTick()` → `paintAt(0, 1)`.

One implementation, two entry points, each independently revertible: deleting
`paintExactTick` reddens the sampler tests, changing `paint`'s arguments reddens
the live-path tests. A second hand-written copy of the paint body is refused
outright, per AGENT-LESSONS §5.

This is the one change this phase makes to `SceneRuntime`. It does not alter the
live loop: `adapter.ts` still calls `paint(driver.alpha)`.

---

## 4. Composition contract (roadmap §6.1)

### 4.1 `scene { duration }`

A **finite scene-level duration**, in seconds, optional, positive number only.
**Omitted means indefinite.**

```marey
scene {
  size: (800, 600)
  duration: 5
}
```

Optional rather than required, because requiring it would break every one of the
~60 first-party `.marey` files and would make the live playground demand a number
it does not consume. Backward compatibility is not a design constraint here —
`AGENTS.md` says so, and Phase 3A landed breaking renames with no aliases — so
this is not a compatibility argument. It is that a required property whose only
consumer is the export path taxes every scene for a feature most scenes do not
use.

**One spelling per state.** `duration: indefinitely` is *not* accepted on
`scene`, even though `physics.duration` accepts the keyword and it would
therefore be an author's natural guess. Two spellings for one state (omitted,
and explicit) is the hand-synced-list failure of AGENT-LESSONS §5 in miniature.
The guess is met with a named diagnostic instead — see §4.3.

### 4.2 The contract change, and the gap check it trips

`LANGUAGE_CONTRACT.scene.duration`: `kinds: "number"`, optional,
`constraint: { kind: "positive" }`, and **no `default`**, because absence is
itself the meaning.

That trips `languageContract.test.ts:163-179`, which skips a property only when
it is `required`, or has a `default`, or has a `derivedDefault`, and fails
otherwise. The check's stated rationale is that an optional property with none
of those *"is a gap where the builder would have to hold private fallback
knowledge the contract doesn't know about"*.

For `scene.duration` that private knowledge is real and is exactly one word:
absent means indefinite. So the contract gains a third documented fallback kind
alongside `default` and `derivedDefault`:

```ts
/** What an optional property's absence means, where no value can express it. */
export type AbsentMeaning = "indefinite";
```

`PropertySpec` gains `readonly absentMeans?: AbsentMeaning`, and the gap check
gains a third `continue`. The check keeps enumerating structurally rather than
being weakened to accommodate one property, which is the whole point of it.

`IRSceneNode` gains `readonly duration: number | null`.

### 4.3 Diagnostics

Compile-time, in `typeChecker/validator.ts`, following the existing `TYPE_`
convention:

| Code | Fires when |
|---|---|
| `TYPE_SCENE_DURATION_INDEFINITE` | `duration: indefinitely` on a `scene` block |

Positivity and finiteness are already carried by the `positive` local
constraint; no second rule.

Export-time, in the new pure module, following a new `EXPORT_` prefix because
these fire after compilation succeeds, at export request:

| Code | Fires when |
|---|---|
| `EXPORT_UNBOUNDED_SCENE` | the scene declares no `duration` and no explicit export bound was given |
| `EXPORT_INVALID_DURATION` | an explicit bound is not a positive finite number |
| `EXPORT_UNSUPPORTED_FPS` | the frame rate does not divide `TICK_HZ` exactly |
| `EXPORT_EMPTY_SEQUENCE` | the resolved plan yields zero frames |
| `EXPORT_FRAME_BUDGET` | the resolved frame count exceeds `MAX_EXPORT_FRAMES` |

Roadmap §6.1 requires these be **defined before any encoder is added**. They are: the
whole set lands in Task 4, and the first encoder is Task 8.

### 4.4 `planExport` is the only door

```ts
export interface ExportRequest {
  readonly fps: number;
  /** Explicit export bound in seconds. Overrides the scene's own duration. */
  readonly durationSeconds?: number;
}

export interface SamplerPlan {
  readonly fps: number;
  readonly ticksPerFrame: number;
  readonly durationTicks: number;
  readonly frameCount: number;
}

export type ExportPlanResult =
  | { readonly ok: true;  readonly plan: SamplerPlan }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<ExportDiagnostic> };

export function planExport(ir: IRSceneNode, request: ExportRequest): ExportPlanResult;
```

Duration resolution, in order:

1. `request.durationSeconds` if given — it **overrides** whenever present, so a
   caller may export the first two seconds of a ten-second scene. A non-positive
   or non-finite value is `EXPORT_INVALID_DURATION`.
2. otherwise `ir.duration` if non-null;
3. otherwise `EXPORT_UNBOUNDED_SCENE`.

Every diagnostic that applies is returned, not just the first, so one call tells
a caller everything wrong with the request.

**`sampleFrames` takes a `SamplerPlan` and `planExport` is the only function
that constructs one.** That is what makes Gate B criterion 4 — "invalid or
unbounded duration fails before rendering begins" — structural rather than a
convention a caller can forget. A `SamplerPlan` in hand is proof the request was
validated.

`MAX_EXPORT_FRAMES = 7_200` — two minutes at 60 fps, five at 24. Snapshots are
held in memory as an array, so the ceiling exists for the same reason
`TYPE_PHYSICS_BODY_LIMIT` and the 15,000-object parser budget do: an unbounded
request should fail with a name rather than exhaust the tab. The exact value is
a judgment call and §7 obligation 2 applies to it.

### 4.5 Frame rate stays an export option

Per roadmap §6.1, unless authoring evidence shows it is part of scene meaning. No such
evidence exists, so it stays an option.

It must **divide `TICK_HZ` exactly** — 24→5 ticks per frame, 30→4, 60→2 —
and anything else is `EXPORT_UNSUPPORTED_FPS`. This makes enforceable the reason
`sceneIR.ts:1-13` already gives for choosing 120 Hz: *"common export frame rates
divide evenly into it … which keeps exported frames on exact simulation states
rather than interpolations."* A frame rate that did not divide would require
sampling between ticks, which is the interpolation that comment exists to avoid.

---

## 5. Frame sampling (roadmap §6.2)

### 5.1 Where the sampler sits

```text
Marey source → Scene IR → deterministic frame sampler
             → immutable frame snapshots → PNG / Lottie / video encoders
```

`renderer/frameSampler.ts`, a **sibling of `LiveDriver`, not a replacement**.
`LiveDriver.pump(deltaMS)` maps wall-clock milliseconds to ticks; the sampler
maps an output-frame index to ticks and never sees a clock at all. Both call the
same `SceneRuntime.advanceOneTick()`, which takes no time argument — which is
the whole reason invariant 1 exists and what Phase 2's lift out of `render()`'s
closure was for.

It joins the four pure modules under `adapter.ts` and **imports no `pixi.js` at
runtime** (`import type` only), so Gate B criteria 1–4 are provable in the
headless suite rather than only in a browser.

### 5.2 The sampler paints every tick, not every frame

```ts
export function sampleFrames(
  runtime: SceneRuntime,
  root: Container,
  plan: SamplerPlan,
): FrameSnapshot[];
```

It takes a constructed runtime rather than building one, so it is exercisable
against both `RecordingWorld` and a real `MatterWorld` without knowing which.

```text
capture(frame 0, tick 0)                       // the scene as authored
for f in 1 .. frameCount-1:
    repeat ticksPerFrame:
        runtime.advanceOneTick()
        runtime.paintExactTick()
    capture(frame f, tick f * ticksPerFrame)
```

Frame 0 samples tick 0, before any advance, so the first exported frame is the
scene as written. The last samples tick `(frameCount − 1) × ticksPerFrame`,
which is the standard video convention and avoids a duplicated final frame.

**Why paint every tick.** `spawnAnim` seeds a new runner's start value from
paint-written container state — `getCurrentVal` reads `layout.currentPos`,
`container.rotation` and `container.alpha`, all last written by the paint phase.
A paint cadence that varied with the requested frame rate would therefore make
the exported *simulation* frame-rate dependent, which is Gate B criterion 3
failing. This is stated as a hypothesis with a decisive test, not as a settled
fact: 30 fps frame *k* and 60 fps frame *2k* sample the same tick, so their
snapshots must be identical, and moving the paint to frame boundaries must turn
that test red. If it does not, the hypothesis was wrong and the finding is that
— per AGENT-LESSONS §2f, "I could not make that fail, and here is why" is a
valid result.

### 5.3 Frame arithmetic

`durationTicks = secondsToTicks(duration)` — the one conversion the type checker
and runtime already share (`sceneIR.ts:17`), never a second copy.

`ticksPerFrame = TICK_HZ / fps`, guaranteed a positive integer by
`EXPORT_UNSUPPORTED_FPS`.

`frameCount = floor(durationTicks / ticksPerFrame)`.

At 5 s: 600 ticks → **120 / 150 / 300** frames at 24 / 30 / 60 fps.

`floor` over `round` is a judgment call with two plausible answers, and
AGENT-LESSONS §2d requires it be flipped to the other answer before commit. If
the suite stays green under `round`, a test making the decision load-bearing is
owed, with the reasoning in a comment beside it. `floor` is chosen because it
never samples past the declared duration.

### 5.4 Frame snapshots are data, not pixels

```ts
export interface ObjectSnapshot {
  readonly id: IRObjectId;
  readonly x: number;         // local pivot position
  readonly y: number;
  readonly rotation: number;  // radians, as the scene graph holds it
  readonly scaleX: number;
  readonly scaleY: number;
  readonly alpha: number;
}

export interface FrameSnapshot {
  readonly index: number;     // 0-based output frame
  readonly tick: number;      // simulation tick sampled
  readonly objects: ReadonlyArray<ObjectSnapshot>;
}
```

Frozen, matching `sceneIR.ts`'s convention that everything crossing a stage
boundary is `readonly` and frozen. Ordered depth-first in scene-graph order,
which is IR order — determinism of the ordering is what makes hashing stable.

Encoders receive `FrameSnapshot[]` **and nothing else**. That is what makes
Roadmap §6.2's *"Encoders never advance the simulation and never see a wall clock"*
structural rather than a convention someone can forget: an encoder holds no
reference to a `SceneRuntime`, a world, or a driver.

It is also what makes Phase 5A cheap. Baked Lottie is a second consumer of the
same array, not a re-implementation of frame selection.

Containers carry no IR id today — `builder.ts`'s `declare module` block has no
such field. `buildNode` gains `__mareyId`, written once, in the existing
`__`-prefixed namespace.

### 5.5 Two hash levels, with honest scope

- **Snapshot hash** — a dependency-free FNV-1a over the stable-ordered snapshot
  JSON, identical in Node and the browser. This carries the determinism claim,
  including across machines, because it hashes simulation output rather than
  rasterisation.
- **PNG byte hash** — carries run-to-run equality on one machine only. GPU
  rasterisation differs across machines and drivers, so cross-machine PNG
  equality is **not promised**. Stating the limit is preferred to implying more.

Gate B asks for *repeated* exports to produce identical frame hashes. Both
levels satisfy that; each is reported with its own scope.

Snapshot values are not rounded or quantised before hashing. IEEE-754 arithmetic
is deterministic for an identical sequence of operations, and Matter.js is
deterministic given identical call order, so exact values are both more honest
and equally stable.

---

## 6. Compiler surface, CLI, and first output (roadmap §6.3)

### 6.1 The pipeline is currently written out three times

`lex → parse → typeCheck` is spelled out independently in
`src/compiler/compiler.worker.ts`, in `eval/compile.test.ts`, and a CLI would
make it a fourth. That is the hand-synced-list anti-pattern of AGENT-LESSONS §5
at module scale.

`src/compiler/compileSource.ts` becomes the one copy:

```ts
export interface CompileOutcome {
  readonly ok: boolean;
  readonly errors: ReadonlyArray<CompilerError>;
  readonly ir: IRSceneNode | null;
  readonly symbols: ReadonlyArray<string>;
}

export function compileSource(source: string): CompileOutcome;
```

It imports only `lexer/`, `parser/` and `typeChecker/` — no DOM, no `Worker`, no
`pixi.js`. `compiler.worker.ts` keeps its `postMessage` shell and its log
formatting, which is presentation and belongs with the presenter.

This is roadmap §6.3's *"a pure compiler surface not coupled to the Web Worker"*, and
`src/compiler/compiler.worker.ts` is the coupling it names.

### 6.2 `marey check`

There is no CLI today: `package.json` declares no `bin`, and its scripts are
only `dev`, `build`, `preview`, `test`, `test:watch`.

`marey check <files…>` compiles each file, prints positioned diagnostics, and
exits 1 if any file has an error.

`--export-ready` additionally runs `planExport` and reports export diagnostics.
Without `--fps` it reports only the rate-independent ones — chiefly
`EXPORT_UNBOUNDED_SCENE` — rather than inventing a default frame rate nobody
asked for. With `--fps N` it reports the whole set for that rate. That is
validation, not rendering,
so it respects roadmap §6.3's ordering — *"`marey check` … before a rendering CLI"* —
while making the §4.3 export diagnostics reachable by a user before any encoder
ships.

**It needs a build step, and the reason is specific.** The codebase uses
extensionless relative imports (`from "./lexer"`) under
`moduleResolution: "bundler"`, so Node's native type stripping cannot resolve
them. `erasableSyntaxOnly: true` is already set in `tsconfig.app.json`, so the
source is strip-*compatible*; the resolution problem is independent of that and
is not fixed by it. One `vite.cli.config.ts` in library mode targeting Node,
`bin: { "marey": "bin/marey.mjs" }`, and a `build:cli` script.

`marey export` is Phase 6 (roadmap §9.1) and is out of scope here.

### 6.3 PNG, and the trap designed around

Roadmap §6.3's named trap: reading the PixiJS canvas in-page returns a blank frame
because PixiJS does not set `preserveDrawingBuffer`. Verified to still hold on
`main` — `preserveDrawingBuffer` appears nowhere in `src/`, and Pixi's `extract`
API is used nowhere in `src/` either. A naive PNG export produces blank images
and reports success.

`renderer.extract.canvas(container)` renders into a render texture the caller
owns and reads back from that, so the drawing buffer's contents are irrelevant.
That is the roadmap's preferred route, and it avoids taxing every live frame for
an export-only feature. pixi.js 8.16.0's `ExtractSystem` exposes `canvas()`,
`pixels()`, `image()` and `base64()`.

```ts
export async function encodePngSequence(
  app: Application,
  root: Container,
  frames: ReadonlyArray<FrameSnapshot>,
): Promise<Uint8Array[]>;
```

It applies each snapshot to the container tree by `__mareyId` and extracts. It
receives no runtime, no world and no driver, so it cannot advance the simulation
even by accident.

### 6.4 Browser evidence

`tools/visual-check/export-check.mjs`: loads the app with a scene
through the existing `#code=` share-link hash — the robust path `check.mjs`
already uses — triggers an export, writes `frame_%04d.png` and a `report.json`
of per-frame hashes, then repeats from cold and compares.

Real PNGs on disk, which **will be opened and looked at, not just their JSON**
— doubly required for a phase whose headline failure mode is a blank image
reported as success. If a capture cannot be viewed, that is reported plainly.

No product UI ships this phase. An export button belongs with `marey export` in
Phase 6, which is scheduled to design it properly; inventing one here would be
150 individual downloads or a new zip dependency.

The dev server must be started with `npx vite --port 5199 --strictPort`, killed
afterwards, and the port confirmed free. Without `--strictPort` a stale server
absorbs every capture and reports a confident false pass; that has happened
twice.

---

## 7. Verification obligations

These are obligations of the phase, not suggestions.

1. **Delete-and-run, per behaviour, individually.** For every behaviour this
   phase requires, delete the line implementing it and run the suite; anything
   still green is untested (AGENT-LESSONS §2c). Where a change touches N call
   sites, revert each **separately** — a suite that reddens when all N are
   reverted says nothing about which of them is guarded (§2c's breadth
   corollary).
2. **Flip every judgment call.** At minimum: `floor` vs `round` in §5.3, the
   `EXPORT_FRAME_BUDGET` ceiling, frame 0 sampling tick 0 versus tick
   `ticksPerFrame`, and paint-per-tick versus paint-per-frame. If the suite
   stays green under the other answer, the decision is unpinned and a test is
   owed (§2d).
3. **Read every RED before accepting it.** A verbatim test in a plan is a claim
   about a file the plan did not write; a wrong fixture produces a *false RED*
   that looks exactly like the RED the process is waiting for (§3d). Open the
   fake and check each method exists with that spelling and records what the
   assertion reads.
4. **Re-derive every number on a clean tree.** The baseline is 20 files / 677
   tests at `f032991`; a stray probe file silently inflates it (§6). Judge
   whether a file changed with `git diff --stat -- <path>`, never `git status`.
5. **Budget the external review** that shares none of this reasoning, before the
   phase is declared done (§8).

---

## 8. Exit criteria — Gate B

Each with the evidence that will settle it and the revert that must redden.

| # | Criterion (roadmap §6.4) | Evidence | Revert check |
|---|---|---|---|
| 1 | Finite scenes export exact expected frame counts at 24, 30 and 60 fps | Headless, four scenes × three rates | Break `ticksPerFrame` or `floor` → must fail |
| 2 | Repeated exports produce identical frame hashes | Headless snapshot hashes ×2; browser PNG hashes ×2 from cold | — |
| 3 | Frame pacing cannot affect exported state | 30 fps frame *k* ≡ 60 fps frame *2k*, snapshot-identical | Move paint to frame boundaries → must fail |
| 4 | Invalid or unbounded duration fails before rendering begins | `planExport` gates every `SamplerPlan` | Delete each `EXPORT_*` diagnostic separately → must fail |
| 5 | The three canonical scenes export through the same sampler | Four scenes, headless and browser, one sampler | — |

Plus, carried from Phase 3C and owed before anything is baked:

| + | The `MatterWorld` `polygon` + `origin` + `physics` + `animate scale` fixture | Written first, as Task 1 |

---

## 9. Task shape

Tiered before starting, per AGENT-LESSONS §7b. The sizing test: any task needing
more than two implementer rounds should have been two tasks.

| # | Task | Tier |
|---|---|---|
| 1 | The debt Phase 3C filed: a `MatterWorld`-level `polygon` + `origin` + `physics` + `animate scale` fixture pinning the `readState`-before-`setScale` ordering | Integration |
| 2 | `paintAt` + `paintExactTick()`, and the tests §3's measurement justifies | Integration |
| 3 | `scene { duration }`: contract, `absentMeans`, IR, validator, `LANGUAGE.md`, goldens | Integration |
| 4 | `exportContract.ts` — `planExport`, the five `EXPORT_*` diagnostics, frame arithmetic. Pure | Integration |
| 5 | `frameSampler.ts`, `FrameSnapshot`, `__mareyId`, the stable hash | Architecture |
| 6 | `compileSource.ts`; rewire `compiler.worker.ts` and `eval/compile.test.ts` onto it | Integration |
| 7 | `marey check`, `bin/marey.mjs`, `vite.cli.config.ts`, `build:cli` | Integration |
| 8a | `pngSequence.ts` + `export-check.mjs` | Architecture |
| 8b | `compound-logo.marey`, Gate B evidence, reference and guidance updates, execution notes | Architecture |

Task 1 is first because export bakes whatever the placement rule does, and
Phase 3C's execution notes state plainly that *"an untested placement rule is
exactly the thing a baked keyframe would freeze in."*

---

## 10. Out of scope, and deferrals

Each deferral states what makes it harmless **today**, per AGENT-LESSONS §7 —
not merely inconvenient to fix.

| Deferred | Why it is safe to defer |
|---|---|
| **`localPivotX/Y` and `__baseSize` are dead fields** — written at `builder.ts:90-91` and six `__baseSize` sites, read by no production code (verified; only test fixtures set them) | They are written and never read, so no behaviour depends on them and none can. Removing them is a reviewer-recommendation-shaped change that blocks no task, and §7b measured mid-phase acceptance of exactly that shape as the most expensive process error so far. **Filed, not fixed.** |
| **The live preview does not honour `scene { duration }`** | Nothing reads the field but the sampler, so preview behaviour is byte-unchanged. `adapter.ts` has no test coverage at all — Phase 1's execution notes record this as an open gap and all three bugs review found were there — so editing its loop is the riskiest available change for the least Gate B value. Playback and scrubbing are roadmap Phase 7. |
| **Cross-machine PNG byte equality** | Not claimed, so nothing rests on it. The determinism claim is carried by snapshot hashes, which hash simulation output rather than rasterisation. |
| **`marey export`, an export UI, a zip artifact** | Roadmap §9.1 places `marey export` in Phase 6 explicitly. Nothing in Gate B requires a user-facing export path; the harness produces the PNG sequence as reproducible evidence. |
| **Lottie and video encoders** | Phases 5A and 5B. This phase defines the snapshot boundary they consume, which is R7's whole point. |
| **`EXPORT_UNSUPPORTED_FEATURE`** | Phase 5A owns the first feature that is genuinely unsupported by an encoder (`text` under R17). Defining the diagnostic *shape* now, as §4.3 does, is what roadmap §6.1 asks for; inventing the members before an encoder exists would be guessing. |

Also out of scope: any change to the physics model, to the language beyond
`scene { duration }`, and to the four language cuts of roadmap §4.
