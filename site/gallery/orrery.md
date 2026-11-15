---
title: Orrery
summary: A brass orrery under the stars. Three planets ride turning arms around a glowing sun, each spinning on its own axis, and the middle one carries a moon.
tags:
- lesson
- loop
- text
poster: 4
lesson: groups
---

A mechanical model of a small solar system, seen from above. Every motion in
it is a group turning inside another group. The scene lasts twelve seconds and
loops without a seam. It is the showcase of
[the lesson on groups](/learn/groups/).

### One group for the machine

`group system` sits at the centre of the scene with `position: (480, 270)`, and
everything that turns is inside it. Every position inside is therefore
measured from the sun: an outer planet at `position: (236, 0)` is 236 pixels
from it, whichever way its orbit has turned.

### An orbit is a turning group

Each orbit is a group with no `position`, so its (0, 0), its pivot, is the
sun's centre. It holds a brass arm and a planet placed along its x axis, and
it turns: the outer orbit starts at `rotation: 250` and has
`to: 610, duration: 12, easing: linear, loop: true`, one full turn every twelve
seconds. The arm and the planet go round because they are the group's
children. The middle orbit turns in six seconds and the inner one in four.
The outer orbit is written first, so the inner arms pass over it.
[The lesson on groups](/learn/groups/) covers a group's pivot.

### Three turns for one planet

Inside each orbit, the planet is a group at the end of the arm, and inside the
planet is its surface, another group, which turns on its own: the outer
planet's has `to: 360, duration: 4`. On screen the surface's turn and the
orbit's add up. The bands, the storm, the continent and the inner planet's
crater are all written about the planet's centre, so they turn about it.

### A night side that faces away from the sun

The planet's own group does not turn, so its axes stay the orbit's, and the
sun is always on its -x side. The night side is a dark half disc on the +x
side, written directly in that group: it keeps facing away from the sun all
the way round. Its `origin: (0, 0.5)` puts its pivot on its straight edge, so
that edge sits on the planet's centre.
[The lesson on shapes](/learn/shapes/) covers `origin`.

### A moon that keeps one face to its planet

`group moonOrbit` is inside the middle planet, so its pivot is the planet's
centre and it is carried round the sun with the planet. It turns once every
three seconds. The moon's crater is on the side facing the planet and turns
with the orbit, so the planet always sees the same face.

The moon's night side must not turn with its orbit. It sits in one more group,
`moonLight`, with `to: -360, duration: 3`: the same rate the other way. The two
turns cancel, so that group's axes are the planet's again, and the moon's
night side faces away from the sun like the planets'.

### A glow that breathes

The sun's light is twelve faint circles in one group, `corona`, each step of
`alpha: 0.03` small enough that no edge shows. One `animate` on the group,
`to: 1.08, duration: 3`, with `loop` and `yoyo`, scales all twelve together.
The sun itself sits in a brass cup, written after the orbits, so it covers the
roots of the arms.

### Every period divides twelve

The orbits turn in 12, 6 and 4 seconds, the surfaces in 4, 3 and 2, the moon in
3, and the glow and the twinkling stars on periods of 2, 3, 4 and 6 seconds.
Every one divides the scene's twelve, and nothing is delayed, so the last frame
matches the first. [The lesson on timing](/learn/timing/) covers seamless
loops.
