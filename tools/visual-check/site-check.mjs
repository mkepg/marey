/**
 * Browser check of the documentation site (Phase 9C spec §6.4) against a
 * production build served by `vite preview`:
 *
 *   npm run build
 *   npx vite preview --port 5199 --strictPort      # leave this running
 *   node tools/visual-check/site-check.mjs --out .visual-check/site
 *
 * Requirements, each a named check in report.json:
 *
 *   pages     every page in the sitemap, and /404.html: no console error, page
 *             error, failed request or error status. Each page is scrolled top
 *             to bottom with every solution opened and every Run pressed, and
 *             every player slot must reach `ready` (any `error` fails). Slots
 *             the pool kept waiting are then scrolled to one by one. Pooled
 *             players never exceed 12 (a lesson's embedded scene is counted
 *             apart: it is outside the pool).
 *   editor    on a lesson, typing into a live sample re-runs its player, an
 *             error shows in the list with its line and dims the player, and
 *             Reset restores the text and the player.
 *   search    `/` opens search, Escape closes it, Ctrl+K reopens it, a typed
 *             query lists results, the arrow keys move the selection, and
 *             Enter opens the first result.
 *   mobile    at 390 px no page scrolls sideways, and at 360 px no lesson or
 *             guide does.
 *   budget    the JavaScript each page loads before any player mounts (the
 *             player's renderer chunk is held, never served), gzipped, is
 *             under 90 kB.
 *   text      a lesson sample with `text` reaches `ready`, and the scene font
 *             is served from the build with a 200 (spec C21).
 *   pool      /gallery/ at 1280x2400, scrolled top to bottom and then jumped
 *             up and down: at most 12 players are ever in the page (C20).
 *   controls  a playing player's control bar fades out with the pointer away
 *             and nothing in it focused, shows on hover, on focus and while
 *             paused, and always on a screen that cannot hover.
 *   nojs      with JavaScript off, the course, a lesson and the gallery still
 *             render, with navigation and no search field.
 *   shots     a screenshot of every gallery scene and every lesson showcase
 *             at its poster time (the entry's `poster`, else its last
 *             moment), seeked exactly after one throwaway seek so the first
 *             capture is never an unpainted canvas.
 *
 * Flags: --url <origin> (default http://localhost:5199), --out <dir>
 * (default .visual-check/site), --only <list of the names above>,
 * --pages <comma-separated paths> (limits `pages` and `mobile`), --headed,
 * --gpu (launch without forcing SwiftShader, to record console output on a
 * GPU-backed context). Writes report.json and the screenshots to --out, and
 * exits 1 if any requirement failed.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ORIGIN = arg("url", "http://localhost:5199").replace(/\/$/, "");
const outDir = resolve(arg("out", ".visual-check/site"));
const headed = process.argv.includes("--headed");
const gpu = process.argv.includes("--gpu");
const ALL = ["pages", "editor", "search", "mobile", "budget", "text", "pool", "controls", "nojs", "shots"];
const only = (arg("only") ?? ALL.join(",")).split(",");
for (const name of only) if (!ALL.includes(name)) throw new Error(`--only: unknown check "${name}"; one of ${ALL.join(", ")}`);
const pagesFilter = arg("pages")?.split(",") ?? null;
mkdirSync(outDir, { recursive: true });

/** Headless Chromium has no GPU; without SwiftShader PixiJS cannot start. */
const SWIFTSHADER = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"];
const DESKTOP = { width: 1280, height: 900 };
/** `PLAYER_LIMIT` in site/client/pool.ts. */
const PLAYER_LIMIT = 12;
/** The spec §6.1 budget, gzipped bytes. */
const BUDGET = 90 * 1024;
const READY_TIMEOUT = 60_000;
const SITE_ORIGIN = "https://marey.pages.dev";

