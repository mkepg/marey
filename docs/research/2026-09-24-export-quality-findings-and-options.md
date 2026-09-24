# Export quality: what was measured, and the options on the table

**Date:** 2026-09-24
**Status:** Findings plus options **awaiting the project owner's decision**. Nothing
here is approved. It is not a design and not a roadmap change. A chosen option
still needs its own short design, approved before any code changes.

**Why this file exists.** The Phase 5B smoke test (2026-09-24) produced two bug
reports. The first, a blank preview after exporting, is fixed (`549e3d7`, with
`7933ea5` repairing the boundary test that commit left red). The second, "the MP4
and WebM export is very low quality and very pixelated … the mp4 has pixels that
are blanks in some frames, I need another solution", was investigated but **not
fixed**. This file keeps the evidence, the options and the open items from that
session so they are not lost.

The primary-source research behind several claims is in the companion note
[`2026-09-24-video-export-quality-options.md`](2026-09-24-video-export-quality-options.md)
(commit `b0aeda0`). Where this file says "research note §N", that is the source.

---

## 1. What was measured

All numbers come from Playwright's Chromium on Windows 11, with SwiftShader
unless stated otherwise, on the smiling-face default scene at 800×600, 30 fps
and 180 frames. The probes are committed in
[`2026-09-24-export-quality-probes/`](2026-09-24-export-quality-probes/) (see §6
to re-run them). Scoring compares each decoded frame against the **lossless
frame the pipeline hands the encoder**. PSNR is over RGB. "Specks" counts
pixels whose worst channel is more than 64 away from that lossless frame.

### 1.1 The user's own files

The user's exports (`Downloads/scene (1).mp4`, `scene (2).webm`; their scene had
a red face) were decoded with a real in-page `VideoDecoder`
(`decode-user.mjs`).
- The MP4's "blank pixels" are **dark specks in flat areas and ragged, blocky
  edges on moving shapes** (the smile and eyes during the pop animation).
- The WebM of the same frame, from the same sampler and therefore the same
  source pixels, is clean.
- The MP4 is 1.6 MB for 6 s, about 2.1 Mbit/s, against a requested 8 Mbit/s.

### 1.2 Encoder settings matrix (raw WebCodecs, no mediabunny)

| Config | kbit/s | PSNR dB | Notes |
|---|---|---|---|
| H.264 Baseline 8M constant (shipped) | 2,061 | 40.05 | |
| H.264 Baseline 8M variable | 2,061 | 40.05 | same output as constant |
| H.264 High 8M variable | 2,059 | 40.04 | |
| H.264 20M constant | 2,060 | 40.05 | target ignored |
| H.264 `bitrateMode: "quantizer"` | — | — | reported unsupported |
| H.264 `contentHint: "text"` / `"detail"` | 690 | 38.2 | worse |
| H.264 `prefer-hardware` | 2,412 | 40.39 | machine-dependent |
| VP9 profile 0, 8M constant (shipped) | 3,107 | 40.27 | |
| VP9 profile 0, quantizer 20 / 10 / 4 | 2,299 / 2,948 / 3,887 | 40.3 / 40.4 / 40.46 | more bits, almost no gain |
| AV1, quantizer 10 | 2,674 | 40.43 | |
| **VP9 profile 1 (4:4:4)**, 8M variable | 3,064 | **45.36** | specks ~5,000 → **8** over 180 frames |
| No codec, 4:2:0 chroma subsampling only | — | 39.59 | the ceiling of any 4:2:0 format |

At 2× (1600×1200, `SCALE=2`), measured against 2× lossless frames:

| Config | kbit/s | PSNR dB | Specks per frame |
|---|---|---|---|
| H.264 8M / 20M constant | 4,328 / 4,325 | 42.03 | ~65 |
| H.264 1M constant | 950 | 39.02 | 432, so a low target *is* honoured |
| VP9 profile 0, 8M | 5,837 | 42.17 | 61.5 |
| VP9 profile 1 (4:4:4), 8M | 3,849 | 45.17 | 1 |

### 1.3 Antialiasing (`aa.ts`)

MSAA is working: WebGL2 with `supports.msaa` true, 4 samples under SwiftShader
and up to 16 on the GPU. A test circle's soft-edge pixel count is 292 at 1× and
about 430 when rendered at 2× and downscaled. Antialiasing is not broken. The
export is simply 1×, while the preview renders at `devicePixelRatio`.

## 2. Causes, in order of what the user sees

1. **"Pixelated" is resolution.** The video is exactly the scene's 800×600
   (`frameRaster.ts`, `resolution: 1`, a documented decision). The preview draws
   at the screen's pixel density, and a player stretches the video.
2. **Every standard MP4/WebM halves colour resolution (4:2:0).** On its own that
   caps fidelity at about 40 dB, and saturated colours are the worst case (the
   user's red face). At 2× output, chroma lands at the scene's native
   resolution.
3. **The MP4 specks come from Chromium's software H.264 encoder (OpenH264).**
   - Chromium never sets a minimum QP, so OpenH264 fills in 12 and clips lower
     values back up (research note §1).
   - Chromium also refuses `bitrateMode: "quantizer"` for avc.
   - No WebCodecs setting lifts this. Whether that floor also *causes* the
     specks is **not established**: QP 12 is high quality, and nobody has read
     per-frame QPs.

## 3. Lottie: built, but not reachable

- Phase 5A's baked-Lottie encoder is finished and merged (`lottieEncode.ts`,
  checked against lottie-web and dotlottie-web). It is reachable **only**
  through the dev seam `window.__mareyExportLottie` (`src/lib/devLottieSeam.ts`),
  which the harness uses.
