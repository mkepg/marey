import { describe, expect, it } from "vitest";
import { phonePreviewHeight, PHONE_PREVIEW_FALLBACK } from "./phoneLayout";

describe("phonePreviewHeight", () => {
  it("fits a 4:3 plate across a 390 px pane, with the caption and both margins", () => {
    // plate = (390 - 28) * 600 / 800 = 271.5; + 22 caption + 28 margins = 321.5
    expect(phonePreviewHeight(390, 844, { width: 800, height: 600 })).toBe(322);
  });

  it("follows the scene's aspect ratio", () => {
    // plate = (390 - 28) * 1080 / 1920 = 203.625; + 50 = 253.625
    expect(phonePreviewHeight(390, 844, { width: 1920, height: 1080 })).toBe(254);
  });

  it("is capped at 60% of the viewport height", () => {
    // A square scene on a short, wide viewport: 722 + 50 > 0.6 * 600.
    expect(phonePreviewHeight(750, 600, { width: 500, height: 500 })).toBe(360);
  });

  it("uses a fixed height when no scene has compiled", () => {
    expect(phonePreviewHeight(390, 844, null)).toBe(PHONE_PREVIEW_FALLBACK);
    expect(phonePreviewHeight(390, 400, null)).toBe(240);
  });
});
