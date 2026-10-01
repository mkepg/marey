/**
 * The x264 gate (Phase 6 spec §5): measure x264, run through the ffmpeg on
 * PATH, against the browser's WebCodecs H.264 on the same lossless frames,
 * in the same run, with the same scorer.
 *
 * 1. Export the scene as MP4 through `window.__mareyExportVideo`
 *    (`src/lib/devVideoSeam.ts`, which calls the shipped `runVideoExport`),
 *    keeping the WebCodecs file and the lossless reference PNGs the pipeline
 *    handed its encoder, one per sampled frame, by `frame.index`.
 * 2. Pipe those same PNGs, in index order, into ffmpeg's libx264 for every
 *    configuration in `MATRIX`.
 * 3. Score the WebCodecs file and every x264 file with `scoreInPage`
 *    (`lib/scoreVideo.mjs`, the scorer `quality-check.mjs` uses), in its
 *    default GPU configuration, against the same references.
 * 4. Apply the gate, with `wc` the WebCodecs result:
 *    `psnr >= wc.psnr + 1.0 && specksPerFrame <= wc.specksPerFrame / 10 && bytes <= 3 * wc.bytes`,
 *    and choose the passing configuration with the fewest bytes.
 * 5. Encode the chosen configuration twice more and compare SHA-256s: x264's
 *    repeatability is measured, not assumed.
 *
 * The script measures; it does not judge. It exits 0 whatever the verdict,
 * including "gate failed". It exits 1 only when the measurement itself could
 * not be completed: ffmpeg missing or failing, the export failing, a missing
 * reference frame, or the scorer failing on a file (an x264 file the scorer
 * cannot decode is recorded in report.json and stops the run, since the
 * scorer cannot judge it).
 *
 * Usage (the dev server must be running, `npx vite --port 5199 --strictPort`):
 *   node tools/visual-check/x264-gate.mjs --scene <path> --fps 30 --out <dir> [--url http://localhost:5199]
 *
 *   --scene <path>         .marey source file (required)
 *   --fps <n>              export frame rate (default 30)
 *   --out <dir>            where report.json and the encoded files go (required)
 *   --url <origin>         dev server origin (default http://localhost:5199)
 *   --mediabunny-path <p>  override the mediabunny ESM bundle path
 *   --headed               show the browser window
 */
import { chromium } from "playwright";
import LZString from "lz-string";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { installMediabunny, scoreInPage } from "./lib/scoreVideo.mjs";

function arg(name, fallback = null) {
  let value = fallback;
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) value = process.argv[i + 1];
  }
  return value;
}
const has = (name) => process.argv.includes(`--${name}`);

const scenePath = arg("scene");
const outArg = arg("out");
if (!scenePath || !outArg) {
  console.error("x264-gate.mjs requires --scene <path-to-.marey-file> and --out <dir>");
  process.exit(2);
}
const fps = Number(arg("fps", "30"));
const url = arg("url", "http://localhost:5199");
const outDir = resolve(outArg);
const mediabunnyPath = resolve(arg("mediabunny-path", "node_modules/mediabunny/dist/bundles/mediabunny.mjs"));
const source = readFileSync(resolve(scenePath), "utf8");
const sceneUrl = `${url}/#code=${LZString.compressToEncodedURIComponent(source)}`;
const commandLine = `node ${process.argv.slice(1).join(" ")}`;

// quality-check.mjs's GPU-scorer launch flags: no
// --disable-accelerated-2d-canvas, the configuration spec §9.1's criterion
// names (ruling T1-R2).
const LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"];

// Spec §5's matrix: CRF 14 and 18, presets medium and slow, with and
// without -tune animation.
const MATRIX = [];
for (const crf of [14, 18]) for (const preset of ["medium", "slow"]) for (const tune of [null, "animation"])
  MATRIX.push({ crf, preset, tune });

// The x264 file carries the same colour description as the WebCodecs file
// (`ffprobe`: color_range=tv, color_space/primaries/transfer=smpte170m, i.e.
// BT.601 limited range). Without the tags, Chromium decodes the stream as
// BT.709 while ffmpeg converted RGB to YUV with BT.601. That costs about
// 5 dB of PSNR on identical YUV planes (eval/RESULTS-PHASE-6.md, "Task 1").
// `setparams` sets the tags on the frames themselves: with the encoder-level
// `-color_primaries`/`-color_trc` alone, the scale filter's frames left
// primaries and transfer `unknown` in the output (measured with ffprobe).
const BT601_TV_FILTER =
  "scale=out_color_matrix=bt601:out_range=tv," +
  "setparams=range=tv:colorspace=smpte170m:color_primaries=smpte170m:color_trc=smpte170m";