const report = { origin: ORIGIN, startedAt: new Date().toISOString(), launch: gpu ? "gpu" : "swiftshader", checks: {}, failures: [] };
const fail = (check, message) => {
  report.failures.push(`${check}: ${message}`);
  console.log(`FAIL ${check}: ${message}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The site's own data, read from the repository the build came from. */
const siteJson = JSON.parse(readFileSync(join(ROOT, "site/site.json"), "utf8"));
function frontMatter(file) {
  const text = readFileSync(file, "utf8");
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const data = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (m) data[m[1]] = m[2];
  }
  return data;
}
const gallery = siteJson.gallery.map((id) => {
  const fm = frontMatter(join(ROOT, "site/gallery", `${id}.md`));
  return { id, poster: fm.poster === undefined ? null : Number(fm.poster), lesson: fm.lesson ?? null };
});
const lessons = siteJson.learn.map((l) => {
  const fm = frontMatter(join(ROOT, "site/content/learn", `${l.slug}.md`));
  return { slug: l.slug, showcase: fm.showcase ?? null, embed: fm.embed ?? null };
});
const posterOf = (id) => gallery.find((g) => g.id === id)?.poster ?? null;

/**
 * Runs in every page before its own scripts. It marks each player's slot (a
 * `.sample-stage`, or the player itself when it sits in the page directly, as
 * a lesson's embedded scene does) when the player fires `ready` or `error`,
 * which do not bubble, and keeps the most players ever connected at once,
 * recounted on every append and removal.
 */
function instrument() {
  const state = { errors: [], ready: 0, maxLive: 0, maxPooled: 0 };
  window.__siteCheck = state;
  const slotOf = (player) => (player.parentElement?.classList.contains("sample-stage") ? player.parentElement : player);
  const dispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (event) {
    if (this instanceof HTMLElement && this.localName === "marey-player" && (event.type === "ready" || event.type === "error")) {
      const slot = slotOf(this);
      if (event.type === "ready") {
        state.ready++;
        slot.dataset.checkReady = String(Number(slot.dataset.checkReady ?? 0) + 1);
      } else {
        slot.dataset.checkError = event.detail?.code ?? "unknown";
        state.errors.push({
          code: event.detail?.code ?? null,
          errors: (event.detail?.errors ?? []).map((e) => `${e.line ?? ""}:${e.col ?? ""} ${e.message}`),
          where: slot.closest("figure, li, .gallery-stage, .hero-stage")?.className ?? slot.className,
        });
      }
    }
    return dispatch.call(this, event);
  };
  const count = () => {
    const all = document.querySelectorAll("marey-player");
    let pooled = 0;
    for (const p of all) if (!p.closest(".lesson-embed")) pooled++;
    if (all.length > state.maxLive) state.maxLive = all.length;
    if (pooled > state.maxPooled) state.maxPooled = pooled;
  };
  for (const name of ["append", "appendChild", "insertBefore", "replaceWith", "remove"]) {
    const proto = name === "appendChild" || name === "insertBefore" ? Node.prototype : Element.prototype;
    const original = proto[name];
    proto[name] = function (...args) {
      const out = original.apply(this, args);
      count();
      return out;
    };
  }
  new MutationObserver(count).observe(document, { childList: true, subtree: true });
}

const browser = await chromium.launch({ headless: !headed, args: gpu ? [] : SWIFTSHADER });

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: DESKTOP, ...options });
  if (options.javaScriptEnabled !== false) await context.addInitScript(instrument);
  const page = await context.newPage();
  const log = { consoleErrors: [], warnings: [], pageErrors: [], failedRequests: [], badResponses: [] };
  page.on("console", (m) => {
    if (m.type() === "error") log.consoleErrors.push(m.text());
    else if (m.type() === "warning") log.warnings.push(m.text());
  });
  page.on("pageerror", (e) => log.pageErrors.push(e.message));
  page.on("requestfailed", (r) => log.failedRequests.push(`${r.url()} ${r.failure()?.errorText ?? ""}`));
  page.on("response", (r) => {
    if (r.status() >= 400) log.badResponses.push(`${r.status()} ${r.url()}`);
  });
  return { context, page, log };
}

/** Problems a page logged, as failure messages. */
function logProblems(log) {
  return [
    ...log.consoleErrors.map((e) => `console error: ${e}`),
    ...log.pageErrors.map((e) => `page error: ${e}`),
    ...log.failedRequests.map((e) => `failed request: ${e}`),
    ...log.badResponses.map((e) => `error status: ${e}`),
  ];
}

/** Waits until every sample on the page has been given its controls (samples.ts runs after a dynamic import). */
async function waitForEnhanced(page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('figure.sample:not([data-mode="solution"])')].every((f) => f.dataset.enhanced === "true"),
    null,
    { timeout: 30_000 },
  );
}

async function sitemapPaths() {
  const res = await fetch(`${ORIGIN}/sitemap.xml`);
  if (!res.ok) throw new Error(`${ORIGIN}/sitemap.xml answered ${res.status}: is vite preview running on that port?`);
  const xml = await res.text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE_ORIGIN, ""));
  // A production build links hashed assets; the dev server links the source.
  const learn = await (await fetch(`${ORIGIN}/learn/`)).text();
  if (!/\/assets\/main-[\w-]+\.js/.test(learn)) {
    throw new Error(`${ORIGIN}/learn/ is not a production build (no hashed main chunk). Run npm run build and npx vite preview --port 5199 --strictPort.`);
  }
  return paths;
}

// ─── pages ──────────────────────────────────────────────────────────────────

async function checkPage(path) {
  const { context, page, log } = await newPage();
  const result = { path, slots: 0, ready: 0, readyEvents: 0, kinds: {}, maxPooled: 0, maxLive: 0, embeds: 0, problems: [] };
  try {
    const response = await page.goto(ORIGIN + path, { waitUntil: "load" });
    result.status = response?.status() ?? null;
    if (path === "/") {
      // The playground has no docs players; give its editor time to load.
      await page.waitForTimeout(4000);
    } else {
      await waitForEnhanced(page);
      await page.evaluate(() => {
        for (const d of document.querySelectorAll("details.solution")) d.open = true;
        for (const f of document.querySelectorAll('figure.sample[data-mode="run"]')) {
          [...f.querySelectorAll(".sample-toolbar button")].find((b) => b.textContent === "Run")?.click();
        }
      });
      await page.waitForTimeout(300);
      const slots = await page.evaluate(() => {
        const kind = (el) => {
          const fig = el.closest("figure.sample");
          if (fig) return `sample:${fig.dataset.mode}`;
          if (el.closest("li.gallery-card")) return "gallery-card";
          if (el.closest("li.lesson-card")) return "lesson-card";
          if (el.closest(".gallery-stage")) return "gallery-stage";
          if (el.closest(".hero-stage")) return "hero";
          if (el.closest(".lesson-embed")) return "embed";
          return "other";
        };
        const list = [
          ...[...document.querySelectorAll(".sample-stage")].filter((s) => !s.hidden && !s.closest("[hidden]")),
          ...document.querySelectorAll(".lesson-embed > marey-player"),
        ];
        return list.map((el, i) => {
          el.dataset.checkId = String(i);
          return kind(el);
        });
      });
      result.slots = slots.length;
      for (const k of slots) result.kinds[k] = (result.kinds[k] ?? 0) + 1;
      result.embeds = result.kinds.embed ?? 0;

      const unsettled = () =>
        page.evaluate(() =>
          [...document.querySelectorAll("[data-check-id]")]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.bottom > 0 && r.top < innerHeight && !el.dataset.checkReady && !el.dataset.checkError;
            })
            .map((el) => el.dataset.checkId),
        );
      const waitInView = async (limit) => {
        const deadline = Date.now() + limit;
        for (;;) {
          const left = await unsettled();
          if (left.length === 0 || Date.now() > deadline) return left;
          await page.waitForTimeout(250);
        }
      };

      // Top to bottom, half a screen at a time. A slot in view may wait for a
      // place in the pool, so a short wait here and a second pass below.
      for (let y = 0; ; y += DESKTOP.height / 2) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(150);
        await waitInView(15_000);
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        if (y + DESKTOP.height >= height) break;
      }
      // Every slot still waiting, on its own. The pool removes a player only
      // once its slot is over 1,200 px from the viewport, so twelve players
      // near a slot can keep it waiting however long it is in view. Jumping
      // to the far end of the page first frees their places.
      const waiting = await page.evaluate(() =>
        [...document.querySelectorAll("[data-check-id]")].filter((el) => !el.dataset.checkReady && !el.dataset.checkError).map((el) => el.dataset.checkId),
      );
      result.waitedAfterFirstPass = waiting.length;
      for (const id of waiting) {
        await page.evaluate((i) => {
          const el = document.querySelector(`[data-check-id="${i}"]`);
          if (!el) return;
          const top = el.getBoundingClientRect().top + window.scrollY;
          const height = document.documentElement.scrollHeight;
          window.scrollTo(0, top > height / 2 ? 0 : height);
        }, id);
        await page.waitForTimeout(600);
        await page.evaluate((i) => document.querySelector(`[data-check-id="${i}"]`)?.scrollIntoView({ block: "center" }), id);
        const deadline = Date.now() + READY_TIMEOUT;
        for (;;) {
          const settled = await page.evaluate((i) => {
            const el = document.querySelector(`[data-check-id="${i}"]`);
            return !el || !!el.dataset.checkReady || !!el.dataset.checkError;
          }, id);
          if (settled || Date.now() > deadline) break;
          await page.waitForTimeout(250);
        }
      }
      const final = await page.evaluate(() => {
        const els = [...document.querySelectorAll("[data-check-id]")];
        return {
          ready: els.filter((el) => el.dataset.checkReady).length,
          never: els.filter((el) => !el.dataset.checkReady && !el.dataset.checkError).map((el) => el.closest("figure, li, .gallery-stage, .hero-stage")?.className ?? el.className),
          state: window.__siteCheck,
        };
      });
      result.ready = final.ready;
      result.readyEvents = final.state.ready;
      result.maxPooled = final.state.maxPooled;
      result.maxLive = final.state.maxLive;
      for (const e of final.state.errors) result.problems.push(`player error ${e.code} in ${e.where}: ${e.errors.join(" | ")}`);
      for (const n of final.never) result.problems.push(`a player slot never reached ready: ${n}`);
      if (final.state.maxPooled > PLAYER_LIMIT) result.problems.push(`${final.state.maxPooled} pooled players were connected at once`);
    }
    if (result.status !== 200) result.problems.push(`status ${result.status}`);
    result.problems.push(...logProblems(log));
    result.warnings = [...new Set(log.warnings)];
  } catch (e) {
    result.problems.push(`exception: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await context.close();
  }
  return result;
}

