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
(`t6-mp4-diag`, runA 7298 bytes / runB 7297 bytes).** The ISOBMFF box tree
of this export is `ftyp`(0–28) → `moov`(28–766, containing `mvhd`, `trak` →
`tkhd`, `mdia` → `mdhd`/`hdlr`/`minf` → `vmhd`/`dinf`/`stbl` →
`stsd`/`stts`/`stsc`/`stsz`/`stco`/`stss`) → `mdat`(766–end). Comparing the
7297 overlapping bytes:

| Region | Differing bytes | Share of region |
|---|---|---|
| `ftyp` + `moov` (bytes 0–765) | 12 | 12/766 ≈ 1.6% |
| `mdat` (bytes 766–7296) | 4405 | 4405/6531 ≈ 67.45% |
| **Total overlapping** | **4417** | **4417/7297 ≈ 60.53%** |

Of the 12 differing bytes inside `moov`: **6 are exactly the harness's own
computed timestamp-field ranges** — `mvhd`/`tkhd`/`mdhd` `creation_time` and
`modification_time`, located by `findMp4TimestampRanges` walking this
specific file's box tree at offsets 48/52, 164/168, 264/268 (not the spec
§7.2 table's static offsets of 51/55, 167/171, 267/271 — this file's box
sizes differ slightly from whatever produced that table, which is exactly
why the harness parses the box tree instead of trusting fixed offsets).
Masking these six — the only masking `--mask-mp4-times` performs — is
necessary but nowhere near sufficient: it accounts for 6 of 4417 differing
bytes, 0.14% of the total divergence.

**The other 6 `moov` bytes are new evidence beyond what Task 3's report
measured**, which described the divergence as confined to `mdat` alone.
Located precisely: offsets 589 and 593 fall inside `stsd` (419–594, the
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
