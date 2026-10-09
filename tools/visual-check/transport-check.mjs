/**
 * Measured check of playback in the playground (Phase 7, spec §3 and §4).
 *
 * Every requirement compares the live tree with `referenceHash`, the hash of a
 * fresh runtime replayed from tick 0 the way the exporters sample. "The file
 * plays" is not evidence; equal hashes are.
 *
 * For each of the five `src/examples/*.marey` (chosen through the Examples
 * menu, as a person would) it checks:
 *   1. seek equals reference: ticks 0, 37, 120 and the end (or 480 when the
 *      scene has no duration), in a fixed shuffled order; it also records the
 *      time each backward seek took;
 *   2. live play equals reference: play ~1.5 s, pause, compare at the tick read;
 *   3. a scene with a duration stops at its end, and the play toggle restarts it.
 * On `scenes/color-sequence.marey` (loaded through a share link, then edited by
 * replacing the editor's text) it checks:
 *   4. a recompile keeps the playhead: paused, playing (three samples bounded by
 *      wall time), clamped to a shorter
 *      duration, and five edits 100 ms apart while playing;
 * and, switching from the last example to another:
 *   5. a replaced file starts again at tick 0;
 *   6. screenshots of the transport in both themes.
 *
 * Usage:
 *   node tools/visual-check/transport-check.mjs [--out .visual-check/phase7/transport] [--url http://localhost:5199] [--headed]
 *
 * Needs the dev server (the seam is dev-only): `npx vite --port 5199 --strictPort`.
 * Writes `report.json` and the screenshots; exits 1 if any requirement failed.
 */
import { chromium } from "playwright";
import LZString from "lz-string";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const url = arg("url", "http://localhost:5199");
const outDir = resolve(arg("out", ".visual-check/phase7/transport"));
const headed = process.argv.includes("--headed");
mkdirSync(outDir, { recursive: true });

// Headless Chromium has no GPU; without SwiftShader PixiJS cannot start.
const LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"];

const EXAMPLES = [
  // Dusk is the page's own scene, so it is chosen last: choosing the code that
  // is already loaded compiles nothing and leaves the status at "idle".
  { id: "physics-pile", index: 1 },
  { id: "bar-chart-reveal", index: 2 },
  { id: "logo-reveal", index: 3 },
  { id: "dusk-hills", index: 0 },
];
const FIXTURE = readFileSync(resolve("tools/visual-check/scenes/color-sequence.marey"), "utf8");

