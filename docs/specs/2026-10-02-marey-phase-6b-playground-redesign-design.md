# Marey Phase 6B — The Playground Redesign

**Date:** 2026-10-02
**Status:** Design, approved section by section by the owner on 2026-10-02.
**Parent:** `2026-09-27-marey-phase-6-packaging-and-legibility-design.md` §11.
6B runs on the `phase-6` branch, after the parent's Tasks 1–12 and before its
README task (Task 13).

**Preserves:**
- The four panes (top bar, editor, log, preview) and their draggable dividers
  on desktop.
- Every top-bar action that exists today: auto-run, new, share, export (with
  its licences link), the theme toggle and Run.
- How the starting theme is chosen (`getInitialTheme` in `src/store/index.ts`).
- Everything below the preview's host element. The scene renders exactly as it
  does today, and the export page, the CLI and every export byte are
  untouched (parent spec §4.2: the export page shares no UI code).
- What the scene's `fit` property means (`docs/LANGUAGE.md`, "Scene model").

**Replaces:**
- The default scene, `src/store/defaultScene.ts` (the smiling face with
  confetti), with a new default scene, "Dusk over layered hills" (§6).
- The single "example" button with an examples menu of four scenes (§5).
- `public/favicon.svg` and `public/og-image.png` (§7).
- The Syne UI typeface, with Bricolage Grotesque (§8).

---

## 0. Decisions the owner made, 2026-10-01 to 2026-10-02

| # | Question | Decision |
|---|---|---|
| D1 | How far does the redesign go? | A restyle of the playground only: the same panes, a new visual language and a phone layout that works. There is no landing page and no restructuring. |
| D2 | Visual direction | The preview is a surface on which the scene sits as a framed plate, so it is clear where the scene ends and the app begins. Light mode uses **graph paper**. Dark mode uses a **quiet mat**. |
| D3 | The default scene | A scenic view, "Dusk over layered hills", with a smiling sun. Over a continuous, seamless loop, the sun sets, falls asleep and rises again. |
| D4 | The sun's face | It is modelled on the owner's reference image: a flat disc with an amber crescent along the bottom, short flat brows with rounded ends, dot eyes and a small, smooth smile. Its colour is halfway between the reference (`#fdc76a`) and a brighter option (`#ffd451`). |
| D5 | The sun's resting height | The bottom of the mouth sits clear of the ridges, about 36 scene units above the nearest one. |
| D6 | Examples | The "example" button becomes a menu: Dusk over layered hills (the default), Physics pile, Bar chart reveal and Logo reveal. The old smiley is dropped. |
| D7 | Favicon | "Layered chin": the whole face sits above three thin ridges on a dusk tile. |
| D8 | Phones | Scene first, then code, with the log folded into a status line. |
| D9 | Typeface | Bricolage Grotesque for the interface and the wordmark. Code stays in JetBrains Mono. |
| D10 | Handoff smoothness | This is out of scope for 6B. It is its own design, 6C, on `phase-6` after 6B. |

The mockups behind these decisions are kept outside the repository. This spec
is the authority.

---

## 1. Scope

**In:** design tokens for both themes; the preview surface and plate; the top
bar on desktop and phones; the phone layout; the examples, their menu and the
new default scene; the favicon and the link-preview image; the UI typeface;
the editor's colour themes; the checks in §9.

**Out:** see §10.

---

## 2. The visual system

Colours are CSS custom properties, set per theme in `src/styles/global.scss`
as today. Component styles reference only the variables.

