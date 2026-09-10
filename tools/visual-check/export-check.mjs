/**
 * Export the browser's real PNG pipeline and verify it twice from cold.
 *
 * `pngSequence.ts`'s whole reason to exist is a trap that numbers cannot see:
 * reading the live PixiJS canvas in-page returns a blank frame (no
 * `preserveDrawingBuffer`), and a sequence of identical blank PNGs hashes
 * perfectly consistently and passes every check below. This script writes the
 * frames to disk so a human can look at them — that is the actual test, not a
 * substitute for one.
 *
 * It calls `window.__mareyExportPng` (installed dev-only by
 * `src/lib/devExportSeam.ts`, wired in `main.tsx` behind
 * `import.meta.env.DEV`) rather than driving any UI. No export button ships
 * this phase — `marey export` is Phase 6 — so there is nothing to click; a
 * narrow named seam beats automating a control that does not exist, and beats
 * this harness re-implementing compile -> plan -> build -> sample -> encode in
 * page script where it could silently diverge from the pipeline the app
 * actually runs.
 *
 * The scene is still injected through the `#code=` share hash (same mechanism
 * as `check.mjs`), even though the seam takes the source text as a plain
 * argument and never reads the editor's state: it exercises the same load path
 * a real session takes, and gives the page a chance to fail loudly if that path
 * is broken.
 *
 * Runs the export twice — a fresh page loaded from cold each time — and
 * compares both the per-frame PNG bytes (sha256) and the returned simulation
 * hash (`hashFrames`, simulation output, not pixels). Divergence in either
 * means the export is not reproducible across reloads, which baked-frame
 * export depends on.
 *
 * Usage:
 *   node tools/visual-check/export-check.mjs \
 *     --scene tools/visual-check/scenes/logo.marey \
 *     --fps 30 --duration 3 --out .visual-check/export/logo
 *
 *   --scene <path>    .marey source file (required; no "default" fallback —
 *                      the built-in scene declares no `duration`, so it needs
 *                      an explicit --duration to export at all)
 *   --fps <n>         export frame rate (default 30)
 *   --duration <s>    export bound in seconds; overrides the scene's own
 *                      `duration:`. Omit to use the scene's declared one.
 *   --out <dir>       where frame_%04d.png (runA) and report.json go
 *   --url <origin>    dev server origin (default http://localhost:5199)
 *   --headed          show the browser window
 *
 * Writes runA's frames to `<out>/frame_%04d.png` (the set to look at) and
 * runB's to `<out>/runB/frame_%04d.png` (kept only for the cold-reload
 * comparison). Exit code is non-zero if either run failed, produced zero
 * frames, or the two runs disagree — never on how the PNGs look, which is a
 * judgement call for whoever reads them.
 */
import { chromium } from "playwright";
import LZString from "lz-string";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const url = arg("url", "http://localhost:5199");
const scenePath = arg("scene");
if (!scenePath) {
  console.error("export-check.mjs requires --scene <path-to-.marey-file>");
  process.exit(2);
}
const outDir = resolve(arg("out", ".visual-check/export/run"));
const fps = Number(arg("fps", "30"));
const durationArg = arg("duration", null);
const durationSeconds = durationArg === null ? undefined : Number(durationArg);

const source = readFileSync(resolve(scenePath), "utf8");

// Same reasoning as check.mjs: SwiftShader gives headless Chromium a working
// WebGL implementation. Without it PixiJS cannot initialise at all, which
// looks like an export bug but is really a missing GPU.
const LAUNCH_ARGS = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
];

const sceneUrl = `${url}/#code=${LZString.compressToEncodedURIComponent(source)}`;

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

const pad4 = (i) => String(i).padStart(4, "0");

