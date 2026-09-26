/**
 * Measure video export QUALITY -- PSNR and specks against the lossless
 * frames the pipeline itself handed the encoder -- through the SHIPPED
 * product path, not a hand-rebuilt probe.
 *
 * This is the runnable home spec §2.5 asks for: the numbers in
 * `docs/research/2026-09-24-export-quality-findings-and-options.md` §1.2
 * came from throwaway probes in `docs/research/2026-09-24-export-quality-
 * probes/` (`matrix.ts`/`matrix-run.mjs`) that rebuilt the render-and-encode
 * loop by hand, calling raw `pixi.js` and raw WebCodecs directly rather than
 * `runVideoExport`. That was fine for a one-off measurement during
 * brainstorming, but it could silently drift from what the app actually
 * ships. This script ports the same scoring method (`matrix.ts`'s `score`)
 * onto `window.__mareyExportVideo` (`src/lib/devVideoSeam.ts`), the dev seam
 * that calls the shipped `runVideoExport` (`src/compiler/export/
 * videoPipeline.ts`) with observers -- the same seam `video-check.mjs`
 * calls, so a quality regression measured here is a regression in the
 * pipeline the export button runs, not in a probe that happens to resemble
 * it (ruling R45: one orchestration per export, observed by the harness,
 * never re-implemented in a script).
 *
 * **What "against the reference" means here.** `referenceFrames[k]` is a
 * lossless PNG of the exact canvas `runVideoExport` handed the encoder for
 * sampled frame k (`onFrame`, captured before the canvas is released) --
 * the same reference every other harness on this page compares against.
 * Scoring the DECODED video against those references, frame by frame, at
 * the SAME index (not a nearest-neighbour search -- that question is
 * `video-check.mjs`'s, this script assumes frame identity already holds and
 * measures how much the codec's own lossy compression moved each pixel),
 * gives PSNR (over RGB) and "specks" -- pixels whose worst channel differs
 * from the reference by more than 64, the exact metric
 * `docs/research/2026-09-24-export-quality-probes/matrix.ts`'s `score`
 * function uses, so the numbers this script prints are directly comparable
 * to findings §1.2's table.
 *
 * **The decode happens inside the page**, exactly as `video-check.mjs`
 * decodes: mediabunny's self-contained ESM bundle
 * (`node_modules/mediabunny/dist/bundles/mediabunny.mjs`) is injected as an
 * inline `<script type="module">`, so the decode goes through the same
 * `VideoDecoder` a real viewer's browser would use.
 *
 * Usage:
 *   node tools/visual-check/quality-check.mjs \
 *     --scene tools/visual-check/scenes/... \
 *     --containers mp4,webm --fps 30 \
 *     --out .visual-check/quality/default
 *
 *   --scene <path>         .marey source file (required; no "default"
 *                          fallback, same as every other harness here)
 *   --containers <list>    comma-separated "mp4"/"webm" (default "mp4,webm")
 *   --fps <n>              export frame rate (default 30)
 *   --duration <s>         export bound in seconds, overriding the scene's
 *                          own `duration:`
 *   --out <dir>            where report.json goes
 *   --scorer <gpu|software> the scoring browser's 2D canvas (default
 *                          "gpu"). "gpu" launches Chromium without
 *                          --disable-accelerated-2d-canvas. That is the
 *                          configuration spec §9.1's criterion names (ruling
 *                          T1-R2), and it reproduces findings §1.2's
 *                          methodology. "software" adds the flag and gives
 *                          this script's pre-2026-09-26 numbers (about
 *                          0.6 dB lower, about 10x the specks). See below
 *                          for why only the scoring step moves.
 *   --mediabunny-path <p>  override the mediabunny ESM bundle path
 *   --url <origin>         dev server origin (default http://localhost:5199)
 *   --headed               show the browser window
 *
 * Exit code is non-zero only if the export or decode itself failed for
 * either requested container -- never on how good or bad the measured PSNR
 * or speck count is, which is a judgement call for whoever reads the
 * report (same "reported, not gated" shape as `video-check.mjs`'s MP4 byte
 * comparison). "The file plays" is not evidence; these numbers, and the
 * command line that produced them (printed below and written into
 * report.json), are.
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
  console.error("quality-check.mjs requires --scene <path-to-.marey-file>");
  process.exit(2);
}
const containers = arg("containers", "mp4,webm")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
for (const c of containers) {
  if (c !== "mp4" && c !== "webm") {
    console.error(`quality-check.mjs: --containers must list only "mp4"/"webm", got '${c}'`);
    process.exit(2);
  }
}
const outDir = resolve(arg("out", `.visual-check/quality/run`));
const fps = Number(arg("fps", "30"));
const durationArg = arg("duration", null);
const durationSeconds = durationArg === null ? undefined : Number(durationArg);
const mediabunnyPath = resolve(
  arg("mediabunny-path", "node_modules/mediabunny/dist/bundles/mediabunny.mjs"),
);

const source = readFileSync(resolve(scenePath), "utf8");

const scorer = arg("scorer", "gpu");
if (scorer !== "gpu" && scorer !== "software") {
  console.error(`quality-check.mjs: --scorer must be "gpu" or "software", got '${scorer}'`);
  process.exit(2);
}

// The launch flag the scorer choice turns on or off. The first version of
// this script always carried --disable-accelerated-2d-canvas, copied from
// video-check.mjs and lottie-check.mjs, where it keeps reference-frame
// comparisons deterministic. Here it only moves the SCORE. A 2x2 experiment
// (encode browser x score browser, eval/RESULTS-PHASE-5C.md, "fix round 2";
// the script is
// docs/research/2026-09-24-export-quality-probes/localise-2x2/localise-2x2.mjs)
// found:
// - the encoded file and the reference frames are unaffected by the flag.
//   WebM is byte-identical; MP4 agrees within 0.01 dB. `extract.canvas` is
//   `gl.readPixels` + `putImageData` and never touches the accelerated
//   2D path.
// - the decoded frame's `sample.draw(ctx)` + `getImageData` below does
//   change: forced-software scoring reads about 0.6 dB lower, with about
//   10x the specks.
// Spec §9.1's criterion (ruling T1-R2) names the GPU-accelerated scorer,
// so that is the default.
const LAUNCH_ARGS = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  ...(scorer === "software" ? ["--disable-accelerated-2d-canvas"] : []),
];

const sceneUrl = `${url}/#code=${LZString.compressToEncodedURIComponent(source)}`;
const commandLine = `node ${process.argv.slice(1).join(" ")}`;

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: !has("headed"), args: LAUNCH_ARGS });

async function installMediabunny(page) {
  const bundleJs = readFileSync(mediabunnyPath, "utf8");
  await page.addScriptTag({
    content: `${bundleJs}\nwindow.__mediabunny = { Input, BufferSource, ALL_FORMATS, VideoSampleSink };`,
    type: "module",
  });
  // Wait for the global rather than reading it once. An inline module
  // script runs asynchronously, so `addScriptTag` can resolve before the
  // bundle has assigned `window.__mediabunny`. Measured 2026-09-26: an
  // immediate read failed on every run (4 of 4) with the GPU-accelerated
  // scorer (no --disable-accelerated-2d-canvas) and passed with the
  // software one.
  return page
    .waitForFunction(() => typeof window.__mediabunny === "object" && window.__mediabunny !== null, null, {
      timeout: 30_000,
      polling: 100,
    })
    .then(
      () => true,
      () => false,
    );
}

/**
 * Export once through the dev seam, decode the result back inside the page
 * with a real `VideoDecoder`, and score each decoded frame against the
 * exact reference PNG the pipeline fed its own encoder for that index --
 * PSNR over RGB and "specks" (worst-channel delta > 64), the same
 * definitions `matrix.ts`'s `score` uses, so these numbers are directly
 * comparable to findings §1.2's table.
 */
