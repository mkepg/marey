# Roadmap and process detail

`docs/specs/2026-09-09-marey-engineering-roadmap-design.md` is the
authoritative roadmap from Phase 3C onward. It changed the project's purpose:
Marey now optimises for a **complete, provable engineering artifact with a
declarable finish line**, not for adoption. The door to users is left open —
package, license, CLI, README stay in — but acquisition work (a GitHub Action,
documentation integrations, a gallery, adoption metrics) moved past the finish
line. Read its §1 for the evidence that forced the change; two research
documents in `docs/research/` own the underlying measurements.

`2026-09-01-marey-product-roadmap-design.md` remains the historical record of
Phases 3A and 3B and of why export was pulled ahead of physics breadth. It is
superseded from Phase 4 onward. The earlier
`2026-08-26-physics-shared-world-design.md` remains authoritative for the
motion-graphics direction, decisions D1–D18, and completed Phases 0–2; its
Sections 8–12 are historical and superseded. **Treat all three documents'
settled decisions as deliberate**. If you believe one is wrong, say so
explicitly rather than quietly deviating.

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
- **Phase 3A — language foundations, cuts, and renames: done** on
  `phase-3a-language-foundations`, merged at `aa4ba0f`. Unified the four
  hand-synced property lists into one contract, `LANGUAGE_CONTRACT` in
  `languageContract.ts`; removed its ghost reservations (`anchor`, `width`,
  `height`); landed `let`,
  `handoff`, `fit`, and `layer` with no compatibility aliases — the old
  spellings are now a named parse error, not silently accepted; retained the
  deliberate language cuts under an executable regression matrix; and fixed
  the deterministic-AST, validator (physics cost ceilings, physical-line
  rejection, handoff duration), yoyo-completion, and evaluation-harness
  (R1/R2 report-clobbering) defects. Migrated every first-party `.marey`
  fixture, corpus, and this guidance to the final vocabulary. Browser-checked
  across seven Chromium scenes and production-built.
- **Phase 3B — generative expressiveness: done** on
  `phase-3b-generative-expressiveness`. Gave the language an expression layer:
  list literals (nestable), an inclusive `A to B` range, indexing and
  `length`, `%`, the six comparisons, `and`/`or`/`not`, `if C then A else B`
  in **value position only**, and `sin`/`cos` in **degrees**. `generate NAME
  from A to B` is removed in favour of `generate NAME [, INDEX] in LIST`, with
  generated names suffixed by the 0-based ordinal rather than the loop value.
  `pointList` folded into one `list` value kind with a `listOf` constraint, so
  indexing and `length` work on a point list without specifying every list
  operation twice. Every expression still folds to a literal during parsing, so
  `sceneIR.ts` is untouched by the whole phase. It also fixed the pre-existing
  physics silent-drop defect Phase 3A deferred (`TYPE_ONE_PHYSICS`), made the
  design's "data decides values, source structure decides shape" line
  executable in `languageCuts.test.ts`, and added `eval/scenes-3b/` — a
  demonstration corpus rewriting the three hand-unrolled acceptance scenes,
  measured in `eval/RESULTS-3B.md`. Both authorability corpora keep their
  evidence: the only edit in either is the mechanical `from` → `in` header
  rename, and both report JSONs are byte-unchanged. Browser-checked in
  Chromium and production-built. Fast-forwarded onto `main` with no merge
  commit — the phase's final commit is `1645cef`, and three findings from the
  whole-branch review landed after it at `e1dcdd8`. **Read its execution notes
  before Phase 4**: the plan's notes record the frame-selection and
  determinism evidence that Product Gate B builds on.
- **Phase 3C — motion primitives: done** on `phase-3c-motion-primitives`,
  pending the independent whole-branch review AGENT-LESSONS §8 requires. The
  three gaps were found by construction on 2026-09-09 — a staggered reveal cost
  a no-op `sequence` wrapper per object, a baseline-anchored bar needed a
  hand-computed centre coordinate, and `scale: (1, 0)` was rejected outright —
  and all three are closed. `animate` gained `delay`, in seconds, **spent once
  before the first iteration and never re-armed**, so a looping animation's
  period stays `duration` and varying `delay` across generated objects varies
  phase rather than period. Shapes gained `origin`, an `IRPoint` in normalised
  bounding-box units defaulting to `(0.5, 0.5)`, which becomes the container
  pivot — so `position` places the origin rather than the geometric centre, and
  `(0.5, 1)` is a bar that grows from a baseline. `origin` is deliberately
  **not** available on a `group` (`TYPE_ORIGIN_ON_GROUP`): D16 makes a group's
  pivot its own local origin, never derived from its children. The scale rule
  split in two: a negative component is still `TYPE_INVALID_SCALE` everywhere,
  now with wording that names negativity rather than claiming zero is illegal,
  while **a zero component is rejected only for objects that participate in
  physics**, as the new `TYPE_ZERO_SCALE_PHYSICS` — so `scale: (1, 0)` is now
  legal and the `0.001` workaround is gone. Both rules were extended to
  `animate`'s `to`, which previously was validated by kind alone; that is a
  narrowing, and it carries a regression test. The phase also reconciled
  `origin` through the physics seam at five sites: a body is placed at its
  bounding-box centre rather than its pivot, and a bottom-origin object's
  centre is tracked through a scale animation. Design in
  `2026-09-09-marey-phase-3c-motion-primitives-design.md`; **read the plan's
  execution notes before Phase 4.** Current-phase status is stated once, in
  `docs/architecture/README.md` — update that line and this bullet together.
- **Phase 4 — composition and export foundation.** Finite scene duration, one
  deterministic frame sampler above `SceneRuntime`, a PNG sequence, a compiler
  surface decoupled from the Web Worker, and `marey check`. Exit is Gate B.
  **Read the roadmap's §6.3 trap before writing the PNG exporter** — PixiJS
  does not set `preserveDrawingBuffer`, so a naive in-page pixel read produces
  blank images and reports success.
- **Phase 5A — baked Lottie.** A bounded subset; `text` is excluded because the
  Lottie spec's text layer has been open 19 months.
- **Phase 5B — video.** WebM and MP4 via WebCodecs and a muxer, never
  `MediaRecorder`.
- **Phase 6 — packaging and legibility.** Public package, `LICENSE`, a root
  README, `marey check`/`marey export`, and a written account of the
  determinism work. Replaces the old Phase 5B (Distribution); acquisition work
  is deliberately out of scope.
- **Phase 7 — motion-graphics core.** Color animation, `stagger`, scrubbing,
  and live-edit replay.
- **Phase 8 — remaining physics syntax.** `world`, `lockPosition`,
  `lockRotation`, and `spin`; D13's explicit-body rule remains in force.
- **Finish line.** Phases 3C–8 complete. Everything after — the documentation
  site, distribution and integrations, semantic layout, spring easing, derived
  accessibility artifacts, embedded runtimes — is catalogued as further
  capability with no commitment.

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
test also rejects any fence tag other than `marey` or `text`, because a
mistagged fence would otherwise be skipped silently and report green.

`docs/plans/` holds step-by-step implementation plans. Each has an
"Execution notes" section recording defects found during execution and issues
deliberately deferred — **read the previous phase's notes before starting the
next one.** Phase 1's record one gap Phase 2 or 3 should close: `adapter.ts` has
no test coverage, and all three bugs found by review were there.
