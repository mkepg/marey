---
title: Repetition: generate
summary: Write a shape once and let generate make a copy for every element of a list or every number in a range, each placed, sized, coloured and timed from its element and its index.
description: Lesson 9 of the Marey course. generate over a list and over a range, the index, a let inside the loop, nested generate, how generated objects are named, radial layouts with sin and cos, and staggered timing from the index.
minutes: 25
learn:
- Make one object for every element of a list, or every number in a range
- Place, size and colour each copy from its element and its index
- Fill a grid with one generate inside another
- Read the names generated objects get, and keep them from colliding
- Put copies out of step with a delay worked out from the index
showcase: ripple
---

In the last lesson, five bars were written out in full: the same rectangle
five times, with only an index changed. This lesson writes a shape
once and lets `generate` make the copies. The showcase above has 336 lights,
and its source writes one.

## One copy per element

`generate x in list { … }` repeats the block inside it once for every element
of the list. Each time round, the name before `in`, here `x`, holds that
element, so the block can use it like any `let` name.

One circle is written below, and the list has five numbers. Count the lamps,
then add a sixth number to the list, such as `900`:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  generate x in [120, 300, 480, 660, 840] {
    circle lamp {
      position: (x, 270), radius: 40, color: #ffc46b
      animate { property: scale, to: 1.25, duration: 1, loop: true, yoyo: true }
    }
  }
}
```

There are five lamps, one for each number, and each copy took its x from its
own number. With `900` added, a sixth lamp appears at the right. The copies
are ordinary objects: each has its own `animate`, and because all five were
written from one block, they pulse together.

## The index

A second name, after a comma, holds the element's **index**: its position in
the list, counting from 0, as indexing does. `generate h, i in heights` gives
`h` the height and `i` its place in the line.

The block can hold more than one object, and each pass makes a copy of every
one. Below, each pass makes a bar and its label. The bars take their height and
colour from `h`; the bars and the labels take their x from `i`, and each label
reads its day from a second list with the same `i`. Compare this with the five
bars written out in the last lesson:

```marey
let heights = [120, 260, 180, 300, 90, 210]
let days    = ["MON", "TUE", "WED", "THU", "FRI", "SAT"]
let base    = 440
let step    = 800 / length(heights)

scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  line rule { position: (480, base), points: [(-400, 0), (400, 0)], thickness: 2, color: #f2e8d5, alpha: 0.4 }

  generate h, i in heights {
    rectangle bar {
      position: (80 + step * (i + 0.5), base), origin: (0.5, 1)
      size: (step - 40, h), scale: (1, 0)
      color: if h > 200 then #ffc46b else #2f8a94
      animate { property: scale, to: (1, 1), duration: 1.5, easing: easeOut }
    }
    text day {
      position: (80 + step * (i + 0.5), base + 30)
      content: days[i], fontSize: 18, color: #f2e8d5
    }
  }
}
```

Six bars stand on the line, the tall ones amber, each with its day beneath it.
`h` decided each bar's height and colour, and `i` decided where the bar and its
label stand: both are centred `i + 0.5` steps from the line's left end, so
they line up. `step` is worked out from `length(heights)`, so the row fits the
line whatever the count.

Now add a seventh height, `150`, and a seventh day, `"SUN"`. `step` shrinks
from 133 to about 114 pixels and the whole row respaces to fit seven bars. Add
only the height, and the compiler reports an error at `days[i]`: the seventh
pass reads index 6 of a list of length 6. Two lists read with one index have to grow
together.

## Ranges

`a to b` is the list of whole numbers from `a` to `b`, with both ends
included: `0 to 11` is the twelve numbers 0, 1, 2, … 11. Both ends must be
whole numbers. A range is a list like any other, so `generate k in 0 to 11`
runs twelve times, with `k` counting from 0.

A range is the way to repeat something a number of times, and with `sin` and
`cos` from the last lesson it lays things out around a circle. The clock face
below has twelve ticks from one rectangle, every 30 degrees. Look for the
longer ticks at 12, 3, 6 and 9:

```marey
let r = 170

