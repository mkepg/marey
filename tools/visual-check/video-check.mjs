/**
 * Export a scene to WebM/MP4, decode the container back to frames with a REAL
 * decoder, and prove the decoded sequence matches the sampler's own output —
 * no frame dropped, duplicated, or reordered.
 *
 * This is Phase 5B's evidence engine (`.sdd/2026-09-18-phase-5b-video/
 * task-3-brief.md`, Task 3). "The file plays" is not evidence: a video can play
 * back looking mostly right while silently dropping, duplicating, or reordering
 * frames, or being re-encoded at a rate nobody asked for. Every one of those
 * failure modes leaves the file *playable* — only decoding it back and
 * comparing against the sampler's own frames catches them.
 *
 * It calls `window.__mareyExportVideo` (installed dev-only by
 * `src/lib/devVideoSeam.ts`, wired in `main.tsx` behind `import.meta.env.DEV`)
 * rather than clicking the top bar's export button. That seam is not a copy
 * of the export pipeline: it calls the shipped `runVideoExport`
 * (`src/compiler/export/videoPipeline.ts`, the same function the button
 * calls) with observers that capture each canvas the encoder is handed, the
 * sampler's hash, and the resolved encoder config. So this script measures
 * the product's orchestration; what still differs from a click is only the
 * entry point (a `window` global versus the button's dynamic `import()`).
 *
 * **The decode-back step runs INSIDE the page, not in Node.** mediabunny ships
 * a self-contained ESM bundle (`node_modules/mediabunny/dist/bundles/
 * mediabunny.mjs` -- confirmed by reading it: zero `import` statements, one
 * `export { ... }` clause at the end with every symbol this script needs
 * (`Input`, `BufferSource`, `ALL_FORMATS`, `VideoSampleSink`) exported under
 * its own bare name, no renaming). That bundle is injected as an inline
 * `<script type="module">` (same technique `lottie-check.mjs` already uses for
 * dotlottie-web's ESM bundle) with one appended line assigning the four names
 * it needs onto `window.__mediabunny`. Decoding in-page means the decode path
 * goes through the SAME `VideoDecoder` a real viewer's browser would use --
 * the actual claim criterion 3 needs proved -- rather than a Node-side decode
 * that would prove something narrower (that mediabunny's own demuxer agrees
 * with itself) even though mediabunny ships a Node build too.
 *
 * **The nearest-neighbour identity check, and its tie caveat.** For each
 * decoded frame *k*, this script computes a downsampled mean-absolute-
 * difference distance to reference frames *k-2 .. k+2* (both computed and
 * reduced to numbers entirely inside the page -- raw pixel buffers are never
 * shipped back to Node, only the per-candidate distances and, for the frames
 * `--frames` selects, a PNG). A frame's match is **strict** when its window's
 * minimum distance is achieved by exactly one candidate; it is **tied** when
 * two or more candidates in the window achieve the same minimum -- which
 * happens whenever the scene has settled and consecutive reference frames are
 * pixel-identical, making `argmin` genuinely arbitrary. This script fails
 * (non-zero exit) when a frame's match is STRICT and the unique argmin is not
 * `k` itself, and when a frame's match is a TIE that does NOT include `k`
 * (spec §10.2 requires `argmin === k`; a tie between two other references,
 * with `k` measurably further away, is evidence of a wrong frame, and the
 * Phase 5B whole-branch review found one in the `freeze-midair` WebM run,
 * finding I-1, ruling R46). A tie that includes `k` is reported and counted,
 * never a failure: when consecutive references are identical, `k` is as good
 * a match as any, and "a run whose frames are mostly tied has not proved
 * criterion 3 -- it has proved the fixture was wrong".
 *
 * **MP4's six known byte ranges.** mediabunny's MP4 muxer stamps
 * `creationTime = Math.floor(Date.now() / 1000) + <MP4 epoch offset>`
 * (`mediabunny.mjs:31157`, read directly) into three ISOBMFF boxes --
 * `mvhd`, each track's `tkhd`, and each track's `mdhd` -- each writing BOTH a
 * `creation_time` and a `modification_time` field to the same value. For a
 * single-video-track export (every scene this script runs) that is exactly
 * six 4-or-8-byte fields (width depends on the box's version byte) that
 * legitimately differ between two encodes of the identical scene at two
 * different wall-clock moments. `findMp4TimestampRanges` below is a small
 * ISOBMFF box walker (`moov` -> `mvhd`/`trak`; `trak` -> `tkhd`/`mdia`;
 * `mdia` -> `mdhd`) that locates those exact byte offsets by PARSING the
 * container rather than assuming a fixed layout, because box sizes are not
 * static across encodes (a `needsU64` widening depends on the actual duration
 * value). For every MP4 this script reports both the raw comparison and a
 * masked one with those ranges zeroed in an in-memory copy.
 *
 * **MP4 byte identity is reported, never gating (ruling R47).** Phase 5B
 * measured MP4 bytes non-deterministic across cold runs even with the six
 * ranges masked: the reviewer reproduced it with raw WebCodecs and no
 * mediabunny, so the cause is below the muxer. A gate that fails every
 * correct run carries no information, and it hid real failures: before this
 * rule, a correct MP4 run and one with reordered frames both exited 1. WebM
 * bytes are measured identical across cold runs, so for WebM the raw
 * comparison gates.
 *
 * Usage:
 *   node tools/visual-check/video-check.mjs \
 *     --scene eval/scenes-3b/compound-logo.marey \
 *     --container webm --fps 30 --out .visual-check/video/logo-webm
 *
 *   --scene <path>        .marey source file (required; no "default"
 *                          fallback -- the built-in scene declares no
 *                          `duration`, so it needs an explicit --duration to
 *                          export at all)
 *   --container <name>    "mp4" or "webm" (required)
 *   --fps <n>              export frame rate (default 30)
 *   --duration <s>         export bound in seconds; overrides the scene's own
 *                          `duration:`. Omit to use the scene's declared one.
 *   --out <dir>            where scene.<ext>, decoded_%04d.png,
 *                          reference_%04d.png and report.json go
 *   --url <origin>         dev server origin (default http://localhost:5199)
 *   --frames <list>        comma-separated DECODED frame indices to write as
 *                          PNG (both decoded_%04d.png and the paired
 *                          reference_%04d.png). Every decoded frame is still
 *                          analysed numerically (frame count, timestamps,
 *                          nearest-neighbour, direct per-frame delta) --
 *                          this flag only controls which frames are written
 *                          to disk for a human to look at, because writing
 *                          every frame of a long export is disk cost with no
 *                          evidentiary benefit past what the numbers already
 *                          cover. Default: an evenly-spaced spread of five
 *                          indices (0%, 25%, 50%, 75%, 100% of the planned
 *                          frame count), which always includes frame 0 and
 *                          the last frame.
 *   --mediabunny-path <p>  override the mediabunny ESM bundle path (default
 *                          node_modules/mediabunny/dist/bundles/mediabunny.mjs)
 *   --headed               show the browser window
 *
 * Exit code is non-zero if: either cold run failed; decode failed; the
 * decoded frame count does not match the planned frame count; decoded
 * dimensions do not match the scene's; decoded timestamps are not strictly
 * increasing; decoded timestamps do not match the claimed fps's schedule
 * within half a frame; any frame's nearest-neighbour match is STRICT and
 * wrong, or is a TIE that excludes the frame itself; a sampled frame was
 * never handed to the encoder; the two cold runs' snapshot hashes disagree;
 * the two cold runs' lossless reference-frame PNGs (the exact rasterized
 * pixels each run fed to its own encoder) disagree; or, for WebM only, the
 * two cold runs' container bytes disagree. Never on MP4 container bytes (raw
 * or masked; both reported), on how the PNGs look, or on how many frames tied
 * with a set that includes themselves -- all reported, none gates.
 */
