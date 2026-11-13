import { describe, expect, it } from "vitest";
import { buildSitemap } from "./sitemap";

describe("buildSitemap", () => {
  it("lists the playground and every page but the 404 page", () => {
    const xml = buildSitemap([{ url: "/learn/" }, { url: "/404.html" }, { url: "/guides/" }], "https://example.test");
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(["https://example.test/", "https://example.test/learn/", "https://example.test/guides/"]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("escapes an address", () => {
    expect(buildSitemap([{ url: "/a&b/" }], "https://example.test")).toContain("/a&amp;b/");
  });
});
