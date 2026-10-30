/**
 * Measured check of the embeddable player, `<marey-player>` (Phase 9A, spec §6
 * exit criteria 2 to 6), against the built bundle in `dist/player/`.
 *
 * Every requirement compares a measurement with a reference. The player's
 * frames are read through its test hook, `el[Symbol.for("marey.player.debug")]
 * .liveFramesHash(ticks)` (spec §4.6), which seeks the live playback and hashes
 * the tree on screen the way `sampleFrames` does, so its result is comparable
 * with the `frames` hash `marey export` prints.
 *
 *   1. agreement: for a physics scene, a staggered reveal and a text scene,
 *      `liveFramesHash` over the ticks `marey export --fps 30` samples equals
 *      the `frames` hash the export printed;
 *   2. context budget: 24 autoplay players (`player/many.html`). Far players
 *      hold no canvas at load and the renderer chunk is not requested before
 *      the first player comes near view; player 0, paused at tick 200, leaves
 *      view and returns on the same frame hash; at the bottom every player in
 *      view draws and no context was lost on a player in view;
 *   3. reduced motion: an autoplay bounded scene shows its last tick, paused;
 *   4. errors: compile, fetch, font and no-source failures, each with its code;
 *   5. currentTime: a set keeps a playing embed playing and reads back at
 *      once; `currentTime = 0` shows the CLI's frame 0.
 *
 * It builds the player (and the CLI, for the references), serves the
 * repository root from its own `node:http` server on a free port, and closes
 * that server before it exits. No Vite server is involved.
 *
 * Usage:
 *   node tools/visual-check/player-check.mjs [--out .visual-check/phase9a/player]
 *     [--only agreement,many,reducedMotion,errors,currentTime] [--headed]
 *
 * Writes `report.json` and two screenshots to `--out`; exits 1 if any
 * requirement failed or a page raised an error.
 */
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { connect } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const outDir = resolve(arg("out", ".visual-check/phase9a/player"));
const headed = process.argv.includes("--headed");
const ALL = ["agreement", "currentTime", "reducedMotion", "errors", "many"];
const only = arg("only", ALL.join(",")).split(",");
for (const name of only) if (!ALL.includes(name)) throw new Error(`--only: unknown requirement "${name}"; one of ${ALL.join(", ")}`);
mkdirSync(outDir, { recursive: true });

// Headless Chromium has no GPU; without SwiftShader PixiJS cannot start.
const LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"];
const VIEWPORT = { width: 1280, height: 800 };
/** `TICK_HZ` in `src/compiler/sceneIR.ts`. */
const TICK_HZ = 120;
const FPS = 30;
const TICKS_PER_FRAME = TICK_HZ / FPS;
const PAGES = "/tools/visual-check/player";

const AGREEMENT_SCENES = [
  { id: "pile", kind: "physics", path: "src/examples/physics-pile.marey" },
  { id: "bars", kind: "reveal", path: "docs/media/bars-reveal.marey" },
  { id: "text", kind: "text", path: "src/examples/bar-chart-reveal.marey" },
];
/** many.html: the page background, and each scene's own `background:`. */
const MAGENTA = [0xff, 0x00, 0xff];
const SCENE_BACKGROUND = { pile: [0x1a, 0x1b, 0x41], bars: [0x0a, 0x0e, 0x1a] };
const P0_TICK = 200;

