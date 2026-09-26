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
the motion test card's own triangle (`tools/visual-check/scenes/test-card.marey`,
the default scene until Phase 5B). A `group`'s pivot is its local origin (the
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
disagree about the exported background or frame identity, or about the RULE
that fixes the exported size: **the output is the scene's declared pixel
size times the exporter's own scale — never the preview's
`devicePixelRatio`, and never a content bounding box** (spec §2.2,
Phase 5C). `createFrameRasterizer`'s `scale` is a required 4th argument, not
a default, so a caller that forgets it is a type error rather than a silent
1x. The PNG sequence and APNG exporters pass `1`; the video exporter passes
`VideoPlan.scale` (`VIDEO_SCALE`, currently 2, `videoContract.ts`) — so the
two exporters' outputs are no longer literally the same size, but both are
still `createFrameRasterizer`'s one rule applied at a different scale, not
two independent implementations that could drift apart. The scale multiplies
the OUTPUT only: the `frame: region` handed to `extract.canvas` stays in
scene units, because `GenerateTextureSystem` multiplies it by `resolution`
itself (research §6) — multiplying it again here would double-scale the
region instead of rasterizing it at a higher density. This is also the trap
a 2x export has to avoid on the `Text` side: PixiJS rasterizes a `Text`'s own
texture at the *renderer's* resolution, so an export `Application`
initialised at `resolution: 1` and extracted at `resolution: 2` would
upscale already-blurry 1x text while every vector shape came out sharp.
`rasterExport.ts`'s `withRasterExport` avoids it by initialising the export
`Application` itself at `resolution: scale`, the same scale frames are
extracted at. For video, `runVideoExport` passes `VideoPlan.scale`.
`videoPipeline.test.ts` pins this: it spies on `Application.prototype.init`
and requires the `resolution` it receives to equal the plan's scale.
Nothing else catches it. The output is still the right size, so
`video-check.mjs` cannot see blurry text.

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

## The video encoder boundary (Phase 5B)

Video export carries forward Phase 5A's two-modules-one-rule-each shape rather
than inventing a new one:

- **`export/videoContract.ts` must not import `pixi.js`** in any form. It is
  pure request validation, codec/config resolution and timestamp arithmetic.
- **`export/videoEncode.ts` must not import `pixi.js` or `sceneIR`** in any
  form. It receives a `VideoPlan` and a sequence of `CanvasImageSource`s, not
  the scene graph or the IR.

**Unlike Phase 5A's version of this rule, the direct imports are checked by a
test rather than by remembering to grep, and only the direct imports.** A
transitive path is not checked: `videoEncode.ts` could import
`../compileSource` or `../renderer/builder`, both of which reach the IR and
`pixi.js`, and the suite would stay green (whole-branch review M-1, measured).
Keeping the encoder away from the scene graph through *other* modules is still
a review-time rule. A transitive import-graph guard was considered and not
built in Phase 5B (ruling R48). `export/exportBoundary.test.ts` asserts the
direct rule against
the two files' own source text, through a helper (`importsModule`) that matches
a quoted specifier against all three ESM import shapes — a static
`from "X"`, a dynamic `import("X")`, and a bare `import "X"` — and matches if
the module fragment appears *anywhere* inside the quotes, not only flush against
the closing one. That second property is load-bearing, not defensive
over-engineering: pixi.js 8.16 declares 23 export subpaths
(`pixi.js/app`, `pixi.js/scene`, …), so `import { Application } from
"pixi.js/app"` is a real, compiling violation of "must not import pixi.js in
any form" that an ends-with match reports clean, and a `from "../ir/sceneIR.ts"`
specifier is equally real here because every `tsconfig*.json` in this repo sets
`allowImportingTsExtensions: true`. Each of the file's tests also pins that it
read the source constant it claims to, by a landmark string unique to that
file — proven necessary, not assumed: an earlier version of this guard passed
4/4 when every test was pointed at the same (unrelated, pixi-clean) source
constant, because the assertions themselves never distinguished which file
produced a clean answer.

