/**
 * Phase 5C Task 8: the browser evidence for Lottie `text` (spec §6.6).
 *
 * Three checks per fixture (`scenes/lottie-text-*.marey`, one text object
 * each), then the default scene:
 *
 * 1. **Layout agreement** (ruling T8-R2). In a page served by the dev server
 *    (`text-check.html`), the scene is built through the real export prefix
 *    and each line is shaped with `textOutline.ts`. For strings where the
 *    advance wins, the HarfBuzz advance sum must equal pixi's measured line
 *    width within 0.01 px. For the mark fixture, pixi's width is
 *    `max(advance, ink)` and the ink wins, so it is compared against
 *    max(HarfBuzz advance sum, HarfBuzz ink width from glyph extents), within
 *    MARK_TOLERANCE_PX: under 2 px, derived from Chromium's whole-pixel ink
 *    edges (see the constant).
 *
 *    **What it cannot see.** It shapes with `textOutline.ts`'s `shapeLine`,
 *    not `outline()`, and compares advance widths, so it says nothing about
 *    how the exported outlines are built or placed. That includes the
 *    baseline and pen placement, the whitespace rule as `outline()` applies
 *    it, and whether `outline()` uses the shaped glyphs at all: outlining
 *    each character unshaped keeps JetBrains Mono's monospaced advances, so
 *    it passes here (Task 8 mutation (b)). Those are guarded elsewhere: by
 *    the ink-bbox check (placement), the missing-glyph refusal (a tab
 *    shaped as `.notdef`), and `textOutline.test.ts` (shaped glyphs).
 * 2. **Ink-bbox position check.** `lottie-check.mjs --compare-png` renders
 *    the exported document in lottie-web and diffs it against Marey's own
 *    PNG export of the same frames. At frame 0, a quarter, the midpoint and
 *    the last frame, the two HALF-COVERAGE ink boxes must agree on each edge
 *    within 1 px. Half coverage means a pixel whose largest channel
 *    difference from the background is at least half of the text's own
 *    contrast with it in that frame. This is the binding guard on glyph
 *    placement: a baseline off by the descent passes a loose pixel delta
 *    and fails this.
 *
 *    The binding definition changed from the brief's "alpha > 0" to half
 *    coverage under controller ruling T8-R3. The reason: pixi draws its
 *    canvas-rendered text texture with bilinear sampling, so at a fractional
 *    x the faintest ink spreads a column outward that vector outlines do not
 *    have. Measured on the ligature fixture's frame 29 (x = 280.667): the
 *    any-ink boxes differ by 2 px, Marey's contains lottie-web's on both
 *    sides, and the half-coverage boxes agree exactly. A shift moves the
 *    half-coverage edges nearly 1:1, which the any-ink rule cannot separate
 *    from a spread. The any-ink box is still computed and recorded, not
 *    judged.
 *
 *    An empty box in both renders is a failure, not 0 px, except on frames
 *    a fixture declares blank (`blankFrames`), where both must be empty.
 * 3. **Criterion 2**: the same run's maxDelta and mismatching share, per
 *    frame. Gated per fixture since 2026-09-26 (ruling F-R5; spec §6.6, "its
 *    own measured tolerance"). Each frame must stay within that fixture's
 *    CRITERION2_GATES row: the fixture's measured maximum plus a 10 %
 *    margin, rounded up. This is the only browser check that sees the
 *    outlines' shapes rather than their box. Outlining a ligature per
 *    character moves neither the advances nor the ink box, but it raises
 *    the ligature fixture's maxDelta to 255 (Task 8 mutation (b)), and this
 *    gate fails it.
 *
 * Each fixture is also rendered in dotlottie-web (`--renderer
 * dotlottie-web`): it must render, and its frames are diffed against
 * lottie-web's.
 *
 * **Processes.** Every lottie-web/dotlottie-web render happens inside
 * `lottie-check.mjs`'s own render worker, a separate node process that never
 * loads the Marey app (rulings T2-R1, T3-R3: with the export seam's WebGL
 * app in the same process, lottie-web's 2D rendering breaks). This script
 * runs each `lottie-check.mjs` as a child process and reads its report. Its
 * own browser only builds scenes and measures text; it renders no Lottie.
 *
 * Usage (dev server running: `npx vite --port 5199 --strictPort`):
 *   node tools/visual-check/text-check.mjs [--out .visual-check/text]
 *        [--url http://localhost:5199] [--only ascii,ligature]
 *        [--skip-default] [--skip-dotlottie]
 *
 * Writes `<out>/summary.json` and one directory per fixture and renderer.
 * Exit 1 if any binding check fails (layout agreement, ink bbox, Criterion
 * 2, a lottie-check run, dotlottie-web failing to render), 0 otherwise.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";

function arg(name, fallback = null) {
  const i = process.argv.lastIndexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const url = arg("url", "http://localhost:5199");
const outDir = resolve(arg("out", ".visual-check/text"));
const only = arg("only", null)?.split(",") ?? null;
const here = dirname(fileURLToPath(import.meta.url));
const lottieCheck = resolve(here, "lottie-check.mjs");

/** Advance-sum tolerance for strings where the advance wins (spec §6.6). */
const ADVANCE_TOLERANCE_PX = 0.01;
/**
 * The mark fixture's tolerance, |pixi width - max(advance, ink)|. DERIVED,
 * not fitted (final review M-8; it was 1.9, exactly the one observed delta).
 *
 * For a mark string the ink wins, and pixi's width is Chromium's
 * `actualBoundingBoxLeft + actualBoundingBoxRight`. For this fixture
 * Chromium reports both edges in whole pixels: `actualBoundingBoxLeft` -4,
 * `actualBoundingBoxRight` 206, width 202
 * (text-check runs of 2026-09-26). HarfBuzz's glyph-extent ink width is not
 * quantised: 200.1 at 60 px.
 *
 * If each edge is rounded outward to a whole pixel, each side adds at least
 * 0 and less than 1 px. The two widths can therefore differ by less than
 * 2 px, and never by 2 px or more. Rounding to the nearest pixel would bound
 * them by 1 px; the measured 1.9 rules that out, so outward rounding is the
 * reading that fits. Where Chromium does not quantise (the multiline
 * fixture's right edge reads 55.39999…), the difference is smaller still, so
 * 2 px bounds both cases. Any delta of 2 px or more means the ink boxes
 * disagree by more than quantisation can explain.
 *
 * The 1 px ink-bbox check below is the binding guard on placement; this one
 * guards the width pixi reports.
 */
