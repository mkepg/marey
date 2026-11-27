---
title: Loops, yoyo and delay
summary: Repeat an animation forever, play it back to where it started, hold it back before it begins, and build loops that run without a seam.
description: Lesson 4 of the Marey course. loop, yoyo, the rule that duration is one direction, the once-only yoyo, delay, phase offsets and seamless loops.
minutes: 20
learn:
- Repeat an animation forever with loop
- Play an animation back to its start with yoyo, and know what its duration counts
- Hold an animation back with delay, and use it to put shapes out of step
- Make a scene that loops with no visible seam
showcase: metronome
---

Every animation in [the last lesson](/learn/animate/) ran once, from the
moment the scene started. This lesson adds the three properties that change
that: `loop` repeats an animation, `yoyo` plays it back to where it started,
and `delay` holds it back before it begins. Together they decide the timing
of everything that repeats, like the metronome above.

## Repeating: loop

`loop: true` restarts an animation from the beginning each time it finishes,
for as long as the scene runs. `loop` takes `true` or `false`, and it is
`false` unless you set it.

Both shapes below loop every two seconds. Watch what each one does when it
restarts:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 6

  // One full turn, over and over.
  polygon star { position: (300, 270), color: #e4553b
                 points: [(0, -90), (24, -24), (90, 0), (24, 24), (0, 90), (-24, 24), (-90, 0), (-24, -24)]
                 animate { property: rotation, to: 360, duration: 2, easing: linear, loop: true } }

  // The same kind of loop, on position.
  circle ball { position: (560, 270), radius: 26, color: #2f8a94
                animate { property: position, to: (840, 270), duration: 2, easing: linear, loop: true } }
}
```

The star turns without a break. The ball crosses, then jumps back to its
start and crosses again. Both do the same thing: at the end of each loop they
go back to their starting value. For the star the start, 0 degrees, looks
exactly like the end, 360, so the jump cannot be seen. For the ball the start
is 280 pixels away from the end, so it can.

`easing: linear` matters to the star. Delete it and the default easeInOut
slows the star to a stop at the end of every turn and starts it slowly again,
so it turns in surges.

`loop` takes a word, `true` or `false`, not a number:

```marey error
scene {
  size: (960, 540)
  duration: 6

  circle ball {
    position: (560, 270)
    radius: 26
    animate { property: position, to: (840, 270), duration: 2, loop: 1 }
  }
}
```

## There and back: yoyo

`yoyo: true` plays the animation forwards and then backwards, back to the
value it started from, instead of jumping there. With `loop: true` as well,
that there-and-back repeats for as long as the scene runs.

The sun below breathes, a little larger and back again, over and over. Watch
how it returns to its smallest size:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 6

  // A faint glow and a solid core, breathing together.
  circle glow { position: (480, 270), radius: 120, color: #ffc46b, alpha: 0.25
                animate { property: scale, to: 1.3, duration: 1, loop: true, yoyo: true } }
  circle core { position: (480, 270), radius: 80, color: #ffc46b
                animate { property: scale, to: 1.3, duration: 1, loop: true, yoyo: true } }
}
```

It grows for one second and shrinks for the next, with no jump: the way back
is the same animation played in reverse, easing and all.

## duration counts one direction

With `yoyo`, `duration` is the time for **one direction**, not for the whole
there-and-back. The sun above has `duration: 1`, and each full breath takes two
seconds. This is the timing rule most worth remembering, because the mistake
it causes is quiet: the scene still runs, just at half the speed you meant.

