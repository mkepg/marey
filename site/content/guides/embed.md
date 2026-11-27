---
title: Embed a scene
description: Put a Marey scene on any web page with the marey-player element, from jsDelivr or npm. Its attributes, events and error codes, its JavaScript API, styling with ::part, sizing, reduced motion and the WebGL context budget.
---

`<marey-player>` is a custom element that plays a Marey scene on a web page.
The page carries the scene's source, not a video of it: the element compiles
the text and draws it, so the scene stays sharp at any size, a reader can
pause and scrub it, and you change it by editing text.
[Lesson 14](/learn/ship-it/) opens with one.

## Load the element

From jsDelivr, with one script tag anywhere in the page:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/marey-lang@0.7.0/dist/player/marey-player.mjs"></script>
```

The URL pins `marey-lang@0.7.0`. A pinned URL keeps serving the same file,
so a later release cannot change your page under you. To move to a newer
version, change the number: `npm view marey-lang version` prints the newest.
The player first shipped in 0.6.0; the attributes, events and methods below
are the same in 0.6.0 and 0.7.0.

In a project with a bundler, install the package:

```bash
npm install marey-lang
```

and import the element once, in any module of your app:
`import "marey-lang/player";`.

`marey-lang/player` defines `<marey-player>` (unless something already has)
and does nothing else when imported. It also exports the element's class,
`MareyPlayerElement`, for TypeScript.

The element downloads its renderer only when a player first comes near the
visible part of the page, so a page that defines it and never shows one pays
for the element and the compiler alone.

## Give it a scene

A player gets its scene in one of two ways: a file it fetches, named by `src`,
or the source written inside it in a `<script type="text/marey">`:

```html
<marey-player src="lighthouse.marey" autoplay loop controls></marey-player>