import { chromium } from "playwright";
import LZString from "lz-string";
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
  console.error("video-check.mjs requires --scene <path-to-.marey-file>");
  process.exit(2);
}
const container = arg("container");
if (container !== "mp4" && container !== "webm") {
  console.error(`video-check.mjs requires --container mp4|webm, got '${container}'`);
  process.exit(2);
}
const outDir = resolve(arg("out", `.visual-check/video/run`));
const fps = Number(arg("fps", "30"));
const durationArg = arg("duration", null);
const durationSeconds = durationArg === null ? undefined : Number(durationArg);
const framesArg = arg("frames", null);
const explicitWriteIndices = framesArg === null ? null : framesArg.split(",").map((s) => Number(s.trim()));
const mediabunnyPath = resolve(
  arg("mediabunny-path", "node_modules/mediabunny/dist/bundles/mediabunny.mjs"),
);

const source = readFileSync(resolve(scenePath), "utf8");

// Same launch args as lottie-check.mjs, including --disable-accelerated-2d-canvas
// (added 2026-09-18): without it, Chromium silently switches between GPU and
// software 2D rasterizers mid-session and measured pixel tolerances change
// depending on which frames a run happens to visit. This script's
// `--disable-accelerated-2d-canvas` matters for exactly the same reason it
// mattered there -- the reference PNGs come from the same
// `renderer.extract.canvas()` -> 2D-canvas-backed path, and the decoded PNGs
// this script writes come from drawing a `VideoSample` onto a 2D canvas too.
const LAUNCH_ARGS = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--disable-accelerated-2d-canvas",
];

const sceneUrl = `${url}/#code=${LZString.compressToEncodedURIComponent(source)}`;

const pad4 = (i) => String(i).padStart(4, "0");

// ---------------------------------------------------------------------------
// MP4 timestamp-range masking (Node-side, operates on Buffer bytes already
// returned from the page -- no browser needed for this part).
// ---------------------------------------------------------------------------