const MARK_TOLERANCE_PX = 2;
/** Floating-point slack on the inclusive advance bound. */
const EPSILON = 1e-9;
/** Ink-bbox tolerance per edge (spec §6.6). */
const INK_EDGE_TOLERANCE_PX = 1;
/**
 * Criterion 2 gates, per fixture: lottie-web against Marey's own PNG, over
 * every frame the fixture is checked at (ruling F-R5).
 *
 * Measured, not chosen. Two clean runs of this script on 2026-09-26, at
 * commit a5a8ff9 (`--out .visual-check/text-final-clean1` and `-clean2`),
 * gave identical per-frame numbers. Each row below is the larger of the two
 * runs' per-fixture maxima, times 1.1, rounded up: maxDelta to a whole
 * level, share to 0.01 percentage points.
 *
 * | fixture   | measured maxDelta | measured share | gate          |
 * |-----------|-------------------|----------------|---------------|
 * | ascii     | 106               | 2.5983 %       | 117 / 2.86 %  |
 * | ligature  | 108               | 2.0458 %       | 119 / 2.26 %  |
 * | multiline | 99                | 2.8700 %       | 109 / 3.16 %  |
 * | mark      | 154               | 1.6930 %       | 170 / 1.87 %  |
 * | scaled    | 125               | 1.6828 %       | 138 / 1.86 %  |
 * | default   | 132               | 1.6402 %       | 146 / 1.81 %  |
 *
 * Every row is in eval/RESULTS-PHASE-5C.md. A change that legitimately
 * moves these numbers re-measures them twice and restates the table. It
 * does not widen a gate to make a run pass.
 */
const CRITERION2_GATES = {
  ascii: { maxDelta: 117, sharePct: 2.86 },
  ligature: { maxDelta: 119, sharePct: 2.26 },
  multiline: { maxDelta: 109, sharePct: 3.16 },
  mark: { maxDelta: 170, sharePct: 1.87 },
  scaled: { maxDelta: 138, sharePct: 1.86 },
  default: { maxDelta: 146, sharePct: 1.81 },
};