<marey-player autoplay loop controls>
  <script type="text/marey">
    scene {
      size: (400, 300)
      duration: 2
      circle dot { position: (200, 150), radius: 30, color: #38bdf8 }
    }
  </script>
</marey-player>
```

- `src` is fetched with the browser's `fetch`, relative to the page's address.
  A scene on another origin needs that server to allow it (CORS).
- The inline script must be a direct child of the element. A browser does not
  run a script of type `text/marey`, and does not show its text.
- When both are present, `src` wins.
- Changing `src` loads the new scene. Changing the inline script's text after
  the element is on the page does nothing; replace the element instead.

## Attributes

Three attributes say how it plays. Each is also a property of the same name
that reads and sets it (`player.loop = true`), and so is `src`.

| Attribute | Effect |
|---|---|
| `autoplay` | Start playing once the scene is ready, unless the reader's system asks for reduced motion. |
| `loop` | When a scene with a `duration` reaches its end, start again from the beginning. A scene with no `duration` never ends, so it has nothing to loop. |
| `controls` | Show the control bar: play and pause, a seek bar, the time, and an "Open in playground" link when the source is short enough to share. |

There is no `muted`, `poster` or other `<video>` attribute: a scene has no
sound, and the poster is the scene's own frame (next section).

## Poster frame and reduced motion

A scene that loads without playing shows its poster frame: the last moment of a
scene with a `duration`, or the first moment of one without. That is what a
player without `autoplay` shows until someone presses play.

When the reader's system asks for less motion (`prefers-reduced-motion:
reduce`), `autoplay` is ignored, and the poster frame stays until the reader
presses play. The preference is read each time a scene loads.

## Events

| Event | When | `detail` |
|---|---|---|
| `ready` | The scene compiled and can play. Once per load. | `width`, `height` (the scene's size in pixels) and `duration` (seconds; `Infinity` for a scene with no `duration`) |
| `ended` | A scene with a `duration` reached its end, with `loop` off. | none |
| `error` | The scene could not be loaded, compiled or drawn. | `code`, and `errors`: the compiler's errors, or an empty list |

The events do not bubble, so listen on the element itself. `ready` and `error`
fire once per load, so attach the listener before the scene loads: in a plain
script placed after the element and before the module script that defines it,
or, when you make the element in JavaScript, before you add it to the page.

```html
<marey-player id="intro" src="intro.marey" controls></marey-player>
<script>
  const intro = document.getElementById("intro");
  intro.addEventListener("ready", (e) => console.log("ready", e.detail.duration));
  intro.addEventListener("error", (e) => console.warn(e.detail.code, e.detail.errors));
</script>
<script type="module" src="https://cdn.jsdelivr.net/npm/marey-lang@0.7.0/dist/player/marey-player.mjs"></script>
```

`code` is one of five:

| Code | Meaning |
|---|---|
| `PLAYER_NO_SOURCE` | The element has no `src` and no `<script type="text/marey">` child. |
| `PLAYER_FETCH_FAILED` | `src` could not be fetched, or the server answered with an error status. |
| `PLAYER_COMPILE_FAILED` | The scene has errors. `errors` lists them, each with its `line`, `col` and `message`. |
| `PLAYER_FONT_UNAVAILABLE` | The scene has `text`, and the font the player draws it in could not be loaded. |
| `PLAYER_RENDER_FAILED` | The scene compiled, but the player could not start drawing it. |

On an error the element draws a box in its place: the code and a message on
the first line, then each compiler error as `line:col` and its message, the
same message `marey check` prints. [Reading errors](/guides/errors/) explains
the messages. The control bar is hidden while the box is shown.

:::warn
In 0.6.0 the player loads its font for `text` under the family name
`JetBrains Mono`. On a page whose own CSS declares an `@font-face` with that
family name, a scene with `text` can fail with `PLAYER_FONT_UNAVAILABLE`, and
the page's own text in that family can be drawn in the player's font. 0.7.0
gives the player's font a family name of its own, and the two no longer meet.
:::

## The JavaScript API

| Member | What it does |
|---|---|
| `play()` | Play from the current time. At the end of the scene, play from the beginning. |
| `pause()` | Pause. |
| `restart()` | Go back to the beginning and play. |
| `currentTime` | The time shown, in seconds. Set it to seek. A seek is kept between 0 and the end, or for a scene with no `duration`, the furthest point it has played to. A playing player keeps playing after a seek. |
| `duration` | The scene's length in seconds: `Infinity` with no `duration`, and `NaN` before a scene has loaded. Read-only. |
| `paused` | `true` while not playing. Read-only. |
| `errors` | The compiler's errors from the last load, or an empty list. Read-only. |

```html
<marey-player id="chart" src="chart.marey"></marey-player>
<button id="replay">Replay</button>
<script type="module">
  const chart = document.getElementById("chart");
  document.getElementById("replay").addEventListener("click", () => chart.restart());
</script>
```

## Size

The element is a block that fills the width of its container. Its height comes
from the scene: once it is ready, its aspect ratio is the scene's own `size`,
and before that it is 16:9. Set a width to make it smaller:

```html
<style>
  marey-player { width: 480px; max-width: 100%; }
</style>
```

Your own `height` or `aspect-ratio` on the element takes precedence over the
scene's. The scene then sits in a box of another shape, and its `fit` property
decides how: by default the whole scene shows, scaled to fit inside
([Scene model](/reference/language/#scene-model)).

## Style the controls

The control bar and its parts can be styled from the page with `::part`:

| Part | What it is |
|---|---|
| `controls` | The bar along the bottom of the player |
| `play` | The play and pause button |
| `seek` | The seek bar, a range input |
| `time` | The time and length, as `0:03 / 0:12` |
| `playground-link` | The "Open in playground" link |

```html
<style>
  marey-player::part(controls) { background: rgb(15 23 42 / 0.8); font-size: 13px; }
  marey-player::part(play) { min-width: 32px; }
  marey-player::part(playground-link) { display: none; }
</style>
```

The bar sits over the bottom of the scene. The players on this site fade it out
while the pointer is elsewhere and nothing in the player has the keyboard
focus, using the same parts; on a touch screen, and while the scene is paused,
it stays.

## Many players on one page

Browsers allow a page only so many live WebGL contexts, Chromium 16, and when a
page goes past that the browser drops the oldest one. A player therefore holds
a context only while it is within 200 pixels of the visible part of the page.
When it leaves, it notes where it was and lets the context go. When it comes
back, it replays the scene from its start to that moment, and because playback
is deterministic, it shows the frame it left on. A scene with no `duration`
starts again from the beginning instead.

That keeps a long page with many players within the limit, as long as no more
than 16 are near the visible area at once. A page that can show more than that
at a time, such as a tall grid, has to limit them itself. The gallery on this
site creates a player only for cards near the visible area, and never more than
12 at once.

## Agreement with export

The frame a player shows at a given moment is the frame `marey export` writes
for that moment: both run the same tick loop over the same compiled scene. That
is measured in Chromium. Marey computes its own `sin`, `cos` and spring curve
without the engine's versions of those functions, so they are built not to depend on the
browser. Physics still goes through Matter.js, which uses the engine's own
`sin` and `cos`, so in Firefox or Safari a scene with physics can differ
slightly from a Chromium export. Neither browser has been measured
([Determinism](/reference/determinism/)).

## Frameworks

A custom element works in any framework that renders HTML. A tool that compiles
templates, such as Vue and VitePress, needs `marey-player` declared as a custom
element, so that it does not try to resolve it as one of its own components.
