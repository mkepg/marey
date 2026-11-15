---
title: Values: let and expressions
summary: Name the numbers and colours a scene is built from, compute the rest from them, choose between values with if, and place points with sin and cos.
description: Lesson 8 of the Marey course. let bindings, arithmetic and parentheses, lists, indexing and length, booleans, comparisons and if then else, sin and cos in degrees, scope, and the rule that data decides values while the source decides how many objects there are.
minutes: 25
learn:
- Name values with let, and compute other values from them
- Keep several values in a list and pick one by its index
- Choose a value with if, from comparisons and booleans
- Place points around a circle with sin and cos
- Know why data decides values but never which objects a scene has
showcase: postcard
---

Every number in the lessons so far was written where it was used. When two
shapes had to line up, like a mast and its sail, the same number was written
twice, and moving one meant finding the other. This lesson names values with
`let`, and computes positions, sizes and colours from those names, so one
change carries through a whole scene.

## Naming a value

`let name = value` gives a value a name. From then on the name can stand
anywhere the value could. A name starts with a letter and holds only letters,
digits and underscores.

The scene below is built from two names: `horizon`, where the ground starts,
and `gap`, the distance between the posts. Look at how each shape's position
is written, then change `horizon` to `300`, or `gap` to `160`, and run it
again:

```marey
let horizon = 360
let gap     = 220

scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  rectangle ground { position: (480, horizon), origin: (0.5, 0), size: (960, 540 - horizon), color: #2f4434 }

  rectangle post1 { position: (480 - gap, horizon), origin: (0.5, 1), size: (16, 120), color: #f2e8d5 }
  rectangle post2 { position: (480, horizon), origin: (0.5, 1), size: (16, 120), color: #f2e8d5 }
  rectangle post3 { position: (480 + gap, horizon), origin: (0.5, 1), size: (16, 120), color: #f2e8d5 }

  circle ball {
    position: (480 - gap, horizon - 150), radius: 20, color: #ffc46b
    animate { property: position, to: (480 + gap, horizon - 150), duration: 2, loop: true, yoyo: true }
  }
}
```

With `horizon` at 300, the ground, the posts and the ball's path all rise 60
pixels together, because every one of them is placed from `horizon`. With
`gap` at 160 the outer posts close in, and the ball's swing shortens to match
them. Nothing else in the file needed to change.

A `let` can go before the `scene` block, as here, or inside the scene, a
group, a shape or an `animate`. It can hold any kind of value: a number, a
colour, a string, a point, a list, `true` or `false`, an easing or a `fit`.

A name is fixed once it is given. Giving the same name a second value in the
same place, here the top of the file, is a compile error:

```marey error
let gap = 160
let gap = 200

scene {
  size: (960, 540)
  duration: 2
  circle a { position: (gap, 270), radius: 80 }
}
```

There is no way to change a value after it is named, so a name holds one
value wherever that `let` can be seen. An inner block can give the same name a
value of its own; "Where a name can be seen", below, shows how.

One more rule: the nine named colours, such as `red` and `cyan`, are words of
the language, so none of them can be a `let` name.

## Arithmetic

Anywhere a number goes, you can write a calculation instead: `+`, `-`, `*`,
`/`, and `%` for the remainder after division. A `-` in front of a number or a
name negates it. `*`, `/` and `%` happen before `+` and `-`, and parentheses
group the way you mean.

The three bars below have the same `gap` and the same three operations, in
different orders. Each label is the bar's width as written. Before you run it,
work out which bar is longest:

```marey
let gap = 100

scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  rectangle a { position: (100, 150), origin: (0, 0.5), size: (2 * gap + 100, 40), color: #ffc46b, scale: (0, 1)
                animate { property: scale, to: (1, 1), duration: 1.5, easing: easeOut } }
  rectangle b { position: (100, 270), origin: (0, 0.5), size: (2 * (gap + 100), 40), color: #2f8a94, scale: (0, 1)
                animate { property: scale, to: (1, 1), duration: 1.5, easing: easeOut } }
  rectangle c { position: (100, 390), origin: (0, 0.5), size: (2 * gap + 100 / 2, 40), color: #e4553b, scale: (0, 1)
                animate { property: scale, to: (1, 1), duration: 1.5, easing: easeOut } }

  text la { position: (100, 110), origin: (0, 0.5), content: "2 * gap + 100", fontSize: 18, color: #f2e8d5 }
  text lb { position: (100, 230), origin: (0, 0.5), content: "2 * (gap + 100)", fontSize: 18, color: #f2e8d5 }
  text lc { position: (100, 350), origin: (0, 0.5), content: "2 * gap + 100 / 2", fontSize: 18, color: #f2e8d5 }
}
```

