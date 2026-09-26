// Phase 5C text-sharpness probe (spec §2.2): the width, in pixels, of the
// antialiased transition zone across a glyph's vertical stem, in one PNG.
// Not a gate: a measurement kept here so the §2.2 numbers in
// eval/RESULTS-PHASE-5C.md ("Text sharpness") can be re-run rather than
// quoted. Its fixture, text-stem.marey, sits beside it: a 400x200 scene
// holding a single white 60px "H" on black, so nothing but the glyph's own
// edges is in the frame.
//
// Re-run, from the repository root (the export writes the lossless 2x
// reference frame the pipeline fed its encoder as reference_0000.png):
//   npx vite --port 5199 --strictPort   # separate terminal
//   node tools/visual-check/video-check.mjs \
//     --scene docs/research/2026-09-24-export-quality-probes/edge-band/text-stem.marey \
//     --container mp4 --fps 30 --frames 0 --out .visual-check/video/text-stem-2x
//   node docs/research/2026-09-24-export-quality-probes/edge-band/edge-band.mjs \
//     .visual-check/video/text-stem-2x/reference_0000.png
//
// The control is the same two commands with rasterExport.ts's export
// Application initialised at `resolution: 1` (extraction still at the
// plan's scale), which is the blurry-text regression §2.2 names.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const pngPath = process.argv[2];
if (!pngPath) {
  console.error("usage: node edge-band.mjs <png-path>");
  process.exit(2);
}
const png = readFileSync(pngPath);
const b64 = png.toString("base64");

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"],
});
const page = await browser.newPage();
const result = await page.evaluate(async (b64) => {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("png decode failed"));
    img.src = `data:image/png;base64,${b64}`;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const w = c.width;
  const h = c.height;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const data = ctx.getImageData(0, y, w, 1).data;
    const lum = new Array(w);
    for (let x = 0; x < w; x++) lum[x] = data[x * 4]; // R channel; white text on black bg, R=G=B
    rows.push(lum);
  }
  return { width: w, height: h, rows };
}, b64);
await browser.close();

// A "band" is a maximal run of pixels whose luminance sits strictly between
// 10% and 90% of the row's own max -- the antialiased transition zone
// between background and ink, on either side of an edge. Scanned across
// EVERY row, not one hand-picked row, so the reported number is not an
// artefact of picking a row that happens to cross a serif, the crossbar, or
// a corner.
function bandsInRow(lum) {
  const max = Math.max(...lum);
  if (max === 0) return [];
  const lo = max * 0.1;
  const hi = max * 0.9;
  const bands = [];
  let inBand = false;
  let start = 0;
  for (let x = 0; x < lum.length; x++) {
    const between = lum[x] > lo && lum[x] < hi;
    if (between && !inBand) {
      inBand = true;
      start = x;
    }
    if (!between && inBand) {
      inBand = false;
      bands.push(x - start);
    }
  }
  if (inBand) bands.push(lum.length - start);
  return bands;
}

const allWidths = [];
for (const row of result.rows) {
  for (const w of bandsInRow(row)) allWidths.push(w);
}
allWidths.sort((a, b) => a - b);
const median = allWidths.length > 0 ? allWidths[Math.floor(allWidths.length / 2)] : null;
const mean = allWidths.length > 0 ? allWidths.reduce((s, w) => s + w, 0) / allWidths.length : null;

console.log(
  JSON.stringify(
    {
      pngPath,
      imageSize: `${result.width}x${result.height}`,
      bandCount: allWidths.length,
      widths: allWidths,
      median,
      mean: mean === null ? null : +mean.toFixed(2),
      min: allWidths[0] ?? null,
      max: allWidths[allWidths.length - 1] ?? null,
    },
    null,
    2,
  ),
);
