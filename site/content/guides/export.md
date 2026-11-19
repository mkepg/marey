---
title: Export
description: Export a Marey scene as PNG frames, an animated PNG, WebM or MP4 video, or Lottie JSON with marey export or the playground's Export menu, and use the frames hash to prove two exports are the same.
---

`marey export` turns one scene file into a file that plays without Marey: PNG
frames, an animated PNG, a video, or a Lottie animation. The playground's
Export menu writes the same files from the scene you are editing. This guide
covers both, and what the hashes an export prints can prove.

The commands below need the package installed, as
[Install and check](/guides/install/) shows. Every option on this page is the
same in 0.6.0, the version on npm, and in 0.7.0. The one difference between
the two is inside the Lottie file, which
[the Lottie guide](/guides/lottie/) describes.

## Install the export browser

`marey export` draws every frame in a headless Chromium, with the same pipeline
the playground's Export menu uses, so the export draws what the preview drew.
Install that browser once, at the version Marey is tested with:

```bash
npx --package playwright-core@1.62.1 playwright-core install chromium-headless-shell
```

Without it, an export stops with `[EXPORT_BROWSER_MISSING]` and prints that
command. `marey check` needs no browser.

## Export a scene

Name one file and a format:

```bash
npx marey export lighthouse.marey --format apng
```

Each run writes one output. These are the five formats, and where each goes
unless you say otherwise:

| `--format` | Writes | Default name | Size |
|---|---|---|---|
| `png` | A directory of numbered frames, `frame_0000.png` upwards | `lighthouse-frames/` | the scene's |
| `apng` | An animated PNG that loops forever | `lighthouse.png` | the scene's |
| `webm` | VP9 video | `lighthouse.webm` | twice the scene's |
| `mp4` | H.264 video | `lighthouse.mp4` | twice the scene's |
| `lottie` | Lottie JSON | `lighthouse.json` | the scene's |

The default name is the scene file's name with the format's extension, in the
directory you run the command from. Video is encoded at twice the scene's
width and height, so a 960x540 scene becomes a 1920x1080 video, which stays
sharp after a video player or a site scales it.

## Options

| Option | Meaning | Default |
|---|---|---|
| `--format <name>` | `png`, `apng`, `webm`, `mp4` or `lottie`. Required. | none |
| `--fps <n>` | Frames per second. It must divide 120. | `30` |
| `--duration <s>` | How many seconds to export, in place of the scene's `duration`. | the scene's `duration` |
| `--out <path>` | Where to write: a file, or for `png` a directory. Missing directories are made. | the table above |

The simulation runs 120 ticks a second, and `--fps` must divide 120 so that
every frame lands on a tick: 24, 30 and 60 do, 25 does not. An export has
`--fps` times its length in frames, and the most an export may have is 7,200:
2 minutes at 60 frames a second, or 4 at 30.

`--duration` is how to export a scene that has no `duration` of its own, which
otherwise has no end to stop at. It can also cut a long scene short. This writes
the first second of a scene with no `duration`, at 4 frames a second:

```bash
npx marey export lamp.marey --format apng --duration 1 --fps 4 --out out/lamp.png
```

```text
wrote out/lamp.png  4 frames @ 4 fps  960x540  55301 B  sha256 fbff89a8a0bd11ec2b5db450349f9a0f8c55b1bc5fe62bcd8fd34c67606ff413  frames c0184d1d
```

Options are written as `--fps 30`, with a space. An option `export` does not
have, a second file name or a missing `--format` stops the command before it
starts, with the usage. A scene that does not compile, or cannot be exported
at the rate and length asked for, stops it before the browser starts, with the
compiler's messages. Either way the command exits with 1. It exits with 0 once
it has written the output.

## What it prints

A finished export prints one line:

```bash
npx marey export lighthouse.marey --format webm --duration 2
```

```text
wrote lighthouse.webm  60 frames @ 30 fps  1920x1080  1064917 B  sha256 90b811dc477693345469159610360682e38553dd0a10f5f22377761c1eb60dcf  frames 4f865ba0
```

