---
title: Templates
summary: Write a drawing once as a template with parameters, then use it as often as you like, each copy with its own values, its own place and its own motion.
description: Lesson 10 of the Marey course. template and use, parameters of any kind, the wrapper group and the properties it takes, drawing a template about its own (0, 0), use inside generate, generate inside a template, and templates that carry motion.
minutes: 25
learn:
- Declare a template with parameters, and use it by name
- Pass a template numbers, colours, strings and easings
- Place, turn, scale and fade each copy through its wrapper group
- Combine templates with generate, in both directions
- Give a template motion of its own
showcase: forest
---

`generate` repeats one block in one place. A drawing you want in several
places, each with its own values, such as a tree in three sizes or a badge in
three colours, needs a name you can call it by. That is a **template**. The
showcase above draws 38 pines from one.

## A template and its uses

`template Name(parameters) { … }` declares a drawing, before the `scene`
block. Inside, the parameters are names like any `let` name. `use Name(arguments)
instance { … }`, inside the scene, draws a copy of it, with each parameter given
the argument in the same place in the list.

The badge below is written once, with one parameter, `tone`. Look at how the
scene asks for it, then add a fourth badge in a colour of your own:

```marey
template Badge(tone) {
  circle disc  { position: (0, 0), radius: 70, color: tone }
  circle rim   { position: (0, 0), radius: 54, color: #1d2c48 }
  circle core  { position: (0, 0), radius: 36, color: tone }
  rectangle tab { position: (0, -70), size: (26, 26), rotation: 45, color: #f2e8d5 }
}

scene {
  size: (960, 540)
  background: #1d2c48

  use Badge(#e4553b) left   { position: (240, 270) }
  use Badge(#ffc46b) middle { position: (480, 270) }
  use Badge(#2f8a94) right  { position: (720, 270) }
}
```

Three badges, each in the colour its `use` passed. The template's shapes are
placed around (0, 0), and each `use` puts that point where its `position`
says. A fourth badge is one more `use` line, with its own name and its own
place, such as `use Badge(#f2e8d5) extra { position: (480, 440) }`.

Templates are declared only before the scene, at the top of the file, alongside
the `let`s there. Writing `template` inside the scene is an error.

## The wrapper group

Each `use` becomes a **group**, named after the instance, with the template's
objects inside it: the scene above holds the groups `left`, `middle` and
`right`, each holding a `disc`, a `rim`, a `core` and a `tab`. The block after
the instance name sets that group's properties, the ones any group takes:
`position`, `rotation`, `scale`, `alpha` and `layer`.

Four uses of the same red badge follow. Look at what each one's block changes:

```marey
template Badge(tone) {
  circle disc  { position: (0, 0), radius: 70, color: tone }
  circle rim   { position: (0, 0), radius: 54, color: #1d2c48 }
  circle core  { position: (0, 0), radius: 36, color: tone }
  rectangle tab { position: (0, -70), size: (26, 26), rotation: 45, color: #f2e8d5 }
}

scene {
  size: (960, 540)
  background: #1d2c48

  use Badge(#e4553b) plain  { position: (150, 270) }
  use Badge(#e4553b) turned { position: (370, 270), rotation: 90 }
  use Badge(#e4553b) small  { position: (580, 270), scale: 0.6 }
  use Badge(#e4553b) faded  { position: (800, 270), alpha: 0.4 }
}
```

The second badge's tab points right: the whole badge turned 90 degrees about
its centre, because a group turns about its own (0, 0), as
[the lesson on groups](/learn/groups/) showed, and the template drew the badge
around that point. The third is scaled to 0.6 about the same point, and the
fourth is faded, its group's alpha multiplying with each shape's. Each shape is
faded on its own, so the red disc now shows through the dark rim drawn over it,
as [the lesson on colour](/learn/colour/) showed for a faded group.

The wrapper is a group, so it has no colour. A colour is passed in as a
parameter, never set on the instance:

```marey error
template Badge(tone) {
  circle disc { position: (0, 0), radius: 70, color: tone }
}

scene {
  size: (960, 540)
  background: #1d2c48

  use Badge(#e4553b) a { position: (480, 270), color: #2f8a94 }
}
```

The message lists the five properties a group takes. The block is for those
properties and nothing else, so an `animate` cannot go there either; a later
section shows where a copy's motion goes.

## Drawing from (0, 0)

