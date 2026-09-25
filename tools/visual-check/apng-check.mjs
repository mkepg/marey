/**
 * Export a scene to APNG, decode it back with a REAL decoder, and prove
 * every decoded frame matches the lossless canvas it was muxed from,
 * byte for byte -- the same "the file plays is not evidence" reasoning
 * `video-check.mjs`, `export-check.mjs` and `lottie-check.mjs` all carry,
 * sharpened here into the strongest form APNG's own losslessness allows:
 * not "close enough" but **0 differing bytes**.
 *
 * It calls `window.__mareyExportApng` (installed dev-only by
 * `src/lib/devApngSeam.ts`, wired in `main.tsx` behind `import.meta.env.DEV`)
 * rather than clicking the top bar's **apng** button. That seam is not a
 * copy of the export pipeline: it calls the shipped `runApngExport`
 * (`src/compiler/export/apngPipeline.ts`, the same function the button
 * calls) with observers that capture each canvas's raw pixels immediately
 * before the pipeline reads them into PNG bytes. So this script measures
 * the product's orchestration; what still differs from a click is only the
 * entry point (a `window` global versus the button's dynamic `import()`).
 *
 * **The decode-back step runs INSIDE the page, with a real `ImageDecoder`,
 * not a Node-side polyfill.** Confirmed working in Playwright's Chromium
 * before writing this script (a throwaway probe: `new ImageDecoder({ data,
 * type: "image/png" })` against a 3-frame APNG built with `encodeApng`
 * itself correctly reported `frameCount: 3` and per-frame `duration`). Per
 * the brief: had it NOT worked, this script would fall back to a Node-side
 * `node:zlib` inflate of each `IDAT`/`fdAT` stream plus manual PNG
 * unfiltering -- that fallback is not implemented, because the probe
 * succeeded and there is no failing case to fall back from. See this task's
 * report for the exact probe output.
 *
 * **Every comparison happens where the pixels already are.** The decoded
 * frame (drawn to a 2D canvas, read with `getImageData`) and the reference
 * capture (raw RGBA `devApngSeam.ts` already captured with `getImageData`,
 * shipped to the page as base64 and decoded back to bytes there) are
 * diffed inside `page.evaluate`, and only the reduced numbers -- a
 * differing-byte count per frame, never a raw pixel buffer -- cross back to
 * Node. Same reasoning `video-check.mjs`'s `decodeAndCompare` documents for
 * its own nearest-neighbour distances.
 *
 * **`referenceRgba[k]` is keyed by `frame.index`, immune to reordering.**
 * `devApngSeam.ts`'s own docstring (carrying Task 4 ruling T4-R2 into this
 * seam) explains why: the reference capture is correct regardless of what
 * order the pipeline later hands frames to the muxer, so a pipeline that
 * mixes up two frames' order in the FILE shows up as exactly two
 * now-mismatched byte-for-byte comparisons against the (still correct)
 * references -- rather than the harness quietly comparing a wrong file
 * against equally wrong references. Task 5 Step 7's mutations (b) and (a)
 * exercise exactly this.
 *
 * **`fcTL` delays are parsed directly from the file, in Node, independent
 * of the in-page decode.** `readChunks`/`parseFcTLDelays` below are a
 * small, from-scratch chunk walker -- not a re-import of
 * `apngEncode.ts`'s own parser -- for the same "an independent check can't
 * agree with a bug by construction" reason `apngEncode.test.ts`'s `fakePng`
 * fixture is built without the muxer's own chunk writer.
 *
 * Usage:
 *   node tools/visual-check/apng-check.mjs \
 *     --scene tools/visual-check/scenes/linear-motion.marey \
 *     --fps 30 --out .visual-check/apng/linear-motion
 *
 *   --scene <path>    .marey source file (required; no "default" fallback,
 *                      same convention as export-check.mjs/lottie-check.mjs/
 *                      video-check.mjs)
 *   --fps <n>         export frame rate (default 30)
 *   --duration <s>    export bound in seconds; overrides the scene's own
 *                      `duration:`. Omit to use the scene's declared one.
 *                      Pass e.g. `--duration 30` on a looping fixture to
 *                      measure a >=30s file's size (spec §5.3).
 *   --frames <list>   comma-separated decoded frame indices to write as PNG
 *                      (every decoded frame is still analysed numerically
 *                      regardless of this flag). Default: an evenly-spaced
 *                      spread of five indices. Ignored under --size-only.
 *   --size-only       measure a FILE SIZE only (spec §5.3's ">=30s" ask),
 *                      not pixel identity. Passes `withReferenceCapture:
 *                      false` to the seam (`devApngSeam.ts`) so it never
 *                      allocates the raw-RGBA reference array that
 *                      measurably crashes the page at long durations (fix
 *                      round 1, finding 2 -- see `runExport`'s own comment
 *                      for the exact error, and SKILL.md). Skips
 *                      decode-and-compare and `missingReferenceFrames`;
 *                      still runs both cold pages and checks byte/hash
 *                      reproducibility and the independent fcTL parse.
 *   --out <dir>       where scene.png, decoded_%04d.png and report.json go
 *   --url <origin>    dev server origin (default http://localhost:5199)
 *   --headed          show the browser window
 *
 * Exit code under --size-only is non-zero only if: either cold run failed;
 * any parsed `fcTL` is wrong; the two cold runs' APNG bytes (sha256)
 * disagree; or either run recorded a page error.
 *
 * Exit code otherwise is non-zero if: either cold run failed; the seam
 * reported a sampled frame it never rasterized (`missingReferenceFrames`);
 * decode failed, or decoded frame count does not match the seam's own
 * reported frame count; ANY decoded frame differs from its reference by so
 * much as one byte; any decoded frame's `duration` is off, by more than
 * 1us, its `1e6/fps` ideal ROUNDED to the nearest millisecond (measured:
 * Chromium's `ImageDecoder` quantizes an APNG frame's reported duration to
 * whole milliseconds -- `decodeAndCompare`'s own comment has the numbers);
 * any parsed `fcTL`'s `delay_num`/`delay_den` is not exactly
 * `1`/`fps`; the two cold runs' APNG bytes (sha256) disagree; or either run
 * recorded a page error. Never on how the PNGs look -- **look at them
 * anyway**, same rule as every other script on this page.
 *
 * Deliberately NOT gated (and not computed at all, past a per-run count):
 * a byte-for-byte comparison of the two cold runs' raw `referenceRgba`
 * captures against each other. Spec §5.3 only asks that the two runs'
 * MUXED APNGs be byte-identical (which the sha256 check above proves);
 * proving the raw per-frame captures also match would need both runs'
 * ~170MB-per-run reference data in the same place at once, which is
 * exactly the transfer this file's `runExport`/`decodeAndCompare` comment
 * explains crashed the page the one time this script tried it.
 */