const results = [];
const consoleErrors = [];
const monacoCancellations = [];
const seekTimes = {};
const seekResolution = [];
const playingSamples = [];
const rapid = [];
function record(context, name, pass, detail) {
  results.push({ context, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${context}  ${name}${detail ? `  ${detail}` : ""}`);
}

let phase = "setup";
/** Fixed-seed PRNG, so the "shuffled" seek order is the same on every run. */
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(items, seed) {
  const rand = mulberry32(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Most ticks one frame can add: clock.ts MAX_CATCHUP_TICKS (12), plus the
 *  sub-tick remainder the accumulator carries (under 1). Slack for the upper
 *  bound on how far a playing playhead can have advanced in a wall-clock span. */
const FRAME_SLACK_TICKS = 13;
const TICKS_PER_MS = 120 / 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (page) => page.evaluate(() => window.__mareyPlayback.state());
const hashes = (page, tick) =>
  page.evaluate((t) => ({ snap: window.__mareyPlayback.snapshotHash(), ref: window.__mareyPlayback.referenceHash(t) }), tick);

async function waitFor(page, fn, arg, timeout = 30000) {
  // The seam throws while a scene is being replaced; that is "not yet", not a failure.
  await page.waitForFunction(({ src, a }) => {
    try { return (0, eval)(`(${src})`)(a); } catch { return false; }
  }, { src: fn.toString(), a: arg }, { timeout, polling: 50 });
}

async function open(browser, theme, hash) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (theme) await ctx.addInitScript((t) => localStorage.setItem("marey_theme", t), theme);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push({ phase, text: m.text() }); });
  page.on("pageerror", (e) => {
    // Monaco rejects a disposed Delayer's promise with "Canceled" whenever the
    // editor's text is replaced (Delayer.cancel, from its own dispose). It is
    // editor noise, not an application error; it is counted, not hidden.
    if (e.message === "Canceled" && /Delayer\.cancel/.test(e.stack ?? "")) monacoCancellations.push(phase);
    else consoleErrors.push({ phase, text: `pageerror: ${e.message}` });
  });
  await page.goto(hash ? `${url}/#code=${LZString.compressToEncodedURIComponent(hash)}` : url);
  await ready(page);
  return { ctx, page };
}

/** The status reads "compiled" and a scene is mounted. */
async function ready(page) {
  await waitFor(page, () => {
    if (document.querySelector("header[data-topbar] [role=status]")?.textContent?.trim() !== "compiled") return false;
    try { window.__mareyPlayback.state(); return true; } catch { return false; }
  });
  await sleep(500);
}

/** Choose an example from the menu, confirming the replacement, and wait for its scene. */
async function chooseExample(page, index) {
  const before = await page.evaluate(() => window.__mareyPlayback.referenceHash(0));
  await page.locator('header[data-topbar] button[aria-haspopup="menu"][aria-label^="Examples"]').first().click();
  await page.locator('[role="menu"]').waitFor({ state: "visible", timeout: 10000 });
  const item = page.locator('[role="menuitem"]').nth(index);
  await item.click();
  // The first click arms "Replace your code?"; the second confirms it.
  if (await page.locator('[role="menu"]').count()) await page.locator('[role="menuitem"]').nth(index).click();
  await waitFor(page, (b) => window.__mareyPlayback.referenceHash(0) !== b, before);
  await ready(page);
}

async function seek(page, tick) {
  const p0 = await page.evaluate(async (t) => {
    const a = performance.now();
    const s = await window.__mareyPlayback.seek(t);
    return { ms: performance.now() - a, resolved: s, after: window.__mareyPlayback.state() };
  }, tick);
  seekResolution.push({ tick, resolvedTick: p0.resolved.tick, tickAfterResolve: p0.after.tick, playing: p0.after.playing });
  return p0;
}

const pauseAt = seek; // a seek leaves playback paused

/** Replace the editor's text; `insertText` skips Monaco's auto-closing brackets. */
async function setEditor(page, source) {
  await page.locator(".monaco-editor").first().click({ position: { x: 300, y: 40 } });
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(source);
}

const fixture = ({ to = "blue", duration = "2" } = {}) =>
  FIXTURE
    .replace("animate { property: color, to: blue, duration: 1, easing: easeInOut }", `animate { property: color, to: ${to}, duration: 1, easing: easeInOut }`)
    .replace(/^ {2}duration: 2$/m, `  duration: ${duration}`);

/** The tick and the page clock, read in one evaluate. */
const stamp = (page) => page.evaluate(() => ({ tick: window.__mareyPlayback.state().tick, now: performance.now() }));
/** Pause, then read the tick, the page clock and both hashes in one evaluate, so nothing runs between them. */
const pauseStamp = (page) => page.evaluate(() => {
  const p = window.__mareyPlayback;
  const wasPlaying = p.state().playing;
  p.pause();
  const st = p.state();
  return { wasPlaying, tick: st.tick, endTick: st.endTick, now: performance.now(), snap: p.snapshotHash(), ref: p.referenceHash(st.tick) };
});

const refAt = (page, tick) => page.evaluate((t) => window.__mareyPlayback.referenceHash(t), tick);

/** Wait until the scene's reference hash at `tick` is no longer `old`: the edit has compiled and mounted. */
async function waitRecompiled(page, tick, old) {
  await waitFor(page, ([t, o]) => {
    try { return window.__mareyPlayback.referenceHash(t) !== o; } catch { return false; }
  }, [tick, old]);
  await ready(page);
}

// --- 1 to 3: the examples ------------------------------------------------------

async function checkExample(page, ex) {
  const ctx = ex.id;
  phase = ctx;
  await chooseExample(page, ex.index);
  const s0 = await state(page);
  const T = s0.endTick ?? 480;
  await page.evaluate(() => window.__mareyPlayback.pause());
  const order = shuffled([0, 37, 120, T], 7);
  const steps = [(await state(page)).tick, ...order];
  const forwardSteps = steps.slice(1).filter((t, i) => t > steps[i]).length;
  if (forwardSteps < 1 || forwardSteps > order.length - 1) throw new Error(`seek order ${steps.join(" -> ")} lacks a forward or a backward step`);

  // 1. Seek equals reference, and a resolved seek has been performed.
  const mismatches = [];
  const backward = [];
  let prev = (await state(page)).tick;
  for (const t of order) {
    const r = await seek(page, t);
    const h = await hashes(page, t);
    if (h.snap !== h.ref) mismatches.push(`tick ${t}: ${h.snap} != ${h.ref}`);
    if (r.after.tick !== t || r.after.playing) mismatches.push(`tick ${t}: resolved with state ${JSON.stringify(r.after)}`);
    if (t < prev) backward.push({ from: prev, to: t, ms: Math.round(r.ms * 10) / 10 });
    prev = t;
  }
  seekTimes[ctx] = { endTick: s0.endTick, order, startTick: steps[0], backward };
  record(ctx, "seek equals reference at 0, 37, 120 and the end, in a fixed shuffled order",
    mismatches.length === 0, mismatches.length ? mismatches.join("; ") : `order ${steps.join(" -> ")}; backward seeks ${backward.map((b) => `${b.from}->${b.to} ${b.ms} ms`).join(", ")}`);

  // 2. Live play equals reference.
  await page.evaluate(() => window.__mareyPlayback.play());
  await sleep(1500);
  await page.evaluate(() => window.__mareyPlayback.pause());
  const s = await state(page);
  const h = await hashes(page, s.tick);
  record(ctx, "live play for 1.5 s then pause equals reference",
    h.snap === h.ref && s.tick > 0 && !s.playing, `tick ${s.tick}, hashes ${h.snap === h.ref ? "equal" : `${h.snap} != ${h.ref}`}`);

  // 3. Stops at the end, and the toggle restarts it.
  if (s0.endTick === null) {
    record(ctx, "stops at its end and restarts", true, "no duration: indefinite scene, requirement does not apply");
    return;
  }
  await seek(page, s0.endTick - 10);
  await page.evaluate(() => window.__mareyPlayback.play());
  await waitFor(page, () => window.__mareyPlayback.state().playing === false, null, 15000);
  const end = await state(page);
  await page.evaluate(() => {
    const toggle = document.querySelector("[data-transport-toggle]");
    window.__afterClick = null;
    toggle.addEventListener("click", () => requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__afterClick = window.__mareyPlayback.state();
    })), { once: true, capture: true });
  });
  await page.locator("[data-transport-toggle]").click();
  await waitFor(page, () => window.__afterClick !== null, null, 5000);
  const restarted = await page.evaluate(() => window.__afterClick);
  // The toggle's restart is performed on the next animation frame, and a frame
  // can pump up to 12 ticks; the read is two frames after the click, so a
  // bound is the honest assertion here (observed 0 to 4), not === 0.
  record(ctx, "stops at its end and the toggle restarts below tick 30",
    end.tick === s0.endTick && restarted.tick < 30 && restarted.playing,
    `stopped at ${end.tick} of ${s0.endTick}; two frames after the click tick ${restarted.tick}, playing ${restarted.playing}`);
  await page.evaluate(() => window.__mareyPlayback.pause());
}

