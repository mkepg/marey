# Marey Phase 6 — Packaging and Legibility

**Date:** 2026-09-27
**Status:** Design, awaiting the owner's review.
**Roadmap:** `2026-09-09-marey-engineering-roadmap-design.md` §9, read with §1,
§12 and §14.2.
**Inputs:**
- Phase 5C's execution notes and deferrals
  (`docs/plans/2026-09-24-phase-5c-lottie-video-quality.md`);
- `docs/research/2026-09-24-export-quality-findings-and-options.md`, option F;
- the probes in `docs/research/2026-09-27-phase-6-export-probes/` ("probes").

**Preserves:**
- 5B ruling R45, "one orchestration per export": compile → plan → build →
  sample happens only in `withRasterExport`.
- Roadmap §6.2: encoders never advance the simulation and never see a wall
  clock.
- The refuse-don't-degrade rule for export.
- 5A's and 5C's encoder boundaries (`lottieEncode.ts`, `textOutline.ts` and
  `apngEncode.ts` import neither pixi.js nor the Scene IR module).
- Every browser button exactly as it is.

**Amends:**
- Roadmap §9.1's "today" statements, which describe 2026-09-09 (§1.1 below).
- Roadmap §9's scope: the owner added a website redesign on 2026-09-27. It is
  specified separately, as Phase 6B (§11).
- AGENTS.md's "anything a script regenerates" rule, by one named exception for
  README media (§6.2). **Owner decision O7, to confirm at review.**

---

## 0. Decisions the owner made, 2026-09-27

| # | Question | Answer |
|---|---|---|
| O1 | Does "one export path per format" forbid a second MP4 encoder? | **No.** R45 governs as written: one orchestration, and encoders may differ. The CLI's MP4 may use x264 while the button keeps WebCodecs, gated on a measurement (§5) |
| O2 | How is ffmpeg obtained for that measurement? | The owner installs a standard Windows build (`winget install Gyan.FFmpeg`) |
| O3 | What does the package contain? | The CLI plus a small, pure compiler library. The rendering and export modules stay internal |
| O4 | Publish, or only make publishable? | **Publish to npm** as the phase's last step, after merge, and only after asking |
| O5 | How does the website redesign fit? | A second spec (6B) on the same `phase-6` branch. Execution order: packaging and CLI, then 6B, then README and determinism account, then publish |
| O6 | How is the ten-minute criterion tested? | A blind reader against a rubric fixed in advance (§6.3), with a structural checklist as a pre-check. The owner makes the final judgment |
| O7 | May the README's artifact be committed? | Proposed: yes, as a named exception (§6.2). Written into this spec on the owner's instruction to proceed; **confirm or strike at review** |
| O8 | Does CI run the export and pack checks? | Proposed: yes (§9.3). Same status as O7 |
| — | How does `marey export` run from a terminal? | Headless Chromium runs the existing pipelines (§4). Approved over pure Node and over driving the app |

---

## 1. The gap, measured

### 1.1 Corrections to roadmap §9.1

§9.1 was written on 2026-09-09. Since then a `LICENSE` (MIT), a `license`
field, a 195-line root README, `bin/marey.mjs`, and `marey check`
(`src/cli/check.ts`, with `--export-ready` and `--fps`) have all landed. The
roadmap gets a dated correction saying so rather than a silent rewrite.

### 1.2 In-scope items against the repository