A parameter can be a number, and the template can compute every size from it.
The pine below is drawn upward from (0, 0), the foot of its trunk: the trunk
stands on that point with `origin: (0.5, 1)`, and the crown stands on the
trunk. Look at where the three trees meet the ground:

```marey
template Pine(height) {
  rectangle trunk { position: (0, 0), origin: (0.5, 1), size: (height * 0.08, height * 0.3), color: #6b4a33 }
  polygon crown { position: (0, -height * 0.2), origin: (0.5, 1), color: #2f8a94
                  points: [(-height * 0.3, 0), (height * 0.3, 0), (0, -height * 0.8)] }
}

scene {
  size: (960, 540)
  background: #1d2c48

  rectangle ground { position: (480, 420), origin: (0.5, 0), size: (960, 120), color: #2f4434 }

  use Pine(120) small  { position: (240, 420) }
  use Pine(220) tall   { position: (480, 420) }
  use Pine(160) medium { position: (720, 420) }
}
```

All three stand on the ground at y 420, whatever their height, because
`position` places each one's foot. Every size in the template is a fraction of
`height`: the crown's base is 0.2 of it up, and its tip is 0.2 + 0.8 = 1 times
`height` above the foot, so a pine is exactly as tall as the number passed.

Where (0, 0) sits also decides how a copy turns. Below, both pines lean by the
same `rotation: 45`. The left one is the template above; the right one draws
the same tree with (0, 0) halfway up it, so its `use` is placed 110 pixels
higher, at the tree's middle. A faint upright copy of each shows where it
started, and a white dot marks each `use`'s `position`, the point it turns
about. Look at the two trunks:

```marey
template Pine(height) {
  rectangle trunk { position: (0, 0), origin: (0.5, 1), size: (height * 0.08, height * 0.3), color: #6b4a33 }
  polygon crown { position: (0, -height * 0.2), origin: (0.5, 1), color: #2f8a94
                  points: [(-height * 0.3, 0), (height * 0.3, 0), (0, -height * 0.8)] }
}

// The same tree, with (0, 0) half its height above the foot.
template MidPine(height) {
  rectangle trunk { position: (0, height / 2), origin: (0.5, 1), size: (height * 0.08, height * 0.3), color: #6b4a33 }
  polygon crown { position: (0, height * 0.3), origin: (0.5, 1), color: #2f8a94
                  points: [(-height * 0.3, 0), (height * 0.3, 0), (0, -height * 0.8)] }
}

scene {
  size: (960, 540)
  background: #1d2c48

  rectangle ground { position: (480, 420), origin: (0.5, 0), size: (960, 120), color: #2f4434 }

  use Pine(220) footedStill     { position: (300, 420), alpha: 0.25 }
  use MidPine(220) centredStill { position: (660, 310), alpha: 0.25 }

  use Pine(220) footed     { position: (300, 420), rotation: 45 }
  use MidPine(220) centred { position: (660, 310), rotation: 45 }

  circle pivotL { position: (300, 420), radius: 7, color: #f2e8d5 }
  circle pivotR { position: (660, 310), radius: 7, color: #f2e8d5 }
}
```

The left pine leans from its foot, which stays on its dot on the ground, as a
tree bent by the wind does. The right one turns about the dot at its middle:
its top swings right as before, but its foot swings about 78 pixels to the
left and lifts 32 pixels off the ground. The showcase's trees are drawn from
the foot so that their sway pivots there.

## Any kind of value

An argument can be any kind of value the language has: a number, a colour, a
string, a point, a list, `true` or `false`, an easing, or a `fit` keyword. A template takes as
many parameters as it names, in order.

The racer below takes three: an easing, a colour and a string. Watch the three
runners, which share one `duration`:

```marey
template Racer(curve, tone, name) {
  line lane { position: (320, 0), points: [(-320, 0), (320, 0)], thickness: 2, color: #f2e8d5, alpha: 0.3 }
  text label { position: (-24, 0), origin: (1, 0.5), content: name, fontSize: 20, color: tone }
  circle runner {
    position: (0, 0), radius: 18, color: tone
    animate { property: position, to: (640, 0), duration: 2, easing: curve, loop: true, yoyo: true }
  }
}

scene {
  size: (960, 540)
  background: #1d2c48
  duration: 4

  use Racer(linear, #f2e8d5, "linear") a { position: (200, 170) }
  use Racer(easeIn, #ffc46b, "easeIn") b { position: (200, 270) }
  use Racer(easeOut, #e4553b, "easeOut") c { position: (200, 370) }
}
```