async function exportAndScore(page, container) {
  const exported = await page.evaluate(
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
  if (!exported.ok) return { ok: false, stage: "export", error: exported.error };

  const scored = await page.evaluate(
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

      const references = [];
      for (const b64 of referenceFramesBase64) references.push(b64 ? await pngToImageData(b64) : null);

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
        for await (const sample of sink.samples()) {
          const c = document.createElement("canvas");
          c.width = sample.displayWidth;
          c.height = sample.displayHeight;
          const ctx = c.getContext("2d");
          sample.draw(ctx, 0, 0, sample.displayWidth, sample.displayHeight);
          decoded.push({
            width: c.width,
            height: c.height,
            data: ctx.getImageData(0, 0, c.width, c.height).data,
          });
          sample.close();
        }
      } catch (e) {
        return { ok: false, stage: "decode", error: String(e && e.message ? e.message : e) };
      } finally {
        input.dispose?.();
      }

      // Per-frame PSNR/specks against the SAME-INDEX reference -- direct
      // identity, not a nearest-neighbour search (that question belongs to
      // video-check.mjs; this script measures lossy-compression damage on
      // frames already known to correspond 1:1 by index).
      const perFrame = [];
      let totalSpecks = 0;
      let mseSum = 0;
      let scored = 0;
      for (let k = 0; k < decoded.length; k++) {
        const d = decoded[k];
        const ref = references[k];
        if (!ref || ref.width !== d.width || ref.height !== d.height) {
          perFrame.push({ k, error: "missing reference or size mismatch" });
          continue;
        }
        let se = 0;
        let specks = 0;
        for (let i = 0; i < d.data.length; i += 4) {
          const dr = d.data[i] - ref.data[i];
          const dg = d.data[i + 1] - ref.data[i + 1];
          const db = d.data[i + 2] - ref.data[i + 2];
          se += dr * dr + dg * dg + db * db;
          if (Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) > 64) specks++;
        }
        const mse = se / ((d.data.length / 4) * 3);
        const psnr = mse === 0 ? Infinity : 10 * Math.log10(65025 / mse);
        perFrame.push({ k, specks, psnr: +psnr.toFixed(2) });
        totalSpecks += specks;
        mseSum += mse;
        scored++;
      }
      const overallPsnr = scored > 0 ? 10 * Math.log10(65025 / (mseSum / scored)) : null;

      return {
        ok: true,
        decodedFrameCount: decoded.length,
        referenceFrameCount: references.filter(Boolean).length,
        width: decoded[0]?.width ?? null,
        height: decoded[0]?.height ?? null,
        perFrame,
        totalSpecks,
        specksPerFrame: scored > 0 ? +(totalSpecks / scored).toFixed(1) : null,
        psnr: overallPsnr === null ? null : +overallPsnr.toFixed(2),
      };
    },
    { videoBase64: exported.video, referenceFramesBase64: exported.referenceFrames },
  );

  if (!scored.ok) return { ok: false, ...scored };

  const durationSecondsUsed = exported.frameCount / exported.fps;
  const kbps = Math.round((exported.byteLength * 8) / durationSecondsUsed / 1000);

  return {
    ok: true,
    container,
    fps: exported.fps,
    frameCount: exported.frameCount,
    width: exported.width,
    height: exported.height,
    sceneWidth: exported.sceneWidth,
    sceneHeight: exported.sceneHeight,
    byteLength: exported.byteLength,
    kbps,
    ...scored,
  };
}

