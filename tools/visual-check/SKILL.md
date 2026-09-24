---
name: visual-check
description: Run the Marey playground in a real browser and capture what it renders. Use when verifying a renderer or physics change, checking that a scene settles where it should, that the ticker stops, or that a scene replays identically across a page reload — anything the headless Vitest suite structurally cannot see.
---

# Visual check

The renderer's unit tests are deliberately headless — `clock.ts`, `timeline.ts`,
`physicsWorld.ts` and `physicsSync.ts` import nothing from `pixi.js` so they run
in Node. That is what makes them fast, and it is also what they cannot do: none
of them can see a canvas.

This skill covers the gap. It drives the real app in Chromium, captures PNGs you
can look at, and measures three things the suite cannot.

**It has already earned its keep.** The first run found a determinism bug that
all 94 headless tests missed: a body frozen by `duration` expiry kept its
alpha-interpolated painted position, so it landed up to one tick of motion from
where the simulation stopped it, differently on each page load. Fixed in `f9de4a9`.

## Running it

The dev server must already be running:

```bash
npx vite --port 5199 --strictPort   # leave this running
```

**Use `--strictPort`.** Without it vite walks forward to 5200, 5201… when the
port is taken and prints the one it bound, while `check.mjs` still defaults to
`http://localhost:5199`. A stale server from an earlier run then absorbs every
capture and the check reports a confident pass without exercising your code at
all. This has happened twice. If you must use another port, pass
`--url http://localhost:<port>` to every `check.mjs` call.

Then:

```bash
node tools/visual-check/check.mjs \
  --scene tools/visual-check/scenes/pile.marey \
  --at 300,1500,4000 --settle 9000 --out .visual-check/pile
```

| Flag | Meaning |
|---|---|
| `--scene <path>` | A `.marey` file, or `default` for the app's built-in default scene (the smiling face). For renderer checks use `scenes/test-card.marey`, the motion test card that was the default until Phase 5B |
| `--at a,b,c` | Milliseconds after load to capture, comma-separated |
| `--settle <ms>` | How long to wait before the at-rest capture (default 9000) |
| `--url <origin>` | Dev server origin (default `http://localhost:5199`) |
| `--headed` | Show the browser window — use if headless WebGL misbehaves |
| `--out <dir>` | Where PNGs and `report.json` go |

Scenes are injected through the app's `#code=<lz-string>` share-link hash, which
is far more robust than driving Monaco.

**Look at the PNGs.** The numbers below are a safety net; the images are the
point. Read them with the Read tool — a blank frame means WebGL failed to
initialise, not that the renderer is broken.

## What it measures

- **`rendered` / `compiled`** — scraped from the app's own output panel, so it
  reports the compile result in the app's own words rather than guessing at pixels.
- **`frozen at rest`** — two captures two seconds apart are byte-identical, i.e.
  nothing is still moving.
- **`cpu at rest`** — CPU seconds consumed over a 2s wall window, read from the
  DevTools protocol's `TaskDuration`. Near zero means `ticker.stop()` genuinely
  fired. This is the honest version of "watch the CPU graph": PixiJS's ticker runs
  off `requestAnimationFrame`, but so does Monaco, so counting rAF calls cannot
  tell them apart.
- **`deterministic`** — the same scene is loaded twice from cold and the at-rest
  frames compared byte-for-byte. **This is the check that cannot be done headlessly**,
  and the one worth caring about most, because baked-keyframe export depends on it.

## Two traps, both of which caught me

**Do not read canvas pixels in-page.** `drawImage`-ing the WebGL canvas onto a 2D
canvas returns a blank frame, because PixiJS does not set `preserveDrawingBuffer`.
Playwright's `.screenshot()` composites properly and is what this script uses.
An in-page pixel read will confidently report a working scene as blank.

**`deterministic: true` is weaker than it looks for a scene that settles.** A
pile converging on a stable resting configuration reaches the same fixed point
even if the trajectory diverged, so at-rest equality can hide real
non-determinism. To test a *trajectory*, use a scene that freezes mid-motion —
`physics { duration: 0.5 }` on a falling object — so the capture lands on a
transient state. `scenes/freeze.marey` does exactly this, which is how the
`f9de4a9` bug surfaced.