| Item | State on `e7c5c29` | Gap |
|---|---|---|
| Licence | `LICENSE` (MIT) and `"license": "MIT"` | None |
| Public package | `"private": true`; `bin` points at `bin/marey.mjs`, which imports gitignored `dist/cli/marey.mjs`; no `files`, no `exports` | `npm pack --dry-run` ships **328 files, 4.19 MB**, including `docs/`, `eval/`, `tools/` and `public/`, and **no `dist/`**. An installed `marey` would only print "the CLI has not been built yet". Installing would pull app-only dependencies (monaco-editor alone is 96 MB unpacked). No library entry |
| Root README | Product statement, a compiled example, "What's actually hard", reading table | No rendered artifact, and no output shown beside the source. Stale since 5C: "Lottie `text` is refused outright", a Lottie subset without `line` or `text`, no mention of video or APNG, "the CLI exposes one command" |
| `marey check` | Works. `--export-ready` on all four canonical scenes: all ok, exit 0 | `main()` hard-codes `check` as the only command |
| `marey export` | Absent | Every exporter runs through `withRasterExport`, which needs a pixi `Application` (WebGL) and `document.fonts`; video also needs `VideoEncoder`, `VideoFrame` and `OffscreenCanvas`; Lottie needs a GL `Application` and pixi `Text` for layout |
| Determinism account | Split across five places: a README section, `renderer.md`'s `paintExactTick` explanation, `tools/visual-check/README.md`, `eval/RESULTS-GATE-B.md`'s `Math.sin` finding, and `frameHash.ts`'s docstring | One document a reader will find (§7) |

**The canonical scenes** are Phase 4 design §2's three (`bar-chart`,
`radial-dots`, `compound-logo`) plus `timeline-ticks`, all in
`eval/scenes-3b/`. `bar-chart` and `timeline-ticks` contain `text`.

### 1.3 Exit criteria (§9.3) against the repository

1. *The package builds and installs from a clean checkout.* **Not met.**
2. *A reader can state what Marey is and what is hard within ten minutes.*
   **Partly met**, and no agreed way to test it existed.
3. *Both CLI commands work on the canonical scenes.* **Half met.**

### 1.4 Dead commit citations

The 2026-09-26 history rewrite changed every hash. The determinism fix every
document calls `f9de4a9` is now **`1ce8307`** (2026-08-27, "fix(physics): snap
a container to its body when the body freezes"). `git grep f9de4a9` finds seven
citations in five files: `README.md`, `tools/visual-check/README.md` (three),
`tools/visual-check/scenes/logo-freeze.marey`, and the Phase 1 and Phase 2
plans. All are corrected in this phase (§7.3).

---

## 2. The package

### 2.1 Identity

- Name `marey`. The registry returned 404 for it on 2026-09-27, so it was
  unclaimed. npm can still refuse a name it judges too similar to an existing
  one, so the first publish is the real test.
- Version **`0.4.0`**. The IR becomes a public contract here, and Phases 7 and 8
  will still change it. Below 1.0, semver allows a breaking change in a minor
  release; 1.0 belongs to the finish line.
- `private` removed. `engines: { node: ">=22" }`, matching CI.

### 2.2 Contents

A `files` allowlist:

- `bin/`
- `dist/cli/marey.mjs`
- `dist/lib/` (the library bundle and its declarations)
- `dist/export-page/` (§4.2)
- `LICENSE`, `README.md`
- the third-party licence file for everything the export page bundles (pixi.js,
  matter-js, mediabunny, harfbuzzjs, JetBrains Mono under the OFL), generated
  by `vite-plugins/thirdPartyLicenses.ts`, the plugin the app build already
  uses.

`vite.cli.config.ts` currently copies `public/` into `dist/cli/` (the fonts, the
62 KB share image, the favicon), because Vite copies the public directory by
default. The CLI build turns that off.

### 2.3 The library entry

```ts
import { compile } from "marey";
const { ok, ir, errors } = compile(source);
```

- `exports: { ".": { types, import } }`, ESM only.
- The public surface is exactly: `compile(source)` returning
  `{ ok, ir, errors }`; the IR types from `sceneIR.ts`; and `CompilerError`.
- `compile` is a thin wrapper over `compileSource`. Its return type is a
  narrower public type, so `CompileOutcome`'s internal fields (`symbols`,
  `tokenCount`, `topLevelObjectCount`) can change without a breaking release.
- `planExport` is **not** exported: it would make the branded `SamplerPlan`
  public, and `marey check --export-ready` already answers "is this
  exportable?".
- Declarations are emitted by `tsc`, with no new build dependency.

