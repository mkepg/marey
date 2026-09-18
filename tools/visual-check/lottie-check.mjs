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
 * **`--compare-png` (Task 5, design §8.3's pixel half / exit criterion 2).**
 * Also calls `window.__mareyExportPng` (the same seam `export-check.mjs`
 * drives) with the same source/fps/duration, and for every REQUESTED FRAME
 * THAT IS A WHOLE NUMBER within the PNG export's frame range, compares that
 * PNG frame against the lottie-web canvas at the identical frame index,
 * pixel for pixel. The two exports are comparable index-for-index because
 * both are built from the same `sampleFrames(runtime, root, planned.plan)`
 * call inside their respective dev seams (`devLottieSeam.ts` /
 * `devExportSeam.ts`) — same plan, same fps, same duration — and
 * `lottieEncode.ts` bakes each keyframe's `t` as "the output-frame index
 * directly" (its own comment), so lottie-web's `goToAndStop(N, true)` reads
 * back exactly frame `N` of the same sampled sequence `encodePngSequence`
 * rasterised as PNG frame `N`. Fractional frames (used elsewhere in this
 * file for sub-frame easing checks) have no PNG counterpart and are skipped
 * for this comparison, recorded as `{ skipped: "..." }` rather than silently
 * dropped.
 *
 * The comparison itself runs entirely inside the page via `page.evaluate`:
 * the PNG frame (already base64-encoded bytes from `__mareyExportPng`, no
 * Node-side decoding needed) is drawn into an off-screen `<canvas>` through
 * a plain `Image` element, and its `getImageData` is diffed byte-for-byte
 * against the live lottie-web canvas's own `getImageData` — no screenshot
 * re-encoding on either side, same reasoning as the named-point sampling
 * above. For every pixel the per-channel (R,G,B,A) absolute difference is
 * taken and reduced to that pixel's max; the report records, per compared
 * frame, the single largest such value found anywhere in the frame
 * (`maxDelta`, plus the `(x,y)` it occurred at) and the share of pixels
 * whose max-channel delta is greater than zero (`share, mismatchCount /
 * totalPixels`) — i.e. what fraction of the frame is not byte-identical
 * between the two renderers. Both numbers are measured, not chosen: this
 * script does not accept or apply a tolerance, it only reports what was
 * found, per the brief's "measure first, then document."
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
 *   --strip-easing       delete `i`/`o` from every keyframe in every layer's
 *                        `ks`, everywhere in the document (used by §11.6's
 *                        no-handles probe; general enough for any future
 *                        "what does the player do without X" question).
 *                        Applied after `--set`/`--unset`.
 *   --compare-png        also export via `window.__mareyExportPng` at the
 *                        same fps/duration and pixel-diff each whole-number
 *                        requested frame against Marey's own PNG render of
 *                        the same frame. See the header comment above for
 *                        the full methodology.
 *   --out <dir>          where doc.json, frame_<label>.png and report.json go
 *   --url <origin>       dev server origin (default http://localhost:5199)
 *   --lottie-path <path> path to the lottie-web UMD build (default
 *                        node_modules/lottie-web/build/player/lottie.min.js,
 *                        resolved from the current working directory)
 *   --renderer <name>    "lottie-web" (default) or "dotlottie-web" (Task 5,
 *                        design §10's second-renderer evaluation). Both
 *                        branches converge on the same
 *                        `window.__lottieCheckAnim.goToAndStop(frame, isFrame)`
 *                        shim and `#__lottieCheck canvas` selector, so every
 *                        other flag (`--at`, `--compare-png`,
 *                        `--strip-easing`, ...) works unchanged either way.
 *   --dotlottie-path <p> path to dotlottie-web's ESM bundle (default
 *                        node_modules/@lottiefiles/dotlottie-web/dist/index.js)
 *   --dotlottie-wasm-path <p> path to dotlottie-web's WASM binary, served
 *                        locally via Playwright route interception instead of
 *                        the bundle's own jsdelivr/unpkg CDN default (default
 *                        node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm)
 *   --headed             show the browser window
 *
 * Writes `<out>/doc.json` (the document actually handed to the player, i.e.
 * post-patch), `<out>/frame_<label>.png` per requested frame (label is the
 * frame value with `.` replaced by `p`, e.g. `frame_0p5.png`), and
 * `<out>/report.json` — written on every exit path, including every failure
 * one below, not only on success — with the export metadata, every sampled
 * pixel, and page/console/lottie errors. Exit code is non-zero on a hard
 * failure (export threw; the player failed to construct or load — lottie-web's
 * `loadAnimation` throwing or its `AnimationItem` `'error'` event, or
 * dotlottie-web's constructor throwing or its `'loadError'`/`'renderError'`
 * events; or a page/console error was recorded) — never on what a sampled
 * pixel says, which is this script's whole reason to exist and is a
 * judgement call for whoever reads the report.
 *
 * **What this harness does NOT validate, stated plainly rather than left to
 * a dead guard (Global Constraint 10).** For `--renderer lottie-web`:
 * lottie-web's `data_failed` event fires only for `path`-based or segment
 * loads (`onSetupError`, `build/player/lottie.js:1517` and `:1624`); this
 * harness always passes inline `animationData`, so `data_failed` can never
 * fire here and is not listened for. The failure path that IS reachable is a
 * synchronous throw from `loadAnimation()` itself, or the `AnimationItem`
 * `'error'` event (`triggerConfigError`/`triggerRenderFrameError`) — both are
 * caught below. Neither is a general document validator: lottie-web is
 * lenient about many structurally-missing fields (a document missing `op`
 * entirely loads and renders without complaint — measured, not assumed) and a
 * render/config error that fires SYNCHRONOUSLY inside `loadAnimation()`
 * itself, before this script's listeners are attached, would not be captured
 * either. For `--renderer dotlottie-web`, only `'loadError'`/`'renderError'`
 * and a constructor throw are checked; how lenient dotlottie-web's WASM core
 * is about a structurally-incomplete document was not independently measured
 * the way lottie-web's was. A clean run is evidence the selected renderer did
 * not complain, not evidence the document is well-formed.
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
// Task 5, design §10's "second renderer, evaluated not promised": swaps
// which player renders the document. Both branches end by exposing the
// exact same two things the rest of this script already depends on —
// `window.__lottieCheckAnim.goToAndStop(f, true)` and a canvas reachable via
// `#__lottieCheck canvas` — so the frame-sampling loop, the `--at` pixel
// reads, the PNG screenshot, and `--compare-png` all work unmodified against
// either renderer. That shim is what makes a second renderer cheap here:
// there is no parallel harness, only a different few lines building the
// player itself.
const renderer = arg("renderer", "lottie-web");
if (renderer !== "lottie-web" && renderer !== "dotlottie-web") {
  console.error(`--renderer must be 'lottie-web' or 'dotlottie-web', got '${renderer}'`);
  process.exit(2);
}
const dotlottiePath = resolve(arg("dotlottie-path", "node_modules/@lottiefiles/dotlottie-web/dist/index.js"));
const dotlottieWasmPath = resolve(
  arg("dotlottie-wasm-path", "node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm"),
);

const source = readFileSync(resolve(scenePath), "utf8");

// Same reasoning as check.mjs / export-check.mjs: SwiftShader gives headless
// Chromium a working WebGL implementation, which the Marey app's own preview
// needs even though the Lottie playback this script cares about is a plain
// 2D canvas. Without it PixiJS cannot initialise at all and the export seam
// (which builds a real Application) throws before ever reaching lottie-web.
//
// `--disable-accelerated-2d-canvas` pins WHICH rasterizer draws lottie-web's
// 2D canvas, and it is the whole reason `--compare-png`'s tolerance is a
// property of the artifact rather than of the command that measured it.
// Chromium can rasterize a 2D canvas on the GPU or in software, and the two
// antialias the same geometry differently — measured on this scene as two
// stable, discrete answers and nothing in between:
//
//   GPU-accelerated : maxDelta 60 at (596,551), 300/480000 = 0.0625%
//   software        : maxDelta 81 at (516,569), 569/480000 = 0.1185%
//
// Without this flag Chromium starts accelerated and demotes to software part
// way through a multi-frame run, so `--frames 180` measured 60 while
// `--frames 0,48,75,180,239` measured 81 FOR THE SAME FRAME of the same
// document — the session-dependence Phase 5A documented but could not
// explain. Marey's own side is bit-identical across both (`doc.json` and the
// `__mareyExportPng` PNG both byte-equal); the variation was entirely
// Chromium's. Forcing software makes the number identical under every
// `--frames` list, and 81 is the conservative of the two, so the published
// tolerance is unchanged and now reproduces.
//
// Note this is NOT a readback count: `--frames 176,177,178,179,180` stays
// accelerated across five compared frames while `--frames 0,48,180` demotes
// by the third. The precise demotion heuristic is Chromium-internal and is
// deliberately not relied on here — the flag removes the question instead.
const LAUNCH_ARGS = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--disable-accelerated-2d-canvas",
];

