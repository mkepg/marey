---
title: Shapes, colour and placement
summary: Draw polygons, lines and text, write colours and transparency, and decide exactly which point of a shape its position puts in place.
description: Lesson 2 of the Marey course. Polygons, lines and text, hex and named colours, alpha, rotation, the pivot and origin, layer, and fitting a scene to its frame.
minutes: 20
learn:
- Draw polygons, lines and text
- Write colours as hex codes or by name, and make shapes see-through with alpha
- Rotate a shape, and choose the point it turns about with origin
- Change what is drawn on top with layer
- Choose how a scene fills a frame of another shape with fit
showcase: set-sail
---

[Your first scene](/learn/first-scene/) drew circles and rectangles and moved
one. This lesson adds the other three kinds of shape, then turns to colour and
to placement: which point of a shape its `position` puts in place, and how to
change that point. The showcase above is built from these ideas, and it moves
with nothing but the first lesson's `animate`.

## Five kinds of shape

Here is one of each kind. Look at how each is described:

```marey
scene {
  size: (960, 540)
  background: #1d2c48

  circle sun      { position: (120, 270), radius: 60, color: #e4553b }
  rectangle cabin { position: (300, 270), size: (120, 80), color: #fbf3e4 }
  polygon sail    { position: (480, 270), color: #efe0c4
                    points: [(0, -70), (60, 50), (-60, 50)] }
  line gull       { position: (650, 270), thickness: 4, color: #fbf3e4
                    points: [(-50, 0), (-25, -25), (0, 0), (25, -25), (50, 0)] }
  text title      { position: (840, 270), content: "SAIL", fontSize: 40, color: #fbf3e4 }
}
```

The polygon and the line start their properties on one line and carry on to
the next. Commas separate properties on a line, a line break separates them
too, and the two styles can be mixed in one block.

- A `polygon` is a filled outline. Its `points` are a list of points in square
  brackets, at least three, measured from the shape's `position`.
- A `line` joins its `points` in order, at least two, with a stroke `thickness`
  pixels wide. It is not filled: the gull is five points and four strokes.
- A `text` draws its `content`, a string in double quotes of at most 500
  characters, at `fontSize` pixels. `fontSize` is optional and defaults to 16.

A polygon needs at least three points, because two points enclose nothing:

```marey error
scene {
  size: (960, 540)

  polygon sail { position: (480, 270), points: [(0, -70), (60, 50)] }
}
```

## Colours

A colour is a hex code or a name. The hex code is `#` and six digits, two each
for red, green and blue, from `00` to `ff`, or three digits, one for each. So
`#ff8800` and `#f80` are the same orange. There are nine names: `red`, `green`,
`blue`, `white`, `black`, `yellow`, `cyan`, `magenta` and `orange`. A shape with
no `color` is white.

```marey
scene {
  size: (960, 540)
  background: black

  circle a { position: (180, 270), radius: 70, color: #e4553b }
  circle b { position: (330, 270), radius: 70, color: #f80 }
  circle c { position: (480, 270), radius: 70, color: yellow }
  circle d { position: (630, 270), radius: 70, color: #2f8a94 }
  circle e { position: (780, 270), radius: 70 }
}
```

The last circle has no `color`, so it is white. Any other word is not a colour.
The compiler reads `purple` as a name you have not defined, and says so:

```marey error
scene {
  size: (960, 540)

  circle plum { position: (480, 270), radius: 70, color: purple }
}
```

Write the colour as a hex code instead, for example `#7a3a9a`.

## Transparency

`alpha` is how opaque a shape is, from `0` (invisible) to `1` (solid), which is
the default. Where see-through shapes overlap, each one lets what is under it
show through, so the overlaps come out stronger:

```marey
scene {
  size: (960, 540)
  background: #1d2c48

  circle coral { position: (420, 230), radius: 120, color: #e4553b, alpha: 0.6 }
  circle teal  { position: (540, 230), radius: 120, color: #2f8a94, alpha: 0.6 }
  circle cream { position: (480, 330), radius: 120, color: #fbf3e4, alpha: 0.6 }
}
```

This is how the showcase's sun gets its glow: two large, faint circles under
a solid one, `alpha: 0.14` and `alpha: 0.24`, strongest where they overlap
next to the sun.

`alpha` must be between 0 and 1. The compiler rejects anything outside that
range rather than clamping it:

```marey error
scene {
  size: (960, 540)

  circle glow { position: (480, 270), radius: 120, alpha: 1.5 }
}
```

## Which point position places

Every shape has one point, its **pivot**, that `position` puts in place. By
default the pivot is the centre of the shape's bounding box: the smallest
upright rectangle that holds the whole shape. For a circle or a rectangle that
is simply its centre, which is why the first lesson could say so.

For a polygon or a line it may not be the point `(0, 0)` you wrote the points
around. In this sample the red dot marks the triangle's `position`, and the
faint rectangle is the triangle's bounding box:

```marey
scene {
  size: (960, 540)
  background: #1d2c48

  // The points run from y = -80 to y = 40, so the box's centre is at y = -20.
  polygon sail { position: (480, 270), color: #efe0c4
                 points: [(0, -80), (70, 40), (-70, 40)] }
  rectangle box { position: (480, 270), size: (140, 120), color: white, alpha: 0.15 }
  circle pivot  { position: (480, 270), radius: 5, color: #e4553b }
}
```

The dot sits in the middle of the box. The triangle's point `(0, 0)` is 20
pixels below it, and the tip at `(0, -80)` ends up 60 pixels above the dot,
not 80. When you want points to read as plain offsets from `position`, write
them so the box is centred on `(0, 0)`, or move the pivot with `origin`.

## Moving the pivot: origin

`origin` picks the pivot as a fraction of the bounding box: `(0, 0)` is its
top-left corner, `(1, 1)` its bottom-right, and `(0.5, 0.5)`, the default, its
centre. The most useful value is `(0.5, 1)`, the bottom centre: a shape whose
`position` is on a line then **stands** on that line.

Each bar below has its `position` on the ground line, at y = 400. Watch where
each one ends up:

```marey
scene {
  size: (960, 540)
  background: #1d2c48

  line ground { position: (480, 400), points: [(-360, 0), (360, 0)], thickness: 2, color: #fbf3e4 }

  // Default origin: the bar's centre is on the line, so it straddles it.
  rectangle middle { position: (300, 400), size: (60, 180), color: #2f8a94 }

  // origin (0.5, 1): the bottom centre is on the line, so it stands on it.
  rectangle standing { position: (480, 400), size: (60, 180), color: #e4553b, origin: (0.5, 1) }

  // origin (0.5, 0): the top centre is on the line, so it hangs below it.
  rectangle hanging { position: (660, 400), size: (60, 120), color: #efe0c4, origin: (0.5, 0) }
}
```

The three bars share one y, and only `origin` differs. The showcase stands its
mast and its lighthouse on their feet the same way, and sets each sail's lower
corner beside the mast with `origin: (0, 1)` and `origin: (1, 1)`, the bottom
corners of each sail's box.

`origin` can also go past 0 and 1, which puts the pivot outside the shape. The
next section turns a bar about such a point.

## Rotation

`rotation` turns a shape by a number of degrees about its pivot. A positive
angle turns it clockwise on screen, and a negative one anticlockwise. The
default is `0`.

The three orange bars below are the same size and each is turned by 30
degrees. Only their `origin` differs. The faint bars show them unturned, and
the dots mark each pivot. Watch where each bar ends up relative to its dot:

```marey
scene {
  size: (960, 540)
  background: #1d2c48

  // Turned about its centre: it spins in place.
  rectangle ghostA { position: (170, 270), size: (160, 44), color: white, alpha: 0.15 }
  rectangle barA   { position: (170, 270), size: (160, 44), color: #f1ae79, rotation: 30 }
  circle pivotA    { position: (170, 270), radius: 5, color: #e4553b }

  // Turned about the middle of its left end: it swings down from there.
  rectangle ghostB { position: (370, 270), size: (160, 44), color: white, alpha: 0.15, origin: (0, 0.5) }
  rectangle barB   { position: (370, 270), size: (160, 44), color: #f1ae79, rotation: 30, origin: (0, 0.5) }
  circle pivotB    { position: (370, 270), radius: 5, color: #e4553b }

  // Turned about a point 80 px to the left of its left end.
  rectangle ghostC { position: (650, 270), size: (160, 44), color: white, alpha: 0.15, origin: (-0.5, 0.5) }
  rectangle barC   { position: (650, 270), size: (160, 44), color: #f1ae79, rotation: 30, origin: (-0.5, 0.5) }
  circle pivotC    { position: (650, 270), radius: 5, color: #e4553b }
}
```

