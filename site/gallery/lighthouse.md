---
title: Lighthouse
summary: A lamp turns over a night sea. The beam sweeps out and back and flares each time it faces you, while the waves, a boat and the stars repeat on one 12-second loop.
tags:
- generative
- loop
---
Everything here is flat shapes, transparency and timing. There is no 3D, no blur
and no random number anywhere. Of its 261 lines, 40 are the steps of the beam's
and the flare's timelines, written out one per line, because a step inside a
`sequence` cannot loop.

### One period for the whole scene

The scene runs for `duration: 12`, and every looping animation has a cycle that
divides 12 seconds. The beam and the flare are not loops but written-out
timelines, and each fits inside the 12 seconds. A yoyo animation's `duration` is
one direction, so `duration: 6, loop: true, yoyo: true` on the clouds is a
12-second cycle. The stars twinkle on beats of `[1, 1.5, 2, 3][i % 4]`, which
give cycles of 2, 3, 4 and 6 seconds. The five bands of waves take 6, 4, 3, 4
and 6 seconds. No animation is delayed, so at 12 seconds every motion is back
where it started, and the player's loop has no visible seam. [The lesson on
timing](/learn/timing/) covers loop, yoyo and why a delay would break this.

### The sky is two lists

`let edges` holds the top edge of each sky band and `let sky` holds its colour.
`generate c, i in sky` makes one rectangle per colour. Its height is
`edges[i + 1] - edges[i]`, the gap to the next edge, which is why `edges` has
one more entry than `sky`: its last value, `horizon`, is the bottom of the
lowest band. `origin: (0.5, 0)` puts the band's pivot at its top centre, so
`position: (480, edges[i])` places its top edge exactly on the list's value. To
add a band, you add an edge and a colour together. The lesson on values covers
lists and indexing, and the lesson on generate covers the loop.

### Stars and clouds are templates

`template Star(size, beat)` draws a four-pointed star as an eight-point polygon:
four tips at `size` and four inner corners at a quarter of it. Each star fades
with `property: alpha, to: 0.25, duration: beat` and back.
`use Star([2.5, 3.5, 2, 4.5][i % 4], [1, 1.5, 2, 3][i % 4]) star { position: p }`
gives sixteen stars four sizes and four beats, so they twinkle in four groups
rather than all together.

The clouds use the same idea with one more step. A cloud's drift is on an inner
`group drift`, not on the instance itself, because an animation's `to` is a
position in the parent's space. The drift animates from `(0, 0)` to
`to: (40, 0)` relative to wherever `use` put the cloud, so one template serves
all three clouds. `scale: 0.7` and `scale: 1.2` make the high cloud small and
the low one large. The lesson on templates and [the lesson on groups](/learn/groups/) cover
both.

### Light from stacked transparency

The moon's glow is three circles on one centre: the moon, then halos at
`alpha: 0.07` and `alpha: 0.04`. Each translucent layer lets less of the sky
through, so where they overlap the light builds up: the glow is brightest at the
moon and fades outward.

The beam is built the same way. `generate L in [1300, 1050, 820, 620, 440, 280]`
draws six cones of falling length, each at `alpha: 0.04`. All six cover the part
next to the lamp, so the light is strongest there, and only the longest cone
reaches the far end. Every cone widens at the same rate, `let spread = 0.075`
pixels of half-width per pixel of length, so their edges lie on one angle and
the beam reads as a single shape. [The lesson on shapes](/learn/shapes/) covers
alpha and polygon points.

### Turning a lamp with scale

The lamp is seen from the side. As it turns, the beam's length on screen follows
the cosine of its angle: full length when it points right, nothing when it
points at you, full length again pointing left, and nothing again when it points
away from you, behind the headland. The scene draws this by scaling one axis.
`group beamRight` sits at `position: lampAt`, and each cone has
`origin: (0, 0.5)`, so its left end is at the lamp. Scaling the group on x
shrinks the beam towards the lamp.

