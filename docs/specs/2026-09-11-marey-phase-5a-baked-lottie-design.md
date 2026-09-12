# Marey Phase 5A — Baked Lottie

**Date:** 2026-09-11
**Status:** Approved design.
**Authority:** Implements §7 of
`2026-09-09-marey-engineering-roadmap-design.md`, which is authoritative from
Phase 3C onward. Unlike Phase 4, this phase reads out of exactly one roadmap:
the 2026-09-01 product roadmap is superseded from Phase 4 onward (new §16), and
nothing in new §7 re-adopts any part of it by reference the way new §6 did for
Phase 4. The §16-versus-§6 collision Phase 4 had to resolve therefore does not
arise here.
**Preserves:** R7 (frame sampling separate from encoders), R8 (a baked-Lottie
subset ahead of broad video polish), R17 (`text` excluded), D16 (a group's pivot
is its local origin), D18 (an `animate` inside a physics group is visual-only),
the language cuts of roadmap §4, and the three renderer invariants of
`docs/architecture/renderer.md`.

**Numbering convention.** Bare `§x` means *this* document. `roadmap §x` means
the 2026-09-09 engineering roadmap. `lottie §x` means the Lottie specification
at <https://lottie.github.io/lottie-spec/>.

**A note on this document's claims.** Every mapping in §4 was derived by reading
`src/compiler/renderer/builder.ts` at `6d8db3d`, and every Lottie fact in §3 was
read from the published specification, not recalled. §11 lists, separately and
by name, the claims this document could **not** settle from either source. Those
are open questions for implementation to answer empirically, not soft
assertions — treat anything in §11 as unverified until an implementer measures
it, per AGENT-LESSONS §1.

---

## 1. What this phase emits, and what it refuses

Roadmap §7 names a deliberately bounded subset:

- static `circle`, `rectangle`, `polygon` and `group` geometry;
- baked `position`, `rotation`, `scale` and `alpha` keyframes;
- fixed duration and frame rate;
- baked physics, with no Matter.js or Marey dependency at playback.

"Baked" is the whole idea. The frame sampler has already run the simulation by
the time an encoder sees anything, so a Lottie file carries *the answer* rather
than the computation. Nothing in the emitted artifact knows that Matter.js
exists. That is what makes exit criterion 1 — a physics scene playing in a
third-party player with no Marey code — reachable at all.

**Two kinds are refused, each with a named diagnostic:**

- `text`, per R17. The Lottie specification's own tracker has carried "Add Text
  Layer" open for 19 months; the shape-layer subset is the only
  normative-and-stable part.
- `line`, because roadmap §7's enumeration is four kinds and `line` is not one
  of them. This is a scope reading, not a technical limit — Lottie can express a
  stroked polyline — and §10 records it as a deferral rather than a permanent
  cut.

Refusal means a diagnostic that names the feature and the object, emitted
**before any sampling happens**. Roadmap §7 requires that unsupported features
"fail explicitly rather than degrading silently", and §7.1's third exit
criterion restates it. A file that quietly omits a text layer is the precise
failure this rules out.

---

## 2. The encoder boundary

### 2.1 What Phase 4 established

`FrameSnapshot[]` is the boundary: encoders receive it and nothing else — no
runtime, no world, no clock. `ObjectSnapshot` carries `id`, `x`, `y`,
`rotation`, `scaleX`, `scaleY`, `alpha`, `visible`. `x`/`y` are **parent-local**
and ids are **scope-qualified** (`scene.group.child`).

That boundary exists so an encoder structurally cannot advance the simulation or
observe a wall clock. It is worth being precise about what it is *not*: it is
not a claim that a snapshot is sufficient to describe a scene. It plainly is
not. A snapshot has no shape kind, no radius, no colour, and no parent link.
PNG did not notice, because PNG re-renders through the same PixiJS tree the
sampler just drove, so geometry never had to cross the boundary. Lottie is the
first encoder that must *describe* geometry rather than re-render it.

### 2.2 The decision

**Two modules, not one.**

```text
IRSceneNode ──▶ lottieGeometry.ts ──▶ LayerSpec[]  ─┐
                (planLottie)                        │
                                                    ├─▶ lottieEncode.ts ──▶ LottieDoc
FrameSnapshot[] ────────────────────────────────────┤
SamplerPlan ────────────────────────────────────────┘
```

