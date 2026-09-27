import { describe, it, expect } from "vitest";
import { runPngExport } from "./pngPipeline";

/**
 * `runPngExport`'s refusal paths that run before any `Application` exists —
 * compilation and `planExport` — in the style of `videoPipeline.test.ts`'s
 * refusal-path 1/2 suites. `withRasterExport` runs these two checks ahead of
 * `new Application()` for every pipeline built on it (rasterExport.ts), so a
 * plain `environment: "node"` run reaches them with no DOM at all.
 *
 * The second test's regex was tightened from a bare `/^\[EXPORT_/` (the
 * brief's own draft) to the actual code this fixture produces, confirmed by
 * running `node bin/marey.mjs check --export-ready --fps 30` on the identical
 * source: `[EXPORT_UNBOUNDED_SCENE]`. fps 30 divides 120 exactly, so the only
 * diagnostic `planExport` raises here is the missing `duration`; a bare
 * `EXPORT_` prefix would also match a differently-broken future fixture, so
 * pinning the code is the property this test is meant to guard.
 */

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
    ).rejects.toThrow(/^\[EXPORT_UNBOUNDED_SCENE\]/);
  });
});
