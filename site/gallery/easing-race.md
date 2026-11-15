---
title: Easing Race
summary: Four runners cover the same distance in the same two seconds, each with a different easing, and leave trails that draw each easing's shape.
tags:
- lesson
- text
lesson: animate
---

Four lanes, one easing each. Every runner crosses the same 640 pixels in the
same two seconds, so the race always ends in a dead heat; what differs is how
each one spends the time. It is the showcase of
[the lesson on animation](/learn/animate/).

### Same distance, same time

Each runner is one `animate` on `position`. The `easeIn` runner's is
`to: (840, 248), duration: 2, easing: easeIn`, and the other three differ only
in the lane's y and the easing. Under each runner are two more circles with
the same move, so the three travel as one: a soft glow in the runner's own
colour, `radius: 28` at `alpha: 0.18`, and a dark rim that keeps the runner
readable when it stops on the finish squares.

### A trail drawn by copies

Behind each runner are seven faint circles. Each starts on the start line with
the runner and has the runner's easing and duration, but a nearer `to`: the
place the runner reaches one eighth of the way through the race, two eighths,
and so on. For the `easeIn` lane the sixth copy has `to: (560, 248)`, where the
runner is at 1.5 seconds. While the race runs, each trail is the whole race shrunk to fit
behind its runner. At two seconds it is drawn out at full size, like a
photograph that caught each runner every quarter of a second.

Faint lines cross the track every 80 pixels, an eighth of the distance. The
`linear` copies sit on them. The `easeIn` copies crowd the start and the
`easeOut` copies crowd the finish, and the `easeInOut` copies crowd both ends.

### The curve beside each name

Beside each lane's name is a small graph of its easing: a `line` through the
same eighths the trail uses, with time across and distance up. It has
`origin: (0, 1)`, which pins the bottom-left corner of its box to its
`position`, so each point is an offset from that corner: 3 pixels across per
eighth of the time, and up by 16 pixels times the fraction of the distance
covered. The `easeIn` curve passes `(21, -12.25)`: at seven eighths of the
time, its runner has covered 49/64 of the way. A faint L under each curve
draws the two axes. [The lesson on shapes](/learn/shapes/) covers `line` and
`origin`.

### A clock that fills

The scoreboard's clock is a bar with `origin: (0, 0.5)`, which pins its left
end, and `scale: (0, 1)`, no width at all. It grows with
`to: (1, 1), duration: 2, easing: linear`, so it fills at an even rate and is
full as the runners finish. Seven dark cuts split it into eighths, one for each
copy in the trails. [The lesson on animation](/learn/animate/) covers `scale`
and easing, and [the lesson on shapes](/learn/shapes/) covers `origin`.

### Flags that wait without waiting

The flags have to appear as the runners arrive, but this scene uses only the
first three lessons, and waiting for a moment, `delay`, comes in
[the lesson on timing](/learn/timing/). So each flag starts growing at once and
hides it. The pole and the pennant share one pivot, the pole's foot, 72 pixels
below the lane; the pennant's `origin: (0, 7)` puts that pivot seven
pennant-heights below the top of its own box. Both grow from `scale: (1, 0)`
with `easing: easeIn`, slowly at first. The lane below is written after the
flag and covers its foot, so the pole only clears the lane line after a second
and a half, then shoots up in the last half second.

### Drawn top to bottom

Each lane, its label and its flag are written before the next lane, which is
what lets each lane hide the foot of the flag above it. The infield is written
after the last flag for the same reason. The markings, the finish squares and
the runners come last, so they are drawn over every lane.
[The first lesson](/learn/first-scene/) covers drawing order.