- **`lottieGeometry.ts`** owns `planLottie(ir): LottiePlanResult`. It walks the
  IR once and produces either a flat `LayerSpec[]` — kind, dimensions, colour,
  anchor point, parent link, depth — or a list of `LOTTIE_*` diagnostics. It
  imports `sceneIR` and nothing else.
- **`lottieEncode.ts`** owns `encodeLottie(specs, frames, plan): LottieDoc`. It
  imports **nothing from `sceneIR`**. Its inputs are inert data.

Three reasons this is two modules rather than one function with a private
helper:

1. **It makes the boundary an import-level fact rather than a claim.**
   `docs/architecture/renderer.md:15-18` records that the analogous "these
   five modules must not import `pixi.js`" rule has *no automated guard* — no
   lint rule, no import-boundary test — and that the document is the only thing
   enforcing it. That is a known soft spot in this codebase and there is no
   reason to add a second one. An encoder that cannot name `IRSceneNode` cannot
   accidentally reach into it.
2. **Each half is testable without the other.** Geometry extraction is a pure
   `IRSceneNode → data` function, exercisable from a hand-built IR with no
   simulation, no renderer and no PixiJS. Encoding is a pure `data → JSON`
   function, exercisable from hand-built specs and hand-built frames with no
   compiler. Neither test needs a browser.
3. **It puts the diagnostics where they can fire early.** Unsupported-feature
   diagnostics are properties of the *scene*, not of the frames. Putting them in
   the IR pass means `planLottie` rejects a `text` node before the caller spends
   240 frames of simulation discovering it — the same shape as `planExport`,
   which §5 of the Phase 4 design made structural for the same reason.

### 2.3 What this deliberately does not do

`ObjectSnapshot` is **not widened**. Adding `kind`/`radius`/`colour` to it would
repeat static data on every one of up to 7,200 frames, and — the reason that
actually decides it — `hashFrames` hashes snapshot JSON, so widening the
snapshot silently changes what every Gate B hash in `eval/RESULTS-GATE-B.md`
means. Those hashes are published evidence for a completed phase. This phase
does not move them.

`SamplerPlan` reaches the encoder unchanged and is used for exactly two things:
`fps` (→ Lottie `fr`) and `frameCount` (→ Lottie `op`). It is branded, so
holding one remains proof the request was validated.

---

## 3. Lottie facts this design rests on

Read from the published specification on 2026-09-11. Every one is a unit
mismatch or a structural rule that silently produces a file which parses, plays,
and shows the wrong thing.

| Fact | Source |
|---|---|
| `r` rotation is in **degrees, clockwise** | lottie helpers/transform |
| `s` scale is a **percentage**; `100` is identity | lottie helpers/transform |
| `o` opacity is **0–100** | lottie helpers/transform |
| Fill `c` colour is an array of **0–1 floats**, not 0–255 | lottie shapes |
| Bezier `i`/`o` tangents are **relative to their vertex**, not absolute | lottie values/bezier |
| `parent` holds another layer's `ind`; `CTM(child) = CTM(parent) × Transform(child)` | lottie layers |
| Parenting is transitive; reference cycles are forbidden | lottie layers |
| `ip`/`op` are in **frames**; with `ip = 0`, `op` is the duration in frames | lottie composition |
| An animated property is `{a: 1, k: [keyframe…]}`; a static one is `{a: 0, k: value}` | lottie properties |
| A keyframe is `{t: frame, s: value}`, with `h: 1` for hold and `i`/`o` for easing | lottie properties |
| Even a scalar animated value is written as a one-element array in `s` | lottie properties |
| Layer types: `0` precomp, `1` solid, `2` image, `3` null, `4` shape | lottie layers |

Marey's corresponding units, for contrast: rotation in **radians** on the
snapshot (`c.rotation`, as the scene graph holds it — note that `IRVisualBase.
rotation` is in *degrees* and `applyAnchorAndPivot` converts at
`builder.ts:121`, so the IR and the snapshot disagree and the snapshot is what
the encoder sees); scale as a **multiplier**; alpha as **0–1**; colour as a hex
string.

---

## 4. The geometry and transform mapping

