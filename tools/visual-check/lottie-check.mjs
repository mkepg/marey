/**
 * Export a scene to Lottie, play it back in a real lottie-web player inside
 * Chromium, and read back actual pixel values at named coordinates.
 *
 * This is Task 4's browser harness for design §11 (`docs/specs/
 * 2026-09-11-marey-phase-5a-baked-lottie-design.md`) — the six claims the
 * design document could not settle from the published Lottie spec alone
 * (stacking order, opacity propagation through parenting, the shape-list
 * field name, the version field's name/form, `op` inclusive-vs-exclusive,
 * and the linear-easing handle values). Task 5 extends this harness for the
 * canonical-scene evidence and the measured pixel tolerance, so it takes no
 * hard-coded scene and every fixture lives in `scenes/` as a plain argument.
 *
 * It calls `window.__mareyExportLottie` (installed dev-only by
 * `src/lib/devLottieSeam.ts`, wired in `main.tsx` behind
 * `import.meta.env.DEV`) rather than driving any UI — same reasoning as
 * `export-check.mjs`'s `window.__mareyExportPng`: no export button ships
 * this phase, and a narrow named seam beats re-implementing compile ->
 * plan -> build -> sample -> encode in page script, where a harness-only
 * copy could silently diverge from the pipeline the app actually runs.
 *
 * The returned Lottie document is written to disk, optionally patched with
 * `--set`/`--unset` (used by the §11.4 version-field question to swap `v`
 * for `ver` without a second export), then handed to a REAL lottie-web
 * player (`lottie-web/build/player/lottie.min.js`, loaded via
 * `page.addScriptTag({ path })` — confirmed working against a page already
 * navigated to the dev server's own origin, not just `about:blank`) using
 * the `canvas` renderer. The canvas renderer is a plain 2D context, so
 * unlike PixiJS's WebGL canvas there is no `preserveDrawingBuffer` trap:
 * `ctx.getImageData` reads real pixels back exactly, with no screenshot
 * re-encoding in between. Both a full PNG capture (for a human to look at
 * with the Read tool) and precise in-page `getImageData` samples at named
 * coordinates are recorded — a screenshot alone is an "impression"; the
 * numeric samples are the actual evidence.
 *
 * Usage:
 *   node tools/visual-check/lottie-check.mjs \
 *     --scene tools/visual-check/scenes/lottie-layer-order.marey \
 *     --fps 30 --frames 0 \
 *     --at 100,100 --at 30,100 \
 *     --out .visual-check/lottie/layer-order
 *
 *   --scene <path>      .marey source file (required). No "default"
 *                        fallback, matching export-check.mjs: the built-in
 *                        scene declares no duration.
 *   --fps <n>            export frame rate (default 30)
 *   --duration <s>       export bound in seconds; overrides the scene's own
 *                        `duration:`. Omit to use the scene's declared one.
 *   --frames <list>      comma-separated frame values to sample, INTEGER OR
 *                        FRACTIONAL (lottie-web's subframe rendering is on
 *                        by default in 5.13.0 — see the module's own
 *                        `subframeEnabled` default). Default "0".
 *   --at <x,y>           a pixel coordinate to sample at every requested
 *                        frame, read via `getImageData` (exact byte values,
 *                        not a screenshot's). Repeatable.
 *   --set <field=json>   patch the exported document's top-level `field`
 *                        with `JSON.parse(json)` before handing it to
 *                        lottie-web. Repeatable. Applied after `--unset`.
 *   --unset <field>      delete the document's top-level `field` before
 *                        handing it to lottie-web. Repeatable.
 *   --out <dir>          where doc.json, frame_<label>.png and report.json go
 *   --url <origin>       dev server origin (default http://localhost:5199)
 *   --lottie-path <path> path to the lottie-web UMD build (default
 *                        node_modules/lottie-web/build/player/lottie.min.js,
 *                        resolved from the current working directory)
 *   --headed             show the browser window
 *
 * Writes `<out>/doc.json` (the document actually handed to lottie-web, i.e.
 * post-patch), `<out>/frame_<label>.png` per requested frame (label is the
 * frame value with `.` replaced by `p`, e.g. `frame_0p5.png`), and
 * `<out>/report.json` with the export metadata, every sampled pixel, and
 * page/console errors. Exit code is non-zero only on a hard failure (export
 * threw, lottie-web failed to load the document, or a page error was
 * recorded) — never on what a sampled pixel says, which is this script's
 * whole reason to exist and is a judgement call for whoever reads the report.
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
  console.error("lottie-check.mjs requires --scene <path-to-.marey-file>");
  process.exit(2);
}
const outDir = resolve(arg("out", ".visual-check/lottie/run"));
const fps = Number(arg("fps", "30"));
const durationArg = arg("duration", null);
const durationSeconds = durationArg === null ? undefined : Number(durationArg);
const framesArg = arg("frames", "0");
const requestedFrames = framesArg.split(",").map((s) => Number(s.trim()));
const atPoints = argAll("at").map((s) => {
  const [x, y] = s.split(",").map(Number);
  return { x, y };
});
const setFields = argAll("set").map((s) => {
  const i = s.indexOf("=");
  if (i === -1) throw new Error(`--set expects field=json, got '${s}'`);
  return { field: s.slice(0, i), value: JSON.parse(s.slice(i + 1)) };
});
const unsetFields = argAll("unset");
const lottiePath = resolve(arg("lottie-path", "node_modules/lottie-web/build/player/lottie.min.js"));

const source = readFileSync(resolve(scenePath), "utf8");

// Same reasoning as check.mjs / export-check.mjs: SwiftShader gives headless
// Chromium a working WebGL implementation, which the Marey app's own preview
// needs even though the Lottie playback this script cares about is a plain
// 2D canvas. Without it PixiJS cannot initialise at all and the export seam
// (which builds a real Application) throws before ever reaching lottie-web.
const LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"];

const sceneUrl = `${url}/#code=${LZString.compressToEncodedURIComponent(source)}`;

const pad = (label) => String(label).replace(/\./g, "p").replace(/-/g, "neg");

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: !has("headed"), args: LAUNCH_ARGS });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(sceneUrl, { waitUntil: "load" });

await page.waitForFunction(() => typeof window.__mareyExportLottie === "function", null, {
  timeout: 20_000,
  polling: 200,
});

const exportResult = await page.evaluate(
  async ({ source, fps, durationSeconds }) => {
    try {
      const r = await window.__mareyExportLottie(source, { fps, durationSeconds });
      return { ok: true, ...r };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  },
  { source, fps, durationSeconds },
);

if (!exportResult.ok) {
  console.error(`export failed: ${exportResult.error}`);
  writeFileSync(`${outDir}/report.json`, JSON.stringify({ scene: scenePath, exportResult }, null, 2));
  await browser.close();
  process.exit(1);
}

// Patch, then write the document actually handed to lottie-web — not the
// seam's raw output — so `doc.json` on disk always matches what was rendered.
const doc = exportResult.doc;
for (const field of unsetFields) delete doc[field];
for (const { field, value } of setFields) doc[field] = value;
writeFileSync(`${outDir}/doc.json`, JSON.stringify(doc, null, 2));

// `addScriptTag({ path })` reads the file locally and injects its contents
// as an inline <script>, rather than requesting it through the page's own
// origin — confirmed working here against the real dev-server page (not
// just `about:blank`), so a bare `import "lottie-web"` for Vite to resolve
// is unnecessary. `lottie.min.js` is a UMD build; it attaches `window.lottie`
// because `document`/`navigator` both exist on this page.
await page.addScriptTag({ path: lottiePath });
const lottieGlobalOk = await page.evaluate(() => typeof window.lottie === "object" && window.lottie !== null);
if (!lottieGlobalOk) {
  console.error(`lottie-web did not attach window.lottie after addScriptTag({ path: '${lottiePath}' })`);
  await browser.close();
  process.exit(1);
}

// A container sized in CSS pixels to EXACTLY the document's own w/h, with
// `dpr: 1` in rendererSettings, so the canvas backing store is `doc.w x
// doc.h` physical pixels with no letterboxing and no devicePixelRatio scale
// — coordinates a caller passes to `--at` are then Lottie-space coordinates
// directly, with no conversion.
const loadResult = await page.evaluate(
  ({ doc }) =>
    new Promise((resolvePromise) => {
      const container = document.createElement("div");
      container.id = "__lottieCheck";
      // `position: fixed` at a high z-index, ABOVE the app's own fixed
      // header/corner UI: Playwright's element screenshot composites the
      // real rendered page, so without this the app's chrome visibly
      // overlaps the lottie canvas in the PNG even though it never touches
      // the canvas's own backing bitmap (getImageData below is unaffected
      // either way — this only matters for the PNG a human looks at).
      container.style.position = "fixed";
      container.style.left = "0";
      container.style.top = "0";
      container.style.zIndex = "2147483647";
      container.style.width = `${doc.w}px`;
      container.style.height = `${doc.h}px`;
      document.body.appendChild(container);
      const anim = window.lottie.loadAnimation({
        container,
        renderer: "canvas",
        loop: false,
        autoplay: false,
        animationData: doc,
        rendererSettings: { dpr: 1, clearCanvas: true },
      });
      window.__lottieCheckAnim = anim;
      anim.addEventListener("data_failed", () => resolvePromise({ ok: false, error: "data_failed" }));
      if (anim.isLoaded) {
        resolvePromise({ ok: true });
      } else {
        anim.addEventListener("DOMLoaded", () => resolvePromise({ ok: true }));
      }
    }),
  { doc },
);

if (!loadResult.ok) {
  console.error(`lottie-web failed to load the document: ${loadResult.error}`);
  await browser.close();
  process.exit(1);
}

const frameSamples = [];
for (const frame of requestedFrames) {
  await page.evaluate((f) => window.__lottieCheckAnim.goToAndStop(f, true), frame);

  const pngPath = `${outDir}/frame_${pad(frame)}.png`;
  await page.locator("#__lottieCheck canvas").screenshot({ path: pngPath });

  const pixels = [];
  for (const { x, y } of atPoints) {
    const rgba = await page.evaluate(
      ({ x, y }) => {
        const canvas = document.querySelector("#__lottieCheck canvas");
        const ctx = canvas.getContext("2d");
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      },
      { x, y },
    );
    pixels.push({ x, y, rgba });
  }
  frameSamples.push({ frame, png: pngPath, pixels });
}

await browser.close();

const report = {
  scene: scenePath,
  requestedFps: fps,
  requestedDurationSeconds: durationSeconds ?? null,
  url,
  lottiePath,
  patched: { set: setFields, unset: unsetFields },
  exportMeta: { fps: exportResult.fps, frameCount: exportResult.frameCount, hash: exportResult.hash },
  frameSamples,
  consoleErrors,
  pageErrors,
};
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));

console.log(`scene                    ${scenePath}`);
console.log(`fps / frameCount         ${exportResult.fps} / ${exportResult.frameCount}`);
console.log(`snapshot hash            ${exportResult.hash}`);
if (setFields.length || unsetFields.length) {
  console.log(`patched                  set ${JSON.stringify(setFields)}, unset ${JSON.stringify(unsetFields)}`);
}
for (const fs_ of frameSamples) {
  console.log(`frame ${fs_.frame}:`);
  for (const p of fs_.pixels) {
    console.log(`  (${p.x},${p.y}) -> rgba(${p.rgba.join(",")})`);
  }
  console.log(`  png: ${fs_.png}`);
}
console.log(`page errors              ${pageErrors.length}`);
for (const e of pageErrors) console.log(`  ! ${e}`);
console.log(`console errors           ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`  ! ${e}`);
console.log(`\nwrote ${outDir}/doc.json, ${outDir}/report.json, and ${frameSamples.length} frame PNG(s)`);
console.log(
  "\nThis script's numbers are the evidence, not a substitute for looking: read the frame_*.png\n" +
    "files with an image viewer (or the Read tool) before trusting a sampled pixel in isolation.",
);

process.exit(pageErrors.length > 0 ? 1 : 0);
