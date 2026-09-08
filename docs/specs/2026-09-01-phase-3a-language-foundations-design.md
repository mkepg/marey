# Phase 3A — Language Foundations, Cuts, and Renames

**Date:** 2026-09-01
**Status:** Approved in design discussion; pending written-spec review.
**Roadmap authority:**
`2026-09-01-marey-product-roadmap-design.md` §7.
**Preserves:** Decisions D1–D18 in
`2026-08-26-physics-shared-world-design.md` and the Phase 2 execution notes.
**Scope:** Breaking language cleanup across compiler, editor, documentation,
fixtures, and evaluation. No new authoring capability.

---

## 1. Purpose

Phase 3A gives every later Marey artifact one final vocabulary and one
authoritative property contract before Phase 3B adds language capability and
Phases 4–5 add export and distribution.

It does four things:

1. breaks the old `def`, `handOff`, `sceneFit`, and `z` spellings in favour of
   `let`, `handoff`, `fit`, and `layer`, without aliases;
2. replaces duplicated property knowledge with a compiler-neutral contract;
3. closes deterministic-AST, validation, resource-limit, yoyo-lifecycle, and
   evaluation-harness defects already assigned to this phase;
4. turns the roadmap's deliberate cuts and deferrals into regression tests.

The phase does not add lists, indexing, modulo, comparison, conditionals,
trigonometry, new physics controls, export, or any other authoring capability.

---

## 2. Current-state audit

The editor is not four fully independent property tables. It already imports
`REQUIRED_PROPS`, `PROP_TYPES`, and `KIND_LABEL` from the validator
(`src/components/Editor/MonacoEditor/language.ts:1-4`). The remaining drift is
nevertheless structural:

- parser object-name reservations are a separate literal set and still contain
  `anchor`, `width`, and `height`
  (`src/compiler/parser/parseObject.ts:9-15`);
- accepted and required property kinds live in the validator
  (`src/compiler/typeChecker/validator.ts:3-45`);
- builder defaults are repeated at each IR construction site
  (`src/compiler/typeChecker/builder.ts:131-249`);
- Monaco independently owns keyword sets, enum sets, placeholders, snippets,
  and value suggestions
  (`src/components/Editor/MonacoEditor/language.ts:11-45`,
  `195-216`, `222-307`, `342-427`);
- property prose is a hand-written map
  (`src/components/Editor/MonacoEditor/constants.ts:19-46`);
- the lightweight Monaco scope scanner independently recognizes `def` and
  infers enum kinds
  (`src/components/Editor/MonacoEditor/scanner.ts:66-113`).

The rename boundaries are also real interfaces, not only text replacements:

- `sceneFit` has a distinct lexer token and AST value kind
  (`src/compiler/types.ts:1-11`, `81-90`);
- `handOff`, `z`, and `sceneFit` are serialized IR fields
  (`src/compiler/sceneIR.ts:19-27`, `51-62`, `92-100`, `118-125`);
- `z` controls stable source-order sorting in the IR builder
  (`src/compiler/typeChecker/builder.ts:259-296`);
- `sceneFit` crosses the renderer boundary in the thin DOM/Pixi adapter
  (`src/compiler/renderer/adapter.ts:63-86`).

Determinism is currently broken because both `animate` and `physics` receive a
`Math.random()` name (`src/compiler/parser/parseObject.ts:159-165`). `parallel`
and `sequence` already demonstrate positional naming
(`src/compiler/parser/parseObject.ts:69-78`, `138-147`).

The yoyo lifecycle defect is explicit in `advanceAnimTime`: the return to zero
without `loop` never sets `completed`
(`src/compiler/renderer/timeline.ts:21-44`). Completion matters outside the
timeline because `SceneRuntime.tickAnim` owns handoff and pin-release side
effects (`src/compiler/renderer/sceneRuntime.ts:160-208`), the tick loop owns
runner ordering (`393-463`), and paint removes completed runners before the
idle test can pass (`472-506`).

The evaluation collision is also confirmed: both corpora write
`${DIR}/../report.json` (`eval/compile.test.ts:15-17`, `44-50`).

