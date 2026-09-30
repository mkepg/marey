# Phase 6 evidence

**Phase:** 6 (`docs/specs/2026-09-27-marey-phase-6-packaging-and-legibility-design.md`).
**Date:** 2026-09-28. Branch `phase-6`.

This file is the standing evidence record for Phase 6, in the same spirit as
`eval/RESULTS-PHASE-5B.md`/`RESULTS-PHASE-5C.md`: measured numbers, with the
command that produced each one, so a later reader can re-run rather than
trust a paraphrase. One section per piece of the phase.

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