The `sequence` then plays the turn as steps.
`animate { property: scale, to: (0.004, 1), duration: 1, easing: easeIn }`
shortens the beam slowly at first and then quickly, which is the shape of a
cosine falling from 0 to 90 degrees. The return uses `easing: easeOut`, fast
then slow, which matches the cosine rising again. A step of
`to: (0, 0), duration: 0.01` hides the beam completely, and
`to: (0, 0), duration: 1.98` holds it hidden: an animation whose `to` equals the
current value is how a sequence waits. Each sweep is five steps, close to four
seconds in all, written out three times.

`group beamLeft` is the same beam half a turn later. It starts at
`scale: (0, 0)`, holds hidden for its first second, and its shorter cones,
`[420, 340, 260, 190, 130, 80]`, hang off the lamp's left side with
`origin: (1, 0.5)`. [The lesson on animation](/learn/animate/), [the lesson on groups](/learn/groups/) and
[the lesson on sequences](/learn/sequence/) cover easing, scale and the steps.

### The flare

`group flare` holds two circles, `alpha: 0.35` and `alpha: 0.9`. The group's own
alpha multiplies with theirs, so animating the group dims or brightens both
together. Its sequence climbs with `to: 1, duration: 1, easing: easeIn` to a
peak at 1, 5 and 9 seconds, the moments the lamp faces you, and
`to: 0.15, duration: 2` holds it low between, including while the lamp faces
away. The flare uses the same easing as the beam, so the glow grows as the beam
shortens towards you. [The lesson on sequences](/learn/sequence/) covers this timeline.

### Waves that scroll forever

`template Crest(lam, amp, depth, tone, rim)` is one wavelength of sea. Its top
edge is a cosine sampled every eighth of a wavelength, with the in-between
heights written as `-amp * cos(45)`, and two more points close it `depth` pixels
down. A `line foam` traces the same crest at `alpha: 0.45` for a lighter rim.

Each band is a group of identical crests one wavelength apart,
`generate k in 0 to 21` with `position: (k * 48, 334)`, and the group slides
exactly one wavelength per loop:
`to: (-48, 0), duration: 6, easing: linear, loop: true`. When the loop restarts,
the group jumps back 48 pixels, which lands on an identical picture, so the sea
never ends. Linear easing keeps the speed constant through that jump. Twenty-two
crests of 48 pixels cover the 960-pixel width plus the one wavelength the band
slides.

The five bands go from 48-pixel wavelengths far away to 220 nearest you, with
taller crests and darker water as they come closer. `group back` and
`group near` start one wavelength to the left, with `position: (-72, 0)` and
`position: (-160, 0)`, and slide right, so neighbouring bands move against each
other. The lessons on templates, on values (`cos`) and on generate cover the
pieces.

### Three motions on one boat

`group boat` drifts 60 pixels and back, `group bob` inside it rises and falls
with `to: (0, -4), duration: 1.5`, and `group rock` inside that tilts from
`rotation: -5` to 5 degrees. Each group's animation happens in its parent's
space, so the three combine without any arithmetic. The boat is written between
`group middle` and `group near`, and objects draw in source order, so the near
waves pass in front of its hull. [The lesson on groups](/learn/groups/) and
[the first lesson](/learn/first-scene/) (drawing order) cover this.

### Moonlight and the headland

The glints on the water come from `generate i in 0 to 9`. Each one computes its
own width with `let half = 6 + i * 3`, so the reflections widen as they come
down the water towards you, and each fades on a beat of `[1, 1.5, 2][i % 3]`.

The headland is a polygon with `position: (0, 292), origin: (0, 0)`. The top
left of its points' bounding box is (0, 292), so pinning that corner there makes
every point read as a scene coordinate. The tower's red stripes are trapezoids
whose corners, such as `(-20.28, 9), (20.28, 9), (19.09, -9)`, were computed to
sit on the tower's sloping sides. The lesson on values covers `let` inside a
`generate`, and [the lesson on shapes](/learn/shapes/) covers `origin`.
