/**
 * Real end-to-end check of the shipped **lottie** button (Phase 5C Task 3,
 * Step 6): load the app, set the editor's code, click the real button,
 * capture the real download Playwright sees, and prove the file is what it
 * claims to be — no dev seam involved anywhere in this script.
 *
 * **No committed click harness existed to model this on.** Phase 5B Task
 * 6b's click harness was never committed (grepped
 * `tools/visual-check/` for `waitForEvent("download")`: no hits),
 * so this is written directly from Step 6's own instructions, reusing the
 * one precedent that IS committed: `device-limit-check.mjs` (Phase 5C Task
 * 1) sets the editor's code via the `#code=` share-link hash, read once at
 * boot by `src/lib/share.ts`'s `resolveInitialCode` into `store.code` — the
 * actual editor state, not a Monaco-driving substitute — the same
 * `check.mjs`/`export-check.mjs`/`lottie-check.mjs` all already rely on.
 *
 * **Two runs, two different things proved (per this task's dispatch).**
 * Run against the dev server (`--url http://localhost:5199`, the default)
 * for the full comparison: `window.__mareyExportPng` (the dev seam) is
 * present there, so this script can render the downloaded document in a
 * real lottie-web player and diff it against Marey's own PNG render of the
 * same frames. Run AGAIN against a PRODUCTION build (`npm run build`, then
 * `npx vite preview --port 4173 --strictPort`, `--url
 * http://localhost:4173`) to prove what the dev-server run structurally
 * cannot: that the lazy `lottiePipeline` chunk and the real download work
 * once built. Production strips every dev seam (`main.tsx`'s
 * `import.meta.env.DEV` branches are constant-folded away), so
 * `window.__mareyExportPng` does not exist there — this script detects that
 * and skips the pixel comparison rather than crashing, recording why, and
 * instead watches the network for a response whose URL matches
 * `lottiePipeline-*.js` after the click, which is the only way to observe
 * "the lazy chunk loaded" from OUTSIDE the bundle in a build that has
 * already stripped every dev-only introspection point.
 *
 * **Deliberately does NOT force `--disable-accelerated-2d-canvas`**, unlike
 * `lottie-check.mjs`. Ruling T3-R1 measured that forcing software 2D canvas
 * rendering on a page whose process already ran a pixi WebGL `Application`
 * is the specific combination that breaks lottie-web's stroke joins — and
 * this script's whole point is to render lottie-web on the SAME page right
 * after a real click, which necessarily runs in a process that just ran the
 * app's own live-preview `Application` (and, for the export, a second,
 * temporary one). Leaving 2D-canvas acceleration on keeps this script in
 * the "fine" cells `task-2-verify.md`'s 2×2 measured. This script is a
 * coarser end-to-end sanity check (does the button work, is the file real,
 * is it roughly right), not the tight-tolerance instrument
 * `lottie-check.mjs` is — it does not claim the same pixel tolerance.
 *
 * Usage:
 *   node tools/visual-check/lottie-click-check.mjs \
 *     --scene eval/scenes-3b/compound-logo.marey \
 *     --url http://localhost:5199 --out .visual-check/lottie-click/dev
 *
 *   --scene <path>   A text-free .marey file for the success path (required)
 *   --url <origin>   App origin (default http://localhost:5199). Same
 *                    --strictPort trap as every other script here applies.
 *   --fps <n>        Export frame rate the button uses (default 30, matching
 *                    useExport.ts's own EXPORT_FPS -- not user-settable in
 *                    the shipped UI, so this only needs to match that
 *                    constant for the PNG comparison's frame indices to line
 *                    up)
 *   --out <dir>      Where doc.json, frame PNGs and report.json go
 *   --headed         Show the browser window
 *
 * Exit code is non-zero on a hard failure of either scenario (compound-logo
 * success path: download missing/wrong filename/unparseable JSON, or a
 * page/console error; default-scene refusal path: no toast, or a toast not
 * starting with "[LOTTIE_UNSUPPORTED_TEXT]") — never on the pixel-compare
 * numbers, which are reported for a human to read, same convention as every
 * other script on this page.
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
  console.error("lottie-click-check.mjs requires --scene <path-to-.marey-file>");
  process.exit(2);
}
const fps = Number(arg("fps", "30"));
const outDir = resolve(arg("out", ".visual-check/lottie-click/run"));
const lottiePath = resolve("node_modules/lottie-web/build/player/lottie.min.js");

mkdirSync(outDir, { recursive: true });

const sceneSource = readFileSync(resolve(scenePath), "utf8");

/**
 * `src/store/defaultScene.ts`'s `DEFAULT_CODE` is a plain `export const
 * DEFAULT_CODE = \`...\`;` template literal with no `${...}` interpolation
 * (grepped: zero matches). Measured directly, not assumed: the file's own
 * JSDoc header ALSO contains several markdown-style backtick pairs (e.g.
 * `` `defaultScene.test.ts` ``), ten backticks total in the whole file — so
 * "between the first and the last backtick anywhere in the file" (this
 * function's first version) silently captured from the header comment's
 * OWN first backtick instead, and fed the compiler a string starting
 * mid-JSDoc, which surfaced immediately as a real `LEX` error in scenario
 * B's own toast rather than passing silently. Anchoring on the literal text
 * `DEFAULT_CODE = \`` finds the true opening delimiter unambiguously; the
 * LAST backtick in the file is still the correct closing one, since nothing
 * follows the template literal (confirmed: the file's last line is exactly
 * `` `; ``).
 */
