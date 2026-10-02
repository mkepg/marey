import { describe, expect, it } from "vitest";
import { logSummary } from "./logSummary";

describe("logSummary", () => {
  it("reads 'compiled, 0 errors' after a successful compile", () => {
    expect(logSummary("ok", 0)).toBe("compiled, 0 errors");
  });

  it("counts the errors after a failed compile", () => {
    expect(logSummary("error", 2)).toBe("2 errors");
    expect(logSummary("error", 1)).toBe("1 error");
  });

  it("counts a failure with no positioned error as one", () => {
    expect(logSummary("error", 0)).toBe("1 error");
  });

  it("reads 'idle' before anything has compiled", () => {
    expect(logSummary("idle", 0)).toBe("idle");
  });
});
