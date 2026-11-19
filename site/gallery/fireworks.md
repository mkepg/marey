---
title: Fireworks
summary: Five rockets climb over a riverside city at night and burst into rings of sparks that fly out, droop, change colour and fade, while the river shows every burst again upside down.
tags:
- generative
- loop
poster: 8.6
---

A city on a river at night. Five rockets rise one after another from behind
the rooftops and burst into rings of sparks, each in its own palette, with a
scatter of glitter and a little smoke. The river repeats every burst upside
down. The scene lasts twelve seconds. Every rocket and spark plays once and
ends unseen, and the first and last frames are the same quiet sky, so the
loop has no seam.

### Five bursts from five lists

The whole display is data. `let launch = [0.2, 1.7, 3.3, 4.9, 6.5]` holds
when each rocket leaves and `let climb = [1.2, 1.3, 1.1, 1.25, 1.45]` how
long it climbs, so the bursts come at 1.4, 3, 4.4, 6.15 and 7.95 seconds.
`burstX` and `burstY` say where each one bursts, `reach` how far its outer
ring spreads, and `sparks` how many sparks that ring has.
`generate k in 0 to 4` builds one burst per index, and
`let t = launch[k] + climb[k]` is the moment it bursts.
[The lesson on values](/learn/values/) covers lists and indexing, and
[the lesson on generate](/learn/generate/) covers the loop.

### A rocket that slows as it climbs

`group rocket` is a bright `circle head` over five `circle trail` dots that
grow fainter the further they hang below it. Its `sequence` makes it visible
after `delay: launch[k]`, then climbs with
`animate { property: position, to: (burstX[k], burstY[k]), duration: climb[k], easing: easeOut }`.
`easeOut` starts fast and ends slow, which is how a rocket loses speed on the
way up. The rocket goes out as the burst begins. Each rocket starts at
y 400, below the rooftops, and is written before the city, so it rises from
behind the buildings. [The lesson on animation](/learn/animate/) covers
easing, [the lesson on sequences](/learn/sequence/) the steps, and
[the first lesson](/learn/first-scene/) drawing order.

### A ring of sparks

`template Ring(bx, by, r, n, turn, t, hues, k)` lays out `n` sparks with
`generate i in 0 to n - 1`. Each spark's angle is
`let ang = turn + i * 360 / n`, and `let dx = cos(ang)` and
`let dy = sin(ang)` turn that angle into a direction. A spark is a small
comet, `points: [(3, 0), (0, 1.6), (-22, 0), (0, -1.6)]`, turned with
`rotation: if k > 0 then ang else -ang` so its head points away from the
centre. Its points run from x -22 to 3, so `origin: (0.88, 0.5)` puts its
pivot at its own (0, 0), where the tail meets the head. Two sparks in three
fall a little short, `let jag = [1, 0.9, 0.95][i % 3]`, so the ring looks
ragged rather than drawn with a compass.

Each burst uses `Ring` twice. The outer ring has `sparks[k]` sparks. The
inner one reaches `reach[k] * 0.55` with `sparks[k] / 2` sparks, and is
turned by `180 / sparks[k]` degrees, half the outer ring's spacing, so each
of its sparks points between two outer ones. That makes 148 outer and 74
inner sparks across the five bursts. [The lesson on templates](/learn/templates/)
covers parameters, and [the lesson on values](/learn/values/) covers `sin`
and `cos`.

### Out, down and fading, in one sequence

Every spark runs the same three steps. The first,
`animate { property: alpha, to: 1, duration: 0.04, delay: t }`, keeps it
hidden at the centre until its burst. The second is a `parallel` that flies
it out for 1.3 seconds with `easing: easeOut`, while
`animate { property: color, to: hues[1], duration: 1.3, easing: easeIn }`
warms it from near-white to its hue and its scale grows. The third carries it
12 percent further out and 36 px lower, as if falling, and over 1.5 seconds
deepens it to `hues[2]`, fades it `to: 0` and shrinks it `to: 0.35`. The colours come in
threes per burst, such as `[#fff4cc, #ffc247, #ff5b2e]` for the gold one.
[The lesson on sequences](/learn/sequence/) covers `parallel`, and
[the lesson on colour](/learn/colour/) covers animating `color`.

### Glitter, flash and smoke

`template Glitter(bx, by, r, t, k)` places 18 points of light through each
burst. `let ang = i * 137.5` steps round by 137.5 degrees each time, so the
points spread out without lining up into spokes. Each one flickers through a
run of short alpha steps and then falls. `template Flash` is a soft burst of
light: ten faint discs of the burst's colour, `alpha: 0.012` each, brightest
where they all overlap, which fade over 1.2 seconds. `template Smoke` leaves
five pale puffs that drift 40 px to the right as they thin out. In Chromium,
the last spark has faded by 10.9 seconds and the last smoke by 11.9.

### The river

`let water = 384` is the waterline and `let deep = 0.5` the squash of a
reflection. In the three templates the river reflects, `Ring`, `Flash` and
`Glitter`, every height is the waterline plus `k` times the height above it,
as in `water + k * (by - water)`. With `k` at 1 that is just `by`. With
`-deep` it is the same height mirrored about the waterline and halved, so a
burst 200 px above the water shows 100 px below it. `template Smoke` is not
reflected, and places its puffs at plain `by + oy`. The reflection is the
same templates used again with `-deep` and a lower alpha:
`use Ring(burstX[k], burstY[k], reach[k], sparks[k], k * 7, t, outerHues[k], -deep) outerR { alpha: 0.4 }`.
The city is mirrored the same way, `towerR` at height `h * deep`.

Over the reflections, the ripples are dashes in groups that slide left
120 px, the dashes' own spacing, with `easing: linear, loop: true`. When a
loop restarts, the group jumps back by one spacing onto an identical
picture. Lit windows smear into short `line streak` marks that widen and
narrow, `to: (1.8, 1)`.

### The city

`let roofs` is a list of 16 heights, and `generate h, i in roofs` builds one
tower per height, 60 px apart. Each tower has a grid of 18 windows, 288 in
all. Which are lit is a value, not a decision about what exists: every
window is drawn, and
`let on = if (i * 7 + r * 3 + c * 5) % 4 == 0 and r * 18 + 22 < h then 0.85 else 0`
lights 51 of them and leaves the rest clear. Of the lit ones, 6 also meet
`let flicker = (i + r + c) % 5 == 0`, and those dim and brighten. A spire
carries a blinking red `circle beacon`. [The lesson on values](/learn/values/) covers `if` as a
value.

### One period for the loop

The things that loop are the stars, on yoyo beats of 1, 1.5, 2 and 3
seconds, the windows on 1.5, 2 and 3, the beacon on 1, the streaks on 1, 1.5
and 2, and the ripples, whose loops last 2, 3, 4 or 6 seconds. A yoyo's cycle
is twice its `duration`, so every cycle divides 12 seconds. Everything else
that moves plays once, waiting out its `delay`, and is invisible both before
it starts and after it ends. In Chromium the frames at 0 and 12 seconds are
identical, pixel for pixel. [The lesson on timing](/learn/timing/) covers
loops without a seam.
