import { describe, expect, it } from "vitest";
import { entranceKeyframes, playsEntrance } from "./entrance";

describe("playsEntrance", () => {
  it("plays when a scene appears where none was on screen", () => {
    expect(playsEntrance({ success: true, manual: false, wasShowing: false })).toBe(true);
  });

  it("plays on Run even when a scene was already on screen", () => {
    expect(playsEntrance({ success: true, manual: true, wasShowing: true })).toBe(true);
  });

  it("does not play when auto-run replaces a scene already on screen", () => {
    expect(playsEntrance({ success: false, manual: false, wasShowing: true })).toBe(false);
    expect(playsEntrance({ success: true, manual: false, wasShowing: true })).toBe(false);
  });

  it("never plays for a failed compile, which shows no scene", () => {
    expect(playsEntrance({ success: false, manual: true, wasShowing: false })).toBe(false);
    expect(playsEntrance({ success: false, manual: false, wasShowing: false })).toBe(false);
  });
});

describe("entrance keyframes", () => {
  it("grows from 85% while fading in, and only fades under reduced motion", () => {
    expect(entranceKeyframes(false)[0]).toMatchObject({ transform: "scale(0.85)", opacity: 0 });
    expect(entranceKeyframes(false).at(-1)).toMatchObject({ transform: "scale(1)", opacity: 1 });
    expect(entranceKeyframes(true).some((k) => "transform" in k)).toBe(false);
  });
});
