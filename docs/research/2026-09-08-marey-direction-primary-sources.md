# Marey's direction, checked against primary sources

**Date:** 2026-09-08
**Status:** Research notes. Not a design, not a roadmap change. Nothing here
supersedes `docs/specs/2026-09-01-marey-product-roadmap-design.md`.

**Why this file is here.** There was no existing home for external-landscape
research. `docs/harness/` is specifically about the AI harness and
`docs/specs/` holds approved designs, so putting a landscape survey
in either would misfile it. This created `docs/research/` as the home for
"what does the outside world actually say" documents, dated like every other
document in the repo. Move it if you prefer another home.

**Method.** Every claim below is traced to a spec section, a source file, a
schema, or first-party documentation. Where a primary source could not settle
a question, §7 says so instead of filling the gap. Quotations marked
"> quote" are verbatim normative or first-party text.

**Verification status.** The research agent was cut off by a session limit at
the start of its citation-verification pass, so the citations below were
written but not self-checked. A follow-up pass verified a subset directly:

- *Verified exactly* — every repository citation: `TICK_HZ = 120`
  (`src/compiler/sceneIR.ts:14`), `IRTextProps` (`sceneIR.ts:106-110`),
  `antialias`/`resolution` (`renderer/adapter.ts:27-29`), `evaluateEasing`
  (`renderer/sceneRuntime.ts:57-67`), `MAX_PHYSICS_BODIES = 500`
  (`typeChecker/physicsCost.ts:3`), pixi.js 8.16.0's `renderPriority`
  (`autoDetectRenderer.js:8`), roadmap R9, and the §2.1 rule.
- *Verified exactly* — the three `lottie-web` `AnimationItem.js` lines quoted
  in §2, the `subframeEnabled = true` default, the WebCodecs "Internal Pending
  Output" quote, and the WebCodecs status line (Working Draft, 27 August 2026).
- *Unverified* — the remaining external anchors, section numbers, and quotes,
  including the Lottie spec quotes, MDN compat numbers, licence texts, and the
  Remotion/Motion Canvas/Rive/GitHub/GitLab citations. Treat those as
  well-sourced but unconfirmed until spot-checked.

---

## 1. The direction, as the repo states it

Marey compiles readable text into deterministic 2D motion, then out to
artifacts that play without the Marey runtime (roadmap §1). Phase 3B is
landing generative expressions; the phases this research targets are the ones
that bet on things outside the repo:

| Phase | The external bet |
|---|---|
| 4 | A browser canvas can produce frames that hash identically on repeat (§9.4) |
| 5A | A bounded Lottie subset round-trips through independent players (§10.1) |
| 5A | WebCodecs + a muxer gives frame-exact video; `MediaRecorder` does not (§10.2) |
| 5B | Mermaid's distribution story is reproducible without host support (§2, §11) |
| 5B | A public package under an explicit open-source license (§11.2) |
| 1 | Marey is positioned against GSAP / Rive / Lottie by what it is *not* |

Those six lines are what §2–§6 below test.

---

## 2. Bet: a baked Lottie subset (Phase 5A)

### What the sources say

