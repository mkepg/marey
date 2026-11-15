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
stars, dawn, sun, clouds, headlands, sea, the path of light, the lit band on the
horizon, the boat, and the dunes and reeds last. The sun is written before the sea, so the sea hides it until it
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

Eight bands is a choice, not a requirement: three or four would draw a dawn
too, but in wide, hard steps. Eight keep each step of colour small, so the sky
reads as a gradient even though every band is one flat colour.

### The sun's glow

The sun is four circles with one position and one move,
`to: (600, 205), duration: 6`, written largest first, from `radius: 96` down to
`radius: 52`. Each sits on the one before, so their colours stack into two
rings of glow, a rim and a core. They start at `position: (600, 430)`, where
even the largest circle's top edge, at y = 334, is just below the horizon at
y = 330.

### Clouds with lit undersides

The clouds are written after the sun, so it rises behind the low one. Each
cloud is a flat base with a circle on each end to round it off, heaped with
circles of different sizes; the low cloud's base is `size: (230, 12)` and its
largest heap `radius: 23`. Before the base comes a warm copy of it, 4 pixels
lower. The base covers all of that copy except a strip along the bottom: the
light catching the cloud's underside.

### A boat on the lit horizon

The fishing boat is three rectangles, a mast, a cabin and a hull, each with the
same 30-pixel move; the hull's is `to: (836, 333), duration: 6`. They travel
together only because their moves match. The lesson on groups moves a set of
shapes with a single `animate`.

### The path of light

The sun's reflection is ten thin rectangles under it, wider the nearer they
are, rather than one pale bar: broken light reads as moving water, where a
single bar reads as a painted stripe. All ten start on the horizon at
`position: (600, 335)` or beside it, hidden behind a lit band of water,
`size: (960, 10)`, that is written after them. Each moves down to its own
place, from `to: (600, 342)` for the farthest to `to: (604, 477)` for the
nearest. All ten take the full six seconds, so the nearest, which has the
furthest to go, moves fastest, and the path spreads from under the sun towards
you as the sun rises.

### Dunes from very large circles

A circle much larger than the frame shows only a shallow arc of its top. The
near dune is `position: (860, 1320), radius: 820`, so its highest point is at
y = 500, and its edge falls out of the frame on either side. The beach between
the dunes is one more such circle. The dunes, the beach and the reeds, thin
upright rectangles, are written last, so they are in front of everything else.
