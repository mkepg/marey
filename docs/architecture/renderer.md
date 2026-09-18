# Renderer

`renderer/adapter.ts` owns the PixiJS app, the canvas, `fit` layout and
the ticker — and nothing else. `renderer/sceneRuntime.ts` owns the runner
lifecycle: the tick phase, the paint phase and the idle test. Lifting it out of
`render()`'s closure in Phase 2 is what gives Phase 5's export driver something
to call, since `advanceOneTick()` takes no time argument and now nothing but a
caller stands between it and a bare loop.

Five pure modules sit under `adapter.ts` and **must not import `pixi.js`** at
runtime, so they stay testable headlessly in Node: `sceneRuntime.ts`,
`physicsSync.ts`, `transform.ts`, `clock.ts`, and (Phase 4) `frameSampler.ts`.
`sceneRuntime.ts`, `physicsSync.ts` and `transform.ts` are the ones most
likely to be edited by someone reaching for `Graphics` or `Ticker`; every
`pixi.js` import in them is `import type`. **There is no automated guard for
this rule** — no lint rule, no import-boundary test — so this document is the
only thing enforcing it; check it by grepping the five files above for
`from "pixi.js"` and confirming every hit is `import type`.

- **`transform.ts`** — 2D transform algebra, zero imports. One copy of the
  parent-child composition that both the builder's group flattening and
  `physicsSync`'s ancestor composition need.

- **`clock.ts`** — the fixed **120Hz** simulation tick. `LiveDriver.pump(deltaMS)`
  converts a wall-clock frame delta into a whole number of ticks, carrying the
  remainder as `alpha` for interpolation.

