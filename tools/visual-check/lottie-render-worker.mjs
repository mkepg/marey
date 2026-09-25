/**
 * Internal helper for `lottie-check.mjs` (Phase 5C Task 3, ruling T3-R1). Not
 * meant to be run directly by a person — `lottie-check.mjs` spawns this as a
 * SEPARATE OS PROCESS (`node lottie-render-worker.mjs --input <f> --output
 * <f>`), reads the file it writes back, and folds the result into its own
 * `report.json`. This file owns the whole "load the document into a real
 * lottie-web/dotlottie-web player and sample frames" half of the job;
 * `lottie-check.mjs` owns the "run the Marey app and export" half.
 *
 * **Why a separate OS process, when the brief asked only for "a fresh page or
 * context".** Measured directly (Phase 5C Task 3, this task's own report has
 * the full trace): a page that calls `window.__mareyExportLottie` (which
 * builds and tears down a real pixi WebGL `Application`) followed by a
 * SECOND, `about:blank` page that only loads lottie-web reproduces the exact
 * broken-join defect `task-2-verify.md` found — even with the two pages in
 * separate `browser.newPage()` contexts, and even with the export's browser
 * fully `.close()`-d and a brand-new `chromium.launch()` used for the render
 * page, PROVIDED both calls happen inside the same Node.js process. Splitting
 * the same two steps across two separate `node` invocations (export in one
 * process, exit, then a second process reads the exported document from disk
 * and renders it) reproduces the CORRECT geometry every time this was
 * measured. So the defect's boundary is the Node process / Playwright driver
 * session, not the page or even the Chromium OS process — "a fresh page or
 * context" was the brief's best guess before this was measured, and the
 * measurement supersedes it (Global Constraints' own instruction: report a
 * wrong verbatim claim loudly rather than silently keep to it). This module
 * is the fix that actually holds.
 *
 * Talks to its parent entirely through the filesystem, not stdio parsing:
 * `--input` is a JSON file `{ doc, renderer, requestedFrames, atPoints,
 * pngExport, lottiePath, dotlottiePath, dotlottieWasmPath, headed, outDir }`
 * (exactly the values `lottie-check.mjs` already computed — this worker
 * parses no CLI flags of its own beyond the two file paths), and `--output`
 * is where this worker writes its own JSON result (frame samples, PNG paths
 * already written to `outDir`, lottie/console/page errors, or a failure
 * shape on the stage that failed) — written on every exit path, mirroring
 * `lottie-check.mjs`'s own "report.json written on every exit path" rule, so
 * a crash here still leaves the parent something to read rather than an
 * empty file.
 *
 * Everything below this point (the renderer setup, the load-result promise,
 * the frame-sampling loop, the `--compare-png` diff) is moved, not
 * reimplemented, from the pre-T3-R1 single-process version of
 * `lottie-check.mjs` — see that file's git history for the byte-for-byte
 * originals of each block if a comment here seems to reference something no
 * longer visible in this file.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const inputPath = arg("input");
const outputPath = arg("output");
if (!inputPath || !outputPath) {
  console.error("lottie-render-worker.mjs requires --input <file> and --output <file>");
  process.exit(2);
}

const input = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const { doc, renderer, requestedFrames, atPoints, pngExport, lottiePath, dotlottiePath, dotlottieWasmPath, headed, outDir } = input;

const pad = (label) => String(label).replace(/\./g, "p").replace(/-/g, "neg");

function writeResultAndExit(result, exitCode) {
  writeFileSync(resolve(outputPath), JSON.stringify(result, null, 2));
  process.exit(exitCode);
}

// Same launch args as `lottie-check.mjs`'s own `LAUNCH_ARGS`, including
// `--disable-accelerated-2d-canvas` -- 5A pinned that flag for a real,
// separate determinism reason (see `lottie-check.mjs`'s own comment on it),
// and this split does not touch that reasoning at all.
const LAUNCH_ARGS = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--disable-accelerated-2d-canvas",
];

const browser = await chromium.launch({ headless: !headed, args: LAUNCH_ARGS });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => pageErrors.push(String(e)));

// The property this whole worker exists for: this page never navigates to
// the Marey app (not even without a `#code=` hash -- the live preview's own
// pixi `Application` would be an identical confound), so it never
// constructs any pixi WebGL `Application` at all, in this process or any
// other.
await page.goto("about:blank");

// dotlottie-web's default build fetches its WASM binary from jsdelivr/unpkg.
// Playwright's headless Chromium DOES have outbound network access here
// (measured directly by `lottie-check.mjs`'s original author), but routing
// to the local `node_modules` copy keeps this harness reproducible
// somewhere that outbound access is unavailable, and matches how lottie-web
// is already loaded (`addScriptTag({ path })`, no network either).
// Registered unconditionally; harmlessly no-ops under `--renderer
// lottie-web`, since nothing ever requests that URL in that mode.
await page.route(/dotlottie-player\.wasm/, (route) => route.fulfill({ path: resolve(dotlottieWasmPath) }));

if (renderer === "lottie-web") {
  // `addScriptTag({ path })` reads the file locally and injects its contents
  // as an inline <script>; confirmed working against `about:blank`, not just
  // a page navigated to a real origin. `lottie.min.js` is a UMD build; it
  // attaches `window.lottie` because `document`/`navigator` both exist on
  // any page, including `about:blank`.
  await page.addScriptTag({ path: resolve(lottiePath) });
  const lottieGlobalOk = await page.evaluate(() => typeof window.lottie === "object" && window.lottie !== null);
  if (!lottieGlobalOk) {
    const error = `lottie-web did not attach window.lottie after addScriptTag({ path: '${lottiePath}' })`;
    console.error(error);
    await browser.close();
    writeResultAndExit({ ok: false, stage: "load-lottie-web", error, consoleErrors, pageErrors }, 1);
  }
} else {
  // dotlottie-web ships as a plain ESM bundle ending `export{be as
  // DotLottie,...}`. An ESM `export` clause does NOT create a `DotLottie`
  // binding inside the module's OWN scope, only in its external interface --
  // so `addScriptTag({ path })`'s inline-script trick (which works for
  // lottie-web's UMD build because UMD assigns to `window` itself) needs one
  // extra step here: read the bundle, find the actual local name the export
  // statement aliases, and assign THAT to a window global once the script
  // runs. Measured directly against 0.80.0, not assumed: this regex is a
  // real dependency on the bundler's output shape, named here so a future
  // dotlottie-web upgrade that changes it fails loudly rather than silently.
  const dotlottieJs = readFileSync(resolve(dotlottiePath), "utf8");
  const exportMatch = dotlottieJs.match(/export\{(\w+) as DotLottie/);
  if (!exportMatch) {
    const error = `could not find DotLottie's internal export alias in '${dotlottiePath}' -- bundle shape may have changed since this was written against 0.80.0`;
    console.error(error);
    await browser.close();
    writeResultAndExit({ ok: false, stage: "load-dotlottie-web", error, consoleErrors, pageErrors }, 1);
  }
  await page.addScriptTag({ content: `${dotlottieJs}\nwindow.__DotLottie = ${exportMatch[1]};`, type: "module" });
  const dotlottieGlobalOk = await page.evaluate(() => typeof window.__DotLottie === "function");
  if (!dotlottieGlobalOk) {
    const error = `dotlottie-web did not attach window.__DotLottie after addScriptTag({ path: '${dotlottiePath}' })`;
    console.error(error);
    await browser.close();
    writeResultAndExit({ ok: false, stage: "load-dotlottie-web", error, consoleErrors, pageErrors }, 1);
  }
}

// A container sized in CSS pixels to EXACTLY the document's own w/h, so the
// canvas backing store is `doc.w x doc.h` physical pixels with no
// letterboxing and no devicePixelRatio scale — coordinates a caller passes
// to `--at` are then Lottie-space coordinates directly, with no conversion.
// Both renderer branches below end by setting `window.__lottieCheckAnim` to
// something exposing `goToAndStop(frame, isFrame)` and leaving a canvas
// reachable via `#__lottieCheck canvas` — the shim that lets every later
// section of this file stay renderer-agnostic. `dpr: 1` (lottie-web's
// `rendererSettings`) achieves the same "no devicePixelRatio scale" property
// dotlottie-web gets for free from a caller-provided canvas.
const loadResult = await page.evaluate(
  ({ doc, renderer }) =>
    new Promise((resolvePromise) => {
      // Collected for the whole run, not just the load phase: a render
      // error can also fire later, during frame sampling below (e.g. a
      // document deliberately malformed via --strip-easing), and that is
      // exactly the kind of thing this harness exists to surface rather
      // than crash on. Read back after the frame-sampling loop finishes.
      window.__lottieCheckErrors = [];
      const container = document.createElement("div");
      container.id = "__lottieCheck";
      container.style.position = "fixed";
      container.style.left = "0";
      container.style.top = "0";
      container.style.zIndex = "2147483647";
      container.style.width = `${doc.w}px`;
      container.style.height = `${doc.h}px`;
      document.body.appendChild(container);

      let settled = false;
      const settle = (r) => {
        if (settled) return;
        settled = true;
        resolvePromise(r);
      };

      if (renderer === "lottie-web") {
        let anim;
        try {
          anim = window.lottie.loadAnimation({
            container,
            renderer: "canvas",
            loop: false,
            autoplay: false,
            animationData: doc,
            rendererSettings: { dpr: 1, clearCanvas: true },
          });
        } catch (e) {
          settle({ ok: false, stage: "loadAnimation", error: String(e && e.message ? e.message : e) });
          return;
        }
        window.__lottieCheckAnim = anim;

        anim.addEventListener("error", (e) => {
          const msg = e && e.nativeError && e.nativeError.message ? e.nativeError.message : String(e);
          window.__lottieCheckErrors.push(msg);
          settle({ ok: false, stage: "error-event", error: msg });
        });

        if (anim.isLoaded) {
          settle({ ok: true });
        } else {
          anim.addEventListener("DOMLoaded", () => settle({ ok: true }));
        }
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = doc.w;
        canvas.height = doc.h;
        container.appendChild(canvas);

        let player;
        try {
          player = new window.__DotLottie({ canvas, data: JSON.stringify(doc), autoplay: false, loop: false });
        } catch (e) {
          settle({ ok: false, stage: "construct", error: String(e && e.message ? e.message : e) });
          return;
        }
        window.__lottieCheckAnim = { goToAndStop: (frame) => player.setFrame(frame) };

        player.addEventListener("loadError", (e) => {
          const msg = e && e.error && e.error.message ? e.error.message : String(e);
          settle({ ok: false, stage: "loadError", error: msg });
        });
        player.addEventListener("renderError", (e) => {
          const msg = e && e.error && e.error.message ? e.error.message : String(e);
          window.__lottieCheckErrors.push(msg);
          settle({ ok: false, stage: "renderError", error: msg });
        });
        player.addEventListener("load", () => settle({ ok: true }));
      }
    }),
  { doc, renderer },
);

if (!loadResult.ok) {
  console.error(`${renderer} failed to load the document (${loadResult.stage}): ${loadResult.error}`);
  await browser.close();
  writeResultAndExit({ ok: false, stage: loadResult.stage, error: loadResult.error, consoleErrors, pageErrors }, 1);
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

  // `--compare-png`: only whole-number frames have a PNG-export counterpart
  // (`__mareyExportPng` produces one raster per sampled tick, not a
  // continuous timeline), so a fractional frame requested for sub-frame
  // easing checks elsewhere is recorded as skipped rather than silently
  // compared against the wrong integer frame or dropped with no trace.
  let pngCompare = null;
  if (pngExport) {
    if (!Number.isInteger(frame)) {
      pngCompare = { skipped: `frame ${frame} is fractional; PNG export has no sub-frame counterpart` };
    } else if (frame < 0 || frame >= pngExport.frameCount) {
      pngCompare = { skipped: `frame ${frame} outside PNG export range [0, ${pngExport.frameCount})` };
    } else {
      const pngBase64 = pngExport.frames[frame];
      const pngFramePath = `${outDir}/frame_${pad(frame)}_pngexport.png`;
      writeFileSync(pngFramePath, Buffer.from(pngBase64, "base64"));
      pngCompare = await page.evaluate(
        async ({ pngBase64 }) => {
          const img = new Image();
          const loaded = new Promise((res, rej) => {
            img.onload = () => res();
            img.onerror = () => rej(new Error("PNG export frame failed to decode as an <img>"));
          });
          img.src = `data:image/png;base64,${pngBase64}`;
          await loaded;

          const off = document.createElement("canvas");
          off.width = img.naturalWidth;
          off.height = img.naturalHeight;
          const octx = off.getContext("2d");
          octx.drawImage(img, 0, 0);
          const pngData = octx.getImageData(0, 0, off.width, off.height).data;

          const lottieCanvas = document.querySelector("#__lottieCheck canvas");
          const lottieData = lottieCanvas
            .getContext("2d")
            .getImageData(0, 0, lottieCanvas.width, lottieCanvas.height).data;

          if (off.width !== lottieCanvas.width || off.height !== lottieCanvas.height) {
            return {
              error: `size mismatch: png export ${off.width}x${off.height} vs lottie canvas ${lottieCanvas.width}x${lottieCanvas.height}`,
            };
          }

          // Per pixel, per-channel (R,G,B,A) absolute delta, reduced to that
          // pixel's max channel delta. `maxDelta` is the single largest value
          // found anywhere in the frame; `share` is the fraction of pixels
          // whose max-channel delta is greater than zero, i.e. not
          // byte-identical between the two renderers. Neither is a chosen
          // tolerance — both are what this specific comparison measured.
          const diffCanvas = document.createElement("canvas");
          diffCanvas.width = off.width;
          diffCanvas.height = off.height;
          const dctx = diffCanvas.getContext("2d");
          const diffImageData = dctx.createImageData(off.width, off.height);
          const diffData = diffImageData.data;

          let maxDelta = 0;
          let maxDeltaAtIndex = -1;
          let mismatchCount = 0;
          const totalPixels = pngData.length / 4;
          for (let i = 0; i < pngData.length; i += 4) {
            let pixelMax = 0;
            for (let c = 0; c < 4; c++) {
              const d = Math.abs(pngData[i + c] - lottieData[i + c]);
              if (d > pixelMax) pixelMax = d;
            }
            if (pixelMax > 0) {
              mismatchCount++;
              diffData[i] = 255;
              diffData[i + 1] = 0;
              diffData[i + 2] = 0;
              diffData[i + 3] = 255;
            } else {
              diffData[i] = 0;
              diffData[i + 1] = 0;
              diffData[i + 2] = 0;
              diffData[i + 3] = 255;
            }
            if (pixelMax > maxDelta) {
              maxDelta = pixelMax;
              maxDeltaAtIndex = i / 4;
            }
          }
          dctx.putImageData(diffImageData, 0, 0);
          const diffPngBase64 = diffCanvas.toDataURL("image/png").split(",")[1];

          return {
            maxDelta,
            maxDeltaAt:
              maxDeltaAtIndex === -1
                ? null
                : { x: maxDeltaAtIndex % off.width, y: Math.floor(maxDeltaAtIndex / off.width) },
            mismatchCount,
            totalPixels,
            share: mismatchCount / totalPixels,
            width: off.width,
            height: off.height,
            diffPngBase64,
          };
        },
        { pngBase64 },
      );
      pngCompare.pngExportPng = pngFramePath;
      if (pngCompare.diffPngBase64) {
        const diffPath = `${outDir}/frame_${pad(frame)}_diff.png`;
        writeFileSync(diffPath, Buffer.from(pngCompare.diffPngBase64, "base64"));
        delete pngCompare.diffPngBase64;
        pngCompare.diffPng = diffPath;
      }
    }
  }

  frameSamples.push({ frame, png: pngPath, pixels, ...(pngExport ? { pngCompare } : {}) });
}

// Errors lottie-web raised AFTER load succeeded — a render/config error
// during frame sampling (e.g. under --strip-easing) does not abort the loop
// above (`settle` is a no-op post-load), but it is real evidence and belongs
// in the report rather than being silently dropped.
const lottieErrors = await page.evaluate(() => window.__lottieCheckErrors ?? []);

await browser.close();

writeResultAndExit({ ok: true, frameSamples, lottieErrors, consoleErrors, pageErrors }, 0);
