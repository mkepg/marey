# A User-Facing Language Reference

**Date:** 2026-08-27
**Status:** Approved design. Not yet implemented.
**Slot:** A small piece of work before Phase 2. Not a roadmap phase.
**Related:** `2026-08-26-physics-shared-world-design.md` (§4 naming, D4/D5/D6/D8/D13),
`eval/RESULTS.md` (the measurement that motivates this)

---

## 1. Context

`eval/RESULTS.md` measured whether a model with no training data on Declare can author
scenes given only what the product shows a user. Twenty of twenty compiled on the first
pass. The compile rate hit its ceiling and told us little, but the authors' recorded
uncertainty told us a lot:

> there is no documented property for object-to-object collision … I'm relying on an
> implicit "shared world" behavior … If objects don't actually collide, this scene would
> just show four boxes falling straight through the floor.

Two phases of work produced object-to-object collision. Nothing a user can read says it
exists. Also undetermined by the authors: what a numeric physics `duration` does when it
expires, whether `yoyo`'s `duration` is a half-cycle or a full one, whether an object may
set an initial value for a property it also animates, and that `collideBounds` governs
scene edges rather than drawn geometry.

There is no README and no language reference. The entire user-facing surface is
`src/store/defaultScene.ts` plus Monaco's hovers and completions.

This design specifies `docs/LANGUAGE.md` to close that gap.

### 1.1 What this is not

Not a tutorial, not a guide, not examples-with-narration. Those belong on a documentation
website later, structured roughly as Matter.js's is. `docs/LANGUAGE.md` is the **formal
reference for the language** — the precise, checkable statement of what each construct
does. Its primary reader is a machine author or an experienced developer who wants an
exact answer, not a ramp.

No product change is in scope. The playground gains no docs panel, no link, and no new UI.

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| L1 | Behavioural content only; no per-property tables | The tables are Phase 3's to generate from the unified source. Hand-writing them now creates a fifth hand-synced list to solve a problem the eval showed nobody hit — twenty of twenty compiled on IDE completions alone. |
| L2 | Documented behaviour is enforced by tests, not by discipline | The stated reason for L1 — "behaviour can't drift" — is **false**, and believing it is the risk. See §3. The four existing property lists drifted because nothing failed when they diverged. |
| L3 | Written against today's names (`def`, `handOff`, `z`, `sceneFit`) | A reference must describe the language that exists. Phase 3's §4 renames are handled by L2's tests failing, plus an explicit task added to Phase 3's plan. |
| L4 | Every behavioural claim is verified against source before it is written | The spec is not a reliable oracle for this. `yoyo`'s half-cycle rule appears nowhere in it; the completion defect in §4.2 appears nowhere at all. Both were found by reading `timeline.ts`. |
| L5 | The macro layer's limits are stated explicitly, and dated | Missing arrays, trig, modulo and conditionals blocked three of four data-driven briefs. It is the largest measured blocker. Dating it makes its expiry visible when Phase 3 closes some of it. |
| L6 | `eval/BRIEFS.md` is amended and the eval re-run | BRIEFS.md currently lists exactly three readable files and asserts "there is no language reference — that absence is part of what is being measured." That sentence becomes false on merge. An unamended protocol makes the comparison meaningless. |
| L7 | The `yoyo` completion defect is documented as-is and filed for Phase 3 | Fixing it changes runtime behaviour of existing scenes and needs the `adapter.ts` harness Phase 3 builds. Widening a docs slot into a renderer change is how a small slot stops being small. |

---

## 3. Why "behavioural content cannot drift" is wrong

The scope split in §2/L1 is right. Its usual justification is not, and the difference
matters for what we build.

The reference does not duplicate a property *table*. It does duplicate **the grammar's
surface names**, and that is the axis about to move. Phase 3 lands §4's renames:

| Today | Phase 3 | Where it appears in this reference |
|---|---|---|
| `def` | `let` | The whole metaprogramming section |
| `handOff` | `handoff` | Sequencing, and the physics handoff rule |
| `z` | `layer` | Scene model |
| `sceneFit` | `fit` | Scene model |

So a reference written this week is wrong the week Phase 3 merges. That is not an argument
for deferring it. It is an argument that "only write what cannot drift" is the wrong
mechanism, because choosing it conceals the real exposure.

`RESERVED_PROPS` has reserved `anchor`, `width` and `height` — none of which exist — for an
unknown length of time, and the build stayed green throughout. Drift is not caused by
duplication. It is caused by **nothing failing when things diverge**.

The mechanism this design adopts instead is in §5.

---

## 4. Content

Seven sections. Each claim is one sentence, stated exactly, with units.

### 4.1 Sections

1. **Scene model** — the coordinate system; a container's pivot is its geometric centre and
   there is no `anchor`; `background`, `size`, `sceneFit`, `z`.
2. **Shapes** — `circle`, `rectangle`, `polygon`, `line`, `text`, `group`: what each requires
   and what geometry each contributes to physics (spec §6.5), including that `polygon` uses
   a convex hull, so a concave outline collides as its hull.
3. **Animation** — `property`, `to`, `duration` in seconds, `easing`; the four easing curves;
   `loop` and `yoyo` per §4.2; that a declared initial value is the animation's start value.
4. **Sequencing** — `sequence` and `parallel`, their nesting rules, at most one `sequence`
   per object; `handOff` and the velocity it produces.
5. **Physics** — the section the eval says is missing entirely. Objects collide with one
   another. Which objects get a body (D13). Per-object `gravity` in px/s². `airDrag`
   inverted. `bounce`. `collideBounds` as scene edges only, defaulting to `true`. `duration`
   expiry freezes in place, still collidable (D4/D5). Frozen versus asleep. Animation
   overrides physics for the animated property only (D6, D8).