**The boundary is enforced, not described.** A unit test walks the library
entry's static import graph and fails if it reaches `pixi.js`, `matter-js`,
`mediabunny`, `harfbuzzjs`, `src/compiler/renderer/` or `src/compiler/export/`.
The pack check (§9.2) also greps the built bundle for `pixi`. The unit test
must be shown to fail by adding such an import, then restored
(engineering-lessons §2).

### 2.4 Dependencies

- Exactly one runtime dependency: **`playwright-core`, pinned to exactly
  `1.62.1`**. The Playwright version pins the Chromium build, and the Chromium
  build pins the output bytes.
- Everything else is bundled at build time and moves to `devDependencies`:
  pixi.js, matter-js, mediabunny, harfbuzzjs, monaco-editor, preact, zustand,
  lz-string.
- The dev-only `playwright` package gets the same exact pin, so the browser
  checks and the CLI run the same Chromium.

---

## 3. The CLI surface

```text
marey check  [--export-ready] [--fps <n>] <file...>
marey export <file> --format <png|apng|webm|mp4|lottie>
             [--fps <n>] [--duration <s>] [--out <path>]
marey --help
marey --version
```

- `check` is unchanged, and so are its tests.
- `main()` gets a command table in place of its hard-coded `check`.
- **Export defaults match the button:** 30 fps (`EXPORT_FPS`), video at 2×
  (`VIDEO_SCALE`), PNG and APNG at 1×. There is no `--scale` flag, so the two
  cannot disagree about resolution.
- `--out` defaults to `<name>.<ext>`, or a folder named `<name>-frames/` for
  `png`. `--duration` is the existing explicit export bound, for a scene with no
  finite `duration`.
- **A successful export prints one line:** output path, frame count, fps, byte
  size, the SHA-256 of the file (for `png`, of the frames in index order), and
  the frame hash (`hashFrames`). For MP4 it also prints the ffmpeg version.
  Repeating an export and comparing two lines is then the whole determinism
  check a reader needs.
- Exit codes stay as `check` has them: 0 on success, 1 otherwise.

### 3.1 New diagnostics

- **`EXPORT_BROWSER_MISSING`**: the pinned Chromium is not installed. The
  message prints the exact command, pinned to Marey's own Playwright version:
  `npx --package playwright-core@1.62.1 playwright-core install chromium-headless-shell`.
  A bare `npx playwright-core install` could resolve a different Playwright,
  and so a different browser build.
