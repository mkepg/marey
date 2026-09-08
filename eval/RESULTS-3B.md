# Phase 3B demonstration corpus — measurements

**Date:** 2026-09-07, Phase 3B Task 14.
**What this measures:** whether Phase 3B's expression layer removes the
hand-unrolling that `eval/RESULTS.md`'s finding 1 identified — *"the
metaprogramming layer cannot express the cases that justify it."*
**What this does not measure:** authorability. See `scenes-3b/README.md`;
these three scenes were written by the implementer of the feature they
exercise, so they are a capability demonstration, not a blind round.

The "before" is two corpora, not one, and **they are not the same scene twice**.
`eval/scenes/` (R1) and `eval/scenes-r2/` (R2) were written by different
blind authors and differ in variable names, in concrete parameters (R1's
`radial-dots` uses radius 180 and dot radius 9, R2's uses 200 and 10; R1's
`bar-chart` uses `scale = 30`, R2's `unit = 40`), and in formatting
conventions. What they share is the data and the cardinality: seven bar values
3, 7, 2, 9, 5, 8, 4; twelve evenly spaced dots; eleven ticks with every fifth
taller. There is therefore **one** rewrite per scene, following R1's concrete
parameters — the ones design §7's worked examples were modelled on — and every
measure below is reported twice, once against each baseline.

Both baselines are unchanged and stay unchanged. Design §10.1 forbids
rewriting them: the repetition is the measurement.

Reproduce the corpus itself with:

```bash
EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts
```

**3 / 3 compiled clean**, written to `eval/report-3b.json`.

---

## The scenes render the same picture

Not a claim — the emitted object counts, read from the three committed
reports:

```bash
node -e "for (const [n,f] of [['R1','./eval/report.json'],['R2','./eval/report-r2.json'],['3B','./eval/report-3b.json']]) { const r = require(f).filter(x=>['bar-chart.marey','radial-dots.marey','timeline-ticks.marey'].includes(x.file)); console.log(n, r.map(x=>x.file.replace('.marey','')+'='+x.nodeCount).join('  ')); }"
```

| Scene | R1 objects | R2 objects | 3B objects |
|---|---|---|---|
| `bar-chart` | 9 | 8 | **9** |
| `radial-dots` | 13 | 12 | **13** |
| `timeline-ticks` | 16 | 15 | **13** |

`bar-chart` and `radial-dots` emit exactly R1's object count. The IR
coordinates match R1's hand-computed tables item for item — bars centred at
x = 100, 200 … 700 with width 70 and height `value × 30` on a baseline of 500;
dots at (580, 300), (555.88…, 390), (490, 455.88…) … against R1's rounded
(580, 300), (556, 390), (490, 456) …; ticks at x = 100, 160 … 700.

`timeline-ticks` emits **three fewer** objects than R1 on purpose: R1 draws
eleven short ticks and then draws three tall ones *over the top* of ticks 0, 5
and 10, using `layer: 1` to win the overdraw. The rewrite makes those three
ticks tall in the first place, so the three redundant overdraw objects do not
exist. The rendered picture is the same; the object graph is honest about it.

R2's counts are one lower throughout because R2's fixtures have no `text
title` object (R2's `bar-chart` and `timeline-ticks`) or no centre marker
(R2's `radial-dots`).

---

## Measure 1 — source lines

```bash
wc -l eval/scenes/<scene>.marey eval/scenes-r2/<scene>.marey eval/scenes-3b/<scene>.marey
```

and, controlling for the corpora's very different commenting habits,

```bash
grep -cvE '^[[:space:]]*(//.*)?$' <file>          # non-blank, non-comment lines
```

| Scene | R1 | R2 | **3B** | vs R1 | vs R2 |
|---|---|---|---|---|---|
| `bar-chart` | 76 | 45 | **42** | −34 (−45%) | −3 (−7%) |
| `radial-dots` | 40 | 26 | **28** | −12 (−30%) | +2 (+8%) |
| `timeline-ticks` | 56 | 47 | **47** | −9 (−16%) | ±0 (0%) |

Non-blank, non-comment lines only:

| Scene | R1 | R2 | **3B** | vs R1 | vs R2 |
|---|---|---|---|---|---|
| `bar-chart` | 65 | 19 | **32** | −33 (−51%) | +13 (+68%) |
| `radial-dots` | 25 | 16 | **19** | −6 (−24%) | +3 (+19%) |
| `timeline-ticks` | 45 | 31 | **37** | −8 (−18%) | +6 (+19%) |

**Read this measure with care; it is the weakest of the four, and it is
unflattering against R2 in a way worth stating rather than burying.**

Against R1 the reduction is real and material in all three scenes. Against R2
it is small, flat, or negative, for reasons that have nothing to do with
expressiveness:

- **R2's fixtures are barer.** R2's `bar-chart` and `timeline-ticks` have no
  title; R2's `radial-dots` has no centre marker, no `let` bindings at all, and
  no `fit`. The rewrites keep that polish (design §12.4 asks for good scenes,
  not minimal ones), and a `text title` block costs six lines on its own.
- **R2 packs one object per line.** Twelve dots is twelve lines in R2, and
  seven bars is seven lines. A loop body written for readability is seven or
  eight lines regardless of how many objects it emits, so the crossover point
  against one-line-per-object formatting is high.
- **R2's comments are enormous.** R2's `bar-chart` is 45 lines of which 15 are
  a comment explaining why it could not be written with a loop. That comment is
  the finding this phase closes, and deleting it flatters the line count for a
  reason that is not a language improvement — so it is left in the baseline and
  not credited here.

The line count is a proxy for the thing that actually matters, and the proxy
breaks down when the two files are formatted differently and carry different
amounts of chrome. Measures 3 and 4 do not have that problem: they count the
repetition itself, and the cost of changing it.

---

## Measure 2 — literal coordinate pairs

A coordinate pair written as two bare numbers — the thing an author produces
when the language cannot compute a position.

```bash
grep -oE '\(-?[0-9]+(\.[0-9]+)?,[[:space:]]*-?[0-9]+(\.[0-9]+)?\)' <file> | wc -l
```

| Scene | R1 | R2 | **3B** |
|---|---|---|---|
| `bar-chart` | 4 | 3 | **4** |
| `radial-dots` | 14 | 14 | **2** |
| `timeline-ticks` | 4 | 3 | **2** |

`radial-dots` is where this measure was aimed, and it moves exactly as design
§7.2 predicted: **14 → 2, and neither survivor is a dot.** The two are the
canvas size `(800, 600)` and the centre marker at `(400, 300)`; all twelve dot
positions are now computed. Design §12.2's criterion — "**zero** hand-computed
coordinate literals" — is met on the reading that matters: no coordinate in the
file was computed by the author rather than by the compiler. The centre of a
circle and the size of a canvas are not hand-computed layout; they are the
inputs the trigonometry is computed *from*.

For `bar-chart` this measure does not move, and it was never going to. That
baseline's hand-unrolling was never in its coordinates — R1 already wrote
`position: (100, baseline - (v0 * scale) / 2)`. It was in seven `let v0 … v6`
bindings and seven `rectangle` blocks, which is measure 3. All four pairs in
the rewrite are chrome — the canvas size, the title position, and the two ends
of the baseline rule — identical to R1's four.

---

## Measure 3 — hand-unrolled objects

```bash
grep -c "rectangle bar" eval/scenes/bar-chart.marey eval/scenes-r2/bar-chart.marey eval/scenes-3b/bar-chart.marey
grep -cE '^let v[0-9]+ =' eval/scenes/bar-chart.marey
grep -c "circle dot" eval/scenes/radial-dots.marey eval/scenes-r2/radial-dots.marey eval/scenes-3b/radial-dots.marey
grep -cE '^[[:space:]]*generate ' eval/scenes/timeline-ticks.marey eval/scenes-r2/timeline-ticks.marey eval/scenes-3b/timeline-ticks.marey
grep -cE '^[[:space:]]*line ' eval/scenes/timeline-ticks.marey eval/scenes-r2/timeline-ticks.marey eval/scenes-3b/timeline-ticks.marey
```

| Scene | What is counted | R1 | R2 | **3B** |
|---|---|---|---|---|
| `bar-chart` | `rectangle bar…` declarations | 7 | 7 | **1** |
| `bar-chart` | per-value `let v0 … v6` bindings | 7 | 0 † | **0** |
| `radial-dots` | `circle dot…` declarations | 12 | 12 | **1** |
| `timeline-ticks` | `generate` blocks | 2 | 2 | **1** |
| `timeline-ticks` | `line …` declarations | 3 | 3 | **2** |

† R2's `bar-chart` inlines each value into its bar (`3 * unit`, twice per bar)
rather than binding it, so it has no `let vN` lines. It repeats the same seven
numbers fourteen times instead of seven.

The single remaining `rectangle bar` and `circle dot` in the 3B column are the
**loop bodies**, not unrolled siblings: one declaration each, emitting seven and
twelve objects. Hand-unrolled sibling count is **0** in both.

`timeline-ticks`'s third `line` declaration in the baselines is the second
loop's `majorTick` / `tickMajor`, which the conditional makes unnecessary. The
remaining two in the 3B column are the axis and the one tick.

This is design §12's exit criteria 1–3, and all three are met:

1. `bar-chart` — one literal data list, one loop, **zero** hand-unrolled
   `rectangle` blocks.
2. `radial-dots` — one loop, and no coordinate the author computed.
3. `timeline-ticks` — one loop, not two.

---

## Measure 4 — the cost of one representative change

The change is the same in every column: **add an eighth bar; take 12 dots to
24; take 11 ticks to 21.** This is the measure that carries the argument.

For the new corpus, the file was staged, edited, measured, and reverted:

```bash
git add eval/scenes-3b
#  edit the one line
git diff --numstat -- eval/scenes-3b/<scene>.marey
git checkout -- eval/scenes-3b/<scene>.marey
```

The baselines were **not touched**. Their committed blobs were extracted to a
temporary directory outside the repository, edited there, and diffed with
`--no-index`:

```bash
git show HEAD:eval/scenes/<scene>.marey > $TMP/before/<scene>.marey
#  apply the equivalent change to a copy in $TMP/after/
git diff --no-index --numstat $TMP/before/<scene>.marey $TMP/after/<scene>.marey
```

| Scene | Change | R1 | R2 | **3B** |
|---|---|---|---|---|
| `bar-chart` | 7 bars → 8 | +6 / −0 | +2 / −0 | **+1 / −1** |
| `radial-dots` | 12 dots → 24 | +23 / −11 | +23 / −11 | **+1 / −1** |
| `timeline-ticks` | 11 ticks → 21 | +3 / −3 | +3 / −3 | **+1 / −1** |

Every "+1 / −1" is a single token on a single line:

- `bar-chart`: `[3, 7, 2, 9, 5, 8, 4]` → `[3, 7, 2, 9, 5, 8, 4, 6]`
- `radial-dots`: `let count = 12` → `let count = 24`
- `timeline-ticks`: `let count   = 11` → `let count   = 21`

Every edited version was compiled, not just diffed. Object counts after the
change: `bar-chart` 9 → 10, `radial-dots` 13 → 25, `timeline-ticks` 13 → 23.
The baseline "after" files were compiled too (3 / 3 clean in each temporary
corpus), so the numbers above are the cost of a change that actually works, not
of a broken edit.

**What the line counts do not show, and why this measure is the honest one:**

- **`bar-chart`** — the baseline's `+6 / −0` is the *minimum*: it appends a
  bar and leaves the other seven where they are, so the eighth lands at
  x = 800, half off an 800-wide canvas. Making the row actually re-space costs
  editing all eight x-coordinates on top. The rewrite re-spaces for free —
  `step` is `800 / (length(values) + 1)` — and the eight bars land at
  88.9, 177.8 … 711.1.
- **`radial-dots`** — the baseline's `+23 / −11` understates the work by a
  wide margin, because the diff cannot show that **all 24 coordinates had to be
  computed by hand** with trigonometry the language did not have. That is the
  labour R1's author described in an eight-line comment before giving up on the
  loop. The rewrite's cost is one digit.
- **`timeline-ticks`** — the closest of the three on raw diff size, and the
  most interesting. The baseline's three lines are `spacing` 60 → 30,
  `0 to 10` → `0 to 20`, and `0 to 2` → `0 to 4` — three edits in **two
  different loops** that must be kept mutually consistent by hand, and the
  third of which (`0 to 4`) is the author computing `21 / 5` in their head. The
  rewrite's one edit is `count`, and `spacing`, the range, and which ticks are
  major all follow from it. Diff size is nearly equal; the number of
  invariants the author has to maintain is 3 versus 0.

---

## Verdict against roadmap §8.3 and design §12

| Criterion | Result |
|---|---|
| §12.1 `bar-chart`: one list, one loop, zero unrolled rectangles | **Met** — 7 → 0 unrolled, 1 list, 1 loop |
| §12.2 `radial-dots`: one loop, zero hand-computed coordinates | **Met** — 12 dot coordinate pairs → 0 |
| §12.3 `timeline-ticks`: one loop, not two | **Met** — 2 `generate` blocks → 1, `layer` no longer needed |
| §12.4 materially shorter, with the change cost recorded | **Met against R1** (−45%, −30%, −16%). **Not met against R2** on raw lines (−7%, +8%, 0%) — see measure 1 for why, and measure 4 for the reduction that does hold everywhere |

Roadmap §8.3's instruction was: *if the three scenes are not convincingly
improved, stop and reassess the DSL before adding another major subsystem.*
They are convincingly improved. The clearest single number in this document is
that a change which costs a baseline author **+23 / −11 lines and twenty-four
hand-computed sines and cosines** costs the rewrite **one character**.

The one honest reservation is that raw source lines barely move against R2,
and go up for `radial-dots`. The rewrites carry titles, colour bindings and
`fit` that R2's fixtures do not, and R2 writes one object per line. Phase 3B's
claim was never that scenes get shorter; it is `eval/RESULTS.md`'s finding 1 —
that a chart of seven values *"must still be written as seven separate
rectangle blocks"* and that this *"makes the data-driven use case largely
unreachable."* Measures 3 and 4 are the direct answer to that, and both are
unambiguous.

---

## What is deliberately not here

- **No blind authorability round.** R3 has not been run. See
  `scenes-3b/README.md`.
- **No rendered capture.** These three were verified structurally, at the IR
  level. `sin`/`cos` correctness has its own IR-level assertion and Chromium
  capture under design §12.9; this document does not re-derive it.
- **No baseline was edited.** `eval/scenes/` and `eval/scenes-r2/` carry only
  Task 10's mechanical `generate ... from` → `generate ... in` rename, recorded
  in the dated notes at the top of `eval/RESULTS.md` and `eval/RESULTS-R2.md`.
