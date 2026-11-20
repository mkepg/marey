import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_KEY } from "../client/theme";
import { renderLayout, VIEW_TRANSITION_SCRIPT, type LayoutInput } from "./layout";

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
    // The only images are the brand mark's own two, in the header and footer.
    expect(html).not.toContain("<img src=x");
    expect(html.match(/<img\b/g)).toHaveLength(2);
    expect(html.match(/<img class="wordmark-mark" src="\/favicon\.svg"/g)).toHaveLength(2);
  });

  it("draws the brand mark, the favicon, beside the wordmark in the header and the footer", () => {
    const html = renderLayout(base);
    expect(html).toContain('<a class="wordmark" href="/learn/"><img class="wordmark-mark" src="/favicon.svg" width="24" height="24" alt="" />Marey</a>');
    expect(html).toContain('<span class="wordmark"><img class="wordmark-mark" src="/favicon.svg" width="24" height="24" alt="" />Marey</span>');
  });

  it("leaves the h1 to the page when the page supplies its own", () => {
    const html = renderLayout({ ...base, url: "/learn/", title: "Learn", bodyHtml: '<h1 class="hero-title">Learn Marey</h1>', pageHeading: true });
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('<h1 class="hero-title">Learn Marey</h1>');
    expect(renderLayout(base).match(/<h1[ >]/g)).toHaveLength(1);
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
    // A blocked localStorage throws on read: the script must swallow it.
    expect(html.slice(script, script + 300)).toMatch(/\}catch\(e\)\{\}/);
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

  it("reads the theme from the key the client's toggle writes", () => {
    expect(renderLayout(base)).toContain(`localStorage.getItem(${JSON.stringify(THEME_KEY)})`);
  });

  it("marks only a skipped view transition's rejection as handled, as the playground's page does", () => {
    const html = renderLayout(base);
    const handled = (reason: unknown) => {
      let listener: ((e: { reason: unknown; preventDefault(): void }) => void) | undefined;
      new Function("addEventListener", VIEW_TRANSITION_SCRIPT)((type: string, fn: typeof listener) => {
        if (type === "unhandledrejection") listener = fn;
      });
      let prevented = false;
      listener!({ reason, preventDefault: () => (prevented = true) });
      return prevented;
    };
    expect(handled(Object.assign(new Error("Transition was skipped"), { name: "AbortError" }))).toBe(true);
    expect(handled(Object.assign(new Error("The user aborted a request."), { name: "AbortError" }))).toBe(false);
    expect(handled(new Error("Transition was skipped"))).toBe(false);
    expect(handled(undefined)).toBe(false);
    expect(html.indexOf(VIEW_TRANSITION_SCRIPT)).toBeGreaterThan(-1);
    expect(html.indexOf(VIEW_TRANSITION_SCRIPT)).toBeLessThan(html.indexOf("<title>"));
    const playground = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    expect(playground).toContain(`<script>${VIEW_TRANSITION_SCRIPT}</script>`);
  });

  it("marks the document as scripted before any stylesheet, so the drawer only replaces the plain layout when it can open", () => {
    const html = renderLayout(base);
    expect(html.indexOf('classList.add("js")')).toBeGreaterThan(-1);
    expect(html.indexOf('classList.add("js")')).toBeLessThan(html.indexOf("<title>"));
  });

  it("hides the controls that need the client script until it runs", () => {
    const html = renderLayout(base);
    for (const cls of ["search-button", "theme-toggle", "sidebar-toggle", "menu-toggle"]) {
      expect(html).toMatch(new RegExp(`<button class="${cls}"[^>]* hidden>`));
    }
  });

  it("numbers lessons in the sidebar and names each by its slug for the progress ticks", () => {
    const html = renderLayout(base);
    expect(html).toContain('<li class="lesson-item" data-lesson="animate"><a href="/learn/animate/" aria-current="page">');
    expect(html).toContain('<span class="visually-hidden">Lesson 3: </span>Animate');
    expect(html).toContain('class="sidebar-list is-course"');
  });

  it("lists the page's headings beside the content and again, collapsed, under the title", () => {
    const html = renderLayout(base);
    expect(html).toContain('<aside class="toc" aria-label="On this page">');
    expect(html).toMatch(/<h1>Animate<\/h1>\s*<details class="toc-inline"><summary>On this page<\/summary><ol><li class="toc-2"><a href="#easing">Easing<\/a>/);
  });

  it("gives the course's front page the full width, with no sidebar", () => {
    const html = renderLayout({ ...base, url: "/learn/", title: "Learn" });
    expect(html).toContain('<body class="section-learn page-front">');
    expect(html).not.toContain('id="sidebar"');
    expect(html).not.toContain('class="sidebar-toggle"');
  });

  it("keeps the 404 page out of search engines", () => {
    const html = renderLayout({ ...base, section: "root", url: "/404.html", sidebar: [] });
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toContain('rel="canonical"');
  });
});