The middle bar is longest. The top one is 2 × 100 = 200, plus 100: 300 pixels.
The parentheses in the middle one make the addition happen first, 100 + 100 =
200, and then double it: 400. In the bottom one the division happens before the
addition, 100 / 2 = 50, so it is 200 + 50 = 250.

Every calculation is worked out once, when the file is compiled, down to a
plain number. The posts above were placed at 260, 480 and 700 before the scene
ever started to play. Dividing by zero, or taking a remainder by zero, is a
compile error, not a broken shape.

## Lists

A list holds several values in order, in square brackets: `[#e4553b, #2f8a94]`.
`palette[0]` is the first element, `palette[1]` the second, and so on: the
count starts at 0. `length(palette)` is how many elements there are.

The stripes below take their colours from one list, and their width from its
length. Watch the sun change between two of the list's colours, then change
one colour in the list and run it again:

```marey
let palette = [#e4553b, #f29e4c, #ffc46b, #2f8a94, #1d4e6b]
let stripe  = 960 / length(palette)

scene {
  size: (960, 540)
  duration: 5

  rectangle s0 { position: (0, 0), origin: (0, 0), size: (stripe, 540), color: palette[0] }
  rectangle s1 { position: (stripe, 0), origin: (0, 0), size: (stripe, 540), color: palette[1] }
  rectangle s2 { position: (2 * stripe, 0), origin: (0, 0), size: (stripe, 540), color: palette[2] }
  rectangle s3 { position: (3 * stripe, 0), origin: (0, 0), size: (stripe, 540), color: palette[3] }
  rectangle s4 { position: (4 * stripe, 0), origin: (0, 0), size: (stripe, 540), color: palette[4] }

  circle sun {
    position: (3.5 * stripe, 270), radius: 70, color: palette[2]
    animate { property: color, to: palette[0], duration: 2.5, loop: true, yoyo: true }
  }
}
```

The list has five colours, so each stripe is 960 / 5 = 192 pixels wide, and
stripe `s3` starts at 3 × 192 = 576. The sun sits in the middle of that
stripe, at 3.5 × 192 = 672. It starts at `palette[2]`, the yellow, and
animates to `palette[0]`, the red: a `to` can take a name that holds a
colour. Change a colour in the list and both the stripe and anything else
that reads that element change with it.

An index has to name an element that exists: a whole number from 0 to one less
than the length. There is no counting back from the end with a negative index,
and no wrapping round past it:

```marey error
let palette = [#e4553b, #2f8a94, #ffc46b]

scene {
  size: (960, 540)
  duration: 2
  circle a { position: (480, 270), radius: 80, color: palette[3] }
}
```

The list has three elements, so its indices are 0, 1 and 2, and the message
says so. A mistyped index is caught when the file compiles, rather than
drawing a shape in the wrong colour.

## Choosing a value with if

`true` and `false` are values too, called booleans, and `if C then A else B`
chooses between two values: `A` when `C` is `true`, `B` when it is `false`.

The scene below has one switch, `night`. Every colour in it, and the label's
text, is chosen by an `if` that reads it. Change `true` to `false`:

```marey
let night = true

scene {
  size: (960, 540)
  background: if night then #0b1230 else #9cc6e4

  circle sky   { position: (480, 200), radius: 80, color: if night then #eef1fa else #ffd36b }
  rectangle land { position: (480, 440), size: (960, 200), color: if night then #0c1320 else #2f4434 }
  text label   { position: (480, 440), content: if night then "night" else "day", fontSize: 40
                 color: if night then #9fb0d8 else #f2e8d5 }
}
```

With `false`, the sky turns blue, the moon becomes a sun, the land turns green,
and the label reads "day". `if` is a value, like a number or a colour, so it can
go anywhere a value goes: a colour, a string, a size, a position.

The two branches must be the same kind of value, both colours or both numbers,
whichever one the condition picks:

```marey error
let night = true

scene {
  size: (960, 540)
  duration: 2
  circle a { position: (480, 270), radius: 80, color: if night then #0b1230 else 40 }
}
```

Both branches are checked every time, so a value's kind never depends on how a
switch is set. A mistake in the branch that isn't chosen today is still caught.

