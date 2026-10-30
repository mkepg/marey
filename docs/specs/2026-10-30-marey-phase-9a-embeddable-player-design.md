# Phase 9A — Embeddable player

**Date:** 2026-10-30
**Status:** Approved design. The owner chose the roadmap §13 "Adoption and
distribution" group on 2026-10-30 and delegated every design call in it; the
calls are recorded in §0 as decisions, not as owner rulings.
**Roadmap:** `2026-09-09-marey-engineering-roadmap-design.md` §13. The finish
line (§12) is declared; nothing here is owed, and nothing here reopens it.
**Authorities preserved:** decisions D1–D18; the language cuts in roadmap §4;
the Phase 7 transport contract (every jump in time is a replay from tick 0);
the hosting rules in `docs/architecture/README.md` (`netlify.toml` stays, no
`public/_redirects`).

---

## 0. Decisions

| # | Decision | Why |
|---|---|---|
| P1 | §13's adoption group runs as one programme, **Phase 9**, in three sub-phases with their own spec, plan and branch: **9A** the embeddable player (this document), **9B** the GitHub Action and Gate C, **9C** the documentation site and gallery. | They are independent deliverables, and each can be reviewed and merged on its own. |
| P2 | 9A comes first. | The docs site's live examples, the gallery and every documentation-tool integration all embed a player. Building it first means 9C is assembly, not invention. |
| P3 | There are **no per-framework integrations** (no MDX plugin, Docusaurus plugin or VitePress plugin). The player is a standard custom element, and that is the integration. | Custom elements already render in MDX/React 19, Docusaurus and VitePress. Three plugins would be three things to maintain, for demand that roadmap §1.1 finds unverified. The old roadmap's §11.2 itself said integrations should be "chosen from actual demand". |
| P4 | Adoption metrics are dropped from the programme. | There is nothing to measure them against, and roadmap §1 moved them past the finish line for that reason. |
| P5 | The player plays **Marey source**, compiled in the page. It is not a Lottie or video player. | Shipped artifacts already play in their own players with no Marey code (finish line item 3). The player is the one thing only Marey can offer: a readable text file, embedded, playing the exact frames its exports contain. |
| P6 | The package version for 9A is **0.6.0**. The owner runs `npm publish --ignore-scripts` after `npm run build:package && npm run check:pack`, as for 0.5.1. | A new public entry point is a minor version. The publish rule comes from the 0.5.0 incident. |
| P7 | Agreement with export is checked against the **real exporter**, the `frames` hash `marey export` prints, not against `Playback.referenceHash`. | `referenceHash` is computed by the same `Playback` as the player, so comparing the two proves almost nothing. The claim in §2 is about the exporter. |
| P8 | The browser exit criteria run against the **built** `dist/player/` bundle, not against source on the dev server. The shipped element carries one undocumented test hook, keyed by `Symbol.for("marey.player.debug")` (§4.6). | The two-stage split, the CDN-relative lazy import and the font URL only exist in the built bundle, so only the built bundle can prove them. One symbol-keyed hook costs a few hundred bytes. It is outside the documented API and has no semver promise. |
| P9 | A scene that contains `text` waits for JetBrains Mono. If the font cannot load, the element refuses with `PLAYER_FONT_UNAVAILABLE`, as the exporter refuses with `EXPORT_FONT_UNAVAILABLE`. A scene without text never waits for the font. | Text width sizes physics bodies and group bounds (`builder.ts`). A fallback face is therefore a different simulation, not just a different look. An embed that silently diverges from its export breaks the claim the player exists to make. |
| P10 | `ready` fires once per load, **after compile**, when `duration` and the size are known. It does not wait for the renderer. Re-entering view does not fire it again. A render failure can arrive as `error` after `ready`. | Below-the-fold embeds load their renderer late (§4.3). If `ready` waited for the first draw, an embed nobody scrolls to would never be ready, and its `duration` would stay `NaN`. |

## 1. What a page author writes

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/marey-lang@0.6.0/dist/player/marey-player.mjs"></script>

<marey-player src="bars-reveal.marey" autoplay loop controls></marey-player>

