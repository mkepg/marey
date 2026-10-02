/**
 * Measured layout check for the redesigned playground (Phase 6B, spec §9.7).
 *
 * For each of 1440x900 and 390x844, in each theme, it loads the app at a
 * device pixel ratio of 2, waits for the status to read "compiled", saves a
 * screenshot (so 2880x1800 and 780x1688 pixels; spec §11 reviews them at 2x)
 * and asserts:
 *   1. no two visible controls in `header[data-topbar]` have intersecting
 *      bounding boxes;
 *   2. the plate frame's aspect ratio equals 800/600 within 1 px;
 *   3. the caption reads `800 × 600` and `12 s`;
 *   4. every menu opens with Enter, moves with ArrowDown, and closes with
 *      Escape, returning focus to its button (Examples and Export on
 *      desktop; Examples and More on a phone);
 *   5. the page logs no console errors.
 * At 320x640 it repeats assertion 1 only. At 760x900, the narrowest desktop
 * layout (the phone breakpoint is 759), it runs assertion 1 in the normal
 * state and again while New shows its "Clear editor?" confirmation.
 *
 * Usage:
 *   node tools/visual-check/playground-check.mjs [--url http://localhost:5199] [--headed]
 *
 * Needs the dev server: `npx vite --port 5199 --strictPort`. Writes
 * `.visual-check/6b/{desktop,phone}-{light,dark}.png` and
 * `.visual-check/6b/report.json`; exits 1 if any assertion failed.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const url = arg("url", "http://localhost:5199");
const outDir = resolve(".visual-check/6b");
mkdirSync(outDir, { recursive: true });

// Headless Chromium has no GPU; without SwiftShader PixiJS cannot start.
const LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"];

const SCENE = { width: 800, height: 600, caption: { size: "800 × 600", length: "12 s" } };

// The page renders the scene at a device pixel ratio of 2 on a software GL
// stack, so a menu's effects can lag a keypress by well over a second.
const MENU_WAIT_MS = 10_000;

const results = [];
const consoleErrors = [];
function record(context, name, pass, detail) {
  results.push({ context, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${context}  ${name}${detail ? `  ${detail}` : ""}`);
}

/** Visible controls in the top bar, with their bounding boxes. */
async function topBarBoxes(page) {
  return page.evaluate(() => {
    const bar = document.querySelector("header[data-topbar]");
    if (!bar) return null;
    const out = [];
    for (const el of bar.querySelectorAll("button, a[href], [role=switch], [role=status]")) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      const name = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent.trim() || el.tagName;
      out.push({ name, x: r.left, y: r.top, w: r.width, h: r.height });
    }
    return out;
  });
}

function overlaps(boxes) {
  const hits = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      // Touching edges do not count: the intersection must have positive area.
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 0.5 && iy > 0.5) hits.push(`${a.name} x ${b.name} (${ix.toFixed(1)} x ${iy.toFixed(1)} px)`);
    }
  }
  return hits;
}

async function checkOverlap(page, context) {
  const boxes = await topBarBoxes(page);
  if (!boxes) return record(context, "top bar controls do not overlap", false, "header[data-topbar] missing");
  const hits = overlaps(boxes);
  record(context, "top bar controls do not overlap", hits.length === 0,
    hits.length ? hits.join("; ") : `${boxes.length} controls measured`);

  // A flex row that runs out of room pushes controls off the edge instead of
  // overlapping them. Catch that too.
  const vw = page.viewportSize().width;
  const outside = boxes.filter((b) => b.x < -0.5 || b.x + b.w > vw + 0.5).map((b) => b.name);
  record(context, "top bar controls stay inside the viewport", outside.length === 0,
    outside.length ? outside.map((n) => `${n} outside`).join("; ") : `viewport ${vw} px`);
}