Baseline before work: clean `main` at `c3863ca`; 187 tests in 10 files pass.

---

## 3. Decisions

### P3A-1 — One pure, compiler-neutral contract

Create `src/compiler/languageContract.ts`. It contains immutable plain data and
small derivation helpers. It imports no validator, parser, Monaco, PixiJS, or
renderer module. Consumers point inward to it:

```text
                         languageContract.ts
                        /          |          \
               lexer/parser   validator/IR   Monaco
```

This direction replaces the current Monaco-to-validator dependency rather than
moving UI knowledge deeper into the type checker.

The contract owns:

- the accepted source properties per `scene`, renderable, `animate`, and
  `physics` block;
- required membership;
- accepted AST value kinds;
- builder defaults for optional properties;
- local declarative constraints such as scalar ranges, positive values, string
  length, point-component positivity, and point-list cardinality;
- neutral property descriptions and examples used to format editor hovers;
- completion placeholders;
- enumerated values: fit modes, easings, booleans, named colours, and
  `indefinitely`;
- the animatable-property set;
- current source spellings and contextual legacy-spelling replacements;
- reserved object-name behaviour, derived from the union of current property
  names rather than maintained separately.

The contract does not own:

- grammar placement (`let`, `generate`, `template`, `use`, `sequence`, and
  `parallel`);
- cross-property or cross-node validation such as handoff, D17, sequence rules,
  physical-line rejection, or physics cost limits;
- renderer behaviour;
- Monaco APIs, Markdown containers, or completion-item types;
- long-form keyword tutorials and block examples.

`to` remains declared as accepting number or point in the property contract;
its dependency on the selected animation property remains a cross-property
validator rule. Physics `duration` likewise admits number or `indefinitely` in
the contract while sequence restrictions remain validator rules.

Shared visual-property fragments may be composed into the block contracts, but
there is one exported authoritative data object. Derived compatibility exports
such as `PROP_TYPES` are allowed only when computed from it; no second literal
property list remains.

### P3A-2 — Defaults are executable contract data

Builder defaults come from the contract rather than remaining numeric literals
scattered through `builder.ts`. Required properties have no defaults. A
completion placeholder is distinct from a semantic default: for example, a
required scene `size` may suggest `(600, 400)` but has no compiler fallback.

The important physics defaults remain unchanged:

- `gravity: (0, 980)`;
- `velocity: (0, 0)`;
- `airDrag: 0.0`;
- `bounce: 0.65`;
- `collideBounds: true`.

Physics snippets use `airDrag: 0.006`, a useful light-drag example rather than
the stale `0.99` currently inserted at
`src/components/Editor/MonacoEditor/language.ts:380-387` and `410-427`.

The `bounce` description states shared-world semantics: it applies to object
and boundary collisions, and Matter combines two objects' restitution using
the higher value. `collideBounds` alone describes scene-edge participation.

### P3A-3 — Reserved names follow current language properties

The parser derives `RESERVED_PROPERTY_NAMES` from current contract keys.
Consequently `anchor`, `width`, and `height` become legal object and binding
names. They remain unknown when used as properties.

Removed spellings are not made permanently reserved as arbitrary identifiers.
For example, `circle z { ... }` may use `z` as a name, while `z: 2` is rejected
as obsolete syntax. Migration detection is contextual, not a global substring
ban.

### P3A-4 — All four public boundaries use final vocabulary

| Concept | Source and AST | Scene IR | Renderer/editor | Error-code policy |
|---|---|---|---|---|
| Binding | only `let`; bindings are substituted and have no AST node | none | scanner and snippets say `let` | parser migration errors name `def → let` |
| Handoff | property `handoff` | `IRAnimation.handoff` | runtime reads `.handoff` | keep conceptual `TYPE_HANDOFF_*` codes; add `TYPE_HANDOFF_DURATION` |
| Preview fit | property `fit`; AST kind `fit` | `IRSceneNode.fit`, `IRFit` | adapter reads `scene.fit` | migration errors name `sceneFit → fit` |
| Drawing order | property `layer` | visual/group `.layer` | builder sorts `.layer` | migration errors name `z → layer` |