Derived by reading `applyAnchorAndPivot` (`builder.ts:75-125`) and the
`buildNode` switch (`builder.ts:202-340`) at `6d8db3d`.

### 4.1 The pivot is the position

`applyAnchorAndPivot` computes

```text
localPivot = bbox.min + origin × bbox.size
```

sets `wrapper.pivot` to it, and writes `layout.currentPos` from the declared
`position`. PixiJS places a container by its **pivot**, so `layout.currentPos` —
and therefore `ObjectSnapshot.x`/`y` — **is the pivot's parent-local position**,
whatever the origin is. `builder.ts:109-115` says so explicitly and warns that
this point is the bounding-box centre only at the default origin.

Lottie's anchor point `a` has exactly this meaning: the point in the layer's own
coordinate space that `p` places. So the mapping is direct and needs no
correction term:

| Lottie layer transform | Value |
|---|---|
| `a` | `localPivot`, in layer-local coordinates |
| `p` | `[snapshot.x, snapshot.y]` |
| `s` | `[snapshot.scaleX × 100, snapshot.scaleY × 100]` |
| `r` | `snapshot.rotation × 180 / Math.PI` |
| `o` | `composedOpacity × 100` (§5) |

### 4.2 Per-kind geometry

Each row's `bbox.min`/`bbox.size` is the argument `buildNode` passes to
`applyAnchorAndPivot`; the Lottie column is the shape item that draws the same
thing in the same layer-local frame.

| Marey | `bbox.min` | `bbox.size` | Lottie shape item | anchor `a` |
|---|---|---|---|---|
| `circle radius: r` | `(0, 0)` | `(2r, 2r)` | `el`, `p: [r, r]`, `s: [2r, 2r]` | `(2r·oₓ, 2r·o_y)` |
| `rectangle w × h` | `(0, 0)` | `(w, h)` | `rc`, `p: [w/2, h/2]`, `s: [w, h]` | `(w·oₓ, h·o_y)` |
| `polygon points` | `(minX, minY)` | `(w, h)` | `sh`, `v: points`, `i`/`o` all `[0,0]`, `c: true` | `(minX + w·oₓ, minY + h·o_y)` |
| `group` | — | — | `ty: 3` null layer, no shapes | `(0, 0)` |

Three details each of which is a real trap:

- **The circle is not drawn at the layer origin.** `buildNode` emits
  `.circle(radius, radius, radius)` (`builder.ts:215`), so its centre sits at
  `(r, r)` in local space, not `(0, 0)`. Lottie's `el` `p` is the ellipse's
  centre, so `p` must be `[r, r]`. Writing `[0, 0]` produces a circle offset by
  one radius on both axes — a file that parses and is visibly wrong.
- **The rectangle is drawn from its corner.** `.rect(0, 0, w, h)`
  (`builder.ts:230`) puts the top-left at the local origin, while Lottie's `rc`
  `p` is the rectangle's **centre**. Hence `[w/2, h/2]`.
- **A group's anchor is fixed at `(0, 0)` by D16**, not derived from its
  children. `builder.ts:347-351` passes a hard-coded `{x: 0, y: 0}` origin for
  groups precisely so a group's pivot is its own local origin, and
  `IRGroupProps` carries no `origin` property at all.

### 4.3 Colour

`IRColor` is a string. Fill `c` is `[r, g, b]` in 0–1. The conversion belongs in
`lottieGeometry.ts`, so `lottieEncode.ts` receives numbers and never parses a
colour format. Hex is the only form the IR produces today; anything the parser
can emit that is not a hex triple is a `planLottie` failure, not a silent black.

---

## 5. The asymmetry: transforms parent, opacity flattens

**This is the most consequential decision in the design, and the one most likely
to be undone by someone who does not know why it is there.**

PixiJS multiplies a container's `alpha` into its children's effective alpha, and
`visible: false` hides an entire subtree. Lottie parenting, which inherits After
Effects' model, propagates **only the transform**: a parent layer's opacity does
not reach its children. So a Marey `group { alpha: 0.5 }` containing three
shapes renders at 0.5 in Marey and at 1.0 in Lottie — with a file that parses
without complaint.

The resolution:

- **Transforms stay parented.** A child layer carries `parent: <group ind>` and
  its parent-local `p`/`r`/`s` go through untouched.
