---
title: From animation to physics
summary: Move a body by hand, then let the simulation take it over. With handoff it leaves at the speed your animation gave it, and a sequence can hand it back and forth.
description: Lesson 13 of the Marey course. A body that exists before its physics step and shoves what is in its way, handoff on a position animation, release speed by easing, the handoff rules, and a sequence that animates, simulates and animates again.
minutes: 30
learn:
- Know what a body does while an animation holds it
- Hand a moving body to the simulation with handoff
- Predict its release speed from the easing
- Know the rules handoff keeps, and read its errors
- Animate, simulate and animate again in one sequence
showcase: domino-run
---

In [the last lesson](/learn/world/), "Starting a body later" put a `physics`
step after an `animate` step in a `sequence`, so a body waited and then fell.
That lesson's shelf was held still, so the moment it was let go did not matter.
This lesson is about that moment: what the body does while an animation moves
it, and what speed it has when the simulation takes it over. In the showcase
above, a marble is rolled by an animation and the simulation carries on from
there.

## A body before its physics step

An object with `physics` anywhere in its sequence is a body from the first
moment of the scene. While an `animate` step drives its `position`, the body is
**pinned**: it goes exactly where the animation puts it, and nothing that hits
it can push it off its path. It is still solid, so it shoves whatever is in
the way.

Below, a crate slides along a locked shelf with an `animate` step, and a ball
rests on the shelf in its path. Watch what happens to the ball before the
crate's own physics step begins:

```marey
scene {
  size: (960, 540)
  background: #1b2433
  duration: 4

  // A locked shelf, and a ball resting on it.
  rectangle shelf { position: (400, 300), size: (480, 16), color: #8a5a36, physics { lockPosition: true } }
  circle ball { position: (480, 272), radius: 20, color: #6cb4ff, physics { bounce: 0.3, duration: indefinitely } }

  // A crate slides along the shelf, then its physics step starts.
  rectangle crate {
    position: (200, 262)
    size: (60, 60)
    color: #f2b134
    sequence {
      animate { property: position, to: (610, 262), duration: 1.5, easing: easeInOut }
      physics { bounce: 0.2, duration: 2.4 }
    }
  }
}
```

The crate reaches the ball a little after three quarters of a second and
pushes it along the shelf and off its end at x 640, and the ball falls to the
floor. The ball
cannot slow the crate, because the animation decides where the crate is. At
1.5 seconds the crate's physics step starts and it stays where it stopped,
resting on the shelf. Nothing in the crate's `physics` block made it solid
earlier: being a body at all is what does that.

## Slide, then fall

When the animation ends and the physics step begins, the body is let go. Watch
how the crate below leaves the table:

```marey
scene {
  size: (960, 540)
  background: #1b2433
  duration: 3

  // A table, locked, with its right edge at x 480.
  rectangle table { position: (280, 330), size: (400, 20), color: #8a5a36, physics { lockPosition: true } }

  // Slid along the table and off its edge, then simulated.
  rectangle crate {
    position: (130, 295)
    size: (50, 50)
    color: #f2b134
    sequence {
      animate { property: position, to: (530, 295), duration: 1.5, easing: linear }
      physics { bounce: 0.2, duration: 1.4 }
    }
  }
}
```

The crate slides off the edge at a steady 267 pixels a second, 400 pixels in
1.5 seconds, and then drops straight down from x 530 to the floor. It had
been moving fast, but the speed belonged to the animation. The physics step
starts the body from rest, with only its own `velocity`, which is `(0, 0)`
unless you write one. So a slide that ends in mid-air stops dead and falls.

## handoff

`handoff: true` on a `position` animation carries the speed the animation had
at its end into the simulation. It is the only change from the crate above.
Watch where the crate lands this time:

