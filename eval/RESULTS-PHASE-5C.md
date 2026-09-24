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

### 2026-09-25 fix round 1: reproducing findings §1.2's probe on today's tree (T1-R1)

Raw numbers, recorded before interpretation, per ruling T1-R1. The
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

This reproduces findings §1.2's 2x table almost exactly (avc-sw-8M: 42.03 dB
here vs 42.03 dB in findings; 66 specks/frame here vs ~65 in findings;
vp9-8M: 42.17 dB / 61.5 specks/frame, identical to findings). **Outcome A**:
the raw probe gives ≈42 dB on today's tree and today's default scene. The
shipped path (`quality-check.mjs` via `runVideoExport`/mediabunny, same
scene, same nominal encoder settings) measured 41.45/41.55 dB and
~620 specks/frame in the same session (recorded above). So the shipped path
is measurably losing quality relative to the raw-WebCodecs path at nominally
identical settings, and that is a defect, not a re-based criterion. Diagnosis
follows below.

**Concern, not fixed (filed for the controller).** PSNR is close (mp4: 42.03
vs 41.45, Δ0.58 dB; webm: 42.17 vs 41.55, Δ0.62 dB) but just outside the
spec's ±0.5 dB band, and the measured specks-per-frame is roughly 10x
findings' number, despite bitrate matching within ~2%. Three hypotheses were
tested and ruled out rather than assumed:

1. **Not the Text-resolution fix (this task's own Step 6 change).** Re-ran
   `quality-check.mjs` on the same scene with the export `Application`'s
   `resolution` mutated back to `1` (command:
   `sed -i '164s/resolution: video.plan.scale,/resolution: 1,/' src/compiler/export/videoPipeline.ts`,
   then the same `quality-check.mjs` invocation, then reverted). Result:
   mp4 4,330 kbit/s / 41.46 dB / 624.8 specks-per-frame; webm 5,840 kbit/s /
   41.56 dB / 619.1 specks-per-frame — statistically identical to the
   scale-2 numbers above. The Text-resolution change is not the cause.
2. **Not frame misalignment.** `video-check.mjs` on the same scene (mp4 and
   webm, see table above) reports 180/180 STRICT nearest-neighbour matches
   with `argmin === k` for every frame, so decoded frame *k* is not being
   scored against the wrong reference.
3. **Not visually obvious.** `decoded_0090.png`/`reference_0090.png` from
   the mp4 run (`.visual-check/video/default-mp4-2x/`) were read side by
   side and are visually indistinguishable at this resolution.

The one variable not ruled out: **findings §1.2's numbers were measured by
`docs/research/2026-09-24-export-quality-probes/matrix.ts`/`matrix-run.mjs`,
which call raw `VideoEncoder`/`VideoDecoder` directly and never import
`videoEncode.ts`** — i.e. they bypass mediabunny entirely, even for the rows
labelled "(shipped)" (that label describes the encoder *config*, not the
code path that produced the number). This task's `quality-check.mjs` is the
first time these numbers have been measured through the actual shipped
`runVideoExport` → `encodeVideo` → mediabunny path. A quality gap between
mediabunny's own encoding and raw WebCodecs at nominally the same
`VideoEncoderConfig` would explain a stable PSNR (mediabunny's `videoEncode.ts`
is not touched by this task and is otherwise wired correctly — see
`videoEncode.test.ts`, unaffected by this task other than the codec-string
literal noted in the Task 1 commit) plus a jump in speck count concentrated
at edges. Diagnosing *why* mediabunny would encode measurably more specks at
a similar bitrate is outside this task's scope (`videoEncode.ts` is Phase
5B's module, unmodified here); filed rather than fixed, per the dispatch's
tie-break rule for gaps in adjacent, not required, behaviour.

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
| (c), continued | Same deletion | New browser check `.visual-check/probe5c/device-limit-check.mjs` (Playwright, `page.addInitScript` patches `WebGL2RenderingContext.prototype.getParameter` to return `100` for `MAX_TEXTURE_SIZE`/`MAX_RENDERBUFFER_SIZE` only, then calls `window.__mareyExportVideo` on the default (800x600) scene) | Before mutation: throws `[VIDEO_EXCEEDS_DEVICE_LIMITS] ... this device can render at most 100x100 pixels`, exit 0 (check passes). After deleting the throw: `{"threw": false}`, exit 1 (check correctly goes red). | Yes, confirmed empty diff |

**Step 9(c) resolution: Option B was taken** — a browser check with a
forced tiny limit was added (`device-limit-check.mjs`, not committed;
throwaway, `.visual-check/` is gitignored, same convention as the other
Phase 5C probes) rather than leaving the pipeline's one-line integration
of `deviceLimitDiagnostic` covered only by the pure-function unit test.
It is not part of the committed harness (no real device has a limit this
small, so it is not a standing regression check the way `video-check.mjs`
is); it exists to answer this task's own delete-and-run question and is
recorded here rather than left as an unverified claim.

### Environment

`npx vite --port 5199 --strictPort` for every browser check above. Boundary
netstat before starting: `netstat -ano | grep -E "[:.]5199[[:space:]].*LISTENING"` →
no output (port free). Killed and re-checked after all browser work for this
task finished — see the task report for the exact before/after pair.
