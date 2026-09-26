# Phase 5C evidence

**Phase:** 5C (`docs/specs/2026-09-24-marey-phase-5c-lottie-completion-and-video-quality-design.md`).
**Date:** 2026-09-24/25. Branch `phase-5c-lottie-video-quality`.

This file is the standing evidence record for Phase 5C, in the same spirit
as `eval/RESULTS-PHASE-5A.md`/`RESULTS-PHASE-5B.md`: measured numbers, with
the command that produced each one, so a later reader can re-run rather than
trust a paraphrase. One section per piece of the phase; this update adds
Piece 1 only.

---

## Piece 1: 2x video (Task 1)

**Baseline.** At `4a23e1d` (spec `aad331d`, plan `00940e2`), from
`C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey`: `npx vitest run` → **37
files / 937 tests**; `npx tsc -b --noEmit` → exit 0.

**What changed.** `videoContract.ts` gains `VIDEO_SCALE = 2` and `VideoPlan`
gains `scale`/`sceneWidth`/`sceneHeight`; `width`/`height` are now the
*coded* size (scene size × 2). `deviceLimitDiagnostic` refuses a coded size
above the device's `MAX_TEXTURE_SIZE`/`MAX_RENDERBUFFER_SIZE`.
`createFrameRasterizer` takes a required `scale` argument; the video export
`Application` now initialises at `resolution: video.plan.scale` instead of
`resolution: 1`, and the pipeline reads the device's GL limits and refuses
before building or sampling. `video-check.mjs` gates on the coded size being
exactly 2× the scene size; `quality-check.mjs` is a new script measuring
PSNR/specks against the shipped pipeline.

After the final commit: `npx vitest run` → **37 files / 946 tests**;
`npx tsc -b --noEmit` → exit 0.

### Video-check.mjs gates at 2x

Command (per row):
```
node tools/visual-check/video-check.mjs --scene <scene> --container <mp4|webm> --fps 30 --out <dir>
```

| Scene | Container | Exit | Coded size | Gates |
|---|---|---|---|---|
| `scenes/linear-motion.marey` | mp4 | 0 | 1600x1200 (scene 800x600) | frame count, dimensions, coded=2x scene, timestamps, nearest-neighbour (90/90 strict), hashes, reference-frame bit-identity all pass |
| `scenes/linear-motion.marey` | webm | 0 | 1600x1200 (scene 800x600) | same, plus raw WebM bytes bit-identical across cold runs |
| default scene (`.visual-check/probe5c/default.marey`, extracted from `DEFAULT_CODE`) | mp4 | 0 | 1600x1200 (scene 800x600) | 180/180 frames, all strict nearest-neighbour matches, coded=2x scene |
| default scene | webm | 0 | 1600x1200 (scene 800x600) | same, raw WebM bytes bit-identical. First attempt hit the known "mediabunny did not attach" flake (spec §10); retry succeeded — recorded per that section's instruction to report a recurrence |

### Quality-check.mjs on the default scene

Command:
```
node tools/visual-check/quality-check.mjs --scene .visual-check/probe5c/default.marey --containers mp4,webm --fps 30 --out .visual-check/quality/default-2x
```

| Container | Coded size | kbit/s | PSNR (RGB, overall) | Specks/frame (total over 180) |
|---|---|---|---|---|
| mp4 | 1600x1200 | 4,399 | 41.45 dB | 623.0 (112,134) |
| webm | 1600x1200 | 5,848 | 41.55 dB | 618.4 (111,310) |

Findings §1.2's 2x table (raw WebCodecs probe, no mediabunny): H.264
8M constant 4,328 kbit/s / 42.03 dB / ~65 specks-per-frame; VP9 profile 0 8M
5,837 kbit/s / 42.17 dB / 61.5 specks-per-frame.

### 2026-09-25 fix round 1 (T1-R1): root cause found — a launch-flag difference, not a quality defect

**Raw numbers, recorded before interpretation, per ruling T1-R1.** The
committed probe (`docs/research/2026-09-24-export-quality-probes/matrix.ts`
+ `matrix-run.mjs`) as-is, no modification, copied into `.visual-check/probe/`
per findings §6 (confirmed byte-identical to the committed copies and to the
current `DEFAULT_CODE` before running:
`diff .visual-check/probe/matrix.ts docs/research/2026-09-24-export-quality-probes/matrix.ts`,
`diff .visual-check/probe/matrix-run.mjs docs/research/2026-09-24-export-quality-probes/matrix-run.mjs`,
`diff .visual-check/probe/configs2x.json docs/research/2026-09-24-export-quality-probes/configs2x.json`
— all three exit 0 — and the extracted current `DEFAULT_CODE` diffed against
`.visual-check/probe/default.marey`, also exit 0):

```
npx vite --port 5199 --strictPort   # separate terminal
SCALE=2 CONFIGS=.visual-check/probe/configs2x.json node .visual-check/probe/matrix-run.mjs
```

```
{"name":"avc-sw-8M","W":1600,"H":1200,"supported":true,"frames":180,"kbps":4317,"psnr":42.03,"specksPerFrame":66}
{"name":"avc-sw-20M","W":1600,"H":1200,"supported":true,"frames":180,"kbps":4325,"psnr":42.03,"specksPerFrame":64.3}
{"name":"avc-sw-1M","W":1600,"H":1200,"supported":true,"frames":180,"kbps":951,"psnr":39.04,"specksPerFrame":418.8}
{"name":"vp9-8M","W":1600,"H":1200,"supported":true,"frames":180,"kbps":5837,"psnr":42.17,"specksPerFrame":61.5}
{"name":"vp9-444-8M","W":1600,"H":1200,"supported":true,"frames":180,"kbps":3849,"psnr":45.17,"specksPerFrame":1}
```

This reproduces findings §1.2's 2x table almost exactly on first read — the
signal for **Outcome A** ("shipped path losing quality, diagnose it").

**Chasing Outcome A, then finding it was a false lead.** `quality-check.mjs`
measures 41.45/41.55 dB against the raw probe's 42.03/42.17 dB with the same
nominal encoder settings, on the same scene. Three of this task's own
changes were ruled out as the cause, each with a command and a measurement:

1. **Not the Text-resolution fix (this task's own Step 6 change).** Re-ran
   `quality-check.mjs` with the export `Application`'s `resolution` mutated
   back to `1` (`sed -i '164s/resolution: video.plan.scale,/resolution: 1,/'
   src/compiler/export/videoPipeline.ts`, then reverted): mp4 4,330 kbit/s /
   41.46 dB / 624.8 specks-per-frame; webm 5,840 kbit/s / 41.56 dB /
   619.1 specks-per-frame — statistically identical to scale 2. Not the
   cause.
2. **Not frame misalignment.** `video-check.mjs` on the same scene reports
   180/180 STRICT nearest-neighbour matches, `argmin === k` for every frame.
3. **Not visually obvious.** `decoded_0090.png`/`reference_0090.png`
   (`.visual-check/video/default-mp4-2x/`) read side by side, indistinguishable.

**Isolating the encoder.** A throwaway script
(`.visual-check/probe5c/raw-vs-mediabunny.mjs`, not committed) called
`window.__mareyExportVideo` once, took the EXACT `referenceFrames` PNGs
mediabunny was fed for that export, and re-encoded them with a bare
`VideoEncoder`/`VideoDecoder` at the same nominal config
(`avc1.420028`/`vp09.00.40.08`, 8 Mbit/s, constant, quality,
prefer-software). Result: **42.03/42.16 dB, 64–66 specks/frame** — matching
the raw probe, not mediabunny. Repeated 3 times (`node
.visual-check/probe5c/raw-vs-mediabunny.mjs`), and again with mediabunny's
own bundle merely loaded (`raw-with-bundle-injected.mjs`) and with a full
mediabunny decode run immediately before the raw encode
(`raw-after-decode.mjs`, matching a decode-then-encode order) — always
42.03/42.16 dB. So the reference frames and the raw-encoder config were not
the difference, and neither was decode-before-encode ordering, ruling out
several mediabunny-related hypotheses along the way.

**The actual variable, found by building a single self-contained
comparison** (`.visual-check/probe5c/same-session-compare.mjs`): one export
call, decoding BOTH mediabunny's real output and a raw re-encode of the same
reference frames, in the same page, same session. That script's raw path
measured **41.45/41.55 dB — matching mediabunny, not the 42.03/42.16 dB from
the scripts above.** A missing sort-by-timestamp on the raw decode was ruled
out first (fixed and re-measured: no change). Line-by-line comparison of the
two scripts' Chromium launch args found the actual difference: this script's
`chromium.launch({ args: [...,  "--disable-accelerated-2d-canvas"] })`
carries a flag the raw-only scripts above do not. That flag is also present
in `quality-check.mjs` and in `video-check.mjs` (`tools/visual-check/
video-check.mjs`'s own header comment: "without it, Chromium silently
switches between GPU and software 2D rasterizers mid-session and measured
pixel tolerances change depending on which frames a run happens to visit"),
and it is **absent from the committed findings probe**
(`docs/research/2026-09-24-export-quality-probes/matrix-run.mjs:6`,
`chromium.launch({ args: ["--use-angle=swiftshader",
"--enable-unsafe-swiftshader", "--use-gl=angle"] })` — no
`--disable-accelerated-2d-canvas`).

**Confirming experiment**: a copy of the committed, unmodified probe with
only that one flag added:
```
cp .visual-check/probe/matrix-run.mjs .visual-check/probe5c/matrix-run-with-flag.mjs
# add --disable-accelerated-2d-canvas to its chromium.launch args, nothing else
SCALE=2 CONFIGS=.visual-check/probe/configs2x.json node .visual-check/probe5c/matrix-run-with-flag.mjs
```
Run twice, for stability:
```
{"name":"avc-sw-8M", ..., "psnr":41.46,"specksPerFrame":622.6}
{"name":"vp9-8M", ..., "psnr":41.56,"specksPerFrame":619.1}
```
```
{"name":"avc-sw-8M", ..., "psnr":41.45,"specksPerFrame":625.3}
{"name":"vp9-8M", ..., "psnr":41.56,"specksPerFrame":619.1}
```
Stable at **41.45–41.46 / 41.56 dB**, matching `quality-check.mjs`'s
41.45/41.55 dB almost exactly, and no longer matching findings §1.2's
42.03/42.17 dB.

**Conclusion — superseded by fix round 2, below.** This round correctly
ruled out a mediabunny defect and a shipped-path regression (both hold up),
and correctly identified `--disable-accelerated-2d-canvas` as the variable.
But it treated "the flag controls `drawImage`/`getImageData`, used both in
reference-frame construction and in decode/scoring" as one undifferentiated
mechanism, and asserted "no shipped-path quality regression" without
evidence distinguishing the encoded file from the measurement instrument.
The re-review (fix round 2, T1-R2) correctly called this imprecise: PixiJS's
`extract.canvas` does not use `drawImage`/`getImageData` at all (it is
`gl.readPixels` + `putImageData`, `GlTextureSystem.generateCanvas()`) — only
the SCORING step does. The 2×2 experiment below localises the effect
precisely; read that section for the corrected conclusion.

Every throwaway script above lives under `.visual-check/probe5c/`
(gitignored) and is not committed — they answer this task's own question and
are recorded here rather than left as unverified claims.

### 2026-09-25 fix round 2 (T1-R2): localising the flag's effect with a 2×2

**The re-review's correction, accepted.** Fix round 1's mechanism was
imprecise: `renderer.extract.canvas` (which builds the reference frames)
bottoms out in PixiJS's `GlTextureSystem.generateCanvas()`
(`node_modules/pixi.js/lib/rendering/renderers/gl/texture/GlTextureSystem.js:368-380`),
which uses `gl.readPixels` + `putImageData`, not `drawImage`. The
`drawImage`+`getImageData` hops fix round 1 pointed at exist only in the
SCORING step (and in the findings probe's own `lossless()`), not in
reference-frame construction. "The flag controls drawImage/getImageData on
GPU vs software" was one undifferentiated claim covering two different
code paths; ruling T1-R2 required localising which one actually moves the
number.

**Raw numbers, recorded before interpretation, per the coordinator's
instruction.** Script: `.visual-check/probe5c/localise-2x2.mjs` (not
committed). Launches two Chromium instances against the default scene —
`gpu` (`--use-angle=swiftshader --enable-unsafe-swiftshader --use-gl=angle`,
no `--disable-accelerated-2d-canvas`) and `sw` (same, plus the flag) — each
calls `window.__mareyExportVideo` (the real dev seam, same call
`quality-check.mjs` makes) once per container, saving the encoded bytes and
`referenceFrames`. Then each of the two encoded files is decoded and scored
(against its OWN references) on BOTH browsers, giving 4 cells per
container; for WebM, the two files' decoded frames are also compared
directly against each other.

```
node .visual-check/probe5c/localise-2x2.mjs
```

```
=== mp4 ===
encoded file bytes identical (gpu vs sw)   raw=false masked=false  (gpu=3292556B sw=3301197B)
reference frames identical (gpu vs sw)     true
cell encode=GPU score=GPU   psnr=42.03 specksPerFrame=64.5
cell encode=GPU score=SW    psnr=41.46 specksPerFrame=624.7
cell encode=SW  score=GPU   psnr=42.02 specksPerFrame=64.6
cell encode=SW  score=SW    psnr=41.45 specksPerFrame=624.7

=== webm ===
encoded file bytes identical (gpu vs sw)   raw=true  (gpu=4386180B sw=4386180B)
reference frames identical (gpu vs sw)     true
cell encode=GPU score=GPU   psnr=42.16 specksPerFrame=61.7
cell encode=GPU score=SW    psnr=41.55 specksPerFrame=618.4
cell encode=SW  score=GPU   psnr=42.16 specksPerFrame=61.7
cell encode=SW  score=SW    psnr=41.55 specksPerFrame=618.4
webm decoded gpu-file vs sw-file (decoded on the gpu page)   {"frameCountsMatch":true,"frames":180,"maxDelta":0,"mismatchPixels":0,"totalPixels":345600000,"share":0}
```

Full cell data (frame counts, total specks) in
`.visual-check/probe5c/localise-2x2/report.json`, not committed. SHA-256 of
each encoded file: mp4 gpu `8c25ead74aa53178e2aba7d4b4057925d78e6278fca51d806bb576bd3738ad06`,
mp4 sw `cbde3ee149c2bf5077fa792f861158f084bae4da38276de1c4948686cdf24b96`;
webm gpu and webm sw both `3bd4c7f93c18f83c9322bda8fc9a955c07b728f528aea6421f168aaf6cc8c7a9`.

**Interpretation.**

- **The encoded file, and the reference frames, do not depend on the flag.**
  WebM's two encodes are byte-identical (same SHA-256) and, independently,
  decode to pixel-identical frames (`maxDelta: 0`, `mismatchPixels: 0` of
  345,600,000). MP4's two encodes differ in raw and masked bytes (as MP4
  always does between separate encodes of identical content — R47,
  `eval/RESULTS-PHASE-5B.md`), but the QUALITY numbers under a fixed score
  mode agree to within 0.01 dB (42.03 vs 42.02 GPU-scored; 41.46 vs 41.45
  SW-scored) and 0.1 specks/frame — noise, not a real encode-mode effect.
  Reference frames are byte-identical between modes for both containers.
  This matches PixiJS's actual mechanism (`gl.readPixels`+`putImageData`,
  not `drawImage`): extraction does not go through the 2D-canvas
  acceleration path the flag controls.
- **Only the score mode moves the number.** Within each container, GPU-scored
  cells agree with each other regardless of encode mode (42.03/42.02 mp4,
  42.16/42.16 webm) and SW-scored cells agree with each other regardless of
  encode mode (41.46/41.45 mp4, 41.55/41.55 webm) — a clean 2×2 with one
  active factor, not two. **This is the ruling's second outcome: the gap
  lives in the scoring instrument's decode-to-pixels step
  (`sample.draw(ctx, ...)` onto a 2D canvas, then `getImageData` —
  `quality-check.mjs`'s and the findings probe's `score()` both do this),
  not in the file every user's browser actually receives.**
- **Which score mode matches findings §1.2:** GPU (42.03/42.16 dB here vs
  42.03/42.17 dB in findings — matching to within 0.01–0.01 dB, the closest
  reproduction of findings §1.2 anywhere in this investigation).
  `quality-check.mjs` and fix round 1's `matrix-run-with-flag.mjs` both used
  the SW score mode (via `--disable-accelerated-2d-canvas`), which is why
  they measured ~41.5 dB — an artefact of that flag's effect on the
  scoring step, not a property of the file.
- **The speck jump, explained by the numbers.** SW-scored specks/frame
  (≈618–625) run roughly 10x GPU-scored (≈62–65) at a nearly-identical PSNR
  (≈0.6 dB apart), for BOTH codecs and BOTH encode modes. PSNR is a mean
  over every pixel, so a large population of small, widely-scattered
  per-pixel deltas barely moves it; "specks" only count pixels whose worst
  channel delta exceeds 64. The two score modes' `drawImage`+`getImageData`
  round-trip of a decoded `VideoSample` therefore reconstruct RGB from the
  decoder's YUV output with different rounding or a different colour-matrix
  application — small enough to leave the mean (PSNR) almost unchanged, but
  large enough, at scattered pixels, to cross the fixed 64-value speck
  threshold roughly ten times as often under the software path. This is
  consistent with a YUV→RGB reconstruction difference between Chromium's
  GPU-accelerated and forced-software 2D canvas paths, specifically in the
  step that draws a decoded frame — not with anything about the encoded
  bitstream itself, which (per the byte/pixel identity above) does not
  differ.

**Conclusion, superseding fix round 1's.** There is no mediabunny defect and
no shipped-path quality regression — fix round 1 got that part right, but
for an imprecise reason. The precise finding: **the file an ordinary user's
browser produces and receives is unaffected by
`--disable-accelerated-2d-canvas`** (proven for WebM by byte and pixel
identity; true for MP4's quality within measurement noise). The number that
describes what such a browser's own GPU-accelerated canvas path would show,
were it asked to draw and inspect a decoded frame the way this measurement
does, is the **GPU-scored** one: **42.03 dB / 64.5 specks-per-frame (mp4)**,
**42.16 dB / 61.7 specks-per-frame (webm)** — reproducing findings §1.2
(42.03/42.17 dB) closely. The **41.45/41.55 dB, ~620 specks-per-frame**
numbers `quality-check.mjs` reports describe the SW-scored measurement path
only — a real, reproducible number, but one that is a property of running
the *scorer* with `--disable-accelerated-2d-canvas`, not of the file. The
spec's exit criterion is re-based below to name which configuration it
measures.

### 2026-09-26: criterion 1 re-measured with committed tooling (final review I-3)

**What changed.**
- `quality-check.mjs` gains `--scorer gpu|software`, default `gpu`.
  - `gpu` launches the scoring browser without
    `--disable-accelerated-2d-canvas`. That is the configuration spec §9.1's
    re-based criterion names (ruling T1-R2).
  - `software` adds the flag and reproduces the script's earlier numbers.
  - `report.json` now records `scorer` and `launchArgs`.
- The 2×2 script moved from gitignored `.visual-check/probe5c/` to
  `docs/research/2026-09-24-export-quality-probes/localise-2x2/`, with the
  2026-09-25 run's `report.json` beside it (ruling F-R6).
  - Its encoded videos, about 15 MB, are not committed. Re-running the
    script regenerates them in `--out` (default `.visual-check/localise-2x2`).
  - It now reads the scene from `DEFAULT_CODE` directly, instead of a saved
    copy.
- This closes the T1 minor "quality-check scores under the software flag".

**Which scene.** Every number below comes from `DEFAULT_CODE`, extracted
from `src/store/defaultScene.ts` on 2026-09-26. The 2026-09-25 runs above
used `.visual-check/probe5c/default.marey`, a saved copy. `cmp` found the
two byte-identical on 2026-09-26, so both sets of numbers describe the same
scene.

**A defect found on the way, and fixed.** With the flag gone,
`quality-check.mjs` failed four runs out of four with "mediabunny did not
attach window.__mediabunny". The same command passed with
`--scorer software`.
- Cause: `installMediabunny` read the global once, immediately after
  `addScriptTag`. An inline module script runs asynchronously, so the read
  can come before the bundle has assigned the global.
- Fix: it now waits up to 30 s for the global. After the fix, both scorers
  pass first time.
- `video-check.mjs` has the same one-shot read. This may be the "mediabunny
  did not attach" flake spec §10 files. It was not changed here.

**Criterion 1, re-run.** Command:
```
node tools/visual-check/quality-check.mjs --scene .visual-check/final/default.marey --containers mp4,webm --fps 30 --out .visual-check/quality/final-default
```

| Scorer | Container | Coded size | kbit/s | PSNR | Window (§9.1) | In window | Specks/frame (total over 180) |
|---|---|---|---|---|---|---|---|
| default (`gpu`) | mp4 | 1600x1200 | 4,402 | **42.02 dB** | 42.03 ± 0.5 | yes | 62.8 (11,301) |
| default (`gpu`) | webm | 1600x1200 | 5,848 | **42.16 dB** | 42.16 ± 0.5 | yes | 61.7 (11,101) |
| `--scorer gpu` (explicit, separate run) | mp4 | 1600x1200 | 4,397 | 42.02 dB | 42.03 ± 0.5 | yes | 64.0 (11,512) |
| `--scorer gpu` (explicit, separate run) | webm | 1600x1200 | 5,848 | 42.16 dB | 42.16 ± 0.5 | yes | 61.7 (11,101) |
| `--scorer software` | mp4 | 1600x1200 | 4,402 | 41.46 dB | — | — | 625.2 (112,528) |
| `--scorer software` | webm | 1600x1200 | 5,848 | 41.55 dB | — | — | 618.4 (111,310) |

The software rows reproduce this file's first `quality-check.mjs` numbers
(41.45 / 41.55 dB). That confirms the option changes only the scorer.

**The 2×2, re-run from its committed location.** Command:
```
node docs/research/2026-09-24-export-quality-probes/localise-2x2/localise-2x2.mjs
```
The first attempt died partway through the WebM half with Playwright's
"Execution context was destroyed". No vite reload was logged at that
moment. The immediate re-run completed with exit 0:

| Container | Encode | Score | PSNR | Specks/frame |
|---|---|---|---|---|
| mp4 | GPU | GPU | 42.03 | 64.0 |
| mp4 | GPU | SW | 41.46 | 623.3 |
| mp4 | SW | GPU | 42.02 | 62.3 |
| mp4 | SW | SW | 41.45 | 625.5 |
| webm | GPU | GPU | 42.16 | 61.7 |
| webm | GPU | SW | 41.55 | 618.4 |
| webm | SW | GPU | 42.16 | 61.7 |
| webm | SW | SW | 41.55 | 618.4 |

The reference frames are identical between modes for both containers.
- WebM: the two encodes are byte-identical, and their SHA-256
  (`3bd4c7f9…c7a9`) is the same as the 2026-09-25 run's. Decoding them gives
  0 differing pixels out of 345,600,000.
- MP4: the raw and masked bytes differ, as they always do between two
  encodes (R47).

These are the same cells as fix round 2, to within 0.01 dB.

### Text sharpness (spec §2.2)

Fixture: `docs/research/2026-09-24-export-quality-probes/edge-band/text-stem.marey`
(400x200 scene, single
`text` node, `content: "H"`, `fontSize: 60`, white on black — an isolated
vertical stem to measure without other shapes in the way). Measurement
script: `docs/research/2026-09-24-export-quality-probes/edge-band/edge-band.mjs <png>`
— scans every row of the
image, finds every maximal run of pixels whose luminance sits strictly
between 10% and 90% of that row's max (the antialiased transition zone
around an edge), and reports the median/mean band width across the whole
image (not one hand-picked row, so the number is not an artefact of which
row happens to cross a serif or the crossbar).

| Condition | Command | Median band width | Mean |
|---|---|---|---|
| Native 2x (current code) | `node tools/visual-check/video-check.mjs --scene docs/research/2026-09-24-export-quality-probes/edge-band/text-stem.marey --container mp4 --fps 30 --frames 0 --out .visual-check/video/text-stem-2x` then `node docs/research/2026-09-24-export-quality-probes/edge-band/edge-band.mjs .visual-check/video/text-stem-2x/reference_0000.png` | **2 px** | 1.69 px |
| 1x-then-extracted-at-2x (mutated: `videoPipeline.ts`'s app `resolution` set to `1`, extraction still at `resolution: 2`) | same commands, run against `.visual-check/video/text-stem-1x-app/reference_0000.png` | **3 px** | 3.31 px |

Both runs' band-width distributions exclude two outlier bands (28-30 px)
present in both: these are rows crossing the glyph's horizontal cap/serif
region, where a near-horizontal edge produces a wide "band" on a
horizontal scan — an artefact of the scan direction, not of antialiasing
quality, and present symmetrically in both conditions.

Result: native 2x is measurably sharper (median 2px vs 3px, a 50% narrower
transition zone), matching spec §2.2's prediction ("a 1x-then-upscaled text
shows about a 2px band where native 2x shows about 1") in direction and
rough magnitude. The mutation was reverted immediately after both
measurements (`git diff --stat -- src/compiler/export/videoPipeline.ts`
empty).

**2026-09-26: moved and re-run (final review I-2).** Both files were
first measured from gitignored `.visual-check/probe5c/`. They now live in
`docs/research/2026-09-24-export-quality-probes/edge-band/`, byte-identical
except for the script's header, which now carries its own re-run
commands. Re-run from there, with the same commands as the table above
(output directories `text-stem-2x-final` and `text-stem-1x-app-final`):

| Condition | `video-check.mjs` exit | Median | Mean | Bands |
|---|---|---|---|---|
| Native 2x (HEAD) | 0 | **2 px** | 1.69 px | 332 |
| Control: `rasterExport.ts:242` `resolution: scale ?? 1` → `resolution: 1`, applied, run and reverted in one command | 0 | **3 px** | 3.31 px | 340 |

Both reproduce the table above exactly. `git diff --stat --
src/compiler/export/rasterExport.ts` was empty after the revert. The
control's `video-check.mjs` exit 0 is itself the finding: the output is
still 2x in size, so no frame-level gate sees the regression. Since
2026-09-26 the standing guard for it is headless:
`videoPipeline.test.ts`, "the export Application inits at the plan's
scale". It spies on `Application.prototype.init` and requires its
`resolution` to equal `VideoPlan.scale`. The same mutation turns it red:
`AssertionError: expected 1 to be 2`, 1 failed / 1049 passed.

**What this measures, and what it does not.** It compares native-2x text
with a mutated 1x-app control. It does not compare text edges with shape
edges, which is what §2.2's wording asks for. No shape-edge row was
measured. Spec §2.2 carries a dated amendment saying so (ruling F-R2).

### Mutations (GC10), each applied/run/reverted in one shell command per row, `git diff --stat` empty after every revert

| # | Mutation | Check | Result before revert | Reverted |
|---|---|---|---|---|
| (a) | `frameRaster.ts`'s `extract.canvas` `resolution: scale` → `resolution: 1` | `video-check.mjs --scene scenes/linear-motion.marey --container mp4` | Exit 1. Caught by the pre-existing `dimensionsMatch` gate: decoded video 800x600 vs the plan's declared 1600x1200 (`match: false`) — **not** by the new `codedSizeIsDouble` gate, which only checks `VideoPlan`'s own declared arithmetic and stays true regardless of what was actually rasterized. Both gates matter for different failure classes; this mutation shows which one actually catches a rasterization regression. | Yes, confirmed empty diff |
| (b) | `videoPipeline.ts`'s app `resolution: video.plan.scale` → `resolution: 1` | The Step 8 text edge-band measurement (above) | Median band width widened 2px → 3px | Yes, confirmed empty diff |
| (c) | `videoPipeline.ts`'s `if (limitRefusal) throw new Error(...)` → deleted | `npx vitest run` (headless suite) | **Stayed green: 946/946.** `deviceLimitDiagnostic` is a pure function tested directly in `videoContract.test.ts`; nothing headless exercises the pipeline's one-line integration of it. | — |
| (c), continued | Same deletion | `tools/visual-check/device-limit-check.mjs` (standing, committed script — see "2026-09-25 fix round 1" below), `--scene .visual-check/probe5c/default.marey --limit 100` | Before mutation: throws `VIDEO_EXCEEDS_DEVICE_LIMITS`, exit 0. After deleting the throw: `{"threw": false}`, exit 1 (correctly red). | Yes, confirmed empty diff |

**Step 9(c) resolution: Option B was taken** — a browser check with a
forced tiny limit was added and, per fix round 1 (finding 3, below),
promoted to a standing, committed script under
`tools/visual-check/`, documented in `SKILL.md`. It patches
`WebGL2RenderingContext.prototype.getParameter` via Playwright's
`page.addInitScript`, entirely in the harness, so no production hook was
needed — see `device-limit-check.mjs`'s own header comment and the fix-round
section below.

### 2026-09-25 fix round 1: findings 2 and 3

**Finding 2 (minor).** `video-check.mjs`'s "decoded dimensions" console
line labelled `runA.result.width`/`height` as "scene" when they are the
CODED size (Phase 5C). Fixed: relabelled to "coded", and the header
comment's matching exit-code bullet reworded to distinguish the coded size
from `sceneWidth`/`sceneHeight`.

**Finding 3 (minor).** The device-limit throw in `videoPipeline.ts:182` had
no standing, committed regression check. Fixed: `device-limit-check.mjs` is
now committed under `tools/visual-check/` and documented in
`SKILL.md` ("Forcing a device-limit refusal"). It forces the limit via
Playwright's `page.addInitScript`, which runs in the page before any of the
app's own scripts and patches the browser's own
`WebGL2RenderingContext.prototype.getParameter` — entirely inside the
harness, not the shipped pipeline, so no production hook (dev seam or
otherwise) was needed for this. Re-confirmed the mutation after promoting
it: deleting `videoPipeline.ts`'s `if (limitRefusal) throw ...` line makes
`node tools/visual-check/device-limit-check.mjs --scene
.visual-check/probe5c/default.marey --limit 100` go from exit 0 to exit 1
(`{"threw": false}`); reverted, `git diff --stat -- src/compiler/export/
videoPipeline.ts` empty. Also verified the control case (a scene whose
coded size fits under `--limit`, and a scene lacking a `duration:`) both
correctly report a non-`VIDEO_EXCEEDS_DEVICE_LIMITS` failure rather than a
false pass.

### Environment

`npx vite --port 5199 --strictPort` for every browser check above. Boundary
netstat before starting: `netstat -ano | grep -E "[:.]5199[[:space:]].*LISTENING"` →
no output (port free). Killed and re-checked after all browser work for this
task finished — see the task report for the exact before/after pair.

---

## Piece 2: `line` in Lottie (Task 2)

**Baseline.** At `91ac3bd` (Task 1 complete), from
`C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey`: `npx vitest run` → **37
files / 946 tests**; `npx tsc -b --noEmit` → exit 0.

**What changed.** `lottieGeometry.ts`'s `planLottie` no longer refuses a
`line` node: `shapeGeometryFor` gains a `"line"` case reusing `polygonBBox`
for the same min/max scan `builder.ts`'s own `line` case performs, so the
anchor matches the rendered pivot. `LOTTIE_UNSUPPORTED_LINE` is removed from
`LottieDiagnosticCode`. `lottieEncode.ts`'s `shapeItemsFor` gains a
`"line"` case emitting an open (`c: false`) `sh` path with all-zero
tangents, and the style branch after the geometry switch is now
conditional: a line gets a `st` (stroke) item — `lc: 1` (butt), `lj: 1`
(miter), `ml: 10`, width from `shape.thickness` — placed AFTER the path,
never a fill. `LottieShapeItem` gains the `st` variant.

After the final commit: `npx vitest run` → **37 files / 950 tests**;
`npx tsc -b --noEmit` → exit 0.

### Files changed

```
 .../visual-check/scenes/lottie-line-caps.marey     | 38 ++++++++++++
 .../visual-check/scenes/lottie-line-miter.marey    | 47 +++++++++++++++
 .../visual-check/scenes/lottie-line-scale.marey    | 42 +++++++++++++
 src/compiler/export/exportBoundary.test.ts         | 25 +++++++
 src/compiler/export/lottieEncode.test.ts           | 29 +++++++++
 src/compiler/export/lottieEncode.ts                | 45 +++++++++++++-
 src/compiler/export/lottieGeometry.test.ts         | 40 +++++++++++---
 src/compiler/export/lottieGeometry.ts              | 33 +++++++------
 8 files changed, 278 insertions(+), 21 deletions(-)
```

`lottieRoundTrip.test.ts` and `exportBoundary.test.ts`'s existing rows were
checked and NOT modified for kind-enumeration: `lottieRoundTrip.test.ts`
exercises `compound-logo.marey` only (no `line` there, and it never
enumerates supported kinds), so nothing in it referenced the refused kind.

### TDD evidence

**Step 1 — GC6 boundary rows (commit `17f0b69`).** `exportBoundary.test.ts`
had five video-module rows but none for `lottieEncode.ts`/`lottieGeometry.ts`,
even though both files have carried their structural rules since Phase 5A.
Added two new tests (plus identity checks and the two files' constants folded
into the "reads the file it claims to read" test). They passed immediately
(the rule already held); proved each could fail:

```
sed -i '1i import "pixi.js";' src/compiler/export/lottieEncode.ts && npx vitest run src/compiler/export/exportBoundary.test.ts
# -> RED: "lottieEncode.ts does not import pixi.js, sceneIR or harfbuzzjs in any form"
git checkout -- src/compiler/export/lottieEncode.ts && git diff --stat -- src/compiler/export/lottieEncode.ts   # empty
```
Same pattern for `lottieGeometry.ts`. Both reverted, both `git diff --stat`
empty. Full suite after: 948/948.

**Step 2/3 — geometry (commit `c9641ab`).** Added the RED tests first and
confirmed they named the missing behaviour, not a missing helper:
- `plans a scene with a line ok, rather than refusing it` → RED:
  `expected false to be true` on `r.ok`.
- `accepts the five supported kinds` → RED, same assertion.
- `plans a line as an open-path spec anchored like builder.ts's line case`
  → RED: `Error: unexpected refusal: LOTTIE_UNSUPPORTED_LINE`.

Command: `npx vitest run src/compiler/export/lottieGeometry.test.ts` (3
failed / 10 passed). Implemented the `"line"` case in `shapeGeometryFor`
and removed the refusal arm from `walk`; reran → 13/13 green. Reworked (not
deleted-then-silent) the two tests `LOTTIE_UNSUPPORTED_LINE` touched:
"refuses a line node by name" → "plans a scene with a line ok..."; "reports
every unsupported node, not only the first" → now uses two `text` nodes
(the one remaining unsupported kind) since a single line+text fixture no
longer has two *kinds* to miss. Full suite after: 949/949; `tsc` exit 0.

**Step 4/5 — encoding (commit `66cf1d3`).** Added the RED test in
`encodeLottie · per-kind geometry` using the file's own `only`/`layerNamed`
helpers (no new builder needed):

```
npx vitest run src/compiler/export/lottieEncode.test.ts
# RED: expected [ 'fl' ] to deeply equal [ 'sh', 'st' ]
```
The line fell through the geometry switch's (absent) `"line"` arm into no
push at all, then the unconditional fill branch pushed `fl` — the RED named
exactly the missing behaviour (no path item, wrong style item), not a
missing helper. Implemented the `"line"` case in `shapeItemsFor` and the
`shape.kind === "line"` conditional replacing the unconditional fill push;
reran → 31/31 green. Full suite after: 950/950; `tsc` exit 0.

### Step 6 — judgment-call flips (§2d), applied/run/reverted individually

| # | Mutation | Command | Result | Reverted |
|---|---|---|---|---|
| 1 | Stroke pushed with `items.unshift(...)` instead of `.push(...)` (stroke before path) | `sed -i '420s/items.push({/items.unshift({/' src/compiler/export/lottieEncode.ts && npx vitest run src/compiler/export/lottieEncode.test.ts` | RED: `['st','sh']` vs expected `['sh','st']` | Yes, `git diff --stat` empty |
| 2 | Line path's `c: false` → `c: true` (closed instead of open) | `sed -i '399s/c: false/c: true/' src/compiler/export/lottieEncode.ts && npx vitest run ...` | RED: `sh.ks.k.c` — expected `false`, got `true` | Yes, `git diff --stat` empty |

Both flips are load-bearing — neither leaves the Step 4 test green — so no
extra test was needed to make them load-bearing (design §8's instruction
for a flip that stays green).

### Delete-and-run (GC11), each behaviour individually, each reverted

| Behaviour deleted | Command | Result | Reverted |
|---|---|---|---|
| `shapeGeometryFor`'s `"line"` case | node script removing the exact block, then `npx vitest run src/compiler/export/lottieGeometry.test.ts` | RED ×3, each throwing `[LOTTIE] shapeGeometryFor called with unsupported kind 'line'` — names the missing behaviour, not a missing helper | Yes, `git diff --stat` empty |
| `shapeItemsFor`'s `"line"` case (path item) | same technique on `lottieEncode.ts`, then `npx vitest run src/compiler/export/lottieEncode.test.ts` | RED: `['st']` vs `['sh','st']` — path item missing | Yes, `git diff --stat` empty |
| The `shape.kind === "line"` stroke branch (`if (false && shape.kind === "line")`) | `sed -i '407s/if (shape.kind === "line")/if (false \&\& shape.kind === "line")/' ...` | RED: `['sh','fl']` vs `['sh','st']` — a line would get a FILL, the exact "never a fill" case this task requires | Yes, `git diff --stat` empty |

`git diff --stat` (whole tree) confirmed empty after every mutation in this
section and the one above; `npx vitest run` → 950/950 and `npx tsc -b
--noEmit` → exit 0 both re-confirmed clean afterward.

### The three §3.4 facts, measured

All three fixtures under `tools/visual-check/scenes/`. Dev server:
`npx vite --port 5199 --strictPort` (background); boundary netstat before
starting returned nothing (port free) — see "Environment" below for the
exact before/after pair for this task.

**A harness-environment artifact found and isolated before trusting any
number below.** The first `lottie-check.mjs` run against `lottie-line-miter.marey`
showed BOTH the 14° and 9° corners rendering as small, identical rounded
bumps — matching neither a miter spike nor a flat bevel, and identical
between two corners whose SVG ratios (8.2 vs 12.7) straddle the limit and
therefore should NOT look identical. Isolated by successive controlled
reproductions (all under `.visual-check/probe5c-t2/`, not committed,
throwaway):
1. Calling pixi.js's own `buildLine` directly (no browser) on both corners'
   points confirms pixi's real geometry: 14° produces a joint vertex at
   distance 82.055 from the vertex (`10/sin(7°)`, a genuine miter spike);
   9° produces its farthest joint vertices at distance 10.000 (the plain
   per-segment offset — a bevel, not a spike reaching 127.45). Command:
   `node .visual-check/probe5c-t2/miter-probe2.mjs`.
2. Raw Canvas 2D (`ctx.lineJoin='miter'`, `ctx.miterLimit=10`), stroking the
   identical two paths directly with no lottie-web involved, reproduces
   exactly this: 14° fill reaches to y≈70 (matching the 82-unit spike);
   9° fill starts at y≈150 (the vertex itself, no spike). Command:
   `node .visual-check/probe5c-t2/canvas2d-miter-probe.mjs`.
3. lottie-web itself, driven from a **blank page** (no live Marey app) with
   the SAME exported `doc.json`, reproduces the same correct result exactly
   (`node .visual-check/probe5c-t2/trace-lottie-web4.mjs`) — lottie-web's
   own miter/bevel logic agrees with pixi's.
4. Bisecting what differs between that clean reproduction and the real
   `lottie-check.mjs` run: navigating to the real Marey app, loading the
   miter scene, and calling the real `window.__mareyExportLottie` seam
   BEFORE rendering with lottie-web reproduces the bug
   (`node .visual-check/probe5c-t2/trace-lottie-web8.mjs`); doing the same
   without ever calling the export seam does NOT
   (`node .visual-check/probe5c-t2/trace-lottie-web10.mjs`). Removing only
   `--disable-accelerated-2d-canvas` from the launch args, with the export
   seam still called, "fixes" it
   (`node .visual-check/probe5c-t2/trace-lottie-web11.mjs`).
   **Conclusion: running the export pipeline's own temporary WebGL
   Application on a page, then drawing a mitered stroke to a 2D canvas
   forced into software rasterisation (`--disable-accelerated-2d-canvas`),
   degrades that 2D canvas's own miter-join computation for everything
   drawn afterward on the SAME page.** This is a Chromium/environment
   interaction between two of `lottie-check.mjs`'s own launch flags and its
   own call sequence — not a defect in `lottieEncode.ts`/`lottieGeometry.ts`,
   not a defect in the exported document (bullet 3 proves the document is
   right), and not a real pixi-vs-Lottie semantic disagreement. The SAME
   artifact also affects **caps** (below) but was confirmed absent for the
   **scale** fixture (no join geometry involved). **Filed, not fixed**: the
   fix would mean changing `lottie-check.mjs`'s own launch flags or call
   order, which is outside Task 2's file list and risks the determinism
   properties documented for that flag elsewhere in this file (T1-R1/T1-R2,
   above) and in `SKILL.md`. Reported prominently, per this task's own
   ambiguity resolution for a §3.4 disagreement — except here the
   "disagreement" is the harness's, not pixi's and Lottie's.

Given this, every number below distinguishes the **official** run (the
standing harness invoked exactly as instructed, confounded by the artifact
where noted) from a **clean** cross-check (same `doc.json`, rendered from a
blank page with no prior export call — isolates the real answer).

**1. Miter (`lottie-line-miter.marey`).**

Official command:
```
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-line-miter.marey \
  --fps 30 --frames 0 --at 150,70 --at 150,120 --at 350,70 --at 350,120 \
  --compare-png --out .visual-check/lottie-t2/miter-final
```
Official result (confounded by the artifact above): all four samples
`rgba(0,0,0,255)` — both corners look bevelled. `--compare-png`: maxDelta
255 at (149,75), 4323/150000 mismatching (2.8820%).

Marey's own PNG export of the identical frame
(`frame_0_pngexport.png`) shows the true, expected pixi geometry
unambiguously: the 14° corner is a tall sharp spike almost reaching the top
of the 300px-tall frame; the 9° corner is a flat-topped trapezoid with no
spike — read directly with the Read tool.

Clean cross-check (isolates the real lottie-web answer):
```
node .visual-check/probe5c-t2/trace-lottie-web4.mjs
# x=150 (14deg): y=65..145 all WHITE from y=70 onward (matches the 82-unit spike)
# x=350 (9deg):  BLACK until y=150 (the vertex itself; no spike)
node .visual-check/probe5c-t2/clean-compare.mjs .visual-check/lottie-t2/miter-final/doc.json .visual-check/lottie-t2/miter-final/frame_0_pngexport.png
# {"maxDelta":80,"maxAt":{"x":347,"y":250},"mismatching":671,"total":150000,"share":"0.4473%"}
```
**Answer: pixi and Lottie AGREE.** Both use the SVG ratio `1/sin(θ/2)`
against the same limit (10): 14° (ratio 8.206) miters in both; 9° (ratio
12.745) bevels in both. `ml: 10` stays, with the comment in
`lottieEncode.ts` citing pixi's own `GraphicsContext.defaultStrokeStyle`
and this measurement. The clean maxDelta (80, 0.4473% share, no full-scale
255 region) is ordinary edge antialiasing between two different
rasterisers, the same shape the SKILL.md doc describes as expected.

**2. Non-uniform scale (`lottie-line-scale.marey`).**

Official command (fine cross-section scan via repeated `--at`):
```
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-line-scale.marey \
  --fps 30 --frames 0 --at 100,92 ... --at 100,108 --at 192,100 ... --at 208,100 \
  --compare-png --out .visual-check/lottie-t2/scale-final
```
Not affected by the artifact above (no join geometry): official and clean
(`node .visual-check/probe5c-t2/scale-clean-check.mjs`) scans agree exactly.
50%-crossing interpolation over the scanned pixel values:
- **Horizontal-path line** (`horiz`, thickness 10, `scale: (0.35, 0.5)`):
  edges at y≈97.01 and y≈101.99 → **width ≈ 4.98 px** (predicted
  `10 × scaleY = 5`).
- **Vertical-path line** (`vert`, same thickness/scale): edges at x≈197.67
  and x≈201.33 → **width ≈ 3.66 px** (predicted `10 × scaleX = 3.5`).

Both renderers agree (pixi's own PNG sampled at the same coordinates via
`node .visual-check/probe5c-t2/sample-png.mjs` reads 192/255 at x=201,
matching lottie-web's 191/255). `--compare-png`: maxDelta 255 at (199,75)
share 0.1424% officially (small, localised to a cap edge, confirmed benign
by the diff PNG — antialiasing dots only); clean whole-frame check
(`clean-compare.mjs`) gives maxDelta 1, share 0.2061%.

**Correction to design §3.4.2's prose.** The brief/design text predicted
"vertical 5px, horizontal 3.5px". The MEASURED pairing is the opposite:
**horizontal ≈5px, vertical ≈3.5px** — a line's stroke cross-section is
built in local, pre-scale space perpendicular to its OWN direction (a
horizontal-path line's cross-section runs along local Y, so it scales by
`scale.y`; a vertical-path line's cross-section runs along local X, scaling
by `scale.x`), and `scale: (0.35, 0.5)` makes `scale.y` (0.5) the larger
factor. The two NUMBERS (5 and 3.5) were exactly right; only which line
they were attached to was swapped. Both renderers agree with each other and
with this corrected pairing, which is what design §3.4.2 actually needed
settled.

**3. Caps (`lottie-line-caps.marey`).**

Official command:
```
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-line-caps.marey \
  --fps 30 --frames 0 \
  --at 97,100 --at 102,100 --at 140,100 --at 178,100 --at 183,100 \
  --at 97,220 --at 102,220 --at 140,220 --at 178,220 --at 183,220 \
  --compare-png --out .visual-check/lottie-t2/caps-final
```
Official result: `(183,100)` (3px past the "plain" line's right end)
reads WHITE — WRONG for a butt cap, and the frame PNG visibly shows a
ROUNDED bump at the right end of both bars. This is the SAME
export-seam-then-forced-software-2D-canvas artifact described above (it is
not specific to joins after all — it also affects caps). `--compare-png`:
maxDelta 255 at (180,94), 808/89600 mismatching (0.9018%).

Clean cross-check:
```
node .visual-check/probe5c-t2/caps-clean-full.mjs
# lx=-3:0  lx=0:255  lx=2:255  lx=40:255  lx=78:255  lx=80:0  lx=83:0
# IDENTICAL for "plain" (y=100) and "repeated" (y=220)
node .visual-check/probe5c-t2/clean-compare.mjs .visual-check/lottie-t2/caps-final/doc.json .visual-check/lottie-t2/caps-final/frame_0_pngexport.png
# {"maxDelta":0,"maxAt":null,"mismatching":0,"total":89600,"share":"0.0000%"}
```
Marey's own PNG export (`frame_0_pngexport.png`) shows both bars with flat,
sharp, butt-capped ends on both sides, matching the clean lottie-web
render exactly — **0 differing pixels across the whole frame.**

**Answer: butt caps are correct on a two-point line, in both renderers,
once the harness artifact is bypassed. A zero-length segment WITHIN a line
(`(0,0),(40,0),(40,0),(80,0)`) produces NO visible difference from the
plain two-point line** — confirmed at every one of 7 sampled offsets
(including the repeat point itself, `lx=40`) in both the "plain" and
"repeated" rows. This matches pixi's own `buildLine`, called directly
outside a browser: the repeated point produces NaN-valued vertices for the
degenerate join, but every triangle touching a real vertex reproduces the
plain line's own rectangle exactly (`node .visual-check/probe5c-t2/repeated-point-probe.mjs`).

### Criterion 2 summary

| Fixture | Official (`--compare-png`, harness as instructed) | Clean (harness artifact bypassed) |
|---|---|---|
| miter | maxDelta 255, 4323/150000 (2.8820%) — **superseded, see below** | maxDelta 80, 671/150000 (0.4473%) |
| scale | maxDelta 255, 94/66000 (0.1424%) — **superseded, see below** | maxDelta 1, 136/66000 (0.2061%) |
| caps | maxDelta 255, 808/89600 (0.9018%) — **superseded, see below** | maxDelta 0, 0/89600 (0.0000%) |

The "official" numbers for miter and caps were stated for the record at the
time because the Task 2 brief instructed running `lottie-check.mjs
--compare-png` and reporting what it said — but the "clean" numbers were
already the ones that actually answered design §3.4's question, per the
artifact finding above. Task 3 fixed the artifact in the harness itself
(below), so the "official" column is now superseded: the SAME command,
against the fixed harness, produces the "clean" numbers directly, and the
harness-artifact distinction this table drew no longer applies going
forward.

### 2026-09-25 fix round (Task 3, ruling T3-R1): the harness itself fixed, and re-measured

**Reason superseded, in one line.** The "official" row above was never a
property of the exported document or of pixi/Lottie's geometry — it was an
artifact of `lottie-check.mjs` running the export seam's pixi WebGL
`Application` and lottie-web's forced-software 2D canvas render in the SAME
Node.js process. Task 3 (T3-R1) fixed the harness by moving the render half
into a separate spawned process (`lottie-render-worker.mjs`); see that
task's report and `lottie-check.mjs`'s own header comment for the full
measurement trail (a second page, and even a second `chromium.launch()` in
the same process, were both measured to still carry the defect — only a
genuinely separate `node` invocation removed it).

**Re-measurement, same three fixtures, same official command, fixed
harness.** Dev server: `npx vite --port 5199 --strictPort`, boundary netstat
on 5199 confirmed free before starting and free again after killing it
(exact commands in the Task 3 report).

Miter:
```
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-line-miter.marey \
  --fps 30 --frames 0 --at 150,70 --at 150,120 --at 350,70 --at 350,120 \
  --compare-png --out .visual-check/5c-t3/miter-fixed2
```
`(150,70) -> rgba(78,78,78,255)`, `(150,120) -> rgba(255,255,255,255)`,
`(350,70) -> rgba(0,0,0,255)`, `(350,120) -> rgba(0,0,0,255)` — the 14°
corner reads as a real antialiased spike, not a rounded bump.
`--compare-png: maxDelta=80 at (347,250), mismatching pixels=671/150000
(0.4473%)`.

Scale:
```
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-line-scale.marey \
  --fps 30 --frames 0 --at <17 points across both edges> \
  --compare-png --out .visual-check/5c-t3/scale-fixed
```
`--compare-png: maxDelta=1 at (198,80), mismatching pixels=136/66000
(0.2061%)`.

Caps:
```
node tools/visual-check/lottie-check.mjs \
  --scene tools/visual-check/scenes/lottie-line-caps.marey \
  --fps 30 --frames 0 \
  --at 97,100 --at 102,100 --at 140,100 --at 178,100 --at 183,100 \
  --at 97,220 --at 102,220 --at 140,220 --at 178,220 --at 183,220 \
  --compare-png --out .visual-check/5c-t3/caps-fixed
```
`(183,100) -> rgba(0,0,0,255)` — a correct butt cap, not the rounded-bump
white read the broken harness gave. `--compare-png: maxDelta=0 at null,
mismatching pixels=0/89600 (0.0000%)`.

**Result: all three fixtures' new official numbers, from the SAME command
Task 2's brief specified, now equal the "clean" column above exactly** (80/
671/150000/0.4473% for miter; 1/136/66000/0.2061% for scale; 0/0/89600/
0.0000% for caps). The harness-artifact distinction this table drew in Task
2 is no longer needed: there is now one number per fixture, not two.

### Stale doc mentions found (not edited, per this task's scope)

- `docs/architecture/renderer.md` — not edited (Task 9's file, per this
  task's instructions).
- `eval/RESULTS-PHASE-5A.md` — not edited (a prior phase's record, per this
  task's instructions).
- `docs/architecture/roadmap-and-process.md:181-183` — states
  "`LOTTIE_UNSUPPORTED_TEXT` and `LOTTIE_UNSUPPORTED_LINE` are the whole
  refusal surface" describing Phase 5A's completed state. Now stale: only
  `LOTTIE_UNSUPPORTED_TEXT` remains (until Task 8). Not in this task's file
  list; left for Task 9 (docs) or the phase-status update.

### What was NOT done

- The environment artifact above is filed, not fixed — fixing it would mean
  editing `lottie-check.mjs`'s launch flags or call sequencing, outside this
  task's file list, and risks the determinism guarantees documented for
  `--disable-accelerated-2d-canvas` elsewhere on this page and in
  `SKILL.md`.
- No test was added asserting the exact numeric miter-tip pixel location
  (e.g. "y=68 is white") — the discriminating tests already in
  `lottieEncode.test.ts` pin the *document's* fields (`lj`, `ml`, `w`,
  order), which is what the product ships; the pixel-level agreement is a
  browser fact recorded here, not something the headless suite can or
  should assert given the harness artifact just described.
- `lottieRoundTrip.test.ts` was read and left unmodified — it does not
  enumerate supported/refused kinds.

### Environment

Port 5199 confirmed free before starting vite (`netstat -ano | grep -E
"[:.]5199[[:space:]].*LISTENING"` → no output), vite started with `npx vite
--port 5199 --strictPort` in the background, and confirmed listening
(`netstat` → one `LISTENING` row) before any browser check in this task.
Killed and re-confirmed free after all Task 2 browser work — see the task
report for the exact commands and output.

---

## Piece 3: the shipped Lottie button (Task 3)

**Baseline.** At `123c55f` (Task 2 complete), from
`C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey`: `npx vitest run` → **37
files / 950 tests**; `npx tsc -b --noEmit` → exit 0.

**What changed.** `src/compiler/export/lottiePipeline.ts` (new) is the one
copy of compile → `planExport` → `planLottie` → build → sample →
`encodeLottie`, moved from `devLottieSeam.ts`'s `exportLottie`; every
diagnostic reaches the caller unprefixed, joined `" | "`, and the
document's `nm` is `"Marey scene"`. `lottieGeometry.ts` now exports
`hexToRgb01`; the seam's and `lottieRoundTrip.test.ts`'s own copies are
gone. `devLottieSeam.ts` is a thin observer (67 lines, down from 170).
`src/hooks/useExport.ts` (new, replacing `useExportVideo.ts`) generalises
to `ExportKind = "mp4" | "webm" | "apng" | "lottie"`, with one
`isExporting`/progress shape and one `download()` helper; `lottie` calls
the new pipeline via dynamic `import()` and downloads `scene.json`; `apng`
throws its T5 placeholder. `TopBar.tsx` gains a **lottie** button next to
**webm**, labelled `…` while running (no per-frame progress).
`exportBoundary.test.ts`'s R3 block widens from video-only to both
pipelines. `lottie-check.mjs` was fixed (ruling T3-R1, below) rather than
left comments-only, because the seam's result shape did not change but the
harness's own process model did.

After the final commit: `npx vitest run` → **38 files / 957 tests**; `npx
tsc -b --noEmit` → exit 0.

### Files changed

Exact `git diff --stat 123c55f..HEAD` for this task's paths:

```
 tools/visual-check/SKILL.md                    |  19 +
 tools/visual-check/lottie-check.mjs             | 543 +++++++--------
 tools/visual-check/lottie-click-check.mjs (new) | 383 ++++++
 tools/visual-check/lottie-render-worker.mjs (new)| 396 ++++++
 src/compiler/export/exportApp.test.ts                    |   4 +-
 src/compiler/export/exportBoundary.test.ts               | 105 ++--
 src/compiler/export/lottieGeometry.ts                    |   7 +-
 src/compiler/export/lottiePipeline.test.ts (new)         | 119 +++
 src/compiler/export/lottiePipeline.ts (new)              | 135 +++
 src/compiler/export/lottieRoundTrip.test.ts              |  18 +-
 src/compiler/export/videoEncode.ts                       |   2 +-
 src/compiler/export/videoPipeline.test.ts                |   4 +-
 src/compiler/export/videoPipeline.ts                     |   4 +-
 src/components/TopBar/TopBar.tsx                         |  50 +-
 src/hooks/useExport.ts (new)                             | 133 +++
 src/hooks/useExportVideo.ts (deleted)                    | 116 ---
 src/lib/devLottieSeam.ts                                 | 140 +---
 src/lib/devVideoSeam.ts                                  |   2 +-
 src/main.tsx                                             |   2 +-
 src/store/defaultScene.test.ts                           |   2 +-
 20 files changed, 1499 insertions(+), 685 deletions(-)
```

plus `eval/RESULTS-PHASE-5C.md` (this section and the Piece 2 supersession
above), not included in that diff range.

### TDD evidence

**Step 1 — move the orchestration.** `lottiePipeline.test.ts` is new: no
RED/GREEN cycle for the move itself (it is a move, not new behaviour), but
its own three refusal-path tests were written and run RED before the
fixtures were fixed — see below.

**`lottiePipeline.test.ts`'s own RED, read.** First run: 2 of 6 failed —
`refuses a text node verbatim...` (`expected false to be true` on
`.startsWith("[LOTTIE_UNSUPPORTED_TEXT] ")`) and `goes on to build the
scene once planLottie accepts...` (message was a compile-phase `TYPE`
error, not what the test needed past). Both named a fixture bug (both
fixtures omitted the DSL's required `position` property, so the scene
never compiled far enough to reach `planLottie` at all) rather than a
missing behaviour. Fixed both fixtures (`position: (0,0), ...`); reran →
6/6 green.

**Boundary guards (Step 2), each proven by a temporary mutation, run, and
manual revert** (untracked/modified files at the time — `useExport.ts` did
not exist yet in git, and `TopBar.tsx`/`exportBoundary.test.ts` had other
uncommitted changes — so `git checkout --` was not available; each mutation
line was inserted with `sed`, tested, then deleted with `sed` again):

| Guard | Mutation | Result |
|---|---|---|
| `lottiePipeline.ts` does not import `devLottieSeam` | `sed -i '1i import "../../lib/devLottieSeam";'` | RED: `expected true to be false` on the new "does not import devLottieSeam.ts" test |
| `useExport.ts` does not import any dev seam | `sed -i '1i import "../lib/devVideoSeam";'` | RED: same assertion, `useExport.ts`'s row |
| `useExport.ts` loads pipelines only via dynamic `import()` | added a static `import { runLottieExport as _x } from "../compiler/export/lottiePipeline";` | RED: `staticallyImportsModule(...)` — `expected true to be false` |
| `TopBar.tsx` does not import any dev seam | `sed -i '1i import "../../lib/devLottieSeam";'` | RED: same assertion, `TopBar.tsx`'s row |

All four reverted; `git diff --stat` empty after each.

**Step 7 — product mutations, GC10:**

| # | Mutation | Command | Result | Reverted |
|---|---|---|---|---|
| (a) | `runLottieExport` encodes `frames.slice().reverse()` | `sed -i '120s/.../.../' src/compiler/export/lottiePipeline.ts`, then `lottie-check.mjs --scene eval/scenes-3b/compound-logo.marey --fps 30 --frames 0,48,75,180,239 --compare-png` | RED on every requested frame: maxDelta jumped from 71–81 to **241**, share from ~0.12% to **~2.4–2.46%**, including frames 180/239 which exactly matched before | Yes, `git diff --stat` empty |
| (b) | The hook downloads `JSON.stringify(doc).slice(0, -1)` | `sed -i '106s/.../.../' src/hooks/useExport.ts`, then `lottie-click-check.mjs --scene eval/scenes-3b/compound-logo.marey --url http://localhost:5199` | RED: `parseOk=false`, `Expected ',' or '}' after property value in JSON at position 42073` | Yes, `git diff --stat` empty |

**One extra delete-and-run, for `lottiePipeline.test.ts`'s own load-bearing-ness (GC11):** `sed -i '68s/join(" | ")/join(" ")/' src/compiler/export/lottiePipeline.ts`, then `npx vitest run src/compiler/export/lottiePipeline.test.ts` → RED: `expected [ Array(1) ] to have a length of 2`. Reverted; `git diff --stat` empty; full suite reconfirmed 38/957 green afterward.

### T3-R1: the Lottie harness fix, and the re-measured line fixtures

The independent verification (`task-2-verify.md`) found that
`lottie-check.mjs`'s stroke join/cap defect needed BOTH the export seam's
pixi `Application` AND `--disable-accelerated-2d-canvas` on the same page.
The ruling's own proposed fix — "export on one page, render in a fresh page
or context" — was **measured and found insufficient**: a second
`browser.newPage()` (its own `BrowserContext`) and even a second
`chromium.launch()` (a fresh Chromium OS process) both still reproduced the
broken join, provided export and render shared one Node.js process. Only
spawning the render half as a genuinely separate `node` invocation
(`lottie-render-worker.mjs`, via `child_process.spawnSync`) removed the
defect — reproduced on repeated runs, and with a 3-second delay inserted
between closing the first browser and launching the second, ruling out a
teardown race. `lottie-check.mjs` still forces
`--disable-accelerated-2d-canvas` (5A's own, separate determinism reason
for that flag is untouched) and still runs `--compare-png`'s PNG export on
the export side. Documented in `lottie-check.mjs`'s own header comment,
`lottie-render-worker.mjs`'s header comment, and `SKILL.md`'s "Exporting
Lottie" section.

**Re-measured, same three fixtures, same official command Task 2's brief
specified, fixed harness:**

| Fixture | Command | New official result | Task 2's "clean" number |
|---|---|---|---|
| miter | `--scene scenes/lottie-line-miter.marey --frames 0 --at 150,70 --at 150,120 --at 350,70 --at 350,120 --compare-png` | maxDelta 80 at (347,250), 671/150000 (0.4473%); `(150,70)`→`rgba(78,78,78,255)` (real spike, not a rounded bump) | maxDelta 80, 671/150000 (0.4473%) — **exact match** |
| scale | `--scene scenes/lottie-line-scale.marey --frames 0 --at <17 points> --compare-png` | maxDelta 1 at (198,80), 136/66000 (0.2061%) | maxDelta 1, 136/66000 (0.2061%) — **exact match** |
| caps | `--scene scenes/lottie-line-caps.marey --frames 0 --at <10 points> --compare-png` | maxDelta 0, 0/89600 (0.0000%); `(183,100)`→`rgba(0,0,0,255)` (correct butt cap) | maxDelta 0, 0/89600 (0.0000%) — **exact match** |

All three now equal Task 2's "clean" (artifact-bypassed) numbers exactly,
through the SAME command the brief specified — see the Piece 2 update
above for the superseded "official" numbers this replaces.

### T3-R2: the same-machine A/B regression gate, and 5A's table alongside

Command (identical on both sides — the SAME fixed `lottie-check.mjs` file,
pointed at each server with `--url`):
```
node tools/visual-check/lottie-check.mjs --scene eval/scenes-3b/compound-logo.marey --fps 30 --frames 0,48,75,180,239 --compare-png --out <dir>
```

**main (`4a23e1d`, temporary `git worktree add ../marey-wt-main-t3 4a23e1d`,
its own `npx vite --port 5199 --strictPort`, `node_modules` symlinked from
this checkout since `package.json` is identical):**

| Frame | maxDelta | At | Mismatching | Share |
|---|---|---|---|---|
| 0 | 78 | (166,52) | 560/480000 | 0.1167% |
| 48 | 83 | (371,135) | 563/480000 | 0.1173% |
| 75 | 71 | (480,470) | 559/480000 | 0.1165% |
| 180 | 81 | (516,569) | 569/480000 | 0.1185% |
| 239 | 81 | (516,569) | 569/480000 | 0.1185% |

snapshot hash `26cca4e9`.

**HEAD (this branch, commit `8f111ea`), identical command, `--url
http://localhost:5199` (main's worktree server killed and replaced with
this checkout's own):**

| Frame | maxDelta | At | Mismatching | Share |
|---|---|---|---|---|
| 0 | 78 | (166,52) | 560/480000 | 0.1167% |
| 48 | 83 | (371,135) | 563/480000 | 0.1173% |
| 75 | 71 | (480,470) | 559/480000 | 0.1165% |
| 180 | 81 | (516,569) | 569/480000 | 0.1185% |
| 239 | 81 | (516,569) | 569/480000 | 0.1185% |

snapshot hash `26cca4e9`.

**Every row matches, byte for byte, including the snapshot hash. The A/B
gate passes.**

**5A's recorded table** (`eval/RESULTS-PHASE-5A.md`, Criterion 2), for
context, not as a target this gate is graded against:

| Frame | maxDelta | At | Mismatching | Share |
|---|---|---|---|---|
| 0 | 61 | (185,47) | 373/480000 | 0.0777% |
| 48 | 61 | (407,128) | 393/480000 | 0.0819% |
| 75 | 71 | (480,470) | 559/480000 | 0.1165% |
| 180 | 81 | (516,569) | 569/480000 | 0.1185% |
| 239 | 81 | (516,569) | 569/480000 | 0.1185% |

Frames 75/180/239 reproduce 5A exactly; frames 0/48 measured higher (78/83
vs 61/61) on BOTH main and HEAD identically. Since main and HEAD agree
exactly with each other, this is not a regression introduced by this
task's changes — the cause of the drift from 5A is not established, and is
recorded here as open, per this task's own instruction not to assert one.

### Real-click check ("Piece 3" evidence, Step 6)

Harness: `lottie-click-check.mjs` (new — no committed Phase 5B Task 6b
harness existed to reuse). Sets the editor's code via the `#code=`
share-link hash (`device-limit-check.mjs`'s method), clicks the real
**lottie** button (`[title="Export Lottie animation (JSON)"]`), and uses
`page.waitForEvent("download")`.

**Dev server** (`npx vite --port 5199 --strictPort`; scene
`eval/scenes-3b/compound-logo.marey`, text-free):
```
node tools/visual-check/lottie-click-check.mjs --scene eval/scenes-3b/compound-logo.marey --url http://localhost:5199 --out .visual-check/5c-t3/click-dev2
```
`filename=scene.json` (✓), `parseOk=true` (✓), 0 console/page errors.
Rendered the downloaded document in a real lottie-web player on the SAME
page (deliberately, since this script omits
`--disable-accelerated-2d-canvas` — see the harness's own header comment)
and compared frames 0 and 48 against `window.__mareyExportPng` of the same
source: frame 0 maxDelta 61, 373/480000 (0.0777%); frame 48 maxDelta 61,
393/480000 (0.0819%) — matching 5A's own recorded numbers for these two
frames exactly (this run does not force software 2D-canvas rendering, so
it lands on the GPU-accelerated-equivalent numbers, not
`lottie-check.mjs`'s forced-software ones). `lottiePipelineChunkRequested:
false` (expected on the dev server, which has no build-time chunk of that
name).

**Production build** (`npm run build`; `npx vite preview --port 4173
--strictPort`; boundary netstat on 4173 confirmed free before starting and
free again after `taskkill`):
```
node tools/visual-check/lottie-click-check.mjs --scene eval/scenes-3b/compound-logo.marey --url http://localhost:4173 --out .visual-check/5c-t3/click-prod
```
`filename=scene.json` (✓), `parseOk=true` (✓), 0 console/page errors.
`window.__mareyExportPng` does not exist (production strips every dev
seam, as designed) — the script detected this and recorded
`pngCompare.skipped` rather than crashing. **`lottiePipelineChunkRequested:
true`** — the real network response for
`dist/assets/lottiePipeline-*.js` was observed after the click, proving
the lazy chunk and the download both work in the actual built artifact.

**Refusal path, both servers** (default scene, which declares `text`):
toast text `[LOTTIE_UNSUPPORTED_TEXT] Object 'scene.wave.hello' is a text
node, which the Lottie exporter does not support. Remove it or replace it
with a supported shape (circle, rectangle, polygon, line or group) before
exporting.` — `startsWithCode: true` on both runs.

**A RED read along the way, worth recording.** The first version of
`extractDefaultCode()` (reads `src/store/defaultScene.ts`'s `DEFAULT_CODE`
template literal by slicing between the first and last backtick in the
file) failed scenario B outright: the toast read a `LEX` error on a stray
backtick, because the file's own JSDoc header comment contains several
markdown-style backtick pairs, so "first backtick in the file" was one of
those, not the template literal's real opening delimiter. Fixed by
anchoring on the literal text `"DEFAULT_CODE = \`"` instead of the file's
first backtick; reran → both scenarios green.

### Environment (Task 3)

Port 5199: confirmed free (`netstat -ano | grep -E
"[:.]5199[[:space:]].*LISTENING"` → no output) before the dev-server run
above, and again after `taskkill //PID <pid> //F` at the end of the task —
no second child PID appeared. Port 4173: confirmed free before `npx vite
preview --port 4173 --strictPort`, and free again after `taskkill`. Port
5199 was reused for main's temporary worktree server during the T3-R2 A/B
(killed and confirmed free between the main run and restarting this
checkout's own dev server). `git worktree list` after `git worktree remove
../marey-wt-main-t3`: only this checkout listed.

---

## Piece 4 (refactor): the shared raster-export prefix (Task 4)

**Copied from `task-4-report.md`** (added here in Task 9; see that
section's own "A note on this section's title" below for why Task 5 found
no such section when its dispatch said one already existed). Task 4
extracted `withRasterExport` into a new `src/compiler/export/rasterExport.ts`
as the **one** shared compile → plan → init → build → sample → (rasterize)
→ teardown prefix; `runVideoExport`, `runLottieExport` (controller ruling
T4-R1, beyond the brief's original two-caller scope) and
`devExportSeam.ts`'s `exportPng` (`scale: 1`) were all rewritten on top of
it. **No behaviour change**, proved by re-running the same three commands
before extraction (`0ae9d65`) and after (`8b9c5e5`) and diffing the
results.

### Before (`0ae9d65`) / after (`8b9c5e5`)

- **MP4** (`video-check.mjs --scene .../linear-motion.marey --container mp4`):
  hash `fa8e64c2`/`fa8e64c2`, identical before and after; decode gates all
  pass identically (90/90 frames, 1600x1200 coded = 2x scene, strict=90
  tie=0 mismatches=0). MP4 bytes are not byte-stable across runs even
  pre-Task-4 (5B); only the decode gates are the claim here.
- **WebM** (same scene, `--container webm`): raw bytes equal `true`,
  237614/237614 bytes both before and after, sha256
  `b7dd721f602e64878b2c4c59c1bb29198c5ea9a4df4b0f256c969c806ee63d0b` —
  **identical before/after.**
- **PNG** (`export-check.mjs --scene eval/scenes-3b/compound-logo.marey`):
  snapshot hash `26cca4e9` both before and after; `frame_0000.png` sha256
  `7f152edb112a123bc2d0863725004be9729e722452db043aa458517b686cc204` —
  **identical.**
- **Lottie compare** (`lottie-check.mjs --compare-png` on the same scene,
  frame 0): maxDelta 78 at (166,52), 560/480000 mismatching (0.1167%),
  both before and after; `doc.json` and `frame_0.png` sha256 **identical**
  before/after. (This is the pre-T3-R1-harness-fix number; see "Piece 3"
  above for the fixed harness's re-measurement.)
- **Suite/tsc:** before, 38 files / 957 tests, `npx tsc -b --noEmit` exit
  0; after, 38 files / **958** tests (the one new `exportBoundary.test.ts`
  row), `npx tsc -b --noEmit` exit 0.

### Mutation (Step 4)

Brief instruction: reverse `frames` inside `withRasterExport`;
`video-check.mjs` must exit 1 for WebM. **Measured false as written, and
reported loudly per the plan's own MEASURED/UNVERIFIED discipline:** exit
0, every gate passed including the nearest-neighbour check. Root cause,
confirmed by reading the source: `videoEncode.ts` assigns each sample's
timestamp by positional loop index, and `devVideoSeam.ts`'s harness
instrumentation originally captured its "reference" frames by
`sampled.indexOf(frame)` against the very same array the encode loop
walks — so a whole-array reversal of `frames` reverses what the observer
is told to expect **and** what actually gets encoded, in lockstep, and is
invisible to a check with no ground truth independent of that
self-report. **Not a Task 4 regression**: the pre-Task-4 `runVideoExport`
had the identical one-array structure, so the same mutation at the
equivalent pre-refactor line would produce the same exit 0. Filed at the
time as a gap in an *adjacent* behaviour (harness detection completeness,
not the behaviour Task 4 was asked to preserve) per the scope tie-break —
then fixed anyway once the task review raised it as an Important finding
(fix round 1, below).

A supplementary "drop frame 0" mutation on the same line **did** exit 1
(`decoded frame count 89 (planned 90, match: false)`), confirming the
extraction itself did not weaken observability in general — whole-array
reversal specifically was the blind spot.

### Fix round 1 (`411d598`, ruling T4-R2)

`src/lib/devVideoSeam.ts`'s `onFrame` observer now keys the
reference-frame slot by `frame.index` — `FrameSnapshot`'s own field,
frozen and written once by `sampleFrames` — instead of
`sampled.indexOf(frame)`, with the bounds check widened to an upper bound
too. Harness-only change; no product code touched. Re-run after the fix:
the reversal mutation now **exits 1** (nearest-reference ties reported
throughout the clip, e.g. "frame 23: nearest references tie between [21,
24]"); the unmutated control **exits 0** with the same hash/bytes as
every other unmutated run in this report; the drop-frame mutation still
**exits 1**, now caught earlier (a bounds-check throw) rather than by the
frame-count gate. `npx tsc -b --noEmit` exit 0; suite 38 files / 958 tests
(unchanged — `devVideoSeam.ts` has no dedicated test file; the mutation
re-runs above are this fix's actual verification).

### Files changed

`git diff --stat 0ae9d65..8b9c5e5` (extraction commit):
```
 src/compiler/export/exportApp.test.ts      |  11 +-
 src/compiler/export/exportBoundary.test.ts |  34 ++++-
 src/compiler/export/lottiePipeline.ts      | 142 +++++++------------
 src/compiler/export/rasterExport.ts        | 189 +++++++++++++++++++++++++
 src/compiler/export/videoPipeline.ts       | 218 +++++++++++++----------------
 src/lib/devExportSeam.ts                   | 119 ++++++----------
 6 files changed, 418 insertions(+), 295 deletions(-)
```
`git diff --stat 8b9c5e5..411d598` (fix round 1):
```
 src/lib/devVideoSeam.ts | 32 ++++++++++++++++++++++++++------
 1 file changed, 26 insertions(+), 6 deletions(-)
```

Commits: `8b9c5e5` (extraction), `411d598` (fix round 1, T4-R2). Full
detail — including the `devExportSeam.ts` re-prefixing fragility concern
and everything the task deliberately did not do — is in `task-4-report.md`.

---

## Piece 4: APNG (Task 5)

**A note on this section's title.** The Task 5 dispatch said "the existing
'Piece 4 (refactor)' section is Task 4's; keep both, and title yours so
they don't collide." Measured directly: no such section exists anywhere in
this file (`grep -n "Piece 4\|Task 4"` before this edit: no hits) — Task
4's evidence lives entirely in its own `task-4-report.md`, never merged
here. Flagging the discrepancy rather than silently working around it, per
this task's own instructions; it did not block anything, since there was
no real section to collide with. This section is titled to match the
SPEC's own numbering (design section 5's own heading is "Piece 4: APNG"),
which was never in conflict.

### Spec sources read for APNG

- Task brief: `.sdd/2026-09-24-phase-5c-lottie-video-quality/task-5-brief.md`.
- Global constraints: `.sdd/2026-09-24-phase-5c-lottie-video-quality/global-constraints.md`.
- Design spec §5 ("Piece 4: APNG") and §7 (boundaries table):
  `docs/specs/2026-09-24-marey-phase-5c-lottie-completion-and-video-quality-design.md`.
- The Mozilla APNG Specification, fetched directly
  (<https://wiki.mozilla.org/APNG_Specification>): confirmed `acTL` (8
  bytes: `num_frames` u32, `num_plays` u32), `fcTL` (26 bytes:
  `sequence_number` u32, `width`/`height` u32, `x_offset`/`y_offset` u32,
  `delay_num`/`delay_den` u16, `dispose_op`/`blend_op` u8 each), `fdAT`
  (`sequence_number` u32 + IDAT payload), and the sequence-number rule:
  `fcTL`/`fdAT` share one counter, starting at 0 at the first `fcTL`, "in
  order, with no gaps or duplicates."

### Step 1: measured Chromium PNG chunks (before writing the muxer)

Scratch probe (not committed): `.visual-check/probe-chunks.mjs`, run against
a warmed `npx vite --port 5199 --strictPort`.

```
=== plain <canvas> 800x600 opaque ===
chunk types: IHDR, IDAT, IDAT, IDAT, IDAT, IEND
IHDR: width=800 height=600 bitDepth=8 colourType=6 compression=0 filter=0 interlace=0

=== pixi extract.canvas frame 0 ===
chunk types: IHDR, IDAT, IDAT, IDAT, IDAT, IDAT, IEND
IHDR: width=800 height=600 bitDepth=8 colourType=6 compression=0 filter=0 interlace=0
```

**Finding: zero ancillary chunks in either case.** No `sRGB`, no `gAMA`, no
`pHYs` — just `IHDR`, one or more `IDAT`s, `IEND`. This is what pins
`apngEncode.test.ts`'s chunk-order test to `["IHDR", "acTL", "fcTL", "IDAT",
"fcTL", "fdAT", "fcTL", "fdAT", "IEND"]` with nothing between `IHDR` and
`acTL`, and what a dedicated test
("carries forward none of frame 0's chunks besides IHDR/IDAT, when there
are none to carry") pins per the brief's "if it emits none, pin that with a
test too."

### TDD RED/GREEN evidence

RED, `apngEncode.test.ts` created before `apngEncode.ts` existed:

```
FAIL  src/compiler/export/apngEncode.test.ts [ src/compiler/export/apngEncode.test.ts ]
Error: Cannot find module './apngEncode' imported from .../apngEncode.test.ts
```

GREEN after implementing `apngEncode.ts` (`npx vitest run
src/compiler/export/apngEncode.test.ts`): 12/12 passing (later 14/14 after
the two delete-and-run gap fixes below). Full suite after: `npx vitest run`
→ 39 files / 970 tests (38/958 baseline + 12 new); `npx tsc -b --noEmit` →
exit 0.

### Judgment-call flips (§2d), each applied/reverted in one command

| Flip | Test that went red | Reverted, `git diff --stat` after |
|---|---|---|
| `acTL.num_plays`: 0 → 1 | `declares the frame count and loops forever (num_plays 0)`: expected `[3, 0]`, got `[3, 1]` | empty |
| `fcTL.blend_op`: 0 → 1 (OVER) | `gives every frame a 1/fps delay, full size, dispose NONE, blend SOURCE`: expected `...0]`, got `...1]` | empty |
| `fcTL.delay_den`: `fps` → `fps + 1` | same test: expected `[1, 24, 0, 0]`, got `[1, 25, 0, 0]` | empty |

Commands: `sed -i 's/<original>/<mutated>/' src/compiler/export/apngEncode.ts
&& npx vitest run src/compiler/export/apngEncode.test.ts; git checkout --
src/compiler/export/apngEncode.ts && git diff --stat`, once per row.

### Delete-and-run: two real gaps found and closed (global constraint 11/12)

Both in `apngEncode.ts`'s "invariant throws" (spec §5.1). Both mutations
were applied with `sed`, run, confirmed red or green, then reverted with
`git checkout --`; `git diff --stat` was empty after every revert.

1. **The PNG-signature check** (`readPngChunks`'s `if (!isPng) throw ...`).
   Deleting it (forcing the guard to `if (false)`) left **12/12 tests
   green** — the only fixture exercising a bad signature
   (`new Uint8Array([1, 2, 3])`) is too short to produce any chunk either
   way, so the *separate* "no IHDR chunk found" fallback threw the
   identical message regardless of whether the signature check ran. Closed
   by adding a fixture with a corrupted first signature byte behind
   otherwise well-formed chunks (`refuses a frame whose signature is
   corrupted even though its chunks parse fine`); re-running the same
   deletion now fails that one test (`expected [Function] to throw an
   error` / `Received: undefined`).
2. **The `!ihdr0` fallback** (frame 0 has a valid signature but no `IHDR`
   chunk at all). Deleting it also left every test green, for the mirror
   reason: it was only ever reached by that same 3-byte fixture, which the
   signature check already intercepts first. Closed by adding a bare
   8-byte-signature-only fixture (`refuses a frame with a valid signature
   but no IHDR chunk`); re-running the deletion now fails with `Cannot read
   properties of undefined (reading 'data')`.

Zero-frames, the fps-range check, and the per-frame IHDR-mismatch check
were each individually deleted and re-run too; all three already had a
discriminating test and went red immediately (no gap).

**Filed, not fixed (adjacent, per the scope tie-break):** the ancillary-chunk
carry-forward loop (`for (const c of ancillary0) ...`) has no test that can
fail if deleted, since Step 1 measured zero ancillary chunks in both cases
tested — carrying a hypothetical non-empty set is speculative code the
brief does not ask for a test on when none were found.

### `apng-check.mjs` results

Two fixtures, each run twice (cold pages) plus an in-page `ImageDecoder`
decode-and-compare, via `node tools/visual-check/apng-check.mjs
--scene <path> --fps 30 --out <dir>`:

| Scene | Frames | Size (both runs) | sha256 (both runs) | fcTL problems | Differing bytes | Missing ref frames | Bad-duration frames |
|---|---|---|---|---|---|---|---|
| `scenes/linear-motion.marey` | 90 | 1,148,097 B | `a35194bb...` (equal) | 0/90 | **0** across 0 frames | 0 | 0 |
| default scene (`DEFAULT_CODE` saved to `.marey`) | 180 | 5,857,859 B | `dd444593...` (equal) | 0/180 | **0** across 0 frames | 0 | 0 |

**≥30s size** (spec §5.3): the full pixel-identity harness does not scale to
900 frames (see "One measured memory limit" in `SKILL.md`'s new section —
holding one raw RGBA capture per frame is >2GB at this length and destroys
the page: measured directly, `page.evaluate: Execution context was
destroyed, most likely because of a navigation`).

**Superseded by fix round 1** (below): this figure originally came from an
uncommitted scratch probe (`.visual-check/probe-apng-size.mjs`), which the
task review correctly flagged as not re-runnable from the repo. Re-measured
with the now-committed `apng-check.mjs --size-only` (`devApngSeam.ts`'s new
`withReferenceCapture: false`):
`node tools/visual-check/apng-check.mjs --scene
tools/visual-check/scenes/linear-motion.marey --fps 30 --duration
30 --size-only --out .visual-check/apng/linear-motion-30s` →
**11,504,757 bytes**, byte-identical (sha256) across two cold runs, `fcTL`
count 900, 0 problems, exit 0. (The scratch probe's own number,
11,492,040 bytes, differed by ~0.1%. The two numbers came from different
code paths — the scratch probe called `runApngExport` directly with no
seam, this script goes through `devApngSeam.ts` — and no same-code
two-process A/B was run to isolate the cause. So the gap is **unexplained,
non-gating; determinism is proven within one process only.** See fix
round 1 for the two-cold-run comparison that *is* same-code, same-process,
and is byte-identical.)

**ImageDecoder works in Playwright's Chromium** (scratch probe
`.visual-check/probe-imagedecoder.mjs`, built a 3-frame APNG with
`encodeApng` itself, fps 10): `frameCount: 3`, `firstFrameDims: {width: 16,
height: 16}`, `firstFrameDuration: 100000` (exactly `1e6/10`, no
quantization at this fps). The brief's Node-side `zlib`-inflate fallback is
**not implemented** — there was nothing to fall back from.

**Measured Chromium quirk:** `ImageDecoder`'s `VideoFrame.duration` for an
APNG frame is quantized to the nearest whole millisecond. At 30fps, every
one of the 90 `linear-motion.marey` frames reported `durationUs: 33000`
(ideal `33333.33`), uniformly — not per-frame jitter. `apng-check.mjs`
compares against the millisecond-rounded value, not the un-quantized ideal,
documented in both the script and `SKILL.md`.

**A CDP data-transfer crash, found and fixed while writing this script:**
passing `devApngSeam.ts`'s `referenceRgba` array (raw RGBA, ~2.56MB base64
per 800×600 frame) back INTO the page a second time, as a `page.evaluate`
argument for the decode step, killed the renderer even at 90 frames
(~230MB) the first time this script was run. Fixed by stashing the seam's
result on a page-side global (`window.__apngCheckLastResult`) and reading
it back in the same page realm, so that array never crosses the CDP
boundary a second time.

### Mutation table (§8, spec §5.3's "drop or swap")

Each applied to `src/compiler/export/apngPipeline.ts` with `sed`, run
against `scenes/linear-motion.marey`, then reverted with `git checkout --`;
`git diff --stat` was empty after every revert.

| Mutation | `apng-check.mjs` exit | What it reported |
|---|---|---|
| (a) Drop frame 5 (`if (frame.index === 5) continue;` in the mux loop) | **1** | `missingReferenceFrames`: runA=1, runB=1; decoded frame count 89 ≠ reference count 90; total differing bytes **760,194 across 83 frames** (every frame from 6 onward shifts one position in the file, cascading) |
| (b) Swap frames 5 and 6 (array-position swap before the loop) | **1** | decoded count still matches (90); total differing bytes **18,048 across exactly 2 frames** — frame 5 and frame 6 only, 9,024 bytes each, confirming `frame.index`-based reference slotting (T4-R2) stays correct while the file itself is wrong at exactly the swapped positions |
| (c) `encodeApng(pngs, { fps: plan.fps + 1 })` | **1** | pixel bytes still identical (0 differing); `fcTL problems`: 90/90 (`delay_den` is 31, not the requested 30); bad-duration frames: 90/90 |

**(d) A fourth, corroborating mutation, not required by the brief but
directly testing the T4-R2 ruling this task was told to carry over.**
Combined with (b) above: `devApngSeam.ts`'s `onFrame` changed from `const k
= frame.index;` to `const k = sampled.indexOf(frame);` (reverting the T4-R2
fix), WITH mutation (b)'s array-position swap still applied. Result: `apng-
check.mjs` exit **0** — `total differing bytes 0 across 0 frame(s)`, the
swap goes **completely undetected**. This is the exact blind spot
`devVideoSeam.ts`'s own docstring describes for `indexOf`: since the swap
permutes the SAME array both `onFrame`'s position-lookup and the mux loop
walk, `indexOf` agrees with wherever each frame actually landed, so a
whole-array reorder is invisible. Reverted (both files); `git diff --stat`
was empty after.

### Files changed (`git diff --stat 411d598..HEAD`)

```
 tools/visual-check/SKILL.md       | 111 ++++++
 tools/visual-check/apng-check.mjs | 595 +++++++++++++++++++++++++++++
 src/compiler/export/apngEncode.test.ts     | 207 ++++++++++
 src/compiler/export/apngEncode.ts          | 244 ++++++++++++
 src/compiler/export/apngPipeline.ts        | 118 ++++++
 src/compiler/export/exportBoundary.test.ts |  65 +++-
 src/compiler/export/pngSequence.ts         |  11 +-
 src/compiler/export/rasterExport.ts        |  37 ++
 src/compiler/export/videoPipeline.ts       |  31 +-
 src/components/TopBar/TopBar.tsx           |  23 ++
 src/hooks/useExport.ts                     |  53 +--
 src/lib/devApngSeam.ts                     | 150 ++++++++
 src/main.tsx                                |   6 +
 13 files changed, 1582 insertions(+), 69 deletions(-)
```

Final suite/typecheck/build (clean tree, all mutations reverted):
`npx vitest run` → **39 files / 974 tests** (970 after the muxer, +2 from
the delete-and-run gap-closing tests, +2 from the widened
`exportBoundary.test.ts`). `npx tsc -b --noEmit` → exit 0. `npm run build`
→ exit 0; `apngPipeline-*.js` gets its own lazy chunk; `grep -rl
"__mareyExportApng" dist/` → no hits (confirmed dropped from the production
build, same as every other dev seam).

### What was not done

- The brief's Node-side `zlib`-inflate fallback for `ImageDecoder` failing
  to decode APNG frames: not implemented, because the probe confirmed
  `ImageDecoder` decodes this muxer's own output correctly in Playwright's
  Chromium.
- A test for carrying a non-empty set of frame-0 ancillary chunks (e.g.
  `sRGB`): not written, because Step 1 measured zero ancillary chunks from
  either tested Chromium PNG encoder — the brief's own tie-break for this
  case ("if it emits none, pin that with a test too") was followed instead.
- A byte-for-byte comparison of the two cold runs' raw `referenceRgba`
  captures against each other in `apng-check.mjs`: not computed, because
  doing so would require holding both runs' ~170MB-per-run arrays in the
  same place at once — the exact transfer that crashed the page the one
  time this was tried. Spec §5.3 only asks that the two runs' MUXED APNGs
  be byte-identical, which the sha256 check proves.
- No `apng-click-check.mjs` (a real-button-click end-to-end check, the
  shape Task 3 built for Lottie): not in this task's Files list, and the
  brief's Step 6 only asks to "call the seam."
- No second-fps / non-30 fps run of `apng-check.mjs` against the default
  scene: `useExport.ts`'s `EXPORT_FPS` constant is 30 for every export kind,
  so 30 is the only fps a real click ever uses; `apngEncode.test.ts`
  exercises fps 24 and 10 directly.

### Concerns

- **Dispatch discrepancy:** the task dispatch stated an existing "Piece 4
  (refactor)" section in this file was Task 4's. No such section exists;
  Task 4's evidence lives only in its own `task-4-report.md`. Flagged above,
  did not block this task.
- **`devApngSeam.ts`'s reference-capture design has a real, measured memory
  ceiling** (roughly 200-400 frames at 800×600 before the page is at risk):
  it holds one raw RGBA buffer per sampled frame for the harness's
  byte-for-byte comparison, unlike the shipped pipeline itself, which only
  ever holds compressed PNG bytes. This is inherent to a *lossless*
  pixel-identity check, not a bug, but it means `apng-check.mjs` cannot be
  the tool for measuring a long export's file size — `SKILL.md` documents
  the split. A future task that needs to run this harness against a scene
  longer than a few hundred frames would need a streaming or chunked
  comparison design.
- Two mid-task stream interruptions occurred; the RED test commit
  (`01fb75d`) was momentarily uncommitted across one of them and is now
  committed per the coordinator's note.

---

## Piece 5 spike: `text` in Lottie (Task 6)

**Measurement only. No production code.** Answers spec §6's seven open
questions inside the real app, so the plan can re-derive T7/T8's details
from measured numbers rather than the design-time throwaway probes in
`.visual-check/probe5c/`. Full detail (every command, every number, every
contradiction) is in `task-6-report.md`; this section is the standing
evidence-file summary.

**Baseline.** HEAD `855e0c7`, from
`C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey`: `npx vitest run` → **40
files / 981 tests**; `npx tsc -b --noEmit` → exit 0. Unchanged after this
task (measurement only): re-ran both at the end, same numbers.

**Dependency.** `npm install harfbuzzjs@1.6.2 --save-exact` landed in
`dependencies` (`package.json`), next to `mediabunny`, matching 5B's M-4
precedent. `git diff --stat -- package.json package-lock.json` → `2 files
changed, 8 insertions(+)`. Nothing under `src/` imports it.

**Q1 (harfbuzzjs in Vite).** Loads and instantiates in both modes.
- Dev (`npx vite --port 5199 --strictPort`, dynamic `import()` of a probe
  module): wasm fetched from
  `http://localhost:5199/node_modules/harfbuzzjs/dist/harfbuzz.wasm`, status
  200; shaping a test string round-tripped correctly (`upem: 1000`,
  `glyphCount: 11`).
- Build (`npm run build` with a temporary `<script type="module">` tag in
  `index.html`, reverted immediately after — never committed): Rolldown (the
  bundler behind this Vite v8 beta) statically rewrote the Emscripten
  loader's `locateFile("harfbuzz.wasm")` call into
  `new URL("/assets/harfbuzz-9Zbs1aEM.wasm", ""+import.meta.url)` with **no
  `?url` wiring needed**. Emitted `dist/assets/harfbuzz-9Zbs1aEM.wasm`,
  **433,766 bytes**, byte-identical (`cmp`) to `node_modules/harfbuzzjs/dist/harfbuzz.wasm`.
  Loaded correctly under `npx vite preview --port 4173 --strictPort` too.

**Q2 (shaping parity in Chromium).** Ligature strings' ink bboxes agree with
`fillText`'s within ±1px per edge, exactly as spec §1 predicted: `->`
(63×36 vs 64×36), `!=` (exact), `==` (exact), `hello!` (exact), `a->b != c`
(each edge off by ≤1px). The tab case confirms the design's own claim
directionally: shaping the raw tab (harfbuzz maps U+0009 to glyph 0,
`.notdef`) differs from `fillText`'s rendering by 1043 px; replacing the tab
with U+0020 before shaping cuts that to 439 px. Neither hits 0 — some
residual vector-fill-vs-raster-AA diff is expected per spec §6.6 and is not
a defect.
**Corrected the design-time probe while measuring this:** harfbuzzjs 1.6.2's
`getGlyphPositions()` objects use **camelCase** (`xAdvance`, `yAdvance`,
`xOffset`, `yOffset`) — the HarfBuzz C API's snake_case
(`.visual-check/probe5c/hb.mjs`'s `pos[i].x_advance`) silently reads
`undefined` there; nobody noticed because template-string interpolation
prints "undefined" instead of throwing.

**Q3 (pixi's layout numbers).** `metrics.width` always wins over the
bounding-box width in `_measureText` for every JetBrains Mono string
measured (both font sizes). `__baseSize` equals `textObj.width/height`
exactly, by construction (`builder.ts:333` assigns it straight from the
`Text` object). `NEWLINE_MATCH_REGEX` is
`/(?:\r\n|\r|\n)/` (`textTokenization.mjs:41`). pixi passes `\t` through to
`fillText` unchanged — confirmed both by quoting the call site
(`CanvasTextGenerator.mjs:408`, `context.fillText(text, x, y);`, the
`letterSpacing === 0` branch, which is Marey's default) and by measuring
that `CanvasTextMetrics.measureText("a\tb", ...).width` equals the raw 2D
context's own `measureText("a\tb").width` exactly.

**Q4 (overlapping contours).** Checked 100 distinct glyphs (ASCII 32–126
plus the ligature-run glyphs Q2 exercises). **19 differ** between `nonzero`
and `evenodd` fill, including common lowercase letters (`a b d e g h m n p
q r`), several digits/symbols (`$ 5 8 @ B Q }`), and the `é` ligature-run
glyph. `eight` (digit `8`) has the largest difference, 28 px, and is the
recommended T8 fixture glyph.

**Q5 (font URL).** Built CSS: `url(/fonts/JetBrainsMono-Regular.ttf)`,
unchanged and unhashed (leading-slash public-dir reference, copied
verbatim). `import.meta.env.BASE_URL` is `"/"`, confirmed at runtime, not
just read from `vite.config.ts`. `textOutline.ts` must fetch the identical
literal `/fonts/JetBrainsMono-Regular.ttf`.
**Contradicts an implicit assumption, not the spec's text:** the fetch is
**not** a disk-cache hit after `@font-face` has already loaded the file.
`npx vite preview`'s static server sends `Cache-Control: no-cache` for
files under `public/`, so every request — the `@font-face` load, and a
follow-up `fetch()` of the same URL — revalidates over the network
(CDP `fromDiskCache: false` on all three requests observed). The server
does honor conditional GETs (a manual `If-None-Match` got a real 304), so
the cost is a cheap revalidation round trip, not a full re-download, but
`textOutline.ts` should not assume a free/no-network hit.

**Q6 (font readiness).** The race is real, and the app's own font-metrics
cache can hide it: with a **freshly loaded, single-purpose page**
(`q6-fresh.html` — navigating to the app's own `/` was rejected as a first
attempt, because mounting the whole editor/preview already resolves the
race before the check runs), `document.fonts.check(...)` is `false` before
`document.fonts.load(...)` and `true` after. A `pixi.Text` built before
loading measures the **fallback font's** width (`494.82px` for a 16-char
string); after loading, reusing the *same* `TextStyle` **instance** returns
the exact same stale `494.82px` — pixi's `CanvasTextMetrics` measurement
cache is keyed by `text-styleKey-wordWrap`, so remeasuring the identical
pair after the font loads does not self-correct. A brand-new `TextStyle`
with identical field values (or any text never measured before) correctly
returns JetBrains Mono's width (`540px`) after loading. This directly
supports the design's `ensureExportFonts`-before-building-the-tree
ordering (§6.1): remeasuring after the fact is not a reliable fallback.

**Q7 (missing glyph).** `日` and `🙂` both shape to glyph id `0`
(`.notdef`) in JetBrains Mono, confirmed by harfbuzz. The preview does
**not** draw tofu: Chromium's font-fallback machinery draws a correct CJK
glyph for `日` and a full-colour emoji for `🙂` (screenshots saved by the
probe, `.visual-check/text-spike/q7-{cjk,emoji}.png`, gitignored — visually
confirmed, not just ink-bbox-confirmed). Since HarfBuzz's glyph-outline
path cannot reproduce a system fallback font's colour emoji as a vector
Lottie shape, this is a real justification for the design's
`LOTTIE_TEXT_MISSING_GLYPH` refusal (§6.3): a silent skip would render
nothing where the preview shows real ink.

**Contradictions of spec §1/§6 found:** none in the design's own claims —
every §1 fact re-measured (or its equivalent) held. The one correction is
to the *design-time probe* (`hb.mjs`'s snake_case), not to the design
document's own numbers, which don't depend on it.

**What was not done:** no changes to `textOutline.ts`, `lottieGeometry.ts`
or any production module (out of scope — measurement only); no attempt to
resolve the `Cache-Control: no-cache` behavior on a real production static
host, only on `vite preview`'s dev-oriented default; Q4's 100-glyph sweep
does not cover glyphs unreachable from ASCII 32–126 or the six Q2 strings
(e.g. other GSUB-substituted forms), per the task's own scope.

Full report: `.sdd/2026-09-24-phase-5c-lottie-video-quality/task-6-report.md`.


---

## Piece 5: `text` in Lottie (Task 8)

Text exports as glyph outlines: one shape layer per text object, one closed
`sh` per HarfBuzz contour, one `fl` with `r: 1`. There is no text layer. BASE
`704220a`, HEAD `58cfb7a`. All numbers below come from
`C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey` with
`npx vite --port 5199 --strictPort`. Full detail, including every mutation, is
in `task-8-report.md`.

**Suite.** `npx vitest run`: **43 files / 1049 tests** (BASE 42 / 1027).
`npx tsc -b --noEmit`: exit 0. `npm run build`: exit 0.

### Where planning runs (ruling T8-R1)

`withRasterExport` gained `afterBuild(root, ir, plan)`, which runs after the
`buildNode` loop and before the physics world and `sampleFrames`.
`runLottieExport` plans there: first `collectTextLayouts`, then a single
`planLottie(ir, { layouts, runs })`. Refusals now arrive after GL init and the
build, but before sampling.

`lottiePipeline.afterBuild.test.ts` pins that `onSampled` never fires on a
refused scene. It runs the real pipeline in Node and stands in only the
`Application`, `measureText`, `document.fonts` and `fetch`. Mutations R1a–R1e
each turn it red:
- hook not called;
- hook before the build;
- maps not passed;
- collector not called;
- refusal after `onSampled`.

**Video, PNG and APNG are unchanged.** A/B on `lottie-text-ascii.marey`, with
HEAD's `rasterExport.ts` against BASE's swapped in:

| Output | Result |
|---|---|
| 30 PNG frames | byte-identical |
| APNG `scene.png` | byte-identical (sha256 `b7cc6c7a…`) |
| WebM `scene.webm` | byte-identical (sha256 `37b09def…`) |
| snapshot hash | `d9039c99` on both |

### Layout agreement (`text-check.mjs`, ruling T8-R2)

| Fixture | Line | pixi width | HB advance sum | HB ink width | Compared | Delta |
|---|---|---|---|---|---|---|
| ascii | `Marey 42` | 288 | 288 | 279 | advance | 0 |
| ligature | `a->b != c` | 324 | 324 | 315.18 | advance | 0 |
| multiline | `one` | 57.59999 | 57.6 | 52.16 | advance | 0.000009 |
| multiline | `two\tthree` | 172.79997 | 172.8 | 168.32 | advance | 0.000027 |
| mark | `é x́ B̥́` | 202 | 180 | 200.1 | max(adv, ink) | **1.9** |
| scaled | `hello!` | 216 | 216 | 196.98 | advance | 0 |

The advance rows hold within 0.01 px. On the mark row, the canvas's own
`actualBoundingBoxLeft + Right` is 202.0: pixi's width is Chromium's
whole-pixel ink box, and HarfBuzz's glyph-extent ink width is 200.1. The mark
tolerance is therefore the measured **1.9 px**.

### Ink-bbox position check and Criterion 2 (lottie-web against Marey's PNG)

"Ink" means pixels not exactly equal to the opaque scene background, in both
images; Marey's PNG export has no transparent mode. Each cell reads:
maxDelta / mismatching share / worst ink-box edge delta in px.

| Fixture | f0 | f¼ | f½ | last |
|---|---|---|---|---|
| ascii (0,7,15,29) | 93 / 1.93% / 1 | 93 / 2.60% / 1 | 93 / 1.93% / 1 | 106 / 2.57% / 1 |
| ligature | 101 / 1.69% / 1 | 108 / 2.05% / 1 | 101 / 1.69% / 1 | 103 / 1.97% / **2** |
| multiline | 74 / 1.68% / 0 | 99 / 2.87% / 1 | 74 / 1.68% / 0 | 81 / 2.84% / 1 |
| mark | 148 / 1.33% / 1 | 147 / 1.69% / 1 | 148 / 1.33% / 1 | 154 / 1.63% / 1 |
| scaled (0,15,30,59) | 0 / 0% / 0 (scale 0) | 125 / 1.68% / 1 | 116 / 1.68% / 1 | 125 / 1.68% / 1 |

**One cell fails the 1 px bound: ligature, frame 29, 2 px.** It is filtering
spread, not a shift:
- Marey's box `(121,70)-(438,115)` contains the player's `(122,70)-(436,114)`
  on both sides, and the centres agree to 0.5 px.
- At half coverage (a diagnostic box, pixels differing by more than 127), the
  edge delta is **0**.
- The text sits at x = 280.667 at that frame. pixi draws its canvas-rendered
  text texture there with bilinear sampling, so faint ink spills a second
  column (zoomed crop checked by eye).

The table above is the brief's original any-ink rule (alpha > 0). **It is
superseded: controller ruling T8-R3 made half coverage the binding
definition, and under it this cell is 0 px and `text-check.mjs` exits 0.**
See "Fix round 1" at the end of this section.

**The mark fixture needed a clip.** pixi draws a `Text` into a texture the
size of its measured box, and ink outside that box is cut off in the preview
and in every raster export. For `B` + U+0325 + U+0301, Marey's PNG stops
exactly at the box's last row and column. Unclipped outlines drew 4 px further
right and further down: edge delta 4, maxDelta 255.

The encoder now masks a text layer to `(0,0)-(w,h)` only when a contour's
vertices or control points leave the box. With the mask, the edge delta is 1
at every frame. Of the six exported documents, only the mark fixture's
carries a mask.

### Default scene (`src/store/defaultScene.ts`)

Criterion 2, lottie-web against Marey's PNG, on the whole 800×600 frame:

| Frame | 0 | 75 | 90 | 120 | 150 | 179 |
|---|---|---|---|---|---|---|
| maxDelta | 9 | 125 | 116 | 125 | 116 | 132 |
| share | 0.33% | 1.48% | 1.64% | 1.58% | 1.59% | 1.55% |

**Position check.** It runs inside the ink region `150,0,650,118`, the band
of `hello!`. It is judged at frames 150 and 179, after the confetti lands;
both measure 1 px. The earlier frames also measure 0–1 px, but are only
recorded.

**The button exports the default scene.** `lottie-click-check.mjs`
scenario B downloads `scene.json` in both dev and production (`vite preview`
on 4173). Its `hello` layer is 9 closed contours plus `fl` `r: 1`, anchor
[108, 35.5]. The dev and production documents are byte-identical: 1,220,298 B,
sha256 `2d73d12c…`.

Scenario C clicks on a scene containing `a日b` and toasts
`[LOTTIE_TEXT_MISSING_GLYPH] Text 'scene.t' uses a character the export font
'JetBrains Mono' has no glyph for: '日' (U+65E5). …`. Scenario A (compound-logo)
measures 61 / 0.0777% and 61 / 0.0819% at frames 0 and 48.

### dotlottie-web

Every fixture and the default scene render in dotlottie-web (exit 0). Its
diff against lottie-web's frames, measured on the canvas screenshots:
- ascii: maxDelta 64–74, share 1.00–1.12%;
- ligature: 57–75, 0.87–0.92%;
- multiline: 57–69, 1.17–1.27%;
- mark: 56–72, 0.70–0.81%;
- scaled: 0–76, 0–0.76%;
- default scene: 5–154, 0.32–1.48%.

### Fill rule (spec §6.4)

The fixture is `8` at 150 px, T6 Q4's glyph:

| Fill | maxDelta against Marey's PNG | share |
|---|---|---|
| `r: 1` | 73 | 1.34% |
| `r: 2`, mutated in the product | **255**, at (147,100), the waist | 1.59% |

Under even-odd, the waist of the `8` renders as a hole (checked by eye). The
ink box cannot see this, because only the interior changes. The unit test goes
red (`expected 2 to be 1`).

### Product mutations (spec §8; each applied, run and reverted, `git diff --stat` empty after)

| Mutation | Caught by |
|---|---|
| (a) baseline `+ descent` | ink bbox: ascii 12 px, multiline 6–7 px, every frame. Only the top edge moves, because the clip mask cuts the shifted glyphs at the box bottom |
| (b) per-character outlining | Criterion 2 on the ligature fixture only (maxDelta 101 → 255, share 1.69% → 2.43%). Layout agreement and ink bbox are both blind to it: monospace advances are identical and the ink box does not move. Closed with a Node test (`outlines a ligature from the shaped glyphs`), red under (b); the GPOS mark test was already red under (b) |
| (c) missing-glyph check dropped (planner) | 6 Node tests red. In the outliner: 4 red |
| (d) no whitespace replacement | the multiline export refuses `[LOTTIE_TEXT_MISSING_GLYPH] … '\t' (U+0009)`; `text-check.mjs` fails |

### Licences (spec §6.5)

`harfbuzzjs`'s own LICENSE is the wrapper's MIT and does not reproduce
HarfBuzz's licence. `vite-plugins/licenses/harfbuzzjs.embedded.txt` carries
HarfBuzz's COPYING at tag 14.5.0 (the version string inside the wasm).

The fonts section now carries the full OFL 1.1 text, for JetBrains Mono and
for Syne. Two sources were fetched, and they are identical from the licence
header down.

Both texts are WebFetch transcriptions; the caveat is recorded in each file.
`dist/third-party-licenses.txt` contains `harfbuzzjs 1.6.2`, "Old MIT",
`SIL OPEN FONT LICENSE Version 1.1` and `PERMISSION & CONDITIONS`.

### Build (spec §9.7)

| | Result |
|---|---|
| entry chunk `index-*.js`, aad331d (built in a temporary worktree) | **1,398,885 B** |
| entry chunk, HEAD | **1,166,688 B** (−232,197 B) |
| `grep -c harfbuzz dist/assets/index-*.js` | 0 |
| chunks mentioning harfbuzz | only `lottiePipeline-*.js`, 41,864 B |
| `harfbuzz-9Zbs1aEM.wasm` | 433,766 B |
| mediabunny | only in `videoPipeline-*.js` |
| files in `dist/` containing `__mareyExport` | 0 |

Commands: `node tools/visual-check/text-check.mjs --out .visual-check/t8/full2`;
`node tools/visual-check/lottie-click-check.mjs --scene eval/scenes-3b/compound-logo.marey [--url http://localhost:4173]`.

### Fix round 1 (2026-09-26): half coverage is the binding position check (ruling T8-R3)

**What changed, and why.** The brief defined the position check on the
any-ink box, "alpha > 0", which on an opaque background means any pixel that
differs from the background at all. Controller ruling T8-R3, refined by the
task review, replaced that with a half-coverage box. The reason is ligature
frame 29, which was the only failing cell:
- pixi rasterises text into a canvas texture and draws it with bilinear
  sampling;
- at a fractional x (280.667 on that frame), the faintest ink spreads one
  column further out than vector outlines put any ink;
- the any-ink rule cannot tell that spread from a placement error, but
  half-coverage edges follow a shift almost 1:1.

The new definition:
- **Ink**: a pixel whose largest channel difference `d` from the opaque
  background is at least half of the text's own contrast with it in that
  frame. The contrast is measured as the largest `d` in either image, within
  the ink region, so both renders share one threshold. The threshold is
  relative, not an absolute `d > 127`, so low-contrast text still has ink.
- **Bound**: 1 px on every edge, as spec §6.6 says.
- **Empty boxes**: empty in both renders is a **failure**, not 0 px. The
  exception is a frame the fixture declares blank (`blankFrames`: the scaled
  fixture's frame 0, at scale 0); there both boxes must be empty.
  Undeclaring that frame makes the run fail with "no ink in either render,
  and the frame is not declared blank".
- **Any-ink box**: still computed and recorded next to the half-coverage box
  (`summary.json` `anyInk`), but not judged.

**Named exception, any-ink only: ligature frame 29, 2 px.**
- Marey's any-ink box `(121,70)-(438,115)` contains lottie-web's
  `(122,70)-(436,114)` on both sides.
- The half-coverage boxes are identical, `(122,71)-(436,114)`, edge delta 0.
- The cause is the bilinear-sampled text texture at a fractional x (above),
  a property of how the preview draws text, not of the exported outlines.

**Full re-run** (`node tools/visual-check/text-check.mjs --out .visual-check/t8/fr1-full`,
**exit 0**). Cells are half-coverage edge delta / any-ink edge delta, px,
lottie-web against Marey's PNG. The threshold was 127.5 for the black-on-white
fixtures and 122.5 for the white-on-#0a0e1a ones:

| Fixture | f0 | f¼ | f½ | last |
|---|---|---|---|---|
| ascii (0,7,15,29) | 1 / 1 | 1 / 1 | 1 / 1 | 0 / 1 |
| ligature | 0 / 1 | 1 / 1 | 0 / 1 | **0 / 2** |
| multiline | 0 / 0 | 1 / 1 | 0 / 0 | 0 / 1 |
| mark | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 |
| scaled (0,15,30,59) | blank, both empty (declared) | 1 / 1 | 0 / 1 | 1 / 1 |

Default scene, inside the ink region `150,0,650,118`: judged at frame 150
(0 / 1) and frame 179 (1 / 1). The unjudged frames 75, 90 and 120 measured
0, 1 and 1 at half coverage. Criterion 2, layout agreement and dotlottie-web
numbers are unchanged from the tables above: same product, same run
configuration.

**Product mutations re-run under the new definition** (each applied, run
and reverted in one command, `git diff --stat` empty after):

| Mutation | Caught by, now |
|---|---|
| (a) baseline `+ descent` | half-coverage ink bbox: **11 px** at every ascii frame, **6 px** at every multiline frame. Any-ink: 12 and 6–7 |
| (b) per-character outlining | still invisible to every binding browser check (`text-check.mjs` exits 0; half coverage 0–1 px; Criterion 2 maxDelta 101 → 255). Caught in Node: `outlines a ligature from the shaped glyphs` and the GPOS mark test, 2 red |
| (c) missing-glyph check dropped | Node: 6 red (planner); 4 red (outliner half) |
| (d) no whitespace replacement | the multiline export refuses `[LOTTIE_TEXT_MISSING_GLYPH] … (U+0009)`; `text-check.mjs` fails |

### 2026-09-26: Criterion 2 is a gate in `text-check.mjs` (final review I-5, ruling F-R5)

Spec §6.6 gives each text fixture "its own measured tolerance". Until now
`text-check.mjs` recorded Criterion 2 and never judged it. It now gates
every checked frame of each fixture against that fixture's row in
`CRITERION2_GATES`. The comparison is lottie-web against Marey's own PNG,
and the gates are:

- **ascii:** 117 / 2.86 %
- **ligature:** 119 / 2.26 %
- **multiline:** 109 / 3.16 %
- **mark:** 170 / 1.87 %
- **scaled:** 138 / 1.86 %
- **default scene:** 146 / 1.81 %

**How the gates were measured.** There were two clean runs at `a5a8ff9`,
with the full default invocation (all fixtures, the default scene and
dotlottie-web). The commands differ only in the `--out` directory:
```
node tools/visual-check/text-check.mjs --out .visual-check/text-final-clean1
node tools/visual-check/text-check.mjs --out .visual-check/text-final-clean2
```
Both exited 0, and every per-frame maxDelta and share was identical
between them. Each gate is the larger per-fixture maximum over the two runs
× 1.1, rounded up. maxDelta rounds to a whole level. Share rounds to 0.01
percentage points.

| Fixture (frames) | Run 1 max maxDelta / share | Run 2 | Gate (+10 %, rounded up) |
|---|---|---|---|
| ascii (0,7,15,29) | 106 / 2.5983 % | 106 / 2.5983 % | 117 / 2.86 % |
| ligature (0,7,15,29) | 108 / 2.0458 % | 108 / 2.0458 % | 119 / 2.26 % |
| multiline (0,7,15,29) | 99 / 2.8700 % | 99 / 2.8700 % | 109 / 3.16 % |
| mark (0,7,15,29) | 154 / 1.6930 % | 154 / 1.6930 % | 170 / 1.87 % |
| scaled (0,15,30,59) | 125 / 1.6828 % | 125 / 1.6828 % | 138 / 1.86 % |
| default scene (0,75,90,120,150,179) | 132 / 1.6402 % | 132 / 1.6402 % | 146 / 1.81 % |

**The clean run with the gates in place.** Command:
`node tools/visual-check/text-check.mjs --out .visual-check/text-final-gated`.
Result: exit 0, "all binding checks passed".

**Mutation (b), per-character outlining.**
- The mutation: `textOutline.ts`'s `const glyphs = shapeLine(line);`
  becomes `Array.from(line).flatMap(shapeLine)`.
- Run: applied, the full harness run
  (`--out .visual-check/text-final-mutb`), then reverted, all in one
  command. `git diff --stat -- src/compiler/export/textOutline.ts` was
  empty afterwards.
- Result: **exit 1, 12 failures.**
  - Ligature: all four frames fail Criterion 2 (maxDelta 255, share
    2.43–2.71 % against 119 / 2.26 %). Nothing else fails for ligature.
  - Mark: all four frames fail Criterion 2 (255 against 170). They also
    fail the half-coverage ink bbox (edge delta 10 against 1).

**Which check is doing the work.** To find out, the pre-gate harness was
run under the same mutation. That is `a5a8ff9`'s `text-check.mjs`, copied
temporarily beside the current one and deleted afterwards. Command:
`--only ligature,mark --skip-dotlottie`.
- Result: **exit 1**, with the 4 mark ink-bbox failures only.
- The ligature fixture passed everything: half coverage 0–1 px, and
  maxDelta 255 recorded but not judged.
- So on the ligature fixture, the one spec §8 names for this breakage, the
  new gate is the only browser check that catches it.

**A discrepancy with the Task 8 record.** The earlier table says
`text-check.mjs` still exits 0 under (b). At `a5a8ff9` that is not true:
the mark fixture's ink box moves 10 px under (b). This probably happens
because shaping each character alone loses the GPOS mark attachment. The
earlier run's exact invocation is not recorded here, so the difference is
recorded rather than explained.