- **`frameSampler.ts`** — a headless sibling of `LiveDriver`, not a
  replacement: `LiveDriver.pump(deltaMS)` maps wall-clock milliseconds to
  ticks for the live preview, while `frameSampler.ts`'s `sampleFrames` maps an
  export plan's output-frame index straight to a tick count and never sees a
  clock at all. Both call the same tick-argument-free `advanceOneTick()`
  (invariant 1). It paints with `SceneRuntime.paintExactTick()`, never with
  `paint(alpha)` — the two exist because the renderer's two subsystems read
  `alpha` in **opposite temporal directions**, so no single value tick-aligns
  both: `animProgress` (`timeline.ts`) computes
  `(elapsedTicks + alpha) / durationTicks`, extending *forward* from tick N
  into N+1, so `alpha = 0` is exact; `readState` (`physicsWorld.ts`) lerps
  `prevX -> body.position` by alpha, interpolating *backward* across
  `[N-1, N]`, so `alpha = 1` is exact. `paintExactTick()` is
  `paintAt(0, 1)` — animations at 0, physics at 1 — for exactly this reason.
  Measured, not assumed (`sceneRuntime.ts`'s own docstring): over 60 ticks,
  `paint(0)` placed a falling body exactly one tick of fall short of
  `readState(id, 1)`, and `paint(1)` placed a linear animation exactly one
  tick of travel past its tick-60 value. Live, at 8.3ms per tick, that
  disagreement is invisible and `paint(driver.alpha)` stays correct; baked
  into an exported frame it would be a permanent skew between animated and
  simulated objects, which is why the sampler calls `paintExactTick()`
  instead of reusing `paint()`. It paints every tick, not every frame — kept
  as the conservative choice, not a proven necessity; see its own docstring
  for the paint-cadence experiment that failed to find a scene sensitive to
  the difference, and for the one case (a `sequence`-bearing scene) that
  experiment did not cover.

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
imports `pixi.js` for types **only**, so it is headlessly testable too. Its
`centreOffsetVector` / `centreInParent` are where the two frames this seam
joins get reconciled: `position` places a container's **pivot**, which `origin`
may move anywhere in (or out of) the bounding box, while Matter places a body
at its **centre of mass**. **All five container→body handoffs go
through it** — bind-time placement, both write-back sites, `builder.ts`'s
`collectBodyParts` (which is why `builder.ts` imports from `physicsSync.ts`
and not the other way round: the reverse would drag a runtime `pixi.js`
import into a module that must not have one), and `sceneRuntime.ts`'s
`pushAnimToWorld`. The offset it applies is a
vector in the container's own local frame, so it takes that container's
rotation and scale but never its translation; write-back un-rotates it by the
angle just read from the body, not the one the container still holds. It is
`(0, 0)` at the default origin, so every pre-`origin` scene follows the
identical path with an added zero. **A shape's `__bodyShape` is already
expressed relative to its bbox centre** — a polygon's points most visibly —
so only the *placement* takes the offset; correcting the points as well
double-counts it.

**The fifth handoff is `pushAnimToWorld`, and it is the only one that could
not use `centreInParent`.** It runs in the **tick** phase and evaluates at
`alpha = 0` precisely to satisfy invariant 3, while `centreInParent` reads
`container.rotation`, `currentPos` and `currentScale` — all three last written
by the paint phase at wall-clock alpha. The tick-safe entry point is
`centreOffsetVector(layout, rot, scale)`, which reads only the
construction-time `centreOffsetX/Y` and takes everything mutable as an
argument, so the caller composes the offset onto the position it is itself
computing. Its two branches differ:

- **Position** adds the offset to its own lerped pivot and pushes an absolute
  centre, exactly as the bind path does. The scale it feeds the offset is a
  concurrent scale runner's own `alpha = 0` lerp, never `layout.currentScale`.
- **Scale** pushes a `setPosition` the branch never made before this phase,
  because PixiJS scales a container about its **pivot** and Matter scales a
  body about the body's own **centre**: as a bottom-origin object grows, its
  drawn centre walks away from the pivot while its body's stays put, so the
  collider leaves the drawing during exactly the "grow from a baseline" idiom.
  It pushes a **delta** on the body's own centre read at alpha 1 — the absolute
  pivot only exists in paint-phase state — and stands down entirely while a
  position runner is live, which would otherwise count the offset twice.

**The centre correction is once per body per tick, not once per runner.**
Nothing rejects two `animate scale` blocks on one object (`builder.ts`
`.filter`s animations where it `.find`s physics), and a `parallel` step may
carry two as well. Every scale runner pushes its own `setScale`, so the **last**
one still pushing is the scale the body actually carries — and it is the only
one allowed to move the centre. A delta per runner sums them and walks the
collider off the drawing. The same "last one still pushing" rule answers what
scale the position branch and the freeze snap use, which is why that filter
must count a runner completing *on this tick* as still live.

Both branches take the container's rotation from the **body** at alpha 1, not
from `container.rotation`, for the same invariant-3 reason. At the default
origin the offset is `(0, 0)` and both skip the correction outright, so those
scenes' call sequences are byte-identical to their pre-`origin` ones — the
scale branch in particular still pushes no position at all.

`snapContainerToBody` takes the tick-aligned scale as a **parameter** for the
same reason `centreOffsetVector` does. Its pivot correction scales with the
object, so reading `layout.currentScale` there would re-import the wall-clock
alpha the snap exists to remove: an object freezing part-way through a scale
animation would settle a frame-rate-dependent distance from its baseline.
`syncWorldToContainers` is the one write-back that may still read the field,
because it paints and never feeds the world. An
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
wrapped in a `Container` whose pivot is its `origin` property — a bounding-box
fraction that **defaults** to (0.5, 0.5), the centre of its **bounding box** —
there is no `anchor` property. Note the precision: at that default, the pivot
is the geometric centre only for `circle`, `rectangle` and `text`. For
`polygon` and `line` it is the bbox midpoint, **not** the centroid — the same
distinction D15 exists to correct in the physics layer, and 7.5px apart for
the default scene's own triangle. A `group`'s pivot is its local origin (the
`applyAnchorAndPivot` call at `builder.ts:351-361`, the fixed `{ x: 0, y: 0 }`
origin argument at line `359`) and is never derived from where its children
sit — that is deliberate (D16), and since Phase 2 its collision body is
placed to match rather than the other way round. A `group`
with `physics` gets a **compound** body, one part per shape inside it, flattened
across nested groups. Runtime state is attached via
`__`-prefixed fields declared in a `declare module "pixi.js"` block at the top
of that file. One of them, `__mareyId` (Phase 4), is the container's IR
object id — nothing before the frame sampler needed a stable per-container
identity, since the scene graph was only ever walked, not addressed, so the
field did not exist until `frameSampler.ts`'s `snapshotFor` needed something
to key snapshots by. It is written once, in `buildNode`, and read at two
sites: `frameSampler.ts`'s `snapshotFor` (sampling) and
`../export/frameRaster.ts`'s `applySnapshot` (writing a sampled frame back
onto a tree for re-rendering) — the same inverse pair that module's own
docstring names. `frameRaster.ts` is the shared rasterization seam both the
PNG and (Phase 5B) video exporter replay frames through, so they cannot
disagree about the exported size, background or frame identity.

