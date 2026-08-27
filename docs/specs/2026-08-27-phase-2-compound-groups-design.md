# Phase 2 — Compound Groups

**Date:** 2026-08-27
**Status:** Approved design.
**Parent:** `2026-08-26-physics-shared-world-design.md` §7, which this expands.
**Adds decisions:** D16, D17, D18 (recorded in the parent spec's table).

---

## 1. Context

The parent spec's §7 is three sentences:

> A `group` carrying a `physics` block welds its children into one body via
> `Body.create({ parts })`; child transforms become shape offsets in the group's
> local space. Validator rejects `physics` blocks on children of a physics group.
> *Ships:* a multi-part logo tumbles as one coherent object instead of exploding.

Scoping it found two live defects and one structural blocker that §7 did not
anticipate. All three were confirmed by running code, not by reading it. This
document records what was measured, what was decided, and what is deliberately
left alone.

### 1.1 Defect A — a group's collision box is placed at the wrong point

`builder.ts:199` hard-codes a group's `localPivot` to `{x: 0, y: 0}`;
`builder.ts:210-216` sizes its `__bodyShape` from `getLocalBounds()`.
`physicsSync.ts:78-85` then places that box at `layout.currentPos` — the group's
origin. The box is **sized from the children's extent but positioned at the
origin**, so the two disagree whenever children sit asymmetrically around it.

Measured. A group at `(400, 300)` with one circle child at local `(100, 0)`,
radius 30:

```
__bodyShape  = { kind: "rectangle", width: 60, height: 60 }
body placed at (400, 300)
circle drawn at (500, 300)
```

The collision box is 100px from the object it represents.

This is the same *shape* of problem as D15 — a reference point that is not the
centre of mass — but D15's stored offset does not solve it, because D15's
reference point is the bounding-box centre and a group's is not.

### 1.2 Defect B — `physics` inside a group simulates at local coordinates

Not mentioned in §7. `bindPhysicsBodies` reads `container.__declareLayout.currentPos`
and passes it to `world.addBody` as a scene coordinate. For a child of a group
that value is a **local** coordinate, and no ancestor transform is applied.
`syncWorldToContainers` then writes world coordinates back into the same local
field, so the error compounds in both directions.

Measured, through the real compiler, parser and builder:

```declare
template Ball(tone) {
  circle b {
    position: (0, 0)
    radius: 12
    color: tone
    physics { gravity: (0, 900), duration: indefinitely }
  }
}
scene {
  size: (800, 600)
  generate i from 0 to 2 {
    use Ball(cyan) ball { position: (200 + i * 100, 80) }
  }
}
```

Compiles clean and produces three bodies **all at `(0, 0)`**. The `use` instance
positions are discarded entirely: three balls draw across the top of the scene
while simulating stacked in the corner.

`use` expands to a `type: "group"` node (`parseUse.ts:175`), so this defect
covers every template that carries physics — the "shower of balls from a
template" pattern, which is precisely the macro-layer differentiation §1.1 of the
parent spec stakes the project's position on.

Nothing in the repository's own corpus hits either defect. No scene in
`store/defaultScene.ts`, `eval/scenes/` or `eval/scenes-r2/` places `physics`
inside a group, which is why both have gone unnoticed since Phase 1.

### 1.3 Blocker — `advanceOneTick` is unreachable

Phase 1's execution notes record that `adapter.ts` has no test coverage, that all
three bugs found by review lived there, and that testing it "needs a DOM and a
PixiJS `Application`, which is out of scope."

**The DOM claim is false.** PixiJS `Container` and `Graphics` construct and
compute `getLocalBounds()` in plain Node under the existing `environment: "node"`
vitest config. Only `Text` needs a canvas. Every measurement in §1.1 and §1.2
above ran headlessly through the real `buildNode`.

The actual blocker is structural: `advanceOneTick`, `spawnAnim`, `spawnPhysics`,
`collectData` and the paint loop are closure-scoped inside `render()`
(`adapter.ts:427`), and `activeWorld` is a module-level global. Nothing outside
`render()` can reach them.

This matters beyond testing. The parent spec §5.3 states that `step()` taking no
time argument is "the property that makes an export driver a different *caller*
rather than a different engine" — but there is no caller surface to be different
from. Phase 5 cannot write `for (f of frames) runtime.advanceOneTick()` until
this extraction happens. Phase 2 does it because the reasoning is in hand now,
not because the compound-group feature requires it: **verified that
`__bodyShape` has exactly one consumer (`physicsSync.ts:71-85`) and that
`adapter.ts` never reads it**, so the feature itself touches `adapter.ts` not at
all.

---

## 2. Decisions

Numbered continuing the parent spec's table, where they are also recorded.

| # | Decision | Rationale |
|---|---|---|
| D16 | A group's collision reference point is its **local origin**, not its content bounding-box centre. The stored offset generalises to `pivot − centreOfMass`, subsuming D15. | The pivot-at-origin rule is documented behaviour (`LANGUAGE.md` §"Scene model") and is what gives `use Template() x { position: … }` a stable anchor. Moving the pivot to the content centre would silently change every existing rotating or scaling group scene. Fix the body, not the visual. |
| D17 | `physics` is allowed under a group **iff every ancestor group is static** — declares no `physics`, `animate` or `sequence`. The ancestor transform is composed at bind time. | A static ancestor chain is a constant transform, so composing it involves no `alpha` and cannot make the simulation frame-rate dependent (invariant 3). An animating ancestor would, which is why it is rejected rather than approximated. This is what makes templates carry physics correctly. |
| D18 | A compound flattens across nested groups. A child's `animate` inside a physics group is **visual-only** and is not rejected. | Flattening makes nested groups need no special case — a nested group contributes its parts under its own local transform, and the recursion falls out. Banning child `animate` would ban a legitimate shot: a logo tumbling as one body while an element inside it breathes. It ships documented instead. |

---

## 3. Scope

Six pieces, in dependency order.

| # | Piece | Files |
|---|---|---|
| 0 | Fix the rotation-override lock (§3.1) | `renderer/sceneRuntime.ts` |
| 1 | Extract the scene runtime | `renderer/sceneRuntime.ts` (new), `renderer/adapter.ts` |
| 2 | Compound geometry | `renderer/builder.ts`, `renderer/physicsWorld.ts` |
| 3 | Reference-point unification | `renderer/physicsWorld.ts` |
| 4 | Ancestor-transform composition | `renderer/physicsSync.ts`, `renderer/sceneRuntime.ts` |
| 5 | Validator rules | `typeChecker/validator.ts` |
| 6 | Documentation and verification | `docs/LANGUAGE.md`, `compiler/languageDocs.test.ts`, `tools/visual-check`, `.eval` |

**This is a Large phase.** The parent spec §12 sizes Phase 2 as Medium, which
was accurate for §7 as written. Piece 1 is roughly 385 lines relocated and piece
4 is 60–80 lines plus tests; §7 anticipated neither. Recorded so the estimate is
not silently exceeded.

Two natural cut lines if it runs long: piece 1 can merge on its own as a
behaviour-preserving refactor, and piece 4 can move to Phase 3b, where the macro
layer is already the theme and `use` is being reopened. Neither is planned; both
are pre-authorised.

### 3.1 Piece 0 — the rotation-override lock

Found while writing the plan's `SceneRuntime` tests, not while scoping the
feature. Added to this phase because the fix is one line inside a function
piece 1 relocates anyway.

**A `rotation` animation permanently locks a physics object's angle.**
`tickAnim` releases the override on the completion tick, but `pushAnimToWorld`
runs immediately afterwards over the same list — the runner is not spliced until
the paint phase — and writes the final angle straight back. Nothing clears it
again, so `step()` re-applies `Body.setAngle` for the rest of the scene.

Measured. A 40×40 square dropped off-centre onto a static ledge, its rotation
animation finished long before impact:

| ordering | final angle after impact |
|---|---|
| current | **20.00°** — exactly the animation's `to`; it does not rotate at all |
| override cleared after splice | −269.04° |
| skip the push once completed | −269.19° |

This is the fourth instance of the rotation-override family. Phase 1's execution
notes record the third, which was the same release running in the wrong *phase*;
this one is in the right phase but the wrong *order within the tick*. That the
family keeps recurring is itself the argument for piece 1: every instance has
lived in the file with no coverage.

Two documents are falsified by it and are corrected here:

- `LANGUAGE.md` — "When an animation finishes, the object returns to full
  physics control on whichever property the animation was driving." This gets a
  behavioural assertion, since prose alone did not stop it being false.
- The parent spec's §6.11 — "`stepper` will tumble on impact instead of landing
  flat." That has never been true; its angle is locked at 180° before its
  physics step begins.

**Accepted consequence:** the shipped default scene changes. `stepper` now
tumbles. That is the behaviour §6.11 already promised, so the card's own
commentary needs no rewrite.

---

## 4. Piece 1 — Extract the scene runtime

**Behaviour-preserving. No feature change.**

A new module `renderer/sceneRuntime.ts` takes everything from `adapter.ts` that
mutates or paints scene state. Like `physicsSync.ts`, every PixiJS import is
`import type` — `applyAnim` and `tickAnim` touch only `container.alpha`,
`container.rotation` and `__declareLayout`, none of which need the runtime
library — so the module is headlessly testable.

```
SceneRuntime
  constructor(world, sceneRoot)   binds bodies, collects runners
  advanceOneTick()                the whole tick phase; no time argument
  paint(alpha)                    animations, world sync, runner splicing
  isIdle()                        ticker-stop predicate
```

Moved: `RunningAnim`, `PhysicsRunner`, `SequenceRunner`, `evaluateEasing`,
`getEasingDerivativeAtEnd`, `lerp`, `tickAnim`, `pushAnimToWorld`, `applyAnim`,
`getCurrentVal`, `spawnAnim`, `spawnPhysics`, `startSequenceStep`, `collectData`,
`advanceOneTick`, and the paint/splice/idle body of the ticker callback.

Retained by `adapter.ts`: `Application` init, canvas mounting, stage teardown,
background and mask, the `buildNode` loop, `updateLayout` and its
`ResizeObserver`, the ticker callback, and cleanup. The callback reduces to:

```
const ticks = driver.pump(ticker.deltaMS);
for (let t = 0; t < ticks; t++) runtime.advanceOneTick();
runtime.paint(driver.alpha);
if (runtime.isIdle()) sharedApp?.ticker.stop();
```

The module-level `activeWorld` global becomes a field on `SceneRuntime`. That
closes the unconfirmed interleaving risk Phase 1's execution notes recorded:
`sharedApp` and `activeWorld` are module-level singletons and `render()` has
`await` points before assigning `activeWorld`, so two renders dispatched in quick
succession could in principle leave the spawn helpers writing to a different
world than the one their closure steps.

### 4.1 Ordering is the requirement

The three bugs review found in Phase 1 were all tick-versus-paint-phase
mistakes. This extraction must preserve the existing order exactly:

1. `tickAnim` for every running animation — including its completion side
   effects (kinematic-count decrement, `handOff` velocity, `POS_ANIM` unpin,
   rotation-override release).
2. `pushAnimToWorld` for every running animation, evaluated at `alpha = 0`.
3. `cullEscapedBodies`, before freeze.
4. `advancePhysicsTime`, with `FROZEN` pinning and `snapContainerToBody`.
5. `world.step()`.
6. Sequence-runner advancement.

Paint, separately and once per frame: `applyAnim` at the driver's alpha, then
`syncWorldToContainers`, then splicing completed runners, then the idle test.

Splicing stays in the paint phase, where it is today. It is bookkeeping, not a
side effect, and moving it would be an unrequested behaviour change.

### 4.2 Oracle

This piece has one, which no other piece does: the existing 121 tests must stay
green, and `visual-check` on the default scene must produce byte-identical
screenshots before and after. Both run before any feature work starts.

---

## 5. Pieces 2 and 3 — Compound geometry and the reference point

### 5.1 The reference point (D16)

`addBody`'s contract today reads "places the geometry's **bounding-box centre**
at the (x, y) it is given (spec D15)". It becomes "places the geometry's
**reference point**", with each kind defining its own:

| Kind | Reference point | Centre of mass | Offset |
|---|---|---|---|
| `circle` | shape centre | same | `0` — unchanged |
| `rectangle` | shape centre | same | `0` — unchanged |
| `polygon` | bounding-box centre | centroid | D15's offset — **unchanged** |
| `compound` | the group's local origin `(0, 0)` | Matter's computed centre | `−centreOfMass` |

`offset = referencePoint − centreOfMass` for every kind. `rotatedOffset`
(`physicsWorld.ts:304-311`) then works unmodified, and D15 becomes the polygon
row of a general rule rather than a special case.

Measured: parts at group-local `(−50, 0)` and `(+50, 0)` with the group origin at
`(400, 100)` give a centre of mass at `(440, 100)` and an offset of `(−40, 0)`.
After a 90° rotation the reconstructed origin is `(440, 60)`, matching where the
parts actually moved to the digit.

The offset must be captured **before** `Body.setAngle`, so that it is a
body-local vector. At angle 0 body-local and world axes coincide, which is the
same reason the existing polygon path works.

### 5.2 Building the parts

```ts
// Point spelled inline, matching the existing BodyGeometry style — this module
// must not import from pixi.js (D9), and does not import the IR either.
type LocalPoint = { readonly x: number; readonly y: number };

type BodyPart =
  | { kind: "circle";    radius: number;                  x: number; y: number }
  | { kind: "rectangle"; width: number; height: number;   x: number; y: number; angle: number }
  | { kind: "polygon";   points: ReadonlyArray<LocalPoint>; x: number; y: number; angle: number };

// added to BodyGeometry
| { kind: "compound"; parts: ReadonlyArray<BodyPart> }
```

`buildNode`'s group case builds its children first, then flattens their
**already-computed `__bodyShape` values** into a part list. It does not re-derive
per-kind geometry, so there is no second copy of the circle/rectangle/polygon/
line/text mapping to drift out of sync. A nested group contributes a `compound`
shape whose parts splice in under the nested group's own local transform — D18's
flattening, with no special case.

`text` children work unchanged: their `__bodyShape` is already a rectangle sized
from the rendered glyphs.

### 5.3 Scale, and three accepted approximations

- **The group's own `scale` is not baked into part geometry.** It goes through
  the existing `world.setScale` / `Body.scale` path. `Vertices.scale` scales x
  and y independently about a point (`Body.js:694`), which is the same
  vertex-level operation PixiJS applies, so the two agree even for non-uniform
  scale on rotated parts. This is also what keeps D7 working — see §5.4.
- **A child's own `scale` is baked into its part geometry.** Exact for
  `rectangle` (width × sx, height × sy) and `polygon` (points scaled
  componentwise). A non-uniformly scaled `circle` child collides as a circle of
  radius `r × (sx + sy) / 2`, because Matter has no ellipse primitive.
- **A rotated child beneath a nested group carrying non-uniform scale shears**,
  and a sheared shape cannot be expressed as a placed Matter part. It collides as
  the unsheared approximation. The common cases — no scale, uniform scale, or
  non-uniform scale without rotation — are exact.

### 5.4 D7 survives, measured

`Body.scale` on a compound holds the parent's centre of mass fixed and scales
each part's position about it. `rotatedOffset` already multiplies the stored
offset by the current scale. The two compose so that the visual and the collision
shape stay coincident; what moves is the group's *origin*, which is correct,
because the content is what scales about the centre of mass.

Verified against Matter 0.20.0: a compound of a 20×20 and a 60×60 rectangle,
centre of mass at `(440, 100)`, scaled 2× — centre of mass unchanged at
`(440, 100)`, area 4×, mass 4×, part positions scaled about the centre of mass.

Two caveats recorded rather than fixed, because both are pre-existing and both
are equally true of single bodies today:

- `body.circleRadius` is handled only on the parent (`Body.js:730`), so
  non-uniform scale leaves a circle *part*'s `circleRadius` stale. Matter 0.20's
  `Collision.collides` is SAT over vertices and axes, so this does not affect
  collision.
- `Body.scale` while a body is pinned fights `setStatic`'s `_original` mass
  snapshot: the snapshot is taken before the scale and restored after it.

### 5.5 Degenerate groups

A group with no shape descendants yields zero parts. `Body.create({ parts: [] })`
returns Matter's default 40×40 body, which would be a silent behaviour change.
`addBody` therefore falls back to a 1×1 rectangle at the reference point,
preserving today's `Math.max(groupBounds.width, 1)` behaviour.

### 5.6 What Matter does with parts, verified

Recorded because it is not the documented API and the parent spec's §6.2 was
wrong once already about exactly this class of thing.

- `Body.create({ parts })` produces `parts.length === n + 1`; `parts[0]` is the
  parent, and its vertices are the auto-hull of all parts.
- `Detector.collisions` skips index 0 whenever `parts.length > 1`
  (`Detector.js:113-116`), so **collision uses the real parts, not the hull**. An
  L-shaped logo collides concavely even though §3 of the parent spec cut concave
  decomposition.
- Restitution is combined from `parentA`/`parentB` (`Pair.js:71`) and
  `collisionFilter` is read from the top-level body (`Detector.js:100`), so
  `bounce` and `collideBounds` continue to work set on the parent alone.
- `body.deltaTime` defaults to `1000/60` on the parent **and on every part**.
  `Body.update` and `Body.setVelocity`/`getVelocity` read only the parent's, so
  setting the parent's is correct — but this gets an explicit assertion, because
  it is the same class of unstated normalisation that D14 and the §6.3
  corrections were about.
- `Body.setStatic` round-trips mass correctly across a compound.

---

## 6. Piece 4 — Ancestor-transform composition (D17)

`bindPhysicsBodies` threads a cumulative transform `{x, y, rot, sx, sy}` down its
walk. Because D17's validator rule guarantees no ancestor group animates, this
transform is **constant for the scene's life**: it involves no `alpha`, no wall
clock, and cannot make the simulation frame-rate dependent.

The composed transform is stored on the container as `__bodyTransform`,
following the existing `__`-prefixed convention declared in `builder.ts`'s
`declare module "pixi.js"` block. Two helpers, `toWorld` and `toLocal`, are the
only places the conversion is written, and four call sites route through them:

| Call site | Direction | Why |
|---|---|---|
| `bindPhysicsBodies` | local → world | places the body |
| `syncWorldToContainers` | world → local | write-back, per paint |
| `snapContainerToBody` | world → local | write-back, at freeze |
| `pushAnimToWorld` | local → world | an animation's `to` is in local space |

`flushPendingVelocity` rotates and scales the parked `handOff` velocity into
world space for the same reason. Rotation write-back subtracts the composed
ancestor rotation; `world.setScale` receives the composed scale rather than the
container's own.

---

## 7. Piece 5 — Validator rules

§7 of the parent spec asked for one rule. Two ship, because D17 needs the second
to be safe.

| Code | Condition | Message |
|---|---|---|
| `TYPE_PHYSICS_IN_PHYSICS_GROUP` | an ancestor `group` declares `physics` | *Group 'logo' already declares physics; its children are welded into its body and cannot simulate separately. Remove this 'physics' block.* |
| `TYPE_PHYSICS_IN_ANIMATED_GROUP` | an ancestor `group` declares `animate` or `sequence` | *Group 'row' is animated, so a physics body inside it cannot be placed deterministically. Move the 'physics' block onto 'row'.* |

Both apply to a `physics` block reached directly or through a `sequence` or
`parallel`, since the check is on the ancestor chain rather than on the immediate
parent.

`checkNode` already threads an `ancestors: ObjectNode[]` parameter
(`validator.ts:56`) that nothing currently reads. This is what it was built for.

**Deliberately not rejected (D18):** `animate` on a child of a physics group. The
welded body is a snapshot of the group's layout at build time, so an inner
element that pulses moves visually while its collision part does not. Documented
in `LANGUAGE.md` rather than banned.

---

## 8. Piece 6 — Documentation and verification

### 8.1 `docs/LANGUAGE.md` goes false silently, and that is the risk

The reference states that a `group` "gets a single rectangle spanning the
bounding box of everything inside it." That is true today and is exactly what
this phase replaces. Every example in the document is compiled by
`languageDocs.test.ts`, so a *rename* breaks the build — but this is a
**semantic** change with no syntax change, so the suite stays green while the
prose goes false.

Updating the reference is part of this phase's definition of done, and the new
claim gets a behavioural assertion the way the `yoyo` facts did. Three
assertions, each named after the heading whose claim it locks:

1. A physics group's `__bodyShape` is a compound with one part per shape
   descendant, at the expected offsets — proving *welded*, not *bounding box*.
2. A group's body reference point is its local origin, and survives rotation —
   locking D16 and the documented pivot rule together.
3. Both validator codes fire on the shapes described in §7.

Prose changes: the collision-shape paragraph under "Physics"; a note that
`physics` on a group's child is a compile error and why; a note that a child's
`animate` inside a physics group is visual-only (D18); and a compiled example of
a multi-part object with physics on the group.

### 8.2 Headless

First tests for `builder.ts`, which §1.3 establishes is possible. Compound
offset, rotation and scale assertions in `physicsWorld.test.ts`. Ancestor-
transform round-trip in `physicsSync.test.ts`. `sceneRuntime.test.ts`. Validator
rules.

### 8.3 Browser

`visual-check` covers what the headless suite structurally cannot: a multi-part
logo tumbling as one coherent object rather than exploding, which is what §7 says
this phase ships.

The determinism probe must **freeze mid-motion**. Phase 1's execution notes
record that "identical at rest" is a weak check, because a pile converges on the
same fixed point even when the trajectory diverged — four settling scenes
reported clean before a scene that froze in free fall exposed a real bug.

### 8.4 Eval

`.eval` re-run to confirm no regression. No change is expected: no scene in
either corpus places `physics` inside a group.

---

## 9. Order of work

1. Extract `sceneRuntime.ts`. Verify against the 121 existing tests and
   `visual-check` on the default scene (§4.2).
2. Tests for `sceneRuntime.ts`.
3. Fix the rotation-override lock (§3.1). It sits here rather than first because
   the test that catches it is one of piece 1's, and the fix lands in the file
   piece 1 creates.
4. `transform.ts`, the shared 2D transform algebra.
5. Compound `BodyGeometry`, welding, and the reference-point unification in
   `physicsWorld.ts`.
6. The builder's flattening, with `builder.test.ts` locking the desired group
   behaviour first — it fails against the current code, which is the point.
7. Ancestor-transform composition in `physicsSync.ts`.
8. Validator rules.
9. `LANGUAGE.md` and its behavioural assertions.
10. `visual-check` and the `.eval` re-run.
11. Execution notes and the `AGENTS.md` roadmap update.

The plan at `docs/plans/2026-08-27-phase-2-compound-groups.md`
follows this order task-for-task.

---

## 10. Risks

- **The extraction has no test coverage while it is happening.** It is a refactor
  of the one untested file, performed before its tests exist. Mitigated by
  ordering: mechanical extraction, then the existing suite, then `visual-check`,
  then new tests, and only then feature work.
- **Matter's private surface grows.** This phase adds a dependency on
  `Body.setParts`' auto-hull behaviour and on `Detector`'s part-skipping. Both
  are recorded in §5.6 with file and line, and both belong on the list of things
  a `matter-js` version bump must re-verify deliberately.
- **D17's guarantee is a validator rule, not a type.** If a later phase allows an
  animated group to contain a physics body without revisiting §6, the composed
  transform silently becomes stale rather than failing loudly. The
  ancestor-transform helpers should assert their precondition.