`parseDef.ts` is renamed to a binding-oriented implementation name rather than
leaving a live internal API named after removed syntax. Similar local names
change where they represent the language concept; unrelated CSS `z-index`,
Matter fields, and ordinary English uses are not mechanically rewritten.

The worker serializes Scene IR as JSON (`src/compiler/index.ts:48-64`), so the
IR field renames are intentional wire-contract changes within this application.
Share links contain source in the URL fragment, not AST or IR. Old share links
therefore compile to migration diagnostics; no decoder migration or alias is
added.

### P3A-5 — Old syntax receives exact migration diagnostics

Each obsolete form is recognized only where its former syntax would apply and
is rejected at its own token:

```text
[PARSE_RENAMED_KEYWORD] 'def' was renamed to 'let'. Replace 'def name = ...'
with 'let name = ...'.

[PARSE_RENAMED_PROPERTY] 'sceneFit' was renamed to 'fit'. Replace
'sceneFit: ...' with 'fit: ...'.
```

Equivalent messages cover `handOff` and `z`. Property-name parsing is factored
through one helper so scene, object, and `use` wrapper properties cannot drift.
The diagnostic is emitted before the value is parsed, preserving the key
token's exact line and column. `def` is caught in every statement-bearing
context, including top level, scene, object, template expansion, `generate`,
and `use` expansion.

No old spelling is entered into the accepted contract and no compatibility
alias reaches AST or IR.

### P3A-6 — Deterministic block identity is source-token identity

Unnamed blocks use the opening keyword position:

```text
animate_<line>_<column>
physics_<line>_<column>
```

This is deterministic for identical source and follows `sequence`/`parallel`.
`generate` and `use` deliberately rewind and reparse token ranges
(`src/compiler/parser/parseGenerate.ts:50-86`,
`src/compiler/parser/parseUse.ts:96-168`). Reparsed expansions may therefore
contain equal internal animation/physics names. That is sound because these
block names are not sibling visual identities and are discarded while building
IR (`src/compiler/typeChecker/builder.ts:105-127`). Visual IDs continue to use
scope paths and generated name suffixes.

The observable contract is:

- parsing the same source repeatedly produces deeply equal AST and parse
  metadata;
- compiling it repeatedly produces byte-identical JSON Scene IR;
- the equality fixture includes sequences, parallels, templates, uses,
  generated objects, and nested generation;
- semantic whitespace variants produce identical IR, although their AST source
  positions intentionally differ.

Commit external Vitest golden snapshots for:

1. primitives, defaults, normalization, and stable layer ordering;
2. templates/generation plus animation, parallel, sequence, and physics.

The snapshots serialize the complete Scene IR. AST positions and internal
nonvisual block names do not enter the goldens, so formatting changes do not
create IR snapshot noise.

### P3A-7 — Physical lines are rejected wherever they become geometry

`line` remains a visual primitive but may not contribute a physics collision
shape. Reject:

- a line with direct physics;
- a line whose sequence contains physics;
- a line anywhere below a group that owns a body, including through nested
  visual groups.

The last case matters because a physical group currently flattens every leaf
shape into parts (`src/compiler/renderer/builder.ts:111-135`, `285-295`). Merely
checking for a line's own `physics` child would leave the rectangle
approximation live inside compounds. A line with animation only remains legal.

Use `TYPE_LINE_PHYSICS`, positioned on the line node. Include permission tests
for nonphysical lines and physical circle, rectangle, polygon, text, and group
cases.

### P3A-8 — Handoff targets follow runner scheduling

The validator resolves the physics runner that can receive each `handoff` under
the syntax already accepted today:

- top-level `animate` and physics children of one renderable start concurrently;
- animate and physics siblings within one `parallel` start concurrently;
- in a `sequence`, the direct physics sibling must occur after the handoff
  animation; a physics step that already completed is not a target;
