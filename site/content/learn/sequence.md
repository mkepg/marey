---
title: Sequence and parallel
summary: Run animations one after another with sequence, run several as one step with parallel, and hold a shape still between them.
description: Lesson 6 of the Marey course. The sequence block and its steps, parallel steps, holds written as an animate to the current value, why loop and yoyo are not allowed as steps, and one sequence per object.
minutes: 20
learn:
- Run animations one after another with sequence
- Run several animations as a single step with parallel
- Hold a shape still between steps, and stagger several shapes
- Know why a step cannot loop or yoyo, and why an object has one sequence
showcase: title-card
---

Every `animate` in the lessons so far started when the scene started. In
[Animate](/learn/animate/), the crate with two `animate` blocks turned and slid
at the same time, and `delay`, in [the lesson on timing](/learn/timing/), could
only push an animation later. This lesson adds `sequence`, which runs
animations one after another, like the steps of a title card.

## One step after another

A `sequence` block goes inside a shape or a group, like `animate`. The blocks
inside it are its **steps**, and they run in order: each one starts only when
the one before it has finished.

The ball below has a sequence of two steps, a move to the right and a move
down. Watch when the second one starts:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  circle ball {
    position: (200, 160)
    radius: 30
    color: #ffc46b
    sequence {
      animate { property: position, to: (760, 160), duration: 1.5 }
      animate { property: position, to: (760, 400), duration: 1.5 }
    }
  }
}
```

The ball crosses to the right in the first second and a half, and only then
sets off downwards, arriving at three seconds. The second step starts from
where the first left the ball, because every animation starts from the value
the shape holds when it starts. That is why a sequence needs no starting
values either.

A `sequence` must belong to a shape or a group. It cannot sit directly in the
scene, and it cannot sit inside another `sequence`.

## Several things in one step: parallel

A `parallel` block is one step that holds several animations. They all start
together when the step starts, and the sequence moves on only when **every**
one of them has finished. A `parallel` goes directly inside a `sequence` and
nowhere else.

The crate below slides in, then rises and grows in one `parallel` step, then
turns. Watch the grow finish before the rise does, and when the turn starts:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 5

  rectangle crate {
    position: (180, 400)
    size: (80, 80)
    color: #e4553b
    sequence {
      animate { property: position, to: (420, 400), duration: 1 }
      parallel {
        animate { property: position, to: (700, 220), duration: 1.5 }
        animate { property: scale, to: 1.5, duration: 0.75 }
      }
      animate { property: rotation, to: 90, duration: 1 }
    }
  }
}
```

The `parallel` step starts at one second. The crate is full size by 1.75
seconds and keeps rising until 2.5, and only then does it turn, because the
step lasts as long as its longest child. The turn ends at 3.5 seconds.

## Holding still

A sequence has no "wait" step. A **hold** is written as an `animate` to the
value the shape already has: it changes nothing, but it takes its `duration`,
so the next step waits for it.

The ball below goes right, holds, and comes back. Watch it rest at the right
before it returns:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  circle ball {
    position: (200, 270)
    radius: 30
    color: #2f8a94
    sequence {
      animate { property: position, to: (760, 270), duration: 1 }
      // A hold: to the position the ball already has.
      animate { property: position, to: (760, 270), duration: 1 }
      animate { property: position, to: (200, 270), duration: 1 }
    }
  }
}
```

The ball arrives at one second, stays put for a second, and is back at its
start at three. A `delay` on a step works too: inside a sequence, a step's
delay counts as part of that step's time, so `delay: 1` on the last step
instead of the hold would give the same picture.

## Staggering several shapes

Each shape's sequence starts when the scene starts, at the same moment as
every other shape's. A hold at the start of a sequence is how one shape waits
for another.

The three words below have the same entrance, a rise and a fade in one
`parallel` step. The second and third start with holds of half a second and
one second. Watch the order they arrive in:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  text ready {
    position: (250, 300), content: "READY", fontSize: 44, color: #fbf3e4, alpha: 0
    sequence {
      parallel {
        animate { property: position, to: (250, 270), duration: 0.6, easing: easeOut }
        animate { property: alpha, to: 1, duration: 0.6 }
      }
    }
  }
  text steady {
    position: (480, 300), content: "STEADY", fontSize: 44, color: #fbf3e4, alpha: 0
    sequence {
      animate { property: alpha, to: 0, duration: 0.5 }
      parallel {
        animate { property: position, to: (480, 270), duration: 0.6, easing: easeOut }
        animate { property: alpha, to: 1, duration: 0.6 }
      }
    }
  }
  text go {
    position: (710, 300), content: "GO", fontSize: 44, color: #ffc46b, alpha: 0
    sequence {
      animate { property: alpha, to: 0, duration: 1 }
      parallel {
        animate { property: position, to: (710, 270), duration: 0.6, easing: easeOut }
        animate { property: alpha, to: 1, duration: 0.6 }
      }
    }
  }
}
```

