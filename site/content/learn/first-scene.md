---
title: Your first scene
summary: Write a scene, put circles and rectangles on it, decide which one is on top, and move one with your first animation.
description: Lesson 1 of the Marey course. The scene block, coordinates, circles, rectangles, drawing order, comments and a first animate block.
minutes: 15
learn:
- Write a scene with a size, a background colour and a duration
- Place shapes in pixels, measured from the top-left corner with y growing downwards
- Draw circles and rectangles, and control which one ends up on top
- Move a shape with an animate block
showcase: sunrise
---

The scene above uses only the words this lesson teaches, and by the end of it
you can read every line. Each sample below runs as you read it. Edit the
code under a player and the scene runs again with your change; Reset puts the
sample back.

## A scene

Everything you draw lives inside a `scene` block. A file holds exactly one. The
block's properties are written as `name: value`, and the one a scene cannot do
without is `size`: its width and height in pixels.

Look at the frame the sample draws, and nothing else:

```marey
scene {
  size: (960, 540)
  background: #1b2a4a
}
```

You get an empty, dark blue frame, 960 pixels wide and 540 tall. `(960, 540)`
is a pair of numbers in brackets, called a point: width first, then height.
`background` is the colour behind everything. A colour is written as `#`
followed by six hexadecimal digits: two each for red, green and blue.
[The next lesson](/learn/shapes/) covers colours in full.

Leave `size` out and the scene does not compile. The message names what is
missing:

```marey error
scene {
  background: #1b2a4a
}
```

## Where things go

Positions are measured in pixels from the top-left corner of the scene. x grows
to the right and **y grows downwards**, so `(0, 0)` is the top-left corner and
`(960, 540)` is the bottom-right one.

Here is one circle in the middle of the frame:

```marey
scene {
  size: (960, 540)
  background: #1b2a4a

  circle sun {
    position: (480, 270)
    radius: 60
    color: #ffc857
  }
}
```

`circle` says what kind of shape to draw, and `sun` is the name you give it.
Every shape in a scene needs its own name. Inside the braces, `position` is
where the circle's centre goes and `radius` is its size in pixels. `color` is
optional; without it a shape is white.

A circle needs both `position` and `radius`. Without a radius there is nothing
to draw, and the compiler says which property is missing:

```marey error
scene {
  size: (960, 540)

  circle sun {
    position: (480, 270)
  }
}
```

## Moving things by hand

Change the numbers in `position` and the circle moves. The sample below puts
it near the bottom-left corner. Try the positions in the comments: each one
puts the circle somewhere else in the frame.

```marey
scene {
  size: (960, 540)
  background: #1b2a4a

  // Try (840, 100): near the top-right corner.
  // Try (480, 540): the centre on the bottom edge, so half is cut off.
  circle sun {
    position: (120, 420)
    radius: 60
    color: #ffc857
  }
}
```

The lines starting `//` are comments. Everything from `//` to the end of the
line is ignored by the compiler, so you can use comments for notes to yourself
and to the next person who reads the scene.

When the centre is on the edge of the frame, the half of the circle outside it
is not drawn. Nothing stops you placing a shape outside the frame altogether,
and the showcase does exactly that with shapes that are waiting to move in.

## Rectangles

A `rectangle` needs a `position` and a `size`, written as a point: width, then
height. Like a circle, a rectangle is placed by its centre, not by its
top-left corner.

This sample draws a sea along the bottom of the frame. Look at where its top
edge lands:

```marey
scene {
  size: (960, 540)
  background: #1b2a4a

  // The sea is 210 px tall and fills the bottom of the frame,
  // from y = 330 to y = 540, so its centre is at y = 435.
  rectangle sea {
    position: (480, 435)
    size: (960, 210)
    color: #16365c
  }
}
```

The top edge is the horizon, at y = 330. To put a rectangle's top edge at a
given height, add half its height: 330 + 105 = 435. The next lesson shows how
to move that reference point to an edge or a corner instead.

## What ends up on top

When shapes overlap, the one written later is drawn on top. Watch where the sun
is cut off:

```marey
scene {
  size: (960, 540)
  background: #2b2350

  circle sun {
    position: (480, 330)
    radius: 70
    color: #ffc46b
  }

  rectangle sea {
    position: (480, 435)
    size: (960, 210)
    color: #1c2a52
  }
}
```

The sun is written first and the sea second, so the sea covers the lower half
of the sun and it sits on the horizon. Move the whole `rectangle sea` block
above `circle sun` and run it again: now the sun is drawn over the sea, as a
full disc.

That is all the language needs for depth. There is no "behind" property here:
a shape is behind whatever comes after it in the file.

:::note
Properties can also go on one line, separated by commas. These two are the
same circle:

```marey fragment
circle sun {
  position: (480, 330)
  radius: 70
}

circle sun { position: (480, 330), radius: 70 }
```

The showcase writes its small shapes on one line each, so that a sky full of
stars stays easy to scan.
:::

## How long the scene lasts

`duration` is the length of the scene in seconds. A player stops when it
reaches the end; the players on this site then start again from the beginning.
`duration` is optional, but a scene without one has no set length, so every
scene in this course gives one.

```marey
scene {
  size: (960, 540)
  background: #1b2a4a
  duration: 4

  circle sun {
    position: (480, 270)
    radius: 60
    color: #ffc857
  }
}
```

Nothing moves yet, so the four seconds go by with the same frame on screen.
The time under the player counts them.

## Your first animation

An `animate` block inside a shape changes one of its properties over time. You
will use it more than any other block in the language. It takes three things:

- `property`, the property to change, here `position`;
- `to`, the value to end at;
- `duration`, how many seconds the change takes.

Watch the ball cross the frame:

