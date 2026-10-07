# Phase 6 — Packaging and Legibility Implementation Plan

**Goal:** Make Marey installable from npm with a pure compiler library, give
it a `marey export` command that produces the same bytes as the browser's
export buttons, and make the repository explain itself to a reader in ten
minutes.

**Architecture:** The package ships a Node CLI and a pure compiler library,
with `playwright-core` as its one runtime dependency. `marey export` launches
a pinned headless Chromium, loads a UI-free export page through `page.route`
on `https://marey.export/`, and calls the same pipeline functions the buttons
call. The MP4 path pipes lossless PNG frames to the user's ffmpeg with x264,
but only if Task 1's measurement shows it wins. Otherwise MP4 uses the
button's WebCodecs pipeline.

**Tech stack:** TypeScript 5.9, Vite 8 (library and page builds), Vitest 4,
`playwright-core` 1.62.1, ffmpeg with libx264 (user-installed), Node 22.

**Spec:** `docs/specs/2026-09-27-marey-phase-6-packaging-and-legibility-design.md`.
Read it before any task; this plan argues from it and cites it as "spec §N".

**Execution order** (spec O5):
1. Tasks 1–12 (packaging, CLI, determinism account).
2. Phase 6B, the website redesign, which has its own design and plan.
3. Tasks 13–15 (README, the ten-minute test, status, publish).

Task 1 needs ffmpeg on `PATH`. If it is not there yet, run Tasks 2–8 first and
come back to Task 1 before Task 9, which depends on its result.

---

## Global Constraints

Every task's requirements include this section.

1. **One orchestration per export** (5B ruling R45). Compile → plan → build →
   sample happens only in `withRasterExport` (`src/compiler/export/rasterExport.ts`).
   A dev seam or the export page *observes* a pipeline and never re-implements
   it. If a task finds itself copying that loop, stop and report.
2. **Encoders never advance the simulation and never see a wall clock**
   (roadmap §6.2). **Refuse, don't degrade:** a request that cannot be honoured
   fails with a named diagnostic, never a silent fallback.
3. **Do not modify** `frameSampler.ts` or `exportContract.ts`. `sceneIR.ts` may
   change only to move `IRendererAdapter` out of it (Task 2).
4. **Encoder boundaries stay as they are:** `lottieEncode.ts`, `textOutline.ts`
   and `apngEncode.ts` import neither pixi.js nor the Scene IR module
   (`exportBoundary.test.ts`).
5. **Pins.** `playwright-core` is exactly `1.62.1` in `dependencies`.
   `playwright` is exactly `1.62.1` in `devDependencies`. Package version
   `0.4.0`. `engines: { "node": ">=22" }`. ESM only.
6. **Export defaults match the button:** 30 fps (`EXPORT_FPS` in
   `useExport.ts`), video at `VIDEO_SCALE` (2), PNG and APNG at 1×. There is no
   `--scale` flag.
7. **Browser launch**, one constant used by the CLI and every check that
   compares against it:
   `EXPORT_LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"]`.
   These are the SwiftShader flags `tools/visual-check/quality-check.mjs`
   already uses.
8. **Frames are placed by `FrameSnapshot.index`, never by arrival order**
   (5C ruling T4-R2).
9. **Output line** of a successful export, exactly:
   `wrote <out>  <n> frames @ <fps> fps  <w>x<h>  <bytes> B  sha256 <hex>  frames <hash>`,
   with `  ffmpeg <version>` appended for an x264 MP4. Exit codes: 0 on
   success, 1 otherwise.
10. **Diagnostics** carry their code in brackets at the start of the message,
    as every existing export diagnostic does:
    - `[EXPORT_BROWSER_MISSING]`, whose message contains
      `npx --package playwright-core@1.62.1 playwright-core install chromium-headless-shell`;
    - `[EXPORT_FFMPEG_MISSING]`;
    - `[EXPORT_FFMPEG_FAILED]`.
11. **Tests.** For every behaviour a task requires, delete the line that
    implements it, run the suite, see red, restore (engineering-lessons §2c).
    Report the red run's output. Flip any judgment call to its other answer and
    run the suite (§2d). **Tie-break** (§3b): a gap this check finds in a
    behaviour the task *requires* is in scope; a gap in an adjacent behaviour is
    filed, not fixed.
12. **Before every commit** run all four AGENTS.md checks from
    `C:\Users\gomez\...` (capital `C:`; engineering-lessons §6):
    - `npm test`
    - `npx vitest run --config eval/vitest.config.ts`
    - `npm run build`
    - `npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')`

    Stage paths explicitly, read `git diff --staged`, and use Conventional
    Commit subjects with no tool attribution.
13. **Judging changes.** `core.autocrlf` is on. Judge changes with
    `git diff --stat -- <path>`, never `git status`.
14. **Browser checks** run `npx vite --port 5199 --strictPort`. Kill it
    afterwards and confirm the port is free (`netstat -ano | grep 5199`).
15. **No outbound HTTP from the shell.** Nothing here may need `npm install` of
    a package not already in `node_modules`. Moving an existing package between
    dependency groups uses `npm install --offline`. If that fails, stop and ask
    the owner to run it.
16. **No committed path or wording names an AI tool** or describes the
    assistant workflow (AGENTS.md).
17. **O7 and O8 are proposed, not yet confirmed** (spec §0). Before Task 10 (CI)
    and Task 13 (the committed README image), confirm with the owner that each
    still stands.

### A note on this plan's code blocks

Headless test code is written out in full, and each call in it was checked
against the current source (engineering-lessons §3d). Implementation code is
given where the shape matters; elsewhere a task gives the signature and the
rule, and the implementer writes the body. Before dispatching any task,
re-read its body against the files it names (engineering-lessons §3c).
Signatures quoted here describe the code as of `d2d7b70`.

---

## File structure

| Path | Responsibility |
|---|---|
| `src/package/index.ts` | The public library entry: `compile` and the public types |
| `src/package/index.test.ts` | `compile`'s contract |
| `src/package/boundary.test.ts` | The library's import graph never reaches rendering, export, or their packages |
| `tsconfig.lib.json`, `vite.lib.config.ts` | Library declarations and bundle, into `dist/lib/` |
| `tools/build/fix-dts-extensions.mjs` | Adds `.js` to relative specifiers in emitted `.d.ts`, so `nodenext` consumers resolve them |
| `src/cli/main.ts`, `src/cli/main.test.ts` | Command table, `--help`, `--version`; the CLI bundle's entry and exports |
| `src/cli/check.ts` | `check`, with its `main` renamed to `runCheck` |
| `src/compiler/export/pngPipeline.ts` (+ test) | The one lossless-PNG-frames orchestration: scene size for `png`, video size for x264 |
| `src/exportPage/index.html`, `main.ts`, `protocol.ts` | The UI-free export page, and the request and result types it shares with the CLI |
| `vite.exportpage.config.ts` | Builds the page into `dist/export-page/`, with the font and licence file |
| `src/cli/exportArgs.ts` (+ test) | Pure: argument parsing, default output paths |
| `src/cli/frameAssembler.ts` (+ test) | Pure: places frames by index and hands them on in order |
| `src/cli/exportReport.ts` (+ test) | Pure: the output line, and diagnostic mapping |
| `src/cli/exportDriver.ts` | Launches Chromium, serves the page, calls it, writes output |
| `src/cli/ffmpeg.ts` (+ test) | Pure x264 argument builder and output parsers; the spawn wrapper |
| `tools/cli-check/export-matrix.mjs` | `npm run check:export` |
| `tools/cli-check/pack-check.mjs` | `npm run check:pack` |
| `tools/visual-check/lib/scoreVideo.mjs` | The in-page PSNR and speck scorer, shared by `quality-check.mjs` and the gate |
| `tools/visual-check/x264-gate.mjs` | Task 1's measurement |
| `docs/determinism.md` | The determinism account |
| `docs/media/bars-reveal.marey`, `docs/media/bars-reveal.png` | The README's source and its artifact |
| `eval/RESULTS-PHASE-6.md` | Exit evidence |

---

## Task 1: The x264 gate (tier: integration)

Spec §5. It decides whether Task 9 builds the x264 path or maps MP4 onto
`runVideoExport`.

**Files:**
- Create: `tools/visual-check/lib/scoreVideo.mjs`
- Create: `tools/visual-check/x264-gate.mjs`
- Modify: `tools/visual-check/quality-check.mjs` (use the shared scorer)
- Create: `eval/RESULTS-PHASE-6.md` (section "Task 1: x264 gate")

**Interfaces:**
- Produces: the chosen settings `{ crf, preset, tune }` and the exact ffmpeg
  argument list, recorded in `eval/RESULTS-PHASE-6.md`, which Task 9's
  `X264_SETTINGS` must equal. Or the recorded verdict "gate failed".

- [ ] **Step 1: Confirm ffmpeg.** Run `ffmpeg -hide_banner -version` and
  `ffmpeg -hide_banner -encoders | grep libx264`. If either fails, stop and ask
  the owner (spec O2).

- [ ] **Step 2: Baseline before refactoring.** Start the dev server (Global
  Constraint 14). Write the default scene to a scratch file:
  ```bash
  mkdir -p .visual-check/phase6
  node -e "const s=require('fs').readFileSync('src/store/defaultScene.ts','utf8');require('fs').writeFileSync('.visual-check/phase6/default.marey', s.match(/export const DEFAULT_CODE = \`([\s\S]*?)\`;/)[1])"
  node tools/visual-check/quality-check.mjs --scene .visual-check/phase6/default.marey --containers mp4,webm --fps 30 --out .visual-check/phase6/quality-before
  ```
  Record both PSNR and specks-per-frame numbers.

- [ ] **Step 3: Extract the scorer.** Move `installMediabunny(page)` and the
  second `page.evaluate` in `exportAndScore` (the decode-and-score body) out of
  `quality-check.mjs`, unchanged, into `tools/visual-check/lib/scoreVideo.mjs`:
  ```js
  export async function installMediabunny(page, mediabunnyPath) { /* moved body */ }
  /** Decode `videoBase64` in the page and score it against same-index references. */
  export async function scoreInPage(page, videoBase64, referenceFramesBase64) {
    return page.evaluate(/* the moved scoring function, unchanged */, { videoBase64, referenceFramesBase64 });
  }
  ```
  `quality-check.mjs` imports both and calls
  `scoreInPage(page, exported.video, exported.referenceFrames)`.

- [ ] **Step 4: Show the refactor changed nothing.** Re-run Step 2's command
  into `quality-after`. Both containers' PSNR and specks must equal Step 2's
  exactly. Record both runs.