- **Opacity and visibility flatten.** A layer's emitted `o` is the product, over
  itself and every ancestor, of `visible ? alpha : 0`, times 100.

The asymmetry is principled rather than expedient. Composing *transforms* down
the tree is what §2's parented-layer choice exists to avoid: rotation combined
with non-uniform scale produces a shear, which Lottie's
anchor/position/scale/rotation transform can express only through `sk`/`sa`,
whose decomposition is fiddly and varies between players. Composing *opacity* is
scalar multiplication. It is associative, exact, loses nothing, and has no
analogue of the shear problem. The two cases are different, so they get
different treatments.

Folding `visible` into opacity is the same decision in smaller form. Lottie has
no per-frame visibility flag — `ip`/`op` are per-layer, not per-frame, so they
cannot express "hidden for frames 40–70 and visible again after". `visible` is
written by `cullEscapedBodies` inside `advanceOneTick()` when a body leaves the
scene by `CULL_MARGIN`, and it is exactly the field Phase 4's whole-branch
review found `FrameSnapshot` silently dropping. Baking it as opacity 0 is
visually identical and is the only encoding the format offers.

---

## 6. Layer order, the background, and the document envelope

### 6.1 Order

`typeChecker/builder.ts:265-269` and `:293-297` sort children by `props.layer`
ascending with a stable original-index tiebreak. Nothing in
`src/compiler/renderer/` reads `layer` again — confirmed by grep at `6d8db3d`.
So **IR child order already is paint order**, and `snapshotFor`'s depth-first
walk preserves it.

Lottie draws array-earlier layers *above* later ones, the opposite of PixiJS's
child order. The `layers` array is therefore the **reverse** of traversal order.
This is the single claim in this section the published specification did not
settle (§11), and it must be verified in the player before the ordering is
trusted.

Parenting constrains nothing here: `parent` refers to a layer by `ind`, which is
an identifier rather than an array position, so reversing the array does not
disturb any parent link.

### 6.2 Background

Lottie's animation object has no normative background-colour field. A scene's
`background` is therefore emitted as a **solid layer (`ty: 1`) at the bottom of
the stack**, sized to the scene. Without it the artifact renders on transparency
while Marey's PNG renders on the scene colour, and every pixel comparison in
§8.3 would be measuring the background rather than the motion.

### 6.3 Envelope

| Field | Value |
|---|---|
| `fr` | `plan.fps` |
| `ip` | `0` |
| `op` | `plan.frameCount` |
| `w` / `h` | `ir.width` / `ir.height` |
| `nm` | the scene's source-file stem |

Scene `fit` is **not** baked and is **not** a diagnostic. `fit` is viewport
layout — `renderer/adapter.ts` owns it, alongside the canvas and the ticker —
and it governs how the scene maps into a host element, which is the embedding
page's concern in Lottie and has no counterpart in the artifact. A Lottie file
carries intrinsic `w`/`h` and the player decides the fit. This is a documented
non-bake, not a silent degradation: nothing about the scene's content is lost.

---

## 7. Keyframe encoding

### 7.1 One keyframe per output frame, linear

The sampler produces exactly one `FrameSnapshot` per output frame, and the
Lottie `fr` equals the sampler's `fps`. So keyframe `t` values are the frame
indices `0 … frameCount − 1` directly, with no time conversion and no rounding.

Interpolation is **linear**, not hold. At integer frames the two are identical,
since there is a keyframe at every frame; they differ only when a player samples
between frames — which happens whenever the display rate is not the animation
rate. Linear matches what Marey's own preview does between ticks; hold would
render visibly stepped motion on a 60Hz display showing a 24fps export.

### 7.2 Constant-track collapse

A 240-frame scene with twenty static objects is 24,000 keyframes, nearly all of
them identical. Where a track's value never varies across the whole export, emit
a **static** property (`{a: 0, k: value}`) instead of a keyframe array.

This is a size and legibility measure, and legibility is a product property
here: roadmap §2 states the niche is "motion graphics as readable, generative
source code", and an artifact whose diff is 24,000 identical lines is not
readable. It is also a **judgment call in the AGENT-LESSONS §2d sense** — the
file is correct either way, and a suite that passes with the collapse disabled
has no opinion about it. §8.2 requires it be pinned.

