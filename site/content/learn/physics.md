---
title: Physics
summary: Give a shape a physics block and a simulation moves it instead of you. It falls, bounces and lands on every other physics shape, and it comes out the same every time.
description: Lesson 11 of the Marey course. The physics block and the one world every physics object shares, gravity, velocity, bounce, airDrag and collideBounds, a numeric duration against indefinitely, the collision shape of each kind, welded groups, and why only physics objects collide.
minutes: 30
learn:
- Make a shape fall, bounce and land with a physics block
- Set its gravity, its starting velocity, its bounce and its air drag
- Tell a body that freezes from one that falls asleep
- Predict the shape each kind of object collides as
- Weld a group into one body, and know which objects collide at all
showcase: toy-box
---

Until now you have written every motion yourself: where a shape goes, how
long it takes and how it eases. A `physics` block hands that to a simulation.
You say where a shape starts and what it is like, heavy or bouncy or light,
and the simulation works out how it falls, what it hits and where it comes to
rest. In the showcase above, no toy is moved by hand: the only motions written
out are its front board and the dust in the light.

## A falling ball

A `physics` block inside a shape makes that shape a **body** in the
simulation. Watch the ball below fall, bounce on the bottom edge of the scene
and settle:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  circle ball {
    position: (480, 80)
    radius: 30
    color: #f2b134
    physics { duration: indefinitely }
  }
}
```

Nothing told the ball to fall. A physics block has gravity unless you say
otherwise, `(0, 980)` in pixels per second squared, and a positive y pulls
down, the way y counts in a scene. The ball bounces because every body has some
bounce unless you say otherwise, and it stops at the bottom because every edge
of the scene is a wall for physics bodies.

The block's `duration` says how long the simulation runs this body, and
`duration: indefinitely` means for as long as the scene runs. It is a
different thing from the scene's own `duration`, which says how long the scene
lasts. A physics block must have one; leave it out and the compiler says so.
(The one exception is a body the simulation never moves, which
[the next lesson](/learn/world/) covers.)

```marey error
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  circle ball {
    position: (480, 80)
    radius: 30
    color: #f2b134
    physics { }
  }
}
```

The message says the block is missing its `duration`. Add
`duration: indefinitely` inside the braces and the scene runs.

The simulation steps at a fixed rate, 120 times a second, however fast the
screen draws, so the same scene plays out the same way every time it runs.
[Determinism](/reference/determinism/) says exactly what is promised.

## Gravity and a push

Two properties set how a body starts moving. `gravity: (x, y)` is the pull on
it, and `velocity: (x, y)` is the speed it starts with, in pixels per second.
Both balls below are thrown with the same `velocity`, up and to the right. One
has the default gravity and the other a weaker one. Watch which goes higher:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  // The same throw under two gravities.
  circle earth {
    position: (120, 440)
    radius: 20
    color: #f2b134
    physics { velocity: (260, -480), duration: indefinitely }
  }
  circle moon {
    position: (120, 440)
    radius: 20
    color: #f2e8d5
    physics { velocity: (260, -480), gravity: (0, 400), duration: indefinitely }
  }
}
```

They leave together and part at once. The pale ball, under `gravity: (0, 400)`,
slows less on the way up, so it climbs higher, stays up longer and lands
farther right. The velocity is applied once, when the body's simulation starts,
and from then on the simulation changes it. Gravity can pull sideways too:
`gravity: (300, 980)` pulls down and to the right.

## Bounce