A second, related pair of tests in the same file guards a boundary this phase
added on top of Phase 5A's shape: `videoPipeline.ts`, `useExport.ts` and
`TopBar.tsx` — the production path a real export click takes — may not import
`src/lib/devVideoSeam.ts` in any form, and their code may not reach
`window.__mareyExportVideo` (the dev-only global that seam installs) either.
Both checks run over comment-stripped source rather than the raw file, because
two of the three files name `__mareyExportVideo` in a docstring specifically to
explain why they do not call it — checked against raw source, the guard read
that documentation as the violation it exists to prevent.

`frameRaster.ts` is the single rasterization seam the PNG-sequence and video
exporters both replay frames through — measured, not assumed:
`pngSequence.ts` and `rasterExport.ts` import `createFrameRasterizer` from
it, not from one another. `rasterExport.ts` is the shared prefix that video,
APNG and the PNG seam rasterize through. One seam means the two
export paths cannot silently diverge on how a sampled frame gets rasterized
back onto the scene tree — the same size, background and frame-identity
guarantee the paragraph above already states for it.

**One video orchestration, observed by the harness (Phase 5B fix wave,
R45).** `videoPipeline.ts`'s `runVideoExport` is the only copy of the video
export path. Since Phase 5C its compile → plan → build → sample prefix and the
teardown around it are `rasterExport.ts`'s `withRasterExport`, which the APNG,
Lottie and PNG exports share. `runVideoExport` adds only the probe (in
`beforeBuild`), the device-limit check (in `afterInit`) and the lazy
rasterize → encode loop. The export button calls it
through `useExport.ts`'s dynamic `import()`; the dev seam
`src/lib/devVideoSeam.ts` calls the same function with an optional observer
(`onPlanned`, `onSampled`, `onFrame`, `onEncoderConfig`) to collect the
reference PNGs, snapshot hash and encoder config `video-check.mjs` needs. Do
not grow a second orchestration in the seam again: when it was a hand-copy,
reversing or dropping frames in the shipped loop left every test and the
harness green (whole-branch review I-2). Three properties of that loop are
deliberate:
- `assertVideoEncodable` (the one environment/codec probe, also called by
  `encodeVideo`) runs before the scene is built or sampled, so a refusal
  arrives before any simulation work.
- Frames are rasterized lazily, one per encoder request, and each canvas is
  zero-sized once the encoder has copied it (`new VideoSample(canvas)` copies
  at construction). `extract.canvas()` allocates a new canvas per call, so an
  eager `frames.map(rasterize)` held every frame at once.
- The loop yields to the event loop every 100 ms of work, measured as the
  cheapest interval that keeps the page repainting; see
  `eval/RESULTS-PHASE-5B.md`, "Known limitations".

**The codec string is a function of the plan (R43).** `h264LevelFor` and
`vp9LevelFor` in `videoContract.ts` pick the lowest level whose limits admit
the frame size, each dimension, the rate and the bitrate. The H.264 table is
Rec. ITU-T H.264 (03/2010) Table A-1, which ends at level 5.1, so 5.1 is the
top of the MP4 range and `planVideo` refuses beyond it with
`VIDEO_EXCEEDS_CODEC_LEVELS`; the VP9 table is libvpx's `vp9_level_defs`,
levels 1 to 6.2. Chromium enforces the H.264 frame-size limit, not the rate
limit, and no VP9 level at all, so a wrong declaration is not caught by the
browser: a single pinned string previously refused every MP4 above 720p and
declared VP9 level 1.0 on every WebM. The encoder config mediabunny receives
is built by `videoSourceConfig` (including the frames-to-seconds keyframe
conversion) and pinned by `videoContract.test.ts` and, with mediabunny
mocked, `videoEncode.test.ts`.

