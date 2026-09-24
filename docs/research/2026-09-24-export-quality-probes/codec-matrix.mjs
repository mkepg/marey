// Probe: which encoder settings produce the MP4 artefacts?
// Gets the 180 lossless frames the pipeline hands the encoder (dev seam), then
// encodes them with raw WebCodecs under several configs, decodes back, and
// scores each against the lossless originals. No mediabunny in the loop.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const source = readFileSync(process.env.SCENE || ".visual-check/probe/default.marey", "utf8");
const configs = JSON.parse(readFileSync(".visual-check/probe/codec-configs.json", "utf8"));
const browser = await chromium.launch({ args: (process.env.GPU ? [] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"]) , headless: !process.env.HEADED });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
await page.goto("http://localhost:5199/");
await page.waitForFunction(() => typeof window.__mareyExportVideo === "function", null, { timeout: 60000 });

const out = await page.evaluate(async ({ source, configs }) => {
  const r = await window.__mareyExportVideo(source, { container: "webm", fps: 30, withReferenceFrames: true });
  const W = r.width, H = r.height;
  const refs = [];
  for (const b64 of r.referenceFrames) {
    const blob = await (await fetch("data:image/png;base64," + b64)).blob();
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(W, H); const x = c.getContext("2d"); x.drawImage(bmp, 0, 0);
    refs.push({ bmp, data: x.getImageData(0, 0, W, H).data });
  }
  const results = [];
  for (const cfg of configs) {
    if (cfg.name === "yuv420-floor") {
      // No codec: BT.709 RGB->YCbCr, average chroma over 2x2, back to RGB.
      let specksT = 0, mse = 0;
      for (const ref of refs) {
        const d = ref.data; const Y = new Float32Array(W * H), Cb = new Float32Array(W * H), Cr = new Float32Array(W * H);
        for (let p = 0; p < W * H; p++) { const r = d[4*p], g = d[4*p+1], b = d[4*p+2]; const y = 0.2126*r + 0.7152*g + 0.0722*b; Y[p] = y; Cb[p] = (b - y) / 1.8556; Cr[p] = (r - y) / 1.5748; }
        let se = 0;
        for (let yy = 0; yy < H; yy += 2) for (let xx = 0; xx < W; xx += 2) {
          const ps = [yy*W+xx, yy*W+xx+1, (yy+1)*W+xx, (yy+1)*W+xx+1];
          const cb = ps.reduce((s, q) => s + Cb[q], 0) / 4, cr = ps.reduce((s, q) => s + Cr[q], 0) / 4;
          for (const q of ps) { const y = Y[q]; const r = y + 1.5748*cr, b = y + 1.8556*cb, g = (y - 0.2126*r - 0.0722*b) / 0.7152;
            const dr = r - d[4*q], dg = g - d[4*q+1], db = b - d[4*q+2]; se += dr*dr + dg*dg + db*db; if (Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) > 64) specksT++; }
        }
        mse += se / (W * H * 3);
      }
      results.push({ name: cfg.name, psnr: +(10 * Math.log10(65025 / (mse / refs.length))).toFixed(2), totalSpecks: specksT });
      continue;
    }
    const support = await VideoEncoder.isConfigSupported({ ...cfg.encoder, width: W, height: H });
    if (!support.supported) { results.push({ name: cfg.name, supported: false }); continue; }
    const chunks = [];
    let decCfg = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => { if (meta?.decoderConfig) decCfg = meta.decoderConfig; const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); chunks.push({ type: chunk.type, ts: chunk.timestamp, dur: chunk.duration, b }); },
      error: (e) => { throw e; },
    });
    enc.configure({ ...cfg.encoder, width: W, height: H });
    for (let k = 0; k < refs.length; k++) {
      const vf = new VideoFrame(refs[k].bmp, { timestamp: Math.round(k * 1e6 / 30), duration: Math.round(1e6 / 30) });
      const opts = { keyFrame: k % 30 === 0 };
      if (cfg.quantizer != null) opts[cfg.qkey] = { quantizer: cfg.quantizer };
      enc.encode(vf, opts);
      vf.close();
      while (enc.encodeQueueSize > 4) await new Promise((res) => setTimeout(res, 1));
    }
    await enc.flush(); enc.close();
    const bytes = chunks.reduce((s, c) => s + c.b.length, 0);
    // decode
    const decoded = [];
    const dec = new VideoDecoder({
      output: (f) => { const c = new OffscreenCanvas(W, H); const x = c.getContext("2d"); x.drawImage(f, 0, 0); decoded.push({ ts: f.timestamp, data: x.getImageData(0, 0, W, H).data, c }); f.close(); },
      error: (e) => { throw e; },
    });
    dec.configure(decCfg);
    for (const c of chunks) dec.decode(new EncodedVideoChunk({ type: c.type, timestamp: c.ts, duration: c.dur, data: c.b }));
    await dec.flush(); dec.close();
    decoded.sort((a, b) => a.ts - b.ts);
    let worstSpecks = 0, worstK = -1, totalSpecks = 0, mseSum = 0;
    for (let k = 0; k < decoded.length; k++) {
      const a = decoded[k].data, b = refs[k].data;
      let specks = 0, se = 0;
      for (let i = 0; i < a.length; i += 4) {
        const dr = a[i] - b[i], dg = a[i + 1] - b[i + 1], db = a[i + 2] - b[i + 2];
        se += dr * dr + dg * dg + db * db;
        if (Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) > 64) specks++;
      }
      mseSum += se / (a.length / 4 * 3);
      totalSpecks += specks;
      if (specks > worstSpecks) { worstSpecks = specks; worstK = k; }
    }
    const psnr = 10 * Math.log10(255 * 255 / (mseSum / decoded.length));
    let png = null;
    if (worstK >= 0) {
      const blob = await decoded[worstK].c.convertToBlob({ type: "image/png" });
      const ab = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (const x of ab) s += String.fromCharCode(x); png = btoa(s);
    }
    results.push({ name: cfg.name, supported: true, frames: decoded.length, kbps: Math.round(bytes * 8 / (refs.length / 30) / 1000), psnr: +psnr.toFixed(2), totalSpecks, worstSpecks, worstK, png });
  }
  return { W, H, results };
}, { source, configs });

for (const r of out.results) {
  if (r.png) writeFileSync(`.visual-check/probe/matrix_${r.name}_f${r.worstK}.png`, Buffer.from(r.png, "base64"));
  delete r.png;
  console.log(JSON.stringify(r));
}
await browser.close();
