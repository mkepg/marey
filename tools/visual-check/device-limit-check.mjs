/**
 * Prove `videoPipeline.ts`'s device-limit refusal (`VIDEO_EXCEEDS_DEVICE_LIMITS`,
 * `videoContract.ts`'s `deviceLimitDiagnostic`) actually fires end-to-end.
 *
 * **Why this exists.** `deviceLimitDiagnostic` is a pure function, unit-tested
 * directly in `videoContract.test.ts`. But `videoPipeline.ts`'s one-line
 * integration of it —
 * ```
 * const refusal = deviceLimitDiagnostic(video.plan, gl.getParameter(gl.MAX_TEXTURE_SIZE), ...);
 * if (refusal) throw new Error(refusal.message);
 * ```
 * — is exercised by nothing headless: deleting that `if` line and running
 * `npx vitest run` stays green (Phase 5C Task 1 fix round 1, mutation (c)).
 * No real device this project's CI or a developer's machine is likely to run
 * on has a `MAX_TEXTURE_SIZE`/`MAX_RENDERBUFFER_SIZE` small enough to trigger
 * the refusal naturally (Chromium/SwiftShader's real limits are in the
 * thousands of pixels; every scene this project ships is far under that), so
 * there is no scene fixture that could exercise this path on its own.
 *
 * **How the limit is forced, and why this needs no production hook.**
 * Playwright's `page.addInitScript` runs in the page BEFORE any of the app's
 * own scripts, so it patches `WebGL2RenderingContext.prototype.getParameter`
 * at the BROWSER API level, forcing `MAX_TEXTURE_SIZE`/`MAX_RENDERBUFFER_SIZE`
 * to `--limit` while every other parameter passes through to the real
 * implementation unpatched (patching every parameter breaks PixiJS's own
 * WebGL setup, which needs its real limits for other things, and would test
 * a WebGL initialisation failure instead of this refusal). This lives
 * entirely in the harness's own init script — no `window.__marey*` seam, no
 * dev-only global, and nothing in `src/` changes: the shipped pipeline's own
 * code path (`runVideoExport` → the same `gl.getParameter` calls a real
 * click would make) is what gets exercised, just against a browser API this
 * script has temporarily lied to.
 *
 * **Structural note.** Unlike `video-check.mjs`, `quality-check.mjs` or
 * `lottie-check.mjs`, this script calls `window.__mareyExportVideo` (the dev
 * seam, `src/lib/devVideoSeam.ts`) purely as a *convenient entry point* into
 * the shipped pipeline, exactly as those scripts do — it does not need
 * `withReferenceFrames` or any observer data, only the pipeline's own thrown
 * refusal, which the dev seam re-throws with an `[export] ` prefix
 * (`devVideoSeam.ts`'s own docstring). A real click through
 * `useExportVideo.ts` would hit the identical `deviceLimitDiagnostic` check
 * inside `runVideoExport`, since both call the same function; this script
 * exists because there is no shipped export button for this harness to
 * click yet (Phase 6, `marey export`), same reasoning as every other
 * dev-seam-based script here.
 *
 * Usage:
 *   node tools/visual-check/device-limit-check.mjs \
 *     --scene tools/visual-check/scenes/... \
 *     --limit 100
 *
 *   --scene <path>     .marey source file (required; no "default" fallback,
 *                       same as every other harness here). Its CODED size
 *                       (2x the scene's own declared size, VIDEO_SCALE) must
 *                       exceed --limit in at least one dimension, or the
 *                       refusal has nothing to fire on -- the default
 *                       800x600 scene (coded 1600x1200) comfortably clears
 *                       any --limit below 1600.
 *   --container <name> "mp4" or "webm" (default "mp4"; the refusal fires
 *                       before either container's own codec-level check, so
 *                       either works)
 *   --fps <n>           export frame rate (default 30)
 *   --duration <s>      export bound in seconds, overriding the scene's own
 *                       `duration:`
 *   --limit <n>         the forced MAX_TEXTURE_SIZE/MAX_RENDERBUFFER_SIZE, in
 *                       pixels (default 100)
 *   --url <origin>      dev server origin (default http://localhost:5199).
 *                       Same --strictPort trap as check.mjs applies
 *   --headed            show the browser window
 *
 * Exit code is non-zero if the export does not throw, or throws something
 * other than `VIDEO_EXCEEDS_DEVICE_LIMITS` -- never on the message's exact
 * wording beyond that code, which is a judgement call for whoever reads the
 * printed result.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import LZString from "lz-string";

function argAll(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
  }
  return out;
}
function arg(name, fallback = null) {
  const vals = argAll(name);
  return vals.length > 0 ? vals[vals.length - 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const url = arg("url", "http://localhost:5199");
const scenePath = arg("scene");
if (!scenePath) {
  console.error("device-limit-check.mjs requires --scene <path-to-.marey-file>");
  process.exit(2);
}
const container = arg("container", "mp4");
if (container !== "mp4" && container !== "webm") {
  console.error(`device-limit-check.mjs requires --container mp4|webm, got '${container}'`);
  process.exit(2);
}
const fps = Number(arg("fps", "30"));
const durationArg = arg("duration", null);
const durationSeconds = durationArg === null ? undefined : Number(durationArg);
const limit = Number(arg("limit", "100"));

const source = readFileSync(resolve(scenePath), "utf8");
const sceneUrl = `${url}/#code=${LZString.compressToEncodedURIComponent(source)}`;

// Same launch args as video-check.mjs/quality-check.mjs (SwiftShader,
// software 2D canvas for deterministic pixel operations, even though this
// script never reads a pixel -- consistency with the rest of this
// directory's harnesses matters more than the few this script does not
// need).
const LAUNCH_ARGS = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--disable-accelerated-2d-canvas",
];

const browser = await chromium.launch({ headless: !has("headed"), args: LAUNCH_ARGS });
const page = await browser.newPage();

// Runs before any of the app's own scripts (Playwright guarantees init
// scripts execute ahead of the page's own, on every navigation). Only
// MAX_TEXTURE_SIZE/MAX_RENDERBUFFER_SIZE are forced; every other parameter
// name passes through to the real WebGL2RenderingContext.getParameter, so
// PixiJS's own context setup (which queries many other parameters) is
// unaffected.
await page.addInitScript((forcedLimit) => {
  const proto = WebGL2RenderingContext.prototype;
  const original = proto.getParameter;
  proto.getParameter = function (pname) {
    if (pname === this.MAX_TEXTURE_SIZE || pname === this.MAX_RENDERBUFFER_SIZE) return forcedLimit;
    return original.call(this, pname);
  };
}, limit);

await page.goto(sceneUrl, { waitUntil: "load", timeout: 60_000 });
await page.waitForFunction(() => typeof window.__mareyExportVideo === "function", null, {
  timeout: 60_000,
  polling: 200,
});

const result = await page.evaluate(
  async ({ source, container, fps, durationSeconds }) => {
    try {
      await window.__mareyExportVideo(source, { container, fps, durationSeconds, withReferenceFrames: false });
      return { threw: false };
    } catch (e) {
      return { threw: true, message: String(e && e.message ? e.message : e) };
    }
  },
  { source, container, fps, durationSeconds },
);

await browser.close();

console.log(JSON.stringify({ scene: scenePath, container, limit, ...result }, null, 2));

const caughtTheRightWay = result.threw && result.message.includes("VIDEO_EXCEEDS_DEVICE_LIMITS");
if (!caughtTheRightWay) {
  console.error(
    result.threw
      ? `expected VIDEO_EXCEEDS_DEVICE_LIMITS, got a different throw: ${result.message}`
      : "expected the export to throw VIDEO_EXCEEDS_DEVICE_LIMITS, but it resolved",
  );
}
process.exit(caughtTheRightWay ? 0 : 1);