- nested target shapes that are currently rejected remain rejected. Phase 3A
  does not widen the handoff grammar.

For concurrent runners, require:

```text
numeric physics duration > effective animation runtime
effective animation runtime = duration × (yoyo ? 2 : 1)
```

`duration: indefinitely` always outlasts the animation. Equality is invalid:
animations complete and write pending velocity before physics runners advance
and freeze in the same tick
(`src/compiler/renderer/sceneRuntime.ts:393-433`). A later sequence physics step
starts after the animation, so its own positive numeric duration need not exceed
the animation duration.

`TYPE_HANDOFF_DURATION` is positioned on the too-short physics duration and
states both durations. Existing conceptual codes remain stable:
`TYPE_HANDOFF_PROP`, `TYPE_HANDOFF_LOOP`, `TYPE_HANDOFF_PHYSICS`, and
`TYPE_HANDOFF_AMBIGUITY`. Their messages use the new spelling.

Permission tests cover a longer finite concurrent runner, `indefinitely`, and a
shorter later sequence runner. Rejections cover shorter and equal concurrent
runners, earlier sequence physics, and yoyo's doubled runtime.

### P3A-9 — Physics cost has body and primitive ceilings

The parser's 15,000-unit budget is not a physics cost model. Runtime body
qualification is one body for any container with direct physics or physics in
its sequence (`src/compiler/renderer/physicsSync.ts:32-47`, `77-119`). A physics
group may place many flattened leaves into that one body.

Enforce after macro expansion:

- `MAX_PHYSICS_BODIES = 500` body-owning renderables;
- `MAX_PHYSICS_PARTS = 2_000` total collision primitives.

Counting is defined as follows:

- direct physics and any physics step in an object's one sequence qualify that
  object once;
- several physics steps on one object still count as one body;
- a non-group physical shape contributes one primitive;
- a physical group contributes one body and one primitive per flattened
  descendant visual leaf;
- nested visual groups add their leaves, not additional bodies, unless they
  independently qualify for physics (which other validation may reject under
  D17);
- nonphysical visuals contribute zero to both totals;
- generated objects and template expansions count in their expanded form.

The limits are crash/resource guardrails, not a promise of real-time playback.
A local Matter 0.20 directional probe found 500 fully overlapping ordinary
bodies already took about 1 second for ten 120Hz steps on the development
machine, while separated bodies and parts were much cheaper. The conservative
500-body wall prevents the compiler's 15,000-unit ceiling from being mistaken
for a solver-safe value; the separate part wall prevents a single compound from
bypassing the protection.

Emit at most one `TYPE_PHYSICS_BODY_LIMIT` and one
`TYPE_PHYSICS_PART_LIMIT`, each positioned on the first owner or leaf that
crosses its limit. Test exactly-at-limit permission and limit-plus-one rejection
for ordinary bodies, sequence-created bodies, physical groups, nested visual
groups, and many nonphysical objects.

### P3A-10 — A non-looping top-level yoyo completes after the return leg

For `yoyo: true, loop: false`, `advanceAnimTime` completes on the tick it
returns to elapsed tick zero, exactly `2 × durationTicks` after starting. The
completed value is the animation's starting value.

That tick must preserve the runtime lifecycle:

- `tickAnim` applies the exact starting value during tick mutation;
- `POS_ANIM` is released;
- rotation override is released when relevant;
- the completed runner is removed during paint;
- `isIdle()` can become true;
- a body held by the animation can resume gravity and collisions.

An allowed `handoff` on a non-looping yoyo uses the return-leg direction. Its
exit velocity points from the target toward the start, not from start to target.
The concurrent duration rule in P3A-8 uses the two-leg runtime.

`TYPE_SEQ_YOYO` remains a rejection. Allowing yoyo inside a sequence would be
new authoring capability, contrary to Phase 3A's scope. Its diagnostic changes
from the now-false claim that yoyo never completes to a direct statement that
sequence yoyo is unsupported and should be expressed as two explicit animation
steps.