Both circles below were meant to breathe once every two seconds. Watch the
time under the player each time a circle is back to its smallest:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 8

  text labelA { position: (300, 110), content: "duration: 1", fontSize: 20, color: #fbf3e4 }
  circle pulseA { position: (300, 300), radius: 90, color: #2f8a94
                  animate { property: scale, to: 1.4, duration: 1, loop: true, yoyo: true } }

  text labelB { position: (660, 110), content: "duration: 2", fontSize: 20, color: #fbf3e4 }
  circle pulseB { position: (660, 300), radius: 90, color: #e4553b
                  animate { property: scale, to: 1.4, duration: 2, loop: true, yoyo: true } }
}
```

The left circle is small again at 2, 4, 6 and 8 seconds: one breath every two.
The right one is small again only at 4 and 8, because its two seconds bring it
only to its largest, and the way back takes two more. To get a cycle of a
given length with `yoyo`, give `duration` half of it.

## Once only: yoyo without loop

`yoyo: true` without `loop` goes there and back **once**, then stops. It ends
on the value it started from, not on `to`.

The two balls below have the same move. Only the right one has `yoyo`. Watch
where each ends up:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  line ground { position: (480, 422), points: [(-300, 0), (300, 0)], thickness: 2, color: #fbf3e4, alpha: 0.5 }

  // Up, and it stays up.
  circle up  { position: (320, 380), radius: 40, color: #2f8a94
               animate { property: position, to: (320, 160), duration: 1 } }

  // Up and back down, once.
  circle hop { position: (640, 380), radius: 40, color: #e4553b
               animate { property: position, to: (640, 160), duration: 1, yoyo: true } }
}
```

Both rise for one second. The left ball stays where `to` put it. The right one
comes back down in the next second and stops on the ground at two seconds,
where it began, and nothing moves for the rest of the scene. A once-only yoyo
is how a shape nods, hops or flashes once and is left as it was.

## Waiting: delay

`delay` is a number of seconds to wait before an animation starts. While it
waits, the shape keeps its starting value: it does not drift, and it does not
creep. `delay` is `0` unless you set it, and it cannot be negative:

```marey error
scene {
  size: (960, 540)
  duration: 4

  circle ball {
    position: (200, 270)
    radius: 30
    animate { property: position, to: (760, 270), duration: 2, delay: -1 }
  }
}
```

**The delay is spent once.** On a looping animation it comes before the first
loop and never again: after that, each loop follows the last with no pause, so
the time between repeats is still the `duration`.

That makes `delay` the way to put shapes **out of step** while keeping them in
time. The three dots below have the same bounce, with the same duration. The
second waits 0.2 seconds and the third 0.4. Watch the first moment of the
scene, then the rest:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 6

  circle a { position: (360, 330), radius: 26, color: #ffc46b
             animate { property: position, to: (360, 210), duration: 0.6, loop: true, yoyo: true } }
  circle b { position: (480, 330), radius: 26, color: #ffc46b
             animate { property: position, to: (480, 210), duration: 0.6, delay: 0.2, loop: true, yoyo: true } }
  circle c { position: (600, 330), radius: 26, color: #ffc46b
             animate { property: position, to: (600, 210), duration: 0.6, delay: 0.4, loop: true, yoyo: true } }
}
```

At the start the second and third dots sit still while the first sets off.
From then on the three bounce as a wave, and the wave keeps its shape: each dot
stays the same fraction of a bounce behind the one before. A looping
animation's **period** is the time it takes to come back to where it started:
here 1.2 seconds, up and down. That fixed lag is a **phase offset**: the same
period, a different starting point.

Different durations would not do this. Each dot would then have its own
period, and the dots would drift further apart with every bounce instead of
keeping their places in the wave.

### Waiting at a `from`

[The last lesson](/learn/animate/) gave `animate` a `from`. A delay holds the
shape at that value, not at the one it was declared with. That is what makes a
staggered reveal work: each dot below is declared in full view, and `from: 0`
hides it for as long as its `delay` lasts:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 3

  circle a { position: (300, 270), radius: 30, color: #ffc46b
             animate { property: alpha, from: 0, to: 1, duration: 0.5 } }
  circle b { position: (420, 270), radius: 30, color: #ffc46b
             animate { property: alpha, from: 0, to: 1, duration: 0.5, delay: 0.4 } }
  circle c { position: (540, 270), radius: 30, color: #ffc46b
             animate { property: alpha, from: 0, to: 1, duration: 0.5, delay: 0.8 } }
  circle d { position: (660, 270), radius: 30, color: #ffc46b
             animate { property: alpha, from: 0, to: 1, duration: 0.5, delay: 1.2 } }
}
```

None of the dots shows before its turn, and none flashes at full opacity
first: `from` takes hold in the first frame, not when the delay ends.

:::note
`from` needs `marey-lang` 0.8.0 or later. Version 0.7.0 does not have it.
:::

## Loops without a seam

The players on this site start a scene again when it ends. A scene **loops
without a seam** when the restart cannot be seen: its last frame matches its
first, and everything carries on moving after the restart as it would have if
the scene had kept going. Three rules get you there:

- every looping animation's period divides the scene's `duration`: a loop
  without `yoyo` has a period of one `duration`, and one with `yoyo` a period
  of twice its `duration`;
- no looping animation has a `delay`;
- every animation that does not loop has finished by the end of the scene, on
  the value it started from, as a once-only yoyo does.

The second rule follows from the delay being spent once. When the scene starts
again, a delayed loop waits again, holding still while its own loop would
have been moving. The two circles below breathe on the same two-second cycle,
in a four-second scene, and only the right one is delayed. Watch them at the
moment the scene restarts:

