import { describe, it, expect } from "vitest";
import { buildShareURLFor, decodeCode } from "./share";

describe("buildShareURLFor", () => {
  it("appends the #code= fragment decodeCode reads back", () => {
    const url = buildShareURLFor("https://marey.pages.dev/", "scene { size: (10, 10) }")!;
    expect(url.startsWith("https://marey.pages.dev/#code=")).toBe(true);
    expect(decodeCode(url.split("#code=")[1])).toBe("scene { size: (10, 10) }");
  });
  it("returns null when the source is too long to share", () => {
    let big = ""; let seed = 1;
    while (big.length < 40_000) { seed = (seed * 48271) % 2147483647; big += seed.toString(36); }
    expect(buildShareURLFor("https://marey.pages.dev/", big)).toBeNull();
  });
});