**The specification is explicitly incomplete.** From the
[Lottie specification, "Status of this manual"](https://lottie.github.io/lottie-spec/1.0/single-page/):

> The Lottie specification is still a work in progress, this document contains
> a subset of features that have been approved by the Lottie Animation
> Community. The documentation and specs will be expanded as more of the Lottie
> format becomes standardized.

It does use BCP 14 keywords, so what *is* written is normative. Only two
releases exist: [`1.0` and `1.0.1`](https://github.com/lottie/lottie-spec/releases).

**Every shape Marey needs is in the normative subset — except text.** The
[Layers section](https://lottie.github.io/lottie-spec/1.0.1/specs/layers/)
defines exactly five layer types: `ty` 0 Precomposition, 1 Solid, 2 Image,
3 Null, 4 Shape. **There is no Text layer in the spec.** Marey's `text`
object (`src/compiler/sceneIR.ts:106-110`) therefore has no normative Lottie
mapping. It is not impossible — [ThorVG documents text support](https://github.com/thorvg/thorvg/wiki/Lottie-Support)
(alignment, caps, fonts, glyphs, outline, range selector, text path, tracking)
— but a Marey→Lottie text emitter would be targeting player behaviour, not
the spec.

**Rendering is specified as path equivalence, not pixel equivalence.** From the
Shapes conventions:

> Implementations MAY use different algorithms or primitives to render the
> shapes but the result MUST be equivalent to the paths defined here.

So "compare selected frames against Marey within documented tolerances"
(roadmap §10.1) is exactly the right shape of test: the spec gives you no
grounds to demand more than that from any player.

**There is no rendering conformance suite.** The spec repo's only test is
[`tests/validate_animations.test.js`](https://github.com/lottie/lottie-spec/blob/main/tests/validate_animations.test.js),
which compiles `docs/lottie.schema.json` with Ajv and asserts that example
animations validate against it. Nothing renders. The
[repo README](https://github.com/lottie/lottie-spec/blob/main/README.md) puts
rendering conformance in the future tense:

> The definition of the correct rendering will be specified by a combination of
> verbiage in the written specification and by exemplar Lottie files and their
> desired renderings.

**Keyframe semantics are well-defined and do what the bake needs.** From the
[Properties section](https://lottie.github.io/lottie-spec/1.0.1/specs/properties/):
keyframe `t` is a frame number; `h` set to 1 means "the property will keep the
same value until the next keyframe"; `i`/`o` easing handles

> represent a cubic bezier, starting at `[0,0]` and ending at `[1,1]`

with x as time and y as the value-interpolation factor. Clamping behaviour at
the edges is specified:

> If the first keyframe occurs after the start of the animation, the initial
> property value will be from the first keyframe. Similarly, if the last
> keyframe is before the end of the animation, the last keyframe value will be
> held until the end.

`fr`, `ip` and `op` are `number` with `fr` having `exclusiveMinimum: 0`. **The
spec does not require them to be integers**, and it does not define what a
player should do at a non-integer frame time.

### The constraint the roadmap does not currently account for

That last gap is where "baked keyframes" stops round-tripping. **The reference
player samples at fractional frames by default.** In `lottie-web` 5.13.0:

- `let subframeEnabled = true;` with
  `const getSubframeEnabled = () => subframeEnabled;` — the global default, in
  [`player/js/utils/common.js`](https://github.com/airbnb/lottie-web/blob/master/player/js/utils/common.js).
  `AnimationItem`'s constructor reads it via
  `this.isSubframeEnabled = getSubframeEnabled();`.
- `this.frameMult = this.animationData.fr / 1000;` — frames per millisecond of
  wall clock.
- `var nextValue = this.currentRawFrame + value * this.frameModifier;` in
  `advanceTime`, where `value` is the elapsed rAF delta
  ([`player/js/animation/AnimationItem.js:496`](https://github.com/airbnb/lottie-web/blob/master/player/js/animation/AnimationItem.js)).
- `this.currentFrame = this.isSubframeEnabled ? this.currentRawFrame : ~~this.currentRawFrame;`
  ([`AnimationItem.js:370`](https://github.com/airbnb/lottie-web/blob/master/player/js/animation/AnimationItem.js)) —
  truncation to an integer frame happens **only when subframes are off**, which
  is not the default.

So a Lottie file whose keyframes are baked once per exported frame will, in the
default `lottie-web` configuration, be displayed at times *between* Marey's
baked samples, with the player interpolating values Marey never computed. The
error is invisible for smooth easing and conspicuous for a physics bounce,
which is precisely canonical scene 5.3.

There are two escapes, both cheap, and the roadmap should pick one explicitly:

1. Emit hold keyframes (`h: 1`). Playback then steps exactly through Marey's
   states — spec-supported, exact, and stepped rather than smooth.
2. Emit interpolating keyframes and accept that fidelity is defined at the
   baked sample times only, with intermediate values being the player's linear
   or bezier fill.

Note that this is a *format* property, not a `lottie-web` bug: the spec's
silence on non-integer frame times means another conforming player may resolve
it differently. That is the concrete form the roadmap's "player-dependent" risk
takes.

### Implication for Phase 5A

- The strategic claim holds: a baked shape-layer subset is squarely inside the
  normative spec, and the roadmap's own scope list (circle, rectangle, polygon,
  group, baked position/rotation/scale/alpha, fixed duration and frame rate)
  maps onto specified constructs.
- Drop `text` from the Lottie MVP explicitly, or document it as
  player-targeted rather than spec-conformant. The roadmap's "unsupported
  features fail explicitly" rule already gives you the mechanism.
- The bake's keyframe interpolation mode is a design decision that has to be
  made, not an implementation detail.
- `docs/lottie.schema.json` is a real, machine-checkable artifact. Validating
  exported files against it with Ajv is a cheap CI gate and is the *only*
  automatable conformance check that exists today.
- "Validate output in an independent Lottie player" is the right plan, and
  ThorVG is a credible second implementation with a published feature matrix.
  But there is no shared pass/fail bar to hold either player to, so agreement
  between two players is evidence, not conformance.

---

## 3. Bet: WebCodecs video, and rejecting MediaRecorder (Phase 5A)

### What the sources say

The [WebCodecs specification](https://www.w3.org/TR/webcodecs/) is a **W3C
Working Draft dated 27 August 2026** — "This document is intended to become a
W3C Recommendation." It is widely shipped but not a Recommendation.

**Timestamps are author-supplied and exact.** `VideoFrame`'s `timestamp` is
"The presentation timestamp, given in microseconds", and for encoding it "is
copied to the `EncodedVideoChunk`s corresponding to this `VideoFrame`"
([§9.4](https://www.w3.org/TR/webcodecs/#videoframe-interface)). For a frame
built from a canvas the spec notes:

> NOTE: Authors are encouraged to provide a meaningful timestamp unless it is
> implicitly provided by the CanvasImageSource at construction.

This is the property Phase 4's sampler needs: the encoder takes the timestamp
you compute, not one derived from a clock.

**`flush()` is a hard guarantee.** From
[§1 Definitions, "Internal Pending Output"](https://www.w3.org/TR/webcodecs/#internal-pending-output):

> The underlying codec implementation MAY emit new outputs only when new inputs
> are provided. The underlying codec implementation MUST emit all outputs in
> response to a flush.

So no frames are silently lost at the tail of an export.

**The spec guarantees nothing about the encoded bytes.** Searching the full
spec text for `deterministic`, `determinism`, `bit-exact`, `no guarantee` and
`best effort` returns no statement that identical input frames produce
identical output bitstreams. The text points the other way:

> Assign the remaining keys of `outputConfig` as determined by
> `[[codec implementation]]`.
> ([§6.6 encoder output algorithm](https://www.w3.org/TR/webcodecs/#videoencoder-interface))

> NOTE: The precise degree of bitrate fluctuation in either mode is
> implementation defined. (`bitrateMode`,
> [§7.8](https://www.w3.org/TR/webcodecs/#video-encoder-config))

> While User Agents SHOULD respect these values when possible, User Agents may
> ignore these values in some or all circumstances for any reason.
> (`HardwareAcceleration`, [§7.9](https://www.w3.org/TR/webcodecs/#hardware-acceleration))

Frame-*exactness* — one encoded chunk per submitted frame, at the timestamp you
gave it — is supported. Byte-*reproducibility* is not, and a hardware encoder
on one machine and a software encoder on another will not agree.

**What a muxer needs, and when.** The decoder configuration that carries the
codec-private data (e.g. AVC's `avcC`) arrives in
`EncodedVideoChunkMetadata.decoderConfig`, and only when it changes:

> If `outputConfig` and `[[active output config]]` are not equal dictionaries:
> Assign `outputConfig` to `chunkMetadata.decoderConfig`.

In practice that means the first chunk only, and a muxer that misses it cannot
write a playable MP4. The spec also defers the format of that data entirely:

> NOTE: The codec specific requirements for populating the `description` are
> described in the [WEBCODECS-CODEC-REGISTRY].

**Browser support, from MDN's compat data rather than hearsay.**
[`api/VideoEncoder.json`](https://github.com/mdn/browser-compat-data/blob/main/api/VideoEncoder.json)
records `VideoEncoder` as Chrome 94, Safari 16.4, **Firefox 130**, Edge
mirroring Chrome. Every method (`configure`, `encode`, `flush`, `reset`,
`isConfigSupported`) shares those numbers.

**Alpha is discarded by default.** `VideoEncoderConfig.alpha` defaults to
`"discard"` ([§7.8](https://www.w3.org/TR/webcodecs/#video-encoder-config)) —
relevant if a Marey export is ever expected to carry transparency.

**Muxers.** [Mediabunny](https://github.com/Vanilagy/mediabunny) (successor to
the same author's `mp4-muxer`/`webm-muxer`) is MPL-2.0
([LICENSE](https://github.com/Vanilagy/mediabunny/blob/main/LICENSE)),
zero-dependency TypeScript, and describes itself as "a collection of
multiplexers and demultiplexers … connected together via abstractions around
the WebCodecs API". MPL-2.0 is file-level weak copyleft: fine to depend on and
to ship, with the obligation that modifications to *its* files be published.

### The constraint the roadmap does not currently account for

**Phase 5B's CLI cannot run this stack on Node as-is.** Node's
[globals documentation](https://nodejs.org/api/globals.html) lists
`AbortController`, `structuredClone`, `WebSocket` and so on; it lists no
`VideoEncoder`, `VideoFrame`, `EncodedVideoChunk` or `OffscreenCanvas`.
Mediabunny states the consequence directly in
[`packages/server/README.md`](https://github.com/Vanilagy/mediabunny/blob/main/packages/server/README.md):

> By default, Mediabunny requires a browser environment for full access to
> decoders, encoders, and video processing features. `@mediabunny/server` uses
> NodeAV to polyfill this functionality for server-side environments such as
> Node, Bun, or Deno.

So `marey export --mp4` outside a browser means either a headless browser
(Remotion's choice, §6) or a native FFmpeg-backed polyfill. That is a real
dependency decision hiding inside "add WebM and MP4 through WebCodecs and a
muxer", and it lands in Phase 5B, not 5A.

### The MediaRecorder rejection is correct, and for a stronger reason than stated

The roadmap says `MediaRecorder`'s "real-time capture can drop frames". The
specs support something more specific. From
[Media Capture from DOM Elements §2](https://www.w3.org/TR/mediacapture-fromelement/):

> A new frame is requested from the canvas when `[[frameCaptureRequested]]` is
> true and the canvas is painted. Each time that the captured canvas is
> painted, the following steps are executed: … If new content has been drawn to
> the canvas since it was last painted, and if the `[[frameCaptureRequested]]`
> internal slot of `track` is set, add a new frame to `track` containing what
> was painted to the canvas.

Two consequences, both normative: capture is bound to **compositor paints**,
not to simulation ticks; and a frame whose content is unchanged is **not
emitted at all**. The spec's own note — "This algorithm results in a captured
track not starting until something changes in the canvas" — makes the second
explicit. Meanwhile
[MediaStream Recording](https://www.w3.org/TR/mediastream-recording/) requires
only that "the UA MUST record `stream` in such a way that the original Tracks
can be retrieved at playback time"; there is no frame-count or frame-timing
obligation anywhere in it.

A held pose in a Marey scene would therefore be silently compressed. The
rejection is well-founded; the justification in §10.2 could be sharpened to
cite the paint-driven capture rule rather than "can drop frames".

### Implication for Phase 5A/5B

- Frame-exact *structure* (one chunk per sampled frame, at the sampler's
  timestamp) is a promise WebCodecs makes. Byte-identical output across
  machines is not — so a video export must not be gated on hash equality, only
  the PNG/frame-buffer path can be.
- Capture the first chunk's `decoderConfig` or the MP4 is unplayable.
- Firefox 130 as the floor is worth knowing before the export UI promises
  cross-browser availability.
- Budget for the Node encoding gap before promising `marey export` video in
  CI.

---

## 4. Bet: deterministic export from a browser canvas (Phase 4)

Phase 4's Gate B says "Repeated exports produce identical frame hashes."

### What the sources say

**Serialization constrains pixels, not bytes.** The HTML Standard,
[§4.12.5.5 Serializing bitmaps to a file](https://html.spec.whatwg.org/multipage/canvas.html#serialising-bitmaps-to-a-file):

> The image file's pixel data must be the bitmap's pixel data scaled to one
> image pixel per coordinate space unit, and if the file format used supports
> encoding resolution metadata, the resolution must be given as 96dpi (one
> image pixel per CSS pixel).

> User agents must support PNG ("image/png").

> For image types that support color profiles, the serialized image must
> include a color profile indicating the color space of the underlying bitmap.

PNG compression level, filter choice, chunk ordering and the exact profile
bytes are unconstrained. **Hash the pixel buffer, not the PNG file**, if the
hash is ever to mean anything across a browser upgrade.

**Alpha handling is lossy by construction.**
[§4.12.5.7](https://html.spec.whatwg.org/multipage/canvas.html#premultiplied-alpha-and-the-2d-rendering-context):

> A `CanvasRenderingContext2D`'s output bitmap and an
> `OffscreenCanvasRenderingContext2D`'s output bitmap must use premultiplied
> alpha to represent transparent colors.

> converting between premultiplied and non-premultiplied alpha is a lossy
> operation on colors that are not fully opaque.

and, in the `putImageData` section:

> Due to the lossy nature of converting between color spaces and converting to
> and from premultiplied alpha color values, pixels that have just been set
> using `putImageData()`, and are not completely opaque, might be returned to an
> equivalent `getImageData()` as different values.

**Rasterization is explicitly implementation-chosen.** Marey renders through
PixiJS, which resolves to WebGL first —
`const renderPriority = ["webgl", "webgpu", "canvas"];`
(`node_modules/pixi.js/lib/rendering/renderers/autoDetectRenderer.js:8`, pixi.js
8.16.0) — and `src/compiler/renderer/adapter.ts:27-29` initialises it with
`antialias: true` and `resolution: window.devicePixelRatio || 1`. The
[WebGL 1.0 specification](https://registry.khronos.org/webgl/specs/latest/1.0/)
says of both:

> The `depth`, `stencil` and `antialias` attributes, when set to true, are
> requests, not requirements. The WebGL implementation should make a best
> effort to honor them.

> `antialias` — If the value is true and the implementation supports
> antialiasing the drawing buffer will perform antialiasing using its choice of
> technique (multisample/supersample) and quality.

> The dimensions actually used are implementation dependent and there is no
> guarantee that a buffer with the same aspect ratio will be created.

The HTML spec makes the same point about the 2D path: "Anti-aliasing can
similarly be implemented using oversampling with bitmaps of a higher resolution
than the final image on the display"
([§4.12.5.1](https://html.spec.whatwg.org/multipage/canvas.html#the-canvas-element)).

### Implication for Phase 4

The Gate B criterion is keepable **as written** — "repeated exports", i.e. the
same machine, browser and GPU — because the determinism that matters there is
Marey's own (fixed 120 Hz ticks, `TICK_HZ` in `src/compiler/sceneIR.ts:14`,
and no wall clock reaching the encoders). Nothing in the platform makes
*repeat* runs differ.

What no specification supports is the stronger reading someone will eventually
assume: that two machines, or two browsers, or the same browser after a driver
update, produce the same hash. Antialiasing technique and quality are the
implementation's choice, by normative text.

Two concrete consequences for the export path:

1. `resolution: window.devicePixelRatio || 1` makes the *output dimensions*
   machine-dependent. The export path must pin resolution rather than inherit
   the preview's, or the same scene exports at different pixel sizes on a
   retina laptop and a CI runner.
2. `antialias: true` should be a documented, deliberate choice for export.
   Turning it off is the only setting the WebGL spec obliges an implementation
   to honour — "When any of these attributes is set to false, however, the
   WebGL implementation must not provide the associated functionality" — so
   `antialias: false` is the only antialiasing state that is portable.

Wording Gate B as "identical frame hashes within one environment; golden-image
comparison across environments uses tolerances" would make the criterion say
what the platform can actually deliver. This is consistent with what the repo
already learned the hard way: `docs/architecture/README.md` records that the
browser visual check "found a determinism bug the whole headless suite missed".

---

## 5. Bet: the Mermaid adoption analogy (Phase 5B)

### What the sources say

**GitHub renders Mermaid by shipping Mermaid's own JavaScript to the reader.**
From GitHub's
[announcement](https://github.blog/developer-skills/github/include-diagrams-markdown-files-mermaid/):
the HTML pipeline substitutes the raw `mermaid` tag for a template, then GitHub
injects "an iframe into the page, pointing the `src` attribute to the
Viewscreen service", where "Mermaid.js, turning that code into a diagram in
your local browser" does the work. The stated motivation for the iframe was to
keep "the JavaScript payload we need to serve from Rails smaller".

**The native list is short, curated, and closed.** GitHub's
[Creating diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams)
documents exactly three: Mermaid, GeoJSON/TopoJSON, and ASCII STL. There is no
documented mechanism for a third party to register a renderer; the only mention
of third parties is a warning that "You may observe errors if you run a
third-party Mermaid plugin when using Mermaid syntax on GitHub."

**GitLab's second tier is the one worth studying.** In
[GitLab's Markdown documentation](https://docs.gitlab.com/user/markdown/),
Mermaid renders in-browser with no setup, while PlantUML and Kroki are
server-side and gated on an administrator: "To make PlantUML available in
GitLab Self-Managed installation of GitLab, a GitLab administrator must enable
it", and likewise "To make Kroki available in GitLab, a GitLab administrator
must enable it."

**Mermaid's catalog shows three distinct integration mechanisms.** The
[community integrations page](https://mermaid.js.org/ecosystem/integrations-community.html)
groups them into: hosts that render natively (GitHub, GitLab, Notion, Obsidian,
Azure DevOps, Gitea, Forgejo, …), editors and wikis that need a plugin
(Confluence, Jira, VS Code, JetBrains), and **static-site generators that
pre-render at build time** (MkDocs, mdBook, Jekyll, Sphinx).

### Implication for Phase 5B

The analogy is real but only one of its three mechanisms transfers.

- **Host-native rendering of source is unavailable to Marey and will stay
  that way.** It requires a host to embed *your runtime* and execute *your
  source* at view time. GitHub's list is curated with no registration path;
  Marey has no lever there. The roadmap already says "Native GitHub rendering
  is not an initial dependency" — the primary record says it is not a
  dependency at any point that Marey controls.
- **The PlantUML/Kroki tier is the closest structural analogue to "host renders
  my thing", and it is a bad one**: it needs an administrator to stand up a
  server. Any future plan that routes through host rendering inherits that
  adoption cost.
- **The build-time pre-render tier is exactly Marey's plan and it demonstrably
  works without host cooperation.** "A checked-in `.marey` file can be
  compiled by CI to Lottie, video, or an image referenced by ordinary Markdown"
  (roadmap §11.2) is the MkDocs/mdBook mechanism, which is a real, populated
  category in Mermaid's own catalog.

The honest restatement of R9 is: Marey can reproduce Mermaid's *build-time*
distribution mechanism in full, cannot reproduce its *view-time* mechanism at
all, and the view-time mechanism is the one GitHub's announcement is actually
about. That does not sink the phase — it means the CLI and the GitHub Action
carry the entire adoption story, so they are load-bearing rather than
convenient.

---

## 6. Bet: the competitive frame (Phase 1 identity, Phase 5B licensing)

### GSAP

`gsap@3.15.0`'s npm metadata gives its `license` field as
[`"Standard 'no charge' license: https://gsap.com/standard-license."`](https://registry.npmjs.org/gsap/latest),
and the [repository root](https://github.com/greensock/GSAP) contains no
`LICENSE` file at all. The
[standard license](https://gsap.com/standard-license/) grants use "on any
website, web application, or digital interface", including commercially, at no
charge — while prohibiting reverse engineering "for the purpose of creating
Competitive Products", defined as software that "enables users to create, edit,
or manage animations through a visual interface or builder similar to Webflow".
It is **not an OSI-approved license**, and all IP rights "remain the exclusive
property of Webflow".

Marey is a text compiler, not a visual builder, so the competitive clause
does not obviously bite. The decision-relevant fact is different: **"free" and
"open source" have come apart in this space**, and Phase 5B's commitment to an
explicit open-source license is a real, checkable differentiator rather than
table stakes.

### Rive

Rive's runtime is
[MIT](https://github.com/rive-app/rive-runtime/blob/main/LICENSE). Two things
have changed in the adjacent space since the roadmap's framing was written:

1. **Rive now has code-first authoring inside the editor.** The
   [docs index](https://rive.app/docs/llms.txt) lists a whole Scripting
   section — creating scripts, protocols (node/layout/converter/path-effect/
   transition-condition/listener-action), script inputs, data binding, a debug
   panel, unit testing, and WGSL shaders. The language is Lua: "The
   configuration file returns a Lua table"
   ([Configuration](https://rive.app/docs/scripting/configuration.md)).
2. **Rive exports video and image sequences.**
   [Exporting Videos & Images](https://rive.app/docs/editor/exporting/exporting-for-video-and-static-design.md)
   lists H.264, GIF, PNG Sequence, SVG Sequence, WebM, PNG and SVG, produced by
   a "Cloud Renderer", and states: "Exporting video and images is available on
   paid plans." The workflow is editor-driven — Render Presets added to a
   Render Queue. No CLI or CI path is documented.

So the roadmap's "not a visual editor like Rive" still separates the two, but
"Marey exports, Rive does not" was never the distinction and is now plainly
false. The surviving distinctions are: source lives in your repository as text
you diff; rendering happens locally or in your CI rather than on a vendor's
cloud; no account and no paid plan.

### Lottie

`lottie-web` is [MIT](https://github.com/airbnb/lottie-web/blob/master/LICENSE.md).
Nothing in the roadmap's treatment of Lottie as an output target is contradicted
by primary sources; see §2 for the format-level detail.

### Remotion — the closest competitor, and license-constrained

Remotion's model is what Phase 4/5A is building: a headless Chrome renders
frames, FFmpeg encodes and muxes them. Its
[renderMedia documentation](https://www.remotion.dev/docs/renderer/render-media)
documents `browserExecutable`, a concurrency default of "half of the CPU
threads available", and a two-phase "pre-stitcher is the encoding phase and
stitcher is the muxing phase".

It also had to solve determinism explicitly, which is direct evidence that
Marey's fixed-tick clock is solving a real problem rather than an imagined
one. From [Random values](https://www.remotion.dev/docs/random):

> Since Remotion renders a video on multiple threads and opens the website
> multiple times, the value returned by a `Math.random()` call will not be the
> same across multiple threads, making it hard to create animations based on
> randomness.

The licence is the decisive difference. From
[LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md), the
Free License covers individuals, non-profits, and "a for-profit organization
with up to **3 employees**"; anyone larger "[is] required to obtain a Company
License". Source-available, not open source.

### Motion Canvas — also close, also code-first, MIT

[MIT licensed](https://github.com/motion-canvas/motion-canvas/blob/main/LICENSE).
Its determinism story mirrors Marey's and Remotion's:

> Unlike `Math.random()`, `useRandom()` is completely reproducible - each time
> the animation is played the generated values will be exactly the same. The
> seed used to generate these numbers is stored in the meta file of each scene.
> ([random.mdx](https://github.com/motion-canvas/motion-canvas/blob/main/packages/docs/docs/advanced/random.mdx))

Its export model is **editor-driven, not headless**: "Clicking the `RENDER`
button will initialize rendering", with an Image sequence exporter and an
optional FFmpeg exporter installed as a Vite plugin
([rendering/index.mdx](https://github.com/motion-canvas/motion-canvas/blob/main/packages/docs/docs/getting-started/rendering/index.mdx),
[rendering/video.mdx](https://github.com/motion-canvas/motion-canvas/blob/main/packages/docs/docs/getting-started/rendering/video.mdx)).
The image-sequence exporter hits exactly the platform dependence of §4: "Motion
Canvas depends on the capabilities of your browser to generate image files, and
so WebP may not work on Safari or older browsers"
([image-sequence.mdx](https://github.com/motion-canvas/motion-canvas/blob/main/packages/docs/docs/getting-started/rendering/image-sequence.mdx)).
Its
[package list](https://github.com/motion-canvas/motion-canvas/tree/main/packages)
includes an embeddable `player` but no CLI package.

### Implication for the product statement

Section 1's three named non-goals are the wrong comparison set to *defend*
against — the two projects doing what Marey plans to do are Remotion and
Motion Canvas, and neither appears in the roadmap. Against them the defensible
claims narrow to three, all supported above:

1. **A declarative DSL, not a general-purpose program.** Remotion is React;
   Motion Canvas is TypeScript generators; Rive scripting is Lua. Marey's
   §2.1 rule ("data determines values; the source's literal structure
   determines shape") is a property none of them has and cannot easily adopt.
2. **Physics as a first-class, deterministic, bakeable authoring construct.**
   None of the four documents an equivalent.
3. **Licensing and locality.** MIT/Apache places Marey above Remotion (3
   employees) and outside GSAP's proprietary grant and Rive's paid cloud
   renderer.

Conversely, "deterministic" is not a differentiator: Remotion and Motion Canvas
both document seeded-RNG determinism as a solved problem. Claiming it as
distinguishing would not survive contact with either project's docs.

---

## 7. Claims I could not verify

Listed so the gaps are visible rather than papered over.

1. **Whether Marey's easing curves have exact Lottie encodings.**
   `evaluateEasing` in `src/compiler/renderer/sceneRuntime.ts:57-67` is
   quadratic (`easeIn` = `t*t`, `easeOut` = `t*(2-t)`, `easeInOut` piecewise
   quadratic); Lottie keyframe easing is a cubic Bézier time-warp. No primary
   source addresses equivalence between the two families. This only matters if
   the bake emits native easing rather than per-frame keyframes.
2. **Whether any Lottie player guarantees stable output across its own
   versions.** No player documents this, and the spec has no versioned
   conformance story to appeal to.
3. **How many frames `MediaRecorder` actually drops.** The specs support the
   *mechanism* (paint-driven capture, unchanged frames not emitted) but no
   primary source quantifies loss, so the roadmap's "can drop frames" is
   directionally right and unquantified.
4. **Which codecs Firefox's `VideoEncoder` supports.** MDN's compat data
   records the interface at Firefox 130 but does not break support down by
   codec string, so H.264/MP4 availability in Firefox is unconfirmed. This
   matters for a cross-browser MP4 export.
5. **Whether Motion Canvas has a first-party headless CLI.** None appears in
   its `packages/` list or its rendering docs, but absence from two places is
   not proof of absence.
6. **Whether GSAP has any first-party export or CI story.** Its own
   documentation site yielded no such page; every result was a user forum
   thread, which is not a primary source. Reported as "not found", not "does
   not exist".
7. **Whether the `.riv` format is publicly specified.** Not checked; only the
   runtime licence and the editor's documented capabilities were.
8. **Lottie file size for baked physics.** Not researched. Keyframe count grows
   as objects × animated properties × frames, and Marey permits up to 500
   physics bodies (`MAX_PHYSICS_BODIES`, `typeChecker/physicsCost.ts:3`), so a
   long, dense physics scene could produce a very large JSON. That is
   arithmetic, not a sourced finding, and nobody has measured it.

### Not researched at all

Phase 6 (motion-graphics core) and Phase 7 (physics authoring syntax) were
skipped: both are internal language work with no external dependency to check.
Phase 8's documentation-site direction was also skipped for the same reason.
