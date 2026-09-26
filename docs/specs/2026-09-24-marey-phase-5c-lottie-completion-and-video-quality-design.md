# Marey Phase 5C — Lottie completion and video quality

**Date:** 2026-09-24
**Status:** Approved design. The project owner approved each section in the
brainstorming session of 2026-09-24 and asked for the plan and execution to
follow without a separate spec-review stop.
**Authority:** Phase 5C of `docs/architecture/roadmap-and-process.md`, which
the owner added on 2026-09-24. This design is where that bullet's "which
options to take is decided in this phase's design" gets decided.
**Inputs:**
- `docs/research/2026-09-24-export-quality-findings-and-options.md` (the
  findings doc; "findings §N");
- `docs/research/2026-09-24-video-export-quality-options.md` (the research
  note; "research §N");
- Phase 5B's plan execution notes;
- Phase 5A's design §1, §4 and §10 ("5A §N").

**Preserves:**
- 5A's encoder boundary: `lottieEncode.ts` sees `FrameSnapshot`s and inert
  specs only, and imports neither pixi.js nor the Scene IR module.
- 5A's opacity asymmetry.
- 5B's "one orchestration per export, the harness observes it" rule
  (ruling R45, whole-branch review I-2).
- Roadmap §6.2's "encoders never advance the simulation and never see a wall
  clock".
- The refuse-don't-degrade rule for export.

**Amends:**
- The recorded `resolution: 1` rule in `frameRaster.ts`, in §2.
- R17's cut of `text`, in §6. The reason for R17 was the Lottie *text
  layer*. This design uses no text layer, so the reason no longer applies to
  what is emitted. R17 is amended, not overridden.

---

## 0. Decisions the owner made, 2026-09-24

| # | Question | Answer |
|---|---|---|
| O1 | Which video options? | **C (2× video) and B (animated PNG).** D (4:4:4 WebM), E (VP9-in-MP4) and G (a shipped H.264 encoder) are not taken. The MP4 specks go to the Phase 6 `marey export` CLI (option F) |
| O2 | Order of the pieces | **2× video → `line` → Lottie button → APNG → `text`** |
| O3 | What "2×" means | **A 2× output file.** An 800×600 scene exports a 1600×1200 MP4/WebM. APNG stays at 1×. A scene too large for 2× gets a named refusal, never a silent 1× fallback |
| O4 | Ligatures in Lottie text | **HarfBuzz shaping** (`harfbuzzjs`), so ligatures and marks match the preview |
| O5 | Where text layout comes from | **Pixi, at export time.** The pipeline reads pixi's measurements and hands them to the geometry module as plain data. HarfBuzz supplies glyphs only |

Defaults chosen by the controller and stated in the design without objection:
- four separate top-bar buttons (`mp4`, `webm`, `apng`, `lottie`);
- APNG downloads as `scene.png` with MIME `image/apng`;
- APNG loops forever;
- Lottie downloads as `scene.json`.

## 1. Facts measured before this design was written

These were settled by throwaway probes in `.visual-check/probe5c/` (gitignored)
during brainstorming, because the design rests on them. The plan's text spike
(T6) re-measures them inside the real app rather than trusting this table.

| Fact | How | Result |
|---|---|---|
| Chromium's canvas `fillText` applies JetBrains Mono's `calt` ligatures | Playwright Chromium, a canvas using the repo's TTF: draw `s` whole and draw it one character at a time at the measured advance, then count alpha pixels differing by more than 8 | `->` 646, `!=` 851, `==` 176, control `ab` **0**. **Ligatures are applied.** Setting `ctx.textRendering = "optimizeSpeed"` removes the `->` ligature (646 px change) |
| Font tables | Node parse of `public/fonts/JetBrainsMono-Regular.ttf` | TrueType `glyf` outlines; `unitsPerEm` 1000; hhea ascender 1020, descender −300, lineGap 0; GSUB features `aalt calt case ccmp frac locl ordn sinf subs sups zero`; GPOS `mark`; `fsType` 0; version 2.211; licence OFL 1.1 (name IDs 13 and 14) |
| harfbuzzjs 1.6.2 (`HB_TINY` build) keeps `calt` | Node: shape strings with the repo TTF | `->` gives glyphs `1167, 621`, not the cmap glyphs for `-` and `>`; `ab`, `hello!` and `é` map one to one. `glyphToPath` returns SVG path data (`M`/`L`/`Q`/`Z`) in font units, y up |
| harfbuzzjs licence and size | npm registry, unpkg file listing | `"license": "MIT"`. `dist/harfbuzz.wasm` 433,766 B, `dist/index.mjs` 82,693 B, `dist/harfbuzz.js` 31,763 B. The subset wasm (651,027 B) is not needed |
| OFL terms | openfontlicense.org OFL-FAQ | 1.1/1.1.1: artwork made using a font's outlines is not restricted by the OFL. 1.12/1.13: embedding does not change a document's licence. **2.6: subsetting or removing parts of a font when delivering it counts as modification.** So this design reads the *unmodified* TTF at runtime and ships no extracted glyph table |
| pixi.js 8.16.0 stroke defaults | `GraphicsContext.defaultStrokeStyle` | `alignment: 0.5`, `miterLimit: 10`, `cap: "butt"`, and a default join of miter |
| pixi text layout | `CanvasTextMetrics.mjs`, `CanvasTextGenerator.mjs` | Lines are split on a newline regex. Line height is `fontProperties.fontSize`, which is `actualBoundingBoxAscent + actualBoundingBoxDescent` of `"|ÉqÅM"`, not the hhea metrics. Each line's baseline is `halfStroke + j·lineHeight + ascent` plus padding |
| String escapes | `lexer/handlers.ts` | `\n` and `\t` reach `content`, so multi-line text and tabs are real inputs |