| Role | Light: graph paper | Dark: quiet mat |
|---|---|---|
| App and pane background | `#fbfcfa` | `#16171a` |
| Log background | `#f1f3f0` | `#131417` |
| Primary text | `#1d2a44` | `#d9dbe1` |
| Secondary text | `#5a6478` | `#9aa0ab` |
| Hairline borders | `#d9dee4` | `#26282e` |
| Preview surface | `#fbfcfa` with a millimetre grid: `#e6ebf1` lines every 7 px, `#cdd8e4` lines every 35 px | `#1b1c20` with a dot grid: `#2c2e35` dots every 12 px |
| Accent (Run, focus ring, selection) | `#1d2a44` (ink) | `#6b58f0` (violet: a shade darker than today's `#7c6af7`, on which white text measures 3.99:1, below AA; on `#6b58f0` it measures 4.91:1) |
| Accent text on the accent | `#fbfcfa` | `#ffffff` |
| Status: compiled | `#2f7a4a` | `#6fcf97` |
| Status: error | `#b4322a` | `#f87171` |

The grid and dot patterns are CSS backgrounds on the preview surface. They are
never drawn into the canvas.

**Type.** Bricolage Grotesque, at weights 400 and 700, sets the interface. The
wordmark "Marey" uses 700 with tight tracking (−0.02em). JetBrains Mono sets
code and the log. The plate caption is in the interface face, with tabular
figures. Interface labels are sentence
case. The all-caps pane labels ("CODE EDITOR", "OUTPUT", "SCENE PREVIEW") are
removed: the plate caption names the scene, and the editor and log identify
themselves.

**Editor themes.** The Monaco themes in
`src/components/Editor/MonacoEditor/themes.ts` are redrawn so that each
theme's editor background, gutter, selection and token colours sit on that
theme's palette. In light mode keywords are `#2b4fa8` and comments are
`#8a93a6` italic. In dark mode keywords are `#a99bff` and comments are
`#5d626d`. Other token colours are the implementer's choice, held to §9's
contrast rule.

---

## 3. The preview: a surface and a plate

The preview pane becomes a **surface** (the grid or dot pattern), with the
scene laid on it as a **plate**.

**Where the plate sits.** The preview's host element (the element the
renderer draws into) is inset from the pane's edges by a margin: 24 px on
desktop and 12 px on phones. The renderer's existing `fit` logic
(`src/compiler/renderer/adapter.ts`, `updateLayout`) maps the scene into that
inset box, unchanged. The canvas background stays transparent, so the surface
shows wherever the scene is not.

**The frame.** The plate's frame is drawn by the UI around the scene's
on-screen rectangle, computed with the same formula `updateLayout` uses:
- `contain` (the default) and `none`, when the scene lies inside the box: a
  frame is drawn. In light mode it is a 1 px `#1d2a44` outline with crop marks
  at all four corners: two 9 px strokes per corner, offset 4 px out from it.
  In dark mode it is a 1 px `#2f3138` outline with a soft shadow.
- `cover` and `fill`: the scene fills the box, so no frame is drawn. A
  `none` scene larger than the box is not framed either.

The plate's corners are never rounded, and nothing is drawn over the scene.

**The caption.** Under the plate, aligned to its edges, one line reads the
scene's logical size on the left (`800 × 600`) and its duration on the right
(`12 s`, or `no fixed length` for a scene without `duration`). Both come from
the compiled scene, not from the source text.

**Plumbing.** A successful compile in the browser records the scene's
`width`, `height`, `duration` (or `null`) and `fit` in the app store. The
frame, the caption and the phone layout (§4) read them there. When there is no
successful compile, they show nothing and the existing empty state stays.

**Sharpness.** The renderer keeps `resolution: devicePixelRatio` and
`autoDensity`. Insetting the host must not change the scene's logical size or
its pixel ratio.

---

## 4. The top bar and the phone layout

**Desktop top bar,** left to right:
1. the wordmark;
2. the status dot with its word ("compiled", "error", or idle);
3. on the right: auto-run, **Examples ▾**, New, Share, Export ▾ (with its
   licences link as today), the theme toggle and Run.

**Phones (viewport narrower than 760 px):**
- The top bar keeps the wordmark, the status dot, **Examples ▾**, a **⋯** menu
  and Run. The ⋯ menu holds auto-run, New, Share, Export (with the licences
  link) and the theme toggle.
