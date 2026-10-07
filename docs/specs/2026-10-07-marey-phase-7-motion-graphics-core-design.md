# Marey Phase 7 — Motion-Graphics Core

**Date:** 2026-10-07
**Status:** Design. The owner approved the approach and the three design
sections in conversation on 2026-10-07, and chose each decision recorded in
§7 (D1–D4). They asked for this spec, its plan and their execution without a
separate review stop.
**Parent:** `2026-09-09-marey-engineering-roadmap-design.md`, §10. Runs on
the `phase-7` branch.

**Preserves:**
- Every scene that does not animate colour: its drawn pixels, its PNG, APNG
  and video exports, and its Lottie document, byte for byte.
- Renderer invariants 1–3 (`docs/architecture/renderer.md`).
- `handoff`'s six compile rules. `TYPE_HANDOFF_PROP` already limits
  `handoff: true` to `property: position`, so a colour animation cannot
  hand off.

**Replaces:**
- "Colour animation is not supported" (`docs/LANGUAGE.md`, three passages)
  with a working `property: color` (§2).
- "The preview plays on regardless of whether [`duration`] is set"
  (`docs/LANGUAGE.md`, the `scene` section) with playback that stops at the
  declared length (§3.3).
- Restart-from-zero on every recompile with a playhead that survives an edit
  (§3.5).

**Drops:** `stagger`, from roadmap §10 (§1, D1).

---

## 1. Scope

Roadmap §10 lists four items. This phase delivers three of them:

1. **Colour animation.** It was half-built across three layers:
   `IRAnimation.to` admits `IRColor`, but `PROP_TYPES` and the validator
   reject colour, and `applyAnim` has no colour branch. Frame snapshots also
   carry no colour, so even a working live preview would export the starting
   colour on every frame.
2. **Replay-to-frame scrubbing.** The playground has no transport controls
   at all today.
3. **The current frame survives a live recompile.** Today `useCompile`
   destroys the scene and the new one starts at tick 0.

