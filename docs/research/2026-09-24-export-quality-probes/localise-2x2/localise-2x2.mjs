// T1-R2: localise --disable-accelerated-2d-canvas's effect with a 2x2
// experiment (ruling T1-R2), rather than the undifferentiated "the flag
// controls drawImage/getImageData on GPU vs software" claim fix round 1
// made, which the re-review correctly flagged as imprecise: extract.canvas
// bottoms out in PixiJS's GlTextureSystem.generateCanvas() (gl.readPixels +
// putImageData, not drawImage); drawImage+getImageData appear only in the
// SCORING step (and in matrix.ts's lossless(), which this experiment does
// not use -- it goes through the real shipped dev seam instead).
//
// Design:
//   ENCODE mode: which Chromium instance ran window.__mareyExportVideo
//   (i.e. built the reference frames AND fed mediabunny the encoder). Two
//   browsers: "gpu" (no --disable-accelerated-2d-canvas) and "sw" (with
//   it), otherwise identical launch args.
//   SCORE mode: which Chromium instance decoded the resulting file and ran
//   the drawImage/getImageData-based scorer. Same two browsers, re-used.
//
// For each container, this produces:
//   - two encoded files (gpu-encoded, sw-encoded) and their own reference
//     frames, saved to disk;
//   - a byte/reference-frame identity comparison between the two encodes;
//   - 4 scored cells: {gpu,sw}-encoded x {gpu,sw}-scored, each file always
//     scored against ITS OWN references;
//   - (webm only) a direct decoded-frame comparison between the two
//     encodes, independent of any reference.
//
// Re-run, from the repository root:
//   npx vite --port 5199 --strictPort   # separate terminal
//   node docs/research/2026-09-24-export-quality-probes/localise-2x2/localise-2x2.mjs
// Options: --scene <path.marey> (default: the app's DEFAULT_CODE, read from
// src/store/defaultScene.ts), --out <dir> (default .visual-check/localise-2x2).
//
// report.json beside this script is the 2026-09-25 run's output, the one
// eval/RESULTS-PHASE-5C.md ("fix round 2") and spec §9.1 cite. That run read
// the scene from a saved copy of DEFAULT_CODE, and on 2026-09-26 that copy
// was byte-identical to DEFAULT_CODE. The four encoded videos the run also
// wrote (gpu/sw x mp4/webm, about 15 MB) are not committed. Re-running the
// script regenerates them in --out, together with a fresh report.json.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import LZString from "lz-string";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
// DEFAULT_CODE is a plain template literal with no interpolation. The file's
// JSDoc also contains backticks, so anchor on `DEFAULT_CODE = \`` (the same
// extraction tools/visual-check/lottie-click-check.mjs uses).
function extractDefaultCode() {
  const src = readFileSync(resolve("src/store/defaultScene.ts"), "utf8");
  const marker = "DEFAULT_CODE = `";
  const first = src.indexOf(marker) + marker.length - 1;
  const last = src.lastIndexOf("`");
  if (first < marker.length - 1 || last <= first) throw new Error("could not find DEFAULT_CODE's template literal");
  return src.slice(first + 1, last);
}
const scenePath = arg("scene", null);
const source = scenePath ? readFileSync(resolve(scenePath), "utf8") : extractDefaultCode();
const url = "http://localhost:5199";
const sceneUrl = `${url}/#code=${LZString.compressToEncodedURIComponent(source)}`;
const mediabunnyPath = resolve("node_modules/mediabunny/dist/bundles/mediabunny.mjs");
const bundleJs = readFileSync(mediabunnyPath, "utf8");
const outDir = arg("out", ".visual-check/localise-2x2");
mkdirSync(outDir, { recursive: true });

