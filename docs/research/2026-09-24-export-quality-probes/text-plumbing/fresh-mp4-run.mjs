// Phase 5C Task 7, Step 5: a fresh browser context, whose first action is
// an MP4 export of a text scene. Prints the reference frame's text ink box.
//   npx vite --port 5199 --strictPort   # separate terminal
//   node docs/research/2026-09-24-export-quality-probes/text-plumbing/fresh-mp4-run.mjs
import { chromium } from "playwright";

const url = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : "http://localhost:5199";
const PAGE = "/docs/research/2026-09-24-export-quality-probes/text-plumbing/fresh-mp4-probe.html";
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"],
});
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url + PAGE);
await page.waitForFunction(() => typeof window.__run === "function");
const result = await page.evaluate(() => window.__run());
console.log(JSON.stringify({ ...result, errors }));
await browser.close();
