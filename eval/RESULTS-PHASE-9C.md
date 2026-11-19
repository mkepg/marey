# Phase 9C results: the documentation site and gallery

Measured on 2026-11-19 on branch `phase-9c-docs-site`, at `eef99b5` plus the
pool, control-bar and check changes the commit carrying this version of the
file contains (the first version, at `eef99b5`, measured on 2026-11-18 with the
earlier pool). Every number below was produced by the command beside it on that
tree. Reports and screenshots came from `.visual-check/site/` (git-ignored;
re-run the commands to regenerate). The browser check ran against
`npx vite preview --port 5199 --strictPort`, serving `npm run build`'s
`dist/`, which was stopped afterwards (no listener on 5199).

Design: `docs/specs/2026-11-13-marey-phase-9c-docs-site-and-gallery-design.md`
(evidence in section 8). Plan: `docs/plans/2026-11-13-phase-9c-docs-site-and-gallery.md`.
Scope of every browser number: the Chromium headless shell that Playwright
1.62.1 installs, under SwiftShader, on one Windows machine, unless a row says
otherwise.

Section 4, the deployed site, is written after the push to `main`.

## 1. The site

Command: `npm run build`, which runs the generator inside `vite build` and
fails on any error it reports (a sample that breaks its fence's rule, a link or
anchor that does not resolve, a gallery entry without its scene, a page
missing from `site.json`). It passed with no errors.

**Pages.** 50 pages beside the playground at `/`, all in the build's
`sitemap.xml` except `404.html`:

| Section | Pages |
|---|---|
| `/learn/` | the course's front page and 14 lessons |
| `/guides/` | the index and 6 guides: install, export, embed, ci, lottie, errors |
| `/gallery/` | the grid and 22 scene pages |
| `/reference/` | the index, `language`, `properties` and `determinism` |
| root | `404.html` |

**Samples**, counted from the built pages (`figure.sample` by `data-mode`).
Every one was compiled by the build, and an error sample's messages on the page
are the compiler's, generated at build time:

| Kind | Lessons | Guides | Reference | Total |
|---|---|---|---|---|
| live (`marey`, compiles) | 128 | 17 | 0 | 145 |
| run (`marey` on a reference page) | 0 | 0 | 21 | 21 |
| solution (`marey solution`) | 41 | 0 | 0 | 41 |
| showcase | 13 | 0 | 0 | 13 |
| error (`marey error=CODE` or `marey error`) | 34 | 17 | 0 | 51 |
| fragment (`marey fragment`) | 2 | 0 | 0 | 2 |
| **All** | 218 | 34 | 21 | 273 |

Of the 51 error samples, 24 name a code (16 distinct codes) and 27 are bare
`marey error` fences for diagnostics without one. The lesson-14 embed (the
Lighthouse written into the page as a bare `<marey-player>`) is not a sample
and is not counted here.

**Gallery.** 22 entries in the spec's order: 13 lesson showcases, the five
playground examples, the Lighthouse and the three showpieces (Fireworks,
Aurora, Hourglass). `gallery.test.ts` pins the order, and each scene has a
finite `duration`, a poster inside it, and passes
`node bin/marey.mjs check --export-ready` (it is among `git ls-files
'*.marey'` in the fourth repository check).

**Tests.** The site's suite is `site/**/*.test.ts` and
`vite-plugins/site.test.ts`, run by `npm test`.

