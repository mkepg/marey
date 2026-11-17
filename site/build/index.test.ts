import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSite } from "./index";

const repoRoot = resolve(import.meta.dirname, "../..");

describe("buildSite on the repository", () => {
  const site = buildSite(repoRoot);

  it("has no errors", () => {
    expect(site.errors).toEqual([]);
  });

  it("includes the section index pages and the 404 page", () => {
    const urls = site.pages.map((p) => p.url);
    for (const url of ["/learn/", "/guides/", "/reference/", "/404.html"]) {
      expect(urls).toContain(url);
    }
  });

  it("gives every page a unique url and outFile", () => {
    expect(new Set(site.pages.map((p) => p.url)).size).toBe(site.pages.length);
    expect(new Set(site.pages.map((p) => p.outFile)).size).toBe(site.pages.length);
  });

  it("writes each page to the path its address implies", () => {
    const learn = site.pages.find((p) => p.url === "/learn/");
    expect(learn?.outFile).toBe("learn/index.html");
    expect(site.pages.find((p) => p.url === "/404.html")?.outFile).toBe("404.html");
  });

  it("generates a sitemap and a search index that list the pages", () => {
    expect(site.sitemap).toContain("<loc>https://marey.pages.dev/learn/</loc>");
    expect(site.sitemap).not.toContain("404");
    const index = JSON.parse(site.searchIndex) as Array<{ url: string }>;
    expect(index.map((e) => e.url)).toContain("/learn/");
  });
});

