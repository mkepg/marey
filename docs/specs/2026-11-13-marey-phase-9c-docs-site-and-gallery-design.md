# Phase 9C — Documentation site and gallery

**Date:** 2026-11-13
**Status:** Approved design. The owner asked for 9C on 2026-11-13 with three
requirements in their own words: "don't under design it", "make sure it is
learnable and navigatable", and "quality learning that is also filled with
quality examples like the lighthouse … fitted based on the lesson". Every
other call was delegated. The calls below are recorded as decisions, not as
owner rulings.
**Roadmap:** `2026-09-09-marey-engineering-roadmap-design.md` §13 (past the
finish line), and the Phase 9A spec's §7, which recorded 9C as "getting
started, guides, and a gallery of the canonical scenes, each a live
`<marey-player>` with a playground link", modelled on the Matter.js site. The
9A spec named this document's first decision: where the site lives relative to
the playground at `/`.

---

## 0. Intent

Today a newcomer meets Marey through the README and a formal reference that
says of itself "It is not a tutorial". The playground has five examples and no
explanation of them. Nothing teaches the language in order.

9C builds the site that does: **a course that takes someone from their first
circle to physics choreography, one concept at a time, where every example
runs on the page and can be edited in place; a gallery of finished scenes worth
studying; task guides; and the reference, rendered and searchable.**

### Success looks like

- Someone who has never seen Marey can finish lesson 1 in ten minutes and
  lesson 14 with every concept in the language behind them, without leaving
  the site.
- Every code sample on the site runs, because the build refuses to ship one
  that does not compile, and every error sample shows the compiler's real
  message, because the build generates it.
- From any page, any other page is at most two clicks away, or one search.
- Each lesson's showcase scene would be worth putting in the gallery on its
  own, and is.

### Non-goals

- A new editor. Lessons use a light in-page editor. The playground stays the
  full IDE.
- Server features: accounts, saved scenes, comments, analytics. The site is
  static files.
- Rewriting `docs/LANGUAGE.md`. It stays the formal reference and is rendered
  as it is (§5.5).
- Framework integration pages (MDX, Docusaurus, VitePress). The roadmap
  amendment of 2026-10-30 dropped them; the embed guide covers custom elements
  in general.

### Anti-goals: things that would make this a failure even if it works

- **A sample that does not run.** A tutorial whose third example is broken
  teaches the reader to distrust every later one.
- **Examples that teach the syntax and nothing else.** Abstract `circle a` and
  `rectangle b` throughout, with no reason to care. Each lesson's examples
  build toward a scene worth having made.
- **A showcase that uses things the lesson has not taught.** It reads as magic
  rather than as the lesson's payoff. A showcase may use earlier lessons and
  its own lesson, nothing later. §6.3 enforces it with a test.
- **Navigation that only works from the home page.** Every page carries the
  whole map.