The comparison that decides "never varies" is exact equality against the first
frame's value. Not an epsilon: two values that differ in the last bit are
different values, and a track that drifts by one ULP per frame is animating.

---

## 8. Verification obligations

Beyond the Global Constraints the implementation plan will carry, this phase
owes four things specifically.

### 8.1 The `compiler.worker.ts` test, first

`compiler.worker.ts` has **no automated test at all**. It was rewritten wholesale
in Phase 4 and its correctness currently rests on an unreachability argument plus
one manual browser observation. Phase 4's independent reviewer named it as Phase
5A's first task, and Phase 4's own execution notes promote it out of the
deferred-minors list on the grounds that its blast radius is larger than "minor"
describes.

**A corrected number, re-derived rather than quoted.** Phase 4's execution notes
describe this as "a 133-line worker deletion"
(`plans/2026-09-10-phase-4-composition-and-export.md:2597`), and that figure has
since been repeated onward. Measured at `6d8db3d`, it is wrong in both readings:
the wholesale-rewrite commit `692ba57` is `+60 / −116`, and the net across the
whole phase (`git diff --stat f032991 6d8db3d -- src/compiler/compiler.worker.ts`)
is `+83 / −119`. Nothing turns on the difference — the file is untested either
way — but it is a textbook AGENT-LESSONS §1 case of a number travelling from a
report into three later documents without anyone re-running it, and correcting
it here is cheaper than letting it travel further.

Two things depend on it and neither is guarded:

- its **branch order** — six exits, each emitting a different prefix of the log
  sequence, selected by `thrown`, `tokenCount === 0`, `firstPhase === "PARSE"`
  and `firstPhase === "TYPE"`;
- its **six log-line prefixes** — `[lexer]`, `[parser]`, `[type]`, `[pixi]`,
  `[render]`, `[system]` — which the Terminal pane renders and which
  `visual-check/check.mjs:89` scrapes with `/^\[(lexer|parser|type|pixi|render|system)\]/`.

  Phase 4's notes correct an earlier overstatement here and the correction
  stands: what `check.mjs` matches is the six **prefixes**, not the full message
  text, so a message rewrite after the prefix survives it. The prefixes are the
  contract; the wording after them is not.

This lands **before anything else touches the compiler surface**, so that every
later task in the phase is working against a guarded worker rather than an
unguarded one.

The worker is a `self.addEventListener("message", …)` module with no exports,
and the suite runs under Vitest's `node` environment where `self` does not
exist. The test therefore installs a fake `self` capturing `addEventListener`
and `postMessage`, then dynamically imports the module. **It is deliberately a
test of the shipped file with no production refactor**: extracting a pure
`handleMessage(data)` would make the test easier and would also mean the test no
longer guards the artifact that actually runs in the browser.

### 8.2 Delete-and-run, on this phase's specific decisions

Per AGENT-LESSONS §2c, for every behaviour a task requires, delete the line that
implements it and run the suite; anything still green is untested. Where a
change touches N call sites, revert each **separately**.

Four decisions in this design are the §2d shape — correct-either-way choices
that a suite will not notice — and each owes a test that makes it load-bearing:

1. The constant-track collapse (§7.2): disable it, emit full keyframe arrays,
   and the file is still correct.
2. Linear rather than hold interpolation (§7.1): identical at every integer
   frame, so only a sub-frame assertion or a rendered comparison can tell.
3. The reversed layer array (§6.1): a scene whose objects do not overlap renders
   identically either way.
4. The opacity/visibility flattening (§5): a scene with no nested alpha renders
   identically either way.

Each needs a fixture that *overlaps*, *nests*, or *varies* in the dimension the
decision governs. A fixture that does not is the AGENT-LESSONS §2a failure —
a test shaped to the fixture rather than to the requirement.

### 8.3 Two tolerances, measuring different things

**Numeric, headless, exact.** Re-parse the emitted JSON and assert every
keyframe value equals the value computed from the corresponding
`ObjectSnapshot` — `rotation × 180/π`, `scale × 100`, composed opacity × 100 —
with `===`, not an epsilon. Doubles round-trip through `JSON.parse`/`stringify`
at full precision, and the assertion compares against the same computation the
encoder performs, so exactness is achievable rather than aspirational. If it
turns out not to be, that is a **finding to report**, not a tolerance to widen
quietly.