async function checkPages(paths) {
  const results = [];
  for (const path of paths) {
    const t0 = Date.now();
    const r = await checkPage(path);
    r.ms = Date.now() - t0;
    results.push(r);
    console.log(`pages ${path}: ${r.ready}/${r.slots} ready, pooled max ${r.maxPooled}${r.embeds ? ` + ${r.embeds} embed` : ""}, ${r.problems.length} problem(s), ${(r.ms / 1000).toFixed(1)} s`);
    for (const p of r.problems) fail("pages", `${path}: ${p}`);
  }
  const warnings = {};
  for (const r of results) for (const w of r.warnings ?? []) warnings[w] = (warnings[w] ?? 0) + 1;
  report.checks.pages = {
    visited: results.length,
    slots: results.reduce((n, r) => n + r.slots, 0),
    ready: results.reduce((n, r) => n + r.ready, 0),
    readyEvents: results.reduce((n, r) => n + r.readyEvents, 0),
    consoleErrors: results.reduce((n, r) => n + r.problems.filter((p) => p.startsWith("console error")).length, 0),
    warningsByText: warnings,
    results,
  };
}

// ─── editor ─────────────────────────────────────────────────────────────────

async function checkEditor() {
  const path = "/learn/animate/";
  const { context, page, log } = await newPage();
  const out = { path, steps: [] };
  const step = (name, ok, detail = {}) => {
    out.steps.push({ name, ok, ...detail });
    if (!ok) fail("editor", `${name} ${JSON.stringify(detail)}`);
  };
  try {
    await page.goto(ORIGIN + path, { waitUntil: "load" });
    await waitForEnhanced(page);
    const fig = page.locator('figure.sample[data-mode="live"]').first();
    await fig.scrollIntoViewIfNeeded();
    const stageReady = (n) =>
      page.waitForFunction(
        (want) => Number(document.querySelector('figure.sample[data-mode="live"] .sample-stage')?.dataset.checkReady ?? 0) >= want,
        n,
        { timeout: READY_TIMEOUT },
      );
    await stageReady(1);
    const src0 = await fig.locator("marey-player").evaluate((p) => p.src);
    const original = await fig.evaluate((f) => f.dataset.source);
    const textarea = fig.locator("textarea.editor-input");
    const caretAtEndOfLine = (line) =>
      textarea.evaluate((ta, n) => {
        const lines = ta.value.split("\n");
        const at = lines.slice(0, n).join("\n").length;
        ta.focus();
        ta.setSelectionRange(at, at);
      }, line);

    // 1. A change that compiles re-runs the player with the new text.
    await caretAtEndOfLine(1);
    await page.keyboard.type(" // edited");
    await stageReady(2);
    const src1 = await fig.locator("marey-player").evaluate((p) => p.src);
    const status1 = await fig.locator(".sample-status").textContent();
    step("an edit that compiles re-runs the player", src1 !== src0 && status1 === "Runs", { src0, src1, status: status1 });

    // 2. An unknown property on line 2: the list shows it with its line, the player dims.
    await caretAtEndOfLine(1);
    await page.keyboard.type("\n  bogus: 1");
    await page.waitForFunction(() => {
      const list = document.querySelector('figure.sample[data-mode="live"] .sample-errors');
      return list && !list.hidden && list.children.length > 0;
    }, null, { timeout: 10_000 });
    const errorState = await fig.evaluate((f) => ({
      first: f.querySelector(".sample-errors li")?.textContent ?? "",
      status: f.querySelector(".sample-status")?.textContent ?? "",
      stale: f.querySelector(".sample-stage")?.classList.contains("is-stale") ?? false,
      marked: f.querySelectorAll(".editor-marks > *").length,
    }));
    await fig.screenshot({ path: join(outDir, "editor-error.png") });
    step("an error is listed with its line and column, and the player dims", /^line 2, col \d+: /.test(errorState.first) && /^\d+ errors?$/.test(errorState.status) && errorState.stale, errorState);

    // 3. Reset puts the sample's text back and plays it again.
    const readyBefore = Number(await fig.locator(".sample-stage").evaluate((s) => s.dataset.checkReady));
    await fig.getByRole("button", { name: "Reset" }).click();
    await stageReady(readyBefore + 1);
    const after = await fig.evaluate((f) => ({
      same: f.querySelector("textarea.editor-input")?.value === f.dataset.source,
      listHidden: f.querySelector(".sample-errors")?.hidden ?? false,
      status: f.querySelector(".sample-status")?.textContent ?? "",
      stale: f.querySelector(".sample-stage")?.classList.contains("is-stale") ?? true,
    }));
    step("Reset restores the text, clears the errors and re-runs the player", after.same && after.listHidden && after.status === "Runs" && !after.stale, after);
    out.originalLength = original.length;
    for (const p of logProblems(log)) step("no console or page errors", false, { problem: p });
  } catch (e) {
    step("ran to the end", false, { error: e instanceof Error ? e.message : String(e) });
  } finally {
    await context.close();
  }
  report.checks.editor = out;
}

