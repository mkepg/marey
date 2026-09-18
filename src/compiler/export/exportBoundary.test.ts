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
 */
function importsModule(source: string, moduleFragment: string): boolean {
  const quoted = `["'][^"']*${moduleFragment}["']`;
  const staticImport = new RegExp(`from\\s+${quoted}`);
  const dynamicImport = new RegExp(`import\\s*\\(\\s*${quoted}`);
  const bareImport = new RegExp(`import\\s+${quoted}`);
  return staticImport.test(source) || dynamicImport.test(source) || bareImport.test(source);
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
  });
});
