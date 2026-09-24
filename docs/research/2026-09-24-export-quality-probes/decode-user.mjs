// Probe: decode the user's own exported MP4 and WebM with a real in-page decoder,
// compare them frame by frame (same sampler => same source frames), and dump the
// worst frames as PNGs for inspection.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const OUT = ".visual-check/probe/user";
mkdirSync(OUT, { recursive: true });
const files = {
  mp4: process.env.MP4 || "C:/Users/gomez/Downloads/scene (1).mp4",
  webm: process.env.WEBM || "C:/Users/gomez/Downloads/scene (2).webm",
};
const bundle = readFileSync("node_modules/mediabunny/dist/bundles/mediabunny.mjs", "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:5199/third-party-licenses.txt");
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.addScriptTag({ content: `${bundle}\nwindow.__mb = { Input, BufferSource, ALL_FORMATS, VideoSampleSink };`, type: "module" });
await page.waitForFunction(() => !!window.__mb);

const result = await page.evaluate(async ({ mp4, webm }) => {
  const mb = window.__mb;
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function decode(bytes) {
    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BufferSource(bytes.buffer) });
    const track = await input.getPrimaryVideoTrack();
    const meta = { codec: await track.getCodecParameterString?.(), w: track.displayWidth, h: track.displayHeight };
    const frames = [];
    for await (const s of new mb.VideoSampleSink(track).samples()) {
      const c = document.createElement("canvas");
      c.width = s.displayWidth; c.height = s.displayHeight;
      const ctx = c.getContext("2d");
      s.draw(ctx, 0, 0, c.width, c.height);
      frames.push({ ts: s.timestamp, data: ctx.getImageData(0, 0, c.width, c.height).data, canvas: c });
      s.close();
    }
    return { meta, frames };
  }
  const A = await decode(b64(mp4));
  const B = await decode(b64(webm));
  const n = Math.min(A.frames.length, B.frames.length);
  const rows = [];
  for (let k = 0; k < n; k++) {
    const a = A.frames[k].data, b = B.frames[k].data;
    let sum = 0, big = 0, maxd = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      sum += d; if (d > 80) big++; if (d > maxd) maxd = d;
    }
    rows.push({ k, mean: +(sum / (a.length / 4)).toFixed(2), big, maxd });
  }
  const worst = [...rows].sort((x, y) => y.big - x.big).slice(0, 4).map((r) => r.k);
  const pngs = {};
  for (const k of [...worst, 90]) {
    pngs[`mp4_${k}`] = A.frames[k].canvas.toDataURL("image/png").split(",")[1];
    pngs[`webm_${k}`] = B.frames[k].canvas.toDataURL("image/png").split(",")[1];
  }
  return { metaA: A.meta, metaB: B.meta, countA: A.frames.length, countB: B.frames.length, rows, worst, pngs };
}, { mp4: readFileSync(files.mp4).toString("base64"), webm: readFileSync(files.webm).toString("base64") });

for (const [name, b64] of Object.entries(result.pngs)) writeFileSync(`${OUT}/${name}.png`, Buffer.from(b64, "base64"));
delete result.pngs;
writeFileSync(`${OUT}/rows.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ metaA: result.metaA, metaB: result.metaB, countA: result.countA, countB: result.countB, worst: result.worst }));
console.log("big(>80) per frame:", result.rows.map((r) => r.big).join(" "));
await browser.close();
