import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compileSource } from "../../src/compiler/compileSource";
import { lex } from "../../src/compiler/lexer";
import { buildShareURLFor } from "../../src/lib/share";
import { checkOne } from "../../src/cli/check";
import { highlightMarey } from "../shared/highlight";
import { escapeHtml as esc } from "./escape";
import { parseFrontMatter } from "./frontMatter";
import { renderLayout } from "./layout";
import { renderMarkdown } from "./markdown";
import { SLUG, parseSiteConfig } from "./siteConfig";
import type { Heading, SiteConfig, SitePage } from "./types";

export const GALLERY_DIR = "site/gallery";
const CONFIG_FILE = "site/site.json";
const PLAYGROUND = "https://marey.pages.dev/";

/** The tags a gallery entry may carry, in the order the filter shows them. */
export const GALLERY_TAGS = ["physics", "generative", "text", "loop", "lesson"] as const;
export type GalleryTag = (typeof GALLERY_TAGS)[number];

const KEYS = ["title", "summary", "tags", "poster", "lesson", "source"] as const;

export interface GalleryEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: ReadonlyArray<GalleryTag>;
  /** Seconds into the scene for the card's still frame; null keeps the player's own (a bounded scene's last tick). */
  readonly poster: number | null;
  /** The slug of the lesson this scene is the showcase of. */
  readonly lesson: string | null;
  /** The scene file, repository-relative with forward slashes. */
  readonly sourcePath: string;
  readonly source: string;
  /** "How it's made", rendered from the entry's Markdown body. */
  readonly notesHtml: string;
}

/** What the page generator needs beyond the entry itself. */
export interface LoadedGalleryEntry extends GalleryEntry {
  /** The entry's Markdown file, repository-relative. */
  readonly file: string;
  readonly duration: number;
  /** The scene's size, which the scene page's stage takes its shape from. */
  readonly width: number;
  readonly height: number;
  readonly notes: {
    readonly headings: ReadonlyArray<Heading>;
    readonly links: SitePage["links"];
    readonly text: string;
  };
}

/** A lesson as a gallery page names it. */
export interface LessonRef {
  readonly title: string;
  readonly number: number;
}

/** The page's own headings, which the notes sit under. */
const NOTES_HEADING: Heading = { depth: 2, text: "How it's made", id: "how-its-made" };
const SOURCE_HEADING: Heading = { depth: 2, text: "Source", id: "source" };

