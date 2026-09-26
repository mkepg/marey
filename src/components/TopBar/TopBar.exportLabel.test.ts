import { describe, it, expect } from "vitest";
import { exportLabelFor } from "./exportLabel";
import type { ExportProgress } from "../../hooks/useExport";

/**
 * Fix round 1, finding 1: the reviewer grepped the diff and found
 * `TopBar.tsx`'s `exportLabel` special-cased `kind === "lottie" || kind ===
 * "apng"` unchanged, even though this task's own report and `useExport.ts`
 * docstring both claimed the apng button got a real percent label. This
 * file pins the fix directly against `exportLabelFor` (moved to its own
 * `exportLabel.ts`, per that module's own docstring, so it is importable
 * here at all under `vitest.config.ts`'s plain `node` environment).
 */
describe("exportLabelFor", () => {
  it("shows the button's own name when nothing is exporting", () => {
    expect(exportLabelFor("apng", null)).toBe("apng");
    expect(exportLabelFor("mp4", null)).toBe("mp4");
  });

  it("shows the button's own name when a DIFFERENT kind is exporting", () => {
    const progress: ExportProgress = { kind: "webm", done: 3, total: 10 };
    expect(exportLabelFor("apng", progress)).toBe("apng");
  });

  it("shows a rounded percent for apng mid-export, exactly like mp4/webm", () => {
    const progress: ExportProgress = { kind: "apng", done: 3, total: 10 };
    expect(exportLabelFor("apng", progress)).toBe("30%");
  });

  it("rounds the apng percent the same way mp4/webm's does", () => {
    const progress: ExportProgress = { kind: "apng", done: 1, total: 3 };
    // 1/3 * 100 = 33.33... -> Math.round -> 33
    expect(exportLabelFor("apng", progress)).toBe("33%");
  });

  it("shows 'starting…' for apng when total is still 0", () => {
    const progress: ExportProgress = { kind: "apng", done: 0, total: 0 };
    expect(exportLabelFor("apng", progress)).toBe("starting…");
  });

  it("still shows the ellipsis for lottie, which has no per-frame progress", () => {
    const progress: ExportProgress = { kind: "lottie", done: 0, total: 0 };
    expect(exportLabelFor("lottie", progress)).toBe("…");
  });

  it("shows a rounded percent for mp4 and webm mid-export (control case, unchanged by this fix)", () => {
    expect(exportLabelFor("mp4", { kind: "mp4", done: 5, total: 20 })).toBe("25%");
    expect(exportLabelFor("webm", { kind: "webm", done: 20, total: 20 })).toBe("100%");
  });
});
