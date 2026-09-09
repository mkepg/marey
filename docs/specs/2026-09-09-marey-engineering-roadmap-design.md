# Marey Engineering Roadmap — From Motion DSL to a Finished Artifact

**Date:** 2026-09-09
**Status:** Approved roadmap.
**Supersedes:** `2026-09-01-marey-product-roadmap-design.md` in full, from Phase 4
onward. That document remains the historical record of Phases 3A and 3B and of
why export was pulled ahead of physics breadth.
**Preserves:** Decisions D1–D18 and Sections 1–7 of
`2026-08-26-physics-shared-world-design.md`, the language cuts, the canonical
scenes, and every completed phase through 3B.

---

## 1. What changed, and why this document exists

The previous roadmap optimised for **adoption**. This one optimises for a
**complete, provable engineering artifact** — one that can be declared finished,
and that a reader can evaluate.

That is a change of purpose, not of taste, and it follows from evidence
gathered on 2026-09-08 and 2026-09-09 and recorded in two research documents in
`docs/research/`. The short version: adoption was found to be a four-to-six-year
proposition against entrenched incumbents, resting on demand that could not be
verified from any primary source. Rather than spend years on that bet, the
project now aims at a finish line it controls.

**The door to users is left open, not nailed shut.** Work that is good
engineering regardless of whether anyone shows up — a public compiler surface,
a CLI, a package, a license, a README — stays in. Work that exists only to
acquire users — a GitHub Action, documentation-tool integrations, a gallery,
adoption metrics — moves past the finish line.

### 1.1 The evidence that changed the previous roadmap's mind

Three findings did the work. Each is cited to the research document that owns
it, and each contradicted something the previous roadmap asserted.

1. **The Mermaid analogy was backwards.** Previous §2 rested on Mermaid's
   success as the model, and R9 concluded from it that distribution must be a
   first-class phase. The adoption research measured the actual window around
   GitHub's native-Mermaid announcement of 14 February 2022 and found monthly
   npm downloads moving 610,113 → 667,407 → 776,925 with **no step function** —
   a continuation of a seven-year trend. Host integration *followed* traction;
   it did not cause it. The analogy's load-bearing claim is false, so R9's
   rationale does not hold.
   See `docs/research/2026-09-09-marey-adoption-viability.md` §2.1.

2. **The adoption ladder is a conversion mechanism with no acquisition step.**
   Previous §11.1 began at "try a share link." Both comparables studied spread
   in the opposite direction — the artifact circulated first and the authoring
   tool was pulled in behind it. Nobody climbed a ladder from a share link.
   The research explicitly records that how Marey would acquire the person who
   steps onto rung 1 is unknowable from the primary record.
   See the same document, §2.3.

3. **Every candidate niche had an unverified demand side.** A second research
   pass looked for gaps requiring major changes and found genuine structural
   holes — derivable reduced-motion variants, motion in design-token standards,
   one-source-to-many-locales — but its own §8.1 states plainly that the demand
   side is unverified for every one of them. Two independent passes reaching the
   same shape of answer is itself a result.
   See `docs/research/2026-09-09-marey-adjacent-gaps.md` §8.1.

### 1.2 What did not change

The product statement, the language cuts, the canonical scenes, and the
engineering direction are unchanged. Marey is still a text-first compiler for
generative, deterministic 2D motion graphics that compiles to portable
artifacts. Nothing in the evidence above suggests the engineering was wrong —
only that the go-to-market reasoning attached to it was.

---

## 2. Product statement

Marey is a text-first compiler for generative, deterministic 2D motion
graphics. It lets an author describe, parameterize, simulate, review, and
version motion as readable source, then compile it into portable artifacts that
do not require the Marey runtime.

Marey is not trying to become a more general animation API than GSAP, a visual
editor like Rive, a replacement playback format for Lottie, or a game engine.

Its niche remains **motion graphics as readable, generative source code**.
PixiJS and Matter.js are implementation machinery, not the product identity.

---

## 3. Roadmap decisions

### 3.1 Carried forward unchanged

| # | Decision |
|---|---|
| R1 | Complete language cleanup and breaking renames before adding capability. |
| R2 | Keep the deliberate physics-language cuts and make them regression-tested. |
| R3 | Expand the macro milestone until it passes all three data-driven briefs without hand-unrolling. |
| R4 | Modulo alone is insufficient; comparison and conditional capability are required. |
| R5 | Trigonometry is required for the radial-layout criterion. |
| R6 | Export comes ahead of additional physics syntax. |
| R7 | Separate deterministic frame sampling from output encoders. |
| R8 | After PNG proves the driver, prioritize a baked-Lottie subset before broad video polish. |
| R10 | Measure semantic compression, not only compilation success. |
| R11 | Investigate high-level layout primitives only after authorability evidence supports them. |
| R12 | Retain D13's explicit-body rule unless user evidence overturns it. |

