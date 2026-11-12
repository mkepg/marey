/**
 * Judges a fitted-keyframe Lottie export against the per-frame export it
 * replaces, in a real player. Spec: `docs/specs/2026-11-13-marey-lottie-fitted-keyframes-design.md`,
 * §4 "Correction, 2026-11-13: dotlottie-web's easing cache, and a pixel bound
 * the rasterizers cannot resolve", which restates the acceptance as two checks.
 *
 *   node tools/visual-check/lottie-fit-check.mjs \
 *     --per-frame <per-frame doc.json> --fitted <fitted doc.json> \
 *     --png-dir <dir holding frame_<n>_pngexport.png> --frames 0,60,120 \
 *     --renderer lottie-web|dotlottie-web [--out <dir>]
 *
 * 1. Geometry (lottie-web only). Every layer's transform properties, as the
 *    player evaluates them from the file (`finalTransform.mProp`), at every
 *    frame, are within F3's tolerances of the per-frame file's: position px,
 *    scale percentage points, rotation degrees, opacity on 0-100. Reported as
 *    the worst difference per property and whether it is inside the
 *    tolerance. The value read is each property's evaluated value `pv`, in
 *    the file's units, not the drawn value `v`: lottie-web updates `v` only
 *    when the new value differs from the held one by more than 1e-5 of its
 *    internal units (radians and ratios: 5.7e-4 degrees of rotation, 1e-3
 *    points of scale), so `v` can hold an earlier frame's value. That holds
 *    for any file, so it measures the player, not the encoding. The 1e-4 px
 *    of position slack covers lottie-web storing a combined position in a
 *    `Float32Array`, which rounds the per-frame file's samples by up to about
 *    1e-5 px at these coordinates.
 * 2. Pixels, in the chosen player. The fitted file's maximum channel delta
 *    against Marey's own PNG export, per frame, must not exceed the worst
 *    maximum over the per-frame file and its copies with every animated
 *    position shifted by +-0.001, +-0.002 and +-0.004 px (the whole
 *    position tolerance; alternating sign by layer, then the opposite),
 *    plus 2. The shifted copies are the calibration: a quarter of the
 *    position tolerance already moves single edge pixels by tens of levels,
 *    so a bound tighter than that cannot tell a correct encoding from a
 *    wrong one. The share of differing pixels is reported beside the same
 *    calibrated range, per frame, and fails when it exceeds the range's
 *    highest share by more than 0.5 percentage points.
 *
 * The per-frame doc is the pre-change encoder's output (one linear keyframe
 * per frame); `README.md` ("Exporting Lottie") gives the recipe. The PNG
 * directory is the output of `lottie-check.mjs --compare-png` for the same
 * scene, fps and frames. Needs no dev server. Exit code 1 when either check
 * fails; exit code 2 when the inputs cannot be compared (a missing argument,
 * or a player canvas whose size differs from the reference PNG's). A geometry
 * difference that is NaN, or two documents whose layer names or counts
 * differ, fail the geometry check. Writes `<out>/fit-check.json`.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

// `LOTTIE_FIT_TOLERANCE` in `src/compiler/export/lottieFit.ts`, in the file's own units:
// position px, scale percentage points, rotation degrees, opacity on 0-100.
const TOL = { p: 0.004, s: 0.0004, r: 0.0002, o: 0.05 };
// Slack on the position check for lottie-web's Float32Array storage of a combined position.
const POSITION_SLACK_PX = 1e-4;
// Position shifts that calibrate the pixel bound: the whole position tolerance.
const JITTER_PX = [0.001, 0.002, 0.004];
const SLACK = 2;
// The share gate: sub-pixel noise moves the share by hundredths of a point, a
// systematic error by whole points.
const SHARE_SLACK = 0.005;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const need = (name) => arg(name) ?? (console.error(`missing --${name}`), process.exit(2));
const perFramePath = need("per-frame");
const fittedPath = need("fitted");
const pngDir = need("png-dir");
const frames = need("frames").split(",").map(Number);
const renderer = arg("renderer", "lottie-web");
const outDir = arg("out", ".visual-check/lottie-fit-check");
mkdirSync(outDir, { recursive: true });

const perFrame = JSON.parse(readFileSync(perFramePath, "utf8"));
const fitted = JSON.parse(readFileSync(fittedPath, "utf8"));

/** The per-frame doc with every animated position moved by `sign * amount`, sign alternating by layer. */
function jittered(doc, flip, amount) {
  const d = JSON.parse(JSON.stringify(doc));
  d.layers.forEach((l, i) => {
    const p = l.ks.p;
    if (p.a === 1) for (const kf of p.k) kf.s = kf.s.map((v) => v + ((i % 2) ^ flip ? 1 : -1) * amount);
  });
  return d;
}
const variants = [
  { name: "per-frame", doc: perFrame },
  ...JITTER_PX.flatMap((a) => [
    { name: `per-frame +${a}`, doc: jittered(perFrame, 0, a) },
    { name: `per-frame -${a}`, doc: jittered(perFrame, 1, a) },
  ]),
  { name: "fitted", doc: fitted },
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle", "--disable-accelerated-2d-canvas"],
});