```marey
scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  // Period 2 s, no delay: back at its start at 2 and 4 seconds.
  circle steady { position: (320, 270), radius: 80, color: #2f8a94
                  animate { property: scale, to: 1.4, duration: 1, loop: true, yoyo: true } }

  // The same, delayed by half a second.
  circle late   { position: (640, 270), radius: 80, color: #e4553b
                  animate { property: scale, to: 1.4, duration: 1, delay: 0.5, loop: true, yoyo: true } }
}
```

The left circle carries on through the restart as if nothing happened. The
right one is half grown when the scene ends, then snaps back to its smallest
and stops for half a second before it moves again. That snap is the seam.

## Reading the showcase

Open "Show the source" under the Metronome player at the top of the page. The
scene lasts six seconds and loops without a seam:

- **The arm** is four shapes, the rod, the weight, a highlight on the weight
  and the knob on top, with the same pivot, the rod's foot. The rod stands on
  it with `origin: (0.5, 1)`; the others are higher up the arm, so their
  `origin` is outside their own box, as in [the shapes lesson](/learn/shapes/).
  Each part starts at `rotation: -28` and swings to 28 with `duration: 1,
  loop: true, yoyo: true`. The `duration` is one swing, one beat; there and
  back is two seconds, which divides the six. The default easeInOut slows the
  arm at each end, as a pendulum slows.
- **The arm's shadow** is a see-through black copy of the rod and the weight,
  pivoting 10 pixels to the right and 6 lower, with the same swing.
- **The six lamps** on the base count the beats. Each is a once-only yoyo on
  `alpha`, 0.45 seconds up and 0.45 back, with a `delay` of the second its
  beat starts. Each lamp lights as the arm reaches the end of a swing, and the
  last is dark again at 5.9 seconds, before the scene ends, so the first frame
  and the last match. Six looping lamps put out of step with `delay` would
  break the second rule above, so each lamp is a once-only flash instead, and
  the player's loop repeats them.
- **The glow on the desk** pulses once a beat, in step with the lamps: a loop
  with `yoyo` and `duration: 0.5`, so one pulse per second. It is declared
  dim and animates to bright, so it rises from each beat as a lamp comes on and
  is brightest half a second in, when the lamp is full. Declared bright with a
  dim `to`, the same loop would run half a beat out of step. With `linear` or
  the default `easeInOut`, swapping the start and the end shifts a yoyo loop by
  half its period, with no delay. With `easeIn` or `easeOut` it also swaps
  which end is sharp: the glow, on `easeOut`, now has a broad bright peak and
  a quick dip to dim, where the bright-first version had a sharp peak.
- **Everything else**, the room, the window, the desk and the wooden body,
  stands still.

## Try this

The exercises use a smaller metronome: the body, an arm of two parts and one
lamp. In this one the arm starts at the right-hand end of its swing, and the
lamp flashes on every beat: it starts bright and fades over one second, then
starts again.

:::try Double the tempo
Make the metronome tick twice a second instead of once, with the lamp still
flashing on every beat.

```marey
scene {
  size: (960, 540)
  background: #13221f
  duration: 6

  rectangle desk { position: (480, 500), size: (960, 80), color: #3a2416 }

  polygon body   { position: (330, 300), color: #7a4527
                   points: [(-34, -160), (34, -160), (110, 160), (-110, 160)] }
  polygon recess { position: (330, 310), color: #2e190f
                   points: [(-18, -110), (18, -110), (70, 110), (-70, 110)] }

  // The rod and the weight share one pivot at (330, 410).
  rectangle rod  { position: (330, 410), origin: (0.5, 1), size: (5, 260), color: #cfd3da
                   rotation: 28
                   animate { property: rotation, to: -28, duration: 1, loop: true, yoyo: true } }
  polygon weight { position: (330, 410), origin: (0.5, 7), color: #d9a441
                   points: [(-16, -12), (16, -12), (19, 12), (-19, 12)]
                   rotation: 28
                   animate { property: rotation, to: -28, duration: 1, loop: true, yoyo: true } }

  // Bright at the start of each loop, then fading.
  circle lamp { position: (330, 440), radius: 9, color: #ffb347
                animate { property: alpha, to: 0.1, duration: 1, loop: true, easing: easeOut } }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #13221f
  duration: 6

  rectangle desk { position: (480, 500), size: (960, 80), color: #3a2416 }

  polygon body   { position: (330, 300), color: #7a4527
                   points: [(-34, -160), (34, -160), (110, 160), (-110, 160)] }
  polygon recess { position: (330, 310), color: #2e190f
                   points: [(-18, -110), (18, -110), (70, 110), (-70, 110)] }

  // Half a second per swing: two beats a second.
  rectangle rod  { position: (330, 410), origin: (0.5, 1), size: (5, 260), color: #cfd3da
                   rotation: 28
                   animate { property: rotation, to: -28, duration: 0.5, loop: true, yoyo: true } }
  polygon weight { position: (330, 410), origin: (0.5, 7), color: #d9a441
                   points: [(-16, -12), (16, -12), (19, 12), (-19, 12)]
                   rotation: 28
                   animate { property: rotation, to: -28, duration: 0.5, loop: true, yoyo: true } }

  // The lamp's loop has to match the beat.
  circle lamp { position: (330, 440), radius: 9, color: #ffb347
                animate { property: alpha, to: 0.1, duration: 0.5, loop: true, easing: easeOut } }
}
```