async function runOnce(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(sceneUrl, { waitUntil: "load" });

  // The seam is installed by a dynamic import in main.tsx that runs
  // independently of whether the live preview itself renders, so this does
  // not wait on the app's own compile/render cycle — only on the seam
  // existing. If it never appears, either the DEV guard tripped in a dev
  // build (it should not) or the dynamic import failed.
  await page.waitForFunction(
    () => typeof window.__mareyExportPng === "function",
    null,
    { timeout: 20_000, polling: 200 },
  );

  const result = await page.evaluate(
    async ({ source, fps, durationSeconds }) => {
      try {
        const r = await window.__mareyExportPng(source, { fps, durationSeconds });
        return { ok: true, ...r };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },
    { source, fps, durationSeconds },
  );

  await page.close();
  return { ...result, consoleErrors, pageErrors };
}

function decodeFrames(base64Frames) {
  return (base64Frames ?? []).map((b64) => Buffer.from(b64, "base64"));
}

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: !has("headed"), args: LAUNCH_ARGS });
const runA = await runOnce(browser);
// A fresh page from cold, not a reload of the same page — at-rest state after
// a real navigation is the thing baked export actually depends on being
// reproducible across.
const runB = await runOnce(browser);
await browser.close();

const framesA = decodeFrames(runA.frames);
const framesB = decodeFrames(runB.frames);

framesA.forEach((buf, i) => writeFileSync(`${outDir}/frame_${pad4(i)}.png`, buf));
if (framesB.length > 0) {
  mkdirSync(`${outDir}/runB`, { recursive: true });
  framesB.forEach((buf, i) => writeFileSync(`${outDir}/runB/frame_${pad4(i)}.png`, buf));
}

const pngHashesA = framesA.map(sha);
const pngHashesB = framesB.map(sha);
const pngFramesMatch =
  runA.ok &&
  runB.ok &&
  pngHashesA.length === pngHashesB.length &&
  pngHashesA.every((h, i) => h === pngHashesB[i]);
const snapshotHashMatch = runA.ok && runB.ok && runA.hash === runB.hash;

const summarise = (run, pngHashes) => ({
  ok: run.ok,
  error: run.error ?? null,
  hash: run.hash ?? null,
  fps: run.fps ?? null,
  frameCount: run.frameCount ?? null,
  width: run.width ?? null,
  height: run.height ?? null,
  pngHashes,
  consoleErrors: run.consoleErrors,
  pageErrors: run.pageErrors,
});

const report = {
  scene: scenePath,
  requestedFps: fps,
  requestedDurationSeconds: durationSeconds ?? null,
  url,
  runA: summarise(runA, pngHashesA),
  runB: summarise(runB, pngHashesB),
  snapshotHashMatch,
  pngFramesMatch,
};
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));

console.log(`scene                    ${scenePath}`);
console.log(`fps                      ${fps}`);
console.log(`duration                 ${durationSeconds ?? "(scene's own)"}`);
console.log(`runA ok                  ${runA.ok}${runA.ok ? "" : `  (${runA.error})`}`);
console.log(`runA frameCount          ${runA.frameCount ?? "n/a"}`);
console.log(`runA snapshot hash       ${runA.hash ?? "n/a"}`);
console.log(`runB ok                  ${runB.ok}${runB.ok ? "" : `  (${runB.error})`}`);
console.log(`runB frameCount          ${runB.frameCount ?? "n/a"}`);
console.log(`runB snapshot hash       ${runB.hash ?? "n/a"}`);
console.log(`snapshot hash matches across cold reload   ${snapshotHashMatch}`);
console.log(`per-frame PNG hashes match across cold reload   ${pngFramesMatch}`);
console.log(`page errors (runA)      ${runA.pageErrors.length}`);
for (const e of runA.pageErrors) console.log(`  ! ${e}`);
console.log(`page errors (runB)      ${runB.pageErrors.length}`);
for (const e of runB.pageErrors) console.log(`  ! ${e}`);
console.log(
  `\nwrote ${outDir}/report.json, ${framesA.length} frame(s) to ${outDir}/frame_%04d.png` +
    (framesB.length > 0 ? `, and ${framesB.length} to ${outDir}/runB/` : ""),
);
console.log(
  "\nNumeric checks above cannot detect a blank-PNG export — a sequence of\n" +
    "identical blank frames hashes perfectly consistently and passes every one\n" +
    "of them. Open frame_0000.png, a mid-motion frame, and the last frame with\n" +
    "an image viewer before trusting this run.",
);

const fail =
  !runA.ok || !runB.ok || framesA.length === 0 || !snapshotHashMatch || !pngFramesMatch;
process.exit(fail ? 1 : 0);
