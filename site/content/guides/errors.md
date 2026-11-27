---
title: Reading errors
description: How the Marey compiler's diagnostics read, where they appear, and sixteen common mistakes, each with the compiler's own message and the fix.
---

Marey is strict: a scene that is wrong in a way the compiler can see does not
run at all, rather than running and doing something you did not ask for. That
makes the error messages part of the language. This guide shows how to read
them, then walks through sixteen common mistakes. Every message on this page is
the compiler's own, produced when this page was built, and every fix runs.

## How a diagnostic reads

This scene tries to grow a circle by animating its `radius`:

```marey error=TYPE_ANIM_PROP
scene {
  size: (960, 540)
  background: #101433
  duration: 2

  circle sun {
    position: (480, 270)
    radius: 40
    color: #ffb347
    animate { property: radius, to: 80, duration: 2 }
  }
}
```

A diagnostic has up to three parts:

- **A position**, the line and column where the problem is, counted from 1.
  Here it points at the word after `property:`.
- **A code** in square brackets, such as `[TYPE_ANIM_PROP]`, on many messages.
  The code names the rule, and the [language reference](/reference/language/)
  names many rules by their code too. A message without a code is still an
  error.
- **The message**, which says what is wrong and usually what is allowed. Many
  messages also name the object they are about, as `'circle' object 'sun'`.

The same diagnostic reads slightly differently depending on where you meet it:

| Where | How it looks |
|---|---|
| A sample on this site | `line 10, col 25:` and the message, under the editor. Click it to put the cursor there. |
| The playground | The line is marked in the editor, and the message is listed in the log. |
| `marey check` | `sun.marey:10:25:` and the message, one line each. |
| `<marey-player>` | A box in place of the scene: `PLAYER_COMPILE_FAILED`, then `10:25` and the message. |

A scene with several mistakes usually gets several messages at once, not only
the first. When a typo breaks the structure of the text itself, such as a
missing `}`, the lines after it can report errors that are only knock-on
effects: fix the first error, and the others often go.

Only five properties can be animated: `position`, `rotation`, `scale`, `alpha`
and `color`, as the message says. To grow the sun, animate its `scale`:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 2

  circle sun {
    position: (480, 270)
    radius: 40
    color: #ffb347
    animate { property: scale, to: 2, duration: 2 }
  }
}
```

The rest of this page is eleven more mistakes like this one, each with its
message and its fix, then four that have no code.

## Animation

### A `to` of the wrong kind

```marey error=TYPE_ANIM_MISMATCH
scene {
  size: (960, 540)
  background: #101433
  duration: 2

  circle ball {
    position: (200, 270)
    radius: 30
    color: #38bdf8
    animate { property: position, to: 760, duration: 2 }
  }
}
```

`to` must be the same kind of value as the property: a point for `position`,
a number for `rotation` and `alpha`, a number or a point for `scale`, and a
colour for `color`. A position is always both coordinates, even when only one
changes:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 2

  circle ball {
    position: (200, 270)
    radius: 30
    color: #38bdf8
    animate { property: position, to: (760, 270), duration: 2 }
  }
}
```

