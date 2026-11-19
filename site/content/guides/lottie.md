---
title: Edit an export in a Lottie editor
description: What a Marey Lottie export contains, layer by layer, how its keyframes are fitted with real easing handles, what is baked into it, what was measured in lottie-web, dotlottie-web and Glaxnimate, and how to retime a motion in the file.
---

`marey export --format lottie` writes a Lottie animation: JSON that a Lottie
player draws with no Marey code, and that a Lottie editor can open. This guide
describes what is in that file, so you know what you are looking at when you
open it, and what the measurements behind it do and do not show.

:::note
How keyframes are written changed between versions. **0.6.0**, the version on
npm, writes one keyframe per frame for everything that moves. **0.7.0**, the
version this site documents, fits a few keyframes with easing handles to each
motion. 0.7.0 is not published yet. The layers and shapes are the same in both.
:::

## One layer per object

Every object in the scene becomes one layer, named with the object's own name:
a rectangle `box` is the layer `box`, and the objects a `generate` makes have
the names the compiler gives them, such as `dot_0` and `dot_1`. The layer list runs
from the top of the picture down, the reverse of the order the scene draws in,
because Lottie draws the first layer in the list on top.

| In the scene | In the file |
|---|---|
| `group` | A null layer, which draws nothing. Its children are parented to it, so moving, turning or scaling it carries them. |
| `circle` | A shape layer holding an ellipse and a fill. |
| `rectangle` | A shape layer holding a rectangle and a fill. |
| `polygon` | A shape layer holding a closed path and a fill. |
| `line` | A shape layer holding an open path and a stroke. |
| `text` | A shape layer holding the outlines of its glyphs as paths, and a fill. |
| `background` | A solid layer the size of the scene, named `background`, at the bottom of the list. |

Text is not a Lottie text layer. Each line is laid out in the font the export
uses, and the outline of every glyph becomes an ordinary path, so a player
needs no font and draws the letters exactly as exported. To change the words,
change the scene and export again. A character the font has no glyph for stops
the export with `[LOTTIE_TEXT_MISSING_GLYPH]`, rather than drawing something
other than the preview.

