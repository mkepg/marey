import { describe, it, expect } from "vitest";
import { colorToInt, lerpColor } from "./color";

describe("colorToInt", () => {
  it("reads a normalised #rrggbb", () => {
    expect(colorToInt("#ff8800")).toBe(0xff8800);
    expect(colorToInt("#00FF80")).toBe(0x00ff80);
  });
  it("throws on a colour the IR should never carry", () => {
    expect(() => colorToInt("#f80")).toThrow(/#rrggbb/);
  });
});

describe("lerpColor", () => {
  it("hits both endpoints exactly", () => {
    expect(lerpColor(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    expect(lerpColor(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });
  it("blends each channel independently and rounds half up", () => {
    // red 255→0 at 0.5 = 127.5 → 128; blue 0→255 at 0.5 = 127.5 → 128.
    expect(lerpColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
    // green 0x10→0x20 at 0.25 = 16 + 4 = 20 = 0x14.
    expect(lerpColor(0x001000, 0x002000, 0.25)).toBe(0x001400);
  });
  it("clamps a progress outside [0, 1] to valid channels", () => {
    expect(lerpColor(0x000000, 0xffffff, 1.2)).toBe(0xffffff);
    expect(lerpColor(0xffffff, 0x000000, 1.2)).toBe(0x000000);
  });
});
