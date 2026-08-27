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
by a fixed multiplier that depends on the easing. That multiplier is `2.0`
for `easeIn`, `0.5` for `easeOut`, `0.5` for `easeInOut`, and `1.0` for
`linear`: a `linear` animation hands off at its average speed, `easeIn` at
twice that speed, and `easeOut` and `easeInOut` at half of it. `easeOut` and
`easeInOut` are momentarily flat at the instant they end, so using that
literally would hand off no momentum at all; the `0.5` is a deliberate
choice, not a measurement of the curve.

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

## Physics

**Every object that declares a `physics` block shares one simulated world with
every other such object, and they collide with each other.** They stack,
tumble, and settle against one another, not just against the scene edges.

**An object gets a collision body if, and only if, it declares a `physics`
block — either directly, or in any step of its `sequence`.** An object with
only `animate` blocks is not a collider: nothing rests on it, and things pass
through it.

**A collision body is created when the scene starts, not when the object's
physics step begins.** For an object whose `sequence` opens with `animate`
and reaches `physics` later, the body already exists during that opening
`animate` step, held immobile at the object's current position. So an object
sliding into place shoves anything already in its path before its own physics
step ever starts.

### Properties

`gravity: (x, y)` is an acceleration in **pixels per second squared**,
applied per object, not per scene — there is no scene-level gravity property.
Positive `y` accelerates downward, matching the scene's y-down coordinate
system. It defaults to `(0, 980)`.

`velocity: (x, y)` is an initial speed in **pixels per second**, applied at
the moment the object's simulation starts — scene start for a top-level
`physics` block, or the moment a `sequence` reaches that `physics` step. It
defaults to `(0, 0)`.

`bounce` sets how much of a collision's energy is preserved, from `0.0` to
`1.0` inclusive; a value outside that range is a compile error. `0.0` means
no bounce — the object stops dead on impact. `1.0` preserves the collision's
energy. It defaults to `0.65`.

**`airDrag` is inverted: `0.0` is a vacuum and `1.0` is maximum resistance.**
It ranges from `0.0` to `1.0` inclusive, defaulting to `0.0`. Useful values
are small — the shipped default scene uses `0.006`. Some editor snippets in
`language.ts` still insert `airDrag: 0.99` as a placeholder value, left over
from before the inversion; under the current semantics that is near-total
drag, not a light touch.

`collideBounds` governs collision with the scene's four edges only, and
defaults to `true`. It has no bearing on collision between objects — that is
always on and cannot be turned off. An object with `collideBounds: false`
that drifts far enough past a scene edge is not stopped by anything; once it
travels 800 pixels beyond the scene's bounds, it is removed from the
simulation entirely and its visual is hidden.

The collision shape a body gets depends on the object's kind: `circle` gets a
circle at its declared radius; `rectangle` gets a rectangle at its declared
size; `text` gets a rectangle sized to the rendered text's bounding box;
`line` gets a rectangle spanning its points' bounding box, widened to at
least its `thickness`; `group` gets a single rectangle spanning the bounding
box of everything inside it (only meaningful if the `physics` block sits on
the group itself, giving the whole group one shared body). **`polygon` gets
the convex hull of its points, not its exact outline** — a concave polygon
collides as its hull, even though it is drawn with its true, concave shape.

### When duration expires

`duration` is a number of seconds, or the keyword `indefinitely`.

**When a numeric `duration` expires, the object freezes exactly where it is
and stays collidable.** It does not reset to a starting position, drift, or
disappear. Freezing happens wherever the object is at that instant, including
mid-air or mid-collision. A frozen object becomes scenery: later objects can
land on it, stack on it, and bounce off it, exactly as they would off any
other static body.

**Frozen and asleep look identical and behave oppositely.** An object at rest
under a numeric `duration` that has expired is frozen: immovable, and
unaffected by anything that collides with it afterward. An object at rest
under `duration: indefinitely` is merely asleep — dormant to save work, but it
still collides, and a collision wakes it and sets it moving again. Nothing in
a single rendered frame distinguishes the two.

Freezing is reversible. If the same object later starts a new `animate` or
`physics` step — for instance, the next step of its `sequence` — the freeze
lifts and the object rejoins the simulation.

### Animation and physics together

While an `animate` block drives `position`, physics does not move the
object — but the object remains solid, so it can still knock other things
over as it moves along the animated path.

While an `animate` block drives `rotation`, physics does not spin the
object, though the object still moves under gravity and collisions; only its
angle is held to the animation.

`animate scale` resizes the object's collision shape to match its visual size
as the animation progresses.

When an animation finishes, the object returns to full physics control on
whichever property the animation was driving.

```declare
scene {
  size: (800, 600)
  background: #0a0e1a

  generate i from 0 to 3 {
    rectangle box {
      position: (400, 100 + i * 60)
      size: (60, 60)
      color: cyan
      physics {
        gravity: (0, 900)
        bounce: 0.2
        collideBounds: true
        duration: indefinitely
      }
    }
  }
}
```

```declare
scene {
  size: (800, 600)

  circle faller {
    position: (400, 100)
    radius: 20
    color: orange
    physics {
      gravity: (0, 900)
      collideBounds: true
      duration: 2
    }
  }
}
```

## Reuse

`def`, `generate`, `template` and `use` are the language's metaprogramming
layer. All four are resolved by the parser, before type checking runs — by
the time an error is reported, `def` names have been substituted and
`generate`/`use` have been expanded into plain objects.

