---
title: Toy Box
summary: Wooden letter blocks spelling MAREY tumble into a toy box with balls, bricks, dice, two wedges and a toy car, and settle into a heap on a floor frozen in place.
tags:
- lesson
- physics
- text
poster: 5
lesson: physics
---

A toy box seen from the front, its board lifted. Five letter blocks, M, A, R, E
and Y, fall in with rubber balls, beach balls, bricks, dice, two wedges, an
L-piece and a car, land on one another and come to rest in a heap by about four
and a half seconds. Every toy is a physics object, and nothing in the scene is
placed in the heap by hand. It is the showcase of
[the lesson on physics](/learn/physics/).

### The box is the scene

Every edge of the scene is a wall that a physics object collides with, because
`collideBounds` is on unless a block turns it off, so the scene's sides are the
box's sides. The floor the heap rests on is a physics body too: `rectangle floor`
has `physics { gravity: (0, 0), bounce: 0, duration: 0.05 }`. Nothing pulls it,
so it stays where it is placed, and after 0.05 seconds it freezes there, solid
scenery that every toy lands on, 18 pixels in front of the back wall. Its
`bounce: 0` leaves each landing to the toy's own bounce. The planks, the painted
alphabet and the light are drawing only: they have no `physics`, so the toys
fall past them. [The lesson on physics](/learn/physics/) covers the walls and
freezing.

### One body per toy

Every toy's `physics` block is on a group, and most toys come from templates,
such as `group cube` in `template Block(letter, paint, tilt, push)`. A group with
physics is welded into a single body with one part per shape inside it, so a
letter block is a frame, a face and a letter that tumble as one. The letter is
a `text`, which collides as the box around it; that box lies inside the
`size: (64, 64)` frame, so the block collides as the square you see.
`group lpiece` welds two rectangles into an L, and because its parts are
separate, it collides as an L, with an open corner, not as the rectangle around
it. The car's wheels are parts of its body, so they never turn.

### Shapes that collide as drawn

A ball collides as a circle and a brick as a rectangle. A polygon collides as
its convex hull. The beach ball's two coloured panels are bow ties through its
centre, which are concave, but every point of them lies on the ball's edge or
at its centre, so their hull stays inside the circle and the ball still rolls.
The rubber ball's band, `size: (r * 1.84, r * 0.3)`, keeps its corners inside
the circle for the same reason.

### Arrivals one after another

Every toy falls from the first moment, so the order of arrival comes from where
each one starts. The toys are listed roughly from the lowest start to the
highest, from y 410 to y 36, and a toy that starts higher lands later. All but
the first are given a `velocity`, mostly upward, which spreads them sideways and
keeps the later ones in the air longer. The two beach balls have
`airDrag: drag`, passed as 0.12, so they drift down slowly and land on the heap
last, well after the rest.

### Bounce by material

The wooden toys have `bounce: 0.2` (0.25 and 0.3 for the dice and the car), the
rubber balls `bounce: 0.6`, and the small balls `bounce: give`, passed as 0.8.
When two bodies collide, the higher `bounce` of the two is the one used, so a
small ball still bounces high off a wooden block.

### Asleep, not frozen

Every toy has `duration: indefinitely`. Once a toy stops moving it is asleep:
it still collides, and anything that strikes it wakes it again. A numeric
`duration` would freeze it where it was when the time ran out instead.
[The lesson on physics](/learn/physics/) shows the difference.

### The front board

A heap does not turn back into toys in the air, so the scene cannot loop by
itself. The front board, `group lid`, starts closed over the whole frame. Its
`sequence` lifts it clear in 0.4 seconds, holds, and drops it shut with a small
bounce, shut again just after 7.9 seconds. The board has no `physics`, so it
passes in front of the toys without touching them. The first and last frames
are both the closed board, so the jump from the heap back to the start happens
behind it. [The lesson on sequences](/learn/sequence/) covers the steps.
