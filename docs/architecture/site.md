# The documentation site

The course, the guides, the gallery and the rendered reference are static HTML
built by this repository's own generator, inside the same `vite build` as the
playground. They are served beside it from the same Cloudflare Pages project:
`/` is the playground, and `/learn/`, `/guides/`, `/gallery/` and
`/reference/` are the site. Design:
`docs/specs/2026-11-13-marey-phase-9c-docs-site-and-gallery-design.md`.

The site exists to keep three promises, and most of what follows is how they
are enforced rather than hoped for:

- every sample on the site compiles, and every error sample shows the
  compiler's real message;
- a lesson's showcase uses nothing a later lesson teaches;
- nothing on the site is a hand-kept copy of something the repository already
  states: the reference is rendered from `docs/`, the property tables from the
  compiler's contract, the highlighting from the lexer.

## Layout

```text
site/
  site.json                 sections, page order, lesson vocabulary, gallery order
  content/learn/index.md    the course's front page
  content/learn/<slug>.md   lessons
  content/guides/index.md, <slug>.md
  content/reference/index.md
  content/404.md
  gallery/<id>.md           a gallery entry: front matter and "How it's made"
  gallery/<id>.marey        its scene, unless front matter names a source elsewhere
  build/                    the generator (Node; type-checked by tsconfig.node.json)
  shared/                   the highlighter, used by the generator and the browser
  client/                   browser code and site.css (tsconfig.app.json)
vite-plugins/site.ts        the Vite plugin
```

## The generator

`buildSite(repoRoot)` in `site/build/index.ts` reads `site.json` and every
content file and returns a `BuiltSite`: the pages, the sitemap, the search
index, and a list of errors as `file:line: message`. It collects errors
rather than throwing, so one run reports all of them. It never touches the
DOM; the page model is in `site/build/types.ts`.

Each Markdown file is parsed with `marked` (a pinned dev dependency, never
shipped) through `markdown.ts`, which adds the site's dialect, gives every
heading an id and an anchor, renders raw HTML in the source as text, and
records every link with its line. `layout.ts` wraps each body in the page
chrome: the top bar, the section sidebar, "On this page", previous and next,
the footer, and head metadata. `learn.ts` adds a lesson's anatomy (breadcrumb,
"You'll learn", showcase, finish button) and builds the course's front page.
`gallery.ts` loads the entries and writes the gallery's pages. `reference.ts`
renders `docs/LANGUAGE.md` and `docs/determinism.md`, rewriting their links to
other repository files to GitHub, and generates the property tables from
`LANGUAGE_CONTRACT`. `links.ts` checks every internal link and anchor once all
pages exist.

`samples.ts` is where the first promise is kept. Each `marey` fence is
compiled with `compileSource` while the page is built. An error fence's
messages are written into the page from that compile, so the page shows what
the compiler says today, not what it said when the page was written. A sample
that fails its rule is a build error with the content file's line.

`playground.ts` builds each sample's "Open in playground" link with
`buildShareURLFor`, the playground's own share encoder. A gallery scene whose
compressed source is over `MAX_SHARE_LENGTH` gets a link to its source with
comments and blank-line runs removed (`stripComments`, lexer-based, so strings
are untouched); a test compiles every stripped scene to the same IR as its
original. A scene still over the ceiling without its comments is a build
error. The links are cached per source text for the life of the process.

`site/shared/highlight.ts` highlights Marey with `lex` from the compiler, at
build time for static code and in the browser for the editor, so the
highlighter cannot drift from the language. A test checks that the HTML for
every example scene and every fence of the language reference, with its tags
stripped, is the source text.

## The plugin

`vite-plugins/site.ts` joins the generator to the build:

- **Build.** The `config` hook calls `buildSite`. Any error stops
  `npm run build` with the list, and so stops CI and the Cloudflare deploy.
  Otherwise every page becomes a virtual HTML entry at its output path
  (`learn/animate/index.html`) beside the playground's `index.html`, so the
  site and the playground share one bundle and one commit of the compiler and
  player. `generateBundle` emits `sitemap.xml`, `search-index.json` and the
  scene font.
- **Development.** Middleware serves the same pages, rebuilt from disk on each
  request, through `transformIndexHtml`. A page with build errors is replaced
  by a page listing them, and each error is logged. A change to site content,
  a gallery entry, `site.json` or a scene a gallery entry names reloads the
  open page.