function readConfig(repoRoot: string, errors: string[]): SiteConfig | null {
  try {
    const parsed = parseSiteConfig(JSON.parse(readFileSync(join(repoRoot, CONFIG_FILE), "utf8")), CONFIG_FILE);
    errors.push(...parsed.errors);
    return parsed.config;
  } catch (e) {
    errors.push(`${CONFIG_FILE}:1: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** The ids `site.json` lists, minus the malformed and the repeated, which are reported. */
function listedIds(config: SiteConfig, errors: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const id of config.gallery) {
    if (!SLUG.test(id) || id === "index") {
      errors.push(`${CONFIG_FILE}:1: gallery id "${id}" must be lower-case words joined by hyphens`);
    } else if (seen.has(id)) {
      errors.push(`${CONFIG_FILE}:1: gallery lists "${id}" more than once`);
    } else {
      seen.add(id);
      kept.push(id);
    }
  }
  return kept;
}

/** The text of a front-matter value that must be one line, or null when absent or a list. */
function str(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Whether the scene draws any text, read from its tokens so strings and comments do not count. */
function hasTextObject(source: string): boolean {
  try {
    return lex(source).some((t) => t.type === "KEYWORD" && t.value === "text");
  } catch {
    return false;
  }
}

/** Compiles the scene and checks it can be exported; returns its length and size, or null after reporting why not. */
function checkScene(
  sourcePath: string,
  source: string,
  errors: string[],
): { duration: number; width: number; height: number } | null {
  const outcome = compileSource(source);
  if (!outcome.ok || !outcome.ir) {
    if (outcome.errors.length === 0) errors.push(`${sourcePath}:1: the scene does not compile`);
    for (const e of outcome.errors) errors.push(`${sourcePath}:${e.line ?? 1}: ${e.message}`);
    return null;
  }
  const duration = outcome.ir.duration;
  if (duration === null || !Number.isFinite(duration)) {
    errors.push(`${sourcePath}:1: a gallery scene needs a finite duration; add duration: to the scene block`);
    return null;
  }
  // The same question `marey check --export-ready` answers. With a finite
  // duration it cannot fail today (every remaining diagnostic depends on a
  // frame rate, which the check leaves out); it is here so that a rule added
  // to that check reaches the gallery too.
  const exportable = checkOne(sourcePath, source, { files: [], exportReady: true, fps: null, reporter: "text", error: null });
  if (!exportable.ok) {
    for (const line of exportable.lines) errors.push(line.replace(/^([^:]+): /, "$1:1: "));
    return null;
  }
  return { duration, width: outcome.ir.width, height: outcome.ir.height };
}

function loadEntry(
  repoRoot: string,
  id: string,
  lessons: ReadonlySet<string>,
  errors: string[],
): LoadedGalleryEntry | null {
  const file = `${GALLERY_DIR}/${id}.md`;
  if (!existsSync(join(repoRoot, file))) {
    errors.push(`${file}:1: the gallery entry is listed but its file does not exist`);
    return null;
  }
  const at = `${file}:1`;
  let fm;
  try {
    fm = parseFrontMatter(readFileSync(join(repoRoot, file), "utf8"), file);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return null;
  }
  const before = errors.length;
  const data = fm.data;

  const title = str(data.title);
  const summary = str(data.summary);
  if (title === null) errors.push(`${at}: front matter needs a "title"`);
  if (summary === null) errors.push(`${at}: front matter needs a "summary"`);
  for (const key of Object.keys(data)) {
    if (!(KEYS as ReadonlyArray<string>).includes(key)) {
      errors.push(`${at}: unknown front matter key "${key}"; a gallery entry takes ${KEYS.join(", ")}`);
    }
  }

  const tags: GalleryTag[] = [];
  if (data.tags !== undefined && !Array.isArray(data.tags)) {
    errors.push(`${at}: "tags" must be a list of "- tag" lines`);
  } else {
    for (const tag of data.tags ?? []) {
      if ((GALLERY_TAGS as ReadonlyArray<string>).includes(tag)) tags.push(tag as GalleryTag);
      else errors.push(`${at}: unknown tag "${tag}"; tags are ${GALLERY_TAGS.join(", ")}`);
    }
  }

  let poster: number | null = null;
  const posterText = data.poster;
  if (posterText !== undefined) {
    if (typeof posterText === "string" && /^\d+(?:\.\d+)?$/.test(posterText)) poster = Number(posterText);
    else errors.push(`${at}: poster must be a number of seconds, found "${String(posterText)}"`);
  }

  const lesson = str(data.lesson);
  if (lesson !== null && !lessons.has(lesson)) {
    errors.push(`${at}: lesson "${lesson}" is not a lesson in ${CONFIG_FILE}`);
  }
  if (lesson !== null && !tags.includes("lesson")) errors.push(`${at}: an entry with a lesson is tagged "lesson"`);
  if (lesson === null && tags.includes("lesson")) errors.push(`${at}: the "lesson" tag needs a lesson: in the front matter`);

  // The scene: a file beside the entry, or the one `source:` names.
  const named = str(data.source);
  const beside = `${GALLERY_DIR}/${id}.marey`;
  let sourcePath: string | null = null;
  if (named !== null) {
    if (existsSync(join(repoRoot, beside))) {
      errors.push(`${at}: the entry names source: ${named} and also has ${beside}; keep one`);
    } else if (!existsSync(join(repoRoot, named))) {
      errors.push(`${at}: source: ${named} does not exist`);
    } else {
      sourcePath = named;
    }
  } else if (existsSync(join(repoRoot, beside))) {
    sourcePath = beside;
  } else {
    errors.push(`${at}: the entry has no scene: write ${beside} or name one with source:`);
  }

  const notes = renderMarkdown(fm.body, { file, bodyLine: fm.bodyLine, sampleMode: "live" });
  errors.push(...notes.errors);
  for (const h of notes.headings) {
    if (h.depth === 2) {
      // The heading's line is not kept in the page model; find it in the file.
      const lines = readFileSync(join(repoRoot, file), "utf8").split(/\r?\n/);
      const line = lines.findIndex((l, i) => i >= fm.bodyLine - 1 && /^##\s/.test(l) && l.includes(h.text)) + 1;
      errors.push(`${file}:${line || fm.bodyLine}: the notes sit under "${NOTES_HEADING.text}"; start their headings at ###`);
    } else if (h.id === NOTES_HEADING.id || h.id === SOURCE_HEADING.id) {
      errors.push(`${at}: the notes' heading "${h.text}" takes an id the page already uses`);
    }
  }

  if (sourcePath === null) return null;
  const source = readFileSync(join(repoRoot, sourcePath), "utf8");
  const hasText = hasTextObject(source);
  if (hasText && !tags.includes("text")) errors.push(`${at}: the scene has a text object, so tag it "text"`);
  if (!hasText && tags.includes("text")) errors.push(`${at}: the scene has no text object, so drop the "text" tag`);

  const scene = checkScene(sourcePath, source, errors);
  if (scene !== null && poster !== null && poster > scene.duration) {
    errors.push(`${at}: poster: ${posterText as string} is outside the scene's ${scene.duration} seconds`);
  }
  if (errors.length > before || scene === null || title === null || summary === null) return null;

  return {
    id,
    title,
    summary,
    tags,
    poster,
    lesson,
    sourcePath,
    source,
    notesHtml: notes.html,
    file,
    ...scene,
    notes: { headings: notes.headings, links: notes.links, text: notes.text },
  };
}

