import { describe, it, expect } from "vitest";
// Vite's `?raw` import (declared by `vite/client`, `tsconfig.app.json`'s
// only `types` entry) rather than `node:fs` + `readFileSync`, which is what
// this file's own brief specified. Measured, not a style choice: `node:fs`,
// `node:path` and `node:url` all fail to resolve under `tsconfig.app.json`
// with TS2307 ("Cannot find module"), because that project carries no Node
// types (`languageDocs.test.ts`'s header comment documents the identical
// constraint and the identical `?raw` fix, for `docs/LANGUAGE.md` rather
// than a sibling source file). `?raw` also resolves statically through
// Vite's own module graph rather than a hand-built relative path, so a typo
// in the specifier is a resolution error at collection time rather than a
// silent read of some other real file -- strictly better than the dynamic
// `resolve(__dirname, rel)` the brief specified, for the same "reads the
// file it claims to read" reason the fourth test below exists.
import videoEncodeSource from "./videoEncode.ts?raw";
import videoContractSource from "./videoContract.ts?raw";
import videoPipelineSource from "./videoPipeline.ts?raw";
import useExportVideoSource from "../../hooks/useExportVideo.ts?raw";
import topBarSource from "../../components/TopBar/TopBar.tsx?raw";
import lottieEncodeSource from "./lottieEncode.ts?raw";
import lottieGeometrySource from "./lottieGeometry.ts?raw";

/**
 * True if `source` imports a module whose specifier contains `moduleFragment`,
 * in any of the three forms ESM allows:
 *
 * - a static import, value or type-only (`import ... from "X"`,
 *   `import type ... from "X"`);
 * - a dynamic import (`import("X")`), idiomatic in this Vite/ESM codebase
 *   (`src/lib/devExportSeam.ts`'s and `devLottieSeam.ts`'s dev-only seams
 *   both use one, specifically so Vite can constant-fold the branch away in
 *   a production build);
 * - a bare side-effect import (`import "X"`), which has no `from` at all.
 *
 * A regex anchored on the `from` keyword alone -- this test file's first
 * version -- catches only the first form. Measured during this task's review
 * round: adding `import("pixi.js");` or a bare `import "pixi.js";` to
 * `videoEncode.ts` passed the `from`-only regex undetected, even though both
 * are real imports of `pixi.js` and both are real violations of "must not
 * import pixi.js in any form". See the Step 5 mutation table in this task's
 * report for the RED runs that found this and confirmed the fix.
 *
 * Widened in Task 5 (R21) from "ends with" to "contains". The quoted-specifier
 * pattern used to be `["'][^"']*${moduleFragment}["']` -- `[^"']*` only
 * *before* the fragment, so the fragment had to sit immediately against the
 * closing quote. That misses any specifier with something after the fragment
 * inside the quotes: an extension (`from "../ir/sceneIR.ts"`,
 * `from "../ir/sceneIR.js"`, `await import("../ir/sceneIR.ts")` -- all three
 * compile today, because `allowImportingTsExtensions: true` is set in every
 * tsconfig in this repo), and, more seriously, a pixi.js export subpath
 * (`from "pixi.js/app"`, `from "pixi.js/scene"`, ...). pixi.js 8.16.0 declares
 * 23 export subpaths in its own `package.json`, so `import { Application }
 * from "pixi.js/app"` is a compiling, genuine violation of "must not import
 * pixi.js in any form" that the old regex reported clean, because "pixi.js"
 * there is not immediately followed by the closing quote. `[^"']*` after the
 * fragment too makes the match "contains" rather than "ends with" --
 * over-matching is the safe direction for a guard: a loud false alarm beats a
 * silent pass.
 */
function importsModule(source: string, moduleFragment: string): boolean {
  const quoted = `["'][^"']*${moduleFragment}[^"']*["']`;
  const dynamicImport = new RegExp(`import\\s*\\(\\s*${quoted}`);
  return staticallyImportsModule(source, moduleFragment) || dynamicImport.test(source);
}

