# Phase 5B — Video: design

**Status:** design, awaiting review.
**Roadmap:** `2026-09-09-marey-engineering-roadmap-design.md` §8.
**Predecessors:** Phase 4 (frame sampler, export contract), Phase 5A (baked
Lottie — the encoder-boundary precedent this phase follows).

---

## 1. Goal

Emit WebM and MP4 from a Marey scene through **WebCodecs and a muxer**, at the
requested frame rate and duration, such that roadmap §8.1's three exit criteria
are provable rather than asserted:

1. A scene exports to WebM and MP4 at the requested frame rate and duration.
2. Repeated exports of the same scene are byte-identical, or the reason they
   cannot be is documented at the encoder boundary.
3. No frame is dropped or duplicated relative to the sampler's output.

`MediaRecorder` is excluded by the roadmap, because its real-time capture can
drop frames. GIF and SVG/SMIL remain out of scope.

**The failure mode this design is built against** is not a crash. It is a video
that plays, looks plausible, and has dropped, duplicated or reordered frames —
or was silently re-encoded at a rate nobody asked for. Phase 4's headline
failure was a blank image reported as success; Phase 5A's was a Lottie file that
parsed, played, and showed the wrong thing. "The file plays" is not evidence
here, and §10 is written accordingly.

---

## 2. What is already settled by measurement

Everything in this section was measured on this machine on **2026-09-18**,
before this document was written, with throwaway probes that were deleted after
use. Values may be relied on; a discrepancy during execution is a finding worth
reporting loudly, because it means something changed underneath.

| # | Question | Answer | How |
|---|---|---|---|
| M1 | Is WebCodecs available in the harness browser? | Yes — `VideoEncoder`, `VideoDecoder`, `VideoFrame`, `EncodedVideoChunk` | Probe in Playwright's bundled Chromium 151 |
| M2 | Which codecs encode **and** decode? | H.264 (baseline/main/high), VP8, VP9, AV1 — all `supported: true` both directions | `VideoEncoder.isConfigSupported` + `VideoDecoder.isConfigSupported` |
| M3 | Is the encoded bitstream reproducible? | **Byte-identical across three cold browser launches** | Same 24 synthetic frames, concatenated chunk bytes hashed |
| M4 | Does encoder configuration change the bytes? | **Yes.** `hardwareAcceleration: "prefer-software"` and the default produce different bitstreams | Same probe, differing hashes |
| M5 | Does mediabunny round-trip? | Yes, both containers: 30 frames in → 30 out, order preserved, timestamps strictly increasing | `Output`→`BufferTarget`→`Input`→`VideoSampleSink` |
| M6 | Is WebM byte-identical across two encodes? | **Yes** | Two encodes in one session, full byte compare |
| M7 | Is MP4 byte-identical across two encodes? | **No — exactly 6 bytes differ** (see §7) | Two encodes 1.5 s apart, full byte compare + box-tree walk |
| M8 | Can every encoder input be pinned? | Yes — `fullCodecString`, `bitrateMode`, `latencyMode`, `hardwareAcceleration`, `keyFrameInterval` are all settable | `VideoEncodingConfig` / `VideoEncodingAdditionalOptions` in mediabunny's `.d.ts` |

### 2.1 One trap worth naming, because it produced a confident false negative

**WebCodecs is `SecureContext`-gated.** On `about:blank`, `VideoEncoder` and
`VideoDecoder` are `undefined` while `VideoFrame` is present — which reads
exactly like "this browser does not support WebCodecs". Over `http://localhost`
(a secure context) all four are present. The first probe run for this phase drew
the wrong conclusion for this reason and was only caught by re-probing over a
real origin.

This is why §8 specifies a named `VIDEO_NO_WEBCODECS` diagnostic rather than
letting an absent API surface as a `TypeError`: the same trap will otherwise
reach a user as a Marey bug.

---

## 3. Architecture

### 3.1 Start from the existing seam

Phase 4 established `FrameSnapshot` / `SamplerPlan` as the encoder boundary, and
Phase 5A consumed it **without modification**. This phase does the same.
`sceneIR.ts`, `frameSampler.ts` and `exportContract.ts` are not edited.

A second sampling path is explicitly rejected. Beyond duplicating the tick/paint
discipline, it would make exit criterion 3 unverifiable *by construction* —
"no frame dropped relative to the sampler's output" needs the sampler's output to
exist as the thing compared against.

### 3.2 Modules

