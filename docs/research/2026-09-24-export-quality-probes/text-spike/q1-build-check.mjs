// Phase 5C Task 6, Q1 (build half) + Q5 (font-fetch cache-hit half). Not
// production code.
//
// Assumes TWO things already happened, both outside this script, because
// they mutate tracked files and this script must not:
//   1. index.html was temporarily given a
//      `<script type="module" src="/docs/research/2026-09-24-export-quality-probes/text-spike/hb-probe.mjs">`
//      tag, `npm run build` was run, and index.html was reverted again
//      (see task-6-report.md's Q1 section for the exact commands used).
//   2. `npx vite preview --port 4173 --strictPort` is running against the
//      dist/ that build produced.
//
//   node docs/research/2026-09-24-export-quality-probes/text-spike/q1-build-check.mjs --url http://localhost:4173
import { chromium } from "playwright";

const url = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "http://localhost:4173";

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGEERROR", e.message));

const cdp = await page.context().newCDPSession(page);
await cdp.send("Network.enable");
const netLog = [];
cdp.on("Network.responseReceived", (e) => {
  netLog.push({
    url: e.response.url,
    status: e.response.status,
    fromDiskCache: e.response.fromDiskCache ?? false,
    fromServiceWorker: e.response.fromServiceWorker ?? false,
  });
});

await page.goto(url + "/");

// Q1 (build): the temporarily-wired hb-probe.mjs script tag sets this.
let hbResult = null;
try {
  await page.waitForFunction(() => window.__hbProbeResult !== undefined, { timeout: 10000 });
  hbResult = await page.evaluate(() => window.__hbProbeResult);
} catch (e) {
  hbResult = { ok: false, error: "window.__hbProbeResult never appeared -- was the temp script tag actually in the built index.html? " + String(e) };
}

// Q5: force the @font-face load explicitly and deterministically (rather
// than relying on the default scene happening to render text), THEN issue
// the exact fetch textOutline.ts would issue for the same file, and see
// whether the CDP network log marks the second one as a cache hit.
await page.evaluate(() => document.fonts.load("60px 'JetBrains Mono'"));
await page.waitForTimeout(300);
await page.evaluate(() => fetch("/fonts/JetBrainsMono-Regular.ttf").then((r) => r.arrayBuffer()));
await page.waitForTimeout(300);

const fontRequests = netLog.filter((e) => e.url.includes("JetBrainsMono-Regular.ttf"));
const wasmRequests = netLog.filter((e) => e.url.includes(".wasm"));

console.log("=== Q1 (build) + Q5 (cache) ===");
console.log(JSON.stringify({ hbResult, fontRequests, wasmRequests }, null, 2));

await browser.close();
