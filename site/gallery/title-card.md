---
title: Title Card
summary: A broadcast-style title sequence. A frame opens, accent bars wipe in, the title rises with its underline and subtitle, holds, and everything leaves in reverse order.
tags:
- lesson
- text
poster: 3
lesson: sequence
---

A seven-second title card: everything enters in turn, holds for two seconds
and leaves in reverse order, then the scene ends on the empty background it
started on. It is the showcase of
[the lesson on sequences](/learn/sequence/).

### Wait, enter, hold, leave

Every part that comes and goes has one `sequence` of the same four kinds of
step: a hold while it waits, an entrance, a hold while the card is complete,
and an exit. The frame opens at 0, so its sequence has no wait. A hold is an
`animate` to the value the part already has, like the top bar's
`to: (1, 1), duration: 4.4`. Each part's steps add up to its moment on the
timeline, so no part refers to another. The comment at the top
of the source lists when each main part enters and leaves, from the frame
opening at 0 to the frame closing at 5.6 seconds.

### Bars that wipe

The two vermilion bars start at `scale: (0, 1)`, no width at all, and grow to
`(1, 1)`. The top bar's `origin: (0, 0.5)` pins its left end and the bottom
bar's `origin: (1, 0.5)` its right end, so they open towards each other. A thin
amber edge follows each bar 0.15 seconds later. Each exit is a `parallel` step
that shrinks the bar back to the end it grew from while it fades.
[The lesson on shapes](/learn/shapes/) covers `origin`, and
[the lesson on animation](/learn/animate/) covers `scale`.

### A title that rises

The title starts 26 pixels low and invisible, and enters in one `parallel`
step: a move of `duration: 0.8, easing: easeOut` and a fade of 0.6 seconds,
started together, so it is solid before it settles. The underline then draws
from the title's left edge, and the subtitle slides in after it. The title is
fifteen characters at `fontSize: 60`, 540 pixels wide, which is the
underline's width.

### A frame that unfolds

The corner marks, the label and the ruler are one group at the centre of the
scene with `scale: 0`, all folded into the group's (0, 0). Its sequence scales
it to 1 in half a second, holds, and scales it back to 0. The playhead on the
ruler has a plain `animate` across it in exactly seven seconds; it is inside
the frame, so its move and the frame's scaling add up.
[The lesson on groups](/learn/groups/) covers nested transforms.

### A slow push in

The bars and the text are in one group, `card`, with a single `animate` that
scales it to 1.04 over the whole seven seconds, like a camera moving slowly in.
The parts' own sequences run inside it at the same time. Behind everything, two
faint slanted shafts of light drift 60 pixels left and back, each with
`duration: 3.5, easing: easeInOut, yoyo: true` and no `loop`: a once-only
yoyo, which finishes where it started, at seven seconds. Every part of the
frame and the card is hidden from six seconds on, so the last frame matches
the first and the scene loops without a seam, as
[the lesson on timing](/learn/timing/) describes. A warm glow of ten faint
circles sits behind the title.
