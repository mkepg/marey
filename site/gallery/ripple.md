---
title: Ripple
summary: A drop lands in a field of 336 lights, and three rings run out from it in colour, each fainter than the last, until the water is still and the next drop falls.
tags:
- lesson
- generative
- loop
poster: 3
lesson: generate
---

A drop falls into the middle of a 24 by 14 grid of lights, and three rings of
light spread out from the splash, changing colour as they go: gold near the
centre, through coral and rose, to violet and blue in the corners. Every light
is written once in the source. The scene lasts ten seconds and loops without a
seam. It is the showcase of [the lesson on generate](/learn/generate/).

### 336 lights from one

The lights come from `generate row in 0 to rows - 1` with
`generate col in 0 to cols - 1` inside it, so the inner block runs once for
every cell: `let cols = 24` and `let rows = 14` make 336 lights, `let gap = 36`
pixels apart. Each pass works out its own `let dx = col - midC` and
`let dy = row - midR`, the light's place counted from the centre, which falls
between the four middle lights. A light is a group of three circles, a core
and two wide, faint halos, so when the lights swell, the halos run into each
other and a ring reads as one band of light.
[The lesson on generate](/learn/generate/) covers nested loops and a `let`
inside a loop.

### A wave from the squared distance

Each light waits `let wait = d2 * lag` seconds before its first pulse, with
`let d2 = dx * dx + dy * dy` and `let lag = 0.02`. Marey has no square root, so
the delay grows with the squared distance rather than the distance. Lights the
same distance from the centre still share a squared distance, so the rings stay
round, and a light farther out always waits longer, so the wave reaches the
lights in order. The square only changes the speed: the wave reaches the top
and bottom rows in 0.85 seconds, the sides at 2.65 and the corners at 3.49,
fast at first and slowing as it spreads. Every light has the same pulses and
only the delay differs, so the rings keep their shape.
[The lesson on timing](/learn/timing/) covers phase offsets from `delay`.

### Colour by arrival

`palette` lists eight colours. The squared distance is always a whole number
plus a half, so `let step = (d2 - 0.5) / 2` is a whole number from 0 to 87, and
`let ring = (step - step % 11) / 11` counts it in elevens: subtracting the
remainder leaves a multiple of 11, and dividing gives a whole number from 0 to
7, the index of the light's colour. Each colour covers the lights the wave
reaches in the same 0.44 seconds. [The lesson on values](/learn/values/) covers
`%` and indexing.

### Three pulses, not a loop

A light's `sequence` holds three pulses, two seconds apart, each smaller and
dimmer than the last: it grows `to: 2.4`, then to 2 and to 1.6. Each pulse
rises in 0.15 seconds and dies away in 0.75, and the next waits 1.1, which
makes two seconds from one to the next. Only the first step has `delay: wait`.
A looping pulse with a delay would leave a seam when the scene restarts, so the
pulses are written as steps instead, and each light ends on the scale and alpha
it started with. The corner lights finish last, at 8.4 seconds.
[The lesson on sequences](/learn/sequence/) covers `parallel` steps.

### The drop and the splash

The drop is a group that holds unseen for nine seconds, then falls: seen from
above, it moves away from you, so it shrinks to `to: 0.8` as it brightens. It is
gone into the water at 9.9 seconds, and a last step resets its size while it
cannot be seen. The scene then starts again with the splash, three discs that
flash at the centre and spread as they fade, so the drop seems to land in it.

### Depth behind the lights

`generate r in [440, 370, 300, 235, 170, 110]` makes six discs on the centre,
each at `alpha: 0.09`. The middle of the field is covered by all six, so it is
the lightest, and the corners stay near the dark of the water. Their group
brightens briefly as each ring leaves the middle, at 0, 2 and 4 seconds.