- [ ] **Step 5: Write `x264-gate.mjs`.** Usage:
  `node tools/visual-check/x264-gate.mjs --scene <path> --fps 30 --out <dir> [--url http://localhost:5199]`.
  1. Launch Chromium (the `playwright` package) with quality-check's GPU-scorer
     `LAUNCH_ARGS`, open the app with the scene in `#code=`, wait for
     `window.__mareyExportVideo`, and install mediabunny.
  2. Call `__mareyExportVideo(source, { container: "mp4", fps, withReferenceFrames: true })`.
     Keep `video` (the WebCodecs file) and `referenceFrames`. Every entry must
     be non-null; otherwise exit 1.
  3. For each config in the matrix, spawn ffmpeg and write each reference PNG
     (decoded from base64, in index order) to its stdin:
     ```js
     const MATRIX = [];
     for (const crf of [14, 18]) for (const preset of ["medium", "slow"]) for (const tune of [null, "animation"])
       MATRIX.push({ crf, preset, tune });
     function x264Args(fps, out, { crf, preset, tune }) {
       return [
         "-hide_banner", "-loglevel", "error",
         "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
         "-c:v", "libx264", "-preset", preset, "-crf", String(crf),
         ...(tune ? ["-tune", tune] : []),
         "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact",
         "-an", "-y", out,
       ];
     }
     ```
  4. Score the WebCodecs file and every x264 file with
     `scoreInPage(page, base64, referenceFrames)`. If an x264 file fails at the
     `decode` stage, record it and stop: the scorer can't judge it, and that is
     a finding to report, not something to work around.
  5. Apply spec §5's gate, with `wc` the WebCodecs result:
     `psnr >= wc.psnr + 1.0 && specksPerFrame <= wc.specksPerFrame / 10 && bytes <= 3 * wc.bytes`.
     Among the passing configs, choose the one with the fewest bytes.
  6. Encode the chosen config twice more and compare SHA-256s.
  7. Write `report.json` (every config's numbers, the verdict, the chosen config,
     its exact argument list, both SHA-256s, and `ffmpeg -version`'s first line)
     and print a table. Exit 0 whatever the verdict. The script measures; it
     does not judge.

- [ ] **Step 6: Run it** on the default scene
  (`--out .visual-check/phase6/gate`). If the two repeat encodes differ, add
  `"-threads", "1"` to `x264Args`, run again, and record both results.

- [ ] **Step 7: Record** in `eval/RESULTS-PHASE-6.md` under "Task 1: x264 gate":
  - the command;
  - ffmpeg's version line;
  - the full matrix table;
  - the verdict;
  - the chosen settings and their exact argument list;
  - the repeat-encode SHA-256s;
  - Step 2 and 4's before/after scorer numbers.

  Kill the dev server and confirm port 5199 is free.

- [ ] **Step 8: Commit.**
  ```bash
  git add tools/visual-check/lib/scoreVideo.mjs tools/visual-check/x264-gate.mjs tools/visual-check/quality-check.mjs eval/RESULTS-PHASE-6.md
  git commit -m "test(6): measure x264 against WebCodecs H.264 on the same lossless frames"
  ```

---

## Task 2: The public library (tier: architecture)

Spec §2.3.

**Files:**
- Modify: `src/compiler/sceneIR.ts:152-154` (remove `IRendererAdapter`)
- Modify: `src/compiler/renderer/adapter.ts` (declare `IRendererAdapter` there)
- Modify: `tsconfig.cli.json` (correct its DOM comment, see Step 3)
- Create: `src/package/index.ts`, `src/package/index.test.ts`, `src/package/boundary.test.ts`
- Create: `tsconfig.lib.json`, `vite.lib.config.ts`, `tools/build/fix-dts-extensions.mjs`
- Modify: `tsconfig.node.json` (add `vite.lib.config.ts` to `include`, so `npm run build` typechecks it)
- Modify: `package.json` (script `build:lib` only; the rest is Task 10)

**Interfaces:**
- Produces:
  ```ts
  export interface CompileResult {
    readonly ok: boolean;
    readonly ir: IRSceneNode | null;
    readonly errors: ReadonlyArray<CompilerError>;
  }
  export function compile(source: string): CompileResult;
  export type * from "../compiler/sceneIR";
  export type { CompilerError } from "../compiler/types";
  ```
  Built to `dist/lib/marey.mjs`, with declarations at
  `dist/lib/types/package/index.d.ts`.

- [ ] **Step 1: Write the failing tests.** `src/package/index.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { compile } from "./index";

  describe("compile (the public entry)", () => {
    it("returns the IR and no errors for a valid scene", () => {
      const out = compile(`scene { size: (800, 600) circle c { position: (1, 2), radius: 3 } }`);
      expect(out.ok).toBe(true);
      expect(out.errors).toEqual([]);
      expect(out.ir!.width).toBe(800);
    });

    it("returns the errors and a null IR for invalid source", () => {
      const out = compile("banana");
      expect(out.ok).toBe(false);
      expect(out.ir).toBeNull();
      expect(out.errors[0].message).toContain("must begin with the 'scene' keyword");
    });

    // The public type is deliberately narrower than CompileOutcome, so
    // compileSource's internal fields (symbols, tokenCount,
    // topLevelObjectCount) can change without a breaking release (spec §2.3).
    it("exposes exactly ok, ir and errors", () => {
      expect(Object.keys(compile("banana")).sort()).toEqual(["errors", "ir", "ok"]);
    });
  });
  ```
  `src/package/boundary.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";

  // Every non-test source file under src/compiler and src/package, as raw text
  // keyed by its path relative to this file ("../compiler/sceneIR.ts",
  // "./index.ts").
  const SOURCES = {
    ...import.meta.glob(["../compiler/**/*.ts", "!../compiler/**/*.test.ts"], { query: "?raw", import: "default", eager: true }),
    ...import.meta.glob(["./*.ts", "!./*.test.ts"], { query: "?raw", import: "default", eager: true }),
  } as Record<string, string>;

  const SPECIFIER = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

  function join(fromFile: string, spec: string): string {
    const parts = fromFile.split("/").slice(0, -1);
    for (const seg of spec.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    return parts.join("/");
  }

  function resolve(fromFile: string, spec: string): string | null {
    const base = join(fromFile, spec);
    for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
      if (candidate in SOURCES) return candidate;
    }
    return null;
  }

  /** Every file and every bare package specifier reachable from `entry`, type imports included. */
  function reach(entry: string): { files: Set<string>; packages: Set<string> } {
    const files = new Set<string>();
    const packages = new Set<string>();
    const visit = (file: string): void => {
      if (files.has(file)) return;
      files.add(file);
      for (const [, spec] of SOURCES[file].matchAll(SPECIFIER)) {
        if (spec.startsWith(".")) {
          const next = resolve(file, spec);
          if (next) visit(next);
        } else {
          packages.add(spec);
        }
      }
    };
    visit(entry);
    return { files, packages };
  }

  const FORBIDDEN_PACKAGES = ["pixi.js", "matter-js", "mediabunny", "harfbuzzjs", "playwright-core", "preact", "zustand", "monaco-editor"];

  describe("the public library's boundary", () => {
    const { files, packages } = reach("./index.ts");

    it("reaches the compiler", () => {
      expect(files.has("../compiler/compileSource.ts")).toBe(true);
    });

    it("never reaches the renderer or the exporters", () => {
      const leaked = [...files].filter((f) => f.startsWith("../compiler/renderer/") || f.startsWith("../compiler/export/"));
      expect(leaked).toEqual([]);
    });

    // Names, not "no packages at all": the naive specifier scan also matches
    // "from '...'" inside diagnostic message strings in the parser (measured
    // 2026-09-27), so an emptiness assertion would fail for the wrong reason.
    it("imports none of the rendering, export, browser or app packages", () => {
      const hits = [...packages].filter((p) => FORBIDDEN_PACKAGES.some((f) => p === f || p.startsWith(`${f}/`)));
      expect(hits).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run them and read the failures.**
  `npx vitest run src/package`. Expected: `index.test.ts` fails with "Failed
  to resolve import './index'", and `boundary.test.ts` fails in `reach` because
  `SOURCES["./index.ts"]` is undefined. If either fails for any other reason,
  fix the test before going on (engineering-lessons §3d).

- [ ] **Step 3: Move `IRendererAdapter`** from `sceneIR.ts` into
  `renderer/adapter.ts` unchanged, and update `adapter.ts`'s import. Correct
  `tsconfig.cli.json`'s DOM comment: after this move the CLI still needs `DOM`,
  but for Task 7's `page.evaluate` callbacks, not for `sceneIR.ts`. Run
  `npx tsc -b --noEmit`: exit 0.

- [ ] **Step 4: Write `src/package/index.ts`.**
  ```ts
  import { compileSource } from "../compiler/compileSource";
  import type { IRSceneNode } from "../compiler/sceneIR";
  import type { CompilerError } from "../compiler/types";

  /** What `compile` returns. Narrower than the internal `CompileOutcome` on purpose (spec §2.3). */
  export interface CompileResult {
    readonly ok: boolean;
    readonly ir: IRSceneNode | null;
    readonly errors: ReadonlyArray<CompilerError>;
  }

  /** Compile Marey source to its Scene IR. Pure and synchronous: no DOM, no rendering. */
  export function compile(source: string): CompileResult {
    const { ok, ir, errors } = compileSource(source);
    return { ok, ir, errors };
  }

  export type * from "../compiler/sceneIR";
  export type { CompilerError } from "../compiler/types";
  ```

- [ ] **Step 5: Run the tests.** `npx vitest run src/package`: all pass. Then:
  - replace `compile`'s body with `return compileSource(source);`: "exposes
    exactly ok, ir and errors" goes red. Restore.
  - add `import "pixi.js";` to `compileSource.ts`: the package test goes red.
    Restore.
  - add `import type { Container } from "pixi.js";` to `compileSource.ts`: the
    package test goes red (type imports are forbidden too). Restore.
  - add `import "../export/frameHash";` to `sceneIR.ts`: "never reaches the
    renderer or the exporters" goes red. Restore.

  Record all four red runs.

- [ ] **Step 6: The library build.** `tsconfig.lib.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022"],
      "types": [],
      "module": "ESNext",
      "moduleResolution": "bundler",
      "allowImportingTsExtensions": true,
      "verbatimModuleSyntax": true,
      "strict": true,
      "skipLibCheck": false,
      "declaration": true,
      "emitDeclarationOnly": true,
      "rootDir": "src",
      "outDir": "dist/lib/types"
    },
    "include": ["src/package/index.ts"]
  }
  ```
  `lib: ["ES2022"]` with no DOM is deliberate: if the compiler graph ever
  names a DOM type, this build fails.

  `vite.lib.config.ts`: a library build of `src/package/index.ts` to
  `dist/lib/marey.mjs`, ES format, `target: "node22"`, `emptyOutDir: false`,
  `copyPublicDir: false`. Use `fileName: () => "marey.mjs"`, as
  `vite.cli.config.ts` does, for the reason its comment gives.

  `tools/build/fix-dts-extensions.mjs` walks `dist/lib/types/**/*.d.ts` and
  rewrites each relative specifier to add `.js`, or `/index.js` when the
  target is a directory with an `index.d.ts`. Without this, a consumer using
  `moduleResolution: "nodenext"` cannot resolve the extensionless specifiers
  `tsc` emits; Task 10's consumer typecheck proves it.

  `package.json`:
  `"build:lib": "vite build --config vite.lib.config.ts && tsc -p tsconfig.lib.json && node tools/build/fix-dts-extensions.mjs"`.

- [ ] **Step 7: Build and inspect.** Run `npm run build:lib`. Confirm that:
  - `dist/lib/marey.mjs` exists and `grep -c pixi dist/lib/marey.mjs` prints 0;
  - `dist/lib/types/package/index.d.ts` exists;
  - `grep -rnE "from \"\.[^\"]*\"" dist/lib/types | grep -v '\.js"'` prints
    nothing, so every relative specifier ends in `.js`.

  Record the bundle size.

- [ ] **Step 8: Run all four checks, then commit.**
  ```bash
  git add src/compiler/sceneIR.ts src/compiler/renderer/adapter.ts tsconfig.cli.json tsconfig.node.json src/package/index.ts src/package/index.test.ts src/package/boundary.test.ts tsconfig.lib.json vite.lib.config.ts tools/build/fix-dts-extensions.mjs package.json
  git commit -m "feat(package): a pure compile() library entry, with its boundary pinned by test"
  ```

---

## Task 3: CLI command table, `--help`, `--version` (tier: mechanical)

Spec §3.

**Files:**
- Create: `src/cli/main.ts`, `src/cli/main.test.ts`
- Modify: `src/cli/check.ts` (rename `main` to `runCheck`, taking the arguments after `check`)
- Modify: `vite.cli.config.ts` (entry `src/cli/main.ts`; `copyPublicDir: false`; `external: [/^node:/, "playwright-core"]`)
- Modify: `tsconfig.cli.json` (`"resolveJsonModule": true`)

**Interfaces:**
- Produces:
  - `main(argv: readonly string[]): Promise<number>`, the bundle entry that
    `bin/marey.mjs` already calls;
  - `COMMANDS: Readonly<Record<string, (rest: readonly string[]) => Promise<number>>>`;
  - `runCheck(rest)` in `check.ts`.

  Task 7 adds `export: runExport` to `COMMANDS`.

- [ ] **Step 1: Failing tests.** `src/cli/main.test.ts`:
  ```ts
  import { describe, it, expect, vi, afterEach } from "vitest";
  import { main, COMMANDS } from "./main";
  import packageJson from "../../package.json";

  afterEach(() => vi.restoreAllMocks());

  describe("main", () => {
    it("prints the package version for --version and exits 0", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      expect(await main(["--version"])).toBe(0);
      expect(log).toHaveBeenCalledWith(packageJson.version);
    });

    it("prints usage naming every command for --help and exits 0", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      expect(await main(["--help"])).toBe(0);
      const text = log.mock.calls.map((c) => String(c[0])).join("\n");
      for (const name of Object.keys(COMMANDS)) expect(text).toContain(`marey ${name}`);
    });

    it("prints usage to stderr and exits 1 with no arguments", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await main([])).toBe(1);
      expect(String(err.mock.calls[0][0])).toContain("marey check");
    });

    it("names an unknown command and lists the real ones", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await main(["frobnicate"])).toBe(1);
      const text = String(err.mock.calls[0][0]);
      expect(text).toContain("Unknown command 'frobnicate'");
      expect(text).toContain("check");
    });

    it("dispatches check with the arguments after the command name", async () => {
      const spy = vi.spyOn(COMMANDS, "check").mockResolvedValue(0);
      await main(["check", "--export-ready", "a.marey"]);
      expect(spy).toHaveBeenCalledWith(["--export-ready", "a.marey"]);
    });
  });
  ```
  `COMMANDS` must be a plain mutable object, so `vi.spyOn(COMMANDS, "check")`
  can replace the property. Do not freeze it. `main` must look the command up
  as `COMMANDS[name]` when it is called, not destructure it at module load, or
  the spy is never reached.

- [ ] **Step 2:** `npx vitest run src/cli/main.test.ts`. Expected: fails to
  resolve `./main`.

- [ ] **Step 3: Implement.**
  - Move `main`'s file loop out of `check.ts` as
    `export async function runCheck(rest: readonly string[]): Promise<number>`,
    with the `check`-token stripping removed.
  - `main.ts` holds `USAGE`, which lists both commands' synopses exactly as
    spec §3 shows them, and `COMMANDS = { check: runCheck }`.
  - `main` handles no arguments (usage to stderr, 1), `--help`/`-h` (usage to
    stdout, 0), `--version`/`-v` (`packageJson.version`, 0), an unknown
    command, and dispatch.
  - `import packageJson from "../../package.json";`: with
    `resolveJsonModule`, Vite bundles it.

- [ ] **Step 4:** `npx vitest run src/cli`: all pass, including the unchanged
  `check.test.ts`. Revert `--version` to print a literal `"0.0.0"`: red.
  Restore. Then `npm run build:cli`, and confirm that:
  - `ls dist/cli` shows only `marey.mjs` (no `fonts/`, no `og-image.png`);
  - `node bin/marey.mjs --version` prints `0.3.1`;
  - `node bin/marey.mjs check eval/scenes-3b/*.marey` prints four `ok` lines.

- [ ] **Step 5: Checks, commit.**
  ```bash
  git add src/cli/main.ts src/cli/main.test.ts src/cli/check.ts vite.cli.config.ts tsconfig.cli.json
  git commit -m "feat(cli): command table with --help and --version; stop copying public/ into dist/cli"
  ```

---

## Task 4: `pngPipeline.ts` (tier: integration)

Spec §4.3. The PNG sequence exists only inside `devExportSeam.ts`. Move it into
a pipeline, and make the seam observe it, as 5B did for video.

**Files:**
- Create: `src/compiler/export/pngPipeline.ts`, `src/compiler/export/pngPipeline.test.ts`
- Modify: `src/lib/devExportSeam.ts` (observe `runPngExport`)
- Modify: `src/compiler/export/pngSequence.ts` (delete `encodePngSequence`, which then has no caller; keep `pngBytesOf`)
- Modify: `src/compiler/export/exportBoundary.test.ts` (two structural tests)

**Interfaces:**
- Produces:
  ```ts
  export interface PngExportObserver {
    readonly onSampled?: (frames: ReadonlyArray<FrameSnapshot>) => void;
  }
  export interface RunPngExportOptions {
    readonly source: string;
    readonly fps: number;
    readonly durationSeconds?: number;
    /** Awaited once per frame, in the sampler's order; `frame.index` places it. */
    readonly onPng: (frame: FrameSnapshot, png: Uint8Array) => void | Promise<void>;
    readonly observer?: PngExportObserver;
  }
  export interface PngExportResult {
    readonly fps: number;
    readonly frameCount: number;
    readonly width: number;
    readonly height: number;
  }
  export function runPngExport(opts: RunPngExportOptions): Promise<PngExportResult>;
  ```
  Task 9 adds `size: "scene" | "video"` to the options.

- [ ] **Step 1: Baseline.** With the dev server up:
  `node tools/visual-check/export-check.mjs --scene eval/scenes-3b/compound-logo.marey --fps 30 --out .visual-check/phase6/png-before`.
  Record `report.json`'s hash and frame SHA-256s.

- [ ] **Step 2: Failing headless tests.** `pngPipeline.test.ts` covers the
  refusal paths that run before any `Application` exists, in the style of
  `videoPipeline.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { runPngExport } from "./pngPipeline";

  const noop = () => {};

  describe("runPngExport refusals (before any Application exists)", () => {
    it("rejects source that does not compile, naming the parse error", async () => {
      await expect(runPngExport({ source: "banana", fps: 30, onPng: noop })).rejects.toThrow(
        "must begin with the 'scene' keyword",
      );
    });

    it("rejects an unbounded scene with planExport's diagnostic, verbatim", async () => {
      await expect(
        runPngExport({ source: `scene { size: (100, 100) }`, fps: 30, onPng: noop }),
      ).rejects.toThrow(/^\[EXPORT_/);
    });
  });
  ```
  Before writing the second test, run
  `node bin/marey.mjs check --export-ready --fps 30` on that source (after
  `npm run build:cli`), confirm which `EXPORT_` code it gets, and tighten the
  regex to that code.

  `exportBoundary.test.ts` gets two tests, using its existing `importsModule`
  and its `?raw` imports of `pngPipeline.ts` and `devExportSeam.ts`:
  - `pngPipeline.ts` does not import any dev seam;
  - `devExportSeam.ts` imports `pngPipeline` and does not import `rasterExport`.
    It observes the pipeline; it doesn't hold a copy of it.

- [ ] **Step 3:** Run them. The pipeline tests fail to resolve the module, and
  the seam test fails because `devExportSeam.ts` imports `rasterExport`.

- [ ] **Step 4: Implement.** `runPngExport` calls
  `withRasterExport({ source, fps, durationSeconds, scale: 1 }, ...)`, and its
  `use` callback runs:
  ```ts
  async ({ ir, plan, frames, rasterize }) => {
    observer.onSampled?.(frames);
    let lastYield = performance.now();
    for (const frame of frames) {
      const canvas = rasterize(frame);
      const png = await pngBytesOf(canvas);
      canvas.width = 0;
      canvas.height = 0;
      await opts.onPng(frame, png);
      if (performance.now() - lastYield >= YIELD_EVERY_MS) {
        await yieldToEventLoop();
        lastYield = performance.now();
      }
    }
    return { fps: plan.fps, frameCount: plan.frameCount, width: ir.width, height: ir.height };
  }
  ```
  `devExportSeam.ts`'s `exportPng` calls `runPngExport`. Its `onPng` stores
  `toBase64(png)` at `frame.index` in a preallocated array, and
  `observer.onSampled` supplies the frames for `hashFrames`. Its error
  re-prefixing stays exactly as it is.

- [ ] **Step 5: Verify.** `npm test` passes. Re-run Step 1's command into
  `png-before`'s sibling `png-after`: the hash and every frame's SHA-256 must
  equal Step 1's. Then two mutations:
  - reverse `frames` inside `runPngExport`: export-check must fail its
    comparison. It compares run A with run B, both reversed, so if it stays
    green, record that per §2f and compare against Step 1's hashes instead,
    which must differ;
  - drop the `canvas.width = 0` lines: nothing observable changes. Record that
    this is memory hygiene, not guarded behaviour, as `runApngExport`'s comment
    already says.

  Kill the server.

- [ ] **Step 6: Checks, commit.**
  ```bash
  git add src/compiler/export/pngPipeline.ts src/compiler/export/pngPipeline.test.ts src/lib/devExportSeam.ts src/compiler/export/pngSequence.ts src/compiler/export/exportBoundary.test.ts
  git commit -m "refactor(export): move the PNG sequence into runPngExport; the dev seam observes it"
  ```

---

## Task 5: The export page (tier: architecture)

Spec §4.2–4.3.

**Files:**
- Create: `src/exportPage/protocol.ts`, `src/exportPage/main.ts`, `src/exportPage/index.html`
- Create: `vite.exportpage.config.ts`
- Modify: `tsconfig.node.json` (add `vite.exportpage.config.ts` to `include`)
- Modify: `package.json` (script `build:export-page`)
- Modify: `src/compiler/export/exportBoundary.test.ts`

**Interfaces:**
- Produces, in `protocol.ts` (pure: no DOM use at runtime, types only):
  ```ts
  export const EXPORT_ORIGIN = "https://marey.export";
  export const FRAME_PATH = "/frame/";
  export type CliExportFormat = "png" | "apng" | "webm" | "mp4" | "lottie";
  export interface CliExportRequest {
    readonly source: string;
    readonly format: CliExportFormat;
    readonly fps: number;
    readonly durationSeconds?: number;
  }
  export type CliExportResult =
    | {
        readonly ok: true;
        readonly fps: number;
        readonly frameCount: number;
        readonly width: number;
        readonly height: number;
        /** hashFrames over the sampled snapshots. */
        readonly hash: string;
        /** apng, webm, and mp4 when it goes through WebCodecs: the whole file. */
        readonly fileBase64: string | null;
        /** lottie: JSON.stringify(doc), the exact string the button downloads. */
        readonly text: string | null;
      }
    | { readonly ok: false; readonly message: string };
  declare global {
    interface Window {
      __mareyCliExport?: (request: CliExportRequest) => Promise<CliExportResult>;
    }
  }
  ```
  `png`, and `mp4` through x264, send frames out of band. Each frame is a
  `POST` of the PNG bytes to `EXPORT_ORIGIN + FRAME_PATH + frame.index`, and
  both `fileBase64` and `text` are `null`.
- Produces: `dist/export-page/` containing `index.html`, `assets/*`,
  `fonts/JetBrainsMono-Regular.ttf` and `third-party-licenses.txt`.

- [ ] **Step 1: Structural tests first.** Add to `exportBoundary.test.ts`, with
  `?raw` imports of `src/exportPage/main.ts` and `protocol.ts`:
  - `main.ts` imports no dev seam and nothing under `src/components/`,
    `src/hooks/` or `src/store/`, so a UI change can't reach it (spec §11);
  - `main.ts` reaches the pipelines only through `runPngExport`,
    `runApngExport`, `runVideoExport` and `runLottieExport`, and never imports
    `rasterExport` (R45);
  - `protocol.ts` imports nothing.

  Run them. Expected: they fail to resolve the `?raw` imports.

- [ ] **Step 2: `index.html`.** It declares the same `@font-face` as
  `src/styles/global.scss:3-9` (family `'JetBrains Mono'`,
  `url('/fonts/JetBrainsMono-Regular.ttf')`, `font-display: block`), so
  `ensureExportFonts` and `fetchExportFont` find the font where they already
  look (`EXPORT_FONT_URL`), and loads `/main.ts` as a module. No other markup.

- [ ] **Step 3: `main.ts`.** Install `window.__mareyCliExport`:
  - `png`: `runPngExport`, whose `onPng` does
    `await fetch(EXPORT_ORIGIN + FRAME_PATH + frame.index, { method: "POST", body: png })`
    and throws if `!response.ok`.
  - `apng`: `runApngExport` → `fileBase64`.
  - `webm`: `runVideoExport({ container: "webm" })` → `fileBase64`, with
    width and height from `observer.onPlanned`'s `VideoPlan` (the coded size).
  - `mp4`: until Task 9, the same as `webm` with `container: "mp4"`.
  - `lottie`: `runLottieExport` → `text: JSON.stringify(doc)`.

  Every branch takes `hash` from `hashFrames` over `observer.onSampled`'s
  frames. A thrown error becomes `{ ok: false, message: error.message }`,
  verbatim. Base64 uses the chunked `toBase64` shape from `devExportSeam.ts`,
  moved into `protocol.ts` as an exported pure function. Before moving it, run
  `grep -rn "function toBase64" src/`. Every seam that holds its own copy
  imports the one in `protocol.ts` instead, so the page does not add another
  copy. Add each seam that changed to Step 7's `git add`.

- [ ] **Step 4: `vite.exportpage.config.ts`.**
  - `root: "src/exportPage"`, `base: "/"`, `publicDir: resolve("public")`.
    `publicDir` stays set so the licence plugin can read the font licences.
  - `build.outDir: resolve("dist/export-page")`, `build.emptyOutDir: true`,
    `build.copyPublicDir: false`.
  - `plugins: [thirdPartyLicenses(), exportFont()]`, where `exportFont` is a
    small inline plugin whose `generateBundle` emits
    `public/fonts/JetBrainsMono-Regular.ttf` as the asset
    `fonts/JetBrainsMono-Regular.ttf`.

  The licence file will also list the Syne fonts, which the page doesn't use:
  the plugin reads every font in `public/fonts/`. That over-lists, which is the
  safe direction; note it in the config's comment.

  `package.json`:
  `"build:export-page": "vite build --config vite.exportpage.config.ts"`.

- [ ] **Step 5: Build and inspect.** `npm run build:export-page`, then
  `ls -R dist/export-page`. Confirm:
  - the font, the HarfBuzz `.wasm`, and `third-party-licenses.txt` naming
    pixi.js, matter-js, mediabunny, harfbuzzjs and JetBrains Mono;
  - no `og-image.png` and no `favicon.svg`.

  Record the total size of `dist/export-page`.

- [ ] **Step 6: Structural tests pass**, and each fails when you add
  `import "../lib/devExportSeam";` to `main.ts`. Restore.

- [ ] **Step 7: Checks, commit.**
  ```bash
  git add src/exportPage/ vite.exportpage.config.ts tsconfig.node.json package.json src/compiler/export/exportBoundary.test.ts src/lib/devExportSeam.ts src/lib/devVideoSeam.ts
  git commit -m "feat(export): a UI-free export page that calls the existing pipelines"
  ```

---

## Task 6: Pure pieces of `marey export` (tier: integration)

Spec §3, §3.1, §4.4.

**Files:**
- Create: `src/cli/exportArgs.ts`, `src/cli/exportArgs.test.ts`
- Create: `src/cli/frameAssembler.ts`, `src/cli/frameAssembler.test.ts`
- Create: `src/cli/exportReport.ts`, `src/cli/exportReport.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // exportArgs.ts
  export interface ExportArgs {
    readonly file: string;
    readonly format: CliExportFormat;
    readonly fps: number;
    readonly durationSeconds: number | null;
    readonly out: string;
    readonly error: string | null;
  }
  export const EXPORT_USAGE: string;
  export function parseExportArgs(argv: readonly string[]): ExportArgs;
  export function defaultOutPath(file: string, format: CliExportFormat): string;
  export function frameFileName(index: number, frameCount: number): string;

  // frameAssembler.ts
  export class FrameAssembler {
    constructor(frameCount: number);
    /** Store frame `index`; return every frame now ready, in order, starting from the next one due. */
    add(index: number, bytes: Uint8Array): Array<{ index: number; bytes: Uint8Array }>;
    /** Throw unless every frame has been handed on. */
    finish(): void;
  }

  // exportReport.ts
  export interface ExportSummary {
    readonly out: string;
    readonly frameCount: number;
    readonly fps: number;
    readonly width: number;
    readonly height: number;
    readonly bytes: number;
    readonly sha256: string;
    readonly hash: string;
    readonly ffmpeg?: string;
  }
  export function summaryLine(s: ExportSummary): string;
  export const BROWSER_INSTALL_COMMAND = "npx --package playwright-core@1.62.1 playwright-core install chromium-headless-shell";
  export function browserMissingMessage(): string;
  /** The [EXPORT_BROWSER_MISSING] message if `error` is Playwright's missing-executable error, else null. */
  export function mapLaunchError(error: unknown): string | null;
  ```

- [ ] **Step 1: Measure Playwright's real missing-browser message**
  (engineering-lessons §3d):
  ```bash
  mkdir -p .visual-check/phase6/no-browsers
  PLAYWRIGHT_BROWSERS_PATH=.visual-check/phase6/no-browsers node -e "import('playwright').then(p=>p.chromium.launch()).catch(e=>console.log(e.message))"
  ```
  Record the text. The test below pins the smallest distinctive substring it
  contains. The expected substring is `Executable doesn't exist`; use whatever
  the run actually shows.

