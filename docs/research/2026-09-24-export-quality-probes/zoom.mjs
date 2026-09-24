// Probe: nearest-neighbour zoom of a PNG region. usage: node zoom.mjs in.png out.png x y w h scale
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const [inp, out, x, y, w, h, scale] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = await page.evaluate(async ({ src, x, y, w, h, s }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = w * s; c.height = h * s;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x, y, w, h, 0, 0, w * s, h * s);
  return c.toDataURL("image/png").split(",")[1];
}, { src: "data:image/png;base64," + readFileSync(inp).toString("base64"), x: +x, y: +y, w: +w, h: +h, s: +scale });
writeFileSync(out, Buffer.from(b64, "base64"));
await browser.close();
