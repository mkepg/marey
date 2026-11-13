import { describe, expect, it } from "vitest";
import { checkLinks, type LinkablePage } from "./links";

const link = (href: string, line = 3, file = "site/content/learn/a.md") => ({ href, line, file });

const target: LinkablePage = {
  url: "/reference/language/",
  headings: [{ depth: 2, text: "Handoff", id: "handoff" }],
  links: [],
};

const page = (...hrefs: string[]): LinkablePage => ({
  url: "/learn/a/",
  headings: [{ depth: 2, text: "Own", id: "own" }],
  links: hrefs.map((h) => link(h)),
});

describe("checkLinks", () => {
  it("reports a link to a missing page with its file and line", () => {
    const errors = checkLinks([page("/learn/nope/"), target]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^site\/content\/learn\/a\.md:3: .*\/learn\/nope\/.*does not exist/);
  });

  it("reports a link to a missing anchor with its file and line", () => {
    const errors = checkLinks([page("/reference/language/#nope"), target]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^site\/content\/learn\/a\.md:3: .*#nope.*not a heading/);
  });

  it("reports a missing anchor on the page's own address", () => {
    const errors = checkLinks([page("#missing")]);
    expect(errors).toHaveLength(1);
  });

  it("accepts an existing page, an existing anchor and the page's own anchor", () => {
    expect(checkLinks([page("/reference/language/", "/reference/language/#handoff", "#own"), target])).toEqual([]);
  });

  it("accepts the playground and the generated files", () => {
    expect(checkLinks([page("/", "/#abc", "/sitemap.xml", "/third-party-licenses.txt")])).toEqual([]);
  });

  it("ignores external and mailto links", () => {
    expect(checkLinks([page("https://example.com/nope", "mailto:a@b.c", "//cdn.example/x")])).toEqual([]);
  });

  it("rejects a relative link", () => {
    expect(checkLinks([page("other.md")])[0]).toMatch(/relative link/);
  });

  it("requires the trailing slash a page's address has", () => {
    expect(checkLinks([page("/reference/language"), target])).toHaveLength(1);
  });
});
