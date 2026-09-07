# Machine-authorability re-run — results

**Date:** 2026-08-27, hours after `docs/LANGUAGE.md` merged.
**Compare against:** `RESULTS.md`, the baseline, measured the same day **without** the reference.
**Protocol:** `BRIEFS.md`, identical to the baseline except that `docs/LANGUAGE.md` joins the
readable set. Same 20 briefs, same batching, four fresh authors, round 1 blind.

> **Phase 3A note:** this record predates the Phase 3A vocabulary renames. Any
> `def`, `handOff`, `sceneFit`, or `z` quoted below reflects the language as it
> was authored against at the time — the pre-3A spelling. The source fixtures
> in `eval/scenes-r2/` have since been migrated to the final vocabulary
> (`let`, `handoff`, `fit`, `layer`); the quotes, findings, and conclusions
> below are untouched and their conclusions are unchanged by the rename.

> **Phase 3B note, 2026-09-07:** Phase 3B removed `generate NAME from A to B`
> in favour of `generate NAME [, INDEX] in LIST`, and six fixtures in
> `eval/scenes-r2/` were migrated `from` → `in`. That rename is the **only**
> edit this corpus has received: no other line in it changed, and no fixture
> uses the new expression layer. Every migrated header starts at 0, so the
> generated object names are unchanged and `report-r2.json` is byte-identical.
> The quotes, findings, and conclusions below are untouched and unchanged by
> the rename, exactly as for the Phase 3A note above.
>
> The `bar-chart`, `radial-dots` and `timeline-ticks` fixtures are
> **deliberately** left hand-unrolled — seven separate `rectangle` blocks,
> twelve literal coordinate pairs, two overlapping `generate` loops — together
> with the author comments explaining why they were written that way,
> including the one that cites `docs/LANGUAGE.md`'s "Current limits" by name.
> That repetition is the measurement. It is the "before" that
> `eval/RESULTS-3B.md` measures Phase 3B's rewrites against, and rewriting it
> here would destroy the comparison. The rewrites live in a separate corpus,
> `eval/scenes-3b/`.
>
> The headline row *"Data-driven scenes needing hand-unrolling: 3 — unchanged,
> byte-for-byte structure"* below therefore still describes this corpus
> accurately. What changed is that the language no longer requires it; see
> `eval/RESULTS-3B.md`.

Re-run with:

```bash
EVAL_DIR=eval/scenes-r2 npx vitest run --config eval/vitest.config.ts
```

Scenes are in `scenes-r2/`; the baseline's are untouched in `scenes/`.

---

## Headline

**20 / 20 compiled clean, again.** Identical to the baseline, and uninformative — the metric
was already at ceiling and could not move. This was run as a regression check, not a
comparison.

The two comparisons that *can* move are below. They move in opposite directions, which is
the useful part.

| | Baseline | Re-run |
|---|---|---|
| First-pass compile rate | 20/20 | 20/20 — **unchanged, at ceiling** |
| Physics/sequencing questions answered from docs | 0 of 4 | **4 of 4, each with a citation** |
| Data-driven scenes needing hand-unrolling | 3 | **3 — unchanged, byte-for-byte structure** |

---

## Finding 2 is closed

The baseline's second finding was that the headline feature of two phases of engineering —
object-to-object collision — was documented nowhere a user could reach, along with three
other behaviours authors had to guess.

All four were put to the physics author as explicit KNEW-or-GUESSED questions. All four came
back **KNEW**, each naming the file and section:

| Question | Baseline | Re-run |
|---|---|---|
| Do objects collide with each other, or only scene edges? | *"I'm relying on an implicit shared-world behavior… if objects don't actually collide, this scene would just show four boxes falling straight through the floor."* | KNEW — Physics section opening, plus the `collideBounds` paragraph |
| What happens when a numeric `duration` expires? | Guessed correctly, but guessed | KNEW — "When duration expires" |
| Is `yoyo`'s `duration` a half-cycle or a full one? | *"the biggest uncertainty"* for `pulse-dot` | KNEW — cited independently by **three** authors |
| May an object set an initial value for a property it also animates? | Flagged independently by two authors | KNEW — Animation section |

Two things make this stronger than the authors simply agreeing with the document.

**The rules contradicted their priors and they followed the document anyway.** The yoyo rule
appeared in two authors' "surprises" lists, not their "confirmed" lists:

> Most other tools (CSS, GSAP timelines) treat a stated duration as the full cycle when
> alternate/yoyo is on… I would have gotten `pulse-dot.declare` wrong without it.

> `duration` expiring **freezes in place** rather than stopping simulation or removing the
> object — this is the opposite of what I'd assume from most engines. This directly shaped
> `freeze-mid.declare`.

**Documented rules did work at authoring time rather than at error time.** The physics author
caught their own `duration: indefinitely` inside a `sequence`, cited
`TYPE_SEQ_PHYSICS_INDEFINITELY`, and corrected it to a numeric duration — before anything was
compiled. The baseline had no way to know that rule existed short of hitting it.

