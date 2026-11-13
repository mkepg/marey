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

  it("builds a listed lesson with its sidebar number, pager and breadcrumb", () => {
    const dir = fixture(
      { ...empty, learn: [lesson("one"), lesson("two")] },
      {
        "site/content/learn/one.md": "---\ntitle: One\ndescription: d\n---\n\n## Part\n",
        "site/content/learn/two.md": "---\ntitle: Two\ndescription: d\n---\n\nSee [one](/learn/one/#part).\n",
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