Each runner crosses its lane in two seconds and comes back, but with the
easing its `use` passed: `easing: curve` takes whichever one that is. The
colour and the label come from the other two arguments. The label's
`origin: (1, 0.5)` puts its right-hand end at its position, so all three end
24 pixels before the lane, however long the name.

The number of arguments must match the number of parameters exactly. Leave
two out, and the compiler says so:

```marey error
template Racer(curve, tone, name) {
  line lane { position: (320, 0), points: [(-320, 0), (320, 0)], thickness: 2, color: #f2e8d5, alpha: 0.3 }
  circle runner { position: (0, 0), radius: 18, color: tone }
}

scene {
  size: (960, 540)
  background: #1d2c48

  use Racer(easeIn) b { position: (200, 270) }
}
```

The first message names the problem. The two after it follow from it: once the
`use` is refused, the compiler reads what follows it as if it stood in the scene
itself.

## Templates and generate

A `use` can go inside a `generate`, so a loop can make copies of a template,
each from its own element. The row below takes its heights from a list:

```marey
template Pine(height) {
  rectangle trunk { position: (0, 0), origin: (0.5, 1), size: (height * 0.08, height * 0.3), color: #6b4a33 }
  polygon crown { position: (0, -height * 0.2), origin: (0.5, 1), color: #2f8a94
                  points: [(-height * 0.3, 0), (height * 0.3, 0), (0, -height * 0.8)] }
}

let heights = [120, 180, 150, 230, 130, 200, 160]

scene {
  size: (960, 540)
  background: #1d2c48

  rectangle ground { position: (480, 420), origin: (0.5, 0), size: (960, 120), color: #2f4434 }

  generate h, i in heights {
    use Pine(h) pine { position: (120 + i * 120, 420) }
  }
}
```

Seven pines, one per height, 120 pixels apart. The instance names are
generated too, `pine_0` to `pine_6`, as [the lesson on generate](/learn/generate/)
described, and each is a group holding its own `trunk` and `crown`. Because
the template's shapes are inside each copy's group, every copy can have a
`trunk` without a clash: names need only be unique among the objects beside
them.

A template can hold a `generate` too, and a parameter can set how many times
it runs. The fence below is one template with a `posts` parameter, used twice:

```marey
template Fence(posts, gap) {
  generate i in 0 to posts - 1 {
    rectangle post { position: (i * gap, 0), origin: (0.5, 1), size: (10, 70), color: #f2e8d5 }
  }
  rectangle top { position: ((posts - 1) * gap / 2, -52), size: ((posts - 1) * gap + 24, 8), color: #f2e8d5 }
  rectangle low { position: ((posts - 1) * gap / 2, -22), size: ((posts - 1) * gap + 24, 8), color: #f2e8d5 }
}

scene {
  size: (960, 540)
  background: #1d2c48

  rectangle ground { position: (480, 400), origin: (0.5, 0), size: (960, 140), color: #2f4434 }

  use Fence(4, 60) short { position: (100, 400) }
  use Fence(8, 50) long  { position: (460, 400) }
}
```

The first fence has four posts and the second eight, from the same template.
Each fence starts at its own (0, 0), the foot of its first post, and its rails
are as long as `(posts - 1) * gap` plus a little, so they reach both ends. The
count comes from an argument written in the source, so you can still count the
posts by reading the file.

A template can also use another template, as long as that one is declared
above it in the file. The gate below is two `Post`s and a bar, and `Post` is
declared first:

```marey
template Post(h) {
  rectangle post { position: (0, 0), origin: (0.5, 1), size: (12, h), color: #f2e8d5 }
  circle cap { position: (0, -h), radius: 10, color: #ffc46b }
}

template Gate(gap) {
  use Post(110) left  { position: (0, 0) }
  use Post(110) right { position: (gap, 0) }
  rectangle bar { position: (gap / 2, -80), size: (gap, 8), color: #f2e8d5 }
}

scene {
  size: (960, 540)
  background: #1d2c48

  rectangle ground { position: (480, 400), origin: (0.5, 0), size: (960, 140), color: #2f4434 }

  use Gate(140) narrow { position: (180, 400) }
  use Gate(300) wide   { position: (500, 400) }
}
```