**Environment fact found while taking the baseline.** `npx vitest run` fails
all 37 files with "no tests" when the shell's working directory is spelled
`c:\…` (lower-case drive letter). From `C:\…` it passes: **37 files / 937
tests** at `4a23e1d`, and `npx tsc -b --noEmit` exits 0. Every dispatch must
run from `C:\Users\gomez\repos\PROGRAMMING_LANGUAGE\marey`.

---

## 2. Piece 1: 2× video

### 2.1 Where the factor lives

`videoContract.ts` gains `VIDEO_SCALE = 2`. `VideoPlan` gains a `scale` field.
Its `width`/`height` become the **coded** size (`scale × scene size`), and it
also carries `sceneWidth`/`sceneHeight`, so both are explicit. `planVideo`
chooses the codec level from the coded size. Everything decided here stays
testable headlessly.

`VIDEO_ODD_DIMENSIONS` is evaluated on the coded size. At scale 2 it cannot
fire, because 2 × any integer is even. The check stays, with a comment
recording that it is unreachable at the current scale and why it is kept: it
becomes live again if `VIDEO_SCALE` ever changes. This is the AGENT-LESSONS
§2f shape, and it is stated in the evidence, not hidden.

### 2.2 The rasterizer rule

`createFrameRasterizer(app, root, frames, scale)` takes an explicit `scale`.
The recorded rule becomes: **the output is the scene's declared pixel size
times the exporter's scale; never the preview's `devicePixelRatio`, and never
a content bounding box.** The region stays in scene units; `extract.canvas`
gets `resolution: scale`. The PNG seam and APNG pass `1`; video passes
`plan.scale`. The `frameRaster.ts` docstring and `renderer.md` are updated in
the same commit as the code.

