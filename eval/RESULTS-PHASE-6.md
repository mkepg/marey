# Phase 6 evidence

**Phase:** 6 (`docs/specs/2026-09-27-marey-phase-6-packaging-and-legibility-design.md`).
**Date:** 2026-09-28 to 2026-10-07. Branch `phase-6`, merged into `main` on
2026-10-02; then `phase-6-finish` for the README, the ten-minute read and the
exit-criteria sections, all measured at `a4e4cee`.

This file is the standing evidence record for Phase 6, in the same spirit as
`eval/RESULTS-PHASE-5B.md`/`RESULTS-PHASE-5C.md`: measured numbers, with the
command that produced each one, so a later reader can re-run rather than
trust a paraphrase. One section per piece of the phase.

## Exit criteria (spec §9.4), 2026-10-07

Roadmap §9.3's three criteria, each with the command that closes it. Every
number was measured on a clean tree at `a4e4cee` (`git status --porcelain`
and `git diff --stat` both empty), Windows 11, Node 22.13.1.

| Criterion | Command | Result |
|---|---|---|
| 1. The package builds and installs from a clean checkout | `npm run build:package && npm run check:pack` | **Not closed.** 11 of 11 checks pass on this machine, exit 0, 17.0 s. On a fresh clone in CI the same check fails at `npm install --offline <tarball>` (`ENOTCACHED`), on all four pushes since it was added. Cause reproduced locally. The fix (`--prefer-offline`) is committed and passes on the warm local cache; CI's cold cache is confirmed only by the next push. See "Exit criterion 1" |
| 2. A reader states what Marey is and what is hard within ten minutes | spec §6.3's procedure | One read, scored against the rubric: Q1 3 of 3, Q2 3 of 4 (H1, H2, H4), so it **passes** the rubric. **The owner's judgment is pending** (spec O6). See "Exit criterion 2" |
| 3. Both CLI commands work on the canonical scenes | `node bin/marey.mjs check --export-ready eval/scenes-3b/*.marey`; `npm run check:export` | 4 of 4 `ok`, exit 0; 21 of 21 cases pass, exit 0, 111.2 s. See "Exit criterion 3" |

The four AGENTS.md checks on the same tree, before the runs above: `npm test`
61 files, 1306 tests, all passing; `npx vitest run --config
eval/vitest.config.ts` 1 file, 5 tests; `npm run build` exit 0 (the existing
chunk-size warning only); `npm run build:cli && node bin/marey.mjs check
$(git ls-files '*.marey')` exit 0, 85 files, every one `ok`.

---

## CLI export matrix

`npm run check:export` (`tools/cli-check/export-matrix.mjs`, spec §9.2) drives
`exportScene`, the function behind `marey export`, from the built CLI bundle
(`dist/cli/marey.mjs`). It has two modes.

- **Default** (CI). Each of the four canonical scenes in `eval/scenes-3b/`, in
  each of `png apng webm mp4 lottie`, is exported twice at 30 fps and the
  scene's own duration, each export in its own browser. It asserts that the
  two `hash`es (`hashFrames` over the sampled snapshots) are equal; that the
  two SHA-256s of the output are equal for png, apng, webm and lottie (for
  png, over the frames in index order, as `marey export` hashes what it
  writes); and for png that the frames received number `frameCount`. For mp4
  the SHA-256 identity is reported on the case's line and not gated, under
  R47, while MP4 is encoded through WebCodecs (see "The mp4 bytes" below). It
  checks each size against the bytes:
  png frames and the APNG by their IHDR, the Lottie document by `w`/`h`, all at
  the scene's declared 800x600; webm and mp4 by the coded size mediabunny's
  demuxer reads from the container, at exactly 1600x1200 (`VIDEO_SCALE` 2).
  Then it exports `bar-chart` as png with the font request
  (`/fonts/JetBrainsMono-Regular.ttf`) aborted, and expects a rejection whose
  message starts with `[EXPORT_FONT_UNAVAILABLE]` (5C deferral 14).
- **`--compare-seams`** (before merge; needs the dev server). For each scene it
  exports png, apng, lottie and webm through the CLI once, then calls the
  matching dev seam in a fresh page of the app, in a Chromium launched with the
  same `EXPORT_LAUNCH_ARGS`, and compares byte for byte: every png frame; the
  APNG file; the Lottie file's text against `JSON.stringify(doc)` computed in
  the page; the WebM file. Every `hash` a seam reports must equal the CLI's.
  `__mareyExportApng` reports no `hash`, so for apng the file bytes are the
  whole comparison.

The runs in this section are from 2026-09-28, before Phase 6C changed
compound-logo's `frames` hash. The 2026-10-07 run is under "Exit criterion 3".

Measured at `a861a37` plus the script (`13c5348`, and the mp4 change on top of it), from
`C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey`, Windows 11, Chromium
151.0.7922.34 (the headless shell of `playwright-core` 1.62.1; `playwright`
1.62.1 launches the same build).

### Default mode: 21 of 21 pass, mp4 bytes reported

```
npm run build:export-page && npm run build:cli && npm run check:export
```

Exit 0. Total **100.5 s** as the script reports it (`real 1m41.4s` under
`time`, including npm's start-up). Each time covers both exports of the case.

| Scene | Format | Result | Time (s) | Frames | Size | sha256 (first 16) | `hash` |
|---|---|---|---|---|---|---|---|
| bar-chart | png | ok | 3.4 | 30 | 800x600 | `ee2b6ddadd11e709` | `0adcc9f9` |
| bar-chart | apng | ok | 2.7 | 30 | 800x600 | `c6e51569220cf225` | `0adcc9f9` |
| bar-chart | webm | ok | 4.2 | 30 | 1600x1200 | `19bf665bb55445f6` | `0adcc9f9` |
| bar-chart | mp4 | ok | 3.9 | 30 | 1600x1200 | differs, reported: `3ae2c46972547e2b` vs `da9493307490a711` | `0adcc9f9` |
| bar-chart | lottie | ok | 1.0 | 30 | 800x600 | `79aa2ffc7216b022` | `0adcc9f9` |
| radial-dots | png | ok | 3.1 | 30 | 800x600 | `d6a1fb2fdcd8d9f7` | `94d15a5d` |
| radial-dots | apng | ok | 3.2 | 30 | 800x600 | `9d9234324f1709ee` | `94d15a5d` |
| radial-dots | webm | ok | 3.8 | 30 | 1600x1200 | `81f81ac2c5a10961` | `94d15a5d` |
| radial-dots | mp4 | ok | 3.8 | 30 | 1600x1200 | differs, reported: `e9fa408b7e0491c7` vs `4aff63546779c845` | `94d15a5d` |
| radial-dots | lottie | ok | 1.1 | 30 | 800x600 | `5aba4b1aff965c8f` | `94d15a5d` |
| compound-logo | png | ok | 10.0 | 240 | 800x600 | `79f3f2947d9c4407` | `26cca4e9` |
| compound-logo | apng | ok | 10.6 | 240 | 800x600 | `df3988b9223c6f87` | `26cca4e9` |
| compound-logo | webm | ok | 16.5 | 240 | 1600x1200 | `89b23932748ef09d` | `26cca4e9` |
| compound-logo | mp4 | ok | 16.6 | 240 | 1600x1200 | differs, reported: `603043209070641b` vs `a36ce97c8c7971b3` | `26cca4e9` |
| compound-logo | lottie | ok | 1.1 | 240 | 800x600 | `e80dffee8bba7f3c` | `26cca4e9` |
| timeline-ticks | png | ok | 3.2 | 30 | 800x600 | `3443dd4a85e13b0a` | `93ac7785` |
| timeline-ticks | apng | ok | 3.2 | 30 | 800x600 | `c7ccaafa0f3c7b53` | `93ac7785` |
| timeline-ticks | webm | ok | 3.8 | 30 | 1600x1200 | `dd5d14a7365ce0b5` | `93ac7785` |
| timeline-ticks | mp4 | ok | 3.8 | 30 | 1600x1200 | differs, reported: `5c393a38e232fbcc` vs `7f7758e5c3f72019` | `93ac7785` |
| timeline-ticks | lottie | ok | 1.0 | 30 | 800x600 | `38c44cdd8fff0b15` | `93ac7785` |
| bar-chart | png, font aborted | ok | 0.4 | | | | |

Each mp4 line reads, for example,
`sha256 differs: 3ae2c46972547e2b vs da9493307490a711 (reported, not gated: R47)`.
Every non-mp4 sha256 is the same as in the first run below. After the
unreadable-file handling in the last mutation row was added, the command was
run again with the committed script: exit 0, 21 of 21, **101.8 s**
(`real 1m42.7s`). Every non-mp4 sha256 and every `hash` was unchanged. All
four mp4 cases again differed and were reported, e.g. bar-chart
`a6fc21eb86a570fc` vs `3aafd07931938a61`.

The wall time is not stable on this machine: the first run below, with the
same 42 exports, took 233.3 s. Both are under spec §9.3's ten-minute CI
budget; the time on a CI runner is not measured here.

#### First run, with mp4 bytes gated: 17 of 21 pass

The first version of the check gated every format on SHA-256, as spec §9.2
words it. The same command then exited 1 after **233.3 s**
(`real 3m54.9s`), with every mp4 case failing on its SHA-256 alone:

| Scene | Format | Result | Time (s) | Frames | Size | sha256 (first 16) | `hash` |
|---|---|---|---|---|---|---|---|
| bar-chart | png | ok | 5.3 | 30 | 800x600 | `ee2b6ddadd11e709` | `0adcc9f9` |
| bar-chart | apng | ok | 4.0 | 30 | 800x600 | `c6e51569220cf225` | `0adcc9f9` |
| bar-chart | webm | ok | 9.3 | 30 | 1600x1200 | `19bf665bb55445f6` | `0adcc9f9` |
| bar-chart | mp4 | **FAIL** | 9.3 | 30 | 1600x1200 | `2728aee2d7d1db7d` vs `6a600bf0faf34c59` | `0adcc9f9` |
| bar-chart | lottie | ok | 3.8 | 30 | 800x600 | `79aa2ffc7216b022` | `0adcc9f9` |
| radial-dots | png | ok | 4.0 | 30 | 800x600 | `d6a1fb2fdcd8d9f7` | `94d15a5d` |
| radial-dots | apng | ok | 5.1 | 30 | 800x600 | `9d9234324f1709ee` | `94d15a5d` |
| radial-dots | webm | ok | 7.5 | 30 | 1600x1200 | `81f81ac2c5a10961` | `94d15a5d` |
| radial-dots | mp4 | **FAIL** | 7.6 | 30 | 1600x1200 | `f7aef3dbd79640fb` vs `be118bebd2257760` | `94d15a5d` |
| radial-dots | lottie | ok | 3.7 | 30 | 800x600 | `5aba4b1aff965c8f` | `94d15a5d` |
| compound-logo | png | ok | 21.6 | 240 | 800x600 | `79f3f2947d9c4407` | `26cca4e9` |
| compound-logo | apng | ok | 16.6 | 240 | 800x600 | `df3988b9223c6f87` | `26cca4e9` |
| compound-logo | webm | ok | 42.4 | 240 | 1600x1200 | `89b23932748ef09d` | `26cca4e9` |
| compound-logo | mp4 | **FAIL** | 56.4 | 240 | 1600x1200 | `21caa1a81bfd0afb` vs `d8f125e23e42c259` | `26cca4e9` |
| compound-logo | lottie | ok | 6.9 | 240 | 800x600 | `e80dffee8bba7f3c` | `26cca4e9` |
| timeline-ticks | png | ok | 6.0 | 30 | 800x600 | `3443dd4a85e13b0a` | `93ac7785` |
| timeline-ticks | apng | ok | 5.3 | 30 | 800x600 | `c7ccaafa0f3c7b53` | `93ac7785` |
| timeline-ticks | webm | ok | 6.7 | 30 | 1600x1200 | `dd5d14a7365ce0b5` | `93ac7785` |
| timeline-ticks | mp4 | **FAIL** | 7.8 | 30 | 1600x1200 | `bbce11a0220413ed` vs `2afae0857ef199f0` | `93ac7785` |
| timeline-ticks | lottie | ok | 3.0 | 30 | 800x600 | `38c44cdd8fff0b15` | `93ac7785` |
| bar-chart | png, font aborted | ok | 0.8 | | | | |

#### Across all three runs

The font-abort case's full message:
`[EXPORT_FONT_UNAVAILABLE] The export font 'JetBrains Mono' did not load at 20px, so this scene's text cannot be exported to match the preview. Check the connection and export again.`

In every run compound-logo's `hash` is `26cca4e9` in every format, the value
`export-check.mjs` records for its png at 30 fps, and every size assertion
passed: each export's bytes and reported sizes are 800x600 for png (every frame's
IHDR), apng and lottie, and 1600x1200 for webm and mp4.