## Comparisons

A comparison makes a boolean from two values. `<`, `>`, `<=` and `>=` compare
two numbers; `==` and `!=` ask whether two numbers, strings, booleans or
colours are equal or different. Points and lists cannot be compared. `and`,
`or` and `not` combine booleans: `h > 100 and h < 200` is `true` only when both
sides are, `a or b` when either is, and `not a` when `a` is `false`.

The bars below take their heights from a list, and each one's colour from
comparing its height with `tall`. Watch which bars cross the faint line at
`tall`:

```marey
let heights = [120, 260, 180, 300, 90]
let tall    = 200
let base    = 460

scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  line rule { position: (480, base), points: [(-400, 0), (400, 0)], thickness: 2, color: #f2e8d5, alpha: 0.4 }
  line mark { position: (480, base - tall), points: [(-400, 0), (400, 0)], thickness: 1, color: #ffc46b, alpha: 0.5 }

  rectangle bar0 { position: (240, base), origin: (0.5, 1), size: (90, heights[0]), scale: (1, 0)
                   color: if heights[0] > tall then #ffc46b else #2f8a94
                   animate { property: scale, to: (1, 1), duration: 1.5, easing: easeOut } }
  rectangle bar1 { position: (360, base), origin: (0.5, 1), size: (90, heights[1]), scale: (1, 0)
                   color: if heights[1] > tall then #ffc46b else #2f8a94
                   animate { property: scale, to: (1, 1), duration: 1.5, easing: easeOut } }
  rectangle bar2 { position: (480, base), origin: (0.5, 1), size: (90, heights[2]), scale: (1, 0)
                   color: if heights[2] > tall then #ffc46b else #2f8a94
                   animate { property: scale, to: (1, 1), duration: 1.5, easing: easeOut } }
  rectangle bar3 { position: (600, base), origin: (0.5, 1), size: (90, heights[3]), scale: (1, 0)
                   color: if heights[3] > tall then #ffc46b else #2f8a94
                   animate { property: scale, to: (1, 1), duration: 1.5, easing: easeOut } }
  rectangle bar4 { position: (720, base), origin: (0.5, 1), size: (90, heights[4]), scale: (1, 0)
                   color: if heights[4] > tall then #ffc46b else #2f8a94
                   animate { property: scale, to: (1, 1), duration: 1.5, easing: easeOut } }
}
```

The bars of 260 and 300 pass the line and are amber; the other three stay
teal. Change `tall` to `150` and the 180 bar joins them. The data, the list
and the threshold, decides each bar's height and colour.

A condition has to be a boolean. A number is not `true` or `false`, so
`if 1 then …` is a compile error; write the comparison you mean, such as
`n > 0`. Comparing two different kinds, such as a number and a colour, is a
compile error too.

## Points from sin and cos

`sin(d)` and `cos(d)` take an angle in degrees, the same unit as `rotation`.
The point `(r * cos(a), r * sin(a))` is `r` pixels from (0, 0) in the direction
`a`. Because y grows downwards, 0 degrees points right, 90 points down, and -90
points straight up: angles go clockwise, as `rotation` does.

The star below has twelve points, every 30 degrees, alternating between radius
`r` and half of it. Look at the first point, at -90, then watch the star turn:

```marey
let r = 150

scene {
  size: (960, 540)
  background: #1d2c48
  duration: 6

  polygon star {
    position: (480, 270)
    color: #ffc46b
    points: [(r * cos(-90), r * sin(-90)), (r / 2 * cos(-60), r / 2 * sin(-60)),
             (r * cos(-30), r * sin(-30)), (r / 2 * cos(0), r / 2 * sin(0)),
             (r * cos(30), r * sin(30)), (r / 2 * cos(60), r / 2 * sin(60)),
             (r * cos(90), r * sin(90)), (r / 2 * cos(120), r / 2 * sin(120)),
             (r * cos(150), r * sin(150)), (r / 2 * cos(180), r / 2 * sin(180)),
             (r * cos(210), r * sin(210)), (r / 2 * cos(240), r / 2 * sin(240))]
    animate { property: rotation, to: 60, duration: 6, easing: linear, loop: true }
  }
}
```

The first point is straight up, 150 pixels above the centre, and the points
run clockwise from it. Change `r` and the whole star resizes. The star turns
60 degrees in six seconds, the angle between two of its outer points, so when
the loop starts again it looks exactly as it did: the jump back is a jump to
an identical picture. The showcase's sun rays use the same trick.