All three durations become 0.5. The arm's is one swing, which is one beat. The
lamp has no `yoyo`, so its duration is its whole cycle, one flash, and that is
one beat too. A full swing there and back now takes one second, which still
divides the six, so the loop still has no seam.
:::

:::try Flash only on the right
Make the lamp flash only when the arm reaches the right-hand end of its swing,
not at the left.

```marey
scene {
  size: (960, 540)
  background: #13221f
  duration: 6

  rectangle desk { position: (480, 500), size: (960, 80), color: #3a2416 }

  polygon body   { position: (330, 300), color: #7a4527
                   points: [(-34, -160), (34, -160), (110, 160), (-110, 160)] }
  polygon recess { position: (330, 310), color: #2e190f
                   points: [(-18, -110), (18, -110), (70, 110), (-70, 110)] }

  // The rod and the weight share one pivot at (330, 410).
  rectangle rod  { position: (330, 410), origin: (0.5, 1), size: (5, 260), color: #cfd3da
                   rotation: 28
                   animate { property: rotation, to: -28, duration: 1, loop: true, yoyo: true } }
  polygon weight { position: (330, 410), origin: (0.5, 7), color: #d9a441
                   points: [(-16, -12), (16, -12), (19, 12), (-19, 12)]
                   rotation: 28
                   animate { property: rotation, to: -28, duration: 1, loop: true, yoyo: true } }

  // Bright at the start of each loop, then fading.
  circle lamp { position: (330, 440), radius: 9, color: #ffb347
                animate { property: alpha, to: 0.1, duration: 1, loop: true, easing: easeOut } }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #13221f
  duration: 6

  rectangle desk { position: (480, 500), size: (960, 80), color: #3a2416 }

  polygon body   { position: (330, 300), color: #7a4527
                   points: [(-34, -160), (34, -160), (110, 160), (-110, 160)] }
  polygon recess { position: (330, 310), color: #2e190f
                   points: [(-18, -110), (18, -110), (70, 110), (-70, 110)] }

  rectangle rod  { position: (330, 410), origin: (0.5, 1), size: (5, 260), color: #cfd3da
                   rotation: 28
                   animate { property: rotation, to: -28, duration: 1, loop: true, yoyo: true } }
  polygon weight { position: (330, 410), origin: (0.5, 7), color: #d9a441
                   points: [(-16, -12), (16, -12), (19, 12), (-19, 12)]
                   rotation: 28
                   animate { property: rotation, to: -28, duration: 1, loop: true, yoyo: true } }

  // The arm is back on the right every two seconds, starting
  // at 0, so the lamp's loop lasts two seconds.
  circle lamp { position: (330, 440), radius: 9, color: #ffb347
                animate { property: alpha, to: 0.1, duration: 2, loop: true, easing: easeOut } }
}
```

The arm starts on the right and is back there at 2 and 4 seconds, so the lamp
needs one flash every two seconds, starting at 0. Its `duration` is its whole
cycle, so `duration: 2` does it. The lamp now fades for longer between
flashes, and it is brightest each time the arm reaches the right.
:::

:::try A slower second metronome
Add a second metronome beside the first, at x = 630, that ticks every one and
a half seconds, with its own lamp on its own beat.