**The container determinism asymmetry.** Repeated exports of the same scene
are byte-identical for WebM, measured across independent cold page loads on
more than one scene. MP4 is not byte-identical, and the reason is documented
at the encoder boundary rather than waved at: the lossless reference frames
each cold run feeds to its own encoder are bit-identical, so the renderer is
exonerated, and the divergence is inside the compressed bitstream itself,
attributed to the encoder side and no further — this project's code does not
control, and did not pinpoint, which layer of Chromium's H.264 stack produces
it. The whole-branch reviewer reproduced it with raw WebCodecs
`VideoEncoder` and no mediabunny, which places it below the muxer. So
`video-check.mjs` reports MP4 byte identity and never gates on it (R47); WebM
bytes gate. See `eval/RESULTS-PHASE-5B.md` (criterion 2) for the measured breakdown;
it is cited here rather than restated, so there is one copy of the numbers to
keep true.

## The Lottie `line` stroke (Phase 5C)

A `line` plans to `{ kind: "line", points, thickness }`, with its anchor
from the same `polygonBBox` min/max scan `builder.ts`'s own `line` case
uses, and encodes as an **open path followed by a stroke, never a fill**:
`shapeItemsFor` pushes a `{ ty: "sh", ks: { k: { c: false, i: zeros, o:
zeros, v: points } } }` and then a `{ ty: "st", lc: 1, lj: 1, ml: 10, ... }`,
matching pixi's `GraphicsContext.defaultStrokeStyle` (alignment 0.5, cap
butt, join miter, miterLimit 10). The stroke item goes **after** the path
for the same backward-`searchShapes` reason the fill item does, above:
put it before the path and lottie-web renders nothing (measured, Task 2
Step 6). `LOTTIE_UNSUPPORTED_LINE` (5A) is gone; a scene containing a
`line` no longer refuses.

Two of design §3.4's three facts were confirmed by measurement; the third
corrected the design's own prediction:

- **Miter limit.** Lottie's `ml` follows the SVG rule (miter length ÷
  stroke width, `1 / sin(θ/2)`) against the same limit (10) pixi's own
  `buildLine.mjs` uses. A fixture with corners at 14° (ratio 8.206) and 9°
  (ratio 12.745) straddles the cutoff: pixi and lottie-web agree at both
  (14° miters, 9° bevels), so `ml: 10` needed no correction.
- **Non-uniform scale — design §3.4.2's prose had the pairing backwards.**
  A line's stroke cross-section is built in local space perpendicular to
  the line's *own* direction, so a **horizontal**-path line's thickness
  scales by `scale.y` and a **vertical**-path line's by `scale.x` — the
  opposite of what §3.4.2 predicted. Measured on `scale: (0.35, 0.5)`,
  thickness 10: the horizontal line reads ≈5px (`10 × scaleY`), the
  vertical line ≈3.5px (`10 × scaleX`); both renderers agree with each
  other and with this corrected pairing. See `eval/RESULTS-PHASE-5C.md`,
  "Piece 2", for the pixel measurements.
- **Butt caps and a repeated point.** Both renderers draw flat, sharp
  butt caps on a two-point line, and a zero-length segment inside a line
  (a repeated point) produces no visible difference from the plain line.

## `ensureExportFonts` (Phase 5C)

Every export pipeline — `rasterExport.ts`'s shared prefix (video, PNG,
APNG) and `lottiePipeline.ts` — awaits `ensureExportFonts(ir)`
(`export/exportFonts.ts`) before the scene is built: it calls
`document.fonts.load(...)` once per distinct `fontSize` a `text` node in
the IR uses, then `.check(...)`, and throws `EXPORT_FONT_UNAVAILABLE`
(naming the family) rather than building with a browser fallback font if
the check still fails after the load resolves. Without it, a cold page —
one that never rendered the live preview first — measures and draws text
with the fallback font, and the export silently disagrees with what the
user saw in the preview.

**A second, non-obvious hazard sits beneath that fix: pixi's font-metrics
cache.** `CanvasTextMetrics.measureFont` caches ascent, descent and
`fontSize` in the static `_fonts` map, keyed by the CSS font string alone
(pixi.js 8.16.0, `CanvasTextMetrics.mjs`). Nothing in that key records
whether the face had loaded. So if the live preview measured this scene's
text on a cold page, before the font arrived, every later `TextStyle` with
the same font properties is served the fallback font's metrics. That
includes the fresh ones `buildNode` makes for the export.
- **Measured** (`docs/research/2026-09-24-export-quality-probes/text-plumbing/cache-run.mjs`,
  a fresh page): after one fallback measurement, the export built a 60 px
  two-line text at 504 × 126 (lineHeight 63, ascent 51). A warm page builds
  it at 504 × 142 (lineHeight 71, ascent 60).