const lottiePath = resolve("node_modules/lottie-web/build/player/lottie.min.js");
const dotlottiePath = resolve("node_modules/@lottiefiles/dotlottie-web/dist/index.js");
const wasmPath = resolve("node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm");

async function openPlayer(doc, kind) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("about:blank");
  await page.route(/dotlottie-player\.wasm/, (r) => r.fulfill({ path: wasmPath }));
  if (kind === "lottie-web") await page.addScriptTag({ path: lottiePath });
  else {
    const js = readFileSync(dotlottiePath, "utf8");
    const m = js.match(/export\{(\w+) as DotLottie/);
    await page.addScriptTag({ content: `${js}\nwindow.__DotLottie = ${m[1]};`, type: "module" });
    await page.waitForFunction(() => typeof window.__DotLottie === "function");
  }
  await page.evaluate(({ doc, kind }) => new Promise((res, rej) => {
    const c = document.createElement("div");
    c.id = "__lc";
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", width: doc.w + "px", height: doc.h + "px" });
    document.body.appendChild(c);
    if (kind === "lottie-web") {
      const anim = window.lottie.loadAnimation({
        container: c, renderer: "canvas", loop: false, autoplay: false, animationData: doc,
        rendererSettings: { dpr: 1, clearCanvas: true },
      });
      window.__anim = anim;
      window.__go = (f) => anim.goToAndStop(f, true);
      if (anim.isLoaded) res(); else anim.addEventListener("DOMLoaded", () => res());
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = doc.w; canvas.height = doc.h; c.appendChild(canvas);
      const p = new window.__DotLottie({ canvas, data: JSON.stringify(doc), autoplay: false, loop: false });
      window.__go = (f) => p.setFrame(f);
      p.addEventListener("load", () => res());
      p.addEventListener("loadError", (e) => rej(String(e)));
    }
  }), { doc, kind });
  return { page, errors };
}

const rgbaOf = (page) => page.evaluate(() => {
  const cv = document.querySelector("#__lc canvas");
  const data = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  let s = "";
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
  return { w: cv.width, h: cv.height, b64: btoa(s) };
}).then(({ w, h, b64 }) => ({ w, h, data: Buffer.from(b64, "base64") }));

// --- 1. geometry, in lottie-web ---------------------------------------------
const errors = [];
const geometry = { checked: false, worst: { p: 0, s: 0, r: 0, o: 0 }, fails: [] };
// Worst amount by which a property exceeds its bare F3 tolerance (0 when none does).
const overshoot = { p: 0, s: 0, r: 0, o: 0 };
if (renderer === "lottie-web") {
  geometry.checked = true;
  const read = async (doc) => {
    const { page, errors: e } = await openPlayer(doc, "lottie-web");
    const out = {};
    for (const f of frames) {
      out[f] = await page.evaluate((f) => {
        window.__go(f);
        // `pv` is the value evaluated from the file, before lottie-web applies
        // its multiplier (`degToRads` for rotation, 0.01 for scale and
        // opacity), so it is already in the file's units. A layer without an
        // `o` property gets a stand-in with only `v` (1, a ratio).
        const m = (e) => e.finalTransform.mProp;
        return window.__anim.renderer.elements.map((e) => e && {
          nm: e.data.nm,
          p: m(e).p ? Array.from(m(e).p.pv) : [m(e).px.pv, m(e).py.pv],
          s: Array.from(m(e).s.pv),
          r: m(e).r ? m(e).r.pv : 0,
          o: m(e).o.pv === undefined ? m(e).o.v * 100 : m(e).o.pv,
        });
      }, f);
    }
    errors.push(...e);
    await page.close();
    return out;
  };
  const a = await read(perFrame);
  const b = await read(fitted);
  const diff = (x, y) => {
    const xs = [].concat(x), ys = [].concat(y);
    if (xs.length !== ys.length) return NaN;
    return Math.max(...xs.map((v, i) => Math.abs(v - ys[i])));
  };
  for (const f of frames) {
    const names = (els) => els.map((e) => (e ? e.nm : null));
    if (JSON.stringify(names(a[f])) !== JSON.stringify(names(b[f]))) {
      geometry.fails.push({ frame: f, layers: "layer names or counts differ", perFrame: names(a[f]), fitted: names(b[f]) });
      continue;
    }
    a[f].forEach((ea, i) => {
      const eb = b[f][i];
      if (!ea) return;
      for (const k of ["p", "s", "r", "o"]) {
        const d = diff(ea[k], eb[k]);
        // NaN compares false with everything, so it is a failure of its own.
        if (Number.isNaN(d)) {
          geometry.fails.push({ frame: f, layer: ea.nm, prop: k, diff: "NaN", perFrame: ea[k], fitted: eb[k] });
          continue;
        }
        geometry.worst[k] = Math.max(geometry.worst[k], d);
        overshoot[k] = Math.max(overshoot[k], d - TOL[k]);
        if (d > TOL[k] + (k === "p" ? POSITION_SLACK_PX : 0)) geometry.fails.push({ frame: f, layer: ea.nm, prop: k, diff: d, perFrame: ea[k], fitted: eb[k] });
      }
    });
  }
}