```marey
scene {
  size: (960, 540)
  background: #1b2433
  duration: 3

  // A table, locked, with its right edge at x 480.
  rectangle table { position: (280, 330), size: (400, 20), color: #8a5a36, physics { lockPosition: true } }

  // Slid along the table and off its edge, then simulated.
  rectangle crate {
    position: (130, 295)
    size: (50, 50)
    color: #f2b134
    sequence {
      animate { property: position, to: (530, 295), duration: 1.5, easing: linear, handoff: true }
      physics { bounce: 0.2, duration: 1.4 }
    }
  }
}
```

The crate leaves the edge still moving right at 267 pixels a second, and
gravity bends its path into an arc. It lands near x 714, about 180 pixels
further right than before. The speed it leaves with is the distance it moved
in the animation's last tick, times the 120 ticks in a second, so its first
tick of free motion covers the same distance as its last animated one: there
is no stall and no jump where the animation ends.

## Release speed follows the easing

The speed comes from the curve, so the easing decides it. With `handoff`,
each easing releases at a fixed multiple of the animation's **average speed**,
which is the distance from where it starts to `to`, divided by its `duration`:

| Easing | Release speed |
|---|---|
| `linear` | 1 × the average |
| `easeIn` | 2 × the average |
| `easeOut` | 0.5 × the average |
| `easeInOut` | 0.5 × the average |

`easeOut` and `easeInOut` would normally arrive at rest and hand over nothing,
so with `handoff` their curves are reshaped to arrive at half the average
speed. Only the arriving end changes: an `easeInOut` still starts from rest.

Both balls below slide 300 pixels in 1.2 seconds, an average of 250 pixels a
second, and both have `handoff`. The red one eases in and the blue one eases
out. Watch how far each one flies:

```marey
scene {
  size: (960, 540)
  background: #1b2433
  duration: 3

  // Two locked tables, one above the other, both ending at x 400.
  rectangle upper { position: (220, 170), size: (360, 16), color: #8a5a36, physics { lockPosition: true } }
  rectangle lower { position: (220, 380), size: (360, 16), color: #8a5a36, physics { lockPosition: true } }

  // The same slide, 300 px in 1.2 s, with two easings.
  circle fast {
    position: (100, 142)
    radius: 20
    color: #ff7a59
    sequence {
      animate { property: position, to: (400, 142), duration: 1.2, easing: easeIn, handoff: true }
      physics { bounce: 0.3, duration: 1.7 }
    }
  }
  circle slow {
    position: (100, 352)
    radius: 20
    color: #6cb4ff
    sequence {
      animate { property: position, to: (400, 352), duration: 1.2, easing: easeOut, handoff: true }
      physics { bounce: 0.3, duration: 1.7 }
    }
  }
}
```

The red ball speeds up all the way to the end of its table and leaves at 500
pixels a second; it lands near the right-hand wall. The blue ball slows down
and leaves at 125; it drops just past the end of its table. Both took the same
time over the same distance. To throw something hard, ease it in; to let it
tip gently over an edge, ease it out.

## The rules handoff keeps

`handoff` hands a speed to a simulation, so it needs one to hand it to. Without
a `physics` block on the same object, there is nothing to receive it, and the
compiler says so:

```marey error=TYPE_HANDOFF_PHYSICS
scene {
  size: (960, 540)
  background: #1b2433
  duration: 3

  rectangle crate {
    position: (130, 295)
    size: (50, 50)
    color: #f2b134
    animate { property: position, to: (530, 295), duration: 1.5, easing: linear, handoff: true }
  }
}
```

The message points at `handoff: true` and asks for a sibling `physics` block.
Put the `animate` in a `sequence` with a `physics` step after it, as in the
samples above, and the crate compiles.

The `physics` block can also sit beside the `animate` instead of after it in a
sequence. Then the simulation runs from the start, the animation holds the body
until it ends, and the handoff happens at that moment:

```marey fragment
animate { property: position, to: (530, 295), duration: 1.5, easing: linear, handoff: true }
physics { bounce: 0.2, duration: indefinitely }
```

The other rules all follow from what handoff is for. Each is a compile error
with its own code:

- It goes on `property: position` only, since only a position has a speed to
  hand over.
- It cannot be used with `loop: true`, because a looping animation never ends,
  so it never hands off.
