# Phase 5B evidence — the three exit criteria

**Updated by the fix wave (2026-09-24, after the independent whole-branch
review; `.sdd/2026-09-18-phase-5b-video/whole-branch-review.md`,
rulings R43–R51 in `progress.md`).** The wave changed things this document
measures, so every section below says which numbers were taken **before** the
wave (Task 6, `92cc9bc`) and which **after** it (on the fix-wave commits
`c7c491c`..`f27522c`). The changes that matter here:

- **The harness now measures the shipped orchestration** (R45). `video-check.mjs`
  still calls the dev-only `window.__mareyExportVideo`, but that seam now calls
  `runVideoExport` (`videoPipeline.ts`), the function the export button calls,
  instead of carrying its own copy. See the next section.
- **Every WebM changed by one byte** (R43). The VP9 codec string was pinned to
  `vp09.00.10.08` (level 1.0), and every WebM this phase produced declared level
  1.0 in its `CodecPrivate` for 800×600 content, 13× level 1's maximum picture
  size (measured on all 12 WebMs then on disk). The string is now chosen per plan:
  800×600 at 30 fps is `vp09.00.31.08`, so the level byte in `CodecPrivate`
  changed from `0x0a` to `0x1f` and nothing else about the file's length.
  Pre-wave WebM byte counts below are marked as such; the post-wave re-runs are
  listed beside them.
- **MP4's codec level is chosen per plan too** (R43), from ITU-T H.264 Table A-1.
  800×600 at 30 fps still selects `avc1.42001f`, so every pre-wave MP4 number was
  measured with the string the post-wave code selects for that plan.
- **Criterion 3's primary fixture is now `linear-motion.marey`**, and the harness
  fails a tie that excludes the frame itself (R46). MP4 container bytes are
  reported and no longer gate the exit code (R47).

**Original date:** 2026-09-24, Phase 5B Task 6. Branch `phase-5b-video`, BASE/HEAD
`92cc9bc`. Every Task 6 command below was run against that exact tree — see
`docs/engineering-lessons.md` §1 ("the report is a claim; the diff is
the evidence") and roadmap-and-process.md's evidence discipline. Numbers
that also appear in `task-3-report.md` were re-derived independently here,
not copied forward; where this run's numbers differ from that task's, both
are stated and the difference is treated as a finding, not smoothed over.

Design's three exit criteria (`docs/specs/2026-09-18-marey-phase-5b-video-design.md`),
verbatim:

1. A scene exports to WebM and MP4 at the requested frame rate and duration.
2. Repeated exports of the same scene are byte-identical, **or the reason
   they cannot be is documented at the encoder boundary**.
3. No frame is dropped or duplicated relative to the sampler's output.

**A ruling this document follows rather than the brief's literal text
(R32, `.sdd/2026-09-18-phase-5b-video/progress.md`).** The
task-6 brief's Step 2 instructs masking spec §7.2's "six byte ranges" in the
MP4 output and showing the unmasked diff contains only those ranges. Task 3
measured this false: two cold runs of the same scene produce MP4 files that
differ in *length*, and the six masked fields leave the overwhelming
majority of the divergence — inside `mdat`, the compressed bitstream itself
— untouched. This document instead follows the spec's own two branches for
criterion 2: WebM satisfies the first branch (byte-identical, measured
below); MP4 satisfies the second (not byte-identical, reason documented at
the encoder boundary). Per the coordinator's hard limit on this document,
the MP4 section below says the divergence is on the encoder side (an
identical-input/different-output measurement supports exactly that) and
stops there — it does not claim to have identified which Chromium
component, codec setting, or layer of the stack causes it, because that was
not measured.

**Fixture choice (R20, superseded for criterion 3 by R46).** Since the fix
wave, criterion 3's primary fixture is
`tools/visual-check/scenes/linear-motion.marey`: two objects at
constant velocity from frame 0, on screen throughout. The paragraph below is
Task 6's reasoning, kept as the record; its claim that `freeze-midair` can
tell a missing frame from a still one turned out **false for its first three
frames** (see criterion 3).

Task 6: criterion 3 used
`tools/visual-check/scenes/freeze-midair.marey`, not
`eval/scenes-3b/compound-logo.marey`. `compound-logo.marey`'s own comment
(line 31, quoted in the criterion 3 section below) records that its mark
comes to rest at 5.5s of an 8s clip, so the last 2.5s are settled,
near-identical frames — on a scene with identical consecutive frames, a
dropped-frame check cannot distinguish a missing frame from a still one.
`freeze-midair.marey` is a single box in continuous free-fall for its whole
exported window and never settles within it, so it is used as the primary
fixture for criterion 3. `compound-logo.marey` is used for criterion 1 (a
second, larger-scale container/fps/duration check) and criterion 2 (a
second, independent byte-identity measurement for WebM), and is reported as
a secondary observation for criterion 3 with the settling behaviour named
rather than hidden.

Dev server for every command below: `npx vite --port 5199 --strictPort`,
left running for the harness sections, killed after (see "Environment" at
the bottom). Port checked free before starting, boundary-matched:
`netstat -ano | grep "LISTENING" | grep -E ":5199[^0-9]"` returned no match.

Harness: `tools/visual-check/video-check.mjs`. Its own header
comment (read in full before use) documents the decode-in-page design, the
nearest-neighbour tie caveat, and exactly what gates its exit code.

Baseline reconfirmed on this tree before any harness run: `npx vitest run`
→ **33 files / 862 tests**, exit 0. `npx tsc -b --noEmit` → exit 0. This
task makes no source changes (evidence document only), so the baseline is
reconfirmed again at the end unchanged. (After the fix wave: 34 files / 910
tests; see "Environment".)

---

## Which code path was actually measured, and which one a user's click takes

**Since the fix wave (R45), the harness measures the shipped orchestration.**
A click on `TopBar.tsx`'s MP4/WebM buttons calls `useExportVideo.ts`'s hook,
which dynamically `import()`s `src/compiler/export/videoPipeline.ts` and calls
`runVideoExport`. `video-check.mjs` calls `window.__mareyExportVideo`, and that
dev seam (`src/lib/devVideoSeam.ts`) now calls **the same `runVideoExport`**,
passing an observer. It no longer contains an orchestration of its own.

**What is shared now:** everything from compile to encoded bytes. Compile,
`planExport`, `planVideo` (including the per-plan codec string), the encoder
probe that runs before the scene is built, `app.init`, building the tree,
`sampleFrames`, the lazy rasterize-and-encode loop, and `encodeVideo` are one
copy of code, executed by both callers.

**What the observer adds, only on the harness path:** `onSampled` hands the
seam the sampler's output (for `hashFrames`); `onFrame` hands it each canvas
immediately before the encoder consumes it (for the lossless reference PNGs);
`onEncoderConfig` records mediabunny's resolved encoder config. The seam files
each reference PNG under the index of its snapshot in the sampler's own
array, not under the order the pipeline delivered it, so a pipeline that
reorders or drops frames produces a file that stops matching its references.
The button passes no observer: no reference images, no hash, and each canvas
is released once the encoder has copied it.

**What still differs between a harness run and a click:**
- The entry point: a `window` global installed only in a dev build, versus
  the hook's dynamic `import()` of the lazy `videoPipeline` chunk in a
  production build. The chunk boundary itself is now guarded
  (`exportBoundary.test.ts`, R49); the hook and `TopBar.tsx` are not
  exercised by the harness.
- The hook's own behaviour: its progress state, the download (Blob, object
  URL, synthetic click), and the toast.
- The duration bound: the harness can pass `--duration`; the button never
  passes `durationSeconds` (R27/R39, unchanged; see "Known limitations").
- Error text: the seam prefixes its rethrow with `[export] `; the button
  shows the diagnostic verbatim.

**This is now guarded, and the guard was shown to fire.** Reversing the frame
loop in `videoPipeline.ts`, or dropping every 10th frame there, made
`video-check.mjs` exit 1 on `linear-motion.marey` (reverse: 38 strict
mismatches and 34 ties excluding the frame itself; drop: 81/90 decoded and 9
sampled frames never handed to the encoder); the unmutated control exited 0.
Before the wave, the reviewer measured both mutations leaving all 862 tests
green, and the harness could not see them because it ran a copy.

**Before the fix wave (Task 6's text, kept as the record of what was true
then).** Every number Task 6 produced went through `devVideoSeam.ts`'s own
`exportVideo`, a hand-written copy of `runVideoExport`'s call sequence
(`compileSource` → `planExport` → `planVideo` → `app.init` with the same
options → `buildNode` → `MatterWorld` + `SceneRuntime` → `sampleFrames` →
`createFrameRasterizer` → `.map(rasterize)` → `encodeVideo`). The two called
the same primitives, and nothing checked that their orchestration stayed the
same; `exportBoundary.test.ts` only checked that neither imported the other
and that the button's files never reached the dev global. Task 5 exercised
the button with a real click in a production build (download plumbing only,
R22), and Task 6b (next section) decoded one file from a real click. The
numbers Task 6 recorded are still evidence about the encoder engine, which
was shared then too; what the wave changed is that the orchestration around
it is no longer a second copy.

