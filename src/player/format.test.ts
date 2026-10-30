import { describe, it, expect } from "vitest";
import { formatTime, diagnosticLines } from "./format";

describe("formatTime", () => {
  it("formats minutes and zero-padded seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65.4)).toBe("1:05");
  });
  it("shows the infinity sign for an indefinite scene", () => {
    expect(formatTime(Infinity)).toBe("∞");
  });
});

describe("diagnosticLines", () => {
  it("leads with the code and message, then one line per error", () => {
    const lines = diagnosticLines("PLAYER_COMPILE_FAILED", "The scene did not compile.", [
      { phase: "parse", message: "[E1] unexpected token", line: 3, col: 7 },
      { phase: "lint", message: "[E2] scene has no size" },
    ]);
    expect(lines).toEqual([
      "PLAYER_COMPILE_FAILED: The scene did not compile.",
      "3:7 [E1] unexpected token",
      "[E2] scene has no size",
    ]);
  });
});