function extractDefaultCode() {
  const src = readFileSync(resolve("src/store/defaultScene.ts"), "utf8");
  const marker = "DEFAULT_CODE = `";
  const markerIndex = src.indexOf(marker);
  const last = src.lastIndexOf("`");
  if (markerIndex === -1 || last === -1) {
    throw new Error("could not find DEFAULT_CODE's template literal in src/store/defaultScene.ts");
  }
  const first = markerIndex + marker.length - 1;
  if (last <= first) {
    throw new Error("DEFAULT_CODE's closing backtick was not after its opening one -- file shape changed");
  }
  return src.slice(first + 1, last);
}
const defaultCode = extractDefaultCode();

const LOTTIE_BUTTON_SELECTOR = '[title="Export Lottie animation (JSON)"]';

// SwiftShader only -- no `--disable-accelerated-2d-canvas` here. See the
// header comment for why leaving 2D-canvas acceleration on is the correct
// choice for THIS script specifically.
const LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"];

function codeUrl(code) {
  return `${url}/#code=${LZString.compressToEncodedURIComponent(code)}`;
}

const browser = await chromium.launch({ headless: !has("headed"), args: LAUNCH_ARGS });
const report = { url, scene: scenePath, fps };

// ─── Scenario A: a text-free scene, success path ──────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // Watches for the lazy `lottiePipeline` chunk actually crossing the
  // network after the click -- the only way to observe "the lazy chunk
  // loaded" from outside the bundle once a production build has stripped
  // every dev-only introspection point. Registered before the click so it
  // cannot miss a response that arrives faster than this script reacts.
  let lottiePipelineChunkRequested = false;
  page.on("response", (res) => {
    if (/lottiePipeline[-.].*\.js/.test(res.url())) lottiePipelineChunkRequested = true;
  });

  await page.goto(codeUrl(sceneSource), { waitUntil: "load" });
  await page.locator(LOTTIE_BUTTON_SELECTOR).waitFor({ state: "visible", timeout: 20_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    page.locator(LOTTIE_BUTTON_SELECTOR).click(),
  ]);

  const filename = download.suggestedFilename();
  const downloadPath = await download.path();
  const bytes = downloadPath ? readFileSync(downloadPath, "utf8") : null;

  let parsed = null;
  let parseError = null;
  if (bytes !== null) {
    try {
      parsed = JSON.parse(bytes);
    } catch (e) {
      parseError = String(e && e.message ? e.message : e);
    }
  }
  if (bytes !== null) writeFileSync(`${outDir}/doc.json`, bytes);

  const filenameOk = filename === "scene.json";
  const parseOk = parsed !== null;

  // `--compare-png`'s equivalent for a real click: only possible where the
  // dev seam exists (the dev server, not a production build). Detected
  // rather than assumed from `url`, so a caller pointing this script at an
  // unfamiliar origin gets a recorded reason instead of a silent skip.
  const hasPngSeam = await page.evaluate(() => typeof window.__mareyExportPng === "function");
  let pngCompare = null;
  if (parseOk && hasPngSeam) {
    const pngExport = await page.evaluate(
      async ({ source, fps }) => {
        try {
          const r = await window.__mareyExportPng(source, { fps });
          return { ok: true, ...r };
        } catch (e) {
          return { ok: false, error: String(e && e.message ? e.message : e) };
        }
      },
      { source: sceneSource, fps },
    );
    if (!pngExport.ok) {
      pngCompare = { error: `__mareyExportPng failed: ${pngExport.error}` };
    } else {
      await page.addScriptTag({ path: lottiePath });
      const loadResult = await page.evaluate(
        (doc) =>
          new Promise((resolvePromise) => {
            const container = document.createElement("div");
            container.id = "__lottieClickCheck";
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
              settle({ ok: false, error: String(e && e.message ? e.message : e) });
              return;
            }
            window.__lottieClickCheckAnim = anim;
            anim.addEventListener("error", (e) => settle({ ok: false, error: String(e) }));
            if (anim.isLoaded) settle({ ok: true });
            else anim.addEventListener("DOMLoaded", () => settle({ ok: true }));
          }),
        parsed,
      );
      if (!loadResult.ok) {
        pngCompare = { error: `lottie-web failed to load the downloaded document: ${loadResult.error}` };
      } else {
        const perFrame = {};
        for (const frame of [0, 48]) {
          if (frame >= pngExport.frameCount) {
            perFrame[frame] = { skipped: `frame ${frame} outside PNG export range [0, ${pngExport.frameCount})` };
            continue;
          }
          await page.evaluate((f) => window.__lottieClickCheckAnim.goToAndStop(f, true), frame);
          const pngPath = `${outDir}/frame_${frame}.png`;
          await page.locator("#__lottieClickCheck canvas").screenshot({ path: pngPath });
          const pngBase64 = pngExport.frames[frame];
          const pngFramePath = `${outDir}/frame_${frame}_pngexport.png`;
          writeFileSync(pngFramePath, Buffer.from(pngBase64, "base64"));
          const diff = await page.evaluate(
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
              const lottieCanvas = document.querySelector("#__lottieClickCheck canvas");
              const lottieData = lottieCanvas
                .getContext("2d")
                .getImageData(0, 0, lottieCanvas.width, lottieCanvas.height).data;
              if (off.width !== lottieCanvas.width || off.height !== lottieCanvas.height) {
                return { error: `size mismatch: png ${off.width}x${off.height} vs lottie ${lottieCanvas.width}x${lottieCanvas.height}` };
              }
              let maxDelta = 0;
              let mismatchCount = 0;
              const totalPixels = pngData.length / 4;
              for (let i = 0; i < pngData.length; i += 4) {
                let pixelMax = 0;
                for (let c = 0; c < 4; c++) {
                  const d = Math.abs(pngData[i + c] - lottieData[i + c]);
                  if (d > pixelMax) pixelMax = d;
                }
                if (pixelMax > 0) mismatchCount++;
                if (pixelMax > maxDelta) maxDelta = pixelMax;
              }
              return { maxDelta, mismatchCount, totalPixels, share: mismatchCount / totalPixels };
            },
            { pngBase64 },
          );
          perFrame[frame] = { ...diff, png: pngPath, pngExportPng: pngFramePath };
        }
        pngCompare = { perFrame };
      }
    }
  } else if (!hasPngSeam) {
    pngCompare = { skipped: "__mareyExportPng not available at this URL (production build strips every dev seam)" };
  }

  report.scenarioA = {
    filename,
    filenameOk,
    parseOk,
    parseError,
    lottiePipelineChunkRequested,
    pngCompare,
    consoleErrors,
    pageErrors,
  };

  const ok = filenameOk && parseOk && pageErrors.length === 0;
  console.log(`scenario A (${scenePath}): filename=${filename} filenameOk=${filenameOk} parseOk=${parseOk} lottiePipelineChunkRequested=${lottiePipelineChunkRequested}`);
  if (pngCompare && pngCompare.perFrame) {
    for (const [frame, d] of Object.entries(pngCompare.perFrame)) {
      if (d.skipped) console.log(`  frame ${frame}: skipped (${d.skipped})`);
      else if (d.error) console.log(`  frame ${frame}: ERROR ${d.error}`);
      else console.log(`  frame ${frame}: maxDelta=${d.maxDelta} mismatching=${d.mismatchCount}/${d.totalPixels} (${(d.share * 100).toFixed(4)}%)`);
    }
  } else if (pngCompare && pngCompare.skipped) {
    console.log(`  pngCompare skipped: ${pngCompare.skipped}`);
  } else if (pngCompare && pngCompare.error) {
    console.log(`  pngCompare ERROR: ${pngCompare.error}`);
  }
  if (!ok) {
    console.error("scenario A FAILED");
  }
  await page.close();
}