Every page loads one module script, `site/client/main.ts`. It sets up the
theme toggle, search, navigation and lesson progress, and imports the samples,
gallery and player code only on pages that have them.

## The Markdown dialect

**Front matter** sits between `---` lines, as `key: value` pairs and lists of
`- item` lines. `frontMatter.ts` rejects anything else with its file and line.

| File | Keys |
|---|---|
| Lesson | `title`, `summary`, `description`, `minutes`, `learn` (3 to 5 bullets), and at most one of `showcase` (a gallery id) and `embed` (a gallery id written into the page as a bare `<marey-player>`) |
| Guide, section index, 404 | `title`, `description`; the course's front page adds `heading`, `summary` and `hero` |
| Gallery entry | `title`, `summary`, `tags`, optionally `poster` (seconds), `lesson` (a slug) and `source` (a repository path) |

**Fences.** The info string decides what a fence is, and anything not listed
is a build error, the same rule `languageDocs.test.ts` applies to the
repository's documents:

| Fence | Must | Becomes |
|---|---|---|
| `marey` | compile with no errors | a live sample (an editor under a player) on lessons and guides; a Run button on the reference |
| `marey error=CODE` | fail with a message starting `[CODE]` | the code, and the compiler's messages generated at build time |
| `marey error` | fail at all, for diagnostics with no code | the same |
| `marey fragment` | contain no `scene` block | highlighted code only |
| `marey solution` | compile; only inside `:::try` | a live sample behind "Show a solution" |
| `text`, `bash`, `html`, `yaml`, `json` | nothing | plain code with Copy |

**Containers** are `:::try <Title>` ... `:::` for an exercise, and `:::note`,
`:::tip` and `:::warn` for callouts. They do not nest.

**Links** to site pages are root-relative paths, `/learn/animate/` or
`/reference/language/#handoff`. Anchors are the generator's heading slugs.

**Gallery notes** follow one more rule (`gallery.test.ts`): a code span holds
either a single word of the language, or text that appears verbatim in the
scene. When a note says the scene uses something, quote it with its value
(`fontSize: 64`) so the test checks the claim.

## Adding a page

**A lesson.** Write `site/content/learn/<slug>.md` and append
`{ "slug": "<slug>", "vocabulary": [...] }` to `learn` in `site.json`, in
course order; a lesson's number is its place in that list. If it has a
showcase, add the gallery entry (below) with `lesson: <slug>` and the `lesson`
tag, name it in the lesson's `showcase`, and place it in `gallery`. The
showcase must pass the vocabulary rule. `vocabulary.test.ts` pins the course
at 14 lessons in the spec's order, so a fifteenth lesson is a deliberate edit
there.

**A guide.** Write `site/content/guides/<slug>.md` with `title` and
`description`, add the slug to `guides` in `site.json` in reading order, and
add it to the list in `content/guides/index.md`. Every option, attribute,
event or input a guide names should be checked against the code that defines
it (`src/cli/`, `src/player/element.ts`, `action.yml`), and a guide that
describes a behaviour that differs between the published version and `main`
says which version does what.

**A gallery entry.** Write `site/gallery/<id>.md` and `<id>.marey` (or name a
scene elsewhere with `source:`, as the playground examples in `src/examples/`
do), and add the id to `gallery` in `site.json` at its place in the order.
The scene must have a finite `duration` and pass
`marey check --export-ready`; a `poster` must fall inside the duration; the
`text` tag must be present exactly when the scene has a `text` object.
`gallery.test.ts` pins the full order of the 22 entries.

`site.json` and the content directories must agree both ways: a listed page
without its file and a file that is not listed are both build errors.

## The vocabulary rule

A showcase may use only the words introduced by its own lesson and the lessons
before it. `site.json` gives each lesson the words it introduces: keywords,
shape kinds, property names and keyword values such as easing names.
`vocabulary.ts` lexes a scene and collects the words it uses: every keyword,
expression word, easing, fit, boolean and `indefinitely`, every property name
(a name followed by `:`), the property after `property:`, and the edge words
in a `bounds` list. `vocabulary.test.ts` fails with the lesson, the word and
its line when a showcase uses a later lesson's word.

It checks words, not usage. Animating `color` before lesson 7 uses only words
lesson 1 introduced, so whether a showcase uses an idea before its lesson
teaches it is for review to judge, by reading.

## Players: the pool and the font

