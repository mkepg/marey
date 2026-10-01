import { describe, expect, it } from "vitest";
import { captionFor, plateRect } from "./plateGeometry";

describe("plateRect", () => {
  it("contain centres the scene and letterboxes the short axis", () => {
    expect(plateRect("contain", { width: 1000, height: 600 }, { width: 800, height: 600 }))
      .toEqual({ x: 100, y: 0, width: 800, height: 600 });
    expect(plateRect("contain", { width: 400, height: 600 }, { width: 800, height: 600 }))
      .toEqual({ x: 0, y: 150, width: 400, height: 300 });
  });

  it("none anchors at the top-left at logical size, when it fits", () => {
    expect(plateRect("none", { width: 1000, height: 700 }, { width: 800, height: 600 }))
      .toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("frames nothing when the scene fills or overflows the box", () => {
    expect(plateRect("cover", { width: 1000, height: 600 }, { width: 800, height: 600 })).toBeNull();
    expect(plateRect("fill", { width: 1000, height: 600 }, { width: 800, height: 600 })).toBeNull();
    expect(plateRect("none", { width: 700, height: 700 }, { width: 800, height: 600 })).toBeNull();
  });

  it("frames nothing in an empty box", () => {
    expect(plateRect("contain", { width: 0, height: 600 }, { width: 800, height: 600 })).toBeNull();
  });
});

describe("captionFor", () => {
  it("reads the logical size and the duration", () => {
    expect(captionFor({ width: 800, height: 600, duration: 12 })).toEqual({ size: "800 × 600", length: "12 s" });
    expect(captionFor({ width: 1200, height: 630, duration: 2.5 })).toEqual({ size: "1200 × 630", length: "2.5 s" });
  });

  it("says so when the scene has no duration", () => {
    expect(captionFor({ width: 800, height: 600, duration: null }).length).toBe("no fixed length");
  });
});
