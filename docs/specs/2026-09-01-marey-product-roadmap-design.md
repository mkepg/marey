# Marey Product Roadmap — From Motion DSL to Distributed Artifact

**Date:** 2026-09-01
**Status:** Approved roadmap.
**Supersedes:** Sections 8–12 of
`2026-08-26-physics-shared-world-design.md`.
**Preserves:** Decisions D1–D18 and Sections 1–7 of that design, including the
completed deterministic-clock, shared-world, and compound-group work.

---

## 1. Product statement

Marey is a text-first compiler for generative, deterministic 2D motion
graphics. It lets developers and machine authors describe, parameterize,
simulate, review, and version motion as readable source, then compile it into
portable artifacts that do not require the Marey runtime.

Marey is not trying to become:

- a more general animation API than GSAP;
- a visual design and interactive-state-machine editor like Rive;
- a replacement playback format for Lottie;
- a game engine or a high-fidelity simulation language.

Its intended niche is **motion graphics as readable, generative source code**.
Lottie, video, and image sequences are output targets; PixiJS and Matter.js are
implementation machinery, not the product identity.

---

## 2. Why the roadmap changes

Phases 0–2 established a strong renderer: fixed-tick determinism, shared rigid
bodies, interpolation, compound groups, and a tested tick/paint boundary. More
physics breadth would now improve an already-credible subsystem without proving
that Marey's authoring model is valuable.

Two measured gaps are more urgent:

1. `eval/RESULTS.md` found that three of four data-driven briefs required
   hand-unrolling. The macro layer handles repetition but not data.
2. Marey has no export, embed, public package, or CLI. A user can create a
   scene in the playground but cannot put its output into a production
   workflow.

