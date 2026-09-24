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

**Conclusion.** There is no mediabunny quality defect and no shipped-path
regression. The ~0.6 dB / ~10x-specks gap is caused entirely by
`--disable-accelerated-2d-canvas`: present in `quality-check.mjs` (matching
this project's established convention for `video-check.mjs`/`lottie-check.mjs`,
adopted specifically because *omitting* it makes measurements
non-deterministic — the flag's own documented purpose), absent from the
committed findings-probe scripts that produced findings §1.2's numbers. The
gap is codec-independent (affects H.264 and VP9 identically), consistent
with a source/decode-side rasterization difference rather than an
encoder-specific one — as the ruling anticipated. Mechanistically: the flag
controls whether Chromium's 2D canvas operations (`drawImage`/
`getImageData`, used both when `matrix.ts`'s `lossless()` builds its
reference frames and when any script decodes/re-encodes through a canvas)
run on the GPU or in forced software, and the two paths do not produce
byte-identical pixels.

**This is Outcome B, with a mechanism rather than a guess: the raw probe
does NOT reproduce ≈42 dB under the flag this project's own harnesses require
for deterministic measurement; it reproduces ≈41.5 dB, matching the shipped
path exactly.** Findings §1.2's original number was measured without that
flag — under a configuration `video-check.mjs`'s own header comment already
documents as unreliable for exactly this kind of pixel comparison. The
criterion is re-based below; see the dated amendment in the spec.

Every throwaway script above lives under `.visual-check/probe5c/`
(gitignored) and is not committed — they answer this task's own question and
are recorded here rather than left as unverified claims.

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
