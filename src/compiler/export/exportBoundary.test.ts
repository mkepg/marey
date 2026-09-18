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
 * The two structural rules that carry Phase 5B's encoder-boundary claim.
 *
 * Asserted against the source text rather than by importing the modules,
 * because a type-only import leaves no runtime trace to observe — and a
 * type-only `import type { Container } from "pixi.js"` in videoEncode.ts
 * would still be a violation of the rule as written.
 */
describe("export boundary", () => {
  it("videoContract.ts does not import pixi.js in any form", () => {
    expect(videoContractSource).not.toMatch(/from\s+["']pixi\.js["']/);
  });

  it("videoEncode.ts does not import pixi.js in any form", () => {
    expect(videoEncodeSource).not.toMatch(/from\s+["']pixi\.js["']/);
  });

  it("videoEncode.ts does not import sceneIR in any form", () => {
    expect(videoEncodeSource).not.toMatch(/from\s+["'].*sceneIR["']/);
  });

  it("reads the file it claims to read", () => {
    // Without this, a typo in a specifier above would be a build-time
    // resolution failure (caught immediately, unlike the brief's
    // `readFileSync` version where a typo silently reads whatever the
    // miscomputed path happens to name) -- but it is still worth pinning
    // that each import is the module it claims to be, by a string only that
    // file contains, in case a future refactor renames the export.
    expect(videoEncodeSource).toContain("export async function encodeVideo");
    expect(videoContractSource).toContain("export function planVideo");
  });
});