Two gates, 140 and 300 pixels wide, each with a capped post at either end.
Each `Gate` copy holds two `Post` copies, `left` and `right`, each its own group
inside the gate's group.

Written the other way round, with `Gate` first, the same file fails:

```marey error
template Gate(gap) {
  use Post(110) left  { position: (0, 0) }
  use Post(110) right { position: (gap, 0) }
  rectangle bar { position: (gap / 2, -80), size: (gap, 8), color: #f2e8d5 }
}

template Post(h) {
  rectangle post { position: (0, 0), origin: (0.5, 1), size: (12, h), color: #f2e8d5 }
  circle cap { position: (0, -h), radius: 10, color: #ffc46b }
}

scene {
  size: (960, 540)
  background: #1d2c48

  use Gate(140) narrow { position: (180, 400) }
}
```

The message is misleading here: `Post` is defined at the top of the file,
before the scene block, just as it asks. What it means is that `Post` is not
declared yet where `Gate` uses it. The fix is to move `Post` above `Gate`.

What a template cannot do is use itself, directly or through others. A `use`
is replaced by a copy of the template's body, so a template that used itself
would need a copy inside every copy, and the compiler refuses it.

## Templates that move

Everything a template draws can carry its own `animate`, and a parameter can
set any of its values. The `use` block cannot hold an `animate`, so a copy's
motion is written inside the template, usually on a group at (0, 0) that holds
the rest.

The lanterns below hang from a wire. Each swings on a group whose (0, 0) is the
hook, and its `use` passes the beat. Watch the three swing out of step:

```marey
template Lantern(tone, beat) {
  group swing {
    position: (0, 0)
    rotation: -12
    animate { property: rotation, to: 12, duration: beat, loop: true, yoyo: true }
    line cord { position: (0, 40), points: [(0, 0), (0, 80)], thickness: 2, color: #f2e8d5 }
    rectangle cap  { position: (0, 80), size: (26, 8), color: #f2e8d5 }
    rectangle body { position: (0, 108), size: (40, 48), color: tone }
  }
}

scene {
  size: (960, 540)
  background: #1d2c48
  duration: 6

  line wire { position: (480, 120), points: [(-420, 0), (420, 0)], thickness: 2, color: #f2e8d5, alpha: 0.5 }

  use Lantern(#e4553b, 1) fast   { position: (240, 120) }
  use Lantern(#ffc46b, 1.5) mid  { position: (480, 120) }
  use Lantern(#2f8a94, 3) slow   { position: (720, 120) }
}
```

All three swing between -12 and 12 degrees about the hook, because `swing` is
at (0, 0) and the lantern hangs below it. The beats of 1, 1.5 and 3 seconds
give swings there and back of 2, 3 and 6 seconds, so the three drift in and
out of step and line up again at six seconds, where the scene loops without a
seam.

To move a whole copy from outside instead, put the `use` inside a group of
your own and animate that group.

## Reading the showcase

Open "Show the source" under the Forest player at the top of the page. Three
rows of pines sway under a moon, fog breathes between them, and fireflies blink
in the clearing. The scene lasts twelve seconds and loops without a seam:

- **`template Tree(height, tone, sway)`** draws a pine upward from its own
  (0, 0), the foot of its trunk, with every size a fraction of `height`: a
  trunk, three tiers, and a pale copy of each tier's right half at
  `alpha: 0.09`, so every tree is lit from the upper right. Its shapes sit in
  `group crown` at (0, 0), so the sway pivots at the foot. The crown starts at
  `rotation: -sway` and swings to `sway` and back, so the parameter sets how far
  the tree leans. A negative `sway` starts it leaning the other way. Its
  `duration: if height > 160 then 3 else 2` makes tall trees swing more slowly,
  on periods of 6 and 4 seconds, both of which divide twelve.
- **The rows** are 38 uses of that one template, drawn far to near. The far row
  is `generate i in 0 to 19`, with heights from 76 to 112, a pale blue tone and
  a sway of a degree or less; its heights come from a list read with `i % 5`,
  and its gaps and sways from lists read with `i % 4`. The middle row is twelve
  trees from 140 to 196 high, with its heights, gaps and sways all read with
  `i % 4`. So neighbours differ. The near row is six dark trees from
  240 to 380 high, each with its own place, height and sway from a list, standing
  below the bottom edge and swaying up to 2.6 degrees. Each row is inside its
  own group, so all three can name their copies `tree`.