**Pixel, in the browser, documented.** Render the emitted file in lottie-web in
Chromium and compare selected frames against Marey's own PNG export of the same
scene at the same frames. The tolerance is stated as two numbers — a maximum
per-channel delta and a maximum share of pixels exceeding it — and both are
*measured and then written down*, not guessed in advance and asserted.

The two catch disjoint failures, which is why both exist. The numeric half is
the only one CI can run, and it cannot see a file that encodes correct numbers
into a structure the player draws wrong. The pixel half sees exactly that and
cannot run headlessly.

### 8.4 Look at the rendered output

Phase 4's headline failure mode was a blank image reported as success. This
phase's is a Lottie file that parses, plays, and shows the wrong thing. Every
unit mismatch in §3 and every geometry offset in §4.2 produces precisely that.

So: the images get **read**, not just the harness's pass line. If that cannot be
done in a given session, the report says so plainly rather than implying a look
that did not happen.

Two environment traps, both of which have already cost this repository a false
pass. `visual-check` needs `npx vite --port 5199 --strictPort`; without
`--strictPort` a stale server absorbs every capture and reports a confident
pass, which has happened twice. And the server must be killed afterwards with
the port confirmed free, because a killed agent will not clean up after itself.

---

## 9. Exit criteria (roadmap §7.1)

| # | Criterion | What settles it |
|---|---|---|
| 1 | A physics scene plays correctly in a third-party player with no Marey code | `compound-logo.marey` — the one canonical scene that genuinely animates, hands off, and settles under simulation — exported to Lottie and played in lottie-web in Chromium, with the frames read. The emitted file must contain no reference to Marey or Matter.js |
| 2 | Frame comparison against Marey is within a documented tolerance | §8.3, both halves. The pixel tolerance is measured and recorded with the command that reproduces it |
| 3 | Every unsupported feature produces a named diagnostic, not a silent omission | A `LOTTIE_*` diagnostic per refused feature, each with a test, and a delete-and-run check per diagnostic confirming the suite notices its absence |

Criterion 1's "no Marey code" is checkable rather than assertable: the artifact
is a JSON file, and the check is that playback needs only the player and that
file.

---

## 10. Out of scope, and deferrals

| Item | Disposition |
|---|---|
| `text` | **Cut for this phase**, R17. The Lottie text layer is not normatively stable |
| `line` | **Deferred, not cut.** Outside roadmap §7's four kinds. Lottie can express a stroked polyline (`sh` + `st`), so this is scope discipline rather than a limit. A later phase may add it without redesign |
| Scene `fit` | **Not baked, by design** (§6.3). Viewport layout, not scene content |
| Colour animation | Not expressible in the language — the validator admits only position/rotation/scale/alpha, and `tickAnim` has no colour branch. Nothing to bake |
| `.lottie` (dotLottie) container | Out of scope. A ZIP envelope around the same JSON; it adds packaging, not fidelity |
| Expressions, masks, mattes, effects, gradients | Out of scope. None has a Marey counterpart |
| A second, independent renderer (ThorVG/dotlottie-web) | **Evaluated during implementation, not promised.** Added only if it is genuinely cheap inside the same harness; if it is not, the report says so rather than quietly dropping it |
| Streaming the emitted JSON | Out of scope, and inherited: `hashFrames` already materialises the whole frame sequence as one string, which Phase 4 deferred with the note that Phase 5B's longer exports will need it |

---

## 11. Claims this document could not settle

Listed separately and by name because the rest of this document was derived from
source or from the published specification, and these were not. Each is an open
question for implementation to answer **by measurement**. None may be treated as
settled by this document's confidence in it.

1. **Lottie layer stacking order** (§6.1). The composition page does not state
   whether array-earlier layers draw above or below later ones. The design
   assumes *above*, and therefore reverses the array. Verify in the player with
   a deliberately overlapping fixture before trusting it.
2. **Whether Lottie parenting propagates opacity** (§5). The spec states
   `CTM(child) = CTM(parent) × Transform(child)`, which is a statement about the
   transform matrix and says nothing either way about opacity. The design
   assumes it does *not* propagate, following After Effects' model, and
   flattens opacity accordingly. If it turns out opacity *does* propagate in
   lottie-web, the flattening double-applies and every nested alpha is wrong.
   Verify with a nested fixture whose group and child both carry non-1 alpha.
