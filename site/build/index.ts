import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseFrontMatter } from "./frontMatter";
import { renderLayout, ORIGIN, SECTION_LABELS, type Crumb, type NavLink, type SidebarItem } from "./layout";
import { galleryPages, loadGallery, type LessonRef, type LoadedGalleryEntry } from "./gallery";
import { YOULL_LEARN, canWriteInline, learnFrontBody, lessonBody, lessonText, parseLessonMeta, type LessonMeta, type SceneRef } from "./learn";
import { checkLinks } from "./links";
import { renderMarkdown } from "./markdown";
import { loadReference, rewriteRepoLink } from "./reference";
import { buildSearchIndex } from "./search";
import { SLUG, parseSiteConfig } from "./siteConfig";
import { buildSitemap } from "./sitemap";
import type { BuiltSite, Heading, Section, SiteConfig, SitePage } from "./types";

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
  /** The front matter as parsed; lessons and the course's front page read more than a title from it. */
  readonly data: Readonly<Record<string, string | string[]>>;
  /** Markdown rendered above the body (the reference's "formal reference" notice). */
  readonly banner?: string;
  /** The repository file whose relative links the body uses, when they need rewriting. */
  readonly linksFrom?: string | null;
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
      data: fm.data,
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
      const where = { section, kind: "entry", slug, url: `/${section}/${slug}/`, outFile: `${section}/${slug}/index.html` } as const;
      if (section === "reference") {
        const source = loadReference(repoRoot, slug, errors);
        if (source) {
          const doc: Doc = { ...where, ...source, data: {} };
          docs.push(doc);
          entriesBySection.reference.push(doc);
        }
        continue;
      }
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

  // The gallery is read before the pages are rendered: a lesson shows its
  // showcase's scene, and the course's front page plays one in its hero.
  const gallery = loadGallery(repoRoot, config);
  errors.push(...gallery.errors);
  const galleryById = new Map(gallery.entries.map((e) => [e.id, e]));
  const lessonMeta = new Map<Doc, LessonMeta>();
  for (const doc of entriesBySection.learn) {
    const parsed = parseLessonMeta(doc.data, doc.file);
    errors.push(...parsed.errors);
    lessonMeta.set(doc, parsed.meta);
  }
  /** The scene a lesson's `showcase` or `embed`, or the front page's `hero`, names; reports an id the gallery does not list. */
  const sceneFor = (doc: Doc, key: "showcase" | "embed" | "hero", id: string | null): LoadedGalleryEntry | null => {
    if (id === null) return null;
    if (!config.gallery.includes(id)) {
      errors.push(`${doc.file}:1: ${key} "${id}" is not a gallery entry in ${CONFIG_FILE}`);
      return null;
    }
    // A listed entry that failed to load has had its own errors reported.
    return galleryById.get(id) ?? null;
  };
  const sceneRef = (entry: LoadedGalleryEntry): SceneRef => ({ id: entry.id, title: entry.title, source: entry.source });

  const pages: SitePage[] = [];
  for (const doc of docs) {
    const linksFrom = doc.linksFrom ?? null;
    const body = renderMarkdown(doc.body, {
      file: doc.file,
      bodyLine: doc.bodyLine,
      sampleMode: doc.section === "reference" ? "run" : "live",
      ...(linksFrom !== null ? { rewriteLink: (href: string) => rewriteRepoLink(href, linksFrom) } : {}),
    });
    const banner = doc.banner
      ? renderMarkdown(doc.banner, { file: "site/build/reference.ts", bodyLine: 1, sampleMode: "run" })
      : null;
    const rendered = banner
      ? {
          html: banner.html + body.html,
          headings: [...banner.headings, ...body.headings],
          links: [...banner.links, ...body.links],
          text: `${banner.text}
${body.text}`,
          errors: [...banner.errors, ...body.errors],
        }
      : body;
    errors.push(...rendered.errors);
    let bodyHtml = rendered.html;
    let headings: ReadonlyArray<Heading> = rendered.headings;
    let links: SitePage["links"] = rendered.links;
    let text = rendered.text;
    let pageHeading = false;
    const meta = lessonMeta.get(doc);
    const lessonNumber = entriesBySection.learn.indexOf(doc) + 1;
    if (meta) {
      const entry = sceneFor(doc, "showcase", meta.showcase);
      if (entry && entry.lesson !== doc.slug) {
        const named = entry.lesson === null ? "no lesson" : `lesson "${entry.lesson}"`;
        errors.push(`${doc.file}:1: showcase "${entry.id}" names ${named} in ${entry.file}; it should name "${doc.slug}"`);
      }
      if (rendered.headings.some((h) => h.id === YOULL_LEARN.id)) {
        errors.push(`${doc.file}:1: the heading "${YOULL_LEARN.text}" is the page's own; give the body's heading another name`);
      }
      let embedded = sceneFor(doc, "embed", meta.embed);
      if (embedded && !canWriteInline(embedded.source)) {
        errors.push(`${doc.file}:1: embed "${embedded.id}" cannot be written inline: its source contains "</script" or "<!--"`);
        embedded = null;
      }
      bodyHtml = lessonBody({
        slug: doc.slug,
        meta,
        bodyHtml: rendered.html,
        showcase: entry ? sceneRef(entry) : null,
        embed: embedded ? sceneRef(embedded) : null,
      });
      headings = [YOULL_LEARN, ...rendered.headings];
      for (const scene of [entry, embedded]) {
        if (scene) links = [...links, { href: `/gallery/${scene.id}/`, line: 1, file: doc.file }];
      }
      text = lessonText(meta, rendered.text);
    } else if (doc.section === "learn" && doc.kind === "index") {
      const str = (key: string): string | null => {
        const value = doc.data[key];
        return typeof value === "string" && value !== "" ? value : null;
      };
      const hero = sceneFor(doc, "hero", str("hero"));
      const lead = str("summary") ?? doc.description;
      const cards = entriesBySection.learn.map((lesson, i) => {
        const m = lessonMeta.get(lesson)!;
        // A lesson with no showcase shows the scene it embeds, so no card is left blank.
        const id = m.showcase ?? m.embed;
        const showcase = id === null ? undefined : galleryById.get(id);
        return {
          slug: lesson.slug,
          number: i + 1,
          title: lesson.title,
          summary: m.summary,
          poster: showcase ? { source: showcase.source, time: showcase.poster } : null,
        };
      });
      const front = learnFrontBody({
        heading: str("heading") ?? doc.title,
        lead,
        bodyHtml: rendered.html,
        lessons: cards,
        hero: hero ? sceneRef(hero) : null,
      });
      // Search reads the page as a reader sees it: the hero's lead, the
      // introduction, then each card's title and summary.
      text = [lead, rendered.text, ...cards.map((c) => `${c.title}\n${c.summary}`)].filter((t) => t !== "").join("\n");
      bodyHtml = front.html;
      headings = [...front.headings.slice(0, 1), ...rendered.headings, ...front.headings.slice(1)];
      links = [...links, ...front.links.map((href) => ({ href, line: 1, file: doc.file }))];
      pageHeading = true;
    }

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
        const here = section === "learn" ? `Lesson ${lessonNumber}` : doc.title;
        breadcrumb = [{ title: SECTION_LABELS[section], href: `/${section}/` }, { title: here }];
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
        bodyHtml,
        headings,
        sidebar,
        prev,
        next,
        breadcrumb,
        pageHeading,
      }),
      headings,
      text,
      links,
    });
  }

  // The gallery's pages come after the lessons, so an entry can name the lesson it showcases.
  const lessons = new Map<string, LessonRef>(
    entriesBySection.learn.map((doc, i) => [doc.slug, { title: doc.title, number: i + 1 }]),
  );
  pages.push(...galleryPages(gallery.entries, lessons));

  errors.push(...checkLinks(pages));

  return {
    pages,
    errors,
    sitemap: buildSitemap(pages, ORIGIN),
    searchIndex: buildSearchIndex(pages),
  };
}