The pivot correction found during review also earned its place: an author deliberately chose
zero-centroid triangle points for `spin-triangle` rather than rotate a polygon directly,
citing the bbox-centre-versus-centroid warning.

---

## Finding 1 is unchanged, and that is the correct result

The baseline's first finding was that the macro layer cannot express the cases that justify
it. Nothing about the grammar changed, so nothing about the code should have. Nothing did:

| Scene | Baseline | Re-run |
|---|---|---|
| `bar-chart` | 0 loops, 7 literal shapes | 0 loops, 7 literal shapes |
| `radial-dots` | 0 loops, 13 literal shapes | 0 loops, 12 literal shapes |
| `timeline-ticks` | 2 loops | 2 loops |
| `arc-row` | 1 loop | 1 loop |
| `scale-ramp` | 1 loop | 1 loop |

**This is the control.** Had hand-unrolling vanished, the measurement would be broken, not the
language fixed. It confirms the two findings are independent and that a reference cannot
substitute for a grammar feature.

### What did change: how the authors got there

The baseline authors discovered the limits by hitting them. These authors were told:

> `docs/LANGUAGE.md`'s "Current limits" section states plainly that there is no `sin`/`cos`…
> I did exactly that: computed all twelve (x, y) pairs myself.

> The "Current limits" section directly naming *this exact scenario* — "a chart driven by
> seven data values" — was unexpectedly specific… which made the hand-unrolling call
> unambiguous rather than a guess.

`timeline-ticks` is the clearest case. The baseline author invented the two-overlapping-loops
workaround. This author applied it as a documented pattern. Same output; no search.

That is the dated limits section (spec L5) doing exactly what it was written to do. It does
not make the language more expressive and was never going to.

---

## New gaps this run found

Five, none of which the baseline could surface because there was no document to be incomplete.
**Four of the five share one shape**, which is the most useful thing this run produced.

### The reference states rules abstractly where authors need one worked example

Three separate uncertainties, all of the same kind:

- **`def` bound to an arithmetic expression.** The author avoided it entirely: *"The only `def`
  examples in all four files bind literals… I kept every `def` bound to plain literals."*
  **This is legal** — verified directly: `def denom = mid * mid` and
  `def half = (mid + 0.5) / 2` both compile. The author wrote worse code to dodge a
  capability that exists. An undocumented capability has a real cost, not a neutral one.
- **Point-list components referencing `def` names.** Judged safe, flagged as unshown.
- **Whether `physics` blocks accept the comma-joined single-line form.** Every `animate`
  example shows both styles; every `physics` example shows only one. The author played safe.

The reference states the arithmetic grammar correctly and completely. It was not enough. For
a machine author, **a rule stated abstractly is weaker evidence than the same rule shown once
in an example.** This is a concrete, cheap lesson for the Phase 5b docs site, and it argues
for worked examples at the edges of the grammar rather than more prose.

### Two behavioural gaps

- **Which value wins when two bodies with different `bounce` collide.** Undocumented. The
  answer is known and belongs in the reference: the physics design §6.6 records that Matter
  combines restitution with `max` and friction with `min`.
- **Bodies that start already overlapping**, as in `collide-stack`. Undocumented; the author
  guessed from physical intuition and said so.

### One documentation gap

- **Default values for omitted `alpha` and `color`.** Not stated anywhere in the four
  permitted files. The author sidestepped it by always declaring both. The reference states
  defaults for physics properties and easing, so this is an inconsistency rather than a
  scope decision.

---

## Caveats, so this is not over-read

Everything in the baseline's caveats still applies, plus three specific to this run.

- **The compile rate proves nothing here.** It was at ceiling before and after.
- **The authors were asked directly whether they knew things.** That is a leading question by
  construction. It is mitigated by requiring a file-and-section citation for every KNEW, and
  by the fact that three of the four answers appear in unprompted "this contradicted my
  expectation" lists — but a softer protocol would be better evidence.
- **One model family, one attempt, 20 briefs.** Still not a benchmark.
- **The scenes were compiled, not rendered.** As in the baseline, compiling is not being
  correct. No re-run scene was checked visually.
- **The briefs were written by someone who knew the language**, before the reference existed.
  They are therefore not biased *toward* the reference, which is the one direction of bias
  that would matter here.

---

## What to do about it

1. **Fix the five gaps above in `docs/LANGUAGE.md`.** All are behavioural, so all are in
   scope; none require the per-property tables Phase 3 generates. The `def`-expression gap is
   the highest value: it hides a capability authors then work around.
2. **Phase 3b is unaffected and still needed.** This run is direct evidence for it: the
   documentation is now good enough that authors know precisely what they cannot do, and
   `bar-chart` still cannot be written as a loop.
3. **Carry the abstract-rule-versus-worked-example lesson into Phase 5b.** It was learned
   cheaply here.