- Phase 5B added MP4/WebM buttons, and no Lottie button was ever added.
- By design (Phase 5A spec §1, §10), Lottie export refuses `text` (R17: the
  Lottie text layer is not normatively stable). `line` is deferred, not cut:
  Lottie can draw a stroked polyline.
- **The smiling-face default scene uses both** (`text hello`, and the smile is a
  `line`), so a Lottie button today would refuse the default scene.

## 4. The options

| Option | Quality | What it costs |
|---|---|---|
| **A. Lottie button** (already built) | Vector, sharp at any size | Refuses `text` and `line`. Not a video file: plays in Lottie players and on the web, not on social media. Adding `line` is a planned deferral. |
| **B. Animated PNG or WebP** | Pixel-identical to the lossless frames: no codec, no specks, no colour loss | Larger files. An image, not a video, and some sites convert it. A small in-house muxer: no new licence, deterministic. `pngSequence.ts` already produces the frames. |
| **C. 2× video** | Much sharper; colour loss mostly hidden; MP4 specks smaller but still present | About twice the file size. Changes `frameRaster.ts`'s recorded `resolution: 1` rule. At 2×, mediabunny sizes the video from the first frame (research note §6). |
| **D. Full-colour (4:4:4) WebM** | 45 dB, almost no specks | Safari refuses VP9 profile 1 on every Apple platform, and X accepts only 4:2:0 (research note §2). mediabunny needs the 9-field codec string: it throws on 5 fields and mislabels 4 fields as 4:2:0 (`node_modules/mediabunny/src/codec.ts:965`, `:355`). |
| **E. MP4 carrying VP9 instead of H.264** | No specks: the user's WebM had none | Less compatible than H.264. Safari support unverified. |
| **F. `marey export` CLI** (Phase 6 already plans one) | Best possible MP4, using a native x264 | Not in the browser. The user installs ffmpeg, so Marey does not ship GPL code. |
| **G. Ship our own H.264 encoder** (ffmpeg.wasm/x264, or minih264) | Fixes MP4 (x264); minih264 unmeasured | x264: a 32.2 MB core under GPL-2.0-or-later, with source-offer obligations (research note §4). minih264: CC0, Baseline 4:2:0, QP floor 10. Any encoder we ship also raises an H.264 patent-licensing question that Chrome's built-in encoder avoids (not researched). |
| **H. Hardware encoder** | Slightly better (40.39 dB) | Varies by machine; repeated exports stop being byte-identical. |

### Recommendation as given to the owner (not yet accepted)

1. **Now:** C (2× video) plus A (a Lottie button with clear `text`/`line`
   errors). Both are small, reuse finished work, and add no dependency or
   licence.
2. **Next:** B, as the pixel-perfect export.
3. **Later:** leave MP4 specks to F rather than shipping G.

D and E were not recommended because of the compatibility gaps above.

## 5. Other open items from the same session

- **Silent language gap.** A `sequence` on the same object as a `loop: true`
  `animate` never runs, because a sequence waits for the object's own animate
  and physics to finish (`sceneRuntime.ts`, `basePeers`). Nothing reports it.
  Recommended: a compile error plus a sentence in `docs/LANGUAGE.md`. The
  default scene works around it with nested groups.
- **Licences file.** `third-party-licenses.txt` links to the OFL for the font
  rather than reproducing its full text.
- **Harness flake.** `video-check.mjs` intermittently fails with "mediabunny
  did not attach window.__mediabunny" (2 of 3 WebM runs on 2026-09-24). Not
  investigated.
- **Merge of `phase-5b-video`.** Pending the owner's choice (merge locally, PR,
  or keep). The merge checklist is in the SDD ledger.

## 6. Re-running the probes

The scripts in `2026-09-24-export-quality-probes/` were written in
`.visual-check/probe/` (gitignored) and still use those paths. To re-run them:
1. Copy them there.
2. Put a scene at `.visual-check/probe/default.marey`.
3. Start `npx vite --port 5199 --strictPort`, then run the scripts from the
   repo root.

What each script does:
- `matrix.ts` / `matrix-run.mjs`: builds lossless frames at `SCALE` with the
  pipeline's own modules, then encodes and scores each config in `CONFIGS`.
- `codec-matrix.mjs`: the same at 1×, via the dev seam's reference frames. Its
  `yuv420-floor` entry computes the no-codec 4:2:0 ceiling.
  `codec-configs.json` holds only the *second* run's configs; the first run's
  are the H.264/VP9 rows of §1.2.
- `decode-user.mjs`: decodes a user's MP4 and WebM and diffs them frame by
  frame.
- `aa.ts` / `aa-run.mjs`: the antialiasing check.
- `zoom.mjs`: nearest-neighbour crops.

Kill the server afterwards. Stopping the background task can leave vite
running, so confirm port 5199 is free with `netstat`.
