---
title: Sunrise
summary: The sun climbs out of the sea as the colours of dawn climb the sky, built from circles, rectangles and one kind of animation.
tags:
- lesson
lesson: first-scene
---

Every shape in this scene is a `circle` or a `rectangle`, and every motion is an
`animate` on `position` with nothing but `property`, `to` and `duration`. It is
the showcase of [the first lesson](/learn/first-scene/), which teaches all of
it.

### Depth from drawing order alone

Nothing in the scene says which shape is in front. A shape covers every shape
written before it, so the order of the file is the order from back to front:
stars, dawn, sun, clouds, headlands, sea, the path of light, and the dunes and
reeds last. The sun is written before the sea, so the sea hides it until it
rises. [The first lesson](/learn/first-scene/) covers drawing order.

### Stars that go out

Nothing fades here. The twelve stars sit on the `background: #141838`, and the
eight dawn bands rise over them, so a star goes out when the top edge of a band
reaches it. The stars nearest the top of the frame are above where the highest
band stops, and stay lit to the end.

### A sky that grades as it lightens

Each dawn band is `size: (960, 400)`, far taller than the strip of sky it
shows. Its top edge is where its colour begins, and the rest of it hangs down
behind the sea. The bands start low and rise by different amounts: the coolest
ends with `to: (480, 240), duration: 5`, 160 pixels above where it started, and
the warmest with `to: (480, 515), duration: 6`, only 40 pixels up. So the warm
colours stay close to the horizon while the cool ones climb, and the upper
bands, with shorter durations, settle first.

### The sun's glow

The sun is four circles with one position and one move,
`to: (600, 205), duration: 6`, written largest first, from `radius: 96` down to
`radius: 52`. Each sits on the one before, so their colours stack into two
rings of glow, a rim and a core. They start at `position: (600, 430)`, where
even the largest circle's top edge, at y = 334, is just below the horizon at
y = 330.

### Clouds with lit undersides

The clouds are written after the sun, so it rises behind the low one. A cloud
is a bar with a small circle on each end to round it off, `radius: 4.5` on a
bar 9 pixels tall, over a thin rectangle of warm colour that shows below it:
the light catching the cloud's underside.

### A boat on the lit horizon

The fishing boat is three rectangles, a mast, a cabin and a hull, each with the
same 30-pixel move; the hull's is `to: (836, 333), duration: 6`. They travel
together only because their moves match. The lesson on groups moves a set of
shapes with a single `animate`.

### The path of light

Ten thin rectangles below the sun, wider the nearer they are, start out of
sight below the frame and rise into place, the farthest to `to: (600, 336)`.
All ten take the full six seconds, so the farthest, which has the furthest to
go, moves fastest, and the path lengthens towards the horizon as the sun
clears it.

### Dunes from very large circles

A circle much larger than the frame shows only a shallow arc of its top. The
near dune is `position: (860, 1320), radius: 820`, so its highest point is at
y = 500, and its edge falls out of the frame on either side. The dunes and the
reeds, thin upright rectangles, are written last, so they hide the path of
light until it rises past them.