- [ ] **Step 2: Failing tests.** `exportArgs.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { parseExportArgs, defaultOutPath, frameFileName } from "./exportArgs";

  describe("parseExportArgs", () => {
    it("reads the file, format and defaults", () => {
      const a = parseExportArgs(["scenes/logo.marey", "--format", "webm"]);
      expect(a).toMatchObject({ file: "scenes/logo.marey", format: "webm", fps: 30, durationSeconds: null, out: "logo.webm", error: null });
    });
    it("reads --fps, --duration and --out", () => {
      const a = parseExportArgs(["a.marey", "--format", "png", "--fps", "24", "--duration", "2.5", "--out", "x"]);
      expect(a).toMatchObject({ fps: 24, durationSeconds: 2.5, out: "x", error: null });
    });
    it("requires --format", () => {
      expect(parseExportArgs(["a.marey"]).error).toContain("--format");
    });
    it("rejects an unknown format, naming the real ones", () => {
      const e = parseExportArgs(["a.marey", "--format", "gif"]).error!;
      expect(e).toContain("'gif'");
      for (const f of ["png", "apng", "webm", "mp4", "lottie"]) expect(e).toContain(f);
    });
    it("rejects a --scale flag rather than reading it as a file (spec §3: no --scale)", () => {
      expect(parseExportArgs(["a.marey", "--format", "mp4", "--scale", "1"]).error).toContain("Unrecognized option '--scale'");
    });
    it("rejects two input files", () => {
      expect(parseExportArgs(["a.marey", "b.marey", "--format", "png"]).error).toContain("one file");
    });
    it("rejects a non-numeric or non-positive --duration", () => {
      expect(parseExportArgs(["a.marey", "--format", "png", "--duration", "soon"]).error).toContain("--duration");
      expect(parseExportArgs(["a.marey", "--format", "png", "--duration", "0"]).error).toContain("--duration");
    });
  });

  describe("defaultOutPath", () => {
    it("matches the button's file names, in the working directory", () => {
      expect(defaultOutPath("dir/logo.marey", "mp4")).toBe("logo.mp4");
      expect(defaultOutPath("dir/logo.marey", "webm")).toBe("logo.webm");
      expect(defaultOutPath("dir/logo.marey", "apng")).toBe("logo.png");
      expect(defaultOutPath("dir/logo.marey", "lottie")).toBe("logo.json");
      expect(defaultOutPath("dir/logo.marey", "png")).toBe("logo-frames");
    });
  });

  describe("frameFileName", () => {
    it("pads to four digits, or more when the count needs it", () => {
      expect(frameFileName(7, 240)).toBe("frame_0007.png");
      expect(frameFileName(7, 12000)).toBe("frame_00007.png");
    });
  });
  ```
  `frameAssembler.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { FrameAssembler } from "./frameAssembler";

  const b = (n: number) => new Uint8Array([n]);

  describe("FrameAssembler", () => {
    it("hands frames on in index order when they arrive in order", () => {
      const a = new FrameAssembler(2);
      expect(a.add(0, b(0)).map((f) => f.index)).toEqual([0]);
      expect(a.add(1, b(1)).map((f) => f.index)).toEqual([1]);
      expect(() => a.finish()).not.toThrow();
    });
    it("holds an early frame until the frames before it arrive (placed by index, not arrival)", () => {
      const a = new FrameAssembler(3);
      expect(a.add(2, b(2))).toEqual([]);
      expect(a.add(0, b(0)).map((f) => f.index)).toEqual([0]);
      expect(a.add(1, b(1)).map((f) => f.index)).toEqual([1, 2]);
    });
    it("refuses a duplicate", () => {
      const a = new FrameAssembler(2);
      a.add(0, b(0));
      expect(() => a.add(0, b(9))).toThrow("frame 0 arrived twice");
    });
    it("refuses an index outside the plan", () => {
      expect(() => new FrameAssembler(2).add(2, b(2))).toThrow("frame 2 is outside 0..1");
    });
    it("refuses to finish with a gap, naming the first missing frame", () => {
      const a = new FrameAssembler(3);
      a.add(0, b(0));
      a.add(2, b(2));
      expect(() => a.finish()).toThrow("frame 1 never arrived");
    });
  });
  ```
  `exportReport.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { summaryLine, mapLaunchError, BROWSER_INSTALL_COMMAND } from "./exportReport";

  describe("summaryLine", () => {
    const base = { out: "logo.webm", frameCount: 240, fps: 30, width: 1600, height: 1200, bytes: 123456, sha256: "ab".repeat(32), hash: "26cca4e9" };
    it("is exactly the documented format", () => {
      expect(summaryLine(base)).toBe(`wrote logo.webm  240 frames @ 30 fps  1600x1200  123456 B  sha256 ${"ab".repeat(32)}  frames 26cca4e9`);
    });
    it("appends the ffmpeg version when there is one", () => {
      expect(summaryLine({ ...base, ffmpeg: "7.1" })).toMatch(/  frames 26cca4e9  ffmpeg 7\.1$/);
    });
  });

  describe("mapLaunchError", () => {
    it("maps Playwright's missing-executable error to EXPORT_BROWSER_MISSING with the pinned install command", () => {
      const m = mapLaunchError(new Error("browserType.launch: Executable doesn't exist at C:\\x\\chrome-headless-shell.exe"));
      expect(m).toMatch(/^\[EXPORT_BROWSER_MISSING\] /);
      expect(m).toContain(BROWSER_INSTALL_COMMAND);
    });
    it("leaves any other launch error alone", () => {
      expect(mapLaunchError(new Error("spawn EACCES"))).toBeNull();
    });
  });
  ```
  Replace the fixture string in the first `mapLaunchError` test with the one
  Step 1 recorded.