// ─── search ─────────────────────────────────────────────────────────────────

async function checkSearch() {
  const { context, page, log } = await newPage();
  const out = { steps: [] };
  const step = (name, ok, detail = {}) => {
    out.steps.push({ name, ok, ...detail });
    if (!ok) fail("search", `${name} ${JSON.stringify(detail)}`);
  };
  try {
    await page.goto(`${ORIGIN}/learn/`, { waitUntil: "load" });
    await page.waitForFunction(() => !document.querySelector(".search-button")?.hidden);
    const isOpen = () => page.evaluate(() => document.querySelector("dialog.search-dialog")?.open === true);

    await page.keyboard.press("/");
    await page.waitForFunction(() => document.querySelector("dialog.search-dialog")?.open === true, null, { timeout: 5000 });
    step("/ opens search with the field focused", await page.evaluate(() => document.activeElement?.classList.contains("search-input")));

    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    const closed = !(await isOpen());
    const focusBack = await page.evaluate(() => document.activeElement?.className ?? "");
    step("Escape closes it", closed, { focus: focusBack });

    await page.keyboard.press("Control+k");
    await page.waitForFunction(() => document.querySelector("dialog.search-dialog")?.open === true, null, { timeout: 5000 });
    step("Ctrl+K reopens it, with an empty field", await page.evaluate(() => document.querySelector(".search-input")?.value === ""));

    await page.keyboard.type("handoff");
    await page.waitForFunction(() => document.querySelectorAll(".search-result").length > 0, null, { timeout: 10_000 });
    const results = await page.evaluate(() =>
      [...document.querySelectorAll(".search-result")].map((a) => ({ href: a.getAttribute("href"), selected: a.getAttribute("aria-selected") })),
    );
    const groups = await page.evaluate(() => [...document.querySelectorAll(".search-group-label")].map((g) => g.textContent));
    step("typing lists results, grouped by section, with the first selected", results.length > 0 && results[0].selected === "true", { count: results.length, first: results[0]?.href, groups });

    await page.keyboard.press("ArrowDown");
    const second = await page.evaluate(() => document.querySelectorAll(".search-result")[1]?.getAttribute("aria-selected"));
    await page.keyboard.press("ArrowUp");
    const first = await page.evaluate(() => document.querySelectorAll(".search-result")[0]?.getAttribute("aria-selected"));
    step("the arrow keys move the selection", results.length < 2 || (second === "true" && first === "true"), { second, first });
    // The page behind the dialog keeps a player drawing, which can hold up a
    // full-page capture under SwiftShader: the dialog alone is the evidence.
    await page.locator("dialog.search-dialog").screenshot({ path: join(outDir, "search.png"), timeout: 60_000 }).catch((e) => {
      out.screenshotError = e instanceof Error ? e.message.split(/\r?\n/)[0] : String(e);
    });

    const target = new URL(results[0].href, ORIGIN);
    await Promise.all([page.waitForURL((u) => u.pathname === target.pathname, { timeout: 10_000 }), page.keyboard.press("Enter")]);
    const landed = new URL(page.url());
    step("Enter opens the first result", landed.pathname === target.pathname, { expected: results[0].href, landed: landed.pathname + landed.hash });
    for (const p of logProblems(log)) step("no console or page errors", false, { problem: p });
  } catch (e) {
    step("ran to the end", false, { error: e instanceof Error ? e.message : String(e) });
  } finally {
    await context.close();
  }
  report.checks.search = out;
}