The words rise half a second apart, left to right. Each hold is on
`alpha`, held at 0, so the word stays hidden while it waits; nothing else
moves it during the hold either, so it stays where it was declared. The holds
add up to the moment each word should move, which is how the showcase times
all its parts.

## A step has to finish

A sequence moves on when a step finishes, so every step has to finish.
`loop: true` never finishes, so it is a compile error on an `animate` inside a
`sequence` or a `parallel`:

```marey error=TYPE_SEQ_LOOP
scene {
  size: (960, 540)
  duration: 4

  circle ball {
    position: (200, 270)
    radius: 30
    sequence {
      animate { property: position, to: (760, 270), duration: 1, loop: true }
      animate { property: position, to: (760, 400), duration: 1 }
    }
  }
}
```

`yoyo: true` is not allowed either (`TYPE_SEQ_YOYO`), for a different reason.
A yoyo does finish, but it takes twice the `duration` written beside it, so a
reader could not see from the numbers when the next step starts. Write the way
back as its own step instead, as the ball in "Holding still" does.

A `sequence` holds only steps, so there is no `loop` for a whole sequence
either: it runs once. In the players on this site the whole scene starts
again when it ends, and so does every sequence in it. On an object with no
`animate` block outside its sequence, the first step starts one tick, 1/120 of
a second, after the scene does. So steps that add up exactly to the scene's
`duration` are one tick short of finishing when the scene starts again: end
such a timeline a little before the scene does.
([Sequencing](/reference/language/#sequencing))

## One sequence per object

An object can hold at most one `sequence`. A second one on the same object is
a compile error:

```marey error=TYPE_ONE_STORY
scene {
  size: (960, 540)
  duration: 4

  circle ball {
    position: (200, 270)
    radius: 30
    sequence {
      animate { property: position, to: (760, 270), duration: 1 }
    }
    sequence {
      animate { property: alpha, to: 0, duration: 1 }
    }
  }
}
```

An object's sequence is its one timeline. When two timelines have to run at
the same time, put them on two objects: a group with one sequence and a child
inside it with another, as in [the lesson on groups](/learn/groups/). Below,
the group moves the box in three steps, and the box turns in three of its own.
Watch the box turn only while the group stands still:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 5

  group cart {
    position: (200, 270)
    sequence {
      animate { property: position, to: (480, 270), duration: 1.5 }
      animate { property: position, to: (480, 270), duration: 1 }
      animate { property: position, to: (760, 270), duration: 1.5 }
    }
    rectangle box {
      position: (0, 0)
      size: (90, 90)
      color: #e4553b
      sequence {
        animate { property: rotation, to: 0, duration: 1.5 }
        animate { property: rotation, to: 90, duration: 1 }
        animate { property: rotation, to: 90, duration: 1.5 }
      }
    }
  }
}
```

The group's steps and the box's steps have the same lengths, 1.5, 1 and 1.5
seconds, so the box's turn falls exactly in the group's hold. The two
sequences run side by side, and the box rides along with every move of the
group, because it is the group's child.

## Reading the showcase

Open "Show the source" under the Title Card player at the top of the page. The
comment at the top lists when each part enters and leaves:

- **Every part but the frame has one sequence of the same shape:** a hold
  while it waits, an entrance, a hold while the card is complete, and an exit.
  The frame opens at 0, so its sequence has no wait. Each hold is an
  `animate` to the value the part already has. The holds are sized so that
  each part's steps add up to its moment on the timeline; no part refers to
  another.
- **The accent bars** start at `scale: (0, 1)`, no width, and wipe in to
  `(1, 1)`. `origin: (0, 0.5)` pins the top bar's left end and
  `origin: (1, 0.5)` the bottom bar's right end, so the two open towards each
  other. Each exit is a `parallel` step that shrinks the bar back to the end
  it grew from and fades it, both in 0.4 seconds.
- **The title** enters in one `parallel` step: it rises 26 pixels in 0.8
  seconds while it fades in over 0.6, so it is solid before it settles. It
  leaves the same way, rising and fading together.
- **The underline** draws from the title's left edge after the title is in,
  and the subtitle follows. Everything holds for a little over two seconds,
  from 2.3 seconds, when the subtitle is in, to 4.4, when it starts to leave.
  Then the parts leave in the reverse order, each a beat after the last.
- **The frame**, the corner marks, the label and the ruler, is one group with
  one sequence on its `scale`: from 0, all folded into the group's (0, 0), to
  1 and back to 0.
- **The playhead** on the ruler has a plain `animate` across the ruler in
  exactly seven seconds. It is inside the frame, so its move adds to the
  frame's scaling.
- **The card**, the group around the bars and the text, has one `animate` that
  scales it to 1.04 over the whole scene, a slow push in. Its children's
  sequences run inside it at the same time, as the box's sequence ran inside
  the cart.

## Try this

The exercises use a smaller title card: two bars and a title, in a five-second
scene. The bars wipe in, the title rises in, the card holds for two seconds,
then everything leaves in reverse order.

:::try Lengthen the hold
Make the complete card, both bars and the title, stay on screen for one second
longer before anything leaves, with every exit in the same order as before.

```marey
scene {
  size: (960, 540)
  background: #0e1117
  duration: 5

  rectangle barTop {
    position: (210, 200), origin: (0, 0.5), size: (300, 10), color: #ff5a36
    scale: (0, 1)
    sequence {
      animate { property: scale, to: (1, 1), duration: 0.5, easing: easeOut }
      animate { property: scale, to: (1, 1), duration: 3.2 }
      parallel {
        animate { property: scale, to: (0, 1), duration: 0.4 }
        animate { property: alpha, to: 0, duration: 0.4 }
      }
    }
  }

  rectangle barBottom {
    position: (750, 330), origin: (1, 0.5), size: (220, 10), color: #ff5a36
    scale: (0, 1)
    sequence {
      animate { property: scale, to: (0, 1), duration: 0.2 }
      animate { property: scale, to: (1, 1), duration: 0.5, easing: easeOut }
      animate { property: scale, to: (1, 1), duration: 2.8 }
      parallel {
        animate { property: scale, to: (0, 1), duration: 0.4 }
        animate { property: alpha, to: 0, duration: 0.4 }
      }
    }
  }

  text title {
    position: (480, 290), content: "MOTION, WRITTEN", fontSize: 60, color: #f4efe6
    alpha: 0
    sequence {
      animate { property: alpha, to: 0, duration: 0.5 }
      parallel {
        animate { property: position, to: (480, 265), duration: 0.8, easing: easeOut }
        animate { property: alpha, to: 1, duration: 0.6 }
      }
      animate { property: alpha, to: 1, duration: 2 }
      animate { property: alpha, to: 0, duration: 0.4 }
    }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #0e1117
  // One second longer, for the longer hold.
  duration: 6

  rectangle barTop {
    position: (210, 200), origin: (0, 0.5), size: (300, 10), color: #ff5a36
    scale: (0, 1)
    sequence {
      animate { property: scale, to: (1, 1), duration: 0.5, easing: easeOut }
      animate { property: scale, to: (1, 1), duration: 4.2 }
      parallel {
        animate { property: scale, to: (0, 1), duration: 0.4 }
        animate { property: alpha, to: 0, duration: 0.4 }
      }
    }
  }

  rectangle barBottom {
    position: (750, 330), origin: (1, 0.5), size: (220, 10), color: #ff5a36
    scale: (0, 1)
    sequence {
      animate { property: scale, to: (0, 1), duration: 0.2 }
      animate { property: scale, to: (1, 1), duration: 0.5, easing: easeOut }
      animate { property: scale, to: (1, 1), duration: 3.8 }
      parallel {
        animate { property: scale, to: (0, 1), duration: 0.4 }
        animate { property: alpha, to: 0, duration: 0.4 }
      }
    }
  }

  text title {
    position: (480, 290), content: "MOTION, WRITTEN", fontSize: 60, color: #f4efe6
    alpha: 0
    sequence {
      animate { property: alpha, to: 0, duration: 0.5 }
      parallel {
        animate { property: position, to: (480, 265), duration: 0.8, easing: easeOut }
        animate { property: alpha, to: 1, duration: 0.6 }
      }
      animate { property: alpha, to: 1, duration: 3 }
      animate { property: alpha, to: 0, duration: 0.4 }
    }
  }
}
```

Each part's hold before its exit grows by one second: 3.2 becomes 4.2, 2.8
becomes 3.8, and 2 becomes 3. Every exit moves one second later, so they keep
their order and their spacing. The scene's `duration` grows by one second too,
or the last exit, which now ends at 5.1 seconds, would be cut off. Each part
keeps its own timeline, so a change to the whole card is a change to every
sequence.
:::

:::try Make the bars leave first
Keep the entrances as they are, but make both bars leave before the title
does: the bottom bar first, then the top bar, and the title last.

```marey
scene {
  size: (960, 540)
  background: #0e1117
  duration: 5

  rectangle barTop {
    position: (210, 200), origin: (0, 0.5), size: (300, 10), color: #ff5a36
    scale: (0, 1)
    sequence {
      animate { property: scale, to: (1, 1), duration: 0.5, easing: easeOut }
      animate { property: scale, to: (1, 1), duration: 3.2 }
      parallel {
        animate { property: scale, to: (0, 1), duration: 0.4 }
        animate { property: alpha, to: 0, duration: 0.4 }
      }
    }
  }

  rectangle barBottom {
    position: (750, 330), origin: (1, 0.5), size: (220, 10), color: #ff5a36
    scale: (0, 1)
    sequence {
      animate { property: scale, to: (0, 1), duration: 0.2 }
      animate { property: scale, to: (1, 1), duration: 0.5, easing: easeOut }
      animate { property: scale, to: (1, 1), duration: 2.8 }
      parallel {
        animate { property: scale, to: (0, 1), duration: 0.4 }
        animate { property: alpha, to: 0, duration: 0.4 }
      }
    }
  }

  text title {
    position: (480, 290), content: "MOTION, WRITTEN", fontSize: 60, color: #f4efe6
    alpha: 0
    sequence {
      animate { property: alpha, to: 0, duration: 0.5 }
      parallel {
        animate { property: position, to: (480, 265), duration: 0.8, easing: easeOut }
        animate { property: alpha, to: 1, duration: 0.6 }
      }
      animate { property: alpha, to: 1, duration: 2 }
      animate { property: alpha, to: 0, duration: 0.4 }
    }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #0e1117
  duration: 5

  // Leaves at 3.5 s, second.
  rectangle barTop {
    position: (210, 200), origin: (0, 0.5), size: (300, 10), color: #ff5a36
    scale: (0, 1)
    sequence {
      animate { property: scale, to: (1, 1), duration: 0.5, easing: easeOut }
      animate { property: scale, to: (1, 1), duration: 3 }
      parallel {
        animate { property: scale, to: (0, 1), duration: 0.4 }
        animate { property: alpha, to: 0, duration: 0.4 }
      }
    }
  }

  // Leaves at 3.3 s, first.
  rectangle barBottom {
    position: (750, 330), origin: (1, 0.5), size: (220, 10), color: #ff5a36
    scale: (0, 1)
    sequence {
      animate { property: scale, to: (0, 1), duration: 0.2 }
      animate { property: scale, to: (1, 1), duration: 0.5, easing: easeOut }
      animate { property: scale, to: (1, 1), duration: 2.6 }
      parallel {
        animate { property: scale, to: (0, 1), duration: 0.4 }
        animate { property: alpha, to: 0, duration: 0.4 }
      }
    }
  }

  // Leaves at 3.7 s, last.
  text title {
    position: (480, 290), content: "MOTION, WRITTEN", fontSize: 60, color: #f4efe6
    alpha: 0
    sequence {
      animate { property: alpha, to: 0, duration: 0.5 }
      parallel {
        animate { property: position, to: (480, 265), duration: 0.8, easing: easeOut }
        animate { property: alpha, to: 1, duration: 0.6 }
      }
      animate { property: alpha, to: 1, duration: 2.4 }
      animate { property: alpha, to: 0, duration: 0.4 }
    }
  }
}
```

In the starter the title leaves at 3.3 seconds, the bottom bar at 3.5 and the
top bar at 3.7. The solution gives the bottom bar the title's old slot, 3.3,
by holding it for 2.6 seconds instead of 2.8, moves the top bar to 3.5 with a
hold of 3, and the title to 3.7 with a hold of 2.4. Only the holds change; the
entrances and the exits themselves are the same steps as before. The title
now leaves last, at 3.7 seconds, and is gone by 4.1.
:::

:::try Add a second line
Add a second, smaller line of text under the title, `content: "every move in
its own step"`, that rises in after the title has finished arriving, and
leaves before the title does.

```marey
scene {
  size: (960, 540)
  background: #0e1117
  duration: 5

  rectangle barTop {
    position: (210, 200), origin: (0, 0.5), size: (300, 10), color: #ff5a36
    scale: (0, 1)
    sequence {
      animate { property: scale, to: (1, 1), duration: 0.5, easing: easeOut }
      animate { property: scale, to: (1, 1), duration: 3.2 }
      parallel {
        animate { property: scale, to: (0, 1), duration: 0.4 }
        animate { property: alpha, to: 0, duration: 0.4 }
      }
    }
  }

  rectangle barBottom {
    position: (750, 330), origin: (1, 0.5), size: (220, 10), color: #ff5a36
    scale: (0, 1)
    sequence {
      animate { property: scale, to: (0, 1), duration: 0.2 }
      animate { property: scale, to: (1, 1), duration: 0.5, easing: easeOut }
      animate { property: scale, to: (1, 1), duration: 2.8 }
      parallel {
        animate { property: scale, to: (0, 1), duration: 0.4 }
        animate { property: alpha, to: 0, duration: 0.4 }
      }
    }
  }

  text title {
    position: (480, 290), content: "MOTION, WRITTEN", fontSize: 60, color: #f4efe6
    alpha: 0
    sequence {
      animate { property: alpha, to: 0, duration: 0.5 }
      parallel {
        animate { property: position, to: (480, 265), duration: 0.8, easing: easeOut }
        animate { property: alpha, to: 1, duration: 0.6 }
      }
      animate { property: alpha, to: 1, duration: 2 }
      animate { property: alpha, to: 0, duration: 0.4 }
    }
  }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #0e1117
  duration: 5

  rectangle barTop {
    position: (210, 200), origin: (0, 0.5), size: (300, 10), color: #ff5a36
    scale: (0, 1)
    sequence {
      animate { property: scale, to: (1, 1), duration: 0.5, easing: easeOut }
      animate { property: scale, to: (1, 1), duration: 3.2 }
      parallel {
        animate { property: scale, to: (0, 1), duration: 0.4 }
        animate { property: alpha, to: 0, duration: 0.4 }
      }
    }
  }

  rectangle barBottom {
    position: (750, 330), origin: (1, 0.5), size: (220, 10), color: #ff5a36
    scale: (0, 1)
    sequence {
      animate { property: scale, to: (0, 1), duration: 0.2 }
      animate { property: scale, to: (1, 1), duration: 0.5, easing: easeOut }
      animate { property: scale, to: (1, 1), duration: 2.8 }
      parallel {
        animate { property: scale, to: (0, 1), duration: 0.4 }
        animate { property: alpha, to: 0, duration: 0.4 }
      }
    }
  }

  text title {
    position: (480, 290), content: "MOTION, WRITTEN", fontSize: 60, color: #f4efe6
    alpha: 0
    sequence {
      animate { property: alpha, to: 0, duration: 0.5 }
      parallel {
        animate { property: position, to: (480, 265), duration: 0.8, easing: easeOut }
        animate { property: alpha, to: 1, duration: 0.6 }
      }
      animate { property: alpha, to: 1, duration: 2 }
      animate { property: alpha, to: 0, duration: 0.4 }
    }
  }

  // Waits until the title has arrived at 1.3 s, and leaves at
  // 3.1 s, before the title does at 3.3 s.
  text subtitle {
    position: (480, 320), content: "every move in its own step", fontSize: 20, color: #9aa3b5
    alpha: 0
    sequence {
      animate { property: alpha, to: 0, duration: 1.3 }
      parallel {
        animate { property: position, to: (480, 305), duration: 0.6, easing: easeOut }
        animate { property: alpha, to: 1, duration: 0.6 }
      }
      animate { property: alpha, to: 1, duration: 1.2 }
      animate { property: alpha, to: 0, duration: 0.4 }
    }
  }
}
```

The title's rise ends at 1.3 seconds, its 0.5-second hold plus its
0.8-second `parallel` step, so the new line opens with a 1.3-second hold. Its
own `parallel` step brings it in by 1.9 seconds. A hold of 1.2 then takes it
to 3.1, and it fades out by 3.5, while the title leaves from 3.3. It goes
inside its own text object, with its own sequence, and none of the other
parts change.
:::

## Recap

- A `sequence` belongs to a shape or a group. Its steps run in order, each
  starting when the one before has finished, and each starts from the value
  the last one left. ([Sequencing](/reference/language/#sequencing))
- A `parallel` goes directly inside a `sequence`. Its animations start
  together, and the step ends when the last of them ends.
  ([Sequencing](/reference/language/#sequencing))
- A hold is an `animate` to the value the shape already has. A step's
  `delay` also counts as part of that step's time.
  ([delay](/reference/language/#delay))
- `loop` and `yoyo` are compile errors on a step: a loop never finishes, and a
  yoyo would hide when the next step starts. Write a return as its own step.
  ([loop and yoyo](/reference/language/#loop-and-yoyo))
- An object can hold one `sequence`. For two timelines at once, use two
  objects, such as a group and its child.
  ([Sequencing](/reference/language/#sequencing))