- **`template Fog(tone, depth)`** is three long strips at low alpha, the widest
  palest, so the bank's edges look soft. It drifts 40 pixels and back over
  twelve seconds and thickens and thins every six. It is used three times, with
  different tones and depths.
- **`template Firefly(wait, drift)`** hovers out to the offset `drift` and back
  every four seconds, and blinks three times, 3.7 seconds apart. The twenty fireflies
  come from a `generate` over their places, with `wait` from `(i * 1.3) % 3.4`,
  which scatters the first blinks between 0 and 3.3 seconds. Blinks on loops
  staggered by `delay` would leave a seam, because a delayed loop waits again
  when the scene restarts, as [the lesson on timing](/learn/timing/) showed. So
  the blinks are steps of a sequence, the first delayed by `wait`, and the last
  one is over at 11.9 seconds.
- **The sky** is ten bands from `generate c, i in sky`, and the moon's glow is
  six discs from a `generate` over their radii, as in the
  [lesson on generate](/learn/generate/).

## Try this

The exercises use a smaller forest: one `Tree` template with two tiers, three
rows, and a moon.

:::try Add a fourth row
Add a row of trees farther away than the far row: smaller, paler and swaying
less.

```marey
template Tree(height, tone, sway) {
  group crown {
    position: (0, 0)
    rotation: -sway
    animate { property: rotation, to: sway, duration: 3, loop: true, yoyo: true }
    rectangle trunk { position: (0, 0), origin: (0.5, 1), size: (height * 0.07, height * 0.3), color: tone }
    polygon low { position: (0, -height * 0.2), origin: (0.5, 1), color: tone
                  points: [(-height * 0.3, 0), (height * 0.3, 0), (0, -height * 0.5)] }
    polygon top { position: (0, -height * 0.5), origin: (0.5, 1), color: tone
                  points: [(-height * 0.2, 0), (height * 0.2, 0), (0, -height * 0.5)] }
  }
}

scene {
  size: (960, 540)
  background: #121a37
  duration: 6

  circle moon { position: (740, 110), radius: 36, color: #f4eed8 }

  rectangle farGround { position: (480, 330), origin: (0.5, 0), size: (960, 210), color: #2c3860 }
  generate i in 0 to 11 {
    use Tree(90, #34416b, 1) far { position: (40 + i * 80, 334) }
  }

  rectangle midGround { position: (480, 420), origin: (0.5, 0), size: (960, 120), color: #18213c }
  generate i in 0 to 6 {
    use Tree(170, #1c2644, 2) mid { position: (60 + i * 140, 424) }
  }

  generate p in [(90, 560), (300, 590), (860, 570)] {
    use Tree(320, #090d1a, 3) near { position: p }
  }
}
```

```marey solution
template Tree(height, tone, sway) {
  group crown {
    position: (0, 0)
    rotation: -sway
    animate { property: rotation, to: sway, duration: 3, loop: true, yoyo: true }
    rectangle trunk { position: (0, 0), origin: (0.5, 1), size: (height * 0.07, height * 0.3), color: tone }
    polygon low { position: (0, -height * 0.2), origin: (0.5, 1), color: tone
                  points: [(-height * 0.3, 0), (height * 0.3, 0), (0, -height * 0.5)] }
    polygon top { position: (0, -height * 0.5), origin: (0.5, 1), color: tone
                  points: [(-height * 0.2, 0), (height * 0.2, 0), (0, -height * 0.5)] }
  }
}

scene {
  size: (960, 540)
  background: #121a37
  duration: 6

  circle moon { position: (740, 110), radius: 36, color: #f4eed8 }

  // The farthest row is drawn first, so the others cover it.
  rectangle backGround { position: (480, 276), origin: (0.5, 0), size: (960, 264), color: #3a466c }
  generate i in 0 to 15 {
    use Tree(56, #46527a, 0.5) back { position: (20 + i * 60, 280) }
  }

  rectangle farGround { position: (480, 330), origin: (0.5, 0), size: (960, 210), color: #2c3860 }
  generate i in 0 to 11 {
    use Tree(90, #34416b, 1) far { position: (40 + i * 80, 334) }
  }

  rectangle midGround { position: (480, 420), origin: (0.5, 0), size: (960, 120), color: #18213c }
  generate i in 0 to 6 {
    use Tree(170, #1c2644, 2) mid { position: (60 + i * 140, 424) }
  }

  generate p in [(90, 560), (300, 590), (860, 570)] {
    use Tree(320, #090d1a, 3) near { position: p }
  }
}
```

