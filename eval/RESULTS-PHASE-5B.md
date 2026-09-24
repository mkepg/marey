# Phase 5B evidence — the three exit criteria

**Date:** 2026-09-24, Phase 5B Task 6. Branch `phase-5b-video`, BASE/HEAD
`92cc9bc`. Every command below was run against this exact tree today — see
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

**Fixture choice (R20).** Criterion 3 uses
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
reconfirmed again at the end unchanged.

---

## Which code path was actually measured, and which one a user's click takes

Every number in the three sections below was produced through the dev-only
harness seam: `window.__mareyExportVideo` → `src/lib/devVideoSeam.ts`'s
`exportVideo`, called by `video-check.mjs`. **That is not the path a real
export click takes.** Read directly, not summarized secondhand: a click on
`TopBar.tsx`'s MP4/WebM buttons calls `handleExportClick`
(`TopBar.tsx:137-138`, `void exportVideo(container)`), which is
`useExportVideo.ts`'s hook, which dynamically `import()`s
`src/compiler/export/videoPipeline.ts` and calls its `runVideoExport`.
`devVideoSeam.ts` and `videoPipeline.ts` are two separate files; neither
imports the other.

**What the two paths share.** `devVideoSeam.ts`'s `exportVideo` and
`videoPipeline.ts`'s `runVideoExport` call the identical sequence of
lower-level primitives — the same functions, from the same modules, not
two separate implementations of them: `compileSource` → `planExport` →
`planVideo` → `new Application()` with a byte-for-byte identical
`app.init({...})` options object (`width`, `height`, `background`,
`backgroundAlpha: 1`, `antialias: true`, `resolution: 1`,
`autoDensity: false`, `autoStart: false` — compared line by line between
the two files) → `buildNode` per child → `MatterWorld` + `SceneRuntime` →
`sampleFrames` → `createFrameRasterizer` → `.map(rasterize)` →
`encodeVideo`, with the identical `canvases as unknown as
CanvasImageSource[]` cast at the identical point. `videoPipeline.ts`'s own
docstring states the relationship plainly: its call sequence "and the
try/finally teardown shape are read directly from `devVideoSeam.ts`'s
`exportVideo`... and reproduced here, not imported." The sampling,
rasterization and encoding engine this document's numbers exercise is the
same code the shipped button calls, not a harness-only stand-in for it.

**Where they diverge.** `runVideoExport` is narrower on purpose: it skips
`hashFrames`, per-frame reference-PNG re-extraction, and base64 encoding —
all exist only for the harness's frame comparison and would cost a real
user time and memory for nothing — and returns the raw `Uint8Array`
container bytes directly. It also threads an `onProgress` callback into
`encodeVideo` (`videoEncode.ts:70-73`; confirmed by reading the signature:
a pure per-frame side channel, invoked as `onProgress?.(index,
plan.frameCount)`, that does not alter the encoder configuration) which
`devVideoSeam.ts`'s call omits, and it throws diagnostic messages verbatim
where `devVideoSeam.ts` prefixes its own rethrow with `[export] ` (a
harness-log convention, never seen by a user). None of these differences
touch the compile/plan/sample/rasterize/encode call itself.

**What guards the two from drifting apart, and what does not — checked
against `exportBoundary.test.ts` directly, not assumed.** That file asserts
two things about this relationship: that `videoPipeline.ts`,
`useExportVideo.ts` and `TopBar.tsx` never import `devVideoSeam.ts` in any
form, and separately that none of the three ever reaches
`window.__mareyExportVideo` (a substring check over comment-stripped
source, since a global property read leaves no import statement for the
first check to see). **This is an import-boundary and reachability guard,
not a behavioural-equivalence guard.** Nothing in the test suite compares
the two orchestration functions' call sequences, options objects, or output
bytes against each other, and nothing would fail if they were edited to
diverge — a different `app.init` option, a different call order — so long
as neither file starts importing the other. Today the two are kept in sync
by being hand-written from one another (each docstring says so explicitly)
and by both calling the same underlying primitive functions, not by any
mechanical check that would catch a future edit to one and not the other.