// --- 4: recompile keeps the playhead -------------------------------------------

async function checkRecompile(page) {
  const ctx = "color-sequence";
  phase = ctx;
  // The live preview, paused at the colour frames' ticks (frame N is tick 4N
  // at 30 fps), equals the sampler's frame: criterion 1's last bullet.
  const colourTicks = [0, 60, 120, 180, 236];
  const colourBad = [];
  for (const t of colourTicks) {
    await seek(page, t);
    const h = await hashes(page, t);
    if (h.snap !== h.ref) colourBad.push(`tick ${t}`);
  }
  record(ctx, "paused at the colour frames' ticks the preview equals reference",
    colourBad.length === 0, colourBad.length ? colourBad.join(", ") : `ticks ${colourTicks.join(", ")}`);

  // Played to its end: stops at exactly endTick (2 s = 240).
  await seek(page, 230);
  await page.evaluate(() => window.__mareyPlayback.play());
  await waitFor(page, () => window.__mareyPlayback.state().playing === false, null, 15000);
  const ended = await pauseStamp(page);
  record(ctx, "played from 230 it stops at exactly 240 and matches reference",
    ended.tick === 240 && ended.endTick === 240 && ended.snap === ended.ref,
    `tick ${ended.tick}, endTick ${ended.endTick}, hashes ${ended.snap === ended.ref ? "equal" : "differ"}`);

  // Paused at 90, blue -> green.
  await pauseAt(page, 90);
  const old1 = await refAt(page, 90);
  await setEditor(page, fixture({ to: "green" }));
  await waitRecompiled(page, 90, old1);
  await sleep(500);
  let s = await state(page);
  let h = await hashes(page, 90);
  const readout = await page.locator("[data-transport-readout]").textContent();
  record(ctx, "paused at 90, to: blue -> green: playhead stays 90 and matches reference",
    s.tick === 90 && !s.playing && h.snap === h.ref && old1 !== h.ref && readout.startsWith("0.75"),
    `tick ${s.tick}, playing ${s.playing}, readout "${readout}", hashes ${h.snap === h.ref ? "equal" : "differ"}, reference changed ${old1 !== h.ref}`);

  // Playing: three recompiles. A long duration keeps the scene from reaching
  // its end. Each sample reads the tick and the page clock together before the
  // edit and again after the compile lands, so the jump is accounted for by
  // wall time: it can neither go back nor outrun 120 ticks per second.
  await setEditor(page, fixture({ to: "green", duration: "20" }));
  await waitFor(page, () => window.__mareyPlayback.state().endTick === 2400);
  await ready(page);
  const samples = [];
  for (const to of ["yellow", "cyan", "orange"]) {
    await page.evaluate(() => window.__mareyPlayback.play());
    await sleep(300);
    const oldRef = await refAt(page, 90);
    const before = await stamp(page);
    await setEditor(page, fixture({ to, duration: "20" }));
    await waitRecompiled(page, 90, oldRef);
    const after = await pauseStamp(page);
    const elapsedMs = after.now - before.now;
    const maxTick = before.tick + elapsedMs * TICKS_PER_MS + FRAME_SLACK_TICKS;
    samples.push({ to, tickBefore: before.tick, tickAfter: after.tick, elapsedMs: Math.round(elapsedMs),
      maxTick: Math.floor(maxTick), wasPlaying: after.wasPlaying, endTick: after.endTick, hashesEqual: after.snap === after.ref });
  }
  playingSamples.push(...samples);
  const sampleOk = (x) => x.tickAfter >= x.tickBefore && x.tickAfter <= x.maxTick && x.wasPlaying && x.endTick === 2400 && x.hashesEqual;
  record(ctx, "while playing, three recompiles keep the playhead within wall-clock bounds and match reference",
    samples.every(sampleOk),
    samples.map((x) => `${x.to}: ${x.tickBefore} -> ${x.tickAfter} in ${x.elapsedMs} ms (max ${x.maxTick}), playing ${x.wasPlaying}, hashes ${x.hashesEqual ? "equal" : "differ"}`).join("; "));

  // Shorter duration clamps.
  await pauseAt(page, 90);
  await setEditor(page, fixture({ to: "yellow", duration: "0.5" }));
  await waitFor(page, () => window.__mareyPlayback.state().endTick === 60);
  await ready(page);
  await sleep(300);
  s = await state(page);
  h = await hashes(page, s.tick);
  record(ctx, "paused at 90, duration 2 -> 0.5: playhead clamps to endTick 60",
    s.tick === 60 && s.endTick === 60 && !s.playing && h.snap === h.ref,
    `tick ${s.tick}, endTick ${s.endTick}, playing ${s.playing}, hashes ${h.snap === h.ref ? "equal" : "differ"}`);

  // Rapid edits while playing. The durations are long enough that the scene
  // cannot reach its end during the burst and the settle, so a clamp to the end
  // cannot hide a wrong remembered tick: the tick is asserted against wall time.
  await setEditor(page, fixture({ to: "yellow", duration: "20" }));
  await waitFor(page, () => window.__mareyPlayback.state().endTick === 2400);
  await ready(page);
  await page.evaluate(() => window.__mareyPlayback.restart());
  await sleep(300);
  const durations = ["30", "31", "32", "33", "34"];
  const finalEnd = 34 * 120;
  const before = await stamp(page);
  for (let i = 0; i < durations.length; i++) {
    await setEditor(page, fixture({ to: ["cyan", "orange", "magenta", "white", "black"][i], duration: durations[i] }));
    if (i < durations.length - 1) await sleep(100);
  }
  await waitFor(page, (e) => window.__mareyPlayback.state().endTick === e, finalEnd, 30000);
  await ready(page);
  await sleep(700);
  const after = await pauseStamp(page);
  const elapsedMs = after.now - before.now;
  const maxTick = Math.floor(before.tick + elapsedMs * TICKS_PER_MS + FRAME_SLACK_TICKS);
  rapid.push({ tickBefore: before.tick, tickAfter: after.tick, elapsedMs: Math.round(elapsedMs), maxTick, endTick: after.endTick, hashesEqual: after.snap === after.ref });
  record(ctx, "five edits 100 ms apart while playing: the last edit's scene is on screen and the playhead is bounded by wall time",
    after.endTick === finalEnd && after.snap === after.ref && after.tick >= before.tick && after.tick <= maxTick && after.tick < finalEnd - 600,
    `endTick ${after.endTick} (last edit duration 34 s = ${finalEnd}), tick ${before.tick} -> ${after.tick} in ${Math.round(elapsedMs)} ms (max ${maxTick}), hashes ${after.snap === after.ref ? "equal" : "differ"}`);
}

