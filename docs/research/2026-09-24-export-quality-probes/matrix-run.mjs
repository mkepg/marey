import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const source = readFileSync(".visual-check/probe/default.marey", "utf8");
const scale = +(process.env.SCALE || 2);
const configs = JSON.parse(readFileSync(process.env.CONFIGS || ".visual-check/probe/configs2x.json", "utf8"));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto("http://localhost:5199/");
const res = await page.evaluate(async ({ source, scale, configs }) => {
  const m = await import("/.visual-check/probe/matrix.ts");
  const { W, H, refs } = await m.lossless(source, scale);
  const out = [];
  for (const cfg of configs) out.push(await m.score(W, H, refs, cfg));
  return out;
}, { source, scale, configs });
for (const r of res) console.log(JSON.stringify(r));
await browser.close();