const CONTAINER_BOXES = new Set(["moov", "trak", "mdia"]);
const TIME_BOXES = new Set(["mvhd", "tkhd", "mdhd"]);

/** Read one ISOBMFF box header at `offset`. Returns null if truncated. */
function readBoxHeader(buf, offset) {
  if (offset + 8 > buf.length) return null;
  let size = buf.readUInt32BE(offset);
  const type = buf.toString("ascii", offset + 4, offset + 8);
  let headerLen = 8;
  if (size === 1) {
    // 64-bit largesize immediately follows the ordinary 8-byte header.
    if (offset + 16 > buf.length) return null;
    const hi = buf.readUInt32BE(offset + 8);
    const lo = buf.readUInt32BE(offset + 12);
    size = hi * 2 ** 32 + lo;
    headerLen = 16;
  } else if (size === 0) {
    // Box extends to end of file -- rare, but valid ISOBMFF.
    size = buf.length - offset;
  }
  return { type, size, headerLen, start: offset, payloadStart: offset + headerLen, end: offset + size };
}

/**
 * Walk an MP4/ISOBMFF buffer and locate every `creation_time`/
 * `modification_time` field inside `mvhd`, `tkhd`, and `mdhd` boxes, by
 * parsing the container rather than assuming a fixed byte layout -- box
 * sizes are not static across encodes (whether the 32-bit or 64-bit time
 * field is used depends on the actual `creationTime`/duration values, per
 * mediabunny's own `needsU64` check, read directly at
 * `mediabunny.mjs:28978` and analogous lines for `tkhd`/`mdhd`).
 *
 * Only descends into `moov`, `trak`, and `mdia` -- the three container boxes
 * on the path to a time box for a video track. Anything else (`ftyp`,
 * `mdat`, `free`, `udta`, `minf`, ...) is skipped whole via its own declared
 * size, without being parsed further, since none of Marey's own exports put
 * a time-bearing box anywhere else.
 */
function findMp4TimestampRanges(buf) {
  const ranges = [];
  function walk(start, end) {
    let offset = start;
    while (offset < end) {
      const box = readBoxHeader(buf, offset);
      // A malformed header or a box that claims to extend past its parent's
      // own bound means this buffer isn't the ISOBMFF shape this function
      // assumes -- stop rather than loop or read out of bounds.
      if (!box || box.size <= 0 || box.end > end) break;
      if (TIME_BOXES.has(box.type)) {
        const version = buf.readUInt8(box.payloadStart);
        const fieldStart = box.payloadStart + 4; // skip version(1) + flags(3)
        const fieldWidth = version === 1 ? 8 : 4;
        ranges.push({ box: box.type, field: "creation_time", offset: fieldStart, length: fieldWidth });
        ranges.push({
          box: box.type,
          field: "modification_time",
          offset: fieldStart + fieldWidth,
          length: fieldWidth,
        });
      } else if (CONTAINER_BOXES.has(box.type)) {
        walk(box.payloadStart, box.end);
      }
      offset = box.end;
    }
  }
  walk(0, buf.length);
  return ranges;
}

function maskRanges(buf, ranges) {
  const out = Buffer.from(buf);
  for (const r of ranges) out.fill(0, r.offset, r.offset + r.length);
  return out;
}

