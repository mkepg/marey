---
title: Logo reveal
summary: The Marey mark, a sun over three ridges, assembles one part at a time, then the name fades in and the finished lockup holds.
tags:
- text
source: src/examples/logo-reveal.marey
---
A reveal is a timeline: each part waits for its moment, arrives, and stays. The
sun starts at once; the three ridges and the name each wait for their own
`delay` before they move.

### A shaded sun from two circles

The sun is a rim and a disc. The disc is slightly smaller and lifted,
`position: (0, -8), radius: 91` inside a rim of 96, so the rim's colour shows as
a crescent along the bottom and the sun looks lit from above. There is no
gradient or shading in the language. The look comes from two flat circles
overlapping. The lesson on shapes covers this.

### The sun grows in

`group sun` starts small and invisible, `scale: (0.4, 0.4), alpha: 0`, and a
`parallel` runs three animations together: a rise and a growth to full size,
both `duration: 1.1, easing: easeOut`, and a fade in over `duration: 0.6`.
Because they are on the group, the rim and the disc grow as one.

The `sequence` around the `parallel` has a single step, so here it plays the
same as three plain `animate` blocks would, since those also start together.
Written this way, a later step, such as a hold or an exit, can be added after
the `parallel` without restructuring. The lessons on groups and on sequences
cover both forms.

### Three ridges from one template

`template Ridge(shade, delay, peaks)` takes a colour, a start time and an
outline. The ridge starts 70 pixels low and transparent, at
`position: (400, 346 + 70)`, and rises `to: (400, 346)` while it fades in. Its
`origin: (0.5, 1)` puts the pivot at the bottom centre, so the outline's points
are measured up from the horizon line.

The template's parameter `delay` is passed straight to the animation's property,
`delay: delay`. The three uses pass 0.9, 1.2 and 1.5 as their second argument,
so the ridges start 0.3 seconds apart: the back ridge lands first and the front
one last. Each use has an empty body, `back {}`, because the template places the
ridge itself. The lessons on templates and on timing cover this.

### The horizon is drawing order

The ridges are written after the sun, and objects draw in source order, so the
ridges cover the lower part of the sun. That overlap is the mark: a sun on the
horizon. The language has no clipping or masking; covering is how a shape is
partly hidden. The lesson on shapes covers drawing order.

### The name, last

`text name` with `content: "marey", fontSize: 64` waits for `delay: 2.2`, then
rises 20 pixels and fades in over 0.9 seconds. It starts just before the front
ridge settles at 2.3 seconds, so the parts overlap slightly instead of queuing.
The lockup is complete at 3.1 seconds and holds until the scene ends at 5.

A bounded scene that is not playing shows its last frame, which here is the
finished lockup. That is why this gallery card needs no poster time. The lessons
on shapes (text) and on timing (delay) cover this.