Mermaid supplies the useful adoption analogy. Its success did not come from
text syntax alone. It combines semantic compression with distribution: short
source renders inside GitHub, GitLab, documentation tools, editors, and CI.
Marey cannot depend on native host support at first, but it can reproduce the
workflow through portable output, a CLI, CI integration, and embeddable
artifacts. Evidence for the analogy is recorded in GitHub's
[native Mermaid announcement](https://github.blog/developer-skills/github/include-diagrams-markdown-files-mermaid/),
GitLab's [Markdown integration](https://docs.gitlab.com/user/markdown/), and
Mermaid's [community integration catalog](https://mermaid.js.org/ecosystem/integrations-community.html).

The governing sequence is therefore:

```text
clean the language
        ↓
prove generative authoring
        ↓
ship deterministic export
        ↓
distribute through existing workflows
        ↓
add motion and physics breadth
```

---

## 3. Roadmap decisions

| # | Decision | Rationale |
|---|---|---|
| R1 | Complete the language cleanup and breaking renames before adding capability. | Every later example, export fixture, integration, and documentation page should use the final vocabulary. |
| R2 | Keep the deliberate physics-language cuts and make them regression-tested. | Marey is a motion-graphics language, not a simulation-authoring surface. |
| R3 | Expand the macro milestone until it passes all three measured data-driven briefs without hand-unrolling. | A stated differentiator that fails its own examples is not a differentiator. |
| R4 | Modulo alone is insufficient; Phase 3B includes comparison and conditional capability. | “Every fifth item differs” requires a decision as well as a remainder. |
| R5 | Trigonometry is required, not optional, for the current radial-layout success criterion. | Otherwise `radial-dots` still needs hand-computed coordinates. |
| R6 | Pull export ahead of additional physics syntax. | Source-to-artifact compilation validates the product thesis; more solver controls do not. |
| R7 | Separate deterministic frame sampling from output encoders. | PNG, Lottie, and video must share one simulation and frame-selection path. |
| R8 | After PNG proves the driver, prioritize a baked-Lottie subset before broad video-format polish. | Lottie proves portable playback without the Marey runtime and is the strategic target. |
| R9 | Distribution is a first-class roadmap phase, not an assumption attached to export. | Mermaid-like adoption requires Marey to appear in workflows users already have. |
| R10 | Measure semantic compression, not only compilation success. | Text is useful only when it removes meaningful authoring and maintenance work. |
| R11 | Investigate high-level layout primitives only after the expanded authorability evaluation. | Repeated coordinate arithmetic may justify `row`, `grid`, or `radial`; do not add syntax before observing the need. |
| R12 | Retain D13's explicit-body rule unless user evidence overturns it. | Visible physicality supports readable diffs; implicit colliders hide consequential behavior. |
| R13 | Move the full documentation site after syntax, export, and distribution stabilize. | Minimal guides ship with each capability; a polished site should document a validated product. |

---

## 4. Language cuts and non-goals

The following remain cut:

- `mass`;
- surface `friction` as language syntax;
- collision categories and masks;
- concave decomposition for single polygons;
- `poly-decomp`;
- general mutable variables;
- user-defined functions in the macro layer;
- arbitrary objects, file access, and network access in source;
- a general scripting runtime;
- a plugin system before external use demonstrates a need.

The existing `anchor`, `width`, and `height` parser reservations are drift, not
language features. Phase 3A removes them.

`isStatic` and `angularVelocity` have not shipped. Their future replacements
`lockPosition` and `spin` are new names from day one, not migrations.

---

## 5. Canonical product tests

Three scenes follow the roadmap from source through export and distribution.

### 5.1 Data-driven bar chart

One literal data list and one iteration produce every bar. It tests lists,
indexing or direct iteration, arithmetic, color, later staggering, and export.

### 5.2 Radial composition

One loop produces a radial arrangement with no hand-computed coordinates. It
tests trig, generation, templates, and whether repeated coordinate patterns
eventually justify a semantic layout construct.

### 5.3 Physics-driven compound logo

A multi-part visual animates into a deterministic shared-world simulation and
exports as baked transforms. It tests the unusual combination Marey already
owns: readable choreography, rigid-body motion, and runtime-independent output.

For every canonical scene, record:

- source lines and literal-coordinate count;
- hand-unrolled object count;
- diff size for a representative change;
- work required to create a variant;
- repeated-run equality;
- exported-artifact correctness.

---

## 6. Completed foundation — Phases 0–2

These phases remain complete and are not reopened by this roadmap.

- **Phase 0 — deterministic clock:** fixed 120Hz state progression and a live
  driver isolated from scene mutation.
- **Phase 1 — shared world:** Matter.js collisions, sleeping, pinning, freeze
  semantics, interpolation, and deterministic unit conversion.
- **Phase 2 — compound groups:** welded group bodies, ancestor transforms,
  `SceneRuntime`, and frame-pacing tests across the tick/paint boundary.

Read Phase 2's execution notes before Phase 3. They record the frame-pacing
harness, the `.eval` output-path defect, and why `adapter.ts` no longer warrants
a broad orchestration-testing project.

---

## 7. Phase 3A — Language foundations, cuts, and renames

**Compiler, editor, documentation, and tests. Breaking syntax; no new user
capability.**

### 7.1 Renames

Land without aliases, per D11:

| Current | New |
|---|---|
| `def` | `let` |
| `handOff` | `handoff` |
| `sceneFit` | `fit` |
| `z` | `layer` |

Update the lexer, parser, AST values, IR field names where appropriate,
validator diagnostics, renderer consumers, Monaco syntax and documentation,
the default scene, share fixtures, visual-check scenes, and every compiled
example.

### 7.2 One language contract

Replace the hand-synchronized parser reservations, validator contracts, Monaco
hovers, and completion data with one authoritative property contract. Generated
or derived consumers must not maintain independent property lists.

Remove the ghost reservations `anchor`, `width`, and `height`. Correct the
`airDrag: 0.99` snippets and the `bounce` hover.

### 7.3 Correctness work retained from the historical Phase 3

- Replace `Math.random()` animation-node names with positional deterministic
  names.
- Add golden Scene IR snapshots.
- Reject `line` plus physics.
- Reject a handoff whose sibling physics duration expires first.
- Add a physics-body ceiling distinct from the 15,000-object parser budget.
- Fix top-level `yoyo: true` without `loop: true` so it completes after the
  return leg.
- Fix the `.eval` output path so R1 and R2 reports cannot overwrite each other.
- Add negative tests for every deliberate language cut.

### 7.4 Exit criteria

- Old spellings are rejected and have positioned diagnostics.
- All language-reference and default-scene examples use the new vocabulary and
  compile.
- Parser reservation, type checking, hovers, and completions derive from the
  same contracts.
- Repeated compilation of identical source produces identical AST and IR.
- Every deliberate cut has a negative regression test.
- Typecheck, build, unit tests, language-doc tests, and both evaluation corpora
  are green.

---

## 8. Phase 3B — Generative expressiveness

**Parser, evaluator, editor, documentation, and evaluation corpus. First phase
whose success is measured by authoring compression rather than compilation
rate.**

### 8.1 Required capability

- General literal value lists bindable with `let`.
- Indexing and list length, or a direct list-iteration form that makes those
  operations unnecessary for the common case.
- Modulo.
- Equality and basic numeric comparison.
- A conditional value expression.
- `sin`, `cos`, and a π constant with explicitly documented angle units.

The syntax receives its own phase design. This roadmap settles capability and
success criteria, not grammar punctuation.

### 8.2 Explicit limits

Bindings remain lexical and immutable. This phase does not add statements with
side effects, mutation, functions, maps, I/O, or a general runtime.

### 8.3 Exit criteria — Product Gate A

- `bar-chart` uses one literal data list and one loop.
- `radial-dots` uses one loop and no hand-computed coordinates.
- `timeline-ticks` uses one loop rather than overlapping loops.
- Each is materially shorter and cheaper to modify than its baseline fixture.
- Existing authorability corpora and language examples remain green.

If these scenes are not convincingly improved, stop and reassess the DSL before
adding another major subsystem.

After the evaluation, inspect recurring coordinate arithmetic. Add semantic
`row`, `column`, `grid`, `radial`, `distribute`, or `align` constructs to a
later phase only when the evidence shows they remove repeated work better than
general expressions do.

---

## 9. Phase 4 — Composition and export foundation

**Language contract plus a new export subsystem.**

### 9.1 Composition contract

- Add a finite scene-level duration. Indefinite scenes cannot be exported
  without an explicit export bound.
- Keep export frame rate an export option unless authoring evidence shows it is
  part of scene meaning.
- Define unsupported-export diagnostics before adding encoders.

### 9.2 Frame sampling

Introduce one deterministic sampler above `SceneRuntime`:

```text
Marey source
    ↓
Scene IR
    ↓
deterministic frame sampler
    ↓
immutable frame snapshots
    ↓
PNG / Lottie / video encoders
```

The sampler owns tick-to-output-frame selection. Encoders never advance the
simulation themselves and never see a wall clock.

### 9.3 First output and compiler surface

- Export a PNG sequence, initially from the browser.
- Expose a pure compiler surface that is not coupled to the Web Worker.
- Add `marey check`, or an equivalent CLI validation command, before a full
  rendering CLI.

### 9.4 Exit criteria — Product Gate B

- Finite scenes export the exact expected frame counts at 24, 30, and 60fps.
- Repeated exports produce identical frame hashes.
- Frame pacing cannot affect exported state.
- Invalid or unbounded duration fails before rendering begins.
- The three canonical scenes export through the same sampler.

---

## 10. Phase 5A — Portable artifacts

### 10.1 Baked Lottie MVP

After PNG validates the sampler, emit a deliberately bounded Lottie subset:

- static circle, rectangle, polygon, and group geometry;
- baked position, rotation, scale, and alpha keyframes;
- fixed duration and frame rate;
- baked physics with no Matter.js or Marey dependency at playback.

Unsupported features fail explicitly rather than disappearing or degrading
silently. Validate output in an independent Lottie player and compare selected
frames against Marey within documented tolerances.

### 10.2 Video

Add WebM and MP4 through WebCodecs and a muxer after the Lottie subset proves
the strategic source-to-portable-artifact path. Do not use `MediaRecorder`,
whose real-time capture can drop frames.

GIF and SVG/SMIL remain out of scope for the reasons in the historical roadmap.

---

## 11. Phase 5B — Distribution and integration

Export is not adoption until it fits existing workflows.

### 11.1 Adoption ladder

1. Try a share link without an account.
2. Store a `.marey` file in a repository.
3. Preview locally.
4. Validate in CI.
5. Compile to a portable artifact.
6. Embed the artifact without the Marey runtime.

### 11.2 Deliverables

- A public compiler package and explicit open-source license.
- A root README with a five-minute example.
- `marey check` and `marey export` CLI commands.
- A GitHub Action that validates and exports changed `.marey` files.
- A small embeddable player or web component where a runtime preview is useful.
- One or two documentation integrations chosen from actual demand, initially
  likely MDX, Docusaurus, or VitePress.

Native GitHub rendering is not an initial dependency. A checked-in `.marey`
file can be compiled by CI to Lottie, video, or an image referenced by ordinary
Markdown.

### 11.3 Exit criteria — Product Gate C

A new user can clone a repository, edit one canonical scene, receive a CI
validation result, and embed the generated artifact without opening the Marey
IDE or loading the Marey runtime in production.

---

## 12. Phase 6 — Motion-graphics core and authoring payoff

Prioritize features used across ordinary motion work:

- finish color animation;
- add `delay` and `stagger`;
- add replay-to-frame scrubbing;
- preserve the current frame across live recompilation;
- add spring easing only when briefs demonstrate demand;
- add semantic layout primitives only when Phase 3B evidence supports them.

These features come after the first portable artifact so that each one can be
validated through the real output pipeline rather than only in the playground.

---

## 13. Phase 7 — Physics authoring syntax

Move the remaining historical Phase 4 physics syntax here:

- `world { gravity, bounds }`;
- `lockPosition`;
- `lockRotation`;
- `spin`.

Scene-level duration has moved to Phase 4 because it is an export prerequisite,
not fundamentally a physics feature.

D13 remains in force: an object becomes physical only when a `physics` block is
visible on it or in its sequence, or when it is a part of a physics group.
Reconsider this only with user evidence and an explicit non-collider model in
hand. Do not quietly make every visual object a collider.

The language cuts in Section 4 remain in force throughout this phase.

---

## 14. Phase 8 — Documentation site and external adoption

Minimal documentation ships with every earlier phase: the language reference,
getting started, export guide, supported-output table, and canonical examples.

Build the full tutorial, guide, gallery, and onboarding site only after:

- breaking renames are complete;
- generative syntax passes Product Gate A;
- portable export passes Product Gate B;
- repository/CI distribution passes Product Gate C;
- the remaining physics syntax is settled;
- outside users have attempted the workflow.

The site then documents observed workflows rather than polishing assumptions.
The existing share-link architecture still makes gallery entries cheap: a demo
can link directly to editable source in the playground.

---

## 15. Success criteria for the product direction

Marey has validated its niche when this workflow is routine:

1. A developer or machine author writes a short `.marey` file.
2. The editor previews it immediately.
3. CI validates it.
4. A pull request shows a readable source diff.
5. CI compiles it into Lottie, video, or frames.
6. The output embeds without Marey.
7. A useful variant requires a small source change rather than hand-unrolling.

Track:

- time to first useful scene;
- first-pass semantic correctness, not only compilation;
- source and diff size for canonical changes;
- hand-unrolled object and coordinate counts;
- deterministic export equality;
- successful external embeds;
- external users who complete the full source-to-artifact path.

Raw feature count, solver fidelity, and playground-only scene count are not
product-success metrics.

---

## 16. Document authority

- `2026-08-26-physics-shared-world-design.md` remains authoritative for the
  motion-graphics direction, decisions D1–D18, and completed Phases 0–2.
- This document is authoritative for Phase 3 onward and supersedes Sections
  8–12 of that design.
- Completed implementation plans remain historical records and retain links to
  the specifications they executed.
- A future decision that changes this roadmap should be recorded in a new dated
  design rather than silently rewriting the history again.