**Version references.** The site documents `main`, version 0.7.0. Every
version statement in `site/content/` and the README is written to stay true
before and after 0.7.0 reaches npm: it says what a feature needs ("needs
`marey-lang` 0.7.0 or later") and what 0.6.0 does, and none says whether a
version is published. This lists them:

```
grep -rn "0\.6\.0\|0\.7\.0\|not published\|not on npm" site/content README.md
```

What is left to change by hand is the embed snippet's pinned
`marey-lang@0.6.0` URL (`embed.md`, `ship-it.md`, the README), which stays
valid because a pinned CDN URL keeps serving the same file, and can move to a
newer version whenever one should be taught. The other hits stay
version-specific on purpose: the workflow steps pinned to 0.6.0, which run the
same with a later version; the comparisons of 0.6.0 and 0.7.0 output; the
`--reporter github` step pinned to 0.7.0; the action's own message, quoted
with `<version>`; and the lines that name `main` as 0.7.0 (`embed.md`,
`install.md`, the README's status), which change when `main` moves on.

## 2. The browser check

Command (after `npm run build` and with the preview running):

```
node tools/visual-check/site-check.mjs --out .visual-check/site
```

Result: `site-check: all passed`, exit 0, in 11.4 minutes. Renderer:
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) ...), SwiftShader driver)`.

| Requirement (spec §6.4) | Result |
|---|---|
| Every page in the sitemap, and `/404.html` | 51 visited (the playground, 49 site pages, the 404). Every one 200, with 0 console errors, 0 page errors, 0 failed requests and 0 error statuses. |
| Every player reaches `ready`, none fires `error` | 280 of 280 player slots ready, 0 `error` events, every one on the first scroll down its page (no slot was left waiting for the check's second pass). By kind: 145 live, 41 solution (every "Show a solution" opened), 21 run (every Run pressed), 13 showcase, 22 gallery cards, 22 gallery scene pages, 14 lesson cards, 1 hero, 1 lesson embed. |
| At most 12 pooled players per page | The highest on any page was 12 (`/learn/` and `/gallery/`). `/learn/ship-it/` peaked at 4 pooled plus its 1 embed, which is outside the pool and counted apart. |
| Editor round trip (`/learn/animate/`, first live sample) | Typing a comment gave the player a new `blob:` source and it reached `ready` again with the status "Runs". Adding `bogus: 1` as line 2 listed `line 2, col 10: The scene block has an unknown property 'bogus'. ...`, the status read "1 error", line 2 was marked and the player dimmed. Reset restored the original text, hid the list, read "Runs", undimmed and re-ran the player. |
| Search | `/` opened the dialog with the field focused; Escape closed it; Ctrl+K reopened it empty; `handoff` listed 8 results grouped Learn, Reference, Gallery, Guides with the first selected; ArrowDown and ArrowUp moved the selection; Enter opened `/learn/handoff/#handoff`. |
| No sideways scroll on a phone | 0 px overflow on all 51 pages at 390 px, and on all 20 lessons and guides at 360 px (both as a touch device). |
| JavaScript before any player mounts, under 90 kB gzipped | All 50 site pages under budget. Largest `/learn/ship-it/` at 43.0 kB (samples and the embed); 39.7 kB on the other 13 lessons, the three guides with samples and the language reference; 36.8 kB on `/learn/`, `/gallery/` and the 22 scene pages; 6.7 kB on the 8 pages with no sample or player. The renderer chunk was never requested during the measurement. |
| A `text` sample reaches `ready` (C21) | `/learn/shapes/`'s first live sample (a `text` object among the five shapes) reached `ready`, and the scene font came from `/assets/fonts/JetBrainsMono-Regular.ttf` with a 200 (`font/ttf`). The screenshot shows `SAIL` drawn in it. |
| `/gallery/`, at most 12 players connected (C20), and no card on screen left empty | At 1280x900 and at 1280x2400, scrolled top to bottom in 300 px steps, then jumped between the top and the bottom twelve times: at most 12 players connected at any moment, 0 `error` events. At 1280x900 (at most 9 cards on screen), every card on screen had a player at every step once the page was still, within 1.2 s of the scroll. At 1280x2400, 13 to 18 cards are on screen at once; at every step 12 of them had players within 0.6 s, and only the cards beyond the 12-player limit waited (at most 6). |

How the JavaScript was measured: each page loads with the player's own
IntersectionObserver (its 200 px margin) given one that never reports, so no
player mounts and the renderer is never requested, while the pool's observers
work and players are made, compile and fire `ready`. Every script response
from the preview is gzipped with `zlib.gzipSync` and summed, with any inline
script. The first attempt held the renderer chunk's request unanswered
instead, and measured 186 to 192 kB on pages with a player in view: Vite's
preload helper requests the renderer's dependency chunks (PixiJS and the scene
runtime) beside the chunk itself, so holding the one file did not keep the
rest out. The 9A results recorded the element and compiler at 29.4 kB gzipped
up front; the site's own code (navigation, search, samples, editor, pool)
brings a lesson to 39.7 kB.

**Further requirements, beyond spec §6.4:**

| Item | Result |
|---|---|
| Control bar (`docs/architecture/site.md`), on a gallery scene (`/gallery/lighthouse/`), a lesson sample (`/learn/animate/`) and lesson 14's embed | On each of the three, every step waiting up to 5 s for the opacity it expects, and every step that expects the bar to stay up then sampling it every 50 ms for 700 ms (five times the 140 ms fade) and requiring every sample to read 1: playing with the pointer away and nothing focused, the bar's computed opacity 0; pointer on the player, 1; paused by a mouse click, pointer away, 1; played by a mouse click, pointer away, 0, with nothing in the player focused (the site blurs a control after a pointer click); played with Enter on the focused play button, pointer away, 1, the button keeping the focus; focus moved out, 0; focus on the seek bar, 1; focus gone, 0. On a touch device (`hover: none` matched), playing: 1. 25 steps, all passed. The shipped player is unchanged: the site styles `marey-player::part(controls)`, sets an `is-playing` class from `paused`, and reaches the clicked control through the player's open shadow root. |
| Search closed with Escape, reopened, typed into | Passed (the Search row above). |
| No-JavaScript pages, against the preview | `/learn/`, `/learn/animate/` and `/gallery/` render their heading, the top navigation (11, 28 and 10 links) and no search button; the lesson shows its 18 code blocks. Screenshots read. |
| Console output | No console warning of any kind in the 51-page run under SwiftShader; the `GPU stall due to ReadPixels` performance warnings seen in headless Chromium earlier in the phase did not appear. A headed run on the machine's GPU (`--gpu --headed --only pages,controls --pages /learn/animate/,/learn/physics/,/gallery/hourglass/,/learn/`, renderer `ANGLE (Intel, Intel(R) Iris(R) Xe Graphics ... Direct3D11 ...)`) had every player ready, no console error and no warning, and its control-bar steps passed (run on the earlier version of the check, before the pool and control-bar changes). |
| The lesson-14 embed | Counted on its own on `/learn/ship-it/`: 1 embed, ready, outside the pool's 12. |

