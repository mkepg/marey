/**
 * `npm run check:export`: `marey export`'s driver over every canonical scene
 * and format (spec Phase 6 §9.2).
 *
 * Default mode (CI; needs the built export page and CLI bundle, and the pinned
 * Chromium, but no dev server):
 * - every scene in `SCENES`, in every format in `FORMATS`, is exported twice
 *   through `exportScene`, each call launching its own browser. The two runs
 *   must give the same SHA-256 of the output and the same `hash` (the
 *   sampler's `hashFrames`, simulation state rather than pixels); for png the
 *   number of frames received must equal `frameCount`;
 * - the size is checked against the bytes, not only against what the page
 *   reports: png frames and the APNG by their IHDR, the Lottie document by its
 *   `w`/`h`, all at the scene's size; webm and mp4 by the coded size
 *   mediabunny reads from the container, at exactly twice the scene's size
 *   (`VIDEO_SCALE`);
 * - the font refusal (5C deferral 14): `bar-chart` as png with the font
 *   request aborted must reject with a message that starts with
 *   `[EXPORT_FONT_UNAVAILABLE]`.
 *
 * `--compare-seams` (before merge; needs `npx vite --port 5199 --strictPort`):
 * for each scene, the CLI's png frames, APNG file, Lottie text and WebM file
 * must equal, byte for byte, what the app's dev seams produce in a Chromium
 * launched with the same `EXPORT_LAUNCH_ARGS`, and every `hash` a seam
 * reports must equal the CLI's. The APNG seam reports no `hash`, so for apng
 * the file bytes are the whole comparison. mp4 is left out: spec §9.2 checks
 * it through its lossless frames and §5's scoring instead.
 *
 * Every case prints one line; the exit code is 1 if any case failed.
 *
 * Usage:
 *   npm run build:export-page && npm run build:cli
 *   node tools/cli-check/export-matrix.mjs                     # default mode
 *   node tools/cli-check/export-matrix.mjs --compare-seams [--url http://localhost:5199]
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { EXPORT_LAUNCH_ARGS, exportScene } from "../../dist/cli/marey.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * The four canonical scenes, with the size each declares in its own
 * `scene { size: ... }`. The size is written here rather than read back from
 * an export, so every size assertion below has a value no export produced.
 */
const SCENES = [
  { name: "bar-chart", path: "eval/scenes-3b/bar-chart.marey", width: 800, height: 600 },
  { name: "radial-dots", path: "eval/scenes-3b/radial-dots.marey", width: 800, height: 600 },
  { name: "compound-logo", path: "eval/scenes-3b/compound-logo.marey", width: 800, height: 600 },
  { name: "timeline-ticks", path: "eval/scenes-3b/timeline-ticks.marey", width: 800, height: 600 },
];

const FORMATS = ["png", "apng", "webm", "mp4", "lottie"];

/** The button's rate and the CLI's default (`EXPORT_FPS`, `src/compiler/export/exportDefaults.ts`). */
const FPS = 30;

/** Video is coded at twice the scene's size (`VIDEO_SCALE`, `src/compiler/export/videoContract.ts`). */
const VIDEO_SCALE = 2;

/** The path the export page loads its font from (`EXPORT_FONT_URL` in `exportFonts.ts`). */
const FONT_PATH = "/fonts/JetBrainsMono-Regular.ttf";

const readScene = (scene) => readFileSync(resolve(ROOT, scene.path), "utf8");

/** Over the frames in index order for png, as `marey export` hashes what it writes. */
function sha256Of(result) {
  const sha = createHash("sha256");
  if (result.frames !== null) for (const frame of result.frames) sha.update(frame);
  else if (result.file !== null) sha.update(result.file);
  return sha.digest("hex");
}

/** A PNG's size from its IHDR: signature, IHDR's length and type, then width and height big-endian. */
function pngSize(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = "89504e470d0a1a0a";
  if (buf.byteLength < 24 || buf.subarray(0, 8).toString("hex") !== signature) return null;
  if (buf.subarray(12, 16).toString("latin1") !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** The coded size of the container's video track, read by mediabunny's demuxer. */
async function videoSize(bytes) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    return track === null ? null : { width: track.codedWidth, height: track.codedHeight };
  } finally {
    input.dispose();
  }
}

const sizeText = (s) => (s === null ? "unreadable" : `${s.width}x${s.height}`);
const sameSize = (a, b) => a !== null && b !== null && a.width === b.width && a.height === b.height;

/** Each size the bytes say, for one result. */
async function sizesInBytes(format, result) {
  switch (format) {
    case "png":
      return result.frames.map(pngSize);
    case "apng":
      return [pngSize(result.file)];
    case "lottie": {
      const doc = JSON.parse(Buffer.from(result.file).toString("utf8"));
      return [{ width: doc.w, height: doc.h }];
    }
    case "webm":
    case "mp4":
      return [await videoSize(result.file)];
  }
}