A scene with `loop: true` animations never comes to rest at all, so
`deterministic` and `frozen at rest` are meaningless for it — including for
`--scene default` and `scenes/test-card.marey`. Use them to confirm the scene
renders and the handoff arcs, not for determinism.

## Scenes

`scenes/` holds the standing checks. Each isolates one property:

| Scene | Property |
|---|---|
| `pile.marey` | Five boxes stack without interpenetrating — the headline Phase 1 feature |
| `idle.marey` | A ball settles and the ticker stops |
| `ghost.marey` | A ball falls **through** a ledge that has no `physics` block (decision D13) |
| `tumble.marey` | A polygon rotates on impact, and its drawn shape stays on its collision shape (D15) |
| `freeze.marey` | `duration` expiry freezes a settling pile mid-motion, reproducibly |
| `freeze-midair.marey` | Minimal repro of the `f9de4a9` bug: one box, no contacts, frozen in free fall. The tightest determinism check here — nothing else can absorb a divergence. |
| `logo.marey` | A three-bar group welds into one compound body and tumbles rigidly, settling on its own arms (Phase 2, D16). If the bars ever separate, the welding has stopped happening. |
| `logo-freeze.marey` | The same idea frozen mid-tumble in free air — determinism on a transient state rather than at rest. |
| `fit-contain.marey` | `fit: contain` — letterboxed, aspect preserved, all four corner markers visible (Phase 3A, `sceneFit → fit` rename). |
| `fit-cover.marey` | `fit: cover` — no letterbox, aspect preserved, corner markers cropped off the short axis. |
| `fit-fill.marey` | `fit: fill` — no letterbox, aspect **not** preserved; the disc renders as an ellipse. |
| `fit-none.marey` | `fit: none` — unscaled, anchored top-left, smallest disc of the four. |
| `bars-reveal.marey` | Phase 3C's headline idiom: `delay` staggers seven bars, `origin: (0.5, 1)` stands each on the baseline, `scale: (1, 0)` starts them at nothing. Every bar must **stand on** the grey rule, not straddle it — a bar centred on it means the origin pivot has stopped reaching the renderer, which still compiles and still type-checks. |
| `ring-pulse.marey` | A fixed-period phase offset: one shared `duration`, `delay` varying by ordinal. Dot sizes must vary smoothly around the ring. Loops, so `frozen at rest` and `deterministic` do not apply. |
| `wave-row.marey` | Roadmap exit criterion 3, in the form where a still frame shows it: fifteen beads, one constant `duration`, `delay` spanning one full cycle, so exactly one wavelength fits the row and travels along it. Loops. |
| `timeline-sweep.marey` | The control from the same set — a generated diagram plus one moving playhead, the one of the three that needed no Phase 3C workaround, so it is unchanged in substance. Loops. |
| `origin-physics.marey` | `origin` through the physics seam, both halves. LEFT: a bottom-origin pillar falls and must land **standing on** the ledge — its body is placed at its bbox centre, not at its origin point. RIGHT: a bottom-origin bar grows upward under a scale animation and must carry the rider ball up on its top edge — Matter scales a body about its own centre, so the centre has to be moved to match. Settles, so `frozen at rest` and `deterministic` both apply. |
| `test-card.marey` | The motion test card: the app's default scene until Phase 5B, moved here unchanged when the smiling face replaced it. Six zones exercise every timeline path (easing race, handoff, sequence with a parallel step, loops, stagger, shared-world physics), and its header comment says what correct looks like. `testCard.test.ts` fails if a zone is deleted. Loops, so `frozen at rest` and `deterministic` do not apply. |
| `linear-motion.marey` | `video-check.mjs`'s primary criterion-3 fixture (Phase 5B fix wave). A box and a dot move at constant velocity from frame 0 and stay on screen, so at 24–60 fps every decoded frame has one clearly nearest reference frame (not at 120 fps; see "Exporting video"). A dropped, duplicated or reordered frame is a nearest-neighbour failure from the very first frame. |

