/**
 * Drive the Marey playground in a real browser and capture what it renders.
 *
 * The renderer's unit tests are headless by design and cannot see a canvas, so
 * this covers what they structurally cannot: that a scene renders at all, that
 * physics settles where it should, that the ticker actually stops, and that a
 * scene replays identically across a real page reload.
 *
 * Usage:
 *   node tools/visual-check/check.mjs \
 *     --scene tools/visual-check/scenes/pile.marey \
 *     --at 300,1500,4000 --settle 9000 --out .visual-check/pile
 *
 *   --url <origin>    dev server origin (default http://localhost:5199)
 *   --scene default   use the app's built-in scene instead of a file
 *   --headed          show the browser window (use if WebGL misbehaves)
 *   --settle <ms>     how long to wait before the at-rest capture (default 9000)
 *
 * Writes PNGs plus report.json. Exit code is non-zero only if the page threw,
 * the canvas never appeared, or the app reported a compile error — whether a
 * scene *looks* right is a judgement call for whoever reads the PNGs.
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
const scene = arg("scene", "default");
const outDir = resolve(arg("out", ".visual-check/run"));
const settleMs = Number(arg("settle", "9000"));
const captureAt = arg("at", "300,1500,4000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter(Number.isFinite)
  .sort((a, b) => a - b);

// SwiftShader gives headless Chromium a working WebGL implementation. Without
// it PixiJS cannot initialise and every capture is a blank frame, which looks
// like a renderer bug but is really a missing GPU.
const LAUNCH_ARGS = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
];

/** The app reads `#code=<lz-string>` at boot, which beats driving Monaco. */
const sceneUrl = (code) =>
  code === null ? url : `${url}/#code=${LZString.compressToEncodedURIComponent(code)}`;

/**
 * Tag the PixiJS canvas with a stable attribute.
 *
 * `querySelector("canvas")` is wrong here: Monaco contributes several canvases
 * of its own (the overview ruler, the minimap), and the preview host's class
 * name is a hashed CSS-module identifier so it cannot be selected by name
 * either. The renderer's canvas is the largest one outside the editor.
 */
const TAG_CANVAS = () => {
  const all = [...document.querySelectorAll("canvas")].filter(
    (c) => !c.closest(".monaco-editor") && c.width > 0 && c.height > 0,
  );
  if (all.length === 0) return false;
  all.sort((a, b) => b.width * b.height - a.width * a.height);
  all[0].setAttribute("data-visual-check", "pixi");
  return true;
};
const PIXI_CANVAS = 'canvas[data-visual-check="pixi"]';

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

/**
 * Read the app's own output panel.
 *
 * Far more informative than inspecting pixels: it reports the compile result
 * and whether the renderer initialised, in the app's own words.
 */
const readLog = (page) =>
  page.evaluate(() => document.body.innerText).then((t) =>
    t
      .split("\n")
      .filter((l) => /^\[(lexer|parser|type|pixi|render|system)\]/.test(l.trim()))
      .map((l) => l.trim()),
  );

/**
 * CPU time consumed by the tab, via the DevTools protocol.
 *
 * This is the honest version of "watch the CPU graph drop". PixiJS's ticker
 * drives off requestAnimationFrame, but so does Monaco, so counting rAF calls
 * cannot tell the two apart. Task duration can.
 */
async function cpuSeconds(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return metrics.find((m) => m.name === "TaskDuration")?.value ?? 0;
}

async function runOnce(browser, code, label) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");

  await page.goto(sceneUrl(code), { waitUntil: "load" });
  await page.waitForFunction(TAG_CANVAS, null, { timeout: 20_000, polling: 200 });
  const canvas = page.locator(PIXI_CANVAS);

  const captures = [];
  let last = 0;
  for (const t of captureAt) {
    await page.waitForTimeout(Math.max(0, t - last));
    last = t;
    const buf = await canvas.screenshot({ path: `${outDir}/${label}-${t}ms.png` });
    captures.push({ atMs: t, bytes: buf.length, sha: sha(buf) });
  }

  await page.waitForTimeout(Math.max(0, settleMs - last));
  const restBuf = await canvas.screenshot({ path: `${outDir}/${label}-rest.png` });

  // Two seconds later: identical pixels mean nothing is moving, and near-zero
  // CPU means the ticker genuinely stopped rather than spinning on a still frame.
  const cpuBefore = await cpuSeconds(cdp);
  await page.waitForTimeout(2000);
  const cpuAfter = await cpuSeconds(cdp);
  const restBuf2 = await canvas.screenshot({ path: `${outDir}/${label}-rest+2s.png` });

  const log = await readLog(page);
  await page.close();

  return {
    captures,
    restSha: sha(restBuf),
    restBytes: restBuf.length,
    frozenAtRest: sha(restBuf) === sha(restBuf2),
    cpuSecondsIn2sAtRest: +(cpuAfter - cpuBefore).toFixed(3),
    compiled: log.some((l) => l.includes("no errors")),
    rendered: log.some((l) => l.startsWith("[pixi]") && l.includes("rendered")),
    log,
    consoleErrors,
    pageErrors,
  };
}

const code = scene === "default" ? null : readFileSync(resolve(scene), "utf8");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: !has("headed"), args: LAUNCH_ARGS });
const runA = await runOnce(browser, code, "runA");
// Second cold load of the identical scene. At rest the state is
// time-independent, so a deterministic renderer must produce the same pixels.
const runB = await runOnce(browser, code, "runB");
await browser.close();

const report = { url, scene, settleMs, runA, runB, deterministicAtRest: runA.restSha === runB.restSha };
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));

const fail = !runA.rendered || !runA.compiled || runA.pageErrors.length > 0;

console.log(`scene            ${scene}`);
console.log(`compiled         ${runA.compiled}`);
console.log(`rendered         ${runA.rendered}`);
console.log(`frozen at rest   ${runA.frozenAtRest}   (identical pixels 2s apart)`);
console.log(`cpu at rest      ${runA.cpuSecondsIn2sAtRest}s of CPU over 2s wall (near 0 = ticker stopped)`);
console.log(`deterministic    ${report.deterministicAtRest}   (identical pixels at rest across a reload)`);
console.log(`  runA rest sha  ${runA.restSha}`);
console.log(`  runB rest sha  ${runB.restSha}`);
console.log(`page errors      ${runA.pageErrors.length}`);
for (const e of runA.pageErrors) console.log(`  ! ${e}`);
for (const l of runA.log.slice(-4)) console.log(`  ${l}`);
console.log(`\nwrote ${outDir}/report.json and PNGs`);

process.exit(fail ? 1 : 0);