- [ ] **Step 3:** `npx vitest run src/cli`: the new files fail to resolve.

- [ ] **Step 4: Implement.** The usage text lists the formats from one array:
  `const FORMATS = ["png", "apng", "webm", "mp4", "lottie"] as const satisfies readonly CliExportFormat[];`.
  Flag handling follows `check.ts`'s `parseArgs`: the first error wins; any
  unrecognized `--` token is an error, never a file name.
  `FrameAssembler`'s messages are `[export] frame N arrived twice`,
  `[export] frame N is outside 0..M`, and `[export] frame N never arrived`.

- [ ] **Step 5:** Tests pass. Run the delete-and-run check on each rule the
  tests name: the FORMATS check, the duplicate check, the range check, the gap
  check, and the arrival-order hold (make `add` return the frame immediately).
  Record the red runs.

- [ ] **Step 6: Checks, commit.**
  ```bash
  git add src/cli/exportArgs.ts src/cli/exportArgs.test.ts src/cli/frameAssembler.ts src/cli/frameAssembler.test.ts src/cli/exportReport.ts src/cli/exportReport.test.ts
  git commit -m "feat(cli): export argument parsing, index-keyed frame assembly and the summary line"
  ```

---

## Task 7: `marey export` end to end, for png, apng, webm, lottie (tier: architecture)

Spec §4.4.

**Files:**
- Create: `src/cli/exportDriver.ts`
- Modify: `src/cli/main.ts` (add `export` to `COMMANDS`; export `exportScene` and `EXPORT_LAUNCH_ARGS` from the bundle)
- Modify: `package.json` (move `playwright-core` to `dependencies` at exactly `1.62.1`, pin `playwright` exactly; see Step 1)

**Interfaces:**
- Consumes: Task 5's protocol, Task 6's pure pieces, `compileSource` and
  `planExport` for the preflight.
- Produces:
  ```ts
  export const EXPORT_LAUNCH_ARGS: readonly string[]; // Global Constraint 7
  export interface ExportSceneOptions {
    readonly source: string;
    readonly format: CliExportFormat;
    readonly fps: number;
    readonly durationSeconds: number | null;
    /** Directory holding the built export page. Defaults to ../export-page next to the CLI bundle. */
    readonly pageRoot?: string;
    /** Called with each lossless frame, in index order. For checks, not a CLI flag. */
    readonly onFrame?: (index: number, png: Uint8Array) => void | Promise<void>;
    /** Request paths the route handler aborts. For checks (spec §9.2, 5C deferral 14), not a CLI flag. */
    readonly abortPaths?: readonly string[];
  }
  export interface ExportSceneResult {
    readonly fps: number;
    readonly frameCount: number;
    readonly width: number;
    readonly height: number;
    readonly hash: string;
    /** Whole-file formats. */
    readonly file: Uint8Array | null;
    /** png: every frame, in index order. */
    readonly frames: Uint8Array[] | null;
  }
  export function exportScene(opts: ExportSceneOptions): Promise<ExportSceneResult>;
  export function runExport(rest: readonly string[]): Promise<number>;
  ```

- [ ] **Step 1: Dependencies.** In `package.json`:
  - `"dependencies": { "playwright-core": "1.62.1" }`, plus the existing
    runtime entries for now (Task 10 moves those);
  - `"playwright": "1.62.1"` in `devDependencies`.

  Run `npm install --offline`. Then check that `git diff --stat -- package-lock.json`
  shows only the root package's dependency lists changing, and that
  `npm ls playwright-core` shows 1.62.1. If the offline install fails, stop and
  ask the owner to run `npm install` (Global Constraint 15).

