# Phase 10B: layout, measured first

**Date:** 2026-11-27
**Status:** design. Stage 1 (§2) runs before any of Stage 2 (§3) is built.

> **Outcome, 2026-11-27:** Stage 1 ran. All 36 scenes passed every clause, so
> §2.4 builds nothing and Stage 2 is not built. §3 stays as the design that
> was pre-registered. Evidence: `eval/RESULTS-PHASE-10B-MEASUREMENT.md`.

**Roadmap:** `2026-09-09-marey-engineering-roadmap-design.md` §13, amended
2026-11-27 (Phase 10). R10 (measure semantic compression) and R11 (investigate
high-level layout primitives only after authorability evidence supports them)
both bind this phase.

---

## 0. Decisions already taken

- The owner started the rest of §13 as Phase 10 on 2026-11-27 and delegated
  every decision in it. 10B is the second sub-phase.
- R11 is not waived. This phase first measures whether authors need layout
  primitives, then builds only the ones the measurement justifies. A result
  that justifies none is a valid outcome: 10B then ends with the measurement,
  a roadmap note, and no language change.
- The decision rule (§2.4) and the whole design (§3) are written down **before**
  the measurement runs, so the result cannot shape what counts as a pass or
  what gets built.

## 1. Intent

Placing things in rows, grids and rings is most of what a motion-graphics
scene's source does. Of 349 `position:` lines in the 111 tracked scenes, 219
are literal pairs, 36 scenes compute an evenly spaced row by hand, 26 nest
`generate` loops into grids, and 5 place dots on a circle with `cos`/`sin`.
That is frequency, not need: `generate` with `x0 + i * step` is already short.
What a primitive can remove is the arithmetic an author gets *wrong* — the
centring offset, the running sum over mixed widths, the start angle and
direction — and that has to be measured, not assumed.