<marey-player controls>
  <script type="text/marey">
    scene {
      size: (400, 300)
      duration: 2
      circle dot { position: (200, 150) radius: 30 color: #38bdf8 }
    }
  </script>
</marey-player>
```

From a bundler, the import is `import "marey-lang/player";`. That module
defines the element and has no other side effects.

## 2. Competitive frame

- **Lottie's** `dotlottie-player` and **Rive's** web runtime each play a
  binary or machine-written file. A Marey embed's source is the text a reader
  can open, diff and edit.
- **GSAP** has no file to embed. The animation is the page's own JavaScript.
- What a Marey player adds over both is **agreement with export**. The frame
  the player shows at tick *t* is the frame `marey export` samples at *t*,
  because both run the same tick loop over the same IR (§4.2, and
  `playback.ts`). §6 checks it against the exporter's own printed hash.
  Neither competitor's web player makes that claim. **Its scope is a
  Chromium-family browser**: `docs/determinism.md` §2 records two V8 builds
  disagreeing on the last bit of `Math.sin`. An embed viewed in Firefox or
  Safari can therefore differ from a Chromium export on a scene that uses
  `sin` or `cos`. The README states this.
- What it costs: the player is the Marey runtime (compiler, PixiJS and
  Matter.js). That is several hundred kilobytes, against a Lottie JSON file
  plus `lottie-web`. §6 measures the real number. Pages that need no runtime
  keep using the exported artifact, and Gate C (9B) proves that path.

## 3. The element's contract

### 3.1 Source

- `src`: a URL, fetched with `fetch()`, whose text is the scene.
- Without `src`, the text of the first child `<script type="text/marey">` is
  used. A `script` of an unknown type is never executed by the browser, which
  is what makes it a safe inline container.
- If both exist, `src` wins. If neither exists, the element reports the error
  `PLAYER_NO_SOURCE` (§3.5).
- Changing `src` at runtime loads the new scene and discards the old one.
  Changing the inline script's text after connection is not observed. This is
  documented, not detected.

### 3.2 Attributes

All are boolean, modelled on `<video>`'s, and reflected as properties of the
same name.

| Attribute | Effect |
|---|---|
| `autoplay` | Start playing once the scene is ready, unless the reader prefers reduced motion (§3.4). |
| `loop` | A bounded scene restarts from tick 0 when it reaches its end. The attribute has no effect on an indefinite scene. |
| `controls` | Show the control bar (§3.6). |
| `muted` and the rest of `<video>`'s attributes | Not supported. Marey has no audio. |

### 3.3 Scripting interface

- `play()`, `pause()`, `restart()`.
- `currentTime`, in seconds. It is read-write, and setting it seeks. A set is
  clamped like `Playback.seek` (tick 0 up to the end tick, or up to the
  furthest tick reached for an indefinite scene). It follows `<video>`:
  - Setting it keeps the play state. A playing embed goes on playing from the
    new time, even though `Playback.seek` itself leaves playback paused. The
    element re-plays once the seek has been performed.
  - The getter returns the new, clamped time immediately, not after the next
    frame.
  - Out of view, a set updates the stored playhead, and the element applies
    it when it re-enters view (§4.4).
- `duration`, read-only: seconds for a bounded scene, `Infinity` for an
  indefinite one, `NaN` before the scene is ready. These are `<video>`'s own
  conventions.
- `paused`, read-only.
- `errors`, read-only: the last load's `CompilerError` list, or an empty
  array.

`secondsToTicks` in `sceneIR.ts` converts a **duration**. It floors at one
tick, because a span of zero still occupies a tick, and `clock.test.ts` pins
that. A playhead is a **position**, so `currentTime = 0` must mean tick 0.
`sceneIR.ts` therefore gains two shared position conversions next to it:

- `timeToTick(seconds)`, which is `Math.round(seconds * TICK_HZ)`, clamped to
  0 or more;
- `tickToTime(tick)`, which is `tick / TICK_HZ`.

Each is unit-tested. The player converts only through these two. The comment
on `secondsToTicks` says why there are two kinds of conversion.

### 3.4 Poster frame and reduced motion

- A scene that is drawn and not playing shows its **poster frame**. For a
  bounded scene that is its last tick, the settled state: a staggered reveal's
  tick 0 is an empty canvas. For an indefinite scene it is tick 0.
- When `matchMedia("(prefers-reduced-motion: reduce)")` matches, `autoplay`
  is ignored and the poster frame stays up until the reader presses play.
  This serves WCAG 2.2 SC 2.2.2 (Pause, Stop, Hide). With `controls` present,
  the element also gives a pause control on any playing scene.
- Pressing play on a bounded scene shown at its last tick starts from tick 0,
  which is what `Playback.play()` already does at the end.

### 3.5 Events and errors

- `ready`: fired once per successful load, after compile (P10). `detail` is
  `{ width, height, duration }`.
- `ended`: fired when a bounded scene reaches its end tick and `loop` is off.
- `error`: `detail` is `{ code, errors }`. `code` is one of these:
  - `PLAYER_NO_SOURCE`: there is neither a `src` nor an inline script.
  - `PLAYER_FETCH_FAILED`: a network failure or a non-2xx response. The
    message names the status and URL.
  - `PLAYER_COMPILE_FAILED`: `errors` holds the compiler's diagnostics.
  - `PLAYER_FONT_UNAVAILABLE`: the scene contains `text` and JetBrains Mono
    could not be loaded (P9).
  - `PLAYER_RENDER_FAILED`: WebGL is unavailable, or the renderer threw.
- On any error, the element draws a readable diagnostic box in place of the
  canvas: the code, then each compiler error as `line:col CODE message`. A
  broken embed should explain itself the way `marey check` does, not show a
  blank rectangle.

### 3.6 Controls

- A play/pause `<button>`, a seek `<input type="range">` over ticks, and the
  time shown as `m:ss / m:ss`.
- An indefinite scene's range runs to the furthest tick reached, as the
  playground's transport does.
- Keyboard: the button and range are native controls, so focus and keys work
  with no custom handling. The button has an `aria-label` that names its
  action.
- The bar also has an **"Open in playground"** link: the playground URL
  (`https://marey.pages.dev/`) followed by the same `#code=` fragment
  `buildShareURL` writes. `share.ts` gains
  `buildShareURLFor(base, code)`, which takes an explicit base URL, and
  `buildShareURL` becomes that function called with the current location.
  Both therefore write the one fragment format. The link is omitted when
  `encodeCode` returns `null`, which is when the source is too long to
  share. This puts
  rung 1 of the old adoption ladder (try a share link, no account) on every
  embed.
- The controls are styled inside the shadow root and exposed as `::part`s
  (`controls`, `play`, `seek`, `time`, `playground-link`), so a page can
  restyle them without forking.

### 3.7 Layout

- The element is `display: block`. Its `aspect-ratio` defaults to the scene's
  `size` once ready (and 16 / 9 before that), so it reserves a stable box. A
  page's own `width`, `height` or `aspect-ratio` overrides it.
- The scene's `fit` decides placement inside that box, exactly as in the
  playground.

## 4. How it is built

### 4.1 Package surface

- New entry `src/player/index.ts`, built by a new `vite.player.config.ts`
  into `dist/player/`, with `marey-player.mjs` as its entry chunk.
- `package.json` gains `"./player"` in `exports` (types plus import) and
  `dist/player/` in `files`.
- `check:pack` gains player checks, and it stays free of any bundler:
  - From the install directory, Node resolves `marey-lang/player` through the
    package's `exports` map (`import.meta.resolve`) to
    `dist/player/marey-player.mjs`. Node does not import the module, which
    calls `customElements.define`.
  - The installed `dist/player/` is served by a small static server inside
    the script. The Chromium that check:pack already launches for
    `marey export` opens a page that loads the entry chunk with a
    `<script type="module">`. It waits for a `<marey-player>` with an inline
    scene to fire `ready` and draw, and the check fails on any page error.
    This is the CDN path of §1, run against the tarball's own bytes.
  - The entry chunk's text holds no PixiJS (§4.3).
  - A **new** assertion on the tarball's file count. Today `check:pack` only
    prints `entryCount`, and the 57 of the 0.5.1 publish lives only in the
    evidence files. The expected number is a constant in the script, with a
    comment saying it must change whenever `files` or the build's outputs
    do.
- The main library entry (`marey-lang`) keeps its boundary:
  `src/package/boundary.test.ts` still holds, and nothing in the player is
  reachable from `compile()`.

### 4.2 One mounting path, two hosts

The playground's `pixiRendererAdapter` (`src/compiler/renderer/adapter.ts`)
owns a single shared PixiJS `Application`. That is right for the playground,
which shows one scene, and wrong for a page with ten embeds.

The scene-mounting body of `render()` is extracted into a function that takes
an `Application` it does not own: the background, the bounds mask, the fit
layout, the `PlaybackHost`, the `Playback` and the ticker hookup. The
playground adapter calls it with its shared application, and the player calls
it with one application per element. There is one copy of the code that turns
an IR into a playing stage, so the player cannot drift from the playground.
Teardown is the caller's job: the playground keeps its application alive,
and the player destroys its own.

The extraction must leave the playground's behaviour unchanged.
`sceneFrameHashes.test.ts` and the playback tests must pass unmodified, and
the visual check in §6 covers the playground as well as the player.

### 4.3 Loading in two stages

`marey-player.mjs` defines the element and contains the compiler. It does
**not** statically import PixiJS or Matter.js. The renderer, everything behind
the extracted mounting function, is a dynamic `import()` made the first time
an element needs to draw. A page with a player below the fold pays for the
compiler and the element up front, and for the renderer only when it scrolls
there. Compiling on the main thread is acceptable here: `compile()` is pure
and synchronous, and roadmap §14's scenes compile in milliseconds. The
playground's Web Worker exists to keep an editor responsive while typing, and
an embed has no editor.

The scene text face, JetBrains Mono, ships as an asset of the player build.
It is loaded with the `FontFace` API from a URL resolved against
`import.meta.url`, so it works from a CDN and from a bundler. The page's own
`@font-face` rules are not touched. Only a scene that contains `text` loads
the font, and it waits for it with no timeout race. A failed load is
`PLAYER_FONT_UNAVAILABLE` (P9). A fallback face cannot be used, because text
width sizes physics bodies and group bounds (`builder.ts`). A different face
is a different simulation and a different frame hash.

### 4.4 The WebGL context budget

Browsers cap live WebGL contexts per page (Chromium's cap is 16) and drop the
oldest without warning when a page goes over. A gallery of twenty embeds
would therefore lose canvases silently.

The player holds a context only while it is near the viewport:

- An `IntersectionObserver` with a generous root margin (the plan fixes the
  value) tells each element when it is near view.
- On **entering**, the element creates its `Application`, mounts the scene
  and restores its playhead.
- On **leaving**, it records `{ tick, playing }` and destroys the
  `Application`, which releases the context.

Restoring is a replay from tick 0 to the recorded tick, which the
`PlaybackStart` path already does. **Because playback is deterministic, a
restored embed shows the exact frame it left on, physics included.** That is
what makes discarding a context safe. A non-deterministic engine would have
to keep the context or show a different simulation on return. §6 checks the
restore by frame hash.

Indefinite scenes are the exception. Replay cost grows with the tick, and an
indefinite scene left playing could need minutes of replay. An indefinite
scene that leaves view and returns **restarts from tick 0**. This is
documented on the element.

A page with more than 16 players visible at once still exceeds the browser's
cap. That case is documented, not engineered around.

### 4.5 Lifecycle

- `connectedCallback` starts loading. `disconnectedCallback` destroys the
  application and stops the observers. A removed embed leaks no context,
  ticker or listener.
- Each load carries a generation counter. A response from a superseded `src`
  is discarded rather than mounted. This is the rule `useCompile` already
  applies to overlapping compiles: only the latest result is used.
- The ticker runs only while the element is playing and near view. A paused
  embed costs no frames.

### 4.6 The test hook

`element[Symbol.for("marey.player.debug")]` returns an object with one
method:

- `liveFramesHash(ticks: number[]): Promise<string>` pauses the live
  playback and seeks it to each tick in turn, in ascending order. After each
  seek is performed, it reads `snapshotFor` of the **tree on screen**. It
  returns `hashFrames` over those snapshots, indexed the way `sampleFrames`
  indexes its frames.

Because it reads the live tree after real seeks, it measures what the reader
sees. It does not rebuild a reference. The harness asks it for the ticks
`marey export --fps F` samples, and compares the result with the `frames`
hash the CLI prints. The plan takes the exact tick list and index scheme from
`frameSampler.ts`, so the two sequences hash the same JSON when the frames
agree.

The hook is symbol-keyed and undocumented in the README. It is outside the
semver promise, and it is the only thing the element exposes for testing.

## 5. Out of scope

- Editing in the embed. The playground link covers it.
- React, Vue or Svelte wrapper packages (P3).
- Server-side rendering. The element renders nothing until it connects in a
  browser. Static HTML around it is unaffected.
- Interactivity: pointer input, state machines and runtime inputs. That is
  Rive's territory, and nothing in the language expresses it.
- An `<iframe>` embed. A custom element is lighter and styles with the page.
- Poster images for no-JavaScript readers. A page that needs one uses the
  exported APNG.

## 6. Exit criteria

1. **Package:** from an installed tarball, `marey-lang/player` resolves
   through `exports`, and the installed entry chunk, loaded in Chromium by
   `<script type="module">`, defines `<marey-player>` and draws an inline
   scene. `check:pack` asserts both, asserts that the entry chunk holds no
   PixiJS, and asserts the file count (§4.1).
2. **Agreement with export:** in the browser harness, against the built
   bundle, `liveFramesHash` over the ticks `marey export --fps 30` samples
   equals the `frames` hash `marey export --format lottie --fps 30` prints.
   This holds for three bounded scenes: one with physics, a staggered reveal,
   and one with `text`. The text scene also exercises the font path.
3. **Context budget:** a harness page with 24 players reaches the bottom by
   scrolling. Every player that is in view at the end draws, so no canvas is
   blank. After a scroll down and back up, the first player's frame hash
   matches the hash it had when it left view.
4. **Reduced motion:** with `prefers-reduced-motion: reduce` emulated, an
   `autoplay` embed of a bounded scene shows its last tick and is paused.
5. **Errors:** a scene with a type error shows a diagnostic box holding the
   compiler's code and line, and fires `error` with
   `PLAYER_COMPILE_FAILED`. A 404 `src` fires `PLAYER_FETCH_FAILED`. A text
   scene whose font request is blocked by the harness fires
   `PLAYER_FONT_UNAVAILABLE`.
6. **`currentTime`:** on a playing embed, a set keeps it playing, and the
   getter returns the clamped value straight after the set.
   `currentTime = 0` shows tick 0.
7. **No playground regression:** the full suite, the eval suite, the build and
   the scene check all pass. The playground's own visual check, which plays,
   seeks and reloads the default scene, still passes after the adapter
   extraction.
8. **Size, measured and recorded:** the entry chunk and the lazy renderer
   chunk, raw and gzipped, go in `eval/RESULTS-PHASE-9A.md`. There is no
   budget to pass. The number is reported honestly, as §2 promises.
9. **Documentation:** the README gains an "Embed a scene" section covering
   the §1 snippets, the attributes, the reduced-motion behaviour and the
   16-context note, plus one sentence on frameworks: a custom element works
   as-is, and Vue-based tools such as VitePress need the tag declared as a
   custom element. No framework claim is made that this phase has not run.

## 7. What 9B and 9C will cover (recorded, not designed here)

- **9B — GitHub Action and Gate C.** A composite `action.yml` at the
  repository root runs `marey check` on changed `.marey` files, reports each
  diagnostic as a GitHub annotation on its line, and exports the formats the
  workflow asks for. A starter fixture in this repository and a workflow that
  uses the action against it test roadmap §11.3's old Gate C: edit a scene,
  get a CI result, embed the artifact with no Marey runtime. Publishing a
  separate template repository is outward-facing and is the owner's call.
- **9C — Documentation site and gallery**, modelled on the Matter.js site:
  getting started, guides, and a gallery of the canonical scenes, each a live
  `<marey-player>` with a playground link. Where it lives relative to the
  playground at `/` is that spec's first decision. `marey.netlify.app` must
  keep resolving whatever it decides.