### 3.2 Superseded

| # | Previous decision | Why it is superseded |
|---|---|---|
| R9 | Distribution is a first-class roadmap phase. | Its stated rationale was Mermaid-like adoption. §1.1 finding 1 shows the Mermaid mechanism was not what R9 assumed. Distribution moves past the finish line. |
| R13 | Move the full documentation site after syntax, export, and distribution stabilize. | Correct ordering, but the site served adoption. It moves past the finish line entirely. |

### 3.3 New

| # | Decision | Rationale |
|---|---|---|
| R14 | Optimise for a declarable finish line, not for adoption. | The project's win condition is a complete, evaluable artifact. A roadmap with no end cannot deliver one. |
| R15 | Keep work that is good engineering regardless of users; drop work that only acquires them. | A public compiler surface, CLI, package and license demonstrate API and packaging judgment. A gallery and CI integrations demonstrate nothing if nobody arrives. |
| R16 | Fix the motion primitives before building export. | Export bakes whatever the language can express. Every artifact Marey ever produces is capped by gaps that cost days to close now and are permanent otherwise. See §5. |
| R17 | Exclude Lottie `text` from the first portable-artifact subset. | The Lottie specification's own tracker carries "Add Text Layer" open for 19 months. The shape-layer subset is the only normative-and-stable part. `docs/research/2026-09-09-marey-adjacent-gaps.md` §4. |
| R18 | Legibility is a deliverable with its own exit criteria, not documentation cleanup. | Under R14 the artifact must be evaluable by a reader. Engineering nobody can find has not been demonstrated. |

---

## 4. Language cuts and non-goals

Unchanged from the previous roadmap §4. The following remain cut: `mass`;
surface `friction` as syntax; collision categories and masks; concave
decomposition for single polygons; `poly-decomp`; general mutable variables;
user-defined functions in the macro layer; arbitrary objects, file access and
network access in source; a general scripting runtime; and a plugin system.

The rule behind them is unchanged: **data determines *values*; the source's
literal structure determines *shape*.**

---

## 5. Phase 3C — Motion primitives

**Language and validator. Small, and first.**

Three gaps were found on 2026-09-09 by writing explainer scenes against the
current language and rendering them in Chromium. They are recorded here because
they were found by construction, not by reading:

- **No `delay` on `animate`.** The block has exactly seven properties —
  `property`, `to`, `duration`, `easing`, `loop`, `yoyo`, `handoff`. A staggered
  reveal is therefore only expressible by wrapping every generated object in a
  `sequence` whose first step is a no-op animation whose `duration` encodes the
  delay: roughly six extra lines per object. Varying `duration` instead changes
  *period*, not *phase*, so a fixed-period travelling wave is not writable at
  any length.
- **No origin or anchor.** `scale` grows from an object's centre, so a bar
  rising from a baseline requires a `parallel` block animating `position` and
  `scale` together, with the final centre coordinate computed by hand — exactly
  the hand-computed-coordinate problem Phase 3B existed to remove.
- **`scale` rejects zero.** `scale: (1, 0)` is `TYPE_INVALID_SCALE`
  ("components must be greater than zero"), so "grow from nothing" — the most
  common single idiom in explanatory motion — is a compile error. The current
  workaround is `0.001`.

### 5.1 Required capability

- `delay` on `animate`, in seconds, applied before the animation begins.
- An origin or anchor property controlling the point `scale` and `rotation`
  act around.
- A zero-`scale` rule that permits a degenerate start without breaking whatever
  invariant `TYPE_INVALID_SCALE` was protecting. Establish that invariant before
  relaxing the rule; if physics requires non-zero extent, scope the relaxation
  to non-physical objects rather than removing the check.

`from` on `animate` is **optional** within this phase. Declaring the start value
on the object covers most cases, and it is the least valuable of the four.

### 5.2 Exit criteria

- A staggered reveal across generated objects needs no no-op sequence step.
- A bar grows from a baseline without a hand-computed centre coordinate.
- A fixed-period phase-offset animation is expressible.
- `TYPE_INVALID_SCALE`'s invariant is documented, and any narrowing of it has a
  regression test.
- The three canonical scenes and both authorability corpora stay green.

---

## 6. Phase 4 — Composition and export foundation

Unchanged from the previous roadmap §9, and still authoritative as written
there.

### 6.1 Composition contract

- A finite scene-level duration. Indefinite scenes cannot be exported without
  an explicit export bound.