- The panes stack: the preview first, then the editor, then the log.
  - **Preview.** Its height follows the scene's aspect ratio: the plate fills
    the width minus the margin, plus the caption. It is capped at 60% of the
    viewport height.
  - **Editor.** At least 45% of the viewport height.
  - **Log.** It folds into one status line, for example "compiled, 0 errors" or
    "2 errors". Tapping the line opens the log to at most 40% of the viewport
    height, and tapping it again closes it.
- The dividers are hidden.
- No two top-bar controls may overlap at any width from 320 px to 759 px.

**Menus** (Examples, Export and ⋯) open on click or tap, or on Enter or Space.
- The arrow keys move between items, Escape closes the menu, and focus returns
  to the button that opened it.
- Each menu button reports its open state with `aria-expanded`, and each menu
  uses `role="menu"` with `menuitem` items.
- Focus is always visible.

---

## 5. Examples

**Files.** Each example is a `.marey` file in `src/examples/`, imported by the
app as text:

| File | Title in the menu | One-line description |
|---|---|---|
| `dusk-hills.marey` | Dusk over layered hills | The sun sets, sleeps and rises again, on a 12-second loop. |
| `physics-pile.marey` | Physics pile | Shapes tumble, collide and settle under gravity. |
| `bar-chart-reveal.marey` | Bar chart reveal | A list of numbers grows into bars, one after another. |
| `logo-reveal.marey` | Logo reveal | A logo assembles from its parts in sequence. |

Being `.marey` files, they fall under the repository-wide compile check that
CI runs on `git ls-files '*.marey'`.

`dusk-hills.marey` is the default scene. `src/store/defaultScene.ts` is
deleted. Whatever imports `DEFAULT_CODE` now gets the default from
`src/examples/`. Share links keep working, because they carry their own
source.

**Adapted, not new.** The three non-default examples are adapted from scenes
the repository already has:
- physics pile from `tools/visual-check/scenes/pile.marey`, `tumble.marey` and
  `eval/scenes/collide-stack.marey`;
- bar chart reveal from `tools/visual-check/scenes/bars-reveal.marey`;
- logo reveal from `tools/visual-check/scenes/logo.marey` and
  `eval/scenes-3b/compound-logo.marey`.

The originals are test fixtures and stay as they are. Each example:
- starts with a header comment of at most three lines;
- uses readable names;
- declares `duration`, so it exports as loaded;
- compiles with no errors.

If the physics pile uses `handoff`, it is checked again after 6C.

**The menu.** **Examples ▾** lists the four scenes, with titles and
descriptions, in the table's order.
- Choosing a scene while the editor is empty loads it at once.
- Choosing a scene while the editor holds code uses today's safeguard: the item
  changes to "Replace your code?", a second choice of the same item within 3 s
  loads it, and anything else cancels.
- Loading a scene saves it to local storage and starts a compile, exactly as
  `loadExample` does today.
- The menu replaces the old "example" button.

---

## 6. The default scene: Dusk over layered hills

**Canvas.** `size: (800, 600)`, `duration: 12`. The scene background is
`#2b2d5c`.

**Sky.** It is built from flat bands, because Marey has neither gradients nor
colour animation.
- **The day set**, top to bottom: `#2b2d5c` (80), `#4a3f78` (60), `#7a4f8a`
  (60), `#b8608a` (60), `#e8846f` (60), `#f5b36b` (the rest).
- **The night set** has the same band heights, with a deeper palette the
  implementer chooses and the owner reviews. Night falls by fading the night
  set's alpha.

**Ridges.** There are four polygons whose top edges are sums of `sin()` terms,
paler as they recede. From back to front they are `#6b4a7a`, `#4a3560`,
`#2f2444` and `#1c1630`. They do not move.

**The sun.**
- **Rest position:** centre `(500, 304)`, outer radius R = 115.
- **Disc:** an outer circle `#feb93e`, with an inner circle `#fecd5e` of radius
  0.958 R whose centre is 0.083 R higher. Together they leave an amber crescent
  along the bottom.