One more ground band and one more `generate` of the same template, written
before the far row so that every nearer row covers it. Its trees are 56 pixels
high, in a paler tone than the far row's, and sway half a degree. The new
instance name, `back`, must differ from `far`, `mid` and `near`, because all
four loops make their copies side by side in the scene.
:::

:::try Give the trunks their own colour
Add a fourth parameter, `bark`, for the trunk's colour, and give the near trees
a dark brown trunk.

```marey
template Tree(height, tone, sway) {
  group crown {
    position: (0, 0)
    rotation: -sway
    animate { property: rotation, to: sway, duration: 3, loop: true, yoyo: true }
    rectangle trunk { position: (0, 0), origin: (0.5, 1), size: (height * 0.07, height * 0.3), color: tone }
    polygon low { position: (0, -height * 0.2), origin: (0.5, 1), color: tone
                  points: [(-height * 0.3, 0), (height * 0.3, 0), (0, -height * 0.5)] }
    polygon top { position: (0, -height * 0.5), origin: (0.5, 1), color: tone
                  points: [(-height * 0.2, 0), (height * 0.2, 0), (0, -height * 0.5)] }
  }
}

scene {
  size: (960, 540)
  background: #121a37
  duration: 6

  circle moon { position: (740, 110), radius: 36, color: #f4eed8 }

  rectangle farGround { position: (480, 330), origin: (0.5, 0), size: (960, 210), color: #2c3860 }
  generate i in 0 to 11 {
    use Tree(90, #34416b, 1) far { position: (40 + i * 80, 334) }
  }

  rectangle midGround { position: (480, 420), origin: (0.5, 0), size: (960, 120), color: #18213c }
  generate i in 0 to 6 {
    use Tree(170, #1c2644, 2) mid { position: (60 + i * 140, 424) }
  }

  generate p in [(90, 560), (300, 590), (860, 570)] {
    use Tree(320, #090d1a, 3) near { position: p }
  }
}
```

```marey solution
template Tree(height, tone, sway, bark) {
  group crown {
    position: (0, 0)
    rotation: -sway
    animate { property: rotation, to: sway, duration: 3, loop: true, yoyo: true }
    rectangle trunk { position: (0, 0), origin: (0.5, 1), size: (height * 0.07, height * 0.3), color: bark }
    polygon low { position: (0, -height * 0.2), origin: (0.5, 1), color: tone
                  points: [(-height * 0.3, 0), (height * 0.3, 0), (0, -height * 0.5)] }
    polygon top { position: (0, -height * 0.5), origin: (0.5, 1), color: tone
                  points: [(-height * 0.2, 0), (height * 0.2, 0), (0, -height * 0.5)] }
  }
}

scene {
  size: (960, 540)
  background: #121a37
  duration: 6

  circle moon { position: (740, 110), radius: 36, color: #f4eed8 }

  rectangle farGround { position: (480, 330), origin: (0.5, 0), size: (960, 210), color: #2c3860 }
  generate i in 0 to 11 {
    use Tree(90, #34416b, 1, #34416b) far { position: (40 + i * 80, 334) }
  }

  rectangle midGround { position: (480, 420), origin: (0.5, 0), size: (960, 120), color: #18213c }
  generate i in 0 to 6 {
    use Tree(170, #1c2644, 2, #1c2644) mid { position: (60 + i * 140, 424) }
  }

  generate p in [(90, 560), (300, 590), (860, 570)] {
    use Tree(320, #090d1a, 3, #4a3020) near { position: p }
  }
}
```

The template names a fourth parameter, and the trunk reads `bark` instead of
`tone`. Every `use` must then pass four arguments, or the compiler reports that
`Tree` expects 4, so the far and middle rows pass their own tone again, keeping
their trunks as they were, and the near row passes a brown, `#4a3020`.
:::

:::try Make the near trees sway more
The near trees lean 3 degrees each way. Make them lean twice as far, without
changing the other rows.