- Export frame rate stays an export option unless authoring evidence shows it
  is part of scene meaning.
- Unsupported-export diagnostics are defined before any encoder is added.

### 6.2 Frame sampling

One deterministic sampler above `SceneRuntime`:

```text
Marey source → Scene IR → deterministic frame sampler
             → immutable frame snapshots → PNG / Lottie / video encoders
```

The sampler owns tick-to-output-frame selection. Encoders never advance the
simulation and never see a wall clock.

### 6.3 First output and compiler surface

- A PNG sequence, initially from the browser.
- A pure compiler surface not coupled to the Web Worker.
- `marey check`, or an equivalent CLI validation command, before a rendering CLI.

**Known trap, to be designed around rather than discovered.**
`tools/visual-check/SKILL.md` records that reading the PixiJS canvas
in-page returns a blank frame, because PixiJS does not set
`preserveDrawingBuffer`. `src/compiler/renderer/adapter.ts` confirms it is not
set, and Pixi's `extract` API is not used anywhere in `src/`. A naive PNG export
will therefore produce blank images and report success. Prefer Pixi's
`renderer.extract` over enabling `preserveDrawingBuffer`, which imposes a cost
on every frame for a feature used only during export.

### 6.4 Exit criteria — Gate B

- Finite scenes export exact expected frame counts at 24, 30, and 60fps.
- Repeated exports produce identical frame hashes.
- Frame pacing cannot affect exported state.
- Invalid or unbounded duration fails before rendering begins.
- The three canonical scenes export through the same sampler.

---

## 7. Phase 5A — Baked Lottie

After PNG validates the sampler, emit a deliberately bounded subset:

- static circle, rectangle, polygon and group geometry;
- baked `position`, `rotation`, `scale` and `alpha` keyframes;
- fixed duration and frame rate;
- baked physics, with no Matter.js or Marey dependency at playback.

**`text` is excluded** per R17. Unsupported features fail explicitly rather than
degrading silently. Validate in an independent Lottie player and compare
selected frames against Marey within documented tolerances.

### 7.1 Exit criteria

- A physics scene plays correctly in a third-party player with no Marey code.
- Frame comparison against Marey is within a documented tolerance.
- Every unsupported feature produces a named diagnostic, not a silent omission.

---

## 8. Phase 5B — Video

WebM and MP4 through WebCodecs and a muxer. **Do not use `MediaRecorder`**,
whose real-time capture can drop frames.

GIF and SVG/SMIL remain out of scope.

### 8.1 Exit criteria

- A scene exports to WebM and MP4 at the requested frame rate and duration.
- Repeated exports of the same scene are byte-identical, or the reason they
  cannot be is documented at the encoder boundary.
- No frame is dropped or duplicated relative to the sampler's output.

---

## 9. Phase 6 — Packaging and legibility

**This phase replaces the previous roadmap's Phase 5B (Distribution).** It keeps
the parts that demonstrate engineering judgment and drops the parts that only
serve acquisition.

### 9.1 In scope

- A public compiler package with an explicit open-source license. Marey has
  neither today: there is no `LICENSE` file and `package.json` declares
  `"private": true` with no `license` field.
- A root README. There is none today, and the previous roadmap §11.2 already
  committed to one. It should open with a rendered artifact, show source beside
  what it produces, state what is hard about the project, and link into the
  existing reference and design documents rather than restating them.
- `marey check` and `marey export` as real CLI commands.
- A written account of the determinism work: the tick/paint boundary, what
  determinism means here, and how it is verified. The `visual-check` harness
  found a determinism bug that all 94 headless tests missed — that story is
  currently a paragraph inside a skill file, where no reader will find it.

### 9.2 Out of scope, deliberately

A GitHub Action, documentation-tool integrations, an embeddable player, a
gallery, and any adoption metric. These move past the finish line per R15.

### 9.3 Exit criteria

- The package builds and installs from a clean checkout.
- A reader can state what Marey is and what is technically hard about it within
  ten minutes of opening the repository.
- Both CLI commands work on the canonical scenes.

---

## 10. Phase 7 — Motion-graphics core

- finish color animation;
- add `stagger` (`delay` having landed in 3C);
- add replay-to-frame scrubbing;
- preserve the current frame across live recompilation.

Spring easing and semantic layout primitives are **not** in this phase; see §13.

Each feature is validated through the real export pipeline rather than only in
the playground, which is why this phase follows the artifact work.

---

## 11. Phase 8 — Physics authoring syntax

- `world { gravity, bounds }`;
- `lockPosition`;
- `lockRotation`;
- `spin`.