- The `physics` block that receives it cannot also set `velocity`, because the
  handed-off speed would overwrite it.
- A `physics` block beside the animation with a numeric `duration` must last
  longer than the animation, or the simulation is over before the speed arrives.
- The object cannot start two `physics` blocks, or two position animations, at
  the same time as the handoff, since then which one lets the body go is not
  clear.
- It cannot hand off to a locked body, which the simulation never moves.

A `yoyo` animation can hand off too, but only with the `physics` block beside
it. A step of a `sequence` cannot be a `yoyo`, since it would run for twice its
`duration` and hide when the next step starts, so every handoff written as a
sequence step is a one-way animation:

```marey error=TYPE_SEQ_YOYO
scene {
  size: (960, 540)
  background: #1b2433
  duration: 3

  circle ball {
    position: (200, 300)
    radius: 20
    color: #ff7a59
    sequence {
      animate { property: position, to: (500, 300), duration: 1, easing: easeIn, yoyo: true, handoff: true }
      physics { bounce: 0.3, duration: 1.5 }
    }
  }
}
```

The message suggests the fix: write the return leg as a second `animate` step,
and put `handoff` on that one. A `yoyo` beside its `physics` block finishes
travelling back towards where it started, so it leaves in that direction, and
its release multiples differ from the table above.
[handoff](/reference/language/#handoff) has the full table.

## Animate, simulate, animate again

A sequence can go back and forth between the two as often as you like. An
`animate` step after a `physics` step lifts the freeze, as
[the last lesson](/learn/world/) showed, and takes the body over again. When
that animation ends, the body is back in the simulation. Watch what the ball
below does after its last step:

```marey
scene {
  size: (960, 540)
  background: #1b2433
  duration: 7

  circle ball {
    position: (300, 510)
    radius: 30
    color: #ff7a59
    sequence {
      // Lifted.
      animate { property: position, to: (300, 120), duration: 1, easing: easeOut }
      // Dropped: it falls, bounces, and freezes where it is at 4 s.
      physics { bounce: 0.6, duration: 3 }
      // Carried across and up.
      animate { property: position, to: (660, 120), duration: 1.2, easing: easeInOut }
    }
  }
}
```

The ball is lifted and dropped, bounces, and is still rolling slowly to the
left when its physics step ends at 4 seconds and it freezes. The last step
carries it up to (660, 120). Then that
animation ends, nothing holds the ball any more, and it falls a second time.
Once a body's sequence has reached a `physics` step, an animation that ends
afterwards leaves the body to the simulation, whether or not another
`physics` step comes next. To keep a body where an animation leaves it, end
the sequence with a step that holds it there until the scene is over, as the
showcase does.

## Reading the showcase

Open "Show the source" under the Domino Run player at the top of the page.
A marble rolls down a ruler into a run of thirteen dominoes, the run topples
along a desk and up a staircase of books, and the last domino knocks a red ball
into a cup of tea. Then everything goes back to where it started.

- **The world** has `gravity: (0, 6000)`, six times the default, so the
  72-pixel dominoes fall as fast as small ones do, and `bounds: []`: the desk,
  the books and the ruler are locked bodies, and there are no walls.
- **The marble** is rolled down the ruler by
  `easing: easeIn, handoff: true`, so it leaves the end of the ruler at twice its
  average speed and strikes the first domino near its top.
- **Each domino** is a `Domino` template with a four-step sequence. It is held
  first, for `0.45 + i * 0.15` seconds, so its simulation starts a little before
  the run reaches it. Measured in this scene, every domino starts moving between
  0.16 and 0.47 seconds after its simulation starts. With the hold taken out,
  the dominoes stand still long enough to fall asleep, and the run slows from
  about 0.15 seconds a domino to about half a second. When the dominoes'
  4.5-second physics steps end, it has only reached the first book: the tenth
  domino is part way over, and the last three have not fallen.
- **The red ball** is held on the top book until 2.4 seconds and then
  simulated. The last domino knocks it off the end of the book, and it drops
  into the cup at about 3.2 seconds. The cup is a locked welded group of a base
  and two walls, so it collides as a cup and not as a box, and its china front
  is drawn after the ball, so the ball disappears into the tea. Four drops
  splash up at the moment it goes in.
- **The rewind.** Each domino's physics step lasts 4.5 seconds, the same for
  all of them, and then a `parallel` step animates its position and rotation
  back, so the dominoes stand up 0.15 seconds apart, in the order they fell.
  The marble rolls back up the ruler, and the ball hops out of the cup, each
  with its rotation animated back to 0.
- **The last steps hold.** Every rewound body ends with an `animate` to where
  it already is that lasts past the end of the scene: a domino's is
  `5 - wait`, so its four steps add up to the scene's 10 seconds. Without it,
  the marble would roll down the ruler again, as the ball in the last sample
  fell. On an object whose only motion is its sequence, the sequence starts one
  tick after the scene does, so in the last frame every hold is still running,
  and the last frame matches the first.
- **Everything else** loops on its own: the steam, the stars, the clouds and
  the clock's pendulum all have periods that divide 10.

## Try this

The exercises use a smaller run: a marble, a ruler and eight dominoes on a
desk, each domino held for `0.3 + i * 0.15` seconds.

:::try Roll the ball faster
Make the marble hit the first domino harder and sooner, so the whole run falls
earlier.

```marey
scene {
  size: (960, 540)
  background: #14242a
  duration: 5

  world { gravity: (0, 6000), bounds: [] }

  // The desk, and a ruler leaning down to it, both locked.
  rectangle desk  { position: (480, 490), size: (1000, 100), color: #6b4428, physics { lockPosition: true } }
  rectangle ruler { position: (7.2, 347.8), size: (210, 8), rotation: 24, color: #d9c27a, physics { lockPosition: true } }

  // The marble rolls down the ruler and is handed to the simulation.
  circle marble {
    position: (18.6, 333.8)
    radius: 13
    color: #3e8fd6
    sequence {
      animate { property: position, to: (110, 375), duration: 0.6, easing: easeIn, handoff: true }
      physics { bounce: 0.2, duration: 4 }
    }
  }

  // Eight dominoes, each held until a little before the run reaches it.
  let gap = 52
  generate i in 0 to 7 {
    rectangle domino {
      position: (134 + i * gap, 404)
      size: (10, 72)
      color: #f2a145
      sequence {
        animate { property: position, to: (134 + i * gap, 404), duration: 0.3 + i * 0.15 }
        physics { bounce: 0.4, duration: 4 }
      }
    }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #14242a
  duration: 5

  world { gravity: (0, 6000), bounds: [] }

  // The desk, and a ruler leaning down to it, both locked.
  rectangle desk  { position: (480, 490), size: (1000, 100), color: #6b4428, physics { lockPosition: true } }
  rectangle ruler { position: (7.2, 347.8), size: (210, 8), rotation: 24, color: #d9c27a, physics { lockPosition: true } }

  // The marble rolls down the ruler and is handed to the simulation.
  circle marble {
    position: (18.6, 333.8)
    radius: 13
    color: #3e8fd6
    sequence {
      animate { property: position, to: (110, 375), duration: 0.35, easing: easeIn, handoff: true }
      physics { bounce: 0.2, duration: 4 }
    }
  }

  // Eight dominoes, each held until a little before the run reaches it.
  let gap = 52
  generate i in 0 to 7 {
    rectangle domino {
      position: (134 + i * gap, 404)
      size: (10, 72)
      color: #f2a145
      sequence {
        animate { property: position, to: (134 + i * gap, 404), duration: 0.3 + i * 0.15 }
        physics { bounce: 0.4, duration: 4 }
      }
    }
  }
}
```

The roll is about 100 pixels long. At 0.6 seconds its average speed is about
167 pixels a second, so `easeIn` releases the marble at about 334; at 0.35
seconds the average is about 287 and the release about 573. The first domino
starts to fall at 0.40 seconds instead of 0.65, and the last one at 1.5
seconds instead of 2. The run still works because every domino's hold ends
before the run reaches it. At 0.2 seconds the roll is too quick: the marble
reaches the first domino before its hold ends, strikes it while it is still
pinned, and no domino falls at all.
:::

:::try Space the dominoes wider until the run breaks
Change `gap` until one domino falls without knocking over the next.

```marey
scene {
  size: (960, 540)
  background: #14242a
  duration: 5

  world { gravity: (0, 6000), bounds: [] }

  // The desk, and a ruler leaning down to it, both locked.
  rectangle desk  { position: (480, 490), size: (1000, 100), color: #6b4428, physics { lockPosition: true } }
  rectangle ruler { position: (7.2, 347.8), size: (210, 8), rotation: 24, color: #d9c27a, physics { lockPosition: true } }

  // The marble rolls down the ruler and is handed to the simulation.
  circle marble {
    position: (18.6, 333.8)
    radius: 13
    color: #3e8fd6
    sequence {
      animate { property: position, to: (110, 375), duration: 0.6, easing: easeIn, handoff: true }
      physics { bounce: 0.2, duration: 4 }
    }
  }

  // Eight dominoes, each held until a little before the run reaches it.
  let gap = 52
  generate i in 0 to 7 {
    rectangle domino {
      position: (134 + i * gap, 404)
      size: (10, 72)
      color: #f2a145
      sequence {
        animate { property: position, to: (134 + i * gap, 404), duration: 0.3 + i * 0.15 }
        physics { bounce: 0.4, duration: 4 }
      }
    }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #14242a
  duration: 5

  world { gravity: (0, 6000), bounds: [] }

  // The desk, and a ruler leaning down to it, both locked.
  rectangle desk  { position: (480, 490), size: (1000, 100), color: #6b4428, physics { lockPosition: true } }
  rectangle ruler { position: (7.2, 347.8), size: (210, 8), rotation: 24, color: #d9c27a, physics { lockPosition: true } }

  // The marble rolls down the ruler and is handed to the simulation.
  circle marble {
    position: (18.6, 333.8)
    radius: 13
    color: #3e8fd6
    sequence {
      animate { property: position, to: (110, 375), duration: 0.6, easing: easeIn, handoff: true }
      physics { bounce: 0.2, duration: 4 }
    }
  }

  // Eight dominoes, each held until a little before the run reaches it.
  let gap = 80
  generate i in 0 to 7 {
    rectangle domino {
      position: (134 + i * gap, 404)
      size: (10, 72)
      color: #f2a145
      sequence {
        animate { property: position, to: (134 + i * gap, 404), duration: 0.3 + i * 0.15 }
        physics { bounce: 0.4, duration: 4 }
      }
    }
  }
}
```

At `gap = 80` the first domino falls flat and only touches the second, which
barely moves, and the run stops there. A domino is 72 pixels tall and pivots on
its front corner, so a gap close to its height leaves it almost lying down by
the time it reaches the next one, with little left to push with. In this scene
the run works at 72, and from 76 it stops at the second domino in this way.

At 74 it breaks for a second reason. The weaker pushes make the run slower, but
the holds still end 0.15 seconds apart, so the run falls behind them. The
fifth domino's hold ends 1.7 seconds before the run reaches it, it has stood
still long enough to fall asleep, and in this scene the slow push it gets
moves it a little and leaves it standing. The first four fall.
:::

:::try Add a second run triggered by the first
Put a book on the desk where the first run ends, and stand a second run of
dominoes on it, so that the last domino of the first run knocks over the
first of the second.

```marey
scene {
  size: (960, 540)
  background: #14242a
  duration: 5

  world { gravity: (0, 6000), bounds: [] }

  // The desk, and a ruler leaning down to it, both locked.
  rectangle desk  { position: (480, 490), size: (1000, 100), color: #6b4428, physics { lockPosition: true } }
  rectangle ruler { position: (7.2, 347.8), size: (210, 8), rotation: 24, color: #d9c27a, physics { lockPosition: true } }

  // The marble rolls down the ruler and is handed to the simulation.
  circle marble {
    position: (18.6, 333.8)
    radius: 13
    color: #3e8fd6
    sequence {
      animate { property: position, to: (110, 375), duration: 0.6, easing: easeIn, handoff: true }
      physics { bounce: 0.2, duration: 4 }
    }
  }

  // Eight dominoes, each held until a little before the run reaches it.
  let gap = 52
  generate i in 0 to 7 {
    rectangle domino {
      position: (134 + i * gap, 404)
      size: (10, 72)
      color: #f2a145
      sequence {
        animate { property: position, to: (134 + i * gap, 404), duration: 0.3 + i * 0.15 }
        physics { bounce: 0.4, duration: 4 }
      }
    }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #14242a
  duration: 5

  world { gravity: (0, 6000), bounds: [] }

  // The desk, and a ruler leaning down to it, both locked.
  rectangle desk  { position: (480, 490), size: (1000, 100), color: #6b4428, physics { lockPosition: true } }
  rectangle ruler { position: (7.2, 347.8), size: (210, 8), rotation: 24, color: #d9c27a, physics { lockPosition: true } }

  // The marble rolls down the ruler and is handed to the simulation.
  circle marble {
    position: (18.6, 333.8)
    radius: 13
    color: #3e8fd6
    sequence {
      animate { property: position, to: (110, 375), duration: 0.6, easing: easeIn, handoff: true }
      physics { bounce: 0.2, duration: 4 }
    }
  }

  // Eight dominoes, each held until a little before the run reaches it.
  let gap = 52
  generate i in 0 to 7 {
    rectangle domino {
      position: (134 + i * gap, 404)
      size: (10, 72)
      color: #f2a145
      sequence {
        animate { property: position, to: (134 + i * gap, 404), duration: 0.3 + i * 0.15 }
        physics { bounce: 0.4, duration: 4 }
      }
    }
  }

  // A second run, on a book, where the first one ends.
  rectangle book { position: (720, 433), size: (380, 14), color: #2e5947, physics { lockPosition: true } }
  generate j in 0 to 5 {
    rectangle second {
      position: (550 + j * gap, 390)
      size: (10, 72)
      color: #8577de
      sequence {
        animate { property: position, to: (550 + j * gap, 390), duration: 1.8 + j * 0.2 }
        physics { bounce: 0.4, duration: 4 }
      }
    }
  }
}
```

The book is a locked rectangle 14 pixels thick, from x 530 to 910, so its top
is at y 426, and the second run stands on it at y 390, one `gap` on from the
last domino of the first. The last orange domino falls at about 2 seconds and
knocks over the first violet one, and the violet run falls to the end of the
book by about 3.3 seconds. Their holds are `1.8 + j * 0.2`
seconds, 0.2 seconds apart, so each one's simulation starts a little before
the run reaches it.
:::

## Recap

- A body exists from the start of the scene. While an `animate` step moves it,
  it is pinned to the animation's path and shoves whatever is in the way.
  ([Physics](/reference/language/#physics),
  [Animation and physics together](/reference/language/#animation-and-physics-together))
- Without `handoff`, a body starts its physics step from rest, apart from its
  own `velocity`. With `handoff: true` on a `position` animation, it leaves at
  the speed the animation had over its last tick.
  ([handoff](/reference/language/#handoff), [Properties](/reference/language/#properties))
- The release speed is a multiple of the average speed: 1 for `linear`, 2 for
  `easeIn`, 0.5 for `easeOut` and `easeInOut`.
  ([handoff](/reference/language/#handoff))
- `handoff` needs a `physics` block on the same object, works on `position`
  only, cannot loop, and the receiving block cannot set `velocity`.
  ([handoff](/reference/language/#handoff))
- An `animate` step after a `physics` step lifts the freeze, and when that
  animation ends the body is back in the simulation.
  ([When duration expires](/reference/language/#when-duration-expires),
  [Animation and physics together](/reference/language/#animation-and-physics-together))
