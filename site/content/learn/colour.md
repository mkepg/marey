---
title: Colour
summary: Animate a shape's colour, see which colours a blend passes through, write colour changes as the steps of a sequence, and fade a whole group with alpha.
description: Lesson 7 of the Marey course. Animating colour with property color, how colours blend channel by channel in whole 8-bit steps, colour in a sequence, why a group has no colour, and how a group's alpha multiplies with its children's.
minutes: 20
learn:
- Animate a shape's colour with property: color
- Predict the colours a blend passes through on its way
- Write colour changes as the steps of a sequence, and keep several shapes in step
- Fade a whole group with alpha, since a group has no colour
showcase: day-to-night
---

Every colour in the lessons so far was set once and stayed. Colour is one of
the five properties an `animate` can change, along with position, rotation,
scale and alpha, so everything [the lesson on timing](/learn/timing/) and
[the lesson on sequences](/learn/sequence/) taught works on it too. This lesson
covers what is particular to colour: how two colours blend, and what to do
about groups, which have no colour of their own.

## Animating a colour

`property: color` animates a shape's colour. Its `to` is a colour, written as a
hex code or a named colour, and the shape's declared `color` is where the
animation starts, as with every other property.

The lamp below starts dark red and animates to amber, as a yoyo loop of one
second each way. Watch the shades it passes through:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 2

  circle lamp {
    position: (480, 270)
    radius: 90
    color: #7a1f1a
    animate { property: color, to: #ffb347, duration: 1, loop: true, yoyo: true }
  }
}
```

The lamp warms through brick reds and oranges to amber, and cools back the same
way, every two seconds. You wrote only the two ends; every colour in between
came from the blend. The default `easeInOut` makes it linger at each end, just
as it slows a moving shape.

## How two colours blend

A colour is three numbers, its red, green and blue channels, each from 0 to
255. A six-digit hex code writes them in pairs: `#e04000` is red `e0`, which
is 224, green `40`, which is 64, and blue `00`, which is 0. An animation blends
each channel on its own, from its start to its end, at the animation's
progress, and every frame lands on whole numbers for all three.

This blend happens in sRGB, the colour space hex codes are written in. Each
channel takes a straight line from one code's number to the other's, which is
not the same as a straight line between the colours as the eye sees them.
That is why two strong colours can meet in a dull middle, as the next sample
shows.

So the halfway colour is the halfway value of each channel. From `#e04000` to
`#2080c0`, red goes from 224 to 32, green from 64 to 128 and blue from 0 to
192. Halfway, they are 128, 96 and 96, which is `#806060`, a greyish brown.

