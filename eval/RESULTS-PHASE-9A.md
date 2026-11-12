# Phase 9A results: the embeddable player

Measured on 2026-10-30 on branch `phase-9a-player`, at `8db3201` plus the
version bump and documentation edits the commit carrying this file contains.
Every number below was produced by the command beside it on that tree. Captures
and reports came from `.visual-check/phase9a/` (git-ignored; re-run the
commands to regenerate). The player harness serves the repository on a free
port of its own and closes it (its `server` check passes); the playground check
ran Vite on 5199 with `--strictPort` and was stopped afterwards (no listener on
5199).

Design: `docs/specs/2026-10-30-marey-phase-9a-embeddable-player-design.md`
(criteria in section 6). Plan: `docs/plans/2026-10-30-phase-9a-embeddable-player.md`.
Phase base (the plan's commit): `ba81f7e`. Scope of every browser number:
headless Chromium on one machine (spec section 2).

## E1: package

Command: `npm run check:pack` (it runs `build:package`, packs, installs the
tarball into a scratch project and loads the player in Chromium).

```
ok    npm pack --json                               127 files, 895897 B packed, 2959097 B unpacked
ok    npx marey --version                           0.6.0
ok    marey-lang/player resolves through exports    dist/player/marey-player.mjs
ok    player entry chunk holds no PixiJS            static 3 files 115850 B [chunk-DFxq7XbF.mjs, controller-gq7exm9O.mjs, marey-player.mjs]; lazy-only 17 files 765982 B [BufferResource-..., CanvasRenderer-..., ..., render-BMXsKnrZ.mjs, ..., webworkerAll-...]
ok    player draws an inline scene in Chromium      ready, canvas mounted, font 200
ok    tarball file count                            127 files

check:pack: all passed
```

The tarball grew from 57 files (0.5.1) to 127: the player's chunks, its
JetBrains Mono font, and the declaration files for the player entry.
`fb8b394` made the no-PixiJS check cover the player's whole static import
closure, not the entry file alone. The check reads each statically imported
chunk and fails on a PixiJS marker; a mutation that added a static `pixi.js`
import made it fail.

## E2: agreement with export

Command: `node tools/visual-check/player-check.mjs` (it builds the player,
export page and CLI itself, then drives Chromium). Result: **41 of 41 checks
passed**; `report.json` is under `.visual-check/phase9a/player/`.

`liveFramesHash` over the ticks `marey export --fps 30` samples, against the
`frames` hash `marey export --format lottie --fps 30` prints for the same file:

| Scene | Kind | Frames | Player | Export | Control (ticks shifted by one) |
|---|---|---|---|---|---|
| `src/examples/physics-pile.marey` | physics | 210 | `63d4ede8` | `63d4ede8` | `09aec224` |
| `docs/media/bars-reveal.marey` | staggered reveal | 60 | `91eca4ae` | `91eca4ae` | `dac676c2` |
| `src/examples/bar-chart-reveal.marey` | text | 150 | `af368f92` | `af368f92` | `193c5ebd` |

The control column shows the comparison can fail. The text scene loaded the
font from the player build (`/dist/player/fonts/JetBrainsMono-Regular.ttf`,
HTTP 200). No player reported an error.

## E3: context budget

Same run. A page with 24 players, scrolled to the bottom and back:

- All 24 fired `ready`, none fired `error`.
- At load the 20 players more than two screens down held no canvas. The first
  player came near view at +9 ms and the render chunk was requested once, at
  +41 ms.
- At the bottom, both players in view (p22, p23) had a canvas whose context was
  not lost; their pixels held the scene background and 0.00% of the page's
  magenta fill.
- At most 4 canvases were live at once during the scroll down and during the
  scroll up, and no player far from view held one.
- 45 contexts were created, 3 were live at the end, and 42 `webglcontextlost`
  events fired for the 42 released; none on a canvas in view.
- Player 0 was paused on tick 200 with `liveFramesHash([200])` = `2f9b11a4`
  before it left view and `2f9b11a4` after it came back on a new canvas
  (#2 to #45).
- Console warnings from WebGL: 0.

## E4: reduced motion

Same run, with `prefers-reduced-motion: reduce` emulated. The `autoplay` bars
player was paused with `currentTime` 2 of `duration` 2 when ready and 500 ms
after mounting; the physics scene (7 of 7) and the text scene (5 of 5) were
likewise paused on their last tick.

## E5: errors

Same run. Each case fired the expected event and drew its diagnostic box:

| Case | `error.detail.code` | Box |
|---|---|---|
| type error | `PLAYER_COMPILE_FAILED`, 1 compiler error | `6:36 [TYPE_ANIM_MISMATCH] Property 'alpha' expects a number for 'to'.`; `marey check` reports `6:36 [TYPE_ANIM_MISMATCH]` |
| `src` that 404s | `PLAYER_FETCH_FAILED` | `404 http://127.0.0.1:<port>/tools/visual-check/player/missing.marey` |
| text scene, font request aborted | `PLAYER_FONT_UNAVAILABLE`, no canvas | `The scene font could not be loaded: A network error occurred.` |
| no `src`, no inline script | `PLAYER_NO_SOURCE` | `Set the src attribute or add a <script type="text/marey"> child.` |

`PLAYER_RENDER_FAILED` has no browser case in the harness; the controller's
unit tests cover it (`a non-PlayerError mount rejection is PLAYER_RENDER_FAILED`).

## E6: `currentTime`

Same run:

- On a playing embed, `currentTime = 1` read back `1` straight after the set;
  300 ms later it was still playing (1.275 s).
- `currentTime = 0` read back `0` straight after the set. After `pause()` the
  getter still read `0`, and 200 ms later the embed stood on tick 0, paused.
  `liveFramesHash([0])` was `fa8bc0e5`; the CLI's one-frame export
  (`--duration 0.25 --fps 4`) printed `fa8bc0e5`.
- On a paused embed, `currentTime = 0.5` read back `0.5`; after `play()` it was
  playing, and 300 ms later it read 0.792 s.

The pause-after-set and set-then-play cases failed before `8db3201` (see
"What review found").

## E7: no playground regression

Commands and results on this tree:

```
npm test                                          78 files, 1522 tests passed (baseline: 74 files, 1479)
npx vitest run --config eval/vitest.config.ts     1 file, 5 tests passed
npm run build                                     exit 0
npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')    86 files, every one ok
npx vitest run src/compiler/languageDocs.test.ts  52 tests passed
```

`src/compiler/renderer/sceneFrameHashes.test.ts` and its snapshot file are
unchanged from the phase base. The playground's browser check ran after the
`mountScene` extraction (`2147444`, 25 of 25) and again on this tree:

```
npx vite --port 5199 --strictPort
node tools/visual-check/transport-check.mjs --out .visual-check/phase9a/transport
```

Result: **25 of 25 requirements passed** (seek equals reference, live play then
pause equals reference, stop at the end and restart, playhead across
recompiles, scene replacement, light and dark transport strip, no console or
page errors).

## E8: size

Measured with `node -e` and `zlib.gzipSync` on `dist/player/` as `check:pack`
built it:

| What | Files | Raw | Gzipped |
|---|---|---|---|
| `marey-player.mjs` (the file a page names) | 1 | 14,467 B | 4,387 B |
| Static closure: `marey-player.mjs`, `controller-*.mjs`, `chunk-*.mjs` | 3 | 115,850 B | 29,386 B |
| `render-*.mjs` alone | 1 | 206,759 B | 54,103 B |
| Lazy-only closure: `render-*.mjs` and the 16 chunks it pulls in | 17 | 765,982 B | 200,856 B |
| Both closures | 20 | 881,832 B | 230,242 B |

A page pays 29.4 kB gzipped up front: the element, the controller and the
compiler, with no PixiJS. It pays another 200.9 kB gzipped on the first
player's first near view, for the renderer and PixiJS; later players reuse the
cached modules. The scene font (`fonts/JetBrainsMono-Regular.ttf`) is fetched
only for a scene containing `text`. There is no budget to pass; these are the
numbers spec section 2 promised to report.

## E9: documentation

The README gains "Embed a scene" after "As a library": the two snippets from
spec section 1 (written against `marey-lang@0.6.0`), the attribute table, the
poster frame and reduced-motion behaviour, the events and the five error
codes, the 16-context note, the Chromium scope of agreement with export, and
one sentence on frameworks. It makes no claim about a framework that this phase
did not run. The HTML snippet uses a `text` fence because
`languageDocs.test.ts` accepts only `marey` and `text`. When this phase
merged, version `0.6.0` was not yet on npm, so the CDN snippet did not resolve.

2026-11-06: `marey-lang@0.6.0` is published (registry time 2026-11-05 18:33
UTC). The registry lists 127 files, the count `check:pack` pins, and the
jsDelivr URL in the README's snippet resolves.

## What review found

- `controller.ts` lost a pending seek when `play()`, `pause()` or `restart()`
  arrived before the seek was performed: after `pause()` the `currentTime`
  getter reverted, and set-then-`play()` on a paused embed ended paused. The
  browser harness found it (spec section 3.3 requires both to hold), and
  `8db3201` fixed it with controller tests whose fake mount models a pending
  seek.
- The renderer chunk's explicit `loseContext` call ran after Pixi's own
  `destroy` had already done it, so each of 42 releases logged a WebGL
  `INVALID_OPERATION` warning. Removing the call gives 0 warnings and the same
  42 `webglcontextlost` events (`8db3201`).
- A mount that resolved after a newer load, and a nested notification inside
  `play()` during a resume, left stale state (`966d160`).
- An upgraded element that already carried `src` fetched twice (`ab49cd6`).
- The no-PixiJS check covered only the entry file (`fb8b394`).
- The harness's first agreement checks still passed with the change
  they guard reverted, so they could not fail; stronger ones were added (the
  shifted-ticks control column above) and those did fail under the revert.

## Fixed after the publish (ships in 0.7.0)

A whole-phase review after 0.6.0 found two defects a reader could hit; both
are fixed in `c73ed75`.

- Input made while a mount was pending was lost. On the first near view the
  renderer chunk, the font and `app.init` take a while, and the controls bar
  is live the whole time: a play pressed then left the button saying "Pause"
  over a paused scene, a pause on an `autoplay` embed was ignored, and a
  `currentTime` set read back but was never shown. The controller now
  reconciles the stored intent with the mount once it resolves. Controller
  tests with a deferred mount cover play, pause, restart and `currentTime`
  in that window; 7 of them fail with the reconciliation removed.
- On a page that declares its own `JetBrains Mono` `@font-face` and has not
  used it yet, a text scene was refused with `PLAYER_FONT_UNAVAILABLE`, and
  the player's face took over the page's own text in that family. Both
  reproduced on `tools/visual-check/player/font-host.html` (the page's text
  measured 480.00 px, the width of the player's file, against 412.31 px for
  its own). The player now registers the same file under a family of its own
  and judges the face by its own status. On the same page the scene mounts,
  its `liveFramesHash` equals the export's `frames` hash (`af368f92`), and the
  page's text measures 412.31 px.

`player-check.mjs` gained the font-host requirement. Of three full runs on
the code committed as `c73ed75`, two passed 44 of 44 and one passed 43 of 44:
one released canvas of 45 (serial 22) never fired `webglcontextlost`. Three runs of
`--only many` afterwards each counted 42 events for 42 releases, so this is
recorded as an intermittent harness observation, not reproduced.