Add a scene rather than editing one when checking something new — these are
regression checks, and their expected images are their value.

## Exporting PNGs

`export-check.mjs` drives the browser's real export path — `renderer.extract`,
not a naive canvas read — and writes the frames it produces to disk. It exists
for the same reason `check.mjs` does: the headless suite cannot see a canvas,
and export has its own failure mode the suite structurally cannot catch
either. See `tools/visual-check/export-check.mjs`'s own header
comment for the full design rationale; this section covers what to run and
what it checks.

**Why there is a `window.__mareyExportPng` seam at all.** No product UI ships
an export button this phase — that is Phase 6 (`marey export`) — so there is
nothing in the app for a browser harness to click. `src/main.tsx` installs
`window.__mareyExportPng` (defined in `src/lib/devExportSeam.ts`) behind
`if (import.meta.env.DEV)`, using a *dynamic* `import()` inside that `if`
rather than a top-level import called conditionally — that is the shape that
lets Vite constant-fold the branch away and drop the whole module from a
production build, rather than merely leaving the global unset. Confirmed by
building and grepping `dist/` for `__mareyExportPng`: absent. The seam
compiles the given source, plans the export, builds a scene tree, samples it,
and encodes PNGs — the same pipeline `marey export` will eventually drive from
the CLI — and returns base64 PNG frames plus `hashFrames(frames)` (the
simulation-state hash, not a pixel hash). A narrow named seam beats both
driving a button that does not exist and re-implementing the pipeline in page
script, where a harness-only copy could silently diverge from the one the app
actually runs.

**The blank-frame trap this all exists to avoid.** Reading the live PixiJS
canvas in-page returns a blank frame — the same `preserveDrawingBuffer` issue
noted above — and a sequence of identical blank PNGs hashes perfectly
consistently, so every numeric check in `report.json` would pass against
ninety blank images. `renderer.extract.canvas(root)` (`pngSequence.ts`)
sidesteps it: it renders into a render texture the caller owns and reads back
from that, so the live drawing buffer's contents never matter. That makes
`report.json` alone untrustworthy for this specific failure — **looking at the
PNGs is not optional.**

```bash
node tools/visual-check/export-check.mjs \
  --scene tools/visual-check/scenes/logo.marey \
  --fps 30 --duration 3 --out .visual-check/export/logo
```

| Flag | Meaning |
|---|---|
| `--scene <path>` | A `.marey` file. Required — there is no `default` fallback. To export the app's default scene, save `DEFAULT_CODE` from `src/store/defaultScene.ts` to a `.marey` file first. |
| `--fps <n>` | Export frame rate (default 30). Must divide 120 (`TICK_HZ`) exactly — 24, 30, 60 are supported; `planExport` rejects anything else. |
| `--duration <s>` | Export bound in seconds, overriding the scene's own `duration:`. Omit to use the scene's declared duration. |
| `--out <dir>` | Where frames and `report.json` go. |
| `--url <origin>` | Dev server origin (default `http://localhost:5199`). Same `--strictPort` trap as `check.mjs` applies — see above. |
| `--headed` | Show the browser window. |

It loads the app, injects the scene through the same `#code=` share-link hash
`check.mjs` uses, waits for `window.__mareyExportPng` to exist, and calls it
with the raw source text (the seam does not read the editor's own state, so
hash injection here is for load-path parity with `check.mjs`, not a functional
requirement). It then does this **twice, each from a freshly loaded page** —
not a reload of the same page — and compares the two runs: the per-frame PNG
bytes (sha256 each) and the returned `hashFrames` value. Divergence in either
means the export is not reproducible across a real page load, which baked-frame
export depends on. Both runs share **one** launched Chromium process
(`chromium.launch()` runs once); what resets between them is the page — a
fresh `browser.newPage()` and navigation each time, not a fresh browser. That
is the granularity this check actually exercises, and it is what "cold" means
everywhere below: page-cold, not process-cold.