/**
 * True if `source` imports a module whose specifier contains `moduleFragment`
 * in a form the bundler resolves at load time: `import ... from "X"`,
 * `import type ... from "X"`, `export ... from "X"`, or a bare `import "X"`.
 * A dynamic `import("X")` is the one form this does not match.
 */
function staticallyImportsModule(source: string, moduleFragment: string): boolean {
  const quoted = `["'][^"']*${moduleFragment}[^"']*["']`;
  const fromClause = new RegExp(`from\\s+${quoted}`);
  const bareImport = new RegExp(`import\\s+${quoted}`);
  return fromClause.test(source) || bareImport.test(source);
}

/**
 * `source` with its comments removed, leaving string and template literals
 * intact.
 *
 * Needed because the `__mareyExportVideo` guard below asks "does this file's
 * *code* reach for the dev-only global?", and a raw substring search cannot
 * tell code from prose. Both guarded modules earn their keep partly by
 * *explaining* the prohibition: `videoPipeline.ts:27` and
 * `useExportVideo.ts:52` each name `window.__mareyExportVideo` in a docstring
 * in order to say why they do not call it. Measured, not assumed — the first
 * version of this guard searched the raw source and went RED on both files
 * for exactly that reason (2 failed / 9 passed; see the FIX 2 section of this
 * task's report). Deleting the prose to appease the guard would have traded
 * the best documentation of the constraint for a green tick; stripping
 * comments keeps both.
 *
 * Handles the three ways this repo's sources can hide a `//` or a `/*`:
 * quoted strings, template literals, and `${...}` substitutions nested inside
 * template literals -- `TopBar.tsx:169` has a template literal inside a
 * substitution inside a template literal, so the naive "a backtick runs to the
 * next backtick" scanner mis-tracks state from that line onward and eats real
 * code after it. Block comments collapse to a single space rather than to
 * nothing so that stripping can never *join* two tokens into a match that was
 * not in the source.
 *
 * Known limitation: a regex literal containing `//` or `/*` would be read as
 * a comment. A character-class regex literal of the `/[/*]/` shape is worse
 * than either: this scanner has no notion of regex literals at all, so the
 * `/*` inside the character class is read as an ordinary block-comment
 * opener -- and unlike the `//` case, which a line comment ends at the next
 * newline, nothing bounds that misreading to one line. It consumes source
 * until it reaches the file's own next block-comment terminator, however far
 * away that is, rather than merely misreading a single line. None of the
 * guarded files contains a regex literal at all, and each guard below
 * re-asserts a code landmark from *after* the file's last comment, so a
 * scanner that ran off the rails mid-file fails loudly rather than silently
 * reporting a clean file.
 */
function stripComments(source: string): string {
  const out: string[] = [];
  // Nesting stack. `template: true` is "inside a template literal's text";
  // `template: false` is "inside code" -- either the file's top level or a
  // `${...}` substitution. `braces` counts `{`/`}` pairs opened inside a
  // substitution, so the `}` that closes it is told apart from the `}` of an
  // object literal written inside it.
  const stack: { template: boolean; braces: number }[] = [{ template: false, braces: 0 }];
  let i = 0;
  while (i < source.length) {
    const ctx = stack[stack.length - 1];
    const c = source[i];
    const next = source[i + 1];

    if (ctx.template) {
      if (c === "\\") {
        out.push(source.slice(i, i + 2));
        i += 2;
      } else if (c === "`") {
        stack.pop();
        out.push(c);
        i += 1;
      } else if (c === "$" && next === "{") {
        stack.push({ template: false, braces: 0 });
        out.push("${");
        i += 2;
      } else {
        out.push(c);
        i += 1;
      }
      continue;
    }

    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue; // the newline itself is left in place
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      out.push(" ");
      continue;
    }
    if (c === '"' || c === "'") {
      out.push(c);
      i += 1;
      while (i < source.length) {
        const s = source[i];
        if (s === "\\") {
          out.push(source.slice(i, i + 2));
          i += 2;
          continue;
        }
        out.push(s);
        i += 1;
        if (s === c || s === "\n") break; // an unterminated literal cannot eat past its line
      }
      continue;
    }
    if (c === "`") {
      stack.push({ template: true, braces: 0 });
      out.push(c);
      i += 1;
      continue;
    }
    if (stack.length > 1 && c === "{") {
      ctx.braces += 1;
    } else if (stack.length > 1 && c === "}") {
      if (ctx.braces === 0) {
        stack.pop();
        out.push(c);
        i += 1;
        continue;
      }
      ctx.braces -= 1;
    }
    out.push(c);
    i += 1;
  }
  return out.join("");
}

