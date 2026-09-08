# Machine-authorability baseline — results

**Date:** 2026-08-27, immediately after phase 1 merged, before phase 3 touches the grammar.
**Protocol:** see `BRIEFS.md`. Four fresh authors, no access to the compiler, the spec,
the plans or `AGENTS.md`. Round 1 written blind, nothing compiled until all 20 existed.

> **Phase 3A note:** this record predates the Phase 3A vocabulary renames. Any
> `def`, `handOff`, `sceneFit`, or `z` quoted below reflects the language as it
> was authored against at the time — the pre-3A spelling. The source fixtures
> in `eval/scenes/` have since been migrated to the final vocabulary (`let`,
> `handoff`, `fit`, `layer`); the quotes, findings, and conclusions below are
> untouched and their conclusions are unchanged by the rename.

> **Phase 3B note, 2026-09-07:** Phase 3B removed `generate NAME from A to B`
> in favour of `generate NAME [, INDEX] in LIST`, and six fixtures in
> `eval/scenes/` were migrated `from` → `in`. That rename is the **only**
> edit this corpus has received: no other line in it changed, and no fixture
> uses the new expression layer. Every migrated header starts at 0, so the
> generated object names are unchanged and `report.json` is byte-identical.
> The quotes, findings, and conclusions below are untouched and unchanged by
> the rename, exactly as for the Phase 3A note above.
>
> The `bar-chart`, `radial-dots` and `timeline-ticks` fixtures are
> **deliberately** left hand-unrolled — seven separate `rectangle` blocks,
> twelve literal coordinate pairs, two overlapping `generate` loops — together
> with the author comments explaining why they were written that way. That
> repetition is the measurement. It is the "before" that `eval/RESULTS-3B.md`
> measures Phase 3B's rewrites against, and rewriting it here would destroy
> the comparison. The rewrites live in a separate corpus, `eval/scenes-3b/`.

Re-run with:

```bash
npx vitest run --config eval/vitest.config.ts
```

---

## Headline

**20 / 20 compiled clean on the first pass (100%).**

That is a **ceiling**, and it makes the result less informative than it looks. The metric
intended to be the discriminator — how many error-feedback rounds a model needs to converge,
which is what would prove the validator is a moat — **could not be measured at all**, because
nothing failed. Either the briefs were too easy or the language is genuinely easy to author.

Four of the riskiest scenes were also rendered and checked against their briefs. All four
were semantically correct, not merely compilable: `arc-row` (parabola), `bar-chart` (values
3,7,2,9,5,8,4 proportional on a shared baseline), `radial-dots` (12 evenly spaced),
`grid-16` (4×4).

## What this does and does not support

It supports: **the grammar is not the bottleneck for machine authorship.** A model with zero
training data on Marey, given only the default scene and the IDE's completions, wrote
twenty non-trivial scenes that all compiled and rendered correctly. Several things the
authors were nervous about turned out to work — nested `generate`, grouped arithmetic like
`(i - 9.5) * (i - 9.5)`, reusing one object name across all iterations of a loop, `use`
inside `generate`. The language is **more capable than its documentation implies**.

It does not support the stronger claim that the *validator* is a differentiator. That claim
remains untested, and this brief set cannot test it.

## The two real findings

Neither is what the roadmap expected, and both are more actionable than the compile rate.

### 1. The metaprogramming layer cannot express the cases that justify it

This is the important one, because metaprogramming is the claimed differentiator against
GSAP, Lottie and Rive.

| Missing | Consequence observed |
|---|---|
| No trig | `radial-dots` could not be looped. The author hand-computed all twelve coordinates. Any radial, circular or wave layout is out of reach. |
| No arrays or indexing | `bar-chart` could not loop over its seven values. The author wrote seven `rectangle` blocks and seven `def`s. **This makes the data-driven use case largely unreachable.** |
| No modulo, no conditionals | `timeline-ticks` needed two overlapping `generate` loops to make every fifth tick longer, drawing short ticks underneath the long ones. |

`generate` handles "N of the same thing, spaced linearly." It does not handle *data*. Three
of the four data-driven briefs had to be partly hand-unrolled — exactly the work the layer
exists to eliminate.

### 2. Phase 1's headline feature is undocumented, and so is most of the physics model

The author of `collide-stack` wrote, without having read the compiler:

> there is no documented property for object-to-object collision … I'm relying on an implicit
> "shared world" behavior … If objects don't actually collide, this scene would just show four
> boxes falling straight through the floor.

Two phases of work, and nothing a user can read says objects collide. Also undetermined by
the authors:

- **What happens when a numeric `physics` `duration` expires.** Freeze in place, reset, or
  drift on? Guessed correctly, but guessed. (It is D4/D5 in the spec — internal only.)
- **Whether `duration` under `yoyo` means a half-cycle or a full there-and-back cycle.**
  Called "the biggest uncertainty" for `pulse-dot`. This silently halves or doubles the
  timing of every looping animation.
- **Whether an object may set an initial value for a property it also animates** — flagged
  independently by two authors.
- That `collideBounds` governs scene edges only, not drawn geometry.

**There is no README and no language reference.** The entire user-facing surface is the
default scene plus the IDE's hovers and completions.

## What this says about phase 3

Phase 3's stated purpose is unifying four drifted property tables. **The drift never once
caused a failure here** — no author tripped on `anchor`/`width`/`height`, and no scene failed
to compile. It is real debt and worth fixing, but on this evidence it is not the highest-value
thing in the phase.

On this evidence, ranked by what actually blocked an author:

1. **A language reference.** Cheapest, and it fixes the largest measured gap. It should state
   the physics model, freeze semantics, `yoyo` timing, and that objects collide.
2. **Expressiveness in `generate`** — at minimum a literal list to iterate, ideally modulo and
   trig. Without these the differentiator does not differentiate.
3. The property-table unification, which is what the phase currently is.

## Caveats, so this is not over-read

- **20 briefs, one model family, one attempt.** Not a benchmark.
- **The briefs were written by someone who knows the language**, so their difficulty is
  probably biased toward what is expressible.
- **The default scene is doing a lot of the work.** It is a deliberate motion test card that
  exercises nearly every timeline path, so it is an unusually strong worked example. A
  language whose only example was ordinary would likely score worse.
- Authors worked in batches of four to six briefs, so a later brief could benefit from an
  earlier one in the same batch. That mirrors a real user learning as they go.
- **Compiling is not being correct.** Sixteen of the twenty were never rendered.

## Re-running after phase 3

Keep the briefs and the protocol identical. The number to beat is 100%, so compile rate is
useless as a comparison — measure instead:

- Can `radial-dots`, `bar-chart` and `timeline-ticks` be written **without hand-unrolling**?
  That is the direct test of finding 1.
- Do the authors' uncertainty lists shrink? That is the direct test of finding 2, and it is
  the more meaningful signal of the two.