The first bar stays centred on its dot. The second keeps its left end on the
dot and swings down from it. The third has `origin: (-0.5, 0.5)`: half the
bar's width to the left of its box, so its pivot is 80 pixels from the bar,
in empty space. Turning it moves the whole bar round that point, as if on an
invisible arm.

The showcase fans its sun's rays this way. Each ray is one thin wedge whose
points start at `(0, 0)`, with `origin: (0.5, 1)` so its pivot is that tip.
Every ray has the sun's centre as its `position` and a different `rotation`,
so they all turn about the sun.

## What is drawn on top: layer

Shapes are drawn in the order they are written, as in the first lesson. `layer`
overrides that order: a shape with a higher layer is drawn in front of one with
a lower layer. Every shape is on layer `0` unless it says otherwise, a layer may
be negative, and shapes on the same layer keep their written order.

Both halves of this sample write a sun and then a sea that overlaps it, in the
same order. Only the right-hand sun has a `layer`. Look at which sun its sea
covers:

```marey
scene {
  size: (960, 540)
  background: #f6d7b0

  // Left: written order decides. The sea comes second, so it covers the sun.
  circle sunA    { position: (250, 300), radius: 90, color: #e4553b }
  rectangle seaA { position: (250, 420), size: (380, 240), color: #1e6174 }

  // Right: the same two shapes in the same order, but the sun is on layer 1.
  circle sunB    { position: (710, 300), radius: 90, color: #e4553b, layer: 1 }
  rectangle seaB { position: (710, 420), size: (380, 240), color: #1e6174 }
}
```

On the left, the sea is written after the sun, so it covers the sun's lower
half. On the right, the sun is on layer 1 and its sea on the default layer 0,
so the whole sun is drawn in front of the sea, although the sea comes later in
the file. Delete `layer: 1` and the right-hand sun sinks behind its sea like
the left one. Putting `layer: -1` on `seaB` instead gives the same picture as
`layer: 1` on `sunB`: what counts is which of the two layers is higher.

The showcase writes its title and its border first, because that is what the
poster says first, and puts them on `layer: 1` so they are drawn over
everything else.

## Fitting a scene to its frame

A scene's `size` is fixed, but the box it is shown in may have another shape.
`fit` chooses what happens then. It takes one of four words:

- `contain`, the default: scale the scene until it fits inside the box, keeping
  its proportions. The whole scene shows, with empty bands where the shapes
  differ.
- `cover`: scale it until it fills the box, keeping its proportions. Nothing is
  left empty, but the edges may be cut off.
- `fill`: stretch each direction separately to fill the box exactly. The scene
  may look squashed.
- `none`: no scaling. The scene is drawn at its own size from the box's top-left
  corner.

The players on this page are wider than they are tall. This scene is square:

```marey
scene {
  size: (540, 540)
  background: #1d2c48
  fit: contain

  circle sun { position: (270, 270), radius: 200, color: #e4553b }
  rectangle sea { position: (270, 450), size: (540, 180), color: #1e6174 }
}
```

With `contain` it shows whole, between two empty bands. Change it to `cover`,
`fill` and `none` and compare. `fit` changes only how the scene is shown,
never the coordinates you write. It is a word, not a string: `fit: "cover"`
does not compile.

## Reading the showcase

Open "Show the source" under the Set Sail player at the top of the page:

- **The title and the border** are written first and drawn last, with
  `layer: 1`. The title and its banner share a `position` and a `rotation`, so
  they tilt together about one point.
- **The sky** is eight rectangles, each stopping 2 pixels short of the next, so
  a fine line of the background shows between them.
- **The rays** are one wedge written seven times, turned about the sun's centre
  with `origin: (0.5, 1)` and `rotation`, and lightened with `alpha`.
- **The sun** is a solid circle on two faint, larger ones.
- **The gulls** are lines through five points, each tilted with `rotation`.
- **The lighthouse** stands on the headland with `origin: (0.5, 1)`.
- **The sea** is five bands written after the sun, with short lines for the
  sun's reflection and for the waves.
- **The boat** is seven shapes. Each carries the same `animate`, 220 pixels to
  the right over the whole eight seconds, so they sail together. The mast
  stands on the deck, and the sails and the pennant hang from the mast, each by
  its own `origin`. A later lesson, on groups, moves a set of shapes with a
  single `animate`.

## Try this

Each exercise starts from a smaller version of the poster, cut down to the
parts that exercise needs.

