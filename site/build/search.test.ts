import { describe, expect, it } from "vitest";
import { buildSearchIndex } from "./search";

const page = (url: string) => ({
  url,
  section: "learn" as const,
  title: `T ${url}`,
  description: "d",
  headings: [{ depth: 2 as const, text: "H", id: "h" }],
  text: "body",
});

describe("buildSearchIndex", () => {
  it("is JSON with one entry per page, in order, and no 404 page", () => {
    const parsed = JSON.parse(buildSearchIndex([page("/learn/"), page("/404.html"), page("/guides/")]));
    expect(parsed.map((e: { url: string }) => e.url)).toEqual(["/learn/", "/guides/"]);
    expect(parsed[0]).toEqual({
      url: "/learn/",
      section: "learn",
      title: "T /learn/",
      description: "d",
      headings: [{ depth: 2, text: "H", id: "h" }],
      text: "body",
    });
  });

  it("round-trips text that looks like markup", () => {
    const p = { ...page("/learn/"), text: "</script><b>&" };
    expect(JSON.parse(buildSearchIndex([p]))[0].text).toBe("</script><b>&");
  });
});
