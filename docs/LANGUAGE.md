# The Declare Language

A reference for Declare, a declarative scene format that compiles to a PixiJS
scene graph. This document describes **behaviour**: what each construct does,
in what units, and what happens at its edges.

It is not a tutorial. Tutorials, guides and examples are Phase 5b, on the
documentation site.

Every example below is compiled by the test suite, so nothing here can silently
stop being true.

```declare
scene {
  size: (800, 600)
  background: #0a0e1a

  circle dot {
    position: (400, 300)
    radius: 40
    color: cyan
  }
}
```

## Scene model

A file holds any number of `def` and `template` declarations, followed by
exactly one `scene` block. A second top-level keyword after the scene block
closes is a parse error ("Only one scene block is allowed per file"). `def`
and `template` may not appear after the scene block starts scoping — `def`
may still appear inside the scene body itself, but `template` may not.

`scene` requires a `size: (width, height)` property. `background` takes a
colour and is optional. `sceneFit` is optional and takes one of four unquoted
keywords: `contain`, `cover`, `fill`, or `none`; passing it as a quoted string
is a compile error.

Coordinates are in pixels. X increases rightward and **y increases
downward**, with the origin at the top-left of the scene. Physics gravity's
default value, `(0, 980)`, is consistent with this: a positive y-velocity
falls toward the bottom of the scene.

**Every object's pivot is the centre of its bounding box.** There is no
`anchor` property. `position` places that point, not a corner — a `rectangle`
with `position: (100, 100)` and `size: (60, 40)` is centred on `(100, 100)`,
not top-left-aligned to it. `rotation` and `scale` act about the pivot. For
`polygon` and `line`, the bounding-box centre is not the same as the centroid
when the shape is asymmetric — the triangle below pivots at `(0, -7.5)`, not
at its centroid `(0, 0)`. **A `group`'s pivot is the local origin it is
positioned at, not the centre of its children** — children placed
asymmetrically around that origin still rotate about the origin, not about
the visual centre of the group's content.

A child object's `position` is relative to its parent `group`'s local space,
not to the scene origin — moving or rotating the group moves and rotates its
children with it.

`z` controls drawing order among siblings. Objects with a higher `z` draw in
front of (on top of) objects with a lower `z`. It defaults to `0` and may be
negative. Siblings with equal `z` draw in source order.

`rotation` is written in **degrees** in source; the renderer converts to
radians internally (multiplying by `Math.PI / 180`) when applying it to the
scene graph.

`alpha` runs from `0.0` to `1.0` inclusive. A value outside that range is a
compile error.

Colours are written as a hex code after `#` — 3 digits (`#f00`) or 6 digits
(`#ff0000`) — or as one of nine named-colour keywords: `red`, `green`,
`blue`, `white`, `black`, `yellow`, `cyan`, `magenta`, `orange`. Named colours
lex as their own token type, so they cannot be reused as identifiers (`def
cyan = ...` is a parse error).

`//` begins a line comment, running to the end of the line.

## Shapes

`circle` requires `position` and `radius`. `radius` must be greater than 0.

`rectangle` requires `position` and `size: (width, height)`. Both `width` and
`height` must be greater than 0.

`polygon` requires `points`, written as `[(x, y), ...]` with each point
relative to `position`. It must have at least 3 points.

`line` requires `position`, `points` (at least 2, relative to `position`),
and `thickness`, which must be greater than 0.

`text` requires `position` and `content`, a quoted string of at most 500
characters. `fontSize` is optional. A scene may contain at most 500 `text`
objects in total.

`group` has no required properties. **Only `group` may contain other visual
objects** — nesting a shape inside a `circle`, `rectangle`, `polygon`,
`line`, or `text` is a compile error.