([Animation](/reference/language/#animation))

### Colour on a group

```marey error=TYPE_ANIM_COLOR_TARGET
scene {
  size: (960, 540)
  background: #101433
  duration: 2

  group lamp {
    position: (480, 270)
    circle glow { position: (0, 0), radius: 70, color: #ffd84d, alpha: 0.25 }
    circle bulb { position: (0, 0), radius: 30, color: #ffd84d }
    animate { property: color, to: #ff6b6b, duration: 2 }
  }
}
```

A group draws nothing of its own, so it has no colour to change. Animate the
colour of the shapes in it, each with its own `animate`:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 2

  group lamp {
    position: (480, 270)
    circle glow {
      position: (0, 0)
      radius: 70
      color: #ffd84d
      alpha: 0.25
      animate { property: color, to: #ff6b6b, duration: 2 }
    }
    circle bulb {
      position: (0, 0)
      radius: 30
      color: #ffd84d
      animate { property: color, to: #ff6b6b, duration: 2 }
    }
  }
}
```

([Animating colour](/reference/language/#animating-colour))

### A `loop` inside a sequence

```marey error=TYPE_SEQ_LOOP
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  circle ball {
    position: (200, 270)
    radius: 30
    color: #38bdf8
    sequence {
      animate { property: position, to: (760, 270), duration: 1, loop: true }
      animate { property: alpha, to: 0, duration: 1 }
    }
  }
}
```

A sequence moves to its next step when the current one finishes, and a
looping animation never finishes. `yoyo` is refused there for a related
reason (`TYPE_SEQ_YOYO`): it would run for twice its `duration`. Write the
repeats out as steps instead:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  circle ball {
    position: (200, 270)
    radius: 30
    color: #38bdf8
    sequence {
      animate { property: position, to: (760, 270), duration: 1 }
      animate { property: position, to: (200, 270), duration: 1 }
      animate { property: position, to: (760, 270), duration: 1 }
      animate { property: alpha, to: 0, duration: 0.9 }
    }
  }
}
```

([Sequencing](/reference/language/#sequencing))

### Two sequences on one object

```marey error=TYPE_ONE_STORY
scene {
  size: (960, 540)
  background: #101433
  duration: 3

  circle ball {
    position: (200, 270)
    radius: 30
    color: #38bdf8
    sequence {
      animate { property: position, to: (760, 270), duration: 1 }
    }
    sequence {
      animate { property: alpha, to: 0, duration: 1 }
    }
  }
}
```

An object has one timeline. To run two things at once inside it, put them in a
`parallel` step:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 3

  circle ball {
    position: (200, 270)
    radius: 30
    color: #38bdf8
    sequence {
      parallel {
        animate { property: position, to: (760, 270), duration: 1 }
        animate { property: alpha, to: 0.2, duration: 1 }
      }
      animate { property: alpha, to: 1, duration: 1 }
    }
  }
}
```

([Sequencing](/reference/language/#sequencing))

### A `bounce` with no spring

```marey error=TYPE_BOUNCE_WITHOUT_SPRING
scene {
  size: (960, 540)
  background: #101433
  duration: 3

  circle ball {
    position: (200, 270)
    radius: 30
    color: #38bdf8
    animate { property: position, to: (760, 270), duration: 2, bounce: 0.4 }
  }
}
```

An `animate` block's `bounce` sets how far a spring overshoots, and it means
nothing to any other easing. The message names the easing the animation is
using, here the default, `easeInOut`, because that is the one you did not
choose. Either remove `bounce` or ask for the spring:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 3

  circle ball {
    position: (200, 270)
    radius: 30
    color: #38bdf8
    animate { property: position, to: (760, 270), duration: 2, easing: spring, bounce: 0.4 }
  }
}
```

This `bounce` is not the one in a `physics` block, which sets how much energy
a collision keeps. The two sit in different blocks and are unrelated.
([spring](/reference/language/#spring))

### A spring that hands off

```marey error=TYPE_HANDOFF_SPRING
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  circle ball {
    position: (130, 400)
    radius: 14
    color: #ffd84d
    animate { property: position, to: (350, 220), duration: 1.1, easing: spring, handoff: true }
    physics { gravity: (0, 900), bounce: 0.55, collideBounds: true, duration: indefinitely }
  }
}
```

`handoff: true` carries an animation's exit speed into physics. A spring
settles at rest, so it has no speed to carry. Use an easing that is still
moving when it ends, such as `easeOut`:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  circle ball {
    position: (130, 400)
    radius: 14
    color: #ffd84d
    animate { property: position, to: (350, 220), duration: 1.1, easing: easeOut, handoff: true }
    physics { gravity: (0, 900), bounce: 0.55, collideBounds: true, duration: indefinitely }
  }
}
```

([handoff](/reference/language/#handoff))

## Shapes and the scene

### A negative scale

```marey error=TYPE_INVALID_SCALE
scene {
  size: (960, 540)
  background: #101433
  duration: 2

  polygon arrow {
    position: (480, 270)
    points: [(-60, -20), (20, -20), (20, -45), (70, 0), (20, 45), (20, 20), (-60, 20)]
    color: #38bdf8
    scale: (-1, 1)
  }
}
```

In some tools a negative scale mirrors a shape. In Marey it is refused. This
arrow is the same above and below its middle, so turning it half a turn points
it the other way. A shape that is not would need its points written mirrored,
with each x negated.

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 2

  polygon arrow {
    position: (480, 270)
    points: [(-60, -20), (20, -20), (20, -45), (70, 0), (20, 45), (20, 20), (-60, 20)]
    color: #38bdf8
    rotation: 180
  }
}
```

([Shapes](/reference/language/#shapes))

### `origin` on a group

```marey error=TYPE_ORIGIN_ON_GROUP
scene {
  size: (960, 540)
  background: #101433
  duration: 2

  group boat {
    position: (480, 360)
    origin: (0.5, 1)
    rectangle hull { position: (0, 0), size: (200, 40), color: #b5763a }
    rectangle cabin { position: (0, -40), size: (80, 40), color: #e8d5b5 }
    animate { property: rotation, to: 8, duration: 2 }
  }
}
```

`origin` places a shape's pivot as a fraction of its own box. A group has no
box of its own: its pivot is always its own `(0, 0)`, where its `position`
puts it. To rock the boat about its keel, place its children above `(0, 0)`:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 2

  group boat {
    position: (480, 380)
    rectangle hull { position: (0, -20), size: (200, 40), color: #b5763a }
    rectangle cabin { position: (0, -60), size: (80, 40), color: #e8d5b5 }
    animate { property: rotation, to: 8, duration: 2 }
  }
}
```

([Shapes](/reference/language/#shapes))

### `indefinitely` on the scene

```marey error=TYPE_SCENE_DURATION_INDEFINITE
scene {
  size: (960, 540)
  background: #101433
  duration: indefinitely

  rectangle tile {
    position: (480, 270)
    size: (80, 80)
    color: #38bdf8
    animate { property: rotation, to: 360, duration: 4, loop: true }
  }
}
```

`indefinitely` belongs to `physics`. A scene with no end is written by leaving
`duration` out, as the message says:

```marey
scene {
  size: (960, 540)
  background: #101433

  rectangle tile {
    position: (480, 270)
    size: (80, 80)
    color: #38bdf8
    animate { property: rotation, to: 360, duration: 4, loop: true }
  }
}
```

A scene with no `duration` plays forever, and so cannot be exported without
a length given on the command line ([Export](/guides/export/#options)).
([Scene model](/reference/language/#scene-model))

## Physics

### Two physics blocks on one object

```marey error=TYPE_ONE_PHYSICS
scene {
  size: (960, 540)
  background: #101433
  duration: 3

  circle ball {
    position: (480, 100)
    radius: 30
    color: #38bdf8
    physics { bounce: 0.6, duration: 3 }
    physics { velocity: (200, 0), duration: 3 }
  }
}
```

Only one would ever simulate. Put every physics property in one block:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 3

  circle ball {
    position: (480, 100)
    radius: 30
    color: #38bdf8
    physics { bounce: 0.6, velocity: (200, 0), duration: 3 }
  }
}
```

([Physics](/reference/language/#physics))

### A physics step with no `duration`

```marey error=TYPE_SEQ_PHYSICS_DUR
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  circle ball {
    position: (200, 100)
    radius: 30
    color: #38bdf8
    sequence {
      animate { property: position, to: (480, 100), duration: 1 }
      physics { bounce: 0.5 }
    }
  }
}
```

The compiler reports this twice: once as a rule of sequences, and once as
the property every `physics` block needs. A step in a sequence has to end so
the next one can start, so it needs a number of seconds, and
`indefinitely` is refused there too (`TYPE_SEQ_PHYSICS_INDEFINITELY`):

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  circle ball {
    position: (200, 100)
    radius: 30
    color: #38bdf8
    sequence {
      animate { property: position, to: (480, 100), duration: 1 }
      physics { bounce: 0.5, duration: 2.9 }
    }
  }
}
```

([Sequencing](/reference/language/#sequencing))

### Physics inside a moving group

```marey error=TYPE_PHYSICS_IN_ANIMATED_GROUP
scene {
  size: (960, 540)
  background: #101433
  duration: 3

  group cart {
    position: (200, 120)
    animate { property: position, to: (700, 120), duration: 2 }
    rectangle body { position: (0, 0), size: (120, 40), color: #b5763a }
    circle load { position: (0, -40), radius: 18, color: #38bdf8, physics { duration: 3 } }
  }
}
```

Where the body starts in the scene would depend on where its moving group
happens to be, which the simulation cannot settle on as a fixed starting
point. Either the whole group
becomes one body, with `physics` on the group, or the body stands on its own
outside it:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 3

  group cart {
    position: (200, 120)
    animate { property: position, to: (700, 120), duration: 2 }
    rectangle body { position: (0, 0), size: (120, 40), color: #b5763a }
  }
  circle load { position: (480, 80), radius: 18, color: #38bdf8, physics { duration: 3 } }
}
```

([Physics and groups](/reference/language/#physics-and-groups))

### A property a locked body ignores

```marey error=TYPE_LOCK_IGNORED
scene {
  size: (960, 540)
  background: #101433
  duration: 3

  rectangle ledge {
    position: (480, 400)
    size: (360, 16)
    color: #e8b44a
    physics { lockPosition: true, velocity: (100, 0) }
  }
  circle ball { position: (480, 100), radius: 24, color: #38bdf8, physics { bounce: 0.5, duration: 3 } }
}
```

`lockPosition: true` makes a body that the simulation never moves, for the
whole scene, so a property that would move it has nothing to do. The message
names the property to remove; only `bounce` applies to a locked body:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 3

  rectangle ledge {
    position: (480, 400)
    size: (360, 16)
    color: #e8b44a
    physics { lockPosition: true }
  }
  circle ball { position: (480, 100), radius: 24, color: #38bdf8, physics { bounce: 0.5, duration: 3 } }
}
```

([Properties](/reference/language/#properties))

### Two physics blocks in one `parallel`

```marey error=TYPE_PARALLEL_ONE_PHYSICS
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  circle ball {
    position: (480, 100)
    radius: 30
    color: #38bdf8
    sequence {
      animate { property: position, to: (480, 150), duration: 1 }
      parallel {
        physics { bounce: 0.6, duration: 2.5 }
        physics { velocity: (200, 0), duration: 2.5 }
      }
    }
  }
}
```

`TYPE_ONE_PHYSICS` already refuses two physics blocks on one object. A
`parallel` is the same mistake inside a sequence: each block would drive the
one body, and only the last block's settings would apply. Merge them into one
block:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 4

  circle ball {
    position: (480, 100)
    radius: 30
    color: #38bdf8
    sequence {
      animate { property: position, to: (480, 150), duration: 1 }
      parallel {
        physics { bounce: 0.6, velocity: (200, 0), duration: 2.5 }
      }
    }
  }
}
```

([Sequencing](/reference/language/#sequencing))

### A spring on the scale of a physics body

```marey error=TYPE_SPRING_SCALE_PHYSICS
scene {
  size: (960, 540)
  background: #101433
  duration: 3

  circle ball {
    position: (480, 100)
    radius: 30
    color: #38bdf8
    physics { bounce: 0.5, duration: 3 }
    animate { property: scale, to: 1.5, duration: 1, easing: spring }
  }
}
```

A spring can overshoot its target, so on `scale` it would resize the body's
collider past the size you wrote. Toward a small target it can reach zero,
the hazard `TYPE_ZERO_SCALE_PHYSICS` already guards against. So a spring on
`scale` is refused for any object that takes part in physics, whatever its
target. Use `easeOut` for scale there:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 3

  circle ball {
    position: (480, 100)
    radius: 30
    color: #38bdf8
    physics { bounce: 0.5, duration: 3 }
    animate { property: scale, to: 1.5, duration: 1, easing: easeOut }
  }
}
```

([spring](/reference/language/#spring))

## Messages with no code

Some diagnostics have no code. They are the mistakes any property list can
have, and their messages say exactly what is expected.

### A property the shape does not have

```marey error
scene {
  size: (960, 540)
  background: #101433
  duration: 2
  circle sun { position: (480, 270), radius: 40, colour: #ffb347 }
}
```

Property names are spelled one way, and `color` is the American spelling. The
message lists the properties a `circle` takes. The
[property reference](/reference/properties/) lists them for every kind of
object.

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 2
  circle sun { position: (480, 270), radius: 40, color: #ffb347 }
}
```

### A property that is required

```marey error
scene {
  size: (960, 540)
  background: #101433
  duration: 2
  circle sun { position: (480, 270), color: #ffb347 }
}
```

A circle cannot be drawn without a `radius`, and there is no default for it.
The message points at the start of the object, since a missing property has no
place of its own to point at.

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 2
  circle sun { position: (480, 270), radius: 40, color: #ffb347 }
}
```

### A name that was never declared

```marey error
scene {
  size: (960, 540)
  background: #101433
  duration: 2
  circle sun { position: (480, 270), radius: 40, color: warm }
}
```

A bare word as a value must be a name declared with `let`, or one of the
language's own words, such as a colour name. Declare it before the scene:

```marey
let warm = #ffb347

scene {
  size: (960, 540)
  background: #101433
  duration: 2
  circle sun { position: (480, 270), radius: 40, color: warm }
}
```

([`let`](/reference/language/#let))

### A value out of range

```marey error
scene {
  size: (960, 540)
  background: #101433
  duration: 2
  circle lamp { position: (480, 270), radius: 60, color: #ffd84d, alpha: 1.5 }
}
```

`alpha` runs from 0, invisible, to 1, solid. The message gives the range and
the value it got:

```marey
scene {
  size: (960, 540)
  background: #101433
  duration: 2
  circle lamp { position: (480, 270), radius: 60, color: #ffd84d, alpha: 1 }
}
```

Every property's range is in the [property reference](/reference/properties/).