// ─── mobile ─────────────────────────────────────────────────────────────────

async function overflowAt(width, paths) {
  const rows = [];
  const { context, page, log } = await newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  try {
    for (const path of paths) {
      await page.goto(ORIGIN + path, { waitUntil: "load" });
      if (path !== "/") await waitForEnhanced(page).catch(() => undefined);
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      const over = m.scrollWidth - m.clientWidth;
      rows.push({ path, ...m, over });
      if (over > 0 || m.innerWidth !== width) fail("mobile", `${path} at ${width} px scrolls sideways by ${over} px (layout width ${m.innerWidth})`);
      if (width === 390 && path === "/learn/animate/") await page.screenshot({ path: join(outDir, "mobile-lesson-390.png") });
      if (width === 360 && path === "/learn/animate/") {
        // The editor's toolbar wraps and the code scrolls inside its own box.
        await page.locator("figure.sample[data-mode=live]").first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(outDir, "mobile-lesson-360-sample.png") });
      }
    }
    for (const p of logProblems(log)) fail("mobile", p);
  } finally {
    await context.close();
  }
  return rows;
}

async function checkMobile(paths) {
  const site = paths.filter((p) => p !== "/");
  const narrow = site.filter((p) => /^\/(learn|guides)\/[^/]+\/$/.test(p));
  report.checks.mobile = { at390: await overflowAt(390, paths), at360: await overflowAt(360, narrow) };
}

// ─── budget ─────────────────────────────────────────────────────────────────

/**
 * Keeps every player from mounting. `<marey-player>` asks for its renderer
 * when its own IntersectionObserver, the one with a 200 px margin, reports it
 * near the viewport; that observer is given one that never reports. The pool's
 * observers (400 and 1,200 px) still work, so players are made, compile and
 * fire `ready`, and the page loads everything it loads before a mount.
 */
function holdMounts() {
  const Real = window.IntersectionObserver;
  window.IntersectionObserver = class extends Real {
    constructor(callback, options) {
      super(options?.rootMargin === "200px 0px" ? () => undefined : callback, options);
    }
  };
}

async function scriptBytes(path) {
  const { context, page } = await newPage();
  await page.addInitScript(holdMounts);
  const scripts = new Map();
  let held = 0;
  // A safety net: should anything still ask for the renderer chunk, it is
  // held unanswered and the row says so.
  await page.route(/\/assets\/render-[\w-]+\.js$/, () => {
    held++;
  });
  page.on("response", async (r) => {
    const url = r.url();
    if (!url.startsWith(ORIGIN) || !/\.m?js(\?|$)/.test(url)) return;
    try {
      const body = await r.body();
      scripts.set(url, { raw: body.length, gzip: gzipSync(body).length });
    } catch {
      // A response with no body to read (a redirect) holds no script.
    }
  });
  try {
    await page.goto(ORIGIN + path, { waitUntil: "load" });
    // Dynamic imports follow the load event: wait until none arrives for 1.5 s.
    let seen = -1;
    for (let i = 0; i < 30 && seen !== scripts.size; i++) {
      seen = scripts.size;
      await page.waitForTimeout(1500);
    }
    const inline = await page.evaluate(() => [...document.querySelectorAll("script:not([src])")].map((s) => s.textContent ?? "").join("\n"));
    const inlineGzip = inline.trim() === "" ? 0 : gzipSync(Buffer.from(inline)).length;
    const files = [...scripts].map(([url, s]) => ({ file: url.replace(ORIGIN, ""), ...s })).sort((a, b) => b.gzip - a.gzip);
    const gzip = files.reduce((n, f) => n + f.gzip, 0) + inlineGzip;
    return { path, gzip, raw: files.reduce((n, f) => n + f.raw, 0), inlineGzip, rendererRequested: held > 0, files };
  } finally {
    await context.close();
  }
}