const sceneUrl = `${url}/#code=${LZString.compressToEncodedURIComponent(source)}`;

const pad = (label) => String(label).replace(/\./g, "p").replace(/-/g, "neg");

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: !has("headed"), args: LAUNCH_ARGS });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => pageErrors.push(String(e)));

// dotlottie-web's default build fetches its WASM binary from jsdelivr/unpkg
// at `https://.../@lottiefiles/dotlottie-web@<version>/dist/dotlottie-player.wasm`
// (measured directly by reading its bundle: `dist/index.js` contains that
// literal URL template). Playwright's headless Chromium DOES have outbound
// network access here (confirmed directly: a `fetch(...)` to that same
// jsdelivr URL returned `200`) — unlike this repository's Bash tool, whose
// `curl` returns `000` — so the CDN fetch would actually succeed. Routing it
// to the LOCAL copy already sitting in `node_modules` anyway, rather than
// depending on that network access, matches how lottie-web is already loaded
// (`addScriptTag({ path })`, no network) and keeps this harness reproducible
// somewhere that outbound access is unavailable. Registered unconditionally
// and harmlessly no-ops under `--renderer lottie-web`, since nothing ever
// requests that URL in that mode.
await page.route(/dotlottie-player\.wasm/, (route) => route.fulfill({ path: dotlottieWasmPath }));

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

