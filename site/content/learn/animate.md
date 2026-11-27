---
title: Animate
summary: Move, turn, grow and fade a shape with animate, shape each motion with an easing, and run several animations on one shape at once.
description: Lesson 3 of the Marey course. The animate block in full, the five properties it can change, choosing a starting value with from, the five easings including spring, and several animations running at once.
minutes: 20
learn:
- Animate position, rotation, scale and alpha, starting from the value a shape already has
- Scale a shape by one number or by a separate amount in each direction
- Name a starting value with from instead of declaring it on the shape
- Choose how a motion speeds up and slows down with easing, including a spring that overshoots
- Run several animations on one shape at the same time
showcase: easing-race
---

[Your first scene](/learn/first-scene/) moved a ball with an `animate` block
that had three properties: `property`, `to` and `duration`. This lesson
completes that block. It covers what else can be animated, how to shape the
speed of a motion, and what happens when one shape has more than one `animate`.

## An animation starts where the shape is

An `animate` block names the property to change, the value to end at and how
many seconds to take. It takes its starting value from the shape unless you name one. Watch where the card
comes from:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  // The card's own position is off the left edge of the frame.
  rectangle card {
    position: (-100, 270)
    size: (160, 100)
    color: #e4553b
    animate { property: position, to: (480, 270), duration: 2 }
  }
}
```

The card slides in from outside the frame. Its `position`, `(-100, 270)`, is
where the animation starts, and `to` is where it ends. To choose a starting
point you can set the property itself, or name the start in the animation with
`from`, which the next section covers.

An `animate` block accepts more properties than these three. Four of them,
`delay`, `loop`, `yoyo` and `handoff`, come in later lessons.

## Choosing the start: from

Setting `position: (-100, 270)` makes the card's resting place the place it
begins. Often you want the opposite: the shape declared where it ends up, and
the animation saying where it comes from. `from` does that. It takes the same
kind of value as `to`.

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  // The card is declared where it rests. `from` is where it comes in.
  rectangle card {
    position: (480, 270)
    size: (160, 100)
    color: #e4553b
    animate { property: position, from: (-100, 270), to: (480, 270), duration: 2 }
  }

  // A fade-in without declaring the shape invisible.
  circle moon {
    position: (800, 120)
    radius: 40
    color: #f3ead7
    animate { property: alpha, from: 0, to: 1, duration: 2 }
  }
}
```

The card and the moon read as they look in the last frame, and `from` is the
only thing that makes them start somewhere else. Everything that checks `to`
checks `from` the same way: a `from` of the wrong kind, or a negative `scale`,
is an error.

:::note
`from` needs `marey-lang` 0.8.0 or later. Version 0.7.0, the one the rest of
this site documents, does not have it and rejects the property.
:::

## Five properties

Only five properties can be animated: `position`, `rotation`, `scale`, `alpha`
and `color`. Anything else is an error that names the five:

```marey error=TYPE_ANIM_PROP
scene {
  size: (960, 540)
  duration: 2

  circle ball {
    position: (480, 270)
    radius: 40
    animate { property: radius, to: 80, duration: 2 }
  }
}
```

To make a circle bigger, animate its `scale`, which the section after next
covers. The next three sections take `rotation`, `scale` and `alpha` in turn.
The fifth, `color`, has a lesson of its own later in the course, lesson 7.

## Turning: rotation

`rotation` takes a number of degrees for `to`, and, as in
[the last lesson](/learn/shapes/), a positive angle is clockwise. The shape
turns about its pivot.