:::try Make it night
Recolour the poster for a crossing by moonlight: a dark sky, a pale moon in
place of the sun, dark water, and a title you can still read.

```marey
scene {
  size: (960, 540)
  duration: 8
  background: #f6d7b0

  circle halo { position: (620, 300), radius: 110, color: #f26b45, alpha: 0.2 }
  circle sun  { position: (620, 300), radius: 70,  color: #e4553b }
  rectangle sea { position: (480, 435), size: (960, 210), color: #1e6174 }

  line gull1 { position: (400, 160), rotation: -8, thickness: 2.5, color: #1d2c48
               points: [(-15, -1), (-8, -7), (0, 0), (8, -7), (15, -1)] }
  line gull2 { position: (450, 200), rotation: 12, thickness: 2, color: #1d2c48
               points: [(-11, -1), (-6, -5), (0, 0), (6, -5), (11, -1)] }

  polygon hull { position: (250, 430), color: #1d2c48
                 points: [(-74, -12), (74, -12), (54, 12), (-60, 12)]
                 animate { property: position, to: (470, 430), duration: 8 } }
  line mast    { position: (250, 418), origin: (0.5, 1), thickness: 3, color: #1d2c48
                 points: [(0, 0), (0, -150)]
                 animate { property: position, to: (470, 418), duration: 8 } }
  polygon sail { position: (254, 410), origin: (0, 1), color: #fbf3e4
                 points: [(0, 0), (0, -136), (90, 0)]
                 animate { property: position, to: (474, 410), duration: 8 } }

  text title { position: (210, 80), content: "SET SAIL", fontSize: 56, color: #1d2c48 }
}
```

```marey solution
scene {
  size: (960, 540)
  duration: 8
  background: #0f1a33

  // A pale moon with a faint glow, in place of the red sun.
  circle halo { position: (620, 200), radius: 90, color: #f1e9d2, alpha: 0.12 }
  circle sun  { position: (620, 200), radius: 46, color: #f1e9d2 }
  rectangle sea { position: (480, 435), size: (960, 210), color: #0b2238 }

  // Light gulls show against the dark sky.
  line gull1 { position: (400, 160), rotation: -8, thickness: 2.5, color: #c9d3e6
               points: [(-15, -1), (-8, -7), (0, 0), (8, -7), (15, -1)] }
  line gull2 { position: (450, 200), rotation: 12, thickness: 2, color: #c9d3e6
               points: [(-11, -1), (-6, -5), (0, 0), (6, -5), (11, -1)] }

  polygon hull { position: (250, 430), color: #05101e
                 points: [(-74, -12), (74, -12), (54, 12), (-60, 12)]
                 animate { property: position, to: (470, 430), duration: 8 } }
  line mast    { position: (250, 418), origin: (0.5, 1), thickness: 3, color: #05101e
                 points: [(0, 0), (0, -150)]
                 animate { property: position, to: (470, 418), duration: 8 } }
  polygon sail { position: (254, 410), origin: (0, 1), color: #c9d3e6
                 points: [(0, 0), (0, -136), (90, 0)]
                 animate { property: position, to: (474, 410), duration: 8 } }

  text title { position: (210, 80), content: "SET SAIL", fontSize: 56, color: #f1e9d2 }
}
```
:::

:::try Turn the boat around
Make the boat face left and sail from right to left. Mirror the hull's and the
sail's points, change the `origin` that sets the sail's corner beside the
mast, and swap where the boat starts and ends.

```marey
scene {
  size: (960, 540)
  duration: 8
  background: #f6d7b0

  circle halo { position: (620, 300), radius: 110, color: #f26b45, alpha: 0.2 }
  circle sun  { position: (620, 300), radius: 70,  color: #e4553b }
  rectangle sea { position: (480, 435), size: (960, 210), color: #1e6174 }

  polygon hull { position: (250, 430), color: #1d2c48
                 points: [(-74, -12), (74, -12), (54, 12), (-60, 12)]
                 animate { property: position, to: (470, 430), duration: 8 } }
  line mast    { position: (250, 418), origin: (0.5, 1), thickness: 3, color: #1d2c48
                 points: [(0, 0), (0, -150)]
                 animate { property: position, to: (470, 418), duration: 8 } }
  polygon sail { position: (254, 410), origin: (0, 1), color: #fbf3e4
                 points: [(0, 0), (0, -136), (90, 0)]
                 animate { property: position, to: (474, 410), duration: 8 } }
}
```

