# Phase 3B demonstration corpus

Three scenes rewritten with Phase 3B's expression layer, to be compared
against their hand-unrolled baselines in `eval/scenes/` (R1) and
`eval/scenes-r2/` (R2): `bar-chart.marey`, `radial-dots.marey`,
`timeline-ticks.marey`. Each declares a `duration` (Phase 4, Task 8b) — all
three are static exports (no `animate`/`physics`/`sequence`), so the value
chosen is only long enough to be a whole number of frames at 24/30/60fps;
`timeline-ticks`'s comment explains why its `generate` is not a runtime loop
and there is no cycle count to pick.

**This is not an authorability round.** R1 and R2 measured what authors with
no access to the compiler wrote blind. These three were written by the
implementer of the feature they exercise, so they measure whether the
capability removes the hand-unrolling — not whether an unfamiliar author
would find it. The blind round that `eval/RESULTS.md`'s "Re-running after
phase 3" section describes is a separate exercise and has not been run.

`compound-logo.marey` (Phase 4, Task 8b) is a fourth scene, added later and
for a different purpose: it is the canonical export scene old roadmap §5.3
names — a multi-part `group` that animates in, hands off to physics under
`handoff: true`, and settles under simulation, with a finite `duration`. It
is not a Phase 3B expression-layer rewrite and has no R1/R2 baseline to
compare against; it exists so Gate B's export criteria have at least one
scene in the corpus that is not static by declaration. See
`eval/RESULTS-GATE-B.md` for what it demonstrates.

Run: `EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts`