---

## Task 6b — decoding a file produced by a real export click

**Context after the fix wave.** This section is a record of what was measured
before the wave, when the harness ran a copy of the orchestration and this
one click was the only decode of a file from the shipped path. It stays true
as that record: the clicked files decoded as stated. It is no longer the only
evidence about the shipped path, because every `video-check.mjs` run since
the wave goes through `runVideoExport` (previous section). What it still
covers that the harness does not is the part above `runVideoExport`: the
hook, the lazy chunk in a production build, and the download. The files this
section describes predate the codec-string change, so that WebM declared VP9
level 1.0. **It has since been re-run after the wave** by the fix wave's
scoped re-review (`fix-wave-rereview.md`): a fresh `npm run build`,
`vite preview --port 4173 --strictPort`, and real clicks on both buttons with
`linear-motion.marey` loaded unmodified. Both clicked files decode 90/90,
90 strict / 0 tie / 0 ties excluding k, timestamps on schedule; swapping
reference frames 5 and 9 produced exactly two mismatches, so the check could
fail; and the clicked WebM is byte-identical (`cmp`) to the WebM the harness
produces through the dev seam for the same scene.

This section discharges the gap the previous section names: it decodes a
file that came from an actual click on `TopBar.tsx`'s MP4/WebM buttons in a
production build, and compares the decoded frames against reference frames,
the same way criterion 3 does above. It does not repeat criteria 1–3 for
every scene this document already covers — this is one scene, driven once
through the shipped path, not a second pass over the whole exit-criteria
suite.

**A precondition the shipped button imposes that the dev-seam harness does
not: the scene loaded into the editor needed one line added.**
`freeze-midair.marey` declares no top-level `duration:` (only a `duration:
0.5` inside its own `physics` block, an unrelated field). The dev-seam
harness can still export it, because `video-check.mjs`'s `--duration` flag
is threaded straight into `durationSeconds`, which `planExport`
(`exportContract.ts:94-114`) checks *before* falling back to the scene's own
`ir.duration` — that is how Task 6 exported this exact fixture. The shipped
hook has no such parameter: `useExportVideo.ts:90-96` calls
`runVideoExport({ source: code, container, fps: EXPORT_FPS, onProgress })`
— no `durationSeconds` field anywhere in that call, ever, because the UI
has no duration control. So for a real click, `planExport`'s `explicit`
branch is always `undefined`, and every export always falls through to
`ir.duration`. Loading the on-disk fixture unmodified and clicking export
reproduces R27's `EXPORT_UNBOUNDED_SCENE` trap on a *different* scene than
the one R27 names — confirmed by reading the two call sites side by side,
not assumed. The scene loaded into the editor for this section therefore
has one line added relative to the committed fixture: a top-level
`duration: 0.5`, matching the physics block's own bound so the exported
window is still continuous free-fall throughout. This does not change what
the physics simulation does: `ir.duration` is read nowhere under
`src/compiler/renderer/` (grepped directly), only by `exportContract.ts`, so
it is a pure export-bound annotation. The on-disk fixture file itself is
untouched — the edit exists only in the string handed to the `#code=` hash
injection, in a gitignored throwaway script
(`.visual-check/click-check.mjs`, not committed, per the brief).

