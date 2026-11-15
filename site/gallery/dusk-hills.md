---
title: Dusk over layered hills
summary: The sun sets behind four ridges and falls asleep, the sky turns to night and the stars come out, then it all runs back, on a 12-second loop.
tags:
- generative
- loop
poster: 3
source: src/examples/dusk-hills.marey
---
This is the playground's opening scene. Almost every motion in it is one
animation going out for six seconds and coming back for six:
`duration: 6, loop: true, yoyo: true`. The others, the stars' twinkle, the
birds' wings and the flock's crossing, use periods that divide 12 seconds, so
the end of the loop matches its start.

### Day to night is a colour animation

The sky is six bands from `generate c, i in day`. Each band starts at its day
colour and animates to the band at the same index in a second list:
`animate { property: color, to: night[i], duration: 6, loop: true, yoyo: true }`.
Two lists of the same length, read with one index, keep each day colour paired
with its night colour. The ridges do the same with `to: shades[i]`. Colours
blend channel by channel, so the sky passes through the in-between shades on its
own. [The lesson on colour](/learn/colour/) covers this, and the lesson on generate covers the
two-name form `c, i`.

### Stars that come out at night

The twenty stars sit inside `group nightfall`, which fades from `alpha: 0` to 1
and back. Each star also twinkles on its own, fading to 0.3 and back over
`duration: beat`, and a group's alpha multiplies with its children's, so the
stars twinkle all the time but are only visible as night falls. The beats
`[0.5, 0.75, 1, 1.5][i % 4]` give the twinkles four different periods, so the
stars drift in and out of step. [The lesson on groups](/learn/groups/) and the lesson on templates
cover this.

### A face measured in one number

The sun's face is written in fractions of `let R = 115`: the eyes have
`radius: 0.094 * R`, the brows sit at `-0.5315 * R`, and the line thickness is
`let stroke = 0.052 * R`. Change R and the whole face rescales with it. The two
eyes and brows come from `generate s in [-1, 1]`, where `s` mirrors each x
offset, as in `s * 0.281 * R`, and each brow's tilt. [The lesson on values](/learn/values/) covers
`let` and arithmetic, and the lesson on generate covers looping over a list.

### Falling asleep

As the sun sinks, three things happen on the same six-second beat. The eyes
close by squashing their height: `to: (1, 0.15)`. Each brow is a group with two
animations, a drop in position and `property: rotation, to: s * 10`, and an
object's `animate` blocks all start together, so the brow lowers and droops at
once. The `group mouth` shrinks with `to: (0.7, 0.7)`. A group scales about its
own (0, 0), and the smile line sits there with `origin: (0.5, 1)`, which puts
the arc's lowest point on that spot, so the smile shrinks towards its lowest
point rather than its middle.

A Marey line ends flat at its end points. The brows and the smile get round ends
from a circle of `radius: stroke / 2` placed on each end point. [The lesson on
animation](/learn/animate/), [the lesson on shapes](/learn/shapes/) and
[the lesson on groups](/learn/groups/) cover these.

### A smile from sine and cosine

The smile is 13 points on a circular arc, written as `rho * sin(-6 * st)` and so
on up to `6 * st`. `let rho = (half * half + sag * sag) / (2 * sag)` is the
radius of a circle through the arc's ends and its lowest point, from its
half-width and depth. The language has `sin` and `cos` but no inverse, so the
angle step is computed once and written as a number, `let st = 7.0053`. The
arc's half-angle is asin(half / rho), and `st` is a sixth of it, as the comment
beside it says, so six steps either side of the middle point reach the arc's two
ends. [The lesson on values](/learn/values/) covers `sin`, `cos` and the expressions around them.

### Hills from two waves

Each ridge is a row of nine numbers in `let ridges`, unpacked with
`let x = r[0]` and its neighbours: centre, sample spacing, baseline, and an
amplitude, step and phase for each of two sine waves. The ridge's top edge is 13
samples of `b + a*sin(p) + c*sin(q)`, with each wave's phase moved on by its
step from one sample to the next. Straight segments between the samples make the
peaks, and the farther ridges sample more tightly, 84 pixels apart against 160
for the nearest, so their peaks crowd closer together. Each outline closes at y
620, below the frame, and `origin: (0, 1)` pins its bottom-left corner to
`position: (x-6*w, 620)`, so every point is a scene coordinate.

The ridges are written after the sun, and objects draw in source order, so the
sun sets behind them. It sinks by `to: (0, sink)`, deep enough to drop it below
the farthest ridge. [The lesson on values](/learn/values/) and the lesson on generate cover the ridges,
[the lesson on shapes](/learn/shapes/) covers origin, and
[the first lesson](/learn/first-scene/) covers drawing order.

### The flock

`template Bird(up, down)` is a body and two wings. Each wing is a group that
rotates between the two angles: it starts at `rotation: s * up` and animates
`to: s * down, duration: 0.25`. The middle bird is `use Bird(40, 0) left`, with
the angles swapped, so it beats against the other two. The whole flock moves
from `position: (-130, 0)` to `to: (930, 0)` in six seconds, linearly, starting
and ending off screen, so the jump back to the start is never seen. The lesson
on templates and [the lesson on timing](/learn/timing/) cover this.
