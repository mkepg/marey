---
title: Physics pile
summary: Twenty-six shapes drop in three waves, collide and settle into one heap in a bin.
tags:
- physics
- generative
source: src/examples/physics-pile.marey
---
Balls, crates, wedges and planks all share one simulated world, so they land on
each other, not only on the floor. The scene's work is in deciding when each
shape joins that world and where it waits until then.

### Walls that freeze in place

The bin's two walls have `physics { gravity: (0, 0), duration: 0.05 }`. When a
numeric physics duration runs out, the body freezes where it is and stays solid,
so later shapes land on it as they would on any fixed body. With no gravity a
wall does not move in its 0.05 seconds, so it freezes exactly where it was
placed. The walls lean out with `rotation: s * 6`, mirrored by
`generate s in [-1, 1]`, so the bin widens upwards. The lesson on the physics
world shows the direct way to write a wall that never moves, `lockPosition`,
which Ledges uses. The lesson on physics covers freezing.

### One numbering for four kinds of shape

The four `generate` blocks make 8 balls, 8 crates, 7 wedges and 3 planks. Each
block shifts its own counter into one shared numbering, `let n = i + 8` for the
crates, so the 26 shapes are numbered 0 to 25. From that number, `let w = n % 3`
picks the wave, `let j = (n - w) / 3` counts how many shapes came before in that
wave, and `let c = j % 3` picks the column, at `280 + c * 120`. Consecutive
shapes go to different waves, so each wave gets a mix of kinds. [The lesson on
values](/learn/values/) covers `let` and the arithmetic, and [the lesson on generate](/learn/generate/) covers the
blocks.

### Appear, fall, stop together

Each shape starts at `alpha: 0` and runs a `sequence` of two steps. First,
`animate { property: alpha, to: 1, duration: 0.01, delay: waveAt[w] }` makes it
appear when its wave is released, at 0, 1.4 or 2.8 seconds. Then its `physics`
step runs for `duration: end - waveAt[w]`. A physics step inside a `sequence`
must have a numeric duration, because a simulation that never ended would stop
the sequence from ever moving on. The duration `end - waveAt[w]` gives every
shape a simulation that runs to the end of the scene: with `let end = 7`, each
ends at 7.01 seconds, the 7 plus the 0.01 second fade-in step. That is just
after the last frame, so no shape is seen to freeze; the heap you see at the end
is where the shapes lie at 7 seconds. [The lesson on sequences](/learn/sequence/) and
[the lesson on timing](/learn/timing/) cover this.

### Invisible but solid

A shape's collision body exists from the start of the scene, even when its
physics step comes later in its sequence. Until then the body is held in place
and other shapes collide with it. So a shape waiting for its wave is invisible
but solid. The first wave starts lowest and the last highest,
`let bandY = [370, 230, 90]`, so each wave falls away from the ones still
waiting above it.

The waves are packed tightly, though. Each wave is three rows 70 pixels apart,
from `(j - c) / 3 * 70`, and the waves start only 140 pixels apart, so the
bottom row of each later wave starts on the same points as the top row of the
wave below it. Five pairs of shapes share a start point; the first `circle ball`
and the fourth `polygon wedge`, for example, both start at (280, 370). When the
earlier of the two waves is released, its shape's body overlaps the waiting one,
which impacts cannot move, so it is pushed aside as its simulation starts, the
ball to about (297, 360), and then falls past. The lesson on physics covers when
a body is created.

### Variety from the index

Small changes keep the heap from looking stamped out. The colours rotate through
four with an offset per kind, as in `colors[(i + 1) % 4]`. Crates come in three
sizes, `34 + (i % 3) * 10`, and planks at different angles,
`(i * 37) % 60 - 30`. The bounce differs by kind, from `bounce: 0.3` for the
balls down to 0.2 for crates and planks. [The lesson on values](/learn/values/) covers this.
