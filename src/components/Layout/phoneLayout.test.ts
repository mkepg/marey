import { describe, expect, it } from "vitest";
import { phonePreviewHeight, PHONE_PREVIEW_FALLBACK } from "./phoneLayout";

describe("phonePreviewHeight", () => {
  it("fits a 4:3 plate across a 390 px pane, with the caption and both margins", () => {
    // plate = (390 - 24) * 600 / 800 = 274.5; + 22 caption + 24 margins = 320.5
    expect(phonePreviewHeight(390, 844, { width: 800, height: 600 })).toBe(321);
  });

  it("follows the scene's aspect ratio", () => {
    // plate = (390 - 24) * 1080 / 1920 = 205.875; + 46 = 251.875
    expect(phonePreviewHeight(390, 844, { width: 1920, height: 1080 })).toBe(252);
  });

  it("is capped at 60% of the viewport height", () => {
    // A square scene on a short, wide viewport: 726 + 46 > 0.6 * 600.
    expect(phonePreviewHeight(750, 600, { width: 500, height: 500 })).toBe(360);
  });

  it("uses a fixed height when no scene has compiled", () => {
    expect(phonePreviewHeight(390, 844, null)).toBe(PHONE_PREVIEW_FALLBACK);
    expect(phonePreviewHeight(390, 400, null)).toBe(240);
  });
});