/** What one result must satisfy on its own: its frame count and its size. */
async function checkOne(format, scene, result, label) {
  const problems = [];
  if (format === "png") {
    if (result.frames === null || result.frames.length !== result.frameCount) {
      problems.push(`${label}: ${result.frames?.length ?? "no"} frames received, frameCount ${result.frameCount}`);
      return problems;
    }
  } else if (result.file === null) {
    problems.push(`${label}: no file`);
    return problems;
  }

  const scale = format === "webm" || format === "mp4" ? VIDEO_SCALE : 1;
  const expected = { width: scene.width * scale, height: scene.height * scale };
  if (!sameSize(result, expected)) {
    problems.push(`${label}: reported ${sizeText(result)}, expected ${sizeText(expected)}`);
  }
  const sizes = await sizesInBytes(format, result);
  const wrong = sizes.findIndex((s) => !sameSize(s, expected));
  if (wrong >= 0) {
    const where = format === "png" ? `frame ${wrong}'s IHDR` : format === "lottie" ? "w/h" : "bytes";
    problems.push(`${label}: ${where} ${sizeText(sizes[wrong])}, expected ${sizeText(expected)}`);
  }
  return problems;
}

async function runCase(scene, format) {
  const source = readScene(scene);
  const started = Date.now();
  const runs = [];
  try {
    for (let i = 0; i < 2; i++) {
      runs.push(await exportScene({ source, format, fps: FPS, durationSeconds: null }));
    }
  } catch (e) {
    return { ok: false, ms: Date.now() - started, detail: `export ${runs.length + 1} threw: ${e.message}` };
  }
  const ms = Date.now() - started;
  const [a, b] = runs;
  const [shaA, shaB] = runs.map(sha256Of);

  const problems = [
    ...(await checkOne(format, scene, a, "run 1")),
    ...(await checkOne(format, scene, b, "run 2")),
  ];
  if (shaA !== shaB) problems.push(`sha256 differs: ${shaA.slice(0, 16)} vs ${shaB.slice(0, 16)}`);
  if (a.hash !== b.hash) problems.push(`hash differs: ${a.hash} vs ${b.hash}`);

  const detail =
    `${a.frameCount} frames  ${sizeText(a)}  sha256 ${shaA.slice(0, 16)}  frames ${a.hash}` +
    (problems.length > 0 ? `  | ${problems.join("; ")}` : "");
  return { ok: problems.length === 0, ms, detail };
}

