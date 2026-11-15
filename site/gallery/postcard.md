---
title: Postcard
summary: A mountain-lake picture postcard laid out from named values. One switch turns it to night; one number moves the horizon, and the peaks, the lake and the shore with it.
tags:
- lesson
- loop
- text
poster: 2
lesson: values
---

A picture postcard of three peaks over a still lake, with their reflections, a
shore of pines and a caption. The landscape is laid out from a few named
values at the top of the source, the horizon, the peak heights and two
palettes, so changing one of them restyles the card. The details inside it,
the stars, the clouds and the pines' places along the shore, are plain numbers.
It lasts eight seconds and loops without a seam. It is the
showcase of [the lesson on values](/learn/values/).

### One switch

`let night = false` decides the time of day. Two palettes list the same parts
of the picture in the same order, and `let pal = if night then nightPal else dayPal`
picks one, so `pal[4]` is the far peak's colour by day or by night. The same
switch moves the disc and changes its size, turning the sun into the moon, and
chooses the caption.

### Positions from a few numbers

The horizon is `let horizon = 300`, and the shore is `let shore = horizon + 96`.
The sky bands, the peaks, the lake, the reflections and the shimmer on the water
are all placed from them, so changing the horizon moves the landscape. The
sun, the clouds and the stars are placed with plain numbers, so they stay put.
The peaks are spaced with `let gap = (W - 2 * inset) / (length(heights) + 1)`,
so the spacing follows the number of heights in the list.

### Peaks from one outline

A peak's rock and its snow cap are each written once, as a list of points in
units of the peak's own size: x from -1 to 1 across the base, y from -1 at the
summit to 0 at the foot. Each peak is a group at its foot, with
`scale: (half, heights[1])` for the middle one, which stretches the outline to
that peak's size. Inside, `origin: (0, 0)` with the outline's top-left corner
as `position` puts each point at its own coordinates, so the cap lands on the
rock's slopes. [The lesson on groups](/learn/groups/) covers how a group's
scale reaches its children.

### A mirror written out

The reflections are the same three groups below the horizon, with lists whose
every y is negated. A negative `scale` is a compile error, so a mirror image
has to be written rather than flipped. Each reflection group has
`alpha: 0.4`, and a group's alpha multiplies with its children's, so the rock
and the snow dim together. Each shape is still drawn on its own, so where the
reflections overlap, the middle peak's shows faintly through the nearer ones,
like layers of tinted glass. [The lesson on colour](/learn/colour/) covers
both.

### Rays from sin and cos

By day, eight short lines stand around the sun, each placed at its angle with
`cos` and `sin`, as in `position: (54 * cos(45), 54 * sin(45))`, and turned
to face outwards with the same angle as its `rotation`. Their group turns 45
degrees in eight seconds, the gap between two rays, so when the scene starts
again the rays are back in a picture identical to the first frame. The clouds
drift there and back on yoyos of four seconds each way, and the shimmer on the
lake on periods of two and four seconds.

### Values, never shapes

No `if` in the scene decides whether a shape exists. The moon's craters are
always there, with `alpha: if night then 0.1 else 0`, and so are the rays, in a
group whose alpha is 0 at night. The stars are in a group whose alpha is 1 at
night and 0 by day. Reading the source tells you exactly which objects the card
has, whichever way the switch is set.