The large swatch below runs between those two colours, with `easing: linear`
so that halfway in time is halfway in colour. The three below it are its start,
that halfway colour and its end. Pause the player at one second and compare the
large swatch with the middle one:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  // The colour to watch.
  rectangle swatch {
    position: (480, 190), size: (600, 140), color: #e04000
    animate { property: color, to: #2080c0, duration: 2, easing: linear, loop: true, yoyo: true }
  }

  // Where it starts, its halfway colour, and where it ends.
  rectangle start  { position: (280, 390), size: (180, 100), color: #e04000 }
  rectangle middle { position: (480, 390), size: (180, 100), color: #806060 }
  rectangle end    { position: (680, 390), size: (180, 100), color: #2080c0 }
}
```

At one second the large swatch is the middle colour exactly. A blend between a
strong orange and a strong blue passes through a dull brown, not a bright
purple, because each channel takes the straight route and the two colours pull
in opposite directions. When a blend passes through a muddy middle you don't
want, give it a stop on the way: a sequence of two colour steps, through a
colour you choose. The next section covers colour in a sequence.

An easing changes when the colours arrive, not which colours they are. With
the default `easeInOut` the swatch would pass through the same browns, just
faster in the middle of each leg.

## Colour in a sequence

Colour steps in a `sequence` work like any other steps: each starts from the
colour the last one left, and a hold is an `animate` to the colour the shape
already has.

The traffic light below has three lamps, each with its own sequence of holds
and switches. A switch is a colour step of 0.15 seconds, short enough to read
as a switch rather than a fade. Watch the order the lamps light in, and that
only one is lit at a time:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 5

  rectangle housing { position: (480, 270), size: (130, 340), color: #14181f }

  // Lit from 0 to 2 s, and again from 4.85 s.
  circle stop {
    position: (480, 160), radius: 44, color: #ff3b30
    sequence {
      animate { property: color, to: #ff3b30, duration: 2 }
      animate { property: color, to: #3a1210, duration: 0.15 }
      animate { property: color, to: #3a1210, duration: 2.7 }
      animate { property: color, to: #ff3b30, duration: 0.15 }
    }
  }

  // Lit from 4 to 4.85 s.
  circle amber {
    position: (480, 270), radius: 44, color: #3d2a05
    sequence {
      animate { property: color, to: #3d2a05, duration: 4 }
      animate { property: color, to: #ffb000, duration: 0.15 }
      animate { property: color, to: #ffb000, duration: 0.7 }
      animate { property: color, to: #3d2a05, duration: 0.15 }
    }
  }

  // Lit from 2 to 4 s.
  circle go {
    position: (480, 380), radius: 44, color: #0f3320
    sequence {
      animate { property: color, to: #0f3320, duration: 2 }
      animate { property: color, to: #30d158, duration: 0.15 }
      animate { property: color, to: #30d158, duration: 1.85 }
      animate { property: color, to: #0f3320, duration: 0.15 }
    }
  }
}
```

Red holds for two seconds and goes dark as green lights. Green holds until 4
seconds and goes dark as amber lights, and amber hands back to red at 4.85.
Each lamp's steps add up to the moments it should change, as the title card's
parts did in the last lesson. The red lamp's sequence ends at 5 seconds on the
colour it started with, so when the player starts the scene again, nothing
jumps.

Several shapes change together when their sequences share the same step
times. That is how the showcase keeps its sky and its city in step: every band,
cloud and building has four colour steps of exactly three seconds.

## A group has no colour

A `group` holds shapes but draws nothing itself, so it has no `color`, and
`property: color` on a group is a compile error:

```marey error=TYPE_ANIM_COLOR_TARGET
scene {
  size: (960, 540)
  duration: 4

  group lamp {
    position: (480, 270)
    circle bulb { position: (0, 0), radius: 60, color: #7a1f1a }
    animate { property: color, to: #ffb347, duration: 1 }
  }
}
```

The message names the shapes that have a colour and says that `lamp` is a
group. To change the colour of a group's contents, give each shape inside it its
own colour animation. The showcase's clouds do this: each cloud group drifts,
and each of its two shapes has its own four colours.

## Fading a whole group

What a group does have is `alpha`, and a group's alpha multiplies with its
children's. A shape at `alpha: 0.5` inside a group at `alpha: 0.5` is drawn at
0.25, a quarter of full strength.

The three discs below are all the same colour. Compare the middle one with the
two beside it:

```marey
scene {
  size: (960, 540)
  background: #1d2c48

  // 0.5 on its own.
  circle half { position: (240, 270), radius: 90, color: #ffc46b, alpha: 0.5 }

  // 0.5, inside a group at 0.5.
  group dim {
    position: (480, 270)
    alpha: 0.5
    circle inner { position: (0, 0), radius: 90, color: #ffc46b, alpha: 0.5 }
  }

  // 0.25 on its own.
  circle quarter { position: (720, 270), radius: 90, color: #ffc46b, alpha: 0.25 }
}
```

The middle disc matches the right one, not the left: its own 0.5 times its
group's 0.5 is 0.25. The product runs through every group a shape is in, so a
shape two groups deep is multiplied by both.

This is what makes a group's alpha useful. Animate it, and everything inside
fades together, each shape keeping its own brightness relative to the others.
Each child is still drawn on its own, though, so in a group below full alpha,
where two children overlap, the one behind shows through the one in front: a
group's alpha dims its shapes one by one, not as a single flat picture.
A group at alpha 0 hides its children whatever their own alpha is doing, so a
child can twinkle all through the scene and be seen only while its group is
up. The showcase's stars and the lights on its river work like that.

## Reading the showcase

Open "Show the source" under the Day to Night player at the top of the page. The
scene lasts twelve seconds, runs from noon through dusk, night and dawn back to
noon, and loops without a seam:

- **The sky** is nine bands. Each has a `sequence` of four colour steps of three
  seconds: to its dusk colour, to night, to dawn, and back to the day colour it
  started with. The lowest bands go to the warmest colours at dusk, so the
  afterglow sits on the horizon.
- **The clouds, the three rows of buildings, the river and the quay** have the
  same four steps with their own colours. Every one of them changes at 3, 6, 9
  and 12 seconds, so the whole picture changes as one, and each ends on its
  starting colour.
- **The sun and the moon** ride one group that turns a full circle in twelve
  seconds. The sun's own sequence reddens it as it sets; the moon's turns it
  from amber to silver at the top of its arc.
- **The windows** each have two steps, with a step `delay`, as in the last
  lesson: wait, warm to lamplight; wait, cool to dark glass. Their delays
  differ, so the city lights up a window at a time.
- **The stars** are in one group whose `alpha` rises after sunset and falls
  before sunrise. Each star twinkles all the time; the group's alpha decides
  when they are seen. The lights on the water are another such group.

## Try this

The exercises use a small version of the scene: a sky, a city and one window.
Its sky goes to dusk in two seconds, to night in two more, holds the night for
four, then turns to dawn and back to day in two each. The window lights at dusk
and goes dark as dawn begins.

:::try Shorten the night
Make the night hold for two seconds instead of four, so dawn begins at 6
seconds instead of 8. The scene stays twelve seconds long, and the window still
goes dark as dawn begins.

```marey
scene {
  size: (960, 540)
  background: #6aa2d5
  duration: 12

  rectangle sky {
    position: (480, 200), size: (960, 400), color: #6aa2d5
    sequence {
      animate { property: color, to: #c25577, duration: 2 }   // dusk
      animate { property: color, to: #0c1229, duration: 2 }   // night
      animate { property: color, to: #0c1229, duration: 4 }   // the night holds
      animate { property: color, to: #dca699, duration: 2 }   // dawn
      animate { property: color, to: #6aa2d5, duration: 2 }   // day
    }
  }

  polygon city {
    position: (0, 260), origin: (0, 0), color: #4f5f78
    points: [(0, 330), (120, 330), (120, 280), (220, 280), (220, 300), (330, 300),
             (330, 260), (400, 260), (400, 340), (520, 340), (520, 290), (640, 290),
             (640, 320), (760, 320), (760, 270), (860, 270), (860, 330), (960, 330),
             (960, 540), (0, 540)]
    sequence {
      animate { property: color, to: #33264a, duration: 2 }
      animate { property: color, to: #0a0f20, duration: 2 }
      animate { property: color, to: #0a0f20, duration: 4 }
      animate { property: color, to: #403a58, duration: 2 }
      animate { property: color, to: #4f5f78, duration: 2 }
    }
  }

  rectangle window {
    position: (365, 300), size: (14, 20), color: #2a3248
    sequence {
      animate { property: color, to: #ffd27a, duration: 0.5, delay: 2 }
      animate { property: color, to: #2a3248, duration: 0.5, delay: 5.5 }
    }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #6aa2d5
  duration: 12

  rectangle sky {
    position: (480, 200), size: (960, 400), color: #6aa2d5
    sequence {
      animate { property: color, to: #c25577, duration: 2 }
      animate { property: color, to: #0c1229, duration: 2 }
      animate { property: color, to: #0c1229, duration: 2 }   // was 4
      animate { property: color, to: #dca699, duration: 2 }
      animate { property: color, to: #6aa2d5, duration: 2 }
    }
  }

  polygon city {
    position: (0, 260), origin: (0, 0), color: #4f5f78
    points: [(0, 330), (120, 330), (120, 280), (220, 280), (220, 300), (330, 300),
             (330, 260), (400, 260), (400, 340), (520, 340), (520, 290), (640, 290),
             (640, 320), (760, 320), (760, 270), (860, 270), (860, 330), (960, 330),
             (960, 540), (0, 540)]
    sequence {
      animate { property: color, to: #33264a, duration: 2 }
      animate { property: color, to: #0a0f20, duration: 2 }
      animate { property: color, to: #0a0f20, duration: 2 }   // was 4
      animate { property: color, to: #403a58, duration: 2 }
      animate { property: color, to: #4f5f78, duration: 2 }
    }
  }

  rectangle window {
    position: (365, 300), size: (14, 20), color: #2a3248
    sequence {
      animate { property: color, to: #ffd27a, duration: 0.5, delay: 2 }
      animate { property: color, to: #2a3248, duration: 0.5, delay: 3.5 }   // was 5.5
    }
  }
}
```

The hold changes on both the sky and the city, so the two stay in step. Their
sequences now end at 10 seconds instead of 12, back on their day colours, which
they keep until the scene starts again, so the loop still has no seam. The
window is fully lit at 2.5 seconds; a second step with `delay: 3.5` starts it
cooling at 6, as dawn begins.
:::

:::try A light for aircraft
Put a small red light on top of the tallest building, at (365, 252), that
blinks once a second, and is seen only from when the night is reached, at 4
seconds, to when dawn begins, at 8.

```marey
scene {
  size: (960, 540)
  background: #6aa2d5
  duration: 12

  rectangle sky {
    position: (480, 200), size: (960, 400), color: #6aa2d5
    sequence {
      animate { property: color, to: #c25577, duration: 2 }
      animate { property: color, to: #0c1229, duration: 2 }
      animate { property: color, to: #0c1229, duration: 4 }
      animate { property: color, to: #dca699, duration: 2 }
      animate { property: color, to: #6aa2d5, duration: 2 }
    }
  }

  polygon city {
    position: (0, 260), origin: (0, 0), color: #4f5f78
    points: [(0, 330), (120, 330), (120, 280), (220, 280), (220, 300), (330, 300),
             (330, 260), (400, 260), (400, 340), (520, 340), (520, 290), (640, 290),
             (640, 320), (760, 320), (760, 270), (860, 270), (860, 330), (960, 330),
             (960, 540), (0, 540)]
    sequence {
      animate { property: color, to: #33264a, duration: 2 }
      animate { property: color, to: #0a0f20, duration: 2 }
      animate { property: color, to: #0a0f20, duration: 4 }
      animate { property: color, to: #403a58, duration: 2 }
      animate { property: color, to: #4f5f78, duration: 2 }
    }
  }

  rectangle window {
    position: (365, 300), size: (14, 20), color: #2a3248
    sequence {
      animate { property: color, to: #ffd27a, duration: 0.5, delay: 2 }
      animate { property: color, to: #2a3248, duration: 0.5, delay: 5.5 }
    }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #6aa2d5
  duration: 12

  rectangle sky {
    position: (480, 200), size: (960, 400), color: #6aa2d5
    sequence {
      animate { property: color, to: #c25577, duration: 2 }
      animate { property: color, to: #0c1229, duration: 2 }
      animate { property: color, to: #0c1229, duration: 4 }
      animate { property: color, to: #dca699, duration: 2 }
      animate { property: color, to: #6aa2d5, duration: 2 }
    }
  }

  polygon city {
    position: (0, 260), origin: (0, 0), color: #4f5f78
    points: [(0, 330), (120, 330), (120, 280), (220, 280), (220, 300), (330, 300),
             (330, 260), (400, 260), (400, 340), (520, 340), (520, 290), (640, 290),
             (640, 320), (760, 320), (760, 270), (860, 270), (860, 330), (960, 330),
             (960, 540), (0, 540)]
    sequence {
      animate { property: color, to: #33264a, duration: 2 }
      animate { property: color, to: #0a0f20, duration: 2 }
      animate { property: color, to: #0a0f20, duration: 4 }
      animate { property: color, to: #403a58, duration: 2 }
      animate { property: color, to: #4f5f78, duration: 2 }
    }
  }

  rectangle window {
    position: (365, 300), size: (14, 20), color: #2a3248
    sequence {
      animate { property: color, to: #ffd27a, duration: 0.5, delay: 2 }
      animate { property: color, to: #2a3248, duration: 0.5, delay: 5.5 }
    }
  }

  // The group decides when the light is seen: hidden until 4 s,
  // seen until 8 s, hidden again by 8.2 s.
  group beacon {
    alpha: 0
    sequence {
      animate { property: alpha, to: 0, duration: 4 }
      animate { property: alpha, to: 1, duration: 0.2 }
      animate { property: alpha, to: 1, duration: 3.8 }
      animate { property: alpha, to: 0, duration: 0.2 }
    }
    // The light blinks all the time: a yoyo of half a second each
    // way, one blink a second.
    circle light {
      position: (365, 252), radius: 4, color: red
      animate { property: alpha, to: 0, duration: 0.5, loop: true, yoyo: true }
    }
  }
}
```

The blink and the night are two separate timelines, so they go on two objects:
the light's own alpha blinks for the whole scene, and its group's alpha decides
when it is seen, the two multiplied. The light is in the group, so its
`position` is measured from the group's (0, 0), which is the scene's top-left
corner here, because the group has no `position` of its own. The blink's period
is one second, which divides twelve, and the group's sequence ends at 8.2
seconds on its starting alpha of 0, so the loop has no seam.
:::

:::try A colder dusk
Change the dusk to a cold one: the sky goes to the deep teal `#1f5f6b` and the
city to `#10252b`. Then watch the sky between noon and dusk: what colours does
it pass through now?

```marey
scene {
  size: (960, 540)
  background: #6aa2d5
  duration: 12

  rectangle sky {
    position: (480, 200), size: (960, 400), color: #6aa2d5
    sequence {
      animate { property: color, to: #c25577, duration: 2 }
      animate { property: color, to: #0c1229, duration: 2 }
      animate { property: color, to: #0c1229, duration: 4 }
      animate { property: color, to: #dca699, duration: 2 }
      animate { property: color, to: #6aa2d5, duration: 2 }
    }
  }

  polygon city {
    position: (0, 260), origin: (0, 0), color: #4f5f78
    points: [(0, 330), (120, 330), (120, 280), (220, 280), (220, 300), (330, 300),
             (330, 260), (400, 260), (400, 340), (520, 340), (520, 290), (640, 290),
             (640, 320), (760, 320), (760, 270), (860, 270), (860, 330), (960, 330),
             (960, 540), (0, 540)]
    sequence {
      animate { property: color, to: #33264a, duration: 2 }
      animate { property: color, to: #0a0f20, duration: 2 }
      animate { property: color, to: #0a0f20, duration: 4 }
      animate { property: color, to: #403a58, duration: 2 }
      animate { property: color, to: #4f5f78, duration: 2 }
    }
  }

  rectangle window {
    position: (365, 300), size: (14, 20), color: #2a3248
    sequence {
      animate { property: color, to: #ffd27a, duration: 0.5, delay: 2 }
      animate { property: color, to: #2a3248, duration: 0.5, delay: 5.5 }
    }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #6aa2d5
  duration: 12

  rectangle sky {
    position: (480, 200), size: (960, 400), color: #6aa2d5
    sequence {
      animate { property: color, to: #1f5f6b, duration: 2 }   // a teal dusk
      animate { property: color, to: #0c1229, duration: 2 }
      animate { property: color, to: #0c1229, duration: 4 }
      animate { property: color, to: #dca699, duration: 2 }
      animate { property: color, to: #6aa2d5, duration: 2 }
    }
  }

  polygon city {
    position: (0, 260), origin: (0, 0), color: #4f5f78
    points: [(0, 330), (120, 330), (120, 280), (220, 280), (220, 300), (330, 300),
             (330, 260), (400, 260), (400, 340), (520, 340), (520, 290), (640, 290),
             (640, 320), (760, 320), (760, 270), (860, 270), (860, 330), (960, 330),
             (960, 540), (0, 540)]
    sequence {
      animate { property: color, to: #10252b, duration: 2 }   // and a dark city
      animate { property: color, to: #0a0f20, duration: 2 }
      animate { property: color, to: #0a0f20, duration: 4 }
      animate { property: color, to: #403a58, duration: 2 }
      animate { property: color, to: #4f5f78, duration: 2 }
    }
  }

  rectangle window {
    position: (365, 300), size: (14, 20), color: #2a3248
    sequence {
      animate { property: color, to: #ffd27a, duration: 0.5, delay: 2 }
      animate { property: color, to: #2a3248, duration: 0.5, delay: 5.5 }
    }
  }
}
```

Only the first step's `to` changes on each shape; every other step starts from
wherever the last one left off, so the rest of the day needs no change. The
sky's way to dusk now stays among blues and teals. Halfway from `#6aa2d5` to
`#1f5f6b`, red is halfway from 106 to 31, green from 162 to 95 and blue from
213 to 107: about 69, 129 and 160, a steel blue. The old dusk, `#c25577`, took
the sky through a purple-grey, about 150, 124 and 166, on the way.
:::

## Recap

- `property: color` animates a shape's colour. Its `to` is a colour, and the
  shape's declared `color` is where it starts.
  ([Animating colour](/reference/language/#animating-colour))
- Two colours blend in sRGB, one channel at a time, red, green and blue, at
  the animation's progress, and every frame lands on whole 8-bit values. The
  halfway colour is the halfway value of each channel.
  ([Animating colour](/reference/language/#animating-colour))
- `easing`, `loop`, `yoyo`, `delay`, `sequence` and `parallel` work on colour
  exactly as on any other property. Shapes stay in step when their steps share
  the same times. ([Animating colour](/reference/language/#animating-colour),
  [Sequencing](/reference/language/#sequencing))
- A group has no colour, so `property: color` on a group is a compile error.
  Animate the colour of each shape inside it instead.
  ([Animating colour](/reference/language/#animating-colour))
- A group's alpha multiplies with its children's, through every enclosing
  group, so animating it fades everything inside together.
  ([Scene model](/reference/language/#scene-model))