describe("buildSite on a fixture", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function fixture(config: unknown, files: Record<string, string> = {}): string {
    const dir = mkdtempSync(join(tmpdir(), "marey-site-"));
    dirs.push(dir);
    const page = (title: string, body = "Text.") => `---\ntitle: ${title}\ndescription: About ${title}.\n---\n\n${body}\n`;
    const all: Record<string, string> = {
      "site/site.json": JSON.stringify(config),
      "site/content/learn/index.md": page("Learn"),
      "site/content/guides/index.md": page("Guides"),
      "site/content/reference/index.md": page("Reference"),
      "site/content/404.md": page("Not found"),
      ...files,
    };
    for (const [path, content] of Object.entries(all)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    return dir;
  }

  const empty = { learn: [], guides: [], reference: [], gallery: [] };
  const lesson = (slug: string) => ({ slug, vocabulary: [] });
  const lessonPage = (title: string, extra = "", body = "Text.") =>
    `---\ntitle: ${title}\nsummary: About ${title}.\ndescription: The ${title} lesson.\nminutes: 9\nlearn:\n- One\n- Two\n- Three\n${extra}---\n\n${body}\n`;
  const scene = "scene {\n  size: (400, 300)\n  duration: 2\n  circle c { position: (200, 150), radius: 20 }\n}\n";
  const entry = (lessonSlug: string) => `---\ntitle: Sun\nsummary: A sun.\ntags:\n- lesson\nlesson: ${lessonSlug}\n---\n\nNotes.\n`;

  it("builds a listed lesson with its sidebar number, pager and breadcrumb", () => {
    const dir = fixture(
      { ...empty, learn: [lesson("one"), lesson("two")] },
      {
        "site/content/learn/one.md": lessonPage("One", "", "## Part"),
        "site/content/learn/two.md": lessonPage("Two", "", "See [one](/learn/one/#part)."),
      },
    );
    const site = buildSite(dir);
    expect(site.errors).toEqual([]);
    const two = site.pages.find((p) => p.url === "/learn/two/");
    expect(two?.outFile).toBe("learn/two/index.html");
    expect(two?.html).toContain('<span class="num" aria-hidden="true">2</span><span class="visually-hidden">Lesson 2: </span>');
    expect(two?.html).toContain('rel="prev" href="/learn/one/"');
    expect(two?.html).toContain('rel="next" href="/gallery/"');
    expect(two?.html).toContain("<title>Two · Learn Marey</title>");
  });

  it("renders a lesson's anatomy: breadcrumb, reading time, what it teaches, showcase, finish toggle", () => {
    const dir = fixture(
      { ...empty, learn: [lesson("one"), lesson("two")], gallery: ["sun"] },
      {
        "site/content/learn/one.md": lessonPage("One"),
        "site/content/learn/two.md": lessonPage("Two", "showcase: sun\n", "## Part\n\nBody."),
        "site/gallery/sun.md": entry("two"),
        "site/gallery/sun.marey": scene,
      },
    );
    const site = buildSite(dir);
    expect(site.errors).toEqual([]);
    const two = site.pages.find((p) => p.url === "/learn/two/")!;
    expect(two.html).toContain('<nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="/learn/">Learn</a></li><li aria-current="page">Lesson 2</li></ol></nav>');
    expect(two.html).toContain("<h1>Two</h1>");
    expect(two.html).toContain('<p class="lesson-time">About 9 minutes</p>');
    expect(two.html).toContain("<li>One</li><li>Two</li><li>Three</li>");
    expect(two.html).toContain('<figure class="sample" data-mode="showcase"');
    expect(two.html).toContain('<a href="/gallery/sun/">Sun</a>');
    expect(two.html).toContain('data-finish-lesson="two"');
    expect(two.headings.map((h) => h.id)).toEqual(["youll-learn", "part"]);
    expect(two.links.map((l) => l.href)).toContain("/gallery/sun/");
    expect(two.text).toContain("About Two.");
  });

  it("reports a lesson whose front matter misses a key, and still builds the rest", () => {
    const dir = fixture(
      { ...empty, learn: [lesson("one")] },
      { "site/content/learn/one.md": "---\ntitle: One\ndescription: d\n---\n\nText.\n" },
    );
    expect(buildSite(dir).errors).toEqual([
      `site/content/learn/one.md:1: a lesson's front matter needs "summary"`,
      `site/content/learn/one.md:1: a lesson's front matter needs "minutes"`,
      `site/content/learn/one.md:1: a lesson's front matter needs "learn"`,
    ]);
  });

  it("reports a showcase that names no gallery entry, or an entry that names another lesson", () => {
    const dir = fixture(
      { ...empty, learn: [lesson("one"), lesson("two")], gallery: ["sun"] },
      {
        "site/content/learn/one.md": lessonPage("One", "showcase: moon\n"),
        "site/content/learn/two.md": lessonPage("Two", "showcase: sun\n"),
        "site/gallery/sun.md": entry("one"),
        "site/gallery/sun.marey": scene,
      },
    );
    expect(buildSite(dir).errors).toEqual([
      'site/content/learn/one.md:1: showcase "moon" is not a gallery entry in site/site.json',
      'site/content/learn/two.md:1: showcase "sun" names lesson "one" in site/gallery/sun.md; it should name "two"',
    ]);
  });

  it("embeds a gallery scene inline in a lesson that names it, and links its gallery page", () => {
    const dir = fixture(
      { ...empty, learn: [lesson("one")], gallery: ["sun"] },
      {
        "site/content/learn/one.md": lessonPage("One", "embed: sun\n", "## Part"),
        "site/gallery/sun.md": entry("one"),
        "site/gallery/sun.marey": scene,
      },
    );
    const site = buildSite(dir);
    expect(site.errors).toEqual([]);
    const one = site.pages.find((p) => p.url === "/learn/one/")!;
    expect(one.html).toContain('<script type="text/marey">\n' + scene + "\n</script>");
    expect(one.links.map((l) => l.href)).toContain("/gallery/sun/");
  });

  it("reports an embedded scene that names no gallery entry, or whose text would end its script early", () => {
    const dir = fixture(
      { ...empty, learn: [lesson("one"), lesson("two")], gallery: ["sun"] },
      {
        "site/content/learn/one.md": lessonPage("One", "embed: moon\n"),
        "site/content/learn/two.md": lessonPage("Two", "embed: sun\n"),
        "site/gallery/sun.md": entry("two"),
        "site/gallery/sun.marey": scene.replace("circle c", "// a </SCRIPT> in a comment\n  circle c"),
      },
    );
    expect(buildSite(dir).errors).toEqual([
      'site/content/learn/one.md:1: embed "moon" is not a gallery entry in site/site.json',
      'site/content/learn/two.md:1: embed "sun" cannot be written inline: its source contains "</script" or "<!--"',
    ]);
  });

  it("reports an embedded scene whose text holds the start of an HTML comment", () => {
    const dir = fixture(
      { ...empty, learn: [lesson("one")], gallery: ["sun"] },
      {
        "site/content/learn/one.md": lessonPage("One", "embed: sun\n"),
        "site/gallery/sun.md": entry("one"),
        "site/gallery/sun.marey": scene.replace("circle c", "// <!-- in a comment\n  circle c"),
      },
    );
    expect(buildSite(dir).errors).toEqual([
      'site/content/learn/one.md:1: embed "sun" cannot be written inline: its source contains "</script" or "<!--"',
    ]);
  });

  it("gives /learn/ exactly one h1, the hero's, with cards for the lessons", () => {
    const dir = fixture(
      { ...empty, learn: [lesson("one"), lesson("two")], gallery: ["lighthouse", "sun"] },
      {
        "site/content/learn/index.md": "---\ntitle: Learn\ndescription: The course.\nheading: Learn Marey\nsummary: A course.\nhero: lighthouse\n---\n\nIntro.\n",
        "site/content/learn/one.md": lessonPage("One", "showcase: sun\n"),
        "site/content/learn/two.md": lessonPage("Two"),
        "site/gallery/sun.md": entry("one"),
        "site/gallery/sun.marey": scene,
        "site/gallery/lighthouse.md": "---\ntitle: Lighthouse\nsummary: A lamp.\n---\n\nNotes.\n",
        "site/gallery/lighthouse.marey": scene,
      },
    );
    const site = buildSite(dir);
    expect(site.errors).toEqual([]);
    const learn = site.pages.find((p) => p.url === "/learn/")!;
    expect(learn.html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(learn.html).toContain('<h1 class="hero-title">Learn Marey</h1>');
    expect(learn.html).toContain('<title>Learn · Marey</title>');
    expect(learn.html).toContain('href="/learn/one/">Start with lesson 1</a>');
    expect(learn.html).toContain('<li class="lesson-card" data-lesson="two">');
    expect(learn.html).toContain('<figure class="hero-stage"><div class="sample-stage" data-source="scene {');
    expect(learn.text).toContain("Intro.");
    // Search finds the hero's lead and every card's title and summary.
    for (const words of ["A course.", "One", "About One.", "About Two."]) expect(learn.text).toContain(words);
  });

  it("gives a lesson card the poster of the scene its lesson embeds when it has no showcase", () => {
    const moon = scene.replace("circle c", "circle moon");
    const dir = fixture(
      { ...empty, learn: [lesson("one"), lesson("two")], gallery: ["moon"] },
      {
        "site/content/learn/one.md": lessonPage("One"),
        "site/content/learn/two.md": lessonPage("Two", "embed: moon\n"),
        "site/gallery/moon.md": "---\ntitle: Moon\nsummary: A moon.\nposter: 1\n---\n\nNotes.\n",
        "site/gallery/moon.marey": moon,
      },
    );
    const site = buildSite(dir);
    expect(site.errors).toEqual([]);
    const html = site.pages.find((p) => p.url === "/learn/")!.html;
    const card = (slug: string) => html.slice(html.indexOf(`data-lesson="${slug}"`), html.indexOf("</li>", html.indexOf(`data-lesson="${slug}"`)));
    expect(card("two")).toContain('<div class="lesson-card-poster sample-stage" data-source="scene {');
    expect(card("two")).toContain("circle moon");
    expect(card("two")).toContain('data-poster="1"');
    expect(card("one")).toContain('<div class="lesson-card-poster"></div>');
  });

  it("reports a /learn/ hero that names no gallery entry", () => {
    const dir = fixture(empty, {
      "site/content/learn/index.md": "---\ntitle: Learn\ndescription: The course.\nhero: moon\n---\n",
    });
    expect(buildSite(dir).errors).toEqual(['site/content/learn/index.md:1: hero "moon" is not a gallery entry in site/site.json']);
  });

  it("falls back to the title and description for the /learn/ hero", () => {
    const learn = buildSite(fixture(empty)).pages.find((p) => p.url === "/learn/")!;
    expect(learn.html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(learn.html).toContain('<h1 class="hero-title">Learn</h1>');
    expect(learn.html).toContain('<p class="hero-lead">About Learn.</p>');
  });

  it("reports a content file that site.json does not list", () => {
    const dir = fixture(empty, { "site/content/guides/stray.md": "---\ntitle: S\ndescription: d\n---\n" });
    expect(buildSite(dir).errors).toEqual(["site/content/guides/stray.md:1: the file is not listed in site/site.json"]);
  });

  it("reports a site.json entry with no file", () => {
    const dir = fixture({ ...empty, guides: ["ghost"] });
    expect(buildSite(dir).errors).toEqual([
      "site/content/guides/ghost.md:1: the page is listed but its file does not exist",
    ]);
  });

  it("reports a duplicate entry and a bad slug", () => {
    const dir = fixture(
      { ...empty, guides: ["a", "a", "Bad Slug"] },
      { "site/content/guides/a.md": "---\ntitle: A\ndescription: d\n---\n" },
    );
    const errors = buildSite(dir).errors.join("\n");
    expect(errors).toMatch(/guides lists "a" more than once/);
    expect(errors).toMatch(/guides slug "Bad Slug" must be/);
  });

  it("reports a front-matter error with its file and line, and keeps going", () => {
    const dir = fixture(
      { ...empty, guides: ["a", "b"] },
      {
        "site/content/guides/a.md": "---\ntitle: A\ntitle: B\n---\n",
        "site/content/guides/b.md": "---\ntitle: B\n---\n",
      },
    );
    const errors = buildSite(dir).errors;
    expect(errors).toContain('site/content/guides/a.md:3: duplicate key "title"');
    expect(errors).toContain('site/content/guides/b.md:1: front matter needs a "description"');
  });

  it("reports a broken link and a broken anchor with the line in the content file", () => {
    const dir = fixture(
      { ...empty, guides: ["a"] },
      {
        "site/content/guides/a.md": "---\ntitle: A\ndescription: d\n---\n\nOne\n\n[x](/nope/) [y](/guides/#nope)\n",
      },
    );
    const errors = buildSite(dir).errors;
    expect(errors).toHaveLength(2);
    // The body starts on line 5 (a blank line); the links are on line 8.
    expect(errors[0]).toMatch(/^site\/content\/guides\/a\.md:8: /);
  });

  it("reports a missing site.json and a gallery entry with no file", () => {
    expect(buildSite(join(tmpdir(), "marey-site-does-not-exist")).errors).toHaveLength(1);
    const dir = fixture({ ...empty, gallery: ["x"] });
    expect(buildSite(dir).errors).toEqual(["site/gallery/x.md:1: the gallery entry is listed but its file does not exist"]);
  });

  it("builds the gallery index even with no entries", () => {
    const site = buildSite(fixture(empty));
    expect(site.errors).toEqual([]);
    expect(site.pages.find((p) => p.url === "/gallery/")?.outFile).toBe("gallery/index.html");
  });

  it("escapes a hostile title through the whole page", () => {
    const dir = fixture(
      { ...empty, guides: ["a"] },
      { "site/content/guides/a.md": "---\ntitle: <script>x</script>\ndescription: a \"quoted\" <b>\n---\n" },
    );
    const page = buildSite(dir).pages.find((p) => p.url === "/guides/a/");
    expect(page?.html).not.toContain("<script>x");
    expect(page?.html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });
});