Tests cover timeline completion and one-shot reporting, progress at the start
value, paint removal, idle transition, pin release, subsequent real-world body
motion, reverse handoff velocity, and identical world calls under 1-, 7-, and
12-tick frame pacing.

### P3A-11 — Every roadmap cut or deferral has an executable guard

Create focused negative suites rather than relying on generic parser
limitations accidentally remaining in place.

| Roadmap boundary | Guard |
|---|---|
| `mass`, surface `friction` | unknown physics-property tests |
| collision categories and masks | reject representative `collisionCategory` and `collisionMask` properties |
| concave decomposition and `poly-decomp` | retain a semantic test that a concave polygon uses its convex hull; no decomposition option is accepted |
| general mutable variables | same-scope rebinding and assignment rejection |
| user-defined functions | reject representative function declaration/call syntax |
| arbitrary object values | reject an object literal bound with `let` |
| file/network access | reject representative import and network-call syntax |
| general scripting runtime | reject control-flow statements such as `while`/statement `if` |
| plugin system | reject a representative plugin declaration |
| Phase 3B capability | reject general lists/indexing, modulo, comparisons, conditional values, and trig |
| deferred Phase 7 syntax | reject `world`, `lockPosition`, `lockRotation`, and `spin` |

Where a cut is semantic rather than syntax—most importantly convex-hull
collision—the guard asserts the shipped behaviour rather than inventing a fake
keyword. Every rejection group includes a nearby permission case so a parser or
validator that rejects the containing headline feature cannot report green.

### P3A-12 — Evaluation reports are derived from corpus identity

Factor a pure report-path function in `eval/compile.test.ts` and test:

```text
eval/scenes     → eval/report.json
eval/scenes-r2  → eval/report-r2.json
```

For another `scenes-<suffix>` directory, use `report-<suffix>.json`; for an
arbitrary basename, include that basename rather than falling back to the R1
path. Normalize with `node:path`, not string slicing across separators.

Migrate both source corpora to final vocabulary before rerunning them. Their
reports contain compilation results and node counts, not source, so successful
migration should reproduce the committed conclusions. `RESULTS.md` and
`RESULTS-R2.md` remain historical records; add a short note that quoted old
spellings describe the pre-3A corpus instead of rewriting or erasing the
authorability findings.

### P3A-13 — Current teaching moves; history stays historical

Migrate:

- `docs/LANGUAGE.md`, including every compiled fence and the yoyo behaviour;
- `AGENTS.md` and its mirrored `AGENTS.md`;
- Monaco tokenization, scanning, hovers, completions, themes, and snippets;
- the default scene and its behavioral tests;
- share-source fixtures and tests;
- `tools/visual-check/scenes/`;
- both `.eval` source corpora;
- current comments and public-facing diagnostics.

Approved historical plans and superseded specifications retain old spelling
where it records what the language was or what an earlier phase did. The current
roadmap's old-to-new mapping also remains. Historical evaluation prose keeps
quoted source evidence with the note required by P3A-12.

`docs/LANGUAGE.md` removes the stale warning that a non-looping yoyo never
finishes, documents completion at `2 × duration`, documents the two physics
ceilings, states that line is visual-only when physics is concerned, and records
the handoff duration rule. Its existing compiled-example and behavioral suite
must be green at the end.

### P3A-14 — Browser verification stays at the adapter boundary

The `sceneFit → fit` IR rename reaches the DOM/Pixi adapter, so verify all four
fit modes through the existing Chromium visual-check workflow. Always start
Vite with `--strictPort`; samples around 300ms are not rendering oracles because
initialization generally completes around 900–1100ms.

Do not reopen broad `adapter.ts` unit coverage. `SceneRuntime` contains the
testable lifecycle; `adapter.ts` remains the canvas, layout, and ticker boundary.

---

## 4. Test architecture

Implementation follows test-driven development. Each task begins with a
permission and/or rejection test that fails for the intended reason.

### 4.1 Contract tests

- derived reservations equal the union of current property keys;
- `anchor`, `width`, and `height` are absent;
- parser, validator views, hover property names, and completion property names
  are derived from the contract;