**What this does and does not mean for the evidence below.** The part that
actually determines the emitted bytes — sampling, rasterization, encoding —
is the exact code the export button calls, so the measurements in this
document are evidence about the real encoder path, not a separate one. What
is *not* covered here is the thin orchestration layer around it and the UI
above it. Those were exercised differently, and earlier: Task 5
(`task-5-report.md`) drove a real production build and a real click,
confirming correct `scene.mp4`/`scene.webm` downloads (right magic bytes)
and a correctly-verbatim failure toast — but, by ruling R22
(`progress.md`: "scoped to the download plumbing only... not evidence of
frame fidelity"), it never read a pixel or decoded a file. So: the button
is verified to reach the encoder and produce a plausible file (Task 5), and
the encoder itself is verified frame-accurate (this document) — but no
single measurement in this phase decodes a file produced by an actual
button click. The two verifications are complementary, not redundant, and
neither substitutes for the other.

---

## Criterion 1 — exports to WebM and MP4 at the requested frame rate and duration

Per design §10.1, every number below is read from the **decoded file's own**
metadata (frame count, dimensions, per-frame timestamps from a real
`VideoDecoder`), not from what was requested — the harness decodes the
container back inside a real browser page rather than trusting the encoder's
own claim about what it wrote.

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

**Net: criterion 1 holds for both containers**, measured from three
independent harness invocations (two scenes, both containers), reading the
decoded file's own metadata rather than the request.

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
masking applied or needed (`--mask-mp4-times` has no effect on WebM; the
harness's own header comment documents that mediabunny's WebM/Matroska
muxer path contains no wall-clock or random field this scene shape can
trigger). This is measured evidence of byte-identity, not merely the
absence of a counter-example: two full independent invocations, two
different scenes, one of them at 240 frames.

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

**Net for criterion 2: WebM satisfies the first branch (byte-identical,
measured twice on two different scenes). MP4 satisfies the second branch —
not byte-identical, with the reason documented at the encoder boundary: the
renderer is exonerated by direct, repeated measurement (bit-identical
reference frames in all three runs), the six spec-named timestamp fields
account for a negligible fraction of the actual divergence, and the
remainder is inside the compressed bitstream and its mechanical metadata
derivatives — attributed to the encoder side and no further.**

---

## Criterion 3 — no frame dropped, duplicated or reordered, relative to the sampler's output

Per R20, the primary fixture is `freeze-midair.marey` (continuous free-fall
for its whole exported window, never settles), not `compound-logo.marey`
(its own comment: "the mark comes to rest at 5.5s, so the last 2.5s are
genuinely settled frames" — `eval/scenes-3b/compound-logo.marey:30-31`).
The check (design §10.2): for each decoded frame *k*, compute a distance to
sampler reference frames *k−2..k+2* and require the minimum to be uniquely
achieved by *k* itself (`strict`); when two or more candidates tie for the
minimum the match is `tie`, reported but never gated. This positional check
is used instead of pixel equality because both codecs are lossy — a
dropped, duplicated or reordered frame makes a decoded frame resemble a
*neighbour* more than itself, which survives lossy compression; exact pixel
equality would not, structurally, regardless of correctness.

### Primary fixture — `freeze-midair.marey`, continuous motion throughout

Both runs above (Criterion 1/2 sections) already produced this criterion's
numbers; restated here as criterion 3 evidence specifically:

| Run | Strict | Tie | Strict mismatches | Max off-diagonal margin | Min margin among strict matches |
|---|---|---|---|---|---|
| WebM (`t6-freeze-webm`) | 12 | 3 | **0** | 0.5187 | 0.0922 |
| MP4 (`t6-freeze-mp4`) | 13 | 2 | **0** | 0.5201 | 0.0248 |

Zero strict mismatches in both containers: every decoded frame's uniquely-best
match among its neighbours is itself. 3/15 (WebM) and 2/15 (MP4) frames tied
even though this scene never settles within the exported 0.5s window — this
is the same behaviour Task 3's informal smoke test on this fixture noted
("evidence the `step=4` downsampled distance can tie on genuinely-moving
content too, not only on a settled scene"), reproduced independently here:
ties are not exclusively a symptom of a static scene, and this harness
correctly reports them as ties rather than folding them into either a pass
or a failure.

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

**Net for criterion 3: zero strict mismatches on the continuously-moving
primary fixture, in both containers, measured today. The check itself is
proven capable of failing by five independently-caught injected faults
(cited from Task 3, not re-run here), each caught by the specific
mechanism the design predicts — frame count, nearest-neighbour, the
timestamp schedule, or the simulation-hash gate — so a clean run on the
primary fixture is evidence, not a check that cannot fail.**

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

---

## Known limitations carried forward, not re-measured by this task

Facts established in earlier Phase 5B tasks that this document's three exit
criteria do not cover, stated with the hedge each earlier task attached
rather than upgraded or rounded off:

- **A memory ceiling exists somewhere between 4,800 and 6,000 frames, on
  this 16GB machine, and it is a bracket, not a pinned value.** Task 4
  (`task-4-report.md`, Q4) measured 4,800 frames succeeding and 6,000
  failing through the real export seam. `MAX_EXPORT_FRAMES` (`7_200`,
  `src/compiler/export/exportContract.ts:64`) does not protect this bound —
  a scene requesting frames above the working bracket but below 7,200 can
  still fail. **Out-of-memory is a credible but unconfirmed explanation**:
  Playwright's `page.on("crash")` never fired during Task 4's failing run,
  so no actual crash event was observed, only the failure itself. Ruling
  R23 (`progress.md`) deliberately left `MAX_EXPORT_FRAMES` unchanged — the
  constant lives in the Phase 4 boundary Global Constraint 7 freezes, and a
  ceiling derived from one machine's RAM would be a magic number wrong on
  every other machine. Not re-measured by this task.
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
- **A first visitor's first export click fails.** Ruling R27 (`progress.md`):
  the app's shipped default scene declares no `duration:`, so a first-time
  visitor clicking the export button before editing anything gets the
  verbatim `EXPORT_UNBOUNDED_SCENE` diagnostic rather than a file. Confirmed
  against the production build in Task 5. This was ruled not a correctness
  defect (an honest, human-readable diagnostic rather than a crash or
  silent failure) and not fixed in this phase — changing the shipped
  default scene is a product decision outside an unattended execution's
  authority. Named here as known first-run behaviour, not re-tested by this
  task (this task uses the dev seam, `window.__mareyExportVideo`, which
  takes an explicit scene source and does not go through the default-scene
  UI path at all).

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
- one further commit, fixing this list's last entry to a real SHA rather than
  a guess — per AGENT-LESSONS §1, a commit cannot cite its own hash, so that
  final entry is deliberately left off rather than filled with a placeholder
  (`git log --oneline` on this branch shows the true, complete list)