/**
 * The two structural rules that carry Phase 5B's encoder-boundary claim.
 *
 * Asserted against the source text rather than by importing the modules,
 * because a type-only import leaves no runtime trace to observe — and a
 * type-only `import type { Container } from "pixi.js"` in videoEncode.ts
 * would still be a violation of the rule as written.
 *
 * Each of the first three tests also pins that it inspected the file it
 * claims to, by a string only that file contains -- not just the fourth
 * "reads the file it claims to read" test. Without that, a test named
 * "videoEncode.ts does not import pixi.js" could silently inspect
 * `videoContractSource` instead: both files are pixi-clean, so the
 * assertion would still pass, and the test would prove nothing about the
 * file its name claims to cover. Measured during this task's review round by
 * making exactly that swap: with only the fourth test's identity checks in
 * the file, the swap passed 4/4; with an identity check inlined into each of
 * the first three tests, the same swap goes RED (see the Step 5 mutation
 * table in this task's report).
 */
describe("export boundary", () => {
  it("videoContract.ts does not import pixi.js in any form", () => {
    expect(videoContractSource).toContain("export function planVideo");
    expect(importsModule(videoContractSource, "pixi\\.js")).toBe(false);
  });

  it("videoEncode.ts does not import pixi.js in any form", () => {
    expect(videoEncodeSource).toContain("export async function encodeVideo");
    expect(importsModule(videoEncodeSource, "pixi\\.js")).toBe(false);
  });

  it("videoEncode.ts does not import sceneIR in any form", () => {
    expect(videoEncodeSource).toContain("export async function encodeVideo");
    expect(importsModule(videoEncodeSource, "sceneIR")).toBe(false);
  });

  /**
   * Global Constraint 6 / design §7's table, Task 2's `line` piece: these two
   * rows were never written down as tests even though `lottieEncode.ts` and
   * `lottieGeometry.ts` have carried the constraint since Phase 5A. Each
   * import check is paired with an identity check for the same reason the
   * video-module tests above are, so a swapped source constant cannot pass
   * silently just because both files happen to be clean today.
   */
  it("lottieEncode.ts does not import pixi.js, sceneIR or harfbuzzjs in any form", () => {
    expect(lottieEncodeSource).toContain("export function encodeLottie");
    expect(importsModule(lottieEncodeSource, "pixi\\.js")).toBe(false);
    expect(importsModule(lottieEncodeSource, "sceneIR")).toBe(false);
    expect(importsModule(lottieEncodeSource, "harfbuzzjs")).toBe(false);
  });

  it("lottieGeometry.ts does not import pixi.js or harfbuzzjs in any form", () => {
    expect(lottieGeometrySource).toContain("export function planLottie");
    expect(importsModule(lottieGeometrySource, "pixi\\.js")).toBe(false);
    expect(importsModule(lottieGeometrySource, "harfbuzzjs")).toBe(false);
  });

  it("matches a pixi.js export subpath, not just the bare specifier", () => {
    // The serious miss R21 names: pixi.js 8.16.0 declares 23 export
    // subpaths, so this is a real, compiling violation of "must not import
    // pixi.js in any form" -- not a hypothetical.
    expect(
      importsModule('import { Application } from "pixi.js/app";', "pixi\\.js"),
    ).toBe(true);
    expect(
      importsModule('import { Container } from "pixi.js/scene";', "pixi\\.js"),
    ).toBe(true);
  });

  it("matches a static import with a file extension after the fragment", () => {
    expect(
      importsModule('import { x } from "../ir/sceneIR.ts";', "sceneIR"),
    ).toBe(true);
    expect(
      importsModule('import { x } from "../ir/sceneIR.js";', "sceneIR"),
    ).toBe(true);
  });

  it("matches a dynamic import with a file extension after the fragment", () => {
    expect(
      importsModule('await import("../ir/sceneIR.ts");', "sceneIR"),
    ).toBe(true);
  });

  it("tells a static import of a module from a dynamic one", () => {
    const fragment = "videoPipeline";
    expect(staticallyImportsModule('import { runVideoExport } from "./videoPipeline";', fragment)).toBe(true);
    expect(staticallyImportsModule('import type { RunVideoExportOptions } from "./videoPipeline";', fragment)).toBe(true);
    expect(staticallyImportsModule('export { runVideoExport } from "./videoPipeline";', fragment)).toBe(true);
    expect(staticallyImportsModule('import "./videoPipeline";', fragment)).toBe(true);
    expect(staticallyImportsModule('const m = await import("./videoPipeline");', fragment)).toBe(false);
    expect(importsModule('const m = await import("./videoPipeline");', fragment)).toBe(true);
  });

  it("still returns false when the fragment is entirely absent", () => {
    expect(
      importsModule('import { x } from "../renderer/builder.ts";', "sceneIR"),
    ).toBe(false);
  });

  it("strips a line comment but not a `//` inside a string literal", () => {
    expect(stripComments('const a = 1; // __mareyExportVideo\nconst b = 2;')).toBe(
      "const a = 1; \nconst b = 2;",
    );
    expect(stripComments('const url = "https://example.com/__mareyExportVideo";')).toContain(
      "__mareyExportVideo",
    );
  });

  it("strips a block comment but not a `/*` inside a template literal", () => {
    expect(stripComments("const a = /* __mareyExportVideo */ 1;")).toBe("const a =   1;");
    expect(stripComments("const t = `/* __mareyExportVideo */`;")).toContain(
      "__mareyExportVideo",
    );
  });

  it("keeps code that follows a template literal nested inside a substitution", () => {
    // `TopBar.tsx:169`'s shape. A scanner that treats a backtick as toggling
    // one flag leaves template state inverted after this line and then
    // swallows, or fails to swallow, everything after it.
    const source = 'const c = `${a}${b ? ` ${d}` : ""}`;\nwindow.__mareyExportVideo();';
    expect(stripComments(source)).toContain("window.__mareyExportVideo();");
    expect(stripComments(source)).toContain('`${a}${b ? ` ${d}` : ""}`');
  });

  it("reads the file it claims to read", () => {
    // Without this, a typo in a specifier above would be a build-time
    // resolution failure (caught immediately, unlike the brief's
    // `readFileSync` version where a typo silently reads whatever the
    // miscomputed path happens to name) -- but it is still worth pinning
    // that each import is the module it claims to be, by a string only that
    // file contains, in case a future refactor renames the export. Kept
    // alongside the inlined identity checks above rather than removed: this
    // test pins each *source constant's* identity once; the inlined checks
    // above pin that each *individual test* consulted the right constant.
    // They catch different mutations.
    expect(videoEncodeSource).toContain("export async function encodeVideo");
    expect(videoContractSource).toContain("export function planVideo");
    expect(lottieEncodeSource).toContain("export function encodeLottie");
    expect(lottieGeometrySource).toContain("export function planLottie");
  });
});

