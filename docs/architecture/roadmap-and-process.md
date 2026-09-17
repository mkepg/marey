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
superseded from Phase 4 onward — that is the 2026-09-09 document's own §16.
**Its §6 (the Phase 4 section itself) complicates that**, opening with "Unchanged
from the previous roadmap §9, and still authoritative as written there." Both
cannot be true as general statements about the same document. They agree on
every actual Phase 4 requirement — §6.1–6.4 restate the old §9 verbatim in
substance — so nothing in Phase 4's execution ever turned on which one governs.
Where the distinction would matter, the specific statement governs the general
one: §6 speaks to Phase 4 by name, §16 speaks to document authority overall, so
treat the old roadmap's §9 as authoritative for what Phase 4 requires and §16
as authoritative for everything else about the old document's standing. The earlier
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
- **Phase 3C — motion primitives: done and merged.** Fast-forwarded onto
  `main` with no merge commit. The phase's last feature commit is `106683e`;
  its reference, regression fixtures and evidence landed at `0dbfa46`, and the
  independent whole-branch review AGENT-LESSONS §8 requires found **no
  behavioural defect** — its findings were corrections to comments, citations
  and numbers, and landed after the phase at `de0c4c0` and `160964d`. The
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
- **Phase 4 — composition and export foundation: done and merged.**
  Fast-forwarded onto `main` with no merge commit; the phase's last commit is
  `2e72ef7`. The independent whole-branch review AGENT-LESSONS §8 requires
  found three Important defects and twenty Minor findings, a single fix wave
  addressed all of them, and the scoped re-review of that wave passed with no
  finding left open. The three Important defects are worth knowing because
  nine task reviews missed all of them: `FrameSnapshot` silently dropped
  `visible`, which the renderer writes inside `advanceOneTick()`, so a culled
  object would have vanished from every exported frame while the hash stayed
  byte-identical; `SamplerPlan` was structurally typed, so "holding a plan is
  proof the request was validated" was a convention until it was branded; and
  the cross-machine hash claim this phase measured false survived in its own
  spec, now carrying a dated correction rather than a silent rewrite.
  **Read the plan's execution notes before Phase 5A.**
  Adds a
  finite scene-level `duration` (validated; orthogonal to any per-object
  `animate`/`physics` duration, which it does not replace); one deterministic
  frame sampler, `frameSampler.ts`'s `sampleFrames`, a headless sibling of
  `LiveDriver` that drives `SceneRuntime.advanceOneTick()` and
  `paintExactTick()` from an output-frame index rather than a wall clock; a
  PNG sequence exporter (`pngSequence.ts`'s `applySnapshot`, reached through
  `renderer.extract.canvas`, which sidesteps the `preserveDrawingBuffer` trap
  §6.3 warned about rather than enabling that flag); a compiler surface
  (`compileSource.ts`) decoupled from the Web Worker, so the CLI and the
  export path share one pipeline with the editor; and `marey check`,
  including `--export-ready`. The dev-only `window.__mareyExportPng` seam
  (`src/lib/devExportSeam.ts`) lets a browser harness drive the same export
  path a future `marey export` CLI will, constant-folded out of production
  builds (confirmed by building and grepping `dist/`). Exit is Gate B (roadmap
  §6.4): full evidence in `eval/RESULTS-GATE-B.md`, one section per
  criterion with the reproducing command and a performed-and-restored revert.
  **Two claims were falsified by measurement, not argument, and both matter
  beyond this phase.** (1) The frame sampler's per-tick painting was
  originally justified by an argument that `spawnAnim` *must* see
  paint-written state; the plan's own prescribed experiment disproved it —
  `tickAnim` already snaps a completing runner's value in the tick phase
  regardless of paint cadence — so per-tick painting is kept as the
  conservative choice, not a proven necessity, and a `sequence`-bearing scene
  remains untested for cadence sensitivity. (2) `hashFrames`'s docstring
  claimed that hashing simulation state rather than pixels "carries the
  determinism claim across machines as well as across runs"; measured false —
  `compound-logo.marey`'s hash matches bit-for-bit between headless Node and
  Chromium, `radial-dots.marey`'s does not, traced to `Math.sin` returning a
  different last bit at 240° between Node's V8 and Playwright's bundled
  Chromium V8. `Math.sin`/`Math.cos` are "implementation-approximated" by
  ECMA-262 and carry no IEEE-754 correctly-rounded guarantee, unlike
  `+ - * /` and `Math.sqrt`; `parseExpr.ts` folds `sin`/`cos` to literals at
  parse time, so any scene using trig can bake the divergence into its IR.
  Corrected in `frameHash.ts`'s docstring and recorded in
  `eval/RESULTS-GATE-B.md`. **Read the plan's execution notes before Phase
  5A** — they carry the full defect list (source and plan both), mutation-test
  counts against their suite sizes, and the deferred findings (25 of them; the
  largest is that `compiler.worker.ts` has no automated test at all, so its
  branch order and its six exact log strings are guarded by nothing).
- **Phase 5A — baked Lottie: complete on branch `phase-5a-baked-lottie`**, with
  the independent whole-branch review AGENT-LESSONS §8 requires and the merge
  still owed. A bounded subset; `text` is excluded because the Lottie spec's
  text layer has been open 19 months. Static circle/rectangle/polygon/group
  geometry with baked position, rotation, scale and alpha, fixed duration and
  frame rate, and physics baked to keyframes — the emitted file carries no
  Marey or Matter.js dependency at playback. Unsupported input is refused
  outright rather than degraded: `LOTTIE_UNSUPPORTED_TEXT` and
  `LOTTIE_UNSUPPORTED_LINE` are the whole refusal surface, and both are pinned
  by delete-and-run. Two structural rules carry the independence claim and are
  grep-checkable: neither `lottieGeometry.ts` nor `lottieEncode.ts` imports
  `pixi.js`, and `lottieEncode.ts` does not import `sceneIR` — it sees
  `FrameSnapshot`s only. The encoder boundary and the **opacity asymmetry**
  (transforms stay parented, opacity flattens, because Lottie parenting
  propagates only the transform) are documented in `renderer.md`.
  Design §11 listed six Lottie facts the published specification did not
  settle; all six were measured in lottie-web 5.13.0 and carry two dated
  corrections — the second because a first draft overclaimed what a half-frame
  sample can establish. Exit evidence is `eval/RESULTS-PHASE-5A.md`: a physics
  scene in a third-party player, and a measured tolerance against Marey's own
  PNG export of **max per-channel delta 81 across 0.1185% of pixels** —
  produced by the documented multi-frame command and session-dependent (a
  single-frame invocation measures less; see Criterion 2's subsection on this
  in `RESULTS-PHASE-5A.md`) — every one of them on an antialiased edge with
  flat interiors byte-identical.
  A second renderer, `@lottiefiles/dotlottie-web`, was evaluated and added.
  **Read the plan's execution notes before Phase 5B.** Current-phase status is
  stated once, in `docs/architecture/README.md` — update that line and this
  bullet together.
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
