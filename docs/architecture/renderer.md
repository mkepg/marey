# Renderer

`renderer/adapter.ts` owns the PixiJS app, the canvas, `fit` layout and
the ticker — and nothing else. `renderer/sceneRuntime.ts` owns the runner
lifecycle: the tick phase, the paint phase and the idle test. Lifting it out of
`render()`'s closure in Phase 2 is what gives Phase 5's export driver something
to call, since `advanceOneTick()` takes no time argument and now nothing but a
caller stands between it and a bare loop.

Four pure modules sit under `adapter.ts` and **must not import `pixi.js`** at
runtime, so they stay testable headlessly in Node. `sceneRuntime.ts`,
`physicsSync.ts` and `transform.ts` are the ones most likely to be edited by
someone reaching for `Graphics` or `Ticker`; every `pixi.js` import in them is
`import type`.

- **`transform.ts`** — 2D transform algebra, zero imports. One copy of the
  parent-child composition that both the builder's group flattening and
  `physicsSync`'s ancestor composition need.

- **`clock.ts`** — the fixed **120Hz** simulation tick. `LiveDriver.pump(deltaMS)`
  converts a wall-clock frame delta into a whole number of ticks, carrying the
  remainder as `alpha` for interpolation.
- **`timeline.ts`** — `AnimTime`/`PhysicsTime` state, advanced one tick at a
  time. Durations are converted from IR seconds to ticks at runner creation.
- **`physicsWorld.ts`** — `MatterWorld`, the shared Matter world. Owns every
  Marey↔Matter unit conversion, so callers pass px/s and radians and never
  see `_baseDelta`. Two non-obvious things live here: gravity is injected as a
  **velocity delta, never a force** (a force is still in the buffer when
  Matter's sleeping pass reads it, so nothing would ever sleep), and the
  sleeping pass is driven manually with `engine.enableSleeping = false`.
  `matter-js` is pinned to `0.20.0` with no caret, deliberately: this file
  depends on internals that are not the documented API —
  `Body._baseDelta` normalisation and the phase order inside `Engine.update`
  — and `@types/matter-js` does not declare several of them, so
  `physicsWorld.ts` carries a `declare module "matter-js"` augmentation. A
  version bump means re-running the conversion assertions in
  `physicsWorld.test.ts` deliberately, not trusting them. Reference sources
  are checked out at `../matter-js-master` and `../poly-decomp-es-main`.
  `poly-decomp` is **not** a dependency; polygons use a convex hull (spec §3).

`renderer/physicsSync.ts` is the only place containers and bodies meet. It
imports `pixi.js` for types **only**, so it is headlessly testable too. An
object gets a body iff it declares `physics` directly or in a `sequence` (D13);
animate-only objects are not colliders. Pinning is reason-counted — `NO_RUNNER`,
`POS_ANIM`, `FROZEN` — and pinned means container → body, so a frozen object
still tracks a sibling animation instead of drifting off its collision shape.

The loop is: `pump` → advance N ticks → **paint once** at the sub-tick `alpha`.

Three invariants that are easy to break, each of which has caused a real bug:

1. **Nothing that mutates scene state may take a time argument.** `advanceOneTick()`
   advances exactly one tick. This is what will let an export driver call it in
   a bare loop with no wall clock. `ticker.deltaMS` appears exactly once in the
   whole renderer, inside `driver.pump()`.
2. **State mutation belongs in the tick phase, painting in the paint phase.**
   `tickAnim` advances and fires completion side effects (kinematic-count
   decrement, `handoff` velocity); `applyAnim` only writes display properties.
   Moving side effects into paint means they fire once per *frame* instead of
   once per *tick*, which silently drops physics ticks. This has been a bug
   twice — most recently the rotation-override release in Phase 1.
3. **Nothing fed into the physics world may derive from the wall clock.**
   Anything wall-clock dependent makes the simulation a function of frame rate,
   which is what the fixed tick exists to prevent and what baked-keyframe export
   depends on. `driver.alpha` is the obvious instance — `pushAnimToWorld`
   evaluates animations at `alpha = 0` for exactly this reason, at the cost that
   during a position animation the drawn position leads the collision shape by
   up to one tick. Painting may use alpha freely.

   **It was worded as "may not derive from `driver.alpha`" until Phase 2, and
   that wording caught neither of the two defects it should have.** Alpha
   appeared nowhere in either call chain. The other two routes found so far:
   *burst length* — a completed runner is not spliced until the paint phase, so
   it kept pushing for every remaining tick of a catch-up burst — and
   *paint-phase state*, where `spawnAnim` seeded a new animation's start value
   from container fields the paint phase had last written at alpha. The test
   shape that catches this class is a frame-pacing harness: run the same scene
   for the same number of ticks at 1, 7 and 12 ticks per frame and require the
   world to see identical calls. One lives in `sceneRuntime.test.ts`.

`renderer/builder.ts` turns IR nodes into PixiJS containers. Every visual is
wrapped in a `Container` whose pivot is the centre of its **bounding box** —
there is no `anchor` property. Note the precision: that is the geometric centre
only for `circle`, `rectangle` and `text`. For `polygon` and `line` it is the
bbox midpoint, **not** the centroid — the same distinction D15 exists to correct
in the physics layer, and 7.5px apart for the default scene's own triangle. A
`group`'s pivot is its local origin (`builder.ts:271`) and is never derived from
where its children sit — that is deliberate (D16), and since Phase 2 its
collision body is placed to match rather than the other way round. A `group`
with `physics` gets a **compound** body, one part per shape inside it, flattened
across nested groups. Runtime state is attached via
`__`-prefixed fields declared in a `declare module "pixi.js"` block at the top
of that file.

## Non-obvious gotchas

- **`physics` inside a group is only legal under a *static* group.** D17: the
  ancestor transform is composed once at bind time and stored as
  `__bodyTransform`, which is sound only while that chain does not move. Two
  validator rules enforce it — `TYPE_PHYSICS_IN_PHYSICS_GROUP` and
  `TYPE_PHYSICS_IN_ANIMATED_GROUP`. A `use` expansion wraps its template in a
  group, so this is also what decides whether a template may carry physics.
- **A compound's collision uses its parts, not its hull.** Matter's `Detector`
  skips `parts[0]` when `parts.length > 1`, so an L-shaped group collides
  concavely — even though spec §3 cut concave decomposition for single shapes.
- **An `animate` block inside a physics group is visual-only** (D18). The welded
  body is built once from where the group's contents sit at the start, so an
  animating child moves its drawing but not its collision part.
- **Colour animation is half-built across three layers.** `IRAnimation.to`
  admits `IRColor` and `resolveAnimToValue` handles it, but `PROP_TYPES`
  rejects colour, the validator allows only position/rotation/scale/alpha, and
  `tickAnim` has no colour branch.