const report = { scene: scenePath, containers, requestedFps: fps, requestedDurationSeconds: durationSeconds ?? null, scorer, launchArgs: LAUNCH_ARGS, url, commandLine };

async function finish(exitCode) {
  writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(`\ncommand: ${commandLine}`);
  console.log(`wrote ${outDir}/report.json`);
  process.exit(exitCode);
}

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

  // Same generous first-navigation timeouts as video-check.mjs: a cold dev
  // server has to pre-bundle pixi.js/mediabunny/Monaco before it serves `/`.
  await page.goto(sceneUrl, { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(() => typeof window.__mareyExportVideo === "function", null, {
    timeout: 60_000,
    polling: 200,
  });

  const mediabunnyInstalled = await installMediabunny(page);
  if (!mediabunnyInstalled) {
    console.error(`mediabunny did not attach window.__mediabunny after addScriptTag({ path: '${mediabunnyPath}' })`);
    await finish(1);
  }

  console.log(`scene                    ${scenePath}`);
  console.log(`fps / duration           ${fps} / ${durationSeconds ?? "(scene's own)"}`);
  console.log(`scorer 2D canvas         ${scorer}${scorer === "software" ? " (--disable-accelerated-2d-canvas)" : ""}`);

  let anyFailed = false;
  report.results = {};
  for (const container of containers) {
    const result = await exportAndScore(page, container);
    report.results[container] = result;
    if (!result.ok) {
      anyFailed = true;
      console.error(`${container}: FAILED at stage '${result.stage}': ${result.error}`);
      continue;
    }
    console.log(`\n--- ${container} ---`);
    console.log(`size (scene / coded)     ${result.sceneWidth}x${result.sceneHeight} / ${result.width}x${result.height}`);
    console.log(`frames (decoded / ref)   ${result.decodedFrameCount} / ${result.referenceFrameCount}`);
    console.log(`bitrate                 ${result.kbps} kbit/s`);
    console.log(`PSNR (RGB, overall)     ${result.psnr} dB`);
    console.log(`specks per frame        ${result.specksPerFrame}  (total ${result.totalSpecks})`);
  }
  if (consoleErrors.length > 0) report.consoleErrors = consoleErrors;

  await page.close();
  await finish(anyFailed ? 1 : 0);
} catch (err) {
  console.error(`quality-check.mjs crashed: ${err && err.stack ? err.stack : err}`);
  report.crash = String(err && err.message ? err.message : err);
  try {
    writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  } catch {
    /* best effort -- do not let a write failure hide the real error below */
  }
  await browser.close().catch(() => {});
  process.exit(1);
}