```marey solution
scene {
  size: (960, 540)
  duration: 8
  background: #f6d7b0

  circle halo { position: (620, 300), radius: 110, color: #f26b45, alpha: 0.2 }
  circle sun  { position: (620, 300), radius: 70,  color: #e4553b }
  rectangle sea { position: (480, 435), size: (960, 210), color: #1e6174 }

  // Every x in the points changes sign, so the shapes are mirrored.
  // The boat now starts on the right and ends on the left.
  polygon hull { position: (470, 430), color: #1d2c48
                 points: [(74, -12), (-74, -12), (-54, 12), (60, 12)]
                 animate { property: position, to: (250, 430), duration: 8 } }
  line mast    { position: (470, 418), origin: (0.5, 1), thickness: 3, color: #1d2c48
                 points: [(0, 0), (0, -150)]
                 animate { property: position, to: (250, 418), duration: 8 } }
  // The sail's corner at the mast is now the bottom-right of its box.
  polygon sail { position: (466, 410), origin: (1, 1), color: #fbf3e4
                 points: [(0, 0), (0, -136), (-90, 0)]
                 animate { property: position, to: (246, 410), duration: 8 } }
}
```

The mast is a straight up-and-down line, so mirroring it changes nothing.
:::

:::try Add a third gull
Add a third gull, a little larger than the others and tilted slightly
anticlockwise, flying higher and further left.

```marey
scene {
  size: (960, 540)
  duration: 8
  background: #f6d7b0

  circle halo { position: (620, 300), radius: 110, color: #f26b45, alpha: 0.2 }
  circle sun  { position: (620, 300), radius: 70,  color: #e4553b }
  rectangle sea { position: (480, 435), size: (960, 210), color: #1e6174 }

  line gull1 { position: (400, 160), rotation: -8, thickness: 2.5, color: #1d2c48
               points: [(-15, -1), (-8, -7), (0, 0), (8, -7), (15, -1)] }
  line gull2 { position: (450, 200), rotation: 12, thickness: 2, color: #1d2c48
               points: [(-11, -1), (-6, -5), (0, 0), (6, -5), (11, -1)] }
}
```

```marey solution
scene {
  size: (960, 540)
  duration: 8
  background: #f6d7b0

  circle halo { position: (620, 300), radius: 110, color: #f26b45, alpha: 0.2 }
  circle sun  { position: (620, 300), radius: 70,  color: #e4553b }
  rectangle sea { position: (480, 435), size: (960, 210), color: #1e6174 }

  line gull1 { position: (400, 160), rotation: -8, thickness: 2.5, color: #1d2c48
               points: [(-15, -1), (-8, -7), (0, 0), (8, -7), (15, -1)] }
  line gull2 { position: (450, 200), rotation: 12, thickness: 2, color: #1d2c48
               points: [(-11, -1), (-6, -5), (0, 0), (6, -5), (11, -1)] }
  // A new name, bigger points, a thicker stroke, and a negative
  // rotation for an anticlockwise tilt.
  line gull3 { position: (320, 110), rotation: -6, thickness: 3, color: #1d2c48
               points: [(-20, -1), (-10, -9), (0, 0), (10, -9), (20, -1)] }
}
```
:::

## Recap

- A `polygon` is filled and needs `points`, at least three. A `line` needs
  `points`, at least two, and a `thickness`. A `text` needs `content`, and its
  `fontSize` defaults to 16. ([Shapes](/reference/language/#shapes))
- A colour is `#` and three or six hex digits, or one of nine names; a shape
  without `color` is white. ([Scene model](/reference/language/#scene-model))
- `alpha` runs from 0 to 1 and defaults to 1; a value outside that range does
  not compile. ([Scene model](/reference/language/#scene-model))
- `position` places a shape's pivot, which by default is the centre of its
  bounding box. `origin` moves the pivot, as a fraction of that box.
  ([Scene model](/reference/language/#scene-model))
- `rotation` is in degrees, about the pivot
  ([Scene model](/reference/language/#scene-model)); a positive angle turns
  clockwise on screen, as the `spin` property's entry states
  ([Physics: Properties](/reference/language/#properties)).
- A higher `layer` is drawn in front; the same layer keeps written order.
  ([Scene model](/reference/language/#scene-model))
- `fit` is `contain`, `cover`, `fill` or `none`, and changes only how the scene
  is shown. ([Scene model](/reference/language/#scene-model))
