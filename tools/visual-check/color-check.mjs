/**
 * Measure colour animation in the browser's real PNG export.
 *
 * Calls `window.__mareyExportPng` (the dev seam in `src/lib/devExportSeam.ts`)
 * on the colour fixture, decodes selected frames inside the page (an
 * `ImageBitmap` drawn to an `OffscreenCanvas`, then `getImageData`), reads the
 * pixel at each non-text shape's centre, and compares it with a colour
 * computed here, independently of the renderer.
 *
 * The model re-implements, from the documented formulas rather than by
 * importing them:
 *   - the easing curves of `src/compiler/renderer/easing.ts`;
 *   - Phase 7 spec 2.2: per sRGB channel, `round(c0 + (c1 - c0) * e)`;
 *   - the fixed 120 Hz tick, so export frame N at 30 fps is tick N * 4;
 *   - a sequence's step boundary: its first step starts at tick 1, step 2
 *     at tick 121 from step 1's end colour (the boundary is not tick 120);
 *   - a loop + yoyo animation as a triangle wave: progress rises over one
 *     leg, falls over the next, and repeats with a period of two legs.
 * The scene's `text` is not sampled: a glyph has no reliable centre pixel.
 * Lottie against PNG covers it (`lottie-check.mjs --compare-png`).
 *
 * Usage:
 *   node tools/visual-check/color-check.mjs \
 *     --scene tools/visual-check/scenes/color-sequence.marey \
 *     --out .visual-check/phase7/color/png
 *
 *   --scene <path>    .marey source file (required)
 *   --frames <list>   comma-separated export frames (default 0,15,30,45,59)
 *   --fps <n>         export frame rate (default 30)
 *   --out <dir>       where frame_%04d.png and report.json go
 *   --url <origin>    dev server origin (default http://localhost:5199)
 *   --headed          show the browser window
 *
 * Writes `<out>/report.json` with `{ frame, shape, expected, actual, delta }`
 * rows. Exit code is non-zero if the export failed or any channel of any row
 * differs by more than 1.
 */
import { chromium } from "playwright";
import LZString from "lz-string";
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
  console.error("color-check.mjs requires --scene <path-to-.marey-file>");
  process.exit(2);
}
const outDir = resolve(arg("out", ".visual-check/phase7/color/png"));
const fps = Number(arg("fps", "30"));
const frames = arg("frames", "0,15,30,45,59").split(",").map(Number);
const TICK_HZ = 120;
const TICKS_PER_FRAME = TICK_HZ / fps;
const source = readFileSync(resolve(scenePath), "utf8");

const LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"];

// ---- Independent model ------------------------------------------------------

const ease = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
};
const easeAt = (name, t) => (t <= 0 ? 0 : t >= 1 ? 1 : ease[name](t));

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, e) =>
  a.map((c, i) => Math.max(0, Math.min(255, Math.round(c + (b[i] - c) * e))));

/** One step: from `from` to `to` over `ticks`, starting at tick `start`. */
function stepColor(from, to, easing, ticks, start, tick) {
  return mix(from, to, easeAt(easing, (tick - start) / ticks));
}

// The colours the fixture uses, from the language reference's named table.
const RED = rgb("#ff0000");
const BLUE = rgb("#0000ff");
const SPRING = rgb("#00ff80");
const DARK = rgb("#202020");
const YELLOW = rgb("#ffff00");
const WHITE = rgb("#ffffff");
const MAGENTA = rgb("#ff00ff");

// The tick at which a sequence's first step has elapsed 0.
const SEQUENCE_START = 1;

