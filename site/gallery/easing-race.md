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
in the lane's y and the easing. Under each runner, a dark rim is
one more circle with the same move, so the two travel as one; the rim keeps
the runner readable when it stops on the finish squares.

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
