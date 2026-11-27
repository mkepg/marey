# Phase 10B Stage 1: the layout authorability measurement

**Goal:** Measure, with blind authors and a validated geometry checker,
whether authors get row, column, grid, radial, distribute and align layouts
wrong often enough to justify layout primitives (R11), and record the
decision for each one.

**Architecture:** A geometry checker in the eval suite composes transforms
down the compiled IR to world-space boxes and applies one tagged clause list
per brief. It is validated against tracked correct and deliberately wrong
reference scenes before any author runs. Four isolated authors then write
nine briefs each, blind, with compile-error feedback only. The checker's
per-scene results and the pre-registered rule produce the decision.

**Tech stack:** TypeScript, vitest (`eval/vitest.config.ts`), the existing
`compileSource`.

**Spec:** `docs/specs/2026-11-27-marey-phase-10b-layout-design.md` §2.
Stage 2 (§3) gets its own plan after this one's results.

## Global Constraints

- Repository rules in `AGENTS.md` bind every commit: explicit staging and
  `git diff --staged`; no `git add -A`, `git add .` or `git add -f`;
  Conventional Commit subjects; no `Co-Authored-By`; committed text never
  names AI tools or describes the assistant workflow.
- All four checks pass before every commit: `npm test`;
  `npx vitest run --config eval/vitest.config.ts`; `npm run build`;
  `npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')`.
- Run from `C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey` with a capital
  `C:`. `core.autocrlf` is on: judge changes with `git diff --stat -- <path>`.
- Branch `phase-10b`. Do not push.
- Tolerance: 0.5 px on every length, 0.5° on every angle.
- Clause tags exactly: `brief`, `row`, `align`, `distribute`, `grid`,
  `radial`.
- The checker shares no code with any compiler layout code (there is none
  yet; there must not be an import from `src/compiler/` other than
  `compileSource` and the IR types).
- The briefs' text in `eval/BRIEFS-LAYOUT.md` is the spec §2.2 table's text,
  verbatim.
- No language change in this plan. `src/` is untouched.

## Review Focus

1. A shape nested two groups deep, inside a rotated and scaled group: its
   world box must compose both transforms in order (Task 1 test).
2. A rectangle with a non-default `origin` and a `rotation`: its box must be
   the box of its rotated corners about the pivot, not about its centre
   (Task 1 test).
3. A `use` instance: the template expansion's wrapper group transform must
   apply to its children (Task 1 reference L5).
4. An anticlockwise ring (L8) must fail the `radial` direction clause, and
   a ring started at 3 o'clock must fail the start clause (Task 1 references).
5. A scene with an extra decorative shape (a background rectangle covering
   the scene): the checker must identify the brief's shapes by type and size
   and ignore others, without a false failure (Task 1 test).

---

### Task 1: The geometry checker and its references

**Files:**
- Create: `eval/layout/geometry.ts` — `worldBoxes(ir: IRSceneNode): WorldShape[]`
- Create: `eval/layout/predicates.ts` — `BRIEFS: Record<BriefId, Clause[]>`
- Create: `eval/layout/reference/` — per brief one `L<n>-ok.marey` and one or
  more `L<n>-<clause>.marey` wrong scenes
- Create: `eval/layoutCheck.test.ts`
- Create: `eval/BRIEFS-LAYOUT.md`

**Interfaces:**
- Produces:
  - `type BriefId = "L1" | ... | "L9"`.
  - `interface WorldShape { kind: "circle" | "rectangle" | "polygon" | "line" | "text"; id: string; box: { minX: number; minY: number; maxX: number; maxY: number }; pivot: { x: number; y: number }; size: { w: number; h: number } /* declared, unscaled: rectangle width/height, circle 2r */; rotation: number /* world degrees */; scale: { x: number; y: number } /* world */ }`.
  - `interface Clause { name: string; tag: "brief" | "row" | "align" | "distribute" | "grid" | "radial"; check(shapes: WorldShape[]): boolean }`.
  - `function checkScene(brief: BriefId, source: string): { compiled: boolean; results: { clause: string; tag: string; pass: boolean }[] }` exported from `eval/layout/predicates.ts`.

- [ ] **Step 1: write `eval/BRIEFS-LAYOUT.md`.** The spec's §2.1 protocol,
  §2.2 table (verbatim), and the author prompt below, verbatim. Note the
  `BRIEFS.md` differences (readable surface adds `site/content/learn/`).

- [ ] **Step 2: write the failing geometry tests in `eval/layoutCheck.test.ts`.**
  Inline sources, compiled with `compileSource`:
  - `a 60×40 rectangle at (100, 100) has box (70, 80)–(130, 120)`.
  - `a rectangle with origin (0, 0) at (100, 100) has box (100, 100)–(160, 140)`.
  - `a 60×40 rectangle rotated 90° about its centre has box 40×60`.
  - `a rectangle with origin (0, 0), rotated 90°, at (100, 100) has box (60, 100)–(100, 160)`.
  - `a circle r10 at (5, 5) inside a group at (100, 0) rotated 90° and scaled (2, 2) has pivot (90, 10) and box 40×40` (y down, clockwise positive: local (5, 5) → rotated (−5, 5) → scaled (−10, 10) → translated (90, 10)).
  - `a use instance's children carry the wrapper group's position`.
  - `a scene-filling background rectangle is ignored by every L1 clause`.

  Run `npx vitest run --config eval/vitest.config.ts`: these fail
  (`worldBoxes` does not exist).

