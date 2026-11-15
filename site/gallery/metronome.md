---
title: Metronome
summary: A wooden metronome ticks at sixty beats a minute while a row of lamps on its base counts the six beats of a seamless loop.
tags:
- lesson
- loop
poster: 2.3
lesson: timing
---

A metronome on a desk at night. The arm swings once a second, a lamp on the
base lights for each beat, and the glow on the desk pulses in time. The scene
lasts six seconds and loops without a seam. It is the showcase of
[the lesson on timing](/learn/timing/).

### One beat is one swing

Every part of the arm starts at `rotation: -28` and has
`to: 28, duration: 1, loop: true, yoyo: true`. With `yoyo`, `duration` is one
direction, so the arm takes one second to swing across, one beat, and two to
swing there and back. Two seconds divides the six, so at the end of the scene
the arm is back where it started. No easing is written, so the default
easeInOut slows the arm at each end, as a pendulum slows.

### Four parts, one pivot

The rod, the weight, the highlight on the weight and the knob on top are four
shapes with the same `position`, the rod's foot, and the same swing. The rod
stands on that point with `origin: (0.5, 1)`. The others sit higher up the arm,
so their `origin` is outside their own box: the weight's is `origin: (0.5, 7)`,
seven weight-heights below its top, and the knob's is `origin: (0.5, 25.5)`.
They swing together only because their moves match. The lesson on groups moves
a set of shapes with a single `animate`.
[The lesson on shapes](/learn/shapes/) covers `origin`.

### A shadow that swings

Before the arm comes a see-through black copy of its rod and weight, with its
pivot at `position: (490, 406)`, 10 pixels right of and 6 below the arm's. It
has the same swing, so it follows the arm across the recess like a shadow cast
by a light to the upper left. A wide rod at `alpha: 0.2` under a narrow one at
`alpha: 0.22` softens its edge.

### Lamps that count the beats

The six lamps on the base light one after another, one a beat. Each is a
once-only yoyo on `alpha`, from 0 up and back again: the fourth lamp's is
`duration: 0.45, delay: 3, yoyo: true, easing: easeOut`. The delays, none for
the first lamp and then 1 to 5, are the seconds at which each lamp's beat
starts, when the arm reaches the end of a swing. Without `loop`, a yoyo plays
once and ends on the value it started from, so the last lamp is dark again at
5.9 seconds and the first frame matches the last.

The lamps are not loops because a delay is spent once: a looping lamp held back
by a delay would sit still at the start of every play while its later cycles
move, and the restart would show. Written as once-only flashes, the lamps are
repeated by the player's loop instead.
[The lesson on timing](/learn/timing/) covers `delay` and seamless loops.

### A pulse on the desk

The lamps' light on the desk is one circle squashed flat with
`scale: (1, 0.1)`. Its alpha has
`duration: 0.5, loop: true, yoyo: true, easing: easeOut`: half a second down
from its brightest and half a second back, so one pulse a second. easeOut
leaves the bright value fast and returns to it fast, so each pulse peaks
sharply on the beat.

### A room lit from one side

The warm light on the wall is six circles at `alpha: 0.02` to `alpha: 0.03`,
stacked so the wall is brightest at the upper left. The metronome's body, the
sheet of music and the hill outside the window are polygons whose points are
written in scene coordinates, with `origin: (0, 0)` pinning the top-left of
each outline to its `position`. Nothing in the room moves: only the arm, its
shadow, the lamps and the glow do.
