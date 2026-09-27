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
  two SHA-256s of the output are equal (for png, over the frames in index
  order, as `marey export` hashes what it writes), that the two `hash`es
  (`hashFrames` over the sampled snapshots) are equal, and for png that the
  frames received number `frameCount`. It checks each size against the bytes:
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

Measured at `a861a37` plus this change, from
`C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey`, Windows 11, Chromium
151.0.7922.34 (the headless shell of `playwright-core` 1.62.1; `playwright`
1.62.1 launches the same build).

### Default mode: 17 of 21 cases pass; every mp4 case fails

```
npm run build:export-page && npm run build:cli && npm run check:export
```

Exit 1. Total **233.3 s** as the script reports it (`real 3m54.9s` under
`time`, including npm's start-up). Each time covers both exports of the case.

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

The font-abort case's full message:
`[EXPORT_FONT_UNAVAILABLE] The export font 'JetBrains Mono' did not load at 20px, so this scene's text cannot be exported to match the preview. Check the connection and export again.`

compound-logo's `hash` is `26cca4e9` in every format, the value
`export-check.mjs` records for its png at 30 fps. Every size assertion passed:
in the 16 passing format cases, both runs' bytes and reported sizes are
800x600 for png (every frame's IHDR), apng and lottie, and 1600x1200 for webm;
the four mp4 cases fail on the SHA-256 only, and their coded size read from
the bytes is 1600x1200 too.

**The mp4 failures.** `marey export --format mp4` currently goes through the
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
(R47). The matrix keeps the brief's assertion as written, so `check:export`
exits 1 while mp4 goes through WebCodecs.

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
