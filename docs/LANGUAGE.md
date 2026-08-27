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

**Every object's pivot is its geometric centre.** There is no `anchor`
property. `position` places that centre, not a corner — a `rectangle` with
`position: (100, 100)` and `size: (60, 40)` is centred on `(100, 100)`, not
top-left-aligned to it. `rotation` and `scale` act about that same centre.

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
