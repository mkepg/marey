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

### Text sharpness (spec §2.2)

Fixture: `.visual-check/probe5c/text-stem.marey` (400x200 scene, single
`text` node, `content: "H"`, `fontSize: 60`, white on black — an isolated
vertical stem to measure without other shapes in the way). Measurement
script: `.visual-check/probe5c/edge-band.mjs <png>` — scans every row of the
image, finds every maximal run of pixels whose luminance sits strictly
between 10% and 90% of that row's max (the antialiased transition zone
around an edge), and reports the median/mean band width across the whole
image (not one hand-picked row, so the number is not an artefact of which
row happens to cross a serif or the crossbar).

| Condition | Command | Median band width | Mean |
|---|---|---|---|
| Native 2x (current code) | `node tools/visual-check/video-check.mjs --scene .visual-check/probe5c/text-stem.marey --container mp4 --fps 30 --frames 0 --out .visual-check/video/text-stem-2x` then `node .visual-check/probe5c/edge-band.mjs .visual-check/video/text-stem-2x/reference_0000.png` | **2 px** | 1.69 px |
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
| miter | maxDelta 255, 4323/150000 (2.8820%) | maxDelta 80, 671/150000 (0.4473%) |
| scale | maxDelta 255, 94/66000 (0.1424%) | maxDelta 1, 136/66000 (0.2061%) |
| caps | maxDelta 255, 808/89600 (0.9018%) | maxDelta 0, 0/89600 (0.0000%) |

The "official" numbers for miter and caps are stated for the record because
the brief instructs running `lottie-check.mjs --compare-png` and reporting
what it says — but the "clean" numbers are the ones that actually answer
design §3.4's question, per the artifact finding above.

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