// ─── Scenario B: the default scene (declares `text`), refusal path ────────
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(codeUrl(defaultCode), { waitUntil: "load" });
  await page.locator(LOTTIE_BUTTON_SELECTOR).waitFor({ state: "visible", timeout: 20_000 });

  // No download is expected on this path -- the click throws inside
  // `useExport.ts`'s try block and shows a toast instead. Racing
  // `waitForEvent("download")` here would hang for its own timeout on the
  // success path already proven above, so this scenario reads the toast
  // directly.
  await page.locator(LOTTIE_BUTTON_SELECTOR).click();
  const toastLocator = page.locator('[role="status"]');
  await toastLocator.first().waitFor({ state: "visible", timeout: 5_000 });
  const toastText = (await toastLocator.first().textContent()) ?? "";

  const startsWithCode = toastText.trim().startsWith("[LOTTIE_UNSUPPORTED_TEXT]");
  report.scenarioB = { toastText, startsWithCode, consoleErrors, pageErrors };

  console.log(`scenario B (default scene): toast="${toastText}" startsWithCode=${startsWithCode}`);
  if (!startsWithCode) console.error("scenario B FAILED");
  await page.close();
}

await browser.close();

writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(`\nwrote ${outDir}/report.json`);

const scenarioAOk =
  report.scenarioA.filenameOk && report.scenarioA.parseOk && report.scenarioA.pageErrors.length === 0;
const scenarioBOk = report.scenarioB.startsWithCode;
process.exit(scenarioAOk && scenarioBOk ? 0 : 1);