- [ ] **Step 2: Implement `exportScene`** in this order:
  1. **Preflight in Node:** `compileSource(source)`. If it's not ok, throw the
     formatted errors. Then
     `planExport(ir, { fps, durationSeconds: durationSeconds ?? undefined })`.
     If that's not ok, throw the diagnostics joined with `" | "`. Keep
     `plan.frameCount` for the `FrameAssembler`.
  2. `chromium.launch({ args: [...EXPORT_LAUNCH_ARGS] })` from
     `playwright-core`. On failure, throw
     `new Error(mapLaunchError(e) ?? String(e))`.
  3. `page.route(EXPORT_ORIGIN + "/**", handler)`:
     - A `POST` to `FRAME_PATH<n>` goes to `assembler.add(n, request.postDataBuffer())`.
       Each returned frame is pushed onto `frames` (png) and passed to
       `onFrame`. Then fulfil with 204.
     - A path in `abortPaths` is aborted.
     - Any other `GET` is served from `pageRoot`: `/` maps to `index.html`, and
       the content type comes from the extension (`.html` text/html, `.js`
       text/javascript, `.wasm` application/wasm, `.ttf` font/ttf, `.txt`
       text/plain). A missing file gets a 404.
  4. `page.goto(EXPORT_ORIGIN + "/")`. Wait for
     `typeof window.__mareyCliExport === "function"`.
  5. `page.evaluate((r) => window.__mareyCliExport!(r), request)`.
  6. If `ok: false`, throw `new Error(message)`. If the page's `frameCount`
     differs from the preflight's, throw an `[export]` error naming both. For
     png, `assembler.finish()`.
  7. Close the browser in `finally`.

  `runExport(rest)`:
  1. `parseExportArgs`. If there's an error, print usage and return 1.
  2. Read the file and call `exportScene`.
  3. Write the output: a file, or for png a directory of `frameFileName`s.
     Lottie's `text` is written as UTF-8 (`Buffer.from(text, "utf8")`), which
     is what the button's `new Blob([string])` produces.
  4. Compute the SHA-256 with `node:crypto` (for png, over the frames
     concatenated in index order) and print `summaryLine`.
  5. On any error, print `file: message` to stderr and return 1.

  `pageRoot` defaults to
  `fileURLToPath(new URL("../export-page/", import.meta.url))`, relative to
  `dist/cli/marey.mjs`.

- [ ] **Step 3: Build and run by hand.**
  ```bash
  npm run build:export-page && npm run build:cli
  for f in png apng webm lottie; do node bin/marey.mjs export eval/scenes-3b/compound-logo.marey --format $f --out .visual-check/phase6/cli/logo-$f; echo "exit $?"; done
  ```
  Expected: four `wrote ...` lines, each exit 0. Look at
  `.visual-check/phase6/cli/logo-png/frame_0120.png` with an image viewer: the
  test card's lesson is that a blank frame hashes consistently. Then repeat
  with `eval/scenes-3b/bar-chart.marey`, which has text.

- [ ] **Step 4: The missing-browser path.**
  `PLAYWRIGHT_BROWSERS_PATH=.visual-check/phase6/no-browsers node bin/marey.mjs export eval/scenes-3b/radial-dots.marey --format png`
  prints `[EXPORT_BROWSER_MISSING] ...` with the install command, and exits 1.

- [ ] **Step 5: Preflight refusals start no browser.** Run
  `node bin/marey.mjs export` on a scene with no `duration` without
  `--duration`. It prints the `EXPORT_` diagnostic and exits 1 within about
  a second. Then run it with `PLAYWRIGHT_BROWSERS_PATH` pointing at the empty
  folder: the same `EXPORT_` diagnostic appears, not `EXPORT_BROWSER_MISSING`.
  That proves the preflight runs before the launch.

- [ ] **Step 6: Checks, commit.**
  ```bash
  git add src/cli/exportDriver.ts src/cli/main.ts package.json package-lock.json
  git commit -m "feat(cli): marey export for png, apng, webm and lottie through the export page"
  ```

---

## Task 8: `npm run check:export` (tier: integration)

Spec §9.2.

**Files:**
- Create: `tools/cli-check/export-matrix.mjs`
- Modify: `package.json` (script `check:export`)
- Modify: `eval/RESULTS-PHASE-6.md` (section "CLI export matrix")

- [ ] **Step 1: Write the script.** It imports `exportScene` and
  `EXPORT_LAUNCH_ARGS` from `../../dist/cli/marey.mjs`, and has two modes.

  **Default** (CI):
  - For each of the four canonical scenes, and each format in
    `png apng webm mp4 lottie`, call `exportScene` twice.
  - Assert the two SHA-256s are equal, the two `hash`es are equal, and for png
    the frame count equals `frameCount`.
  - Print one line per case and exit 1 on any failure.
  - **Font abort** (5C deferral 14): export `bar-chart` as png with
    `abortPaths: ["/fonts/JetBrainsMono-Regular.ttf"]`. Expect a rejection whose
    message starts with `[EXPORT_FONT_UNAVAILABLE]`.

  **`--compare-seams`** (before merge; needs the dev server on 5199):
  - Launch Chromium (`playwright`) with `EXPORT_LAUNCH_ARGS` and open the app.
  - For each canonical scene:
    - `png`: `__mareyExportPng` frames equal the CLI's frames, byte for byte;
    - `apng`: `__mareyExportApng`'s `apng` equals the CLI file;
    - `lottie`: `JSON.stringify(__mareyExportLottie(...).doc)` equals the CLI
      file's text;
    - `webm`: `__mareyExportVideo({ container: "webm" }).video` equals the CLI
      file.
  - Every seam `hash` equals the CLI's.

- [ ] **Step 2: Run the default mode.**
  `npm run build:export-page && npm run build:cli && npm run check:export`.
  Record the pass/fail table and the total time. A real failure is a defect: go
  back to the task that owns it.

- [ ] **Step 3: Run `--compare-seams`** with the dev server up, then kill it.
  - If `webm` bytes differ, that's spec §12's second risk. First look for a
    real difference: container timestamps, the encoder config (compare
    `encoderConfigs`), and frame hashes.
  - If the difference is inherent to the encoder, document it at the encoder
    boundary in `renderer.md` and record it here, per roadmap §8.1.
  - Never loosen the comparison.

- [ ] **Step 4: Mutation.** Swap two frames in the page's png branch (POST
  frame 5's bytes with index 6 and vice versa). `--compare-seams` must fail.
  Restore. Record.

- [ ] **Step 5: Record** both modes' results, their commands and times in
  `eval/RESULTS-PHASE-6.md`.

- [ ] **Step 6: Checks, commit.**
  ```bash
  git add tools/cli-check/export-matrix.mjs package.json eval/RESULTS-PHASE-6.md
  git commit -m "test(cli): export matrix, run twice, compared byte for byte against the dev seams"
  ```

---

## Task 9: MP4 (tier: integration)

Spec §4.3, §5. **Read Task 1's verdict first.**

### If the gate failed

`mp4` already runs through `runVideoExport` in the export page (Task 5, Step 3).
Then:
- record in this plan's execution notes that `EXPORT_FFMPEG_MISSING` and
  `EXPORT_FFMPEG_FAILED` (Global Constraint 10) were not built, and why;
- record in `eval/RESULTS-PHASE-6.md` that `marey export --format mp4` is the
  button's path;
- make `check:export --compare-seams` compare mp4 bytes against
  `__mareyExportVideo({ container: "mp4" })`.

Checks, commit
(`feat(cli): mp4 through the WebCodecs pipeline, per the x264 gate's result`),
and skip to Task 10.

### If the gate passed

**Files:**
- Modify: `src/compiler/export/videoContract.ts`:
  - add `planX264Frames`;
  - widen `deviceLimitDiagnostic`'s first parameter to
    `Pick<VideoPlan, "width" | "height" | "scale" | "sceneWidth" | "sceneHeight">`.
- Modify: `src/compiler/export/videoPipeline.ts`: move the `afterInit` body into
  `export function assertDeviceCanRender(app: Application, plan: Pick<VideoPlan, "width" | "height" | "scale" | "sceneWidth" | "sceneHeight">): void`,
  used by both pipelines.
- Modify: `src/compiler/export/pngPipeline.ts`: add `size?: "scene" | "video"`.
- Modify: `src/exportPage/main.ts`: `mp4` becomes `runPngExport({ size: "video" })` with frames out of band.
- Create: `src/cli/ffmpeg.ts`, `src/cli/ffmpeg.test.ts`
- Modify: `src/cli/exportDriver.ts`, `src/cli/exportReport.ts`
- Modify: `tools/cli-check/export-matrix.mjs`
- Tests: `videoContract.test.ts`, `pngPipeline.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // videoContract.ts
  export interface X264FramesPlan {
    readonly width: number; readonly height: number; readonly scale: number;
    readonly sceneWidth: number; readonly sceneHeight: number;
    readonly fps: number; readonly frameCount: number;
  }
  export function planX264Frames(ir: IRSceneNode, plan: SamplerPlan):
    | { readonly ok: true; readonly plan: X264FramesPlan }
    | { readonly ok: false; readonly diagnostics: ReadonlyArray<VideoDiagnostic> };

  // ffmpeg.ts
  export interface X264Settings { readonly crf: number; readonly preset: string; readonly tune: "animation" | null; readonly threads1: boolean }
  export const X264_SETTINGS: X264Settings; // Task 1's recorded choice
  export function x264Args(fps: number, out: string, s: X264Settings): string[];
  export function hasLibx264(encodersOutput: string): boolean;
  export function ffmpegVersion(versionOutput: string): string | null;
  /** Spawn ffmpeg; returns a writer for PNG frames and a promise for the exit. */
  export function startX264(fps: number, out: string): { write(png: Uint8Array): Promise<void>; end(): Promise<void> };
  ```

- [ ] **Step 1: Failing tests.** In `videoContract.test.ts`:
  ```ts
  describe("planX264Frames", () => {
    // Build `plan` with planExport exactly as the file's existing planVideo
    // tests do (read them first and copy their fixture helper).
    it("codes at VIDEO_SCALE times the scene size", () => {
      const r = planX264Frames(irOf(800, 600), samplerPlanFor(800, 600));
      expect(r.ok && r.plan).toMatchObject({ width: 1600, height: 1200, scale: 2, sceneWidth: 800, sceneHeight: 600 });
    });
    it("does not apply WebCodecs' H.264 level table (x264 chooses its own level)", () => {
      // 3000x2000 codes at 6000x4000 = 93,750 macroblocks: above level 5.1's
      // 36,864, so planVideo refuses it with VIDEO_EXCEEDS_CODEC_LEVELS.
      expect(planVideo(irOf(3000, 2000), samplerPlanFor(3000, 2000), { container: "mp4" }).ok).toBe(false);
      expect(planX264Frames(irOf(3000, 2000), samplerPlanFor(3000, 2000)).ok).toBe(true);
    });
  });
  ```
  `irOf` and `samplerPlanFor` stand for whatever fixture helpers
  `videoContract.test.ts` already uses. Open the file and use its real names.
  If it has none, build the IR with `compileSource` of
  `scene { size: (W, H) duration: 1 }` and the plan with `planExport(ir, { fps: 30 })`.

  `ffmpeg.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { x264Args, hasLibx264, ffmpegVersion, X264_SETTINGS } from "./ffmpeg";

  describe("x264Args", () => {
    it("is exactly the argument list Task 1's gate measured", () => {
      // Paste the chosen config's argument list from eval/RESULTS-PHASE-6.md,
      // "Task 1: x264 gate", with the output path replaced by "out.mp4".
      expect(x264Args(30, "out.mp4", X264_SETTINGS)).toEqual([/* the recorded list */]);
    });
  });
  describe("hasLibx264", () => {
    it("finds libx264 in `ffmpeg -encoders` output", () => {
      expect(hasLibx264(" V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)")).toBe(true);
      expect(hasLibx264(" V....D libvpx               libvpx VP8 (codec vp8)")).toBe(false);
    });
  });
  describe("ffmpegVersion", () => {
    it("reads the version from the first line", () => {
      expect(ffmpegVersion("ffmpeg version 7.1-full_build-www.gyan.dev Copyright (c) 2000-2024")).toBe("7.1-full_build-www.gyan.dev");
    });
  });
  ```
  The `hasLibx264` and `ffmpegVersion` fixtures must be replaced with the lines
  the installed ffmpeg actually prints (Task 1, Step 1). The `[/* the recorded list */]`
  literal is filled from Task 1's record when this task runs. It is the one
  value this plan cannot know in advance, and the test exists to pin it.

- [ ] **Step 2:** Run them: they fail on the missing exports.

- [ ] **Step 3: Implement.**
  - `planX264Frames` reuses `VIDEO_SCALE` and the `VIDEO_ODD_DIMENSIONS` check,
    since yuv420p needs even dimensions.
  - `runPngExport` with `size: "video"` passes `scale: VIDEO_SCALE`, a
    `beforeBuild` running `planX264Frames` (throw its diagnostics joined with
    `" | "`), and `afterInit: (app) => assertDeviceCanRender(app, x264Plan!)`.
    Its result's `width`/`height` are the coded size.
  - The driver:
    1. Before launch, and only for `mp4`, run `ffmpeg -hide_banner -encoders`.
       A spawn failure or `!hasLibx264(...)` throws
       `[EXPORT_FFMPEG_MISSING] marey export --format mp4 needs ffmpeg with libx264 on PATH. Install ffmpeg (for example \`winget install Gyan.FFmpeg\`) and try again.`
    2. Start ffmpeg with `startX264`, feed each frame from
       `FrameAssembler.add` in order, and `end()` after `finish()`.
    3. A non-zero exit throws
       `[EXPORT_FFMPEG_FAILED] ffmpeg exited with code N: <last 5 stderr lines>`.
    4. `summaryLine` gets `ffmpeg: ffmpegVersion(...)`.

