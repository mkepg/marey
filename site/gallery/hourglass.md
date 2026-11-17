---
title: Hourglass
summary: 150 grains of sand pour through the neck of a wooden hourglass by candlelight; then it is lifted, turned over and set down, and the sand pours again.
tags:
- physics
- generative
- loop
poster: 2.2
---

A wooden hourglass on a desk, lit by a candle. 150 grains of sand drop from
the top cap, pour through the neck and heap up in the bottom bulb. Then the
hourglass is lifted, turned over and set down, and the sand pours again. It
runs twice in the twelve seconds, and the last frame is the same as the
first, so the loop has no seam.

The grains are real physics bodies. The glass is not one shape but 76 small
ones, the hourglass turns although a physics body cannot ride in a group that
moves, and the sand had to be kept from stopping in mid-air. Each of those
is a section below.

### Glass from straight pieces

A polygon collides as its convex hull. The hull of an hourglass's outline is
one solid shape that fills the bulbs and the neck alike, so glass made of
one polygon could hold no sand.
Instead each bulb wall is 19 thin strips, one for every 10 px from the neck
to the cap. `let prof` holds the glass's half-width at each of those 20
heights, from 12 px at the neck to 56 at the widest. Each strip runs between
two of them. Two of its four corners are on the glass,
`(x1 - mx, b * k * 10 - my)` and `(x2 - mx, b * (k + 1) * 10 - my)`, and
the other two are the same points pushed `s * T` outward, so each strip is a
parallelogram, which is its own hull. Three loops, `generate b in [-1, 1]`
for the bulbs, `generate s in [-1, 1]` for the sides and
`generate k in 0 to 18` for the strips, make all 76, each
`physics { lockPosition: true, bounce: 0.1 }`, and a locked `rectangle cap`
closes each end. The points are written about the strip's own centre,
(`mx`, `my`), and that centre is its `position`.

`let prof` is written out as numbers rather than computed with `sin`.
[The determinism notes](/reference/determinism/) explain why: `sin` can
differ in its last digit between JavaScript engines, and the walls should
not. The colliders have `alpha: 0`, and the glass you see is drawn
separately. [The lesson on physics](/learn/physics/) covers hulls, and
[the lesson on the physics world](/learn/world/) covers locked bodies.

### 150 grains in a honeycomb

`let rows = [9, 10, 11, 10, 11, 12, 11, 12, 13, 12, 13, 12, 11, 2, 1]` adds
up to 150, and `generate n, j in rows` with `generate c in 0 to n - 1` packs
the grains against the top cap, row under row, 8.1 px apart. Rows of odd and
even counts alternate, so each row sits in the gaps of the one above.

The grains come in three sizes, and the honeycomb's sites fall into three
sets in which no two neighbours share a set.
`radius: sizes[(m - j + 300) % 3]` gives each set one size from
`let sizes = [4.4, 3.1, 3.6]`. The largest grain only ever sits beside the
two smaller ones, and 4.4 + 3.6 is under the 8.1 px spacing, so no two grains
start overlapping. The `+ 300` keeps the number positive before the `%`,
because a negative index is an error. The physics count is 150 grains, 76
strips and 2 caps: 228 bodies of one part each, under the limits of 500
bodies and 2,000 parts.
[The lesson on generate](/learn/generate/) covers nested loops, and
[the lesson on values](/learn/values/) covers `%` and indexing.

### Keeping the sand moving

A body that comes to rest falls asleep. A grain in the top bulb can come to
rest against the glass while the sand under it drains away, and in this
scene a sleeping grain stays where it fell asleep: in mid-air. With the
glass held still, measured in Chromium, two grains hang in the top bulb
after the first pour and four after the second.

So the upper bulb's strips shake.
`animate { property: position, to: (cx + mx + s * shake, cy + my - shake), duration: 0.05, easing: linear, loop: true, yoyo: true }`
moves each one 1.5 px outward and 1.5 px up and back, ten times a second.
A locked body that an animation moves wakes the bodies that touch it, so no
grain against the glass stays asleep. `let shake = if b < 0 then 1.5 else 0`
leaves the lower strips still: with a shake of 0, `to` is where the strip
already is. The strips themselves are not drawn, and the grains they push
barely move more than they would anyway. Measured in Chromium from 1 to 1.4
seconds, a grain above the neck strays from its own 13-tick moving average by
at most 0.59 px in 95 percent of ticks with the shake, and 0.58 px without
it.