- **Features:** every feature is `#232323`. Positions are relative to the
  sun's centre, in units of R, with y pointing down:

  | Feature | Position and size |
  |---|---|
  | Brows | Each brow is a bar 0.135 R long and 0.052 R thick, with rounded ends. Its outer end sits at x ±0.375 R, y −0.521 R, and its inner end at x ±0.24 R, y −0.542 R. |
  | Eyes | Circles of radius 0.094 R, at (±0.281 R, −0.385 R). |
  | Smile | A line 0.052 R thick, through **13 points evenly spaced on a circular arc** from (−0.177 R, −0.167 R) to (+0.177 R, −0.167 R). Its lowest point is (0, −0.099 R), and it has a round dot at each end. The points are computed with `sin()` and `cos()`. |

- **Rounded ends.** Marey lines and bars have flat ends, so every rounded end
  is a circle whose diameter equals the stroke width.

**The arc.** One cycle is 12 s.
- **0–6 s:** the sun sinks until it is completely hidden behind the ridges. On
  the way down its eyes close (scale y toward 0.15), its brows lower and level,
  and its smile softens (scales down). The night set fades in, the stars fade
  in and twinkle, and the birds cross the sky with flapping wings.
- **6–12 s:** every one of those changes plays back, so the cycle ends where
  it began.

**The seamless-loop rule.** This rule makes the end of the cycle meet the
start exactly. Every `animate` block in the scene:
- has `loop: true`;
- has no `delay`;
- has a period, `duration` (doubled when `yoyo: true`), that divides 12 a
  whole number of times.

Marey plays a delay only once, before the first iteration, so a delayed loop
cannot be seamless from frame 0. Phase offsets between stars come from
different periods, not delays. The birds enter and leave off screen, so their
wrap-around is never visible.

**Placement rules.**
- At t = 0, the lowest point of the mouth stroke lies at least 30 scene units
  above the ridge directly beneath it. The target is about 36.
- At t = 6 s, the top of the sun lies below the top edge of the backmost ridge
  across the sun's whole width, so the sun is fully hidden.

**Contents.** The scene contains the sky bands, the ridges, the sun, about 20
stars and three birds.
- `template Sun`, `template Bird` and `template Star` define the repeated
  parts, and `generate` builds the bands, the ridges and the stars.
- Short comments name each section.
- The file aims for about 120 lines, with a header comment of at most two
  lines.

It must export in every format (`png`, `apng`, `webm`, `mp4`, `lottie`)
through `marey export`, as loaded.

---

## 7. The favicon and the link preview

