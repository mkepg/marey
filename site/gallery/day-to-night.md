---
title: Day to Night
summary: A city skyline from noon through dusk, night and dawn and back to noon. The sky, the clouds and the buildings change colour together, the windows light up one by one, and the moon crosses the stars.
tags:
- lesson
- loop
poster: 3.5
lesson: colour
---

Twelve seconds of a day over a city, seen from across a river: noon, dusk,
night, dawn, and noon again, so the last frame is the first and the scene loops
without a seam. Nearly every change in it is a colour animation. It is the
showcase of [the lesson on colour](/learn/colour/).

### Four colours for every shape

The sky is nine bands. Each band has one `sequence` of four steps of three
seconds, like `animate { property: color, to: #c25577, duration: 3 }`: to its
dusk colour, to its night colour, to its dawn colour, and back to the day
colour it started with. A colour blends one channel at a time, so each band
finds its own way between the four, and the default easeInOut lets each time
of day settle before the next begins. The lowest bands take the warmest dusk
colours, so the afterglow stays on the horizon after the sun has gone.

The two clouds, the three rows of buildings, the river and the quay have the
same four steps with colours of their own. Every one of them changes at 3, 6, 9
and 12 seconds, so the picture changes as one. The rows of buildings are each a
single polygon, crowns, spire and mast included, so a row needs one sequence
however many buildings it holds. [The lesson on sequences](/learn/sequence/)
covers steps.

### The sun and the moon on one turn

The sun and the moon ride one group under the middle of the skyline, 380 pixels
above and below its centre, and the group turns once in the whole scene:
`animate { property: rotation, to: 360, duration: 12, easing: linear, loop: true }`.
The sun sets on the right soon after two seconds, the moon comes up on the left
on the far side of the same turn, and the sun climbs back over the left-hand
roofs in the last two seconds. The moon's own group turns back with `to: -360`,
so the moon keeps its craters the same way up. The sun reddens as it sinks, and
the moon turns from amber to silver at the top of its arc.
[The lesson on groups](/learn/groups/) covers motions that add up through
nested groups.

### Windows that light one at a time

Each window has a sequence of two colour steps, each with a step `delay`: wait,
then warm to lamplight in 0.4 seconds; wait again, then cool to dark glass with
`duration: 0.6, delay: 5.6`. The first delays differ from window to window,
between 2.2 and 4.8 seconds, so the city lights up a window at a time, and
because the second wait is the same for all, they go out in the morning in the
order they came on. The last is dark again at 11.4 seconds.

### Stars and lights that only show at night

A group has no colour, so a group of shapes cannot change colour as one. It
does have `alpha`, and a group's alpha multiplies with its children's. The
stars are in one group that starts at `alpha: 0`, rises after sunset and falls
before sunrise. Each star twinkles on its own all the time, with yoyo loops
whose periods divide twelve seconds, but is only seen while its group is up.
The lights on the water are a second such group.
[The lesson on timing](/learn/timing/) covers the periods.