6. **Metaprogramming** — `def`, `generate`, `template`/`use`; that named colours lex as
   keywords and so cannot be identifiers; then the limits of §4.3.
7. **Not covered here** — a short pointer saying the per-property type tables are generated
   in Phase 3, and that Monaco's completions are the current authority.

### 4.2 Facts already verified against source

Measured directly, not inferred from the spec. These are the answers the reference must
carry, and the seed for §5's assertions.

**`duration` is the half-cycle under `yoyo`.** A there-and-back cycle takes `2 × duration`.
Measured elapsed-tick sequence for `duration` of 10 ticks with `yoyo` and `loop`:

```
1..10, 9..0, 1..10, 9..0, …
```

Stated nowhere in the spec. Called "the biggest uncertainty" by the author of `pulse-dot`.

**`yoyo: true` without `loop: true` never completes.** It travels out, returns, then parks
at `elapsedTicks: 0, direction: -1, completed: false` indefinitely
(`timeline.ts:37-43`). Visually this is defensible — the object goes out, comes back, and
rests. But `advanceAnimTime` never returns true, so the completion side effects in
`tickAnim` never fire:

- the runner is never spliced, so `isIdle()` is never true and **the ticker never stops** —
  the same class of defect §6.9 fixed for `duration: indefinitely`
- if the object also declares `physics`, its `POS_ANIM` pin is **never released**, so the
  body stays static permanently and never falls
- `handOff` never fires; a rotation override is never released

Per L7 this is documented as current behaviour, with an explicit warning against pairing a
non-looping `yoyo` with a `physics` block, and filed as a Phase 3 defect.

**An animation starts from the value the object currently holds.** `spawnAnim` reads the
start value off the container at spawn time (`adapter.ts:190-202`); there is no `from`
property. So an object may set an initial value for a property it also animates, and the
animation runs from it. Two authors flagged this independently.

**`collideBounds` defaults to `true`** (`builder.ts:65`, `physicsSync.ts:57`).

### 4.3 The macro layer's limits (L5)

A section headed as current to v0.3.x, stating plainly that `def` binds a single scalar,
point or keyword, and that the layer has **no arrays or indexing, no trigonometry, no
modulo, and no conditionals**. Each limit is paired with the workaround an eval author
actually used — hand-computed coordinates for a radial layout, one block per value for a
bar chart, two overlapping `generate` loops for every-fifth-tick.

This is the language's largest measured gap and its differentiator against GSAP, Lottie and
Rive. Documenting it honestly costs nothing and saves an author a wasted round.

---

## 5. Anti-drift mechanism (L2)

A new `docs/language.test.ts`, running in the existing suite.

**Examples are compiled.** Every fenced ` ```declare ` block in `docs/LANGUAGE.md` that is a
complete scene is extracted at test time, run through the compiler, and asserted to produce
zero errors. The document is the only copy — no parallel fixture directory to fall out of
sync with it. Fences that are deliberate fragments are marked and skipped.

**Behavioural claims are asserted.** Each claim in §4.2 gets a test named after the heading
it appears under, so a failure points at the sentence it falsifies. Seeded by the probe that
produced §4.2.

This is what makes L3 safe. Phase 3's `def` → `let` rename cannot land green while
`docs/LANGUAGE.md` still says `def`, because every example in it stops compiling.

The mechanism does not cover prose that makes no compilable claim. That residue is accepted
and is why §4 keeps claims short and concrete rather than discursive.

---

## 6. Out of scope

| Item | Disposition | Reason |
|---|---|---|
| Per-property type tables | Phase 3, generated | L1. Would be a fifth hand-synced list. |
| README | Not now | The reference is the deliverable asked for. A README is an entry-point question that belongs with the docs site. |
| Docs site, tutorials, guides, examples | Later, own work | Explicitly deferred. Matter.js's site is the model. |
| Any playground UI change | Not now | No docs panel, no link. Keeps this a docs slot. |
| Fixing the `yoyo` completion defect | Phase 3 | L7. |
| Fixing the four drifted property lists | Phase 3 | Already that phase's stated purpose. |

---

## 7. Verification

- `npm test` passes, including the new `docs/language.test.ts`.
- `npm run build` passes.
- Every complete example in `docs/LANGUAGE.md` compiles, by construction of §5.
- Each fact in §4.2 has a named assertion.
- `eval/BRIEFS.md` is amended: `docs/LANGUAGE.md` joins the readable set, and the sentence
  asserting no reference exists is replaced by a note that the baseline predates it.
- The eval is re-run. **Compile rate is not the metric** — it is already at 100% and cannot
  improve. The metric is whether the authors' recorded uncertainty lists shrink, and
  specifically whether any author still reports not knowing that objects collide, what
  `duration` expiry does, or what `yoyo` timing means.

The eval re-run measures a document written for precision rather than for onboarding, so
treat a shrunken uncertainty list as confirmation and an unchanged one as informative about
the briefs rather than damning of the document.

---

## 8. Risks

- **Prose claims that no test can hold.** §5 covers examples and the §4.2 facts; it cannot
  cover a sentence like "frozen and asleep look identical." Mitigated by keeping claims
  concrete, not by tooling.
- **The document describes names that change in one phase's time.** Accepted under L3 and
  mitigated by L2. The failure mode is a red build, which is the intended one.
- **Writing a precise reference may surface more defects like §4.2's.** That is a benefit,
  but it is also unbounded scope. The rule for this slot: document what is found, file it,
  and do not fix it here.
