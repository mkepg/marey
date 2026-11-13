import { describe, expect, it } from "vitest";
import { renderLayout, type LayoutInput } from "./layout";

const base: LayoutInput = {
  section: "learn",
  url: "/learn/animate/",
  title: "Animate",
  description: "How to animate.",
  bodyHtml: "<p>Body</p>",
  headings: [{ depth: 2, text: "Easing", id: "easing" }],
  sidebar: [
    { href: "/learn/", title: "Overview" },
    { href: "/learn/animate/", title: "Animate", number: 3 },
    { href: "/learn/timing/", title: "Timing", number: 4 },
  ],
  prev: { href: "/learn/shapes/", title: "Shapes" },
  next: { href: "/learn/timing/", title: "Timing" },
  breadcrumb: [{ title: "Learn", href: "/learn/" }, { title: "Animate" }],
};

describe("renderLayout", () => {
  it("escapes a hostile title in the title, og:title and h1", () => {
    const html = renderLayout({ ...base, title: `<&"` });
    expect(html).toContain("<title>&lt;&amp;&quot; · Learn Marey</title>");
    expect(html).toContain('<meta property="og:title" content="&lt;&amp;&quot;" />');
    expect(html).toContain("<h1>&lt;&amp;&quot;</h1>");
    expect(html).not.toContain("<&");
  });

  it("escapes the description, sidebar, breadcrumb, pager and contents", () => {
    const bad = `"><img src=x onerror=1>`;
    const html = renderLayout({
      ...base,
      description: bad,
      sidebar: [{ href: bad, title: bad }],
      breadcrumb: [{ title: bad, href: bad }, { title: bad }],
      prev: { href: bad, title: bad },
      next: { href: bad, title: bad },
      headings: [{ depth: 2, text: bad, id: bad }],
    });
    expect(html).not.toContain("<img");
  });

  it("gives the canonical URL as the origin plus the page's url", () => {
    expect(renderLayout(base)).toContain('<link rel="canonical" href="https://marey.pages.dev/learn/animate/" />');
  });

  it("names a section's pages in their own title form", () => {
    expect(renderLayout(base)).toContain("<title>Animate · Learn Marey</title>");
    expect(renderLayout({ ...base, url: "/learn/", title: "Learn" })).toContain("<title>Learn · Marey</title>");
  });

  it("has a skip link and the landmarks", () => {
    const html = renderLayout(base);
    expect(html).toMatch(/<a class="skip-link" href="#main">/);
    for (const tag of ["header", "nav", "main", "footer"]) {
      expect(html).toContain(`<${tag}`);
    }
    expect(html).toContain('<main id="main"');
  });

  it("marks only the current sidebar item with aria-current=page", () => {
    const html = renderLayout(base);
    const sidebar = html.slice(html.indexOf('id="sidebar"'), html.indexOf("</nav>", html.indexOf('id="sidebar"')));
    expect(sidebar.match(/aria-current="page"/g)).toHaveLength(1);
    expect(sidebar).toMatch(/<a href="\/learn\/animate\/" aria-current="page">/);
  });

  it("sets the stored theme in a script that comes before the module script and any stylesheet", () => {
    const html = renderLayout(base);
    const script = html.indexOf("localStorage");
    expect(script).toBeGreaterThan(-1);
    expect(html.slice(script - 20, script + 200)).toContain("try{");
    expect(script).toBeLessThan(html.indexOf("<title>"));
    expect(script).toBeLessThan(html.indexOf('src="/site/client/main.ts"'));
  });

  it("includes the client module script", () => {
    expect(renderLayout(base)).toContain('<script type="module" src="/site/client/main.ts"></script>');
  });

  it("omits the sidebar and the contents list when a page has neither", () => {
    const html = renderLayout({ ...base, sidebar: [], headings: [], prev: null, next: null, breadcrumb: [] });
    expect(html).not.toContain('class="sidebar"');
    expect(html).not.toContain('class="toc"');
    expect(html).not.toContain('class="pager"');
  });

  it("keeps the 404 page out of search engines", () => {
    const html = renderLayout({ ...base, section: "root", url: "/404.html", sidebar: [] });
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toContain('rel="canonical"');
  });
});