async function checkMenu(page, context, label) {
  const button = page.locator(`header[data-topbar] button[aria-haspopup="menu"][aria-label^="${label}"]`).first();
  let focusedBefore;
  const name = `${label} menu: Enter opens, ArrowDown moves, Escape closes and returns focus`;
  try {
    await button.focus();
    focusedBefore = await button.evaluate((el) => document.activeElement === el);
    await page.keyboard.press("Enter");
    await page.locator('[role="menu"]').waitFor({ state: "visible", timeout: MENU_WAIT_MS });
    const opened = (await button.getAttribute("aria-expanded")) === "true";
    // Opening focuses the first item in an effect, after the menu is visible.
    // Wait for it, as a person would, before pressing the next key.
    const isItem = () => document.activeElement?.getAttribute("role")?.startsWith("menuitem") ?? false;
    await page.waitForFunction(isItem, null, { timeout: MENU_WAIT_MS });
    const first = await page.evaluate(() => document.activeElement?.textContent);
    await page.keyboard.press("ArrowDown");
    const itemFocused = await page
      .waitForFunction((f) => document.activeElement?.getAttribute("role")?.startsWith("menuitem") && document.activeElement.textContent !== f, first, { timeout: MENU_WAIT_MS })
      .then(() => true, () => false);
    await page.keyboard.press("Escape");
    await page.locator('[role="menu"]').waitFor({ state: "detached", timeout: MENU_WAIT_MS });
    const closed = (await button.getAttribute("aria-expanded")) === "false";
    const focusBack = await button.evaluate((el) => document.activeElement === el);
    record(context, name, opened && itemFocused && closed && focusBack,
      `opened=${opened} itemFocused=${itemFocused} closed=${closed} focusBack=${focusBack}`);
  } catch (e) {
    const active = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)).catch(() => "?");
    const menus = await page.locator('[role="menu"]').count();
    record(context, name, false,
      `${String(e.message).split("\n")[0]} (focusedBefore=${focusedBefore}, menus=${menus}, active=${active})`);
  }
}

async function load(browser, viewport, theme, deviceScaleFactor = 1) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor });
  if (theme) await ctx.addInitScript((t) => localStorage.setItem("marey_theme", t), theme);
  const page = await ctx.newPage();
  const label = `${viewport.width}x${viewport.height}${theme ? ` ${theme}` : ""}`;
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push({ context: label, text: m.text() }); });
  page.on("pageerror", (e) => consoleErrors.push({ context: label, text: `pageerror: ${e.message}` }));
  await page.goto(url);
  await page.waitForFunction(
    () => document.querySelector("header[data-topbar] [role=status]")?.textContent?.trim() === "compiled",
    null, { timeout: 30000 });
  await page.locator("[data-plate-frame]").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(500);
  return { ctx, page, label };
}

const browser = await chromium.launch({ headless: !process.argv.includes("--headed"), args: LAUNCH_ARGS });

for (const [kind, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  for (const theme of ["light", "dark"]) {
    const { ctx, page, label } = await load(browser, viewport, theme, 2);
    const context = `${kind}-${theme} (${label})`;
    await page.screenshot({ path: `${outDir}/${kind}-${theme}.png` });

    await checkOverlap(page, context);

    const frame = await page.locator("[data-plate-frame]").boundingBox();
    const expectedH = frame ? (frame.width * SCENE.height) / SCENE.width : 0;
    record(context, "plate frame aspect equals 800/600 within 1 px",
      !!frame && Math.abs(frame.height - expectedH) <= 1,
      frame ? `${frame.width.toFixed(2)} x ${frame.height.toFixed(2)}, expected height ${expectedH.toFixed(2)}` : "no frame");

    const size = (await page.locator("[data-caption-size]").textContent())?.trim();
    const length = (await page.locator("[data-caption-length]").textContent())?.trim();
    record(context, "caption reads the compiled scene's size", size === SCENE.caption.size, `got "${size}"`);
    record(context, "caption reads the compiled scene's duration", length === SCENE.caption.length, `got "${length}"`);

    await checkMenu(page, context, "Examples");
    await checkMenu(page, context, kind === "desktop" ? "Export" : "More");

    if (kind === "phone") {
      const toggle = page.locator("button[data-log-toggle]");
      const present = (await toggle.count()) === 1 && (await toggle.getAttribute("aria-expanded")) === "false";
      record(context, "the log is folded behind its toggle", present);
    }
    await ctx.close();
  }
}

{
  const { ctx, page } = await load(browser, { width: 320, height: 640 }, null);
  await checkOverlap(page, "narrowest (320x640)");
  await ctx.close();
}
{
  const { ctx, page } = await load(browser, { width: 760, height: 900 }, null);
  const context = "narrowest desktop (760x900)";
  await checkOverlap(page, context);
  await page.locator('header[data-topbar] button[aria-label="New file"]').click();
  const confirming = await page
    .locator('header[data-topbar] button', { hasText: "Clear editor?" })
    .waitFor({ state: "visible", timeout: 2000 }).then(() => true, () => false);
  record(context, "New shows its confirmation", confirming);
  await checkOverlap(page, `${context}, confirming New`);
  await ctx.close();
}
await browser.close();

record("all pages", "no console errors", consoleErrors.length === 0, `${consoleErrors.length} errors`);

const failed = results.filter((r) => !r.pass);
const report = {
  url,
  summary: {
    assertions: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    consoleErrors: consoleErrors.length,
  },
  results,
  consoleErrors,
};
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary));
process.exit(failed.length ? 1 : 0);
