// Phase 5C Task 6 (text spike) driver. Not production code.
//
// Drives textSpikeProbe.ts (Q2, Q3, Q4, Q7 in one page; Q6 alone on its own
// fresh page, per that function's own isolation requirement) against a dev
// server already running at --url (default http://localhost:5199).
//
//   npx vite --port 5199 --strictPort   # separate terminal
//   node docs/research/2026-09-24-export-quality-probes/text-spike/run.mjs
import { chromium } from "playwright";

const url = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "http://localhost:5199";

const PROBE_PATH = "/docs/research/2026-09-24-export-quality-probes/text-spike/textSpikeProbe.ts";

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"],
});

// Q2, Q3, Q4, Q7 -- one page, order does not matter between these four.
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGEERROR", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.error("CONSOLE ERROR", m.text());
});
await page.goto(url + "/");
const mainResult = await page.evaluate(async (probePath) => {
  const mod = await import(probePath);
  return mod.runAllExceptQ6();
}, PROBE_PATH);
console.log("=== Q2/Q3/Q4/Q7 ===");
console.log(JSON.stringify(mainResult, null, 2));
await page.close();

// Q6 -- must be the first font-related thing this page ever does.
const freshPage = await browser.newPage();
freshPage.on("pageerror", (e) => console.error("PAGEERROR(q6)", e.message));
await freshPage.goto(url + "/");
const q6Result = await freshPage.evaluate(async (probePath) => {
  const mod = await import(probePath);
  return mod.q6FontReadiness();
}, PROBE_PATH);
console.log("=== Q6 (fresh page) ===");
console.log(JSON.stringify(q6Result, null, 2));
await freshPage.close();

await browser.close();