async function checkBudget(paths) {
  const rows = [];
  for (const path of paths.filter((p) => p !== "/")) {
    const row = await scriptBytes(path);
    rows.push(row);
    if (row.gzip >= BUDGET) fail("budget", `${path} loads ${(row.gzip / 1024).toFixed(1)} kB of JavaScript gzipped, over ${BUDGET / 1024} kB`);
    if (row.rendererRequested) fail("budget", `${path}: the renderer chunk was requested although no player could mount`);
  }
  rows.sort((a, b) => b.gzip - a.gzip);
  console.log(`budget: largest ${rows[0]?.path} ${(rows[0]?.gzip / 1024).toFixed(1)} kB gzipped`);
  report.checks.budget = { limitBytes: BUDGET, largest: rows[0] ? { path: rows[0].path, gzip: rows[0].gzip } : null, pages: rows };
}

// ─── text ───────────────────────────────────────────────────────────────────

async function checkText() {
  const path = "/learn/shapes/";
  const { context, page, log } = await newPage();
  const out = { path };
  const fonts = [];
  page.on("response", (r) => {
    if (r.url().includes("JetBrainsMono-Regular.ttf")) fonts.push({ url: r.url().replace(ORIGIN, ""), status: r.status(), type: r.headers()["content-type"] ?? "" });
  });
  try {
    await page.goto(ORIGIN + path, { waitUntil: "load" });
    await waitForEnhanced(page);
    const index = await page.evaluate(() =>
      [...document.querySelectorAll('figure.sample[data-mode="live"]')].findIndex((f) => /(^|\n)\s*text\s+[A-Za-z_]\w*\s*\{/.test(f.dataset.source ?? "")),
    );
    out.sampleIndex = index;
    if (index < 0) throw new Error("no live sample with a text object on the page");
    const fig = page.locator('figure.sample[data-mode="live"]').nth(index);
    await fig.scrollIntoViewIfNeeded();
    await page.waitForFunction(
      (i) => {
        const stage = document.querySelectorAll('figure.sample[data-mode="live"]')[i]?.querySelector(".sample-stage");
        return !!stage && (!!stage.dataset.checkReady || !!stage.dataset.checkError);
      },
      index,
      { timeout: READY_TIMEOUT },
    );
    const stage = await fig.locator(".sample-stage").evaluate((s) => ({ ready: s.dataset.checkReady ?? null, error: s.dataset.checkError ?? null }));
    await page.waitForTimeout(800);
    await fig.locator(".sample-stage").screenshot({ path: join(outDir, "text-sample.png") });
    out.stage = stage;
    out.fonts = fonts;
    const served = fonts.some((f) => f.url === "/assets/fonts/JetBrainsMono-Regular.ttf" && f.status === 200);
    out.ok = !!stage.ready && !stage.error && served;
    if (!out.ok) fail("text", JSON.stringify(out));
    for (const p of logProblems(log)) fail("text", p);
  } catch (e) {
    fail("text", e instanceof Error ? e.message : String(e));
  } finally {
    await context.close();
  }
  report.checks.text = out;
}

// ─── pool ───────────────────────────────────────────────────────────────────

async function checkPool() {
  const { context, page, log } = await newPage({ viewport: { width: 1280, height: 2400 } });
  const out = { path: "/gallery/", viewport: "1280x2400" };
  try {
    await page.goto(`${ORIGIN}/gallery/`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    out.pageHeight = height;
    const samples = [];
    // Cards on screen with no player yet, a second after each step: the pool
    // serves the nearest waiting card only when a place frees, and a place
    // frees only when a player's card is over 1,200 px away.
    const waitingOnScreen = [];
    const onScreenWithout = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll("li.gallery-card .sample-stage")].filter((s) => {
            const r = s.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && !s.querySelector("marey-player");
          }).length,
      );
    for (let y = 0; y <= height; y += 200) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(150);
      samples.push(await page.evaluate(() => document.querySelectorAll("marey-player").length));
    }
    for (let y = 0; y <= height; y += 600) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(1000);
      waitingOnScreen.push({ y, cards: await onScreenWithout() });
    }
    // Fast up and down: a player removed while it loads must not throw.
    for (let i = 0; i < 12; i++) {
      await page.evaluate((top) => window.scrollTo(0, top), i % 2 === 0 ? 0 : height);
      await page.waitForTimeout(60);
      samples.push(await page.evaluate(() => document.querySelectorAll("marey-player").length));
    }
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => window.__siteCheck);
    out.connectedSampled = samples;
    out.onScreenWithoutPlayer = waitingOnScreen;
    out.maxConnected = state.maxLive;
    out.readyEvents = state.ready;
    out.playerErrors = state.errors;
    if (state.maxLive > PLAYER_LIMIT) fail("pool", `${state.maxLive} players were connected at once on /gallery/ at 1280x2400`);
    if (state.ready === 0) fail("pool", "no player reached ready while scrolling the gallery");
    for (const e of state.errors) fail("pool", `player error ${e.code}`);
    for (const p of logProblems(log)) fail("pool", p);
  } finally {
    await context.close();
  }
  console.log(`pool: at most ${out.maxConnected} players connected on /gallery/ at 1280x2400`);
  report.checks.pool = out;
}