3. **The shape-list field name on a shape layer.** Believed to be `shapes`; two
   spec fetches did not confirm it. Read the schema.
4. **The version field's name and form.** The community spec documents `ver` as
   a 6-digit `MMmmpp` integer, while shipped bodymovin files carry `v` as a
   string like `"5.7.4"`. These are not the same field. Determine what
   lottie-web actually accepts, and prefer what real files use over what the
   document says if they disagree.
5. **Whether `op` is inclusive or exclusive.** The spec calls it "the frame the
   animation stops/loops at, which makes this the duration in frames when `ip`
   is 0" — which reads as exclusive, but "stops at" reads as inclusive. For
   `frameCount` frames indexed `0 … frameCount − 1`, the design emits
   `op = frameCount`. An off-by-one here shows up as a duplicated or dropped
   final frame, which the §8.3 numeric check will not see and the pixel check
   will.
6. **The exact linear easing handle values.** Every keyframe example in the spec
   carries `i`/`o` handles; what a player does when they are absent is
   unstated. Determine whether omitting them yields linear interpolation, and if
   not, what explicit handle values do.

Items 1, 2 and 5 are the dangerous ones: each produces a file that parses
without error and plays without warning, and each is invisible to every headless
assertion in §8.3's numeric half.

> **Correction (2026-09-12, Phase 5A Task 4 execution):** all six items were
> measured in a real player — lottie-web 5.13.0's `canvas` renderer, in
> Chromium via `tools/visual-check/lottie-check.mjs` — rather than
> left as this document's confidence in them. **Every one of this document's
> assumptions was confirmed; none was falsified**, so Task 3's output
> (`lottieEncode.ts`) needed no code change. Recorded here per AGENT-LESSONS
> §1 and §2d — a judgment call that happens to be correct still needs the
> measurement on record, not just the confidence.
>
> 1. **Stacking order — CONFIRMED.** Fixture
>    `scenes/lottie-layer-order.marey`: two overlapping opaque rectangles,
>    `back` (red, declared first) fully containing `front` (blue, declared
>    second). Sampled via `getImageData`: centre `(100,100)` (covered by
>    both) → `rgba(0,0,255,255)` — blue, i.e. `front`, is on top, matching
>    Marey's own PixiJS paint order (later `addChild` draws on top).
>    `(30,100)` (covered by `back` only) → `rgba(255,0,0,255)`, confirming
>    `back` is drawn at all. Array-earlier layers draw **above** later ones,
>    exactly as assumed; `lottieEncode.ts`'s `.reverse()` and the two tests
>    that pin the reversed order stand unchanged.
> 2. **Opacity propagation — CONFIRMED.** Fixture
>    `scenes/lottie-opacity-flatten.marey`: a `group` at `alpha: 0.5`
>    containing a white `rectangle` at `alpha: 0.5`, on a black background.
>    Sampled at the child's centre `(50,50)`: `rgba(64,64,64,255)`.
>    `64 / 255 ≈ 0.251`, i.e. 25% — the flattened, non-propagating value —
>    not the ~12.5% a double-application would produce. lottie-web does
>    **not** propagate opacity through its own parent chain, matching After
>    Effects' model as assumed; `composedOpacity`'s flattening stands
>    unchanged.
> 3. **Shape-list field name — CONFIRMED, for free.** Both fixtures above
>    render visible geometry at all, which is only possible if `shapes` is
>    the field lottie-web's shape-layer parser reads. No dedicated fixture
>    needed, per the controller's ruling.
> 4. **Version field — CONFIRMED.** Fixture
>    `scenes/lottie-version-field.marey`, exported once and then rendered
>    twice: once as emitted (`v: "5.5.2"`), once patched via
>    `--unset v --set ver=550502` to carry only the community-spec `ver`
>    integer. Both rendered the pixel-identical circle
>    (`rgba(34,204,136,255)` at `(50,50)`, matching `#22cc88` exactly), with
>    zero console or page errors either way. Reading lottie-web 5.13.0's own
>    bundled source (`build/player/lottie.js`) resolves why: `animationData.v`
>    is read directly by `checkVersion()` (defined at line 612, consulted by
>    `checkText`/`checkChars` and several other version-gated compatibility
>    branches at lines 655, 672, 779, 839 and 915) wherever a version check
>    happens; `animationData.ver` is never read anywhere in the bundle. `v`
>    is confirmed as both the field
>    lottie-web actually consults and the one real bodymovin files carry, as
>    assumed; `LOTTIE_VERSION = "5.5.2"` under the key `v` stands unchanged.
> 5. **`op` inclusive vs. exclusive — CONFIRMED exclusive.** Fixture
>    `scenes/lottie-outpoint.marey`: `frameCount = 4` (indices 0..3), a
>    rectangle sliding from `x=20` (frame 0) to `x=180` (frame 3, its true
>    end value, not an in-between one). Sampled frames 0 and 3 each show the
>    mover at its correct endpoint with no duplication or drop. Sampling
>    frame **4** (`== op`) is the sharpest evidence: **the entire
>    composition — the moving rectangle and the opaque background solid
>    alike — renders fully transparent** (`rgba(0,0,0,0)` at every sampled
>    point, and the capture visibly shows the host page through the canvas).
>    This is consistent with `lottie-web`'s own `totalFrames = op - ip`
>    (`AnimationItem.prototype.configAnimation`, `build/player/lottie.js:1653`),
>    which makes frames `[ip, op)` — `0..frameCount-1` here — the entire
>    playable content and frame `op` itself already past it. `op =
>    frameCount` is correct as emitted; no change.
> 6. **Linear easing handles — CONFIRMED** (§11.3's sibling: already settled
>    from primary source per the controller's ruling, but still given its
>    own half-frame sample). Fixture `scenes/lottie-easing-halfframe.marey`:
>    a two-keyframe position track, `x=10` at frame 0 to `x=110` at frame 1.
>    Sampling frame **0.5** with the emitted `i: {x:[1],y:[1]}` /
>    `o: {x:[0],y:[0]}` handles places the shape at exactly `x=60` — the
>    arithmetic midpoint, confirming true linear interpolation rather than
>    an approximation. A supplementary probe (not one of the six required
>    fixtures) stripped `i`/`o` from the same document and re-sampled frame
>    0.5: no JS exception was thrown and no `error` event fired on the
>    `AnimationItem`, but the shape rendered **nowhere** — a fully black
>    frame at all three sampled x-positions. This refines, without
>    reversing, `lottieEncode.ts`'s own docstring claim of a thrown
>    `TypeError`: in lottie-web 5.13.0's `canvas` renderer the failure is
>    swallowed even more silently than that — a wrong-but-loud crash would
>    be the *better* outcome — which if anything strengthens the case for
>    always emitting explicit handles. No change to the emitted values.
>
> Evidence, commands to reproduce, and the PNGs read back for each fixture
> are in `.sdd/2026-09-11-phase-5a-baked-lottie/task-4-report.md`.