```declare
scene {
  size: (800, 600)
  background: #0a0e1a

  circle c      { position: (100, 100), radius: 30, color: cyan }
  rectangle r   { position: (250, 100), size: (60, 40), color: magenta }
  polygon p     { position: (400, 100), points: [(0, -30), (26, 15), (-26, 15)], color: orange }
  line l        { position: (550, 100), points: [(-40, 0), (40, 0)], thickness: 2, color: white }
  text t        { position: (700, 100), content: "hello", fontSize: 14, color: white }
  group g {
    position: (400, 300)
    circle inner { position: (0, 0), radius: 12, color: red }
  }
}
```

## Animation

`animate` is a child block of a shape or `group`. It requires `property`,
`to`, and `duration`. `easing`, `loop`, `yoyo`, and `handOff` are optional.
`handOff` only matters inside a `sequence` and is covered there.

`duration` is a number of seconds and must be strictly greater than 0.

Only four properties can be animated: `position`, `rotation`, `scale`, and
`alpha`. Naming any other property is a compile error listing those four.

`to` must match the animated property. `position` requires a point.
`rotation` and `alpha` require a number. `scale` accepts either a number
(applied to both axes) or a point.

`easing` is one of four unquoted keywords: `linear`, `easeIn`, `easeOut`, or
`easeInOut`. Omitting `easing` defaults to `easeInOut`.

**An animation starts from the value the object holds when the animation
starts — there is no `from` property.** Declaring a property (e.g.
`position: (-60, 300)`) and then animating that same property is not a
conflict: the declared value is read as the animation's starting point, and
`to` is where it ends up.

An object may have more than one `animate` block. All of an object's
`animate` blocks are collected and started together when the scene is built,
so they run concurrently from scene start — a second `animate` block does not
wait for the first to finish. To run animations one after another, use a
`sequence` block, covered in a later section.

```declare
scene {
  size: (800, 600)

  rectangle card {
    position: (-60, 300)
    size: (120, 80)
    color: red
    animate {
      property: position
      to: (400, 300)
      duration: 1.0
      easing: easeOut
    }
  }
}
```

### loop and yoyo

`loop: true` restarts the animation from the beginning every time it
completes, forever. `yoyo: true` reverses direction at the end instead of
restarting, and reverses again on returning to the start — so `loop` and
`yoyo` together produce a continuous there-and-back motion.

**`duration` is the length of one direction, not of a full cycle.** With
`yoyo: true`, one complete there-and-back cycle takes `2 × duration`. An
object that should breathe once every two seconds needs `duration: 1.0`, not
`duration: 2.0`.

```text
duration: 1.0 at 120 ticks/second, with yoyo and loop

tick     0 ......... 120 ......... 240 ......... 360
progress 0 --------→ 1  ---------→ 0  ---------→ 1
         |  out      |   back      |   out
         └── duration ┘
         └──────── one full cycle ─────────┘
```

**Pair `yoyo` with `loop`.** `yoyo: true` without `loop: true` plays out to
`to`, plays back to its starting value, and then never finishes: on the tick
it returns to the start it does not complete, it simply holds — the internal
direction stays reversed and the elapsed position stays pinned at the start,
tick after tick. The object rests at its original value, which usually looks
correct, but the animation is still considered running. This has two
consequences. The renderer's idle check never passes, so the ticker never
stops. And if the same object also has a `physics` block, the position
animation's hold on the object's body is never released, so the body stays
pinned in place and never falls under gravity or responds to collisions.
Every `yoyo: true` in the shipped default scene is paired with `loop: true`
for exactly this reason.

Inside a `sequence` or `parallel` block, `loop: true` and `yoyo: true` are
both compile errors (`TYPE_SEQ_LOOP`, `TYPE_SEQ_YOYO`) — a step that never
finishes would stall the rest of the timeline.

```declare
scene {
  size: (800, 600)

  circle pulse {
    position: (400, 300)
    radius: 40
    color: cyan
    animate {
      property: scale
      to: (1.4, 1.4)
      duration: 1.0
      easing: easeInOut
      loop: true
      yoyo: true
    }
  }
}
```

## Sequencing

