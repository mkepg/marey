import { describe, it, expect } from "vitest";
import { formatPlayhead, nextStart } from "./playhead";

const s = (tick: number, endTick: number | null, reachedTick = tick) =>
  ({ tick, playing: false, endTick, reachedTick });

describe("formatPlayhead", () => {
  it("shows position and length for a scene with a duration", () => {
    expect(formatPlayhead(s(150, 480))).toBe("1.25 / 4.00 s");
  });
  it("shows position alone for an indefinite scene", () => {
    expect(formatPlayhead(s(1488, null))).toBe("12.40 s");
  });
});

describe("nextStart", () => {
  it("restores the remembered playhead after an edit", () => {
    expect(nextStart({ tick: 90, playing: true }, false)).toEqual({ tick: 90, playing: true });
  });
  it("starts from zero when the file was replaced", () => {
    expect(nextStart({ tick: 90, playing: true }, true)).toBeUndefined();
  });
  it("starts from zero when nothing is remembered", () => {
    expect(nextStart(null, false)).toBeUndefined();
  });
});
