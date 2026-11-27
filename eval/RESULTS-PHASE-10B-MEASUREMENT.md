# Phase 10B Stage 1: layout authorability — results

**Date:** 2026-11-27.
**Protocol and briefs:** `eval/BRIEFS-LAYOUT.md`; design
`docs/specs/2026-11-27-marey-phase-10b-layout-design.md` §2.
**Corpus:** `eval/scenes-layout/` (36 scenes, unedited, and the four authors'
reports as written, `A-report.txt` to `D-report.txt`).
**Checker:** `eval/layout/` and `eval/layoutCheck.test.ts`; per-clause output,
each scene's layout-token share and the mutation sweep in
`eval/report-layout.json`.

Reproduce:

```bash
npx vitest run --config eval/vitest.config.ts eval/layoutCheck.test.ts
```

## Headline

**36 of 36 scenes compiled on the first, blind pass, and 36 of 36 pass every
geometry clause.** No scene fails for any primitive, so under the rule fixed
before the round ran (spec §2.4) **no layout primitive is built.** Phase 10B
ends here, with this record and no language change.

| Primitive | S(P) | Scenes failing for P | Rule (≥ ¼ of S and ≥ 2) | Decision |
|---|---|---|---|---|
| `row` / `column` | 16 (L1, L2, L4, L5) | 0 | not met | not built |
| `align` | 8 (L2, L4) | 0 | not met | not built |
| `distribute` | 4 (L3) | 0 | not met | not built |
| `grid` | 8 (L6, L7) | 0 | not met | not built |
| `radial` | 8 (L8, L9) | 0 | not met | not built |

## 1. Protocol as run

As `eval/BRIEFS-LAYOUT.md` describes, with three recorded differences. The
prompt that ran is recorded verbatim under "As run" in that file.

- **How the briefs reached the authors.** The plan's author prompt pointed
  authors at the briefs table in `eval/BRIEFS-LAYOUT.md`. That file also holds
  the checker's predicates and tolerances, so the authors were instead given
  the nine briefs' text directly (without the "Primitive it exercises" column)
  and were barred from reading anything under `eval/`.