import { chromium } from "playwright";
import LZString from "lz-string";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function argAll(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}
function arg(name, fallback = null) {
  const vals = argAll(name);
  return vals.length > 0 ? vals[vals.length - 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const url = arg("url", "http://localhost:5199");
const scenePath = arg("scene");
if (!scenePath) {
  console.error("apng-check.mjs requires --scene <path-to-.marey-file>");
  process.exit(2);
}
const outDir = resolve(arg("out", ".visual-check/apng/run"));
const fps = Number(arg("fps", "30"));
const durationArg = arg("duration", null);
const durationSeconds = durationArg === null ? undefined : Number(durationArg);
const framesArg = arg("frames", null);
const explicitWriteIndices = framesArg === null ? null : framesArg.split(",").map((s) => Number(s.trim()));
// Fix round 1, finding 2: measures a SIZE only, without the raw RGBA
// reference capture the full pixel-identity check needs -- see
// `devApngSeam.ts`'s `withReferenceCapture` (this flag's own reason to
// exist) and this file's header comment. Skips reference capture, the
// missing-reference-frame check, and the in-page decode-and-compare (there
// is no reference to decode against); still runs both cold pages and
// compares the two runs' APNG bytes and this file's own independent fcTL
// parse, both cheap regardless of frame count.
const sizeOnly = has("size-only");

const source = readFileSync(resolve(scenePath), "utf8");

// Same launch args as video-check.mjs/lottie-check.mjs, including
// --disable-accelerated-2d-canvas: the decode-back step below draws a
// decoded frame via `drawImage` and reads it back with `getImageData` --
// exactly the step spec §9's 2×2 experiment found IS sensitive to GPU vs
// software 2D canvas. The reference capture (`devApngSeam.ts`'s `onFrame`)
// reads `getImageData` directly off the WebGL-extracted canvas
// (`gl.readPixels` + `putImageData`, never `drawImage` -- same mechanism
// that experiment found the ENCODE side is immune to), so only the decode
// side's determinism depends on this flag, but it is set for both for the
// same reason every other script here sets it: one flag, one page.
const LAUNCH_ARGS = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--disable-accelerated-2d-canvas",
];

const sceneUrl = `${url}/#code=${LZString.compressToEncodedURIComponent(source)}`;

const pad4 = (i) => String(i).padStart(4, "0");

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function defaultSpreadIndices(frameCount, n = 5) {
  if (frameCount <= 0) return [];
  if (frameCount <= n) return Array.from({ length: frameCount }, (_, i) => i);
  const idx = new Set();
  for (let i = 0; i < n; i++) idx.add(Math.round((i / (n - 1)) * (frameCount - 1)));
  return [...idx].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Node-side fcTL parsing -- a small, from-scratch chunk walker, independent
// of apngEncode.ts's own (see this file's header comment for why).
// ---------------------------------------------------------------------------

function readChunks(buf) {
  const out = [];
  let o = 8; // past the 8-byte PNG signature
  while (o + 12 <= buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString("ascii", o + 4, o + 8);
    out.push({ type, offset: o + 8, length: len });
    o += 12 + len;
  }
  return out;
}

/** Every `fcTL`'s `{ seq, width, height, xOffset, yOffset, delayNum, delayDen, disposeOp, blendOp }`, in file order. */
function parseFcTLs(buf) {
  return readChunks(buf)
    .filter((c) => c.type === "fcTL")
    .map((c) => ({
      seq: buf.readUInt32BE(c.offset + 0),
      width: buf.readUInt32BE(c.offset + 4),
      height: buf.readUInt32BE(c.offset + 8),
      xOffset: buf.readUInt32BE(c.offset + 12),
      yOffset: buf.readUInt32BE(c.offset + 16),
      delayNum: buf.readUInt16BE(c.offset + 20),
      delayDen: buf.readUInt16BE(c.offset + 22),
      disposeOp: buf.readUInt8(c.offset + 24),
      blendOp: buf.readUInt8(c.offset + 25),
    }));
}

// ---------------------------------------------------------------------------
// Browser-side work
// ---------------------------------------------------------------------------

/** Runs one cold export. Leaves the page open (for decode-back) iff `keepOpen`. */
async function runExport(browser, keepOpen) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // Generous first-navigation timeout: a cold dev server needs to
  // pre-bundle its dependencies before it can serve `/` at all -- same
  // measured reasoning `video-check.mjs` documents for its own timeout.
  await page.goto(sceneUrl, { waitUntil: "load", timeout: 60_000 });

  try {
    await page.waitForFunction(() => typeof window.__mareyExportApng === "function", null, {
      timeout: 60_000,
      polling: 200,
    });
  } catch (e) {
    console.error(`__mareyExportApng never appeared. console errors so far: ${JSON.stringify(consoleErrors)}`);
    console.error(`page errors so far: ${JSON.stringify(pageErrors)}`);
    throw e;
  }

  const result = await page.evaluate(
    async ({ source, fps, durationSeconds, sizeOnly }) => {
      try {
        const r = await window.__mareyExportApng(source, {
          fps,
          durationSeconds,
          withReferenceCapture: !sizeOnly,
        });
        // Stash the FULL result -- including `referenceRgba`, one raw RGBA
        // buffer per frame (800x600x4 bytes = 1.92MB *raw*, ~2.56MB as
        // base64, times however many frames the scene has) -- on a
        // page-side global, rather than returning it from this
        // `page.evaluate` call. `decodeAndCompare` below reads it back
        // in-page, in the SAME realm, rather than receiving it as a second
        // `page.evaluate` ARGUMENT later.
        //
        // Measured, not a style choice: an earlier version of this script
        // returned `referenceRgba` here (fine -- browser-to-Node, one
        // direction) and then passed the very same array back INTO
        // `decodeAndCompare` as an argument (Node-to-browser, the other
        // direction) for a 90-frame 800x600 export. That second transfer,
        // landing in a tab that was simultaneously decoding every APNG
        // frame and still held the export's own WebGL `Application`, ended
        // with Playwright reporting "Target page, context or browser has
        // been closed" -- the renderer process died under the combined
        // memory pressure. Reading the stash in-page avoids re-serializing
        // that data across the CDP boundary a second time at all.
        window.__apngCheckLastResult = r;
        return {
          ok: true,
          apng: r.apng,
          fps: r.fps,
          frameCount: r.frameCount,
          width: r.width,
          height: r.height,
          missingReferenceFrames: sizeOnly ? null : r.referenceRgba.filter((x) => !x).length,
        };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },
    { source, fps, durationSeconds, sizeOnly },
  );

  if (!keepOpen) await page.close();
  return { result, page: keepOpen ? page : null, consoleErrors, pageErrors };
}

/**
 * Decode the APNG with a real `ImageDecoder`, and diff every decoded frame
 * against its reference RGBA capture -- entirely inside the page, reading
 * both the muxed bytes and the reference captures from the page-side
 * `window.__apngCheckLastResult` stash `runExport` left behind (see that
 * function's own comment for why this never re-sends `referenceRgba`
 * across the CDP boundary). Returns only reduced numbers plus the PNGs
 * `writeIndices` selects.
 */
async function decodeAndCompare(page, { expectedFps, writeIndices }) {
  return page.evaluate(
    async ({ expectedFps, writeIndices }) => {
      const stashed = window.__apngCheckLastResult;
      if (!stashed) {
        return { ok: false, stage: "no-stash", error: "window.__apngCheckLastResult was never set" };
      }
      const referenceRgbaBase64 = stashed.referenceRgba;

      function b64ToBytes(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      }

      if (typeof ImageDecoder === "undefined") {
        return { ok: false, stage: "no-imagedecoder", error: "window.ImageDecoder is not defined" };
      }

      const apngBytes = b64ToBytes(stashed.apng);
      let decoder;
      try {
        decoder = new ImageDecoder({ data: apngBytes, type: "image/png" });
        await decoder.tracks.ready;
      } catch (e) {
        return { ok: false, stage: "construct", error: String(e && e.message ? e.message : e) };
      }

      const frameCount = decoder.tracks.selectedTrack.frameCount;
      // Chromium's ImageDecoder quantizes an APNG frame's delay_num/delay_den
      // to the nearest whole MILLISECOND when it exposes VideoFrame.duration
      // -- measured directly on this fixture: fps 30's ideal 33333.33us
      // reports as exactly 33000us on every one of 90 frames (a uniform
      // -333.33us difference, not per-frame jitter). Modelled explicitly
      // here, rather than compared against the un-quantized ideal, so the
      // per-frame duration check stays tight enough to catch a real fps
      // mismatch (e.g. Task 5 Step 7 mutation (c), which changes the VALUE
      // written into fcTL and is caught independently by this script's own
      // Node-side fcTL parse regardless of this check) without permanently
      // flagging every correct frame for a rounding difference introduced
      // by Chromium's own decoder, not this muxer.
      const idealDurationUs = 1e6 / expectedFps;
      const expectedDurationUs = Math.round(idealDurationUs / 1000) * 1000;
      const perFrame = [];
      const pngs = {};
      try {
        for (let i = 0; i < frameCount; i++) {
          const { image } = await decoder.decode({ frameIndex: i });
          const c = document.createElement("canvas");
          c.width = image.displayWidth;
          c.height = image.displayHeight;
          const ctx = c.getContext("2d");
          ctx.drawImage(image, 0, 0);
          const decodedData = ctx.getImageData(0, 0, c.width, c.height).data;
          const durationUs = image.duration;
          image.close();

          const refB64 = referenceRgbaBase64[i];
          let differingBytes = null;
          let totalBytes = null;
          if (refB64) {
            const ref = b64ToBytes(refB64);
            totalBytes = ref.length;
            differingBytes = 0;
            if (ref.length === decodedData.length) {
              for (let b = 0; b < ref.length; b++) if (ref[b] !== decodedData[b]) differingBytes += 1;
            } else {
              differingBytes = null; // size mismatch -- reported as an error, not a byte count
            }
          }

          perFrame.push({
            index: i,
            width: c.width,
            height: c.height,
            durationUs,
            durationDeviationUs: durationUs - expectedDurationUs,
            hasReference: !!refB64,
            sizeMismatch: !!refB64 && totalBytes !== decodedData.length,
            differingBytes,
            totalBytes,
          });

          if (writeIndices.includes(i)) pngs[i] = c.toDataURL("image/png").split(",")[1];
        }
      } catch (e) {
        return { ok: false, stage: "decode", error: String(e && e.message ? e.message : e), partialCount: perFrame.length };
      }

      // Drop the stash's own reference now that this page will not be used
      // again -- tidiness, not a fix for the crash above (that was fixed by
      // never re-sending this data as an argument, not by freeing it after).
      delete window.__apngCheckLastResult;

      return { ok: true, frameCount, perFrame, pngs };
    },
    { expectedFps, writeIndices },
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: !has("headed"), args: LAUNCH_ARGS });

const report = {
  scene: scenePath,
  requestedFps: fps,
  requestedDurationSeconds: durationSeconds ?? null,
  url,
};

async function finish(exitCode) {
  writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(exitCode);
}

try {
  const runA = await runExport(browser, true);
  const runB = await runExport(browser, false);

  report.runA = {
    ok: runA.result.ok,
    error: runA.result.error ?? null,
    fps: runA.result.fps ?? null,
    frameCount: runA.result.frameCount ?? null,
    width: runA.result.width ?? null,
    height: runA.result.height ?? null,
    byteLength: runA.result.apng ? Buffer.from(runA.result.apng, "base64").length : null,
    consoleErrors: runA.consoleErrors,
    pageErrors: runA.pageErrors,
  };
  report.runB = {
    ok: runB.result.ok,
    error: runB.result.error ?? null,
    fps: runB.result.fps ?? null,
    frameCount: runB.result.frameCount ?? null,
    width: runB.result.width ?? null,
    height: runB.result.height ?? null,
    byteLength: runB.result.apng ? Buffer.from(runB.result.apng, "base64").length : null,
    consoleErrors: runB.consoleErrors,
    pageErrors: runB.pageErrors,
  };

  console.log(`scene                    ${scenePath}`);
  console.log(`requested fps / duration ${fps} / ${durationSeconds ?? "(scene's own)"}`);
  console.log(`runA ok                  ${runA.result.ok}${runA.result.ok ? "" : `  (${runA.result.error})`}`);
  console.log(`runB ok                  ${runB.result.ok}${runB.result.ok ? "" : `  (${runB.result.error})`}`);

  if (!runA.result.ok || !runB.result.ok) {
    console.error("one or both cold runs failed to export; see report.json");
    await finish(1);
  }

  // --- missing reference frames (a dropped frame, seen from the seam's own side) ---
  // Computed IN-PAGE by `runExport` (a cheap count), not by shipping the
  // full `referenceRgba` array to Node and filtering it here -- see
  // `runExport`'s own comment for why that array never leaves the page.
  const missingA = runA.result.missingReferenceFrames ?? null;
  const missingB = runB.result.missingReferenceFrames ?? null;
  report.missingReferenceFrames = { runA: missingA, runB: missingB };
  console.log(`sampled frames never handed to onFrame   runA=${missingA} runB=${missingB}`);

  // --- byte / hash reproducibility across cold reload (spec §5.3, determinism) ---
  const bufA = Buffer.from(runA.result.apng, "base64");
  const bufB = Buffer.from(runB.result.apng, "base64");
  writeFileSync(`${outDir}/scene.png`, bufA);

  const sha256A = sha256(bufA);
  const sha256B = sha256(bufB);
  const bytesEqual = bufA.length === bufB.length && Buffer.compare(bufA, bufB) === 0;
  report.byteComparison = { sha256A, sha256B, bytesEqual, byteLengthA: bufA.length, byteLengthB: bufB.length };
  console.log(`runA size / runB size    ${bufA.length} / ${bufB.length} bytes`);
  console.log(`runA sha256              ${sha256A}`);
  console.log(`runB sha256              ${sha256B}`);
  console.log(`two-run bytes identical  ${bytesEqual}`);

  // NOTE: no runA-vs-runB comparison of the raw referenceRgba captures
  // themselves. Spec §5.3 asks only that the two runs' MUXED APNGs be
  // byte-identical (checked above) -- it does not ask that the raw
  // reference captures match each other, and deliberately not computing it
  // is what keeps `referenceRgba` off the CDP boundary entirely except for
  // the one in-page-only read `decodeAndCompare` does below (see
  // `runExport`'s comment for the crash this avoids).

  // --- fcTL delays, parsed independently in Node ---
  const fctls = parseFcTLs(bufA);
  const expectedDelayNum = 1;
  const expectedDelayDen = fps;
  const fcTLProblems = fctls
    .map((f, i) => ({ i, f }))
    .filter(
      ({ f }) =>
        f.delayNum !== expectedDelayNum ||
        f.delayDen !== expectedDelayDen ||
        f.disposeOp !== 0 ||
        f.blendOp !== 0 ||
        f.xOffset !== 0 ||
        f.yOffset !== 0,
    );
  report.fcTL = {
    count: fctls.length,
    expectedDelayNum,
    expectedDelayDen,
    seqStartsAtZero: fctls.length > 0 && fctls[0].seq === 0,
    problems: fcTLProblems.map(({ i, f }) => ({ index: i, ...f })),
  };
  console.log(
    `fcTL count               ${fctls.length} (expect delay ${expectedDelayNum}/${expectedDelayDen}, dispose NONE, blend SOURCE, x/y 0)`,
  );
  console.log(`fcTL problems            ${fcTLProblems.length}`);

  // --- size-only mode ends here (fix round 1, finding 2) ---
  // No reference was ever captured (`withReferenceCapture: false`), so
  // there is nothing for `decodeAndCompare` to diff a decoded frame
  // against, and no `missingReferenceFrames` question to ask. Report a
  // SIZE and the two cheap checks above (byte/hash reproducibility, the
  // independent fcTL parse), close the still-open runA page, and stop.
  if (sizeOnly) {
    report.mode = "size-only";
    report.notChecked = [
      "decode-and-compare (no reference captured)",
      "missingReferenceFrames (no reference captured)",
    ];
    await runA.page.close();
    console.log(
      "\nsize-only mode: decode-and-compare and missingReferenceFrames were NOT run (no reference\n" +
        "was captured -- see devApngSeam.ts's withReferenceCapture). This measures a SIZE, not pixel\n" +
        "identity; use this script without --size-only for that.",
    );
    console.log(`\nwrote ${outDir}/report.json and ${outDir}/scene.png`);
    const sizeOnlyFail =
      fcTLProblems.length > 0 ||
      !(fctls.length > 0 && fctls[0].seq === 0) ||
      !bytesEqual ||
      runA.pageErrors.length > 0 ||
      runB.pageErrors.length > 0;
    await finish(sizeOnlyFail ? 1 : 0);
  }

  // --- decode-back, in the page ---
  const writeIndices = explicitWriteIndices ?? defaultSpreadIndices(runA.result.frameCount, 5);
  report.writeIndices = writeIndices;

  const decode = await decodeAndCompare(runA.page, {
    expectedFps: fps,
    writeIndices,
  });
  await runA.page.close();

  report.decode = decode.ok
    ? {
        ok: true,
        frameCount: decode.frameCount,
        perFrame: decode.perFrame.map(({ index, width, height, durationUs, durationDeviationUs, hasReference, sizeMismatch, differingBytes, totalBytes }) => ({
          index,
          width,
          height,
          durationUs,
          durationDeviationUs,
          hasReference,
          sizeMismatch,
          differingBytes,
          totalBytes,
        })),
      }
    : decode;

  if (!decode.ok) {
    console.error(`decode-back failed at stage '${decode.stage}': ${decode.error}`);
    await finish(1);
  }

  for (const [i, b64] of Object.entries(decode.pngs)) {
    writeFileSync(`${outDir}/decoded_${pad4(Number(i))}.png`, Buffer.from(b64, "base64"));
  }

  // --- derived checks ---
  const frameCountMatches = decode.frameCount === runA.result.frameCount;
  const perFrame = decode.perFrame;
  const totalDifferingBytes = perFrame.reduce((n, f) => n + (f.differingBytes ?? 0), 0);
  const framesWithDifferences = perFrame.filter((f) => (f.differingBytes ?? 0) > 0);
  const framesMissingReference = perFrame.filter((f) => !f.hasReference || f.sizeMismatch);
  const framesWithBadDuration = perFrame.filter((f) => Math.abs(f.durationDeviationUs) > 1);

  report.checks = {
    frameCountMatches,
    totalDifferingBytes,
    framesWithDifferencesCount: framesWithDifferences.length,
    framesWithDifferences: framesWithDifferences.map((f) => ({ index: f.index, differingBytes: f.differingBytes, totalBytes: f.totalBytes })),
    framesMissingReferenceCount: framesMissingReference.length,
    framesMissingReference: framesMissingReference.map((f) => f.index),
    framesWithBadDurationCount: framesWithBadDuration.length,
    framesWithBadDuration: framesWithBadDuration.map((f) => ({ index: f.index, durationUs: f.durationUs, deviationUs: f.durationDeviationUs })),
  };

  console.log(`\ndecoded frame count      ${decode.frameCount} (reference count ${runA.result.frameCount}, match: ${frameCountMatches})`);
  console.log(`total differing bytes    ${totalDifferingBytes}  across ${framesWithDifferences.length} frame(s)`);
  console.log(`frames missing a reference  ${framesMissingReference.length}`);
  console.log(`frames with bad duration (> 1us off the ms-quantized 1e6/fps)  ${framesWithBadDuration.length}`);
  if (framesWithDifferences.length > 0) {
    for (const f of framesWithDifferences.slice(0, 10)) {
      console.log(`  ! frame ${f.index}: ${f.differingBytes} / ${f.totalBytes} bytes differ`);
    }
  }

  console.log(
    "\nNumeric checks above cannot substitute for looking: open scene.png in a modern browser (it\n" +
      "renders the whole animation natively) or decoded_0000.png / a mid-export decoded frame /\n" +
      "the last decoded frame with the Read tool before trusting this run.",
  );
  console.log(`\nwrote ${outDir}/report.json, ${outDir}/scene.png, and decoded PNG(s) [${writeIndices.join(", ")}]`);

  const fail =
    !frameCountMatches ||
    totalDifferingBytes > 0 ||
    framesMissingReference.length > 0 ||
    framesWithBadDuration.length > 0 ||
    fcTLProblems.length > 0 ||
    !(fctls.length > 0 && fctls[0].seq === 0) ||
    missingA > 0 ||
    missingB > 0 ||
    !bytesEqual ||
    runA.pageErrors.length > 0 ||
    runB.pageErrors.length > 0;

  await finish(fail ? 1 : 0);
} catch (err) {
  console.error(`apng-check.mjs crashed: ${err && err.stack ? err.stack : err}`);
  report.crash = String(err && err.message ? err.message : err);
  try {
    writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  } catch {
    /* best effort -- do not let a write failure hide the real error below */
  }
  await browser.close().catch(() => {});
  process.exit(1);
}