---

## 12. Task shape

Tiered per AGENT-LESSONS §7b — ceremony tracks risk, not task size.

| # | Task | Tier |
|---|---|---|
| 0 | `compiler.worker.ts` test (§8.1). Independent of everything below; lands first | Integration |
| 1 | `planLottie` + the `LOTTIE_*` diagnostics. Pure, one file, complete spec | Mechanical |
| 2 | `lottieGeometry.ts` — the IR walk, the per-kind mapping of §4.2, colour conversion, parent links | Integration |
| 3 | `lottieEncode.ts` — the envelope, the unit conversions of §3, the opacity flattening of §5, keyframes and constant-track collapse | **Architecture** |
| 4 | Resolve §11 empirically in the browser; fix whatever it falsifies | **Architecture** |
| 5 | The Playwright harness, the measured tolerances, and the canonical-scene evidence | Integration |
| 6 | Documentation, execution notes, and the phase-status update | Integration |

Task 3 is the one with real risk: every unit mismatch in §3 lives there, and a
mistake in any of them produces a file that parses and plays. Task 4 exists as
its own task rather than as a step inside Task 5 because §11's six open
questions are the phase's largest single source of uncertainty, and resolving
them may change Task 3's output.

Both phase-status locations — `docs/architecture/README.md`'s "Current phase"
line and `roadmap-and-process.md`'s phase bullet — are updated in the **same
edit** at the merge, per AGENT-LESSONS §5b, which records that all three
transitions before Phase 4 shipped stale.