function defaultSpreadIndices(frameCount, n = 5) {
  if (frameCount <= 0) return [];
  if (frameCount <= n) return Array.from({ length: frameCount }, (_, i) => i);
  const idx = new Set();
  for (let i = 0; i < n; i++) idx.add(Math.round((i / (n - 1)) * (frameCount - 1)));
  return [...idx].sort((a, b) => a - b);
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

  // A generous timeout on the FIRST navigation only matters in practice: a
  // freshly started dev server has to run esbuild's dependency pre-bundling
  // (pixi.js, mediabunny, Monaco, ...) before it can serve `/`, which the
  // other harnesses' default 30s budget does not always cover on this
  // project's dependency set -- measured directly (the first run against a
  // cold server here timed out at 30s; a warmed server answers in well under
  // a second).
  await page.goto(sceneUrl, { waitUntil: "load", timeout: 60_000 });

  // Also generous, for the same reason: `devVideoSeam.ts` is the first
  // module in this project to import `mediabunny`, so the FIRST time any
  // page reaches its dynamic `import("./lib/devVideoSeam")`, Vite discovers
  // a dependency its cold-start scan did not pre-bundle and has to
  // pre-bundle it on demand, which forces a full page reload partway through
  // -- measured directly: a 20s budget was not always enough against a
  // freshly started dev server, a 60s budget was.
  try {
    await page.waitForFunction(() => typeof window.__mareyExportVideo === "function", null, {
      timeout: 60_000,
      polling: 200,
    });
  } catch (e) {
    console.error(`__mareyExportVideo never appeared. console errors so far: ${JSON.stringify(consoleErrors)}`);
    console.error(`page errors so far: ${JSON.stringify(pageErrors)}`);
    throw e;
  }

  const result = await page.evaluate(
    async ({ source, container, fps, durationSeconds }) => {
      try {
        const r = await window.__mareyExportVideo(source, {
          container,
          fps,
          durationSeconds,
          withReferenceFrames: true,
        });
        return { ok: true, ...r };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },
    { source, container, fps, durationSeconds },
  );

  if (!keepOpen) await page.close();
  return { result, page: keepOpen ? page : null, consoleErrors, pageErrors };
}

/**
 * Injects mediabunny's self-contained ESM bundle as an inline module script
 * and captures the four exports this harness needs onto `window.__mediabunny`.
 * See this file's header comment for why the bundle can be injected whole
 * (no imports, no aliasing on the names used here) -- verified by reading it
 * directly, the same way `lottie-check.mjs` verified dotlottie-web's bundle
 * shape before depending on it.
 */
async function installMediabunny(page) {
  const bundleJs = readFileSync(mediabunnyPath, "utf8");
  await page.addScriptTag({
    content: `${bundleJs}\nwindow.__mediabunny = { Input, BufferSource, ALL_FORMATS, VideoSampleSink };`,
    type: "module",
  });
  return page.evaluate(() => typeof window.__mediabunny === "object" && window.__mediabunny !== null);
}

/**
 * Demux + decode the video bytes back to frames INSIDE the page (a real
 * `VideoDecoder`, not a Node-side polyfill), compare each decoded frame
 * against the sampler's own reference PNGs, and return only reduced numbers
 * plus the PNGs `writeIndices` selects -- never raw pixel buffers, which
 * would be expensive to ship across the CDP boundary for no benefit (the
 * comparison itself has to happen somewhere with pixel access, and in-page
 * is where both the decoded frame and the decoded reference PNG already are).
 */
async function decodeAndCompare(page, { videoBase64, referenceFramesBase64, writeIndices }) {
  return page.evaluate(
    async ({ videoBase64, referenceFramesBase64, writeIndices }) => {
      function b64ToBytes(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      }

      async function pngToImageData(b64) {
        const img = new Image();
        const loaded = new Promise((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error("reference PNG failed to decode as an <img>"));
        });
        img.src = `data:image/png;base64,${b64}`;
        await loaded;
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return { width: c.width, height: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
      }

      // Mean absolute difference over a downsampled grid (step=4), as
      // specified: comparing 5 candidates per frame at full resolution
      // dominates the run for no accuracy gain, since a dropped, duplicated,
      // or reordered frame differs structurally, not subtly.
      function distance(aData, bData, width, height, step = 4) {
        let sum = 0;
        let n = 0;
        for (let y = 0; y < height; y += step) {
          for (let x = 0; x < width; x += step) {
            const o = (y * width + x) * 4;
            sum +=
              Math.abs(aData[o] - bData[o]) + Math.abs(aData[o + 1] - bData[o + 1]) + Math.abs(aData[o + 2] - bData[o + 2]);
            n += 3;
          }
        }
        return n === 0 ? 0 : sum / n;
      }

      const referenceImages = [];
      // A null slot is a sampled frame the encoder was never handed (see
      // `missingReferenceFrames` below); it matches nothing.
      for (const b64 of referenceFramesBase64) referenceImages.push(b64 ? await pngToImageData(b64) : null);

      const mb = window.__mediabunny;
      if (!mb) return { ok: false, stage: "mediabunny-missing", error: "window.__mediabunny not installed" };

      let input;
      let track;
      let sink;
      try {
        const videoBytes = b64ToBytes(videoBase64);
        const bunnySource = new mb.BufferSource(videoBytes.buffer);
        input = new mb.Input({ formats: mb.ALL_FORMATS, source: bunnySource });
        track = await input.getPrimaryVideoTrack();
        if (!track) return { ok: false, stage: "no-video-track", error: "Input has no primary video track" };
        sink = new mb.VideoSampleSink(track);
      } catch (e) {
        return { ok: false, stage: "construct", error: String(e && e.message ? e.message : e) };
      }

      const decoded = [];
      try {
        let index = 0;
        for await (const sample of sink.samples()) {
          const c = document.createElement("canvas");
          c.width = sample.displayWidth;
          c.height = sample.displayHeight;
          const ctx = c.getContext("2d");
          sample.draw(ctx, 0, 0, sample.displayWidth, sample.displayHeight);
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          let pngBase64 = null;
          if (writeIndices.includes(index)) pngBase64 = c.toDataURL("image/png").split(",")[1];
          decoded.push({
            index,
            timestamp: sample.timestamp,
            displayWidth: sample.displayWidth,
            displayHeight: sample.displayHeight,
            data,
            pngBase64,
          });
          sample.close();
          index += 1;
        }
      } catch (e) {
        return {
          ok: false,
          stage: "decode",
          error: String(e && e.message ? e.message : e),
          partialCount: decoded.length,
        };
      } finally {
        input.dispose?.();
      }

      // Nearest-neighbour identity check: for each decoded frame k, distance
      // to reference frames k-2..k+2. `strict` = the window's minimum is
      // achieved by exactly one candidate; `tie` = two or more candidates
      // share the minimum (expected when the scene has settled and
      // consecutive reference frames are pixel-identical). `argmin` is the
      // sole candidate when strict, or null when tied (reported via
      // `tiedWith` instead, so a tie is never silently resolved to a single
      // arbitrary number that looks like a confident answer).
      const nearestNeighbour = [];
      for (const d of decoded) {
        const k = d.index;
        const candidates = [];
        for (let j = k - 2; j <= k + 2; j++) {
          if (j < 0 || j >= referenceImages.length) continue;
          const ref = referenceImages[j];
          const dist =
            ref && ref.width === d.displayWidth && ref.height === d.displayHeight
              ? distance(d.data, ref.data, d.displayWidth, d.displayHeight)
              : Infinity;
          candidates.push({ j, dist });
        }
        const minDist = Math.min(...candidates.map((c) => c.dist));
        const tiedWith = candidates.filter((c) => c.dist === minDist).map((c) => c.j);
        const sortedDist = [...candidates.map((c) => c.dist)].sort((a, b) => a - b);
        const secondMinDist = sortedDist.length > 1 ? sortedDist[1] : minDist;
        const strict = tiedWith.length === 1;
        nearestNeighbour.push({
          k,
          strict,
          tie: !strict,
          argmin: strict ? tiedWith[0] : null,
          tiedWith: strict ? null : tiedWith,
          kInTiedSet: tiedWith.includes(k),
          minDist,
          margin: secondMinDist - minDist,
          candidates,
        });
      }

      // Direct per-index comparison (decoded[k] vs reference[k]), independent
      // of the nearest-neighbour question -- a plain measure of how much the
      // codec's own lossy compression moved pixels, not an identity check.
      const directCompare = [];
      for (const d of decoded) {
        const ref = referenceImages[d.index];
        if (!ref || ref.width !== d.displayWidth || ref.height !== d.displayHeight) {
          directCompare.push({ k: d.index, error: "size mismatch or no reference frame at this index" });
          continue;
        }
        let maxDelta = 0;
        let mismatchCount = 0;
        const total = d.data.length / 4;
        for (let i = 0; i < d.data.length; i += 4) {
          let pixelMax = 0;
          for (let c = 0; c < 4; c++) {
            const diff = Math.abs(d.data[i + c] - ref.data[i + c]);
            if (diff > pixelMax) pixelMax = diff;
          }
          if (pixelMax > 0) mismatchCount += 1;
          if (pixelMax > maxDelta) maxDelta = pixelMax;
        }
        directCompare.push({ k: d.index, maxDelta, mismatchCount, totalPixels: total, share: mismatchCount / total });
      }

      return {
        ok: true,
        decodedFrameCount: decoded.length,
        frames: decoded.map((d) => ({
          index: d.index,
          timestamp: d.timestamp,
          displayWidth: d.displayWidth,
          displayHeight: d.displayHeight,
          pngBase64: d.pngBase64,
        })),
        nearestNeighbour,
        directCompare,
      };
    },
    { videoBase64, referenceFramesBase64, writeIndices },
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: !has("headed"), args: LAUNCH_ARGS });

const report = {
  scene: scenePath,
  container,
  requestedFps: fps,
  requestedDurationSeconds: durationSeconds ?? null,
  url,
};

async function finish(exitCode) {
  writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(exitCode);
}

// Everything from here on is wrapped in one try/catch: an uncaught throw
// (a `page.goto` timeout, a Playwright protocol error, ...) would otherwise
// crash this script without ever reaching `browser.close()`, leaking a
// headless Chromium process the same way an uncaught throw in `finish()`'s
// own callers already couldn't leak one -- measured directly: an early
// version of this script did exactly that against a cold dev server (see the
// `page.goto` timeout comment above) and left a `chrome-headless-shell.exe`
// running after the script had already exited.
try {

// runA's page stays open for the in-page decode step below; runB is a second
// cold page used only for the byte/hash reproducibility comparison, same
// "page-cold, not process-cold" granularity as export-check.mjs.
const runA = await runExport(browser, true);
const runB = await runExport(browser, false);

report.runA = {
  ok: runA.result.ok,
  error: runA.result.error ?? null,
  hash: runA.result.hash ?? null,
  container: runA.result.container ?? null,
  fps: runA.result.fps ?? null,
  frameCount: runA.result.frameCount ?? null,
  width: runA.result.width ?? null,
  height: runA.result.height ?? null,
  byteLength: runA.result.byteLength ?? null,
  encoderConfigs: runA.result.encoderConfigs ?? null,
  consoleErrors: runA.consoleErrors,
  pageErrors: runA.pageErrors,
};
report.runB = {
  ok: runB.result.ok,
  error: runB.result.error ?? null,
  hash: runB.result.hash ?? null,
  container: runB.result.container ?? null,
  fps: runB.result.fps ?? null,
  frameCount: runB.result.frameCount ?? null,
  width: runB.result.width ?? null,
  height: runB.result.height ?? null,
  byteLength: runB.result.byteLength ?? null,
  encoderConfigs: runB.result.encoderConfigs ?? null,
  consoleErrors: runB.consoleErrors,
  pageErrors: runB.pageErrors,
};

console.log(`scene                    ${scenePath}`);
console.log(`container                ${container}`);
console.log(`requested fps / duration ${fps} / ${durationSeconds ?? "(scene's own)"}`);
console.log(`runA ok                  ${runA.result.ok}${runA.result.ok ? "" : `  (${runA.result.error})`}`);
console.log(`runB ok                  ${runB.result.ok}${runB.result.ok ? "" : `  (${runB.result.error})`}`);
// Spec §5: the resolved encoder config, as mediabunny reported it through
// `onEncoderConfig` (`devVideoSeam.ts`), is part of the evidence. Printed and
// written to report.json; never gating -- it is a record, not a check.
for (const cfg of runA.result.encoderConfigs ?? []) {
  console.log(`encoder config (runA)    ${JSON.stringify(cfg)}`);
}

if (!runA.result.ok || !runB.result.ok) {
  console.error("one or both cold runs failed to export; see report.json");
  await finish(1);
}

// --- byte / hash reproducibility across cold reload (criterion 2) ---
const bufA = Buffer.from(runA.result.video, "base64");
const bufB = Buffer.from(runB.result.video, "base64");
writeFileSync(`${outDir}/scene.${container}`, bufA);

const hashesEqual = runA.result.hash === runB.result.hash;
const rawBytesEqual = bufA.length === bufB.length && Buffer.compare(bufA, bufB) === 0;

let byteComparison = { rawBytesEqual, maskedBytesEqual: null, maskedRangeCountA: null, maskedRangeCountB: null };
// WebM: raw bytes gate. MP4: reported only (R47; see the header comment).
const gatingBytesEqual = container === "webm" ? rawBytesEqual : true;
if (container === "mp4") {
  const rangesA = findMp4TimestampRanges(bufA);
  const rangesB = findMp4TimestampRanges(bufB);
  const maskedBytesEqual =
    bufA.length === bufB.length && Buffer.compare(maskRanges(bufA, rangesA), maskRanges(bufB, rangesB)) === 0;
  byteComparison = {
    rawBytesEqual,
    maskedBytesEqual,
    maskedRangeCountA: rangesA.length,
    maskedRangeCountB: rangesB.length,
  };
}
report.byteComparison = byteComparison;
report.hashesEqual = hashesEqual;

console.log(`runA hash / runB hash    ${runA.result.hash} / ${runB.result.hash}  (equal: ${hashesEqual})`);
console.log(`runA bytes / runB bytes  ${bufA.length} / ${bufB.length}`);
console.log(`raw bytes equal          ${rawBytesEqual}`);
if (container === "mp4") {
  console.log(
    `mp4 timestamp ranges found  runA=${byteComparison.maskedRangeCountA} runB=${byteComparison.maskedRangeCountB} (expected 6 for one video track -- mvhd + tkhd + mdhd, creation_time + modification_time each)`,
  );
  console.log(
    `masked bytes equal       ${byteComparison.maskedBytesEqual}  (mp4: raw and masked are reported, neither gates the exit code)`,
  );
}

// --- reference-frame reproducibility across cold reload ---
// `hashesEqual` is simulation STATE (object transforms), not pixels, and
// `rawBytesEqual`/`maskedBytesEqual` are downstream of the encoder -- neither
// can say WHICH side of the encoder boundary a container-byte divergence
// comes from. A container that differs between two cold runs could be
// non-deterministic rendering (the rasterized canvas itself differs) OR a
// non-deterministic encoder fed IDENTICAL pixels. This comparison answers
// that question directly, by diffing the LOSSLESS reference PNGs of the
// exact canvases each run fed to its own encoder -- `devVideoSeam.ts` reads
// each one through `runVideoExport`'s `onFrame` observer, immediately before
// the encoder consumes that same canvas, so this is not a re-render, it is
// the encoder's actual input, captured before either encoder ever saw it. This
// is a real, permanent, gating check -- not a one-off diagnostic -- because
// an unmeasured claim about which side of the boundary failed is exactly the
// gap a byte-for-byte container difference cannot resolve on its own.
// A null slot means the pipeline never handed the encoder a canvas for that
// sampled frame -- a dropped frame, seen from the encoder's input side.
// Gating, below.
const missingReferenceFrames = [runA, runB].map(
  (run) => (run.result.referenceFrames ?? []).filter((b64) => !b64).length,
);
const refFramesA = (runA.result.referenceFrames ?? []).map((b64) => Buffer.from(b64 ?? "", "base64"));
const refFramesB = (runB.result.referenceFrames ?? []).map((b64) => Buffer.from(b64 ?? "", "base64"));
const referenceFrameCountsMatch = refFramesA.length === refFramesB.length;
let referenceFramesEqual = referenceFrameCountsMatch && refFramesA.length > 0;
let firstDifferingReferenceFrame = null;
if (referenceFrameCountsMatch) {
  for (let i = 0; i < refFramesA.length; i++) {
    if (Buffer.compare(refFramesA[i], refFramesB[i]) !== 0) {
      referenceFramesEqual = false;
      firstDifferingReferenceFrame = i;
      break;
    }
  }
} else {
  referenceFramesEqual = false;
  firstDifferingReferenceFrame = Math.min(refFramesA.length, refFramesB.length);
}
// If they differ, write the first differing pair to disk so a human can look
// at exactly what diverged, same "numbers are not evidence" principle as
// everywhere else in this script.
if (!referenceFramesEqual && firstDifferingReferenceFrame !== null) {
  if (refFramesA[firstDifferingReferenceFrame]) {
    writeFileSync(`${outDir}/coldreload_runA_${pad4(firstDifferingReferenceFrame)}.png`, refFramesA[firstDifferingReferenceFrame]);
  }
  if (refFramesB[firstDifferingReferenceFrame]) {
    writeFileSync(`${outDir}/coldreload_runB_${pad4(firstDifferingReferenceFrame)}.png`, refFramesB[firstDifferingReferenceFrame]);
  }
}
report.referenceFrameComparison = {
  frameCountA: refFramesA.length,
  frameCountB: refFramesB.length,
  referenceFrameCountsMatch,
  referenceFramesEqual,
  firstDifferingReferenceFrame,
  missingReferenceFramesA: missingReferenceFrames[0],
  missingReferenceFramesB: missingReferenceFrames[1],
};
console.log(`sampled frames never handed to the encoder   runA=${missingReferenceFrames[0]} runB=${missingReferenceFrames[1]}`);
console.log(
  `reference frames (runA vs runB) bit-identical   ${referenceFramesEqual}  (${refFramesA.length} vs ${refFramesB.length} frames compared)` +
    (referenceFramesEqual ? "" : `  -- first differing at index ${firstDifferingReferenceFrame}, written to coldreload_runA_*/coldreload_runB_*.png`),
);

// --- decode-back, in the page ---
const mediabunnyInstalled = await installMediabunny(runA.page);
if (!mediabunnyInstalled) {
  console.error(`mediabunny did not attach window.__mediabunny after addScriptTag({ path: '${mediabunnyPath}' })`);
  await runA.page.close();
  await finish(1);
}

const writeIndices =
  explicitWriteIndices ?? defaultSpreadIndices(runA.result.frameCount, 5);
report.writeIndices = writeIndices;

const decode = await decodeAndCompare(runA.page, {
  videoBase64: runA.result.video,
  referenceFramesBase64: runA.result.referenceFrames,
  writeIndices,
});
await runA.page.close();

report.decode = decode.ok
  ? {
      ok: true,
      decodedFrameCount: decode.decodedFrameCount,
      timestamps: decode.frames.map((f) => f.timestamp),
      displayWidth: decode.frames[0]?.displayWidth ?? null,
      displayHeight: decode.frames[0]?.displayHeight ?? null,
      nearestNeighbour: decode.nearestNeighbour,
      directCompare: decode.directCompare,
    }
  : decode;

if (!decode.ok) {
  console.error(`decode-back failed at stage '${decode.stage}': ${decode.error}`);
  await finish(1);
}

// Write the requested PNGs to disk.
for (const f of decode.frames) {
  if (f.pngBase64) writeFileSync(`${outDir}/decoded_${pad4(f.index)}.png`, Buffer.from(f.pngBase64, "base64"));
}
for (const i of writeIndices) {
  if (i >= 0 && i < runA.result.referenceFrames.length && runA.result.referenceFrames[i]) {
    writeFileSync(`${outDir}/reference_${pad4(i)}.png`, Buffer.from(runA.result.referenceFrames[i], "base64"));
  }
}

// --- derived checks ---
const frameCountMatches = decode.decodedFrameCount === runA.result.frameCount;
const dimensionsMatch =
  decode.frames.length > 0 &&
  decode.frames.every((f) => f.displayWidth === runA.result.width && f.displayHeight === runA.result.height);
const timestamps = decode.frames.map((f) => f.timestamp);
const timestampsStrictlyIncreasing = timestamps.every((t, i) => i === 0 || t > timestamps[i - 1]);
// Half a frame duration of slack either side of the CLAIMED schedule
// (index / requested fps) -- catches an encoder silently running at a
// different rate than the metadata claims (fault 4 below), which leaves
// frame count and monotonicity both intact but compresses or stretches
// every timestamp uniformly.
const frameDuration = 1 / fps;
const timestampDeviations = timestamps.map((t, i) => t - i / fps);
const timestampsMatchExpectedSchedule = timestampDeviations.every((d) => Math.abs(d) <= frameDuration / 2);

const nn = decode.nearestNeighbour;
const strictCount = nn.filter((f) => f.strict).length;
const tieCount = nn.filter((f) => f.tie).length;
const strictMismatches = nn.filter((f) => f.strict && f.argmin !== f.k);
// A tie whose tied set does not contain k: the nearest references are two
// OTHER frames, and k is measurably further away than both. Gating.
const tiesExcludingK = nn.filter((f) => f.tie && !f.kInTiedSet);
const maxOffDiagonalMargin = nn.length > 0 ? Math.max(...nn.map((f) => f.margin)) : null;
const minMarginAmongStrict =
  strictCount > 0 ? Math.min(...nn.filter((f) => f.strict).map((f) => f.margin)) : null;

report.checks = {
  frameCountMatches,
  dimensionsMatch,
  timestampsStrictlyIncreasing,
  timestampsMatchExpectedSchedule,
  strictCount,
  tieCount,
  strictMismatchCount: strictMismatches.length,
  strictMismatches: strictMismatches.map((f) => ({ k: f.k, argmin: f.argmin, minDist: f.minDist })),
  tieExcludingKCount: tiesExcludingK.length,
  tiesExcludingK: tiesExcludingK.map((f) => ({ k: f.k, tiedWith: f.tiedWith, minDist: f.minDist })),
  maxOffDiagonalMargin,
  minMarginAmongStrict,
};

console.log(`\ndecoded frame count      ${decode.decodedFrameCount} (planned ${runA.result.frameCount}, match: ${frameCountMatches})`);
console.log(`decoded dimensions       ${decode.frames[0]?.displayWidth}x${decode.frames[0]?.displayHeight} (scene ${runA.result.width}x${runA.result.height}, match: ${dimensionsMatch})`);
console.log(`timestamps strictly increasing   ${timestampsStrictlyIncreasing}`);
console.log(`timestamps match claimed fps schedule (±half frame)   ${timestampsMatchExpectedSchedule}`);
console.log(
  `nearest-neighbour: strict=${strictCount} tie=${tieCount} strict-mismatches=${strictMismatches.length} ties-excluding-k=${tiesExcludingK.length}`,
);
if (strictMismatches.length > 0) {
  for (const m of strictMismatches) console.log(`  ! frame ${m.k}: nearest reference is ${m.argmin}, not ${m.k} (dist ${m.minDist})`);
}
for (const t of tiesExcludingK) {
  console.log(`  ! frame ${t.k}: nearest references tie between [${t.tiedWith.join(", ")}], which excludes ${t.k} (dist ${t.minDist})`);
}
console.log(`max off-diagonal margin  ${maxOffDiagonalMargin}`);
console.log(`min margin among strict matches   ${minMarginAmongStrict}`);
const directShares = decode.directCompare.filter((d) => !d.error).map((d) => d.share);
const directMaxDeltas = decode.directCompare.filter((d) => !d.error).map((d) => d.maxDelta);
console.log(
  `direct per-index compare (decoded[k] vs reference[k]): max maxDelta=${directMaxDeltas.length ? Math.max(...directMaxDeltas) : "n/a"}, max share=${directShares.length ? Math.max(...directShares).toFixed(4) : "n/a"}`,
);

console.log(
  "\nNumeric checks above cannot substitute for looking: open decoded_0000.png, a mid-motion\n" +
    "decoded frame, and the last decoded frame with an image viewer (or the Read tool) before\n" +
    "trusting this run. Phase 4 shipped blank PNGs that hashed perfectly consistently, and\n" +
    "Phase 5A shipped a Lottie file that played and showed the wrong thing -- both passed every\n" +
    "numeric check this script has an equivalent of.",
);
console.log(
  `\nwrote ${outDir}/report.json, ${outDir}/scene.${container}, and PNGs for decoded/reference frame(s) [${writeIndices.join(", ")}]`,
);

const fail =
  !frameCountMatches ||
  !dimensionsMatch ||
  !timestampsStrictlyIncreasing ||
  !timestampsMatchExpectedSchedule ||
  strictMismatches.length > 0 ||
  tiesExcludingK.length > 0 ||
  !hashesEqual ||
  !referenceFramesEqual ||
  missingReferenceFrames[0] > 0 ||
  missingReferenceFrames[1] > 0 ||
  !gatingBytesEqual ||
  runA.pageErrors.length > 0 ||
  runB.pageErrors.length > 0;

await finish(fail ? 1 : 0);

} catch (err) {
  console.error(`video-check.mjs crashed: ${err && err.stack ? err.stack : err}`);
  report.crash = String(err && err.message ? err.message : err);
  try {
    writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  } catch {
    /* best effort -- do not let a write failure hide the real error below */
  }
  await browser.close().catch(() => {});
  process.exit(1);
}