const BASE_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"];
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// --- MP4 timestamp masking, copied from video-check.mjs (pure Node, no
// browser needed): mediabunny stamps six wall-clock creation/modification
// time fields (mvhd + each track's tkhd/mdhd) that legitimately differ
// between two encodes of the identical scene at two different wall-clock
// moments, even from the SAME code path (R47). Masked before any MP4 byte
// comparison so a real difference isn't hidden behind, or confused with,
// that known-and-unrelated source of byte drift.
const CONTAINER_BOXES = new Set(["moov", "trak", "mdia"]);
const TIME_BOXES = new Set(["mvhd", "tkhd", "mdhd"]);
function readBoxHeader(buf, offset) {
  if (offset + 8 > buf.length) return null;
  let size = buf.readUInt32BE(offset);
  const type = buf.toString("ascii", offset + 4, offset + 8);
  let headerLen = 8;
  if (size === 1) {
    if (offset + 16 > buf.length) return null;
    const hi = buf.readUInt32BE(offset + 8);
    const lo = buf.readUInt32BE(offset + 12);
    size = hi * 2 ** 32 + lo;
    headerLen = 16;
  } else if (size === 0) {
    size = buf.length - offset;
  }
  return { type, size, headerLen, start: offset, payloadStart: offset + headerLen, end: offset + size };
}
function findMp4TimestampRanges(buf) {
  const ranges = [];
  function walk(start, end) {
    let offset = start;
    while (offset < end) {
      const box = readBoxHeader(buf, offset);
      if (!box || box.size <= 0 || box.end > end) break;
      if (TIME_BOXES.has(box.type)) {
        const version = buf.readUInt8(box.payloadStart);
        const fieldStart = box.payloadStart + 4;
        const fieldWidth = version === 1 ? 8 : 4;
        ranges.push({ offset: fieldStart, length: fieldWidth });
        ranges.push({ offset: fieldStart + fieldWidth, length: fieldWidth });
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

async function launchAndLoad(extraArgs) {
  const browser = await chromium.launch({ args: [...BASE_ARGS, ...extraArgs] });
  const page = await browser.newPage();
  await page.goto(sceneUrl, { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(() => typeof window.__mareyExportVideo === "function", null, { timeout: 60_000, polling: 200 });
  await page.addScriptTag({
    content: `${bundleJs}\nwindow.__mediabunny = { Input, BufferSource, ALL_FORMATS, VideoSampleSink };`,
    type: "module",
  });
  return { browser, page };
}

async function exportOnPage(page, container) {
  return page.evaluate(
    async ({ source, container }) => {
      const r = await window.__mareyExportVideo(source, { container, fps: 30, withReferenceFrames: true });
      return {
        video: r.video,
        referenceFrames: r.referenceFrames,
        byteLength: r.byteLength,
        width: r.width,
        height: r.height,
        frameCount: r.frameCount,
        fps: r.fps,
      };
    },
    { source, container },
  );
}

/** Decode `videoBase64` and score it against `referenceFramesBase64` (same index), on `page`. */
async function decodeAndScore(page, { videoBase64, referenceFramesBase64 }) {
  return page.evaluate(
    async ({ videoBase64, referenceFramesBase64 }) => {
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
          img.onerror = () => rej(new Error("png decode failed"));
        });
        img.src = `data:image/png;base64,${b64}`;
        await loaded;
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      }
      const refs = [];
      for (const b64 of referenceFramesBase64) refs.push(b64 ? await pngToImageData(b64) : null);

      const mb = window.__mediabunny;
      const videoBytes = b64ToBytes(videoBase64);
      const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BufferSource(videoBytes.buffer) });
      const track = await input.getPrimaryVideoTrack();
      const sink = new mb.VideoSampleSink(track);
      const decoded = [];
      for await (const sample of sink.samples()) {
        const c = document.createElement("canvas");
        c.width = sample.displayWidth;
        c.height = sample.displayHeight;
        const ctx = c.getContext("2d");
        sample.draw(ctx, 0, 0, sample.displayWidth, sample.displayHeight);
        decoded.push(ctx.getImageData(0, 0, c.width, c.height).data);
        sample.close();
      }
      input.dispose?.();

      let totalSpecks = 0;
      let mseSum = 0;
      let scored = 0;
      for (let k = 0; k < decoded.length; k++) {
        const ref = refs[k];
        if (!ref) continue;
        const a = decoded[k];
        const b = ref;
        let se = 0;
        for (let i = 0; i < a.length; i += 4) {
          const dr = a[i] - b[i];
          const dg = a[i + 1] - b[i + 1];
          const db = a[i + 2] - b[i + 2];
          se += dr * dr + dg * dg + db * db;
          if (Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) > 64) totalSpecks++;
        }
        mseSum += se / ((a.length / 4) * 3);
        scored++;
      }
      return {
        decodedFrames: decoded.length,
        scored,
        totalSpecks,
        specksPerFrame: scored > 0 ? +(totalSpecks / scored).toFixed(1) : null,
        psnr: scored > 0 ? +(10 * Math.log10(65025 / (mseSum / scored))).toFixed(2) : null,
      };
    },
    { videoBase64, referenceFramesBase64 },
  );
}