- **The spacing convention was extended, which changed the stimulus.** The
  pre-registered convention above the briefs table defines one spacing word:
  "Gap" means the distance between neighbouring *edges*. Only L3 uses it ("equal
  gaps between neighbours"). The prompt that ran said instead: "'Gap' or
  'apart' means the distance between neighbouring edges, unless the brief
  says centres." That goes further in two ways. "Apart" is the word L1, L2,
  L4, L6 and L7 use for their spacing, so the prompt settled how those five
  briefs read; "unless the brief says centres" covers L5's "100 px between
  neighbouring badge centres". For L1, L2, L6 and L7's in-column spacing a
  centre-to-centre reading would overlap the shapes, but for L4's bars and
  L7's columns it would not, and L7's "80 px apart" is the one reading all
  four authors flagged (§4). Read as a centre pitch, L7 fails its
  `grid`-tagged `hgap` clause and L4 its `row`-tagged `gaps` clause (checked
  on scratch copies of `A-stack-columns` and `A-left-stack`). The prompt
  defined that reading before anyone wrote a scene, so a misreading of the
  spacing went from a possible tagged failure to a non-question. That made
  the measurement of layout arithmetic cleaner, and it removed a test of
  reading the briefs.
- **Compile rounds.** None were needed: every round-1 text compiled, so each
  `<author>-<brief>.marey` is byte-identical to its `.round1.txt`.

Authors A–D, four isolated authors of one model family, each wrote all nine
briefs. Each was permitted to read only the worked example, the editor's completions
and hovers, `docs/LANGUAGE.md` and `site/content/learn/`; compliance cannot be
verified.

## 2. Per scene

Every one of the 184 clause evaluations passed (4 to 6 clauses per scene; the
full list is in `eval/report-layout.json`).

| Brief | A | B | C | D |
|---|---|---|---|---|
| L1 `toolbar-row` | pass | pass | pass | pass |
| L2 `mixed-row` | pass | pass | pass | pass |
| L3 `spread-dots` | pass | pass | pass | pass |
| L4 `left-stack` | pass | pass | pass | pass |
| L5 `badge-row` | pass | pass | pass | pass |
| L6 `card-grid` | pass | pass | pass | pass |
| L7 `stack-columns` | pass | pass | pass | pass |
| L8 `ring-12` | pass | pass | pass | pass |
| L9 `clock-ticks` | pass | pass | pass | pass |

All 36 compiled in round 1.

**A clean sweep is checked, not assumed.** The checker was validated before
the round on 41 reference scenes (`eval/layout/reference/`): each brief's
correct scene passes, and each wrong scene fails its named clause. No corpus
scene uses `scale`, so the checker's identification of shapes by declared
size (§5) could not have hidden a failure here.

**A mutation sweep shows the clauses catch small errors in these very
scenes.** `eval/layoutCheck.test.ts` raises each numeric literal of each
corpus scene by 2, one literal at a time and in memory, and checks the result
against the scene's brief; the counts and every mutant that is not killed are
written to `eval/report-layout.json` under `mutationSweep`. The scene's own
`size: (800, 600)` is left alone (72 literals), since no clause reads it. Of
the other 456 mutants, 438 fail a primitive-tagged clause, 8 fail only a
`brief` clause, 2 do not compile and 8 survive:

- **Brief-only (8).** Each moves the square off the disc in an L5 badge
  template (its x or its y, in each of the four scenes). L5's `pairing`
  clause catches it, and it is tagged `brief` (§5).
- **Not compiling (2).** Both index past the end of a list: `widths[2]` to
  `widths[4]` in `B-mixed-row` line 10, and `radii[3]` to `radii[5]` in
  `B-spread-dots` line 12.
- **Equivalent survivors (6).** Four move L9's long ticks from `% 5 == 0`
  to `% 5 == 2` (`A-clock-ticks` line 14, `B-clock-ticks` line 10,
  `C-clock-ticks` and `D-clock-ticks` line 15). The long ticks are still
  every fifth, in another phase, which L9 does not constrain. Two change the
  card colours in `B-card-grid` line 16 (`% 2 == 0` to `% 4 == 0` and to
  `% 2 == 2`), which no brief constrains.
- **Blind-spot survivors (2).** `B-ring-12` line 10 and `C-ring-12` line 12
  raise `360 / count` to `362 / count`, a 30.17° step. Each step is within
  L8's 0.5° tolerance, and the clause never checks the closure from the last
  circle back to the first (§5), so the twelfth circle sits about 6 px from
  its place and the scene passes.

## 3. How the authors wrote it

All 36 scenes use `generate`. The three strategies seen:

- **Arithmetic in the loop** for equal pitches: centring offsets such as
  `400 + (col - (cols - 1) / 2) * (w + gap)` (grids, L1, L6) and
  `400 + ring * cos(i * 30 - 90)` (rings, L8, L9).
- **Hand-computed literal lists** where sizes differ: left edges
  `[226, 282, 418, 514]` (L2), centres `[110, 242.5, 385, 537.5, 685]` (L3),
  tops `225, 285, 345` (L4). Every one of these was correct.
- **Lists built from expressions in-language**, by author B: `B-mixed-row`
  (lines 7-10) and `B-spread-dots` (lines 8-12) write each left edge as
  `x0 + widths[0] + gap` and so on, and `B-left-stack` derives its positions
  from `top`, `bar` and `gap`. Only in `B-left-stack` does a change to one
  width flow through. `B-mixed-row` line 3 writes the row's total as
  `40 + 120 + 80 + 60 + 3 * gap`, and `B-spread-dots` line 5 writes the radii
  into `gap` as `2 * (10 + 30 + 20 + 40 + 15)`, so editing one entry of
  `widths` or `radii` moves the later edges but leaves the centring or the
  gap computed from the old sizes.

`origin` did real work, as LANGUAGE.md suggests: three of the four L2 scenes
use `origin: (0, 1)` to stand the bars on y = 400. In L4, two scenes use it:
A uses `origin: (0, 0.5)` with centre-line y values (240, 300, 360), and C
uses `origin: (0, 0)` with tops (225, 285, 345); both put the left edges on
x = 120. B and D use no `origin` and compute each centre x as `left + w / 2`.

## 4. Descriptive numbers (not part of the decision)

**Layout-token share.** Tokens: identifiers, numbers, two-character operators
and single punctuation characters, with `//` comments removed; a `#` colour is
one token, as the lexer reads it. Layout tokens: every token on a `let` line
(including continuation lines of a multi-line `let`), a `generate` header line
or a line holding `position:`, the whole line counted. Share = layout tokens
over all tokens. This is broader than spec §2.4's wording ("every `let`
feeding a position"): it counts every `let` line, including lets that feed a
size or a colour, and every token of a one-line shape such as
`circle disc { position: (0, 0), radius: 30, color: cyan }`. The figures
below come from `eval/layout/tokenShare.ts`, which the corpus test runs on
every scene and writes to `eval/report-layout.json`.

| Brief | A | B | C | D |
|---|---|---|---|---|
| L1 `toolbar-row` | 65% | 69% | 66% | 39% |
| L2 `mixed-row` | 54% | 75% | 54% | 62% |
| L3 `spread-dots` | 65% | 87% | 65% | 65% |
| L4 `left-stack` | 44% | 71% | 51% | 53% |
| L5 `badge-row` | 77% | 57% | 81% | 47% |
| L6 `card-grid` | 68% | 66% | 74% | 50% |
| L7 `stack-columns` | 56% | 73% | 74% | 56% |
| L8 `ring-12` | 63% | 67% | 67% | 63% |
| L9 `clock-ticks` | 49% | 55% | 52% | 49% |

Median 63.75%, range 39–87% (over the unrounded shares). An earlier version
of this table came from a script that was not committed. All 36 of its
figures are reproduced by splitting a `#` colour into pieces and counting
only lines that begin with `position:`, which misses the
`use Badge() badge { position: … }` lines that carry L5's whole row; that is
why it put L5 at 8–30%. Layout is most of what these scenes say, which is what
the briefs ask for. The share does not show the arithmetic going wrong.

**Recorded uncertainty**, 54 lines across the four reports
(`eval/scenes-layout/A-report.txt` to `D-report.txt`), grouped by what they
were about. The plan asks for the lines grouped by brief; they are grouped
here by topic, and each group names its briefs.

- **No running sum (L2, L3, L4).** All four authors said so in their own
  words: "no sum over a list, so the left edges … are hand-computed
  literals; unsure they are right if widths change" (A); "no way to loop a
  running sum, so each left edge is written out by hand; the arithmetic is
  easy to get wrong" (B); "unsure there is any way to derive them in-language
  without a prefix sum" (C); "there are no running sums, so I hand-computed
  the lefts list" (D). 7 of the 54 lines.
- **What `origin` does at an edge (L2, L4).** Whether `origin: (0, 1)` puts
  the bottom edge exactly on `position`. Assumed from LANGUAGE.md, and right.
- **Brief readings.** Whether L7's "80 px apart" is edge-to-edge: all four
  read it so, as the prompt's convention had defined it (§1; D: "per the
  brief convention"); whether L9's radius 220 is the tick's centre (all four:
  centre); whether L8's ring is traced by centres (yes).