- enum suggestions equal lexer enum values;
- defaults used by IR match contract defaults;
- `airDrag` snippets use `0.006` and bounce hover mentions object collisions.

### 4.2 Rename tests

- each new spelling compiles through IR;
- each old spelling fails at its token with its replacement and position;
- rejected spellings are tested at top level, object/scene property contexts,
  `use` wrappers, and reparsed macro contexts where applicable;
- IR and renderer-facing types expose only `handoff`, `fit`, and `layer`.

### 4.3 Determinism and goldens

- repeated AST deep equality;
- repeated IR JSON byte equality;
- semantic whitespace IR equality;
- two committed external snapshots.

### 4.4 Validation and lifecycle

- physical-line permission/rejection matrix;
- handoff target and timing matrix;
- body/part counting matrix at and above both limits;
- all language cuts and deferrals;
- yoyo timeline, runtime, pin, physics, idle, and pacing consequences.

### 4.5 Integration and corpus checks

- default scene and share-size tests;
- every language-reference fence and behavioral assertion;
- both evaluation report-path tests and corpus runs;
- typecheck, complete headless suite, and production build;
- Chromium fit/default/determinism checks after renderer initialization.

---

## 5. Implementation boundaries

The implementation plan should preserve these reviewable task groups:

1. **Contract foundation:** add the pure contract and derive compiler/editor
   views without changing accepted syntax yet.
2. **Breaking vocabulary:** migrate lexer/parser/AST/IR/renderer and add exact
   old-spelling diagnostics.
3. **Determinism:** positional block names, repeated-compilation tests, and IR
   goldens.
4. **Physics validation:** physical-line rule, handoff target/timing, and
   body/part limits.
5. **Yoyo lifecycle:** timeline first, then runtime holds, handoff direction,
   idle, and pacing.
6. **Cuts and deferrals:** executable negative and permission matrix.
7. **Editor and authored sources:** Monaco, default/share/visual fixtures,
   language reference, and current guidance.
8. **Evaluation harness and corpora:** path fix first, source migration second,
   then both reproducibility runs.
9. **Integrated verification:** focused tests after each task, then full suite,
   typecheck, build, and Chromium checks.

Tasks may be split further for Subagent-Driven Development, but no task may
separate a contract change from the consumer tests that prove it, or a
rejection rule from its permission cases.

---

## 6. Explicit non-goals

- No compatibility aliases or automatic source rewriting.
- No list, index, length, modulo, comparison, conditional, or trig syntax.
- No `world`, `lockPosition`, `lockRotation`, or `spin`.
- No color animation or other Phase 6 motion features.
- No export, CLI, package, or distribution work.
- No broad adapter unit-test project.
- No Matter.js version change and no `poly-decomp` dependency.
- No rewriting of approved historical plans/specifications to pretend the old
  vocabulary never existed.

---

## 7. Exit criteria

Phase 3A is complete only when:

- only `let`, `handoff`, `fit`, and `layer` are accepted as the four constructs;
- old forms produce exact positioned migration diagnostics;
- parser reservations, validation, builder defaults, property hovers,
  completions, enum suggestions, and animatable membership derive from the
  authoritative contract;
- `anchor`, `width`, and `height` are legal names and unknown properties;
- identical source produces equal AST and byte-identical IR repeatedly;
- committed IR goldens are stable across formatting-only changes;
- every physical line is rejected and nonphysical lines remain legal;
- every valid handoff has a live target at completion;
- the 500-body and 2,000-primitive limits are documented and enforced after
  macro expansion;
- a top-level non-looping yoyo completes at its start value after the return
  leg, releases lifecycle holds, and does not introduce frame-pacing variance;
- every roadmap cut and Phase 3B/7 deferral has an executable guard;
- R1 and R2 write separate reports and reproduce their committed conclusions;
- current docs, editor surfaces, default/share/visual/evaluation sources all
  use final vocabulary;
- typecheck, all headless tests, production build, language-doc tests, both
  evaluation corpora, and relevant Chromium checks pass.