// --- 5, 6 ----------------------------------------------------------------------

async function checkReplacement(page) {
  phase = "replacement";
  await page.evaluate(() => window.__mareyPlayback.pause());
  await seek(page, 90);
  const paused = await state(page);
  const before = await page.evaluate(() => window.__mareyPlayback.referenceHash(0));
  await page.locator('header[data-topbar] button[aria-haspopup="menu"][aria-label^="Examples"]').first().click();
  await page.locator('[role="menu"]').waitFor({ state: "visible", timeout: 10000 });
  await page.locator('[role="menuitem"]').nth(1).click();
  // Read the first state of the new scene on the frame it mounts: it autoplays from 0.
  const first = page.evaluate((b) => new Promise((resolveP) => {
    const poll = () => {
      try {
        if (window.__mareyPlayback.referenceHash(0) !== b) return resolveP(window.__mareyPlayback.state());
      } catch { /* scene being replaced */ }
      requestAnimationFrame(poll);
    };
    poll();
  }), before);
  if (await page.locator('[role="menu"]').count()) await page.locator('[role="menuitem"]').nth(1).click();
  const s = await first;
  record("replacement", "choosing another example while paused at 90 starts the new scene at tick 0",
    paused.tick === 90 && s.tick === 0,
    `paused at ${paused.tick}; first state of the new scene (read on the frame it mounted): tick ${s.tick}, playing ${s.playing}, endTick ${s.endTick}`);
}

