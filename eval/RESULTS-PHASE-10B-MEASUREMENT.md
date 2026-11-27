# Phase 10B Stage 1: layout authorability — results

**Date:** 2026-11-27.
**Protocol and briefs:** `eval/BRIEFS-LAYOUT.md`; design
`docs/specs/2026-11-27-marey-phase-10b-layout-design.md` §2.
**Corpus:** `eval/scenes-layout/` (36 scenes, unedited).
**Checker:** `eval/layout/` and `eval/layoutCheck.test.ts`; per-clause output in
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

As `eval/BRIEFS-LAYOUT.md` describes, with two recorded differences:

- **How the briefs reached the authors.** The plan's author prompt pointed
  authors at the briefs table in `eval/BRIEFS-LAYOUT.md`. That file also holds
  the checker's predicates and tolerances, so the authors were instead given
  the nine briefs' text directly (without the "Primitive it exercises" column)
  and were barred from reading anything under `eval/`. This gives them strictly
  less information than the plan allowed.
- **Compile rounds.** None were needed: every round-1 text compiled, so each
  `<author>-<brief>.marey` is byte-identical to its `.round1.txt`.

Authors A–D, four isolated authors of one model family, each wrote all nine
briefs. Each read only the worked example, the editor's completions and
hovers, `docs/LANGUAGE.md` and `site/content/learn/`.

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
correct scene passes, and each wrong scene fails its named clause. The corpus
result was also cross-checked by mutation: changing `B-mixed-row`'s
`let gap = 16` to `18` in a scratch copy fails its `gaps` clause and nothing
else. No corpus scene uses `scale`, so the checker's identification of
shapes by declared size (§5) could not have hidden a failure here.

## 3. How the authors wrote it

All 36 scenes use `generate`. The two strategies seen:

- **Arithmetic in the loop** for equal pitches: centring offsets such as
  `400 + (col - (cols - 1) / 2) * (w + gap)` (grids, L1, L6) and
  `400 + ring * cos(i * 30 - 90)` (rings, L8, L9).
- **Hand-computed literal lists** where sizes differ: left edges
  `[226, 282, 418, 514]` (L2), centres `[110, 242.5, 385, 537.5, 685]` (L3),
  tops `225, 285, 345` (L4). Every one of these was correct.

`origin` did real work, as LANGUAGE.md suggests: three of the four L2 scenes
use `origin: (0, 1)` to stand the bars on y = 400, and one L4 scene uses
`origin: (0, 0.5)` to put the left edges on x = 120. The others computed
centres from the edges by hand.

## 4. Descriptive numbers (not part of the decision)

**Layout-token share.** Tokens: identifiers, numbers, two-character operators
and single punctuation characters, with `//` comments removed. Layout tokens:
every token on a `let` line (including continuation lines of a multi-line
`let`), a `generate` header line or a `position:` line. Share = layout tokens
over all tokens.

| Brief | A | B | C | D |
|---|---|---|---|---|
| L1 `toolbar-row` | 63% | 67% | 64% | 38% |
| L2 `mixed-row` | 53% | 74% | 53% | 60% |
| L3 `spread-dots` | 63% | 86% | 63% | 63% |
| L4 `left-stack` | 43% | 69% | 50% | 52% |
| L5 `badge-row` | 8% | 30% | 16% | 25% |
| L6 `card-grid` | 66% | 65% | 71% | 48% |
| L7 `stack-columns` | 55% | 47% | 72% | 32% |
| L8 `ring-12` | 61% | 65% | 65% | 61% |
| L9 `clock-ticks` | 48% | 54% | 51% | 48% |

Median 60%, range 8–86%. Layout is most of what these scenes say, which is
what the briefs ask for. The share does not show the arithmetic going wrong.

**Recorded uncertainty**, 54 lines across the four reports, grouped by what
they were about:

- **No running sum (L2, L3, L4).** All four authors said so in their own
  words: "no sum over a list, so the left edges … are hand-computed
  literals; unsure they are right if widths change" (A); "no way to loop a
  running sum, so each left edge is written out by hand; the arithmetic is
  easy to get wrong" (B); "unsure there is any way to derive them in-language
  without a prefix sum" (C); "there are no running sums, so I hand-computed
  the lefts list" (D). 7 of the 54 lines.
- **What `origin` does at an edge (L2, L4).** Whether `origin: (0, 1)` puts
  the bottom edge exactly on `position`. Assumed from LANGUAGE.md, and right.
- **Brief readings.** Whether L7's "80 px apart" is edge-to-edge (all four
  read it so); whether L9's radius 220 is the tick's centre (all four:
  centre); whether L8's ring is traced by centres (yes).
- **Angle conventions (L8, L9).** Whether increasing angle is clockwise with
  y down, whether `cos(-90)` is exact, and the quarter-turn offset for a
  vertical tick. All four got these right.
- **Language questions unrelated to layout.** Empty parameter lists in
  `template Badge()`, `if` inside a point component, fractional coordinates,
  names from nested `generate`.

## 5. What this does not show

- **Small samples.** Four scenes per brief, 8 to 16 per primitive. A failure
  rate under about one in eight could go unseen for `row`/`column`, and under
  about one in four for `distribute`.
- **One model family, all capable at arithmetic.** These authors summed
  widths by hand without a mistake. Human authors, or authors working
  without a calculator's patience, were not measured, and may well fail where
  these did not.
- **Fully specified briefs.** Every brief gave every number. A brief like "a
  tidy toolbar of six icons" leaves the author to choose sizes and spacing,
  and was not measured; nor was editing an existing layout (changing one
  width in L2 means recomputing three literals, which the authors themselves
  flagged).
- **The briefs and the checker were written by the people who would build the
  feature.** That would bias toward finding a need; the result went the other
  way.
- **Checker readings.** L9 checks no start angle or direction (its brief
  states none); L8's "first" is the first circle in object order; shapes are
  picked and gaps measured by declared, unscaled size, so a scene that
  scaled its shapes would false-fail a `brief` count clause (none did).

## 6. What follows

R11's condition is not met for any of the five primitives, and the language
does not change. The one recurring friction is narrower than any of them:
there is no running sum over a list, so a row of mixed widths is written as
hand-computed literals that are right once and fragile under edits. A
list-prefix-sum expression operator is the smallest change that would remove
that, and it is **filed, not built**: this measurement shows the friction, not
an error rate, and R11 asks for the latter.
