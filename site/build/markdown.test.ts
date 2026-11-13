import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

const ctx = { file: "site/content/x.md", bodyLine: 5 };

describe("renderMarkdown", () => {
  it("gives every heading an id and an anchor link, and lists h2 and h3", () => {
    const r = renderMarkdown("## Alpha beta\n\n### `handoff`\n\n#### Deep\n", ctx);
    expect(r.html).toContain('<h2 id="alpha-beta">');
    expect(r.html).toContain('href="#alpha-beta"');
    expect(r.html).toContain('<h3 id="handoff">');
    expect(r.html).toContain('<h4 id="deep">');
    expect(r.headings).toEqual([
      { depth: 2, text: "Alpha beta", id: "alpha-beta" },
      { depth: 3, text: "handoff", id: "handoff" },
    ]);
  });

  it("numbers repeated headings", () => {
    const r = renderMarkdown("## Properties\n\n## Properties\n", ctx);
    expect(r.headings.map((h) => h.id)).toEqual(["properties", "properties-1"]);
  });

  it("escapes a heading's text in the anchor's label", () => {
    const r = renderMarkdown('## A "quote" <b>\n', ctx);
    expect(r.html).toContain('aria-label="Link to &quot;A &quot;quote&quot; &lt;b&gt;&quot;"');
  });

  it("shows raw HTML as text instead of emitting it", () => {
    const r = renderMarkdown("Text <script>alert(1)</script> more\n\n<div onclick=\"x\">hi</div>\n", ctx);
    expect(r.html).not.toContain("<script>");
    expect(r.html).not.toContain("<div");
    expect(r.html).toContain("&lt;script&gt;");
  });

  it("records each link with the file line it is on", () => {
    const r = renderMarkdown("First [a](/learn/a/).\n\nSecond line\nhas [b](/learn/b/#x) and [c](https://e.com).\n", ctx);
    expect(r.links).toEqual([
      { href: "/learn/a/", line: 5, file: "site/content/x.md" },
      { href: "/learn/b/#x", line: 8, file: "site/content/x.md" },
      { href: "https://e.com", line: 8, file: "site/content/x.md" },
    ]);
  });

  it("rejects a level-1 heading, since the page title is the h1", () => {
    const r = renderMarkdown("para\n\n# Title\n", ctx);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/^site\/content\/x\.md:7: /);
  });

  it("produces plain text for search, with no markup", () => {
    const r = renderMarkdown("## Colour\n\nUse **bold** and `code` and a [link](/x/).\n\n- one\n- two\n", ctx);
    expect(r.text).toBe("Colour\nUse bold and code and a link.\none\ntwo");
  });
});
