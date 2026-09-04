# Roadmap and process detail

`docs/specs/2026-09-01-declare-product-roadmap-design.md` is the
authoritative product roadmap from Phase 3 onward. The earlier
`2026-08-26-physics-shared-world-design.md` remains authoritative for the
motion-graphics direction, decisions D1–D18, and completed Phases 0–2; its
Sections 8–12 are historical and superseded. **Treat both documents' settled
decisions as deliberate**. If you believe one is wrong, say so explicitly
rather than quietly deviating.

## Phase history

- **Phase 0 — deterministic clock: done**, merged at `717de75`.
- **Phase 1 — shared Matter.js world: done** on `phase-1-shared-world`.
  Objects genuinely collide, tumble, settle and sleep. Adds decisions D13–D15
  and corrects §6.2's unit conversions, which were written against Matter 0.19.
- **Phase 2 — compound groups: done** on `phase-2-compound-groups`. A `group`
  with `physics` welds its children into one Matter compound body, so a
  multi-part logo tumbles as one object. Adds decisions D16–D18 and fixes two
  live defects §7 did not anticipate: a group's collision box was positioned at
  its origin while sized from its children's extent (measured 100px adrift), and
  any `physics` block inside any group simulated at local coordinates read as
  scene coordinates — so a `template` carrying physics placed every instance at
  `(0, 0)`. It also found and fixed three defects in the tick/paint seam that
  had nothing to do with groups; **read its execution notes before Phase 3**,
  particularly the note on why invariant 3's old wording caught none of them.
- **Phase 3A — language foundations, cuts, and renames: in review** on
  `phase-3a-language-foundations`. Unified the four hand-synced property
  lists into one contract, `LANGUAGE_CONTRACT` in `languageContract.ts`;
  removed its ghost reservations (`anchor`, `width`, `height`); landed `let`,
  `handoff`, `fit`, and `layer` with no compatibility aliases — the old
  spellings are now a named parse error, not silently accepted; retained the
  deliberate language cuts under an executable regression matrix; and fixed
  the deterministic-AST, validator (physics cost ceilings, physical-line
  rejection, handoff duration), yoyo-completion, and evaluation-harness
  (R1/R2 report-clobbering) defects. Migrated every first-party `.declare`
  fixture, corpus, and this guidance to the final vocabulary. Browser-checked
  across seven Chromium scenes and production-built; not yet merged.
- **Phase 3B — generative expressiveness.** Lists/iteration, indexing or length,
  modulo, comparison, a conditional value expression, and trig must eliminate
  hand-unrolling in `bar-chart`, `radial-dots`, and `timeline-ticks` before a
  new major subsystem begins.
- **Phases 4–5 — export and distribution.** Build one deterministic frame
  sampler, then PNG, a baked-Lottie subset, video, public compiler/CLI surfaces,
  CI integration, and embeddable output. Export moves ahead of more physics
  syntax because it validates the source-to-artifact product thesis.
- **Phase 6 — motion-graphics core and editor payoff.** Color animation,
  delay/stagger, scrubbing, and live-edit replay; semantic layout only when the
  Phase 3B evidence supports it.
- **Phase 7 — remaining physics syntax.** `world`, `lockPosition`,
  `lockRotation`, and `spin`; D13's explicit-body rule remains in force.
- **Phase 8 — full documentation site and adoption.** Minimal guides ship with
  each earlier capability; the full site follows stable syntax, export,
  distribution, and external workflow attempts.

## Reference docs

`docs/LANGUAGE.md` is the formal language reference, specified in
`docs/specs/2026-08-27-language-reference-design.md`. It documents
**behaviour only** — the physics model, freeze vs sleep, `airDrag`'s inverted
range, `yoyo` timing, `handoff`, animation-vs-physics precedence, and the
macro layer's limits. Per-property tables are deliberately absent; a later
phase generates them from `LANGUAGE_CONTRACT`, so the reference is not a
fifth hand-synced list. Its examples are compiled by
`src/compiler/languageDocs.test.ts`, so **a vocabulary rename cannot land
green while the reference still spells it the old way** — that is the
intended failure, not an obstacle; it is what forced Phase 3A's renames to
reach every example in the reference rather than leaving any behind. That
test also rejects any fence tag other than `declare` or `text`, because a
mistagged fence would otherwise be skipped silently and report green.

`docs/plans/` holds step-by-step implementation plans. Each has an
"Execution notes" section recording defects found during execution and issues
deliberately deferred — **read the previous phase's notes before starting the
next one.** Phase 1's record one gap Phase 2 or 3 should close: `adapter.ts` has
no test coverage, and all three bugs found by review were there.