/**
 * Task 5's R3: `useExportVideo.ts` needs the same compile -> plan -> build ->
 * sample -> rasterize -> encode pipeline `src/lib/devVideoSeam.ts` runs, but
 * must not reach it through `window.__mareyExportVideo` (dev-only, constant-
 * folded out of a production build) and must not import `devVideoSeam.ts`
 * itself (that module's own docstring is written for a Node harness, not a
 * shipped button, and importing it would pull its whole dev-seam shape --
 * base64 encoding, reference-frame re-extraction, `window` global assignment
 * -- into the production bundle regardless of whether it is ever called).
 * `videoPipeline.ts` is the extracted answer.
 *
 * Review (task-5-review.md, F2) found the first version of this guard only
 * covered `videoPipeline.ts` -- the file *least* likely to reach for the dev
 * seam, since it was written from scratch in this task by an author who had
 * just read the constraint. The two files that actually form the production
 * entry point -- `useExportVideo.ts` and `TopBar.tsx` -- were unguarded, and
 * a future edit adding `window.__mareyExportVideo?.(...)` to either would
 * ship a button broken in production with every test green. Worse:
 * `importsModule` can never detect `window.__mareyExportVideo` at all,
 * because a global property read is not an import statement -- so the
 * `devVideoSeam`-import check alone cannot catch the specific mechanism the
 * brief forbids ("Do not call `window.__mareyExportVideo`"), regardless of
 * which file it is pointed at. Each guarded file below therefore gets BOTH
 * an import-based check (`devVideoSeam`, reusing `importsModule`) and a
 * plain substring check for the `__mareyExportVideo` global -- they catch
 * different mistakes: importing the dev-only module (which would also pull
 * its whole seam shape into production regardless of whether it is ever
 * called) versus reaching through the global it installs.
 *
 * Both checks run against `stripComments(...)` output, not raw source. For
 * the `__mareyExportVideo` check that is mandatory, not tidiness: two of the
 * three files document the prohibition in a docstring, so the raw-source
 * version of this guard failed on them (see `stripComments`). The
 * `devVideoSeam` import check is stripped for the same reason one step
 * earlier -- `videoPipeline.ts:33` already writes "read directly from
 * `devVideoSeam.ts`'s `exportVideo`" in prose, which today escapes
 * `importsModule` only because the specifier is in backticks rather than
 * quotes. That is luck, not a property, and a guard that goes RED on a
 * comment edit trains people to weaken it.
 *
 * Each test re-asserts a code landmark taken from *after* its file's last
 * long comment, so the two things that would make these guards vacuous both
 * fail loudly: reading the wrong source constant, and a `stripComments` that
 * ran off the rails and deleted the code it was meant to search.
 *
 * `videoPipeline.ts` legitimately imports `pixi.js` and `sceneIR`-adjacent
 * renderer modules -- unlike the encoder, it is the orchestration layer that
 * builds the scene tree -- so none of these three files are checked against
 * "must not import pixi.js"; that is a different property, already covered
 * for `videoContract.ts`/`videoEncode.ts` above.
 */
