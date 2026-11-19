---
title: Aurora
summary: Curtains of light sway and stretch over snow-capped mountains, shifting between greens and violets, while the stars twinkle and smoke rises from a cabin, on a seamless 12-second loop.
tags:
- generative
- loop
poster: 4
---

A winter night in the mountains. Four curtains of aurora hang over two
snow-capped ranges, each swaying, stretching and changing colour on its own
period, with stars above, a shooting star at seven seconds, and a cabin
below. The light is all translucent polygons and lines. The scene lasts
twelve seconds, and its last frame is the same as its first.

### A curtain is six faint ribbons

`template Curtain(w, amp, phase, tall, lo, hi, beat)` draws one curtain.
Its lower edge is a sine wave sampled 13 times across its width, every 30
degrees: `let low` holds `amp * sin(phase)`, `amp * sin(phase + 30)` and so
on to `amp * sin(phase + 360)`. Then
`generate f, n in [0.2, 0.36, 0.52, 0.68, 0.84, 1]` draws six ribbons that
share that edge, each reaching up a larger share of `tall`, each at
`alpha: 0.085`. On their own they are barely there. Along the lower edge all
six overlap, and in a curtain at full alpha together they cover about 41
percent of what is behind them, 1 - 0.915 to the sixth power. Higher up,
fewer of them reach. So each curtain is brightest at its edge and fades
upward, without a gradient anywhere. [The lesson on shapes](/learn/shapes/)
covers alpha and polygon points, and [the lesson on generate](/learn/generate/)
covers the loop.

Each ribbon's top rises and falls on a wave, shifted by `50 * n` degrees for
ribbon n, so the six tops do not run parallel. `let env` is
`sin(15)` to `sin(165)` with 0 at both ends, and every top is pulled down by
it, so every ribbon comes back to the edge at both ends and the curtain
tapers instead of ending in a cut. A `line hem` traces the lower edge in a
brighter stroke, and 24 `line ray` strokes rise from it, their lengths
following the same taper, each flickering on its own beat.
[The lesson on values](/learn/values/) covers `sin` and lists.

### Placing a shape by its lowest point

A polygon's `position` places its `origin`, a point of its bounding box.
The box of a ribbon depends on all those sines, so its centre is hard to
know. Its lowest point is not: `phase` is always a multiple of 30, so one of
the 13 samples lands on 90 degrees, and `sin` is exact there, so the lowest
point of every ribbon is exactly `amp`. `position: (0, amp), origin: (0.5, 1)`
pins the middle of the box's bottom edge to (0, `amp`), and every point is
then drawn where it was written. The snow caps use the other corner:
`template Cap(px, py, lx, ly, rx, ry, tint)` has `origin: (0, 0)`, and its
position is its peak's height and its left corner's x, the top left of its
box. [The lesson on shapes](/learn/shapes/) covers `origin`.

### Greens into violets

Each ribbon also animates its colour:
`animate { property: color, to: if n < 3 then hi else lo, duration: beat, loop: true, yoyo: true }`.
The three low ribbons go from `lo` to `hi` and the three tall ones the other
way, so a curtain that is green at its edge and violet above slowly turns
the other way round and back. `use Curtain(620, 28, 0, 180, jade, violet, 6) sheet { }`
takes 6 seconds each way; two curtains blend on 3. The colours are named in
`let` bindings, and `jade` is not called `green` because `green` is already
a colour keyword and cannot be a name. The airglow low in the sky, the ridge
line and the snow caps blend the same way over 6 seconds, so the mountains
seem to catch the light. [The lesson on colour](/learn/colour/) covers
animating `color`.

### Four curtains, four rhythms

Each curtain sits in its own group, and the group does the moving. The high
left one has
`animate { property: position, to: (340, 190), duration: 3, loop: true, yoyo: true }`,
`animate { property: scale, to: (1.08, 1.22), duration: 1.5, loop: true, yoyo: true }`
and `animate { property: rotation, to: 3, duration: 6, loop: true, yoyo: true }`,
so it drifts, stretches and leans on three periods at once. The curtain's
lower edge waves around its group's own (0, 0), so a scale stretches it
upward while the edge stays close to where it was. The other curtains do the
same on other periods, and the far one is a little dimmer, `alpha: 0.7`.
[The lesson on groups](/learn/groups/) covers animating a group, and
[the lesson on timing](/learn/timing/) covers loop and yoyo.

### Mountains, stars and a cabin

The two ranges are polygons with `origin: (0, 0)`. Each is positioned at
the top left of its box, whose top is its highest peak, so its points are
scene coordinates. Seven `use Cap` lines
put snow on the peaks: each cap's outer corners lie 36 percent of the way
down the two ridges, `px + (rx - px) * 0.36`, so the snow sits on the slope
whatever its angle. Pines are a `template Pine(s)`: three triangles on a trunk.

The stars twinkle on beats of 1, 1.5, 2 and 3 seconds. The cabin's smoke is
a loop that restarts: each puff rises on a `loop: true` position animation,
and fades in and out on a yoyo of half that duration,
`animate { property: alpha, to: 0.22, duration: d / 2, loop: true, yoyo: true }`.
The yoyo is back at its start, alpha 0, exactly when the rise starts again,
so the jump back to the chimney is never seen.
[The lesson on templates](/learn/templates/) covers parameters.

### One period for the loop

Every looping animation is a yoyo or a loop whose cycle is 1.5, 2, 3, 4, 6
or 12 seconds, and each of those divides 12. Nothing is delayed except the
shooting star, `delay: 7`, which plays once from 7 seconds and has faded
before 7.8. In Chromium, the frames at 0 and 12 seconds are identical, pixel
for pixel. [The lesson on timing](/learn/timing/) covers seamless loops.
