---
title: Ledges
summary: Twenty-four tiles fall in through the open top, glance off three fixed ledges and a sweeping paddle, and pile up at the bottom. The crates never turn.
tags:
- physics
- generative
source: src/examples/ledges.marey
---
Nothing in this scene is animated by hand except the paddle. Every tile's path
comes from the physics engine, and every run of the scene gives the same paths,
because the simulation steps at a fixed rate and its inputs are fixed.

### A world with an open top

The `world` block sets `gravity: (0, 980)` once for every physics block, and
`bounds: [left, right, bottom]` puts walls on three edges. There is no top wall,
so the tiles can start above the frame, at heights of `-40 - i * rise`, and fall
in. [The lesson on the physics world](/learn/world/) covers `world` and `bounds`.

### Ledges that never move

Each ledge has `physics { lockPosition: true, bounce: 0.5 }`. A locked body is
static for the whole scene: tiles land on it and slide off, and nothing moves
it. The three ledges tilt with `rotation: slope * [1, -1, 1][i]`, so each one
falls away from its wall towards the middle and passes the tiles inwards. [The
lesson on the physics world](/learn/world/) covers locked bodies.

### A paddle moved by animation

The paddle is locked too, `lockPosition: true, bounce: 0.6`, but it also has
`to: (500, 350), duration: 1, easing: easeInOut, loop: true, yoyo: true`. The
lock stops physics from moving the body, not an animation. So the paddle sweeps
back and forth between the second and third ledges, and its body goes with it,
shoving whatever is in its way. [The lesson on timing](/learn/timing/) and [the lesson on the physics world](/learn/world/)
cover the two halves.

### Scattering without randomness

Marey has no random numbers, so the tiles are scattered with arithmetic. Tile
`i` enters `(i * 197) % span` pixels to the right of `entry`. 197 shares no
factor with the span of 480, so the 24 entry points never repeat and land in a
scrambled order. Sizes come from `18 + (i % 3) * 5`, starting angles from
`(i * 29) % 90`, and colours from `colors[i % 4]`. [The lesson on values](/learn/values/) covers
the arithmetic, and [the lesson on generate](/learn/generate/) covers `generate i in 0 to 23`.

### Spin and drag

Each tile starts turning at `spin: spins[i % 6]` degrees per second, positive
clockwise, so neighbouring tiles turn opposite ways. `airDrag: drag`, with
`let drag = 0.03`, holds the fall near 540 pixels per second. Since the tiles
all fall at about the same speed, a tile that starts higher arrives later, and
the stagger in height becomes a stagger in time. `duration: indefinitely` keeps
each tile in the simulation for the whole scene. A tile at rest is only asleep:
when the paddle or another tile strikes it, it wakes and moves again. A numeric
duration works differently: when it runs out, the body freezes where it is, and
stays frozen until a later `animate` or `physics` step on the same object
starts. [The lesson on physics](/learn/physics/) covers air drag and the duration, and [the lesson
on the physics world](/learn/world/) covers spin.

### Crates that stay level

A crate is `group crate` with two rectangles, a frame and a face, and the
`physics` block is on the group. A group with physics becomes one rigid body
made of its children's shapes. `lockRotation: true` sends every impact into the
crate's movement and none into turning, so when the paddle strikes one off
centre it slides instead of tumbling. [The lesson on groups](/learn/groups/) covers
groups, [the lesson on physics](/learn/physics/) a group welded into one body, and
[the lesson on the physics world](/learn/world/) `lockRotation`.