Output: `<out>/frame_%04d.png` for the first run (the set to look at),
`<out>/runB/frame_%04d.png` for the second (kept only for the comparison), and
`<out>/report.json` with both runs' metadata, hashes, console/page errors, and
the two match verdicts. Exit code is non-zero if either run failed, produced
zero frames, or the runs disagree — never on how the PNGs look, which is a
judgement call for whoever reads them.

**Look at the PNGs — `report.json` cannot substitute for this.** Open
`frame_0000.png`, a frame from the middle of the export, and the last frame
with the Read tool. A blank image (solid background colour, no shapes) is
exactly the failure this script cannot see numerically: identical blank frames
still hash consistently and still pass `pngFramesMatch` and
`snapshotHashMatch`.

**The canonical Gate B scene.** `eval/scenes-3b/compound-logo.marey` is the
corpus's one scene that genuinely animates in, hands off to physics, and
settles — the other three canonical scenes are static by declaration. Run it
the same way as any other scene, from outside this skill's own `scenes/`
directory:

```bash
node tools/visual-check/export-check.mjs \
  --scene eval/scenes-3b/compound-logo.marey \
  --fps 30 --out .visual-check/export/compound-logo
```

`eval/RESULTS-GATE-B.md` is the worked example: it runs this scene and
`eval/scenes-3b/radial-dots.marey` through this exact script and pairs each
Chromium hash against the headless suite's own printed hash, which is how it
found that `hashFrames` agrees between Node and Chromium for one scene and not
the other — a real, measured gap in trigonometric rounding between engines,
not a bug in this script or the sampler. Read that document before assuming
`export-check.mjs`'s cold-reload match proves cross-machine determinism; it
proves cross-*reload* determinism, which is a different and narrower claim.

## Exporting Lottie

`lottie-check.mjs` exports a scene to Lottie, plays it back in a REAL
lottie-web (or, with `--renderer dotlottie-web`, dotlottie-web) player inside
Chromium, and reads back actual pixel values — both a full PNG per requested
frame (for a human to look at with the Read tool) and precise `getImageData`
samples at named coordinates, which is exact-byte evidence a screenshot's own
re-encoding is not. It exists for the same headless-blind-spot reason
`check.mjs` and `export-check.mjs` do, sharpened for this phase: a Lottie
document can parse and play in a real third-party player while encoding the
wrong thing, and nothing in the Vitest suite — which never opens a player —
can see that. See `src/compiler/export/lottieEncode.ts` and
`docs/specs/2026-09-11-marey-phase-5a-baked-lottie-design.md`.

It calls `window.__mareyExportLottie` (installed dev-only by
`src/lib/devLottieSeam.ts`, wired in `main.tsx` behind `import.meta.env.DEV`)
rather than driving any UI — same reasoning as `export-check.mjs`'s
`window.__mareyExportPng`: no export button ships this phase, and a narrow
named seam beats re-implementing compile → plan → build → sample → encode in
page script, where a harness-only copy could silently diverge from the
pipeline the app actually runs.

```bash
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-layer-order.marey \
  --fps 30 --frames 0 \
  --at 100,100 --at 30,100 \
  --out .visual-check/lottie/layer-order
```