| File | Responsibility | Imports pixi? | Headlessly testable? |
|---|---|---|---|
| `src/compiler/export/videoContract.ts` | `VIDEO_*` diagnostics, codec/config resolution, timestamp math, `VideoPlan` | **No** | **Fully** |
| `src/compiler/export/frameRaster.ts` | Shared per-frame replay + canvas extraction, lifted out of `pngSequence.ts` | Yes | Partly (id-agreement check) |
| `src/compiler/export/videoEncode.ts` | WebCodecs + mediabunny glue | **No** | **No** — see §3.4 |
| `src/lib/devVideoSeam.ts` | Dev-only `window.__mareyExportVideo` | Yes | No |
| `src/components/TopBar/…` + store | The export control | Yes | Store action only |
| `tools/visual-check/video-check.mjs` | Emit, decode back, compare, report | n/a | n/a |

### 3.3 The two structural rules

Following Phase 5A's precedent, each module carries one rule, and both are
checkable with a grep rather than an argument:

- **`videoContract.ts` must not import `pixi.js`** in any form. It is pure
  request-validation and arithmetic.
- **`videoEncode.ts` must not import `sceneIR` or `pixi.js`** in any form. It
  receives a `VideoPlan` and a sequence of `CanvasImageSource`, and has no way to
  reach the scene graph or the IR.

**Which mediabunny source class, and why it is not the obvious one.** The
probe in §2 used `CanvasSource`, which wraps **one** canvas and re-reads its
current contents on each `add()`. That does not fit here: `extract.canvas()`
returns a **new** canvas per frame, so a single wrapped canvas would either
need every frame blitted onto it — an extra full-frame copy per frame, and a
second place for the size decision to drift — or would silently encode the same
canvas repeatedly. `VideoSampleSource` is the correct class: it takes a
`VideoSample` per call, and `VideoSample` accepts any `CanvasImageSource` with
an explicit timestamp. Verified against mediabunny's type declarations, not
assumed from the probe.

A violation is a defect even if every test passes.

### 3.4 The honest limitation: `videoEncode.ts` cannot be unit-tested

Vitest runs in Node, which has no WebCodecs. `videoEncode.ts` therefore has **no
headless tests**, and no amount of design removes that.

What the design does instead is push everything testable *out* of it:

- frame-index → timestamp arithmetic → `videoContract.ts`
- codec string and encoder-config construction → `videoContract.ts`
- every refusal and its message → `videoContract.ts`
- the tree/frames id-agreement check → `frameRaster.ts`

leaving `videoEncode.ts` as thin orchestration whose correctness is established
by §10's decode-back harness. This is stated here rather than discovered during
execution, and the plan must not pretend otherwise. Per AGENT-LESSONS §2f, "this
cannot be unit-tested, and here is what covers it instead" is the required
shape of that answer.

### 3.5 Why `frameRaster.ts` is an extraction rather than a copy

`encodePngSequence` already does, per frame: `applySnapshot(root, frame)` →
`renderer.extract.canvas({ target, frame: region, resolution: 1, clearColor,
antialias: true })`. Video needs exactly that, then wraps the canvas in a
`VideoSample` instead of reading PNG bytes.

Those extraction arguments encode real decisions — that the output is the
scene's logical size and not the preview's `devicePixelRatio`, that `fit`
letterboxing is bypassed, that the background comes from the `Application`. If
PNG and video each carried their own copy, the two exporters could silently
disagree about the size or background of the same scene. That is precisely the
hand-synced-list failure AGENT-LESSONS §5 records twice. One function, two
callers.