**What the check found.**

- **Visible cards waited for a player while off-screen players kept their
  places.** As first built, the pool removed a player only once its slot was
  more than 1,200 px away, and made one only for a slot within 400 px with a
  place free (spec C20). On `/gallery/` at 1280x900, three of the nine cards
  on screen had no player 2.5 s after each step from 1,350 to 2,250 px,
  because twelve players above them were still within 1,200 px, and the last
  card, Physics pile, stayed a dark stage at the bottom of the page. The pool
  now also watches the viewport's edge: when a slot on screen is waiting and
  every place is taken, the player whose slot is farthest off screen gives up
  its place, and a player on screen is never removed for another. The cap
  stays 12. The `pool` check now fails on any card on screen left without a
  player once the page is still, beyond the 12-player limit; the figures above
  are from after the change, and `gallery-grid-bottom-900.png` shows the
  bottom of the grid at 1280x900 with every card drawn. A viewport tall
  enough to show more than 12 cards at once still leaves the extra ones
  waiting.
- **The playground's top bar did not fit the two links between 760 and
  about 850 px.** The first version overlapped `Gallery` with `Auto-run` at
  760 px, and `playground-check.mjs` failed its 760 px "confirming New" row by
  15.9 px. Between 760 and 899 px the bar now shows the status dot without its
  word, as the phone bar does, and tightens its spacing; the status carries the
  word as a `title` at every width. `playground-check.mjs` against the preview
  then passed 46 of 46.

**The capture-timing defect in `check.mjs`, recorded rather than fixed.** The
harness's `--at` captures are timed from page load, not seeked, so a capture
lands a little before the time asked for, and the first capture after the
player is ready can be taken before the canvas has painted. Reviews of the
lesson showcases found both, as blank or early frames. `site-check.mjs` does
not use it:
each screenshot pauses the player, seeks it once to a throwaway time and
waits, then seeks to the poster time exactly through `currentTime` and waits
before the capture. All 36 screenshots report the time they show equal to the
time asked for.

## 3. The screenshots

`site-check.mjs` saved one screenshot of every gallery scene on its scene page
(`gallery-<id>.png`) and of every lesson showcase on its lesson
(`showcase-<slug>.png`, with lesson 14's embedded Lighthouse), each at the
entry's `poster` time, or its last moment when it has none, with the control
bar removed. All 36 were read, and the 22 gallery screenshots were read again
from the run after the pool change.

| Screenshot | Time | What it shows |
|---|---|---|
| Lighthouse | 12 s | Lamp lit, beam swept right across the sky, boat and moon path on the night sea. |
| Dusk over layered hills | 3 s | The sun half behind the ridges, birds, stars in the banded sky. |
| Ledges | 9 s | Three fixed ledges and the paddle; the tiles heaped at the bottom. |
| Fireworks | 8.6 s | A white ring and a fading magenta ring over the lit skyline, both reflected in the river. |
| Aurora | 4 s | Green and violet ribbons over snow-capped ranges, the cabin's lit window. |
| Hourglass | 2.2 s | Sand pouring through the neck, a heap in the lower bulb, the candle and books. |
| Orrery | 4 s | The sun, three planets on their arms, the blue planet's moon, the legend. |
| Forest | 4.5 s | Three layers of trees under the moon, fog bands, fireflies. |
| Day to Night | 3.5 s | Dusk bands over the skyline, the first windows lit. |
| Plinko | 5 s | Discs on the pegs and in the bins, the paddle at the top, the PLINKO and TOP PRIZE boards. |
| Domino Run | 2 s | The marble against the first fallen dominoes, the rest standing up the books, the cup. |
| Ripple | 3 s | Rings of lit dots spreading from the centre, coloured by ring. |
| Title Card | 3 s | Bars, MOTION, WRITTEN, underline and subtitle, held. |
| Toy Box | 5 s | The letter blocks M, R, A, E, Y, balls, dice, the car and the L-piece in a heap. |
| Metronome | 2.3 s | The arm at its left extreme with its weight; the lamps and the window. |
| Postcard | 2 s | Three peaks mirrored in the lake, the sun, the caption. |
| Easing Race | 4 s | All four runners at the finish with their trails, flags up. |
| Set Sail | 8 s | The boat under the low sun, gulls, the banner and the lighthouse on the point. |
| Sunrise | 6 s | The sun risen above the clouds, its reflection on the sea. |
| Logo reveal | 5 s | The sun behind the ridges, the word `marey`. |
| Bar chart reveal | 5 s | All seven bars with their values and labels. |
| Physics pile | 7 s | The shapes heaped between the two walls. |

The 14 lesson screenshots show the same frames as their gallery entries, at
the lesson column's width: every showcase drew in the lesson as it does on its
scene page. Each scene matched its brief at its poster time. No scene was
reworked in this change: each had been reviewed against its brief
at three moments when it was added (spec §6.5), and reworked then where it
fell short.
