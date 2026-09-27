// Throwaway. H.264 with a level-4.0 codec string; evaluate() returning bytes; PNG-per-frame cost via OffscreenCanvas.
import { chromium } from "playwright";
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.route("https://marey.export/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" }));
await page.goto("https://marey.export/");
log("avc", JSON.stringify(await page.evaluate(async () => {
  const out = {};
  for (const codec of ["avc1.420028", "avc1.4d0028", "avc1.640028", "avc1.42001f"]) out[codec] = (await VideoEncoder.isConfigSupported({ codec, width: 1600, height: 1200, bitrate: 8e6 })).supported;
  return out;
})));
// evaluate returning a Uint8Array directly (Playwright serializes typed arrays)
let t = Date.now(), bytes = 0;
for (let i = 0; i < 10; i++) {
  const b = await page.evaluate((i) => { const f = new Uint8Array(1600 * 1200 * 4); f[0] = i; return f; }, i);
  bytes += b.length ?? Object.keys(b).length;
}
let dt = Date.now() - t; log(`evaluate->Uint8Array: 10 frames, ${(bytes / 1e6).toFixed(1)} MB, ${dt} ms, ${(bytes / 1e6 / (dt / 1000)).toFixed(0)} MB/s`);
// evaluate returning base64 of a raw frame
t = Date.now(); bytes = 0;
for (let i = 0; i < 10; i++) {
  const s = await page.evaluate(async () => { const f = new Uint8Array(1600 * 1200 * 4); const u = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob([f])); }); return u.slice(u.indexOf(",") + 1); });
  bytes += Buffer.from(s, "base64").length;
}
dt = Date.now() - t; log(`evaluate->base64: 10 frames, ${(bytes / 1e6).toFixed(1)} MB, ${dt} ms, ${(bytes / 1e6 / (dt / 1000)).toFixed(0)} MB/s`);
// PNG encode cost of a flat-ish 1600x1200 image (a few shapes), and its size
const png = await page.evaluate(async () => {
  const c = new OffscreenCanvas(1600, 1200), g = c.getContext("2d");
  const times = []; let size = 0;
  for (let i = 0; i < 10; i++) {
    g.fillStyle = "#0a0e1a"; g.fillRect(0, 0, 1600, 1200);
    g.fillStyle = "#38bdf8"; for (let k = 0; k < 7; k++) g.fillRect(100 + k * 200, 1000 - (i + k) * 30, 140, (i + k) * 30);
    g.beginPath(); g.arc(800, 400, 150 + i * 5, 0, 7); g.fill();
    const t0 = performance.now(); const b = await c.convertToBlob({ type: "image/png" }); times.push(performance.now() - t0); size = b.size;
  }
  return { msPerPng: (times.reduce((a, b) => a + b) / times.length).toFixed(1), bytes: size };
});
log("png 1600x1200 synthetic", JSON.stringify(png));
await browser.close(); process.exit(0);