const results = [];
const consoleLog = { errors: [], warnings: [], pageErrors: [], expectedResourceErrors: [] };
const network = [];
const report = { references: {}, measurements: {} };
function record(requirement, name, pass, detail) {
  results.push({ requirement, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${requirement}  ${name}${detail ? `  ${detail}` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- builds and references ------------------------------------------------------

function npmRun(script) {
  const r = spawnSync(`npm run ${script}`, { cwd: ROOT, shell: true, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`npm run ${script} failed (exit ${r.status})\n${r.stdout}${r.stderr}`);
  console.log(`built: npm run ${script}`);
}

const scratch = mkdtempSync(join(tmpdir(), "marey-player-check-"));

/** Runs `marey export` and parses its printed line: frame count and the `frames` hash. */
function exportFrames(scene, extra) {
  const out = join(scratch, "x.json");
  const r = spawnSync(process.execPath, ["bin/marey.mjs", "export", scene, "--format", "lottie", ...extra, "--out", out], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const text = `${r.stdout}${r.stderr}`.trim();
  const m = /\s(\d+) frames @ (\d+) fps\s.*\sframes ([0-9a-f]+)\s*$/m.exec(text);
  if (r.status !== 0 || !m) throw new Error(`marey export ${scene} ${extra.join(" ")}: exit ${r.status}\n${text}`);
  return { args: extra.join(" "), line: text, frames: Number(m[1]), fps: Number(m[2]), hash: m[3] };
}

/** Runs `marey check` on `source` and returns its first diagnostic's `line:col [CODE]`. */
function checkDiagnostic(source) {
  const file = join(scratch, "inline.marey");
  writeFileSync(file, source);
  const r = spawnSync(process.execPath, ["bin/marey.mjs", "check", file], { cwd: ROOT, encoding: "utf8" });
  const text = `${r.stdout}${r.stderr}`.trim();
  const m = /:(\d+):(\d+): (\[[A-Z_]+\])/.exec(text);
  if (!m) throw new Error(`marey check found no positioned diagnostic (exit ${r.status}):\n${text}`);
  return { line: Number(m[1]), col: Number(m[2]), code: m[3], output: text };
}

// --- static server --------------------------------------------------------------

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".marey": "text/plain; charset=utf-8",
  ".ttf": "font/ttf",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function startServer() {
  const server = createServer((req, res) => {
    let file;
    try {
      file = resolve(ROOT, `.${decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname)}`);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (!file.startsWith(ROOT + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    res
      .writeHead(200, { "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" })
      .end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

/** True when nothing accepts a connection on `port` any more. */
function portRefuses(port) {
  return new Promise((done) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      done(false);
    });
    socket.once("error", (e) => done(e.code === "ECONNREFUSED"));
  });
}

// --- pages ----------------------------------------------------------------------

let origin = "";

async function open(browser, phase, file, { reducedMotion = null, expectResourceErrors = null, before = null } = {}) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    const entry = { phase, text: m.text(), url: m.location()?.url ?? "" };
    if (m.type() === "error") {
      // A 404 or an aborted request that the check itself arranged is logged by
      // Chromium as a console error. Those are counted apart, by URL.
      if (expectResourceErrors && /^Failed to load resource/.test(entry.text) && expectResourceErrors.test(entry.url)) {
        consoleLog.expectedResourceErrors.push(entry);
      } else consoleLog.errors.push(entry);
    } else if (m.type() === "warning") consoleLog.warnings.push(entry);
  });
  page.on("pageerror", (e) => consoleLog.pageErrors.push({ phase, text: e.message }));
  page.on("request", (r) => network.push({ phase, path: new URL(r.url()).pathname, epochMs: Date.now() }));
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    const entry = [...network].reverse().find((n) => n.phase === phase && n.path === path && n.status === undefined);
    if (entry) entry.status = r.status();
  });
  page.on("requestfailed", (r) => {
    const path = new URL(r.url()).pathname;
    const entry = [...network].reverse().find((n) => n.phase === phase && n.path === path && n.status === undefined);
    if (entry) entry.status = `failed: ${r.failure()?.errorText ?? "?"}`;
  });
  if (reducedMotion) await page.emulateMedia({ reducedMotion });
  if (before) await before(page);
  await page.goto(`${origin}${PAGES}/${file}`);
  return { ctx, page };
}

const countEvents = (page, type) => page.evaluate((t) => window.__events.filter((e) => e.type === t).length, type);
async function waitEvents(page, type, n, timeout = 60000) {
  await page.waitForFunction(([t, k]) => window.__events.filter((e) => e.type === t).length >= k, [type, n], { timeout, polling: 50 });
}
const waitCanvas = (page, id, timeout = 30000) =>
  page.waitForFunction((i) => document.getElementById(i).shadowRoot.querySelector("canvas") !== null, id, { timeout, polling: 50 });

/**
 * The test hook, retried while the element is still mounting. Reads
 * `currentTime` and `paused` in the same task the hook resolved in.
 */
function hookHash(page, id, ticks) {
  return page.evaluate(
    async ({ id, ticks }) => {
      const el = document.getElementById(id);
      const deadline = performance.now() + 30000;
      for (;;) {
        try {
          const hash = await el[Symbol.for("marey.player.debug")].liveFramesHash(ticks);
          return { hash, currentTime: el.currentTime, paused: el.paused };
        } catch (e) {
          if (!(e instanceof Error && e.message === "not mounted") || performance.now() > deadline) throw e;
          await new Promise((r) => setTimeout(r, 50));
        }
      }
    },
    { id, ticks },
  );
}
const readState = (page, id) =>
  page.evaluate((i) => {
    const el = document.getElementById(i);
    return { currentTime: el.currentTime, paused: el.paused, duration: el.duration };
  }, id);

// --- 1: agreement ---------------------------------------------------------------

async function checkAgreement(browser, refs) {
  const req = "1 agreement";
  const { ctx, page } = await open(browser, "agreement", "agreement.html");
  await waitEvents(page, "ready", 3);
  report.measurements.agreement = [];
  for (const s of AGREEMENT_SCENES) {
    const ref = refs[s.id];
    const ticks = Array.from({ length: ref.frames }, (_, i) => i * TICKS_PER_FRAME);
    const last = ticks[ticks.length - 1];
    // A control first: the same count of ticks, each one later. A hook that
    // ignored its ticks, or a comparison that could not fail, would match here.
    const control = await hookHash(page, s.id, ticks.map((t) => t + 1));
    const live = await hookHash(page, s.id, ticks);
    report.measurements.agreement.push({ scene: s.path, kind: s.kind, frames: ref.frames, ticks: `0, 4, ..., ${last}`, live: live.hash, export: ref.hash, control: control.hash });
    record(req, `${s.kind}: liveFramesHash over ${ref.frames} ticks equals the export's frames hash`, live.hash === ref.hash,
      `live ${live.hash}, export ${ref.hash} (${s.path})`);
    record(req, `${s.kind}: the comparison can fail (ticks shifted by one hash differently)`, control.hash !== ref.hash,
      `shifted ${control.hash}`);
    // Carried finding: on an indefinite scene the hook clamps past reachedTick
    // while labelling the requested tick. These scenes are bounded, and this
    // confirms the playback really stands on the last tick it was asked for.
    record(req, `${s.kind}: after the hook the element stands on tick ${last}, paused`,
      live.currentTime === last / TICK_HZ && live.paused === true,
      `currentTime ${live.currentTime} (tick ${live.currentTime * TICK_HZ}), paused ${live.paused}`);
  }
  const font = network.filter((n) => n.phase === "agreement" && n.path.endsWith("/JetBrainsMono-Regular.ttf"));
  record(req, "the text scene loaded the scene font from the player build", font.length === 1 && font[0].status === 200,
    font.map((f) => `${f.path} ${f.status}`).join(", ") || "no font request");
  const events = await page.evaluate(() => window.__events.map((e) => `${e.id}:${e.type}`));
  record(req, "no player reported an error", !events.some((e) => e.endsWith(":error")), events.join(" "));
  await sleep(300);
  await page.screenshot({ path: resolve(outDir, "agreement.png"), animations: "disabled" });
  await ctx.close();
}

// --- 5: currentTime -------------------------------------------------------------

async function checkCurrentTime(browser, frame0) {
  const req = "5 currentTime";
  const { ctx, page } = await open(browser, "currentTime", "agreement.html");
  await waitEvents(page, "ready", 3);
  await waitCanvas(page, "bars");
  // Unmounted, an autoplay embed reads tick 0 and not paused; only a mounted,
  // playing one moves past 0.
  await page.waitForFunction(() => document.getElementById("bars").currentTime > 0, null, { timeout: 30000, polling: 20 });
  const set = await page.evaluate(async () => {
    const el = document.getElementById("bars");
    if (el.paused) el.play(); // ended already: play() starts it again from tick 0
    const pausedBefore = el.paused;
    const before = el.currentTime;
    el.currentTime = 1;
    const immediate = el.currentTime;
    await new Promise((r) => setTimeout(r, 300));
    return { pausedBefore, before, immediate, later: { paused: el.paused, currentTime: el.currentTime } };
  });
  report.measurements.currentTime = { set };
  record(req, "on a playing embed, currentTime = 1 reads back 1 straight after the set",
    set.pausedBefore === false && set.immediate === 1,
    `playing before: ${!set.pausedBefore} at ${set.before.toFixed(3)} s; read straight after the set: ${set.immediate}`);
  record(req, "300 ms later it is still playing, from the new time",
    set.later.paused === false && set.later.currentTime > 1,
    `paused ${set.later.paused}, currentTime ${set.later.currentTime.toFixed(3)} s`);

  const zero = await page.evaluate(() => {
    const el = document.getElementById("bars");
    const before = el.currentTime;
    el.currentTime = 0;
    const afterSet = el.currentTime;
    el.pause();
    return { before, afterSet, afterPause: el.currentTime, paused: el.paused };
  });
  await sleep(200);
  const settled = await readState(page, "bars");
  const live = await hookHash(page, "bars", [0]);
  report.measurements.currentTime.zero = { zero, settled, live: live.hash, export: frame0.hash };
  record(req, "currentTime = 0 on a playing embed reads back 0 straight after the set", zero.afterSet === 0,
    `from ${zero.before.toFixed(3)} s; read straight after the set: ${zero.afterSet}`);
  // Spec §3.3: the getter returns the new time immediately. A pause() in the
  // same task, before the seek is performed on the next frame, must not undo that.
  record(req, "pause() straight after that set leaves the getter at 0 (spec §3.3)", zero.afterPause === 0,
    `read straight after pause(): ${zero.afterPause}`);
  record(req, "200 ms later it stands on tick 0, paused", settled.currentTime === 0 && settled.paused === true,
    `currentTime ${settled.currentTime}, paused ${settled.paused}`);
  record(req, "liveFramesHash([0]) equals the CLI's frame-0 hash", live.hash === frame0.hash,
    `live ${live.hash}, export ${frame0.hash} (${frame0.args}, ${frame0.frames} frame)`);

  // Spec §3.3 follows <video>: on a paused embed, a set and then play() plays
  // from the new time.
  const resume = await page.evaluate(async () => {
    const el = document.getElementById("bars");
    const pausedBefore = el.paused;
    el.currentTime = 0.5;
    const afterSet = el.currentTime;
    el.play();
    const afterPlay = { currentTime: el.currentTime, paused: el.paused };
    await new Promise((r) => setTimeout(r, 300));
    return { pausedBefore, afterSet, afterPlay, later: { paused: el.paused, currentTime: el.currentTime } };
  });
  report.measurements.currentTime.resume = resume;
  record(req, "on a paused embed, currentTime = 0.5 then play() is playing from 0.5 300 ms later (spec §3.3)",
    resume.pausedBefore === true && resume.afterSet === 0.5 && resume.later.paused === false && resume.later.currentTime > 0.5,
    `read after the set ${resume.afterSet}; after play(): ${resume.afterPlay.currentTime}, paused ${resume.afterPlay.paused}; ` +
      `300 ms later: ${resume.later.currentTime.toFixed(3)} s, paused ${resume.later.paused}`);
  await ctx.close();
}

// --- 3: reduced motion ----------------------------------------------------------

async function checkReducedMotion(browser) {
  const req = "3 reduced motion";
  const { ctx, page } = await open(browser, "reducedMotion", "agreement.html", { reducedMotion: "reduce" });
  const media = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  await waitEvents(page, "ready", 3);
  const atReady = await readState(page, "bars");
  await waitCanvas(page, "bars");
  await sleep(500);
  const mounted = await readState(page, "bars");
  const others = { pile: await readState(page, "pile"), text: await readState(page, "text") };
  report.measurements.reducedMotion = { media, atReady, mounted, others };
  record(req, "prefers-reduced-motion: reduce matches in the page", media === true);
  record(req, "autoplay bars player: paused, currentTime === duration once ready",
    atReady.paused === true && atReady.currentTime === atReady.duration,
    `paused ${atReady.paused}, currentTime ${atReady.currentTime}, duration ${atReady.duration}`);
  record(req, "still paused on its last tick 500 ms after mounting",
    mounted.paused === true && mounted.currentTime === mounted.duration,
    `paused ${mounted.paused}, currentTime ${mounted.currentTime}, duration ${mounted.duration}; ` +
      `pile ${others.pile.currentTime}/${others.pile.duration} paused ${others.pile.paused}, text ${others.text.currentTime}/${others.text.duration} paused ${others.text.paused}`);
  await ctx.close();
}

// --- 4: errors ------------------------------------------------------------------

async function checkErrors(browser) {
  const req = "4 errors";
  let fontAborts = 0;
  const { ctx, page } = await open(browser, "errors", "errors.html", {
    expectResourceErrors: /\/missing\.marey$|\/JetBrainsMono-Regular\.ttf$/,
    before: (p) =>
      p.route("**/JetBrainsMono-Regular.ttf", (r) => {
        fontAborts++;
        return r.abort();
      }),
  });
  await waitEvents(page, "error", 4, 30000);
  await sleep(300);
  const seen = await page.evaluate(() =>
    [...document.querySelectorAll("marey-player")].map((el) => {
      const diag = el.shadowRoot.querySelector(".diagnostics");
      return {
        id: el.id,
        events: window.__events.filter((e) => e.id === el.id).map((e) => ({ type: e.type, code: e.detail?.code ?? null, errors: e.detail?.errors?.length ?? null })),
        errorsProperty: el.errors.length,
        diagnostics: diag.textContent,
        diagnosticsLines: [...diag.children].map((c) => c.textContent),
        diagnosticsShown: !diag.hidden,
        role: diag.getAttribute("role"),
        canvas: el.shadowRoot.querySelector("canvas") !== null,
      };
    }),
  );
  const inline = await page.evaluate(() => document.querySelector('#compile > script[type="text/marey"]').textContent);
  const cli = checkDiagnostic(inline);
  report.measurements.errors = { players: seen, fontAborts, cliDiagnostic: cli };
  const by = Object.fromEntries(seen.map((s) => [s.id, s]));
  const codes = (s) => s.events.filter((e) => e.type === "error").map((e) => e.code);

  const c = by.compile;
  const expectedLine = `${cli.line}:${cli.col} ${cli.code}`;
  record(req, "type error: error event PLAYER_COMPILE_FAILED, with the compiler's diagnostics",
    codes(c).join() === "PLAYER_COMPILE_FAILED" && c.events[0].errors >= 1 && c.errorsProperty >= 1,
    `events ${JSON.stringify(c.events)}, el.errors ${c.errorsProperty}`);
  record(req, "type error: the diagnostic box shows the [TYPE_ code at the line and column marey check reports",
    c.diagnosticsShown && c.role === "alert" && c.diagnostics.includes("[TYPE_") && c.diagnosticsLines.some((l) => l.startsWith(expectedLine)),
    `marey check: "${expectedLine}"; box: ${JSON.stringify(c.diagnosticsLines)}`);
  const f = by.fetch;
  record(req, "404 src: error event PLAYER_FETCH_FAILED, the box names the status",
    codes(f).join() === "PLAYER_FETCH_FAILED" && f.diagnosticsShown && /404/.test(f.diagnostics) && /missing\.marey/.test(f.diagnostics),
    `events ${JSON.stringify(f.events)}; box: ${JSON.stringify(f.diagnosticsLines)}`);
  const t = by.font;
  record(req, "text scene with its font request aborted: error event PLAYER_FONT_UNAVAILABLE, no canvas",
    codes(t).join() === "PLAYER_FONT_UNAVAILABLE" && fontAborts >= 1 && !t.canvas && t.diagnosticsShown,
    `events ${JSON.stringify(t.events)}; font requests aborted: ${fontAborts}; box: ${JSON.stringify(t.diagnosticsLines)}`);
  const n = by.none;
  record(req, "no source: error event PLAYER_NO_SOURCE",
    codes(n).join() === "PLAYER_NO_SOURCE" && n.diagnosticsShown,
    `events ${JSON.stringify(n.events)}; box: ${JSON.stringify(n.diagnosticsLines)}`);
  await ctx.close();
}

// --- 2: context budget and far players ------------------------------------------

/** Every player's place relative to the viewport, and its canvas if it has one. */
const layout = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("marey-player")].map((el) => {
      const r = el.getBoundingClientRect();
      const canvas = el.shadowRoot.querySelector("canvas");
      let lost = null;
      if (canvas) {
        // Returns the context Pixi already made (WebGL 2), or null; never a new one.
        const gl = canvas.getContext("webgl2");
        lost = gl ? gl.isContextLost() : null;
      }
      return {
        id: el.id,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        pageTop: Math.round(r.top + scrollY),
        canvas: canvas ? canvas.dataset.serial ?? "?" : null,
        canvasCount: el.shadowRoot.querySelectorAll("canvas").length,
        lost,
        inView: r.bottom > 0 && r.top < innerHeight,
      };
    }),
  );

/** Share of a player's pixels that are the page's magenta, and that are its scene's background. */
async function pixelShares(ctx, png, rects) {
  const probe = await ctx.newPage();
  try {
    return await probe.evaluate(
      async ({ b64, rects, magenta }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        const near = (d, i, rgb) => Math.abs(d[i] - rgb[0]) <= 2 && Math.abs(d[i + 1] - rgb[1]) <= 2 && Math.abs(d[i + 2] - rgb[2]) <= 2;
        return rects.map(({ id, x, y, w, h, bg }) => {
          const d = g.getImageData(x, y, w, h).data;
          let m = 0;
          let b = 0;
          const colours = new Set();
          for (let i = 0; i < d.length; i += 4) {
            if (near(d, i, magenta)) m++;
            if (near(d, i, bg)) b++;
            colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
          }
          const px = d.length / 4;
          return { id, pixels: px, magentaShare: m / px, backgroundShare: b / px, distinctColours: colours.size };
        });
      },
      { b64: png.toString("base64"), rects, magenta: MAGENTA },
    );
  } finally {
    await probe.close();
  }
}

async function scrollInSteps(page, from, to, samples) {
  const step = to > from ? 400 : -400;
  for (let y = from + step; step > 0 ? y < to + step : y > to + step; y += step) {
    const target = step > 0 ? Math.min(y, to) : Math.max(y, to);
    await page.evaluate((v) => window.scrollTo(0, v), target);
    await sleep(150);
    const l = await layout(page);
    const holding = l.filter((p) => p.canvas !== null);
    // The element's root margin is 200 px; one more step of slack covers an
    // observer entry still queued at the moment of sampling.
    const outside = holding.filter((p) => p.bottom <= -600 || p.top >= VIEWPORT.height + 600);
    samples.push({
      scrollY: await page.evaluate(() => scrollY),
      live: holding.length,
      canvases: l.reduce((n, p) => n + p.canvasCount, 0),
      holders: holding.map((p) => p.id),
      outsideBand: outside.map((p) => p.id),
    });
  }
}

async function checkMany(browser) {
  const req = "2 context budget";
  const { ctx, page } = await open(browser, "many", "many.html");
  await waitEvents(page, "ready", 24);
  await waitCanvas(page, "p0");
  await sleep(1000);

  // At load.
  const atLoad = await layout(page);
  const readyIds = await page.evaluate(() => [...new Set(window.__events.filter((e) => e.type === "ready").map((e) => e.id))]);
  const errorEvents = await page.evaluate(() => window.__events.filter((e) => e.type === "error"));
  record(req, "every player fired ready, none fired error", readyIds.length === 24 && errorEvents.length === 0,
    `${readyIds.length} distinct ready, ${errorEvents.length} error`);
  const far = atLoad.filter((p) => p.pageTop >= 2 * VIEWPORT.height);
  const farWithCanvas = far.filter((p) => p.canvasCount > 0);
  const holdersAtLoad = atLoad.filter((p) => p.canvasCount > 0).map((p) => `${p.id}@${p.pageTop}`);
  record(req, "at load, players more than two screens down hold no canvas",
    far.length > 0 && farWithCanvas.length === 0,
    `${far.length} far players (top >= ${2 * VIEWPORT.height} px), ${farWithCanvas.length} with a canvas; canvases at load: ${holdersAtLoad.join(", ")}`);
  const first = await page.evaluate(() => window.__firstIntersection);
  const loadRequests = network.filter((n) => n.phase === "many");
  const renderRequests = loadRequests.filter((n) => /\/render-[^/]+\.mjs$/.test(n.path));
  const t0 = loadRequests[0]?.epochMs ?? 0;
  report.measurements.many = {
    firstIntersection: first,
    requestOrder: loadRequests.map((n) => ({ path: n.path, status: n.status, ms: n.epochMs - t0 })),
    atLoad,
  };
  record(req, "no render-*.mjs request before the first player came near view",
    first !== null && renderRequests.length >= 1 && renderRequests.every((r) => r.epochMs >= first.epochMs),
    `first near view: ${first?.id} at +${first ? Math.round(first.epochMs - t0) : "?"} ms; render chunk requested at ` +
      `${renderRequests.map((r) => `+${r.epochMs - t0} ms`).join(", ") || "never"}; ${renderRequests.length} request(s)`);

  // Player 0, paused at tick 200 mid-physics.
  await page.evaluate((s) => {
    const el = document.getElementById("p0");
    el.currentTime = s;
    el.pause();
  }, P0_TICK / TICK_HZ);
  await sleep(300);
  const left = await hookHash(page, "p0", [P0_TICK]);
  const p0Before = (await layout(page)).find((p) => p.id === "p0");
  record(req, `player 0 paused on tick ${P0_TICK} before it leaves view`,
    left.currentTime === P0_TICK / TICK_HZ && left.paused === true,
    `currentTime ${left.currentTime}, paused ${left.paused}, liveFramesHash([${P0_TICK}]) ${left.hash}, canvas #${p0Before.canvas}`);

  // Down in 400 px steps.
  const maxY = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
  const down = [];
  await scrollInSteps(page, 0, maxY, down);
  await page
    .waitForFunction(
      () => [...document.querySelectorAll("marey-player")].every((el) => {
        const r = el.getBoundingClientRect();
        return !(r.bottom > 0 && r.top < innerHeight) || el.shadowRoot.querySelector("canvas") !== null;
      }),
      null,
      { timeout: 20000, polling: 50 },
    )
    .catch(() => {}); // a player still without a canvas fails the check below, with its id
  await sleep(1000);
  const bottom = await layout(page);
  const shot = await page.screenshot({ path: resolve(outDir, "many-bottom.png"), animations: "disabled" });
  const inView = bottom.filter((p) => p.inView);
  const rects = inView.map((p) => {
    const i = Number(p.id.slice(1));
    const y = Math.max(0, p.top);
    return { id: p.id, x: 0, y, w: Math.floor((400 * 4) / 3), h: Math.min(VIEWPORT.height, p.bottom) - y, bg: SCENE_BACKGROUND[i % 2 === 0 ? "pile" : "bars"] };
  });
  const shares = await pixelShares(ctx, shot, rects);
  const lostEvents = await page.evaluate(() => window.__contextLost);
  const canvasLog = await page.evaluate(() => window.__canvases);
  const p0Bottom = bottom.find((p) => p.id === "p0");
  report.measurements.many.down = down;
  report.measurements.many.bottom = { scrollY: maxY, layout: bottom.filter((p) => p.canvasCount > 0 || p.inView), pixels: shares };

  record(req, "at the bottom, every player in view has a canvas whose context is not lost",
    inView.length > 0 && inView.every((p) => p.canvas !== null && p.lost === false),
    inView.map((p) => `${p.id} canvas #${p.canvas} lost ${p.lost}`).join(", "));
  record(req, "at the bottom, every player in view draws (scene background, no page magenta)",
    shares.length === inView.length && shares.every((s) => s.magentaShare < 0.02 && s.backgroundShare > 0.2),
    shares.map((s) => `${s.id}: magenta ${(s.magentaShare * 100).toFixed(2)}%, background ${(s.backgroundShare * 100).toFixed(1)}%, ${s.distinctColours} colours`).join("; "));
  const lostInView = lostEvents.filter((e) => e.playerInView);
  const currentSerials = new Set(inView.map((p) => p.canvas));
  const lostOnCurrent = lostEvents.filter((e) => currentSerials.has(e.serial));
  record(req, "webglcontextlost never fired on a player in view",
    lostInView.length === 0 && lostOnCurrent.length === 0,
    `${lostEvents.length} context-lost event(s) in all, on players out of view at the time: ${lostEvents.filter((e) => !e.playerInView).length}; ` +
      `in view: ${lostInView.length}; on a canvas in view at the bottom: ${lostOnCurrent.length}`);
  const maxLive = Math.max(...down.map((s) => s.canvases));
  const outside = down.filter((s) => s.outsideBand.length > 0);
  record(req, "player 0 released its canvas once far out of view, and no player far from view held one",
    p0Bottom.canvasCount === 0 && outside.length === 0 && maxLive <= 16,
    `player 0 canvases at the bottom: ${p0Bottom.canvasCount}; most canvases at once while scrolling down: ${maxLive}; ` +
      `samples with a canvas outside the band: ${outside.length}${outside.length ? ` (${JSON.stringify(outside.slice(0, 3))})` : ""}; ` +
      `${canvasLog.length} canvases created`);

  // Back up, in the same steps.
  const up = [];
  await scrollInSteps(page, maxY, 0, up);
  await waitCanvas(page, "p0");
  await sleep(500);
  const returned = await readState(page, "p0");
  const back = await hookHash(page, "p0", [P0_TICK]);
  const p0After = (await layout(page)).find((p) => p.id === "p0");
  const end = await page.evaluate(() => ({ lost: window.__contextLost, created: window.__canvases.length }));
  const liveAtEnd = (await layout(page)).reduce((n, p) => n + p.canvasCount, 0);
  report.measurements.many.up = up;
  report.measurements.many.p0 = { left, returned, back, canvasBefore: p0Before.canvas, canvasAfter: p0After.canvas };
  report.measurements.many.contexts = {
    created: end.created,
    liveAtEnd,
    released: end.created - liveAtEnd,
    contextLostEvents: end.lost.length,
    contextLostInView: end.lost.filter((e) => e.playerInView).length,
  };
  report.measurements.many.contextLost = end.lost;
  console.log(`contexts: ${end.created} created, ${liveAtEnd} live at the end, ${end.lost.length} webglcontextlost events`);
  // render.ts leaves the context loss to PixiJS's own destroy; this event on
  // every canvas the page let go of is the proof that it happened.
  const released = end.created - liveAtEnd;
  record(req, "every released canvas fired webglcontextlost",
    released > 0 && end.lost.length === released,
    `${end.created} created, ${liveAtEnd} live at the end, ${released} released, ${end.lost.length} webglcontextlost events`);
  record(req, `player 0 came back on a new canvas, still paused on tick ${P0_TICK}`,
    p0After.canvas !== p0Before.canvas && returned.paused === true && returned.currentTime === P0_TICK / TICK_HZ,
    `canvas #${p0Before.canvas} -> #${p0After.canvas}; currentTime ${returned.currentTime}, paused ${returned.paused}`);
  record(req, `player 0's liveFramesHash([${P0_TICK}]) after the round trip equals the one before`,
    back.hash === left.hash, `before ${left.hash}, after ${back.hash}`);
  const maxUp = Math.max(...up.map((s) => s.canvases));
  record(req, "scrolling back up, no player far from view held a canvas",
    up.every((s) => s.outsideBand.length === 0) && maxUp <= 16,
    `most canvases at once: ${maxUp}; samples with a canvas outside the band: ${up.filter((s) => s.outsideBand.length > 0).length}`);
  await ctx.close();
}

// --- run ------------------------------------------------------------------------

const wants = (name) => only.includes(name);
const needsCli = wants("agreement") || wants("currentTime") || wants("errors");
npmRun("build:player");
if (needsCli) {
  npmRun("build:export-page");
  npmRun("build:cli");
}
const refs = {};
if (wants("agreement")) {
  for (const s of AGREEMENT_SCENES) refs[s.id] = exportFrames(s.path, ["--fps", String(FPS)]);
}
const frame0 = wants("currentTime") ? exportFrames("docs/media/bars-reveal.marey", ["--duration", "0.25", "--fps", "4"]) : null;
report.references = { ...refs, ...(frame0 ? { barsFrame0: frame0 } : {}) };
for (const [k, v] of Object.entries(report.references)) console.log(`reference ${k}: ${v.frames} frames, frames ${v.hash}  (${v.args})`);
if (frame0 && frame0.frames !== 1) throw new Error(`the frame-0 reference export wrote ${frame0.frames} frames, not 1`);

const server = await startServer();
const port = server.address().port;
origin = `http://127.0.0.1:${port}`;
console.log(`serving ${ROOT} at ${origin}`);
let browser;
try {
  browser = await chromium.launch({ headless: !headed, args: LAUNCH_ARGS });
  const steps = [
    ["agreement", () => checkAgreement(browser, refs)],
    ["currentTime", () => checkCurrentTime(browser, frame0)],
    ["reducedMotion", () => checkReducedMotion(browser)],
    ["errors", () => checkErrors(browser)],
    ["many", () => checkMany(browser)],
  ];
  for (const [name, fn] of steps) {
    if (!wants(name)) continue;
    try {
      await fn();
    } catch (e) {
      record(name, "check ran to completion", false, String(e?.message ?? e).split("\n")[0]);
    }
  }
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  rmSync(scratch, { recursive: true, force: true });
}
const closed = await portRefuses(port);
console.log(`server on port ${port} closed: ${closed}`);
record("server", `the static server on port ${port} is closed`, closed);

record("page", "no page errors and no unexpected console errors",
  consoleLog.pageErrors.length === 0 && consoleLog.errors.length === 0,
  [...consoleLog.pageErrors, ...consoleLog.errors].map((e) => `[${e.phase}] ${e.text}`).join(" | ").slice(0, 600));
const webglWarnings = consoleLog.warnings.filter((w) => w.text.startsWith("WebGL:"));
record("page", "no WebGL: console warnings", webglWarnings.length === 0,
  webglWarnings.length ? `${webglWarnings.length} x, first: ${webglWarnings[0].text}` : "0");
const warningCounts = {};
for (const w of consoleLog.warnings) warningCounts[`[${w.phase}] ${w.text}`] = (warningCounts[`[${w.phase}] ${w.text}`] ?? 0) + 1;
console.log(`console warnings: ${consoleLog.warnings.length}${consoleLog.warnings.length ? "" : " (none)"}`);
for (const [text, n] of Object.entries(warningCounts)) console.log(`  ${n} x ${text}`);
console.log(`expected resource errors: ${consoleLog.expectedResourceErrors.length}`);

const requirements = {};
for (const r of results) {
  requirements[r.requirement] ??= { pass: true, checks: [] };
  requirements[r.requirement].checks.push(r);
  if (!r.pass) requirements[r.requirement].pass = false;
}
const failed = results.filter((r) => !r.pass);
writeFileSync(
  resolve(outDir, "report.json"),
  JSON.stringify({ server: { port, closed }, only, requirements, ...report, console: { ...consoleLog, warningCounts }, network }, null, 2),
);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; report in ${outDir}`);
process.exit(failed.length ? 1 : 0);