- **Why the width was right either way.** The per-text
  `_measurementCache` is not the hazard. Its key includes the style's
  `styleKey`, which is `` `${uid}-${tick}` `` (`TextStyle.mjs`). That key
  carries the object's own id, so a new `TextStyle` never hits an entry an
  older one wrote.
- **The clear is in `rasterExport.ts`**, not `exportFonts.ts`. Right after
  `ensureExportFonts` resolves and before anything is built,
  `withRasterExport` calls `CanvasTextMetrics.clearMetrics()` with no
  argument. That is pixi's public way to empty `_fonts`. It costs one
  re-measure per font string, for the preview too, which then picks up the
  loaded font's real metrics as well. The code comment above that call is
  the primary record. `exportFonts.test.ts` ("empties the cache before
  building") pins the clear.

## Text layout from pixi, glyphs from HarfBuzz (Phase 5C)

Lottie `text` splits the way design §0's O5 decided: **pixi supplies
layout, HarfBuzz supplies glyphs**, joined as plain data. After
`buildNode`, `lottiePipeline.ts`'s `collectTextLayouts` walks the built
tree — so it can read each text wrapper's own `__baseSize` and
`CanvasTextMetrics.measureText` results — and produces two
`ReadonlyMap<IRObjectId, …>`s, `TextLayout` and `TextGlyphRun`
(`export/textOutline.ts`), which `planLottie` consumes as inert data. A
`text` node missing an entry in either map is an invariant throw: every
text node must be laid out and shaped before planning runs.
`textOutline.ts` is the **only** module that imports harfbuzzjs, and
neither `lottieGeometry.ts` nor `lottieEncode.ts` imports it or pixi.js —
checked by `exportBoundary.test.ts`, the same way as the rest of the
Lottie boundary. `lottieGeometry.ts` may import `textOutline.ts`'s
**types** (`Contour`, `TextLayout`, `TextGlyphRun`) as a type-only
import; `verbatimModuleSyntax` erases that import at compile time, so it
is not a boundary violation, and the boundary test says so.

**Missing glyphs are refused, not degraded.** HarfBuzz shaping a
character to glyph id 0 (`.notdef`) means the font has no glyph for it —
measured for `日` and `🙂`, both of which the *preview* draws from a real
fallback glyph or a colour emoji, never tofu, so silently drawing nothing
in the export would disagree with what the user saw. `LOTTIE_TEXT_MISSING_GLYPH`
names the object id and the missing character's code point; it replaced
`LOTTIE_UNSUPPORTED_TEXT`, which refused every text node outright.

**A glyph's x/y do not add pixi's `padding`, unlike the design's original
formula.** pixi draws a `Text`'s glyphs at `+padding` inside a texture
that its own `updateTextBounds.mjs` then places at `-padding` in the
`Text`'s local space, so the padding cancels; adding it again in
`textOutline.ts`'s own placement would double-count it. Marey's styles
carry padding 0 today, so both readings agree on every Marey scene, and a
test pins the cancellation (`textOutline.test.ts`, "does not move glyphs
by `padding`") so a future non-zero padding cannot silently regress it.

**A text layer is masked to pixi's own measured box, only when a glyph
leaves it.** pixi draws a `Text` into a texture sized to its measured
layout box and clips ink outside that box, in the preview and in every
raster export; an unclipped Lottie outline would draw further than the
preview does whenever a glyph's contour — a combining mark's diacritic,
for instance — extends past that box. The encoder adds a mask to
`(0,0)-(w,h)` on exactly those text layers, never on the rest: of the six
fixtures measured, only the one carrying a combining mark needed it.

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