- [ ] **Step 3: implement `worldBoxes`.** Walk `ir.children` with a running
  affine transform (translate · rotate · scale per group, in the renderer's
  order — read `src/compiler/renderer/` only to confirm the order and the
  rotation unit, and do not import from it). A shape's local box is its
  declared extent offset by `origin`, its four corners (or its points, for
  polygon and line) mapped through the shape's own rotate/scale about its
  pivot and then the group transforms. `text` gets a zero-size box at its
  pivot.

- [ ] **Step 4: write the predicates** per spec §2.3, each clause tagged per
  the §2.3 tag table. A brief's shapes are picked by kind and declared size
  (`size`, unscaled); shapes of any other kind or size are ignored. Count
  clauses fail if the picked set has the wrong cardinality, and every other
  clause then reports fail too (they cannot be judged).

- [ ] **Step 5: write the references.** For each brief: one `-ok` scene a
  careful author would write (hand-computed literals or `generate`), and one
  wrong scene per non-`brief` clause, each wrong in exactly one way: 2 px
  shift, a gap off by 2, a 90° start error, an anticlockwise ring, one tick
  not oriented. Add tests:
  - `every -ok reference passes every clause`.
  - `every wrong reference fails its named clause and passes every clause with a different tag`.

- [ ] **Step 6: delete-and-run.** For three clauses of different tags
  (one `row`, one `radial`, one `grid`), make the clause always return true,
  run the suite, see the matching wrong reference's test go red, restore.
  Record the red output in the report.

- [ ] **Step 7: run the four checks, commit.** `marey check` includes the
  new reference scenes; every one must compile.
  Subject: `test(eval): add a geometry checker for the layout briefs`

### Task 2: The blind round

Run by hand, not by an implementer: four authors, isolated, with the prompt
below. Nothing in `src/` or `eval/layout/` changes during this task.

**Author prompt (verbatim, with `<AUTHOR>` set to A, B, C or D):**

> You are writing scenes in Marey, a small language for 2D motion graphics.
> You have no prior knowledge of it. You may read only:
> `src/examples/dusk-hills.marey`,
> `src/components/Editor/MonacoEditor/language.ts`,
> `src/components/Editor/MonacoEditor/constants.ts`, `docs/LANGUAGE.md`, and
> the files under `site/content/learn/`. Do not read anything else in the
> repository, and do not run any command.
>
> Write one scene per brief in `eval/BRIEFS-LAYOUT.md`'s "Briefs" table (read
> only that table and the scene-size line above it in that file), all nine,
> before checking anything. Save each as
> `eval/scenes-layout/<AUTHOR>-<file>.round1.txt`.
>
> Then write a report to `<REPORT_PATH>`: one line per place you were unsure
> how to express something or whether a number was right, naming the brief.

**Compile rounds:** for each round-1 file, compile it with
`node bin/marey.mjs check <file>` (copied to a temporary `.marey`). If it
fails, send that author the exact compiler output for that file and ask for
a corrected version, up to three times. The first compiling version is saved
as `eval/scenes-layout/<AUTHOR>-<file>.marey`, unchanged. Authors never see
geometry results.

- [ ] **Step 1:** dispatch four authors, isolated, same model tier.
- [ ] **Step 2:** run compile rounds; save files.
- [ ] **Step 3:** commit the corpus.
  Subject: `test(eval): add the blind layout corpus`

### Task 3: Results and the decision

**Files:**
- Modify: `eval/layoutCheck.test.ts` — when `eval/scenes-layout/` exists,
  check every `.marey` there against its brief and write
  `eval/report-layout.json` (scene, compiled, per-clause pass, tag). This
  test reports; it does not fail on a geometric failure.
- Create: `eval/RESULTS-PHASE-10B-MEASUREMENT.md`

- [ ] **Step 1:** add the corpus run and write the report.
- [ ] **Step 2:** write the results file:
  - per scene: compiled (and in which round), every failing clause and its
    tag;
  - per primitive: the count failing for it over |S(P)|, the spec §2.4 rule
    applied, and the decision: **built** or **not built**;
  - the descriptive numbers (spec §2.4): layout-token share per scene, and
    the authors' uncertainty lines, grouped by brief;
  - what this does not show (sample size, one model family, briefs written
    by the people who will build the feature).
- [ ] **Step 3:** amend the roadmap (§13, dated note) with the decision.
- [ ] **Step 4:** four checks, commit.
  Subject: `docs(10b): record the layout authorability measurement`
