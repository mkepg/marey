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
 * player using the `canvas` renderer. The canvas renderer is a plain 2D
 * context, so unlike PixiJS's WebGL canvas there is no
 * `preserveDrawingBuffer` trap: `ctx.getImageData` reads real pixels back
 * exactly, with no screenshot re-encoding in between. Both a full PNG
 * capture (for a human to look at with the Read tool) and precise in-page
 * `getImageData` samples at named coordinates are recorded — a screenshot
 * alone is an "impression"; the numeric samples are the actual evidence.
 *
 * **Two processes, not one page or two (Phase 5C Task 3, ruling T3-R1, as
 * MEASURED — corrects the ruling's own "a fresh page or context" text).**
 * Export happens in THIS process, on a page navigated to the real Marey app
 * (`window.__mareyExportLottie`/`window.__mareyExportPng`). The
 * lottie-web/dotlottie-web player renders in a SEPARATE OS process, spawned
 * as a child (`lottie-render-worker.mjs`), on a page that never navigates to
 * the Marey app at all (`about:blank`) and therefore never constructs any
 * pixi WebGL `Application`.
 *
 * This is not a style choice — it is the fix for a real, independently
 * confirmed artifact, and the process boundary is load-bearing, not
 * incidental. `task-2-verify.md`'s 2×2 found that lottie-web's own stroke
 * join/cap geometry renders WRONG only when a page that ran the export
 * seam's pixi `Application` and a page rendering under
 * `--disable-accelerated-2d-canvas` are both present; the brief's own
 * proposed fix ("export on one page, render in a fresh page or context")
 * was written from that finding but not itself measured against this
 * script. It was measured here, and disproven: a SECOND `browser.newPage()`
 * (a fresh page, a fresh `BrowserContext` — Playwright gives every
 * `browser.newPage()` call its own context implicitly) still reproduced the
 * broken join, and so did a SECOND, fully separate `chromium.launch()` (a
 * fresh OS-level Chromium process), each time the export and the render
 * happened inside THE SAME Node.js process. Splitting the identical two
 * steps across two separate `node` invocations — export in one process,
 * exit, a second process reads the exported document back from disk and
 * renders it — reproduced the correct geometry every time, including with a
 * 3-second delay inserted between closing the first browser and launching
 * the second (ruling out a teardown race). So the actual boundary the
 * defect needs crossed is the Node.js/Playwright-driver process, not the
 * page, the `BrowserContext`, or even the Chromium OS process. `--compare-
 * png`'s PNG export (`window.__mareyExportPng`) stays in THIS process (on
 * the same page the Lottie export ran on), per the ruling's remaining
 * intent: that call reads back bytes this process's own page already
 * produced, not a second live render by the child, so it carries none of
 * the risk — only lottie-web/dotlottie-web's OWN rendering, which happens
 * exclusively inside the worker process, was ever implicated. See
 * `README.md`'s "Exporting Lottie" section for the same explanation kept in
 * sync with this one, and `lottie-render-worker.mjs`'s own header comment
 * for the worker's side of this split.
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
 * The comparison itself runs entirely inside the render worker process via
 * a `page.evaluate` there (the PNG bytes travel to it as plain JSON, not a
 * second live render in this process): the PNG frame (already
 * base64-encoded bytes from `__mareyExportPng`, no
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
 *   --ink-region <x0,y0,x1,y1>  with --compare-png, restrict the ink
 *                        bounding box (see below) to these inclusive pixel
 *                        bounds, for a scene whose text shares the frame
 *                        with other objects. Default: the whole frame.
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
 * With `--compare-png`, every compared frame also reports `inkBBox`, the
 * ink bounding boxes of Marey's PNG and of the player's canvas measured
 * against the scene's opaque background colour, each with its largest
 * per-edge disagreement (`maxEdgeDelta`, px; null unless both boxes exist):
 * `halfCoverage` (pixels at least half the text's own contrast in that
 * frame; the binding position check in `text-check.mjs`, Phase 5C Task 8
 * ruling T8-R3) and `anyInk` (any difference at all; recorded only).
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
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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
const inkRegionArg = arg("ink-region", null);
const inkRegion = inkRegionArg
  ? (() => {
      const [x0, y0, x1, y1] = inkRegionArg.split(",").map(Number);
      return { x0, y0, x1, y1 };
    })()
  : null;
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

// `pageExport`: the ONLY page in THIS process, which navigates to the real
// Marey app and constructs the export seam's pixi WebGL `Application`. See
// the header comment ("Two processes, not one page or two") for why
// lottie-web/dotlottie-web must render in a wholly separate `node`
// invocation, not merely a separate page or browser here.
const pageExport = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
pageExport.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
pageExport.on("pageerror", (e) => pageErrors.push(String(e)));

await pageExport.goto(sceneUrl, { waitUntil: "load" });

await pageExport.waitForFunction(() => typeof window.__mareyExportLottie === "function", null, {
  timeout: 20_000,
  polling: 200,
});

const exportResult = await pageExport.evaluate(
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
// identical fps/duration, on the SAME page the Lottie export ran on
// (`window.__mareyExportPng` is already installed there -- both dev seams
// load together, see main.tsx). Staying on `pageExport`, in this process, is
// deliberate and safe (ruling T3-R1): this call reads back bytes `pageExport`
// itself produced, not a second live render by the separate render-worker
// process -- only lottie-web/dotlottie-web's OWN rendering was ever
// implicated in the join/cap artifact, and that happens exclusively inside
// `lottie-render-worker.mjs`'s own process, below. This is a hard failure if
// requested and it does not succeed: a caller who asked for a pixel
// comparison and silently got none is worse than one who is told to look
// elsewhere.
let pngExport = null;
if (has("compare-png")) {
  const pngExportResult = await pageExport.evaluate(
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


// `pageExport` has done its whole job (the export, and `--compare-png`'s PNG
// export). It stays open no longer than necessary: this process's OWN pixi
// `Application` must not be given any chance to matter to the render
// worker, and closing it here (before spawning that worker) is the
// clearest statement of that, even though the actual isolation comes from
// the process boundary below, not from this close.
await pageExport.close();
await browser.close();

// The render half of this script's job — load the document into a real
// lottie-web/dotlottie-web player, sample frames, run `--compare-png`'s
// pixel diff — runs in a SEPARATE Node.js process (`lottie-render-worker.mjs`,
// this file's sibling), spawned synchronously below. See the header
// comment ("Two processes, not one page or two") for the measurement this
// is the fix for: a second page, and even a second `chromium.launch()`,
// were both measured to still carry the join/cap defect as long as the
// export and the render happened in this SAME Node.js process; only a
// separate `node` invocation reproduced the correct geometry.
const workerPath = resolve(dirname(fileURLToPath(import.meta.url)), "lottie-render-worker.mjs");
const renderInputPath = `${outDir}/_render-input.json`;
const renderOutputPath = `${outDir}/_render-output.json`;
writeFileSync(
  renderInputPath,
  JSON.stringify({
    doc,
    renderer,
    requestedFrames,
    atPoints,
    pngExport,
    lottiePath,
    dotlottiePath,
    dotlottieWasmPath,
    headed: has("headed"),
    outDir,
    inkRegion,
  }),
);

const worker = spawnSync(process.execPath, [workerPath, "--input", renderInputPath, "--output", renderOutputPath], {
  encoding: "utf8",
  cwd: process.cwd(),
});
if (worker.error) {
  console.error(`failed to spawn lottie-render-worker.mjs: ${worker.error.message}`);
  writeFileSync(`${outDir}/report.json`, JSON.stringify({ scene: scenePath, exportResult: { ok: true }, workerSpawnError: worker.error.message }, null, 2));
  process.exit(1);
}
// The worker writes its own result file on every exit path (mirroring this
// script's "report.json written on every exit path" rule), including a
// crash inside the page-side code -- but not a crash BEFORE it reaches its
// own top-level try, or a Node-level failure (e.g. the file path itself
// being wrong), so this existence check is the fallback for that residual
// gap, printing the worker's own stdout/stderr rather than a bare ENOENT.
let renderResult;
try {
  renderResult = JSON.parse(readFileSync(renderOutputPath, "utf8"));
} catch (e) {
  console.error(`lottie-render-worker.mjs produced no readable output (exit ${worker.status}): ${e.message}`);
  console.error(`worker stdout: ${worker.stdout}`);
  console.error(`worker stderr: ${worker.stderr}`);
  writeFileSync(
    `${outDir}/report.json`,
    JSON.stringify(
      { scene: scenePath, exportResult: { ok: true }, workerExitCode: worker.status, workerStdout: worker.stdout, workerStderr: worker.stderr },
      null,
      2,
    ),
  );
  process.exit(1);
}
try {
  unlinkSync(renderInputPath);
  unlinkSync(renderOutputPath);
} catch {
  // Best-effort cleanup only; a leftover IPC file under the gitignored
  // `.visual-check/` output directory is harmless and not worth failing a
  // whole run over.
}

consoleErrors.push(...renderResult.consoleErrors);
pageErrors.push(...renderResult.pageErrors);

if (!renderResult.ok) {
  console.error(`${renderer} failed to load the document (${renderResult.stage}): ${renderResult.error}`);
  writeFileSync(
    `${outDir}/report.json`,
    JSON.stringify(
      {
        scene: scenePath,
        renderer,
        exportMeta: { fps: exportResult.fps, frameCount: exportResult.frameCount },
        loadResult: { ok: false, stage: renderResult.stage, error: renderResult.error },
        consoleErrors,
        pageErrors,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const frameSamples = renderResult.frameSamples;
const lottieErrors = renderResult.lottieErrors;

const report = {
  scene: scenePath,
  requestedFps: fps,
  requestedDurationSeconds: durationSeconds ?? null,
  url,
  lottiePath,
  // Ruling T3-R1: recorded explicitly so a report on disk states, without
  // needing this script's source open, that the player never shared a
  // Node.js process with the export seam's pixi Application.
  processes: {
    export: `this process (${sceneUrl})`,
    render: "lottie-render-worker.mjs, a separate node invocation; about:blank, never navigated to the Marey app",
  },
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
      if (c.inkBBox) {
        const box = (b) => (b ? `(${b.minX},${b.minY})-(${b.maxX},${b.maxY})` : "none");
        const { halfCoverage: h, anyInk: a } = c.inkBBox;
        console.log(
          `    ink bbox, half coverage (d >= ${h.threshold}): png ${box(h.png)}, player ${box(h.lottie)}, maxEdgeDelta=${h.maxEdgeDelta}`,
        );
        console.log(`    ink bbox, any ink: png ${box(a.png)}, player ${box(a.lottie)}, maxEdgeDelta=${a.maxEdgeDelta}`);
      }
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