**`stagger` is dropped (D1).** Phase 3C's `delay` already writes a linear
stagger in one line, `delay: i * 0.14` inside a `generate`.
`docs/LANGUAGE.md` ships exactly that example, and roadmap §5.2's first exit
criterion ("a staggered reveal across generated objects needs no no-op
sequence step") closed on it. A keyword would be a second spelling of the
same thing. What `delay` cannot express is a non-linear distribution, such
as centre-out or a stagger fitted to a total time, because the expression
layer has no `abs`, `min` or `max`. That is recorded as further capability
(§6), not as a gap in finish-line item 5, which names "staggered reveal" and
is met.

Each feature is validated through the real export pipeline, not only in the
playground (roadmap §10).

---

## 2. Colour animation

### 2.1 Language

- `color` becomes the fifth entry in `ANIMATABLE_PROPERTIES`
  (`languageContract.ts`).
- `animate`'s `to` accepts a colour: a hex literal, one of the nine named
  colours, or a `let` binding that evaluates to one. The contract's `to`
  kinds become `["number", "point", "color"]`.
- `TYPE_ANIM_MISMATCH` gains the colour rows. `property: color` with a
  non-colour `to` is an error: "Property 'color' expects a colour for 'to'
  (e.g., to: #ff8800)." Every existing property with a colour `to` already
  fails its own kind check.
- `easing`, `delay`, `loop`, `yoyo`, `sequence` and `parallel` all apply
  unchanged.
- **A colour animation needs an object that has a colour.** `group` has no
  `color` property, so `animate { property: color }` whose owner is a group,
  or a `use` instance (which expands to a group), is a new compile error:
  `[TYPE_ANIM_COLOR_TARGET] 'property: color' can only animate a shape with
  a 'color' (circle, rectangle, polygon, line or text); '<name>' is a
  group.` The owner is the renderable the block belongs to, found the same
  way the zero-scale rule finds it, through `ownerIndex(ancestors)`, because
  a `sequence` or `parallel` may sit between them.
- Wording that lists the animatable properties picks up `color` from the
  contract: the `TYPE_ANIM_PROP` message and the `animProperty` kind label.
  The kind label is a hand-written string today. It becomes derived from
  `ANIMATABLE_PROPERTIES` (engineering-lessons §5).

### 2.2 The value and how it moves

- A colour's runtime value is a **24-bit integer, `0xRRGGBB`**. `IRColor`
  stays a hex string in the IR. The builder converts it once.
- Interpolation is per channel in sRGB, at the eased progress `e`:
  `c = Math.round(c0 + (c1 - c0) * e)` for each of R, G and B. Rounding
  happens where the value is written, so every consumer reads the same
  integer: paint, snapshot, hash, raster and Lottie. A slow fade therefore
  steps in whole 8-bit levels, which is all an 8-bit display could show
  anyway.
- The start value of a colour animation is read from the object's current
  colour, exactly as `getCurrentVal` reads `alpha` today. That covers the
  declared colour, or the colour the previous step of a `sequence` left.

### 2.3 Runtime

- **Colour state** lives on the layout, as `__mareyLayout.currentColor:
  number`, beside `currentPos` and `currentScale` (the container fields are
  declared in `builder.ts`). That gives it the same
  tick/paint treatment as every other animated property: the tick-phase
  completion snap (`tickAnim`), the paint-phase write (`applyAnim`), and the
  `paintedShort` restore at the top of the next tick (invariant 3).
- **How it is drawn.** The builder decides once per shape whether anything
  can ever change its colour: whether any `animate` with `property: color`
  belongs to it, directly or inside its `sequence` or `parallel` steps.
  - A shape that never changes colour is drawn **exactly as today**, with
    its colour in the fill or stroke.
  - A shape that does is drawn in white (`0xffffff`), and its colour is
    applied as the `tint` of its own drawing: the `Graphics` or `Text`
    child, never the wrapper container. That keeps the tint from reaching
    anything nested.
  - A new `__applyColor()` hook on the container writes `currentColor` to
    that tint. It is the colour counterpart of `__updateLayout()`.
- **Why tint rather than redraw:** a `Text` whose fill changes
  re-rasterises its texture. A tint is a uniform, so changing it costs
  nothing per frame.
- **Why only colour-animated shapes are switched:** canvas text stores
  antialiased edge pixels premultiplied at 8 bits. White glyphs tinted can
  therefore differ by ±1 from glyphs filled with the colour directly.
  Switching only the shapes that animate colour keeps every other scene
  pixel-identical by construction, not by measurement alone (§4,
  criterion 2).
- Colour never reaches the physics world. It is display-only, like `alpha`.

### 2.4 Export

- **Snapshot.** `ObjectSnapshot` gains `color: number | null`: the shape's
  `currentColor`, or `null` for a group. `snapshotFor` reads it, and
  `applySnapshot` writes it and calls `__applyColor()`. PNG, APNG and video
  are all rasterised through `applySnapshot` (`frameRaster.ts`), so all
  three get colour from this one change.
- **Hashes.** The new field changes every scene's frame hash once. No test
  pins a hash literal today; comparisons are relative. Any recorded hash in
  `eval/RESULTS-*.md` predates the field, and `RESULTS-PHASE-7.md` says so.
- **Lottie.** A layer's fill (`fl.c`) or stroke (`st.c`) colour becomes a
  track over the sampled frames, built by the same `track()` that
  transforms use:
  - If the colour is the same on every frame, it encodes static, as
    `{ a: 0, k: [r, g, b] }`. That is **byte-identical** to today's
    document for every scene that does not animate colour, with values from
    the same `hexToRgb01` arithmetic.
  - Otherwise it gets one baked keyframe per frame.

  A third-party player then needs no colour interpolation of its own.

### 2.5 Where the code changes

| File | Change |
|---|---|
| `languageContract.ts` | `color` in `ANIMATABLE_PROPERTIES`; `to` admits `color`; derived `animProperty` label |
| `typeChecker/validator.ts` | colour mismatch row; `TYPE_ANIM_COLOR_TARGET` |
| `typeChecker/resolvers.ts` | `resolveAnimToValue` returns a colour |
| `renderer/builder.ts` | colour-animated shapes drawn white and tinted; `currentColor`; `__applyColor` |
| `renderer/sceneRuntime.ts` | colour branch in `applyAnim` and `getCurrentVal`; runner values widen to include colour |
| `renderer/frameSampler.ts`, `export/frameRaster.ts` | snapshot field, read and write |
| `export/lottieGeometry.ts`, `export/lottieEncode.ts` | colour track per layer |

---

## 3. Playback: seek, transport, recompile

### 3.1 One seek, by replay

Every jump in time is a **replay from tick 0**. The runtime is rebuilt from
the cached IR, so nothing recompiles, and then advanced N ticks. This is
the path export already takes. A sought frame is therefore an exportable
frame by construction, and the playground and the exporter share one source
of truth.

- **Backward seek** (target below the current tick): destroy the runtime
  and world, rebuild the tree from the IR, then advance `target` ticks.
- **Forward seek:** advance from the current tick. No rebuild.
- **The replay loop is `sampleFrames`' loop.** It runs `advanceOneTick();
  paintExactTick();` once per tick, so a seek reaches exactly the state
  export reaches. Afterwards the frame is painted with `paintExactTick()`
  and rendered once.
- **Pausing also snaps the paint to the exact tick.** A paused frame is
  then always an exportable frame, never a sub-tick interpolation.

**Seeking must equal playing.** A scene played with live, sub-tick paints
and then paused at tick N must hold the same state as one replayed straight
to N. That depends on invariant 3: nothing in the tick phase reads
paint-phase state. `sampleFrames`' own docstring records that this was
never measured for a scene with a `sequence`. This phase measures it
(§4, criterion 3).

**Considered and not taken:**
- **A cache of per-frame snapshots,** so that dragging paints from the
  cache and only releasing the bar replays. It makes dragging faster, but
  it means two display paths and a cache to size and invalidate. It can be
  layered on later behind the same seek contract (§6).
- **Saving and restoring Matter.js state.** Matter has no supported
  serialisation of its full state, so sleep state and contact caches would
  not survive a restore, and determinism would break.

### 3.2 The controller

`pixiRendererAdapter.render()` returns a **`PlaybackController`** as well
as its cleanup function:

```ts
interface PlaybackState {
  readonly tick: number;           // the tick on screen
  readonly playing: boolean;
  readonly endTick: number | null; // secondsToTicks(scene.duration), or null when indefinite
  readonly reachedTick: number;    // the furthest tick played or sought, ever
}

interface PlaybackController {
  play(): void;
  pause(): void;
  seek(tick: number): void;        // clamped to [0, endTick ?? reachedTick]; leaves playback paused
  restart(): void;                 // replay to 0 and play
  subscribe(listener: (s: PlaybackState) => void): () => void;
}
```

- The headless parts are a module in `renderer/`, **`playback.ts`**, which
  `adapter.ts` wraps with the PixiJS ticker. They are mount/rebuild, seek,
  the end-of-scene clamp and the state machine.
- The seek logic is therefore unit-testable in Node, as `sceneRuntime.ts`
  is. `Text` still needs a DOM, as today.

**Drags are coalesced.** `seek` records a target. The ticker callback
performs only the latest target, once per animation frame. A drag across a
physics scene therefore costs at most one replay per displayed frame, never
one per pointer event.

### 3.3 End of scene, and idle

- **A scene with a declared `duration` stops at it (D3).**
  - Playback never advances past `endTick`. The live loop clamps the ticks
    `LiveDriver.pump` hands it to `endTick - tick`.
  - On reaching `endTick` it paints the exact tick and pauses.
  - Pressing play at `endTick` restarts from 0.
  - The ticker no longer stops early when `isIdle()` returns true. Time
    keeps running to the end, so the readout and the bar stay truthful
    while nothing moves. Running the ticker costs nothing while idle.
- **A scene with no `duration` plays on, and its bar spans the time played
  so far (D2).**
  - `reachedTick` grows as it plays.
  - When `isIdle()` becomes true, the playhead pauses where it is. This is
    the same moment the ticker stops today.
  - Pressing play continues from there.

`docs/LANGUAGE.md`'s `duration` paragraph is rewritten to match. A
declared `duration` now bounds playback as well as export.

### 3.4 Transport bar

- A strip along the bottom edge of the Preview pane, outside the canvas
  host. Plate geometry and the caption are unchanged; the host box is
  simply that much shorter. It appears only while there is output.
- **Controls, in order:**
  1. One play/pause toggle.
  2. Restart, which seeks to 0 and plays.
  3. A scrub bar: a native `<input type="range">` in ticks, from 0 to
     `endTick ?? reachedTick`, step 1. Being native, it is keyboard-operable
     with no extra code.
  4. A readout: `1.25 / 4.00 s`, or `12.40 s` for an indefinite scene.
- **Dragging:** the scrub bar seeks while dragging and pauses playback.
  Playback stays paused after release. Scrubbing is inspection.
- The bar takes the 6B design tokens (`--font-ui`, `--text-secondary`,
  tabular numerals) and works in both themes.
- **Store:** playback state lives in the store as `playback: PlaybackState
  | null`, written by the controller's subscription. Only the transport
  reads it every frame.

### 3.5 Live recompile

- `useCompile` remembers the last `{ tick, playing }`. A successful compile
  mounts the new scene, seeks to that tick (clamped to the new `endTick`),
  and resumes or stays paused as before.
  - A paused scene therefore shows the edit at the very frame being
    inspected.
  - A playing scene carries on from where it was.
- **A failed compile keeps today's behaviour:** the preview blanks. The
  remembered playhead is kept and applied at the next successful compile.
- **When the playhead resets to 0:** when the source is replaced wholesale.
  The store's existing `fileId` counter already increments on exactly those
  events, `newFile` and `loadExample`, and a change of `fileId` resets the
  remembered playhead. A share link is read only at startup, when the
  playhead is 0 anyway. Only edits made in the editor preserve the
  playhead.

### 3.6 Cost, measured

A throwaway probe replayed the shipped examples headless in Node, from
tick 0, with no paint between ticks. It ran on 2026-10-07 on the
development machine. The scripts and output stayed local.

| Scene | Objects | Build | 600 ticks (5 s) | 1,200 ticks (10 s) | 3,600 ticks (30 s) |
|---|---|---|---|---|---|
| `physics-pile` | 28 | 2–12 ms | 96 ms | 94 ms | 50 ms |
| `dusk-hills` | 17 | 2–5 ms | 11 ms | 14 ms | 22 ms |
| `yellow-flowers` | 116 | 12–23 ms | 3 ms | 9 ms | 21 ms |

`bar-chart-reveal` did not run, because `Text` needs a DOM.
- **Reading the numbers:** the first run includes JIT warm-up, and
  `physics-pile`'s bodies sleep, which is why 30 s cost less than 10 s.
- **What they show:** a backward seek costs at most about 0.1 s on the
  heaviest shipped scene, and 25 ms or less on the rest.
- **Known limit:** an indefinite physics scene played for minutes would
  take proportionally longer to rewind. That is recorded as a limit, not
  solved (§6).
- The implementation's seek test repeats this measurement in the browser,
  including paint and rebuild, and records it in `RESULTS-PHASE-7.md`.

### 3.7 Seams for checking

There is a dev-only `window.__mareyPlayback`, installed behind
`import.meta.env.DEV` as `src/lib/devPlaybackSeam.ts`, beside the existing
`devExportSeam.ts`. It exposes:
- the controller;
- `snapshotHash()`, which is `hashFrames` over the live tree's current
  `snapshotFor`;
- `referenceHash(tick)`, which builds a fresh runtime from the same IR in
  the same page, replays `tick` ticks with the sampler's loop, and hashes
  that snapshot.

Comparing two hashes produced in the same page avoids the cross-engine
`Math.sin` caveat in `frameHash.ts`.

---

## 4. Checks

Each criterion is measured, not asserted. Evidence goes in
`eval/RESULTS-PHASE-7.md`.

1. **Colour matches across every output.** A fixture,
   `tools/visual-check/scenes/color-sequence.marey`, has:
   - a rectangle whose colour runs through a two-step `sequence` (red to
     blue, then blue to `#00ff80`, `easeInOut`);
   - a looping `yoyo` colour animation on a circle;
   - a `text` whose colour changes;
   - a `line` whose stroke colour changes.

   Its `duration` is a whole number of frames at 30 fps. The checks:
   - **PNG:** for each shape, the pixel at its centre is sampled on at
     least four frames. Each sample is compared with the colour §2.2's
     formula gives at that frame's tick, computed independently in the
     check script, not read back from the runtime. A text glyph has no
     reliable centre pixel, so text is checked by Lottie against PNG only,
     and the report says so.
   - **APNG:** every frame decodes with 0 differing bytes from the canvas
     it was muxed from (`apng-check.mjs`).
   - **Video:** passes the existing quality gate (`quality-check.mjs`)
     against the PNG frames.
   - **Lottie:** rendered in lottie-web with no Marey code present
     (`lottie-check.mjs --compare-png --at …`). The centre pixel of each
     non-text shape must be within ±2 per channel of the PNG export's
     pixel at the same frame. The diff images must show mismatches only at
     shape edges, never inside a flat colour region; the reading follows
     `eval/RESULTS-PHASE-5A.md`.
   - **Live preview:** paused at the same ticks, the preview's
     `snapshotHash()` equals `referenceHash(tick)`.
2. **Static colours are unchanged.** For each of the four canonical scenes
   and each shipped example, the PNG frames and the Lottie document are
   byte-identical before and after this phase. Byte-identity is checked by
   sha256 of each file. Raw PNG bytes are compared, not decoded pixels.
3. **Seeking equals playing.** Headless, in `playback.test.ts`, for every
   first-party scene that builds without a DOM. That includes
   `physics-pile`, a sequence-bearing scene and a `handoff` scene.
   - The snapshot after seeking forward to T, back to T/3 and forward to T
     again equals the snapshot after a straight replay to T.
   - The snapshot after a live-cadence run to T equals the same. A
     live-cadence run is `advanceOneTick()` in bursts of 1, 7 and 12 with
     `paint(alpha)` at alphas of 0.25, 0.5 and 0.75 between bursts, then a
     pause snap.
   - In the browser, the same equality holds through `__mareyPlayback` on
     the example scenes, `bar-chart-reveal` (text) included.
4. **An edit keeps the playhead.** In the browser:
   - Pause at tick N, change one colour in the editor. The readout still
     shows N, and `snapshotHash()` equals the new scene's
     `referenceHash(N)`.
   - Repeat while playing: the tick after recompile is at least N.
   - Shorten `duration` below N: the playhead clamps to the new `endTick`.
   - Choose a different example: the playhead is 0.
5. **Playback stops at `duration`.** A 2 s scene played from 0 pauses with
   `tick === endTick` (240), and pressing play restarts at 0.
6. **Nothing else regresses.** The four pre-commit checks pass, and so do
   `npm run check:export` and `npm run check:pack`.

---

## 5. Docs

- **`docs/LANGUAGE.md`:**
  - Colour animation is documented under `animate`, with a compiled
    example.
  - The three "not supported" passages are removed or rewritten, and
    "Colours neither animate nor do arithmetic" becomes "Colours do no
    arithmetic".
  - The `scene` `duration` paragraph is rewritten (§3.3).
- **`docs/architecture/renderer.md`:**
  - The "half-built" note is replaced by how colour works (§2.3).
  - A section on playback is added (§3.1–§3.3).
  - The frame-sampler paragraph's open question about sequence-bearing
    scenes is updated with criterion 3's result.
- **`docs/determinism.md`:** a paragraph on seek as replay, and why a
  paused frame is an exportable one.
- **Roadmap spec §10:** a dated amendment recording that `stagger` was
  dropped and why (D1).
- **`docs/architecture/roadmap-and-process.md` and
  `docs/architecture/README.md`:** Phase 7 status. Both locations are
  updated together (engineering-lessons §5b).
- **`README.md`:** no change. It does not list features at this
  granularity.

---

## 6. Out of scope

- Animating `background`, or a group-level tint (D4).
- A `stagger` keyword, and `abs`/`min`/`max` (D1).
- Keyboard shortcuts for the transport beyond the native range input's
  own.
- A snapshot cache for faster scrubbing, or bounding the rewind cost of a
  long indefinite scene (§3.6).
- Colour interpolation in any space other than sRGB, and colours with
  alpha.
- Spring easing and semantic layout (roadmap §13).

---

## 7. Decisions

| # | Decision | Chosen by | Alternatives |
|---|---|---|---|
| D1 | Drop `stagger`; record that 3C's `delay` closed it | Owner, 2026-10-07 | A `stagger` modifier on `generate` with a distribution; add `abs`/`min`/`max` |
| D2 | An indefinite scene's bar spans the time played so far | Owner, 2026-10-07 | No scrubbing without `duration`; a fixed window |
| D3 | Playback stops at a declared `duration` | Owner, 2026-10-07 | Loop at `duration`; play on past it |
| D4 | Only a shape's `color` animates | Owner, 2026-10-07 | Also `background`; also a group tint |
| D5 | Seek is replay from tick 0, with a forward shortcut | Owner approved the approach, 2026-10-07 | Snapshot cache; Matter.js state checkpoints |
| D6 | Only colour-animated shapes are drawn white and tinted | Design, §2.3, after the text-edge measurement argument | Every shape tinted |
| D7 | Colour values are rounded integers wherever they are written | Design, §2.2 | Unrounded floats, quantised only by the tint |
| D8 | The transport bar is a strip at the pane's bottom edge, outside the canvas host | Design, §3.4 | Inside the caption row under the plate, which the plate can fill completely under `fit: contain` |
