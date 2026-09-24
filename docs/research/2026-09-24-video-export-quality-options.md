# Video export quality options, checked against primary sources

**Date:** 2026-09-24
**Status:** Research notes. Not a design and not a recommendation. Nothing
here changes `src/compiler/export/` or supersedes the Phase 5B plan.

**Why.** A user reported that exports look low quality and pixelated, and
that the MP4 has stray "blank" pixels. Local Playwright-Chromium
measurements on Windows came with the request: (a) H.264 plateaus near
2,060 kbit/s and about 40 dB PSNR, (b) VP9 profile 0 sits near 40 dB and
profile 1 (4:4:4) reaches 45 dB, and (c) the export rasterizes at 1x. This
note treats those as observations to explain, not as findings. It
answers six questions about them from primary sources. The "blank pixels"
symptom itself was not investigated.

**Method.** Chromium was read at `main` on chromium.googlesource.com, and
its commit history through the GitHub mirror's API. OpenH264 was read at
`cisco/openh264` `master`, x264 through the GitHub mirror of
code.videolan.org, and WebKit and Gecko at `main`/`mozilla-central`.
Specs are the W3C WebCodecs TR and editor's drafts and their codec
registrations. Also read: npm registry metadata, the project docs for
ffmpeg.wasm, Microsoft Learn, and the YouTube and X help and developer
pages. mediabunny 1.58.0 and pixi.js 8.16.0 were read locally in
`node_modules` with Read/Grep. External pages were read through a
fetch tool that summarises pages with a small model. Its "verbatim" quotes
and line numbers are therefore only as good as that tool; see below. No
code was run and nothing was measured for this note. Where the sources
support an explanation of an observation, the text says "inference".

**Verification status.**

- *Verified locally, exactly* (read with Read/Grep/sed in this repo): every
  `path:line` citation into `src/compiler/export/`, `node_modules/mediabunny`
  and `node_modules/pixi.js`, and the quoted code at those lines. The line
  ranges were re-checked after writing, and two were corrected
  (`isobmff-boxes.ts:840-883`, `GlTextureSystem.mjs:366-404`).
- *Re-fetched and consistent across two fetches*: Chromium's
  `SetUpOpenH264Params` body (quoted in §1) and the kExternal refusal. The
  absence of `iMinQp`/`iMaxQp`/`quantizer` in `openh264_video_encoder.cc` was
  asked of the fetch tool twice and answered "absent" both times; it was not
  grepped. Line numbers for that file differed by ~8 between fetches, so
  they are marked `~`.
- *Fetched once; the quote comes from the fetch tool and was not re-checked*:
  OpenH264 `ParamValidation`, `FillDefault`, `rc.h` constants and
  `ratectl.cpp` lines. The `encoder_ext.cpp#L897-L912` anchor came from one
  fetch and was not confirmed against a raw file. Also in this group: Blink
  `video_encoder.cc` (content-hint mapping, output `setCodec`, quantizer
  handling, line numbers approximate), `vpx_video_encoder.cc`,
  `av1_video_encoder.cc`, `supported_types.cc`, the MF encoder file, WebKit
  `VP9UtilitiesCocoa.mm`, Gecko `VPXDecoder.cpp`, the codec registrations, the
  X API page, the YouTube help pages, the ffmpeg.wasm docs, Dockerfile and
  `x264.sh`, the x264 header and help text, minih264 and h264-mp4-encoder
  READMEs, the OpenH264 README and openh264.org, the GPL-2.0 text (via SPDX),
  and MDN.
- *Paraphrase, not verbatim*: the WebCodecs `HardwareAcceleration` "not
  obliged to honour" statement in §4.3. The fetch tool would not return the
  exact sentence.
- *Derived*: Chrome milestones for the VP9 and AV1 4:4:4 commits, from
  `Cr-Commit-Position` compared with chromiumdash branch positions. A merge
  back to an earlier branch was not checked for.
- *Not verified at all*: the OpenGL ES 3.0 minimum limits in §6, and the
  claim that H.264 at QP 12 usually exceeds 40 dB luma PSNR (§1).

---

## 0. What the export does today (repo facts)

- Encoder options are fixed in the plan: `hardwareAcceleration:
  "prefer-software"`, `latencyMode: "quality"`, `bitrateMode: "constant"`
  (`src/compiler/export/videoContract.ts:446-448`); default bitrate is
  `DEFAULT_BITRATE = 8_000_000` (`videoContract.ts:31`).
- The H.264 codec string is built as `avc1.4200LL`, Baseline
  (`videoContract.ts:124`); VP9 as `vp09.00.LL.08`, profile 0
  (`videoContract.ts:196-198`).
- Frames are rasterized with `renderer.extract.canvas({ resolution: 1, ... })`
  (`src/compiler/export/frameRaster.ts:153-159`) from an `Application`
  initialised at `resolution: 1, autoDensity: false`
  (`src/compiler/export/videoPipeline.ts:150-158`).

## 1. Why Chromium's software H.264 encoder stops spending bits