/**
 * Reads the gallery: `site.json`'s `gallery` list, one `site/gallery/<id>.md`
 * per id (front matter and "How it's made"), and each entry's scene, either
 * `site/gallery/<id>.marey` or the file its `source:` names. Every scene must
 * compile, have a finite duration and pass the export-ready check. Problems
 * are collected as "file:line: message"; an entry with any is left out.
 */
export function loadGallery(
  repoRoot: string,
  config?: SiteConfig,
): { entries: LoadedGalleryEntry[]; errors: string[] } {
  const errors: string[] = [];
  const cfg = config ?? readConfig(repoRoot, errors);
  if (!cfg) return { entries: [], errors };
  const ids = listedIds(cfg, errors);
  const lessons = new Set(cfg.learn.map((l) => l.slug));

  const entries: LoadedGalleryEntry[] = [];
  for (const id of ids) {
    const entry = loadEntry(repoRoot, id, lessons, errors);
    if (entry) entries.push(entry);
  }

  const dir = join(repoRoot, GALLERY_DIR);
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      if (name.endsWith(".md") && !cfg.gallery.includes(name.slice(0, -3))) {
        errors.push(`${GALLERY_DIR}/${name}:1: the file is not listed in ${CONFIG_FILE}`);
      }
    }
  }
  return { entries, errors };
}

const INDEX_DESCRIPTION = "Finished Marey scenes to study, each with notes on how it is made and its full source.";
const INDEX_LEAD =
  "Finished scenes, each built from the same language the course teaches. " +
  "Open one for notes on how it is made and its full source. " +
  "With a mouse or a keyboard, a card plays while it is hovered or focused.";

function chips(tags: ReadonlyArray<GalleryTag>): string {
  if (tags.length === 0) return "";
  return `<ul class="chips" aria-label="Tags">${tags.map((t) => `<li class="chip">${t}</li>`).join("")}</ul>`;
}

function card(entry: LoadedGalleryEntry): string {
  const poster = entry.poster === null ? "" : ` data-poster="${entry.poster}"`;
  return (
    `<li class="gallery-card" data-tags="${entry.tags.join(" ")}">` +
    `<a class="card" href="/gallery/${entry.id}/">` +
    `<div class="gallery-card-poster sample-stage" data-source="${esc(entry.source)}"${poster}></div>` +
    `<span class="gallery-card-title">${esc(entry.title)}</span>` +
    `<span class="gallery-card-summary">${esc(entry.summary)}</span>` +
    chips(entry.tags) +
    `</a></li>`
  );
}

function indexBody(entries: ReadonlyArray<LoadedGalleryEntry>): string {
  const used = GALLERY_TAGS.filter((t) => entries.some((e) => e.tags.includes(t)));
  const filters =
    `<div class="chip-filters" role="group" aria-label="Filter scenes by tag" hidden>` +
    used.map((t) => `<button type="button" class="chip" data-tag="${t}" aria-pressed="false">${t}</button>`).join("") +
    `</div>`;
  return (
    `<p class="lead">${esc(INDEX_LEAD)}</p>\n` +
    `${filters}\n<p class="gallery-count" role="status" aria-live="polite"></p>\n` +
    `<ul class="gallery-grid">\n${entries.map(card).join("\n")}\n</ul>\n`
  );
}

