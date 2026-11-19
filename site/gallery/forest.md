---
title: Forest
summary: Three rows of pines sway under a full moon, fog breathes between them, and fireflies blink in the clearing. Every tree is one template, used 38 times.
tags:
- lesson
- generative
- loop
poster: 4.5
lesson: templates
---

A pine forest at night, seen across a clearing: a far row of short, pale trees,
a middle row, and six tall dark trees framing the view, all swaying, with fog
between the rows and fireflies over the grass. Every tree comes from one
template. The scene lasts twelve seconds and loops without a seam. It is the
showcase of [the lesson on templates](/learn/templates/).

### One tree, drawn from its foot

`template Tree(height, tone, sway)` draws a pine upward from its own (0, 0),
the foot of its trunk. Every size is a fraction of `height`: the trunk, three
triangular tiers each standing on its base line with `origin: (0.5, 1)`, and a
copy of each tier's right half in pale light at `alpha: 0.09`, so every tree
is lit from the upper right. All of it sits in `group crown` at (0, 0). A group turns about its own
(0, 0), so the tree bends from the foot of its trunk, as a tree in the wind
does. [The lesson on templates](/learn/templates/) covers drawing a template
around the point it should turn on.

### The sway comes from the parameter

The crown starts at `rotation: -sway` and swings `to: sway` and back, so the
argument sets how far a tree leans each way. A negative `sway` starts the tree
leaning the other way, half a period out of step with a tree of the same
height and a positive `sway`.
`duration: if height > 160 then 3 else 2` makes tall trees swing more slowly:
there and back in six seconds above 160 pixels, four below, and both divide the
scene's twelve. [The lesson on values](/learn/values/) covers `if`.

### Depth from the arguments

The three rows are 38 uses of the same template, and they differ in what they
pass it and where they stand. The far row is twenty trees from 76 to 112 high,
in a pale `#34416b`, with sways of a degree or less. The middle row is twelve
trees from 140 to 196 high in `#1c2644`. The near row is six trees from 240 to
380 high in a near-black `#090d1a`, standing below the bottom edge so that only
their crowns are seen, and swaying up to 2.6 degrees. The rows are drawn far to
near, so each one covers the one behind. The far row reads its heights with
`i % 5` and its gaps and sways with `i % 4`; the middle row reads all three with
`i % 4`, as in `[150, 178, 140, 196][i % 4]`. So neighbouring trees differ.
Each row is inside its own group, so all three can call their copies `tree`.
[The lesson on templates](/learn/templates/) covers `use` inside a `generate`,
and [the lesson on generate](/learn/generate/) covers the loop itself.

### Fog that breathes

`template Fog(tone, depth)` is three long strips on one centre, at alpha 0.08,
0.1 and 0.12, the widest the palest, so the bank's edges look soft. Its group
drifts `to: (40, 0)` and back over twelve seconds and fades between 0.5 and 1
over six. It is used three times: over the far row's foot, over the middle row's,
and low across the clearing.

### Fireflies

`template Firefly(wait, drift)` hovers out to the offset `drift` and back every
four seconds and blinks three times, 3.7 seconds apart. Twenty of them come from
a `generate` over their places, each passed `(i * 1.3) % 3.4` as its wait,
which scatters the first blinks between 0 and 3.3 seconds. Blinks on loops
staggered by `delay` would leave a seam, because a loop that starts after a
delay waits again when the scene restarts, as [the lesson on timing](/learn/timing/)
shows. So each firefly's blinks are steps of a `sequence`, the first delayed by
`wait`, and the last firefly is dark again at 11.9 seconds.

### Moon, sky and clearing

The sky is ten bands from `generate c, i in sky`. The moon's glow is six discs
from `generate r in [170, 132, 100, 76, 58, 45]`, each at `alpha: 0.035`, so
the light builds towards the moon. In the clearing, four more faint discs sit in
a group with `scale: (1, 0.22)`, which flattens them into ellipses of moonlight
lying on the grass. The stars twinkle on beats of 1, 1.5, 2 and 3 seconds.