// ─── controls ───────────────────────────────────────────────────────────────

async function barState(page) {
  return page.evaluate(() => {
    const player = document.querySelector(".gallery-stage marey-player");
    const bar = player?.shadowRoot?.querySelector("[part=controls]");
    return {
      playing: player ? !player.paused : null,
      cls: player?.classList.contains("is-playing") ?? null,
      hovered: player?.matches(":hover") ?? null,
      focusWithin: player?.matches(":focus-within") ?? null,
      opacity: bar ? getComputedStyle(bar).opacity : null,
    };
  });
}

/** Moves the keyboard focus to an element outside the player, as a reader tabbing on would. */
function moveFocusOut() {
  const outside = document.querySelector(".theme-toggle") ?? document.querySelector("a");
  outside?.focus();
}

async function checkControls() {
  const path = "/gallery/lighthouse/";
  const out = { path, steps: [] };
  const step = (name, ok, detail) => {
    out.steps.push({ name, ok, ...detail });
    if (!ok) fail("controls", `${name} ${JSON.stringify(detail)}`);
  };
  const { context, page, log } = await newPage();
  try {
    await page.goto(ORIGIN + path, { waitUntil: "load" });
    await page.waitForFunction(() => !!document.querySelector(".gallery-stage .sample-stage")?.dataset.checkReady, null, { timeout: READY_TIMEOUT });
    const player = page.locator(".gallery-stage marey-player");
    const box = await player.boundingBox();
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const settle = () => page.waitForTimeout(450);

    await page.mouse.move(2, 2);
    await settle();
    let s = await barState(page);
    step("playing, pointer away: the bar is hidden", s.playing === true && s.opacity === "0", s);

    await page.mouse.move(centre.x, centre.y);
    await settle();
    s = await barState(page);
    step("pointer on the player: the bar shows", s.opacity === "1", s);
    await player.screenshot({ path: join(outDir, "controls-hover.png") });

    await player.locator("[part=play]").click();
    await page.mouse.move(2, 2);
    await settle();
    s = await barState(page);
    step("paused, pointer away: the bar stays", s.playing === false && s.cls === false && s.opacity === "1", s);

    // A click leaves the keyboard focus on the play button, and focus in the
    // bar keeps it showing: the bar hides only when nothing in it has focus.
    await page.mouse.move(centre.x, centre.y);
    await player.locator("[part=play]").click();
    await page.mouse.move(2, 2);
    await settle();
    s = await barState(page);
    step("playing again after a click, pointer away: the bar stays while the button has focus", s.playing === true && s.opacity === "1", s);
    await page.evaluate(moveFocusOut);
    await settle();
    s = await barState(page);
    step("focus leaves the button: hidden again", s.playing === true && s.opacity === "0", s);
    await player.screenshot({ path: join(outDir, "controls-away.png") });
    // A headed browser recomputes hover from the real cursor after the
    // capture scrolls; put the pointer away again.
    await page.mouse.move(2, 2);

    await page.evaluate(() => document.querySelector(".gallery-stage marey-player")?.shadowRoot?.querySelector("[part=seek]")?.focus());
    await settle();
    s = await barState(page);
    step("focus in the bar, pointer away: the bar shows", s.opacity === "1", s);
    await page.evaluate(moveFocusOut);
    await settle();
    s = await barState(page);
    step("focus gone: hidden again", s.opacity === "0", s);
    for (const p of logProblems(log)) step("no console or page errors", false, { problem: p });
  } catch (e) {
    step("ran to the end", false, { error: e instanceof Error ? e.message : String(e) });
  } finally {
    await context.close();
  }

  // A screen that cannot hover keeps the bar.
  const touch = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await touch.page.goto(ORIGIN + path, { waitUntil: "load" });
    await touch.page.waitForFunction(() => !!document.querySelector(".gallery-stage .sample-stage")?.dataset.checkReady, null, { timeout: READY_TIMEOUT });
    await touch.page.waitForTimeout(450);
    const hoverNone = await touch.page.evaluate(() => matchMedia("(hover: none)").matches);
    const s = await barState(touch.page);
    step("a screen that cannot hover: the bar shows while playing", hoverNone && s.playing === true && s.opacity === "1", { hoverNone, ...s });
  } catch (e) {
    step("touch ran to the end", false, { error: e instanceof Error ? e.message : String(e) });
  } finally {
    await touch.context.close();
  }
  report.checks.controls = out;
}

// ─── nojs ───────────────────────────────────────────────────────────────────