- **Angle conventions (L8, L9).** Whether increasing angle is clockwise with
  y down, whether `cos(-90)` is exact, and the quarter-turn offset for a
  vertical tick. All four got these right.
- **Language questions unrelated to layout.** Empty parameter lists in
  `template Badge()`, `if` inside a point component, fractional coordinates,
  names from nested `generate`.

## 5. What this does not show

- **Small samples.** Four scenes per brief: 16 for `row`/`column`, 8 for
  `align`, `grid` and `radial`, 4 for `distribute`. With zero failures, the
  one-sided 95% exact upper bound on the true failure rate is
  1 − 0.05^(1/n): about 17% for `row`/`column`, 31% for `align`/`grid`/`radial`
  and 53% for `distribute`. So the round rules out a failure rate near or
  above those figures, and does not rule out lower ones: a failure rate of one
  in four would still give zero failures in 4 scenes 32% of the time (6% at
  one in two), in 8 scenes 10% of the time, and in 16 scenes 1% of the time.
  `distribute` in particular is barely constrained. These bounds treat the
  scenes as independent draws, and they are not: the 16 `row`/`column` scenes
  are four authors' work on four briefs, from one model family, one prompt
  and one readable surface, so a habit of one author, or of the family,
  repeats across scenes. The true uncertainty is wider than stated, with an
  effective sample size nearer the number of authors than the number of
  scenes (next bullet).