Both needles below end at 90 degrees, pointing right. Look at how far each one
turns to get there:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  circle dialA { position: (320, 270), radius: 120, color: #263a5c }
  circle dialB { position: (640, 270), radius: 120, color: #263a5c }

  // Each needle stands on its pivot, the dial's centre,
  // with origin (0.5, 1).
  // Needle A starts at rotation 0, pointing up.
  polygon needleA { position: (320, 270), origin: (0.5, 1), color: #f1ae79
                    points: [(0, -100), (8, 0), (-8, 0)]
                    animate { property: rotation, to: 90, duration: 2 } }

  // Needle B starts at rotation -90, pointing left.
  polygon needleB { position: (640, 270), origin: (0.5, 1), color: #f1ae79, rotation: -90
                    points: [(0, -100), (8, 0), (-8, 0)]
                    animate { property: rotation, to: 90, duration: 2 } }

  circle hubA { position: (320, 270), radius: 8, color: #fbf3e4 }
  circle hubB { position: (640, 270), radius: 8, color: #fbf3e4 }
  text labelA { position: (320, 440), content: "rotation 0 to 90", fontSize: 18, color: #fbf3e4 }
  text labelB { position: (640, 440), content: "rotation -90 to 90", fontSize: 18, color: #fbf3e4 }
}
```

Needle A turns a quarter of a circle and needle B half a circle, in the same
two seconds, so B moves twice as fast. `to` is the angle to end at, not an
amount to add: each needle turns through the difference between the angle it
has and the one it is given.

`to` must suit the property. `rotation` takes a single number, so a point is
an error:

```marey error=TYPE_ANIM_MISMATCH
scene {
  size: (960, 540)
  duration: 2

  rectangle bar {
    position: (480, 270)
    size: (200, 20)
    animate { property: rotation, to: (90, 0), duration: 2 }
  }
}
```

## Growing: scale

`scale` multiplies a shape's size. It is `1` unless you set it, and like
`rotation` it acts about the pivot. Its `to` can be one number, which scales
both directions, or a point, which scales x and y separately.

Watch which part of each shape stays where it is:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  line ground { position: (480, 400), points: [(-420, 0), (420, 0)], thickness: 2, color: #fbf3e4, alpha: 0.5 }

  // One number: both directions grow by the same amount.
  rectangle grow { position: (200, 280), size: (100, 100), color: #2f8a94
                   animate { property: scale, to: 1.6, duration: 2 } }

  // A point: twice as wide and half as tall.
  rectangle stretch { position: (480, 280), size: (100, 100), color: #e4553b
                      animate { property: scale, to: (2, 0.5), duration: 2 } }

  // This bar stands on the line with origin (0.5, 1),
  // and starts with no height at all.
  rectangle bar { position: (760, 400), origin: (0.5, 1), size: (80, 220), color: #efe0c4
                  scale: (1, 0)
                  animate { property: scale, to: (1, 1), duration: 2 } }
}
```

The first two squares keep their centres, their pivot, and grow or stretch
around them. The bar's pivot is the middle of its bottom edge, so it grows
upwards out of the line. It starts at `scale: (1, 0)`, full width and no
height, and that is the value its animation starts from. A scale of zero is
allowed, which is how a shape grows from nothing.

A negative scale is not allowed, in a shape's own `scale` or in a `to`.
Mirroring a shape by scaling it past zero is not something the language
supports:

```marey error=TYPE_INVALID_SCALE
scene {
  size: (960, 540)
  duration: 2

  rectangle card {
    position: (480, 270)
    size: (160, 100)
    animate { property: scale, to: (-1, 1), duration: 2 }
  }
}
```

The reference states one more limit on zero: a shape that takes part in
physics may not have a zero scale. [Physics is lesson 11](/learn/physics/).

## Fading: alpha

`alpha` takes a number from 0 to 1, as in the last lesson. Animating it fades a
shape out or in. Here a sun fades out while a moon, in the same place, fades
in:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  // Solid by default, fading to nothing.
  circle sun  { position: (480, 250), radius: 90, color: #ffc46b
                animate { property: alpha, to: 0, duration: 3 } }

  // Declared invisible, so its fade starts from 0.
  circle moon { position: (480, 250), radius: 90, color: #e9e4d0, alpha: 0
                animate { property: alpha, to: 1, duration: 3 } }

  rectangle sea { position: (480, 435), size: (960, 210), color: #1c2a52 }
}
```

Halfway through, both circles are partly see-through, and the one you see is a
mix of the two. A fade-in is written the way the moon is: declare `alpha: 0`,
so that is where the animation starts, and animate to 1. A shape at alpha 0 is
still in the scene, only invisible.

## Easing: how the speed changes

So far every animation has started slowly and slowed down again before it
stopped. That is the default **easing**: the rule for how the animation's speed
changes between its start and its end. There are five, written as words, not
strings. The first four are these:

- `linear`: the same speed from start to end.
- `easeIn`: starts slowly and speeds up, so it arrives at speed.
- `easeOut`: starts fast and slows down to a stop.
- `easeInOut`: starts slowly, speeds up, and slows down again. This is the
  default when you write no `easing`.

All four balls below cross the same distance in the same three seconds. Watch
which one is ahead halfway across:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  line start  { position: (200, 270), points: [(0, -210), (0, 210)], thickness: 2, color: #fbf3e4, alpha: 0.4 }
  line finish { position: (800, 270), points: [(0, -210), (0, 210)], thickness: 2, color: #fbf3e4, alpha: 0.4 }

  text nameA { position: (100, 120), content: "linear",    fontSize: 18, color: #fbf3e4 }
  text nameB { position: (100, 220), content: "easeIn",    fontSize: 18, color: #fbf3e4 }
  text nameC { position: (100, 320), content: "easeOut",   fontSize: 18, color: #fbf3e4 }
  text nameD { position: (100, 420), content: "easeInOut", fontSize: 18, color: #fbf3e4 }

  circle ballA { position: (200, 120), radius: 22, color: #f3ead7
                 animate { property: position, to: (800, 120), duration: 3, easing: linear } }
  circle ballB { position: (200, 220), radius: 22, color: #ffd36e
                 animate { property: position, to: (800, 220), duration: 3, easing: easeIn } }
  circle ballC { position: (200, 320), radius: 22, color: #7fe0cf
                 animate { property: position, to: (800, 320), duration: 3, easing: easeOut } }
  circle ballD { position: (200, 420), radius: 22, color: #b9c3ff
                 animate { property: position, to: (800, 420), duration: 3, easing: easeInOut } }
}
```

They start together and finish together; only the speed along the way
differs. The `easeOut` ball shoots ahead and creeps over the line, and the
`easeIn` ball creeps away and is still speeding up when it crosses. The
`linear` ball is steady, and the `easeInOut` ball, the default, is slow at both
ends.

Easing applies to every property, not only to `position`: a `linear` turn
spins at an even rate, and an `easeOut` grow swells quickly and then settles.

An easing is a word, like the `fit` values in the last lesson, so quoting it
does not compile:

```marey error
scene {
  size: (960, 540)
  duration: 3

  circle ball {
    position: (200, 270)
    radius: 22
    animate { property: position, to: (800, 270), duration: 3, easing: "easeIn" }
  }
}
```

### A spring

The fifth easing, `spring`, is the one that does not simply arrive. It goes
past `to`, swings back, and settles on it exactly when the `duration` ends. The
`bounce` property says how far it overshoots: `0` settles with no overshoot,
`0.9` swings the longest, and `0.25` is the default.

Both circles below grow from `0.4` to full size in the same 0.8 seconds. The
left one eases out, and the right one is a spring:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 2

  circle plain {
    position: (300, 270)
    radius: 80
    color: #7fe0cf
    animate { property: scale, from: 0.4, to: 1, duration: 0.8, easing: easeOut }
  }

  circle springy {
    position: (660, 270)
    radius: 80
    color: #ffd36e
    animate { property: scale, from: 0.4, to: 1, duration: 0.8, easing: spring, bounce: 0.35 }
  }
}
```

The spring circle swells past full size and rocks back to it, and both have
stopped by the same tick. A spring is a curve over the `duration`, not a
simulation, so it never runs late. The cost of the overshoot is that a spring
cannot ease a `scale` to a value near zero, since the circle would be asked to
go below nothing: the renderer holds a scale spring at zero or more and an
`alpha` spring between `0` and `1`.

:::note
`easing: spring` and `bounce` need `marey-lang` 0.8.0 or later. Version 0.7.0
does not have them and rejects both.
:::

## Several at once

A shape can have more than one `animate` block. All of them start together
when the scene starts, and each runs for its own `duration`. A second block
does not wait for the first.

The crate below slides for three seconds and turns for one and a half. Watch
when it stops turning:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  rectangle crate {
    position: (180, 300)
    size: (90, 90)
    color: #e4553b
    animate { property: position, to: (780, 300), duration: 3 }
    animate { property: rotation, to: 360, duration: 1.5 }
  }
}
```

The crate makes one full turn while it covers the first half of the way, then
slides the rest of the way without turning. Both animations started at zero;
the turn simply finished first. [Lesson 6](/learn/sequence/) shows how to make animations run one
after another instead.

## Reading the showcase

Open "Show the source" under the Easing Race player at the top of the page:

- **The runners** each carry one `animate` on `position`, all with the same
  `to` distance, 640 pixels, and the same `duration: 2`. Only the `easing`
  differs.
- **The trails** are seven copies of each runner, faint circles that start on
  the start line with it. Each copy has the runner's easing and duration but
  a nearer `to`: the place the runner reaches an eighth of the way through the
  race, two eighths, and so on. At the end they show where the runner was at
  each eighth of the two seconds. The `linear` copies are evenly spaced, on the
  faint lines every 80 pixels; the others bunch up where their runner was
  slow.
- **The glow and the dark rim** under each runner are two more circles with
  the same move as the runner, so the three travel as one.
- **The curve** beside each lane's name is a `line` through the same eighths
  as the trail: across is time, 3 pixels per eighth, and up is the fraction of
  the distance covered, 16 pixels for all of it. `easeIn`'s curve hugs the
  bottom and climbs late; `easeOut`'s climbs at once and levels off.
- **The clock** on the scoreboard is a bar with `origin: (0, 0.5)` and
  `scale: (0, 1)` that grows to `(1, 1)` with `linear` easing, so it fills
  from its left end at an even rate.
- **The flags** grow from `scale: (1, 0)` to `(1, 1)` with `easeIn` over the
  same two seconds. Their pivot is 72 pixels below the lane, hidden behind the
  lane drawn after them, and easeIn keeps the growth slow at first, so a flag only
  appears above its lane in the last half second, as the runners arrive. The
  next lesson adds `delay`, which is the direct way to start an animation
  later.

## Try this

Each exercise starts from a small version of the race: four runners and no
trails.

:::try Everyone on the same easing
Give all four runners `easing: easeOut`. Before you run it, predict what the
four will look like as they cross.

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  line start  { position: (200, 270), points: [(0, -230), (0, 230)], thickness: 2, color: #fbf3e4, alpha: 0.4 }
  line finish { position: (800, 270), points: [(0, -230), (0, 230)], thickness: 2, color: #fbf3e4, alpha: 0.4 }

  text nameA { position: (100, 90),  content: "linear",    fontSize: 18, color: #f3ead7 }
  text nameB { position: (100, 180), content: "easeIn",    fontSize: 18, color: #ffd36e }
  text nameC { position: (100, 270), content: "easeOut",   fontSize: 18, color: #7fe0cf }
  text nameD { position: (100, 360), content: "easeInOut", fontSize: 18, color: #b9c3ff }

  circle runnerA { position: (200, 90),  radius: 20, color: #f3ead7
                   animate { property: position, to: (800, 90),  duration: 2, easing: linear } }
  circle runnerB { position: (200, 180), radius: 20, color: #ffd36e
                   animate { property: position, to: (800, 180), duration: 2, easing: easeIn } }
  circle runnerC { position: (200, 270), radius: 20, color: #7fe0cf
                   animate { property: position, to: (800, 270), duration: 2, easing: easeOut } }
  circle runnerD { position: (200, 360), radius: 20, color: #b9c3ff
                   animate { property: position, to: (800, 360), duration: 2, easing: easeInOut } }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  line start  { position: (200, 270), points: [(0, -230), (0, 230)], thickness: 2, color: #fbf3e4, alpha: 0.4 }
  line finish { position: (800, 270), points: [(0, -230), (0, 230)], thickness: 2, color: #fbf3e4, alpha: 0.4 }

  // Every label now says easeOut, because every runner uses it.
  text nameA { position: (100, 90),  content: "easeOut", fontSize: 18, color: #f3ead7 }
  text nameB { position: (100, 180), content: "easeOut", fontSize: 18, color: #ffd36e }
  text nameC { position: (100, 270), content: "easeOut", fontSize: 18, color: #7fe0cf }
  text nameD { position: (100, 360), content: "easeOut", fontSize: 18, color: #b9c3ff }

  circle runnerA { position: (200, 90),  radius: 20, color: #f3ead7
                   animate { property: position, to: (800, 90),  duration: 2, easing: easeOut } }
  circle runnerB { position: (200, 180), radius: 20, color: #ffd36e
                   animate { property: position, to: (800, 180), duration: 2, easing: easeOut } }
  circle runnerC { position: (200, 270), radius: 20, color: #7fe0cf
                   animate { property: position, to: (800, 270), duration: 2, easing: easeOut } }
  circle runnerD { position: (200, 360), radius: 20, color: #b9c3ff
                   animate { property: position, to: (800, 360), duration: 2, easing: easeOut } }
}
```

The four runners move as one upright column. With the same start, the same
`to` distance, the same duration and the same easing, nothing is left to tell
them apart.
:::

:::try Slow one lane down
Make the `easeIn` runner take three seconds instead of two. Where is it when
the others finish?

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  line start  { position: (200, 270), points: [(0, -230), (0, 230)], thickness: 2, color: #fbf3e4, alpha: 0.4 }
  line finish { position: (800, 270), points: [(0, -230), (0, 230)], thickness: 2, color: #fbf3e4, alpha: 0.4 }

  text nameA { position: (100, 90),  content: "linear",    fontSize: 18, color: #f3ead7 }
  text nameB { position: (100, 180), content: "easeIn",    fontSize: 18, color: #ffd36e }
  text nameC { position: (100, 270), content: "easeOut",   fontSize: 18, color: #7fe0cf }
  text nameD { position: (100, 360), content: "easeInOut", fontSize: 18, color: #b9c3ff }

  circle runnerA { position: (200, 90),  radius: 20, color: #f3ead7
                   animate { property: position, to: (800, 90),  duration: 2, easing: linear } }
  circle runnerB { position: (200, 180), radius: 20, color: #ffd36e
                   animate { property: position, to: (800, 180), duration: 2, easing: easeIn } }
  circle runnerC { position: (200, 270), radius: 20, color: #7fe0cf
                   animate { property: position, to: (800, 270), duration: 2, easing: easeOut } }
  circle runnerD { position: (200, 360), radius: 20, color: #b9c3ff
                   animate { property: position, to: (800, 360), duration: 2, easing: easeInOut } }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  line start  { position: (200, 270), points: [(0, -230), (0, 230)], thickness: 2, color: #fbf3e4, alpha: 0.4 }
  line finish { position: (800, 270), points: [(0, -230), (0, 230)], thickness: 2, color: #fbf3e4, alpha: 0.4 }

  text nameA { position: (100, 90),  content: "linear",    fontSize: 18, color: #f3ead7 }
  text nameB { position: (100, 180), content: "easeIn",    fontSize: 18, color: #ffd36e }
  text nameC { position: (100, 270), content: "easeOut",   fontSize: 18, color: #7fe0cf }
  text nameD { position: (100, 360), content: "easeInOut", fontSize: 18, color: #b9c3ff }

  circle runnerA { position: (200, 90),  radius: 20, color: #f3ead7
                   animate { property: position, to: (800, 90),  duration: 2, easing: linear } }
  // Three seconds now. The scene lasts four, so there is time
  // to see it arrive.
  circle runnerB { position: (200, 180), radius: 20, color: #ffd36e
                   animate { property: position, to: (800, 180), duration: 3, easing: easeIn } }
  circle runnerC { position: (200, 270), radius: 20, color: #7fe0cf
                   animate { property: position, to: (800, 270), duration: 2, easing: easeOut } }
  circle runnerD { position: (200, 360), radius: 20, color: #b9c3ff
                   animate { property: position, to: (800, 360), duration: 2, easing: easeInOut } }
}
```

When the other three cross the line at two seconds, the `easeIn` runner is
still short of halfway, because it has a full second left and it is slow at
the start. It crosses a second after them, at its fastest.
:::

:::try A fifth lane that spins
Add a fifth lane at y = 450, labelled `spin`, whose runner is a square that
turns as it runs. It should make two whole turns and finish turning exactly
as it crosses the line.

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  line start  { position: (200, 270), points: [(0, -230), (0, 230)], thickness: 2, color: #fbf3e4, alpha: 0.4 }
  line finish { position: (800, 270), points: [(0, -230), (0, 230)], thickness: 2, color: #fbf3e4, alpha: 0.4 }

  text nameA { position: (100, 90),  content: "linear",    fontSize: 18, color: #f3ead7 }
  text nameB { position: (100, 180), content: "easeIn",    fontSize: 18, color: #ffd36e }
  text nameC { position: (100, 270), content: "easeOut",   fontSize: 18, color: #7fe0cf }
  text nameD { position: (100, 360), content: "easeInOut", fontSize: 18, color: #b9c3ff }

  circle runnerA { position: (200, 90),  radius: 20, color: #f3ead7
                   animate { property: position, to: (800, 90),  duration: 2, easing: linear } }
  circle runnerB { position: (200, 180), radius: 20, color: #ffd36e
                   animate { property: position, to: (800, 180), duration: 2, easing: easeIn } }
  circle runnerC { position: (200, 270), radius: 20, color: #7fe0cf
                   animate { property: position, to: (800, 270), duration: 2, easing: easeOut } }
  circle runnerD { position: (200, 360), radius: 20, color: #b9c3ff
                   animate { property: position, to: (800, 360), duration: 2, easing: easeInOut } }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  line start  { position: (200, 270), points: [(0, -230), (0, 230)], thickness: 2, color: #fbf3e4, alpha: 0.4 }
  line finish { position: (800, 270), points: [(0, -230), (0, 230)], thickness: 2, color: #fbf3e4, alpha: 0.4 }

  text nameA { position: (100, 90),  content: "linear",    fontSize: 18, color: #f3ead7 }
  text nameB { position: (100, 180), content: "easeIn",    fontSize: 18, color: #ffd36e }
  text nameC { position: (100, 270), content: "easeOut",   fontSize: 18, color: #7fe0cf }
  text nameD { position: (100, 360), content: "easeInOut", fontSize: 18, color: #b9c3ff }
  text nameE { position: (100, 450), content: "spin",      fontSize: 18, color: #f1ae79 }

  circle runnerA { position: (200, 90),  radius: 20, color: #f3ead7
                   animate { property: position, to: (800, 90),  duration: 2, easing: linear } }
  circle runnerB { position: (200, 180), radius: 20, color: #ffd36e
                   animate { property: position, to: (800, 180), duration: 2, easing: easeIn } }
  circle runnerC { position: (200, 270), radius: 20, color: #7fe0cf
                   animate { property: position, to: (800, 270), duration: 2, easing: easeOut } }
  circle runnerD { position: (200, 360), radius: 20, color: #b9c3ff
                   animate { property: position, to: (800, 360), duration: 2, easing: easeInOut } }

  // Two animate blocks with the same duration and easing, so the
  // turning and the running start and end together.
  // Two whole turns is 720 degrees.
  rectangle runnerE {
    position: (200, 450)
    size: (36, 36)
    color: #f1ae79
    animate { property: position, to: (800, 450), duration: 2, easing: linear }
    animate { property: rotation, to: 720, duration: 2, easing: linear }
  }
}
```

The square turns at an even rate all the way across. Give its rotation a
different easing from its position, and the turns bunch up at one end of the
lane while the square still crosses at its own pace.
:::

## Recap

- An `animate` block needs `property`, `to` and `duration`. It starts from the
  value the shape already has, unless `from` names another one.
  ([Animation](/reference/language/#animation),
  [from](/reference/language/#from))
- Five properties can be animated: `position`, `rotation`, `scale`, `alpha` and
  `color`, and `to` must suit the property.
  ([Animation](/reference/language/#animation))
- `scale` takes a number for both directions or a point for each. It acts about
  the pivot, zero is allowed and a negative value is not.
  ([Scene model](/reference/language/#scene-model))
- `easing` is `linear`, `easeIn`, `easeOut`, `easeInOut` or `spring`, written
  as a word; `easeInOut` is the default. `bounce` tunes a spring and means
  nothing to the others. ([Animation](/reference/language/#animation),
  [spring](/reference/language/#spring))
- Every `animate` block on a shape starts when the scene starts, and they run
  at the same time. ([Animation](/reference/language/#animation))
