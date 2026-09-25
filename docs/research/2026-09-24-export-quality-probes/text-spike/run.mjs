// Phase 5C Task 6 (text spike) driver. Not production code.
//
// Drives textSpikeProbe.ts (Q2, Q3, Q4, Q7 in one page) against a dev
// server already running at --url (default http://localhost:5199), then
// drives q6-fresh.html (Q6) on its own page and its own minimal document --
// navigating to the app's own `/` first mounts the whole editor/preview,
// which can use 'JetBrains Mono' for something else before we get to
// observe the loading race, so Q6 needs a page that does nothing
// font-related until window.__q6Run() is called.
//
//   npx vite --port 5199 --strictPort   # separate terminal
//   node docs/research/2026-09-24-export-quality-probes/text-spike/run.mjs
import { chromium } from "playwright";
import fs from "node:fs";

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

// Q7's fillText renderings, saved so a human can look at them (tofu box
// vs. a real fallback-font glyph are both "ink", and the bbox numbers alone
// cannot tell them apart -- see task-6-report.md's Q7 section).
const outDir = ".visual-check/text-spike";
fs.mkdirSync(outDir, { recursive: true });
for (const [ch, data] of Object.entries(mainResult.q7)) {
  if (data.pngDataUrl) {
    const base64 = data.pngDataUrl.replace(/^data:image\/png;base64,/, "");
    const name = ch === "日" ? "cjk" : "emoji";
    fs.writeFileSync(`${outDir}/q7-${name}.png`, Buffer.from(base64, "base64"));
  }
}
await page.close();

// Q6 -- a dedicated minimal page, not the app's own `/` (see header comment).
const freshPage = await browser.newPage();
freshPage.on("pageerror", (e) => console.error("PAGEERROR(q6)", e.message));
await freshPage.goto(url + "/docs/research/2026-09-24-export-quality-probes/text-spike/q6-fresh.html");
const q6Result = await freshPage.evaluate(() => window.__q6Run());
console.log("=== Q6 (fresh, isolated page) ===");
console.log(JSON.stringify(q6Result, null, 2));
await freshPage.close();

await browser.close();