async function checkNoJs() {
  const rows = [];
  const { context, page } = await newPage({ javaScriptEnabled: false });
  try {
    for (const [path, name] of [["/learn/", "nojs-learn"], ["/learn/animate/", "nojs-lesson"], ["/gallery/", "nojs-gallery"]]) {
      await page.goto(ORIGIN + path, { waitUntil: "load" });
      const row = await page.evaluate(() => ({
        title: document.title,
        h1: document.querySelector("h1")?.textContent?.trim() ?? null,
        navLinks: document.querySelectorAll("header nav a, nav a").length,
        searchHidden: (() => {
          const b = document.querySelector(".search-button");
          return !b || b.hidden || getComputedStyle(b).display === "none";
        })(),
        codeBlocks: document.querySelectorAll("pre.code").length,
      }));
      await page.screenshot({ path: join(outDir, `${name}.png`) });
      rows.push({ path, ...row });
      if (!row.h1 || row.navLinks === 0 || !row.searchHidden) fail("nojs", `${path}: ${JSON.stringify(row)}`);
    }
  } finally {
    await context.close();
  }
  report.checks.nojs = rows;
}

// ─── shots ──────────────────────────────────────────────────────────────────

/**
 * Seeks a player exactly and screenshots it without its bar. The first seek
 * is thrown away: the first frame after `ready` can be captured before the
 * canvas has painted.
 */
async function shoot(page, selector, poster, file) {
  const player = page.locator(selector);
  await player.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    (sel) => {
      const p = document.querySelector(sel);
      const slot = p?.parentElement?.classList.contains("sample-stage") ? p.parentElement : p;
      return !!slot?.dataset.checkReady && Number.isFinite(p.duration);
    },
    selector,
    { timeout: READY_TIMEOUT },
  );
  const shown = await page.evaluate(
    async ({ sel, poster }) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const p = document.querySelector(sel);
      const t = poster ?? p.duration;
      p.pause();
      p.currentTime = Math.min(0.5, p.duration / 2);
      await wait(600);
      p.pause();
      p.currentTime = t;
      await wait(600);
      p.controls = false;
      await wait(200);
      return { asked: t, shown: p.currentTime, duration: p.duration };
    },
    { sel: selector, poster },
  );
  await player.screenshot({ path: join(outDir, file) });
  return shown;
}

async function checkShots() {
  const rows = [];
  const { context, page, log } = await newPage();
  try {
    for (const g of gallery) {
      await page.goto(`${ORIGIN}/gallery/${g.id}/`, { waitUntil: "load" });
      const r = await shoot(page, ".gallery-stage marey-player", g.poster, `gallery-${g.id}.png`);
      rows.push({ kind: "gallery", id: g.id, file: `gallery-${g.id}.png`, ...r });
    }
    for (const l of lessons) {
      if (!l.showcase && !l.embed) continue;
      await page.goto(`${ORIGIN}/learn/${l.slug}/`, { waitUntil: "load" });
      const id = l.showcase ?? l.embed;
      const selector = l.showcase ? 'figure.sample[data-mode="showcase"] marey-player' : ".lesson-embed > marey-player";
      if (l.showcase) await waitForEnhanced(page);
      const r = await shoot(page, selector, posterOf(id), `showcase-${l.slug}.png`);
      rows.push({ kind: l.showcase ? "showcase" : "embed", lesson: l.slug, id, file: `showcase-${l.slug}.png`, ...r });
    }
    for (const r of rows) {
      // A seek lands on a tick: within 1/120 s of the time asked for.
      if (Math.abs(r.shown - r.asked) > 1 / 120 + 1e-9) fail("shots", `${r.file}: asked for ${r.asked} s, shows ${r.shown} s`);
    }
    for (const p of logProblems(log)) fail("shots", p);
  } catch (e) {
    fail("shots", e instanceof Error ? e.message : String(e));
  } finally {
    await context.close();
  }
  console.log(`shots: ${rows.length} screenshots`);
  report.checks.shots = rows;
}

// ─── run ────────────────────────────────────────────────────────────────────

try {
  report.renderer = await (async () => {
    const page = await browser.newPage();
    await page.setContent("<canvas id=c></canvas>");
    const r = await page.evaluate(() => {
      const gl = document.getElementById("c").getContext("webgl2");
      const d = gl?.getExtension("WEBGL_debug_renderer_info");
      return gl ? gl.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null;
    });
    await page.close();
    return r;
  })();
  console.log(`renderer: ${report.renderer}`);
  const all = [...(await sitemapPaths()), "/404.html"];
  const paths = pagesFilter ?? all;
  report.sitemapPages = all.length - 1;
  if (only.includes("pages")) await checkPages(paths);
  if (only.includes("editor")) await checkEditor();
  if (only.includes("search")) await checkSearch();
  if (only.includes("mobile")) await checkMobile(paths);
  if (only.includes("budget")) await checkBudget(paths);
  if (only.includes("text")) await checkText();
  if (only.includes("pool")) await checkPool();
  if (only.includes("controls")) await checkControls();
  if (only.includes("nojs")) await checkNoJs();
  if (only.includes("shots")) await checkShots();
} catch (e) {
  fail("run", e instanceof Error ? e.stack ?? e.message : String(e));
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(report.failures.length === 0 ? `site-check: all passed (${outDir})` : `site-check: ${report.failures.length} failure(s); see ${join(outDir, "report.json")}`);
  process.exitCode = report.failures.length === 0 ? 0 : 1;
}