`sequence` is a child block of a shape or `group`, like `animate`. Its steps
run strictly in order — each step starts only when the previous one finishes.
`sequence` must be placed inside a renderable object: never at the scene
root, and never inside another `sequence`. An object may hold at most one
`sequence` block; a second one on the same object is a compile error
(`TYPE_ONE_STORY`). Each step of a `sequence` must be `animate`, `physics`,
or `parallel` — any other block is a compile error.

`parallel` must be placed directly inside a `sequence` — it cannot sit at the
scene root, directly inside a shape, or nested inside another `parallel`. A
`parallel` block holds `animate` and `physics` children only. All of a
`parallel`'s children start together, and the sequence advances past that
step only once every child has finished.

Both `sequence` and `parallel` must contain at least one child of a kind they
accept; an empty block, or one holding only disallowed children, is a compile
error.

A `physics` step inside a `sequence` must declare a numeric `duration`.
Omitting `duration` there is a compile error (`TYPE_SEQ_PHYSICS_DUR`), and
`duration: indefinitely` is also a compile error there (`TYPE_SEQ_PHYSICS_INDEFINITELY`),
because a simulation that never ends would prevent the timeline from ever
advancing past it. `loop: true` and `yoyo: true` are likewise compile errors
on any `animate` step inside a `sequence` or `parallel` (`TYPE_SEQ_LOOP`,
`TYPE_SEQ_YOYO`; see above), for the same reason: a step that never finishes
stalls the rest of the timeline.

The reverse rule applies to an object's own top-level `physics` block: if it
sets `duration: indefinitely`, that object may not also have a `sequence`
block, because the sequence could never activate after a simulation that
never finishes. This is a compile error (`TYPE_INDEFINITELY_WITH_SEQ`).

```declare
scene {
  size: (800, 600)

  rectangle stepper {
    position: (130, 200)
    size: (34, 34)
    color: magenta
    sequence {
      animate {
        property: rotation
        to: 180
        duration: 0.9
        easing: easeInOut
      }
      parallel {
        animate { property: position, to: (350, 200), duration: 1.2, easing: easeInOut }
        animate { property: scale,    to: (1.6, 1.6), duration: 1.2, easing: easeOut }
      }
      physics {
        gravity: (0, 700)
        bounce: 0.45
        collideBounds: true
        duration: 4
      }
    }
  }
}
```

### handOff

`handOff: true` is a property of `animate` on `property: position`. Setting
it carries the animation's exit velocity into the physics simulation, so an
object that slides and then falls keeps its momentum and arcs, instead of
stopping dead and dropping straight down.

The exit velocity is derived from the animation's average speed — the
displacement from its starting value to `to`, divided by `duration` — scaled
by the slope of the easing curve at the instant the animation ends. That
slope multiplier is `2.0` for `easeIn`, `0.5` for `easeOut`, `0.5` for
`easeInOut`, and `1.0` for `linear`.

Four rules govern `handOff: true`, each a compile error when broken:

- It is only valid on `property: position`; on any other property it is a
  compile error (`TYPE_HANDOFF_PROP`).
- It cannot coexist with `loop: true` on the same `animate` block, since a
  looping animation never ends and so never hands off (`TYPE_HANDOFF_LOOP`).
- It requires a sibling `physics` block on the same object
  (`TYPE_HANDOFF_PHYSICS`).
- That sibling `physics` block may not also declare `velocity` — the
  animation's exit velocity would overwrite it (`TYPE_HANDOFF_AMBIGUITY`).

```declare
scene {
  size: (800, 600)

  circle launcher {
    position: (130, 400)
    radius: 11
    color: yellow
    animate {
      property: position
      to: (350, 220)
      duration: 1.1
      easing: easeOut
      handOff: true
    }
    physics {
      gravity: (0, 900)
      airDrag: 0.006
      bounce: 0.55
      collideBounds: true
      duration: indefinitely
    }
  }
}
```
