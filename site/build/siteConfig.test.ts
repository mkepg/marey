import { describe, expect, it } from "vitest";
import { parseSiteConfig } from "./siteConfig";

describe("parseSiteConfig", () => {
  it("accepts the empty lists", () => {
    const r = parseSiteConfig({ learn: [], guides: [], reference: [], gallery: [] }, "site.json");
    expect(r.errors).toEqual([]);
    expect(r.config).toEqual({ learn: [], guides: [], reference: [], gallery: [] });
  });

  it("reads lessons as objects and the other sections as slugs", () => {
    const r = parseSiteConfig(
      { learn: [{ slug: "a", vocabulary: ["scene"] }], guides: ["install"], reference: ["language"], gallery: ["x"] },
      "site.json",
    );
    expect(r.errors).toEqual([]);
    expect(r.config.learn).toEqual([{ slug: "a", vocabulary: ["scene"] }]);
    expect(r.config.guides).toEqual(["install"]);
  });

  it("rejects a lesson that is a bare string, with the file", () => {
    const r = parseSiteConfig({ learn: ["a"], guides: [], reference: [], gallery: [] }, "site.json");
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/^site\.json:1: learn\[0\]/);
  });

  it("rejects a guide that is an object, a missing section and an unknown key", () => {
    const r = parseSiteConfig({ guides: [{ slug: "a" }], reference: [], gallery: [], extra: [] }, "site.json");
    expect(r.errors.join("\n")).toMatch(/unknown key "extra"/);
    expect(r.errors.join("\n")).toMatch(/"learn" must be/);
    expect(r.errors.join("\n")).toMatch(/"guides" must be/);
  });

  it("rejects a document that is not an object", () => {
    expect(parseSiteConfig([], "site.json").errors).toHaveLength(1);
  });
});
