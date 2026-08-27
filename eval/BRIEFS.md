# Machine-authorability baseline — briefs and protocol

Captured before phase 3 rewrites the grammar and the error messages, so that
phase 3's effect on machine authorability can be measured rather than assumed.

## The question

Can a model with **no training data on Declare** author scenes that compile,
given only what the product actually shows a user? And when it fails, do the
compiler's positioned errors let it converge?

## Protocol

Authors are fresh subagents with no access to this conversation.

**They may read only these, because these are the entire user-facing surface:**

- `src/store/defaultScene.ts` — the worked example every user sees on first load
- `src/components/Editor/MonacoEditor/language.ts` — IDE completions and snippets
- `src/components/Editor/MonacoEditor/constants.ts` — IDE hover documentation

**They may not read** the compiler (`lexer/`, `parser/`, `typeChecker/`), the
spec, the plans, or `AGENTS.md`. Those are internal. An external author would
not have them, and `AGENTS.md` in particular documents the known gotchas, which
would measure the internal docs rather than the language.

There is no README and no language reference — that absence is part of what is
being measured.

**Round 1 is blind.** Authors write all their scenes before anything is
compiled, so the first-pass number is not contaminated by feedback. Rounds 2+
feed the real compiler errors back and measure convergence.

Briefs are split across several authors, so a later brief may benefit slightly
from an earlier one in the same batch. That mirrors a real user learning as
they go, and is noted rather than controlled for.

## Metrics

| Metric | Meaning |
|---|---|
| First-pass compile rate | Round 1, no feedback. The headline number. |
| Rounds to converge | How many error-feedback cycles until clean. Tests the validator, which is the thing phase 3 invests in. |
| Failure modes | Which errors recur. This becomes phase 3's prioritised list. |

## Briefs

Scene size is 800x600 unless a brief says otherwise. Output file names are fixed
so results can be compared across runs.

### Simple / one-off

1. `fade-title` — The word "HELLO" centred on a dark background, fading from
   invisible to fully visible over 1.5 seconds.
2. `slide-card` — A red square that starts just off the left edge and slides to
   the centre of the scene over 1 second, decelerating as it arrives.
3. `pulse-dot` — A cyan circle in the centre that gently grows and shrinks
   forever, about two seconds per breath.
4. `spin-triangle` — A triangle that rotates one full turn every 3 seconds,
   forever.
5. `cross-fade` — Two rectangles side by side. The left one fades out while the
   right one fades in, both over 2 seconds.

### Systematic / many variants

6. `grid-16` — A 4x4 grid of small squares, evenly spaced across the scene, all
   the same colour.
7. `stagger-bars` — Ten vertical bars in a row. Each pulses taller and shorter
   on a loop, and each is slightly slower than the one to its left, so the row
   ripples instead of pulsing in unison.
8. `radial-dots` — Twelve dots arranged evenly around the circumference of a
   circle centred in the scene.
9. `repeated-badge` — Define a reusable "badge" made of a circle with a smaller
   square on top of it, then place five of them in a row at different positions.
10. `param-easing` — Four rows, each a dot travelling the same distance in the
    same time but with a different easing curve, so they can be compared. Use a
    single reusable definition parameterised by the easing.

### Data-driven

11. `bar-chart` — A bar chart of the seven values 3, 7, 2, 9, 5, 8, 4, drawn as
    vertical bars rising from a common baseline, each bar's height proportional
    to its value.
12. `timeline-ticks` — A horizontal axis line with eleven tick marks evenly
    spaced along it, and every fifth tick drawn longer than the others.
13. `arc-row` — Twenty small squares in a row whose vertical position varies
    smoothly across the row: highest in the middle, lower toward both ends.
14. `scale-ramp` — Nine circles in a row, each larger than the last, growing
    from small on the left to large on the right.

### Physics

15. `drop-ball` — A ball dropped from the top of the scene that falls under
    gravity, bounces off the floor a few times, and settles.
16. `collide-stack` — Four boxes dropped from different heights that land on
    each other and form a stack.
17. `throw-arc` — A ball that first slides up and to the right as an animation,
    then carries its momentum into the physics simulation so it continues in an
    arc and falls, rather than stopping dead.
18. `freeze-mid` — Several objects falling under gravity that stop dead in
    mid-air after one second and stay there.

### Sequence

19. `three-act` — A square that first rotates 180 degrees, then slides right
    while growing at the same time, then falls under gravity. Strictly in that
    order, one step at a time.
20. `fade-then-drop` — A circle that fades in over half a second, then falls
    under gravity and bounces off the floor.