- [ ] **Step 4: Verify.**
  - Tests pass.
  - The delete-and-run check on `planX264Frames`'s level exemption (call
    `planVideo` instead: red) and on `hasLibx264` (return true: red). Record
    both.
  - Build, then
    `node bin/marey.mjs export eval/scenes-3b/compound-logo.marey --format mp4 --out .visual-check/phase6/cli/logo.mp4`:
    prints the ffmpeg version and exits 0.
  - Run it again: the same SHA-256.
  - With ffmpeg removed from `PATH` (`PATH=/usr/bin node bin/marey.mjs ...`):
    `[EXPORT_FFMPEG_MISSING]`, exit 1.

- [ ] **Step 5: Extend `check:export`.** Its default mode runs mp4 twice as
  well. `--compare-seams` checks that the CLI's `onFrame` PNGs equal
  `__mareyExportVideo({ container: "mp4", withReferenceFrames: true }).referenceFrames`,
  byte for byte, for every canonical scene. Those are the lossless frames each
  encoder receives (spec §5). Then it scores the CLI's MP4 with
  `scoreInPage` and records PSNR and specks. Run both modes, and record them.

- [ ] **Step 6: Checks, commit.**
  ```bash
  git add src/compiler/export/videoContract.ts src/compiler/export/videoContract.test.ts src/compiler/export/videoPipeline.ts src/compiler/export/pngPipeline.ts src/compiler/export/pngPipeline.test.ts src/exportPage/main.ts src/cli/ffmpeg.ts src/cli/ffmpeg.test.ts src/cli/exportDriver.ts src/cli/exportReport.ts tools/cli-check/export-matrix.mjs eval/RESULTS-PHASE-6.md
  git commit -m "feat(cli): mp4 through the user's ffmpeg and x264, from the same lossless frames"
  ```

---

## Task 10: The package manifest and `check:pack` (tier: integration)

Spec §2.1–2.4, §9.2.

**Files:**
- Modify: `package.json`
- Create: `tools/cli-check/pack-check.mjs`

- [ ] **Step 1: `package.json`.**
  - `"version": "0.4.0"`; remove `"private"` and `"//private"`.
  - `"engines": { "node": ">=22" }`.
  - `"exports": { ".": { "types": "./dist/lib/types/package/index.d.ts", "import": "./dist/lib/marey.mjs" } }`.
  - `"files": ["bin/", "dist/cli/marey.mjs", "dist/lib/", "dist/export-page/"]`.
    npm always adds `LICENSE`, `README.md` and `package.json`.
  - `dependencies`: exactly `{ "playwright-core": "1.62.1" }`. Move harfbuzzjs,
    lz-string, matter-js, mediabunny, monaco-editor, pixi.js, preact and zustand
    to `devDependencies`, keeping each version string exactly as it is.
  - Scripts:
    - `"build:package": "npm run build:lib && npm run build:export-page && npm run build:cli"`
    - `"check:pack": "node tools/cli-check/pack-check.mjs"`
    - `"check:export": "node tools/cli-check/export-matrix.mjs"` (already
      present from Task 8)
    - `"prepublishOnly": "npm test && npm run build && npm run build:package && npm run check:pack"`

  Run `npm install --offline`, then check that `git diff --stat -- package-lock.json`
  shows only dependency-group moves.

  **Risk to check here:** the live site's build installs dependencies too. If
  its host installs with `--production` or `NODE_ENV=production`, moving pixi.js
  and preact to `devDependencies` breaks the site's build. There's no host
  config in the repository, so ask the owner how the site is built before
  committing this step.

- [ ] **Step 2: `pack-check.mjs`.**
  1. `npm run build:package`.
  2. `npm pack --json` into a temporary directory. Record the file count and
     size, and fail if any path starts with `docs/`, `eval/`, `tools/`, `src/`
     or `public/`.
  3. In a new empty temporary directory, `npm init -y`, then
     `npm install --offline <tarball>`.
  4. Run, from there:
     - `npx marey --version` must print `0.4.0`;
     - `npx marey check <copy of eval/scenes-3b/radial-dots.marey>` must exit 0;
     - `npx marey export <that copy> --format lottie` must print a `wrote`
       line. This uses the machine's installed browser; set nothing;
     - `node --input-type=module -e "import { compile } from 'marey'; const r = compile('scene { size: (10, 10) }'); if (!r.ok) process.exit(1)"`.
  5. **Consumer typecheck, both resolution modes.** Write `consumer.ts`:
     ```ts
     import { compile, type IRSceneNode, type CompilerError } from "marey";
     const r = compile("scene { size: (10, 10) }");
     const ir: IRSceneNode | null = r.ir;
     const e: ReadonlyArray<CompilerError> = r.errors;
     export { ir, e };
     ```
     Run the repository's own `node_modules/typescript/bin/tsc` with
     `--noEmit --strict --skipLibCheck false --lib ES2022 --types ""` twice:
     once with `--module esnext --moduleResolution bundler`, once with
     `--module nodenext --moduleResolution nodenext`. Both must exit 0.
  6. `grep -c pixi` on the installed `node_modules/marey/dist/lib/marey.mjs`
     must be 0.

  The script prints each check and exits 1 on the first failure. It deletes its
  temporary directories in `finally`.

- [ ] **Step 3: Run it.** `npm run check:pack`. If the `nodenext` typecheck
  fails, `fix-dts-extensions.mjs` (Task 2) is wrong: fix it there. Record every
  output in `eval/RESULTS-PHASE-6.md`, under "Exit criterion 1: the package
  builds and installs".

- [ ] **Step 4: Mutation.** Delete `fix-dts-extensions.mjs` from `build:lib`:
  the `nodenext` typecheck must go red. Restore. Remove `dist/export-page/`
  from `files`: the `export` step must fail. Restore. Record both.

- [ ] **Step 5: Checks, commit.**
  ```bash
  git add package.json package-lock.json tools/cli-check/pack-check.mjs eval/RESULTS-PHASE-6.md
  git commit -m "feat(package): publishable manifest, one runtime dependency, and an install check"
  ```

---

## Task 11: CI (tier: mechanical). Confirm O8 with the owner first.

Spec §9.3.

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `AGENTS.md` (the one CI sentence, see Step 2)

- [ ] **Step 1: `ci.yml`.** After "Every first-party scene still compiles", add:
  ```yaml
      - name: Install ffmpeg and the pinned browser
        run: |
          sudo apt-get update && sudo apt-get install -y ffmpeg
          npx playwright install --with-deps chromium-headless-shell

      - name: Package builds, packs and installs
        run: npm run check:pack

      - name: marey export, every canonical scene and format, twice
        run: npm run check:export
  ```
  Extend the header comment's list of gates by these two, in the same voice,
  and say why they're allowed in CI when the visual harness isn't: they compare
  numbers and bytes, and need no human reading captures.

- [ ] **Step 2: `AGENTS.md`.** Change "The first, third and fourth are what CI
  runs." to "The first, third and fourth are what CI runs; CI also runs
  `npm run check:pack` and `npm run check:export`." Change nothing else.

- [ ] **Step 3:** The workflow can't be run from here, and no YAML parser is
  installed, so read the staged diff line by line against the existing steps'
  indentation. Record in `eval/RESULTS-PHASE-6.md` that the CI run time is
  measured on the first run after the owner pushes (spec §9.3), and that if it
  exceeds ten minutes, `check:export` gets a `--ci` mode running one scene per
  format.

- [ ] **Step 4: Checks, commit.**
  ```bash
  git add .github/workflows/ci.yml AGENTS.md eval/RESULTS-PHASE-6.md
  git commit -m "ci: run the pack check and the export matrix"
  ```

---

## Task 12: The determinism account, citations, roadmap and renderer docs (tier: integration)

Spec §1.1, §7, §8.

**Files:**
- Create: `docs/determinism.md`
- Modify: `tools/visual-check/README.md` (three citations; the story becomes a pointer)
- Modify: `README.md:90` (one citation only; the README rewrite is Task 13)
- Modify: `tools/visual-check/scenes/logo-freeze.marey:4`
- Modify: `docs/plans/2026-08-26-phase-1-shared-world.md:2298`, `docs/plans/2026-08-27-phase-2-compound-groups.md:3587` (dated notes)
- Modify: `docs/architecture/README.md` (link to `docs/determinism.md`)
- Modify: `docs/architecture/renderer.md` (new section: the export page and the CLI boundary)
- Modify: `docs/specs/2026-09-09-marey-engineering-roadmap-design.md` §9 (a dated correction and a dated amendment)

- [ ] **Step 1: Re-derive the `1ce8307` facts.**
  Run from the repository root:
  ```bash
  git show 1ce8307
  git worktree add ../marey-at-fix 1ce8307
  cmd //c mklink /J "..\\marey-at-fix\\node_modules" "node_modules"
  (cd ../marey-at-fix && npx vitest run 2>&1 | tail -4)                               # the count at 1ce8307
  (cd ../marey-at-fix && git checkout -q 1ce8307^ && npx vitest run 2>&1 | tail -4)   # the count at its parent
  cmd //c rmdir "..\\marey-at-fix\\node_modules"
  git worktree remove --force ../marey-at-fix
  ```
  **Remove the junction before removing the worktree.** `--force` on a worktree
  that still holds the junction can delete the real `node_modules` contents
  through it. If the old tree can't run under today's `node_modules` (Vitest has
  had major versions since), record that per engineering-lessons §2f, count the
  `it(` blocks with `git grep -c "it(" 1ce8307^ -- '*.test.ts'` instead, and say
  which method produced the number.

  Record:
  - the test count at `1ce8307^` (the "94 tests" claim);
  - the count at `1ce8307`;
  - which test `1ce8307` added (its `physicsSync.test.ts` diff);
  - whether that test fails at `1ce8307^`, by copying it back, running it, and
    reading the failure.

  If the count isn't 94, the document says what it is, and the old claim gets a
  dated correction where it appears.

- [ ] **Step 2: Write `docs/determinism.md`** with spec §7.2's five parts, in
  that order, with a command for every claim. Draw the facts from:
  - `renderer.md`: `paintExactTick`, `alpha`'s two directions,
    `physicsWorld.ts`'s gravity and sleeping;
  - `sceneIR.ts`: `TICK_HZ`, `secondsToTicks`;
  - `frameHash.ts`'s docstring;
  - `eval/RESULTS-GATE-B.md`: `Math.sin`;
  - Phase 4's execution notes: paint cadence;
  - Step 1's measurements.

  "How it is verified" names:
  - `npx vitest run src/compiler/determinism.test.ts src/compiler/renderer/frameSampler.test.ts`;
  - the harness's `freeze-midair.marey` check command from
    `tools/visual-check/README.md`;
  - `marey export` twice, compare the lines.

  Run each command before writing its result.

- [ ] **Step 3: Citations.** Replace all seven `f9de4a9`s with `1ce8307`. In the
  two historical plans, add after the line:
  `(Corrected 2026-09-27: the 2026-09-26 history rewrite renamed this commit to 1ce8307.)`.
  `git grep f9de4a9` then prints nothing.

- [ ] **Step 4: Pointers.**
  - In `tools/visual-check/README.md`, cut the "It has already earned its keep"
    paragraph to two sentences and a link to `docs/determinism.md`. Keep the
    traps section: it's procedure, not story.
  - `docs/architecture/README.md` links the new document where it mentions the
    bug the harness caught.

