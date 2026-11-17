---
title: Domino Run
summary: A marble rolled down a ruler sets off thirteen dominoes along a desk and up a staircase of books, the last one knocks a ball into a cup of tea, and then the whole run rewinds.
tags:
- lesson
- physics
- generative
- loop
poster: 2
lesson: handoff
---

A desk at night, between a moonlit window and a reading lamp. A glass marble
rolls down a ruler and strikes the first of thirteen dominoes. The run topples
along the desk and up a staircase of four books, and the last domino knocks a
red ball off the top book into a cup of tea. Then the run rewinds: the marble
rolls back up the ruler, the dominoes stand up in the order they fell, and the
ball hops back onto its book. The scene lasts ten seconds, and its last frame
is the same as its first. It is the showcase of
[the lesson on handing animation to physics](/learn/handoff/).

### A line that climbs

A run of dominoes is usually laid out in a curve, but a side view cannot show
a curve: every domino stands in the same plane. So this run changes direction
the other way, upwards. Nine dominoes stand on the desk and four on a staircase
of books, `lift` books up, one domino on each stair. The stairs are locked
rectangles 14 pixels thick, `let rise = 14`, each starting one domino-space
further right, so each tread holds one domino. The top book reaches past the
others to `838`, over the cup. [The lesson on generate](/learn/generate/)
covers placing them from the lists `dx` and `lift`.

### Gravity for small things

A domino here is 72 pixels tall. At the default gravity it would topple like a
slab as tall as a person, so the world has `gravity: (0, 6000)`, and the run
reads as tiles falling on a desk. The world also has `bounds: []`: the desk,
the books, the ruler and the cup are locked bodies, and nothing needs the
scene's edges. [The lesson on the physics world](/learn/world/) covers `world`
and locked bodies.

### The marble's roll is an animation

The marble starts on the ruler, and its first step is an animation:
`to: (110, 375), duration: 0.6, easing: easeIn, handoff: true`. `easeIn` starts
slowly and speeds up, the way a ball rolls down a slope, and `handoff` carries
the speed it reaches into the simulation as the animation ends, at the bottom
of the ruler. For `easeIn` that is twice the average speed of the roll, so the
marble leaves the ruler fast and strikes the first domino near its top.
[The lesson on handing animation to physics](/learn/handoff/) covers `handoff`
and how the easing sets the release speed.

### Dominoes held until the run arrives

Each domino is a `Domino` template whose sequence starts with a hold,
`animate { property: position, to: (0, 0), duration: wait }`, where `wait` is
`0.45 + i * 0.15`. During the hold the domino is a body, pinned where it
stands, and its simulation starts when the hold ends, a little before the run
reaches it. Measured in this scene, each domino starts to move between 0.16
and 0.47 seconds after its simulation starts. With the holds taken out, the
dominoes stand still long enough to fall asleep, the run slows to about half a
second a domino, and when the 4.5-second physics steps end it has only reached
the first book: the tenth domino is part way over and the last three have not
fallen. The red ball on the top book is held the same way,
until 2.4 seconds. [The lesson on handing animation to physics](/learn/handoff/)
covers a body that exists before its physics step, and
[the lesson on physics](/learn/physics/) covers sleep.

### A cup that catches

The cup's collider is `group cupInside`, a base and two walls welded into one
locked body, so it collides as a cup, open at the top, and not as the box
around it. Measured, the ball passes below the rim at 3.15 seconds and comes to
rest inside. The china front of the cup is drawn after the ball, so the ball
drops out of sight, and four drops splash up at that moment, each on a
sequence that waits `duration: 3.15`. [The lesson on physics](/learn/physics/)
covers welded groups.

### The rewind

Every domino's physics step is `physics { bounce: 0.4, duration: 4.5 }`, the
same for all thirteen, so they freeze 0.15 seconds apart, in the order they
were let go. The next step is a `parallel` of two animations, position and
rotation, both back to where the domino started, so the dominoes stand up in
the order they fell. The marble is rewound to the end of the ruler and then up
it, and the ball hops out of the cup, up to `(850, 330)` and back down onto the
book. Both have their rotation animated back to 0 on the way.
[The lesson on sequences](/learn/sequence/) covers `parallel`.

### A hold that outlasts the scene

Once a body's sequence has reached a `physics` step, an animation that ends
afterwards leaves the body to the simulation, so the marble, left on the slope
of the ruler, would roll down it. Every rewound body
therefore ends with one more hold, an `animate` to where it already is. A
domino's lasts `duration: 5 - wait`, so its four steps add up to the scene's 10
seconds. On an object whose only motion is its sequence, the sequence starts
one tick after the scene does, so every hold is
still running in the last frame, and the last frame matches the first.
[The lesson on handing animation to physics](/learn/handoff/) shows a body
falling again when its last animation ends.

### Around the run

The window's stars twinkle on periods of 2, 2.5, 5 and 10 seconds, its two
clouds drift and come back every 10, the clock's pendulum swings every 2, and
the steam over the cup rises every 2.5. Each divides ten and none is delayed,
so they loop with the scene. The clock's twelve marks are placed with `sin` and
`cos`, and the light from the window and the lamp is a few polygons each at
low alpha, narrower over wider, so each beam is brightest in its middle.
[The lesson on timing](/learn/timing/) covers loops that divide the duration,
[the lesson on values](/learn/values/) covers `sin` and `cos`, and
[the lesson on shapes](/learn/shapes/) covers `alpha`.