- **One author population, all capable at arithmetic.** These authors summed
  widths by hand without a mistake. Human authors, or authors working
  without a calculator's patience, were not measured, and may well fail where
  these did not. Four model authors of one family are one population, which
  is also why the bounds above are too narrow. The authors were also not
  unaided: see the next bullet.
- **The tutorial held worked templates for most briefs.** The authors could
  read `site/content/learn/generate.md`, which contains a 12-tick clock face
  on a ring (`cos(k * 30 - 90)`, `rotation: k * 30 - 90`, `k % 3 == 0` long
  ticks, lines 113-131), a bead ring using `i * 360 / count` (lines 159-175)
  and a centred grid `480 + (col - (cols - 1) / 2) * gap` (line 431, in the
  first "Try this" exercise). The corpus reuses these idioms almost verbatim,
  and author C's report cites "the clock example in the generate lesson" and
  "the generate lesson's grid example". So for L1, L6, L7, L8 and L9 the round
  measured adapting a documented idiom, not unaided arithmetic. That is a
  legitimate thing to measure, since the tutorial is what users read, but it
  is not the same as measuring the arithmetic cold. Only L2, L3 and L4 had no
  template, and they are where the running-sum friction showed up.
- **Fully specified briefs.** Every brief gave every number. A brief like "a
  tidy toolbar of six icons" leaves the author to choose sizes and spacing,
  and was not measured; nor was editing an existing layout (changing one
  width in L2 means recomputing three literals, which the authors themselves
  flagged).
- **The briefs and the checker were written by the people who would build the
  feature.** Their interest could bias the result either way: toward finding
  a need, or toward the cheaper outcome of building nothing. They also chose
  fully specified briefs and the tolerances. The mitigation is the
  pre-registration: the briefs, the clauses, their tags, the tolerances and
  the decision rule were fixed and committed before the round ran.
- **Checker readings.** L9 checks no start angle or direction (its brief
  states none); L8's "first" is the first circle in object order; shapes are
  picked and gaps measured by declared, unscaled size, so a scene that
  scaled its shapes could false-fail a clause that picks shapes by declared
  size, or false-pass a gap clause that measures with declared size
  (`eval/layout/predicates.ts:313-315`). None did.
- **L8 never checks the closure.** Its `step` clause compares the 11
  consecutive pairs in object order, each within 0.5° of 30°, and never the
  last circle back to the first (`eval/layout/predicates.ts:253`), so a step
  error accumulates unchecked: a constant 30.45° step passes every clause with
  the twelfth circle about 17 px from its place. Moot here: the corpus writes
  the step as `30` or `360 / count` with `count` 12. The mutation sweep's two
  blind-spot survivors (§2) are this case.
- **A wrong count is charged to the primitive.** A wrong count, or a wrong
  size (a shape of the wrong size is not picked), fails the `count` clause
  and with it every other clause, primitive-tagged ones included
  (`eval/layout/predicates.ts:92-119`). So a pure misreading of the brief
  would count as a failure for the brief's primitive, while spec §2.4 says a
  scene that fails only `brief` clauses fails for no primitive. The checker
  as committed does not implement that case. Moot at zero failures.
- **Tag readings beyond spec §2.3's table.** The table tags count, sizes and
  order `brief`; every other clause kind it names gets a primitive. Some
  clauses are not in it, and were tagged as follows: the shared centre line
  of L1 and L5 is `row`, and of L3 `distribute`; L5's `pairing` (each square
  centred on its disc) is `brief`; L9's `fifth` (the long ticks every fifth
  around the ring) is `radial`. L5's `spacing` measures centres, as its
  brief says, though the table's `row` line speaks of edge gaps. L4's gaps
  and centring are tagged `row` because the table's `row` line names L4:
  `row` stands for `row`/`column`, one primitive under §2.4.
- **Only primitive-tagged clauses have wrong references.** The 41 reference
  scenes hold one wrong scene per non-`brief` clause; no reference shows a
  `brief` clause failing.

## 6. What follows

R11's condition is not met for any of the five primitives, and the language
does not change. The one recurring friction is narrower than any of them:
there is no running sum over a list, so a row of mixed widths is written as
hand-computed literals that are right once and fragile under edits. A
list-prefix-sum expression operator is the smallest change that would remove
that. It is **recorded as a candidate, here and in the roadmap's 10B note,
and not built**: this measurement shows the friction, not an error rate, and
R11 asks for the latter.