Each player owns a WebGL context, and Chromium drops the oldest context past
16 without warning. The page therefore never creates a `<marey-player>`
directly. `site/client/pool.ts` keeps one pool per page with 12 places: a
sample, card or stage asks for a player for its slot; the pool creates one
when the slot comes within 400 px of the viewport and a place is free, and
removes it (which releases its context) once the slot is more than 1,200 px
away. Waiting slots are served nearest first, measured when a place frees
up. When every place is taken and a slot on screen is still waiting, the
player whose slot is farthest off screen gives up its place, so nothing the
reader is looking at stays empty while a player they cannot see holds one; a
player on screen is never removed for another, so with more than 12 slots on
screen at once the extra ones wait. Observers at the viewport's edge, at
400 px and at 1,200 px wake the pool. The trading loop is bounded by
construction: each round must give its freed place to a different slot on
screen, and there are at most as many rounds as slots, so a page whose
measurements disagree with themselves cannot make it spin. A lesson's `embed` scene is written into the page as a bare player,
outside the pool, because that is what the embed guide shows a reader doing;
a page has at most one.

Players get their scene as a `blob:` URL on `src`. A live sample compiles the
edited text itself with `compileSource` and hands the player only text that
compiled; the player has no source setter, and the site does not add one.

The player's control bar covers the bottom of the scene. On the site it fades
while the scene plays and the reader is neither pointing at the player nor
focused in it (`site.css`, `controls.ts`). It stays on screens without hover
and while paused. The player fires no play or pause event, so `controls.ts`
reads `paused` after the events that can change it, and the bar's default is
visible. Focus in the bar keeps it showing for keyboard readers; after a
pointer click (`detail` above 0) the site blurs the clicked control through
the player's open shadow root, so the bar can fade for mouse readers too.
The shipped player is not changed for any of this.

`src/player/render.ts` loads the scene font from
`./fonts/JetBrainsMono-Regular.ttf` beside its own chunk. The plugin emits the
font at `assets/fonts/JetBrainsMono-Regular.ttf` in the build and serves it at
`/src/player/fonts/JetBrainsMono-Regular.ttf` in development. Without it, a
scene with `text` fails with `PLAYER_FONT_UNAVAILABLE`, because the request
falls through to an HTML page. Because that name carries no content hash,
`public/_headers` exempts `/assets/fonts/*` from the year-long immutable cache
the hashed files under `/assets/` get, and has it revalidated instead.

## The checks

In the test suite (`npm test`, `site/**/*.test.ts`):

- `content.test.ts`: every sample on every page keeps its fence's rule.
- `vocabulary.test.ts`: the vocabulary rule.
- `gallery.test.ts`: every entry has its scene, a finite duration, a poster
  inside it and known tags; the order; the notes' code spans.
- `index.test.ts`, `siteConfig.test.ts`, `learn.test.ts`: navigation
  integrity, `site.json` itself, lesson anatomy and front matter;
  `vocabulary.test.ts` also pins the 14 lessons.
- `links.test.ts`: every internal link and anchor resolves.
- `reference.test.ts`: a row for every property in `LANGUAGE_CONTRACT`.
- `frontMatter.test.ts`, `markdown.test.ts`, `escape.test.ts`,
  `highlight.test.ts`: the dialect, escaping and highlighting.
- `contrast.test.ts`: text and interface contrast in both themes.
- `boundary.test.ts`: no client module reaches `monaco-editor`.
- `pool.test.ts`, `editor.test.ts`, `search.test.ts`, `controls.test.ts` and
  the rest of `site/client/`: the browser code's logic.

In the build: `npm run build` fails on any error `buildSite` reports, so a
broken sample, link or anchor, a gallery entry without its scene, or a page
missing from the navigation never deploys.

In a browser, not in CI: `tools/visual-check/site-check.mjs` runs against
`npm run build` served by `npx vite preview --port 5199 --strictPort`. It
visits every page in the sitemap and waits for every player to be ready, runs
the editor round trip and search, measures sideways scrolling at 390 and
360 px, the JavaScript each page loads, the gallery's live players, the
control bar, the pages with JavaScript off, and takes a screenshot of every
gallery scene and showcase at its poster time. The README in
`tools/visual-check/` describes it, and `eval/RESULTS-PHASE-9C.md` records its
results. Run it after any change to the site's client code, its CSS, the
player or the plugin, and read the screenshots.