- **`EXPORT_FFMPEG_MISSING`** (MP4 only, and only if §5's gate passes): ffmpeg is
  not on `PATH`, or is but lists no `libx264` encoder. It never falls back to
  WebCodecs, because a silent fallback would be the second path the rules
  forbid.

Every existing export diagnostic from the pipelines is passed through word for
word.

---

## 4. How `marey export` runs

### 4.1 The options considered

| Option | Evidence | Verdict |
|---|---|---|
| **Headless Chromium runs the existing pipelines** | Every 5A–5C browser check already runs these pipelines in Playwright's Chromium. Probes: WebGL2 on SwiftShader under the default headless launch, even on a machine with an NVIDIA GPU; VP9 supported; H.264 supported at 1600×1200 with a level-4.0 codec string; launch 193 ms | **Chosen** |
| Pure Node | Probes: the text-free canonical scenes sample (`radial-dots` 30 frames, `compound-logo` 240); both text scenes fail with `document is not defined`. Finishing it needs a canvas library for text metrics (a different font engine from the Chromium layout 5C matched to 0.01 px), a second rasterizer, and ffmpeg for WebM (Node has no WebCodecs). Compiling in Node also changes trig results in the IR (`eval/RESULTS-GATE-B.md`) | Rejected: a second path for every raster format |
| Drive the app itself | The browser harness does this through the dev server and dev seams | Rejected: ties the CLI to the app UI, which 6B redesigns; needs dev seams in production or the full app bundle; brings back the port-5199 traps |

A variant of the chosen option, using the user's installed Chrome
(`channel: "chrome"`), saves the download but lets the engine version, and so
the output bytes, vary per user. The browser is pinned, and no `--browser`
escape hatch is added.

### 4.2 The export page

- A new entry, `src/exportPage/`, built by its own Vite config into
  `dist/export-page/`. It contains the pipelines, the export font
  (`/fonts/JetBrainsMono-Regular.ttf`, `EXPORT_FONT_URL`) and the HarfBuzz wasm.
  It contains **no UI**, so the redesign cannot break it.
- It exposes one entry point for the CLI, taking `{ source, format, fps,
  durationSeconds }`.
- **The source is compiled inside the page**, so the IR, including trig
  results, is the one the button would compute in the same engine.
- It is served through `page.route` on `https://marey.export/`. Probes: a plain
  `http://` custom origin is not a secure context and has no `VideoEncoder`;
  `https://` under `page.route` is, and has one. `page.route` needs no socket,
  so there is no port to collide with.

### 4.3 One orchestration, per format

Every format goes through `withRasterExport` (R45):

| Format | Pipeline |
|---|---|
| `lottie` | `runLottieExport`, unchanged |
| `apng` | `runApngExport`, unchanged |
| `webm` | `runVideoExport`, unchanged |
| `png` | **New `pngPipeline.ts`.** The PNG sequence exists today only inside `devExportSeam.ts`; its orchestration moves into a pipeline, and the seam becomes an observer, as 5B did for video |
| `mp4` | A frames-out path: `withRasterExport` at `VIDEO_SCALE`, with `planVideo`'s sizing and `VIDEO_EXCEEDS_DEVICE_LIMITS`, emitting one lossless PNG per frame (`pngBytesOf`). `VIDEO_EXCEEDS_CODEC_LEVELS` describes WebCodecs' H.264 levels and does not apply to x264. If §5's gate fails, `mp4` uses `runVideoExport` instead and this path is not built |

### 4.4 The Node side

1. Run the `check --export-ready --fps` logic in Node first, so a scene that
   does not compile or is unbounded is refused without starting a browser.
   That Node compile is used only for diagnostics. The page's compile produces
   the output.
2. Launch the pinned headless shell with SwiftShader forced
   (`--use-angle=swiftshader`), so a machine whose headless mode picks a GPU
   still rasterizes the same way.
3. Load the export page and call its entry point.
4. Receive the output:
   - **Whole files** (Lottie, APNG, WebM) come back as the `page.evaluate`
     return value. Probes: 24–68 MB/s across two runs.
   - **Frames** (`png`, and `mp4` under §5) come back one lossless PNG at a
     time, POSTed to the routed origin at a URL carrying `FrameSnapshot.index`.
     Node places each frame by that index, never by arrival order, and refuses
     a gap or a duplicate. That is 5C ruling T4-R2's lesson: keying by arrival
     let a reversed or swapped frame order go unseen.
   - Why PNG and not raw pixels: a raw 2× frame is 7,680,000 B, and raw
     transport measured 8–68 MB/s depending on method and run. Probes: a flat
     synthetic 1600×1200 frame encodes to 52,946 B in 4.7–21.5 ms, and PNG is
     lossless, so the frames Node receives stay byte-exact.
5. Tear the browser down in `finally`, the same rule `withRasterExport` follows
   for its GL context.

---

## 5. MP4 through ffmpeg, and its gate

5C's findings (§2 item 3) attribute the MP4 specks to Chromium's software
H.264 encoder, OpenH264, and inferred that a native x264 removes them. Nobody
has measured that. So the x264 path is built only if a measurement shows it
clearly wins.

**The measurement.** Take the default scene's lossless 2× frames from the
pipeline, as `docs/research/2026-09-24-export-quality-probes/matrix.ts` does,
and encode them two ways in the same run on the same machine:

- the button's path (WebCodecs H.264, 8 Mbit/s);
- `ffmpeg -f image2pipe -c:v png -i - -c:v libx264 -pix_fmt yuv420p …`, over a
  small matrix: CRF 14 and 18, presets `medium` and `slow`, with and without
  `-tune animation`.

Score both with 5C's scorer, in its default GPU configuration, against the same
lossless reference. A same-run A/B follows 5C ruling T3-R2, so the comparison
does not rest on a table recorded in another session.

**The gate.** Use the smallest x264 setting that meets all three:

- PSNR at least **1.0 dB** above the WebCodecs file's;
- specks per frame at most **one tenth** of the WebCodecs file's;
- a file no more than **3×** the WebCodecs file's size.

For scale, 5C recorded 42.03 dB and about 65 specks per frame for the button's
2× MP4. The gate compares against the same-run number, not that one.

- **If the gate passes:** the chosen flags are fixed in code. Two runs on the
  same input must give identical SHA-256. x264's documentation describes
  repeatable output as the default (`--non-deterministic` opts out), and that
  claim is measured, not trusted; if two runs differ, add `-threads 1` and
  measure again. `-movflags +faststart` is set so the file plays while
  downloading.
- **If the gate fails:** the CLI's MP4 uses `runVideoExport`, and the result,
  with its numbers, is recorded in `eval/RESULTS-PHASE-6.md`. The frames-out
  path and `EXPORT_FFMPEG_MISSING` are not built.

**What "identical" means for MP4.** Byte identity is claimed only for the same
ffmpeg build, which is why the output line prints its version. The lossless
frames that go into any encoder are identical across the button and the CLI,
and that is checked (§9.2).

---

## 6. The README

### 6.1 Content

Written last, after 6B, so it describes the finished state.

- Opens with a rendered artifact, then the bars source beside the output it
  produces.
- Corrects the stale claims (§1.2).
- Adds an install and usage block: `npx marey check`, `npx marey export`.
- Keeps "What's actually hard", with the determinism part shortened to a summary
  that links to `docs/determinism.md` from the first screen.
- Stays within the reading budget: the README itself is at most 2,000 words.
  On `e7c5c29` it is 1,273 words. The ten-minute limit is enforced on the
  reader, not on the linked documents: §6.3's reader stops at about 2,500
  words in total (ten minutes at 250 words per minute), README first, so the
  README has to carry both answers on its own. `docs/determinism.md` may be as
  long as its subject needs.

### 6.2 The artifact (O7)

- An animated PNG made by `marey export --format apng`, committed as
  `docs/media/<scene>.png`, at most 1 MB. The `.png` extension is what lets
  GitHub serve it as an image.
- The scene it comes from is a committed `.marey` file whose text is the
  README's code block. A test asserts the two are identical, so the README
  cannot drift from the file that made its image (engineering-lessons §5).
- The regenerating command is written next to the image.
- **This is an exception to AGENTS.md's "anything a script regenerates" rule**,
  proposed as O7. AGENTS.md gets one line naming the exception: README media
  under `docs/media/`, each at most 1 MB, each with its command beside it. The
  alternative, if you strike O7, is hosting the image on the live site and
  linking to it by URL, which makes the README depend on the deployment.
- Whether GitHub animates it has to be checked on the rendered page after the
  push. If it does not, the fallback is the first frame as a still image with a
  link to the live site.

### 6.3 The ten-minute test (O6)

**The rubric, fixed now.**

*Q1: What is Marey?* A pass states all three:
1. it is a language and compiler, where motion is written as text source;
2. it compiles to portable artifacts (any of Lottie, video, APNG, PNG) that
   play without Marey;
3. it is for 2D motion graphics, not a game engine or a general animation
   library.

*Q2: What is technically hard about it?* A pass names at least two of these,
each with a correct reason:
- H1. Identical output every run with a physics engine involved: the fixed
  tick, and the boundary between simulation state and painted state.
- H2. Compiling to a portable format that needs no runtime: a baked Lottie
  subset, and refusing unsupported features instead of degrading them.
- H3. Verification: a headless suite cannot see a canvas, and a browser harness
  caught a determinism bug the suite missed.
- H4. One language contract shared by the compiler, the editor and the
  documentation.

**The procedure.**
1. The structural checklist runs first, and a read is not spent on a README
   that fails it:
   - an artifact in the first screen, with the source beside it;
   - a "what's hard" section naming at least two things;
   - a first-screen link to `docs/determinism.md`;
   - an install and usage block;
   - the README at most 2,000 words (§6.1);
   - none of the stale strings: `refused outright`, `one command`,
     `not implemented`.
2. The reader is new to the project and has no prior context. They get a `git archive`
   of the branch tip with this spec and the Phase 6 plan deleted, so the rubric
   is not in what they can read. They get the two questions and the reading budget
   (start at the README, follow any links they choose, stop at about 2,500 words
   in total), and nothing else: no rubric, no hints (engineering-lessons §3).
3. Their answers are recorded word for word in `eval/RESULTS-PHASE-6.md` and
   scored against the rubric.
4. On a fail, revise the README and use a **new** reader, never the same one.
   After three failed reads, stop and ask the owner.
5. The owner makes the final judgment.

---

## 7. The determinism account

### 7.1 Where

A new top-level `docs/determinism.md`, linked from the README's first screen
and from `docs/architecture/README.md`. `tools/visual-check/README.md` keeps a
short pointer to it and no second copy of the story.

### 7.2 What it covers

1. **What is claimed.** The same source and the same engine build give identical
   simulation state at every output frame (`hashFrames`), and identical file
   bytes from each encoder.
2. **What is not claimed**, each with its evidence:
   - identical output across JavaScript engines: `Math.sin` differs by about one
     ULP between Node's V8 and Chromium's, and trig is folded into the IR at
     parse time (`eval/RESULTS-GATE-B.md`);
   - identical output across machines: plausible with SwiftShader, which runs
     on the CPU, but untested, because there is one machine;
   - identical MP4 bytes across ffmpeg builds;
   - that paint cadence cannot matter for a scene with a `sequence`: never
     tested (Phase 4's execution notes).
3. **The mechanism:**
   - the fixed 120 Hz tick and the single seconds-to-ticks conversion
     (`sceneIR.ts`);
   - the tick/paint split, and why `alpha` means opposite things to animation
     (extends forward from tick N) and to physics (interpolates back from
     tick N), which is what `paintExactTick()` resolves;
   - the sampler maps a frame index to a tick count and never sees a clock;
   - encoders never advance the simulation;
   - gravity is applied as a velocity change, not a force; sleeping is driven
     manually; Matter.js is pinned with no caret.
4. **How it is verified**, each with the command that reproduces it: the
   headless determinism tests, the harness's freeze scenes, and the CLI's
   run-twice check (§3).
5. **The `1ce8307` story**, re-derived from the commit and the tests at that
   point, not copied from the existing paragraph:
   - a box frozen mid-air on `duration` expiry kept its last *painted*
     position, because freezing pins the body and pinned bodies are not synced;
     that paint used the wall-clock `alpha`;
   - at 450 px/s that is up to 3.75 px, which settled into two different pixel
     results depending on the page load;
   - the fix writes the tick-aligned state at the moment of the freeze, and the
     scene then matched byte for byte across six loads;
   - why the headless suite could not see it (the "94 tests" figure is recounted
     at `1ce8307`'s parent before it is repeated);
   - why a scene that settles hides a divergence, and why `freeze-midair.marey`
     exists.

### 7.3 Citation fixes

The seven `f9de4a9` citations (§1.4) become `1ce8307`. The historical plans get
a dated note, not a silent rewrite, since that is how this repository corrects
records.

---

## 8. Documentation and roadmap edits

- Roadmap §9: a dated correction of §9.1 (§1.1), and a dated amendment
  recording 6B as added by the owner.
- `docs/architecture/README.md`'s phase status and `roadmap-and-process.md`'s
  Phase 6 bullet, updated together (engineering-lessons §5b).
- `renderer.md`: a section on the export page and the CLI boundary: what runs
  in Node, what runs in the page, and why.
- AGENTS.md:
  - the O7 exception line;
  - the sentence "The first, third and fourth are what CI runs" gains the O8
    checks.

  The before-every-commit list itself is unchanged: the export check needs a
  browser and ffmpeg, and runs in CI and before merge.

---

## 9. Verification and exit evidence

### 9.1 Headless (in `npm test`)

- CLI argument parsing and command dispatch, for both commands.
- The ffmpeg argument builder, and the choice between `EXPORT_BROWSER_MISSING`
  and `EXPORT_FFMPEG_MISSING`, against fakes.
- The frame-reassembly rule: a gap, a duplicate, or an out-of-order arrival is
  placed or refused by index.
- The library boundary test (§2.3).
- The README-block-equals-scene-file test (§6.2).
- Every new behaviour is checked by deleting the line that implements it and
  running the suite (engineering-lessons §2c).

### 9.2 Scripted (need Chromium, and ffmpeg for MP4)

- **`npm run check:export`**:
  - every canonical scene in every format, exported twice, with identical
    SHA-256 both times;
  - CLI output compared byte for byte with the dev seam's output from the same
    Chromium build, for `png`, `apng`, `lottie` and `webm`. A mismatch is either
    a defect or a reason documented at the encoder boundary, never ignored;
  - for `mp4`: the CLI's lossless frames equal the seam's reference frames, and
    the encoded file is scored as §5 describes.
- **`npm run check:pack`**: `npm pack`, install the tarball into an empty
  temporary directory, then run `marey --version`, `marey check`,
  `marey export` on one scene, and a script that does
  `import { compile } from "marey"`. This is exit criterion 1 as a command.
- **5C deferral 14 closes.** `route.abort` on the font request is exactly the
  probe needed to show `EXPORT_FONT_UNAVAILABLE` fires on a genuinely failed
  load.

### 9.3 CI (O8)

CI gains two steps: install ffmpeg (`apt-get install -y ffmpeg`, not assumed
present) and the pinned browser, then run `check:export` and `check:pack`. If
`check:export` takes more than about ten minutes on a runner, CI runs one scene
per format and the full matrix stays a before-merge check. The measured time is
recorded.

### 9.4 Exit criteria, each closed by a command

| §9.3 criterion | Closed by |
|---|---|
| The package builds and installs from a clean checkout | `npm run check:pack` on a fresh clone |
| A reader states what Marey is and what is hard within ten minutes | §6.3's procedure, answers recorded word for word, and the owner's judgment |
| Both CLI commands work on the canonical scenes | `check --export-ready` and `check:export`'s matrix |

All three go in `eval/RESULTS-PHASE-6.md`, one section each, with the command
that reproduces it.

---

## 10. Out of scope

- The website redesign: Phase 6B, its own spec (§11).
- The silent `sequence` plus `loop: true` language gap (findings §5): a
  language change, for Phase 7.
- 5C deferrals 13 (emoji presentation sequences) and 15 (a text-free Lottie
  export still loads the HarfBuzz wasm).
- Verifying identical output across machines.
- Anything §9.2 of the roadmap excludes: a GitHub Action for others, doc-tool
  integrations, an embeddable player, a gallery, adoption metrics.

---

## 11. Relation to Phase 6B

6B, the website redesign, gets its own design and plan on the same branch. This
phase's only obligation to it is §4.2: the export page shares no UI code, so a
redesign cannot break `marey export`. The README (§6) is written after 6B, so
any screenshot of the app shows the redesigned one.

---

## 12. Risks

| Risk | What happens |
|---|---|
| x264 does not clearly beat WebCodecs | §5's fallback: the CLI's MP4 uses `runVideoExport`, recorded with its numbers |
| CLI and seam WebM bytes differ in the same Chromium | Investigated as a defect first. If it is inherent to the encoder, the reason is documented at the encoder boundary, per roadmap §8.1 |
| The 272 MB browser download puts off a reader trying `npx marey export` | `check` needs no browser; the README says which commands need one and prints the pinned install command |
| npm refuses the name `marey` | Found at publish time. The fallback is a scope (`@mkepg/marey`), which is the owner's decision then |
| GitHub does not animate the APNG | §6.2's fallback |
| Transport numbers vary by a factor of 3 between runs | Only the ranking is relied on, and PNG-per-frame wins by two orders of magnitude in size |