/** Decode two files on the SAME page and compare their pixels frame-by-frame, no reference involved. */
async function decodeAndCompareTwoFiles(page, videoBase64A, videoBase64B) {
  return page.evaluate(
    async ({ videoBase64A, videoBase64B }) => {
      function b64ToBytes(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      }
      async function decodeAll(b64) {
        const mb = window.__mediabunny;
        const videoBytes = b64ToBytes(b64);
        const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BufferSource(videoBytes.buffer) });
        const track = await input.getPrimaryVideoTrack();
        const sink = new mb.VideoSampleSink(track);
        const decoded = [];
        for await (const sample of sink.samples()) {
          const c = document.createElement("canvas");
          c.width = sample.displayWidth;
          c.height = sample.displayHeight;
          const ctx = c.getContext("2d");
          sample.draw(ctx, 0, 0, sample.displayWidth, sample.displayHeight);
          decoded.push(ctx.getImageData(0, 0, c.width, c.height).data);
          sample.close();
        }
        input.dispose?.();
        return decoded;
      }
      const a = await decodeAll(videoBase64A);
      const b = await decodeAll(videoBase64B);
      if (a.length !== b.length) return { frameCountsMatch: false, framesA: a.length, framesB: b.length };
      let maxDelta = 0;
      let mismatchPixels = 0;
      let totalPixels = 0;
      for (let k = 0; k < a.length; k++) {
        const da = a[k];
        const db = b[k];
        for (let i = 0; i < da.length; i += 4) {
          totalPixels++;
          let m = 0;
          for (let c = 0; c < 4; c++) {
            const d = Math.abs(da[i + c] - db[i + c]);
            if (d > m) m = d;
          }
          if (m > 0) mismatchPixels++;
          if (m > maxDelta) maxDelta = m;
        }
      }
      return { frameCountsMatch: true, frames: a.length, maxDelta, mismatchPixels, totalPixels, share: mismatchPixels / totalPixels };
    },
    { videoBase64A, videoBase64B },
  );
}

const gpu = await launchAndLoad([]);
const sw = await launchAndLoad(["--disable-accelerated-2d-canvas"]);

const report = {};