- [ ] **Step 5: `renderer.md`.** Add a section, "The export page and the CLI
  (Phase 6)", covering:
  - what runs in Node: the preflight and the output;
  - what runs in the page: compile, pipelines, encoders;
  - why the page is served through `page.route` on `https://` (the probes);
  - why frames travel as PNG;
  - the launch arguments;
  - that the x264 path shares everything up to the lossless frames (or, if the
    gate failed, that it doesn't exist).

- [ ] **Step 6: Roadmap §9.** Add two blockquotes, in the style of 5A's dated
  corrections:
  - "Corrected 2026-09-27: `LICENSE`, the licence field, a root README,
    `bin/marey.mjs` and `marey check` exist; see Phase 6 design §1.1."
  - "Amended 2026-09-27: the owner added a website redesign to this phase,
    designed separately as Phase 6B."

- [ ] **Step 7: Checks, commit.**
  ```bash
  git add docs/determinism.md tools/visual-check/README.md README.md tools/visual-check/scenes/logo-freeze.marey docs/plans/2026-08-26-phase-1-shared-world.md docs/plans/2026-08-27-phase-2-compound-groups.md docs/architecture/README.md docs/architecture/renderer.md docs/specs/2026-09-09-marey-engineering-roadmap-design.md
  git commit -m "docs: the determinism account in one place, and the dead f9de4a9 citations corrected"
  ```

---

## Phase 6B: the website redesign

Its own design and plan, on this branch, before Task 13. Nothing below starts
until 6B is merged into `phase-6`.

---

## Task 13: The README and its artifact (tier: integration). Confirm O7 with the owner first.

Spec §6.1–6.2.

**Files:**
- Create: `docs/media/bars-reveal.marey`, `docs/media/bars-reveal.png`
- Create: `src/readmeMedia.test.ts`
- Modify: `README.md`
- Modify: `AGENTS.md` (the O7 exception line)

- [ ] **Step 1: Failing test.** `src/readmeMedia.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import readme from "../README.md?raw";
  import barsScene from "../docs/media/bars-reveal.marey?raw";

  // The README's first image is exported from docs/media/bars-reveal.marey,
  // and the README shows that file's source. If the two drift, the image no
  // longer shows the code beside it (engineering-lessons §5).
  describe("README media", () => {
    it("the README's first marey block is exactly docs/media/bars-reveal.marey", () => {
      const block = readme.match(/```marey\r?\n([\s\S]*?)```/)![1];
      expect(block.replace(/\r\n/g, "\n")).toBe(barsScene.replace(/\r\n/g, "\n"));
    });
    it("the README embeds the exported image before its first marey block", () => {
      const img = readme.indexOf("docs/media/bars-reveal.png");
      expect(img).toBeGreaterThan(-1);
      expect(img).toBeLessThan(readme.indexOf("```marey"));
    });
  });
  ```
  Run it: it fails to resolve `bars-reveal.marey`.

- [ ] **Step 2: The scene and the image.** Copy the README's current bars block
  verbatim into `docs/media/bars-reveal.marey`. Then:
  ```bash
  npm run build:export-page && npm run build:cli
  node bin/marey.mjs export docs/media/bars-reveal.marey --format apng --out docs/media/bars-reveal.png
  ```
  The file must be at most 1,000,000 bytes (AGENTS.md). If it's larger, lower
  `--fps` to 24 and record why. Never crop or recolour by hand: the image must
  be exactly what the command produces. Open it in a browser and confirm it
  animates.

- [ ] **Step 3: Rewrite `README.md`** to spec §6.1. Checklist, which is also the
  structural pre-check of spec §6.3:
  - the image, then the bars source, in the first screen;
  - "What's actually hard" names at least two things, with determinism
    summarised and linked to `docs/determinism.md` in the first screen;
  - install and usage: `npx marey check scene.marey`,
    `npx marey export scene.marey --format mp4`, with a note that `export`
    needs the pinned browser (the install command) and, for mp4, ffmpeg;
  - the library: `import { compile } from "marey"`;
  - the stale claims fixed: Lottie supports `line` and `text` (HarfBuzz-shaped
    outlines); video (MP4, WebM) and APNG exist; the CLI has two commands;
  - any screenshot of the app is of 6B's redesign;
  - the regenerating command beside the image;
  - at most 2,000 words: `wc -w README.md`;
  - none of `refused outright`, `one command`, `not implemented`:
    `grep -n -E "refused outright|one command|not implemented" README.md`
    prints nothing.

- [ ] **Step 4: `AGENTS.md`.** Under "What never gets committed", after the
  "Generated output" bullet, add:
  "Exception: README media under `docs/media/`, each at most 1 MB, each with the
  command that regenerates it written beside it in the README."

- [ ] **Step 5:** Tests pass, including `languageDocs.test.ts`, which compiles
  the README's examples. Delete one line from `bars-reveal.marey`: the media
  test goes red. Restore.

- [ ] **Step 6: Checks, commit.**
  ```bash
  git add docs/media/bars-reveal.marey docs/media/bars-reveal.png src/readmeMedia.test.ts README.md AGENTS.md
  git commit -m "docs(readme): open with the exported artifact beside its source; current claims; install and usage"
  ```

---

## Task 14: The ten-minute test, the evidence file, status (tier: integration)

Spec §6.3, §9.4, §8.

**Files:**
- Modify: `eval/RESULTS-PHASE-6.md`
- Modify: `docs/architecture/README.md`, `docs/architecture/roadmap-and-process.md` (together, engineering-lessons §5b)
- Modify: this plan (execution notes)

- [ ] **Step 1: Prepare the reader's copy.**
  ```bash
  rm -rf .visual-check/phase6/reader && mkdir -p .visual-check/phase6/reader
  git archive HEAD | tar -x -C .visual-check/phase6/reader
  rm .visual-check/phase6/reader/docs/specs/2026-09-27-marey-phase-6-packaging-and-legibility-design.md .visual-check/phase6/reader/docs/plans/2026-09-27-phase-6-packaging-and-legibility.md
  grep -rl "ten-minute\|rubric" .visual-check/phase6/reader || echo "no rubric text in the reader's copy"
  ```
  Also delete 6B's design and plan from the copy if they mention the rubric.

- [ ] **Step 2: The read.** A reader who hasn't seen this project gets the path
  to that copy and exactly this text, and nothing else:
  > Start at README.md in this folder. Read for about ten minutes, which is
  > about 2,500 words in total, and follow any links you like within that
  > budget. Then answer, in a few sentences each: (1) What is Marey? (2) What is
  > technically hard about it?

  Record the answers word for word.

- [ ] **Step 3: Score** against spec §6.3's rubric. Q1 needs all three points;
  Q2 needs at least two of H1–H4, each with a correct reason. Write the scoring,
  point by point, next to the answers.
  - **Fail:** revise the README (Task 13's checklist still applies), commit, and
    repeat Step 1–3 with a **new** reader. After three failed reads, stop and
    ask the owner.
  - **Pass:** show the owner the answers and the scoring. Their judgment is
    final (spec O6).

- [ ] **Step 4: `eval/RESULTS-PHASE-6.md`.** One section per spec §9.4
  criterion, each with the command that reproduces it and its result, plus
  Task 1's gate. Every number is re-derived on a clean tree when it's written
  (engineering-lessons §1).

- [ ] **Step 5: Status.** Update `docs/architecture/README.md`'s phase line and
  `roadmap-and-process.md`'s Phase 6 bullet in the same commit. Write this
  plan's execution notes, in 5C's shape:
  - final evidence;
  - defects found in this plan;
  - rulings by id;
  - mutation results beside suite sizes;
  - deferrals, each with what makes it harmless today;
  - the process record.

- [ ] **Step 6: Checks, commit.**
  ```bash
  git add eval/RESULTS-PHASE-6.md docs/architecture/README.md docs/architecture/roadmap-and-process.md docs/plans/2026-09-27-phase-6-packaging-and-legibility.md
  git commit -m "docs(6): exit evidence, the ten-minute read, and phase status"
  ```

---

## Task 15: Review, merge, publish

- [ ] **Step 1:** An independent whole-branch review that shares none of this
  plan's reasoning (engineering-lessons §8). One fix wave, then a scoped
  re-review.
- [ ] **Step 2:** `npm run check:export -- --compare-seams` with the dev server
  up, then kill it. All four AGENTS.md checks, and `npm run check:pack`, on a
  clean tree.
- [ ] **Step 3: Stop and ask the owner** before merging `phase-6` into `main`,
  and again before any push.
- [ ] **Step 4: Publishing.** This environment has no outbound HTTP, so the
  owner runs it. Hand them exactly:
  ```bash
  npm login
  npm publish --dry-run     # read the file list: bin/, dist/cli/marey.mjs, dist/lib/, dist/export-page/, LICENSE, README.md, package.json
  npm publish
  ```
  If npm refuses the name, stop: the fallback, a scope such as `@mkepg/marey`,
  is the owner's decision (spec §12). After they publish, confirm with a fetch of
  `https://registry.npmjs.org/marey` that `dist-tags.latest` is `0.4.0`, and
  record it in `eval/RESULTS-PHASE-6.md`.

---

## Self-review

**Spec coverage:**

| Spec | Task |
|---|---|
| §1.1 roadmap correction | 12 |
| §1.4 citations | 12 |
| §2.1 identity (0.4.0, engines, private) | 10 |
| §2.2 files, `copyPublicDir` for the CLI | 3, 10 |
| §2.2 export page licence file | 5 |
| §2.3 library, narrower type, boundary test | 2 |
| §2.3 bundle grep | 10 |
| §2.4 dependencies and pins | 7, 10 |
| §3 CLI surface, output line, exit codes | 3, 6, 7 |
| §3.1 `EXPORT_BROWSER_MISSING` | 6, 7 |
| §3.1 `EXPORT_FFMPEG_MISSING` | 9 |
| §4.2 export page on `https://` via `page.route`, compile in page | 5, 7 |
| §4.3 one orchestration per format, `pngPipeline.ts` | 4, 5, 9 |
| §4.4 preflight, launch args, transport, index placement, teardown | 6, 7 |
| §5 gate, repeat-encode determinism, fallback | 1, 9 |
| §6.1–6.2 README, artifact, equality test, O7 line | 13 |
| §6.3 ten-minute test | 14 |
| §7 determinism account | 12 |
| §8 docs, AGENTS.md CI sentence | 11, 12, 14 |
| §9.1 headless tests | 2, 3, 4, 6, 9, 13 |
| §9.2 `check:export`, `check:pack`, deferral 14 | 8, 9, 10 |
| §9.3 CI | 11 |
| §9.4 exit evidence | 14 |
| O4 publish | 15 |

**Additions beyond the spec, named:**
- `[EXPORT_FFMPEG_FAILED]`, for ffmpeg exiting non-zero. The spec's two new
  codes did not cover an encode that starts and then fails.
- `tools/build/fix-dts-extensions.mjs`, because `tsc`'s extensionless
  declaration specifiers do not resolve under `nodenext`, and no bundling tool
  can be installed here.
- Moving `IRendererAdapter` out of `sceneIR.ts`, so the public declarations
  need no DOM types.
- Moving `toBase64` into `protocol.ts`, so the page does not become a third
  copy of it.
- Asking the owner how the site is built before the dependency move (Task 10).