- **A second, drifting copy of the reference.** The site renders the
  repository's documents and the compiler's own contract. It never restates
  them by hand.

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| C1 | **The playground stays at `/`.** The site lives beside it on the same Cloudflare Pages project: `/learn/`, `/guides/`, `/gallery/` and `/reference/`. | Share links are fragments on `/` (`share-links.md`), and the owner's résumé reaches the playground through `marey.netlify.app`, which forwards each path to the same path here (`docs/architecture/README.md`, "Hosting"). Moving the playground would need a forwarding rule for every old link, and a redirect file is ruled out on this project. One project, one deploy and one build keep the site's player and compiler the same commit as the playground's. |
| C2 | **The site is static HTML generated at build time by this repository's own small generator**, run inside the existing `vite build` through a Vite plugin. Pages are virtual HTML entries, and in development the plugin serves the same pages from middleware. Content is Markdown with front matter, parsed with `marked` (a pinned dev dependency, not shipped). | Measured on 2026-11-13: virtual HTML entries build correctly with this repository's Vite 8 beta. VitePress and Astro each bring their own Vite major, which the root `overrides` would force onto Vite 8. The generator can import the compiler directly, which is what makes C3, C4 and C9 possible. A static page is readable before any script runs, and search engines can index it. |
| C3 | **The build compiles every sample.** A `marey` fence must compile with no errors. A `marey error=CODE` fence must fail with that code (a diagnostic whose message starts `[CODE]`), and a bare `marey error` fence, for the diagnostics that carry no code, must fail at all. Either way its rendered page shows the compiler's real messages, generated at build time. A `marey fragment` fence is highlighted only, and may not contain a `scene` block. Anything else fails the build and the test suite. | The first anti-goal. The same rule already guards `docs/LANGUAGE.md` and the README (`languageDocs.test.ts`); the site inherits it and extends it to error samples. |
| C4 | **Marey code is highlighted by Marey's own lexer**, at build time for static code and in the browser for the editor. The same function serves both. | The highlighter cannot drift from the language, because it is the language's tokenizer. A grammar file for a third-party highlighter would be a hand-synced list (engineering lessons §5). |
| C5 | **Lesson samples are live and editable in place.** Each runnable sample renders as a `<marey-player>` above a code editor. Editing the code re-runs the scene, and errors appear with their line numbers. The editor is a plain `textarea` under a highlighted layer, not Monaco. **The site compiles the edited text itself** (`compileSource`, which the player bundle already contains), and hands the player only source that compiled, as a `blob:` URL set on `src`. The player has no source setter, and C18 rules out adding one. | It is the shortest loop between reading and trying, and it is what makes the course learnable rather than readable. Monaco is about 900 kB gzipped (Hosting section) and would load once per sample. The playground stays one click away for anything bigger. |
| C6 | **The site uses this repository's player, built from source**, not the CDN copy. | The site then always plays the language as it is on `main`. A CDN pin would teach last release's language. |
| C7 | **Reference examples run on request**: highlighted code with a Run button that mounts a player under it. | `LANGUAGE.md` has 21 runnable examples on one page. Running all of them on load is wasted work, and the reference is read for its prose. |
| C8 | **The reference is rendered from the repository's documents, not copied**: `docs/LANGUAGE.md` becomes `/reference/language/` and `docs/determinism.md` becomes `/reference/determinism/`. Relative links to other repository files are rewritten to the file on GitHub. Both documents then fall under C3's fence rule, so `determinism.md`'s untagged fences get tagged `text`. Two passages in `LANGUAGE.md` become false when the site ships, and they are updated: the introduction's "a full tutorial and gallery site sits past the finish line" now points to the course, and "Not covered here"'s "a later phase generates that table" now points to `/reference/properties/`. Nothing else in either document changes. | One source. The documents stay correct on GitHub and on the site at once. |
| C9 | **A property reference generated from `LANGUAGE_CONTRACT`**: one table per object kind, listing every property with its kind, required or default value, constraint, and whether it can be animated. "Can be animated" is derived from `ANIMATABLE_PROPERTIES` by name, and `color` is not animatable on a `group` (`TYPE_ANIM_COLOR_TARGET`). The contract has no per-property flag for it. | `LANGUAGE.md`'s "Not covered here" section promises exactly this table "directly from the compiler's single property contract". The site is where it lands. A property added to the contract appears on the site with no edit. |
| C10 | **Fourteen lessons, ordered so each uses only what came before** (§4). Each has a showcase scene, two to six live samples, and two or three exercises with hidden solutions. | One concept at a time is what makes a course work. The order was chosen so that no showcase needs a later lesson. |
| C11 | **Every showcase is a gallery entry**, and the gallery adds the five playground examples, the Lighthouse scene, and three new showpieces: 22 entries in all (§5.3). | A lesson's payoff is then also a finished piece to study. The gallery gets new work, not only reused scenes. |
| C12 | **Lighthouse joins the repository** as a gallery scene. The local `demo/` folder and its separate Cloudflare project stay as they are and untracked. | The owner held it up as the quality bar. A scene that exists only on one machine cannot be in a gallery built from the repository. |
| C13 | **Search is client-side** over an index generated at build time: page titles, headings and section text, loaded the first time search opens. | A static site has no server to query, and the corpus is a few hundred kilobytes. |
| C14 | **Lesson progress is kept in the reader's browser** (`localStorage`, wrapped in try/catch, so a blocked store changes nothing else). The sidebar marks finished lessons. | It costs almost nothing and shows a learner where they are. Nothing about it needs a server. |
| C15 | **The site adds a real `404.html`.** | Cloudflare Pages serves the root page for any unknown path while no `404.html` exists, so today `/learn/typo` would open the playground. With the site present, a mistyped docs URL should say so and offer the map. |
| C16 | **`public/sitemap.xml` is replaced by one the build generates** from the page list. | A hand-written sitemap is another hand-synced list. |
| C17 | **The playground's top bar gains Learn and Gallery links.** The README gains a link to `/learn/` beside "Try it in the browser". | Discovery: a reader in either place finds the other. |
| C18 | **No package change.** The site ships with the deploy, not in `marey-lang`. The player gets no new attribute or setter. A card's still frame is the player's own poster frame (a bounded scene that is not playing shows its last tick, 9A spec §3.4), or the entry's `poster` time set through the existing `currentTime` setter. | Nothing in the npm package changes. |
| C19 | **The site is a standing part of the build.** A broken internal link, a missing anchor, a sample that fails, a gallery entry without its scene, or a page missing from the navigation fails `npm run build`, and so fails CI and the Cloudflare deploy. | A docs site that can rot will. |
| C20 | **At most 12 players are connected on any page.** A site-side pool creates a card's or sample's `<marey-player>` only when it comes within 400 px of the viewport and a slot is free, and removes the element (which releases its WebGL context) once it is more than 1200 px away. Overflow waits in order of distance from the viewport. | Chromium drops the oldest context without warning past 16 live ones (9A spec §4.4). A gallery of 22 entries on a tall screen would pass that, and the player documents the case rather than engineering around it. The site is the caller that knows how many players it puts on a page, so it holds the budget. |
| C21 | **The player's scene font is served where the player looks for it.** `src/player/render.ts` resolves the font as `./fonts/JetBrainsMono-Regular.ttf` relative to its own chunk. The plugin emits the font at `assets/fonts/JetBrainsMono-Regular.ttf` in the build, and in development it serves it at `/src/player/fonts/JetBrainsMono-Regular.ttf`. | Without this, any scene with `text` fails with `PLAYER_FONT_UNAVAILABLE` on the site, because the request falls through to an HTML page. The browser check loads a text scene to prove it. |
| C22 | **9C is built after the fitted-keyframes Lottie work** (`2026-11-13-marey-lottie-fitted-keyframes-design.md`) is merged, so the Lottie guide describes the encoder that ships. | The guide states only what that work measured. |
| C23 | **The site documents `main`**, which is version 0.7.0, including `--reporter github`, the Action and fitted Lottie keyframes. The owner publishes 0.7.0 after this work merges. | The site deploys from `main`. Documenting the last published version would teach a language one release behind the playground beside it. |