const FIXTURES = [
  { name: "ascii", layout: "advance" },
  { name: "ligature", layout: "advance" },
  { name: "multiline", layout: "advance" },
  { name: "mark", layout: "ink" },
  // Frame 0 is at scale (0, 0): nothing is drawn in either render.
  { name: "scaled", layout: "advance", blankFrames: [0] },
].filter((f) => !only || only.includes(f.name));

// Same launch arguments as lottie-check.mjs, so text measures the same way.
const LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle", "--disable-accelerated-2d-canvas"];

mkdirSync(outDir, { recursive: true });
const summary = { url, fixtures: {}, defaultScene: null, failures: [] };
const fail = (what) => {
  summary.failures.push(what);
  console.log(`  FAIL ${what}`);
};

// ─── 1. Layout agreement, in this process's own browser ────────────────────
const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
await page.goto(`${url}/tools/visual-check/text-check.html`, { waitUntil: "load" });
await page.waitForFunction(() => window.__textLayoutReady === true, null, { timeout: 20_000 });

for (const f of FIXTURES) {
  const scenePath = resolve(here, "scenes", `lottie-text-${f.name}.marey`);
  const source = readFileSync(scenePath, "utf8");
  const layout = await page.evaluate((s) => window.__textLayout(s), source);
  const entry = { scene: scenePath, frameCount: layout.frameCount, layout: [], ink: null, criterion2: [], dotlottie: null };
  summary.fixtures[f.name] = entry;
  console.log(`\n${f.name}: ${layout.texts.length} text object(s), ${layout.frameCount} frames`);
  if (layout.texts.length !== 1) fail(`${f.name}: expected one text object, found ${layout.texts.length}`);
  for (const t of layout.texts) {
    for (const l of t.lines) {
      const expected = f.layout === "ink" ? Math.max(l.hbAdvanceSum, l.hbInkWidth) : l.hbAdvanceSum;
      const delta = Math.abs(expected - l.pixiLineWidth);
      const row = { id: t.id, ...l, compared: f.layout === "ink" ? "max(advance, ink)" : "advance", delta };
      entry.layout.push(row);
      console.log(
        `  "${l.line}": pixi ${l.pixiLineWidth} | hb advance ${l.hbAdvanceSum.toFixed(4)} | hb ink ${l.hbInkWidth.toFixed(4)} ` +
          `| canvas ${l.canvasWidth.toFixed(4)} ink ${(l.canvasInkLeft + l.canvasInkRight).toFixed(4)} | delta ${delta.toFixed(6)}`,
      );
      // The ink bound is strict (< 2 px, see MARK_TOLERANCE_PX); the advance
      // bound is inclusive, with float slack.
      const within = f.layout === "ink" ? delta < MARK_TOLERANCE_PX : delta <= ADVANCE_TOLERANCE_PX + EPSILON;
      if (!within) {
        const bound = f.layout === "ink" ? `< ${MARK_TOLERANCE_PX}` : `<= ${ADVANCE_TOLERANCE_PX}`;
        fail(`${f.name}: layout "${l.line}" delta ${delta}, needs ${bound}`);
      }
    }
  }
  entry.frames = [...new Set([0, Math.floor(layout.frameCount / 4), Math.floor(layout.frameCount / 2), layout.frameCount - 1])];
}
if (pageErrors.length) fail(`layout page errors: ${pageErrors.join(" / ")}`);
await browser.close();

// ─── 2 + 3. lottie-check.mjs children: ink bbox, Criterion 2, dotlottie ────
function runLottieCheck(scenePath, frames, dir, extra = []) {
  const r = spawnSync(
    process.execPath,
    [lottieCheck, "--scene", scenePath, "--fps", "30", "--frames", frames.join(","), "--compare-png", "--url", url, "--out", dir, ...extra],
    { encoding: "utf8", cwd: process.cwd() },
  );
  let report = null;
  try {
    report = JSON.parse(readFileSync(`${dir}/report.json`, "utf8"));
  } catch {
    // reported below through `status`
  }
  return { status: r.status, report, stderr: r.stderr };
}

/** Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced): Playwright's screenshots. */
function decodePng(buf) {
  let pos = 8;
  let width = 0, height = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("only 8-bit non-interlaced PNGs are supported");
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`unsupported PNG colour type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      out.set([cur[x * bpp], cur[x * bpp + 1], cur[x * bpp + 2], bpp === 4 ? cur[x * bpp + 3] : 255], (y * width + x) * 4);
    }
    prev = cur;
  }
  return { width, height, data: out };
}

function diffPngFiles(a, b) {
  const A = decodePng(readFileSync(a));
  const B = decodePng(readFileSync(b));
  if (A.width !== B.width || A.height !== B.height) return { error: `size ${A.width}x${A.height} vs ${B.width}x${B.height}` };
  let maxDelta = 0, mismatch = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    let m = 0;
    for (let c = 0; c < 4; c++) m = Math.max(m, Math.abs(A.data[i + c] - B.data[i + c]));
    if (m > 0) mismatch++;
    maxDelta = Math.max(maxDelta, m);
  }
  return { maxDelta, share: mismatch / (A.width * A.height) };
}

function judgeRun(label, run, { inkFrames, entry, blankFrames = [], gate }) {
  if (run.status !== 0 || !run.report?.frameSamples) {
    fail(`${label}: lottie-check exited ${run.status}${run.stderr ? `: ${run.stderr.trim().split("\n").slice(-2).join(" / ")}` : ""}`);
    return;
  }
  for (const s of run.report.frameSamples) {
    const c = s.pngCompare;
    if (!c || c.skipped || c.error) {
      fail(`${label} frame ${s.frame}: no comparison (${c?.skipped ?? c?.error ?? "missing"})`);
      continue;
    }
    const ink = c.inkBBox;
    const half = ink?.halfCoverage ?? null;
    const any = ink?.anyInk ?? null;
    const row = {
      frame: s.frame,
      maxDelta: c.maxDelta,
      share: c.share,
      mismatchCount: c.mismatchCount,
      totalPixels: c.totalPixels,
      contrast: ink?.contrast ?? null,
      // Binding (T8-R3): half the text's own contrast in this frame.
      halfCoverage: half,
      // Recorded, not judged.
      anyInk: any,
    };
    entry.push(row);
    const box = (b) => (b ? `(${b.minX},${b.minY})-(${b.maxX},${b.maxY})` : "none");
    console.log(
      `  ${label} frame ${s.frame}: maxDelta ${c.maxDelta}, share ${(c.share * 100).toFixed(4)}% | ` +
        `half-coverage (d >= ${half?.threshold}) png ${box(half?.png)} player ${box(half?.lottie)} edge delta ${half?.maxEdgeDelta} | ` +
        `any-ink edge delta ${any?.maxEdgeDelta}`,
    );
    // Criterion 2, judged on every frame (F-R5), including the ones the
    // position check skips.
    if (!gate) {
      fail(`${label} frame ${s.frame}: no Criterion 2 gate for this fixture`);
    } else if (!(c.maxDelta <= gate.maxDelta && c.share * 100 <= gate.sharePct + EPSILON)) {
      fail(
        `${label} frame ${s.frame}: Criterion 2 maxDelta ${c.maxDelta} / share ${(c.share * 100).toFixed(4)}% ` +
          `exceeds the gate ${gate.maxDelta} / ${gate.sharePct}%`,
      );
    }
    if (!inkFrames(s.frame)) continue;
    const bothEmpty = half && half.png === null && half.lottie === null;
    if (blankFrames.includes(s.frame)) {
      if (!bothEmpty) fail(`${label} frame ${s.frame}: declared blank, but ink was found (png ${box(half?.png)}, player ${box(half?.lottie)})`);
    } else if (!half) {
      fail(`${label} frame ${s.frame}: no ink measurement`);
    } else if (bothEmpty) {
      fail(`${label} frame ${s.frame}: no ink in either render, and the frame is not declared blank`);
    } else if (!(half.maxEdgeDelta !== null && half.maxEdgeDelta <= INK_EDGE_TOLERANCE_PX)) {
      fail(`${label} frame ${s.frame}: half-coverage ink bbox edge delta ${half.maxEdgeDelta} > ${INK_EDGE_TOLERANCE_PX}`);
    }
  }
}

function dotlottieVersusLottieWeb(label, frames, lwDir, dlDir, run) {
  const out = { renders: run.status === 0, exit: run.status, perFrame: [] };
  if (run.status !== 0) {
    fail(`${label}: dotlottie-web run exited ${run.status}`);
    return out;
  }
  for (const frame of frames) {
    const d = diffPngFiles(`${lwDir}/frame_${frame}.png`, `${dlDir}/frame_${frame}.png`);
    const vsPng = run.report.frameSamples.find((s) => s.frame === frame)?.pngCompare;
    out.perFrame.push({ frame, versusLottieWeb: d, versusMareyPng: vsPng ? { maxDelta: vsPng.maxDelta, share: vsPng.share } : null });
    console.log(
      `  dotlottie-web frame ${frame}: vs lottie-web maxDelta ${d.maxDelta} share ${(d.share * 100).toFixed(4)}% | vs Marey PNG maxDelta ${vsPng?.maxDelta}`,
    );
  }
  return out;
}

for (const f of FIXTURES) {
  const entry = summary.fixtures[f.name];
  console.log(`\n${f.name}: frames ${entry.frames.join(",")}`);
  const lwDir = `${outDir}/${f.name}/lottie-web`;
  const lw = runLottieCheck(entry.scene, entry.frames, lwDir);
  judgeRun("lottie-web", lw, {
    inkFrames: () => true,
    entry: entry.criterion2,
    blankFrames: f.blankFrames ?? [],
    gate: CRITERION2_GATES[f.name],
  });
  if (!has("skip-dotlottie")) {
    const dlDir = `${outDir}/${f.name}/dotlottie-web`;
    const dl = runLottieCheck(entry.scene, entry.frames, dlDir, ["--renderer", "dotlottie-web"]);
    entry.dotlottie = dotlottieVersusLottieWeb("dotlottie-web", entry.frames, lwDir, dlDir, dl);
  }
}

// ─── 4. The default scene ──────────────────────────────────────────────────
// `src/store/defaultScene.ts`'s DEFAULT_CODE, extracted the way
// `lottie-click-check.mjs` does (anchored on `DEFAULT_CODE = \``).
if (!has("skip-default") && !only) {
  const src = readFileSync(resolve("src/store/defaultScene.ts"), "utf8");
  const marker = "DEFAULT_CODE = `";
  const code = src.slice(src.indexOf(marker) + marker.length, src.lastIndexOf("`"));
  const scenePath = `${outDir}/default-scene.marey`;
  writeFileSync(scenePath, code);
  // 6 s at 30 fps is 180 frames. `hello!` pops in at 2.3 s (frame 69).
  const frames = [0, 75, 90, 120, 150, 179];
  // The text's band: `wave` sits at (400, 78). Above y = 118 nothing else
  // is drawn once the confetti has landed (the nearest sparkle's top edge
  // is y = 124), so the position check is judged at the late frames only;
  // earlier frames are recorded, since confetti crosses the band mid-burst.
  const region = "150,0,650,118";
  const positionFrames = (frame) => frame >= 150;
  const entry = { scene: scenePath, frames, inkRegion: region, positionJudgedAtFrames: frames.filter(positionFrames), criterion2: [], dotlottie: null };
  summary.defaultScene = entry;
  console.log(`\ndefault scene: frames ${frames.join(",")}, ink region ${region}`);
  const lwDir = `${outDir}/default/lottie-web`;
  const lw = runLottieCheck(scenePath, frames, lwDir, ["--ink-region", region]);
  judgeRun("lottie-web", lw, { inkFrames: positionFrames, entry: entry.criterion2, gate: CRITERION2_GATES.default });
  if (!has("skip-dotlottie")) {
    const dlDir = `${outDir}/default/dotlottie-web`;
    const dl = runLottieCheck(scenePath, frames, dlDir, ["--renderer", "dotlottie-web", "--ink-region", region]);
    entry.dotlottie = dotlottieVersusLottieWeb("dotlottie-web", frames, lwDir, dlDir, dl);
  }
}

writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2));
console.log(`\nwrote ${outDir}/summary.json`);
console.log(summary.failures.length ? `FAILED: ${summary.failures.length} check(s)` : "all binding checks passed");
process.exit(summary.failures.length ? 1 : 0);