```marey
scene {
  size: (960, 540)
  background: #13221f
  duration: 6

  rectangle desk { position: (480, 500), size: (960, 80), color: #3a2416 }

  polygon body   { position: (330, 300), color: #7a4527
                   points: [(-34, -160), (34, -160), (110, 160), (-110, 160)] }
  polygon recess { position: (330, 310), color: #2e190f
                   points: [(-18, -110), (18, -110), (70, 110), (-70, 110)] }

  // The rod and the weight share one pivot at (330, 410).
  rectangle rod  { position: (330, 410), origin: (0.5, 1), size: (5, 260), color: #cfd3da
                   rotation: 28
                   animate { property: rotation, to: -28, duration: 1, loop: true, yoyo: true } }
  polygon weight { position: (330, 410), origin: (0.5, 7), color: #d9a441
                   points: [(-16, -12), (16, -12), (19, 12), (-19, 12)]
                   rotation: 28
                   animate { property: rotation, to: -28, duration: 1, loop: true, yoyo: true } }

  // Bright at the start of each loop, then fading.
  circle lamp { position: (330, 440), radius: 9, color: #ffb347
                animate { property: alpha, to: 0.1, duration: 1, loop: true, easing: easeOut } }
}
```

```marey solution
scene {
  size: (960, 540)
  background: #13221f
  duration: 6

  rectangle desk { position: (480, 500), size: (960, 80), color: #3a2416 }

  polygon body   { position: (330, 300), color: #7a4527
                   points: [(-34, -160), (34, -160), (110, 160), (-110, 160)] }
  polygon recess { position: (330, 310), color: #2e190f
                   points: [(-18, -110), (18, -110), (70, 110), (-70, 110)] }
  rectangle rod  { position: (330, 410), origin: (0.5, 1), size: (5, 260), color: #cfd3da
                   rotation: 28
                   animate { property: rotation, to: -28, duration: 1, loop: true, yoyo: true } }
  polygon weight { position: (330, 410), origin: (0.5, 7), color: #d9a441
                   points: [(-16, -12), (16, -12), (19, 12), (-19, 12)]
                   rotation: 28
                   animate { property: rotation, to: -28, duration: 1, loop: true, yoyo: true } }
  circle lamp { position: (330, 440), radius: 9, color: #ffb347
                animate { property: alpha, to: 0.1, duration: 1, loop: true, easing: easeOut } }

  // The second metronome: every shape has a new name, every x
  // moves 300 to the right, and every duration is 1.5.
  polygon body2   { position: (630, 300), color: #6a3b21
                    points: [(-34, -160), (34, -160), (110, 160), (-110, 160)] }
  polygon recess2 { position: (630, 310), color: #2e190f
                    points: [(-18, -110), (18, -110), (70, 110), (-70, 110)] }
  rectangle rod2  { position: (630, 410), origin: (0.5, 1), size: (5, 260), color: #cfd3da
                    rotation: 28
                    animate { property: rotation, to: -28, duration: 1.5, loop: true, yoyo: true } }
  polygon weight2 { position: (630, 410), origin: (0.5, 7), color: #d9a441
                    points: [(-16, -12), (16, -12), (19, 12), (-19, 12)]
                    rotation: 28
                    animate { property: rotation, to: -28, duration: 1.5, loop: true, yoyo: true } }
  circle lamp2 { position: (630, 440), radius: 9, color: #ffb347
                 animate { property: alpha, to: 0.1, duration: 1.5, loop: true, easing: easeOut } }
}
```

The two arms set off together and drift apart: three beats of the first take
as long as two of the second, so the lamps flash together at 0 and 3 seconds.
The slower arm's swing there and back takes three seconds, which divides the
six, so at the end of the scene both arms are back where they started and the
loop still has no seam.
:::

## Recap

- `loop: true` restarts an animation from the beginning each time it
  finishes, for as long as the scene runs.
  ([loop and yoyo](/reference/language/#loop-and-yoyo))
- `yoyo: true` plays the animation back to its starting value. `duration` is
  one direction, so a there-and-back takes twice the `duration`.
  ([loop and yoyo](/reference/language/#loop-and-yoyo))
- `yoyo` without `loop` goes there and back once and ends where it started.
  ([loop and yoyo](/reference/language/#loop-and-yoyo))
- `delay` holds an animation at its starting value before it begins. It must
  be 0 or more, and it is spent once, before the first loop.
  ([delay](/reference/language/#delay))
- The same `duration` with different delays keeps shapes a fixed step apart;
  different durations make them drift. ([delay](/reference/language/#delay))
- `loop` and `yoyo` take `true` or `false`, and both default to `false`.
  ([Properties](/reference/properties/))
- A scene loops without a seam when every looping animation's period divides
  its `duration`, no looping animation has a `delay`, and every other
  animation ends on its starting value before the scene does. These follow from
  the period rules ([loop and yoyo](/reference/language/#loop-and-yoyo)) and
  from the delay being spent once ([delay](/reference/language/#delay)).