## 2. Map of the site

```text
/                          playground (unchanged, plus Learn and Gallery links)
/learn/                    the course: what you will learn, all 14 lessons
/learn/<slug>/             one lesson
/guides/                   guide index
/guides/<slug>/            one guide
/gallery/                  every scene, as cards
/gallery/<id>/             one scene: large player, notes, full source
/reference/                reference index
/reference/language/       docs/LANGUAGE.md
/reference/properties/     generated from LANGUAGE_CONTRACT
/reference/determinism/    docs/determinism.md
/404.html
/sitemap.xml               generated
/search-index.json         generated
```

Slugs carry no lesson number (`/learn/animate/`, not `/learn/03-animate/`), so
reordering lessons breaks no link.

`/learn/` is the site's front door. Its hero is a large Lighthouse player and a
"Start with lesson 1" button. Below that comes the course as a list of lesson
cards, each with its number, title, one-line summary and a poster frame of its
showcase. Then three cards point to Guides, Gallery and Reference.

## 3. Page anatomy and navigation

### 3.1 Every page

- **Top bar**: the Marey wordmark (to `/learn/`), then Learn, Guides,
  Gallery, Reference, and Playground (`/`). On the right: a search field (with
  `/` and Ctrl/⌘ K shortcuts), a theme toggle, and a GitHub link. Below
  860 px, the section links move into a menu button.
- **Left sidebar** on lesson, guide and reference pages: every page in that
  section, the current one marked, and lessons numbered with a tick for those
  finished. Below 1100 px it becomes a drawer, opened from a button at the top
  of the content.
- **Right "On this page" list** of the page's `##` and `###` headings, tracking
  the reader's scroll, at 1280 px and wider. On narrower screens it is a
  collapsible list under the title.
- **Every heading has an anchor link.**
- **Previous and next links** at the foot of every lesson and guide, following
  the section's order. The last lesson's "next" points to the gallery.
- **The footer** links the GitHub repository, the npm package, the licence and
  `third-party-licenses.txt`.
- **A skip link** to the main content, landmarks (`header`, `nav`, `main`,
  `aside`, `footer`), and a visible focus ring on everything focusable.
- **Head metadata**: a unique `<title>` ("Animate · Learn Marey"), a meta
  description from front matter, a canonical URL, and Open Graph tags reusing
  `og-image.png`.

### 3.2 A lesson page

In order:

1. Breadcrumb ("Learn / Lesson 3"), the title, the summary, and a line with
   the lesson's estimated reading time.
2. **"You'll learn"**: three to five bullets from front matter.
3. **The showcase**: a player with controls, autoplaying and looping, plus
   "Show the source" (collapsed highlighted source) and "Open in playground".
   The caption says "By the end of this lesson you can read every line of
   this."
4. The body: sections that each introduce one idea in prose, then a live
   sample, then what to notice in it. Samples grow from minimal to combined.
5. **"Try this"**: two or three exercises. Each states a goal ("Make the sun
   set instead of rise"), gives a live starter sample, and keeps a solution
   hidden behind "Show a solution", which reveals a live solution sample.
6. **"Recap"**: one bullet per idea, each linking to the reference section
   that states it formally.
7. A "Mark this lesson finished" button, which sets C14's tick and is shown
   as finished on a return visit. It is a plain toggle, not a quiz.
8. Previous and next.

### 3.3 A live sample

- A player on top, 16:9 or the scene's own aspect ratio, with controls.
- Under it, the editor: line numbers, Marey highlighting, a 2-space Tab, and
  Shift+Tab to outdent. Escape releases focus, so keyboard users are not
  trapped by Tab.
- A toolbar: **Reset** (back to the sample as written), **Copy**, **Open in
  playground** (a share link to the current text), and a status that reads
  "Runs" or "2 errors".
- Editing re-runs the scene 400 ms after the last keystroke. The site compiles
  the text first (C5). When it has errors, the editor marks the lines and
  lists the messages under it, each as "line 6, col 15: …", clickable to move
  the caret there, and the player is left alone: it keeps showing the last
  version that compiled, dimmed, until the source compiles again. Source that
  compiles goes to the player as a `blob:` URL, and the previous URL is
  revoked.
- On a phone the editor is still editable. The toolbar wraps, and the code
  scrolls sideways inside its own box, never the page.

### 3.4 A gallery page

`/gallery/` is a grid of cards. A card is a player paused on the scene's
poster frame: the player's own (a bounded scene's last tick), or the entry's
`poster` time, set through `currentTime` once the player is ready, when the
last tick is not the best still. Cards are subject to C20's pool. It plays while hovered or focused and pauses when left. A
card also shows its title, a one-line summary and tag chips (`physics`,
`generative`, `text`, `loop`, `lesson`), and the whole card links to the detail
page. Tag chips at the top filter the grid. On touch screens cards show the
poster only, and a tap opens the detail page.

