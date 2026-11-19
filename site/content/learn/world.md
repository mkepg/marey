---
title: The world: walls, locks and spin
summary: One world block sets the gravity and the walls for every body. Locked bodies make ledges, pegs and paddles, spin and lockRotation decide how bodies turn, and a sequence can drop a body in later.
description: Lesson 12 of the Marey course. The world block with gravity and bounds, open edges and what happens to a body that leaves, lockPosition and the properties it forbids, a locked body moved by animation, spin and lockRotation, and a physics step inside a sequence.
minutes: 30
learn:
- Set the gravity and the walls for every body with one world block
- Open an edge, and know what becomes of a body that leaves through it
- Fix a body in place with lockPosition, and move it with an animation
- Start a body turning with spin, or stop it turning with lockRotation
- Hold a body still in a sequence and drop it in later
showcase: plinko
---

In [the last lesson](/learn/physics/) every body fell into a box made of the
scene's four edges, and every body was moved by the simulation from the first
moment. This lesson changes the box and the bodies in it: which edges are
walls, bodies that never move, bodies that turn or refuse to, and bodies that
wait before they fall. The showcase above uses all of them.

## The world block

A `world` block, written directly inside `scene`, sets what every physics block
in the scene shares. A scene can have one, and both of its properties are
optional.

- `gravity: (x, y)` is the gravity for every physics block that does not write
  its own. A block that does write one keeps its own.
- `bounds: [edge, …]` lists the edges of the scene that are walls: any of
  `left`, `right`, `top` and `bottom`, in any order, each once. With no
  `bounds`, all four are walls, as in the last lesson. `bounds: []` means no
  walls at all.

