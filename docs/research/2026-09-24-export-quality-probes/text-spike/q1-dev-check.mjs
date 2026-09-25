// Phase 5C Task 6, Q1 (dev half): does `import * as hb from "harfbuzzjs"`
// load and instantiate harfbuzz.wasm under `npm run dev`? Not production
// code.
//
//   npx vite --port 5199 --strictPort   # separate terminal
//   node docs/research/2026-09-24-export-quality-probes/text-spike/q1-dev-check.mjs
//
// The build half (does the same hold in a real `npm run build` +
// `vite preview` page, and what does dist/ emit) is q1-build-check.mjs --
// that one needs a temporary build entry that this dev-mode check does not,
// because Vite's dev server serves any file on disk as an ES module on
// request, regardless of whether anything imports it statically.
import { chromium } from "playwright";

const url = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "http://localhost:5199";

const HB_PROBE_PATH = "/docs/research/2026-09-24-export-quality-probes/text-spike/hb-probe.mjs";

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGEERROR", e.message));

const responses = [];
page.on("response", (r) => {
  if (r.url().includes("harfbuzzjs") || r.url().includes(".wasm")) {
    responses.push({ url: r.url(), status: r.status() });
  }
});

await page.goto(url + "/");
const result = await page.evaluate(async (probePath) => {
  const mod = await import(probePath);
  return mod.runHbProbe();
}, HB_PROBE_PATH);

console.log("=== Q1 (dev) ===");
console.log(JSON.stringify({ result, wasmRelatedResponses: responses }, null, 2));

await browser.close();