`/gallery/<id>/` holds:

- a large player with controls, autoplay and loop;
- the title and summary;
- "How it's made", a short essay from the entry's Markdown that names the
  techniques and links the lesson that teaches each one;
- the full highlighted source with Copy, and "Open in playground";
- the lesson this scene showcases, if any;
- previous and next in gallery order.

### 3.5 Search

- A dialog with a text field and a result list grouped by section, each result
  showing the page and the heading matched.
- Arrow keys move through results and Enter opens one.
- Matching is case-insensitive on words, ranked by where the match falls:
  title, then heading, then body.
- The index is fetched the first time the dialog opens.
- With JavaScript off the field is not shown; every page is still reachable
  from the navigation.

## 4. The course

Each lesson lists what it teaches, its samples (as briefs), its showcase brief
and its exercises. The prose is the builder's to write, at the quality §7
sets. Scene size is 960x540 unless stated. A showcase that loops does so
without a seam: every period divides the duration, and nothing that changes
the loop's state is delayed.

**1. Your first scene** (`first-scene`). Teaches: the `scene` block, `size`,
`background`, `duration`, the coordinate system (origin top-left, y down),
`circle` (`position`, `radius`, `color`) and `rectangle` (`size`), drawing
order (later shapes draw on top), comments, and a first `animate` on
`position` with `property`, `to` and `duration` only. It is introduced as "the
one block you'll use most", and lesson 3 completes it. Samples: an empty scene; one circle; moving it by editing
`position`; the circle animated across. Showcase **Sunrise**, 6 s: a warm sun
rises from behind a sea horizon into a dawn sky built from three or four
stacked rectangles of graded colour. Its reflection, a shorter pale rectangle
on the water, rises with it. The sea is declared after the sun, so the sun
emerges from behind it. The lesson calls out that later shapes draw on top.
Exercises: make it set; make it rise twice as slowly; move the horizon.

**2. Shapes, colour and placement** (`shapes`). Teaches: `polygon`, `line`,
`text` (`content`, `fontSize`); hex and named colours;
`alpha`; `rotation` in degrees; the pivot rule (position places the centre);
`origin`, including `(0.5, 1)` for standing on a line; and `layer`. Samples:
the five shapes in a row; origin shown with a marker dot; a rotated rectangle
about two different origins; `layer` overriding source order. Showcase **Set
Sail**, 8 s: a travel-poster composition with a striped sky, a low sun with two
translucent halo circles, sea bands, and a sailboat (polygon sails, `line`
mast, polygon hull) drifting gently across with a single `animate`. Two gulls
are drawn as short angled lines, and the title text "SET SAIL" sits in a
rectangle banner. The boat's drift is lesson 1's `animate`, with no `easing`.
Exercises: recolour the poster to night; turn the boat
around by changing polygon points; add a third gull.

**3. Animate** (`animate`). Teaches: `animate` with `property`, `to` and
`duration`; the five animatable properties; the four easings (and that
`easeInOut` is the default); that an animation starts from the current value
(no `from`); and that several `animate` blocks run at the same time. Samples:
position; rotation; scale with a number and with a point; alpha fading out;
two blocks on one shape running together. Showcase **Easing Race**, 4 s: four
lanes labelled `linear`, `easeIn`, `easeOut` and `easeInOut`. Each runner
crosses in the same two seconds and leaves a faint trail of copies at fixed
fractions of the race, which make the curve's shape visible. The copies are
written out by hand, since `generate` comes in lesson 9, and each copy is its
own shape animated to its fraction of the distance. A finish flag
on each lane pops up with a `scale` animation as its runner arrives. Exercises:
give every lane the same easing and predict the result; slow one lane to 3 s;
add a fifth lane that spins as it runs.

**4. Loops, yoyo and delay** (`timing`). Teaches: `loop`, `yoyo`, and the
`duration`-is-one-direction rule; a one-shot yoyo; `delay` and the fact that it
is spent once; a phase offset with equal durations. Samples: a looped spin; a
breathing yoyo pulse; a once-only yoyo; three dots offset by `delay`; the
`duration` gotcha shown with two pulses side by side. Showcase **Metronome**,
6 s, seamless: a wooden metronome body (polygon) whose arm swings −28° to +28°
about its base (`origin: (0.5, 1)`, `rotation`, yoyo, loop) with a weight on
the arm. A row of beat lamps on the base flashes at each extreme, done with
`alpha` loops whose period is the swing's and whose phase comes from `delay`.
A soft shadow pulses in time. Exercises: double the tempo; make the lamps
flash only on the right swing; add a slower second metronome.

