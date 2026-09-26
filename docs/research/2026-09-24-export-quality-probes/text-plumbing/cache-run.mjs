// Phase 5C Task 7: drives cache-probe.html, one FRESH page per scenario
// (page-cold, one browser process, the granularity every harness here uses).
//   npx vite --port 5199 --strictPort   # separate terminal
//   node docs/research/2026-09-24-export-quality-probes/text-plumbing/cache-run.mjs
import { chromium } from "playwright";

const url = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : "http://localhost:5199";
const PAGE = "/docs/research/2026-09-24-export-quality-probes/text-plumbing/cache-probe.html";
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"],
});

async function fresh(label, fn, arg) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url + PAGE);
  await page.waitForFunction(() => typeof window.__export === "function");
  const result = await page.evaluate(({ fn, arg }) => window[fn](arg), { fn, arg });
  await page.close();
  console.log(`=== ${label} ===`);
  console.log(JSON.stringify({ ...result, errors }, null, 2));
  return result;
}

await fresh("raw caches", "__raw");
await fresh("export, cold page, poisoned by a fallback measurement first", "__export", { poison: true, preload: false });
await fresh("export, cold page, nothing measured first", "__export", { poison: false, preload: false });
await fresh("export, warm (font loaded before anything measured)", "__export", { poison: false, preload: true });
await browser.close();
