---
title: Groups and local space
summary: Gather shapes into a group, move and turn them as one, and nest groups so their motions add up.
description: Lesson 5 of the Marey course. The group object, positions relative to a group, a group's pivot at its own (0, 0) and why it has no origin, and transforms and motions that compose through nested groups.
minutes: 20
learn:
- Gather shapes into a group and move them with one animate
- Place a group's children in its own space, measured from the group's (0, 0)
- Turn and grow a group about its (0, 0), and know why a group has no origin
- Nest groups so their positions, turns, sizes and motions add up
showcase: orrery
---

Every scene so far has been a flat list of shapes. When several shapes had to
move together, like the boat in [Set Sail](/gallery/set-sail/), each one
carried its own copy of the same `animate`. This lesson adds `group`, an object
that holds other objects, so a set of shapes can be placed, turned and moved as
one.

## A group moves its children as one

A `group` is written like a shape, with a kind, a name and a block. Inside the
block go the group's own properties, any `animate` blocks, and its children,
which can be shapes or other groups; [the next lesson](/learn/sequence/) adds
one more kind of block. A group has no shape or colour of its own, so what you
see is its children, and it has no required properties. Only a group can hold
other objects; a shape inside a `circle` or any other shape is a compile error.

The balloon below is four shapes in one group, and there is only one `animate`
in the scene. Watch all four parts rise:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  group balloon {
    position: (480, 400)
    animate { property: position, to: (480, 180), duration: 3 }

    line ropeL    { position: (-27, 36), points: [(-13, -26), (13, 26)], thickness: 2, color: #fbf3e4 }
    line ropeR    { position: (27, 36), points: [(13, -26), (-13, 26)], thickness: 2, color: #fbf3e4 }
    circle canopy { position: (0, -30), radius: 64, color: #e4553b }
    rectangle basket { position: (0, 72), size: (36, 22), color: #b0703c }
  }
}
```

The `animate` belongs to the group, so it moves the group, and the ropes, the
canopy and the basket go with it. Nothing in the shapes changed. One `animate`
on a group does what one `animate` per shape did in the earlier lessons, and the
parts cannot drift apart, because there is only one motion to get wrong.

## Positions inside a group are local

A child's `position` is not a place in the scene. It is measured from the
group's own (0, 0), which is wherever the group's `position` puts it. This is
the group's **local space**: the canopy above sits 30 pixels above the group's
point, and the basket 72 below it, wherever the group goes.

So the same children can be placed anywhere by moving only the group. The two
balloons below are written with the same shapes and the same numbers inside;
only their groups' positions differ. Look at the children's positions, then at
where they end up:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  group near {
    position: (320, 330)
    line ropeL    { position: (-27, 36), points: [(-13, -26), (13, 26)], thickness: 2, color: #fbf3e4 }
    line ropeR    { position: (27, 36), points: [(13, -26), (-13, 26)], thickness: 2, color: #fbf3e4 }
    circle canopy { position: (0, -30), radius: 64, color: #e4553b }
    rectangle basket { position: (0, 72), size: (36, 22), color: #b0703c }
  }

  group far {
    position: (680, 200)
    line ropeL    { position: (-27, 36), points: [(-13, -26), (13, 26)], thickness: 2, color: #fbf3e4 }
    line ropeR    { position: (27, 36), points: [(13, -26), (-13, 26)], thickness: 2, color: #fbf3e4 }
    circle canopy { position: (0, -30), radius: 64, color: #2f8a94 }
    rectangle basket { position: (0, 72), size: (36, 22), color: #b0703c }
  }
}
```

Each canopy is 30 pixels above its own group's point: at (320, 300) on the
left and (680, 170) on the right. The children of each group even have the
same names. A name has to be unique among the objects directly beside it, in
the scene or in one group, so two groups can each have a `canopy`, but one group
cannot have two:

```marey error
scene {
  size: (960, 540)
  duration: 4

  group near {
    position: (320, 330)
    circle canopy { position: (0, -30), radius: 64 }
    circle canopy { position: (0, 40), radius: 20 }
  }
}
```

## A group turns about its own (0, 0)

A shape turns and grows about its `origin`, which is the centre of its box
unless you move it. **A group's pivot is its own (0, 0)**, the point its
`position` places. It is never worked out from where the children sit, even
when they all sit to one side of it.

Both groups below turn once every four seconds. Each has a white dot at its
(0, 0). The left group's children are spread evenly around that point; the
right group's are all off to its right. Watch what each one turns about:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 8

  group around {
    position: (280, 270)
    animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
    rectangle bar { position: (0, 0), size: (140, 20), color: #ffc46b }
    circle endA   { position: (-70, 0), radius: 14, color: #e4553b }
    circle endB   { position: (70, 0), radius: 14, color: #e4553b }
    circle pivot  { position: (0, 0), radius: 5, color: #fbf3e4 }
  }

  group aside {
    position: (680, 270)
    animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
    rectangle bar { position: (90, 0), size: (140, 20), color: #ffc46b }
    circle endA   { position: (20, 0), radius: 14, color: #e4553b }
    circle endB   { position: (160, 0), radius: 14, color: #e4553b }
    circle pivot  { position: (0, 0), radius: 5, color: #fbf3e4 }
  }
}
```

The left group spins in place, like a baton. The right group has the same
three shapes, moved 90 pixels to the right inside it, and it swings round its
dot like a clock hand: the middle of its shapes is at (90, 0), but its pivot
stays at (0, 0). To turn a group about a different point, move the children,
not the group's pivot.

That is also why a group takes no `origin`. On a shape, `origin` is a fraction
of the shape's own box. A group has no box of its own, and working one out
from its children is exactly what the pivot rule refuses to do:

```marey error=TYPE_ORIGIN_ON_GROUP
scene {
  size: (960, 540)
  duration: 4

  group lamp {
    position: (480, 270)
    origin: (0.5, 1)
    circle bulb { position: (0, 0), radius: 20 }
  }
}
```

Instead, place the children so that (0, 0) is where the pivot should be. A
group that should grow up out of the ground keeps its children above (0, 0),
like the tree below. It starts at `scale: 0`, so it begins as a single point.
Watch where it grows from:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  rectangle ground { position: (480, 490), size: (960, 100), color: #13221f }

  // (0, 0) is the foot of the trunk, on the ground.
  group tree {
    position: (480, 440)
    scale: 0
    animate { property: scale, to: 1, duration: 1.5, easing: easeOut }
    rectangle trunk { position: (0, -40), size: (18, 80), color: #7a4527 }
    circle crownL   { position: (-34, -100), radius: 40, color: #2f8a94 }
    circle crownR   { position: (34, -100), radius: 40, color: #2f8a94 }
    circle crownTop { position: (0, -140), radius: 48, color: #3aa3a8 }
  }
}
```

The tree grows up and out from the foot of its trunk, which never leaves the
ground, because the trunk's foot is the group's (0, 0).

## Groups inside groups

A group can hold other groups, and each one's transform, its `position`,
`rotation` and `scale`, applies on top of its parent's. A shape inside two
groups is placed, turned and sized by both.

Below, the left key is plain shapes. The right one is the same shapes inside
a group turned 45 degrees, inside another group at half size. Compare the two:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  // The key, as plain shapes.
  rectangle shaft { position: (240, 270), size: (200, 24), color: #ffc46b }
  circle bow      { position: (120, 270), radius: 48, color: #ffc46b }
  rectangle bit   { position: (320, 296), size: (24, 30), color: #ffc46b }

  // The same key, written about (0, 0), inside two groups.
  group half {
    position: (680, 270)
    scale: 0.5
    group turned {
      position: (120, 0)
      rotation: 45
      rectangle shaft { position: (0, 0), size: (200, 24), color: #2f8a94 }
      circle bow      { position: (-120, 0), radius: 48, color: #2f8a94 }
      rectangle bit   { position: (80, 26), size: (24, 30), color: #2f8a94 }
    }
  }
}
```

The right key is half the size and turned 45 degrees: the outer group's
`scale` and the inner group's `rotation` both reach every shape. Even the inner
group's `position` is halved. It is 120 pixels from its parent's (0, 0), but
those are the parent's half-size pixels, so the key's centre is 60 scene
pixels to the right of (680, 270).

## Motions add up too

An `animate` on a group moves that group in its parent's space, and everything
inside comes along. Put a moving group inside another moving group and the two
motions add up. Each one is written as if the other did not exist.

The boat below has three motions in three groups: the outer one drifts left
and right, the middle one bobs up and down, and the inner one rocks. Watch the
boat do all three at once:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 6

  rectangle sea { position: (480, 440), size: (960, 200), color: #113b50 }

  group drift {
    position: (380, 330)
    animate { property: position, to: (580, 330), duration: 3, loop: true, yoyo: true }
    group bob {
      animate { property: position, to: (0, -10), duration: 1, loop: true, yoyo: true }
      group rock {
        rotation: -6
        animate { property: rotation, to: 6, duration: 1.5, loop: true, yoyo: true }
        polygon hull { position: (0, 14), color: #e4553b
                       points: [(-80, -16), (80, -16), (56, 16), (-60, 16)] }
        rectangle mast { position: (0, -60), size: (6, 120), color: #fbf3e4 }
        polygon sail   { position: (34, -64), color: #fbf3e4
                         points: [(-28, -52), (28, 52), (-28, 52)] }
      }
    }
  }
}
```

The boat sails 200 pixels to the right and back in six seconds, rises and
sinks once every two, and tips one way and back once every three. The `bob`
group has no `position`, so it sits at (0, 0) inside `drift`, and its
`to: (0, -10)` is in `drift`'s space: 10 pixels above wherever the drift has
got to. `rock` has no `position` either, so it turns about the same point, the
foot of the mast on the deck, and the mast swings over the hull. The
[Lighthouse](/gallery/lighthouse/) scene's boat is built the same way.

## Reading the showcase

Open "Show the source" under the Orrery player at the top of the page. The
scene lasts twelve seconds and loops without a seam:

- **One group holds the machine.** `system` sits at the centre of the scene,
  and everything that turns is inside it, so every position inside is measured
  from the sun.
- **Each orbit is a group on the sun.** `orbit1`, `orbit2` and `orbit3` have
  no `position`, so their (0, 0), their pivot, is the sun's centre. Each holds
  a brass arm and a planet placed along its x axis, and turns 360 degrees with
  `easing: linear` and `loop: true`: once every 4, 6 and 12 seconds. The arm and
  the planet go round because they are children of the turning group. Each
  starts at a different `rotation`, so the planets begin spread out.
- **Each planet is a group at the end of its arm.** It does not turn, so its
  axes stay the orbit's, and the sun is always on its -x side. Its night side,
  a half disc on its +x side, is therefore always the side away from the sun.
- **Each planet's surface is a group inside the planet** that turns on its own,
  once every 2, 3 or 4 seconds. Its bands, spots and continent turn with it,
  and the turn adds to the orbit's.
- **The moon** is in `moonOrbit`, a group inside the middle planet that turns
  once every three seconds. Its pivot is the planet's centre, and it is carried
  round the sun with the planet: two turns, one inside the other. The moon's
  crater, on the side facing the planet, turns with `moonOrbit`, so the moon
  always shows the planet the same face. Its night side is in one more group,
  `moonLight`, which turns -360 while `moonOrbit` turns 360. The two turns
  cancel, so that group's axes are the planet's, and the moon's night side
  points away from the sun like the planets'.
- **The sun's glow** is twelve faint circles in one group, `corona`, with one
  `animate` on its `scale`, so the whole glow breathes together.
- **Every period**, 2, 3, 4, 6 or 12 seconds, divides the twelve, and nothing
  is delayed, so the scene loops without a seam, as in
  [the lesson on timing](/learn/timing/).

## Try this

The exercises use a smaller orrery: a sun, an inner planet on a four-second
orbit, and an outer planet on a twelve-second orbit whose surface turns.
Everything is inside one group, `system`, and both planets start lined up to
the right of the sun.

:::try Reverse one orbit
Make the inner planet go round anticlockwise, in the same four seconds, while
the outer one keeps going clockwise.

```marey
scene {
  size: (960, 540)
  background: #070a18
  duration: 12

  group system {
    position: (480, 270)

    group orbitIn {
      animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
      rectangle armIn  { position: (55, 0), size: (110, 3), color: #a8844a }
      circle planetIn  { position: (110, 0), radius: 14, color: #e07a4f }
    }

    group orbitOut {
      animate { property: rotation, to: 360, duration: 12, easing: linear, loop: true }
      rectangle armOut { position: (105, 0), size: (210, 3), color: #a8844a }
      group planetOut {
        position: (210, 0)
        circle body { position: (0, 0), radius: 22, color: #b79be0 }
        group surface {
          animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
          rectangle band { position: (0, -8), size: (36, 6), color: #8f73c9 }
          circle storm   { position: (8, 8), radius: 4, color: #e58f7a }
        }
      }
    }

    circle sun { position: (0, 0), radius: 30, color: #ffc861 }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #070a18
  duration: 12

  group system {
    position: (480, 270)

    // -360 turns the same amount the other way.
    group orbitIn {
      animate { property: rotation, to: -360, duration: 4, easing: linear, loop: true }
      rectangle armIn  { position: (55, 0), size: (110, 3), color: #a8844a }
      circle planetIn  { position: (110, 0), radius: 14, color: #e07a4f }
    }

    group orbitOut {
      animate { property: rotation, to: 360, duration: 12, easing: linear, loop: true }
      rectangle armOut { position: (105, 0), size: (210, 3), color: #a8844a }
      group planetOut {
        position: (210, 0)
        circle body { position: (0, 0), radius: 22, color: #b79be0 }
        group surface {
          animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
          rectangle band { position: (0, -8), size: (36, 6), color: #8f73c9 }
          circle storm   { position: (8, 8), radius: 4, color: #e58f7a }
        }
      }
    }

    circle sun { position: (0, 0), radius: 30, color: #ffc861 }
  }
}
```

Only `orbitIn`'s `to` changes, from 360 to -360. A positive rotation turns
clockwise, so a negative one turns anticlockwise. The arm and the planet go
the other way because the group they belong to does. -360 degrees looks the
same as 0, so the loop still has no seam.
:::

:::try Add a moon to the outer planet
Give the outer planet a small moon, 40 pixels from its centre, that goes round
it once every three seconds while the planet goes round the sun.

```marey
scene {
  size: (960, 540)
  background: #070a18
  duration: 12

  group system {
    position: (480, 270)

    group orbitIn {
      animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
      rectangle armIn  { position: (55, 0), size: (110, 3), color: #a8844a }
      circle planetIn  { position: (110, 0), radius: 14, color: #e07a4f }
    }

    group orbitOut {
      animate { property: rotation, to: 360, duration: 12, easing: linear, loop: true }
      rectangle armOut { position: (105, 0), size: (210, 3), color: #a8844a }
      group planetOut {
        position: (210, 0)
        circle body { position: (0, 0), radius: 22, color: #b79be0 }
        group surface {
          animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
          rectangle band { position: (0, -8), size: (36, 6), color: #8f73c9 }
          circle storm   { position: (8, 8), radius: 4, color: #e58f7a }
        }
      }
    }

    circle sun { position: (0, 0), radius: 30, color: #ffc861 }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #070a18
  duration: 12

  group system {
    position: (480, 270)

    group orbitIn {
      animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
      rectangle armIn  { position: (55, 0), size: (110, 3), color: #a8844a }
      circle planetIn  { position: (110, 0), radius: 14, color: #e07a4f }
    }

    group orbitOut {
      animate { property: rotation, to: 360, duration: 12, easing: linear, loop: true }
      rectangle armOut { position: (105, 0), size: (210, 3), color: #a8844a }
      group planetOut {
        position: (210, 0)
        circle body { position: (0, 0), radius: 22, color: #b79be0 }
        group surface {
          animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
          rectangle band { position: (0, -8), size: (36, 6), color: #8f73c9 }
          circle storm   { position: (8, 8), radius: 4, color: #e58f7a }
        }

        // The moon's orbit: a group on the planet's centre.
        group moonOrbit {
          animate { property: rotation, to: 360, duration: 3, easing: linear, loop: true }
          circle moon { position: (40, 0), radius: 6, color: #d9dde6 }
        }
      }
    }

    circle sun { position: (0, 0), radius: 30, color: #ffc861 }
  }
}
```

The moon needs a group of its own to turn: `moonOrbit`, inside `planetOut` so
that its (0, 0) is the planet's centre, and the moon 40 pixels along its x
axis. It goes in `planetOut`, not in `surface`. Inside `surface`, the
surface's turn would add to the moon's, and the moon would go round the planet
faster than once every three seconds. Three seconds divides the twelve, so the loop
still has no seam.
:::

:::try Tilt the whole system
At the start, both planets are lined up to the right of the sun. Make them
start lined up on a line that rises to the right at 30 degrees instead, by
changing one group.

```marey
scene {
  size: (960, 540)
  background: #070a18
  duration: 12

  group system {
    position: (480, 270)

    group orbitIn {
      animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
      rectangle armIn  { position: (55, 0), size: (110, 3), color: #a8844a }
      circle planetIn  { position: (110, 0), radius: 14, color: #e07a4f }
    }

    group orbitOut {
      animate { property: rotation, to: 360, duration: 12, easing: linear, loop: true }
      rectangle armOut { position: (105, 0), size: (210, 3), color: #a8844a }
      group planetOut {
        position: (210, 0)
        circle body { position: (0, 0), radius: 22, color: #b79be0 }
        group surface {
          animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
          rectangle band { position: (0, -8), size: (36, 6), color: #8f73c9 }
          circle storm   { position: (8, 8), radius: 4, color: #e58f7a }
        }
      }
    }

    circle sun { position: (0, 0), radius: 30, color: #ffc861 }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #070a18
  duration: 12

  // Turned 30 degrees anticlockwise, with everything inside it.
  group system {
    position: (480, 270)
    rotation: -30

    group orbitIn {
      animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
      rectangle armIn  { position: (55, 0), size: (110, 3), color: #a8844a }
      circle planetIn  { position: (110, 0), radius: 14, color: #e07a4f }
    }

    group orbitOut {
      animate { property: rotation, to: 360, duration: 12, easing: linear, loop: true }
      rectangle armOut { position: (105, 0), size: (210, 3), color: #a8844a }
      group planetOut {
        position: (210, 0)
        circle body { position: (0, 0), radius: 22, color: #b79be0 }
        group surface {
          animate { property: rotation, to: 360, duration: 4, easing: linear, loop: true }
          rectangle band { position: (0, -8), size: (36, 6), color: #8f73c9 }
          circle storm   { position: (8, 8), radius: 4, color: #e58f7a }
        }
      }
    }

    circle sun { position: (0, 0), radius: 30, color: #ffc861 }
  }
}
```

`system` gets `rotation: -30`. A negative rotation is anticlockwise, and with y
pointing down, anticlockwise from the right is up and to the right. Every
orbit is inside `system`, so the whole machine turns 30 degrees and the orbits
still turn inside it at their own rates: the planets start on the tilted line
and go round from there.
:::

## Recap

- A `group` holds other objects and has no shape or colour of its own. It has
  no required properties, and only a group can hold other objects.
  ([Shapes](/reference/language/#shapes))
- A child's `position` is measured from its group's (0, 0), and moving or
  turning the group moves and turns its children.
  ([Scene model](/reference/language/#scene-model))
- A group's pivot is its own (0, 0), never the middle of its children, and
  `origin` on a group is a compile error. Place the children around the point
  the group should turn or grow about.
  ([Scene model](/reference/language/#scene-model))
- An `animate` can belong to a group as well as to a shape.
  ([Animation](/reference/language/#animation))
- A group's properties are `position`, `rotation`, `scale`, `alpha` and
  `layer`. ([group properties](/reference/properties/#group))
- Groups nest. A shape inside several groups is placed, turned and sized by
  all of them, and their motions add up. A group's `animate` moves it in its
  parent's space. ([Scene model](/reference/language/#scene-model))