**5. Groups and local space** (`groups`). Teaches: `group`; child positions
relative to the parent; a group's pivot at its own (0, 0), and why `origin` is
not allowed on one; transforms composing through nesting; and motion composing
through nested groups (drift, bob and rock, as in Lighthouse's boat). Samples:
a group moved as one; the pivot shown by rotating a group whose children sit
off-centre; two nested groups, each with its own motion. Showcase **Orrery**,
12 s, seamless: a glowing sun at the centre. Three planets orbit on groups
rotating at periods of 12, 6 and 4 s, each planet offset inside its group.
The middle planet carries a moon on a nested group with a 3 s period. Each
planet turns on its own axis, with a stripe that makes the turn visible. The
starfield is scattered small circles. Exercises: reverse one orbit; add a
moon to the outer planet; tilt the whole system by rotating one outer group.

**6. Sequence and parallel** (`sequence`). Teaches: `sequence` steps run in
order; `parallel` inside a sequence; a hold written as an `animate` to the
current value; why `loop` and `yoyo` are errors inside a sequence (shown with a
`marey error=TYPE_SEQ_LOOP` sample); and one sequence per object. Samples: a
two-step move; a step with a parallel move-and-grow; a hold; the error sample.
Showcase **Title Card**, 7 s: a broadcast-style title sequence. Two accent
bars wipe in from zero width (`origin`, `scale`). The title text "MOTION,
WRITTEN" slides up and fades in, then an underline grows under it and a
subtitle follows. Everything holds for two seconds, then exits in reverse
order with staggered fades. Exercises: lengthen the hold; make the bars exit
first; add a second title line that enters after the first.

**7. Colour** (`colour`). Teaches: `property: color`; colour blending (sRGB,
whole 8-bit channels); colour within a sequence; and that a group has no
colour (`marey error=TYPE_ANIM_COLOR_TARGET` sample). Samples: a colour pulse;
a traffic light written as a sequence; the error sample. Showcase **Day to
Night**, 12 s, seamless: a skyline under a sky of graded bands. Each band
blends through day, dusk, night and dawn colours in a sequence of four
3-second steps. The sun sets as the moon rises. Window rectangles in the
buildings warm from dark to lamplight with staggered steps, and stars fade in
and out with the night. Exercises: shorten the night; add a red aircraft light
that blinks only at night; change the dusk palette.

**8. Values: let and expressions** (`values`). Teaches: `let`; arithmetic and
parentheses; lists and indexing; `length`; `if … then … else`; comparisons and
booleans; `sin` and `cos` in degrees; scope; and the rule "data decides values,
structure decides shape". Samples: a palette held in a list; a layout from two
numbers; an `if` choosing a colour; a polygon whose points are computed; a
`marey error=…` sample for an out-of-range index (the builder uses the code
the compiler actually reports). Showcase **Postcard**, 8 s: a mountain-lake
postcard composed entirely from named values. The horizon, three peak heights
and a palette list compute every coordinate. The lake mirrors the peaks with
negated y offsets. `let night = false` switches the palette, the sun or moon,
and the caption text through `if`. Clouds drift gently. Exercises: set `night`
to `true`; raise the horizon by 40 and watch every shape follow; add a fourth
peak.

**9. Repetition: generate** (`generate`). Teaches: `generate` over a list and
over a range; the index variable; nested `generate`; the `_0` naming suffix;
and radial layouts with `sin`/`cos`. Samples: a row of bars from data; a clock
face of twelve ticks; a dot grid from nested generates; a staggered wave from
`delay: i * …`. Showcase **Ripple**, 10 s: a 24x14 grid of small dots on a
dark field. A wave spreads from the centre: each dot's `scale` and `alpha`
pulse with one shared period, and its `delay` grows with its squared distance
from the centre (no `sqrt` exists, and the lesson says why squared distance
still reads as a ripple). Colour comes from a palette list indexed by ring.
Exercises: move the wave's source to a corner; make the grid coarser; turn it
into a diagonal wave.

**10. Templates** (`templates`). Teaches: `template` and `use`; parameters of
any kind (a colour, a number, an easing); the wrapper group and the properties
it accepts; `generate` around and inside templates; and templates that carry
motion. Samples: a `Badge(tone)` used three times; a template with a numeric
parameter; `use` inside `generate`; a template passed an easing. Showcase
**Forest**, 12 s, seamless: three depth layers of trees from one `Tree(height,
tone, sway)` template drawn upward from its own (0, 0), so the wrapper's
rotation pivots at the trunk base. They sway with yoyo rotations whose
amplitude comes from the parameter, under a moon. Fog bands breathe in
`alpha`, and fireflies blink on staggered loops. Exercises: add a fourth layer;
give the template a trunk-colour parameter; make the near trees sway more.

**11. Physics** (`physics`). Teaches: `physics`; the shared world; `gravity`,
`velocity`, `bounce`, `airDrag` and `collideBounds`; numeric `duration`
(freeze) against `indefinitely` (sleep); the collision shape of each kind
(circle, box, polygon hull); welded groups; and that only physics objects
collide. Samples: one falling ball; three bounce values side by side; airDrag
confetti; frozen against asleep; an L-shaped welded group catching a ball.
Showcase **Toy Box**, 8 s: wooden letter blocks (rectangle with text, welded
groups) spelling M, A, R, E and Y. They tumble into a wide box, made by the
scene edges, along with balls of three sizes, a triangle and a welded L-piece,
and settle into a believable heap. Starting positions are staggered in height
so the arrivals read one by one. Exercises: make everything bouncier; drop the
letters last; freeze the heap after 4 s.

**12. The world: walls, locks and spin** (`world`). Teaches: the `world`
block (`gravity`, `bounds`, open edges, removal after 800 px); `lockPosition`
and the properties it forbids; an animated locked body as a moving paddle;
`lockRotation`; and `spin`. Samples: an open-topped world; a fixed ledge; a
sweeping paddle; tile against crate (spin and lockRotation); the
`TYPE_LOCK_IGNORED` error sample. Showcase **Plinko**, 10 s: a triangular field
of locked round pegs from nested `generate`, with discs released from the top
one after another (each a sequence: a hold of increasing length, then
`physics`). The discs ricochet down into bins, separated by locked dividers,
at the bottom. A locked paddle sweeps across the top row, and the discs spin
as they fall. Exercises: tilt the world's gravity; open the bottom edge so
discs fall out; replace the pegs with locked squares.

**13. From animation to physics** (`handoff`). Teaches: physics as a sequence
step; the body existing, pinned, before its physics step; `handoff: true`;
release speed by easing; and the handoff rules (with a
`TYPE_HANDOFF_PHYSICS` error sample). Samples: slide then fall without
handoff; the same with handoff; the release-speed table in action (two
easings); a sequence that animates, simulates, then animates again. Showcase
**Domino Run**, 10 s: a ball is rolled in by an `easeIn` position animation
with `handoff`. It strikes the first of a curved line of dominoes (physics
rectangles on a floor and a locked ramp), and they topple in a chain. The last
domino knocks a ball off a ledge into a cup. Exercises: roll the ball faster;
space the dominoes wider until the chain breaks; add a second chain triggered
by the first.

**14. Ship it** (`ship-it`). Teaches: `marey check` and `--export-ready`;
`marey export` and its formats; the frames hash; embedding with
`<marey-player>`; and the GitHub Action. No showcase: the hero is the
Lighthouse scene embedded exactly as the embed guide shows. It ends by
pointing to the guides for depth and the gallery for study.

## 5. Content and sources

### 5.1 Files

```text
site/
  site.json                 sections, the order of their pages, and gallery order
  content/learn/index.md    the course front door
  content/learn/<slug>.md   lessons
  content/guides/index.md
  content/guides/<slug>.md  guides
  content/reference/index.md
  content/404.md
  gallery/<id>.md           a gallery entry: front matter + "How it's made"
  gallery/<id>.marey        its scene, unless front matter names a source elsewhere
  build/                    the generator (Node, imported by the Vite plugin)
  shared/                   code used by both the generator and the browser
  client/                   the browser code and styles
vite-plugins/site.ts        the Vite plugin: entries, dev middleware, generated files
```

The five playground examples stay in `src/examples/`, and their gallery entries
name that file as their source. The playground keeps working unchanged.

### 5.2 The Markdown dialect

- **Front matter** sits between `---` lines, as `key: value` pairs with plain
  strings and lists of `- item` lines. A small strict parser rejects anything
  else, with the file and line. Lesson keys: `title`, `summary`,
  `description`, `minutes`, `learn` (the bullets), `showcase` (a gallery id).
  Guide keys: `title`, `summary`, `description`. Gallery keys: `title`,
  `summary`, `tags`, `poster` (seconds), `lesson` (slug, optional), `source`
  (path, optional).
- **Fences**: `marey`, `marey error=CODE`, `marey error`, `marey fragment`, `marey solution`
  (only inside `:::try`), plus `text`, `bash`, `html`, `yaml` and `json`, which
  are shown plain. Any other info string fails the build. That is the same
  rule `languageDocs.test.ts` applies, and for the same reason.
- **Containers**: `:::try <Title>` … `:::` for an exercise, and `:::note`,
  `:::tip` and `:::warn` for callouts. Containers do not nest.
- **Links**: site pages are linked by root-relative path (`/learn/animate/`,
  `/reference/language/#handoff`). Anchors are the generator's own heading
  slugs, and every link and anchor is checked (C19).

### 5.3 The gallery

In this order:

1. Lighthouse
2. Dusk over layered hills
3. Ledges
4. Fireworks (new)
5. Aurora (new)
6. Hourglass (new)
7. Orrery
8. Forest
9. Day to Night
10. Plinko
11. Domino Run
12. Ripple
13. Title Card
14. Toy Box
15. Metronome
16. Postcard
17. Easing Race
18. Set Sail
19. Sunrise
20. Logo reveal
21. Bar chart reveal
22. Physics pile

Briefs for the three new showpieces:

- **Fireworks**, 12 s: rockets climb on `easeOut` position animations, then
  burst into rings of particles laid out with `sin`/`cos` in `generate`. Each
  particle animates outward, fades and shifts colour in a sequence. Five
  bursts are staggered with `delay` in several palettes, over a city
  silhouette with reflections on a river.
- **Aurora**, 12 s, seamless: layered translucent ribbon polygons whose
  colours blend between greens and violets, swaying with yoyo motion at
  different periods. Snow-capped mountains are silhouetted below, and stars
  twinkle above.
- **Hourglass**, 12 s: a glass outline drawn with lines over locked polygon
  walls that form the bulbs and the neck. About 150 sand grains (small
  physics circles, under the body limit) pour from the top bulb through the
  neck and pile in the bottom. The frame is wooden.

Every gallery scene has a finite `duration` and passes
`marey check --export-ready`.

### 5.4 Guides

1. **Install and check** (`install`): `npm install --save-dev marey-lang`,
   `npx marey check`, its flags and exit codes, and the library entry point.
2. **Export** (`export`): every format, `--fps`, `--duration`, `--out`,
   `--export-ready`, the frames hash and what it proves, and the playground's
   export buttons. A table says which format to use for what.
3. **Embed a scene** (`embed`): the `<marey-player>` element from npm or
   jsDelivr; `src` and the inline script; `autoplay`, `loop` and `controls`;
   events and their `PLAYER_*` codes; the JavaScript API; styling with
   `::part`; sizing; reduced motion; and the WebGL context budget. Every
   snippet is copyable.
4. **Check scenes in CI** (`ci`): the GitHub Action, its inputs and outputs,
   annotations, artifacts, pinning by SHA, and the starter folder.
5. **Edit an export in a Lottie editor** (`lottie`): what a Marey Lottie file
   contains (groups as parented null layers, one shape layer per shape,
   separated position, fitted keyframes with real easing handles, the
   background solid, text as outlines); what is baked (flattened opacity,
   physics as keyframes); and how to retime a motion in an editor. It
   describes the encoding of
   `2026-11-13-marey-lottie-fitted-keyframes-design.md`, and states only what
   that work measured.
6. **Reading errors** (`errors`): how diagnostics read, then a dozen common
   mistakes. Each is a `marey error=CODE` sample whose message is the
   compiler's own, with the fix as a live `marey` sample.

### 5.5 Reference

- `/reference/` is a short index of the three pages.
- `/reference/language/` renders `docs/LANGUAGE.md`. Its samples follow C7.
  Apart from C8's two passages it stays as written, because the source is the
  repository's. A banner above it says "Formal reference. New to Marey? Start
  with the course."
- `/reference/properties/` holds C9's tables. Each object kind's table states
  whether a property is required, its default (written in Marey syntax), its
  value kind, its constraint in words, and whether it can be animated. A line
  under the title says the page is generated from the compiler's contract.
- `/reference/determinism/` renders `docs/determinism.md`.

## 6. Engineering

### 6.1 Build

- `vite-plugins/site.ts` collects the page list at config time and adds each
  page as a virtual HTML entry at its output path (for example
  `learn/animate/index.html`). It serves the same rendered pages from
  middleware in development, re-rendering from disk on each request, and
  emits `sitemap.xml`, `search-index.json` and `404.html` into the build.
- Every page's HTML includes one module script, `site/client/main.ts`. Vite
  bundles it, and the renderer chunk is still loaded lazily by the player.
- The generator lives in `site/build/` and is type-checked by
  `tsconfig.node.json`. `site/client/` and `site/shared/` are type-checked by
  `tsconfig.app.json`. Tests live beside the code, as `site/**/*.test.ts`,
  added to `vitest.config.ts`.
- The client never imports Monaco. A boundary test enforces that, in the same
  way as `monacoBoundary.test.ts`.
- **Budget:** the site's own JavaScript, excluding the player's lazy renderer
  chunk, stays under 90 kB gzipped per page. The browser check (§6.4) measures
  it.

### 6.2 Design

- One visual family with the playground: Bricolage Grotesque for headings and
  interface text, JetBrains Mono for code (both already in `public/fonts/`),
  and the playground's violet accent. The body copy is set at 17 px with 1.65
  line height and a 68-character measure.
- Light and dark themes, following `prefers-color-scheme`, with a toggle that
  remembers the choice. Colour tokens live on `:root` and the theme
  attribute. A contrast test, like `src/styles/contrast.test.ts`, holds
  body text at 4.5:1 or better and large text and UI at 3:1, in both themes.
- Code blocks and editors use one Marey highlighting palette in each theme,
  with every token colour at 4.5:1 on the code background.
- Players sit on a dark stage in both themes, because most scenes have dark
  backgrounds and a white mat would glare.
- Motion in the interface itself is limited to short transitions, and none
  happens under `prefers-reduced-motion`. The scenes are the motion.
- The `/learn/` hero, the lesson cards and the gallery grid are where the
  design spends its effort. Reading pages stay quiet: content first, chrome
  recessive.

### 6.3 Tests

- **Every sample** in every page: `marey` fences compile with no errors;
  `error=` fences fail with their code; `fragment` fences contain no `scene`.
- **Showcase discipline:** each lesson's showcase uses no construct that a
  later lesson introduces. `site.json` declares, per lesson, the vocabulary it
  introduces: keywords, shape kinds, property names and keyword values such
  as easing names. The test lexes each showcase and checks every such word
  against the vocabulary introduced up to and including that lesson. It checks
  vocabulary, not usage: animating `color` before lesson 7 uses only words
  lesson 1 introduced, so the task review checks usage by reading.
- **Gallery integrity:** every entry has its scene, a finite `duration`, a
  `poster` inside that duration, and known tags. Every `lesson` named exists.
  Every lesson's `showcase` is a gallery entry. `site.json`'s gallery order
  lists every entry exactly once.
- **Navigation integrity:** every content file appears in `site.json` exactly
  once, and the lessons are numbered 1 to 14 with no gaps.
- **Links:** every internal link resolves to a page, and every `#anchor` to a
  heading on it.
- **The property reference** has a row for every property in
  `LANGUAGE_CONTRACT`.
- **The front-matter parser and the Markdown dialect**: unit tests for each
  rule, including the rejections.
- **Escaping:** every place the generator writes text into HTML escapes it,
  and a test feeds `<`, `&` and quotes through titles, code and messages.
- **Highlighting** covers every token the lexer emits, and the HTML produced
  for a sample, with its tags stripped, equals the sample's text.
- **Contrast** in both themes (§6.2).

### 6.4 Browser check

`tools/visual-check/site-check.mjs` runs against a production build served by
`vite preview` on port 5199 (`--strictPort`) and:

- visits every page in the sitemap and fails on any console error or failed
  request;
- scrolls each page and waits for every `<marey-player>` to fire `ready`, and
  fails on any `error` event;
- on one lesson, types into a live sample's editor and confirms the player
  re-runs, introduces an error and confirms the error list shows it with its
  line, and then presses Reset;
- opens search with `/`, types a query, and opens the first result with Enter;
- at a 390 px wide viewport, confirms no page scrolls horizontally;
- records the gzipped JavaScript each page loads before any player mounts;
- loads a lesson sample that uses `text` and confirms it reaches `ready`
  (C21);
- at a 1280x2400 viewport on `/gallery/`, scrolls top to bottom and confirms
  no more than 12 players are ever connected at once (C20);
- saves a screenshot of every showcase and every gallery scene at its poster
  time, for review.

### 6.5 Visual review of the scenes

A showcase is not done because it compiles. Each one is reviewed from its
screenshots at three moments against its brief: composition, colour,
legibility, and whether the motion reads. A scene that looks thin or
diagrammatic gets reworked before its task is closed. The Lighthouse scene is
the bar.

## 7. Writing

- Second person, present tense, short paragraphs. One new idea per section.
- Every new term is defined where it first appears and linked to the
  reference.
- Each sample is preceded by what to look for and followed by what happened
  and why.
- Exercises have a goal a learner can check by eye.
- The docs follow the repository's writing rules (AGENTS.md, "How committed
  text reads"): engineering prose, no assistant or tool talk, no sales
  language.
- Lessons say plainly where the language is strict and why, using the
  reference's own reasons. They never paper over a rule.

## 8. Evidence

`eval/RESULTS-PHASE-9C.md` records:

1. Page count, sample count by kind, gallery count, and that the build's
   link and sample checks passed.
2. `site-check.mjs` results: pages visited, players ready, console errors
   (zero), the editor round trip, search, mobile overflow (none), and
   JavaScript per page against the budget.
3. The showcase and gallery screenshots, reviewed, with any scene that was
   reworked and why.
4. After the push to `main`, the deployed site: `/learn/`, one lesson, the
   gallery, a gallery scene, the reference and `/404.html` fetched from
   `https://marey.pages.dev/` with their status codes, and one player seen
   ready in the deployed page.

## 9. Documentation of the site itself

- A new topic document, `docs/architecture/site.md`, explains the generator,
  the Markdown dialect, how to add a lesson, a guide or a gallery entry, and
  the checks. The directory map in `docs/architecture/README.md` points to it
  for `site/` and `vite-plugins/site.ts`.
- The status lines for 9C in `docs/architecture/README.md` and
  `roadmap-and-process.md` are written only once the evidence exists.

## 10. Left to the builder

- The prose of every lesson and guide, within §4 and §7.
- The exact visual design within §6.2, including the hero and the cards.
- The search ranking details within §3.5.
- The internal structure of the generator and client, within §5.1 and §6.1.
- Each showcase's exact geometry and palette, within its brief and §6.5.
