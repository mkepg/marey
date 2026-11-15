---
title: Bar chart reveal
summary: Seven values grow into bars one after another, and each bar's label appears the moment it lands.
tags:
- generative
- text
source: src/examples/bar-chart-reveal.marey
---
The chart is laid out from its data. Each bar's height, the height of the number
above it and the spacing between bars are computed from the values, not written
in by hand.

### The data is three lists

`let values = [3, 7, 2, 9, 5, 8, 4]` holds the numbers, `let weeks` the week
names, and `let tags` the same numbers again as strings, because text content is
a quoted string and cannot be built from a number. The spacing comes from the
data too: `let step = 800 / (length(values) + 1)` divides the width into one
more gap than there are values.

The three lists are read with the same index, as `tags[i]` and `weeks[i]`, so
they must stay the same length. Indexing has no wrap-around: an eighth value
with no eighth tag or week name is a compile error, "Index 7 is out of range for
a list of length 7". Add the value, its string and its week name together, and
the chart respaces itself for eight bars. The lesson on values covers lists,
indexing, `length` and arithmetic.

### Three objects per value

`generate v, i in values` runs once per value, with `v` the value and `i` its
position in the list, and makes three objects each time: the bar, the number
above it and the week name below the baseline. All three use `step * (i + 1)`
for their x, so they line up. The lesson on generate covers this.

### Bars grow from the baseline

Each bar has `origin: (0.5, 1)`, which puts its pivot at the bottom centre, on
the baseline. It starts at `scale: (1, 0)`, full width and no height, and
animates to full height with `easing: easeOut`, fast at first and settling at
the end. Because the pivot is at the bottom, the bar grows upwards from the
baseline rather than out from its middle. A zero scale is allowed here because
the bar takes no part in physics; on an object that does, it is a compile error.
[The lesson on shapes](/learn/shapes/) covers origin, and [the lesson on animation](/learn/animate/)
covers scale and easing.

### A stagger is a delay

`let start = 0.3 + i * 0.25` gives each bar its own start time, a quarter of a
second after the one before. Every bar grows for the same `duration: grow`, so
they all move at the same speed and only their start differs. The number above a
bar waits for `delay: start + grow`, the moment its bar finishes, then fades in
over a quarter of a second. It is placed at `baseline - v * unit - 20`, just
above the bar's final height. [The lesson on timing](/learn/timing/) covers delay.

### Text in a scene

The title, the numbers and the week names are `text` objects with a `content`
string and a `fontSize`, drawn in the monospaced font the player carries with
it, so the chart looks the same on every machine. Text takes the same properties
and animations as any other shape: the numbers start at `alpha: 0` and fade in
exactly as a circle would. [The lesson on shapes](/learn/shapes/)
covers text.