**Which encoder runs.** With `hardwareAcceleration: "prefer-software"`, Blink
goes straight to its software factory; for H.264 that is
`CreateOpenH264VideoEncoder()`, compiled only under
`BUILDFLAG(ENABLE_OPENH264)` and further gated by
`media::IsOpenH264SoftwareEncoderEnabled()`
([`video_encoder.cc`, `CreateMediaVideoEncoder` / software factory, ~L871-946](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webcodecs/video_encoder.cc#871)).
Chromium vendors OpenH264 under BSD-2-Clause, pinned via DEPS
([`third_party/openh264/README.chromium`](https://chromium.googlesource.com/chromium/src/+/main/third_party/openh264/README.chromium)).

**What Chromium sets.** All OpenH264 parameters are filled by
`SetUpOpenH264Params`
([`media/video/openh264_video_encoder.cc`, `SetUpOpenH264Params`, ~L45-90](https://chromium.googlesource.com/chromium/src/+/main/media/video/openh264_video_encoder.cc#45)),
after `codec->GetDefaultParams(&params)` (~L241) and before
`codec->InitializeExt(&params)` (~L259). Line numbers in this file are approximate: two fetches of the same page disagreed by about 8 lines. Verbatim:

- Usage type (~L57-65):
  > `params->iUsageType = options.content_hint == VideoEncoder::ContentHint::Screen ? SCREEN_CONTENT_REAL_TIME : CAMERA_VIDEO_REAL_TIME;`
- Frame skip (~L51-60):
  > `params->bEnableFrameSkip = base::FeatureList::IsEnabled(kWebCodecsVideoEncoderFrameDrop) && options.latency_mode == VideoEncoder::LatencyMode::Realtime;`

  Marey passes `latencyMode: "quality"`, so frame skip is off regardless of
  the feature flag.
- Complexity, denoise, threads (~L54-68):
  > `params->iComplexityMode = MEDIUM_COMPLEXITY;` ·
  > `params->bEnableDenoise = false;` · `params->iMultipleThreadIdc = threads;`
- Rate control (~L74-94):
  > `if (options.bitrate.has_value()) { ... params->iRCMode = RC_BITRATE_MODE; if (bitrate.target_bps() != 0) { params->iTargetBitrate = base::saturated_cast<int>(bitrate.target_bps()); } else { ... GetDefaultVideoEncodeBitrate(...) } } else { params->iRCMode = RC_OFF_MODE; }`
- Layer 0 (~L114-127): `layer.uiProfileIdc = ToOpenH264Profile(profile);`,
  `layer.iMaxSpatialBitrate = params->iTargetBitrate;`,
  `layer.iSpatialBitrate = params->iTargetBitrate;`.
- Quantizer mode is refused (~L235-239):
  > `if (options.bitrate.has_value() && options.bitrate->mode() == Bitrate::Mode::kExternal) { std::move(done_cb).Run(EncoderStatus(EncoderStatus::Codes::kEncoderUnsupportedConfig, "Unsupported bitrate mode"));`

What the file does **not** do: no branch on `Bitrate::Mode::kConstant` vs
`kVariable` (both become `RC_BITRATE_MODE`), and it never assigns
`iMinQp`, `iMaxQp`, `iMaxBitrate`, `iEntropyCodingModeFlag`,
`bEnableAdaptiveQuant`, `bEnableSceneChangeDetect` or
`bEnableBackgroundDetection`, so OpenH264's defaults apply. A second,
targeted fetch reported that neither `iMinQp` nor `iMaxQp` nor `quantizer`
occurs anywhere in the file. It also reported that the only `SetOption`
calls are `ENCODER_OPTION_DATAFORMAT` and `ENCODER_OPTION_SVC_ENCODE_PARAM_EXT`
(the latter re-applies the same `SEncParamExt` on reconfigure). These are
absence claims made by the fetch tool, not by a local grep; see Verification
status.

**Where the QP floor comes from (OpenH264).** OpenH264's defaults set
`param.iMaxQp = QP_MAX_VALUE; param.iMinQp = QP_MIN_VALUE;`
([`param_svc.h`, `FillDefault`](https://github.com/cisco/openh264/blob/master/codec/encoder/core/inc/param_svc.h)),
with `QP_MIN_VALUE = 0` and `QP_MAX_VALUE = 51`
([`rc.h`](https://github.com/cisco/openh264/blob/master/codec/encoder/core/inc/rc.h)).
Because 0 is "unset", `ParamValidation` then substitutes usage-type limits
([`encoder_ext.cpp#L897-L912`](https://github.com/cisco/openh264/blob/master/codec/encoder/core/src/encoder_ext.cpp#L897-L912)):

> ```
> if ((pCfg->iMaxQp <= 0) || (pCfg->iMinQp <= 0)) {
>   if (pCfg->iUsageType == SCREEN_CONTENT_REAL_TIME) {
>     pCfg->iMinQp = MIN_SCREEN_QP;
>     pCfg->iMaxQp = MAX_SCREEN_QP;
>   } else {
>     pCfg->iMinQp = GOM_MIN_QP_MODE;
>     pCfg->iMaxQp = MAX_LOW_BR_QP;
>   }
> }
> pCfg->iMinQp = WELS_CLIP3(pCfg->iMinQp, GOM_MIN_QP_MODE, QP_MAX_VALUE);
> ```

The constants are `GOM_MIN_QP_MODE = 12`, `MAX_LOW_BR_QP = 42`,
`MIN_SCREEN_QP = 26`, `MAX_SCREEN_QP = 35`
([`rc.h`](https://github.com/cisco/openh264/blob/master/codec/encoder/core/inc/rc.h)).
Rate control copies them in (`pWelsSvcRc->iMinQp = pEncCtx->pSvcParam->iMinQp;`
in `RcInitSequenceParameter`) and every picture QP is clipped into that
range (`iLumaQp = WELS_CLIP3 (iLumaQp, pWelsSvcRc->iMinFrameQp, pWelsSvcRc->iMaxFrameQp);`
in `RcCalculatePictureQp`, whose bounds are themselves clipped to
`pTOverRc->iMinQp`/`iMaxQp`)
([`ratectl.cpp`](https://github.com/cisco/openh264/blob/master/codec/encoder/core/src/ratectl.cpp)).
Note the final `WELS_CLIP3(..., GOM_MIN_QP_MODE, ...)`: even a caller who
*did* set `iMinQp` could not go below 12 through this path.

**How that lines up with observation (a).** This is an inference from the
sources above, not a measurement:

- Camera usage (Marey's default, no `contentHint`) gives a floor of QP 12.
  Once the rate controller reaches QP 12 it cannot spend more bits, so any
  target above the bitrate that QP 12 needs is ignored. That would explain a
  plateau (~2,060 kbit/s here) that does not move from 8M to 20M, and why a
  1 Mbit/s target *is* honoured (below the plateau).
- `contentHint: "text"` maps to `ContentHint::Screen` (Blink maps `"detail"`
  and `"text"` to `Screen`, `"motion"` to `Camera`:
  [`video_encoder.cc` ~L268-278](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webcodecs/video_encoder.cc#268)),
  hence `SCREEN_CONTENT_REAL_TIME` and a floor of QP 26. That predicts the
  lower bitrate and PSNR seen with `"text"` (690 kbit/s, 38 dB).
- Constant vs variable make no difference because Chromium maps both to
  `RC_BITRATE_MODE` and sets `iMaxSpatialBitrate = iTargetBitrate`.
- The *PSNR* ceiling is probably not the QP floor alone. That H.264 at QP 12
  usually gives luma PSNR well above 40 dB is general codec knowledge, not
  something a source here states (**unverified**). Observation (b) reports the same
  ~40 dB for VP9 profile 0 even at quantizer 4, and 45 dB once chroma is 4:4:4.
  That points to RGB→YUV 4:2:0 conversion (chroma halved in both axes) as the
  main PSNR limit for flat-colour vector content, *if* the PSNR was measured in
  RGB against the source canvas. Not established here; see Open questions.

**Can WebCodecs lift the ceiling on this path?** Per the sources above, no
WebCodecs field on the software path reaches `iMinQp`. Every field the
Chromium file reads (`bitrate`, `bitrateMode` apart from `quantizer`,
`contentHint`, `latencyMode`, `framerate`, keyframe interval, profile) is
listed above. `bitrateMode: "quantizer"` is the one API that would bypass
rate control, and OpenH264 in Chromium refuses it (~L235-239), which matches
the "unsupported" result in (a).

**`bitrateMode: "quantizer"` for avc.** The API shipped in **Chrome 117**
(desktop and Android): "Adds 'quantizer' VideoEncoderBitrateMode for
VideoEncoder. This allows to specify quantizer parameter for each frame for
AV1, VP9, and AVC video codecs."
([chromestatus 5783986600673280](https://chromestatus.com/api/v0/features/5783986600673280);
[blink-dev Intent to Implement and Ship, 2023-07-06](https://groups.google.com/a/chromium.org/g/blink-dev/c/UZWH1LuwBas)).
Blink reads a per-frame `avc.quantizer` when the mode is external
([`video_encoder.cc` ~L1172-1180](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webcodecs/video_encoder.cc#1172)),
and the AVC registration defines it, range 0-51
([AVC registration §6.1](https://www.w3.org/TR/webcodecs-avc-codec-registration/#dom-videoencoderencodeoptionsforavc-quantizer)).
Whether it *works* depends on the encoder behind it. The OpenH264 software
encoder rejects it in every version whose source was read here (current
`main`). The Windows Media Foundation hardware encoder has a
`case Bitrate::Mode::kExternal:` that selects
`eAVEncCommonRateControlMode_Quality` and sets `CODECAPI_AVEncVideoEncodeQP`
per frame
([`media_foundation_video_encode_accelerator_win.cc` ~L1259, ~L2192-2195](https://chromium.googlesource.com/chromium/src/+/main/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc#1259)),
so on a machine whose GPU MFT exposes that QP control, `prefer-hardware` avc
with `quantizer` may be supported. This was not tested, and the source was
not traced to which Chrome version first enabled it for H.264.

## 2. VP9 profile 1 (4:4:4) in WebM: encode and playback

### 2.1 Encoding in Chromium (documented in source)

- **Supported since Chrome 123 (software, libvpx).** Commit `1ee55c1` "Add
  4:4:4 encoding to WebCodecs for VP9. Simplify VpxVideoEncoder." (2024-01-26):
  > "This adds support for configurable subsampling to WebCodecs ... Both I444
  > (profile 1) and I444P10 (profile 3) encoding are added."

  `Cr-Commit-Position: refs/heads/main@{#1252908}`, Bug 1116617, 1116564,
  1378115
  ([GitHub mirror](https://github.com/chromium/chromium/commit/1ee55c1cd1cd7fd23a887a50edd1e571ef9147b2)).
  1252908 is after the M122 branch point (1250580) and before M123's
  (1262506)
  ([chromiumdash](https://chromiumdash.appspot.com/fetch_milestones?only_branched=true)),
  so the first release carrying it is **M123**, unless merged back (not
  checked). The same commit touched Blink's `video_encoder.cc` and added a WPT
  case to `webcodecs/full-cycle-test.https.any.js`.
- **The code today.** `media/video/vpx_video_encoder.cc` accepts
  `VP9PROFILE_PROFILE1` with `g_profile = 1` at `VPX_BITS_8`, rejects other
  subsamplings with "Only 4:4:4 subsampling is supported with VP9 profiles 1
  and 3", and converts non-I444 input frames to `PIXEL_FORMAT_I444` before
  handing libvpx a `VPX_IMG_FMT_I444` image
  ([`vpx_video_encoder.cc` ~L288-346, ~L583-587](https://chromium.googlesource.com/chromium/src/+/main/media/video/vpx_video_encoder.cc#288)).
  Profiles 2 and 3 are gated on `VPX_CODEC_CAP_HIGHBITDEPTH`; profile 1 is
  not. A `TODO(crbug.com/40144811): Support 4:2:2 subsampling` sits next to
  the check.
- **Other libvpx settings that bear on quality**, from the same file: default
  `rc_min_quantizer = 2`, `rc_max_quantizer = 58` (libvpx's 0-63 scale),
  widened to `0..63` in quantizer (external) mode; `VP8E_SET_CPUUSED` is `7`
  for VP9; the encode deadline is `VPX_DL_REALTIME` regardless of
  `latencyMode`; `g_threads = GetNumberOfThreadsForSoftwareEncoding(...)`.
  The quantizer range exposed to WebCodecs for VP9/AV1 changed from 0-63 to
  0-255 in commit `fd41e03` (2025-12-02, "webcodecs: Change QP range for VP9
  and AV1 from 0-63 to 0-255"), and its feature flag was removed in `ca9257c`
  (2026-02-24)
  ([GitHub commits for the file](https://api.github.com/repos/chromium/chromium/commits?path=media/video/vpx_video_encoder.cc&per_page=100)).
  Marey's "quantizer 4" in observation (b) is therefore on whichever scale the
  test browser used.
- **Decode support in Chromium itself.** `IsDecoderVp9ProfileSupported`
  returns `true` for `VP9PROFILE_PROFILE0` and `VP9PROFILE_PROFILE1` whenever
  libvpx is built in (colour space permitting); profiles 2/3 need
  `VPX_CODEC_CAP_HIGHBITDEPTH`. On Android it only checks colour space
  ([`media/base/supported_types.cc` ~L246-269](https://chromium.googlesource.com/chromium/src/+/main/media/base/supported_types.cc#246)).

### 2.2 Playback elsewhere

| Target | VP9 profile 1 (8-bit 4:4:4) | Source | Status |
|---|---|---|---|
| Chrome desktop | Decodes (libvpx) | `IsDecoderVp9ProfileSupported`: `case VP9PROFILE_PROFILE0: case VP9PROFILE_PROFILE1: return true;` ([`supported_types.cc` ~L246-269](https://chromium.googlesource.com/chromium/src/+/main/media/base/supported_types.cc#246)) | Documented in source |
| Chrome Android | Source only checks colour space on Android (`#if BUILDFLAG(IS_ANDROID) return IsColorSpaceSupported(type.color_space);`), same function | same | Whether the Android decoder actually decodes 4:4:4 is **unknown** |
| Firefox | libvpx path accepts `VPX_IMG_FMT_I444`, sets `ChromaSubsampling::FULL` and full-size chroma planes ([`VPXDecoder.cpp` ~L243-257](https://searchfox.org/mozilla-central/source/dom/media/platforms/agnostic/VPXDecoder.cpp#243)) | Gecko source | Documented in source for the libvpx decoder. Firefox desktop may route VP9 through its FFmpeg (ffvpx) decoder instead; which decoder handles a given file was **not traced** |
| Safari macOS / iOS | **Rejected.** `isVP9CodecConfigurationRecordSupported`: "// HW & SW VP9 Decoders support Profile 0 & 2: `if (codecConfiguration.profile && codecConfiguration.profile != 2) return false;`" and "// HW & SW VP9 Decoders support only 420 chroma subsampling" ([`VP9UtilitiesCocoa.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/cocoa/VP9UtilitiesCocoa.mm)) | WebKit source (`main`) | Documented in source; applies to every WebKit-on-Cocoa browser, including all iOS browsers |
| Windows built-in players (Media Player / Films & TV via the VP9 Video Extensions) | Media Foundation maps Matroska `V_VP9` to `MFVideoFormat_VP90` ([MKV support](https://learn.microsoft.com/en-us/windows/win32/medfound/mkv-support)). No Microsoft page found that states which VP9 profiles or subsamplings the decoder handles. The Store listing ([VP9 Video Extensions](https://apps.microsoft.com/detail/9n4d0msmp0pt)) did not render for the fetch tool | Microsoft docs | **Unknown** |
| YouTube upload | WebM is on the accepted list: ".MOV, .MPEG-1, .MPEG-2, .MPEG4, .MP4, .MPG, .AVI, .WMV, .MPEGPS, .FLV, 3GPP, WebM, DNxHR, ProRes, CineForm, HEVC (H.265)" ([Supported YouTube file formats](https://support.google.com/youtube/troubleshooter/2888402?hl=en)). Recommended settings are H.264, 4:2:0, MP4 ([Recommended upload encoding settings](https://support.google.com/youtube/answer/1722171?hl=en)) | YouTube Help | Container accepted (documented). Whether a VP9 **profile 1** WebM transcodes correctly is **unknown**: no page mentions VP9 profiles |
| X / Twitter upload | API guidance: "Pixel format: Only YUV 4:2:0 is supported"; recommended codec "H264 High Profile", minimum video bitrate 5,000 kbps ([X API media best practices](https://docs.x.com/x-api/media/quickstart/best-practices)) | X developer docs | Documented for API uploads: a 4:4:4 stream falls outside it. The help-centre page for the web/app uploader returned 403, so the consumer-upload rules were **not read** |
| Discord | No first-party page lists playable codecs. The [File Attachments FAQ](https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ) was only seen as a search snippet. The desktop client is Electron (Chromium), so inline playback would *probably* follow Chrome's decoder (inference, not documented) | none primary | **Unknown / unverified** |

Summary of 2.2: VP9 profile 1 plays in Chromium and (per source) Firefox's
libvpx path. Safari on every Apple platform refuses it by name. Windows'
built-in decoder, YouTube's transcoder and Discord have no primary source
either way. X's API documents 4:2:0 only.

## 3. Can mediabunny 1.58.0 mux a VP9 profile 1 track?

Short answer from the source: **yes, but only with a 4-field or 9-field VP9
codec string, and only the 9-field form labels the chroma subsampling
correctly.** The 5-field string used in observation (b),
`vp09.01.30.08.03`, is rejected by the muxer's validator. Nothing below was
run; it is read from `node_modules/mediabunny` (version `1.58.0`,
`node_modules/mediabunny/package.json`).

**Where the container's codec string comes from.** mediabunny does not
rebuild it. Each muxer takes `meta.decoderConfig.codec` from the chunk
metadata the `VideoEncoder` emits. Chromium fills that field with the string
passed to `configure()`:
> `decoder_config->setCodec(active_config->codec_string);`

([Blink `video_encoder.cc` ~L1839, `CallOutputCallback`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webcodecs/video_encoder.cc#1839)).
With mediabunny's `VideoSampleSource`, that string is
`options.fullCodecString ?? buildVideoCodecString(...)`
(`node_modules/mediabunny/src/encode.ts:396`). The `.d.ts` documents the
option as "The full codec string as specified in the Mediabunny Codec
Registry. This string must match the codec specified in `codec`. When not
set, a fitting codec string will be constructed automatically by the
library." (`node_modules/mediabunny/dist/mediabunny.d.ts:4794-4798`). Left
to itself, mediabunny always builds profile 0: `const profile = '00'; //
Profile 0` (`node_modules/mediabunny/dist/modules/src/codec.js:222-225`).
Marey already passes its own string (`src/compiler/export/videoEncode.ts:61`,
`videoContract.ts:196-198`).

**The validator.** Every muxer calls `validateVideoChunkMetadata(meta,
track.source._codec)` on the first packet
(`node_modules/mediabunny/src/matroska/matroska-muxer.ts:811`,
`node_modules/mediabunny/src/isobmff/isobmff-muxer.ts:407`). For VP9 it
requires:
> `const VP9_CODEC_STRING_REGEX = /^vp09(?:\.\d{2}){3}(?:(?:\.\d{2}){5})?$/;`

(`node_modules/mediabunny/src/codec.ts:965`, used at `codec.ts:1117`, which
throws "Video chunk metadata decoder configuration codec string for VP9 must
be a valid VP9 codec string as specified in Section "Codecs Parameter String"
of https://www.webmproject.org/vp9/mp4/."). That is exactly 4 fields
(`vp09.PP.LL.DD`) or exactly 9 (`...CC.cp.tc.mc.FF`). A 5-field string fails.
`fullCodecString` itself is only checked for a matching prefix
(`inferCodecFromCodecString`, `dist/modules/src/codec.js:685-696`), so
`configure()` would accept it and the failure would come at the first
encoded packet. (Inference from the code path. Not run.)

**How the subsampling reaches the file.**
- WebM: the Matroska muxer derives `CodecPrivate` from the codec string
  because "WebCodecs makes no use of the description field for VP9"
  (`node_modules/mediabunny/src/matroska/matroska-muxer.ts:848`), via
  `generateVp9CodecConfigurationFromCodecString`, which writes feature IDs 1-4
  (profile, level, bit depth, chroma subsampling) and defaults the last:
  > `const chromaSubsampling = parts[4] ? Number(parts[4]) : 1;`

  (`node_modules/mediabunny/src/codec.ts:347-362`).
- MP4: the `vpcC` box does the same:
  > `const chromaSubsampling = parts[4] ? Number(parts[4]) : 1; // 4:2:0 colocated with luma (0,0)`

  and packs `(bitDepth << 4) + (chromaSubsampling << 1) + videoFullRangeFlag`
  (`node_modules/mediabunny/src/isobmff/isobmff-boxes.ts:840-883`).

So, per the code:

| Codec string passed | Validator | Container chroma field |
|---|---|---|
| `vp09.01.LL.08` (4 fields) | passes | `1` = 4:2:0 colocated, **wrong** for a 4:4:4 stream |
| `vp09.01.LL.08.03` (5 fields) | **throws** on first packet | n/a |
| `vp09.01.LL.08.03.cp.tc.mc.FF` (9 fields) | passes | `3` = 4:4:4, correct |

The value 3 = 4:4:4 comes from the VP9 codec-string definition that
mediabunny's comment cites (webmproject.org/vp9/mp4, "Codecs Parameter
String"); that page itself was not re-fetched for this note.

The VP9 bitstream also carries profile and subsampling in its own frame
header, so a decoder that ignores the container field might still decode a
4-field-labelled file. Players that check the container record first would
see 4:2:0; WebKit's check, for instance, runs on a
`VPCodecConfigurationRecord` (§2.2). What any particular player does with a
mislabelled file is **unknown**.

**Related mediabunny facts.**
- mediabunny has its own quality API that tries quantizer mode first and
  falls back to bitrate mode: "Multiple configs are returned when a Quality
  can be satisfied by multiple rate control methods (quantizer-based encoding
  with a bitrate-based fallback)." (`node_modules/mediabunny/src/encode.ts:370`,
  candidates built at `encode.ts:420-431`). Its quantizer ranges are
  `avc: { min: 0, max: 51, ... }`, `vp9: { min: 0, max: 63, ... }`,
  `av1: { min: 0, max: 255, ... }` (`node_modules/mediabunny/src/encode.ts:917-920`).
  Chromium moved WebCodecs' VP9 *and* AV1 quantizer range to 0-255 in
  `fd41e03` (2025-12-02) (§2.1). The spec changed too. The W3C TR VP9
  registration (14 May 2025) says "In [VP9] the quantizer threshold can be
  varied from 0 to 63"
  ([TR](https://www.w3.org/TR/webcodecs-vp9-codec-registration/#dom-videoencoderencodeoptionsforvp9-quantizer)),
  while the editor's draft (4 December 2025) says "In [VP9] the quantizer
  index can be varied from 0 to 255"
  ([ED](https://w3c.github.io/webcodecs/vp9_codec_registration.html#dom-videoencoderencodeoptionsforvp9-quantizer)).
  mediabunny 1.58.0's VP9 range of 0-63 therefore matches the old text, not
  current Chrome. The AVC range is unchanged: "In [ITU-T-REC-H.264] the
  quantizer threshold can be varied from 0 to 51"
  ([AVC registration §6.1](https://www.w3.org/TR/webcodecs-avc-codec-registration/#dom-videoencoderencodeoptionsforavc-quantizer)).
  Not tested; see Open questions.
- The deprecated top-level `bitrateMode` option accepts only `'constant'` or
  `'variable'` (`node_modules/mediabunny/src/encode.ts:326`). Quantizer mode
  is reachable only through `Quality`.

## 4. Alternatives for high-quality H.264 MP4 without a server

### 4.1 ffmpeg.wasm with libx264

**Size.** `@ffmpeg/core@0.12.10` (single thread; described as "FFmpeg
WebAssembly version (single thread)") ships `dist/esm/ffmpeg-core.wasm` at
**32,232,419 bytes** plus a 111,804-byte JS glue file. The UMD build
duplicates both, giving an npm unpacked size of 64,689,644 bytes
([npm registry](https://registry.npmjs.org/@ffmpeg/core/latest);
[unpkg file listing](https://unpkg.com/@ffmpeg/core@0.12.10/?meta)).
`@ffmpeg/core-mt@0.12.10` ("multi thread") is 65,700,111 bytes unpacked
([npm registry](https://registry.npmjs.org/@ffmpeg/core-mt/latest)).
These sizes are before compression and are not transfer sizes.

**What is compiled in.** The project Dockerfile builds x264 (branch
`4-cores`), x265 3.4, libvpx v1.13.1 and others, and configures FFmpeg with
`--enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx ...`
([`Dockerfile`](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/Dockerfile)).
x264 is configured with `--disable-cli`, `--disable-asm`, and
`--disable-thread` when `FFMPEG_ST` is set, i.e. for the single-thread core
([`build/x264.sh`](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/build/x264.sh)).

**Threading and cross-origin isolation.** Single-thread core: no special
headers are documented. Multi-thread core: "As SharedArrayBuffer is required
for multithread version, make sure you have have fulfilled Security
Requirements" [sic], and it needs an extra `workerURL`
([ffmpeg.wasm usage docs](https://ffmpegwasm.netlify.app/docs/getting-started/usage)).
MDN: "To use shared memory your document must be in a secure context and
cross-origin isolated"
([MDN `SharedArrayBuffer` §Security requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements)),
which means `Cross-Origin-Opener-Policy: same-origin` together with
`Cross-Origin-Embedder-Policy: require-corp` or `credentialless`
([MDN `crossOriginIsolated`](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated)).
The FAQ says the multi-thread core gives "around 2x speed comparing to single
thread" and that "WebAssembly is still a lot slower than native"
([FAQ](https://ffmpegwasm.netlify.app/docs/faq)). Static hosts that cannot
set response headers cannot use the multi-thread core. Whether Marey's host
can set them is a repo/deployment question outside this note.

**Is single-threaded x264 deterministic?** The primary sources support a
qualified yes. None of them states it directly, so this is inference:
- x264's two repeatability knobs concern threads and CPU dispatch:
  `b_deterministic` "whether to allow non-deterministic optimizations when
  threaded", and `b_cpu_independent` "force canonical behavior rather than
  cpu-dependent optimal algorithms"
  ([`x264.h`, GitHub mirror of code.videolan.org](https://github.com/mirror/x264/blob/master/x264.h)).
  CLI help: `--non-deterministic` "Slightly improve quality of SMP, at the
  cost of repeatability"; `--cpu-independent` "Ensure exact reproducibility
  across different cpus, as opposed to letting them select different
  algorithms" ([`x264.c`, same mirror](https://github.com/mirror/x264/blob/master/x264.c)).
- The single-thread ffmpeg.wasm build removes both sources of variation:
  threads (`--disable-thread`) and CPU-specific assembly (`--disable-asm`)
  (`build/x264.sh`, above).
- WebAssembly's own nondeterminism is limited to a listed set: NaN bit
  patterns, shared-memory races, relaxed-SIMD results, resource exhaustion,
  and host calls ([WebAssembly design, `Nondeterminism.md`](https://github.com/WebAssembly/design/blob/main/Nondeterminism.md)).
  None of these obviously applies to a single-threaded integer-heavy encoder.
  Whether Emscripten emitted relaxed-SIMD for this build was **not checked**.
- code.videolan.org served an anti-bot page to the fetch tool, so x264 was
  read through the GitHub mirror (`mirror/x264`), not the canonical host.

**Quality controls it would expose** (from the same `x264.c` help text):
`--qp` "Force constant QP (0-69, 0=lossless)", `--crf`, tunings including
`animation` and `stillimage`, `--output-csp` "i400, i420, i422, i444, rgb",
and profile `high444` ("Support for 4:2:0/4:2:2/4:4:4 chroma subsampling").
None of the OpenH264 QP floors from §1 apply.

**Licence.** `@ffmpeg/core` and `@ffmpeg/core-mt` are published as
`"license": "GPL-2.0-or-later"` (npm registry, above). The FAQ: "@ffmpeg/core
contains WebAssembly code ... following the same licenses as FFmpeg and its
external libraries", while "@ffmpeg/ffmpeg ... is under MIT license"
([FAQ](https://ffmpegwasm.netlify.app/docs/faq)). The README badge says MIT
for the repository ([README](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/README.md)).
x264's header: "either version 2 of the License, or (at your option) any
later version", and "This program is also available under a commercial
proprietary license. For more information, contact us at licensing@x264.com."
([`x264.h`](https://github.com/mirror/x264/blob/master/x264.h)).
GPL consequences for a web app that serves this wasm: see 4.1a.

#### 4.1a What GPL-2.0 says that bears on shipping it

Quoted from the licence text
([SPDX GPL-2.0-or-later](https://spdx.org/licenses/GPL-2.0-or-later.html);
gnu.org rate-limited the fetch):

- §3: "You may copy and distribute the Program (or a work based on it, under
  Section 2) in object code or executable form under the terms of Sections 1
  and 2 above provided that you also do one of the following: a) Accompany
  it with the complete corresponding machine-readable source code ..."
- §3: "If distribution of executable or object code is made by offering
  access to copy from a designated place, then offering equivalent access to
  copy the source code from the same place counts as distribution of the
  source code ..."
- §2: "These requirements apply to the modified work as a whole. If
  identifiable sections of that work are not derived from the Program, and
  can be reasonably considered independent and separate works in themselves,
  then this License, and its terms, do not apply to those sections when you
  distribute them as separate works."
- §2: "In addition, mere aggregation of another work not based on the
  Program with the Program ... on a volume of a storage or distribution
  medium does not bring the other work under the scope of this License."

What the text settles: serving the `.wasm` to browsers is distributing
object code, so the corresponding source (FFmpeg, x264 and the other GPL
libraries at the built revisions, plus build scripts) has to be offered
alongside it, e.g. from the same place (§3). What it does **not** settle: whether
Marey's own TypeScript, which would drive the wasm through ffmpeg.wasm's
MIT wrapper in a worker, is "a work based on the Program" or "mere
aggregation". That is a legal-interpretation question these texts cannot
answer; see Open questions. Repo fact relevant to it: Marey is **MIT**
licensed. `main` gained a root `LICENSE` and `"license": "MIT"` in
`package.json` in `540f6ed`. That commit was not on the `phase-5b-video`
branch this note was written on, which is why an earlier version of this
paragraph said the licence was undeclared (corrected at the Phase 5B
merge). So the question is whether an MIT app may drive a GPL wasm module
it ships. x264's alternative commercial licence (above) is the documented
route for avoiding GPL terms.

### 4.2 Permissively licensed wasm H.264 encoders

**minih264.** The repository is licensed CC0-1.0 per GitHub's licence
detection ([lieff/minih264](https://github.com/lieff/minih264)); the README
has no licence paragraph of its own. Per the README it covers Baseline
features and lists what it lacks compared with x264 baseline: "Trellis
quantization", "Select prediction mode using Sum of Absolute Transform
Differences (SATD)", "4x4 motion compensation". It also says "Code highly
experimental"
([README](https://github.com/lieff/minih264/blob/master/README.md)).
Quality controls in the public header: `qp_min` "Minimum quantizer value, 10
indicates good quality. range: [10; qp_max]", `qp_max` "... range: [qp_min;
51]", `encode_speed` "0 means best quality", `desired_frame_bytes` "Target
frame size", and `fine_rate_control_flag`. Input is planar YUV 4:2:0
([`minih264e.h`](https://github.com/lieff/minih264/blob/master/minih264e.h)).
So its floor is QP 10, against OpenH264's 12 (§1), and it has no 4:4:4.

**h264-mp4-encoder** (npm, `"license": "MIT"`, v1.0.12, 7,491,182 bytes
unpacked) is minih264 compiled with Emscripten plus libmp4v2 for muxing
([npm registry](https://registry.npmjs.org/h264-mp4-encoder/latest)). Its
README describes it as "public domain minih264" with "libmp4v2" under "MPL
1.1". It exposes `quantizationParameter` "[10..51]" default 33, `speed`
"[0..10]" default 0, `groupOfPictures` default 20 and `kbps` which "Overwrites
quantization_parameter if not 0". Width and height must be "a multiple of
2", and the wasm is inlined via "`-s SINGLE_FILE=1`"
([README](https://github.com/TrevorSundberg/h264-mp4-encoder/blob/master/README.md)).
The last-published date and maintenance status were not checked. Using it
would replace mediabunny for MP4 muxing, or require feeding its raw NALs to
mediabunny instead, which was not investigated.

**OpenH264 compiled to wasm.** The source is BSD ("BSD, see `LICENSE` file
for details"). Its encoder feature list says "Constrained Baseline Profile
up to Level 5.2", with "Rate control with adaptive quantization, or constant
quantization" ([README](https://github.com/cisco/openh264/blob/master/README.md)).
That profile line is consistent with observation (a)'s emitted
`avc1.42c01f` (0x42 = Baseline, constraint byte 0xC0, level 0x1F = 3.1)
whatever profile was requested. A self-built OpenH264 would remove
Chromium's missing `iMinQp` setting, but not `ParamValidation`'s clip to
`GOM_MIN_QP_MODE` = 12 (§1), unless the build were patched. On patents,
Cisco says of *its* binary: "We have provided a binary form suitable for
inclusion in applications ... and make this binary module available for
download from the Internet" and "We will not pass on our MPEG-LA licensing
costs for this module" ([openh264.org](https://www.openh264.org/)). The page
read here does not say whether a third party's own wasm build is covered;
see Open questions. No maintained, published OpenH264 wasm package was
identified in this pass.

H.264 patent licensing for *any* self-shipped encoder (minih264, x264,
OpenH264 built by someone other than Cisco) is outside what these sources
settle. WebCodecs sidesteps it because the browser supplies the encoder.

### 4.3 Chromium `prefer-hardware` on Windows (Media Foundation): determinism

No primary source found guarantees repeatable output, and the source read
shows output depending on hardware, driver and flags:

- The spec leaves the preference advisory: user agents are not obliged to
  honour `hardwareAcceleration` ([WebCodecs §HardwareAcceleration](https://www.w3.org/TR/webcodecs/#hardware-acceleration);
  paraphrased by the fetch tool, see Verification status). The fetch also
  found no determinism guarantee anywhere in the spec (an absence claim).
- Chromium's MF encoder picks rate-control modes per `Bitrate::Mode` (CBR,
  PeakConstrainedVBR, or Quality for external), can replace the MFT's rate
  control with Chromium's own software BRC behind feature flags
  (`kMediaFoundationUseSoftwareRateCtrl`,
  `kMediaFoundationUseSWBRCForH264Camera`,
  `kMediaFoundationUseSWBRCForH264Desktop`,
  `kMediaFoundationSWBRCForH264ForceAMDGPU`, ...), and has vendor-specific
  branches such as skipping NVIDIA for constrained-baseline H.264
  ("https://crbug.com/1088650")
  ([`media_foundation_video_encode_accelerator_win.cc`](https://chromium.googlesource.com/chromium/src/+/main/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc)).
  The encoder itself is a vendor MFT (Intel/AMD/NVIDIA/Qualcomm), whose
  internals are not public.
- Consequence, by inference: the same export on two machines, or on one
  machine after a driver or Chrome update, has no documented reason to be
  byte-identical. Whether one machine repeats byte-identically on
  consecutive runs is **undocumented**; it would have to be measured per
  GPU vendor.

## 5. H.264 High 4:4:4 or AV1 4:4:4 via WebCodecs in Chromium

**H.264 High 4:4:4: not supported by the built-in (software) encoder.**
`IsEncoderH264BuiltInVideoType` accepts only Baseline, Main, High and
Extended, and returns `false` for the rest
([`media/base/supported_types.cc` ~L430-455](https://chromium.googlesource.com/chromium/src/+/main/media/base/supported_types.cc#430)):

> ```
> case H264PROFILE_HIGH10PROFILE:
> case H264PROFILE_HIGH422PROFILE:
> case H264PROFILE_HIGH444PREDICTIVEPROFILE:
> ...
>   // Although some of these profiles are supported by openH264, but we don't
>   // wire them for now.
>   return false;
> ```

The OpenH264 wrapper also fails `configure` for any profile its
`ToOpenH264Profile` does not map, which covers only Baseline, Main, Extended
and High
([`openh264_video_encoder.cc` ~L30-50, ~L226-230](https://chromium.googlesource.com/chromium/src/+/main/media/video/openh264_video_encoder.cc#226)):
> `"Unsupported profile: " + GetProfileName(profile)`

Chromium's code does not settle whether a *hardware* encoder could accept a
High 4:4:4 string. The Media Foundation encoder read for §1 has no
`H264PROFILE_HIGH444` handling, and its input formats are NV12/I420 (fetch
reading of
[`media_foundation_video_encode_accelerator_win.cc`](https://chromium.googlesource.com/chromium/src/+/main/media/gpu/windows/media_foundation_video_encode_accelerator_win.cc)),
so there is nothing in the source to suggest it would. Not tested.

**AV1 4:4:4: supported by the software (libaom) encoder since Chrome 123.**
`IsEncoderAv1BuiltInVideoType` returns `true` for `AV1PROFILE_PROFILE_MAIN`
and `AV1PROFILE_PROFILE_HIGH`, `false` for Professional ("We don't build
libaom with high bit depth support.")
([`supported_types.cc` ~L487-498](https://chromium.googlesource.com/chromium/src/+/main/media/base/supported_types.cc#487)).
The encoder requires 4:4:4 for High
([`media/video/av1_video_encoder.cc`](https://chromium.googlesource.com/chromium/src/+/main/media/video/av1_video_encoder.cc)):

> `case AV1PROFILE_PROFILE_HIGH: if (opts.subsampling != VideoChromaSampling::k444) { return EncoderStatus(..., "High profile only supports 4:4:4 subsampling."); } config.g_profile = 1;`

It landed in commit `d51e4f6` "Implement 4:4:4 encoding for AV1 high profile
w/ WebCodecs." (2024-01-29, `Cr-Commit-Position: refs/heads/main@{#1253628}`,
Bug 1116564, 1378115)
([GitHub mirror](https://github.com/chromium/chromium/commit/d51e4f6961e7cb5b5bf9300bec2322a9f718cc66)).
Position 1253628 lies between the M122 branch point (1250580) and the M123
branch point (1262506)
([chromiumdash `fetch_milestones`](https://chromiumdash.appspot.com/fetch_milestones?only_branched=true)),
so it first shipped in **M123**, unless it was merged back to M122 (not
checked).

Other libaom settings in the same file that bear on quality:
- `config.rc_min_quantizer = 10; config.rc_max_quantizer = 56;` by default,
  widened to `1..63` only in quantizer (external) mode.
- `const int cpu_speed = (options.latency_mode == LatencyMode::Realtime) ? 9 : 7;`
  and "libaom is compiled with CONFIG_REALTIME_ONLY, so we can't use anything
  but AOM_USAGE_REALTIME."
- `contentHint` Screen turns on `AV1E_SET_TUNE_CONTENT, AOM_CONTENT_SCREEN`
  and palette mode (`AV1E_SET_ENABLE_PALETTE, 1`), which is aimed at
  flat-colour content.

AV1 is not an MP4-with-H.264 answer. It is listed because it is the one
4:4:4 codec Chromium's software encoders offer besides VP9 profile 1. Who can
*play* AV1 High profile (4:4:4) was not researched; see Open questions.

## 6. pixi.js 8.16.0 and rasterizing at resolution 2

Installed version: `8.16.0` (`node_modules/pixi.js/package.json`).

**What `extract.canvas({ resolution })` does.** `ExtractSystem.canvas`
calls `renderer.textureGenerator.generateTexture(options)`, then
`renderer.texture.generateCanvas(texture)`, then `texture.destroy(true)`
(`node_modules/pixi.js/lib/rendering/renderers/shared/extract/ExtractSystem.mjs:173-183`).
`generateTexture`:
- `const resolution = options.resolution || this._renderer.resolution;` and
  `const antialias = options.antialias || this._renderer.view.antialias;`
  (`.../extract/GenerateTextureSystem.mjs:63-64`). Resolution 0 or undefined
  falls back to the renderer's resolution, which Marey sets to 1
  (`src/compiler/export/videoPipeline.ts:156`).
- The region is in logical units: `region.width = Math.max(region.width, 1 / resolution) | 0;`
  and it creates a fresh `RenderTexture.create({ ..., width: region.width, height: region.height, resolution, antialias })`
  per call (`GenerateTextureSystem.mjs:73-82`). So at `resolution: 2` with
  Marey's `frame: region` of 800x600 the backing texture is 1600x1200 device
  pixels.
- Readback: `getPixels` computes `Math.round(frame.width * resolution)` by
  `Math.round(frame.height * resolution)`, allocates `new Uint8Array(BYTES_PER_PIXEL * width * height)`,
  calls `gl.readPixels` from the resolve framebuffer, then `generateCanvas`
  creates a new canvas of that size and copies in via `createImageData` and
  `putImageData`
  (`node_modules/pixi.js/lib/rendering/renderers/gl/texture/GlTextureSystem.mjs:366-404`).
  The returned canvas is therefore **1600x1200**, not 800x600.

**Memory per frame (arithmetic from the code above).** At 1600x1200:
- CPU: `Uint8Array` readback 7,680,000 B, plus an `ImageData` of the same size,
  plus the canvas backing store, which is transient per frame. That is about 3 x 7.7 MB
  before GC, against about 3 x 1.9 MB at resolution 1. The pipeline already notes
  "about 1.9 MB per 800x600 frame" for the canvas alone
  (`src/compiler/export/videoPipeline.ts:96-99`).
- GPU: the colour texture (7.68 MB) plus, when `antialias` is true (Marey passes
  `antialias: true`, `frameRaster.ts:158`), a multisample renderbuffer with a
  **hard-coded sample count of 4**:
  `gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, glInternalFormat, source2.pixelWidth, source2.pixelHeight)`
  (`.../gl/renderTarget/GlRenderTargetAdaptor.mjs:314-320`), i.e. about 4 x
  7.68 MB. Both are created and destroyed on every call because
  `extract.canvas` destroys the texture it generated. MSAA is only enabled
  `if (renderer.context.supports.msaa)`; otherwise PixiJS warns
  "[RenderTexture] Antialiasing on textures is not supported in WebGL1"
  (`GlRenderTargetAdaptor.mjs:235-240`).

**Limits.** PixiJS 8.16.0 does **not** check the texture size against the
device. Grepping `node_modules/pixi.js/lib` for `MAX_TEXTURE_SIZE`,
`maxTextureSize`, `MAX_RENDERBUFFER_SIZE` and `maxTextureDimension2D`
finds nothing. `GlLimitsSystem` records only `MAX_TEXTURE_IMAGE_UNITS` and
`MAX_UNIFORM_BUFFER_BINDINGS`
(`node_modules/pixi.js/lib/rendering/renderers/gl/GlLimitsSystem.mjs:9-15`).
The effective ceiling is the WebGL context's `MAX_TEXTURE_SIZE`,
`MAX_RENDERBUFFER_SIZE` and `MAX_SAMPLES`, which vary by device. The
OpenGL ES 3.0 minimums (2048 for texture/renderbuffer size, 4 for samples)
are from memory and were **not re-checked** against the Khronos
specification. At 2x, a scene whose declared size exceeds half the device
limit in either axis would exceed it.

**Interaction with mediabunny's frame size.** mediabunny sizes the encoder
from the first sample: `width: videoSample.codedWidth, height:
videoSample.codedHeight` (`node_modules/mediabunny/src/media-source.ts:664-672`).
A 1600x1200 canvas therefore produces a 1600x1200 video unless the encoding
config sets `transform.width/height`. In that case mediabunny downsamples
through a 2D canvas with `imageSmoothingQuality = 'high'` and its own
halving "manual mipmapping" beyond 2x
(`node_modules/mediabunny/src/sample.ts:1462-1481`). Two consequences follow
from the code, neither measured:
- A 2x export at 2x output size changes the codec level Marey picks
  (`h264LevelFor`/`vp9LevelFor` take width and height,
  `src/compiler/export/videoContract.ts:420-423`). It also raises the bitrate
  the OpenH264 QP-12 floor would settle at (§1), since there are four times
  the pixels.
- A 2x render downsampled to 1x goes through the browser's 2D-canvas
  resampler, whose exact filter the HTML spec does not pin to a formula.
  That adds a step whose byte-for-byte repeatability across browsers or GPUs
  is **unverified**.

## Open questions

The primary sources read here could not settle these.

1. **Is the QP-12 floor what caps observation (a)?** The sources show the
   floor exists and that WebCodecs cannot move it. They do not show that the
   ~2,060 kbit/s plateau *is* QP 12. The encoded stream's per-frame QPs were
   not read. Parsing slice QPs from one exported MP4 would settle it.
2. **How was PSNR measured, and is 4:2:0 the ~40 dB ceiling?** If PSNR was
   computed in RGB against the source canvas, chroma subsampling plus the
   RGB→YUV matrix/range conversion may dominate (§1). The colour matrix and
   range Chromium uses when converting an RGB canvas frame to I420 were not
   traced (`VideoFrame` from canvas, then `frame_converter_`).
3. **Did Chromium's H.264 profile request reach the bitstream?** Observation
   (a) reports `avc1.42c01f` regardless of the requested profile. The
   OpenH264 README lists only "Constrained Baseline" for the encoder, yet
   Chromium maps `H264PROFILE_HIGH` to `PRO_HIGH`. Whether Chromium's pinned
   OpenH264 revision emits Main/High (CABAC) when asked was not checked
   against the DEPS-pinned source.
4. **Chromium's pinned OpenH264 revision.** `README.chromium` says
   "Revision: DEPS". `ParamValidation` was read at `cisco/openh264` `master`,
   not at the DEPS revision.
5. **Which Chrome first accepted `bitrateMode: "quantizer"` for avc on
   `prefer-hardware` (Media Foundation)**, and on which GPU vendors'
   MFTs `CODECAPI_AVEncVideoEncodeQP` is honoured. The API shipped in Chrome
   117; per-encoder support was not traced.
6. **Is `prefer-hardware` output byte-identical run-to-run on one Windows
   machine?** No documentation either way (§4.3); it needs measuring per GPU
   vendor.
7. **VP9 profile 1 playback where no source was found:** Windows' built-in
   VP9 decoder (VP9 Video Extensions), Chrome on Android (the Android branch
   only checks colour space), Firefox's actual decoder choice (libvpx or
   ffvpx) per platform, YouTube's ingest of VP9 profile 1 WebM, X's
   consumer (non-API) uploader, and Discord's inline player on each client.
8. **Would Chromium accept a 9-field VP9 string** such as
   `vp09.01.30.08.03.01.01.01.00` in `VideoEncoder.configure`, which is what
   mediabunny 1.58.0 needs in order to label 4:4:4 correctly (§3)? And does a
   player that sees a 4-field (4:2:0-labelled) profile 1 WebM decode it
   anyway from the bitstream header?
9. **mediabunny's VP9 quantizer scale.** mediabunny 1.58.0 assumes 0-63;
   current Chrome and the editor's draft use 0-255 (§3). Whether a newer
   mediabunny has changed this was not checked.
10. **GPL scope for a browser app.** Whether Marey's own code, served
    alongside an ffmpeg.wasm GPL core and driving it through the MIT wrapper
    in a worker, is "a work based on the Program" or "mere aggregation"
    (GPL-2.0 §2) is a legal question. It is also affected by Marey not yet
    declaring its own licence.
11. **H.264 patent licensing for a self-shipped wasm encoder** (x264,
    minih264, or an OpenH264 built by anyone other than Cisco). openh264.org
    speaks only to Cisco's own binary.
12. **Who plays AV1 High profile (4:4:4)?** Not researched. It matters only
    if AV1 4:4:4 (§5) were considered.
13. **Device texture limits.** The Khronos-specified minimums for
    `MAX_TEXTURE_SIZE`, `MAX_RENDERBUFFER_SIZE` and `MAX_SAMPLES` in WebGL2
    were not re-read. PixiJS hard-codes 4 MSAA samples and checks no size
    limit (§6).
14. **The user's "blank pixels" in the MP4.** Out of scope for the six
    questions and not investigated. Nothing above explains it directly.
