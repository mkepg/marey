---
title: Spring Cards
summary: Five cards pop in with a spring, each with more bounce than the last, and each held small and invisible by from until its turn.
tags:
- generative
- text
poster: 1.6
---

Five cards, one spring each. They all land on the same tick of the same
duration; the only thing that differs is `bounce`, which sets how far a card
swings past its full size on the way. It needs marey-lang 0.8.0 or later.

### The card is declared at rest

A card is a plain `rectangle` with `size: (116, 160)` and no `scale` or `alpha`
of its own. Its animations name the start: `from: 0.2` for the scale and
`from: 0` for the alpha. Read without them, the scene is the picture of the
last frame, which is what makes it easy to edit. `from` is held through the
card's `delay`, so a card that is still waiting is already small and invisible
on the very first frame, and does not flash at full size and then jump.

### One bounce per card

`let bounces = [0, 0.2, 0.4, 0.6, 0.9]` holds the five values, and
`generate b, i in bounces` runs once for each, with `b` the value and `i` its
place in the list. Each card's scale animation is `easing: spring, bounce: b`.
At `0` the card settles without overshoot, as an ease-out would, and at `0.9`
it swings past full size and back many times. A spring never runs late: it is
a curve over the `duration`, so every card is at rest on exactly the same tick
its `duration` ends. [The lesson on animation](/learn/animate/) covers `from`
and `spring`, and [the lesson on generate](/learn/generate/) covers lists and
`generate`.

### A stagger is a delay

`delay: 0.5 + i * 0.15` starts each card 0.15 seconds after the one before.
The number under each card, written from `labels[i]`, is a string list because
text content has to be a quoted string. [The lesson on timing](/learn/timing/)
covers delay.

### Why the alpha has its own animation

A spring can swing past its target, and the renderer clamps a spring's value
where the language forbids one: a `scale` below zero, an `alpha` outside 0 to
1. The cards grow from `0.2`, so the clamp never touches them, but a spring
toward a scale near zero would lose its overshoot. The alpha is therefore a
separate `animate` with `easing: easeOut` and `duration: 0.2`, which comes up
quickly and stays put, instead of ringing with the spring.