Marey resolves layout at compile time into plain positions. Every backend
(the preview, the PNG/APNG/video encoders, Lottie, the embeddable player and
10D's non-browser player) then gets layout for nothing, and frame hashes of
existing scenes cannot move. This is the competitive point: Rive has a runtime
layout engine; Lottie and GSAP have none; Marey's would cost no runtime at all.

### 1.1 Approaches considered

- **List-valued expression operators** (`row(6, 80)` returning a list of
  points, consumed by `generate`). Smallest change: no new block, no extents.
  It removes the centring offset for equal pitches but not the running sum
  over mixed sizes, which is the arithmetic most likely to go wrong (L2, L3,
  L4), and a caller still has to pass every width by hand.
- **A compile-time `layout` block on `group`** (chosen). It reads each
  child's declared extent, so mixed sizes, alignment and distribution need no
  arithmetic, and it still compiles to plain positions.
- **A runtime layout engine** (Rive's model). Re-flows under animation, but
  every backend, including 10D's player and the Lottie exporter, would need
  it, and it is the first thing in Marey that would make a frame depend on
  more than the IR and the tick. Rejected.

## 2. Stage 1 — the authorability measurement

### 2.1 Protocol

The protocol of `eval/BRIEFS.md`, with these changes:

- **Readable surface.** The four files `BRIEFS.md` lists (the worked example,
  the editor completions, the editor hovers, `docs/LANGUAGE.md`), **plus
  `site/content/learn/`**, which has been the user-facing tutorial since Phase
  9C. Authors may not read the compiler, the specs, the plans, `AGENTS.md` or
  `docs/architecture/`.
- **Authors.** Four fresh authors, one model family (the mid tier of the
  family used for the earlier rounds), each run in isolation with no access
  to the others' work. **Every author writes all nine briefs**, so each brief
  has four independent scenes: 36 in all.
- **Round 1 is blind**: authors write every scene before anything compiles.
  Rounds 2–4 feed back the real compiler errors until the scene compiles. A
  scene that does not compile after round 4 is recorded as a compile failure;
  it counts toward no primitive (§2.4).
- **Geometry is judged on the first compiling version**, not after any
  geometric feedback. Authors never see the geometry checker's output.
- **Authors report uncertainty** in their report, one line per place they
  were unsure, so the record can show where layout arithmetic was a guess.

### 2.2 Briefs

Scene size 800×600 unless stated. Every shape is a `rectangle` or a `circle`
so its extent is unambiguous. "Centred in the scene" means the bounding box
of the arranged items is centred on (400, 300). "Gap" means the distance
between neighbouring *edges*.

| # | File | Brief | Primitive it exercises |
|---|---|---|---|
| L1 | `toolbar-row` | Six 60×60 squares in a horizontal row, 20 px apart, the row centred in the scene. | row |
| L2 | `mixed-row` | Four rectangles 50 px tall with widths 40, 120, 80 and 60, left to right, 16 px apart, the row centred horizontally, all their bottom edges on y = 400. | row, align |
| L3 | `spread-dots` | Five circles with radii 10, 30, 20, 40 and 15, left to right, centres on y = 300, the leftmost circle's left edge at x = 100, the rightmost circle's right edge at x = 700, and equal gaps between neighbours. | distribute |
| L4 | `left-stack` | Three bars 30 px tall with widths 300, 180 and 240, top to bottom, 30 px apart, left edges on x = 120, the stack centred vertically. | column, align |
| L5 | `badge-row` | A reusable badge (a circle of radius 30 with a 20×20 square centred on it) placed five times in a horizontal row, 100 px between neighbouring badge centres, the row centred in the scene. | row |
| L6 | `card-grid` | Twelve 120×80 cards in 3 columns and 4 rows, 24 px apart in both directions, the grid centred in the scene. | grid |
| L7 | `stack-columns` | Three columns side by side, 80 px apart; each column is four 40×40 squares stacked 10 px apart; the whole block centred in the scene. | grid (or column inside row) |
| L8 | `ring-12` | Twelve circles of radius 10 evenly spaced on a circle of radius 200 centred in the scene, the first at the top (12 o'clock), going clockwise. | radial |
| L9 | `clock-ticks` | Sixty 4×16 tick rectangles on a circle of radius 220 centred in the scene, each rotated so its long side points at the centre, every fifth tick 4×32 instead. | radial |

Four authors × nine briefs: 36 scenes.

### 2.3 The geometry checker

`eval/layout/check.test.ts` compiles each scene, computes every shape's
world-space bounding box at rest (tick 0, before any animation) from the
compiled IR, and applies the brief's predicate. The IR keeps group nesting,
each node's resolved `position`, `rotation`, `scale` and `origin`, and `use`
expansions as wrapper groups, so the checker composes transforms down the
tree itself. **It shares no code with Stage 2's extent computation**, so a
bug in one cannot pass the other. Shapes are identified by type and size,
never by name. Tolerance: 0.5 px on every length, 0.5° on every angle.

Each predicate is a list of named clauses, and every clause is tagged
either with the primitive whose arithmetic it tests or as `brief` (the
author misread what to draw: wrong count, wrong sizes, wrong order). The
tags are part of this pre-registration:

| Clause kind | Tag |
|---|---|
| shape count, sizes, order | `brief` |
| equal edge gaps, centring of the union box (L1, L2, L4, L5) | `row` |
| bottom edges on one line (L2), left edges on one line (L4) | `align` |
| end edges at 100 and 700, equal gaps (L3) | `distribute` |
| lattice, gaps, centring (L6, L7) | `grid` |
| distance from centre, start angle, step and direction (L8, L9) | `radial` |
| tick long axis through the centre (L9) | `radial` (`orient`) |

Predicates, per brief:

- **L1:** six 60×60 squares; centres share one y; edge gaps all 20; union
  box centred on (400, 300).
- **L2:** the four widths appear left to right in the stated order; edge
  gaps all 16; every bottom edge at 400; union box's x-centre 400.
- **L3:** five circles in radius order 10, 30, 20, 40, 15; centres at
  y 300; leftmost edge 100; rightmost edge 700; the four gaps equal.
- **L4:** widths 300, 180, 240 top to bottom; left edges at 120; edge gaps
  30; union box's y-centre 300.
- **L5:** five badges, each one circle r30 with a 20×20 square sharing its
  centre; neighbouring centres 100 apart on one y; union box centred.
- **L6:** twelve 120×80 cards on a 3×4 lattice; edge gaps 24 both ways;
  union box centred.
- **L7:** twelve 40×40 squares in three columns of four; in-column edge gaps
  10; between-column edge gaps 80; union box centred.
- **L8:** twelve r10 circles, centres at distance 200 from (400, 300); one
  centre at (400, 100); consecutive centres 30° apart, clockwise on screen
  (y down).
- **L9:** sixty ticks, centres at distance 220 from (400, 300) and 6° apart;
  every tick's long axis passes through (400, 300); exactly twelve are 4×32,
  every fifth around the ring.

The checker is validated before the round runs: for each brief, one
hand-written correct scene must pass, and one deliberately wrong scene per
predicate clause (shifted by 2 px, a gap off by 2, a start angle 90° off, an
anticlockwise ring) must fail. These reference scenes live beside the checker
and are tracked, so the checker's discrimination is part of the record.

### 2.4 The decision rule

For each primitive P, let S(P) be the compiling scenes whose brief lists P
in §2.2 (L7 counts for grid; L2 and L4 count for align; L3 for distribute).
A scene **fails for P** when at least one clause tagged P fails. A scene
that fails only `brief` clauses fails for no primitive; it is reported.

- **P is built if at least a quarter of S(P), and at least two scenes, fail
  for P.** The two-scene floor keeps one stray mistake from adding a
  language feature.
- `row` and `column` are one primitive for this rule (S = L1, L2, L4, L5:
  16 scenes).
- `distribute` and `align` are options of `row`/`column` in the design (§3):
  each is built if its own rule passes, and `row`/`column` is then built
  with it.
- Each built primitive is its own gated part of Stage 2. The extent machinery
  (§3.2) is built only if `row`/`column` or `grid` is; `radial` places pivots
  and does not need it.
- If no P passes, nothing in §3 is built.

With four scenes per brief, these are small samples. The results file states
each primitive's count over its S, not a percentage alone.

Reported for every scene but **not** part of the rule: the share of the
scene's tokens spent on layout (every `let` feeding a position, plus every
`position` expression), and the author's recorded uncertainty. These answer
R10 descriptively; they do not decide.

### 2.5 What Stage 1 produces

`eval/BRIEFS-LAYOUT.md` (the protocol and briefs as run),
`eval/scenes-layout/` (the 36 scenes as authored, never edited afterwards:
each author's blind round-1 text as `<author>-<brief>.round1.txt`, and the
first compiling version as `<author>-<brief>.marey`; a scene that never
compiles has only its `.txt` files, so `marey check` over tracked `.marey`
files stays green), `eval/layout/` (the checker and its reference scenes),
and `eval/RESULTS-PHASE-10B-MEASUREMENT.md` with the
per-scene pass/fail, the failing clause, the decision for each primitive, and
the descriptive numbers.

## 3. Stage 2 — the design, built only where §2.4 says

### 3.1 The `layout` block

A `group` may hold one `layout { ... }` block. It positions the group's
direct children; it never moves the group itself.

```marey
group toolbar {
  position: (400, 300)
  layout { type: row, gap: 20 }
  rectangle a { size: (60, 60), color: cyan }
  rectangle b { size: (60, 60), color: cyan }
}
```

- `layout` becomes a reserved block keyword (no tracked scene uses it as a
  name). `type`'s values — `row`, `column`, `grid`, `radial` — are ordinary
  identifiers checked by the type checker, so `grid` stays a legal name (the
  LANGUAGE.md indexing example uses `let grid = ...`).
- Children of a layout group **must not** write `position`
  (`TYPE_LAYOUT_CHILD_POSITION`); the layout owns it. Shapes that normally
  require `position` do not require it inside a layout group.
- `generate` inside a layout group works unchanged: its expansion is a list
  of children in source order, and layout orders children by source order.
- A `use` instance inside a layout group is a child like any other: its
  extent is its wrapper group's (§3.2), and writing `position` in its `{ }`
  block is `TYPE_LAYOUT_CHILD_POSITION`. A `layout` block may appear in any
  `group`, including one inside a `template` body. It may not appear at a
  template body's top level or in a `use` instance's block
  (`TYPE_LAYOUT_NOT_GROUP`): wrap the children in a `group`.
- Layout properties are ordinary value expressions: `let` names, `generate`
  indices and `length(...)` all work, as in `position`. Layout runs after
  template expansion and `generate`, so the child count is known.
- Layout runs once, at compile time, on declared values. The result is an
  ordinary `position` on each child in the IR. **No IR change, no runtime
  change**, and no existing frame hash moves.
- An `animate` on a laid-out child's `position` animates from the computed
  position (its `to` is in the group's space as always); a `physics` child
  starts at its computed position. Neither feeds back into the layout.

### 3.2 Extents

Layout needs each child's extent: its axis-aligned bounding box in the
group's space, measured from the child's pivot.

- `rectangle`, `circle`, `polygon`, `line`: from declared geometry, `scale`,
  `rotation` and `origin`, exactly. A rotated child's box is the box of its
  rotated corners (or points), computed with `detMath`'s `sinDeg`/`cosDeg`, so
  the result is the same on every engine. A `line`'s box includes half its
  thickness on each side.
- `group` child: the union of its children's boxes, transformed by the
  group's own `scale` and `rotation`. This derives an *extent*, not a pivot:
  the rule that a group's pivot is its own local origin (LANGUAGE.md, "Scene
  model") is unchanged. Nested layout groups resolve innermost first.
- `text` child: a compile error, `TYPE_LAYOUT_TEXT`, until 10C gives text
  metrics. The message says so.
- The child is placed so that its **box** lands in its slot; its pivot goes
  wherever that puts it. A child with `origin: (0, 0)` and one with the
  default centre land in the same place.
- Only declared geometry counts. Marey shapes have no stroke or shadow; a
  child at `alpha: 0` still occupies its slot; an `animate` on `size`,
  `scale` or `rotation` and any `physics` are ignored. LANGUAGE.md states
  this.

### 3.3 `row` and `column`

Children are laid end to end along the main axis (`row`: x, left to right;
`column`: y, top to bottom), in source order.

- `gap: n` — edge-to-edge distance between neighbours. Default `0`.
- `span: n` — instead of `gap`: the total main-axis length, with the gap
  derived so the children fill it exactly (this is `distribute`). Writing both
  is `TYPE_LAYOUT_GAP_AND_SPAN`. A span shorter than the children's total
  extent is `TYPE_LAYOUT_SPAN_TOO_SHORT`, naming both lengths.
- `align: start | center | end` — cross-axis alignment within the tallest
  (row) or widest (column) child. `start` is top for a row and left for a
  column. Default `center`.
- The arranged block's bounding box is centred on the group's local origin on
  both axes. So the group's `position` places the centre of the block.

### 3.4 `grid`

- `columns: n` — a positive whole number. Children fill rows left to right,
  then top to bottom.
- `gap: n` or `gap: (x, y)`. Default `0`.
- Column widths are the widest child in each column; row heights the
  tallest in each row (CSS grid's `auto` tracks). `align` places a child in
  its cell on both axes. The whole grid is centred on the local origin.

### 3.5 `radial`

- `radius: n` — required, greater than 0.
- `start: degrees` — the first child's angle. Default `0`. Angles follow
  `rotation` and `sin`/`cos`: 0° points right and positive angles turn
  clockwise on screen, so `start: -90` is 12 o'clock.
- `sweep: degrees` — default `360`. Children are spaced `sweep / n` apart for
  a full circle and `sweep / (n - 1)` otherwise, so an arc's ends are both
  occupied.
- `orient: true` — each child's `rotation` becomes its own declared
  `rotation` plus its angle plus 90°, so a child drawn pointing up points
  outward. Default `false`, which leaves `rotation` as declared.
- No children: nothing to place. One child: it sits at `start`, for a full
  circle and an arc alike (no division by `n - 1`).
- Each child's **pivot** is placed on the circle (a ring is defined by
  centres, not boxes). Positions use `sinDeg`/`cosDeg`, so a radial layout
  hashes the same on every engine.

### 3.6 Diagnostics

All new codes, spelled exactly: `TYPE_LAYOUT_CHILD_POSITION`,
`TYPE_LAYOUT_TEXT`, `TYPE_LAYOUT_TYPE` (unknown `type`, naming the four),
`TYPE_LAYOUT_PROPERTY` (a property that does not belong to the written
`type`, naming the type's properties), `TYPE_LAYOUT_GAP_AND_SPAN`,
`TYPE_LAYOUT_SPAN_TOO_SHORT`, `TYPE_LAYOUT_COLUMNS` (not a positive whole
number), `TYPE_LAYOUT_DUPLICATE` (a second `layout` block in one group),
`TYPE_LAYOUT_NOT_GROUP` (a `layout` block anywhere but directly in a
`group`). Negative `gap` and non-positive `radius` use the contract's
existing range diagnostics. Each code is pinned by a test that fails when its
rule is deleted.

### 3.7 Documentation and surface

LANGUAGE.md gets a "Layout" section; the editor gets completions and hovers
from the contract; the site gets a `layout` lesson and one gallery scene; the
error guide gets every new code. Only the primitives Stage 1 justifies are
documented; the others are not mentioned as coming.

## 4. Non-goals

- Runtime or animated layout (re-flowing while children animate).
- Text in layouts before 10C.
- `origin` on a layout group (a layout group *has* a derived box, so this is
  now possible; it is filed, not built).
- Wrapping rows, weights, min/max sizes, or any constraint solving.
- Changing any existing scene. The measurement corpora are never edited.

## 5. Exit evidence (`eval/RESULTS-PHASE-10B.md`)

1. Stage 1's results file, referenced.
2. For each built primitive: the R3 scenes of its briefs rewritten with it,
   passing the same checker, with token counts before and after.
3. The closed frame-hash table unchanged for every existing scene, plus new
   entries for the layout fixtures, measured Node against Chromium.
4. Every new diagnostic's revert check (red with the rule deleted).
5. The four AGENTS.md checks, `check:export`, `check:pack` and the site check.
6. What this does not show.

## 6. Left to the builder

The checker's internal structure; how extents are cached; the exact message
wording within the rules above; where in the builder layout runs, provided it
runs after expressions are evaluated and before the IR is emitted.
