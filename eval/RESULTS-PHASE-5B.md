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