Each layer's transform holds what can move: position, scale, rotation and
opacity. A shape's colour is on its fill or stroke. The layer's anchor is the
object's pivot, the point its position places (`origin` sets it,
[Shapes](/reference/language/#shapes)), and it never moves. The shapes
themselves never change: a radius, a size or a polygon's points are fixed, as
they are in the scene.

## What is baked

Everything that moves in a scene ends up as keyframes on those properties. The
file holds no `animate`, `sequence` or `physics` blocks, and no Lottie
expressions:

- `loop`, `yoyo`, `delay`, sequences and handoffs are played out at export,
  and written as the keyframes they produce.
- Physics is simulated at export, and each body's path is written as
  keyframes. Moving a keyframe does not re-run the simulation: a ball you
  retime no longer hits what it hit.
- Opacity is flattened. In a Lottie file, a parent passes its transform to its
  children and not its opacity, so each layer's opacity is its own `alpha`
  multiplied by every enclosing group's. To fade a group, fade each layer in
  it. (The group's own null layer carries its alpha too, which has no visible
  effect in the players measured: a null layer draws nothing, and its opacity
  is not passed on.)
- Lottie cannot hide a layer for part of its time, so where the scene hides an
  object, the file sets that layer's opacity to 0.

## Fitted keyframes (0.7.0)

0.7.0 writes each moving property as a few keyframes joined by cubic easing
curves, close to what a person would set by hand. This scene moves a box
across in 2 seconds with `easeOut`, and holds it for a third second:

```marey
scene {
  size: (960, 540)
  duration: 3
  background: #0f172a

  rectangle box {
    position: (160, 270)
    size: (80, 80)
    color: #38bdf8
    animate { property: position, to: (800, 270), duration: 2, easing: easeOut }
  }
}
```

Exported at 30 frames a second, the box's position in the file is:

```json
{"s":true,
 "x":{"a":1,"k":[
   {"t":0,"s":[160],"o":{"x":[0.3333333333333333],"y":[0.6666666666666352]},"i":{"x":[0.6666666666666666],"y":[1.0000000000000315]}},
   {"t":60,"s":[800],"o":{"x":[0.3333333333333333],"y":[0.3333333333333333]},"i":{"x":[0.6666666666666666],"y":[0.6666666666666666]}},
   {"t":89,"s":[800]}]},
 "y":{"a":0,"k":270}}
```

Three keyframes on x, at frames 0, 60 and 89, and a y that never changes.
0.6.0 writes the same position as one `[x, y]` track of 90 keyframes, one per
frame, each joined to the next by a straight line. Reading the 0.7.0 file:

- **Position is split** into `x` and `y` (`"s": true`) whenever it moves, and
  each is keyframed on its own. A position that never moves stays one `[x, y]`
  value.
- **Keyframe values are exact.** Each keyframe's value `s` is the scene's value
  at that frame. The frames between keyframes follow the curve, within a
  tolerance too small to see: 0.004 px for position, 0.0004 percentage points
  for scale, 0.0002° for rotation, 0.05 on opacity's 0 to 100 scale, and for
  colour, up to a quarter of one 8-bit level above the sampled level, so a
  player that rounds a channel down still draws the sampled level.
- **The easing is on the keyframe that starts a segment.** `o` and `i` are the
  curve's two handles. Their `x` values are always 1/3 and 2/3, and the `y`
  values carry the curve: `(1/3, 2/3)` and `(2/3, 1)` is the `easeOut` above,
  starting at twice the average speed and arriving at none. Handles of
  `(1/3, 1/3)` and `(2/3, 2/3)` are a straight line, the hold from frame 60.
  A `y` can lie outside 0 to 1, from -1 to 2, when a motion overshoots inside
  one segment.
- **The last keyframe** holds only `t` and `s`.
- **Scale and colour** stay single values with several components, and one
  easing shared by all of them on each segment.
- **Some keyframes carry a name, `n`**, such as `e` followed by 16 hex digits.
  dotlottie-web caches easing curves by their handles rounded to two decimals,
  and drew different curves that round alike with the first one's curve, up to
  0.96 px off. The name, derived from the exact handle values, keeps them
  apart. It is written only on keyframes whose rounded handles would collide.

A motion the curves fit well, such as an `animate` with any easing, comes out
as a few keyframes. Physics comes out denser, as Ledges shows below, and so
does colour, which a scene blends in whole 8-bit steps.

### What fitting changed, measured

From the measurements recorded with the encoder, at 30 frames a second:

| Scene | Keyframes, one per frame | Keyframes, fitted | JSON bytes before | JSON bytes after |
|---|---|---|---|---|
| Dusk over layered hills | 23,760 | 3,941 | 2,036,666 | 768,839 |
| Ledges (physics) | 14,040 | 4,256 | 1,229,171 | 704,174 |
| Bar chart reveal | 2,100 | 76 | 202,059 | 72,759 |
| Logo reveal | 1,950 | 74 | 142,990 | 21,455 |

In Dusk over layered hills, the ten colour tracks hold 2,228 of the 3,941
fitted keyframes, against 3,600 at one per frame. The whole Lighthouse scene,
exported by each version as [lesson 14](/learn/ship-it/#export) shows, is
1,304,303 bytes from 0.6.0 and 243,532 bytes from 0.7.0, with the same
`frames` hash.

In the two players measured, lottie-web 5.13 and dotlottie-web, every fitted
file of the five example scenes and six easing fixtures matched the
one-keyframe-per-frame file. In lottie-web, every layer's transform at every
compared frame was within the tolerances above of the one-per-frame file's
(position within a further 0.0001 px). In both players, the fitted file's
pixels differed from Marey's own PNG export by no more than the one-per-frame
file and copies of it shifted by up to 0.004 px differ, plus 2 levels: both
rasterizers turn a sub-pixel shift into whole pixels, so an exact pixel match
is not a meaningful bar. Between frames, as on a 60 Hz screen playing a 30
frames a second file, lottie-web drew the eased box at half frames between its
positions at the whole frames either side. dotlottie-web draws only whole
frames, so it was not measured between them.

## In an editor

One editor has been tried, Glaxnimate 0.6.0, on the fitted file of the scene
above:

- On opening, it shows an issue dialog, `Invalid value for
  box.Transform.position`. The warning is about the split position. Its
  importer warns about it and then reads `x` and `y` and joins them, so the
  motion imports.
- Saved again from Glaxnimate as Lottie, the file has one combined position
  with keyframes at frames 0, 60 and 89, the same times as the fitted `x`, each
  with easing handles. Glaxnimate rewrites the handle lengths, `(0.167, 0.333)`
  and `(0.833, 1)` in place of `(1/3, 2/3)` and `(2/3, 1)`, and keeps the same
  slope at both ends: 2 at the start and 0 at the end.

That is the extent of it. Nobody scrubbed Glaxnimate's timeline or dragged a
handle, so nothing is claimed about editing curves in its interface, and no
other editor has been tried. A 0.6.0 file has one keyframe per frame on every
moving property, so retiming one by hand means moving every keyframe.

## Retime a motion

In Lottie, a segment's easing is normalised to the segment: its handles are
fractions of the time and of the change in value between two keyframes. So moving a
keyframe in time stretches or squeezes the segments on either side and keeps
their curves' shapes. To make the box above arrive in 1 second instead of 2,
move the keyframe at frame 60 to frame 30, in the file or on an editor's
timeline:

```json
   {"t":30,"s":[800],"o":{"x":[0.3333333333333333],"y":[0.3333333333333333]},"i":{"x":[0.6666666666666666],"y":[0.6666666666666666]}},
```

The slide is still an `easeOut`, now over 30 frames, and the hold that follows
it is longer. A few things to keep in step when you retime:

- A position is two tracks. Move the matching keyframes on `x` and on `y`,
  where both have them, or the path changes shape.
- A scene usually starts several things at once. Retiming one leaves the others
  where they were.
- A keyframe's time `t` must stay between its neighbours' times.
- Physics keyframes are a recording of one simulation. Retime a physics scene
  by changing the scene and exporting again.

When a change is bigger than moving keyframes, change the scene and export
again: the source is the version of the animation that every format comes from.