function headingHtml(h: Heading): string {
  return `<h2 id="${h.id}">${esc(h.text)} <a class="anchor" href="#${h.id}" aria-label="${esc(`Link to "${h.text}"`)}">#</a></h2>\n`;
}

function detailBody(entry: LoadedGalleryEntry, lesson: (LessonRef & { slug: string }) | null): string {
  const share = buildShareURLFor(PLAYGROUND, entry.source);
  const lines = entry.source.split("\n").length - (entry.source.endsWith("\n") ? 1 : 0);
  const showcase = lesson
    ? `<p class="gallery-lesson">This scene is the showcase of <a href="/learn/${esc(lesson.slug)}/">Lesson ${lesson.number}: ${esc(lesson.title)}</a>, ` +
      `which teaches everything it uses.</p>\n`
    : "";
  const playground = share === null ? "" : `<a class="button button-small" href="${esc(share)}">Open in playground</a>`;
  return (
    `<p class="lead">${esc(entry.summary)}</p>\n` +
    `<figure class="gallery-stage"><div class="sample-stage" data-source="${esc(entry.source)}" ` +
    `style="--scene-aspect: ${entry.width} / ${entry.height}"></div></figure>\n` +
    headingHtml(NOTES_HEADING) +
    entry.notesHtml +
    showcase +
    headingHtml(SOURCE_HEADING) +
    `<div class="gallery-source-head"><p><code>${esc(entry.sourcePath)}</code>, ${lines} lines.</p>${playground}</div>\n` +
    `<pre class="code" data-lang="marey"><code>${highlightMarey(entry.source)}</code></pre>\n`
  );
}

/**
 * The gallery's pages: `/gallery/`, a card per entry, and `/gallery/<id>/`
 * for each. `lessons` maps a lesson's slug to its title and number, for the
 * entries that are a lesson's showcase.
 */
export function galleryPages(
  entries: ReadonlyArray<LoadedGalleryEntry>,
  lessons: ReadonlyMap<string, LessonRef>,
): SitePage[] {
  const pages: SitePage[] = [];
  const indexHtml = renderLayout({
    section: "gallery",
    url: "/gallery/",
    title: "Gallery",
    description: INDEX_DESCRIPTION,
    bodyHtml: indexBody(entries),
    headings: [],
    sidebar: [],
    prev: null,
    next: null,
    breadcrumb: [],
  });
  pages.push({
    url: "/gallery/",
    outFile: "gallery/index.html",
    section: "gallery",
    title: "Gallery",
    description: INDEX_DESCRIPTION,
    html: indexHtml,
    headings: [],
    text: [INDEX_LEAD, ...entries.map((e) => `${e.title}\n${e.summary}`)].join("\n"),
    links: [],
  });

  entries.forEach((entry, i) => {
    const url = `/gallery/${entry.id}/`;
    const before = entries[i - 1];
    const after = entries[i + 1];
    const ref = entry.lesson === null ? undefined : lessons.get(entry.lesson);
    const lesson = entry.lesson !== null && ref ? { ...ref, slug: entry.lesson } : null;
    const headings = [NOTES_HEADING, ...entry.notes.headings, SOURCE_HEADING];
    const links = [...entry.notes.links, ...(lesson ? [{ href: `/learn/${lesson.slug}/`, line: 1, file: entry.file }] : [])];
    pages.push({
      url,
      outFile: `gallery/${entry.id}/index.html`,
      section: "gallery",
      title: entry.title,
      description: entry.summary,
      html: renderLayout({
        section: "gallery",
        url,
        title: entry.title,
        description: entry.summary,
        bodyHtml: detailBody(entry, lesson),
        headings,
        sidebar: [],
        prev: before ? { href: `/gallery/${before.id}/`, title: before.title } : { href: "/gallery/", title: "Gallery" },
        next: after ? { href: `/gallery/${after.id}/`, title: after.title } : null,
        breadcrumb: [{ title: "Gallery", href: "/gallery/" }, { title: entry.title }],
      }),
      headings,
      text: `${entry.summary}\n${entry.notes.text}`,
      links,
    });
  });
  return pages;
}