describe("export boundary — R3 shared pipeline and its production entry points", () => {
  it("videoPipeline.ts does not import devVideoSeam.ts, and does not reach __mareyExportVideo", () => {
    const code = stripComments(videoPipelineSource);
    expect(code).toContain("export async function runVideoExport");
    expect(code).toContain("if (app?.renderer) destroyExportApp(app);");
    expect(importsModule(code, "devVideoSeam")).toBe(false);
    expect(code).not.toContain("__mareyExportVideo");
  });

  it("useExportVideo.ts does not import devVideoSeam.ts, and does not reach __mareyExportVideo", () => {
    const code = stripComments(useExportVideoSource);
    expect(code).toContain("export function useExportVideo");
    expect(code).toContain('await import("../compiler/export/videoPipeline")');
    expect(importsModule(code, "devVideoSeam")).toBe(false);
    expect(code).not.toContain("__mareyExportVideo");
  });

  it("useExportVideo.ts loads videoPipeline only through a dynamic import()", () => {
    // Whole-branch review M-3, ruling R49. The dynamic import is why
    // mediabunny and the rest of the export path live in a click-loaded
    // chunk instead of the entry chunk every visitor downloads (+283,561
    // bytes measured in Task 5). A static import added beside the dynamic
    // one compiles, works, and silently undoes that.
    const code = stripComments(useExportVideoSource);
    expect(code).toContain('await import("../compiler/export/videoPipeline")');
    expect(staticallyImportsModule(code, "videoPipeline")).toBe(false);
  });

  it("TopBar.tsx does not import devVideoSeam.ts, and does not reach __mareyExportVideo", () => {
    const code = stripComments(topBarSource);
    expect(code).toContain("export const TopBar");
    expect(code).toContain('handleExportClick("webm")');
    expect(importsModule(code, "devVideoSeam")).toBe(false);
    expect(code).not.toContain("__mareyExportVideo");
  });
});