for (const container of ["mp4", "webm"]) {
  console.log(`\n=== ${container} ===`);
  const gpuExport = await exportOnPage(gpu.page, container);
  const swExport = await exportOnPage(sw.page, container);

  const gpuBytes = Buffer.from(gpuExport.video, "base64");
  const swBytes = Buffer.from(swExport.video, "base64");
  writeFileSync(`${outDir}/gpu.${container}`, gpuBytes);
  writeFileSync(`${outDir}/sw.${container}`, swBytes);

  let bytesIdentical = gpuBytes.length === swBytes.length && Buffer.compare(gpuBytes, swBytes) === 0;
  let maskedBytesIdentical = null;
  if (container === "mp4") {
    const rangesA = findMp4TimestampRanges(gpuBytes);
    const rangesB = findMp4TimestampRanges(swBytes);
    maskedBytesIdentical =
      gpuBytes.length === swBytes.length && Buffer.compare(maskRanges(gpuBytes, rangesA), maskRanges(swBytes, rangesB)) === 0;
  }
  console.log(`encoded file bytes identical (gpu vs sw)   raw=${bytesIdentical}${container === "mp4" ? ` masked=${maskedBytesIdentical}` : ""}  (gpu=${gpuBytes.length}B sw=${swBytes.length}B)`);

  // Reference-frame identity: byte-compare the reference PNGs directly.
  const refCount = Math.min(gpuExport.referenceFrames.length, swExport.referenceFrames.length);
  let firstDifferingRef = null;
  let refsIdentical = gpuExport.referenceFrames.length === swExport.referenceFrames.length;
  for (let k = 0; k < refCount; k++) {
    const a = Buffer.from(gpuExport.referenceFrames[k] ?? "", "base64");
    const b = Buffer.from(swExport.referenceFrames[k] ?? "", "base64");
    if (a.length !== b.length || Buffer.compare(a, b) !== 0) {
      refsIdentical = false;
      firstDifferingRef = k;
      break;
    }
  }
  console.log(`reference frames identical (gpu vs sw)     ${refsIdentical}${firstDifferingRef !== null ? `  (first differs at ${firstDifferingRef})` : ""}`);
  if (!refsIdentical && firstDifferingRef !== null) {
    writeFileSync(`${outDir}/ref_gpu_${container}_${firstDifferingRef}.png`, Buffer.from(gpuExport.referenceFrames[firstDifferingRef], "base64"));
    writeFileSync(`${outDir}/ref_sw_${container}_${firstDifferingRef}.png`, Buffer.from(swExport.referenceFrames[firstDifferingRef], "base64"));
  }

  // 4-cell scoring: {gpu,sw}-encoded x {gpu,sw}-scored, each against its OWN references.
  const cell_encGPU_scoreGPU = await decodeAndScore(gpu.page, { videoBase64: gpuExport.video, referenceFramesBase64: gpuExport.referenceFrames });
  const cell_encGPU_scoreSW = await decodeAndScore(sw.page, { videoBase64: gpuExport.video, referenceFramesBase64: gpuExport.referenceFrames });
  const cell_encSW_scoreGPU = await decodeAndScore(gpu.page, { videoBase64: swExport.video, referenceFramesBase64: swExport.referenceFrames });
  const cell_encSW_scoreSW = await decodeAndScore(sw.page, { videoBase64: swExport.video, referenceFramesBase64: swExport.referenceFrames });

  console.log(`cell encode=GPU score=GPU   psnr=${cell_encGPU_scoreGPU.psnr} specksPerFrame=${cell_encGPU_scoreGPU.specksPerFrame}`);
  console.log(`cell encode=GPU score=SW    psnr=${cell_encGPU_scoreSW.psnr} specksPerFrame=${cell_encGPU_scoreSW.specksPerFrame}`);
  console.log(`cell encode=SW  score=GPU   psnr=${cell_encSW_scoreGPU.psnr} specksPerFrame=${cell_encSW_scoreGPU.specksPerFrame}`);
  console.log(`cell encode=SW  score=SW    psnr=${cell_encSW_scoreSW.psnr} specksPerFrame=${cell_encSW_scoreSW.specksPerFrame}`);

  let decodedFileCompare = null;
  if (container === "webm") {
    decodedFileCompare = await decodeAndCompareTwoFiles(gpu.page, gpuExport.video, swExport.video);
    console.log(`webm decoded gpu-file vs sw-file (decoded on the gpu page)   ${JSON.stringify(decodedFileCompare)}`);
  }

  report[container] = {
    gpuExportMeta: { byteLength: gpuExport.byteLength, width: gpuExport.width, height: gpuExport.height, frameCount: gpuExport.frameCount },
    swExportMeta: { byteLength: swExport.byteLength, width: swExport.width, height: swExport.height, frameCount: swExport.frameCount },
    bytesIdentical,
    maskedBytesIdentical,
    gpuFileSha256: sha256(gpuBytes),
    swFileSha256: sha256(swBytes),
    refsIdentical,
    firstDifferingRef,
    cells: {
      encGPU_scoreGPU: cell_encGPU_scoreGPU,
      encGPU_scoreSW: cell_encGPU_scoreSW,
      encSW_scoreGPU: cell_encSW_scoreGPU,
      encSW_scoreSW: cell_encSW_scoreSW,
    },
    decodedFileCompare,
  };
}

writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(`\nwrote ${outDir}/report.json`);

await gpu.browser.close();
await sw.browser.close();