## The Lottie encoder boundary (Phase 5A)

Lottie export is **two modules with one structural rule each**, and the rules
are the point: they are what make the exported file independent of Marey and
of Matter.js at playback.

- **`export/lottieGeometry.ts`** turns the IR into `LayerSpec`s and refusals.
  It may not import `pixi.js` at all, not even as a type.
- **`export/lottieEncode.ts`** turns `LayerSpec`s plus sampled
  `FrameSnapshot`s into a Lottie document. It may not import `pixi.js`
  **or `sceneIR`** in any form.

`lottieEncode.ts` sees snapshots, never the scene graph. That is why it can be
reasoned about as pure data transport, and it is checkable with a grep rather
than an argument — do that before believing it.

Geometry walks **`ir.children`**, which is layer-sorted, not `ir.registry`,
whose key order is source order. The plan originally specified `registry` and
that was caught before dispatch; a fixture whose objects happen to share a
layer cannot tell the two apart, so the mistake survives casual testing.

**The opacity asymmetry — transforms stay parented, opacity flattens.** These
pull in opposite directions and the split is deliberate:

- Pixi multiplies a container's `alpha` into its children, and `visible:false`
  hides a whole subtree.
- Lottie/After Effects parenting propagates **only the transform**. Opacity
  does not inherit.

So the encoder keeps the parent links for position/rotation/scale — composing
a transform down the tree is exactly what parenting exists to avoid, since
rotation with non-uniform scale produces a shear that only `sk`/`sa` can
express and whose decomposition varies between players — and it flattens
opacity into a per-layer product of `visible ? alpha : 0` up the ancestor
chain. `visible` folds into that same product because Lottie has no per-frame
visibility flag at all: `ip`/`op` are per-layer, so they cannot express
"hidden for frames 40–70". Baking a cull as opacity 0 is visually identical
and is the only encoding the format offers.

**This was measured, not assumed.** Phase 5A's design listed six Lottie facts
the published specification did not settle, and forbade any task from treating
them as known until a browser answered them. Opacity non-propagation was
confirmed in lottie-web 5.13.0 and independently in
`@lottiefiles/dotlottie-web`: a group at `alpha: 0.5` containing a child at
`alpha: 0.5` renders at ~25%, not ~12.5%. The fixture is
`tools/visual-check/scenes/lottie-opacity-flatten.marey` and the
harness is `tools/visual-check/lottie-check.mjs`. A dated correction
recording all six answers is appended to §11 of
`docs/specs/2026-09-11-marey-phase-5a-baked-lottie-design.md`.

**One consequence worth knowing before you change any of this.** Because
opacity is flattened, the encoder writes a group's own alpha onto its null
layer *and* the fully composed product onto each descendant. In both renderers
measured this is inert, because neither propagates. In a renderer that *did*
propagate, every nested alpha would double-apply. That is filed, not fixed —
and the fixture above is the one that would catch it.

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