**Favicon.** `public/favicon.svg` is hand-written SVG, the "layered chin"
design on a 64-unit square:
- a `#3f3772` tile with 14-unit corner radius;
- the sun (§6's colours and face) at 54 units across, centred horizontally,
  near the top;
- three thin ridges crossing its lower third: `#6b4a7a`, `#4a3560` and
  `#2a1f3d`, from back to front.

The bottom of the mouth clears the top ridge. The face must stay legible at
16 px.

**Link preview.** `public/og-image.png` is regenerated. The procedure is the
one the header of `tools/share-image/share-image.marey` describes:
- that file is rewritten to compose the dusk scene at 1200 × 630, with the
  wordmark and tagline beside it as today;
- the PNG is one frame of it, with the sun awake.

The header's regeneration instructions are updated to match. The image's
`og:image:alt` text in `index.html` is rewritten to describe the new picture.

---

## 8. The typeface and its licence

**Fonts.** Two files are committed to `public/fonts/`:
`BricolageGrotesque-Regular.ttf` (400) and `BricolageGrotesque-Bold.ttf`
(700). They are the static TTF builds from Google Fonts, version 1.001, as
distributed in the `@expo-google-fonts/bricolage-grotesque` npm package,
version 0.4.1. Their name tables declare SIL OFL 1.1.

TTF is required. The licences generator (`vite-plugins/thirdPartyLicenses.ts`)
reads licence metadata only from `.ttf` and `.otf` files, and it already
supplies the full OFL 1.1 text.

**Syne.** `Syne-Regular.ttf` and `Syne-Bold.ttf` are deleted once nothing
references them. Scene text and the editor use JetBrains Mono, which stays,
so no export changes.

---

## 9. Verification and exit evidence

Every item below is a check that passes or fails. "It looks right" is not
evidence.

1. **The examples compile.** Every `src/examples/*.marey` compiles with zero
   errors, through the repository-wide `marey check` and through a unit test
   that imports the files the way the app does.
2. **The loop is seamless, structurally.** A unit test compiles
   `dusk-hills.marey` and checks every animation in the Scene IR against §6's
   rule: `loop: true`, no delay, and a period that divides 12.
3. **The loop is seamless, sampled.** A unit test samples the scene's
   snapshot at t = 0 and at t = 12 s (tick 1440), and the two snapshots hash
   equal.
4. **Placement.** A unit test reads the IR and asserts both of §6's placement
   rules.
5. **Exports.**
   - `marey export` writes the default scene and the three other examples in
     all five formats, each exiting 0.
   - `npm run check:export` still passes against its recorded baselines. The
     redesign changes no export byte.
6. **Contrast.** A unit test reads both themes' custom properties from
   `src/styles/global.scss` and computes WCAG contrast. Primary and secondary
   text on their backgrounds, the status colours on the bar background, and
   accent text on the accent must all reach 4.5:1. Hairlines and grid lines
   are exempt.
7. **Layout, measured in a browser.** A committed Playwright script,
   `tools/visual-check/playground-check.mjs`, runs against the dev server on
   5199 at 1440 × 900 and 390 × 844, in both themes. It saves the four
   screenshots and a `report.json` to `.visual-check/6b/`. It fails if any of
   these is false:
   - no two top-bar controls' bounding boxes intersect;
   - the plate frame's aspect ratio equals the scene's within 1 px;
   - the caption reads the compiled scene's size and duration;
   - every menu opens with Enter, moves with the arrow keys and closes with
     Escape, returning focus to its button;
   - the page logs no console errors.

   The script also runs at 320 px wide, and checks that top-bar controls do
   not overlap.
8. **The owner's review.** The owner looks at the four screenshots and at the
   default scene playing, and accepts or rejects them. This is the one
   subjective gate, and it comes last.
9. **The repository checks.** The four checks from `AGENTS.md` pass.

---

## 10. Out of scope

- **Handoff smoothness.** This is 6C, its own design on `phase-6` after 6B.
- **The README and its media.** These are parent Task 13, written after 6B so
  that any screenshot shows this design.
- A landing page, a gallery, a docs site, or new language features.
- Any change to the renderer below the host element, the export page, the CLI
  or the exporters.
- Theme-specific scene colours. A scene looks the same in both themes.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Insetting the host changes the scene's pixel size or sharpness | §3 keeps the renderer's resolution settings. §9.7 measures the plate's aspect ratio, and the screenshots are reviewed at a device pixel ratio of 2 or higher. |
| A seamless 12-second loop needs a staggered feel without `delay` | Stars vary their periods (0.5, 0.75, 1 or 1.5 s yoyo, which divide 12), and the birds move on a 6 s linear loop, so it is consistently off screen at the wrap. §9.2 and §9.3 enforce this. |
| Today's palette already fails AA in one place: white on `#7c6af7` measures 3.99:1 | The dark accent moves to `#6b58f0` (4.91:1). Every other pair in §2 was computed before it was written: the lowest is the light secondary text on the log background, at 5.33:1. |
| Monaco's light theme loses contrast on the new palette | §2 fixes the keyword and comment colours, and §9.6's contrast check covers the UI tokens. Editor token colours are reviewed in the screenshots. |
| The `fit` modes look inconsistent: some framed, some not | §3 frames only the modes where the scene is a bounded rectangle inside the surface. `cover` and `fill` mean "fill the area", so a frame would be wrong for them. |
| The new font breaks the licences page | TTF files, which the generator already reads (§8). The production build fails on any font it cannot license, so a mistake cannot ship silently. |
