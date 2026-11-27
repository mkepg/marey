# Layout authorability measurement — briefs and protocol

Phase 10B asks whether layout primitives belong in the language. This file
fixes the briefs and the protocol before any scene is written, so the result
cannot be fitted to the measurement. It follows `BRIEFS.md`, with the changes
listed under "Protocol".

## Protocol

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
  it counts toward no primitive.
- **Geometry is judged on the first compiling version**, not after any
  geometric feedback. Authors never see the geometry checker's output.
- **Authors report uncertainty** in their report, one line per place they
  were unsure, so the record can show where layout arithmetic was a guess.

The geometry checker is `eval/layout/predicates.ts`; its correct and
deliberately wrong reference scenes are in `eval/layout/reference/`.

## Author prompt (as planned)

With `<AUTHOR>` set to A, B, C or D:

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

## Author prompt (as run, 2026-11-27)

The prompt above was not the one used: it points authors at this file, which
also holds the checker's predicates. The authors were given this text instead,
with `<REPO>` the repository path and `<AUTHOR>` set to A, B, C or D.
The convention paragraph ("Centred in the scene", "Gap")
was part of it.

> You are writing scenes in Marey, a small language for 2D motion graphics. You have no prior knowledge of it. The repository is at <REPO>. You may read only:
> - src/examples/dusk-hills.marey
> - src/components/Editor/MonacoEditor/language.ts
> - src/components/Editor/MonacoEditor/constants.ts
> - docs/LANGUAGE.md
> - the files under site/content/learn/
> Do not read anything else in the repository (in particular nothing under eval/, src/compiler/, docs/specs/, docs/plans/ or docs/architecture/), do not search the repository, and do not run any command.
>
> Write one scene per brief below, all nine, before checking anything. Scene size is 800×600. Every shape is a `rectangle` or a `circle`. "Centred in the scene" means the bounding box of the arranged items is centred on (400, 300). "Gap" or "apart" means the distance between neighbouring edges, unless the brief says centres.
>
> 1. toolbar-row — Six 60×60 squares in a horizontal row, 20 px apart, the row centred in the scene.
> 2. mixed-row — Four rectangles 50 px tall with widths 40, 120, 80 and 60, left to right, 16 px apart, the row centred horizontally, all their bottom edges on y = 400.
> 3. spread-dots — Five circles with radii 10, 30, 20, 40 and 15, left to right, centres on y = 300, the leftmost circle's left edge at x = 100, the rightmost circle's right edge at x = 700, and equal gaps between neighbours.
> 4. left-stack — Three bars 30 px tall with widths 300, 180 and 240, top to bottom, 30 px apart, left edges on x = 120, the stack centred vertically.
> 5. badge-row — A reusable badge (a circle of radius 30 with a 20×20 square centred on it) placed five times in a horizontal row, 100 px between neighbouring badge centres, the row centred in the scene.
> 6. card-grid — Twelve 120×80 cards in 3 columns and 4 rows, 24 px apart in both directions, the grid centred in the scene.
> 7. stack-columns — Three columns side by side, 80 px apart; each column is four 40×40 squares stacked 10 px apart; the whole block centred in the scene.
> 8. ring-12 — Twelve circles of radius 10 evenly spaced on a circle of radius 200 centred in the scene, the first at the top (12 o'clock), going clockwise.
> 9. clock-ticks — Sixty 4×16 tick rectangles on a circle of radius 220 centred in the scene, each rotated so its long side points at the centre, every fifth tick 4×32 instead.
>
> Save each scene as eval/scenes-layout/<AUTHOR>-<name>.round1.txt (for example <AUTHOR>-toolbar-row.round1.txt). Write them as you would want them to work; you will not be able to test them now.
>
> Then write a report: one line per place you were unsure how to express something or whether a number was right, naming the brief.

## Briefs

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

## The geometry checker

`eval/layoutCheck.test.ts` compiles each reference scene, computes every
shape's world-space bounding box at rest (tick 0, before any animation) from
the compiled IR, and applies the brief's predicate. The IR keeps group
nesting, each node's resolved `position`, `rotation`, `scale` and `origin`,
and `use` expansions as wrapper groups, so the checker composes transforms
down the tree itself. It shares no code with any compiler layout code, so a
bug in one cannot pass the other. Shapes are identified by type and size,
never by name. Tolerance: 0.5 px on every length, 0.5° on every angle.

Each predicate is a list of named clauses, and every clause is tagged either
with the primitive whose arithmetic it tests or as `brief` (the author
misread what to draw: wrong count, wrong sizes, wrong order). The tags are
part of this pre-registration:

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