**The mp4 bytes.** `marey export --format mp4` currently goes through the
page's WebCodecs path, the one the export button uses (spec §5 moves it to
ffmpeg later). The simulation is identical in both runs (`hash` equal); the
file is not. Two bar-chart exports, compared outside the matrix (two
`exportScene` calls, the bytes compared and the ISOBMFF boxes walked), came to
24,631 and 23,772 bytes and differ in 14,072 of the overlapping bytes, from
two sources:

- the creation and modification times mediabunny writes into `mvhd`, `tkhd`
  and `mdhd` (bytes 48-55, 164-171 and 264-271): `3873373185` and
  `3873373190`, five seconds apart, the wall-clock times of the two exports;
- the H.264 bitstream: 29 of the 30 sample sizes in `stsz` differ (the first
  eight: `8443,171,76,10092,772,395,404,241` against
  `8443,133,74,10275,770,356,312,210`).

This is the MP4 property `docs/architecture/renderer.md` already documents
("The container determinism asymmetry") and `eval/RESULTS-PHASE-5B.md`
measured under criterion 2: MP4 through WebCodecs is not byte-identical
between runs, and `video-check.mjs` reports MP4 bytes without gating on them
(R47). The matrix follows the same rule while MP4 is encoded through
WebCodecs. mp4 is gated on its two runs' `hash` and on its size, read from the
bytes. Its SHA-256 identity is reported on its line and not gated. The
formats whose bytes gate are one constant, `BYTE_GATED_FORMATS` in
`export-matrix.mjs`, so an MP4 encoder that is byte-identical becomes a gate by
adding `"mp4"` to it. The first run above is what gating it on WebCodecs
gives: exit 1.

### `--compare-seams`: 16 of 16 equal, WebM included

```
npx vite --port 5199 --strictPort        # separate terminal
node tools/cli-check/export-matrix.mjs --compare-seams
```

Exit 0. Total **184.9 s** (`real 3m5.7s`). A second run after the mutation
below was restored: exit 0, 16 of 16 equal, 123.4 s.

| Scene | Format | Frames | CLI bytes | sha256 (first 16) | `hash` CLI = seam | Bytes |
|---|---|---|---|---|---|---|
| bar-chart | png | 30 | 423,120 | `ee2b6ddadd11e709` | `0adcc9f9` | equal, 30/30 frames |
| bar-chart | apng | 30 | 421,651 | `c6e51569220cf225` | seam reports none | equal |
| bar-chart | lottie | 30 | 15,305 | `79aa2ffc7216b022` | `0adcc9f9` | equal |
| bar-chart | webm | 30 | 23,319 | `19bf665bb55445f6` | `0adcc9f9` | equal |
| radial-dots | png | 30 | 440,220 | `d6a1fb2fdcd8d9f7` | `94d15a5d` | equal, 30/30 frames |
| radial-dots | apng | 30 | 438,751 | `9d9234324f1709ee` | seam reports none | equal |
| radial-dots | lottie | 30 | 5,848 | `5aba4b1aff965c8f` | `94d15a5d` | equal |
| radial-dots | webm | 30 | 18,632 | `81f81ac2c5a10961` | `94d15a5d` | equal |
| compound-logo | png | 240 | 3,289,789 | `79f3f2947d9c4407` | `26cca4e9` | equal, 240/240 frames |
| compound-logo | apng | 240 | 3,277,658 | `df3988b9223c6f87` | seam reports none | equal |
| compound-logo | lottie | 240 | 42,074 | `e80dffee8bba7f3c` | `26cca4e9` | equal |
| compound-logo | webm | 240 | 872,712 | `89b23932748ef09d` | `26cca4e9` | equal |
| timeline-ticks | png | 30 | 450,930 | `3443dd4a85e13b0a` | `93ac7785` | equal, 30/30 frames |
| timeline-ticks | apng | 30 | 449,461 | `c7ccaafa0f3c7b53` | seam reports none | equal |
| timeline-ticks | lottie | 30 | 22,963 | `38c44cdd8fff0b15` | `93ac7785` | equal |
| timeline-ticks | webm | 30 | 16,487 | `dd5d14a7365ce0b5` | `93ac7785` | equal |

Every sha256 here equals the default mode's for the same case, so the CLI's
png, apng, lottie and webm output was the same in all four runs of each case
(two in default mode, one in each `--compare-seams` run). The WebM bytes equal
the seam's in every scene, so spec §12's second risk (CLI and seam WebM bytes
differing in the same Chromium) did not occur, and there is no encoder-boundary
note to add.

### Mutations: each assertion made to fail

Each mutation was applied, the page or CLI rebuilt, the check run, and the
file restored and rebuilt; `git diff --stat -- src/` was empty after each
restore. Except the first, they ran through a copy of the script restricted to
`bar-chart` (its scene loops filtered, its format list set per row).

| Mutation | Mode | Result |
|---|---|---|
| Page's png branch posts frame 5's bytes as index 6 and frame 6's as index 5 (`src/exportPage/main.ts`) | `--compare-seams`, full | exit 1, 15 of 16 equal. `FAIL compound-logo png ... \| 2 frame(s) differ, first 5, 6`. The three other scenes do not move: they are still images, so their frames 5 and 6 are the same bytes |
| `pngPipeline.ts` and `apngPipeline.ts` rasterize at `scale: 2` | default, png and apng | png: `run 1: frame 0's IHDR 1600x1200, expected 800x600` (the reported size stays 800x600, so only the IHDR check sees it); apng: reported and bytes both `1600x1200, expected 800x600` |
| Page's Lottie text gains `nm: Math.random()`; page's apng `hash` gains a random suffix | default, apng and lottie | lottie: `sha256 differs: d21cf8d048921241 vs 77c5031a162122f2`; apng: `hash differs` |
| CLI bundle drops frame 0 from the frames it returns | default, png | `run 1: 29 frames received, frameCount 30` |
| `VIDEO_SCALE = 1`, with the page still reporting twice the plan's size | default, webm and mp4 | `run 1: bytes 800x600, expected 1600x1200` for both (reported 1600x1200 passed) |
| The aborted path is `/fonts/Missing.ttf` instead of the font | default, font case | `resolved; expected a rejection starting [EXPORT_FONT_UNAVAILABLE]` |
| Page's Lottie text gains `nm: "mutated"`; the APNG's last byte flipped; the webm `hash` gains `x` | `--compare-seams`, bar-chart | lottie: `Lottie text differs: CLI 15301 B, seam 15305 B, first difference at byte 66`; apng: `file differs: ... first difference at byte 421650`; webm: `hash CLI 0adcc9f9x, seam 0adcc9f9`. png stayed equal |
| The script makes run 2's mp4 `hash` differ (appends `x`) | default, mp4 | `FAIL bar-chart mp4 ... sha256 differs: 49b6d606ef55196c vs 83c72fe7dcd6483e (reported, not gated: R47) \| hash differs: 0adcc9f9 vs 0adcc9f9x`: the reported SHA-256 does not fail the case, the `hash` does |
| The script changes run 2's Lottie `nm` (valid JSON) | default, lottie | `sha256 differs: 79aa2ffc7216b022 vs e6e2241234128599`: lottie's bytes still gate |
| The script makes run 2's Lottie file invalid JSON | default, lottie | `run 2: w/h unreadable, expected 800x600; sha256 differs: ...`: a FAIL line, and the run goes on |