async function screenshots(browser) {
  phase = "screenshots";
  for (const theme of ["light", "dark"]) {
    const { ctx, page } = await open(browser, theme, FIXTURE);
    await pauseAt(page, 90);
    await sleep(500);
    const box = await page.locator("[data-transport]").boundingBox();
    await page.screenshot({ path: resolve(outDir, `transport-${theme}.png`) });
    await page.locator("[data-transport]").screenshot({ path: resolve(outDir, `transport-${theme}-strip.png`) });
    const readout = await page.locator("[data-transport-readout]").textContent();
    record("screenshots", `transport strip in the ${theme} theme`, !!box && box.width > 0 && readout.includes("0.75"),
      `strip ${box ? `${Math.round(box.width)} x ${Math.round(box.height)}` : "missing"} px, readout "${readout}"`);
    await ctx.close();
  }
}

const browser = await chromium.launch({ headless: !headed, args: LAUNCH_ARGS });
try {
  const { ctx, page } = await open(browser, null, null);
  for (const ex of EXAMPLES) {
    try { await checkExample(page, ex); }
    catch (e) { record(ex.id, "check ran to completion", false, String(e.message).split("\n")[0]); }
  }
  await ctx.close();

  const fx = await open(browser, null, FIXTURE);
  try { await checkRecompile(fx.page); }
  catch (e) { record("color-sequence", "recompile checks ran to completion", false, String(e.message).split("\n")[0]); }
  await fx.ctx.close();

  const rep = await open(browser, null, null);
  try {
    await chooseExample(rep.page, 4);
    await checkReplacement(rep.page);
  } catch (e) { record("replacement", "check ran to completion", false, String(e.message).split("\n")[0]); }
  await rep.ctx.close();

  await screenshots(browser);
} finally {
  await browser.close();
}

record("page", "no console or page errors", consoleErrors.length === 0, consoleErrors.map((e) => `[${e.phase}] ${e.text}`).join(" | ").slice(0, 400));
const failed = results.filter((r) => !r.pass);
writeFileSync(resolve(outDir, "report.json"), JSON.stringify({ results, seekTimes, seekResolution, playingSamples, rapidEdits: rapid, consoleErrors, monacoCancellations }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} requirements passed`);
process.exit(failed.length ? 1 : 0);
