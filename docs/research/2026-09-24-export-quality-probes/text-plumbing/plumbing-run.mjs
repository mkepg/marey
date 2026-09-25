// Phase 5C Task 7: drives plumbing-probe.html, one FRESH page per scenario
// (page-cold, one browser process).
//   npx vite --port 5199 --strictPort   # separate terminal
//   node docs/research/2026-09-24-export-quality-probes/text-plumbing/plumbing-run.mjs
import { chromium } from "playwright";

const url = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : "http://localhost:5199";
const PAGE = "/docs/research/2026-09-24-export-quality-probes/text-plumbing/plumbing-probe.html";
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"],
});

async function fresh(label, arg) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(url + PAGE);
  await page.waitForFunction(() => typeof window.__collect === "function");
  const result = await page.evaluate((a) => window.__collect(a), arg);
  await page.close();
  console.log(`=== ${label} ===`);
  console.log(JSON.stringify({ ...result, errors }, null, 2));
  return result;
}

const cold = await fresh("cold page, poisoned by fallback measurements first", { poison: true });
const clean = await fresh("cold page, nothing measured first", { poison: false });
const layouts = (r) => JSON.stringify(Object.fromEntries(Object.entries(r.report).map(([k, v]) => [k, v.layout])));
console.log("=== comparison ===");
console.log(JSON.stringify({
  layoutsEqual: layouts(cold) === layouts(clean),
  digestsEqual: cold.digest === clean.digest,
  cold: cold.digest,
  clean: clean.digest,
}));
await browser.close();
