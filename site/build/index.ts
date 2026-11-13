import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseFrontMatter } from "./frontMatter";
import { renderLayout, ORIGIN, SECTION_LABELS, type Crumb, type NavLink, type SidebarItem } from "./layout";
import { checkLinks } from "./links";
import { renderMarkdown } from "./markdown";
import { buildSearchIndex } from "./search";
import { SLUG, parseSiteConfig } from "./siteConfig";
import { buildSitemap } from "./sitemap";
import type { BuiltSite, Section, SiteConfig, SitePage } from "./types";

type DocSection = Exclude<Section, "gallery">;

interface Doc {
  readonly section: DocSection;
  readonly kind: "index" | "entry" | "notFound";
  readonly slug: string;
  readonly url: string;
  readonly outFile: string;
  /** Repository-relative, with forward slashes, as an error names it. */
  readonly file: string;
  readonly title: string;
  readonly description: string;
  readonly body: string;
  readonly bodyLine: number;
}

const CONTENT = "site/content";
const CONFIG_FILE = "site/site.json";

function emptySite(errors: string[]): BuiltSite {
  return { pages: [], errors, sitemap: buildSitemap([], ORIGIN), searchIndex: buildSearchIndex([]) };
}

function loadDoc(
  repoRoot: string,
  file: string,
  where: Pick<Doc, "section" | "kind" | "slug" | "url" | "outFile">,
  errors: string[],
): Doc | null {
  const path = join(repoRoot, file);
  if (!existsSync(path)) {
    errors.push(`${file}:1: the page is listed but its file does not exist`);
    return null;
  }
  try {
    const fm = parseFrontMatter(readFileSync(path, "utf8"), file);
    const title = fm.data.title;
    const description = fm.data.description;
    let ok = true;
    for (const [key, value] of [["title", title], ["description", description]] as const) {
      if (typeof value !== "string" || value === "") {
        errors.push(`${file}:1: front matter needs a "${key}"`);
        ok = false;
      }
    }
    if (!ok) return null;
    return {
      ...where,
      file,
      title: title as string,
      description: description as string,
      body: fm.body,
      bodyLine: fm.bodyLine,
    };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** The content files in a section's directory that `site.json` does not list. */
function unlistedFiles(repoRoot: string, section: string, listed: ReadonlyArray<string>): string[] {
  const dir = join(repoRoot, CONTENT, section);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== "index.md")
    .filter((name) => !listed.includes(name.slice(0, -3)))
    .sort()
    .map((name) => `${CONTENT}/${section}/${name}`);
}

function sectionSlugs(repoRoot: string, config: SiteConfig, section: "learn" | "guides" | "reference", errors: string[]): string[] {
  const slugs = section === "learn" ? config.learn.map((l) => l.slug) : [...config[section]];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const slug of slugs) {
    if (!SLUG.test(slug) || slug === "index") {
      errors.push(`${CONFIG_FILE}:1: ${section} slug "${slug}" must be lower-case words joined by hyphens`);
    } else if (seen.has(slug)) {
      errors.push(`${CONFIG_FILE}:1: ${section} lists "${slug}" more than once`);
    } else {
      seen.add(slug);
      kept.push(slug);
    }
  }
  for (const file of unlistedFiles(repoRoot, section, slugs)) {
    errors.push(`${file}:1: the file is not listed in ${CONFIG_FILE}`);
  }
  return kept;
}

/**
 * Builds every page of the documentation site from `site/site.json` and the
 * Markdown under `site/content/`. Problems are collected, not thrown, so one
 * run reports all of them; the caller decides whether they stop the build.
 */
export function buildSite(repoRoot: string): BuiltSite {
  const errors: string[] = [];

  const configPath = join(repoRoot, CONFIG_FILE);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (e) {
    return emptySite([`${CONFIG_FILE}:1: ${e instanceof Error ? e.message : String(e)}`]);
  }
  const parsed = parseSiteConfig(json, CONFIG_FILE);
  errors.push(...parsed.errors);
  const config = parsed.config;

  for (const id of config.gallery) {
    errors.push(`${CONFIG_FILE}:1: gallery entry "${id}" cannot be built yet; gallery pages are not generated`);
  }

  // Load every document, then render, so each page can name its neighbours.
  const docs: Doc[] = [];
  const entriesBySection: Record<"learn" | "guides" | "reference", Doc[]> = { learn: [], guides: [], reference: [] };
  const indexBySection: Partial<Record<DocSection, Doc>> = {};

  for (const section of ["learn", "guides", "reference"] as const) {
    const index = loadDoc(
      repoRoot,
      `${CONTENT}/${section}/index.md`,
      { section, kind: "index", slug: "index", url: `/${section}/`, outFile: `${section}/index.html` },
      errors,
    );
    if (index) {
      docs.push(index);
      indexBySection[section] = index;
    }
    for (const slug of sectionSlugs(repoRoot, config, section, errors)) {
      const doc = loadDoc(
        repoRoot,
        `${CONTENT}/${section}/${slug}.md`,
        { section, kind: "entry", slug, url: `/${section}/${slug}/`, outFile: `${section}/${slug}/index.html` },
        errors,
      );
      if (doc) {
        docs.push(doc);
        entriesBySection[section].push(doc);
      }
    }
  }
  const notFound = loadDoc(
    repoRoot,
    `${CONTENT}/404.md`,
    { section: "root", kind: "notFound", slug: "404", url: "/404.html", outFile: "404.html" },
    errors,
  );
  if (notFound) docs.push(notFound);

  const pages: SitePage[] = [];
  for (const doc of docs) {
    const rendered = renderMarkdown(doc.body, {
      file: doc.file,
      bodyLine: doc.bodyLine,
      sampleMode: doc.section === "reference" ? "run" : "live",
    });
    errors.push(...rendered.errors);

    const sidebar: SidebarItem[] = [];
    let prev: NavLink | null = null;
    let next: NavLink | null = null;
    let breadcrumb: Crumb[] = [];
    if (doc.section !== "root") {
      const section = doc.section;
      const index = indexBySection[section];
      const entries = entriesBySection[section];
      if (index) sidebar.push({ href: index.url, title: "Overview" });
      entries.forEach((e, i) => {
        sidebar.push({ href: e.url, title: e.title, ...(section === "learn" ? { number: i + 1 } : {}) });
      });
      if (doc.kind === "entry") {
        breadcrumb = [{ title: SECTION_LABELS[section], href: `/${section}/` }, { title: doc.title }];
      }
      if (section !== "reference") {
        const order = [...(index ? [index] : []), ...entries];
        const at = order.indexOf(doc);
        const before = order[at - 1];
        const after = order[at + 1];
        if (before) prev = { href: before.url, title: before === index ? "Overview" : before.title };
        if (after) next = { href: after.url, title: after.title };
        else if (section === "learn" && doc.kind === "entry") next = { href: "/gallery/", title: "Gallery" };
      }
    }

    pages.push({
      url: doc.url,
      outFile: doc.outFile,
      section: doc.section,
      title: doc.title,
      description: doc.description,
      html: renderLayout({
        section: doc.section,
        url: doc.url,
        title: doc.title,
        description: doc.description,
        bodyHtml: rendered.html,
        headings: rendered.headings,
        sidebar,
        prev,
        next,
        breadcrumb,
      }),
      headings: rendered.headings,
      text: rendered.text,
      links: rendered.links,
    });
  }

  errors.push(...checkLinks(pages));

  return {
    pages,
    errors,
    sitemap: buildSitemap(pages, ORIGIN),
    searchIndex: buildSearchIndex(pages),
  };
}