**Step 1 — the click, in a production build.** `npm run build` (chunk
`videoPipeline-7TlaWxjS.js`, matching Task 5's own hash), then
`vite preview --port 5199 --strictPort`. Loaded the modified scene via the
same `#code=<lz-string>` hash-injection technique `check.mjs` and Task 5
use, confirmed `window.__mareyExportVideo === undefined` on the page (this
is the production bundle, not a dev server with the seam installed — the
same check Task 5 made), then clicked the real `button[title="Export MP4
video"]` and `button[title="Export WebM video"]` elements and captured each
with Playwright's `download` event:

| Container | Filename | Bytes | First 8 bytes (hex) |
|---|---|---|---|
| MP4 | `scene.mp4` | 7297 | `00 00 00 1c 66 74 79 70` (`ftyp` at offset 4) |
| WebM | `scene.webm` | 4146 | `1a 45 df a3 10 00 00 1f` (EBML magic) |

Zero console errors during the run.

**Step 2 — reference frames from a separate dev-mode run.** The production
build constant-folds the dev seam out (`main.tsx`'s
`if (import.meta.env.DEV)`), so reference frames cannot come from the
production page — this is a documented dependency, not an assumption:
reference-frame determinism across independent cold runs is already
measured elsewhere in this document (byte-identical across all three MP4
pairs and both WebM scenes, criterion 2 above), which is what makes a
reference set captured through a *different* code path than the one being
tested a sound comparison rather than a circular one. Ran
`npx vite --port 5199 --strictPort` and called
`window.__mareyExportVideo(modifiedSource, { container: "mp4", fps: 30,
withReferenceFrames: true })` directly — **deliberately omitting
`durationSeconds`**, mirroring exactly how `useExportVideo.ts` calls
`runVideoExport` (fps only, no duration field), so this call resolves its
bound from the scene's own `duration: 0.5` field the same way the click
above did. One call, not two: `sampleFrames` is invoked with `planned.plan`,
not `video.plan` (read directly in both `devVideoSeam.ts` and
`videoPipeline.ts`), so which container was requested cannot affect which
frames come back — the resulting 15 reference frames are valid for
comparison against both the clicked MP4 and the clicked WebM file.

Result: `frameCount=15, width=800, height=600, fps=30`, 15 reference PNGs,
hash `38629fc3`. That hash is identical to the one this document's
criterion 2 WebM table already recorded for this same fixture ("Hash (sim.
state) equal (`38629fc3` both)") — a same-scene, dev-seam-to-dev-seam
comparison across the *original* unmodified fixture (Task 6, explicit
`--duration 0.5` override) and the *modified* one used here (top-level
`duration: 0.5`, no override), which is evidence, not just an assertion,
that adding the line changed nothing about the simulation.

**Step 3 — decode and compare.** Reused `video-check.mjs`'s
`decodeAndCompare(page, { videoBase64, referenceFramesBase64, writeIndices
})` (line 357 at this task's BASE, `78b084f`) — copied verbatim, byte-
identical logic once comments are set aside, checked directly rather than
assumed — and `installMediabunny` (line 339) — copied with one necessary
change, inlining the `mediabunnyPath` constant as a local, since the
original reads it from a module-level constant built from this task's own
CLI-arg parsing, which this script has none of — into the throwaway script
rather than imported, because neither function is `export`-qualified and
the file they live in has side-effecting top-level code that runs a whole
CLI invocation on load, so an ES-module import was not mechanically
available without editing the file the brief says not to edit. Both
containers were run — decoding a second
15-frame container after the first was cheap, so there was no reason to
name a gap here the way criterion 1 named one for MP4-on-`compound-logo`.

| Field | MP4 (clicked) | WebM (clicked) |
|---|---|---|
| Decoded frame count | 15 (planned 15, match: yes) | 15 (planned 15, match: yes) |
| Decoded dimensions | 800×600 (match: yes) | 800×600 (match: yes) |
| Timestamp monotonicity | strictly increasing | strictly increasing |
| Timestamps match claimed 30fps schedule (±half frame) | yes | yes |
| Nearest-neighbour: strict / tie / strict mismatches | 13 / 2 / **0** | 12 / 3 / **0** |
| Max off-diagonal margin | 0.52007 | 0.51867 |
| Min margin among strict matches | 0.02482 | 0.09224 |

Zero strict mismatches in either container, on a file that came from an
actual button click rather than the dev seam. These numbers are, digit for
digit, the same strict/tie/margin figures this document's criterion 3
section already recorded for this fixture through the dev seam (13/2/0,
0.5201, 0.0248 for MP4; 12/3/0, 0.5187, 0.0922 for WebM) — one scene, one
comparison, not a general claim that the shipped path always matches the
seam, but a direct, measured agreement on the one case this section tested.
Opened `mp4_decoded_0000.png` and `mp4_decoded_0014.png` (first and last
decoded frame) with the Read tool rather than trusting the numbers alone:
frame 0 shows the light-blue square near the top of the canvas, matching
the scene's declared `position: (400, 100)`; frame 14 shows the same square
visibly lower, consistent with continuous downward motion and with zero
strict mismatches — neither frame is blank or a flat solid colour.

**Step 4 — proof the check could have failed.** Fed `decodeAndCompare` the
clicked MP4 file against a deliberately corrupted reference set: an
in-memory copy of the Step 2 reference-frame array with indices 5 and 9
swapped (four apart, so their nearest-neighbour windows, k−2..k+2, do not
overlap — the same shape as Task 3's fault #3, "duplicate frame 5 in place
of frame 6," reproduced here as a swap instead of a duplication). Result:
`strict=13, tie=2, strict-mismatches=2` — frame 5's nearest reference is now
4 (distance 1.1296), frame 9's nearest reference is now 8 (distance
1.2601), both previously-strict-and-correct matches turned
strict-and-wrong by the injection, and every other frame unaffected. The
check reported the corruption rather than passing it. No tracked file was
touched by this step — the swap is an array operation inside the gitignored
throwaway script, not an edit to `video-check.mjs` or any fixture — so
there is no revert to perform; confirmed instead that the repository was
never dirtied by any part of this section: `git diff --stat` (the
content-based check this document uses throughout, not `git status`, which
`core.autocrlf` makes unreliable here) returned empty after every step
above, including this one.

**Net.** What is now covered that was not: for `freeze-midair.marey`, 30fps,
0.5s, one file downloaded from a real click on each of the MP4 and WebM
buttons in a production build decodes to the expected frame count,
dimensions, and timestamp schedule, and shows zero dropped, duplicated or
reordered frames against the sampler's own reference output — and the
check that found that is proven capable of failing, on this same clicked
file, when its reference input is wrong. What remains uncovered: every
other scene in this document (criteria 1–3 above cover several; this
section covers one), any scene reached through the UI's default
unmodified-fixture path (the button still cannot export
`freeze-midair.marey` as committed, or any other scene, without a
scene-level `duration:` — R27's finding, now shown to generalize to any
scene whose only duration lives inside a physics block; the shipped
default scene itself has declared one since the smiling-face replacement), cross-browser
behaviour, and the memory ceiling and hardware-encoder questions the
"Known limitations" section below already names as open. This result does
not retroactively extend criteria 1–3's per-scene numbers above to the
shipped path — it establishes, independently, that for one scene, one
production build, one machine, the shipped path's output decodes to the
same frame-level result the dev-seam path already established.

---

## Criterion 1 — exports to WebM and MP4 at the requested frame rate and duration

Per design §10.1, every number below is read from the **decoded file's own**
metadata (frame count, dimensions, per-frame timestamps from a real
`VideoDecoder`), not from what was requested — the harness decodes the
container back inside a real browser page rather than trusting the encoder's
own claim about what it wrote.

The three subsections below are Task 6's pre-wave runs, with commands
recorded as they were run. `--mask-mp4-times` no longer exists (R47: the
masked MP4 comparison is always reported and never gates), so a flag passed
today is ignored. The post-wave runs, including sizes above 720p and rates
other than 30 fps, follow in "After the fix wave".

### MP4 — `freeze-midair.marey`, 30fps, 0.5s

`freeze-midair.marey` declares no top-level `duration:` (only a `duration:
0.5` inside the box's own `physics` block, which bounds how long the
simulation runs before the object's position stops updating); `--duration
0.5` was supplied explicitly, matching the physics block's own bound so the
exported window is continuous free-fall throughout, never the frozen tail.
30fps divides `TICK_HZ` (120) exactly (4 ticks per frame).

```bash
node tools/visual-check/video-check.mjs \
  --scene tools/visual-check/scenes/freeze-midair.marey \
  --container mp4 --fps 30 --duration 0.5 --mask-mp4-times \
  --out .visual-check/video/t6-freeze-mp4
```

Measured, from the decoded file itself:

| Field | Requested | Decoded (file's own metadata) | Match |
|---|---|---|---|
| Frame count | 0.5s × 30fps = 15 | 15 | yes |
| Dimensions | scene declares 800×600 | 800×600 | yes |
| Track duration | 0.5s | last decoded timestamp `0.46667` + one frame period `0.03333` = `0.5s` (timestamps: `[0, 0.0333, ..., 0.4667]`) | yes |
| Timestamp monotonicity | strictly increasing | true | yes |
| Timestamps match claimed 30fps schedule (±half frame) | — | true | yes |

Container bytes are not byte-identical across the two cold runs this same
invocation performs internally (that is criterion 2's MP4 finding, below) —
criterion 1 is about the **file's own declared schedule**, which both cold
runs satisfy identically; this run's `runA` and `runB` agree on frame count,
dimensions, and timestamp schedule even though their raw bytes differ.

### WebM — `freeze-midair.marey`, 30fps, 0.5s

```bash
node tools/visual-check/video-check.mjs \
  --scene tools/visual-check/scenes/freeze-midair.marey \
  --container webm --fps 30 --duration 0.5 \
  --out .visual-check/video/t6-freeze-webm
```

| Field | Requested | Decoded (file's own metadata) | Match |
|---|---|---|---|
| Frame count | 15 | 15 | yes |
| Dimensions | 800×600 | 800×600 | yes |
| Track duration | 0.5s | last timestamp `0.467` + one frame period `0.0333` = `0.5s` | yes |
| Timestamp monotonicity | strictly increasing | true | yes |
| Timestamps match claimed 30fps schedule | — | true | yes |

### WebM — `compound-logo.marey`, 30fps, scene's own 8s duration (second, larger-scale check)

A second, independent measurement on a longer, richer scene — the design's
own canonical animate-in/physics/settle scene — rather than trusting the
15-frame fixture alone to represent the whole frame range.

```bash
node tools/visual-check/video-check.mjs \
  --scene eval/scenes-3b/compound-logo.marey \
  --container webm --fps 30 \
  --out .visual-check/video/t6-logo-webm
```

| Field | Requested | Decoded (file's own metadata) | Match |
|---|---|---|---|
| Frame count | scene declares `duration: 8`; 8s × 30fps = 240 | 240 | yes |
| Dimensions | 800×600 | 800×600 | yes |
| Track duration | 8s | last timestamp `7.967` + one frame period `0.0333` = `8.0s` | yes |
| Timestamp monotonicity | strictly increasing | true | yes |
| Timestamps match claimed 30fps schedule | — | true | yes |

**MP4 was not run against `compound-logo.marey`.** Only the 15-frame
`freeze-midair` fixture was used for MP4 above. A 240-frame H.264
software-encode-plus-decode pass would cost several more minutes of harness
time for a container-metadata claim (frame count, dimensions, timestamp
schedule) that the 15-frame MP4 run above already establishes cleanly, and
criterion 2's MP4 finding (below) does not depend on scene size. Named as a
gap rather than silently skipped.

### After the fix wave — sizes above 720p, and 24 and 60 fps

Before the wave, MP4 could not export anything larger than 1280×720 in area:
the codec string pinned H.264 level 3.1, whose maximum frame size is 3,600
macroblocks (921,600 coded pixels), and Chromium enforces that limit. The
reviewer measured 1920×1080 refusing with `VIDEO_UNSUPPORTED_CODEC`, a
message that blamed the browser (finding I-5). Every piece of evidence in
this document had been 800×600, so nothing here could have found it.

The codec string is now a function of the plan (`h264LevelFor`,
`vp9LevelFor` in `videoContract.ts`): the lowest level whose limits admit
the frame size in macroblocks, each dimension (`Sqrt(MaxFS * 8)`), the
macroblock rate and the bitrate. **H.264 limits come from Rec. ITU-T H.264
(03/2010), Annex A, Table A-1 and clause A.3.1**, the edition that could be
retrieved; it ends at level 5.1, so 5.1 (36,864 macroblocks per frame and
983,040 per second, e.g. 3840×2160 at 30 fps) is the top of the supported
MP4 range, and a scene beyond it is refused by `planVideo` with
`VIDEO_EXCEEDS_CODEC_LEVELS`, which names the scene's size and rate. VP9
limits come from libvpx's `vp9_level_defs` (levels 1 to 6.2). Measured with
`VideoEncoder.isConfigSupported` in this harness's Chromium: the H.264
frame-size limit is enforced exactly (`avc1.42001f` accepts 1280×720 and
refuses 1296×720; `avc1.420020` accepts 1296×720); the macroblock-rate limit
is not enforced, and VP9 levels are not enforced at all (`vp09.00.10.08`
accepted 1920×1080). So an honest declaration is Marey's job, not the
browser's.

Post-wave runs, all through the shared pipeline, all on `linear-motion.marey`
(or a copy of it at the stated size, outside the repository), 3 s, read from
the decoded file:

| Run | Size, fps | Codec string (from the recorded encoder config) | Declared in the file | Decoded | Dimensions | Timestamps on schedule | Last timestamp |
|---|---|---|---|---|---|---|---|
| `fw/i2-lin-mp4-30` | 800×600, 30 | `avc1.42001f` | `avcC` level 31 | 90/90 | match | yes | 2.9667 |
| `fw/i2-lin-mp4-60` | 800×600, 60 | `avc1.420020` | `avcC` level 32 | 180/180 | match | yes | 2.9833 |
| `fw/i9-lin-webm-24` | 800×600, 24 | `vp09.00.31.08` | `CodecPrivate` level 31 | 72/72 | match | yes | 2.958 |
| `fw/i4-lin-webm` | 800×600, 30 | `vp09.00.31.08` | `CodecPrivate` level 31 | 90/90 | match | yes | 2.967 |
| `fw/i2-hd-mp4` | 1920×1080, 30 | `avc1.420028` | `avcC` level 40 | 90/90 | match | yes | 2.9667 |
| `fw/i2-portrait-mp4` | 1080×1920, 30 | `avc1.420028` | `avcC` level 40 | 90/90 | match | yes | 2.9667 |
| `fw/i2-hd-webm` | 1920×1080, 30 | `vp09.00.40.08` | `CodecPrivate` level 40 | 90/90 | match | yes | 2.967 |

The 60 fps row matches what the reviewer found by parsing a pre-wave 60 fps
file: the encoder had already raised the level in the stream to 3.2 while
the string said 3.1. At the 30 and 60 fps configurations measured, the
string and the stream now agree on the level. **That agreement is observed,
not guaranteed:** for H.264 the encoder writes its own level into the
stream. At 800×600 and 120 fps — reachable only through the harness, since
the button exports at 30 fps — the string declares 4.0, which the table
requires for that macroblock rate, while the stream says 3.2, which is too
low for it (measured by the scoped re-review). They also still disagree on
the constraint flags: the string carries `00` and the
stream's `avcC` carries `0xC0` (Constrained Baseline). That is kept
deliberately, so that 800×600 at 30 fps still selects `avc1.42001f`, the
string every pre-wave MP4 number was measured with; it is a disclosed
residual (M-8), not a fix.

As a control, the same 1920×1080 MP4 run with the string forced back to the
old pin `avc1.42001f` fails exactly as the reviewer measured:
`[VIDEO_UNSUPPORTED_CODEC] This browser's video encoder does not support
'avc1.42001f'`.

**Net: criterion 1 holds for both containers**, measured before the wave
from three independent harness invocations (two scenes, both containers)
and after it on the shared pipeline at 800×600, 1920×1080 and 1080×1920,
at 24, 30 and 60 fps, reading the decoded file's own metadata rather than
the request. MP4 is bounded above by H.264 level 5.1 and refuses beyond it
by name.

---

## Criterion 2 — repeated exports are byte-identical, or the reason is documented at the encoder boundary

Per R32 (above), this section follows the spec's own two branches rather
than the brief's literal "mask six ranges and show the rest matches" —
that claim does not hold for real MP4 output, as both Task 3 and this run
confirm below.

### WebM — branch one: byte-identical, measured (not assumed)

`video-check.mjs` always performs two independent cold page loads
(`runA`/`runB`) and exports the same scene from each. For WebM this is the
`gatingBytesEqual` check every run above already exercised; restated here as
criterion 2 evidence specifically:

| Scene | runA bytes | runB bytes | Raw bytes equal | Hash (sim. state) equal | Reference frames (encoder input) bit-identical | Exit |
|---|---|---|---|---|---|---|
| `freeze-midair.marey` (15 frames) | 4146 | 4146 | **true** | true (`38629fc3` both) | true (15/15) | 0 |
| `compound-logo.marey` (240 frames) | 416063 | 416063 | **true** | true (`26cca4e9` both) | true (240/240) | (fails only on criterion 3's near-tie below, not on byte identity) |

Both scenes, one small/short and one large/long, produce **exactly
byte-identical WebM files across two independent cold runs**, with no
masking applied or needed (mediabunny's WebM/Matroska muxer path contains
no wall-clock or random field this scene shape can trigger, per the
harness's header comment). This is measured evidence of byte-identity, not
merely the absence of a counter-example: two full independent invocations,
two different scenes, one of them at 240 frames.

**Re-measured after the fix wave.** The table above is pre-wave: those files
declare VP9 level 1.0. Every WebM now carries a different level byte in its
`CodecPrivate` (R43), and is produced by the shared, lazily-rasterizing
pipeline (R45), so byte identity was measured again on the new files:

| Scene | Codec string | runA bytes | runB bytes | Raw bytes equal | Hash equal | Reference frames bit-identical |
|---|---|---|---|---|---|---|
| `freeze-midair.marey`, `--duration 0.5` (`fw/i4-freeze-webm`) | `vp09.00.31.08` | 4146 | 4146 | **true** | true (`38629fc3`) | true (15/15) |
| `compound-logo.marey` (`fw/i9-logo-webm`) | `vp09.00.31.08` | 416063 | 416063 | **true** | true (`26cca4e9`) | true (240/240) |
| `linear-motion.marey` (`fw/i4-lin-webm`) | `vp09.00.31.08` | 123425 | 123425 | **true** | true (`fa8e64c2`) | true (90/90) |
| `linear-motion.marey`, 24 fps (`fw/i9-lin-webm-24`) | `vp09.00.31.08` | 98440 | 98440 | **true** | true (`36fad321`) | true (72/72) |
| 1920×1080 copy of `linear-motion` (`fw/i2-hd-webm`) | `vp09.00.40.08` | 260337 | 260337 | **true** | true (`7a3b74ba`) | true (90/90) |

The byte counts of the two scenes measured before and after are unchanged
(4146 and 416063): the level is one byte inside a fixed-length field. The
eager (pre-R45) and lazy pipelines were also compared directly on
`linear-motion` WebM: `fw/i2-lin-webm-30` (eager, after the codec change)
and `fw/i3-lin-webm` (lazy) are byte-identical (`cmp`). The simulation hashes
match Task 6's, so the change reached only the container.

### MP4 — branch two: not byte-identical, reason documented at the encoder boundary

Ran the MP4 export three separate times today (three independent
`runA`/`runB` cold-run pairs, all against `freeze-midair.marey`, all with
`--mask-mp4-times`):

```bash
node tools/visual-check/video-check.mjs \
  --scene tools/visual-check/scenes/freeze-midair.marey \
  --container mp4 --fps 30 --duration 0.5 --mask-mp4-times \
  --out .visual-check/video/t6-freeze-mp4
```

| Invocation | runA bytes | runB bytes | Raw bytes equal | Masked bytes equal | Reference frames bit-identical | Exit |
|---|---|---|---|---|---|---|
| 1 (`t6-freeze-mp4`) | 7297 | 7314 | false | **false** | true (15/15) | 1 |
| 2 (`t6-freeze-mp4-exitcheck`) | 7294 | 7312 | false | **false** | true (15/15) | 1 |
| 3 (`t6-mp4-diag`) | 7298 | 7297 | false | **false** | true (15/15) | 1 |

**Re-derived today, not copied from Task 3's report.** Task 3 (`task-3-report.md`)
recorded a 7297/7294-byte pair on the same fixture; today's three pairs are
7297/7314, 7294/7312, and 7298/7297 — none identical to Task 3's own numbers,
and no two of today's three pairs match each other either. The byte counts
of an MP4 export of this scene are not even reproducible run-to-run on this
machine, let alone identical between the two cold runs of a single
invocation — that instability is itself part of the evidence for
encoder-side non-determinism, not a contradiction of it.

**The renderer is exonerated in every one of the three pairs above**: the
lossless reference-frame PNGs — the exact rasterized canvases each cold run
fed to its own encoder, per `devVideoSeam.ts`'s own contract — are
bit-identical, 15 for 15, in all three pairs. So whatever is producing the
differing container bytes is downstream of rasterization in every
measurement taken today, consistent with Task 3's own finding on this same
fixture.

**Where the divergence actually is, measured byte-by-byte on pair 3
(`t6-mp4-diag`, runA 7298 bytes / runB 7297 bytes; the diagnostic files were
still on disk for this fix round, so this re-derives the classification
below directly from the same two files rather than re-running the harness).**
The ISOBMFF box tree of this export is `ftyp`(0–28), then `moov`(28–766,
containing `mvhd`, `trak` → `tkhd`, `mdia` → `mdhd`/`hdlr`/`minf` →
`vmhd`/`dinf`/`stbl` → `stsd`/`stts`/`stsc`/`stsz`/`stco`/`stss`), then
`mdat`(766–end). Comparing the 7297 overlapping bytes region by region,
rather than lumping `ftyp` and `moov` together as an earlier draft of this
section did:

| Region | Differing bytes | Share of region |
|---|---|---|
| `ftyp` (bytes 0–27) | 0 | 0/28 = 0% |
| `moov` (bytes 28–765) | 12 | 12/738 ≈ 1.6% |
| `mdat` (bytes 766–7296) | 4405 | 4405/6531 ≈ 67.45% |
| **Total overlapping** | **4417** | **4417/7297 ≈ 60.53%** |

**Zero of the 12 `moov` differences fall inside `ftyp`** — checked directly
by listing every differing offset and testing it against `ftyp`'s own
0–27 range, not inferred from the region boundaries. All 12 sit inside
`moov`.

Of those 12: **6 are exactly the harness's own computed timestamp fields**
— `mvhd`/`tkhd`/`mdhd` `creation_time` and `modification_time`. Two related
but distinct things are true about their offsets, and conflating them was
an error in an earlier draft of this section, caught while re-deriving this
passage for this fix round: `findMp4TimestampRanges` (the function
`--mask-mp4-times` uses to know what to zero) locates each field's **start**
by walking this file's box tree — 48, 52 (`mvhd`), 164, 168 (`tkhd`), 264,
268 (`mdhd`), each a 4-byte, version-0 field. But `creation_time` and
`modification_time` are 32-bit second counts, and the two cold runs in this
pair are only a few seconds apart, so in practice only each field's
low-order **byte** actually differs — a direct byte-level diff of runA
against runB finds single differing bytes at exactly **51, 55, 167, 171,
267, 271**: the last byte of each 4-byte field. Those six numbers are
numerically identical to spec §7.2's static table for this file — not
because the table's fixed offsets are safe to assume in general (they are
not; that is exactly why the harness parses the box tree rather than
hardcoding them — a scene with a different box layout, or two runs whose
wall-clock gap crosses a higher-order byte boundary, would not have this
coincidence), but because this file's `mvhd`/`tkhd`/`mdhd` happen to sit at
the same offsets the table's original file used, and the observed diff is
narrower (one byte) than the masked field (four bytes) that contains it.
Masking the full four-byte fields — the only masking `--mask-mp4-times`
performs — is necessary but nowhere near sufficient regardless: it accounts
for 6 of 4417 differing bytes, 0.14% of the total divergence.

**The other 6 `moov` bytes are new evidence beyond what Task 3's report
measured**, which described the divergence as confined to `mdat` alone.
Located precisely, from this one measured pair (`t6-mp4-diag`) — **these
offsets are as file-specific as the timestamp-field offsets discussed
above, not asserted to be stable across scenes, encodes, or even a repeat
of this same export**: offsets 589 and 593 fall inside `stsd` (419–594, the
sample description box carrying the H.264 codec configuration record), and
offsets 677, 717, 721 and 725 fall inside `stsz` (654–726, the per-sample
compressed-byte-size table). Both are mechanical consequences of the same
encoder-side divergence rather than a separate cause: `stsz` records each
sample's compressed byte count, so if the H.264 bitstream itself differs in
size between the two runs (which it does — the two files are different
total lengths), the per-sample sizes in `stsz` necessarily differ too, and
`stsd` carries codec parameter data the encoder writes once per invocation.
Nothing in this breakdown points at the container/muxing layer
(`videoEncode.ts`, `videoContract.ts`) — every differing byte is either a
wall-clock timestamp, a mechanical derivative of the bitstream's own size,
or inside the bitstream itself.

**Hard limit on this attribution, stated explicitly.** What was measured:
identical rasterized input (bit-identical reference frames) into the
encoder, non-identical compressed output, across three independent
invocations, all consistent with the divergence originating on the encoder
side. What was **not** measured, and is not claimed here: which Chromium
component, which codec setting, or which layer of the stack causes it.
mediabunny's encoder is configured with `hardwareAcceleration:
"prefer-software"`, but per spec §7.5's dated correction this project's own
harness forces software rendering (`--use-angle=swiftshader`,
`--enable-unsafe-swiftshader`, `--use-gl=angle`) for every measurement it
ever takes, including this one — so this document's determinism claims are
about this project's own software-rendering-forced test harness on one
machine, not a general claim about what any Chromium build's H.264 encoder
does. No hardware-encoder path was reached or ruled out here.

**Narrowed further by the whole-branch reviewer, cited as the reviewer's
measurement (not re-measured in the fix wave).** The reviewer encoded the
same bitmaps with raw WebCodecs `VideoEncoder` in one page, with no
mediabunny involved, three encodes per configuration under `constant`,
`variable` and `realtime` settings, and every output hash differed; the
`quantizer` bitrate mode was unsupported for H.264 there. On that
measurement the non-determinism is **below the muxer**. Which layer of the
browser's H.264 stack produces it is still not claimed (R32).

**After the fix wave: MP4 bytes are reported and never gate (R47).** Before
the wave the harness gated MP4 on raw bytes whenever `--mask-mp4-times` was
not passed, and on masked bytes when it was; since both comparisons were
false in every pre-wave MP4 run, every MP4 run exited 1, and a correct run
could not be told apart from one with reordered frames (finding I-6). Now a
correct MP4 run exits 0 (`fw/i5-lin-mp4`, `fw/i4-freeze-mp4`) and a run with
the frame loop reversed in `videoPipeline.ts` exits 1 on criterion 3.

Post-wave MP4 byte comparisons, for the record:

| Run | runA / runB bytes | Raw equal | Masked equal | Reference frames bit-identical |
|---|---|---|---|---|
| `freeze-midair`, 0.5 s (`fw/i4-freeze-mp4`) | 7293 / 7295 | false | false | true (15/15) |
| `linear-motion`, 800×600, 30 fps (`fw/i5-lin-mp4`) | 84365 / 84460 | false | false | true (90/90) |
| `linear-motion`, 800×600, 60 fps (`fw/i2-lin-mp4-60`) | 168369 / 167583 | false | false | true (180/180) |
| 1920×1080 copy (`fw/i2-hd-mp4`) | 179372 / 179372 | false | **true** | true (90/90) |
| 1080×1920 copy (`fw/i2-portrait-mp4`) | 95753 / 95753 | false | **true** | true (90/90) |

The two large-frame runs came out identical once the six wall-clock fields
were masked; every 800×600 run did not. Two runs are not enough to say MP4
is deterministic at those sizes, and nothing here explains the difference,
so it is recorded as an observation. It does not change the criterion-2
branch MP4 is in: across this phase MP4 bytes are not reproducible in
general, which is why they do not gate.

**Net for criterion 2: WebM satisfies the first branch (byte-identical,
measured twice on two different scenes before the wave and on five runs
after it). MP4 satisfies the second branch —
not byte-identical, with the reason documented at the encoder boundary: the
renderer is exonerated by direct, repeated measurement (bit-identical
reference frames in all three runs), the six spec-named timestamp fields
account for a negligible fraction of the actual divergence, and the
remainder is inside the compressed bitstream and its mechanical metadata
derivatives — attributed to the encoder side, and by the reviewer's raw
`VideoEncoder` measurement to below the muxer, and no further.**

---

## Criterion 3 — no frame dropped, duplicated or reordered, relative to the sampler's output

The check (design §10.2): for each decoded frame *k*, compute a distance to
sampler reference frames *k−2..k+2* and require the minimum to be achieved by
*k* itself. A match is `strict` when one candidate achieves the minimum, and
`tie` when two or more do. Since the fix wave (R46) the harness fails a run
on either of two shapes: a strict match that is not *k*, and a tie whose
tied set **excludes** *k* (two other references nearer than *k*). A tie that
includes *k* is reported and never gates. Before the wave only the first shape
gated: `kInTiedSet` was computed and read nowhere (finding I-1). This
positional check is used instead of pixel equality because both codecs are
lossy — a dropped, duplicated or reordered frame makes a decoded frame
resemble a *neighbour* more than itself, which survives lossy compression;
exact pixel equality would not, structurally, regardless of correctness.

### Primary fixture — `linear-motion.marey` (since the fix wave)

`tools/visual-check/scenes/linear-motion.marey`: an 800×600 scene,
3 s, a 160 px box moving right and a 30 px-radius dot moving down, both at
constant velocity from frame 0 to the last frame and on screen throughout
(6.7 px and 5.3 px per frame at 30 fps). At the rates below, every
neighbouring pair of reference frames differs visibly, so every decoded frame
has one clearly nearest reference from the first frame on. **That holds for
the rates measured here, not for every rate:** at 120 fps the per-frame
motion falls to about 1.7 px and 1.3 px, below what the harness's step-4
downsampled distance can resolve, and an MP4 run gives 22 false mismatches,
each frame matching its predecessor by about 0.01 against a noise floor of
about 1.0 (measured by the scoped re-review). That is a resolution limit of
the check, not a wrong frame. The button exports at 30 fps. It passes `node bin/marey.mjs check`, as
every tracked `.marey` file must. All runs through the shared pipeline:

| Run | Frames | Strict | Tie | Strict mismatches | Ties excluding k | Min margin among strict | Exit |
|---|---|---|---|---|---|---|---|
| WebM, 30 fps (`fw/i4-lin-webm`) | 90 | 90 | 0 | **0** | **0** | 0.4710 | 0 |
| MP4, 30 fps (`fw/i5-lin-mp4`) | 90 | 90 | 0 | **0** | **0** | 0.4420 | 0 |
| WebM, 24 fps (`fw/i9-lin-webm-24`) | 72 | 72 | 0 | **0** | **0** | 0.8204 | 0 |
| MP4, 60 fps (`fw/i2-lin-mp4-60`, 6 GOPs) | 180 | 180 | 0 | **0** | — (run before the gate existed) | 0.1139 | 1 (raw MP4 bytes; gated then, not now) |
| MP4, 1920×1080 copy (`fw/i2-hd-mp4`) | 90 | 90 | 0 | **0** | — (run before the gate existed) | 0.7372 | 1 (same reason) |
| MP4, 1080×1920 copy (`fw/i2-portrait-mp4`) | 90 | 90 | 0 | **0** | — (run before the gate existed) | 0.4831 | 1 (same reason) |
| WebM, 1920×1080 copy (`fw/i2-hd-webm`) | 90 | 90 | 0 | **0** | — (run before the gate existed) | 0.7413 | 0 |

For the four rows run before the new gate, "0 ties" means no tie of any kind,
so none could have excluded *k*. The minimum strict margins (0.11 to 0.82)
compare with 0.025–0.09 on `freeze-midair` below. The reviewer's own linear
fixture gave the same picture independently (72/72 at 24 fps WebM, 180/180
at 60 fps MP4, 0 ties).

**Net: every decoded frame of the primary fixture, in both containers, at
three frame rates and three frame sizes, has a unique nearest reference, and
it is itself.**

### Former primary fixture — `freeze-midair.marey`, and a correction to R20

Task 6's numbers (pre-wave, `t6-*`), restated for the record:

| Run | Strict | Tie | Strict mismatches | Max off-diagonal margin | Min margin among strict matches |
|---|---|---|---|---|---|
| WebM (`t6-freeze-webm`) | 12 | 3 | **0** | 0.5187 | 0.0922 |
| MP4 (`t6-freeze-mp4`) | 13 | 2 | **0** | 0.5201 | 0.0248 |

Task 6 summarised this as "every decoded frame's uniquely-best match among
its neighbours is itself". **That was not what was measured.** A tied frame
has no uniquely-best match, and one of the WebM ties excluded the frame
itself. Re-run after the wave (`fw/i4-freeze-webm`, `fw/i4-freeze-mp4`), the
first frames read:

| Container | Frame | Match | Distances to references |
|---|---|---|---|
| WebM | 0 | tie [0, 1] | 0 = 1.00061, 1 = 1.00061, 2 = 1.03212 |
| WebM | 1 | tie [0, 1] | 0 = 1.00738, 1 = 1.00738, 2 = 1.03524 |
| WebM | 2 | **tie [0, 1], excludes 2** | 0 = 1.01763, 1 = 1.01763, **2 = 1.02066** |
| MP4 | 0 | tie [0, 1] | 0 = 1.80912, 1 = 1.80912, 2 = 1.83630 |
| MP4 | 1 | tie [0, 1] | 0 = 1.80968, 1 = 1.80968, 2 = 1.83501 |
| MP4 | 2 | strict, 2 | 0 = 1.83677, 1 = 1.83677, **2 = 1.81194** (margin 0.0248) |

Reference frames 0 and 1 are identical on the harness's step-4 grid (equal
distances from every decoded frame): a fall from rest has barely moved after
one frame. Decoded WebM frame 2 is nearer to references 0 and 1 than to
reference 2, by 0.003 against a noise floor of about 1.0. **So R20's claim
that `freeze-midair` can tell a dropped frame from a still one is false for
its frames 0–2**: those frames carry no discriminating power, and 20% (WebM)
/ 13% (MP4) of the former primary fixture was unverified. The tie is most
likely codec noise at sub-grid motion; it is the shape of evidence a wrong
frame would also produce, which is why the gate treats it as a failure.

**The new gate fires on this real data.** `fw/i4-freeze-webm` now exits 1
with `ties-excluding-k=1` (frame 2, tied [0, 1]); removing only the new
condition from the exit test and re-running the same scene exits 0 with the
same tie printed. `fw/i4-freeze-mp4` exits 0: its two ties include *k*.

### Secondary observation — `compound-logo.marey` (WebM), reproducing the known near-tie

```bash
node tools/visual-check/video-check.mjs \
  --scene eval/scenes-3b/compound-logo.marey \
  --container webm --fps 30 \
  --out .visual-check/video/t6-logo-webm
```

| Strict | Tie | Strict mismatches | Max off-diagonal margin | Min margin among strict matches |
|---|---|---|---|---|
| 160 | 80 | **1** (frame 131 → nearest is 132, dist 1.0398) | 1.5872 | 0.000833 |

This reproduces Task 3's finding on the same scene (`task-3-report.md`,
Step 5) to within floating-point rounding: same frame (131), same wrong
neighbour (132), same distance (`1.039811...`), same tiny margin
(`0.000833...`). Investigated the same way: pulling the surrounding window
confirms a symmetric V-shaped margin converging on 131/132 rather than a
jump, and this scene's decoded frame 120 (t=4.0s, read directly below) is
already visually indistinguishable from its last frame (t=7.967s) —
**before** the scene's own comment's claimed 5.5s settle time, meaning the
mark is at or extremely near its final rest position well ahead of when the
scene's author believed it settled. **One third of this run's frames tie,
plus a near-static tail** — exactly the condition spec §10.2 names as "not
proof — proof the fixture was wrong" for this criterion, which is the
reasoning behind R20's fixture choice, confirmed rather than merely cited.

**Unchanged after the fix wave.** Re-run on the shared pipeline
(`fw/i9-logo-webm`): 160 strict / 80 tie / **1** strict mismatch, the same
frame 131 → 132 at distance 1.039811..., minimum strict margin 0.000833, and
0 ties excluding *k*. The run exits 1 on that mismatch, as it did before.

### The fault-injection table — evidence the check can fail

A clean run only proves this criterion if the check is capable of catching
a real defect. Task 3 injected **five** faults into `devVideoSeam.ts`
(temporary edits, each reverted immediately after its run, confirmed by
`git diff --stat -- src/lib/devVideoSeam.ts` returning empty after every
single revert) — four in its own Step 6, plus a fifth added during its
post-review fix round (task-3-report.md, "Fix 2 (Important 2)") after a
reviewer noted none of the first four could make the harness's *hash*
equality gate fail, since all four corrupted both cold runs identically.
Reproduced here from `task-3-report.md` (cited, not re-run today — re-running
five temporary source edits was judged unnecessary to satisfy this step,
which asks to *record* the table; the source citations below let this be
independently re-verified against that report):

| # | Injected fault | Caught by | Exit code |
|---|---|---|---|
| 1 | Drop every 10th frame before encoding | **Both**: frame count (14 decoded vs 15 planned) *and* nearest-neighbour (5 strict mismatches, frames 9–13) | 1 |
| 2 | Reverse the frame order before encoding | **Nearest-neighbour only** — frame count stayed correct (15/15, a count-only check would false-pass); 10/15 frames flagged strict-and-wrong at distances 1.02–2.72 | 1 |
| 3 | Duplicate frame 5 in place of frame 6 | **Nearest-neighbour, isolated to exactly the corrupted frame** — frame count unaffected by duplication; exactly one strict mismatch (frame 6 → nearest is 5), zero false positives on neighbouring frames 5 and 7 | 1 |
| 4 | Encode at 60fps while claiming 30 (metadata still says 30) | **Timestamp-schedule check only** — frame count and nearest-neighbour both stayed clean (same frames, same order, only playback speed metadata wrong); decoded timestamps ran twice the claimed rate, exceeding the ±half-frame tolerance | 1 |
| 5 | Corrupt only `runB`'s returned simulation-state hash (one run, not both) | **`hashesEqual` only**, isolated from every other check — raw bytes, reference frames, frame count, dimensions, timestamps and nearest-neighbour all stayed clean; only the hash string differed, by construction | 1 |

All five faults were caught, each by the specific check the fault targets,
and none passed cleanly. Fault 2 (reverse) is the one the design's own §10.2
flags as the important case — it leaves frame count intact, so a
count-only harness would report a false pass — and it was caught
exclusively by nearest-neighbour. Fault 5 is what makes this table cover
*five* faults rather than four: it is the only one that demonstrates the
harness's simulation-hash equality gate (`hashesEqual`) can itself fail,
which none of the original four could exercise since they corrupted both
cold runs identically.

Task 3's faults were injected into `devVideoSeam.ts`, which was then a copy
of the orchestration, so they proved the harness could catch faults in the
copy, not in the shipped path. The reviewer showed that gap: the same kinds
of fault in `videoPipeline.ts` left all 862 tests green and were invisible
to the harness (finding I-2). **After the fix wave, faults injected into the
shipped `videoPipeline.ts`**, each reverted in the same command and the
revert confirmed with `git diff --stat` empty:

| # | Injected fault (in `videoPipeline.ts`'s frame loop) | Fixture | Caught by | Exit code |
|---|---|---|---|---|
| 6 | Reverse the frame order | `linear-motion`, WebM | Nearest-neighbour: 38 strict mismatches and 34 ties excluding *k*; frame count still 90/90 | 1 |
| 7 | Drop every 10th frame | `linear-motion`, WebM | Frame count (81 of 90), 9 sampled frames never handed to the encoder, 72 strict mismatches | 1 |
| 8 | Reverse the frame order | `linear-motion`, MP4 | Nearest-neighbour: 38 strict mismatches, 34 ties excluding *k* (and, since R47, not masked by an MP4 byte gate that failed every run) | 1 |

The unmutated control on the same fixture exited 0 in both containers.

**Net for criterion 3: every decoded frame of the primary fixture
(`linear-motion.marey`) has a unique nearest reference and it is itself —
in both containers, at 24, 30 and 60 fps, at 800×600, 1920×1080 and
1080×1920, measured after the fix wave on the pipeline the export button
runs. The former primary fixture's frames 0–2 carry no discriminating power,
and its one tie excluding *k* now fails the run. The check is proven capable
of failing by Task 3's five faults (injected into the former copy, cited)
and by three faults injected into the shipped orchestration after the wave,
each caught by the mechanism the design predicts — so a clean run is
evidence, not a check that cannot fail.**

---

## Looking at the output — decoded PNGs, read and described

Per design §10.4: numbers are not a substitute for looking. The harness
writes decoded frames to disk; the images below were opened with the Read
tool, not inferred from the numeric checks above. Phase 4 shipped blank
PNGs that hashed consistently; Phase 5A shipped a frame a draft described as
"rotated off-axis" when the image showed it near-upright. Every row below
describes what the pixels actually show.

### `compound-logo.marey` (WebM), the richer scene — `decoded_0000.png`, a mid-motion frame, and the last frame

| Frame (index, t) | What is actually visible |
|---|---|
| `decoded_0000.png` (0, t=0s) | A three-bar mark — a vertical blue (`#38bdf8`) bar and two amber (`#fbbf24`) horizontal bars branching off its right side, forming an "F" shape — near the top-left of an 800×600 dark navy canvas. The mark is tilted a modest amount counter-clockwise from vertical, consistent with the scene's declared `rotation: -14` start. |
| `decoded_0060.png` (60, t=2.0s, genuinely mid-motion) | The same mark, now roughly centred in the canvas — lower and more to the right than frame 0 — at a visibly different tilt than either frame 0 or the settled pose below. Clearly a distinct pose from both neighbours, i.e. real interpolated/simulated motion between them, not a frozen or repeated frame. |
| `decoded_0120.png` (120, t=4.0s) | The mark now rests near the bottom-right of the canvas in a "table" orientation — a horizontal blue bar on top with two amber legs hanging straight down — visually indistinguishable from the last frame below. |
| `decoded_0239.png` (239, t=7.967s, last frame) | The same "table" pose in the same bottom-right position as `decoded_0120.png`. No visible difference between this frame and frame 120, despite being 119 frames (≈4 seconds) apart. |

**Frame 120 (t=4.0s) already looks settled, well before the scene's own
comment's claimed 5.5s.** This is a direct visual confirmation of the
criterion-3 secondary observation above: the frame-131 (t=4.37s) near-tie
sits inside a stretch where the mark has visibly stopped moving a full
second and a half before the point the scene's author believed it came to
rest. Nothing here contradicts criterion 1 or 3's numeric results — the
mark genuinely animates in, falls, tumbles and settles, and no frame in this
row is blank or a solid background colour — but it does confirm this scene
was the wrong fixture for criterion 3's dropped/duplicated/reordered check
specifically, which is why R20 routes that check to `freeze-midair.marey`
instead.

### `freeze-midair.marey` (WebM), the continuous-motion fixture — same three positions

| Frame (index, t) | What is actually visible |
|---|---|
| `decoded_0000.png` (0, t=0s) | A single light-blue (`#38bdf8`) square, roughly centred horizontally, sitting near the top of an 800×600 near-black canvas — matching the scene's declared `position: (400,100)`, `size: (52,52)`. |
| `decoded_0007.png` (7, t=0.233s, mid-fall) | The same square, now visibly lower on the canvas than frame 0 (still same horizontal position, falling straight down under gravity, no bounce or lateral drift). A faint, very low-contrast grey smear is visible directly above the square in this frame — a compression artefact from VP9 encoding a hard-edged, fast-moving block against a flat background, not a second object or a ghost frame. |
| `decoded_0014.png` (14, t=0.467s, last frame) | The same square, further down again than frame 7, continuing the same straight downward trajectory. The same faint smear artefact is visible above it, slightly more pronounced. |

The square's vertical position is visibly different in all three frames and
descends monotonically frame to frame — consistent with continuous free
fall and with this fixture's zero strict mismatches above. The faint
above-square artefact in frames 7 and 14 is named rather than smoothed over:
it is consistent with lossy-codec block noise trailing a fast, high-contrast
moving edge, not with a dropped or duplicated frame (nearest-neighbour would
have flagged either).

None of the six images above is blank or a flat solid colour, and within
each triple the three frames are visibly distinct from one another — ruling
out Phase 4's blank-PNG failure mode and a frozen/stuck export on both
fixtures.

### After the fix wave — `linear-motion.marey`, and the portrait 1080×1920 MP4

| Frame | What is actually visible |
|---|---|
| `fw/i4-lin-webm/decoded_0000.png` (0, t=0s) | A light-blue square at the left edge, vertically centred (spanning about x 20–180, y 220–380), and a pink disc at the top centre (about (400, 60)), on the near-black background — the scene's declared start positions. |
| `fw/i4-lin-webm/decoded_0089.png` (89, t=2.967s, last frame) | The square near the right edge (about x 613–773), same height; the disc near the bottom centre (about (400, 535)). Both match `start + (end − start) × 2.967/3` for the declared linear motion. No smear or ghost visible. |
| `fw/i2-portrait-mp4/decoded_0045.png` (45, t=1.5s, 1080×1920) | The square and the disc both at the canvas centre (540, 960), the disc drawn over the square, halfway along both paths as expected at the midpoint. Some faint H.264 block noise is visible inside the disc and at the square's top-right; not a second object or a ghost frame. |

---

## Known limitations

Facts this document's three exit criteria do not cover, stated with the
hedge each measurement attached rather than upgraded or rounded off. The
first four bullets were measured or changed by the fix wave; the two after
them are carried forward from Task 6 unchanged; the last was filed by the
fix wave's scoped re-review.

- **Memory: the old ceiling was the eager path's, and the lazy path reaches
  `MAX_EXPORT_FRAMES` (re-measured in the fix wave, R45/R51).** Task 4
  (`task-4-report.md`, Q4) measured 4,800 frames succeeding and 6,000
  failing **at 800×600**, when every frame's canvas was held in memory at
  once (`frames.map(rasterize)`, about 1.9 MB each). The fix wave
  rasterizes one frame at a time inside the encode loop and releases each
  canvas once the encoder has copied it. Measured after that change, through
  the shipped `runVideoExport` imported into the page from the dev server,
  headless Chromium with SwiftShader, on this 16 GB machine, MP4, 30 fps:
  - **7,200 frames at 800×600** (240 s, `MAX_EXPORT_FRAMES`): completed in
    160.4 s; 1,322,852 bytes; `usedJSHeapSize` 91.7 MB afterwards.
  - **1,800 frames at 1920×1080** (60 s): completed in 78.8 s; 3,140,920
    bytes; `usedJSHeapSize` 123 MB afterwards.

  Both files were checked by parsing the container (an ISOBMFF walk written
  for this, independent of mediabunny): `stsz` sample count 7,200 and 1,800,
  `stts` one entry of that many samples, `mdhd` timescale 30 with duration
  7,200 and 1,800, and `stss` 240 and 60 sync samples (one every 30
  frames). They were **not** decode-compared frame by frame. These are two
  runs on one machine in a headless, software-rendered browser; they show
  the eager bracket no longer applies, not that no memory limit exists on
  other machines, at larger sizes, or in a real browser tab.
  `MAX_EXPORT_FRAMES` is unchanged (GC7, R23).
- **The first ~0.75 s of an export still blocks the page, measured.** With
  the reviewer's method (a `requestAnimationFrame` probe recording the
  longest main-thread gap, plus time to the first progress tick; headless
  Chromium with SwiftShader, WebM, 30 fps), before and after the fix wave:

  | Scene | Frames | ms to first progress tick | ms total | Longest gap, ms |
  |---|---|---|---|---|
  | `compound-logo` before | 240 | 7,651 | 9,592 | 4,386 |
  | `compound-logo` after | 240 | 1,073 | 6,737 | 727 |
  | 30 s linear box before | 900 | 17,183 | 22,018 | 14,063 |
  | 30 s linear box after | 900 | 1,085 | 22,087 | 749 |

  Observer timestamps put the end of compile, plans and the codec probe at
  about 43 ms and the end of sampling (including Pixi's `app.init`) at
  260–290 ms, so the remaining gap is between sampling and the first encoded
  frame, not in `sampleFrames` (frozen by GC7). The loop yields to the event
  loop every 100 ms of work; yielding every 16 ms doubled the 900-frame
  total (43.7 s) with no smaller gap, because each yield also repaints the
  app's live preview.
- **MP4 export tops out at H.264 level 5.1.** The level table is Rec. ITU-T
  H.264 (03/2010), the edition that could be retrieved, which ends at 5.1
  (36,864 macroblocks per frame, 983,040 per second). Levels 5.2 and 6.x,
  from later editions, are not in the table, so a scene beyond 5.1 (for
  example 4096×2304 at 30 fps, or anything near 8K) is refused with
  `VIDEO_EXCEEDS_CODEC_LEVELS` even where the browser might encode it. WebM
  goes to VP9 level 6.2.
- **The MP4 codec string's constraint byte is a request, not a description
  (M-8, disclosed residual).** The string carries constraint flags `00`; the
  emitted `avcC` carries `0xC0` (Constrained Baseline), which the encoder
  decides. Kept so that 800×600 at 30 fps selects `avc1.42001f`, the string
  the pre-wave MP4 evidence was measured with. The level in the string and
  in the stream agree at the 30 and 60 fps configurations measured, but not
  at 800×600 and 120 fps, where the stream under-declares (3.2 against the
  string's 4.0): the H.264 encoder writes its own level (criterion 1).
- **Q5 (whether `hardwareAcceleration: "prefer-software"` genuinely excludes
  a real hardware encoder) is narrowed, not answered.** Spec §7.5's dated
  correction, preserved here rather than restated more strongly: this
  development machine has two GPUs (an NVIDIA RTX 3060 Laptop GPU and an
  Intel Iris Xe Graphics), **measured** via `Get-CimInstance
  Win32_VideoController`, which reports installed GPU model names — nothing
  about encoder capability. That those specific models ship hardware video
  encoders (NVENC, Quick Sync) is general knowledge about those product
  lines, **inferred** from the model names, not independently measured on
  this unit. Separately, and more durably: every measurement in this
  document (and every measurement `video-check.mjs` will ever produce) runs
  headless Chromium launched with explicit software-rendering flags
  (`--use-angle=swiftshader`, `--enable-unsafe-swiftshader`,
  `--use-gl=angle`). This document's determinism claims are therefore about
  this project's own software-rendering-forced test harness on one machine
  — not a claim about what `prefer-software` does in an ordinary user's
  browser session, where a real hardware encoder may be reachable and where
  non-reproducibility (if `prefer-software` turns out to be an unenforced
  hint on some Chromium build) would not be caught by this harness,
  structurally, no matter how many times it is run.
- **The export button needs a scene-level `duration:`.** Rulings R27 and
  R39 (`progress.md`): the button passes no export bound, so a scene without
  a top-level `duration:` gets the verbatim `EXPORT_UNBOUNDED_SCENE`
  diagnostic instead of a file, and that message's advice to "pass an
  explicit export bound" is something the UI gives no way to do. **The
  first-run case R27 found is fixed**: the shipped default scene declared no
  `duration:`, so a first-time visitor's first export click failed (confirmed
  against the production build in Task 5). The smiling-face default that
  replaced it declares `duration: 6`; `defaultScene.test.ts` fails if it
  stops being exportable, and its export was decoded back through
  `video-check.mjs` at 30 fps, 180/180 frames strict with no ties in both
  containers and WebM byte-identical across cold runs. The general case, a
  length control beside the export buttons and a reworded message (which
  lives in the GC7-frozen `exportContract.ts`), is deferred to the next UI
  phase by the project owner's decision.
- **The criterion-3 check has a window, not an absolute threshold.** Each
  decoded frame *k* is compared only with reference frames *k−2..k+2*, and
  passes if *k* is uniquely nearest among those five. Nothing checks how
  near. Far displacements *were* injected and caught: reversing the loop
  and dropping every 10th frame both move most frames well outside their
  window. They were caught because the fixtures move monotonically, so
  distance grows with index difference and a far-displaced frame lands
  nearest to an end of the window rather than to *k*. On content that is not
  monotone in time, such as periodic motion or a frame equally unlike all
  five candidates, a single far-displaced frame could come out nearest to
  *k* by chance and pass. No such fixture was run. This predates the fix
  wave and was filed by its scoped re-review, not fixed.

---

## The resolved encoder configuration (spec §5, recorded since the fix wave)

Spec §5 requires the resolved encoder configuration to be recorded in the
evidence through mediabunny's `onEncoderConfig` callback (finding M-2: it had
been dropped silently). `video-check.mjs` now writes it to `report.json` as
`runA.encoderConfigs` / `runB.encoderConfigs`. mediabunny calls the hook once
per candidate configuration before `isConfigSupported` selects one; with a
numeric bitrate there is one candidate, and every post-wave run recorded
exactly one. As recorded (`fw/i2-lin-mp4-30`, 800×600 MP4 at 30 fps):

```json
{"codec":"avc1.42001f","width":800,"height":600,"displayWidth":800,"displayHeight":600,
 "bitrate":8000000,"bitrateMode":"constant","alpha":"discard","framerate":30,
 "latencyMode":"quality","hardwareAcceleration":"prefer-software","avc":{"format":"avc"}}
```

The WebM runs record the same fields without `avc`, with `codec`
`vp09.00.31.08` (800×600) or `vp09.00.40.08` (1920×1080); the other rows
of criterion 1's post-wave table record the codec strings listed there. What
reaches mediabunny is also pinned headlessly now: `videoSourceConfig` and
`videoOutputFormatOptions` (`videoContract.ts`) build the source config,
including the keyframe interval converted from frames to mediabunny's
seconds, and `videoEncode.test.ts` checks, with mediabunny mocked, that
`encodeVideo` passes them on unchanged (finding I-3).

---

## Environment

Dev server: `npx vite --port 5199 --strictPort`, started before any harness
command above, killed at the end of this task. Port checked free both
before starting and after killing, boundary-matched (a bare `:5199` also
matches `:51999`):

```bash
netstat -ano | grep "LISTENING" | grep -E ":5199[^0-9]"
```

Baseline reconfirmed on this tree at the start of this task and again at
the end: `npx vitest run` → **33 files / 862 tests**, exit 0. `npx tsc -b
--noEmit` → exit 0. This task made no changes to `src/` or
`tools/visual-check/video-check.mjs` in its final committed state
— one temporary diagnostic line was added to `video-check.mjs` to write
both cold runs' MP4 bytes to disk for the byte-level divergence analysis in
criterion 2, and removed immediately after use, confirmed by `git diff
--stat -- tools/visual-check/video-check.mjs` returning empty
before this document's commits landed.

`.visual-check/` (all harness output from this task's runs, including the
temporary diagnostic pair) is gitignored (`.gitignore:31`) and is not part
of this task's commits.

Commits this task produced, in order:
- `93547df` — `docs(5b): exit-criteria evidence, criterion 1 (WIP)`
- `7c29c9b` — `docs(5b): exit-criteria evidence, criterion 2 (WIP)`
- `45d6cac` — `docs(5b): exit-criteria evidence, criterion 3 (WIP)`
- `2418053` — `docs(5b): exit-criteria evidence, Step 4 image descriptions (WIP)`
- `b5450c2` — `docs(5b): exit-criteria evidence` (limitations + environment sections)
- `b98d5fa` — `docs(5b): fix the commit-list placeholder in the evidence document`
- `96ff606` — `docs(5b): fix round 1 -- disclose the measured path, fix offset claims`
  (review round 1: adds the "which code path was measured" disclosure before
  the criteria, corrects the timestamp-offset/spec-table comparison error,
  hedges the `stsd`/`stsz` offsets, and splits the `ftyp`/`moov` region
  table row to match the measurement)
- **Fix wave (after the whole-branch review):** `c7c491c` (encoder config,
  R44), `96c6880` (codec level per plan, R43), `f299286` (one orchestration,
  lazy rasterization, early probe, R45), `584d208` (tie gate and
  `linear-motion.marey`, R46), `cf89027` (MP4 bytes reported not gated,
  R47), `7662361` (guard docs, R48), `41dc2ad` (lazy-chunk guard, R49),
  `f27522c` (mediabunny pinned, R50), then this document's own fix-wave
  commits. Post-wave harness runs used `npx vite --port 5199 --strictPort`,
  port checked free before starting and after killing, and wrote to the
  gitignored `.visual-check/video/fw/`. Post-wave suite: 34 files / 910
  tests.
- this list cannot cite the commit that contains it — see the entry above
  for how that constraint is handled generally; `git log --oneline` on this
  branch shows the true, complete list including whatever lands after this
  line