D13 remains in force: an object becomes physical only when a `physics` block is
visible on it or in its sequence, or when it is part of a physics group. Do not
quietly make every visual object a collider.

The language cuts in §4 remain in force throughout.

---

## 12. The finish line

**Marey is complete when Phases 3C through 8 are done.** At that point the
project may be declared finished, and no further work is owed.

Concretely, at the finish line:

1. A finite `.marey` scene, including one with physics, compiles deterministically.
2. It exports to PNG frames, to a Lottie artifact, and to video, through one sampler.
3. The Lottie artifact plays in a third-party player with no Marey code present.
4. Repeated exports are identical, and that is verified rather than asserted.
5. The language expresses staggered reveal, baseline-anchored growth, and phase
   offset without workarounds.
6. The project is installable, licensed, and explains itself to a reader.

---

## 13. Beyond the finish line — further capability

Catalogued, with no commitment, no ordering, and no implied intent to build.
Anything here may be started if it becomes interesting; nothing here is owed.

**Adoption and distribution** — the full documentation site; a GitHub Action;
MDX, Docusaurus or VitePress integrations; an embeddable player or web
component; a gallery; the adoption ladder and its Gate C.

**Language and motion** — spring easing; semantic layout primitives (`row`,
`grid`, `radial`, `distribute`, `align`), still governed by R11; `from` on
`animate` if 3C left it out.

**Derived artifacts** — the strongest idea to come out of the 2026-09-09 gap
research, recorded so it is not lost. Because Marey source states property-level
intent rather than baked geometry, a compiler can *rewrite* it: a reduced-motion
variant for WCAG 2.2 SC 2.2.2 and 2.3.1, a generated text description, or one
source emitting many locale variants. No competitor can do this — mp4 is pixels,
Lottie is baked geometry, Remotion is an arbitrary program, Rive is binary. The
research also identified the blocker: Marey has **no text metrics**, so a longer
locale string overflows with no recourse. Demand is unverified.
See `docs/research/2026-09-09-marey-adjacent-gaps.md` §§1–3.

**Other runtimes** — embedded or microcontroller targets, which would require a
second non-browser backend.

---

## 14. Success criteria

The previous roadmap's §15 measured external users. Those criteria are void
under R14. Two groups replace them.

### 14.1 Engineering

- Determinism proven end-to-end, from source through simulation to artifact.
- Exact frame counts at every supported frame rate.
- Identical hashes across repeated exports.
- Artifacts verified in independent players, not only in Marey.
- Every unsupported feature fails with a named diagnostic rather than silently.
- The suite continues to guard what it claims to; see `AGENT-LESSONS.md` §2.

### 14.2 Legibility

- A reader can state what Marey is and what is hard about it in under ten
  minutes.
- The determinism story is written down where a reader will find it.
- Evidence is reproducible from the repository — commands, not claims.

### 14.3 Retained from the previous roadmap

These measured design quality rather than adoption, and survive: source and diff
size for canonical changes; hand-unrolled object and coordinate counts;
first-pass semantic correctness; deterministic export equality.

**Not** success metrics: raw feature count, solver fidelity, playground-only
scene count, download counts, and stars.

---

## 15. Phase numbering map

This document renumbers. The mapping is recorded so the history stays
traceable.

| Previous | This document | Note |
|---|---|---|
| 0, 1, 2, 3A, 3B | unchanged | Complete. 3B merged at `1645cef`, review fixes at `e1dcdd8`. |
| — | **3C — Motion primitives** | New. |
| 4 | **4 — Composition and export foundation** | Unchanged. |
| 5A | **5A — Baked Lottie** | `text` now excluded (R17). |
| §10.2 (a subsection) | **5B — Video** | Promoted to a phase. |
| 5B — Distribution | **6 — Packaging and legibility** | Rescoped; acquisition work removed. |
| 6 — Motion-graphics core | **7** | `delay` moved to 3C. |
| 7 — Physics syntax | **8** | Unchanged. |
| 8 — Docs site and adoption | §13, beyond the finish line | No longer a phase. |

---

## 16. Document authority

- `2026-08-26-physics-shared-world-design.md` remains authoritative for the
  motion-graphics direction, decisions D1–D18, and Phases 0–2.
- `2026-09-01-marey-product-roadmap-design.md` remains the historical record of
  Phases 3A and 3B and of the reasoning that pulled export ahead of physics
  breadth. It is superseded from Phase 4 onward.
- This document is authoritative from Phase 3C onward.
- Completed implementation plans remain historical records.
- A future decision that changes this roadmap should be recorded in a new dated
  design rather than rewriting this one, per the rule this project has now
  followed twice.
