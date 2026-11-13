---
title: Physics pile
summary: Twenty-six shapes drop in three waves, collide and settle into one heap in a bin, and the heap freezes as the scene ends.
tags:
- physics
- generative
source: src/examples/physics-pile.marey
---

Balls, crates, wedges and planks all share one simulated world, so they land
on each other, not only on the floor. The scene's work is in deciding when
each shape joins that world and where it waits until then.

### Walls that freeze in place

The bin's two walls have `physics { gravity: (0, 0), duration: 0.05 }`. When a
numeric physics duration runs out, the body freezes where it is and stays
solid, so later shapes land on it as they would on any fixed body. With no
gravity a wall does not move in its 0.05 seconds, so it freezes exactly where
it was placed. The walls lean out with `rotation: s * 6`, mirrored by
`generate s in [-1, 1]`, so the bin widens upwards. The lesson on the physics
world shows the direct way to write a wall that never moves, a position lock,
which Ledges uses. The lesson on physics covers freezing.

### One numbering for four kinds of shape

The four `generate` blocks make 8 balls, 8 crates, 7 wedges and 3 planks. Each
block shifts its own counter into one shared numbering, `let n = i + 8` for
the crates, so the 26 shapes are numbered 0 to 25. From that number,
`let w = n % 3` picks the wave, `let j = (n - w) / 3` counts how many shapes
came before in that wave, and `let c = j % 3` picks the column, at
`280 + c * 120`. Consecutive shapes go to different waves, so each wave gets a
mix of kinds. The lesson on values covers `let` and the arithmetic, and the
lesson on generate covers the blocks.

### Appear, fall, stop together

Each shape starts at `alpha: 0` and runs a `sequence` of two steps. First,
`animate { property: alpha, to: 1, duration: 0.01, delay: waveAt[w] }` makes it
appear when its wave is released, at 0, 1.4 or 2.8 seconds. Then its
`physics` step runs for `duration: end - waveAt[w]`. Every shape's simulation
therefore ends at the same time, `let end = 7` seconds plus the short fade-in
step, in step with the scene's `duration: 7`. The lessons on sequences and on
timing cover this.

### Invisible but solid

A shape's collision body exists from the start of the scene, even when its
physics step comes later in its sequence. Until then the body is held in place
and other shapes collide with it. So a shape waiting for its wave is invisible
but solid. That is why the first wave starts lowest and the last highest,
`let bandY = [370, 230, 90]`: each waiting wave sits above the ones falling
below it and never in their path. The lesson on physics covers when a body
is created.

### Variety from the index

Small changes keep the heap from looking stamped out. The colours rotate
through four with an offset per kind, as in `colors[(i + 1) % 4]`. Crates come
in three sizes, `34 + (i % 3) * 10`, and planks at different angles,
`(i * 37) % 60 - 30`. The bounce differs by kind, from `bounce: 0.3` for the
balls down to 0.2 for crates and planks. The lesson on values covers this.