```marey
scene {
  size: (960, 540)
  background: #1b2a4a
  duration: 3

  circle ball {
    position: (120, 270)
    radius: 40
    color: #ffc857
    animate {
      property: position
      to: (840, 270)
      duration: 3
    }
  }
}
```

The ball starts where its own `position` puts it, at `(120, 270)`, and ends at
`to`. There is no "from": an animation always starts from the value the shape
has when it begins. The ball also starts slowly and slows down before it
stops. That is the default easing, and lesson 3 shows how to
change it. After three seconds the ball stays where it ended.

Now put the two ideas together. The sun starts below the horizon, hidden by
the sea, which is written after it, and rises:

```marey
scene {
  size: (960, 540)
  background: #2b2350
  duration: 4

  circle sun {
    position: (480, 420)
    radius: 70
    color: #ffc46b
    animate { property: position, to: (480, 200), duration: 4 }
  }

  rectangle sea {
    position: (480, 435)
    size: (960, 210)
    color: #1c2a52
  }
}
```

At the start the sun's centre is at y = 420, and its top edge at 350, below
the horizon at 330, so you see only sea and sky. As it rises it comes out from
behind the sea, because the sea is drawn over it the whole time.

## Reading the showcase

Open "Show the source" under the Sunrise player at the top of the page. It is
built from nothing but the ideas above:

- **The stars** are tiny circles written first, so everything else covers them.
- **The dawn** is eight tall rectangles. Each one starts low, mostly hidden by
  the sea, and rises a different distance. As they rise they cover the stars,
  which is how the stars go out.
- **The sun** is four circles with the same position and the same `animate`,
  largest first, so they stack into a glow, a rim and a core.
- **The clouds** are written after the sun, so it rises behind them. Each is one
  or two rectangles with a small circle on each end for rounded ends, over a
  thin warm rectangle for the light on its underside.
- **The sea** is written after the sun, the dawn and the headlands, which is
  what hides everything below the horizon.
- **The fishing boat** is three rectangles that each carry the same `animate`,
  so they travel together.
- **The path of light** is ten thin rectangles that start below the frame and
  rise into place with the sun.
- **The dunes** are the tops of two circles much larger than the frame. They and
  the reeds, thin rectangles, are written last, so they are in front of
  everything.

## Try this

:::try Make it set
Change the rising sun so it sets instead: it should start high in the sky and
end hidden behind the sea.

```marey
scene {
  size: (960, 540)
  background: #2b2350
  duration: 4

  circle sun {
    position: (480, 420)
    radius: 70
    color: #ffc46b
    animate { property: position, to: (480, 200), duration: 4 }
  }

  rectangle sea {
    position: (480, 435)
    size: (960, 210)
    color: #1c2a52
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #2b2350
  duration: 4

  // Swap the start and the end.
  circle sun {
    position: (480, 200)
    radius: 70
    color: #ffc46b
    animate { property: position, to: (480, 420), duration: 4 }
  }

  rectangle sea {
    position: (480, 435)
    size: (960, 210)
    color: #1c2a52
  }
}
```
:::

:::try Rise twice as slowly
Make the sunrise take eight seconds instead of four. Check the time under the
player: the sun should still be climbing at four seconds.

```marey
scene {
  size: (960, 540)
  background: #2b2350
  duration: 4

  circle sun {
    position: (480, 420)
    radius: 70
    color: #ffc46b
    animate { property: position, to: (480, 200), duration: 4 }
  }

  rectangle sea {
    position: (480, 435)
    size: (960, 210)
    color: #1c2a52
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #2b2350
  // The scene has to last as long as the sunrise,
  // or it stops halfway.
  duration: 8

  circle sun {
    position: (480, 420)
    radius: 70
    color: #ffc46b
    animate { property: position, to: (480, 200), duration: 8 }
  }

  rectangle sea {
    position: (480, 435)
    size: (960, 210)
    color: #1c2a52
  }
}
```

Two durations had to change. The `animate` block's duration sets how long the
rise takes, and the scene's sets how long there is to watch it.
:::

:::try Move the horizon
Raise the horizon from y = 330 to y = 260, so there is more sea and less sky.
The sun should still start out of sight and rise clear of the water.

```marey
scene {
  size: (960, 540)
  background: #2b2350
  duration: 4

  circle sun {
    position: (480, 420)
    radius: 70
    color: #ffc46b
    animate { property: position, to: (480, 200), duration: 4 }
  }

  rectangle sea {
    position: (480, 435)
    size: (960, 210)
    color: #1c2a52
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #2b2350
  duration: 4

  // The sun's top edge starts at 350, below the new horizon,
  // and its bottom edge ends at 220, above it.
  circle sun {
    position: (480, 420)
    radius: 70
    color: #ffc46b
    animate { property: position, to: (480, 150), duration: 4 }
  }

  // 280 px tall, from y = 260 to y = 540: centre 260 + 140 = 400.
  rectangle sea {
    position: (480, 400)
    size: (960, 280)
    color: #1c2a52
  }
}
```
:::

## Recap

- A file holds exactly one `scene` block. It needs `size`; `background` and
  `duration` are optional. ([Scene model](/reference/language/#scene-model))
- Positions are in pixels from the top-left corner, with y growing downwards.
  ([Scene model](/reference/language/#scene-model))
- A `circle` needs `position` and `radius`; a `rectangle` needs `position` and
  `size`. Both are placed by their centre. ([Shapes](/reference/language/#shapes))
- Shapes are drawn in the order they are written, so a later shape covers an
  earlier one. ([Scene model](/reference/language/#scene-model))
- `//` starts a comment that runs to the end of the line.
  ([Scene model](/reference/language/#scene-model))
- An `animate` block takes `property`, `to` and `duration`, and starts from the
  shape's current value. ([Animation](/reference/language/#animation))