const SHAPES = [
  {
    name: "swatch",
    at: [200, 300],
    // Sequence of two 1 s (120-tick) steps. A sequence spawns its first step
    // at the end of tick 1 (sceneRuntime.test.ts documents this), so step 1
    // has elapsed `tick - 1` and ends at tick 121; step 2 is spawned on that
    // tick and starts from step 1's end colour. Tick 0 is the declared colour.
    expected: (tick) =>
      tick < 121
        ? stepColor(RED, BLUE, "easeInOut", 120, SEQUENCE_START, tick)
        : stepColor(BLUE, SPRING, "easeInOut", 120, SEQUENCE_START + 120, tick),
  },
  {
    name: "pulse",
    at: [450, 300],
    // Loop + yoyo, leg of 0.5 s = 60 ticks: elapsed climbs 0..60, falls
    // 60..0, and repeats, a triangle wave of period 120 ticks. Linear easing.
    expected: (tick) => {
      const m = tick % 120;
      const elapsed = m <= 60 ? m : 120 - m;
      return mix(DARK, YELLOW, elapsed / 60);
    },
  },
  {
    name: "stroke",
    at: [650, 300],
    // white -> magenta, 2 s = 240 ticks, linear.
    expected: (tick) => stepColor(WHITE, MAGENTA, "linear", 240, 0, tick),
  },
];

// ---- Browser ----------------------------------------------------------------

const sceneUrl = `${url}/#code=${LZString.compressToEncodedURIComponent(source)}`;
const browser = await chromium.launch({ headless: !has("headed"), args: LAUNCH_ARGS });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
await page.goto(sceneUrl, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.__mareyExportPng === "function", null, {
  timeout: 20_000,
  polling: 200,
});

const probes = SHAPES.map((s) => ({ shape: s.name, x: s.at[0], y: s.at[1] }));
const result = await page.evaluate(
  async ({ source, fps, frames, probes }) => {
    try {
      const r = await window.__mareyExportPng(source, { fps });
      const out = {
        ok: true,
        frameCount: r.frameCount,
        width: r.width,
        height: r.height,
        samples: [],
        pngs: {},
      };
      for (const f of frames) {
        const b64 = r.frames[f];
        if (b64 === undefined) throw new Error(`export has no frame ${f}`);
        out.pngs[f] = b64;
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const cv = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = cv.getContext("2d");
        ctx.drawImage(bmp, 0, 0);
        for (const p of probes) {
          const d = ctx.getImageData(p.x, p.y, 1, 1).data;
          out.samples.push({ frame: f, shape: p.shape, actual: [d[0], d[1], d[2]], alpha: d[3] });
        }
      }
      return out;
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  },
  { source, fps, frames, probes },
);
await browser.close();

mkdirSync(outDir, { recursive: true });
if (!result.ok) {
  console.error(`export failed: ${result.error}`);
  process.exit(1);
}
for (const f of frames) {
  writeFileSync(
    `${outDir}/frame_${String(f).padStart(4, "0")}.png`,
    Buffer.from(result.pngs[f], "base64"),
  );
}

const rows = result.samples.map((s) => {
  const shape = SHAPES.find((x) => x.name === s.shape);
  const tick = s.frame * TICKS_PER_FRAME;
  const expected = shape.expected(tick);
  const delta = s.actual.map((c, i) => Math.abs(c - expected[i]));
  return { frame: s.frame, tick, shape: s.shape, expected, actual: s.actual, delta };
});
const maxDelta = Math.max(...rows.flatMap((r) => r.delta));
const pass = pageErrors.length === 0 && maxDelta <= 1;
writeFileSync(
  `${outDir}/report.json`,
  JSON.stringify(
    {
      scene: scenePath,
      fps,
      frameCount: result.frameCount,
      width: result.width,
      height: result.height,
      note: "text is not sampled: a glyph has no reliable centre pixel; Lottie vs PNG covers it",
      maxDelta,
      pass,
      pageErrors,
      rows,
    },
    null,
    2,
  ),
);

for (const r of rows) {
  console.log(
    `frame ${String(r.frame).padStart(2)} tick ${String(r.tick).padStart(3)} ${r.shape.padEnd(7)} ` +
      `expected ${r.expected.join(",").padEnd(11)} actual ${r.actual.join(",").padEnd(11)} delta ${r.delta.join(",")}`,
  );
}
console.log(`\nmax channel delta ${maxDelta} (limit 1); page errors ${pageErrors.length}`);
console.log(`wrote ${outDir}/report.json and ${frames.length} frame(s)`);
console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