// --- 2. pixels -------------------------------------------------------------
const refPage = await browser.newPage();
await refPage.goto("about:blank");
const refRaw = {};
for (const f of frames) {
  const png = readFileSync(join(pngDir, `frame_${f}_pngexport.png`)).toString("base64");
  const b64 = await refPage.evaluate(async (png) => {
    const img = new Image();
    img.src = "data:image/png;base64," + png;
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let s = "";
    for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
    return { w: cv.width, h: cv.height, b64: btoa(s) };
  }, png);
  refRaw[f] = { w: b64.w, h: b64.h, data: Buffer.from(b64.b64, "base64") };
}
await refPage.close();

function compare(img, ref) {
  if (img.w !== ref.w || img.h !== ref.h || img.data.length !== ref.data.length) {
    console.error(`canvas ${img.w}x${img.h} does not match the reference ${ref.w}x${ref.h}`);
    process.exit(2);
  }
  const a = img.data, b = ref.data;
  let max = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    let m = 0;
    for (let c = 0; c < 4; c++) m = Math.max(m, Math.abs(a[i + c] - b[i + c]));
    if (m > 0) n++;
    if (m > max) max = m;
  }
  return { max, share: n / (a.length / 4) };
}

const pixels = {};
for (const v of variants) {
  const { page, errors: e } = await openPlayer(v.doc, renderer);
  pixels[v.name] = {};
  for (const f of frames) {
    await page.evaluate((f) => window.__go(f), f);
    await page.waitForTimeout(50);
    pixels[v.name][f] = compare(await rgbaOf(page), refRaw[f]);
  }
  errors.push(...e);
  await page.close();
}
await browser.close();

const rows = frames.map((f) => {
  const calib = variants.filter((v) => v.name !== "fitted").map((v) => pixels[v.name][f]);
  const calMax = Math.max(...calib.map((c) => c.max));
  const calShare = [Math.min(...calib.map((c) => c.share)), Math.max(...calib.map((c) => c.share))];
  const fit = pixels.fitted[f];
  return {
    frame: f,
    perFrameMax: pixels["per-frame"][f].max,
    calibratedMax: calMax,
    fittedMax: fit.max,
    maxOk: fit.max <= calMax + SLACK,
    perFrameShare: pixels["per-frame"][f].share,
    calibratedShare: calShare,
    fittedShare: fit.share,
    shareOk: fit.share <= calShare[1] + SHARE_SLACK,
  };
});

const geometryOk = !geometry.checked || geometry.fails.length === 0;
const pixelsOk = rows.every((r) => r.maxOk && r.shareOk) && errors.length === 0;
geometry.worstOvershoot = Object.fromEntries(Object.entries(overshoot).map(([k, v]) => [k, Math.max(0, v)]));
const report = { renderer, frames, tolerance: TOL, positionSlackPx: POSITION_SLACK_PX, jitterPx: JITTER_PX, shareSlack: SHARE_SLACK, geometry, rows, errors, geometryOk, pixelsOk };
writeFileSync(join(outDir, "fit-check.json"), JSON.stringify(report, null, 2));

console.log(`renderer ${renderer}, frames ${frames.join(",")}`);
if (geometry.checked) {
  const w = geometry.worst;
  const o = geometry.worstOvershoot;
  console.log(`geometry: worst |fitted - per-frame| p ${w.p.toExponential(2)} px, s ${w.s.toExponential(2)} points, r ${w.r.toExponential(2)} deg, o ${w.o.toExponential(2)} (of 100); worst overshoot of the bare tolerance p ${o.p.toExponential(2)}, s ${o.s.toExponential(2)}, r ${o.r.toExponential(2)}, o ${o.o.toExponential(2)} (position slack ${POSITION_SLACK_PX}) -> ${geometryOk ? "within tolerance" : "FAIL " + JSON.stringify(geometry.fails.slice(0, 5))}`);
} else console.log("geometry: not checked (lottie-web only)");
console.log("frame | per-frame max | calibrated max | fitted max | verdict | share per-frame | share calibrated range | share fitted | share verdict");
for (const r of rows) {
  console.log(`${r.frame} | ${r.perFrameMax} | ${r.calibratedMax} | ${r.fittedMax} | ${r.maxOk ? "met" : "MISSED"} | ${(r.perFrameShare * 100).toFixed(4)}% | ${(r.calibratedShare[0] * 100).toFixed(4)}-${(r.calibratedShare[1] * 100).toFixed(4)}% | ${(r.fittedShare * 100).toFixed(4)}% | ${r.shareOk ? "met" : "MISSED"}`);
}
if (errors.length) console.log("page errors:", errors);
console.log(geometryOk && pixelsOk ? "PASS" : "FAIL");
process.exit(geometryOk && pixelsOk ? 0 : 1);