The world below has gentler gravity and no wall on top. Three balls start above
the frame, each higher than the last. Watch them come in:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  world {
    gravity: (0, 600)
    bounds: [left, right, bottom]
  }

  // Three balls start above the frame, higher and higher.
  circle a { position: (300, -40), radius: 26, color: #ff7a59, physics { bounce: 0.5, duration: indefinitely } }
  circle b { position: (480, -260), radius: 26, color: #5fe0b5, physics { bounce: 0.5, duration: indefinitely } }
  circle c { position: (660, -480), radius: 26, color: #6cb4ff, physics { bounce: 0.5, duration: indefinitely } }
}
```

The balls fall into the frame one after another, because the top has no wall
to hold them out. None of them writes a `gravity`, so all three fall under the
world's `(0, 600)`. An open top is how a scene drops things in from outside the
picture.

The edge words mean something only inside `bounds`. Anywhere else they are
ordinary names, so `let top = 40` is a legal line, and it does not change what
a `bounds` list means.

## Leaving through an open edge

A body that goes through an open edge keeps moving, and gravity can bring it
back. Once it is 800 pixels beyond the scene, it is taken out of the simulation
and hidden, so a scene with open edges still comes to rest. The world below has
no wall on the right. Both balls are thrown up and outwards, one to each side:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  // No wall on the right.
  world { bounds: [left, top, bottom] }

  circle stays { position: (200, 300), radius: 26, color: #5fe0b5, physics { velocity: (-500, -300), duration: indefinitely } }
  circle goes  { position: (760, 300), radius: 26, color: #ff7a59, physics { velocity: (500, -300), duration: indefinitely } }
}
```

The green ball hits the left wall and comes back. The red one leaves through
the right edge and does not return. An object's own `collideBounds` still works
as before, but only against the edges `bounds` gives walls to: it can let a body
through a wall, and it cannot add one.

## Bodies that never move

`lockPosition: true` makes a body **locked**: it is solid for the whole scene,
and nothing in the simulation moves it. Bodies land on it, roll along it and
bounce off it. A ledge, a peg or a floor is a locked body. The two ledges below
tilt opposite ways. Watch the ball come in through the open top:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 5

  world { bounds: [left, right, bottom] }

  // Two locked ledges, one tilted each way.
  rectangle upper { position: (360, 200), size: (400, 16), rotation: 10, color: #e8b44a, physics { lockPosition: true } }
  rectangle lower { position: (600, 380), size: (400, 16), rotation: -10, color: #e8b44a, physics { lockPosition: true } }

  circle ball { position: (220, -40), radius: 22, color: #6cb4ff, physics { bounce: 0.2, duration: indefinitely } }
}
```

The ball lands on the upper ledge, rolls down it and drops onto the lower one,
and neither ledge moves, however it is struck. The ledges have no `duration`,
the one exception to [the last lesson's](/learn/physics/) rule that a physics
block needs one: a locked body is fixed for the whole scene, so there is
nothing to time.

A locked body has no motion for the other physics properties to describe, so
besides `lockPosition` its block may hold only `bounce`. Writing anything else,
`gravity`, `velocity`, `airDrag`, `spin`, `lockRotation`, `collideBounds` or
`duration`, is a compile error rather than something silently ignored:

```marey error=TYPE_LOCK_IGNORED
scene {
  size: (960, 540)
  background: #101433

  rectangle ledge {
    position: (480, 300)
    size: (360, 16)
    color: #e8b44a
    physics { lockPosition: true, duration: indefinitely }
  }
}
```

The message names the property to remove. Delete `duration: indefinitely` and
the ledge compiles.

## A locked body you move yourself

The lock stops the simulation from moving a body. It does not stop you: an
`animate` block still moves a locked object, and its body goes with it. That is
how to make a paddle, a piston or a sweeping arm: a locked body on a looping
animation shoves whatever is in its way. Three crates rest on a locked shelf
below, in the path of a red bar. Watch what the bar does to them:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 6

  world { bounds: [left, right, bottom] }

  // A locked shelf, and a locked bar that sweeps along it and back.
  rectangle shelf { position: (400, 300), size: (560, 16), color: #e8b44a, physics { lockPosition: true } }
  rectangle pusher {
    position: (140, 252)
    size: (20, 80)
    color: #ff6b6b
    physics { lockPosition: true, bounce: 0.2 }
    animate { property: position, to: (760, 252), duration: 2, easing: easeInOut, loop: true, yoyo: true }
  }

  // Three crates resting on the shelf in its path.
  generate i in 0 to 2 {
    rectangle crate {
      position: (320 + i * 120, 272)
      size: (40, 40)
      color: [#ff7a59, #5fe0b5, #6cb4ff][i]
      physics { bounce: 0.2, duration: indefinitely }
    }
  }
}
```

The bar reaches the first crate a little before one second and pushes it into
the second and the third, and all three slide along the shelf ahead of it. At
the far end they are pushed off, tumble and land on the floor below, and the
bar sweeps back over the empty shelf. The crates cannot slow it or push it
back, because it keeps to its animation. When an animation on a locked body
ends, the body is fixed again where the animation left it.

`lockPosition` goes on an object's own `physics` block, a group's included,
where a locked group is a fixed shape made of its parts. It cannot be used in
a `sequence` step, or on an object that has a `sequence`, because a locked body
never finishes, so the steps after it could never start.

## Turning: spin and lockRotation

A body turns when it is struck off-centre, as the letter blocks in the last
lesson did. Two properties change that.

- `spin` is how fast a body is already turning when its simulation starts, in
  degrees per second. A positive spin is clockwise, the same way as a positive
  `rotation`. Like `velocity` it is applied once, and `airDrag` slows it.
- `lockRotation: true` stops collisions from turning the body. Every knock goes
  into moving it instead, so it slides where it would have tumbled.

The tile and the crate below are the same size and fall onto the same locked
ramp. Watch how each goes down it:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  world { bounds: [left, right, bottom] }

  // A locked ramp, falling to the right.
  rectangle ramp { position: (480, 360), size: (760, 16), rotation: 14, color: #e8b44a, physics { lockPosition: true } }

  rectangle tile  { position: (200, 60), size: (60, 60), color: #ff7a59, physics { spin: 270, bounce: 0.2, duration: indefinitely } }
  rectangle crate { position: (360, 60), size: (60, 60), color: #6cb4ff, physics { lockRotation: true, bounce: 0.2, duration: indefinitely } }
}
```

The tile is turning clockwise before it lands, and it tumbles down the ramp. The
crate lands level and stays level the whole way down, sliding on one corner.
`lockRotation` is not a hold on the angle: an `animate` on `rotation` still
turns the object. A block with both `spin` and `lockRotation: true` is a
compile error, since the lock would throw the spin away.

## Starting a body later

Every body so far was simulated from the first moment. A `physics` block can
also be a step of a `sequence`, the block from
[the lesson on sequences](/learn/sequence/),
so a body can wait, held still by an `animate` step, and fall when its physics
step begins. The body exists all through the wait: it is solid, held where the
animation puts it, and nothing can push it. The shelf below is held for 1.3
seconds and then let go. Watch the ball that lands on it:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 5

  world { bounds: [left, right, bottom] }

  // Held in the air for 1.3 seconds, then let go.
  rectangle shelf {
    position: (480, 260)
    size: (200, 30)
    color: #6cb4ff
    sequence {
      animate { property: position, to: (480, 260), duration: 1.3 }
      physics { bounce: 0.2, duration: 3 }
    }
  }

  // Dropped at once, from above it.
  circle ball { position: (480, -40), radius: 26, color: #ffd84d, physics { bounce: 0.3, duration: indefinitely } }
}
```

The ball lands on the shelf and rests there while the shelf hangs in the air,
because the shelf is already a body. At 1.3 seconds the shelf's physics step
starts, and both fall to the floor.

A physics step inside a sequence must have a number for its `duration`, never
`indefinitely`, because the sequence could not move on past a step that never
ends. When the number runs out the body freezes, as in the last lesson. If the
sequence has another step after it, the freeze lifts when that step starts, and
the body goes back into the simulation.

## Reading the showcase

Open "Show the source" under the Plinko player at the top of the page. Sixteen
discs drop through a board of pegs into scoring bins, the bins empty, and the
scene loops without a seam:

- **`world`** sets `gravity: (0, 900)` once for every disc, and
  `bounds: [left, right]`: the top is open, so the discs can wait above the
  frame, and the bottom is open, so they can fall out when the bins empty. By
  nine seconds every disc has dropped out of sight behind the counter.
- **The pegs** are 36 locked circles from `generate r in 0 to 7` with
  `generate c in 0 to r` inside it, so row r has r + 1 pegs. Each is
  `physics { lockPosition: true, bounce: 0.3 }`, and nothing else, since a
  locked body takes only `bounce`.
- **The cabinet**, the neck, the rails, the walls and the eight dividers, is
  more locked rectangles.
- **The paddle** is locked too, with two looping animations: it slides across
  the neck and tilts as it goes, there and back every 2.5 seconds, so each disc
  is knocked one way or the other.
- **Each disc** is a group with a `sequence`. The first step holds it above the
  frame, 0.3 seconds for disc 0 and 0.2 seconds more for each one after, so the
  discs drop one after another until 3.3 seconds. The second is its physics,
  with `spin: [240, -240][k % 2]`, so alternate discs turn opposite ways. Its
  `duration` is `7.5 - k * hold`, so the hold and the physics add up to 7.8
  seconds for every disc.
- **The floor** is ten locked slats. At 7.8 seconds each turns a quarter on a
  `delay` and comes back, a `yoyo` without a `loop`, and standing upright it
  lines up with its divider, so every bin opens across its width. As the slats
  begin to turn, every disc's first physics step ends, freezing it where it
  lies, and its third step, more physics, starts at once, so all sixteen go back
  into the simulation together and drop out.
- **The lights** blink on a one-second period, the stars on two and five, and
  the paddle swings on 2.5. All of them divide ten, and the discs are out of the
  frame before the scene ends, so the last frame matches the first.

## Try this

The exercises use a smaller board: six rows of pegs, bins standing on the
bottom edge, and ten discs.

:::try Tilt the world's gravity
Make every disc drift to the right as it falls, as though the board were
tilted.

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 8

  world {
    gravity: (0, 900)
    bounds: [left, right, bottom]
  }

  // Pegs: row r has r + 1 of them.
  generate r in 0 to 5 {
    generate c in 0 to r {
      circle peg { position: (480 + (c - r / 2) * 70, 120 + r * 56), radius: 7, color: #e8b44a,
                   physics { lockPosition: true, bounce: 0.3 } }
    }
  }

  // Bins: dividers standing on the bottom edge.
  generate c in 0 to 7 {
    rectangle divider { position: (235 + c * 70, 490), size: (6, 100), color: #f3e9d2,
                        physics { lockPosition: true, bounce: 0.2 } }
  }

  // Discs wait above the frame and drop in turn.
  generate k in 0 to 9 {
    let x = 480 + [-3, 2, -1, 4, -4][k % 5]
    circle disc {
      position: (x, -30 - k * 30)
      radius: 10
      color: [#ff7a59, #5fe0b5, #6cb4ff, #ffd84d][k % 4]
      sequence {
        animate { property: position, to: (x, -30 - k * 30), duration: 0.2 + k * 0.3 }
        physics { bounce: 0.3, duration: 7 }
      }
    }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #101433
  duration: 8

  world {
    gravity: (300, 900)
    bounds: [left, right, bottom]
  }

  // Pegs: row r has r + 1 of them.
  generate r in 0 to 5 {
    generate c in 0 to r {
      circle peg { position: (480 + (c - r / 2) * 70, 120 + r * 56), radius: 7, color: #e8b44a,
                   physics { lockPosition: true, bounce: 0.3 } }
    }
  }

  // Bins: dividers standing on the bottom edge.
  generate c in 0 to 7 {
    rectangle divider { position: (235 + c * 70, 490), size: (6, 100), color: #f3e9d2,
                        physics { lockPosition: true, bounce: 0.2 } }
  }

  // Discs wait above the frame and drop in turn.
  generate k in 0 to 9 {
    let x = 480 + [-3, 2, -1, 4, -4][k % 5]
    circle disc {
      position: (x, -30 - k * 30)
      radius: 10
      color: [#ff7a59, #5fe0b5, #6cb4ff, #ffd84d][k % 4]
      sequence {
        animate { property: position, to: (x, -30 - k * 30), duration: 0.2 + k * 0.3 }
        physics { bounce: 0.3, duration: 7 }
      }
    }
  }
}
```

One number: the world's gravity gains an x of 300, so every disc is pulled to
the right as well as down. No disc writes its own `gravity`, so all ten follow
the world's. They curve right as they fall and pile up on the right-hand side,
and the locked pegs and dividers are not affected at all.
:::

:::try Open the bottom edge
Let the discs fall out of the bottom of the frame instead of collecting in the
bins.

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 8

  world {
    gravity: (0, 900)
    bounds: [left, right, bottom]
  }

  // Pegs: row r has r + 1 of them.
  generate r in 0 to 5 {
    generate c in 0 to r {
      circle peg { position: (480 + (c - r / 2) * 70, 120 + r * 56), radius: 7, color: #e8b44a,
                   physics { lockPosition: true, bounce: 0.3 } }
    }
  }

  // Bins: dividers standing on the bottom edge.
  generate c in 0 to 7 {
    rectangle divider { position: (235 + c * 70, 490), size: (6, 100), color: #f3e9d2,
                        physics { lockPosition: true, bounce: 0.2 } }
  }

  // Discs wait above the frame and drop in turn.
  generate k in 0 to 9 {
    let x = 480 + [-3, 2, -1, 4, -4][k % 5]
    circle disc {
      position: (x, -30 - k * 30)
      radius: 10
      color: [#ff7a59, #5fe0b5, #6cb4ff, #ffd84d][k % 4]
      sequence {
        animate { property: position, to: (x, -30 - k * 30), duration: 0.2 + k * 0.3 }
        physics { bounce: 0.3, duration: 7 }
      }
    }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #101433
  duration: 8

  world {
    gravity: (0, 900)
    bounds: [left, right]
  }

  // Pegs: row r has r + 1 of them.
  generate r in 0 to 5 {
    generate c in 0 to r {
      circle peg { position: (480 + (c - r / 2) * 70, 120 + r * 56), radius: 7, color: #e8b44a,
                   physics { lockPosition: true, bounce: 0.3 } }
    }
  }

  // Bins: dividers standing on the bottom edge.
  generate c in 0 to 7 {
    rectangle divider { position: (235 + c * 70, 490), size: (6, 100), color: #f3e9d2,
                        physics { lockPosition: true, bounce: 0.2 } }
  }

  // Discs wait above the frame and drop in turn.
  generate k in 0 to 9 {
    let x = 480 + [-3, 2, -1, 4, -4][k % 5]
    circle disc {
      position: (x, -30 - k * 30)
      radius: 10
      color: [#ff7a59, #5fe0b5, #6cb4ff, #ffd84d][k % 4]
      sequence {
        animate { property: position, to: (x, -30 - k * 30), duration: 0.2 + k * 0.3 }
        physics { bounce: 0.3, duration: 7 }
      }
    }
  }
}
```

`bottom` comes out of the `bounds` list. The bins had no floor of their own:
the discs rested on the bottom edge, so without that wall they drop between the
dividers and out of the frame. Each is hidden and taken out of the simulation
once it is 800 pixels below the scene.
:::

:::try Square pegs
Replace the round pegs with locked squares, 14 pixels on a side, and watch how
the discs bounce off their flat faces.

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 8

  world {
    gravity: (0, 900)
    bounds: [left, right, bottom]
  }

  // Pegs: row r has r + 1 of them.
  generate r in 0 to 5 {
    generate c in 0 to r {
      circle peg { position: (480 + (c - r / 2) * 70, 120 + r * 56), radius: 7, color: #e8b44a,
                   physics { lockPosition: true, bounce: 0.3 } }
    }
  }

  // Bins: dividers standing on the bottom edge.
  generate c in 0 to 7 {
    rectangle divider { position: (235 + c * 70, 490), size: (6, 100), color: #f3e9d2,
                        physics { lockPosition: true, bounce: 0.2 } }
  }

  // Discs wait above the frame and drop in turn.
  generate k in 0 to 9 {
    let x = 480 + [-3, 2, -1, 4, -4][k % 5]
    circle disc {
      position: (x, -30 - k * 30)
      radius: 10
      color: [#ff7a59, #5fe0b5, #6cb4ff, #ffd84d][k % 4]
      sequence {
        animate { property: position, to: (x, -30 - k * 30), duration: 0.2 + k * 0.3 }
        physics { bounce: 0.3, duration: 7 }
      }
    }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #101433
  duration: 8

  world {
    gravity: (0, 900)
    bounds: [left, right, bottom]
  }

  // Pegs: row r has r + 1 of them.
  generate r in 0 to 5 {
    generate c in 0 to r {
      rectangle peg { position: (480 + (c - r / 2) * 70, 120 + r * 56), size: (14, 14), color: #e8b44a,
                      physics { lockPosition: true, bounce: 0.3 } }
    }
  }

  // Bins: dividers standing on the bottom edge.
  generate c in 0 to 7 {
    rectangle divider { position: (235 + c * 70, 490), size: (6, 100), color: #f3e9d2,
                        physics { lockPosition: true, bounce: 0.2 } }
  }

  // Discs wait above the frame and drop in turn.
  generate k in 0 to 9 {
    let x = 480 + [-3, 2, -1, 4, -4][k % 5]
    circle disc {
      position: (x, -30 - k * 30)
      radius: 10
      color: [#ff7a59, #5fe0b5, #6cb4ff, #ffd84d][k % 4]
      sequence {
        animate { property: position, to: (x, -30 - k * 30), duration: 0.2 + k * 0.3 }
        physics { bounce: 0.3, duration: 7 }
      }
    }
  }
}
```

The `circle` becomes a `rectangle`, and `radius: 7` becomes `size: (14, 14)`,
the same width. The physics block does not change: a locked rectangle is as
fixed as a locked circle. The discs now strike flat faces and corners instead
of curves, so they bounce off at different angles, take different paths and
end in different bins, and one may even come to rest on top of a square for a
while.
:::

## Recap

- A `world` block, at most one, written directly in `scene`, sets the
  `gravity` for every physics block that has none of its own, and lists the
  edges that are walls in `bounds`. With no `bounds` all four are walls;
  `bounds: []` means none. ([The world](/reference/language/#the-world))
- A body that leaves through an open edge keeps moving, and is hidden and
  removed once it is 800 pixels beyond the scene.
  ([The world](/reference/language/#the-world))
- `lockPosition: true` makes a body that nothing in the simulation moves. Its
  block may hold only `bounce` besides, and it cannot be used in a sequence.
  An `animate` still moves a locked body, and its body follows.
  ([Properties](/reference/language/#properties))
- `spin` starts a body turning, in degrees per second, clockwise when positive.
  `lockRotation: true` stops collisions from turning it. The two cannot be
  used together. ([Properties](/reference/language/#properties))
- A `physics` step in a `sequence` starts a body's simulation later, and needs
  a numeric `duration`. The body exists from the start of the scene, held
  wherever its opening animation puts it. ([Physics](/reference/language/#physics),
  [Sequencing](/reference/language/#sequencing))