The rows above the last three ran against the first version of the script,
which gated mp4 on SHA-256. The mp4 row of the `VIDEO_SCALE` mutation failed
on its size in that version as well as on its SHA-256. The last three rows ran
against the current version. Gating mp4 on SHA-256 again is the first run in
"Default mode" above: exit 1.

---

## Exit criterion 1: the package builds and installs

Spec §2.1-2.4 makes the package publishable: version `0.4.0`, `private`
removed, `engines: { "node": ">=22" }`, an `exports` map to the library
bundle and its declarations, a `files` allowlist (`bin/`, `dist/cli/marey.mjs`,
`dist/lib/`, `dist/export-page/`), and exactly one runtime dependency
(`playwright-core@1.62.1`); harfbuzzjs, lz-string, matter-js, mediabunny,
monaco-editor, pixi.js, preact and zustand move to `devDependencies`, each
version string unchanged. `npm run check:pack`
(`tools/cli-check/pack-check.mjs`, spec §9.2) is exit criterion 1 (§9.4) as a
command: it builds the package, packs it, installs the tarball into an empty
directory with `npm install --offline`, and runs the CLI and the library from
there.

### The manifest move: `npm install --offline`

```
npm install --offline
```

Exit 0, offline, no network access needed: every moved package was already in
`node_modules` from the last `dependencies` install. `git diff --stat --
package-lock.json` reports 37 insertions and 12 deletions; `git diff --
package-lock.json` shows exactly three kinds of change: the root package's
`version` field (twice, top and nested), its `dependencies` map shrinking to
`{ "playwright-core": "1.62.1" }` with the other eight moving into
`dependencies` → `devDependencies`, and `"dev": true` appearing on 22 packages
already in the tree — the eight moved packages themselves and 14
transitive-only dependencies of theirs (`@pixi/colord`,
`@types/dom-mediacapture-transform`, `@types/dom-webcodecs`, `@types/earcut`,
`@types/trusted-types`, `@webgpu/types`, `@xmldom/xmldom`, `earcut`,
`eventemitter3`, `gifuct-js`, `ismobilejs`, `js-binary-schema-parser`,
`parse-svg-path`, `tiny-lru`). Confirmed by loading both revisions of the
lockfile as JSON and diffing every `packages` entry field by field (not just
scanning the text diff): no package was added or removed, no `dev` flag went
the other way, and no field other than `dev` and the root package's own
`version`/`dependencies`/`devDependencies`/`engines` changed on any entry.

### `npm run check:pack`: 11 of 11 checks pass

```
npm run build:package && npm run check:pack
```

Measured at `C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey`, Windows 11,
right after the four AGENTS.md checks (`npm run build` had just emptied
`dist/`, per requirement 1: `build:package` runs after it, never before).
Exit 0, **15.6 s** total (`real 0m15.628s`, `build:package` plus
`check:pack`); `check:pack` alone measured **12.3 s** in an earlier run.

| # | Check | Result | Time (s) | Detail |
|---|---|---|---|---|
| 1 | `build:package` | ok | 3.2 | built dist/lib, dist/export-page, dist/cli |
| 2 | `npm pack --json` | ok | 0.9 | 57 files, 578,129 B packed, 1,786,581 B unpacked |
| 3 | `npm init -y` | ok | 0.7 | package.json created |
| 4 | `npm install --offline <tarball>` | ok | 1.3 | installed |
| 5 | `npx marey --version` | ok | 1.7 | `0.4.0` |
| 6 | `npx marey check <copy of radial-dots.marey>` | ok | 1.1 | `...\radial-dots.marey: ok` |
| 7 | `npx marey export <copy> --format lottie` | ok | 2.1 | `wrote radial-dots.json  30 frames @ 30 fps  800x600  5848 B  sha256 5aba4b1aff965c8f6ab927fa83757ca18c8b2f911d3214cd8d60c2bf9e0d13c6  frames 94d15a5d` |
| 8 | `node -e "import { compile } from 'marey'"` | ok | 0.0 | compiled a 10x10 scene |
| 9 | consumer typecheck, esnext / bundler | ok | 0.4 | 0 errors |
| 10 | consumer typecheck, nodenext / nodenext | ok | 0.4 | 0 errors |
| 11 | `grep -c pixi` on the installed library bundle | ok | 0.0 | `grep -c pixi: 0` |

Check 7 runs against the machine's already-installed Chromium (the pinned
`playwright-core` build); no environment variable is set. Every size in the
`npm pack` line came from `npm pack --json`'s own report, cross-checked
against `git ls-files` never appearing in the list: none of the 57 packed
paths starts with `docs/`, `eval/`, `tools/`, `src/` or `public/`.

**One deviation from a literal reading of the check's `--types ""`.** tsc's
own command-line parser rejects a literal empty-string argument to any
list-type option (`--types`, here) before the list parser — which turns `""`
into `[]` without complaint — ever runs: `parseOptionValue` raises
`Compiler option 'types' expects an argument` (TS6044) whenever `!args[i]`,
independent of the option's own handling. Confirmed by reading
`node_modules/typescript/lib/typescript.js`'s `parseOptionValue` and
`parseListTypeOption`, and by reproducing the failure with `spawnSync` calling
`tsc` directly (bypassing the shell, so it is not a quoting artifact).
`pack-check.mjs` instead passes `--types` with no following value, immediately
before the next `--` flag: with nothing to consume, it resolves to an explicit
`types: []`, the same "no ambient `@types`" result the literal `""` was meant
to produce, confirmed by running both variants directly against
`node_modules/typescript/bin/tsc`. The install directory has no `@types/*`
package either way, since only `marey` and `playwright-core` are installed
there, so this only guards against one appearing later.

### Mutations: each assertion made to fail, then restored

Both were run as the full `npm run check:pack`, which stops at the first
failing check.

| Mutation | Result | Restored |
|---|---|---|
| `node tools/build/fix-dts-extensions.mjs` dropped from `build:lib` | Checks 1-9 pass (including the esnext/bundler typecheck); check "consumer typecheck: nodenext / nodenext" fails: `TS2460` (`IRSceneNode`/`CompilerError` re-export identity, itself a symptom) plus four `TS2834` "Relative import paths need explicit file extensions ... when `--moduleResolution` is `node16` or `nodenext`" pointing at `node_modules/marey/dist/lib/types/package/index.d.ts`. The script stops there; the `pixi` check never runs. | `git diff --stat -- package.json` empty after restoring the `build:lib` line |
| `dist/export-page/` removed from `files` | Checks 1-6 pass (the tarball packs to 33 files, 66,594 B, missing the whole export page); check "npx marey export <copy> --format lottie" fails: `[export] The export page is not built: ...\node_modules\marey\dist\export-page\index.html is missing.` | `git diff --stat -- package.json` empty after restoring the `files` array |

### Four AGENTS.md checks, same session