| Flag | Meaning |
|---|---|
| `--scene <path>` | A `.marey` file. Required — no `default` fallback |
| `--fps <n>` | export frame rate (default 30) |
| `--duration <s>` | export bound in seconds, overriding the scene's own `duration:` |
| `--frames <list>` | comma-separated frame values to sample, INTEGER OR FRACTIONAL (lottie-web's subframe rendering is on by default in 5.13.0). Default `0` |
| `--at <x,y>` | a pixel coordinate to sample at every requested frame via `getImageData`. Repeatable |
| `--set <field=json>` / `--unset <field>` | patch the exported document's top-level fields before handing it to the player. Repeatable |
| `--strip-easing` | delete `i`/`o` from every keyframe in every layer, everywhere in the document |
| `--compare-png` | also export via `window.__mareyExportPng` at the same fps/duration and pixel-diff each whole-number requested frame against Marey's own PNG render of the identical frame. Reports the measured maximum per-channel delta and the share of pixels that are not byte-identical, and writes a red-on-black diff-visualization PNG per compared frame — see the script's own header comment for the full methodology |
| `--renderer <name>` | `lottie-web` (default) or `dotlottie-web` — design §10's second-renderer evaluation. Both converge on the same internal shim, so every other flag works unchanged either way |
| `--out <dir>` | where `doc.json`, `frame_<label>.png` and `report.json` go |
| `--url <origin>` | dev server origin (default `http://localhost:5199`). Same `--strictPort` trap as `check.mjs` applies |
| `--lottie-path` / `--dotlottie-path` / `--dotlottie-wasm-path` | override the bundled build each renderer loads from `node_modules`, if you need a different version |
| `--headed` | show the browser window |

Output: `<out>/doc.json` (the document actually handed to the player, i.e.
post-`--set`/`--unset`/`--strip-easing`), `<out>/frame_<label>.png` per
requested frame, and `<out>/report.json` with the export metadata, every
sampled pixel, and page/console/player errors. Under `--compare-png`, also
`<out>/frame_<label>_pngexport.png` (Marey's own PNG render of the same
frame) and `<out>/frame_<label>_diff.png` (black where the two renders
agree, red where any channel differs). Exit code is non-zero on a hard
failure (export threw, the player failed to construct or load, or a
page/console error was recorded) — never on what a sampled pixel or a pixel
comparison says, which is this script's whole reason to exist and is a
judgement call for whoever reads the report.

**Look at the PNGs, including the diff visualization under `--compare-png`.**
`report.json`'s `maxDelta`/`share` numbers cannot tell you WHERE mismatches
are; only the diff image distinguishes "antialiasing at shape edges" (a thin
red outline, expected) from "a real defect" (a filled red region inside a
flat colour, not expected) — see `eval/RESULTS-PHASE-5A.md` for a worked
example of reading exactly this.

### Lottie export fixtures

`scenes/lottie-*.marey` each isolate one of design §11's six claims the
Lottie spec alone could not settle, resolved by measurement in Phase 5A
Task 4 (see the 2026-09-12 correction appended to that document's §11):

| Scene | Property |
|---|---|
| `lottie-layer-order.marey` | Two overlapping opaque rectangles. Confirms array-earlier layers draw ABOVE later ones (§11.1) |
| `lottie-opacity-flatten.marey` | A `group` at alpha 0.5 containing a child at alpha 0.5. Confirms Lottie does NOT propagate opacity through parenting — the composed/flattened value (~25%) is what renders, not a double-applied ~12.5% (§11.2). Task 5 re-tested this specifically against a second renderer, `dotlottie-web`, with the same result — see `eval/RESULTS-PHASE-5A.md` |
| `lottie-version-field.marey` | Confirms lottie-web reads `v` (a string like `"5.5.2"`), not the community-spec `ver` integer (§11.4) |
| `lottie-outpoint.marey` | A rectangle sliding across four frames. Confirms `op` is EXCLUSIVE — frame `op` itself renders nothing (§11.5) |
| `lottie-easing-halfframe.marey` | A two-keyframe position track. Confirms the emitted `(0,0)`/`(1,1)` handles produce true linear interpolation, not an approximation (§11.6) |

Add a scene rather than editing one when checking something new — same rule
as the PixiJS-preview `scenes/` fixtures above: these are regression checks,
and their expected pixel values are their value.

## Exporting video

`video-check.mjs` exports a scene to WebM or MP4, decodes the container back
with a real decoder, and proves the decoded frame sequence matches the
sampler's own reference output — no frame dropped, duplicated, reordered, or
silently re-encoded at a rate nobody asked for. It exists for the same
headless-blind-spot reason `check.mjs`, `export-check.mjs` and
`lottie-check.mjs` do, sharpened for the failure mode video adds over a PNG
sequence or a Lottie document: **a video can play back looking mostly right
while silently dropping, duplicating or reordering frames, and nothing that
trusts "the file plays" can see that.** "The file plays" is not evidence —
only decoding it back and comparing against the sampler's own frames is.

**The decode happens inside the page, not in Node, and that is the point, not
an implementation detail.** mediabunny's self-contained ESM bundle
(`node_modules/mediabunny/dist/bundles/mediabunny.mjs` — zero `import`
statements, every symbol the script needs exported under its own bare name)
is injected into the page as an inline `<script type="module">`, the same
technique `lottie-check.mjs` already uses for dotlottie-web's bundle. That
means decoding goes through the same `VideoDecoder` a real viewer's browser
would use — the actual claim criterion 3 needs — rather than a Node-side
decode, which would only prove mediabunny's own demuxer agrees with itself.

Like `export-check.mjs` and `lottie-check.mjs`, it calls
`window.__mareyExportVideo` (installed dev-only by `src/lib/devVideoSeam.ts`,
wired in `main.tsx` behind `import.meta.env.DEV`) rather than clicking the
shipped export button. Since the Phase 5B fix wave that seam is **not** a copy
of the export pipeline: it calls the shipped `runVideoExport`
(`src/compiler/export/videoPipeline.ts`), the same function a click reaches
through `useExportVideo.ts`, with observers that capture each canvas the
encoder is handed, the sampler's hash and the resolved encoder config. So a
run of this script measures the product's orchestration. What still differs
from a click is the entry point (a `window` global versus the button's
dynamic `import()` of the lazy `videoPipeline` chunk) and the `--duration`
override below. See `eval/RESULTS-PHASE-5B.md`, "Which code path was
actually measured".

Each `reference_%04d.png` is the canvas the encoder was handed for that
sampled frame, placed by the frame's position in the sampler's own output,
not by the order the pipeline delivered it. That is what makes a pipeline that
reorders or drops frames fail this script instead of comparing a wrong file
against equally wrong references.

**A limitation of the shipped button this script's own `--duration` flag can
mask if you are not watching for it.** `--duration` overrides a scene's own
`duration:` field, so this script can export any scene, bounded or not. The
shipped button has no such override — `useExportVideo.ts` never passes
`durationSeconds` to `runVideoExport` — so a real click always falls through
to the scene's own top-level `duration:` field, and **no scene lacking one can
be exported from the UI at all**. The shipped default scene declares
`duration: 6` so a first click exports, and `defaultScene.test.ts` fails if
that stops being true. A first-party fixture in this very directory, `scenes/freeze-midair.marey`,
declares no top-level `duration:` (only one inside its own `physics` block, a
different field), so it cannot be exported by clicking, only by this script's
`--duration` override. Recorded, not fixed, as a product decision outside an
unattended execution's authority (ruling R39, widening R27).

```bash
node tools/visual-check/video-check.mjs \
  --scene tools/visual-check/scenes/linear-motion.marey \
  --container mp4 --fps 30 \
  --out .visual-check/video/linear-mp4
```

| Flag | Meaning |
|---|---|
| `--scene <path>` | A `.marey` file. Required — no `default` fallback |
| `--container <name>` | `mp4` or `webm`. Required |
| `--fps <n>` | Export frame rate (default 30) |
| `--duration <s>` | Export bound in seconds, overriding the scene's own `duration:` |
| `--frames <list>` | Comma-separated decoded frame indices to write as PNG. Every decoded frame is still analysed numerically regardless of this flag — it only controls what gets written to disk for a human to look at. Default: an evenly-spaced spread of five indices |
| `--mediabunny-path <p>` | Override the mediabunny ESM bundle path |
| `--out <dir>` | Where `scene.<ext>`, `decoded_%04d.png`, `reference_%04d.png` and `report.json` go |
| `--url <origin>` | Dev server origin (default `http://localhost:5199`). Same `--strictPort` trap as `check.mjs` |
| `--headed` | Show the browser window |

**The nearest-neighbour identity check, and its tie caveat.** For each decoded
frame *k*, the script computes a distance to reference frames *k−2..k+2* and
requires the minimum to be uniquely achieved by *k* itself (`strict`). When two
or more candidates tie for the minimum — which happens whenever the scene has
settled and consecutive reference frames are pixel-identical — the match is
`tie`. A tie that **includes** *k* is reported and counted, never a failure. A
tie that **excludes** *k* (two other references are nearer than *k*) fails the
run: the whole-branch review found one in a `freeze-midair` WebM run that
exited 0 before this rule (ruling R46). This is a
positional check rather than pixel equality, because both codecs are lossy: a
dropped, duplicated or reordered frame makes a decoded frame resemble a
*neighbour* more than itself, which survives lossy compression, while exact
pixel equality would not, regardless of correctness. **A run whose frames are
mostly tied has not proved the check — it has proved the fixture was wrong.**
`eval/scenes-3b/compound-logo.marey` settles well before its own 8s clip ends
and is the wrong fixture for this reason. The primary fixture is
`scenes/linear-motion.marey`: two objects at constant velocity from frame 0,
on screen throughout, so at 24–60 fps every frame has one clearly nearest
reference. At 120 fps the per-frame motion (~1.7 px) is below what the
step-4 distance resolves, and MP4 reports false mismatches, so use it at
60 fps or below.
`freeze-midair.marey` (free fall from rest) was the primary fixture before the
fix wave; its first three frames barely move on the step-4 grid, so they have
no discriminating power.

Every invocation performs two independent cold page loads of the same scene
and compares them against each other — raw container bytes, the reference-frame
PNGs each run fed to its own encoder, and the sampler's own simulation-state
hash — which is how `eval/RESULTS-PHASE-5B.md`'s criterion 2 measured WebM
byte-identical and MP4 not, with the MP4 divergence traced to the encoder side
rather than the renderer (the two runs' reference frames are bit-identical).
For MP4 the script reports the raw comparison and one with mediabunny's six
wall-clock timestamp fields masked, and **neither gates the exit code**
(ruling R47): MP4 bytes differed between correct runs even masked in every
800×600 run measured (two 1080p-sized runs matched once masked), so a byte
gate would fail most MP4 runs and hide a real failure behind the same exit 1.

Exit code is non-zero if: either cold run failed; decode failed; the decoded
frame count, dimensions or timestamp schedule disagree with what was
requested; **the reported coded size is not exactly 2x the scene's own
declared size** (Phase 5C, spec §2.1 — added alongside `VIDEO_SCALE`; a
pipeline that regressed to extracting at scale 1 would still pass every
other gate here, because none of them look at absolute size against the
scene, only at internal consistency between the decoded video and its own
references); any frame's nearest-neighbour match is STRICT and wrong, or is a
tie that excludes the frame itself; a sampled frame was never handed to the
encoder; the two cold runs' snapshot hashes or reference-frame PNGs disagree;
or, **for WebM only**, the two cold runs' raw container bytes disagree. Never
on MP4 container bytes (reported, raw and masked), on how the PNGs look, or on
how many frames tied with a set that includes themselves. `--mask-mp4-times`
no longer exists; the masked MP4 comparison is always reported.

`report.json` also records `runA/runB.encoderConfigs`: the WebCodecs
`VideoEncoderConfig` mediabunny resolved, via its `onEncoderConfig` callback
(spec §5). It is a record, not a check.

**Look at the PNGs.** Same rule as every other harness on this page: read
`decoded_0000.png`, a mid-export frame, and the last frame with the Read tool.
See `eval/RESULTS-PHASE-5B.md` for a worked example specific to this script,
including one frame where a faint lossy-codec compression artefact trailing a
fast-moving edge was read and correctly not flagged as a defect.

## Measuring video quality

`video-check.mjs` proves a video's frames are the right ones, in the right
order, at the right size. It says nothing about how much the codec's own
lossy compression damaged each pixel. `quality-check.mjs` answers that
question: it is the runnable home (spec §2.5) for the throwaway probes in
`docs/research/2026-09-24-export-quality-probes/` (`matrix.ts`/
`matrix-run.mjs`) that measured findings
`docs/research/2026-09-24-export-quality-findings-and-options.md` §1.2's
numbers by hand-rebuilding the render-and-encode loop with raw `pixi.js` and
raw WebCodecs. This script ports the same scoring method onto
`window.__mareyExportVideo` (`src/lib/devVideoSeam.ts`), so it measures the
SHIPPED pipeline (`runVideoExport`) rather than a probe that could silently
drift from it (ruling R45).

It exports a scene **once** per requested container (not twice, like
`video-check.mjs` — quality is not a reproducibility question), decodes the
result back inside the page with a real `VideoDecoder` (mediabunny's ESM
bundle injected the same way `video-check.mjs` injects it), and scores each
decoded frame directly against the reference PNG at the SAME index — the
exact canvas `runVideoExport`'s `onFrame` observer captured before the
encoder consumed it. Two numbers per container, both defined exactly as
`matrix.ts`'s `score` function defines them, so they are directly comparable
to findings §1.2's table:

- **PSNR over RGB** — `10 * log10(65025 / mse)`, averaged per frame then
  reported both per frame and overall.
- **Specks** — pixels whose worst-channel delta against the reference
  exceeds 64, per frame and total.

```bash
node tools/visual-check/quality-check.mjs \
  --scene tools/visual-check/scenes/... \
  --containers mp4,webm --fps 30 \
  --out .visual-check/quality/default
```

| Flag | Meaning |
|---|---|
| `--scene <path>` | A `.marey` file. Required — no `default` fallback |
| `--containers <list>` | Comma-separated `mp4`/`webm` (default `mp4,webm`) |
| `--fps <n>` | Export frame rate (default 30) |
| `--duration <s>` | Export bound in seconds, overriding the scene's own `duration:` |
| `--out <dir>` | Where `report.json` goes |
| `--mediabunny-path <p>` | Override the mediabunny ESM bundle path |
| `--url <origin>` | Dev server origin (default `http://localhost:5199`). Same `--strictPort` trap as `check.mjs` applies |
| `--headed` | Show the browser window |

Exit code is non-zero only if the export or the decode itself failed for a
requested container — **never on how good or bad the measured PSNR or speck
count is**, which is a judgement call for whoever reads the report, the same
"reported, not gated" shape as `video-check.mjs`'s MP4 byte comparison.
"The file plays" is not evidence: `report.json` records the exact command
line that produced it (`commandLine`), alongside per-container `width`/
`height` (coded) and `sceneWidth`/`sceneHeight`, so a number in this report
is always paired with the invocation that produced it.

## Environment

Needs `playwright` (a devDependency) and its Chromium download:

```bash
npx playwright install chromium
```

`lottie-check.mjs` additionally needs `lottie-web` (devDependency, its UMD
build loaded from `node_modules` with no network access) and, only under
`--renderer dotlottie-web`, `@lottiefiles/dotlottie-web` (also a
devDependency). dotlottie-web's bundle defaults to fetching its WASM binary
from a jsdelivr/unpkg CDN; `lottie-check.mjs` routes that request to the
local copy in `node_modules` instead (`page.route`), so `--renderer
dotlottie-web` does not depend on outbound network access either, even
though Playwright's Chromium here happens to have it.

`video-check.mjs` and `quality-check.mjs` additionally need `mediabunny`, loaded the same way —
its self-contained ESM bundle
(`node_modules/mediabunny/dist/bundles/mediabunny.mjs`) is injected into the
page inline, with no network access. Unlike every other package named on this
page, `mediabunny` is **not** a devDependency: Phase 5B's Task 5 made it a
production dependency (`package.json`, `dependencies`, pinned exactly at `1.58.0` like `matter-js`, ruling R50), because the
shipped export button imports it too, so it ships inside the built app bundle
a real visitor downloads. It is licensed **MPL-2.0**; source is at
<https://github.com/Vanilagy/mediabunny>.

Headless Chromium has no GPU, so the launch args force SwiftShader. Without them
PixiJS cannot get a WebGL context and every capture is blank. WebGPU is
unavailable headless; PixiJS falls back to WebGL, which is fine.

If captures come back blank, check whether the browser has WebGL at all before
suspecting the renderer:

```bash
node tools/visual-check/smoke.mjs
# expect: {"ok":true,"renderer":"ANGLE (... SwiftShader ...)"}
```

Output goes to `.visual-check/`, which is gitignored.