The id-agreement precheck (`encodePngSequence`'s "tree and frames disagree about
which objects exist") moves with it, because it guards a property video needs
identically.

---

## 4. The frame path

```
source ──compileSource──▶ IR ──planExport──▶ SamplerPlan      (Phase 4, unchanged)
                           │
                     buildNode ▶ root
                           │
                    sampleFrames(runtime, root, plan) ──▶ FrameSnapshot[]
                           │
                    frameRaster: per frame, applySnapshot + extract.canvas
                           │
        videoEncode: VideoSample ──▶ VideoSampleSource ──▶ muxer
                           │
                           ▼
                     Uint8Array (.mp4 / .webm)
```

Sampling completes before encoding begins, exactly as `devExportSeam.ts` does it
today — `encodePngSequence` never sees the runtime, so the two phases cannot
interleave even by mistake. `videoEncode.ts` inherits that property by receiving
no runtime either.

---

## 5. Encoder configuration, and why every field is pinned

M4 measured that the configuration changes the emitted bytes. So the config is
written out explicitly rather than left to defaults, and the resolved config is
**recorded in the evidence** via mediabunny's `onEncoderConfig` callback.

| Field | Value | Reason |
|---|---|---|
| `fullCodecString` | `avc1.42001f` (MP4) / `vp09.00.10.08` (WebM) | Pinned rather than inferred. Left to itself mediabunny selected High profile (`avc1.640c14`); baseline is the most broadly playable and, more importantly, must not drift between runs |
| `hardwareAcceleration` | `prefer-software` | M4: this field changes the bitstream. Software is the reproducible choice; a hardware encoder is a property of the machine, not the scene |
| `latencyMode` | `quality` | `realtime` trades bitstream stability for latency, which an offline export has no use for |
| `bitrateMode` | `constant` | Removes rate-controller history as a variable |
| `keyFrameInterval` | explicit | Left implicit it is a muxer default that may change between library versions |
| `bitrate` | explicit, from the request | — |

**This is a judgment call with two plausible answers, so it is pinned by a test**
(AGENT-LESSONS §2d): the plan must include a test that fails if any of these
fields is dropped or changed, because the code looks correct either way and the
consequence — a non-reproducible export — is invisible to every other check.

---

## 6. Timestamps and the frame-exactness contract

`planExport` already guarantees `fps` divides `TICK_HZ` (120) exactly, so every
output frame lands on a simulation tick. What this phase adds is the mapping
from frame index to presentation time.

- Frame *i* is presented at `i / fps` seconds, with duration `1 / fps`.
- mediabunny expresses timestamps in **seconds**, not microseconds:
  `VideoSampleInit.timestamp` is documented as "the presentation timestamp of
  the frame in seconds". The microsecond values below are what the *decoder*
  reports back (`VideoSample.microsecondTimestamp`), which is the side the
  verification reads.

**Measured timestamp behaviour (M5), and a real asymmetry between the two
containers:**

| Container | First five timestamps (µs) at 30 fps |
|---|---|
| MP4 | 0, 33333, 66666, 100000, 133333 |
| WebM | 0, 33000, 67000, 100000, 133000 |

WebM's are **quantised to milliseconds**, because Matroska's default timestamp
scale is 1 ms. The frame *count* and *order* are exact in both; what differs is
presentation-timestamp resolution. This does not accumulate drift — each
timestamp is rounded independently from an exact source — but it is a real
property of the format and belongs in the documentation rather than being
discovered by a reader.

Whether mediabunny exposes a finer Matroska timestamp scale is **open** (§11,
Q1). It is not a blocker: criterion 1 is about frame rate and duration, both of
which survive millisecond quantisation at every rate `planExport` admits.

---

## 7. Determinism: exactly what is and is not byte-identical

Criterion 2 permits either byte-identity or a documented reason. Measurement
gives a precise answer for each container rather than a general disclaimer.

### 7.1 WebM — byte-identical (M6)

Two encodes of the same frames produced identical bytes. No caveat.

### 7.2 MP4 — identical except exactly six bytes (M7)

| Offset | Box | Field |
|---|---|---|
| 51, 55 | `/moov/mvhd` | `creation_time`, `modification_time` |
| 167, 171 | `/moov/trak/tkhd` | `creation_time`, `modification_time` |
| 267, 271 | `/moov/trak/mdia/mdhd` | `creation_time`, `modification_time` |

Each is a 32-bit count of seconds since 1904-01-01, mandated by
ISO/IEC 14496-12. Two encodes 1.5 s apart differed by 2. Decoded, they read
`2026-09-18T02:56:07Z` and `...:09Z`. **Every other byte — the entire H.264
bitstream, every sample table, every other header field — was identical**, at
identical file length.

mediabunny exposes no override for these fields; `MetadataTags` carries a `date`
but that is a metadata tag, not the box header.

### 7.3 The decision, and the option deliberately not taken

**Document, and prove the documentation.** Zeroing those six fields in a
post-mux pass would make MP4 byte-identical too — ISO/IEC 14496-12 permits 0 for
"unknown" — but it requires a hand-rolled MP4 box walker, in this repository, to
gain byte-identity on six bytes of metadata while the *media* is already
bit-exact. That is a parser to maintain and test for no functional benefit, and
it is rejected.

What the evidence does instead is stronger than a prose disclaimer: the harness
compares two exports **with those six byte ranges masked** and asserts that
nothing else differs. That converts "MP4 embeds a creation timestamp" from an
excuse into a checked claim — and it fails loudly if a library upgrade ever
starts varying something else.

### 7.4 Cross-machine identity is not claimed

Phase 4 measured that `Math.sin` differs in its last bit between Node's V8 and
Chromium's, so a trig-bearing scene can bake divergence into its own IR. Video
adds a second, larger source: a different encoder build or a hardware encoder
produces a different bitstream. Determinism is claimed **across runs on one
machine with a pinned configuration**, which is what the criterion asks, and the
limit is stated rather than left to be assumed.

---

## 8. Refusals

Phase 5A's precedent — unsupported input is refused by name, never degraded
silently. Video bakes pixels, so unlike Lottie there is no unsupported
*geometry*; the refusal surface is the request and the environment.

| Code | When |
|---|---|
| `VIDEO_NO_WEBCODECS` | `VideoEncoder` is absent — most often an insecure context (§2.1), not an old browser |
| `VIDEO_UNSUPPORTED_CODEC` | `VideoEncoder.isConfigSupported` returns `supported: false` for the resolved config |
| `VIDEO_ODD_DIMENSIONS` | H.264 4:2:0 requires even width and height; a scene declaring an odd dimension is refused rather than silently cropped or padded |

Frame rate and duration are already covered by `planExport`'s `EXPORT_*`
diagnostics and are not duplicated here (AGENT-LESSONS §5).

**`VIDEO_ODD_DIMENSIONS` is `UNVERIFIED`.** That H.264 4:2:0 requires even
dimensions is a format fact; that *this* encoder rejects rather than silently
adjusts them has not been measured. §11 Q2 requires measuring it before the
diagnostic is written — and per Global Constraint "report what you did not do",
if the encoder turns out to accept odd dimensions cleanly, the correct outcome
is to **not** add the diagnostic and to say so, rather than ship a guard that
cannot fire.

---

## 9. The export control

An export button ships in this phase. This is a **deliberate scope decision, not
drift**: roadmap §9 places `marey export` and UI in Phase 6, and this pulls the
UI half forward at the user's direction. Recorded here so it is visible to
review rather than inferred from a diff.

- A control in `TopBar`, beside Run/Share, following the existing button and
  `useShare`-hook patterns.
- Container choice (WebM / MP4), then encode, then a browser download.
- Errors surface through the existing `Toast`, carrying the `VIDEO_*` or
  `EXPORT_*` message verbatim — the diagnostics are already written to be read
  by a person.
- The export builds **its own `Application`** at the scene's logical size with
  `autoStart: false`, exactly as `devExportSeam.ts` does. It must not reuse or
  disturb the live preview, whose `Application` carries `devicePixelRatio` and
  `fit` scaling. The exported artifact is the scene, not the preview.
- Long exports must not present as a hung tab; progress is reported per frame.

The dev seam (`window.__mareyExportVideo`) exists **as well**, because the
harness must drive the exact pipeline the button drives without automating a
control, and because it is what `marey export` will call in Phase 6.

---

## 10. How each exit criterion is proved

The harness, `video-check.mjs`, emits a real file, **decodes it back**, and
compares against the sampler's own frames. "It plays" is not accepted as
evidence anywhere in this section.

### 10.1 Criterion 1 — exports at the requested frame rate and duration

Decode the emitted file and assert, from the **file's own** metadata and
samples, not from what was requested:

- decoded frame count === `plan.frameCount`;
- track duration === `frameCount / fps` within the container's timestamp
  resolution (§6);
- decoded display dimensions === the scene's declared dimensions.

### 10.2 Criterion 3 — no frame dropped, duplicated or reordered

This cannot be checked by pixel equality: H.264 and VP9 are lossy, and 4:2:0
chroma subsampling alone guarantees the decoded frame differs from the source.
So the check is **positional rather than exact**:

> For each decoded frame *k*, compute a distance to sampler frames
> *k−2 … k+2*. Require `argmin === k`.

A dropped, duplicated or reordered frame makes some decoded frame resemble a
*neighbour* more than itself, which survives lossy compression. This was
validated in miniature during the probe: a marker whose centroid advances ~9 px
per frame rose monotonically across all 30 decoded frames in both containers.

**The known weakness, stated rather than discovered:** a settled physics scene
has near-identical consecutive frames, so `argmin` ties and the test loses power
exactly where motion stops. The test scene must therefore have continuous motion
through its whole duration, and the tie behaviour must be reported, not hidden.
A scene that settles is the wrong fixture for this criterion and the right one
for criterion 2.

### 10.3 Criterion 2 — repeated exports

Export the same scene twice from cold, then:

- WebM: assert full byte equality.
- MP4: assert equality with the six §7.2 byte ranges masked, and assert the
  differing bytes are *only* those ranges.

### 10.4 Looking at the output

Per Phase 4 and 5A, numbers are not a substitute for looking. The harness writes
decoded frames to disk, and the evidence document records frames actually read
with the Read tool — first frame, a mid-motion frame, the last frame — with what
each shows. Phase 4 shipped blank PNGs that hashed consistently; Phase 5A shipped
a Lottie file that played and showed the wrong thing. Both would have passed
every numeric check in §10.1–10.3.

---

## 11. Open questions, to be settled by measurement during execution

No task may treat these as known until measured. Phase 5A's §11 worked this way
and is the reason its Lottie facts are trustworthy.

| # | Question | Why it matters |
|---|---|---|
| Q1 | Does mediabunny expose a Matroska timestamp scale finer than 1 ms? | Decides whether §6's WebM quantisation is a format constraint or a default we chose not to change |
| Q2 | Does the encoder reject odd dimensions, or silently adjust them? | Decides whether `VIDEO_ODD_DIMENSIONS` is written at all (§8) |
| Q3 | Is `keyFrameInterval` byte-stable across runs, and what does mediabunny default to? | Feeds §5's pinning; an implicit default is a library-version dependency |
| Q4 | Does a long export (the 7,200-frame `MAX_EXPORT_FRAMES` ceiling) exhaust memory via `BufferTarget`? | `BufferTarget` accumulates the whole file in memory, as the PNG path accumulates an array of buffers. If it breaks, the ceiling or the target needs revisiting |
| Q5 | Does `prefer-software` actually get software encoding on a machine **with** a hardware encoder? | The determinism claim in §7 was measured under SwiftShader. `prefer-software` is a hint, not a guarantee |

Q5 is the one most likely to embarrass this phase later, because the development
machine cannot answer it. If it cannot be settled, §7's claim must be narrowed to
what was actually measured rather than stated generally.

---

## 12. Out of scope

- GIF and SVG/SMIL (roadmap §8).
- `MediaRecorder` (roadmap §8, explicitly).
- Audio. Marey has no audio model.
- AV1. Probed as supported, but the roadmap names WebM and MP4 only, and
  software AV1 encoding is materially slower.
- `marey export` as a CLI command — Phase 6. The dev seam is shaped so that
  phase can call it.
- Re-deriving `eval/RESULTS-GATE-B.md`'s stale snapshot hash. Still open, still
  inherited, still recorded in Phase 5A's execution notes.

---

## 13. Task shape

Sized per AGENT-LESSONS §7b — tiered by risk, with no task expected to need more
than two implementer rounds.

| # | Task | Tier |
|---|---|---|
| 0 | Extract `frameRaster.ts` from `pngSequence.ts`; prove PNG export unchanged | Integration |
| 1 | `videoContract.ts`: diagnostics, config resolution, timestamp math | Mechanical–Integration, fully testable |
| 2 | `videoEncode.ts`: WebCodecs + mediabunny | Architecture, thin, browser-verified |
| 3 | `devVideoSeam.ts` + `video-check.mjs` decode-back harness | Architecture |
| 4 | Settle §11's open questions by measurement | Investigation |
| 5 | The export control and store action | Integration |
| 6 | Evidence for the three exit criteria (`eval/RESULTS-PHASE-5B.md`) | Evidence |
| 7 | Documentation, both phase-status locations, execution notes | Documentation |

Task 0 lands first because both exporters depend on it, and because a refactor
of working Phase 4 code should be proved behaviour-preserving before anything is
built on it — not after. Its proof is that `pngSequence`'s existing tests pass
unchanged **and** that the extraction is exercised by reverting it (§ delete-and-run).

---

## 14. Review checklist carried from Phase 5A

Phase 5A's execution notes name one question as worth putting in every review
dispatch of the next phase, because the two most valuable findings of that phase
were both of this family:

> **Could this fixture, or this mutation, have produced the other answer?**

A fixture that cannot discriminate and a mutation the type checker already
catches both look like evidence and are not. Every review dispatch in this phase
carries that question.