**Placeholder scan.** Two values are deliberately left to measurement:
- the x264 argument list (Task 9 Step 1, filled from Task 1's record);
- Playwright's exact missing-executable text (Task 6 Step 1).

Each is marked, with the step that produces it. Nothing else is left open.

**Type consistency.** These names are used identically everywhere:
- `CliExportFormat`, `CliExportRequest`, `CliExportResult`, `EXPORT_ORIGIN`,
  `FRAME_PATH` (Tasks 5, 6, 7);
- `runPngExport`, `RunPngExportOptions.onPng`, `size` (Tasks 4, 5, 9);
- `exportScene`, `ExportSceneOptions.onFrame`, `abortPaths`,
  `EXPORT_LAUNCH_ARGS` (Tasks 7, 8, 9);
- `FrameAssembler.add`/`finish` (Tasks 6, 7, 9);
- `planX264Frames`, `assertDeviceCanRender`, `X264_SETTINGS`, `x264Args`
  (Task 9).

---

## Execution notes

Written during execution.

**Task 9: MP4.** Task 1's gate failed, so `marey export --format mp4` keeps
`runVideoExport`, the button's path, and the CLI has no ffmpeg dependency.
`[EXPORT_FFMPEG_MISSING]` and `[EXPORT_FFMPEG_FAILED]` (Global Constraint 10)
were therefore not built: they exist only to report a missing or failing
ffmpeg, and nothing spawns one. No code or test references either name; the
only mentions are in this plan and the design spec. `check:export
--compare-seams` gained mp4: it gates on the frame `hash`, the coded size and
the frame count against `__mareyExportVideo({ container: "mp4" })` and reports
both SHA-256s without gating on them, since WebCodecs' H.264 is not
byte-identical between runs (R47).

**Tasks 13-15, and the phase as a whole.** Written 2026-10-07, at the end of
Task 14, from `git log e7c5c29..a4e4cee`, `eval/RESULTS-PHASE-6.md` and CI's run
history (`gh run list`). The decisions made while executing are the notes
above and the ruling table below. Every number is either re-measured on a
clean tree at `a4e4cee` (the final-evidence table, except where a row names a
RESULTS section) or quoted from the RESULTS section the row names in
"Where each mutation or gate row comes from" at the end of this section.

### Final evidence

| Check | Command | Result |
|---|---|---|
| Unit suite | `npm test` | **61 files / 1306 tests**, all passing |
| Baseline | the same, at `b0759e8` (this plan's commit), in a temporary worktree | 43 files / 1061 tests |
| Eval suite | `npx vitest run --config eval/vitest.config.ts` | 1 file / 5 tests |
| Typecheck and build | `npm run build` | exit 0 |
| Every first-party scene | `npm run build:cli && node bin/marey.mjs check $(git ls-files '*.marey')` | 85 files, all `ok` (78 tracked at `b0759e8`) |
| Exit criterion 1, locally | `npm run build:package && npm run check:pack` | 11 of 11, exit 0, 17.0 s |
| Exit criterion 1, fresh clone | CI's "Package builds, packs and installs" step | **fails** on every push since 2026-10-02: `ENOTCACHED` at `npm install --offline <tarball>`. Defect 4 below |
| Exit criterion 2 | spec §6.3's read | passes the rubric with the first reader: Q1 3 of 3, Q2 3 of 4 (H1, H2, H4). The owner's judgment is pending |
| Exit criterion 3 | `node bin/marey.mjs check --export-ready eval/scenes-3b/*.marey`; `npm run check:export` | 4 of 4 `ok`; 21 of 21, exit 0, 111.2 s |
| x264 gate (Task 1) | `node tools/visual-check/x264-gate.mjs ...` | failed: none of 8 configurations meets the specks threshold. MP4 stays on WebCodecs |
| Branch shape, as of `a4e4cee` (a snapshot: a commit cannot hold its own diffstat) | `git rev-list --count e7c5c29..a4e4cee`; `git diff --shortstat e7c5c29..a4e4cee` | **56 commits**, **135 files changed, +14,367 / -1,468**, 6B and 6C included |

Phase 6 is not closed. Criterion 1 needs `check:pack` to pass on a fresh
clone, and the owner's judgment on the read and the npm publish are still to
come.

### Defects found in this plan

1. **Global Constraint 17 names "Task 10 (CI)".** CI is Task 11. Ruled
   PF-R2 before execution.
2. **Task 2's boundary test cannot resolve a relative import.** Its `join`
   drops a leading `..`: `join("./index.ts", "../compiler/compileSource")`
   returns `compiler/compileSource`, so the test would have failed on its own
   fixture. Ruled PF-R2b: the committed test normalises the segments.
3. **Tasks 11 and 13 stage `AGENTS.md`, which is untracked.** `.gitignore`
   has kept it local since `0e10d54` (2026-09-26), and force-adding an
   ignored file is against the repository's rules. Ruled PF-R1, and R7 for
   Task 13 Step 4: both edits went to the local file only.
4. **Task 10 Step 2 installs the tarball with `npm install --offline`.** That
   works only where npm's cache already holds the registry metadata for
   `playwright-core`. A fresh CI runner, after `npm ci`, holds the tarball
   and not the metadata, so the step fails there with `ENOTCACHED`. It went
   unseen from 2026-10-02 to 2026-10-07, because CI's results were not read
   after the pushes. Reproduced with a fresh cache, and shown to pass once
   `npm cache add playwright-core@1.62.1` fetches the metadata (RESULTS,
   "Exit criterion 1"). Open.
5. **Task 1 Step 4 asks for MP4 scores equal across two runs.** WebCodecs
   encodes differently each run (R47), so they cannot be. The scorer's
   extraction was shown unchanged by WebM equality across runs and by one
   set of MP4 bytes scored identically by both scorers (RESULTS, "The shared
   scorer").
6. **Task 13 Step 3 asks the README to say MP4 needs ffmpeg.** It was stale
   once Task 9 recorded the failed gate: the CLI never spawns ffmpeg. Ruled
   R1.
7. **Task 14 Step 1's deletion scope.** It removes this plan and the design,
   and 6B's files "if they mention the rubric". The question is which files
   state the rubric, not which mention "ten-minute". Ruled R4.
8. **Task 15 Step 3 merges `phase-6`.** That branch was merged into `main` on
   2026-10-02 and deleted. Tasks 13-15 run on `phase-6-finish` (R3).

### Every ruling, by id

PF-R ids were taken before execution, R ids for Tasks 13-15. Rulings inside
single tasks were not numbered. The ones that changed what was built are
recorded in RESULTS: mp4 reported and not gated, in the matrix and in
`--compare-seams`; the x264 gate re-run with colour tags matching the
WebCodecs file; and Task 1 Step 4's scorer proof (defect 5).

| id | Ruling |
|---|---|
| PF-R1 | Tasks 11 and 13 edit the local, untracked `AGENTS.md` only, and their commits drop it. The committed record of O7 is spec §6.2 and the README's regenerate command. |
| PF-R2 | Global Constraint 17's "Task 10 (CI)" means Task 11. |
| PF-R2b | Task 2's boundary test gets a `join` that keeps leading `..` segments; every other line stays as written. |
| PF-R3 | The export page reports each format's size from what was produced: APNG from its IHDR, Lottie from `w`/`h`, png from `runPngExport`, video from the plan. No pipeline signature changes. |
| PF-R4 | One copy of each usage synopsis: `check`'s from `check.ts`, `export`'s from `exportArgs.ts` once Task 6 exists. |
| PF-R5 | Order: Tasks 2-8, then 10-12 while ffmpeg was being installed, then 1 and 9; 6B; 6C; then 13-15. |
| PF-R6b | Task 4's untested `canvas.width = 0` lines are memory hygiene, as in `runApngExport`, and stay untested. |
| R1 | The README does not list ffmpeg: the x264 gate failed and MP4 uses the browser's WebCodecs path. |
| R2 | O7 and O8 count as confirmed (the owner, 2026-09-28) and are not asked again. |
| R3 | Tasks 13-15 run on `phase-6-finish`, cut from `main` at `c7b87ae`, since `phase-6` merged into `main` on 2026-10-02. |
| R4 | The reader's copy removes the files that state the rubric or the procedure. Passing mentions of "ten-minute" (the CI budget in RESULTS, the exit criterion in the roadmap) stay. |
| R5 | The reader is new to the project, with no prior context, confined to the copy, and given only the prompt. The owner's judgment stays final (O6). |
| R6 | The README presents `npx marey ...` and `import { compile } from "marey"` as the usage, with no claim that is false before publishing (no download badges). Its Status drops "unpublished", "one command" and "not implemented". |
| R7 | The O7 exception line lives in the local `AGENTS.md`. Spec §6.2 and the README's regenerate command are its committed record. |
| R8 | The read is scored by someone other than the person who gave it, from the verbatim answers. |
| R47 | (5B, cross-phase) WebCodecs MP4 bytes are reported, not gated; its `frames` hash and size are gated. |

### Mutation results, each beside its suite size

| Task | Mutation | Suite at the time | Result |
|---|---|---|---|
| 8 | Ten mutations of the export page, the CLI bundle and the matrix script (RESULTS, "CLI export matrix", "Mutations") | 53 files / 1142 tests | each makes the matrix fail on the assertion it targets |
| 10 | `fix-dts-extensions.mjs` dropped from `build:lib` | 53 files / 1142 tests | `check:pack` fails at the nodenext consumer typecheck (`TS2834`) |
| 10 | `dist/export-page/` removed from `files` | 53 files / 1142 tests | `check:pack` fails at `npx marey export`: the export page is not in the package |
| 12 | The `snapContainerToBody` call deleted from the freeze loop (`docs/determinism.md` §5) | not recorded | 2 tests fail. At `1ce8307`, the fix's own commit, the same deletion left 97 of 97 passing |
| 6B | `min-width: 400px` on the Examples button; then with `position: absolute` added | the 33-assertion layout check | the viewport assertion fails at 390 and 320 px; then the overlap assertion fails on every page |
| 6C | The pre-change code under the new handoff seam tests | `sceneRuntime.test.ts`, 56 tests | 14 of 16 seam cases fail; all pass after the change |
| 13 | One line (`color: sky`) deleted from `docs/media/bars-reveal.marey` | 61 files / 1306 tests | `readmeMedia.test.ts`: 1 failed, 1 passed |
| 13 | The README's three `docs/media/bars-reveal.png` references replaced | 61 files / 1306 tests | the image-before-source test fails |

Task 14 changed no code and has no mutation.

#### Where each mutation or gate row comes from

| Row | Source |
|---|---|
| x264 gate (Task 1) | RESULTS, "Task 1: x264 gate" |
| Task 8 mutations | RESULTS, "CLI export matrix", "Mutations: each assertion made to fail" |
| Task 10 mutations | RESULTS, "Exit criterion 1", "Mutations: each assertion made to fail, then restored" |
| Task 12 mutation | `docs/determinism.md` §5, the command beside the `snapContainerToBody` deletion; not in RESULTS |
| 6B mutations | RESULTS, "6B: the playground redesign" (the `min-width` and `position: absolute` cases) |
| 6C mutation | RESULTS, "6C: smooth handoff" |
| Task 13 mutations | recorded only in this table; RESULTS has no section for them |

### Deliberate gaps and deferrals, each with what makes it harmless today

This list covers what Tasks 13 and 14 deferred or found.

1. **`README.md:17-18`: "Try it in the browser" has no blank line before
   it**, so it renders in the badge paragraph, on the badges' line.
   *Harmless today:* the link is visible and works; it is spacing only.
2. **The README's sample output line shortens the SHA-256 to
   `d56c2e03…`.** `marey export` prints all 64 hex digits. The `frames`
   value, `35ebdda6`, is the full hash. *Harmless today:* the ellipsis marks
   the cut, and the prefix shown is the real one (re-exported 2026-10-07,
   RESULTS "Exit criterion 2").
3. **`readmeMedia.test.ts` dereferences its regex match with `!`.** If the
   README loses its `marey` code fence, the test fails with a bare
   `TypeError` rather than a message naming the missing block. *Harmless
   today:* it still fails, and the stack points at the line.
4. **The README's structural checklist (spec §6.3) is manual**: the word
   count, the stale strings and the first-screen link are not tested.
   *Harmless today:* it was run on 2026-10-07 and passed (RESULTS), and only
   a README edit can break it. The media block and the image position are
   tested.
5. **Leftovers of the failed x264 gate.** CI still installs ffmpeg
   (`ci.yml`, "Install ffmpeg and the pinned browser"), and
   `src/cli/exportReport.ts` keeps an optional `ffmpeg` field that no caller
   sets (only `exportReport.test.ts` does). *Harmless today:* the install
   costs CI time only, and the field is never set, so the summary line never
   shows it.
6. **`TYPE_HANDOFF_DURATION` ignores `delay`** (`validator.ts`'s concurrent
   handoff check compares durations only). *Harmless today:* reaching it
   takes a delayed handoff that ends on the physics block's freeze tick,
   then a later `sequence` step on the same object. RESULTS "6C: smooth
   handoff", "Known edges", has the probe and its numbers.
7. **`docs/determinism.md` §4 quotes `frames 26cca4e9` for compound-logo.**
   Since 6C the scene's `frames` hash is `3dbb171f`. *Harmless today:* the
   passage is dated ("on 2026-09-30"), and its point, that two runs print
   the same line, still holds.
8. **`src/cli/exportDriver.test.ts` leaves three directories in the OS temp
   folder on every `npm test`** (`marey-page-*` twice, `marey-scene-*`), with
   no cleanup. 385 had accumulated on this machine by 2026-10-07.
   *Harmless today:* they are small, and outside the repository.

### The process record

- **Order.** Tasks 2-8 ran first while ffmpeg was not installed, then 10-12,
  then 1 and 9 once it was (PF-R5). 6B and 6C followed with their own
  designs and plans, then 13-15 on `phase-6-finish`.
- **Reviews.** Tasks 1-13 each had their own review. Tasks 5, 6, 10, 11 and
  12 each needed one fix round; Task 8 had one before its review, for the
  mp4 gate (R47). Task 13's review was clean.
- **Interruptions.** Work stopped four times with uncommitted changes in the
  tree: Task 10's fix round, Task 1 twice, and Task 13's first attempt. Each
  time the tree was inspected (`git diff --stat`, `git status`) and the work
  finished from it, with nothing lost.
- **A verdict held until its anomaly was explained.** Task 1's first gate run
  scored every x264 file about 3.4 dB below WebCodecs, almost independent of
  CRF, which points to a colour error rather than the encoder. The verdict
  was held until x264 was re-measured with the WebCodecs file's colour tags:
  +5.12 dB on identical YUV planes. The gate still failed, on specks
  (RESULTS, "Task 1: x264 gate").
- **A green local check is not a fresh clone.** `check:pack` passed every
  local run and failed every CI run (defect 4), and CI's results were not
  read for five days. Reading the CI run after each push to `main` would
  have caught it the day it landed.
- **The read.** One reader, who passed the rubric. The README needed no
  revision.