### `def`

`def name = value` binds `name` to a single value in the current scope. The
right-hand side accepts any value kind the parser produces: number, color,
string, point, point list, boolean, easing, or `sceneFit`.

A binding is immutable: redefining the same name in the same scope is a
compile error ("already defined in this immediate scope"). Shadowing an
outer binding from an inner scope is allowed — `generate` bodies, object and
group bodies, and template expansions each open a new scope. A name is
visible only in the scope that defined it and scopes nested inside it; a
name defined inside a `generate` block does not exist outside it.

`def` may appear before the `scene` block, inside the `scene` body, and
inside any object, group, `generate`, `animate`, `physics`, or template
body. It may not appear directly inside a `sequence` block, which accepts
only `animate`, `physics`, and `parallel`.

Names follow the same rule as object names: they must start with a letter
and contain only letters, digits, and underscores.

**A named colour cannot be a `def` name.** `red`, `green`, `blue`, `white`,
`black`, `yellow`, `cyan`, `magenta`, and `orange` lex as their own token
type, not as identifiers, so `def cyan = #00ffff` is a parse error before it
ever reaches scope checking — the parser is looking for a variable name and
finds a colour literal instead.

### Arithmetic

Numeric value positions accept `+`, `-`, `*`, and `/`, with conventional
precedence: `*` and `/` bind tighter than `+` and `-`. Unary `-` is
supported. Parentheses group and may nest. Division by zero is a compile
error, not `Infinity`. There is no modulo operator, no exponent, and no
comparison operator. An operand may be a number literal or a `def`-bound
name; a name bound to a non-number value used in a math expression is a
compile error.

### `generate`

`generate i from A to B { ... }` repeats its body once for each integer `i`
from `A` to `B`, **inclusive of both ends** — `from 0 to 4` runs five times,
for `i` = 0, 1, 2, 3, 4. `A` and `B` must be integer literals or
integer-valued `def` names; a non-integer bound is a compile error. A single
`generate` is capped at 10,000 iterations, and a file at 15,000 generated
objects in total, to bound compile time.

Every object created inside the loop has its declared name suffixed with
the loop index: a `rectangle tick` inside `generate k from 0 to 9` produces
`tick_0` through `tick_9`. `generate` blocks may nest. Each level of nesting
appends its own suffix, innermost first — an object named `dot` inside an
inner loop bound to `j` nested in an outer loop bound to `i` is named
`dot_<j>_<i>`.

`generate` is allowed at the top level of the scene, inside a `group`, and
inside a `template` body. It is not allowed inside a shape (`circle`,
`rectangle`, `polygon`, `line`, `text`) — those cannot contain child objects
or blocks of any kind.

### `template` and `use`

`template Name(params) { ... }` declares a parametric macro. Templates are
declared only before the `scene` block; the keyword is rejected anywhere
else, including inside the scene body.

`use Name(args) instanceName { ... }` expands the template's body with each
parameter bound to the corresponding argument, positionally, by name. An
argument may be **any** value kind the parser produces, including a keyword
— an easing curve can be passed as a template argument, as in
`use Racer(easeInOut) rowInOut { ... }` in the default scene. The number of
arguments must match the number of declared parameters exactly.

The instance name must be unique among its siblings and follows the same
naming rule as `def`. The expansion is wrapped as a `group` node named after
the instance; the `{ ... }` block after the instance name sets group-level
properties on that wrapper — `position`, `rotation`, `scale`, `alpha`, `z` —
exactly as it would on any other `group`.

Recursive templates are rejected: expanding a template that is already being
expanded, either directly or through a cycle of other templates, is a
compile error.

```declare
def ink    = #e2e8f0
def gap    = 120
def beat   = 1.5

template Badge(tone) {
  circle disc {
    position: (0, 0)
    radius: 18
    color: tone
  }
  rectangle pip {
    position: (0, -18)
    size: (10, 10)
    color: ink
  }
}

scene {
  size: (800, 600)
  background: #0a0e1a

  generate i from 0 to 4 {
    use Badge(cyan) badge { position: (100 + i * gap, 200) }
  }

  circle mover {
    position: (100, 400)
    radius: 14
    color: magenta
    animate {
      property: position
      to: (700, 400)
      duration: beat
      easing: easeInOut
    }
  }
}
```

### Current limits (as of v0.3.x)

These are known gaps in the reuse layer, not deliberate design positions.
This section is expected to shrink as later phases close them.

**No arrays or indexing.** There is no way to write a list of values and
loop over it. A point list such as `[(0, -30), (26, 15), (-26, 15)]` exists,
but only as a literal property value for `polygon` and `line`. It can be
bound to a name with `def` and passed around as a whole — but its elements
cannot be read individually, indexed, or iterated. It is not a
general-purpose array. A chart driven by seven data values must still be
written as seven separate `rectangle` blocks.

**No trigonometry.** The arithmetic above has no `sin` or `cos`. A radial or
circular layout — dots evenly spaced around a circle — cannot be produced by
`generate`; every coordinate has to be computed by hand and written as a
literal.

**No modulo and no conditionals.** "Every fifth tick is taller" cannot be
expressed inside a single `generate` loop, because there is no way to branch
on the loop variable. The workaround is two overlapping `generate` loops:
one draws the common case, and a second, at the wider stride, draws over it.

`generate` handles "N of the same thing, spaced by arithmetic on the loop
variable." It does not handle data.