function x264Args(fps, out, { crf, preset, tune }) {
  return [
    "-hide_banner", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", preset, "-crf", String(crf),
    ...(tune ? ["-tune", tune] : []),
    "-vf", BT601_TV_FILTER,
    "-color_range", "tv", "-colorspace", "smpte170m",
    "-color_primaries", "smpte170m", "-color_trc", "smpte170m",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact",
    "-an", "-y", out,
  ];
}

const configName = ({ crf, preset, tune }) => `crf${crf}-${preset}-${tune ?? "none"}`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** First line of `ffmpeg -version`, or null if ffmpeg is not on PATH. */
function ffmpegVersionLine() {
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  return r.stdout.split(/\r?\n/)[0];
}

/**
 * Run ffmpeg with `args`, writing each PNG to its stdin in order. Resolves
 * with the output file's bytes, or rejects with ffmpeg's stderr.
 */
function encodeWithFfmpeg(args, pngs, out) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    let stdinError = null;
    child.stderr.on("data", (d) => (stderr += d));
    child.stdin.on("error", (e) => (stdinError = e));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited ${code}: ${stderr.trim() || stdinError?.message || "(no stderr)"}`));
        return;
      }
      resolvePromise(readFileSync(out));
    });
    (async () => {
      for (const png of pngs) {
        if (stdinError) break;
        if (!child.stdin.write(png)) await new Promise((r) => child.stdin.once("drain", r));
      }
      child.stdin.end();
    })();
  });
}

const report = { scene: scenePath, requestedFps: fps, launchArgs: LAUNCH_ARGS, url, commandLine };

async function finish(browser, exitCode) {
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  await browser?.close().catch(() => {});
  console.log(`\ncommand: ${commandLine}`);
  console.log(`wrote ${join(outDir, "report.json")}`);
  process.exit(exitCode);
}

mkdirSync(outDir, { recursive: true });

const ffmpegVersion = ffmpegVersionLine();
report.ffmpegVersion = ffmpegVersion;
if (ffmpegVersion === null) {
  console.error("x264-gate.mjs: `ffmpeg -version` failed; ffmpeg must be on PATH");
  report.error = "ffmpeg not found on PATH";
  await finish(null, 1);
}
console.log(`ffmpeg                   ${ffmpegVersion}`);

const browser = await chromium.launch({ headless: !has("headed"), args: LAUNCH_ARGS });

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

  await page.goto(sceneUrl, { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(() => typeof window.__mareyExportVideo === "function", null, {
    timeout: 60_000,
    polling: 200,
  });
  if (!(await installMediabunny(page, mediabunnyPath))) {
    console.error(`mediabunny did not attach window.__mediabunny from '${mediabunnyPath}'`);
    report.error = "mediabunny not installed";
    await finish(browser, 1);
  }

  // 1. The WebCodecs file and the lossless references it was encoded from.
  const exported = await page.evaluate(
    async ({ source, fps }) => {
      try {
        const r = await window.__mareyExportVideo(source, { container: "mp4", fps, withReferenceFrames: true });
        return { ok: true, ...r };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },
    { source, fps },
  );
  if (!exported.ok) {
    console.error(`export failed: ${exported.error}`);
    report.error = `export failed: ${exported.error}`;
    await finish(browser, 1);
  }
  const { referenceFrames } = exported;
  const missing = referenceFrames.map((f, k) => (f ? -1 : k)).filter((k) => k >= 0);
  if (referenceFrames.length !== exported.frameCount || missing.length > 0) {
    report.error = `reference frames incomplete: ${referenceFrames.length} of ${exported.frameCount}, missing indices ${missing.join(",") || "none"}`;
    console.error(report.error);
    await finish(browser, 1);
  }
  const pngs = referenceFrames.map((b64) => Buffer.from(b64, "base64"));
  const wcBytes = Buffer.from(exported.video, "base64");
  writeFileSync(join(outDir, "webcodecs.mp4"), wcBytes);
  report.export = {
    fps: exported.fps,
    frameCount: exported.frameCount,
    width: exported.width,
    height: exported.height,
    sceneWidth: exported.sceneWidth,
    sceneHeight: exported.sceneHeight,
    hash: exported.hash,
    encoderConfigs: exported.encoderConfigs,
  };
  console.log(`scene                    ${scenePath}`);
  console.log(`frames / fps / coded     ${exported.frameCount} / ${exported.fps} / ${exported.width}x${exported.height}`);

  const summarize = (scored) => ({
    psnr: scored.psnr,
    specksPerFrame: scored.specksPerFrame,
    totalSpecks: scored.totalSpecks,
    decodedFrameCount: scored.decodedFrameCount,
    referenceFrameCount: scored.referenceFrameCount,
    width: scored.width,
    height: scored.height,
  });

  // 2-3. Score the WebCodecs file, then encode and score each x264 config.
  const wcScored = await scoreInPage(page, exported.video, referenceFrames);
  if (!wcScored.ok) {
    report.webcodecs = { ok: false, stage: wcScored.stage, error: wcScored.error };
    console.error(`WebCodecs file: scorer failed at stage '${wcScored.stage}': ${wcScored.error}`);
    await finish(browser, 1);
  }
  const wc = { bytes: wcBytes.length, sha256: sha256(wcBytes), ...summarize(wcScored) };
  report.webcodecs = wc;
  console.log(`WebCodecs                ${wc.psnr} dB  ${wc.specksPerFrame} specks/frame  ${wc.bytes} B`);

  report.configs = [];
  for (const config of MATRIX) {
    const out = join(outDir, `x264-${configName(config)}.mp4`);
    const args = x264Args(exported.fps, out, config);
    let bytes;
    try {
      bytes = await encodeWithFfmpeg(args, pngs, out);
    } catch (e) {
      report.configs.push({ ...config, ok: false, stage: "ffmpeg", error: e.message });
      report.error = `ffmpeg failed on ${configName(config)}: ${e.message}`;
      console.error(report.error);
      await finish(browser, 1);
    }
    const scored = await scoreInPage(page, bytes.toString("base64"), referenceFrames);
    if (!scored.ok) {
      // The scorer cannot judge this file. Record it and stop rather than
      // work around it.
      report.configs.push({ ...config, ok: false, stage: scored.stage, error: scored.error, bytes: bytes.length });
      report.error = `scorer failed at stage '${scored.stage}' on ${configName(config)}: ${scored.error}`;
      console.error(report.error);
      await finish(browser, 1);
    }
    const r = { ...config, ok: true, bytes: bytes.length, sha256: sha256(bytes), ...summarize(scored) };
    // 4. Spec §5's gate, exactly.
    r.pass = r.psnr >= wc.psnr + 1.0 && r.specksPerFrame <= wc.specksPerFrame / 10 && r.bytes <= 3 * wc.bytes;
    report.configs.push(r);
    console.log(`${configName(config).padEnd(24)} ${r.psnr} dB  ${r.specksPerFrame} specks/frame  ${r.bytes} B  ${r.pass ? "pass" : "fail"}`);
  }

  report.gate = {
    rule: "psnr >= wc.psnr + 1.0 && specksPerFrame <= wc.specksPerFrame / 10 && bytes <= 3 * wc.bytes",
    psnrAtLeast: +(wc.psnr + 1.0).toFixed(2),
    specksPerFrameAtMost: wc.specksPerFrame / 10,
    bytesAtMost: 3 * wc.bytes,
  };
  const passing = report.configs.filter((c) => c.pass).sort((a, b) => a.bytes - b.bytes);
  if (passing.length === 0) {
    report.verdict = "gate failed";
    report.chosen = null;
  } else {
    const c = passing[0];
    report.verdict = "gate passed";
    report.chosen = {
      settings: { crf: c.crf, preset: c.preset, tune: c.tune },
      args: x264Args(exported.fps, "<out>", c),
    };
    // 5. Two more encodes of the chosen config: is x264's output repeatable?
    const repeats = [];
    for (const n of [1, 2]) {
      const out = join(outDir, `repeat-${n}-${configName(c)}.mp4`);
      repeats.push(sha256(await encodeWithFfmpeg(x264Args(exported.fps, out, c), pngs, out)));
    }
    report.chosen.matrixSha256 = c.sha256;
    report.chosen.repeatSha256 = repeats;
    report.chosen.repeatsIdentical = repeats[0] === repeats[1];
  }
  if (consoleErrors.length > 0) report.consoleErrors = consoleErrors;

  // The table.
  const row = (cells) => `| ${cells.join(" | ")} |`;
  console.log("");
  console.log(row(["Encoder", "CRF", "Preset", "Tune", "PSNR (dB)", "Specks/frame", "Bytes", "Decoded", "Gate"]));
  console.log(row(Array(9).fill("---")));
  console.log(row(["WebCodecs", "-", "-", "-", wc.psnr, wc.specksPerFrame, wc.bytes, wc.decodedFrameCount, "baseline"]));
  for (const r of report.configs) {
    console.log(row(["x264", r.crf, r.preset, r.tune ?? "-", r.psnr, r.specksPerFrame, r.bytes, r.decodedFrameCount, r.pass ? "pass" : "fail"]));
  }
  console.log(`\nverdict: ${report.verdict}`);
  if (report.chosen) {
    console.log(`chosen:  ${JSON.stringify(report.chosen.settings)}`);
    console.log(`args:    ${JSON.stringify(report.chosen.args)}`);
    console.log(`repeat sha256: ${report.chosen.repeatSha256.join("  ")}  ${report.chosen.repeatsIdentical ? "identical" : "DIFFER"}`);
  }

  await page.close();
  await finish(browser, 0);
} catch (err) {
  console.error(`x264-gate.mjs crashed: ${err && err.stack ? err.stack : err}`);
  report.crash = String(err && err.message ? err.message : err);
  await finish(browser, 1);
}