// `--compare-png`: fetch Marey's own PNG export of the identical scene at the
// identical fps/duration, on the SAME page (so `window.__mareyExportPng` is
// already installed — both dev seams load together, see main.tsx). This is a
// hard failure if requested and it does not succeed: a caller who asked for a
// pixel comparison and silently got none is worse than one who is told to
// look elsewhere.
let pngExport = null;
if (has("compare-png")) {
  const pngExportResult = await page.evaluate(
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
  if (!pngExportResult.ok) {
    console.error(`--compare-png: __mareyExportPng failed: ${pngExportResult.error}`);
    writeFileSync(
      `${outDir}/report.json`,
      JSON.stringify({ scene: scenePath, exportResult: { ok: true }, pngExportResult }, null, 2),
    );
    await browser.close();
    process.exit(1);
  }
  pngExport = pngExportResult;
}

// Patch, then write the document actually handed to lottie-web — not the
// seam's raw output — so `doc.json` on disk always matches what was rendered.
const doc = exportResult.doc;
for (const field of unsetFields) delete doc[field];
for (const { field, value } of setFields) doc[field] = value;
if (has("strip-easing")) {
  const stripKeyframeEasing = (node) => {
    if (Array.isArray(node)) {
      node.forEach(stripKeyframeEasing);
      return;
    }
    if (node && typeof node === "object") {
      if (Array.isArray(node.k)) {
        for (const kf of node.k) {
          delete kf.i;
          delete kf.o;
        }
      }
      for (const v of Object.values(node)) stripKeyframeEasing(v);
    }
  };
  stripKeyframeEasing(doc.layers);
}
writeFileSync(`${outDir}/doc.json`, JSON.stringify(doc, null, 2));

if (renderer === "lottie-web") {
  // `addScriptTag({ path })` reads the file locally and injects its contents
  // as an inline <script>, rather than requesting it through the page's own
  // origin — confirmed working here against the real dev-server page (not
  // just `about:blank`), so a bare `import "lottie-web"` for Vite to resolve
  // is unnecessary. `lottie.min.js` is a UMD build; it attaches `window.lottie`
  // because `document`/`navigator` both exist on this page.
  await page.addScriptTag({ path: lottiePath });
  const lottieGlobalOk = await page.evaluate(() => typeof window.lottie === "object" && window.lottie !== null);
  if (!lottieGlobalOk) {
    const error = `lottie-web did not attach window.lottie after addScriptTag({ path: '${lottiePath}' })`;
    console.error(error);
    writeFileSync(`${outDir}/report.json`, JSON.stringify({ scene: scenePath, lottiePath, error }, null, 2));
    await browser.close();
    process.exit(1);
  }
} else {
  // dotlottie-web ships as a plain ESM bundle ending `export{be as
  // DotLottie,...}`. An ESM `export` clause does NOT create a `DotLottie`
  // binding inside the module's OWN scope, only in its external interface —
  // so `addScriptTag({ path })`'s inline-script trick (which works for
  // lottie-web's UMD build because UMD assigns to `window` itself) needs one
  // extra step here: read the bundle, find the actual local name the export
  // statement aliases, and assign THAT to a window global once the script
  // runs. Measured directly against 0.80.0, not assumed: this regex is a
  // real dependency on the bundler's output shape, named here so a future
  // dotlottie-web upgrade that changes it fails loudly rather than silently.
  const dotlottieJs = readFileSync(dotlottiePath, "utf8");
  const exportMatch = dotlottieJs.match(/export\{(\w+) as DotLottie/);
  if (!exportMatch) {
    const error = `could not find DotLottie's internal export alias in '${dotlottiePath}' -- bundle shape may have changed since this was written against 0.80.0`;
    console.error(error);
    writeFileSync(`${outDir}/report.json`, JSON.stringify({ scene: scenePath, dotlottiePath, error }, null, 2));
    await browser.close();
    process.exit(1);
  }
  await page.addScriptTag({ content: `${dotlottieJs}\nwindow.__DotLottie = ${exportMatch[1]};`, type: "module" });
  const dotlottieGlobalOk = await page.evaluate(() => typeof window.__DotLottie === "function");
  if (!dotlottieGlobalOk) {
    const error = `dotlottie-web did not attach window.__DotLottie after addScriptTag({ path: '${dotlottiePath}' })`;
    console.error(error);
    writeFileSync(`${outDir}/report.json`, JSON.stringify({ scene: scenePath, dotlottiePath, error }, null, 2));
    await browser.close();
    process.exit(1);
  }
}

// A container sized in CSS pixels to EXACTLY the document's own w/h, so the
// canvas backing store is `doc.w x doc.h` physical pixels with no
// letterboxing and no devicePixelRatio scale — coordinates a caller passes
// to `--at` are then Lottie-space coordinates directly, with no conversion.
// Both renderer branches below end by setting `window.__lottieCheckAnim` to
// something exposing `goToAndStop(frame, isFrame)` and leaving a canvas
// reachable via `#__lottieCheck canvas` — the shim that lets every later
// section of this script (frame loop, `--at`, `--compare-png`) stay
// renderer-agnostic. `dpr: 1` (lottie-web's `rendererSettings`) achieves the
// same "no devicePixelRatio scale" property lottie-web's branch needs;
// dotlottie-web has no equivalent setting because a caller-provided canvas's
// pixel dimensions ARE its backing store, with no separate DPR concept.
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

      // Settles the promise once, on whichever of load-success/load-failure
      // happens first. Only meaningful during the load phase — later calls
      // (an error after the promise already resolved `ok: true`) are no-ops
      // here and rely on `window.__lottieCheckErrors` instead.
      let settled = false;
      const settle = (r) => {
        if (settled) return;
        settled = true;
        resolvePromise(r);
      };

      if (renderer === "lottie-web") {
        // The real failure path a document without a `path` can hit:
        // `loadAnimation` itself throws synchronously (e.g. a document with
        // no `layers` at all) rather than returning a live AnimationItem.
        // Previously uncaught, this crashed the whole node process with a raw
        // stack and no report.json (review finding 12). `data_failed` is NOT
        // listened for here: it fires only from `onSetupError` (path loads,
        // `lottie.js:1517`) and segment loads (`:1624`), never for inline
        // `animationData`, so it is unreachable in this harness's own
        // configuration — a guard that cannot fire, per Global Constraint 10.
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

        // The path that DOES fire for a malformed inline document:
        // `triggerConfigError`/`triggerRenderFrameError` both call
        // `triggerEvent('error', ...)` on the AnimationItem. Registered
        // before yielding control back to the event loop, so it is in place
        // whether `checkLoaded` resolves synchronously or asynchronously.
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
        // dotlottie-web takes a caller-owned canvas directly rather than a
        // container it builds its own canvas inside, so this branch creates
        // one, sized identically to the lottie-web branch's container, and
        // appends it as `#__lottieCheck`'s only child -- satisfying the same
        // `#__lottieCheck canvas` selector every later section already uses.
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
        // Same shim shape as lottie-web's `AnimationItem.goToAndStop(frame,
        // isFrame)`: the second argument is accepted and ignored, since
        // dotlottie-web's `setFrame` only ever takes a frame number, never a
        // time value.
        window.__lottieCheckAnim = { goToAndStop: (frame) => player.setFrame(frame) };

        player.addEventListener("loadError", (e) => {
          const msg = e && e.error && e.error.message ? e.error.message : String(e);
          settle({ ok: false, stage: "loadError", error: msg });
        });
        // Post-load render errors, the dotlottie-web analogue of
        // lottie-web's post-load 'error' events above: collected into the
        // same `window.__lottieCheckErrors` array so this harness's later
        // reporting does not need to know which renderer produced them.
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
  writeFileSync(
    `${outDir}/report.json`,
    JSON.stringify({ scene: scenePath, renderer, exportMeta: { fps: exportResult.fps, frameCount: exportResult.frameCount }, loadResult }, null, 2),
  );
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

  // `--compare-png`: only whole-number frames have a PNG-export counterpart
  // (`__mareyExportPng` produces one raster per sampled tick, not a
  // continuous timeline), so a fractional frame requested for sub-frame
  // easing checks elsewhere in this file is recorded as skipped rather than
  // silently compared against the wrong integer frame or dropped with no
  // trace.
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
          // A diff-visualization canvas alongside the numbers: black where
          // the two renders agree, opaque red where any channel differs at
          // all — so a human can SEE whether mismatches sit at shape edges
          // (antialiasing, expected) or inside flat fills (a real defect,
          // per the brief). This is not optional evidence; report.json's
          // numbers alone cannot distinguish those two cases.
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
// during frame sampling (e.g. under --strip-easing) does not abort the run
// above (`settle` is a no-op post-load), but it is real evidence and belongs
// in the report rather than being silently dropped.
const lottieErrors = await page.evaluate(() => window.__lottieCheckErrors ?? []);

await browser.close();

const report = {
  scene: scenePath,
  requestedFps: fps,
  requestedDurationSeconds: durationSeconds ?? null,
  url,
  lottiePath,
  patched: { set: setFields, unset: unsetFields, stripEasing: has("strip-easing") },
  exportMeta: { fps: exportResult.fps, frameCount: exportResult.frameCount, hash: exportResult.hash },
  pngExportMeta: pngExport
    ? { fps: pngExport.fps, frameCount: pngExport.frameCount, hash: pngExport.hash, width: pngExport.width, height: pngExport.height }
    : null,
  frameSamples,
  consoleErrors,
  pageErrors,
  lottieErrors,
};
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));

console.log(`scene                    ${scenePath}`);
console.log(`fps / frameCount         ${exportResult.fps} / ${exportResult.frameCount}`);
console.log(`snapshot hash            ${exportResult.hash}`);
if (setFields.length || unsetFields.length || has("strip-easing")) {
  console.log(
    `patched                  set ${JSON.stringify(setFields)}, unset ${JSON.stringify(unsetFields)}, stripEasing ${has("strip-easing")}`,
  );
}
for (const fs_ of frameSamples) {
  console.log(`frame ${fs_.frame}:`);
  for (const p of fs_.pixels) {
    console.log(`  (${p.x},${p.y}) -> rgba(${p.rgba.join(",")})`);
  }
  console.log(`  png: ${fs_.png}`);
  if (fs_.pngCompare) {
    if (fs_.pngCompare.skipped) {
      console.log(`  --compare-png: skipped (${fs_.pngCompare.skipped})`);
    } else if (fs_.pngCompare.error) {
      console.log(`  --compare-png: ERROR ${fs_.pngCompare.error}`);
    } else {
      const c = fs_.pngCompare;
      console.log(
        `  --compare-png: maxDelta=${c.maxDelta} at ${JSON.stringify(c.maxDeltaAt)}, ` +
          `mismatching pixels=${c.mismatchCount}/${c.totalPixels} (share=${(c.share * 100).toFixed(4)}%)`,
      );
      console.log(`    pngExportPng: ${c.pngExportPng}`);
    }
  }
}
console.log(`page errors              ${pageErrors.length}`);
for (const e of pageErrors) console.log(`  ! ${e}`);
console.log(`console errors           ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`  ! ${e}`);
console.log(`lottie 'error' events    ${lottieErrors.length}`);
for (const e of lottieErrors) console.log(`  ! ${e}`);
console.log(`\nwrote ${outDir}/doc.json, ${outDir}/report.json, and ${frameSamples.length} frame PNG(s)`);
console.log(
  "\nThis script's numbers are the evidence, not a substitute for looking: read the frame_*.png\n" +
    "files with an image viewer (or the Read tool) before trusting a sampled pixel in isolation.\n" +
    "Zero errors above is evidence lottie-web did not complain, not evidence the document is\n" +
    "well-formed -- lottie-web is lenient about fields this harness does not independently check.",
);

process.exit(pageErrors.length > 0 || lottieErrors.length > 0 ? 1 : 0);