scene {
  size: (960, 540)
  background: #1d2c48
  duration: 12

  circle face { position: (480, 270), radius: 205, color: #f2e8d5 }

  generate k in 0 to 11 {
    rectangle tick {
      position: (480 + r * cos(k * 30 - 90), 270 + r * sin(k * 30 - 90))
      size: (if k % 3 == 0 then 36 else 18, if k % 3 == 0 then 8 else 5)
      rotation: k * 30 - 90
      color: #1d2c48
    }
  }

  rectangle hand {
    position: (480, 270), origin: (0.5, 1), size: (8, 150), color: #e4553b
    animate { property: rotation, to: 360, duration: 12, easing: linear, loop: true }
  }
  circle hub { position: (480, 270), radius: 12, color: #e4553b }
}
```

Tick `k` sits at the angle `k * 30 - 90`. The `- 90` turns the count to start
at the top, because 0 degrees points right. The same angle is its `rotation`,
so each tick's long side points out from the centre. `k % 3 == 0` is true for
0, 3, 6 and 9, which are the ticks at 12, 3, 6 and 9 o'clock, and they get the
longer, thicker size. The hand turns once in the twelve seconds.

A range whose end is below its start, such as `5 to 1`, is an empty list, so a
`generate` over it makes nothing. It is not an error.

## A let inside the loop

The block of a `generate` is its own block, so a `let` written inside it is
worked out again on every pass, from that pass's element and index. A value
used in several places of each copy can be named once there.

The beads below are placed by `angle`, which each pass works out from `i`.
`count` is how many beads there are, so the range runs `0 to count - 1`. Look
for which beads are larger, then change `count` to `24`:

```marey
let count = 16
let ring  = 180

scene {
  size: (960, 540)
  background: #1d2c48

  generate i in 0 to count - 1 {
    let angle = i * 360 / count
    let big   = i % 4 == 0
    circle bead {
      position: (480 + ring * cos(angle), 270 + ring * sin(angle))
      radius: if big then 22 else 10
      color: if big then #e4553b else #ffc46b
    }
  }

}
```

Every fourth bead, where `i % 4` is 0, is large and red: four of them, at the
right, bottom, left and top. With `count` at 24 there are 24 beads, 15 degrees
apart, and six large ones, because the angle and the range both follow
`count`. `0 to count - 1` reads as `0 to (count - 1)`: the arithmetic is done
before the range is made, so the range has exactly `count` numbers.

A name given inside the loop exists only inside it. Using `angle` after the
loop has ended is an error, and the message says why:

```marey error
let count = 16
let ring  = 180

scene {
  size: (960, 540)
  background: #1d2c48

  generate i in 0 to count - 1 {
    let angle = i * 360 / count
    circle bead { position: (480 + ring * cos(angle), 270 + ring * sin(angle)), radius: 12, color: #ffc46b }
  }
  line pointer { position: (480, 270), points: [(0, 0), (ring * cos(angle), ring * sin(angle))], thickness: 4, color: #e4553b }
}
```

There are sixteen `angle`s, one in each pass, and none of them is in the
scene's own block, where `pointer` is written. Name the angle you want with a
`let` outside the loop instead.

## A grid from two loops

A `generate` can sit inside another. The inner one runs in full for every pass
of the outer one, so an outer loop over rows with an inner loop over columns
makes every cell of a grid.

Look at the colours and the sizes, and work out which name each one is read
from:

```marey
scene {
  size: (960, 540)
  background: #1d2c48

  generate row in 0 to 4 {
    generate col in 0 to 8 {
      circle dot {
        position: (160 + col * 80, 110 + row * 80)
        radius: 6 + row * 3
        color: if (row + col) % 2 == 0 then #ffc46b else #2f8a94
      }
    }
  }
}
```

Five rows of nine make 45 dots. The radius grows with `row`, so the dots grow
down the grid. The colour reads both: `row + col` goes up by one with each
step across or down, so `% 2` alternates in both directions, as a
chequerboard does. Each copy of the inner block sees the `row` of the outer
pass it is in.

## How copies are named

Every object keeps a name, and copies are no exception. An object the loop
writes directly is named after the one written there, with `_` and its index
added: the ticks on the clock are `tick_0` to `tick_11`. The number is always
the element's place in the list, never its value, so the lamps in the first
sample are `lamp_0` to `lamp_4`, not `lamp_120` to `lamp_840`. Inside two loops
each level adds its own index, the inner one first: the dot in column 3 of row 1
is `dot_3_1`. Objects inside a copy keep their own names. Each light in the
showcase is a group the loops write directly, such as `dot_3_5`, and the
circles inside it are still `bloom`, `halo` and `core`.

The picture never shows these names, but the compiler's messages do. In the
sample below, each dot's alpha is computed from `i`, and one of them comes out
too high. The message names it:

```marey error
scene {
  size: (960, 540)
  background: #1d2c48

  generate i in 0 to 4 {
    circle dot { position: (160 + i * 160, 270), radius: 50, color: #ffc46b, alpha: 0.2 + i * 0.25 }
  }
}
```

`dot_4` is the fifth dot, where `i` is 4: 0.2 + 4 × 0.25 is 1.2, and alpha
stops at 1. The other four, at 0.2, 0.45, 0.7 and 0.95, are fine. Reading
`dot_4` tells you which pass to look at.

Names must still be unique among the objects beside them, and generated names
count. Two loops that each make a `dot` in the same block both make a `dot_0`:

```marey error
scene {
  size: (960, 540)
  background: #1d2c48

  generate x in [200, 480, 760] {
    circle dot { position: (x, 200), radius: 50, color: #ffc46b }
  }
  generate x in [200, 480, 760] {
    circle dot { position: (x, 340), radius: 50, color: #2f8a94 }
  }
}
```

Give the second loop's circle another name, such as `low`, and the scene
compiles with `dot_0` to `dot_2` and `low_0` to `low_2`. A shape written by
hand as `dot_1` beside the first loop would collide the same way.

## Out of step: a delay from the index

Every copy can have its own timing too. [The lesson on timing](/learn/timing/)
put three dots out of step by giving each the same `duration` and a different
`delay`. With `generate`, the delay can be worked out from the index, so a row
of any length steps in turn.

Each dot below hops once, with `delay: i * 0.1`. Watch the hop travel along
the row:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  generate i in 0 to 15 {
    let x = 120 + i * 48
    circle dot {
      position: (x, 330), radius: 14, color: #ffc46b
      animate { property: position, to: (x, 210), duration: 0.4, delay: i * 0.1, easing: easeOut, yoyo: true }
    }
  }
}
```

The hop starts at the left and runs to the right, one dot every tenth of a
second. Each hop is the same, since they share one `duration`; only the delay
differs, so the wave keeps its shape as it travels. Each hop is a once-only
`yoyo`, so every dot is back on the line by 1.5 + 0.8 = 2.3 seconds, before the
scene's three seconds end, and the scene loops without a seam. A looping hop
with a delay would leave one, as the lesson on timing showed.

The showcase does the same in two dimensions, with a delay worked out from each
light's distance from the centre.

## The source decides how many

`generate` makes exactly one copy per element, and the list is written in the
source, so you can count a scene's objects by reading it. There is no way to
skip an element: `generate` has no filter, and an `if` can choose a copy's
values but not whether it exists. For the same reason, the list's length cannot
depend on an `if`:

```marey error=PARSE_GENERATE_CONDITIONAL_COLLECTION
let wide = true

scene {
  size: (960, 540)
  background: #1d2c48

  generate i in if wide then 0 to 7 else 0 to 3 {
    circle dot { position: (120 + i * 100, 270), radius: 30, color: #ffc46b }
  }
}
```

The message gives the reason: the source's own structure must decide how many
objects there are. To hide some copies, keep them all and choose a value that
hides them, as the last lesson's lamp glow did: `alpha: if i > 3 then 0 else 1`.

A `generate` can go in the scene, as here, or inside a group, and
[the next lesson](/learn/templates/) puts one inside a template. It cannot go
inside a shape, because a shape holds no other objects.

## Reading the showcase

Open "Show the source" under the Ripple player at the top of the page. A drop
lands in the middle of a 24 by 14 field of lights, and three rings run out to
the edges. The scene lasts ten seconds:

- **The grid** is `generate row in 0 to rows - 1` with
  `generate col in 0 to cols - 1` inside it: 14 rows of 24, so 336 lights, 36
  pixels apart. `dx` and `dy` count columns and rows from the centre, which falls
  between the four middle lights, at column 11.5 and row 6.5.
- **The wait.** Each light waits `d2 * lag` seconds before it pulses, where
  `d2 = dx * dx + dy * dy` is its squared distance from the centre and `lag` is
  0.02. Marey has no square root. It doesn't need one here: lights at the same
  distance have the same squared distance, so they light together and the rings
  stay round, and a light farther out always has a larger one, so the wave
  reaches the lights in order. What the square changes is the speed. The wave
  reaches the top and bottom rows in 0.85 seconds, the sides at 2.65 and the
  corners at 3.49: it starts fast and slows as it spreads.
- **The colours.** `d2` is always a whole number plus a half, from 0.5 to 174.5,
  so `step = (d2 - 0.5) / 2` is a whole number from 0 to 87. Taking away the
  remainder, `step - step % 11`, leaves a multiple of 11, so
  `ring = (step - step % 11) / 11` is a whole number from 0 to 7: an index into
  the eight colours of `palette`. Each colour covers 22 of `d2`, which is 0.44
  seconds of the wave's arrival, from gold at the centre to blue in the corners.
- **A light** is a group holding a core and two faint halos. It rests small and
  dim, at `scale: 0.6` and `alpha: 0.35`. Its `sequence` has three pulses, two
  seconds apart, each smaller than the last. Only the first step has
  `delay: wait`; the later ones have `delay: 1.1`, which with the 0.15 seconds
  up and 0.75 seconds down makes two seconds from one pulse to the next.
- **The seam.** The pulses are steps of a sequence, not a looping animation
  with a delay, which would leave a seam. Each light ends on the scale and alpha
  it started with, and the last ones, in the corners, finish at 8.4 seconds.
- **The drop** holds unseen for nine seconds, then shrinks as it brightens, as a
  drop falling away from you would, and is gone at 9.9 seconds. The scene then
  starts again with the splash, so the drop seems to land in it. A last step
  puts the drop back to its starting size while it cannot be seen.
- **The depth** behind the lights is six wide discs from one `generate` over a
  list of radii, each at `alpha: 0.09`, so the middle, covered by all six, is
  the lightest. Their group brightens as each ring leaves the middle.

## Try this

The exercises use a smaller field: 12 by 7 dots and one pulse each, with the
colours chosen by `if` from the squared distance. The wave's source is set by
`srcC` and `srcR`, separately from where the grid is drawn.

:::try Start the wave in a corner
Move the wave's source to the top-left dot. Watch the far corner: does every dot
still get its pulse before the scene starts again?

```marey
let cols = 12
let rows = 7
let gap  = 72

// The wave's source, in columns and rows. Here, the middle.
let srcC = (cols - 1) / 2
let srcR = (rows - 1) / 2

// Seconds of wait per square cell of distance from the source.
let lag = 0.03

scene {
  size: (960, 540)
  background: #070b16
  duration: 3

  generate row in 0 to rows - 1 {
    generate col in 0 to cols - 1 {
      let dx = col - srcC
      let dy = row - srcR
      let d2 = dx * dx + dy * dy
      circle dot {
        position: (480 + (col - (cols - 1) / 2) * gap, 270 + (row - (rows - 1) / 2) * gap)
        radius: 9
        color: if d2 < 4 then #ffe7ad else if d2 < 16 then #ff9f68 else if d2 < 36 then #d95b88 else #6c58b6
        alpha: 0.6
        animate { property: scale, to: 2.4, duration: 0.4, delay: d2 * lag, easing: easeOut, yoyo: true }
      }
    }
  }
}
```

```marey solution
let cols = 12
let rows = 7
let gap  = 72

// The wave's source: the top-left dot.
let srcC = 0
let srcR = 0

// Seconds of wait per square cell of distance from the source.
let lag = 0.03

scene {
  size: (960, 540)
  background: #070b16
  // The far corner now waits 4.71 s, so the scene needs six seconds.
  duration: 6

  generate row in 0 to rows - 1 {
    generate col in 0 to cols - 1 {
      let dx = col - srcC
      let dy = row - srcR
      let d2 = dx * dx + dy * dy
      circle dot {
        position: (480 + (col - (cols - 1) / 2) * gap, 270 + (row - (rows - 1) / 2) * gap)
        radius: 9
        color: if d2 < 4 then #ffe7ad else if d2 < 16 then #ff9f68 else if d2 < 36 then #d95b88 else #6c58b6
        alpha: 0.6
        animate { property: scale, to: 2.4, duration: 0.4, delay: d2 * lag, easing: easeOut, yoyo: true }
      }
    }
  }
}
```

With `srcC` and `srcR` at 0, the wave starts at the top-left dot and spreads as
quarter rings, and the colours, worked out from the same `d2`, follow it. The
grid stays where it was, because its positions read `col` and `row`, not the
source. From the middle, no dot was more than 5.5 columns and 3 rows away, so
the longest wait was 39.25 × 0.03, about 1.2 seconds. From the corner, the
far dot is 11 columns and 6 rows away: 121 + 36 = 157, and 157 × 0.03 is 4.71
seconds. In a three-second scene that dot would never pulse, and the scene would
start again in the middle of the wave. Its pulse ends at 4.71 + 0.8 = 5.51
seconds, so `duration: 6` holds it.
:::

:::try Make the grid coarser
Make the field 8 dots by 5, 110 pixels apart, with larger dots. Keep the wave
in the middle.

```marey
let cols = 12
let rows = 7
let gap  = 72

// The wave's source, in columns and rows. Here, the middle.
let srcC = (cols - 1) / 2
let srcR = (rows - 1) / 2

// Seconds of wait per square cell of distance from the source.
let lag = 0.03

scene {
  size: (960, 540)
  background: #070b16
  duration: 3

  generate row in 0 to rows - 1 {
    generate col in 0 to cols - 1 {
      let dx = col - srcC
      let dy = row - srcR
      let d2 = dx * dx + dy * dy
      circle dot {
        position: (480 + (col - (cols - 1) / 2) * gap, 270 + (row - (rows - 1) / 2) * gap)
        radius: 9
        color: if d2 < 4 then #ffe7ad else if d2 < 16 then #ff9f68 else if d2 < 36 then #d95b88 else #6c58b6
        alpha: 0.6
        animate { property: scale, to: 2.4, duration: 0.4, delay: d2 * lag, easing: easeOut, yoyo: true }
      }
    }
  }
}
```

```marey solution
let cols = 8
let rows = 5
let gap  = 110

// The wave's source, in columns and rows. Here, the middle.
let srcC = (cols - 1) / 2
let srcR = (rows - 1) / 2

// Seconds of wait per square cell of distance from the source.
// Fewer cells means shorter waits, so this is raised to slow the wave.
let lag = 0.08

scene {
  size: (960, 540)
  background: #070b16
  duration: 3

  generate row in 0 to rows - 1 {
    generate col in 0 to cols - 1 {
      let dx = col - srcC
      let dy = row - srcR
      let d2 = dx * dx + dy * dy
      circle dot {
        position: (480 + (col - (cols - 1) / 2) * gap, 270 + (row - (rows - 1) / 2) * gap)
        radius: 14
        color: if d2 < 4 then #ffe7ad else if d2 < 16 then #ff9f68 else if d2 < 36 then #d95b88 else #6c58b6
        alpha: 0.6
        animate { property: scale, to: 2.4, duration: 0.4, delay: d2 * lag, easing: easeOut, yoyo: true }
      }
    }
  }
}
```

Three numbers make the grid: `cols`, `rows` and `gap`. The source stays in the
middle on its own, because `srcC` and `srcR` are worked out from `cols` and
`rows`, and the grid stays centred, because each position is measured from
the middle too. The wait counts cells, not pixels, so with fewer cells the
corner's wait falls from 39.25 × 0.03, about 1.2 seconds, to 16.25 × 0.03,
under half a second. Raising `lag` to 0.08 brings it back to 1.3 seconds.
The outermost colour is gone: no dot is now 6 cells from the middle, so `d2`
never reaches 36.
:::

:::try A diagonal wave
Make the wave run diagonally, from the top-left corner to the bottom-right,
in straight lines rather than rings.

```marey
let cols = 12
let rows = 7
let gap  = 72

// The wave's source, in columns and rows. Here, the middle.
let srcC = (cols - 1) / 2
let srcR = (rows - 1) / 2

// Seconds of wait per square cell of distance from the source.
let lag = 0.03

scene {
  size: (960, 540)
  background: #070b16
  duration: 3

  generate row in 0 to rows - 1 {
    generate col in 0 to cols - 1 {
      let dx = col - srcC
      let dy = row - srcR
      let d2 = dx * dx + dy * dy
      circle dot {
        position: (480 + (col - (cols - 1) / 2) * gap, 270 + (row - (rows - 1) / 2) * gap)
        radius: 9
        color: if d2 < 4 then #ffe7ad else if d2 < 16 then #ff9f68 else if d2 < 36 then #d95b88 else #6c58b6
        alpha: 0.6
        animate { property: scale, to: 2.4, duration: 0.4, delay: d2 * lag, easing: easeOut, yoyo: true }
      }
    }
  }
}
```

```marey solution
let cols = 12
let rows = 7
let gap  = 72

scene {
  size: (960, 540)
  background: #070b16
  duration: 3

  generate row in 0 to rows - 1 {
    generate col in 0 to cols - 1 {
      // Dots with the same col + row lie on one diagonal.
      let diag = col + row
      circle dot {
        position: (480 + (col - (cols - 1) / 2) * gap, 270 + (row - (rows - 1) / 2) * gap)
        radius: 9
        color: if diag < 4 then #ffe7ad else if diag < 8 then #ff9f68 else if diag < 12 then #d95b88 else #6c58b6
        alpha: 0.6
        animate { property: scale, to: 2.4, duration: 0.4, delay: diag * 0.12, easing: easeOut, yoyo: true }
      }
    }
  }
}
```

`col + row` is the same for every dot on a diagonal running from bottom-left to
top-right, and goes up by one from each such diagonal to the next. A delay of
`diag * 0.12` therefore lights the diagonals in turn, as straight bands moving
from the top-left to the bottom-right. The colours use the same number, so they
lie in diagonal bands too. The last diagonal, the bottom-right dot, has
`diag` 11 + 6 = 17, waits 2.04 seconds, and is back at rest at 2.84, inside
the three seconds.
:::

## Recap

- `generate x in list { … }` makes the block once per element, with `x` holding
  the element; `generate x, i in list` adds `i`, the index, counting from 0.
  ([generate](/reference/language/#generate))
- `a to b` is the whole numbers from `a` to `b`, both ends included, and a range
  that runs downwards is empty. `0 to count - 1` has `count` numbers.
  ([Expressions](/reference/language/#expressions))
- A `let` inside the loop is worked out on every pass and exists only inside
  it. ([let](/reference/language/#let))
- A `generate` can sit inside another; the inner one runs in full for every pass
  of the outer one. ([generate](/reference/language/#generate))
- An object the loop writes directly is named after the one written there, plus
  `_` and its index; inside two loops, the inner index comes first. Objects
  inside a copy keep their names. Generated names must be unique
  among the objects beside them, like any other.
  ([generate](/reference/language/#generate))
- The same `duration` with a `delay` worked out from the index puts copies out
  of step by a fixed amount. ([delay](/reference/language/#delay))
- `generate` makes one copy per element and has no filter, and the list's
  length cannot depend on an `if`.
  ([Where expressions stop](/reference/language/#where-expressions-stop))
