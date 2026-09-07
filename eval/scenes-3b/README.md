# Phase 3B demonstration corpus

Three scenes rewritten with Phase 3B's expression layer, to be compared
against their hand-unrolled baselines in `eval/scenes/` (R1) and
`eval/scenes-r2/` (R2).

**This is not an authorability round.** R1 and R2 measured what authors with
no access to the compiler wrote blind. These three were written by the
implementer of the feature they exercise, so they measure whether the
capability removes the hand-unrolling — not whether an unfamiliar author
would find it. The blind round that `eval/RESULTS.md`'s "Re-running after
phase 3" section describes is a separate exercise and has not been run.

Run: `EVAL_DIR=eval/scenes-3b npx vitest run --config eval/vitest.config.ts`