**The trap this design names.** PixiJS rasterizes a `Text`'s texture at the
*renderer's* resolution. An export `Application` initialised at `resolution:
1` and extracted at 2 would upscale 1× text: sharp shapes, blurry text. So
the video export's `Application` initialises at `resolution: plan.scale`
too. The evidence must include a measurement that text edges are as sharp as
shape edges at 2×. The measure is the width of the antialiased edge band
across a glyph stem in the 2× frame, compared with the 1× frame. A 1×-then-
upscaled text shows about a 2 px band where native 2× shows about 1.

> **2026-09-26 amendment (ruling F-R2).**
>
> **What was measured.** The comparison is text against text, not text
> against shapes. The edge band across the stem of a 60 px "H", in the 2×
> reference frame, was measured in two conditions:
> - native 2× (the shipped code): median **2 px**, mean 1.69 px;
> - a mutated control, with the export `Application` initialised at
>   `resolution: 1` and extraction still at 2×: median **3 px**, mean
>   3.31 px.
>
> That result was measured on 2026-09-25 and re-run on 2026-09-26 with the
> same numbers.
>
> **What was not measured.** No shape edge was measured, so "as sharp as
> shape edges at 2×" is not claimed. What the evidence supports is
> narrower: native-2× text is measurably sharper than the 1×-app
> regression this section names. That does not reach the 1 px the
> prediction above gives for native 2×.
>
> **Where the pieces live.**
> - The probe and its fixture: `docs/research/2026-09-24-export-quality-probes/edge-band/`.
> - The numbers: `eval/RESULTS-PHASE-5C.md`, "Text sharpness".
> - The standing guard is headless and does not depend on the probe:
>   `videoPipeline.test.ts` requires `Application.init`'s `resolution` to
>   equal `VideoPlan.scale`. Mutating it to 1 turns that test red.

### 2.3 Refusals

- `VIDEO_EXCEEDS_CODEC_LEVELS` fires on the coded size. Its message is
  rewritten to say the export is at 2× the scene's size and to give both
  sizes. Otherwise a 2048×1152 scene refused as "4096×2304" reads as a bug.
- **New: `VIDEO_EXCEEDS_DEVICE_LIMITS`.** PixiJS checks no texture-size
  limit (research §6). The pipeline reads `MAX_TEXTURE_SIZE` and
  `MAX_RENDERBUFFER_SIZE` from the export `Application`'s own GL context,
  after `init` and **before** building or sampling. It refuses when either
  coded dimension exceeds the smaller of the two, and names the scene size,
  the coded size and the device limit. The comparison is a pure function in
  `videoContract.ts`, so it has a headless test; the GL read is one line in
  the pipeline.

### 2.4 Bitrate

`DEFAULT_BITRATE` stays at 8 Mbit/s. Findings §1.2 measured 2× H.264
settling at about 4.3M (the OpenH264 QP floor) and VP9 profile 0 at about
5.8M, both under the target. The evidence records the actual rates.

### 2.5 Evidence

- `video-check.mjs` compares decoded frames against **2×** reference frames,
  taken from the same pipeline through its observer.
- The findings-doc probes (`matrix.ts`/`matrix-run.mjs`) get a runnable home
  under `tools/visual-check/`: a `quality-check.mjs` that reports
  PSNR (RGB) and specks (pixels whose worst channel differs by more than 64)
  against the lossless 2× frames. That way the numbers can be re-measured
  rather than quoted.
- **Exit:** the default scene at 2× reproduces findings §1.2's 2× rows for
  both codecs, about 42 dB, within ±0.5 dB, with specks per frame stated.
  All existing `video-check.mjs` gates (frame count, nearest-neighbour order,
  timestamps, WebM byte identity) pass at 2×.

---

## 3. Piece 2: `line` in Lottie

### 3.1 Geometry

`LottieShapeSpec` gains `{ kind: "line"; points; thickness }`, and the layer
carries a colour. The anchor is `localPivot(origin, bbox)` over the same
min/max scan `builder.ts`'s `line` case performs. That is the polygon's scan,
so `polygonBBox` is reused rather than copied.

### 3.2 Encoding

A `sh` with `c: false` and all-zero tangents, followed by a stroke:

```text
{ ty: "st", nm, c: {a:0, k:[r,g,b]}, o: {a:0, k:100}, w: {a:0, k:thickness},
  lc: 1 /* butt */, lj: 1 /* miter */, ml: 10 }