async function runFontAbort() {
  const scene = SCENES.find((s) => s.name === "bar-chart");
  const started = Date.now();
  const code = "[EXPORT_FONT_UNAVAILABLE]";
  try {
    await exportScene({
      source: readScene(scene),
      format: "png",
      fps: FPS,
      durationSeconds: null,
      abortPaths: [FONT_PATH],
    });
    return { ok: false, ms: Date.now() - started, detail: `resolved; expected a rejection starting ${code}` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const ok = message.startsWith(code);
    return { ok, ms: Date.now() - started, detail: ok ? message : `rejected with: ${message}` };
  }
}

function printLine(label, result) {
  const seconds = (result.ms / 1000).toFixed(1).padStart(6);
  console.log(`${result.ok ? "ok  " : "FAIL"}  ${label.padEnd(28)} ${seconds} s  ${result.detail}`);
}

async function defaultMode() {
  let failed = 0;
  for (const scene of SCENES) {
    for (const format of FORMATS) {
      const result = await runCase(scene, format);
      printLine(`${scene.name} ${format}`, result);
      if (!result.ok) failed++;
    }
  }
  const font = await runFontAbort();
  printLine(`bar-chart png, font aborted`, font);
  if (!font.ok) failed++;
  return failed;
}

// ---------------------------------------------------------------------------
// --compare-seams

const base64Bytes = (b64) => Buffer.from(b64, "base64");

/** Byte equality, and the first differing offset when there is one. */
function compareBytes(cli, seam) {
  const a = Buffer.from(cli.buffer, cli.byteOffset, cli.byteLength);
  if (a.equals(seam)) return null;
  const n = Math.min(a.byteLength, seam.byteLength);
  let at = 0;
  while (at < n && a[at] === seam[at]) at++;
  return `CLI ${a.byteLength} B, seam ${seam.byteLength} B, first difference at byte ${at}`;
}

/** Calls one dev seam in a fresh page of the app, as the visual checks do. */
async function callSeam(browser, url, source, format) {
  const { default: LZString } = await import("lz-string");
  const { seam, call } = SEAM_CALLS[format];
  const page = await browser.newPage();
  try {
    await page.goto(`${url}/#code=${LZString.compressToEncodedURIComponent(source)}`, {
      waitUntil: "load",
      timeout: 60_000,
    });
    // `main.tsx` installs the seams through a dynamic import in dev mode.
    await page.waitForFunction((name) => typeof window[name] === "function", seam, { timeout: 20_000 });
    return await page.evaluate(call, { source, fps: FPS });
  } finally {
    await page.close();
  }
}

// Each `call` runs inside the page. Base64 and strings cross `page.evaluate`
// exactly; the Lottie document is stringified in the page, as the button does.
const SEAM_CALLS = {
  png: {
    seam: "__mareyExportPng",
    call: async ({ source, fps }) => {
      const r = await window.__mareyExportPng(source, { fps });
      return { frames: r.frames, hash: r.hash, frameCount: r.frameCount, width: r.width, height: r.height };
    },
  },
  apng: {
    seam: "__mareyExportApng",
    call: async ({ source, fps }) => {
      const r = await window.__mareyExportApng(source, { fps, withReferenceCapture: false });
      return { file: r.apng, frameCount: r.frameCount };
    },
  },
  lottie: {
    seam: "__mareyExportLottie",
    call: async ({ source, fps }) => {
      const r = await window.__mareyExportLottie(source, { fps });
      return { text: JSON.stringify(r.doc), hash: r.hash, frameCount: r.frameCount };
    },
  },
  webm: {
    seam: "__mareyExportVideo",
    call: async ({ source, fps }) => {
      const r = await window.__mareyExportVideo(source, { container: "webm", fps, withReferenceFrames: false });
      return {
        file: r.video,
        hash: r.hash,
        frameCount: r.frameCount,
        width: r.width,
        height: r.height,
        encoderConfigs: r.encoderConfigs,
      };
    },
  },
};

async function compareCase(browser, url, scene, format) {
  const source = readScene(scene);
  const started = Date.now();
  let cli;
  let seam;
  try {
    cli = await exportScene({ source, format, fps: FPS, durationSeconds: null });
  } catch (e) {
    return { ok: false, ms: Date.now() - started, detail: `CLI export threw: ${e.message}` };
  }
  try {
    seam = await callSeam(browser, url, source, format);
  } catch (e) {
    return { ok: false, ms: Date.now() - started, detail: `seam threw: ${e.message}` };
  }
  const ms = Date.now() - started;

  const problems = [];
  if (seam.frameCount !== cli.frameCount) problems.push(`frameCount CLI ${cli.frameCount}, seam ${seam.frameCount}`);
  if (seam.hash !== undefined && seam.hash !== cli.hash) problems.push(`hash CLI ${cli.hash}, seam ${seam.hash}`);
  if (seam.width !== undefined && !sameSize(cli, seam)) problems.push(`size CLI ${sizeText(cli)}, seam ${sizeText(seam)}`);

  if (format === "png") {
    if (seam.frames.length !== cli.frames.length) {
      problems.push(`CLI ${cli.frames.length} frames, seam ${seam.frames.length}`);
    }
    const differing = [];
    for (let i = 0; i < Math.min(seam.frames.length, cli.frames.length); i++) {
      if (compareBytes(cli.frames[i], base64Bytes(seam.frames[i])) !== null) differing.push(i);
    }
    if (differing.length > 0) {
      problems.push(`${differing.length} frame(s) differ, first ${differing.slice(0, 5).join(", ")}`);
    }
  } else if (format === "lottie") {
    const diff = compareBytes(cli.file, Buffer.from(seam.text, "utf8"));
    if (diff !== null) problems.push(`Lottie text differs: ${diff}`);
  } else {
    const diff = compareBytes(cli.file, base64Bytes(seam.file));
    if (diff !== null) problems.push(`file differs: ${diff}`);
  }

  if (format === "webm" && problems.length > 0) {
    problems.push(`seam encoderConfigs ${JSON.stringify(seam.encoderConfigs)}`);
  }

  const bytes = format === "png" ? cli.frames.reduce((n, f) => n + f.byteLength, 0) : cli.file.byteLength;
  const hash = seam.hash === undefined ? "seam reports no hash" : `frames ${cli.hash}`;
  const detail =
    `${cli.frameCount} frames  ${bytes} B  sha256 ${sha256Of(cli).slice(0, 16)}  ${hash}` +
    (problems.length > 0 ? `  | ${problems.join("; ")}` : "  equal");
  return { ok: problems.length === 0, ms, detail };
}

async function compareSeamsMode() {
  const urlIndex = process.argv.indexOf("--url");
  const url = urlIndex >= 0 ? process.argv[urlIndex + 1] : "http://localhost:5199";
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ args: [...EXPORT_LAUNCH_ARGS] });
  let failed = 0;
  try {
    for (const scene of SCENES) {
      for (const format of ["png", "apng", "lottie", "webm"]) {
        const result = await compareCase(browser, url, scene, format);
        printLine(`${scene.name} ${format}`, result);
        if (!result.ok) failed++;
      }
    }
  } finally {
    await browser.close();
  }
  return failed;
}

const started = Date.now();
const compare = process.argv.includes("--compare-seams");
const failed = compare ? await compareSeamsMode() : await defaultMode();
const total = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${compare ? "compare-seams" : "matrix"}: ${failed === 0 ? "all passed" : `${failed} failed`}  (${total} s)`);
process.exitCode = failed === 0 ? 0 : 1;
