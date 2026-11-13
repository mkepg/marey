---
title: Set Sail
summary: A travel poster of a sailboat crossing a bay at sunrise, with every shape placed by its pivot.
tags:
- lesson
- text
lesson: shapes
---

A flat-colour poster: a striped sky, the sun's rays fanned out behind it, and a
boat crossing the bay towards the sun. It is the showcase of
[the lesson on shapes](/learn/shapes/), and its only motion is the `animate`
from [the first lesson](/learn/first-scene/).

### The title on top

The title, its banner, the strap line and the border are written first,
because the poster reads from them, and drawn last, because each has
`layer: 1` and everything else stays on layer 0. The banner and the title share
`position: (214, 78)` and `rotation: -3`, so both tilt about the same point and
the title stays centred on its banner. A cream rectangle 12 pixels larger than
the navy one, under it, shows as its edge.
[The lesson on shapes](/learn/shapes/) covers `layer`, `rotation` and `text`.

### A striped sky

Eight rectangles grade from cream at the top to apricot at the horizon. Each
stops 2 pixels short of the next, so the `background: #f7ead4` shows through as
a fine line between them.

### Rays turned about the sun

One thin wedge, `points: [(0, 0), (-26, -620), (26, -620)]`, is written seven
times. `origin: (0.5, 1)` puts its pivot at the bottom centre of its bounding
box, which is the tip at `(0, 0)`. Every ray has the sun's centre as its
position, so a `rotation` from -72 to 72 in steps of 24 fans the seven out
around the sun. White at `alpha: 0.16` lightens each stripe a ray crosses.
[The lesson on shapes](/learn/shapes/) covers `origin`, `rotation` and `alpha`.

### Halos that stack

Under the solid sun are two larger circles, `alpha: 0.14` and `alpha: 0.24`.
Next to the sun both tint the sky, so the glow is strongest there and fades in
two steps.

### Standing and hanging with origin

The mast is a `line` from `(0, 0)` up to `(0, -160)` with `origin: (0.5, 1)`,
so its position is its foot on the deck. The lighthouse's tower stands on the
headland the same way. The mainsail's corner at the mast is the bottom-left of
its box, `origin: (0, 1)`, and the jib's is the bottom-right, `origin: (1, 1)`.
The pennant hangs from the masthead by its top-left, `origin: (0, 0)`. Each
shape's numbers then read as offsets from the point that holds it.

### A boat in seven parts

The shadow, the hull, its stripe, the mast, two sails and the pennant each
carry the same move, 220 pixels to the right over the whole eight seconds; the
hull's is `to: (470, 432), duration: 8`. No `easing` is written, so the boat
eases in and out. The shadow is a dark copy of the hull at `alpha: 0.35`, on
the water under the boat. The lesson on groups moves a set of shapes like this
with a single `animate`.

### Gulls and waves are lines

A gull is a `line` through five points, two wings meeting at the body, tilted
with `rotation`. A wave mark is a line through three,
`points: [(-12, 0), (0, 4), (12, 0)]`, and the sun's reflection is five short,
level lines that thin and fade with distance from the horizon.
