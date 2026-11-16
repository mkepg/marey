---
title: Plinko
summary: Sixteen discs drop one by one through a fairground board of locked pegs, past a swinging paddle, into scoring bins whose floor then opens to let them fall away.
tags:
- lesson
- physics
- generative
- text
- loop
poster: 5
lesson: world
---

A Plinko board in a fairground booth at night. Sixteen discs fall in from
behind the awning one after another, spinning as they go, ricochet down a
triangle of pegs and land in nine scoring bins. At 7.8 seconds the bins' floor
opens, the discs drop behind the counter and out through the bottom of the
frame, and the floor closes again. The scene lasts ten seconds and loops
without a seam. It is the showcase of
[the lesson on the physics world](/learn/world/).

### A world open at the top and the bottom

The `world` block sets what every physics block shares. Here it holds
`gravity: (0, 900)`, so no disc needs a gravity of its own, and
`bounds: [left, right]`, so only the side edges are walls. The open top lets the
discs wait above the frame and fall in. The open bottom lets them fall out when
the bins empty: by nine seconds every disc has dropped out of sight behind the
counter, and they go on falling out of the frame. A body that goes 800 pixels
past an open edge is removed from the simulation, so a world with open edges
still comes to rest. [The lesson on the physics
world](/learn/world/) covers `world` and `bounds`.

### Pegs from two loops

The pegs come from `generate r in 0 to 7` with `generate c in 0 to r` inside it.
The inner loop runs to the outer loop's `r`, so row r has r + 1 pegs: 36 in
eight rows. Each is placed at
`(480 + (c - r / 2) * gap, row0 + r * rise)`, which centres every row on the
drop line at x 480, 64 pixels apart and 34 pixels lower each row. Every peg is
`physics { lockPosition: true, bounce: 0.3 }`: a locked body never moves, and
besides the lock it may carry only `bounce`.
[The lesson on generate](/learn/generate/) covers nested loops.

### A cabinet of locked bodies

The neck the discs drop through, the two rails that run down the sides of the
field, the walls at either end of the bins and the eight dividers between the
bins are all locked rectangles. Together they make the board a funnel, and
they keep the discs well away from the scene's side edges.

### A paddle that moves although it is locked

The paddle is locked, `lockPosition: true, bounce: 0.5`, but it also carries
two looping animations, `to: (514, 104)` and `to: 18`, so it slides across the
neck and tilts as it goes, there and back every 2.5 seconds. A lock stops
physics from moving a body, not an animation, and the body follows the drawing.
So the paddle knocks each disc to one side or the other, depending on where it
is when the disc arrives.

### Discs released in turn

The discs wait in a column above the frame, disc 0 lowest. Each is a `group`
with a `sequence` of three steps. The first, `duration: 0.3 + k * hold`, holds
it where it is: 0.3 seconds for disc 0 and 0.2 seconds more for each disc after
it, so they drop one after another until 3.3 seconds. The body exists during
that hold, pinned in place. The second step is its simulation, with
`spin: [240, -240][k % 2]`, so alternate discs start turning clockwise and
anticlockwise, which the bar across each face shows. A `physics` step inside a
`sequence` needs a numeric `duration`; this one is `duration: 7.5 - k * hold`,
so for every disc the hold and the simulation add up to 7.8 seconds.
[The lesson on sequences](/learn/sequence/) covers steps, and
[the lesson on the physics world](/learn/world/) covers a `physics` step.

### A floor that opens

The bins' floor is ten locked slats, one under each divider and wall. Each has
`to: 90, duration: 1, delay: 7.8`, a yoyo that runs once: at 7.8 seconds it
turns a quarter about its centre and comes back, closed again at 9.8.
[The lesson on timing](/learn/timing/) covers `delay` and a `yoyo` without a
`loop`. Upright, a slat stands in line with the divider above it, so the full
width of every bin opens. As the slats begin to turn, every disc's first
simulation ends, which freezes it where it lies, and its third step,
`physics { bounce: 0.3, duration: 2 }`, starts at once. So all sixteen discs
go back into the simulation together as the floor drops away. The two outer slats reach past the walls; the counter at the
foot of the booth hides their ends.

### Lights on a period that divides ten

The bulbs on the awning, the signs and the counter blink in two alternating
sets, one starting bright and one dim, on a period of one second. The stars twinkle on
periods of 2 and 5 seconds, and the paddle's is 2.5. Each divides ten and none
is delayed, so every light is back where it started when the scene ends.
[The lesson on timing](/learn/timing/) covers seamless loops.