`sin` and `cos` are exact at multiples of 90 degrees: `cos(90)` is exactly 0,
so the points at 90 and -90 sit exactly above and below the centre.

## Where a name can be seen

A name given inside a block can be used in that block and in the blocks inside
it, and nowhere else. A group, a shape and an `animate` each have their own
block, so two groups can use the same name for different values.

The two faces below each name their colour `tone`, inside their own group. Look
for which colour each face's parts use:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  group left {
    position: (300, 270)
    let tone = #e4553b
    animate { property: rotation, to: -10, duration: 1, loop: true, yoyo: true }
    circle face { position: (0, 0), radius: 90, color: tone }
    circle eyeL { position: (-30, -20), radius: 12, color: #f2e8d5 }
    circle eyeR { position: (30, -20), radius: 12, color: #f2e8d5 }
    rectangle mouth { position: (0, 35), size: (70, 12), color: #f2e8d5 }
  }

  group right {
    position: (660, 270)
    let tone = #2f8a94
    animate { property: rotation, to: 10, duration: 1, loop: true, yoyo: true }
    circle face { position: (0, 0), radius: 90, color: tone }
    circle eyeL { position: (-30, -20), radius: 12, color: #f2e8d5 }
    circle eyeR { position: (30, -20), radius: 12, color: #f2e8d5 }
    rectangle mouth { position: (0, 35), size: (70, 12), color: #f2e8d5 }
  }
}
```

Each face reads its own `tone`: red on the left, teal on the right. The two
names don't clash, because each lives in its own group. A `tone` used outside
both groups would be an error, since no block that encloses it gives one. An
inner block may also give a name that an outer block already gave; inside, the
inner value is the one that counts.

## Values, not shapes

An `if` chooses a value. It never decides whether a shape is there: there is
no way to write "draw the moon only at night". Every object in a scene is
written in the source, and you can count them by reading it, without working
out a single `if`. The data decides each object's position, size and colour;
the source decides which objects there are.

So a shape that should appear only sometimes is always there, and a value
hides it. The street lamp below has a glow that is seen only when the lamp is
lit and it is night: its alpha is `if lit and night then 0.25 else 0`. Change
`lit` to `false`; then set it back, and change `night` to `false`:

```marey
let lit   = true
let night = true

scene {
  size: (960, 540)
  background: if night then #0b1230 else #9cc6e4

  circle glow { position: (480, 230), radius: 120, color: #ffd27a, alpha: if lit and night then 0.25 else 0 }
  rectangle post { position: (480, 330), size: (10, 200), color: #2b3245 }
  circle bulb { position: (480, 230), radius: 18, color: if lit then #fff0c4 else #59627a }
}
```

With `lit` false the glow is still in the scene, at alpha 0, and the bulb is
grey. With `night` false the sky turns blue and the glow goes too, though the
bulb stays lit: `and` needs both sides. The scene has the same three objects
every way, with the same names.
That is what lets you read a scene and know what it holds. The showcase's moon
craters and its stars work this way.

## Reading the showcase

Open "Show the source" under the Postcard player at the top of the page. The
values that lay out the landscape are named at the top, and the scene reads
them. The details inside the landscape, the stars, the clouds and the pines'
places along the shore, are plain numbers:

- **`night`** chooses the palette, with `let pal = if night then nightPal else
  dayPal`. The two palettes list the same parts in the same order, so `pal[4]`
  is the far peak's colour in both. `night` also moves the sun, turns it into
  the moon, and rewrites the caption.
- **`horizon`** places the sky bands, the peaks, the lake, the shore and the
  shimmer on the water. Each sky band is a quarter of the space above it.
- **`heights`** holds the three peak heights. The peaks are spaced by
  `gap`, which divides the picture by `length(heights) + 1`, so the spacing
  follows the number of heights.
- **Each peak** is a group at its foot on the horizon, scaled by `half` across
  and by its height up. Inside it, the rock and the snow are outlines written
  once, as lists, in units of the peak's size: x from -1 to 1, y from -1 at the
  summit to 0 at the base. Their `origin: (0, 0)` and `position` at the
  outline's top-left corner make each point land at its own coordinates, as in
  [the lesson on shapes](/learn/shapes/).
- **The reflections** are the same groups below the horizon, with lists whose
  every y is negated. A negative `scale` would be a compile error, so the
  mirror image is written out rather than flipped. Each reflection group's
  alpha of 0.4 dims its rock and its snow together; where the reflections
  overlap, the one behind shows through, as [the lesson on colour](/learn/colour/)
  describes.
- **The sun's rays** are eight lines placed with `cos` and `sin` at every 45
  degrees. Their group turns 45 degrees in eight seconds, so the scene loops
  without a seam. At night the rays' group has alpha 0, and three craters,
  always there, get an alpha above 0.
- **The stars** are in a group whose alpha is `if night then 1 else 0`.

## Try this

The exercises use a smaller postcard: three peaks, a lake, a sun and a
caption, with the same switch, horizon and heights.

:::try Turn the card to night
Set `night` to `true`. Before you run it, list what you expect to change.

```marey
let night   = false
let horizon = 300
let heights = [150, 210, 130]
let gap     = 960 / (length(heights) + 1)
let half    = 170

//              sky      haze     rock     lake     sun or moon
let dayPal   = [#9cc6e4, #d6e7ee, #56718c, #4b7fa3, #fff3cf]
let nightPal = [#172248, #2b3864, #1e2a4a, #121d3b, #eef1fa]
let pal      = if night then nightPal else dayPal

// A peak's outline, in units of its own size.
let rock = [(-1, 0), (-0.42, -0.52), (-0.18, -0.86), (0, -1), (0.4, -0.66), (1, 0)]

scene {
  size: (960, 540)
  background: pal[0]
  duration: 4

  rectangle haze { position: (480, horizon), origin: (0.5, 1), size: (960, 90), color: pal[1] }
  circle sun {
    position: (if night then 720 else 260, 110), radius: 34, color: pal[4]
    animate { property: scale, to: 1.1, duration: 1, loop: true, yoyo: true }
  }

  group peak1 { position: (gap, horizon), scale: (half, heights[0])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak2 { position: (2 * gap, horizon), scale: (half, heights[1])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak3 { position: (3 * gap, horizon), scale: (half, heights[2])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }

  rectangle lake { position: (480, horizon), origin: (0.5, 0), size: (960, 540 - horizon), color: pal[3] }
  text caption {
    position: (480, 470), fontSize: 26, color: #f2e8d5
    content: if night then "GOODNIGHT FROM THE LAKES" else "GREETINGS FROM THE LAKES"
  }
}
```

```marey solution
let night   = true
let horizon = 300
let heights = [150, 210, 130]
let gap     = 960 / (length(heights) + 1)
let half    = 170

//              sky      haze     rock     lake     sun or moon
let dayPal   = [#9cc6e4, #d6e7ee, #56718c, #4b7fa3, #fff3cf]
let nightPal = [#172248, #2b3864, #1e2a4a, #121d3b, #eef1fa]
let pal      = if night then nightPal else dayPal

// A peak's outline, in units of its own size.
let rock = [(-1, 0), (-0.42, -0.52), (-0.18, -0.86), (0, -1), (0.4, -0.66), (1, 0)]

scene {
  size: (960, 540)
  background: pal[0]
  duration: 4

  rectangle haze { position: (480, horizon), origin: (0.5, 1), size: (960, 90), color: pal[1] }
  circle sun {
    position: (if night then 720 else 260, 110), radius: 34, color: pal[4]
    animate { property: scale, to: 1.1, duration: 1, loop: true, yoyo: true }
  }

  group peak1 { position: (gap, horizon), scale: (half, heights[0])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak2 { position: (2 * gap, horizon), scale: (half, heights[1])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak3 { position: (3 * gap, horizon), scale: (half, heights[2])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }

  rectangle lake { position: (480, horizon), origin: (0.5, 0), size: (960, 540 - horizon), color: pal[3] }
  text caption {
    position: (480, 470), fontSize: 26, color: #f2e8d5
    content: if night then "GOODNIGHT FROM THE LAKES" else "GREETINGS FROM THE LAKES"
  }
}
```

One word changes. Everything that reads `pal` takes its night colour: the sky,
the haze, the three peaks, the lake, and the disc, which becomes a pale moon.
The disc also moves from x 260 to 720, and the caption now reads "GOODNIGHT
FROM THE LAKES". The scene has the same objects as before; only their values
changed.
:::

:::try Raise the horizon
Raise the horizon by 40 pixels, and watch which shapes follow it.

```marey
let night   = false
let horizon = 300
let heights = [150, 210, 130]
let gap     = 960 / (length(heights) + 1)
let half    = 170

//              sky      haze     rock     lake     sun or moon
let dayPal   = [#9cc6e4, #d6e7ee, #56718c, #4b7fa3, #fff3cf]
let nightPal = [#172248, #2b3864, #1e2a4a, #121d3b, #eef1fa]
let pal      = if night then nightPal else dayPal

// A peak's outline, in units of its own size.
let rock = [(-1, 0), (-0.42, -0.52), (-0.18, -0.86), (0, -1), (0.4, -0.66), (1, 0)]

scene {
  size: (960, 540)
  background: pal[0]
  duration: 4

  rectangle haze { position: (480, horizon), origin: (0.5, 1), size: (960, 90), color: pal[1] }
  circle sun {
    position: (if night then 720 else 260, 110), radius: 34, color: pal[4]
    animate { property: scale, to: 1.1, duration: 1, loop: true, yoyo: true }
  }

  group peak1 { position: (gap, horizon), scale: (half, heights[0])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak2 { position: (2 * gap, horizon), scale: (half, heights[1])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak3 { position: (3 * gap, horizon), scale: (half, heights[2])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }

  rectangle lake { position: (480, horizon), origin: (0.5, 0), size: (960, 540 - horizon), color: pal[3] }
  text caption {
    position: (480, 470), fontSize: 26, color: #f2e8d5
    content: if night then "GOODNIGHT FROM THE LAKES" else "GREETINGS FROM THE LAKES"
  }
}
```

```marey solution
let night   = false
// y grows downwards, so raising the horizon is a smaller number.
let horizon = 260
let heights = [150, 210, 130]
let gap     = 960 / (length(heights) + 1)
let half    = 170

//              sky      haze     rock     lake     sun or moon
let dayPal   = [#9cc6e4, #d6e7ee, #56718c, #4b7fa3, #fff3cf]
let nightPal = [#172248, #2b3864, #1e2a4a, #121d3b, #eef1fa]
let pal      = if night then nightPal else dayPal

// A peak's outline, in units of its own size.
let rock = [(-1, 0), (-0.42, -0.52), (-0.18, -0.86), (0, -1), (0.4, -0.66), (1, 0)]

scene {
  size: (960, 540)
  background: pal[0]
  duration: 4

  rectangle haze { position: (480, horizon), origin: (0.5, 1), size: (960, 90), color: pal[1] }
  circle sun {
    position: (if night then 720 else 260, 110), radius: 34, color: pal[4]
    animate { property: scale, to: 1.1, duration: 1, loop: true, yoyo: true }
  }

  group peak1 { position: (gap, horizon), scale: (half, heights[0])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak2 { position: (2 * gap, horizon), scale: (half, heights[1])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak3 { position: (3 * gap, horizon), scale: (half, heights[2])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }

  rectangle lake { position: (480, horizon), origin: (0.5, 0), size: (960, 540 - horizon), color: pal[3] }
  text caption {
    position: (480, 470), fontSize: 26, color: #f2e8d5
    content: if night then "GOODNIGHT FROM THE LAKES" else "GREETINGS FROM THE LAKES"
  }
}
```

The haze, the three peaks and the lake are placed from `horizon`, so they all
rise 40 pixels together, and the lake, whose height is `540 - horizon`, grows
40 pixels taller to stay down to the bottom edge. The sun and the caption are
placed with plain numbers, so they stay where they were. A shape follows a
value only if it is written from it.
:::

:::try Add a fourth peak
Add a fourth peak, 180 pixels high, on the right of the other three. The four
should be evenly spaced across the card.

```marey
let night   = false
let horizon = 300
let heights = [150, 210, 130]
let gap     = 960 / (length(heights) + 1)
let half    = 170

//              sky      haze     rock     lake     sun or moon
let dayPal   = [#9cc6e4, #d6e7ee, #56718c, #4b7fa3, #fff3cf]
let nightPal = [#172248, #2b3864, #1e2a4a, #121d3b, #eef1fa]
let pal      = if night then nightPal else dayPal

// A peak's outline, in units of its own size.
let rock = [(-1, 0), (-0.42, -0.52), (-0.18, -0.86), (0, -1), (0.4, -0.66), (1, 0)]

scene {
  size: (960, 540)
  background: pal[0]
  duration: 4

  rectangle haze { position: (480, horizon), origin: (0.5, 1), size: (960, 90), color: pal[1] }
  circle sun {
    position: (if night then 720 else 260, 110), radius: 34, color: pal[4]
    animate { property: scale, to: 1.1, duration: 1, loop: true, yoyo: true }
  }

  group peak1 { position: (gap, horizon), scale: (half, heights[0])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak2 { position: (2 * gap, horizon), scale: (half, heights[1])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak3 { position: (3 * gap, horizon), scale: (half, heights[2])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }

  rectangle lake { position: (480, horizon), origin: (0.5, 0), size: (960, 540 - horizon), color: pal[3] }
  text caption {
    position: (480, 470), fontSize: 26, color: #f2e8d5
    content: if night then "GOODNIGHT FROM THE LAKES" else "GREETINGS FROM THE LAKES"
  }
}
```

```marey solution
let night   = false
let horizon = 300
let heights = [150, 210, 130, 180]
let gap     = 960 / (length(heights) + 1)
let half    = 170

//              sky      haze     rock     lake     sun or moon
let dayPal   = [#9cc6e4, #d6e7ee, #56718c, #4b7fa3, #fff3cf]
let nightPal = [#172248, #2b3864, #1e2a4a, #121d3b, #eef1fa]
let pal      = if night then nightPal else dayPal

// A peak's outline, in units of its own size.
let rock = [(-1, 0), (-0.42, -0.52), (-0.18, -0.86), (0, -1), (0.4, -0.66), (1, 0)]

scene {
  size: (960, 540)
  background: pal[0]
  duration: 4

  rectangle haze { position: (480, horizon), origin: (0.5, 1), size: (960, 90), color: pal[1] }
  circle sun {
    position: (if night then 720 else 260, 110), radius: 34, color: pal[4]
    animate { property: scale, to: 1.1, duration: 1, loop: true, yoyo: true }
  }

  group peak1 { position: (gap, horizon), scale: (half, heights[0])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak2 { position: (2 * gap, horizon), scale: (half, heights[1])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak3 { position: (3 * gap, horizon), scale: (half, heights[2])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }
  group peak4 { position: (4 * gap, horizon), scale: (half, heights[3])
    polygon rock { position: (-1, -1), origin: (0, 0), points: rock, color: pal[2] } }

  rectangle lake { position: (480, horizon), origin: (0.5, 0), size: (960, 540 - horizon), color: pal[3] }
  text caption {
    position: (480, 470), fontSize: 26, color: #f2e8d5
    content: if night then "GOODNIGHT FROM THE LAKES" else "GREETINGS FROM THE LAKES"
  }
}
```

Two changes: a fourth height in `heights`, and a fourth group that reads
`heights[3]` and stands at `4 * gap`. The list now has four elements, so `gap`
becomes 960 / 5 = 192 instead of 240, and the first three peaks move closer
together on their own, to 192, 384 and 576, leaving room for the fourth at 768.
The new group is written before the lake, like the others, so the lake still
draws over the peaks' bases.
:::

## Recap

- `let name = value` names a value, before the scene or inside any block. A
  name cannot be given a second value in the same block, and the named colours
  cannot be names. ([let](/reference/language/#let))
- A name can be used in the block that gives it and in the blocks inside it.
  An inner block may give the same name again; inside it, the inner value
  counts. ([let](/reference/language/#let))
- Any value can be a calculation: `+`, `-`, `*`, `/`, `%` and parentheses,
  worked out once, when the file compiles. Dividing by zero is a compile error.
  ([Expressions](/reference/language/#expressions))
- `[a, b, c]` is a list. `l[i]` is its element at index `i`, counting from 0,
  and `length(l)` is how many elements it has. An index outside 0 to
  `length(l) - 1` is a compile error. ([Expressions](/reference/language/#expressions))
- `if C then A else B` chooses a value. `C` must be a boolean, from `true`,
  `false`, a comparison, or `and`, `or` and `not`, and `A` and `B` must be the
  same kind. ([Expressions](/reference/language/#expressions))
- `sin` and `cos` take degrees, and `(r * cos(a), r * sin(a))` is a point `r`
  away at angle `a`, clockwise from the right because y grows downwards.
  ([Expressions](/reference/language/#expressions))
- Data decides values; the source decides which objects there are. An `if`
  never adds or removes a shape, so a shape that is sometimes hidden is always
  there, with a value that hides it.
  ([Where expressions stop](/reference/language/#where-expressions-stop))