`bounce` says how much of a collision's energy a body keeps, from `0` (it stops
dead) to `1` (it keeps all of it). It defaults to `0.65`, and a value outside 0
to 1 is a compile error. The three balls below fall from the same height with
bounces of 0.2, 0.6 and 0.9. Watch how high each comes back:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 5

  circle low  { position: (240, 80), radius: 30, color: #e4553b, physics { bounce: 0.2, duration: indefinitely } }
  circle mid  { position: (480, 80), radius: 30, color: #f2b134, physics { bounce: 0.6, duration: indefinitely } }
  circle high { position: (720, 80), radius: 30, color: #2f8a94, physics { bounce: 0.9, duration: indefinitely } }
}
```

The red ball barely leaves the floor, the yellow one bounces a few times, and
the teal one is still bouncing well after the others have stopped. When two
bodies with different bounces collide, the higher of the two is used, so a
bouncy ball stays bouncy even when it lands on something that is not.

## Air drag

`airDrag` slows a body as it moves, as air does. It runs the other way from
what the word might suggest: `0` is no air at all, the default, and `1` is the
most resistance there is. Most scenes need only a little, from about 0.006 to
0.02. The confetti below has `airDrag: 0.1`, far more than most scenes need,
so the effect is plain. The stone has none. Both start at the same height:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 5

  // A stone, with no air drag.
  circle stone {
    position: (160, 60)
    radius: 16
    color: #8a8f99
    physics { duration: indefinitely }
  }

  // Confetti from the same height, with a lot of air drag.
  generate i in 0 to 19 {
    rectangle bit {
      position: (320 + i * 28, 50 + (i % 4) * 30)
      size: (14, 8)
      rotation: i * 23
      color: [#e4553b, #f2b134, #2f8a94, #f2e8d5][i % 4]
      physics { velocity: ((i % 5) * 40 - 80, -100), airDrag: 0.1, duration: indefinitely }
    }
  }
}
```

The stone is on the floor in about a second, while the confetti is still in the
top half of the frame. With drag, the confetti soon stops gaining speed and
falls slowly and steadily, and it takes about three seconds to come down.

## The walls

Every edge of the scene is a wall that a body collides with, unless its block
says `collideBounds: false`. Then that body ignores the walls. Both balls below
drop from the same height; watch the bottom edge:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  circle walled { position: (360, 80), radius: 30, color: #f2b134, physics { duration: indefinitely } }
  circle free   { position: (600, 80), radius: 30, color: #e4553b, physics { collideBounds: false, duration: indefinitely } }
}
```

The yellow ball lands on the bottom edge. The red one falls through it and out
of the frame, and keeps falling. A body that ends up 800 pixels beyond the
scene is taken out of the simulation and hidden, so the scene can still come
to rest. `collideBounds` is about the walls
only: a body that ignores them still collides with every other body.
[The next lesson](/learn/world/) shows how to take a wall away for every body
at once.

## Only physics objects collide

Every body in a scene shares one simulation, so every body collides with every
other. An object without a `physics` block is not a body at all. It is only
drawn, and bodies pass through it. The two crates below look the same, but only
the left one has physics. Watch where each ball stops:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  // Two crates that look the same. Only the left one has physics.
  rectangle solid { position: (300, 490), size: (160, 100), color: #b8794a, physics { bounce: 0.1, duration: indefinitely } }
  rectangle drawn { position: (660, 490), size: (160, 100), color: #b8794a }

  circle ballA { position: (300, 80), radius: 26, color: #f2b134, physics { bounce: 0.3, duration: indefinitely } }
  circle ballB { position: (660, 80), radius: 26, color: #f2b134, physics { bounce: 0.3, duration: indefinitely } }
}
```

The left ball lands on the crate and stays on top of it. The right one falls
straight through its crate to the floor; it is drawn in front of the crate
because it is written after it, as in the first lesson. This is what lets a
scene have a painted background, a sky or a floor pattern, that the bodies
ignore.

## Frozen or asleep

A physics block's `duration` is a number of seconds or `indefinitely`, and the
two end differently.

- **A number.** When the time is up, the body **freezes** where it is, mid-air
  included. It stays solid, but nothing in the simulation can move it: it
  becomes part of the scenery. A later `animate` or `physics` step on the same
  object can set it moving again, as [the next lesson](/learn/world/) shows.
- **`indefinitely`.** The body never stops being simulated. Once it comes to
  rest it is **asleep**, which saves work, but it still collides, and anything
  that strikes it wakes it.

A frozen body and a sleeping one look the same. The two small balls below are
both lying still on a floor; the left one froze after half a second, and the
right one is asleep. A big ball then falls on each. Watch which small ball
moves:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  // A floor: with no gravity it stays where it is, and it freezes at once.
  rectangle floor { position: (480, 470), size: (960, 40), color: #3b4a6b, physics { gravity: (0, 0), bounce: 0, duration: 0.05 } }

  // Two small balls at rest on the floor, the same but for duration.
  circle frozen { position: (320, 426), radius: 24, color: #2f8a94, physics { duration: 0.5 } }
  circle asleep { position: (640, 426), radius: 24, color: #b8794a, physics { duration: indefinitely } }

  // A big ball falls on each, a little off-centre.
  circle left  { position: (340, 60), radius: 50, color: #f2b134, physics { bounce: 0.3, duration: indefinitely } }
  circle right { position: (660, 60), radius: 50, color: #f2b134, physics { bounce: 0.3, duration: indefinitely } }
}
```

The teal ball does not move at all; the big ball lands on it and rolls off it
as it would off a rock. The brown ball wakes and is knocked aside. Use a number
when a body should come to a stop and stay put, and `indefinitely` when it
should go on reacting to what happens after it settles.

The floor is frozen too, and that is how it was made. It has
`gravity: (0, 0)`, so nothing pulls it anywhere, and `duration: 0.05`, so it
freezes where it was placed almost at once and becomes solid scenery for the
rest of the scene. Its `bounce: 0` leaves every landing to the bounce of the
body that lands, since the higher of the two is used. A frozen body like this
is how this lesson makes a floor or a wall away from the scene's edges.

## The shape a body collides as

Each kind of object collides as a simple shape:

- a `circle` as a circle of its `radius`;
- a `rectangle` as a rectangle of its `size`;
- a `text` as the rectangle around its letters;
- a `polygon` as its **convex hull**: the shape a rubber band would make
  stretched round its points.

A convex polygon, such as a triangle, collides exactly as drawn. A concave
one, with a notch or a hollow, collides as though the hollow were filled in.
The cup below is one polygon. Watch where the ball stops:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  // A cup: a concave polygon.
  polygon cup {
    position: (480, 470)
    color: #2f8a94
    points: [(-120, -70), (-90, -70), (-90, 40), (90, 40), (90, -70), (120, -70), (120, 70), (-120, 70)]
    physics { bounce: 0.1, duration: indefinitely }
  }
  circle ball { position: (480, 80), radius: 30, color: #f2b134, physics { bounce: 0.3, duration: indefinitely } }
}
```

The ball comes to rest on top of the cup, level with its rim, as if a lid were
on it. The cup is drawn with its true outline, but it collides as its hull,
which closes the top. The next section shows how to make a hollow that
collides as a hollow.

A `line` has no width as geometry, only a stroke, so it has no shape to collide
as, and it cannot have physics:

```marey error=TYPE_LINE_PHYSICS
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  line rail {
    position: (480, 300)
    points: [(-200, 0), (200, 0)]
    thickness: 8
    color: #f2b134
    physics { duration: indefinitely }
  }
}
```

For a solid bar, use a thin `rectangle`.

## Welded groups

A `physics` block on a `group` makes the whole group one body. Each object
inside it becomes one part of that body, at its own place and angle in the
group, and the parts move as one: they are **welded** together. Because each
part keeps its own shape, a group can collide as an L, a hook or a cup, where
a single polygon would collide as its hull.

Below is the same L twice: on the left one polygon, on the right two welded
rectangles. A ball drops towards the inside corner of each:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  // The same L, twice: one polygon on the left, two welded rectangles on the right.
  polygon flat {
    position: (300, 460)
    color: #2f8a94
    points: [(-80, -80), (-40, -80), (-40, 40), (80, 40), (80, 80), (-80, 80)]
    physics { bounce: 0.1, duration: indefinitely }
  }
  group welded {
    position: (660, 460)
    rectangle stem { position: (-60, 0), size: (40, 160), color: #2f8a94 }
    rectangle foot { position: (20, 60), size: (120, 40), color: #2f8a94 }
    physics { bounce: 0.1, duration: indefinitely }
  }

  circle ballA { position: (320, 80), radius: 24, color: #f2b134, physics { bounce: 0.2, duration: indefinitely } }
  circle ballB { position: (644, 80), radius: 24, color: #f2b134, physics { bounce: 0.2, duration: indefinitely } }
}
```

The left ball lands on the slope of the polygon's hull, which runs from the top
of the stem to the tip of the foot, and rolls off it onto the floor. The right
ball drops into the corner and stays there, resting on the foot against the
stem, well below where the hull's slope would have stopped it.

The objects inside a physics group have no physics blocks of their own; the
group's block is the one that counts, and giving a child one as well is a
compile error. A physics group turns about its own (0, 0), as every group does,
and that point is where its body is placed.

## Reading the showcase

Open "Show the source" under the Toy Box player at the top of the page. Toys
tumble into a wooden box and settle into a heap, behind a front board that
lifts as the scene starts and drops as it ends:

- **The box.** The scene's side edges are walls for every toy, and the floor
  they land on is a physics plank with `gravity: (0, 0)` and
  `duration: 0.05`, frozen in place at once, as in "Frozen or asleep". The
  planks, the painted alphabet and the light have no physics, so the toys fall
  past them.
- **Every toy is a welded group,** most of them from templates. A letter block,
  `template Block(letter, paint, tilt, push)`, welds a frame, a face and its
  letter. The letter is a `text`, which collides as the box round it, and that
  box lies inside the 64-pixel frame, so the block collides as a square. The
  L-piece is two rectangles, so it collides as an L. The car's wheels are parts
  of its body, so they never turn.
- **The beach balls** draw their coloured panels as two bow ties, concave
  polygons whose points all lie on the ball's edge or at its centre. Their
  hulls stay inside the ball, so it still collides as a circle.
- **Arrivals one after another.** Every toy falls from the start. They are
  listed roughly from the lowest to the highest, and a toy that starts higher
  lands later. Each toy has a starting `velocity`, which the templates take as
  `push`. The beach balls pass a large `airDrag`, 0.12, so they drift down
  last.
- **Bounce by material:** 0.2 for most of the wood, 0.6 for rubber, and 0.8 for
  the three small balls, which keep bouncing off everything, since the higher
  bounce of two is the one used.
- **Every toy is `duration: indefinitely`,** so a toy at rest is asleep and
  wakes if something lands on it. The heap comes to rest by about four and a
  half seconds.
- **The front board** is a group with no physics, so it never touches a toy.
  A heap cannot turn back into toys in the air, so the board covers the jump:
  its `sequence` lifts it in the first 0.4 seconds and drops it shut just after
  7.9, and the first and last frames are both the closed board.

## Try this

The exercises use a smaller box: five letter blocks, three balls and a beach
ball with a lot of air drag, falling onto a frozen floor like the showcase's.

:::try Make everything bouncier
Raise the bounce of the blocks and the balls, so that the toys fly about more
before they settle.

```marey
template Block(letter, paint, tilt) {
  group cube {
    position: (0, 0)
    rotation: tilt
    rectangle frame { position: (0, 0), size: (64, 64), color: paint }
    rectangle face  { position: (0, 0), size: (50, 50), color: #eac58c }
    text glyph { position: (0, 1), content: letter, fontSize: 38, color: paint }
    physics { bounce: 0.2, duration: indefinitely }
  }
}

template Ball(r, tone, give, drag) {
  group ball {
    position: (0, 0)
    circle body { position: (0, 0), radius: r, color: tone }
    circle spot { position: (r * 0.4, -r * 0.35), radius: r * 0.3, color: #f6ead2 }
    physics { bounce: give, airDrag: drag, duration: indefinitely }
  }
}

scene {
  size: (960, 540)
  background: #7e4c2a
  duration: 6

  // The floor, frozen in place as in the showcase.
  rectangle floor { position: (480, 510), size: (960, 60), color: #9a6a42, physics { gravity: (0, 0), bounce: 0, duration: 0.05 } }

  // The letters start lowest, so they land first.
  use Block("M", #2c62a8, 10) m { position: (380, 384) }
  use Block("A", #d9452b, -15) a { position: (500, 359) }
  use Block("R", #3f9a5b, 25) r { position: (440, 291) }
  use Block("E", #f2b134, -5) e { position: (560, 258) }
  use Block("Y", #2c62a8, 40) y { position: (480, 199) }

  use Ball(30, #d9452b, 0.6, 0) b0 { position: (400, 123) }
  use Ball(30, #2c62a8, 0.6, 0) b1 { position: (560, 90) }
  use Ball(16, #f2b134, 0.9, 0) b2 { position: (470, 48) }

  // A beach ball with a lot of air drag drifts down on the right.
  use Ball(44, #f6ead2, 0.6, 0.2) beach { position: (760, 73) }
}
```

```marey solution
template Block(letter, paint, tilt) {
  group cube {
    position: (0, 0)
    rotation: tilt
    rectangle frame { position: (0, 0), size: (64, 64), color: paint }
    rectangle face  { position: (0, 0), size: (50, 50), color: #eac58c }
    text glyph { position: (0, 1), content: letter, fontSize: 38, color: paint }
    physics { bounce: 0.6, duration: indefinitely }
  }
}

template Ball(r, tone, give, drag) {
  group ball {
    position: (0, 0)
    circle body { position: (0, 0), radius: r, color: tone }
    circle spot { position: (r * 0.4, -r * 0.35), radius: r * 0.3, color: #f6ead2 }
    physics { bounce: give, airDrag: drag, duration: indefinitely }
  }
}

scene {
  size: (960, 540)
  background: #7e4c2a
  duration: 6

  // The floor, frozen in place as in the showcase.
  rectangle floor { position: (480, 510), size: (960, 60), color: #9a6a42, physics { gravity: (0, 0), bounce: 0, duration: 0.05 } }

  // The letters start lowest, so they land first.
  use Block("M", #2c62a8, 10) m { position: (380, 384) }
  use Block("A", #d9452b, -15) a { position: (500, 359) }
  use Block("R", #3f9a5b, 25) r { position: (440, 291) }
  use Block("E", #f2b134, -5) e { position: (560, 258) }
  use Block("Y", #2c62a8, 40) y { position: (480, 199) }

  use Ball(30, #d9452b, 0.9, 0) b0 { position: (400, 123) }
  use Ball(30, #2c62a8, 0.9, 0) b1 { position: (560, 90) }
  use Ball(16, #f2b134, 1, 0) b2 { position: (470, 48) }

  // A beach ball with a lot of air drag drifts down on the right.
  use Ball(44, #f6ead2, 0.9, 0.2) beach { position: (760, 73) }
}
```

The blocks' bounce is written in their template, so one number changes all
five, from 0.2 to 0.6. Each ball's bounce is the `give` its `use` passes, so
those are raised one by one: 0.6 to 0.9, and the small ball's 0.9 to 1, the
most there is. The floor's `bounce: 0` stays, because the higher bounce of the
two is used anyway. The toys now bounce higher when they land, and the letters
tumble further before they settle.
:::

:::try Drop the letters last
Make the balls land first and the letters arrive after them, on top.

```marey
template Block(letter, paint, tilt) {
  group cube {
    position: (0, 0)
    rotation: tilt
    rectangle frame { position: (0, 0), size: (64, 64), color: paint }
    rectangle face  { position: (0, 0), size: (50, 50), color: #eac58c }
    text glyph { position: (0, 1), content: letter, fontSize: 38, color: paint }
    physics { bounce: 0.2, duration: indefinitely }
  }
}

template Ball(r, tone, give, drag) {
  group ball {
    position: (0, 0)
    circle body { position: (0, 0), radius: r, color: tone }
    circle spot { position: (r * 0.4, -r * 0.35), radius: r * 0.3, color: #f6ead2 }
    physics { bounce: give, airDrag: drag, duration: indefinitely }
  }
}

scene {
  size: (960, 540)
  background: #7e4c2a
  duration: 6

  // The floor, frozen in place as in the showcase.
  rectangle floor { position: (480, 510), size: (960, 60), color: #9a6a42, physics { gravity: (0, 0), bounce: 0, duration: 0.05 } }

  // The letters start lowest, so they land first.
  use Block("M", #2c62a8, 10) m { position: (380, 384) }
  use Block("A", #d9452b, -15) a { position: (500, 359) }
  use Block("R", #3f9a5b, 25) r { position: (440, 291) }
  use Block("E", #f2b134, -5) e { position: (560, 258) }
  use Block("Y", #2c62a8, 40) y { position: (480, 199) }

  use Ball(30, #d9452b, 0.6, 0) b0 { position: (400, 123) }
  use Ball(30, #2c62a8, 0.6, 0) b1 { position: (560, 90) }
  use Ball(16, #f2b134, 0.9, 0) b2 { position: (470, 48) }

  // A beach ball with a lot of air drag drifts down on the right.
  use Ball(44, #f6ead2, 0.6, 0.2) beach { position: (760, 73) }
}
```

```marey solution
template Block(letter, paint, tilt) {
  group cube {
    position: (0, 0)
    rotation: tilt
    rectangle frame { position: (0, 0), size: (64, 64), color: paint }
    rectangle face  { position: (0, 0), size: (50, 50), color: #eac58c }
    text glyph { position: (0, 1), content: letter, fontSize: 38, color: paint }
    physics { bounce: 0.2, duration: indefinitely }
  }
}

template Ball(r, tone, give, drag) {
  group ball {
    position: (0, 0)
    circle body { position: (0, 0), radius: r, color: tone }
    circle spot { position: (r * 0.4, -r * 0.35), radius: r * 0.3, color: #f6ead2 }
    physics { bounce: give, airDrag: drag, duration: indefinitely }
  }
}

scene {
  size: (960, 540)
  background: #7e4c2a
  duration: 6

  // The floor, frozen in place as in the showcase.
  rectangle floor { position: (480, 510), size: (960, 60), color: #9a6a42, physics { gravity: (0, 0), bounce: 0, duration: 0.05 } }

  // The balls now start lowest, and the letters above them.
  use Ball(30, #d9452b, 0.6, 0) b0 { position: (400, 401) }
  use Ball(30, #2c62a8, 0.6, 0) b1 { position: (560, 375) }
  use Ball(16, #f2b134, 0.9, 0) b2 { position: (470, 342) }

  use Block("M", #2c62a8, 10) m { position: (380, 258) }
  use Block("A", #d9452b, -15) a { position: (500, 216) }
  use Block("R", #3f9a5b, 25) r { position: (440, 149) }
  use Block("E", #f2b134, -5) e { position: (560, 107) }
  use Block("Y", #2c62a8, 40) y { position: (480, 48) }

  // A beach ball with a lot of air drag drifts down on the right.
  use Ball(44, #f6ead2, 0.6, 0.2) beach { position: (760, 73) }
}
```

Every toy falls from the start, so the order they arrive in comes from where
they start. The balls now start lowest, from y 342 to 401, so they reach the
floor first, and the letters start above them, from y 48 to 258, and land on
and between them. The `use` lines are reordered too, so the list still reads
from the lowest start to the highest, but it is the `position`s that decide
when each toy lands.
:::

:::try Freeze the heap at four seconds
Make every toy stop for good four seconds into the scene, wherever it is then.

```marey
template Block(letter, paint, tilt) {
  group cube {
    position: (0, 0)
    rotation: tilt
    rectangle frame { position: (0, 0), size: (64, 64), color: paint }
    rectangle face  { position: (0, 0), size: (50, 50), color: #eac58c }
    text glyph { position: (0, 1), content: letter, fontSize: 38, color: paint }
    physics { bounce: 0.2, duration: indefinitely }
  }
}

template Ball(r, tone, give, drag) {
  group ball {
    position: (0, 0)
    circle body { position: (0, 0), radius: r, color: tone }
    circle spot { position: (r * 0.4, -r * 0.35), radius: r * 0.3, color: #f6ead2 }
    physics { bounce: give, airDrag: drag, duration: indefinitely }
  }
}

scene {
  size: (960, 540)
  background: #7e4c2a
  duration: 6

  // The floor, frozen in place as in the showcase.
  rectangle floor { position: (480, 510), size: (960, 60), color: #9a6a42, physics { gravity: (0, 0), bounce: 0, duration: 0.05 } }

  // The letters start lowest, so they land first.
  use Block("M", #2c62a8, 10) m { position: (380, 384) }
  use Block("A", #d9452b, -15) a { position: (500, 359) }
  use Block("R", #3f9a5b, 25) r { position: (440, 291) }
  use Block("E", #f2b134, -5) e { position: (560, 258) }
  use Block("Y", #2c62a8, 40) y { position: (480, 199) }

  use Ball(30, #d9452b, 0.6, 0) b0 { position: (400, 123) }
  use Ball(30, #2c62a8, 0.6, 0) b1 { position: (560, 90) }
  use Ball(16, #f2b134, 0.9, 0) b2 { position: (470, 48) }

  // A beach ball with a lot of air drag drifts down on the right.
  use Ball(44, #f6ead2, 0.6, 0.2) beach { position: (760, 73) }
}
```

```marey solution
template Block(letter, paint, tilt) {
  group cube {
    position: (0, 0)
    rotation: tilt
    rectangle frame { position: (0, 0), size: (64, 64), color: paint }
    rectangle face  { position: (0, 0), size: (50, 50), color: #eac58c }
    text glyph { position: (0, 1), content: letter, fontSize: 38, color: paint }
    physics { bounce: 0.2, duration: 4 }
  }
}

template Ball(r, tone, give, drag) {
  group ball {
    position: (0, 0)
    circle body { position: (0, 0), radius: r, color: tone }
    circle spot { position: (r * 0.4, -r * 0.35), radius: r * 0.3, color: #f6ead2 }
    physics { bounce: give, airDrag: drag, duration: 4 }
  }
}

scene {
  size: (960, 540)
  background: #7e4c2a
  duration: 6

  // The floor, frozen in place as in the showcase.
  rectangle floor { position: (480, 510), size: (960, 60), color: #9a6a42, physics { gravity: (0, 0), bounce: 0, duration: 0.05 } }

  // The letters start lowest, so they land first.
  use Block("M", #2c62a8, 10) m { position: (380, 384) }
  use Block("A", #d9452b, -15) a { position: (500, 359) }
  use Block("R", #3f9a5b, 25) r { position: (440, 291) }
  use Block("E", #f2b134, -5) e { position: (560, 258) }
  use Block("Y", #2c62a8, 40) y { position: (480, 199) }

  use Ball(30, #d9452b, 0.6, 0) b0 { position: (400, 123) }
  use Ball(30, #2c62a8, 0.6, 0) b1 { position: (560, 90) }
  use Ball(16, #f2b134, 0.9, 0) b2 { position: (470, 48) }

  // A beach ball with a lot of air drag drifts down on the right.
  use Ball(44, #f6ead2, 0.6, 0.2) beach { position: (760, 73) }
}
```

Every toy comes from one of the two templates, so two changes do it:
`duration: indefinitely` becomes `duration: 4` in each, and the floor keeps
its own 0.05. The letters have settled by then, so they look no different.
The other toys show what freezing means, because a frozen body stays exactly
where it was. The beach ball, still drifting down at four seconds, stops dead
in mid-air and hangs there for the rest of the scene. The small yellow ball is
caught in the middle of a bounce, 16 pixels above the floor, and stays there
too.
:::

## Recap

- A `physics` block makes an object a body in one simulation that every body
  shares, and every body collides with every other. An object without one is
  only drawn, and bodies pass through it.
  ([Physics](/reference/language/#physics))
- `gravity` defaults to `(0, 980)` pixels per second squared, pulling down.
  `velocity` is the speed a body starts with, applied once.
  ([Properties](/reference/language/#properties))
- `bounce` runs from 0 to 1 and defaults to 0.65; when two bodies collide, the
  higher one is used. `airDrag` runs from 0, no air, to 1, and small values go
  a long way. ([Properties](/reference/language/#properties))
- The scene's edges are walls; `collideBounds: false` lets a body pass them,
  and a body 800 pixels beyond the scene is removed and hidden.
  ([Properties](/reference/language/#properties))
- A physics block needs a `duration`, unless it is locked, as the next lesson
  shows. When a number runs out, the body freezes where it is and nothing in
  the simulation moves it; with `indefinitely`, a body at rest is asleep and
  wakes when struck.
  ([When duration expires](/reference/language/#when-duration-expires))
- A circle collides as a circle, a rectangle as a rectangle, a text as the box
  round it and a polygon as its convex hull. A line cannot have physics.
  ([Properties](/reference/language/#properties))
- A physics group is welded into one body with one part per object, so it can
  collide as a concave shape.
  ([Physics and groups](/reference/language/#physics-and-groups),
  [Properties](/reference/language/#properties))