In order: the file written, the number of frames and the rate, the size in
pixels, the size in bytes, and two hashes. For `png`, the bytes and the
`sha256` cover every frame file, in order.

## The frames hash

The two hashes answer different questions.

- `sha256` is the hash of the file's bytes. The same hash means the same file.
- `frames` is a hash of the scene's state at every frame that was sampled:
  every object's position, rotation, scale, alpha and colour, physics bodies
  included. The same hash means the same motion.

The `frames` hash depends on the scene, `--fps` and `--duration`, and not on
the format. The two seconds of the Lighthouse above give `frames 4f865ba0` as
WebM, and the same as Lottie and as MP4:

```text
wrote l2.json  60 frames @ 30 fps  960x540  167037 B  sha256 267b3ccd41fba37ab5bf5845eb982eb176abf517f72e4a8464bc206e66c72990  frames 4f865ba0
wrote lighthouse.mp4  60 frames @ 30 fps  1920x1080  580865 B  sha256 e304f0c001a2c93bf5faf60b9221a1a4cf4f226d89eee783fdc2fb6e8057e6d5  frames 4f865ba0
```

Run an export twice and compare the two lines. For `png`, `apng`, `webm` and
`lottie`, both hashes match: the same source gave the same file and the same
motion. That is the check to make after changing a scene, upgrading Marey, or
moving to another machine, when the result should not have changed.

MP4 is the one format whose bytes change from run to run. The same export run
again printed the same `frames` hash and the same size, and a different
`sha256`:

```text
wrote lighthouse.mp4  60 frames @ 30 fps  1920x1080  580865 B  sha256 678061c59b4552a3757e668ae6fc4a2fcc2a3cdda7b78edcd4fdf7c13f62c080  frames 4f865ba0
```

The motion is the same; the difference is inside the browser's H.264 encoder.
The `frames` hash is the one to compare for MP4.
[Determinism](/reference/determinism/) states exactly what is promised, under
what conditions, and how it is checked.

A version of Marey with a changed encoder writes different bytes for the same
motion: a Lottie export from 0.6.0 and one from 0.7.0 have different `sha256`
and the same `frames` hash.

## Which format to use

| You want | Use | Why |
|---|---|---|
| A scene in a README, an issue, or anywhere an image goes | `apng` | An `<img>` plays it with no script, and it loops forever. It is lossless. |
| A clip for a slide, a social post or a video player | `mp4` | H.264 plays almost everywhere video does. |
| Video on your own web page in a `<video>` element | `webm` and `mp4` | Give both as `<source>` elements, and a browser that lacks one codec plays the other. |
| Frames to composite, grade or cut in another tool | `png` | Lossless frames, numbered in order. |
| An animation in an app or site that has a Lottie player, or to adjust in a Lottie editor | `lottie` | Vector shapes and keyframes that scale to any size. [The Lottie guide](/guides/lottie/) describes the file. |
| A scene a reader can pause, scrub and open in the playground | none: embed it | [Embed a scene](/guides/embed/) puts the source itself on the page. |

## From the playground

The playground's **Export** menu, in the top bar (under **⋯** on a phone),
exports the scene in the editor:

| Menu entry | Writes |
|---|---|
| MP4 video | `scene.mp4`, H.264 at twice the scene's size |
| WebM video | `scene.webm`, VP9 at twice the scene's size |
| APNG image | `scene.png`, at the scene's size |
| Lottie | `scene.json` |

It always exports the scene's own `duration` at 30 frames a second, so a scene
with no `duration` cannot be exported from the menu: give it one, or use
`marey export --duration`. There is no PNG frames entry; that is `marey export
--format png`.

The export runs in your browser. Video uses the browser's own encoder
(WebCodecs), so a browser without one for the codec stops with a message
saying so, such as `[VIDEO_UNSUPPORTED_CODEC]`; the command line, which brings
its own Chromium, does not depend on the browser you use. Otherwise the menu
and `marey export` at 30 frames a second run the same pipeline on the same
scene.
