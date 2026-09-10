# Marey Phase 3C — Motion Primitives

**Date:** 2026-09-09
**Status:** Approved design.
**Authority:** Implements §5 of
`2026-09-09-marey-engineering-roadmap-design.md`, which is authoritative from
Phase 3C onward. Nothing here overrides that document; where this design is
more specific, it is a refinement of §5.1's required capability and §5.2's exit
criteria, not a substitute for them.
**Preserves:** D13 (explicit bodies), D15 (bbox centre vs centroid), D16 (a
group's pivot is its local origin), D17 (physics only under a static group),
D18 (an `animate` inside a physics group is visual-only), and the language cuts
of roadmap §4.

---

## 1. Why this phase exists

Three gaps were found on 2026-09-09 by writing explainer scenes against the
current language and rendering them in Chromium — by construction, not by
reading. Roadmap §5 records them. In short: there is no `delay`, so a staggered
reveal costs a six-line no-op `sequence` wrapper per generated object and a
fixed-period travelling wave is unwritable at any length; there is no origin
control, so a bar rising from a baseline needs a hand-computed centre
coordinate; and `scale: (1, 0)` is a compile error, so "grow from nothing" —
the most common single idiom in explanatory motion — must be spelled `0.001`.

This phase is deliberately small and deliberately first. Export bakes whatever
the language can express (R16), so a gap left open here is permanent in every
artifact Marey ever produces.

`from` on `animate` is **out of scope**, per roadmap §5.1. Declaring the start
value on the object covers the cases this phase cares about, and §13 catalogues
`from` as post-finish-line capability.

---

## 2. The one real design question: what `TYPE_INVALID_SCALE` protects

Roadmap §5.1 requires this invariant be established *before* the rule is
relaxed. This section is that answer. It is written first because the other two
features do not depend on it and it is the only part of 3C that is not
mechanical.

### 2.1 What the check claims to protect

`TYPE_INVALID_SCALE` was introduced in `4dfb48c` (2026-03-20). That commit's
message states the rationale verbatim:

> Ban negative and zero scales (`<= 0`) across all axes to strictly prevent
> WebGL matrix inversion bugs and unexpected bounds mirroring in PixiJS.

So the claim has two halves: a **matrix-inversion** hazard, and **mirroring**.

### 2.2 Neither half survives contact with the codebase

**There is no matrix inversion to protect.** PixiJS inverts a local matrix in
two places a project can reach: hit-testing through the event system, and the
`width`/`height` *setters*, which compute `scale.x = value / localWidth`.
Marey uses neither. `eventMode` is never set on any container, so the event
system is inert. Nothing in `src/` assigns `.width` or `.height` on a
`Container`; every shape is sized by explicit `Graphics` primitives at build
time. The one bounds call that exists, `getLocalBounds()` at
`renderer/builder.ts:282`, composes child transforms rather than inverting one,
and its only consumer is `__baseSize`, which nothing in `src/` reads.
`fit` scales the scene root from the viewport size in `adapter.ts:67-87`,
independently of any object's scale.

**Mirroring is already reachable, so the check does not prevent it.**
`validator.ts:408-421` validates an `animate` block's `to` by *kind* only —
whether it is a number or a point — and never by sign or magnitude. Both of
these compile with zero errors on `main` at `f367544`, confirmed by running the
`.eval` harness over them:

```marey
animate { property: scale, to: (1, 0), duration: 1 }     // zero: compiles
animate { property: scale, to: (-3, 1), duration: 1 }    // mirrored: compiles
```

A rule that rejects a literal while admitting the identical value one line
later, through the property whose entire purpose is to change that value over
time, is not an invariant. It is a speed bump on the declaration site.

### 2.3 What is genuinely load-bearing

A zero scale is unsafe in exactly two places, and both are in the physics seam
rather than in PixiJS. The distinguishing question is not "is the scale zero"
but **whose** scale it is.

| # | Path | Failure | Whose scale reaches it |
|---|---|---|---|
| 1 | `renderer/transform.ts:68` — `toLocal` divides by `t.sx` and `t.sy` | `±Infinity`, or `NaN` when the numerator is also zero, written straight onto `layout.currentPos` by `syncWorldToContainers` (`physicsSync.ts:198`) and `snapContainerToBody` (`:228`) | The **ancestor chain's** composed scale. `t` is `__bodyTransform`, set at `physicsSync.ts:109` from the ancestors of a body-owning container. |
| 2 | `physicsWorld.ts` — `polygonBodyAtBboxCentre` → `Matter.Vertices.centre` → `Vector.div(centre, 6 * area)` | `NaN` body centre; a zero-scaled polygon has zero area. Confirmed in `../matter-js-master/src/geometry/Vertices.js`. | A **child's**, baked into a compound part by `builder.ts:103` (`p.x * t.sx`). |

And one place it is already safe, which matters just as much:

| Path | Why it is safe |
|---|---|
| An object's **own** scale reaching its own body | `physicsWorld.setScale` (`:485-486`) clamps `\|s\| < 1e-4` to `1e-4` and takes `Math.abs`. Degenerate but bounded — no division by zero, no NaN. |
| A **rectangle or circle** compound part | `createPartBody` (`:262-271`) clamps with `Math.max(p.radius, 0.5)` and `Math.max(p.width, 1)`. The collider is silently 1px rather than degenerate. Only the polygon branch is unclamped. |

**The invariant, stated properly:** *no scale that participates in a physics
transform may have a zero component* — because the ancestor composition is
inverted by division and a compound part's polygon geometry is divided by its
own area. An object's own visual scale is not part of that invariant and never
was.

### 2.4 The relaxation, scoped

- **Zero is permitted** on any object that does not participate in physics.
- **Negative remains banned**, message and `TYPE_INVALID_SCALE` code unchanged.
  Mirroring is a distinct feature nobody has asked for, and `Math.abs` in
  `setScale` would make a physics object's collider silently disagree with its
  drawing. Note this ban is now *enforced* rather than merely declared — see
  §5.4.
- **Zero remains banned for physics participants**, under a single rule
  covering hazards 1 and 2 and the merely-degenerate own-body case together.

An object **participates in physics** when any of these holds:

1. it declares `physics` directly, or in any step of any `sequence` or
   `parallel` it owns — D13's rule, matching `physicsSync.hasPhysicsAnywhere`;
2. it is a descendant of a group that declares `physics` — its geometry is
   baked into that group's compound body;
3. it is a group with a physics descendant — its scale enters `__bodyTransform`
   and therefore `toLocal`'s divisor.

Clause 3 covers hazard 1. Clause 2 covers hazard 2. Clause 1 covers the
degenerate-own-body case, which is bounded rather than broken but is still not
something to let an author write silently.

The validator already walks ancestry for `TYPE_PHYSICS_IN_PHYSICS_GROUP` and
`TYPE_PHYSICS_IN_ANIMATED_GROUP`, so this needs no new traversal machinery.

### 2.4a The measured cost of one teachable rule — a known over-rejection

*Added at implementation (Task 6), from a Task 5 review finding. The rule above
is unchanged and is not to be narrowed on the strength of this note; §2.4 chose
one teachable rule over a minimal one, and this is what that choice costs.*

Clause 2 is **over-broad, in two directions that are now measured rather than
predicted**:

- **On the `to` side.** A zero animated `to` on a *child of a physics group* is
  rejected — but D18 makes such an `animate` visual-only. The child owns no
  body of its own, and `collectBodyParts` bakes the child's **declared** scale
  into the group's compound body at build time, so an animated zero reaches
  neither `toLocal`'s divisor (hazard 1) nor `Vertices.centre` (hazard 2). The
  rejection protects nothing in that one case.
- **On the declared side.** §2.3's own table already records that
  `createPartBody` clamps rectangle and circle parts with
  `Math.max(p.radius, 0.5)` / `Math.max(p.width, 1)`. Only a **polygon** child
  is genuinely hazardous, so a minimal rule would read: *you may write
  `scale: (1, 0)` on a rectangle inside a physics group, but not on a polygon.*

That sentence is the argument for keeping the rule as written. A rule an author
can hold in their head — *a zero scale is illegal wherever the object takes
part in physics* — is worth more than a rule that is exactly minimal and
unlearnable, and the diagnostic already names which of the three clauses fired.

What makes it safe to leave (AGENT-LESSONS §7): this is a **spurious rejection
carrying a named diagnostic**, not silent data loss. The author sees
`TYPE_ZERO_SCALE_PHYSICS` at the offending line and can write `scale: (1, 0.001)`
for that one nested case — the very workaround this phase deletes everywhere
else, which is the honest statement of the cost. No first-party `.marey` file
has the shape; re-verified at Task 6 across `eval/scenes`, `eval/scenes-r2`,
`eval/scenes-3b`, `tools/visual-check/scenes`, `src/store/defaultScene.ts`
and `docs/LANGUAGE.md`. If a future phase narrows it, the thing to narrow is
clause 2 alone, split by child kind, and the reason to do so is evidence that
authors hit it — not this note.

---

## 3. `delay`

### 3.1 Surface

An eighth property on `animate`:

```marey
animate {
  property: scale
  to: (1, 1)
  duration: 0.55
  delay: 0.14
}
```

`delay: number`, in **seconds**, matching `duration`'s unit. Default `0`.
Non-negative — `delay: 0` is legal and is the default, so the constraint is
"non-negative", not the existing `positive`. Declared once in
`LANGUAGE_CONTRACT.animate`; the type checker, Monaco hovers, snippets and
completions all derive from that entry, per `language-contract.md`.

### 3.2 Semantics

**The delay applies once, before the first iteration — never per `loop`
iteration.** This is a ruling, not an open question, and it is forced by
roadmap §5.2's third exit criterion: a fixed-period phase-offset animation must
be expressible. If the delay repeated, the period would become
`delay + duration`, and varying the delay across generated objects would change
period rather than phase — the exact defect §5 records for varying `duration`.
One answer satisfies the published criterion and the other makes it false.

Consequences, each stated so it can be tested:

- During the delay the object holds its declared start value. It does not jump.
- `yoyo` is unaffected; the delay precedes the whole loop, not each half.
- `handoff` is unaffected in kind; the delay shifts *when* completion occurs.
- Inside a `sequence`, a step's delay adds to that step's elapsed time, so the
  sequence's total duration includes it.
- **The runner exists, and holds its pins, from t=0.** `spawnAnim`
  (`sceneRuntime.ts:281-290`) pins `POS_ANIM` when a position runner spawns. A
  delayed position animation keeps that pin through its delay. The alternative —
  releasing the object to physics during the delay and then snapping it to the
  animation's start value — would make the simulation depend on the delay in a
  way no author would predict.

### 3.3 IR and renderer

`IRAnimation` gains `delay: number`, in seconds, beside `duration`. Seconds are
converted to ticks exactly once, at runner creation in `renderer/timeline.ts`,
through `sceneIR.ts`'s `secondsToTicks` — the same path `duration` already
takes. Nothing that mutates scene state gains a time argument; renderer
invariant 1 is untouched.

---

## 4. `origin`

### 4.1 Surface

```marey
rectangle bar {
  position: (x, baseline)
  size: (40, height)
  origin: (0.5, 1)          // bottom-centre
  scale: (1, 0)
  animate { property: scale, to: (1, 1), duration: 0.55 }
}
```

`origin: point`, default `(0.5, 0.5)`. Fractions of the object's **bounding
box**: `(0, 0)` is its top-left corner, `(1, 1)` its bottom-right, `(0.5, 0.5)`
its centre — today's behaviour, exactly.

Available on `circle`, `rectangle`, `polygon`, `line` and `text`.

Values outside `0..1` are **permitted**, and place the origin outside the
bounding box. This is not a feature being added so much as a restriction not
being written: forbidding them would cost a constraint, a diagnostic and a
test, and no arithmetic in §4.3 divides by anything that a large origin makes
small. It gives rotation about an external point for free.

`origin` chooses the point that `position` places, and the point that `scale`
and `rotation` act around. Those are one point, not two, because they are one
pivot in the scene graph.

### 4.2 Not on `group`, deliberately

`origin` on a `group` is a compile error, `TYPE_ORIGIN_ON_GROUP`.

D16 makes a group's pivot its **local origin**, never derived from where its
children sit, and `builder.ts:271` implements exactly that with
`localPivot = {x: 0, y: 0}`. A group therefore already has an author-controlled
origin: children are placed relative to it, so a group that should grow from
its bottom edge is written by placing its children above `(0, 0)`. Adding
`origin` to a group would require deriving a bounding box from its children,
which is the thing D16 exists to refuse.

This is a ruling on a settled decision rather than a quiet deviation, per
`roadmap-and-process.md`. It can be revisited; it should not be revisited by
accident.

### 4.3 Renderer: the pivot

`buildNode` currently computes `localPivot` five times, once per shape kind, as
that shape's bounding-box centre (`builder.ts:146, 159, 185, 223, 253`). Each
becomes the same expression:

```
localPivot = bboxMin + origin ⊙ bboxSize
```

At the default `(0.5, 0.5)` this reproduces every current value exactly,
including the precision the renderer guide calls out: for `polygon` and `line`
the bbox midpoint is **not** the centroid, and it stays not the centroid.

**One frame changes.** A polygon's `__bodyShape` points are currently expressed
relative to `localPivot` (`builder.ts:202-203`). They become relative to the
**bbox centre**. Today those are the same point, so this is a no-op refactor;
with `origin` they diverge, and centre-relative is the correct choice for two
reasons: it is what `__bodyShape`'s own declaration comment at `builder.ts:36`
already claims ("in local space with the origin at the bbox centre"), and it
keeps the collision *shape* independent of a purely visual property, so only
*placement* has to learn about origin.

### 4.4 Renderer: the physics seam

`position` now places the origin, but Matter places a body's **centre of
mass**. The reconciliation is one local vector — from the pivot to the bbox
centre — rotated and scaled by the object's own transform, applied at five
sites:

| Site | Direction |
|---|---|
| `physicsSync.bindPhysicsBodies:110` | pivot → centre, before `toWorld` |
| `physicsSync.syncWorldToContainers:198` | centre → pivot, after `toLocal` |
| `physicsSync.snapContainerToBody:228` | centre → pivot, after `toLocal` |
| `builder.collectBodyParts:128` | pivot → centre, per compound part |
| `sceneRuntime.pushAnimToWorld` position branch (`:259`) | pivot → centre, before `setPosition` |

The offset is `(0.5 - originX) · bboxWidth`, `(0.5 - originY) · bboxHeight` in
local units, and it is zero at the default origin — so every existing scene
takes the identical path it takes today, with an added `+ 0`.

**The new coupling, and the risk in this phase.** With a non-centre origin, a
**`scale` animation moves the body's centre**. PixiJS scales about the pivot;
Matter's `Body.scale` scales about the body's own centre. Today
`pushAnimToWorld`'s scale branch (`sceneRuntime.ts:269-278`) only calls
`setScale`, because with the pivot at the centre there is nothing to move. With
an origin at the baseline, the drawn object grows upward while its collider
stays put, and the two drift apart during exactly the idiom this phase exists
to enable. That branch must also call `setPosition` with the recomputed centre.

This is the only genuinely new behaviour in the phase, as opposed to a new way
to spell existing behaviour, and it is why §7 splits the physics work into two
tasks.

**A note on trust.** `localPivotX`/`localPivotY` in `__mareyLayout` and
`__baseSize` are, on `main` at `f367544`, **write-only**: `builder.ts` assigns
them and nothing in `src/` reads either. This design gives them their first
reader. They are therefore treated as unverified rather than as established
infrastructure, and get their own tests before anything depends on them.

---

## 5. Diagnostics

Three codes, chosen so that each rule is separately greppable and separately
testable.

| Code | When | Notes |
|---|---|---|
| `TYPE_INVALID_SCALE` | a negative `scale` component, anywhere | Existing code, **new wording** — see §5.1. |
| `TYPE_ZERO_SCALE_PHYSICS` | a zero `scale` component on an object that participates in physics per §2.4 | New. Names which of the three clauses matched, so the author knows whether the culprit is the object, its group, or its descendant. |
| `TYPE_ORIGIN_ON_GROUP` | `origin` on a `group` | New. Cites D16's local-origin rule and tells the author to place children relative to the group's origin instead. |

### 5.1 `TYPE_INVALID_SCALE`'s wording must change with its rule

Both existing messages state the old rule as a fact about the world:

```
'scale' must be greater than zero.
'scale' components must be greater than zero, but got (2, -1).
```

Once zero is legal for a non-physical object, both sentences are **false as
written** — an author who reads "must be greater than zero" and writes `0.001`
is exactly the workaround this phase exists to delete. The code is kept, because
the category (an unusable scale value) is unchanged and the code is what tooling
greps for; the wording must name *negativity* instead.

`validator.test.ts:656-680` pins both strings, so this is a deliberate,
test-visible change rather than a silent one. The replacement wording is a
choice for the implementing task, subject to §5.2's frame rule and to being
asserted on its full distinguishing text rather than a short substring
(AGENT-LESSONS §2b). It must not claim anything about zero, which by then is a
separate rule with a separate code.

This is the second consequence of §2 that reading the code alone would not have
surfaced: relaxing a rule silently invalidates the prose that announced it.

### 5.2 A message-composition obligation

Per AGENT-LESSONS §2e, any diagnostic composed from contract metadata must be
written out with a real value substituted and read as a sentence before it is
specified. `KIND_LABEL`'s entries carry articles and belong to the
"expects X, but got Y" frame; none of the three messages above may drop one
into a different frame.

### 5.3 Scope of the zero-scale rule

The rule applies to a declared `scale` property **and** to an `animate` block's
`to` when `property: scale`. Both reach the same runtime state; guarding one
and not the other is the defect §2.2 documents.

### 5.4 The narrowing, and its regression test

Bringing `animate`'s `to` under §2.4 is a **narrowing**: `to: (-3, 1)` compiles
on `main` and will stop compiling. Roadmap §5.2 requires that any narrowing of
`TYPE_INVALID_SCALE` carry a regression test, and this is the one. The test
must assert the rejection *and* name the value, so it cannot pass by way of a
neighbouring diagnostic — AGENT-LESSONS §2b.

No first-party `.marey` file uses a negative or zero animated scale; that is to
be re-verified by the implementing task rather than taken from this sentence,
per AGENT-LESSONS §3.

---

## 6. Verification obligations

These are design-level requirements, not a plan. The plan turns them into
steps.

1. **Goldens will move, and that is the expected result.** `sceneIR.ts` gains
   `IRAnimation.delay` and `origin` on five shape prop types — its first change
   since Phase 2. This is the inverse of Phase 3B, where an unmoved golden was
   the evidence that no expression reached the IR. Every moved golden is listed
   with its diff read before `vitest -u` is run, per the precedent in Phase 3B's
   execution notes.
2. **Delete-the-line-and-run, per behaviour.** AGENT-LESSONS §2c rung 4: for
   each behaviour this design requires, delete the line implementing it and run
   the suite. Anything still green is untested. The tie-break of §3b applies —
   a gap found in a behaviour this design *requires* is in scope to fix; a gap
   in an adjacent behaviour is filed.
3. **Flip the judgment calls.** Two decisions here have two plausible answers
   that would both pass a naive suite: delay-once versus delay-per-loop (§3.2),
   and `origin`'s default (§4.1). Each must be flipped to the other answer and
   the suite run; if nothing fails, the test that makes the decision
   load-bearing is missing, and the reasoning goes in a comment beside it
   (AGENT-LESSONS §2d).
4. **Both corpora and the canonical scenes stay green** — roadmap §5.2's last
   criterion. `eval/report.json` and `eval/report-r2.json` must be
   content-unchanged, checked with `git diff --stat`, never `git status`
   (AGENT-LESSONS §6).
5. **`docs/LANGUAGE.md` reaches the new surface.** Its fences are compiled by
   `languageDocs.test.ts`, so a language change that does not reach the
   reference cannot land green. That is the intended failure.
6. **Chromium.** The exit criteria are about what an author can write and what
   it looks like; the headless suite cannot see a canvas. Run `visual-check`
   with `npx vite --port 5199 --strictPort` — without `--strictPort` a stale
   server absorbs the captures and reports a confident false pass, which has
   happened twice.

---

## 7. Exit criteria

Roadmap §5.2's five, restated with the evidence that settles each.

| # | Criterion | Evidence required |
|---|---|---|
| 1 | A staggered reveal across generated objects needs no no-op sequence step | `bars-reveal` rewritten with `delay`, no `sequence` wrapper; line count recorded against the workaround version |
| 2 | A bar grows from a baseline without a hand-computed centre coordinate | The same scene's `parallel { animate position; animate scale }` collapses to one `animate scale`, with `origin: (0.5, 1)` and no computed centre |
| 3 | A fixed-period phase-offset animation is expressible | A scene where `duration` is constant across generated objects and only `delay` varies, rendered and seen to travel |
| 4 | `TYPE_INVALID_SCALE`'s invariant is documented, and any narrowing has a regression test | §2 of this document, plus the §5.4 test |
| 5 | The three canonical scenes and both authorability corpora stay green | §6.4 |

Additionally, and not in the roadmap: the three explainer scenes are promoted
from `.visual-check/explainer/` (gitignored, throwaway) to
`tools/visual-check/scenes/` as regression fixtures, in their rewritten
workaround-free form. A scene that documents a gap is worth keeping once the gap
is closed.

---

## 8. Task shape

Tiered by risk per AGENT-LESSONS §7b rather than uniformly, because uniform
ceremony on non-uniform risk was the most expensive process error of Phase 3B.

| # | Task | Tier |
|---|---|---|
| 1 | `delay` — contract, validator, IR, timeline, runner | Integration |
| 2 | `origin` — contract, IR, builder pivot; non-physics only | Integration |
| 3 | `origin` × physics, part 1 — static placement and write-back | Architecture |
| 4 | `origin` × physics, part 2 — scale-animation centre tracking | Architecture |
| 5 | The zero-scale rule and the `animate to` narrowing | Integration |
| 6 | Reference, fixtures, corpora, Chromium, evidence | Integration |

Tasks 3 and 4 are split because §4.4's new coupling is the one part of this
phase that is new behaviour rather than new syntax, and because the sizing test
from Phase 3B applies: if a single task needs more than two implementer rounds,
it should have been two tasks.

A reviewer **recommendation** is filed, not fixed, unless it blocks the next
task. Phase 3B spent roughly 600K tokens on unrequested hardening by treating
recommendations as blocking.

---

## 9. Out of scope

- `from` on `animate` — roadmap §5.1 and §13.
- `stagger` — roadmap §10, Phase 7, explicitly "`delay` having landed in 3C".
- Mirroring via negative scale — §2.4.
- `origin` on `group` — §4.2.
- Any relaxation of the physics-participant ban — §2.4.
- Spring easing, semantic layout, colour animation — roadmap §13 and §10.