All four ran clean before the `build:package && check:pack` run above:
`npm test` (53 files, 1142 tests), `npx vitest run --config
eval/vitest.config.ts` (1 file, 5 tests), `npm run build` (typecheck plus the
app's `vite build`), and `npm run build:cli && node bin/marey.mjs check
$(git ls-files '*.marey')` (every first-party `.marey` scene, `ok`).

### Re-run 2026-10-07 at `a4e4cee`: 11 of 11 pass

```
npm run build:package && npm run check:pack
```

Run right after the four AGENTS.md checks listed at the top of this file, on
the same clean tree. Exit 0, `real 0m17.044s`.

| # | Check | Result | Time (s) | Detail |
|---|---|---|---|---|
| 1 | `build:package` | ok | 3.2 | built dist/lib, dist/export-page, dist/cli |
| 2 | `npm pack --json` | ok | 0.9 | 57 files, 579,484 B packed, 1,790,638 B unpacked |
| 3 | `npm init -y` | ok | 1.1 | package.json created |
| 4 | `npm install --offline <tarball>` | ok | 1.3 | installed |
| 5 | `npx marey --version` | ok | 1.6 | `0.4.0` |
| 6 | `npx marey check <copy of radial-dots.marey>` | ok | 1.2 | `...\radial-dots.marey: ok` |
| 7 | `npx marey export <copy> --format lottie` | ok | 2.9 | `wrote radial-dots.json  30 frames @ 30 fps  800x600  5848 B  sha256 5aba4b1aff965c8f6ab927fa83757ca18c8b2f911d3214cd8d60c2bf9e0d13c6  frames 94d15a5d` |
| 8 | `node -e "import { compile } from 'marey'"` | ok | 0.1 | compiled a 10x10 scene |
| 9 | consumer typecheck, esnext / bundler | ok | 0.4 | 0 errors |
| 10 | consumer typecheck, nodenext / nodenext | ok | 0.4 | 0 errors |
| 11 | `grep -c pixi` on the installed library bundle | ok | 0.0 | `grep -c pixi: 0` |

Beside the 2026-09-28 run: the same 57 files; the tarball is 1,355 B larger
packed and 4,057 B larger unpacked (the README and the bundles the
tarball holds have changed since); check 7's line is identical, byte for byte.

### On a fresh clone, in CI: fails at the offline install

Spec §9.4 closes this criterion with `check:pack` on a fresh clone. The only
fresh clones it has run on are CI's, and every one failed:

```
gh run list --limit 8
gh run view <run id> --log-failed
```

| Run | Commit on `main` | Date | Result |
|---|---|---|---|
| 37008376353 | `14059ac` | 2026-10-02 | failure at "Package builds, packs and installs" |
| 37019433519 | `50236f2` | 2026-10-02 | the same |
| 37025612509 | `7e09051` | 2026-10-02 | the same |
| 37136330252 | `c7b87ae` | 2026-10-03 | the same |

The earlier runs in the list, up to `e7c5c29` on 2026-09-27, predate the
check and passed. In each failing run the test suite, the build and the
scene check pass, and `check:pack` passes `build:package`, `npm pack`
(57 files) and `npm init`, then stops:

```
FAIL  npm install --offline <tarball>               0.4 s  exit 1
npm error code ENOTCACHED
npm error request to https://registry.npmjs.org/playwright-core failed: cache mode is 'only-if-cached' but no cached response is available.
```

The export matrix comes after it in the same job, so it has never run in CI,
and the CI time spec §9.3 asks for is not measured (see "CI (O8)").

**Cause, reproduced.** Plan Task 10 installs the tarball with `--offline`,
reasoning that `playwright-core` is "already in the npm cache from installing
this repository" (`pack-check.mjs`'s header). That holds on this machine,
whose cache also holds npm's registry metadata for the package from earlier
`npm install` runs. It does not hold after `npm ci`, which fetches tarballs by
the lockfile's resolved URLs. Installing into an empty directory has no
lockfile, so npm needs the metadata to resolve `playwright-core@1.62.1`, and
offline it has none. Reproduced with a fresh cache in a temporary directory:

```
npm ci --cache <fresh>                      # a package.json and lockfile holding only playwright-core 1.62.1
npm install --offline --cache <fresh> <marey-0.4.0.tgz>     # in an empty npm init -y directory
```

The install exits 1 with the same `ENOTCACHED` message. Then
`npm cache add playwright-core@1.62.1 --cache <fresh>`, which fetches the
metadata, and the same install exits 0 with `marey` and `playwright-core` in
`node_modules`. The check needs either a network install in CI or that
metadata in the cache first. Neither is applied here.

**Fix, committed.** `pack-check.mjs` now installs the tarball with
`npm install --prefer-offline <tarball>` instead of `--offline`. npm's
configuration reference (`npm/docs/content/using-npm/config.md`, the npm 11.7.0
installed here) says: "If true, staleness checks for cached data will be
bypassed, but missing data will be requested from the server. To force full
offline mode, use `--offline`." So cached data is used and the registry is
asked only for what the cache lacks, which on CI's cold cache is the
`playwright-core` metadata. The header comment and the check's label say the
same.

**Verification, and its limit.** On this machine's warm cache `npm run
check:pack` passes 11 of 11 with the new label. The cold-cache case was not
re-run: it needs the registry, which this task did not have approval to use.
The warm run was also not offline. `npm install --prefer-offline --loglevel http
<tarball>` into an empty `npm init -y` directory logged `npm http fetch GET 200
https://registry.npmjs.org/playwright-core 35ms (cache stale)` and an audit
`POST` to `/-/npm/v1/security/advisories/bulk`, while the two tarballs were
cache hits. That is, a stale cached packument is revalidated under
`--prefer-offline`, and the earlier plan to show "no registry request" on the
warm cache does not hold; the command that showed it also made those two
requests itself. (A `grep` for `GET https://registry` counted 0 because npm
logs the status between the verb and the URL; it is the wrong pattern.) What
is established: the check passes locally, and the flag's documented behaviour
is the one the failure needs. Whether it passes on CI's cold cache is
confirmed only by the next push to `main`.

---

## Exit criterion 2: the ten-minute read

Spec §6.3. The reader's answers are recorded word for word and scored against
the rubric, fixed in the spec before the read. The owner makes the final
judgment (O6).

### The structural checklist, first

Run against `README.md` at `a4e4cee` before the read was spent:

| Item | Command or location | Result |
|---|---|---|
| An artifact in the first screen, the source beside it | `README.md:20` (the APNG), `README.md:26` (its source) | present |
| A "what's hard" section naming at least two things | `README.md:133` | three subsections |
| A first-screen link to `docs/determinism.md` | `README.md:13` | present |
| An install and usage block | `README.md:67` | present |
| At most 2,000 words | `wc -w README.md` | 1606 |
| None of the stale strings | `grep -n -E "refused outright\|one command\|not implemented" README.md` | no output |

The image is exactly what the regenerate command produces: `node
bin/marey.mjs export docs/media/bars-reveal.marey --format apng --out <tmp>`
printed `sha256 d56c2e03f61c975adef196760d37ed4cf881b132ff4b8e40589bb80916505994
frames 35ebdda6`, and `sha256sum docs/media/bars-reveal.png` gives the same
digest.

### The reader's copy

```bash
rm -rf .visual-check/phase6/reader && mkdir -p .visual-check/phase6/reader
git archive a4e4cee | tar -x -C .visual-check/phase6/reader
rm .visual-check/phase6/reader/docs/specs/2026-09-27-marey-phase-6-packaging-and-legibility-design.md .visual-check/phase6/reader/docs/plans/2026-09-27-phase-6-packaging-and-legibility.md
grep -rl -i "ten-minute\|rubric\|H1\. Identical\|blind reader" .visual-check/phase6/reader
```

The grep prints one file, `eval/RESULTS-PHASE-6.md`, at two lines that state
spec §9.3's ten-minute CI budget (this file as of `a4e4cee`, before this
section existed). Separately, `docs/specs/2026-09-09-marey-engineering-roadmap-design.md`
states the exit criterion itself ("A reader can state what Marey is and what
is technically hard about it within ten minutes of opening the repository."),
not the rubric. Both stay: the aim is that the rubric is not readable, not that
the phrase is absent. The 6B and 6C designs and plans contain no rubric text.
The copy's `README.md` is identical to the committed one.

### The reader and the prompt

Reader 1, on 2026-10-07: a reader with no prior context of the project, given
the copy and the prompt below, and nothing else. They could read files inside
the copy only. The prompt, exactly:

> The folder is: C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey\.visual-check\phase6\reader
>
> Read only files inside that folder, and do not run, build, or modify anything. Do not look at any file outside it.
>
> Start at README.md in this folder. Read for about ten minutes, which is about 2,500 words in total, and follow any links you like within that budget. Then answer, in a few sentences each: (1) What is Marey? (2) What is technically hard about it?
>
> At the end, list the files you opened, in order, with roughly how many words of each you read.

The third paragraph is the plan's text, word for word. The other three are
additions: the folder's path, a sentence confining the reader to it, and a
request to list what they opened. None of them carries a hint about the
answers.

### The answers, word for word

> **(1) What is Marey?**
> Marey is a small language and compiler for 2D motion graphics. You write a scene as text: shapes, animations, an optional Matter.js physics simulation, and a timeline. The compiler turns that into files that play without Marey: Lottie JSON, MP4, WebM, animated PNG, or PNG frames. There is a CLI with `check` and `export` commands, a pure `compile()` library function, and a browser app with an editor and live preview. It is not a game engine or a general animation library. It is at version 0.4.0, and PixiJS and Matter.js are internal details.
>
> **(2) What is technically hard about it?**
> - **Determinism.** The same source has to give the same frames on every run, physics included. The simulation runs on a fixed 120 Hz tick, and exports sample tick state only. The live preview interpolates between ticks, so nothing the simulation reads can depend on that interpolation. The README gives a real bug here: a body frozen mid-air kept its interpolated position and rested in one of two places depending on page-load timing. All 94 headless tests passed. Only a browser harness that cold-loads a scene twice and compares frames caught it.
> - **Limits of the guarantee.** `docs/determinism.md` says what is not claimed. Output is not guaranteed identical across JavaScript engines, because Node's V8 and Chromium's V8 differ in the last bit of `Math.sin`. Cross-machine identity is untested, and MP4 bytes differ between runs because of the browser's H.264 encoder. The `frames` hash does match for MP4.
> - **Exporting to formats that don't need Marey.** The Lottie export bakes physics, easing, and sequencing into per-frame keyframes. It turns text into glyph outlines through HarfBuzz instead of using Lottie's unsettled text layer. It refuses characters the font lacks rather than drawing them differently from the preview.
> - **Keeping one language consistent across the parser, type checker, editor, and docs.** Four hand-kept property lists drifted apart. Each property is now declared once in `languageContract.ts`, and the other pieces derive their tables from it. The test suite also compiles every example in the docs.
>
> **Files opened, in order, with approximate words read**
> 1. `README.md`: about 1,650 words, read in full.
> 2. `docs/determinism.md`: about 600 words, the first 80 lines only.
>
> Total is about 2,250 words, within the 2,500-word budget.

The reader stayed inside the budget (about 2,250 of 2,500 words, by their own
count; `wc -w README.md` gives 1606).

### Scoring

A point counts only if the answer states it, and only if what it states is
true of the repository.

**Q1: all three points needed.**

| Point | What the answer states | Checked against | Met |
|---|---|---|---|
| 1. A language and compiler; motion written as text source | "a small language and compiler for 2D motion graphics. You write a scene as text" | README.md:3-5 | yes |
| 2. Compiles to portable artifacts that play without Marey | "turns that into files that play without Marey: Lottie JSON, MP4, WebM, animated PNG, or PNG frames" | the `export` formats, README.md:85-89; criterion 3 below exports all five | yes |
| 3. For 2D motion graphics, not a game engine or a general animation library | "for 2D motion graphics" and "It is not a game engine or a general animation library" | README.md:6-7 | yes |

Q1: 3 of 3.

**Q2: at least two of H1-H4, each with a correct reason.**

| Item | What the answer states | Checked against | Met |
|---|---|---|---|
| H1. Identical output with physics: the fixed tick, and the simulation/painted-state boundary | "a fixed 120 Hz tick, and exports sample tick state only. The live preview interpolates between ticks, so nothing the simulation reads can depend on that interpolation", with the frozen-body bug as the case | `TICK_HZ = 120` (`src/compiler/sceneIR.ts:14`); the bug and its fix, `1ce8307` | yes |
| H2. A portable format with no runtime: a baked Lottie subset, refusing instead of degrading | "bakes physics, easing, and sequencing into per-frame keyframes"; "refuses characters the font lacks rather than drawing them differently from the preview" | README.md:162-172; `[LOTTIE_TEXT_MISSING_GLYPH]` | yes, with one gap: the answer never says "subset". The rubric's wording is "a baked Lottie subset, and refusing unsupported features instead of degrading them"; the answer gives the baking and the refusal, each with its reason, and the subset is implied by the refusal. It still counts, on the rubric's substance |
| H3. Verification: a headless suite cannot see a canvas; a browser harness caught a bug it missed | "All 94 headless tests passed. Only a browser harness that cold-loads a scene twice and compares frames caught it." | `docs/determinism.md` §5 | **not counted**: the fact is stated, as evidence inside the determinism point, but the answer gives no reason the suite missed the bug (that a headless suite cannot see a canvas), and the rubric asks for each item "with a correct reason" |
| H4. One language contract shared by compiler, editor and documentation | "Four hand-kept property lists drifted apart. Each property is now declared once in `languageContract.ts`, and the other pieces derive their tables from it. The test suite also compiles every example in the docs." | README.md:174-183 | yes, with one imprecision: "the other pieces" includes the docs, which do not derive tables from the contract; the next sentence states correctly how the docs are held to it |

Q2: 3 of 4 (H1, H2, H4), each with a correct reason; two were needed.

The answer's second bullet, "Limits of the guarantee", is not a rubric item.
Each of its claims holds against `docs/determinism.md` §2: the Node and
Chromium `Math.sin` results differ by about one unit in the last place,
cross-machine identity is untested, and MP4 bytes differ between runs while
the `frames` hash matches.

**Result: the read passes the rubric on the first reader.** No README
revision followed it.

**The owner's judgment: pending.** Spec O6 makes it final; this section is
the material for it.

---

## Exit criterion 3: both CLI commands on the canonical scenes

### `marey check --export-ready`

```
npm run build:cli && node bin/marey.mjs check --export-ready eval/scenes-3b/*.marey
```

```
eval/scenes-3b/bar-chart.marey: ok
eval/scenes-3b/compound-logo.marey: ok
eval/scenes-3b/radial-dots.marey: ok
eval/scenes-3b/timeline-ticks.marey: ok
```

Exit 0. The flag is not a no-op: on `eval/scenes-r2/collide-stack.marey`,
which declares no `duration`, plain `check` prints `ok` and exits 0, and
`check --export-ready` exits 1 with `[EXPORT_UNBOUNDED_SCENE] This scene
declares no 'duration', so it has no finite length to export. ...`.

### `marey export`: `npm run check:export`, default mode

```
npm run build:export-page && npm run build:cli && npm run check:export
```

Exit 0, `matrix: all passed  (111.2 s)`, `real 1m54.132s`. What the matrix
asserts is in "CLI export matrix" above.

| Scene | Format | Result | Time (s) | Frames | Size | sha256 (first 16) | `hash` |
|---|---|---|---|---|---|---|---|
| bar-chart | png | ok | 3.9 | 30 | 800x600 | `ee2b6ddadd11e709` | `0adcc9f9` |
| bar-chart | apng | ok | 3.2 | 30 | 800x600 | `c6e51569220cf225` | `0adcc9f9` |
| bar-chart | webm | ok | 4.7 | 30 | 1600x1200 | `19bf665bb55445f6` | `0adcc9f9` |
| bar-chart | mp4 | ok | 4.8 | 30 | 1600x1200 | differs, reported: `f05cca9100bf0cab` vs `c38ebd9745753486` | `0adcc9f9` |
| bar-chart | lottie | ok | 1.1 | 30 | 800x600 | `79aa2ffc7216b022` | `0adcc9f9` |
| radial-dots | png | ok | 3.0 | 30 | 800x600 | `d6a1fb2fdcd8d9f7` | `94d15a5d` |
| radial-dots | apng | ok | 2.8 | 30 | 800x600 | `9d9234324f1709ee` | `94d15a5d` |
| radial-dots | webm | ok | 4.1 | 30 | 1600x1200 | `81f81ac2c5a10961` | `94d15a5d` |
| radial-dots | mp4 | ok | 4.5 | 30 | 1600x1200 | differs, reported: `246e17fc9881c7c3` vs `4239063a2fb76f66` | `94d15a5d` |
| radial-dots | lottie | ok | 1.0 | 30 | 800x600 | `5aba4b1aff965c8f` | `94d15a5d` |
| compound-logo | png | ok | 11.7 | 240 | 800x600 | `79f3f2947d9c4407` | `3dbb171f` |
| compound-logo | apng | ok | 10.3 | 240 | 800x600 | `df3988b9223c6f87` | `3dbb171f` |
| compound-logo | webm | ok | 19.3 | 240 | 1600x1200 | `89b23932748ef09d` | `3dbb171f` |
| compound-logo | mp4 | ok | 19.3 | 240 | 1600x1200 | differs, reported: `4b60d00ff7d886cb` vs `c774a4b5bf01ba9b` | `3dbb171f` |
| compound-logo | lottie | ok | 0.9 | 240 | 800x600 | `708484b0189fc0d4` | `3dbb171f` |
| timeline-ticks | png | ok | 3.5 | 30 | 800x600 | `3443dd4a85e13b0a` | `93ac7785` |
| timeline-ticks | apng | ok | 2.7 | 30 | 800x600 | `c7ccaafa0f3c7b53` | `93ac7785` |
| timeline-ticks | webm | ok | 4.8 | 30 | 1600x1200 | `dd5d14a7365ce0b5` | `93ac7785` |
| timeline-ticks | mp4 | ok | 4.0 | 30 | 1600x1200 | differs, reported: `524df4b241142b82` vs `ab6da8e0fc767dd2` | `93ac7785` |
| timeline-ticks | lottie | ok | 1.1 | 30 | 800x600 | `38c44cdd8fff0b15` | `93ac7785` |
| bar-chart | png, font aborted | ok | 0.5 | | | | |

The font-abort case printed the same `[EXPORT_FONT_UNAVAILABLE]` message as
on 2026-09-28.

**Beside the 2026-09-28 runs.** Every png, apng and webm SHA-256 is unchanged,
and so is every `hash` and Lottie SHA-256 of bar-chart, radial-dots and
timeline-ticks. Two values moved, both on compound-logo, both from Phase 6C:

- its `hash` is `3dbb171f`, not `26cca4e9`. "6C: smooth handoff" below
  records this change and its cause, a final-tick velocity of
  199.99999999999886 px/s where the old code gave 200;
- its Lottie SHA-256 is `708484b0...`, not `e80dffee...` (42,073 B, not
  42,074 B). The Lottie file stores the unrounded positions. Measured by
  building the CLI at `7e09051`, the commit before 6C, in a temporary
  worktree: it exports `e80dffee...` and `frames 26cca4e9`, as recorded
  above. Of the two files' 6,573 numeric tokens, 542 differ, by at most
  8.9e-11 px, for example `363.41688531247667` against `363.4168853124768`.

As before, all four mp4 cases differ between their two runs and are reported,
not gated (R47).

`--compare-seams` was not re-run for this section; it needs the dev server
and runs again before the merge.

---

## CI (O8)

Spec §9.3: after the existing three gates, CI installs ffmpeg and the pinned
browser, then runs `check:pack` and `check:export`. The export step builds
what it reads (`build:export-page`, `build:cli`) before calling
`check:export`, so it does not depend on the pack step having run first.

This machine cannot run GitHub Actions, so the run time is measured on the
first run after the owner pushes this change, not here. The local numbers
above are the baseline it is measured against: `check:pack` including its own
`build:package` at **15.6 s**, and the current `check:export` script's two
default-mode runs, both 21 of 21 cases passing (mp4 reported, not gated, per
R47), at **100.5 s** and **101.8 s**. (A third, superseded run of the script
that gated mp4 on SHA-256 took 233.3 s and exited 1 at 17 of 21, all four mp4
cases failing on that gate alone — not a baseline for the script CI runs.)
Both current-script numbers are well under spec §9.3's ten-minute budget on
this machine; an `ubuntu-latest` runner's numbers, and the added
`apt-get install` and `playwright install` time, are not. If the CI run's
total exceeds ten
minutes, spec §9.3's fallback applies: `check:export` gains a `--ci` mode that
runs one scene per format instead of the full four-scene, five-format matrix,
and the full matrix stays a before-merge check.

**Update 2026-10-07: the CI time is still not measured.** The change reached
`main` on 2026-10-02, and all four CI runs since then failed at the pack step,
before the export matrix (see "Exit criterion 1", "On a fresh clone, in CI").
Those jobs took 1m14s to 1m46s each (`gh run list`), and none reached the
matrix. The local default-mode run of 2026-10-07
took 111.2 s ("Exit criterion 3").

---

## Task 1: x264 gate

Spec §5. On the default scene's lossless 2× frames, does x264, run through the
user's ffmpeg, clearly beat the button's WebCodecs H.264? If no configuration
meets all three thresholds, `marey export --format mp4` keeps `runVideoExport`
(Task 9).

**Verdict: gate failed.**

- The run of record has a colour description matching the WebCodecs file's.
  In it, no x264 configuration passes.
- Six of the eight clear the PSNR threshold, and every one clears the size
  threshold.
- **Every one fails the specks threshold**, and not narrowly: x264 leaves
  70–110 specks per frame against WebCodecs' 63.6, where 6.36 is allowed.
- So in this measurement x264 does not remove the specks. It leaves more of
  them than WebCodecs does.
- There is no chosen configuration, so Task 9 has no `X264_SETTINGS` to adopt
  and no repeat-encode comparison runs (spec §5 re-encodes only a chosen
  configuration).

Measured from `C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey` on Windows 11
with `playwright` 1.62.1's Chromium, the scorer's default GPU configuration
(`--use-angle=swiftshader --enable-unsafe-swiftshader --use-gl=angle`), and
the dev server (`npx vite --port 5199 --strictPort`) warmed by one page load
before each run. The scene is `DEFAULT_CODE` from `src/store/defaultScene.ts`,
written to `.visual-check/phase6/default.marey` by the brief's `node -e`
one-liner. ffmpeg's version line:

```
ffmpeg version 9.0.2-full_build-www.gyan.dev Copyright (c) 2000-2026 the FFmpeg developers
```

The command, run twice (the two runs follow):

```
node tools/visual-check/x264-gate.mjs --scene .visual-check/phase6/default.marey --fps 30 --out .visual-check/phase6/gate
```

The gate, with `wc` the WebCodecs file exported in the same run:
`psnr >= wc.psnr + 1.0 && specksPerFrame <= wc.specksPerFrame / 10 && bytes <= 3 * wc.bytes`.
It compares the scorer's own outputs, which are rounded: PSNR to two decimals,
specks to one.

**Where the premise came from.** Spec §5 assumed x264 removes the specks. That
came from the 5C findings, which attributed them to Chromium's software H.264
encoder (OpenH264); see spec §5 and
`docs/research/2026-09-24-export-quality-findings-and-options.md`. This
measurement does not support it. On identical decoded YUV planes, the colour
tags alone moved x264's specks from 19.6 to 70.2 per frame, a factor of 3.6,
so the speck metric is sensitive to how the decoder reads the tags and not
only to the encoder.

**Consequence for the CLI.** `marey export --format mp4` is the button's path,
`runVideoExport`. `check:export --compare-seams` compares it with
`__mareyExportVideo({ container: "mp4" })` on frame hash, coded size and frame
count, and reports the SHA-256s without gating on them (R47).

### The run of record: x264 tagged BT.601 limited range, like the WebCodecs file

The x264 argument list (`x264Args` in `tools/visual-check/x264-gate.mjs`),
with `<crf>`, `<preset>` and the optional `-tune animation` filled in per row:

```
-hide_banner -loglevel error -f image2pipe -framerate 30 -c:v png -i -
-c:v libx264 -preset <preset> -crf <crf> [-tune animation]
-vf scale=out_color_matrix=bt601:out_range=tv,setparams=range=tv:colorspace=smpte170m:color_primaries=smpte170m:color_trc=smpte170m
-color_range tv -colorspace smpte170m -color_primaries smpte170m -color_trc smpte170m
-pix_fmt yuv420p -movflags +faststart -map_metadata -1 -fflags +bitexact -flags:v +bitexact -an -y <out>
```

- Exit 0, 14 m 31 s.
- 180 frames at 30 fps, coded at 1600x1200.
- The WebCodecs encoder config the seam reported: `avc1.420028`,
  8,000,000 bit/s constant, `prefer-software`.
- `ffprobe` reads every x264 output as `color_range=tv`, with `color_space`,
  `color_primaries` and `color_transfer` all `smpte170m`, at 180 frames.
- Thresholds: PSNR at least **43.03 dB**, specks per frame at most **6.36**,
  size at most **9,884,082 B**.

| Encoder | CRF | Preset | Tune | PSNR (dB) | Specks/frame | Total specks | Bytes | PSNR | Specks | Size | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| WebCodecs | - | - | - | 42.03 | 63.6 | 11446 | 3,294,694 | | | | baseline |
| x264 | 14 | medium | - | 43.55 | 85 | 15301 | 1,053,107 | ok | fail | ok | fail |
| x264 | 14 | medium | animation | 43.78 | 72.6 | 13061 | 1,109,145 | ok | fail | ok | fail |
| x264 | 14 | slow | - | 43.58 | 79.3 | 14266 | 1,020,633 | ok | fail | ok | fail |
| x264 | 14 | slow | animation | 43.81 | 70.2 | 12636 | 1,018,644 | ok | fail | ok | fail |
| x264 | 18 | medium | - | 42.91 | 105.9 | 19061 | 709,449 | fail | fail | ok | fail |
| x264 | 18 | medium | animation | 43.29 | 90.6 | 16316 | 761,223 | ok | fail | ok | fail |
| x264 | 18 | slow | - | 42.96 | 110.4 | 19864 | 694,090 | fail | fail | ok | fail |
| x264 | 18 | slow | animation | 43.36 | 86.4 | 15560 | 710,409 | ok | fail | ok | fail |

Every file decoded to 180 frames against 180 references.

- The best configuration is CRF 14, slow, `-tune animation`:
  - 43.81 dB, 1.78 dB above WebCodecs;
  - 70.2 specks per frame, 6.6 more than WebCodecs;
  - 1,018,644 B, under a third of the WebCodecs file's size.
- The WebCodecs numbers agree with 5C's recorded 42.03 dB and about 65 specks
  per frame.

**Repeatability, observed but not the gate's step.** With no chosen
configuration, Step 6's two repeat encodes did not run. Still, CRF 14 slow
animation was encoded twice by separate ffmpeg processes: once for the
diagnostic below, from reference PNGs saved to disk by an earlier seam export,
and once by this run, from the run's own seam export. Both files have SHA-256
`facdaa1bfd15e7de8f97e9355e663ae26c35f4c385af3aa84cc853becd5456b3`.

### The first run, superseded: x264 untagged

The first run used the argument list as the plan first wrote it: the list
above without the `-vf` filter or the four colour options, so with
`-pix_fmt yuv420p` alone. Exit 0, 5 m 58 s. Thresholds: 43.03 dB,
6.43 specks per frame, 9,897,414 B.

| Encoder | CRF | Preset | Tune | PSNR (dB) | Specks/frame | Total specks | Bytes | Gate |
|---|---|---|---|---|---|---|---|---|
| WebCodecs | - | - | - | 42.03 | 64.3 | 11572 | 3,299,138 | baseline |
| x264 | 14 | medium | - | 38.62 | 26.3 | 4729 | 1,053,085 | fail |
| x264 | 14 | medium | animation | 38.68 | 22.4 | 4030 | 1,109,123 | fail |
| x264 | 14 | slow | - | 38.62 | 26.4 | 4757 | 1,020,611 | fail |
| x264 | 14 | slow | animation | 38.69 | 19.6 | 3531 | 1,018,621 | fail |
| x264 | 18 | medium | - | 38.43 | 45 | 8100 | 709,427 | fail |
| x264 | 18 | medium | animation | 38.54 | 34.8 | 6256 | 761,201 | fail |
| x264 | 18 | slow | - | 38.44 | 46 | 8286 | 694,068 | fail |
| x264 | 18 | slow | animation | 38.56 | 31.5 | 5673 | 710,386 | fail |

Every x264 configuration scored about 3.4 dB *below* WebCodecs, and PSNR
barely moved with CRF. That points to a systematic colour error, not to
quantisation, and the measurements below confirm it.

**Why it was superseded.**

- **The colour tags differ.** `ffprobe` reads the WebCodecs file as
  `color_range=tv` with `color_space`, `color_primaries` and `color_transfer`
  all `smpte170m` (BT.601, limited range). It reads every untagged x264 file
  as `unknown` on all four fields.
- **The browser decodes them differently.** The first frame of each file was
  decoded through mediabunny in the same Chromium, and its
  `VideoFrame.colorSpace` was read:
  - WebCodecs: `{ matrix: "smpte170m", primaries: "smpte170m", transfer: "smpte170m", fullRange: false }`.
  - Untagged x264, CRF 14 slow animation: `{ matrix: "bt709", primaries: "bt709", transfer: "bt709", fullRange: false }`.

  ffmpeg converts RGB to YUV with BT.601 by default. So the scorer read the
  untagged stream back through a different matrix from the one it was
  encoded with.
- **One configuration, re-encoded with the tags.** CRF 14, slow,
  `-tune animation` was encoded again with the tagged argument list above.
  - The first attempt had only `-vf scale=out_color_matrix=bt601:out_range=tv`
    and the four encoder-level colour options. `ffprobe` showed range and
    matrix set, but primaries and transfer still `unknown`, so it was not
    scored.
  - Adding `setparams` to the filter set all four tags, confirmed by `ffprobe`
    before scoring.
  - The tagged and untagged files' decoded YUV planes are identical: ffmpeg's
    `framemd5` over all 180 frames gives the same digest for both. Only the
    tags differ.
  - All three files were scored in one page through `scoreInPage`, against
    the same 180 reference PNGs. Those were saved from a seam export whose
    frame hash, `2bacabcb`, equals the untagged run's. The scores:

    | File | PSNR (dB) | Specks/frame | Bytes |
    |---|---|---|---|
    | x264 untagged | 38.69 | 19.6 | 1,018,621 |
    | x264 tagged BT.601 tv | **43.81** | 70.2 | 1,018,644 |
    | WebCodecs, from the untagged run | 42.03 | 64.3 | 3,299,138 |

    The untagged file and the WebCodecs file reproduce the untagged run's
    numbers exactly.

PSNR moved by **+5.12 dB** on identical YUV data. That is more than the
0.5 dB set beforehand as the threshold for a material change, so the tagged
argument list became the gate's `x264Args`, and the full matrix was re-run
as the run of record above. The untagged run measured how Chromium decodes
an untagged stream, not x264, and would have shipped shifted colours in any
player that assumes BT.709 for untagged HD video.

Under correct colour, the speck count rose: 19.6 untagged against 70.2
tagged, for the same YUV planes. The untagged run's low speck counts were an
artefact of the matrix mismatch, not a property of x264.

### The shared scorer: `quality-check.mjs` before and after the extraction

`installMediabunny` and the decode-and-score function moved out of
`quality-check.mjs`, unchanged, into `tools/visual-check/lib/scoreVideo.mjs`
(`scoreInPage`), and `x264-gate.mjs` scores with the same code. The moved
lines are textually identical to HEAD's: a `diff` of HEAD's lines 158–177 and
208–317 against the new module shows no change.

```
node tools/visual-check/quality-check.mjs --scene .visual-check/phase6/default.marey --containers mp4,webm --fps 30 --out .visual-check/phase6/quality-before   # HEAD's quality-check.mjs
node tools/visual-check/quality-check.mjs --scene .visual-check/phase6/default.marey --containers mp4,webm --fps 30 --out .visual-check/phase6/quality-after    # after the extraction
```

| Container | Run | PSNR (dB) | Specks/frame | Total specks | File bytes |
|---|---|---|---|---|---|
| mp4 | before | 42.03 | 64 | 11526 | 3,300,478 |
| mp4 | after | 42.03 | 63.5 | 11423 | 3,295,458 |
| webm | before | 42.16 | 61.7 | 11101 | 4,386,180 |
| webm | after | 42.16 | 61.7 | 11101 | 4,386,180 |

**Exact MP4 equality across two runs is not the test.** Each run re-encodes
through WebCodecs, whose H.264 output is not byte-repeatable (R47,
`docs/architecture/renderer.md`, "The container determinism asymmetry"). The
two MP4 files above differ in size, so the scorer was given different input.
The extraction is shown to change nothing in two ways:

1. **WebM is exactly equal.** Its bytes are repeatable: the file size is the
   same, and all 180 per-frame PSNR and speck entries are identical (compared
   as JSON).
2. **The same MP4 bytes score identically under both scorers.** One export
   (3,295,111 B, SHA-256
   `5c383ca76590506b198a15a2776adb58169bf4c142c49429c920901746994b2d`) was
   scored in one page by HEAD's scoring function, inlined verbatim from
   `git show HEAD:tools/visual-check/quality-check.mjs`, and by
   `scoreInPage`. Both gave 42.03 dB, 64.2 specks per frame and 11564 in
   total, and the two whole results, per-frame entries included, are equal as
   JSON.

Every run on this page (both quality checks, both gate runs and the
diagnostic) logs one console warning, "Mediabunny was loaded twice". It comes
from injecting the mediabunny bundle into a page whose app already bundles
mediabunny, and HEAD's `quality-check.mjs` logs it too.

---

## 6B: the playground redesign

Spec: `docs/specs/2026-10-02-marey-phase-6b-playground-redesign-design.md`, §9.5
and §9.7.

**Layout, measured in a browser.** `tools/visual-check/playground-check.mjs`
against the dev server (`npx vite --port 5199 --strictPort`), at 1440 x 900 and
390 x 844 in both themes at a device pixel ratio of 2 (screenshots of 2880 x
1800 and 780 x 1688 pixels, as spec §11 reviews them), at 320 x 640 for the top
bar only, and at 760 x 900, the narrowest desktop layout, for the top bar in its
normal state and while New shows "Clear editor?":

```
{"assertions":46,"passed":46,"failed":0,"consoleErrors":0}
```

Per page it asserts that no two top-bar controls intersect and that none leave
the viewport; that the plate frame's aspect ratio equals 800/600 within 1 px;
that the caption reads `800 × 600` and `12 s`; and that each menu (Examples and
Export on desktop, Examples and More on a phone) opens with Enter, moves with
ArrowDown, and closes with Escape with focus back on its button. The phone runs
also assert that the log is folded behind its status strip. The desktop runs
assert that the log is open under the same strip, and that folding it leaves
the 36 px strip and grows the editor (639 to 815 px at 1440 x 900), with the
top-bar assertions repeated while it is folded. The run logged no console
errors. It passed on four consecutive runs once the menu wait described in the
plan's execution notes was in place.

**The check can fail.** Two temporary edits to the Examples button, both
reverted:

- `min-width: 400px` pushed Examples, More and Run past the right edge. The
  overlap assertion stayed green (a flex row does not overlap, it overflows),
  and the viewport assertion failed at 390 and 320 px
  (`{"assertions":33,"passed":30,"failed":3}`, exit 1).
- `position: absolute` with `min-width: 400px` made the controls overlap. The
  overlap assertion failed on every page
  (`{"assertions":33,"passed":23,"failed":10}`, exit 1), for example
  `Examples x More (32.0 x 16.0 px); Examples x Run (Ctrl+Enter) (65.1 x 16.0 px)`
  at 320 px.

**Exports.** `marey export` on the four examples in `src/examples/`, in each of
`png apng webm mp4 lottie` at 30 fps, after
`npm run build:export-page && npm run build:cli`. All 20 exited 0.

| Example | Frames | png | apng | webm | mp4 | lottie |
|---|---|---|---|---|---|---|
| `dusk-hills` | 360 | 9,683,595 B | 9,652,096 B | 3,962,669 B | 2,874,360 B | 1,897,932 B |
| `physics-pile` | 210 | 5,040,535 B | 5,024,390 B | 2,243,846 B | 1,517,298 B | 1,276,217 B |
| `bar-chart-reveal` | 150 | 3,709,402 B | 3,697,109 B | 206,579 B | 132,765 B | 202,059 B |
| `logo-reveal` | 150 | 3,195,622 B | 3,185,429 B | 484,574 B | 447,169 B | 142,990 B |

The png column is the total over the frames. Images and Lottie are 800 x 600;
webm and mp4 are 1600 x 1200. The simulation-state hash is the same across the
five formats of each example (`dbe106b8`, `951d2afc`, `4eb7ddbc`, `3567142c`).

`npm run check:export` against its recorded baselines:
`matrix: all passed  (134.8 s)`. The mp4 SHA-256 differs between its two runs on
the canonical scenes, which is reported and not gated (R47), as before.

## 6C: smooth handoff

Spec: `docs/specs/2026-10-03-marey-phase-6c-smooth-handoff-design.md`. A
`handoff: true` animation now gives the body the velocity it had over its
final tick, its curve is reshaped so it does not arrive at rest, the release
happens after the physics step on the same tick in both arrangements, and the
preview paints animations backward across the tick as physics does. Every
figure below is one body moving 200 px in 1 s (120 ticks) under the real
`MatterWorld`, with gravity 0, air drag 0 and no bounds. Tick values are the
body's displacement per tick in px. N is the release tick: 120 for a forward
animation and 240 for a yoyo when `physics` runs beside the animation
(concurrent), and one tick later when it follows in a `sequence`.

**Ticks, before the change.** The 16 seam cases (2 arrangements, forward or
yoyo, 4 easings) failed 14 of 16 on the old code; the two that passed are
`linear` and yoyo `linear` in a sequence. The command was
`npx vitest run src/compiler/renderer/sceneRuntime.test.ts -t "handoff seam"`,
which reported `Tests 14 failed | 2 passed | 40 skipped (56)`, for example
`expected 1.6666666666666536 to be less than or equal to 0.0016666666666666607`
for concurrent `linear`.

| Case | d(N-1) | d(N) | d(N+1) | Result |
|---|---|---|---|---|
| concurrent linear | 1.6667 | 3.3333 | 1.6667 | fail |
| concurrent easeIn | 3.2917 | 6.6528 | 3.3333 | fail |
| concurrent easeOut | 0.0417 | 0.8472 | 0.8333 | fail |
| concurrent easeInOut | 0.0833 | 0.8611 | 0.8333 | fail |
| concurrent linear yoyo | -1.6667 | -3.3333 | -1.6667 | fail |
| concurrent easeIn yoyo | -0.0417 | -3.3472 | -3.3333 | fail |
| concurrent easeOut yoyo | -3.2917 | -4.1528 | -0.8333 | fail |
| concurrent easeInOut yoyo | -0.0833 | -0.8611 | -0.8333 | fail |
| sequence linear | 1.6667 | 1.6667 | 1.6667 | pass |
| sequence easeIn | 3.2917 | 3.3194 | 3.3333 | fail |
| sequence easeOut | 0.0417 | 0.0139 | 0.8333 | fail |
| sequence easeInOut | 0.0833 | 0.0278 | 0.8333 | fail |
| sequence linear yoyo | -1.6667 | -1.6667 | -1.6667 | pass |
| sequence easeIn yoyo | -0.0417 | -0.0139 | -3.3333 | fail |
| sequence easeOut yoyo | -3.2917 | -3.3194 | -0.8333 | fail |
| sequence easeInOut yoyo | -0.0833 | -0.0278 | -0.8333 | fail |

N is 120 or 240 for concurrent and 121 or 241 for sequence. The curve's own
final step is 1.6667, 3.3194, 0.8334 and 0.8609 for `linear`, `easeIn`,
`easeOut` and `easeInOut` (reversed in sign for a yoyo).

**Ticks, after.** All 16 pass: d(N) equals the curve's final step, d(N+1)
equals d(N) to 1e-3, and the position pin is released after tick N in every
case. `npx vitest run src/compiler/renderer/sceneRuntime.test.ts` reported
`Tests 56 passed (56)` at that commit.

| Case | d(N-1) | d(N) | d(N+1) |
|---|---|---|---|
| concurrent linear | 1.6667 | 1.6667 | 1.6667 |
| concurrent easeIn | 3.2917 | 3.3194 | 3.3194 |
| concurrent easeOut | 0.8337 | 0.8334 | 0.8334 |
| concurrent easeInOut | 0.9155 | 0.8609 | 0.8609 |
| concurrent linear yoyo | -1.6667 | -1.6667 | -1.6667 |
| concurrent easeIn yoyo | -0.8337 | -0.8334 | -0.8334 |
| concurrent easeOut yoyo | -3.2917 | -3.3194 | -3.3194 |
| concurrent easeInOut yoyo | -0.9155 | -0.8609 | -0.8609 |
| sequence linear | 1.6667 | 1.6667 | 1.6667 |
| sequence easeIn | 3.2917 | 3.3194 | 3.3194 |
| sequence easeOut | 0.8337 | 0.8334 | 0.8334 |
| sequence easeInOut | 0.9155 | 0.8609 | 0.8609 |
| sequence linear yoyo | -1.6667 | -1.6667 | -1.6667 |
| sequence easeIn yoyo | -0.8337 | -0.8334 | -0.8334 |
| sequence easeOut yoyo | -3.2917 | -3.3194 | -3.3194 |
| sequence easeInOut yoyo | -0.9155 | -0.8609 | -0.8609 |

**The painted seam.** The preview paints at alpha between ticks. The seam test
compares the painted step between `paint(a)` after tick k-1 and after tick k
with the tick path, `(1 - a)·d[k-1] + a·d[k]`. Sequence, `linear`, alpha 0.5,
step in px, with k counted from the release tick N:

| k | Before: painted | Expected | After: painted | Expected |
|---|---|---|---|---|
| N-3 | 1.6667 | 1.6667 | 1.6667 | 1.6667 |
| N-2 | 1.6667 | 1.6667 | 1.6667 | 1.6667 |
| N-1 | 1.6667 | 1.6667 | 1.6667 | 1.6667 |
| N | **0.8333** | 1.6667 | 1.6667 | 1.6667 |
| N+1 | **0.8333** | 1.6667 | 1.6667 | 1.6667 |
| N+2 | 1.6667 | 1.6667 | 1.6667 | 1.6667 |
| N+3 | 1.6667 | 1.6667 | 1.6667 | 1.6667 |

Two frames at half speed before, none after. Before the painting change but
with the release already moved after the step, concurrent `linear` at alpha 0.5
measured the same 0.8333, 0.8333 at N and N+1. Sequence `easeOut` at alpha 0.5 read 0.4167, 0.4167 against 0.8336,
0.8334 expected. After the change, over 16 cases x 3 alphas x 7 steps (336
steps), the largest relative error is 0.799% (concurrent `easeInOut`, alpha
0.5, k = N+1: painted 0.854058 against 0.860938 expected), inside the 1%
tolerance and matching the 0.8% curvature bound in spec section 3.

**Exports.** The four affected scenes exported as PNG at the pre-change commit
and at the head of the branch, with
`node bin/marey.mjs export <scene> --format png --out .visual-check/6c/<before|after>/<name>`
after `npm run build && npm run build:export-page && npm run build:cli`.
`throw-arc` and `test-card` end in `physics { duration: indefinitely }`, which
the CLI refuses without a length, so both runs of those two used
`--duration 3`. A Node script compared the frames pixel by pixel (all four
channels of every pixel).

| Scene | Frames | `frames` hash before / after | Frames that differ | Largest channel difference | First differing frame |
|---|---|---|---|---|---|
| `compound-logo` | 240 | `26cca4e9` / `3dbb171f` | 0 | 0 | none |
| `throw-arc` | 90 | `571e9967` / `51d47aa3` | 89 | 241 | 1 (0.033 s) |
| `test-card` | 90 | `70b1eab9` / `c4b3e404` | 89 | 241 | 1 (0.033 s) |
| `hello-face` | 180 | `2bacabcb` / `616c7406` | 114 | 241 | 66 (2.200 s) |

`compound-logo` is `linear` in a sequence, so its motion should not change.
The `frames` hash does move, because it hashes unrounded simulation values and
the final-tick velocity is 199.99999999999886 px/s where the old multiplier
gave 200. All 240 rendered frames are identical, so the largest per-channel
difference is 0, inside the allowed 1. The PNG export's SHA-256 is the same
before and after (`79f3f294...`). The `throw-arc` and `test-card` handoffs
start with their animation at t = 0, and `easeOut` is reshaped, so frame 1 is
the first frame that can differ. In `hello-face` the handoff animation has
`delay: 2.0` (frame 60) and the first differing frame is 66. Frames 60 to 65
are pixel-identical before and after, although the reshaped curve starts at
frame 60; that is what the comparison showed, and it was not investigated
further.

**Browser check.** `npx vite --port 5199 --strictPort`, then
`node tools/visual-check/check.mjs --scene tools/visual-check/scenes/test-card.marey --at 300,800,1300,1800,2300 --settle 3000 --out .visual-check/6c/browser`:
`compiled true`, `rendered true`, `page errors 0`. `frozen at rest` and
`deterministic` both read `false`; the scene loops, so neither check is
meaningful for it, as the README says. The handoff ball at 300 ms is rising to the right
(about (230, 347) in the 624 px wide capture), at 800 ms it is past its apex
and falling (about (347, 585)), and from 1300 ms it rests on the floor at the
bottom edge. The captures are 500 ms apart, so they show the arc but cannot
show the absence of a stop; the smoothness of the seam is what the painted-seam
table above measures.

**Known edges.**

- The painting rule has one addition the spec does not describe. A runner that
  completed on the latest tick but is painted short of its end paints after the
  bodies, unless a later runner on the same property is running, and is
  spliced once a paint reaches its end. Its tick-exact end is restored before
  the next tick reads it. `docs/architecture/renderer.md` documents it. It was
  needed because on the release tick `readState(alpha)` returns the body's
  position at tick N for every alpha (the pinned body is placed before the
  step and released after it). Painting bodies last, as first written, read
  2.5000 then 0.8333 px at N and N+1 in the sequence `linear` case, and moved
  a sequence's next step over the completing runner.
- When a concurrent `physics` block freezes the body on the same tick a
  handoff completes, which only `delay` makes reachable, the handoff velocity
  stays parked. Any later `sequence` step on that object thaws the frozen
  body, because `spawnAnim` unpins FROZEN and that flushes the parked
  velocity: a later `physics` step would take it over its declared velocity,
  and an `animate` step on another property sets the body drifting. Probe: a
  position handoff `(200, 300)` to `(400, 300)` with `delay: 1, duration: 1`
  beside `physics { duration: 2 }`, followed by `sequence { animate {
  property: alpha, to: 0.5, duration: 1 } }`, which `marey check` accepts, run
  through a throwaway vitest file that called `advanceOneTick()` and
  `paintExactTick()` 360 times. At 7e09051 x reads 400.0000 at ticks 240, 241
  and 360. At HEAD it reads 400.0000, 401.6667 and 600.0000, a drift of 200
  px/s after the physics block has expired. With `physics { duration: 1.5 }`,
  which expires first, 7e09051 and HEAD both read 401.6667 at tick 241 and
  600.0000 at tick 360, so that variant predates 6C, and 6C extends it to the
  exact-tie tick. The root cause is that the validator's
  `TYPE_HANDOFF_DURATION` check ignores `delay`. The outcome of the freeze
  itself is the same as before. This was found in the review of the release
  change and left open; the validator is unchanged.
- Two edges were already there before 6C and were not measured. A non-handoff
  physics freeze can still jump forward by up to one tick in the preview. A
  freeze snap on the same tick as a position runner's completion is overwritten
  by the runner's end after a short paint.