With the shake, in Chromium, the top bulb empties in both pours: the first
grains reach the neck within half a second, the top bulb is empty by 3
seconds, and the second pour, which starts at 6, empties it by 9.2. It still
empties in every pour with the grains 8.2 px apart instead of 8.1, the
honeycomb started 0.8 px lower, the sizes given to the other sets, or the
shake slowed to 0.06 seconds each way. The pour is chaotic, so other engines
give other figures: measured the same way in Firefox, the top bulb is empty
by 3.1 seconds and by 9.2. [The lesson on the physics world](/learn/world/)
covers moving a locked body.

### One sequence per grain

Every grain runs the same `sequence`. It pours with
`physics { bounce: 0.1, duration: pour }` for 4 seconds, then fades out,
then moves unseen to `(2 * cx - x, y)`, the mirror of its starting place, so
the second pour starts from a different arrangement and runs differently. It
fades back in, pours again, fades out, and moves home to `(x, y)`.

Two things make this safe. A grain is held by an animation while it moves,
so it is not simulated, and every grain starts each step on the same tick,
so all 150 are held together while any one of them passes through the glass.
And the last step, `animate { property: position, to: (x, y), duration: 0.4 }`,
runs past the end of the scene, so in the last frame every grain is held at
its starting place, exactly as in the first.
[The lesson on sequences](/learn/sequence/) covers steps and `parallel`, and
[the lesson on handing animation to physics](/learn/handoff/) covers a body
that is held before and after its physics steps.

### Turning it over

A physics body cannot sit inside a group that moves, so the strips and caps
stay where they are, outside the group that turns. They do not need to
move: the hourglass looks the same upside down, so after half a turn the
glass is back over the same walls. `group lift` rises 40 px,
`to: (cx, cy - 40)`, and inside it `group turn` turns,
`animate { property: rotation, to: 180, duration: 1 }`, and the second time
`to: 0`. Both groups are centred on the neck, so the turn is about the neck.

The glass is drawn in the turning group. `let edge` is one side of it, cap to
cap, and `template Pane()` draws that side as three lines: a pale body, a
bright outer edge and a faint inner one. `use Pane() left { rotation: 180 }`
is the other side, because one side turned half a turn about the neck is the
other side. The posts and plates are templates too, the same at either end.
[The lesson on groups](/learn/groups/) covers nested groups, and
[the lesson on templates](/learn/templates/) covers `use`.

### Sand that turns with the glass

The grains cannot turn with the glass, so a drawn copy of the sand does. As
the last grains settle, `group underlay`, the shape of the heap with its
specks, fades in behind them, so the heap reads as one mass. The grains fade
out over it, and the same drawing in the turning group takes over from it at
once. Near the middle of the turn, while the glass moves fastest, the heap
gives way to the packed shape the grains will fill against the other cap.
That shape starts squashed to the heap's depth, `scale: (1, 0.72)`, so the
swap barely changes the outline, and it stretches to full depth over 0.4
seconds, as if the sand loosened as it tipped. Its `position` moves with the
scale, so its end at the cap stays put.

When the hourglass is down, `group topSand` takes over from that shape behind
the grains. The grains fade in over it in 0.1 seconds, and it fades out
behind them in the next 0.1, so it has gone before they start to fall. The
heap's outline, `heapPts`, is drawn to the heap the grains settle into: measured in
Chromium, its top edge is within 12 px of the top grains at 4 and at 10
seconds. The packed shape, `packedPts`, follows the honeycomb.

The candle's highlights on the glass are not in the turning group, because
the light does not turn. `group shine` fades them out for the turn and back
when the hourglass is down. [The first lesson](/learn/first-scene/) covers
drawing order, and [the lesson on shapes](/learn/shapes/) covers alpha.

### One period for the loop

The flame flickers on periods of 0.5 and 1.5 seconds, the glows breathe on
1.5 and 6, and the upper strips shake on 0.1. Each divides 12. Everything
else is a timeline that ends where it began: the glass back at 0 degrees,
the grains held against the top cap, and the drawn sand hidden. In Chromium
the frames at 0 and 12 seconds are identical, pixel for pixel.