```marey
template Tree(height, tone, sway) {
  group crown {
    position: (0, 0)
    rotation: -sway
    animate { property: rotation, to: sway, duration: 3, loop: true, yoyo: true }
    rectangle trunk { position: (0, 0), origin: (0.5, 1), size: (height * 0.07, height * 0.3), color: tone }
    polygon low { position: (0, -height * 0.2), origin: (0.5, 1), color: tone
                  points: [(-height * 0.3, 0), (height * 0.3, 0), (0, -height * 0.5)] }
    polygon top { position: (0, -height * 0.5), origin: (0.5, 1), color: tone
                  points: [(-height * 0.2, 0), (height * 0.2, 0), (0, -height * 0.5)] }
  }
}

scene {
  size: (960, 540)
  background: #121a37
  duration: 6

  circle moon { position: (740, 110), radius: 36, color: #f4eed8 }

  rectangle farGround { position: (480, 330), origin: (0.5, 0), size: (960, 210), color: #2c3860 }
  generate i in 0 to 11 {
    use Tree(90, #34416b, 1) far { position: (40 + i * 80, 334) }
  }

  rectangle midGround { position: (480, 420), origin: (0.5, 0), size: (960, 120), color: #18213c }
  generate i in 0 to 6 {
    use Tree(170, #1c2644, 2) mid { position: (60 + i * 140, 424) }
  }

  generate p in [(90, 560), (300, 590), (860, 570)] {
    use Tree(320, #090d1a, 3) near { position: p }
  }
}
```

```marey solution
template Tree(height, tone, sway) {
  group crown {
    position: (0, 0)
    rotation: -sway
    animate { property: rotation, to: sway, duration: 3, loop: true, yoyo: true }
    rectangle trunk { position: (0, 0), origin: (0.5, 1), size: (height * 0.07, height * 0.3), color: tone }
    polygon low { position: (0, -height * 0.2), origin: (0.5, 1), color: tone
                  points: [(-height * 0.3, 0), (height * 0.3, 0), (0, -height * 0.5)] }
    polygon top { position: (0, -height * 0.5), origin: (0.5, 1), color: tone
                  points: [(-height * 0.2, 0), (height * 0.2, 0), (0, -height * 0.5)] }
  }
}

scene {
  size: (960, 540)
  background: #121a37
  duration: 6

  circle moon { position: (740, 110), radius: 36, color: #f4eed8 }

  rectangle farGround { position: (480, 330), origin: (0.5, 0), size: (960, 210), color: #2c3860 }
  generate i in 0 to 11 {
    use Tree(90, #34416b, 1) far { position: (40 + i * 80, 334) }
  }

  rectangle midGround { position: (480, 420), origin: (0.5, 0), size: (960, 120), color: #18213c }
  generate i in 0 to 6 {
    use Tree(170, #1c2644, 2) mid { position: (60 + i * 140, 424) }
  }

  generate p in [(90, 560), (300, 590), (860, 570)] {
    use Tree(320, #090d1a, 6) near { position: p }
  }
}
```

One number changes, the near row's third argument, from 3 to 6. The template
reads `sway` for both ends of the swing, `rotation: -sway` and `to: sway`, so
each near tree now leans 6 degrees each way, a 12-degree swing. The other rows
pass their own `sway`, so they are unchanged, and the period, three seconds
each way, is the same, so the scene still loops without a seam.
:::

## Recap

- `template Name(params) { … }` declares a drawing, only before the scene, and
  `use Name(args) instance { … }` draws a copy, each parameter given the
  argument in the same place. The number of arguments must match.
  ([template and use](/reference/language/#template-and-use))
- An argument can be any kind of value, an easing included.
  ([template and use](/reference/language/#template-and-use))
- Each `use` becomes a group named after the instance. Its block takes
  `position`, `rotation`, `scale`, `alpha` and `layer`, and nothing else.
  ([template and use](/reference/language/#template-and-use))
- A copy turns and scales about the template's (0, 0), so draw the template
  around the point it should pivot on.
  ([Scene model](/reference/language/#scene-model))
- A `use` can go inside a `generate`, and a `generate` inside a template. A
  template can use another declared above it, but never itself.
  ([generate](/reference/language/#generate),
  [template and use](/reference/language/#template-and-use))
- A template carries motion in its own `animate` blocks, often on a group at
  (0, 0); a parameter can set any of its values.
  ([template and use](/reference/language/#template-and-use))