```

The stroke goes **after** the path, for the same reason the fill does:
lottie-web's `searchShapes` walks backwards and applies styles to items at
lower indices (the `lottieEncode.ts` comment at `shapeItemsFor`). Lottie
strokes are centred, which matches pixi's `alignment: 0.5`.

### 3.3 Refusal surface

`LOTTIE_UNSUPPORTED_LINE` is deleted. Its delete-and-run test is replaced by
tests on the new mapping, not just removed. Criterion 3's evidence table in
`eval/RESULTS-PHASE-5A.md` is a prior phase's record and is not edited. This
phase's evidence states the new refusal surface.

### 3.4 Facts to measure in lottie-web, not assume

1. **Miter-limit semantics.** Lottie's `ml` follows the SVG rule (miter
   length ÷ stroke width). Whether pixi's `miterLimit: 10` means the same is
   not established. The fixture is a line with a corner whose angle sits
   between the cutoffs the two plausible readings predict, so exactly one
   reading can match. If pixi differs, the encoder emits the `ml` that
   reproduces pixi, and the comment says why.
2. **Stroke width under non-uniform scale.** The default smile has `scale:
   (0.35, 0.5)`. Both renderers scale the stroke with the layer transform,
   and the fixture confirms it.
3. **Butt caps on a two-point line**, and a zero-length segment within a
   line.

Criterion 2 for a line fixture is measured and stated as numbers (§8).

---

## 4. Piece 3: the Lottie button

### 4.1 One orchestration

A new `src/compiler/export/lottiePipeline.ts` exports
`runLottieExport({ source, fps, durationSeconds?, observer? }): Promise<LottieDoc>`.
It is the **only** copy of compile → `planExport` → `planLottie` → build →
sample → `encodeLottie`. Its observer mirrors `VideoExportObserver`: it reports
`onSampled(frames)` and the finished document.

> **2026-09-26 amendment (ruling T8-R1).** `planLottie` cannot run before
> build after all: Piece 5's text layout comes from the built tree
> (§6.2's `__baseSize` and `CanvasTextMetrics`), so planning has to see it.
> The shipped order is compile → `planExport` → build (`withRasterExport`'s
> `afterBuild` hook) → `collectTextLayouts` → the single `planLottie(ir,
> {layouts, runs})` → sample → `encodeLottie`. Refusals, including
> `LOTTIE_TEXT_MISSING_GLYPH`, still happen before a single tick is
> sampled — §2's "properties of the scene, not of the frames" survives —
> but now after the export `Application`'s GL context exists and the tree
> is built, not before either. A refused scene tears that `Application`
> down in `finally` without `onSampled` ever firing.

`devLottieSeam.ts` becomes a thin observer of it, as `devVideoSeam.ts` did in
5B (R45), and keeps its `hash` via `hashFrames` over the observed frames. The
seam's copy of `hexToRgb01` is deleted: `lottieGeometry.ts` exports the one
implementation, and `lottieRoundTrip.test.ts`'s copy is replaced by the same
import. 5A's restriction on editing that file was specific to that phase's
task.

Every failure is thrown as an `Error` whose message is the diagnostic's
message verbatim, joined with `" | "`, as `runVideoExport` does. The document's
`nm` becomes `"Marey scene"`.

### 4.2 The hook and the button

`useExportVideo.ts` generalises to `useExport.ts`, with
`exportScene(kind: "mp4" | "webm" | "apng" | "lottie")`. There is one
`isExporting` flag and one progress label. Each kind's pipeline is loaded with
a dynamic `import()` inside the callback, so the Lottie chunk (and HarfBuzz
later) stays out of the entry chunk. `exportBoundary.test.ts` gains the
matching "no static import of `lottiePipeline`/`apngPipeline` from the hook"
guards. Downloads use one helper, parameterised by MIME type and filename.

The **lottie** button sits next to the video buttons with the same markup
pattern. Lottie has no per-frame encode progress worth showing, so its label
reads `…` while running.

Until piece 5 lands, the default scene's click shows the verbatim
`LOTTIE_UNSUPPORTED_TEXT` toast. That is correct behaviour, and it is named
in T3's evidence.

### 4.3 Criterion 2, re-measured on the shipped path

- `lottie-check.mjs` drives `runLottieExport` through the seam's observer, so
  it measures the orchestration the button calls.
- **Regression gate:** Phase 5A's recorded `compound-logo.marey` result, max
  per-channel delta **81** across **0.1185%** of pixels, reproduces exactly
  under the software-rasterizer flag.
- **A real-click check**, as 5B Task 6b did: Playwright clicks **lottie** on a
  scene without `text`, captures the download, renders it in lottie-web and
  compares it against the PNG export of the same frames. This closes 5A's
  dev-seam-only evidence gap.

---

## 5. Piece 4: APNG

### 5.1 The encoder

`src/compiler/export/apngEncode.ts` exports
`encodeApng(pngs: ReadonlyArray<Uint8Array>, opts: { fps: number }): Uint8Array`.
It is a pure function with no pixi.js and no DOM, and it has a headless test.
It emits:

- the PNG signature;
- frame 0's `IHDR`;
- the ancillary chunks Chromium's encoder writes before `IDAT`, taken from
  frame 0. Which chunks those are is measured in T5 and pinned by a test;
- `acTL` with `num_frames = pngs.length` and `num_plays = 0`;
- per frame, an `fcTL`: full canvas, offset (0, 0), `delay_num/delay_den =
  1/fps` exactly, `dispose_op = 0` (NONE), `blend_op = 0` (SOURCE). Frame 0's
  `fcTL` precedes its `IDAT`, so the default image is frame 0;
- frame 0's image data as `IDAT` chunks, and every later frame's as `fdAT`
  (a 4-byte sequence number plus the IDAT payload). Sequence numbers are
  shared across `fcTL`/`fdAT` from 0 upward;
- `IEND`;
- CRC-32 per chunk (in-house table implementation, tested against known
  vectors).

**Invariant throws:**
- a PNG that is not a PNG;
- any frame's `IHDR` differing from frame 0's, because a per-frame colour-type
  change would corrupt the file;
- zero frames;
- `fps` that does not fit `fcTL`'s u16 fields.

**Judgment calls pinned by a test each** (§2d): `num_plays = 0`, `SOURCE`
blending, and full-frame rather than region-diffed frames.

### 5.2 The orchestration

The build-and-sample prefix of `runVideoExport` (compile, `planExport`, the
app, the tree, the runtime, `sampleFrames`, the rasterizer, teardown) moves
into one shared helper in a new `rasterExport.ts`. `runVideoExport` and the new
`runApngExport` (`apngPipeline.ts`) both call it. The alternative, a second
copy of the frame loop, is exactly what 5B's I-2 punished. The refactor lands
as its own task with **no behaviour change**, and `video-check.mjs` passing
unchanged is its proof.

APNG runs at scale 1 and rasterizes lazily, producing PNG bytes through
`pngSequence.ts`'s `pngBytesOf` (exported for this). It holds only compressed
bytes. It downloads as `scene.png`, MIME `image/apng`, from an **apng** button
with the same progress label as video.

### 5.3 Evidence

- **Pixel identity:** decode the APNG in the page with `ImageDecoder`
  (`type: "image/png"`), and compare every frame byte for byte with
  `getImageData` of the canvas it was encoded from, captured through the
  observer. **0 differing pixels across all frames**, stated as a count. Also
  compare against the frame count and the `fcTL` delays.
- **Mutation:** drop or swap one frame in the pipeline and the check fails.
- **Determinism:** two runs of the same scene produce byte-identical APNGs.
  This is scoped to this harness (headless Chromium, SwiftShader), as 5B's
  claims were.
- **Measured file sizes** for the default scene and for one scene of at least
  30 s. No size cap is added unless a measurement shows a failure. If one
  does, it is refused by name.

---

## 6. Piece 5: `text` in Lottie

### 6.1 Fonts first, for every export

A shared `ensureExportFonts(ir)` in `rasterExport.ts` (used by the video, APNG
and Lottie pipelines) awaits `document.fonts.load(\`${size}px 'JetBrains Mono'\`)`
for each distinct `fontSize` before the tree is built. Without it, a cold page
measures and draws a fallback font, and neither the video nor the Lottie
output matches the preview.

This also closes a latent race in today's video and PNG exports. It is
recorded as a fix, not a refactor. If the font fails to load, the export is
refused (`EXPORT_FONT_UNAVAILABLE`) rather than drawing with a fallback.

### 6.2 Layout from pixi (O5)

For each text node the pipeline reads:
- the built wrapper's `__baseSize` (`w`, `h`), which is the exact box
  `builder.ts` pivoted on, so the anchor matches the sampled snapshots by
  construction;
- `CanvasTextMetrics.measureText(content, style)`: `lines`, `lineHeight`,
  `fontProperties.ascent`, and the style's final padding.

It passes these to `planLottie(ir, textLayouts)` as a
`ReadonlyMap<IRObjectId, TextLayout>` of plain numbers. A text node with no
entry is an invariant throw. `lottieGeometry.ts` still imports no pixi.js.

### 6.3 Glyphs from HarfBuzz (O4)

A new `src/compiler/export/textOutline.ts` is the **only** module that imports
`harfbuzzjs`. It fetches the same URL `@font-face` loads
(`/fonts/JetBrainsMono-Regular.ttf`; T6 confirms the base-URL handling) and
creates one `hb.Face`/`hb.Font` per export. Per text node, per line:

1. Split `content` exactly as pixi does (T6 records pixi's regex; the code
   imports nothing from pixi and pins the regex by test).
2. Replace each ASCII whitespace character with U+0020, as the canvas
   `fillText` algorithm does. T6 confirms that pixi passes tabs through to
   `fillText`.
3. Shape with default features, so `calt`, `ccmp` and `mark` apply as they do
   in Chromium.
4. Place glyph *i* at `x = padding + Σ advances before i + x_offset` and
   `y = padding + line·lineHeight + ascent − y_offset`, in text-local pixels,
   with font units scaled by `fontSize / upem`.

   > **2026-09-26 amendment (ruling T7-R3).** Measured false as written:
   > glyph x/y do **not** add `padding`. pixi draws a `Text`'s glyphs at
   > `+padding` inside a texture that its own `updateTextBounds.mjs` then
   > places at `-padding` in the `Text`'s local space, so pixi's own
   > canvas offset and its own quad shift cancel for a `Text` at anchor 0
   > — adding `padding` here as well would double-count it. Marey's own
   > styles carry padding 0 today, so both readings agree on every Marey
   > scene, and `textOutline.test.ts:255` ("does not move glyphs by
   > `padding`") pins the cancellation: reinstating `+padding` there goes
   > red.
5. Convert `glyphToPath` data to contours: flip y, and turn each quadratic
   `Q` into a cubic exactly (control points at ⅔ toward the quadratic control
   from each end). `L` becomes a zero-tangent vertex, and `Z` closes.

The result is a `TextGlyphRun`, an array of closed contours in text-local
coordinates. It passes into `planLottie` alongside the layout.
`lottieGeometry.ts` and `lottieEncode.ts` never import `harfbuzzjs`, and the
boundary test says so.

**Missing glyphs.** Glyph id 0 (`.notdef`) from shaping means the font has no
glyph for that character, and the preview would draw it from a fallback font
we cannot reproduce. New `LOTTIE_TEXT_MISSING_GLYPH` names the object and the
character (with its code point). `LOTTIE_UNSUPPORTED_TEXT` is deleted, and its
tests are replaced.

### 6.4 Encoding

One shape layer per text object: one closed `sh` per contour, followed by a
single `fl` with `r: 1` (nonzero winding). Nonzero matters if any glyph has
overlapping contours; T6 counts whether JetBrains Mono has any, and a fixture
pins the rule either way. The output is shape layers only, with no text layer
(§0, R17 amended).

> **2026-09-26 amendment (ruling T8-R4).** A text layer also carries a
> mask to pixi's own measured layout box, `(0,0)-(w,h)`, but only when a
> contour's vertices or control points actually leave that box. pixi
> draws a `Text` into a texture sized to its measured box and clips ink
> outside it in the preview and in every raster export; an unclipped
> Lottie outline can draw further than the preview does whenever a
> glyph's contour — a combining mark's diacritic, for one measured
> fixture — extends past the box. Of the six text fixtures measured, only
> that one carries a mask (`eval/RESULTS-PHASE-5C.md`, "Piece 5").

### 6.5 Licences

`third-party-licenses.txt` (generated by `vite-plugins/thirdPartyLicenses.ts`)
gains:
- harfbuzzjs's MIT licence;
- **HarfBuzz's own licence** ("Old MIT"). The wasm is HarfBuzz; T8 checks
  whether harfbuzzjs's `LICENSE` covers it, and if not, the text is added
  from HarfBuzz's `COPYING`;
- the **full OFL 1.1 text** for JetBrains Mono. The font is distributed with
  the app, and the OFL requires the licence to accompany each copy. Today the
  file only links to it (findings §5).

### 6.6 Evidence

- **Layout agreement, in the browser:** for ASCII, a ligature string (`a->b
  != c`), a string with a mark, and a two-line string with a tab, the sum of
  HarfBuzz advances equals pixi's measured line width. The advance sum is
  compared within 0.01 px, because pixi's width is `max(advance width,
  bounding-box width)`; T6 records which one wins for JetBrains Mono.

  > **2026-09-26 amendment (ruling T8-R2).** For the mark string, ink
  > wins, not advance: pixi's width there is `max(HarfBuzz advance sum,
  > HarfBuzz ink width from glyph extents)`, compared with a measured
  > tolerance rather than 0.01 px, because the two numbers are genuinely
  > different quantities for a mark string (measured 202 vs 180 — T7).
  > `text-check.mjs` measured the tolerance at **1.9 px**
  > (`eval/RESULTS-PHASE-5C.md`, "Piece 5": pixi width 202, HarfBuzz
  > advance sum 180, HarfBuzz ink width 200.1). Every other measured
  > string (ASCII, ligature, multiline, scaled) still compares the
  > advance sum within 0.01 px, because advance wins for them.
  >
  > **2026-09-26 follow-up (final review M-8).** 1.9 px was the single
  > observed delta, so it was fitted, not derived. The tolerance is now a
  > bound: **strictly under 2 px**.
  > - Chromium reports this string's ink edges in whole pixels (left 4,
  >   right 206).
  > - Rounding each edge outward adds less than 1 px per side.
  > - A delta of 2 px or more is therefore more than quantisation can
  >   explain.
  >
  > The mark fixture still passes, at 1.9 px. The derivation is in
  > `tools/visual-check/text-check.mjs`, beside `MARK_TOLERANCE_PX`.
- **Criterion 2 on a text fixture**, with its own measured tolerance. Canvas-
  rasterized text against a vector fill will differ more at edges than
  shapes do. The number is measured and stated, not chosen.
- **Position check**, which pixel tolerances cannot make: each text object's
  ink bounding box in lottie-web equals Marey's within **1 px** on every edge,
  at several frames. A baseline off by the descent passes a loose delta and
  fails this.

  > **2026-09-26 amendment (ruling T8-R3).** "Ink bounding box" is bound
  > at **half coverage**: a pixel counts as ink when its largest channel
  > difference from the opaque background is at least half of the text's
  > own contrast with that background in that frame (the largest such
  > difference found in either image, so both renders share one
  > threshold) — that is, half the text's own contrast, not an absolute
  > `alpha > 0`/`d > 127` rule. The any-ink (≥ 1 level) box is still
  > computed and recorded alongside, but is not the binding check. Named
  > exception: the ligature fixture's frame 29 measures **2 px on the
  > any-ink box** (Marey's box contains lottie-web's; centres agree to
  > 0.5 px) but **0 px at half coverage** — pixi rasterises that frame's
  > text into a canvas texture and draws it with bilinear sampling, and
  > at that frame's fractional x position (280.667) the faintest ink
  > spreads one column further than any vector outline puts ink. This is
  > a property of how the preview draws text, not of the exported
  > outlines, and it is recorded rather than hidden
  > (`eval/RESULTS-PHASE-5C.md`, "Piece 5", fix round 1).
- The default scene exports through the button, renders in lottie-web and
  dotlottie-web, and passes Criterion 2 and the position check.

---

## 7. Boundaries and structure

| Module | May import | Must not import |
|---|---|---|
| `lottieEncode.ts` | `lottieGeometry` types, `frameSampler` types, `exportContract` types | pixi.js, the Scene IR module, harfbuzzjs |
| `lottieGeometry.ts` | Scene IR types | pixi.js, harfbuzzjs |
| `textOutline.ts` | harfbuzzjs | pixi.js, the Scene IR module |
| `apngEncode.ts` | nothing from the app | pixi.js, the Scene IR module, the DOM |
| `lottiePipeline.ts`, `apngPipeline.ts`, `videoPipeline.ts`, `rasterExport.ts` | anything | the dev seams |
| `useExport.ts` | the pipelines by dynamic `import()` only | the pipelines statically |

Every row is a test in `exportBoundary.test.ts`. The 5B widened import-form
regex covers the static, dynamic and bare forms. The guards check direct
imports only, and the docs say so (5B M-1).

> **2026-09-26 amendment (Task 8 review Minor).** `lottieGeometry.ts`'s row
> undersells what it may import: it also imports `textOutline.ts`'s
> **types** — `Contour`, `TextLayout`, `TextGlyphRun` — as a type-only
> import (`import type { ... } from "./textOutline"`). `verbatimModuleSyntax`
> erases that import at compile time, so it carries none of the runtime
> weight (harfbuzzjs, the wasm fetch) the "must not import harfbuzzjs" cell
> exists to keep out, and `exportBoundary.test.ts` checks the import is
> type-only rather than forbidding it outright.

---

## 8. Verification discipline

**Mutate the product, not the tests** (5B's lesson). For each of these
user-visible breakages, the named check must go red. Each mutation is applied,
run and reverted in one command, with `git diff --stat` empty afterwards:

| Breakage | Must be caught by |
|---|---|
| Video extracted at 1× inside a 2× plan | `video-check.mjs` reference-size gate, and `quality-check.mjs` |
| Export `Application` at resolution 1 in a 2× export (blurry text) | the §2.2 edge-band measurement |
| A frame dropped or swapped in `runApngExport` | the APNG decode check |
| An APNG delay of `1/(fps+1)` | the APNG `fcTL` check |
| The stroke item placed before its path | a `lottieEncode` unit test, and lottie-web renders nothing |
| The text baseline shifted by the descent | the ink-bbox position check |
| A ligature string outlined per character | the layout-agreement check and Criterion 2 on the ligature fixture |
| A missing glyph silently skipped | the `LOTTIE_TEXT_MISSING_GLYPH` unit test |
| `ensureExportFonts` removed | a cold-page export check (fresh context, no preview run first) |

**Flip every judgment call once** (§2d):
- `num_plays`, `SOURCE` vs `OVER`, and full frames (APNG);
- nonzero vs even-odd (text);
- the whitespace rule and the newline regex (text);
- stroke order and `ml` (line);
- the odd-dimension check's placement (video).

If flipping one leaves everything green, write the test that makes it
load-bearing.

**Refusals** are pinned by delete-and-run, with wording only the code under
test can produce (§2b). The new ones are `VIDEO_EXCEEDS_DEVICE_LIMITS`,
`LOTTIE_TEXT_MISSING_GLYPH` and `EXPORT_FONT_UNAVAILABLE`, and the rewritten
`VIDEO_EXCEEDS_CODEC_LEVELS`.

**Browser checks** use `npx vite --port 5199 --strictPort`, with a
boundary-matched `netstat` on 5199 before dispatch and after, and the server
killed afterwards. `lottie-check.mjs` keeps `--disable-accelerated-2d-canvas`.

**Judge file changes with `git diff --stat -- <path>`**, never `git status`
(`core.autocrlf`).

---

## 9. Exit criteria

1. **2× video.** The default scene's MP4 and WebM are 1600×1200. PSNR is
   within ±0.5 dB of findings §1.2's 2× rows, with specks per frame stated.
   Every `video-check.mjs` gate passes at 2×. Text edges are measured sharp
   at 2×.

   **2026-09-25 amendment (ruling T1-R2, `eval/RESULTS-PHASE-5C.md`, "fix
   round 2" — supersedes this note's first version from "fix round 1"/
   ruling T1-R1, which localised the right variable
   [`--disable-accelerated-2d-canvas`] to the wrong step).** A 2×2
   experiment (encode mode × score mode, both GPU-accelerated and
   forced-software Chromium 2D canvas) found: **the encoded file and the
   extracted reference frames are unaffected by that flag.** WebM's two
   encodes are byte-identical (same SHA-256) and decode to pixel-identical
   frames (0 of 345,600,000 pixels differ); MP4's quality numbers agree to
   within 0.01 dB between encode modes. This matches PixiJS's actual
   mechanism: `extract.canvas` uses `gl.readPixels`+`putImageData`
   (`GlTextureSystem.generateCanvas()`), never `drawImage`. **Only the
   SCORE mode moves the number** — the step that draws a decoded frame via
   `drawImage` and reads it back with `getImageData` (`quality-check.mjs`'s
   and the findings probe's `score()` both do this). Scored with a
   GPU-accelerated 2D canvas, the shipped file reproduces findings §1.2
   almost exactly: 42.03 dB / 64.5 specks-per-frame (mp4), 42.16 dB /
   61.7 specks-per-frame (webm). Scored with a forced-software 2D canvas
   (`--disable-accelerated-2d-canvas`, `quality-check.mjs`'s current
   configuration), the SAME file measures 41.45 dB / ~625 specks-per-frame
   (mp4), 41.55 dB / ~618 specks-per-frame (webm) instead — a real,
   reproducible number, but one that describes the *scorer's*
   configuration, not the file an ordinary, GPU-accelerated browser
   produces or plays.

   The criterion is re-based to name the configuration it targets, not to
   lower the target: **PSNR, scored with a GPU-accelerated 2D canvas (no
   `--disable-accelerated-2d-canvas` on the scoring browser — the
   configuration that reproduces findings §1.2's own methodology), within
   ±0.5 dB of 42.03 dB (mp4) / 42.16 dB (webm), specks per frame stated.**
   This is, within measurement noise, findings §1.2's original target —
   confirmed reproducible by the shipped path once scored the way findings
   §1.2 itself was measured, not lowered. `quality-check.mjs`'s own
   41.45/41.55 dB is not evidence against this criterion; it is a
   consequence of that script's scoring browser carrying a flag needed for
   other scripts' reference-frame determinism (unnecessary for its own, per
   this experiment) that also, incidentally, affects its unrelated
   decode-and-compare step. Whether to change `quality-check.mjs`'s own
   configuration is not decided here. See the evidence file for every
   command, number and the full 2×2.
2. **APNG.** 0 differing pixels across every frame against the lossless
   frames. Byte-identical across two runs within the harness. Sizes stated.
3. **Lottie `line`.** Criterion 2 is measured with numbers, and the three §3.4
   facts are settled by measurement.
4. **Lottie button.** Criterion 2 on the shipped path reproduces 81 / 0.1185%
   on `compound-logo`. A real click downloads a file that lottie-web renders
   and that matches.
5. **Lottie `text`.** Layout agreement holds, the ink-bbox position check
   passes within 1 px, Criterion 2 is measured, and the default scene exports
   and renders in both players.
6. **Refusals.** Every new or rewritten diagnostic is delete-and-run pinned.
7. **Suite, typecheck and build.** `npx vitest run` and `npx tsc -b --noEmit`
   are green, and `npm run build` exits 0. The dev seams are absent from
   `dist/`. mediabunny and harfbuzzjs are confined to their lazy chunks, with
   entry-chunk size before and after stated.

Evidence goes in `eval/RESULTS-PHASE-5C.md`.

## 10. Out of scope

| Item | Disposition |
|---|---|
| MP4 specks | Phase 6 `marey export` CLI (option F). No H.264 encoder is shipped (option G) |
| 4:4:4 WebM, VP9-in-MP4, a hardware encoder | Not taken (O1) |
| A resolution picker | Not taken (O3) |
| APNG frame-region diffing | Not needed for correctness; revisit only if a measured size is a problem |
| Animated WebP | Not taken |
| Lottie text layer, `.lottie` container | Not taken |
| Findings §5: the sequence-with-a-looping-animate silent gap; the `video-check.mjs` "mediabunny did not attach" flake | Filed, not fixed here. The flake is reported if it recurs during this phase's harness runs |
| Text in fonts other than JetBrains Mono | The language has no font property. Nothing to do |

## 11. Task shape

Tiered by risk (AGENT-LESSONS §7b). The plan expands each row.

| Task | Piece | Tier |
|---|---|---|
| T1 | 2× video: contract, rasterizer `scale`, app resolution, the two refusals, harness at 2×, `quality-check.mjs`, evidence | Integration |
| T2 | `line`: geometry, encoding, the three lottie-web measurements, Criterion 2 on a line fixture | Integration |
| T3 | `runLottieExport`, the seam as observer, `useExport` generalisation, the lottie button, real-click Criterion 2 | Integration |
| T4 | Extract the shared raster-export prefix (`rasterExport.ts`), with no behaviour change | Mechanical-plus |
| T5 | `apngEncode.ts`, `runApngExport`, the apng button, APNG evidence | Integration |
| T6 | Text spike, measure-only: harfbuzzjs in Vite dev and build, glyph overlap count, pixi padding, ascent and width rule, whitespace and newline behaviour, font URL | Measurement |
| T7 | `textOutline.ts`, the layout plumbing, `ensureExportFonts` | Architecture, first half |
| T8 | Text geometry and encoding, `LOTTIE_TEXT_MISSING_GLYPH`, licences, all text evidence | Architecture, second half |
| T9 | Docs (`renderer.md`, the `frameRaster` rule, AGENT-LESSONS §6's drive-letter trap), execution notes, phase status in both places | Docs |

Then the independent whole-branch review (AGENT-LESSONS §8) and one fix wave.
Then **stop and ask the owner** before any merge or push.
