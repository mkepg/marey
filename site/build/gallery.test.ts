import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileSource } from "../../src/compiler/compileSource";
import { EDGE_VALUES, LANGUAGE_CONTRACT } from "../../src/compiler/languageContract";
import { lex } from "../../src/compiler/lexer";
import {
  BOOLEAN_VALUES,
  DURATION_INDEFINITELY_VALUES,
  EASING_VALUES,
  EXPRESSION_WORDS,
  FIT_VALUE_WORDS,
  KEYWORDS,
} from "../../src/compiler/lexer/constants";
import { buildShareURLFor } from "../../src/lib/share";
import { escapeHtml } from "./escape";
import { GALLERY_TAGS, galleryPages, gallerySourcePaths, loadGallery } from "./gallery";
import { buildSite } from "./index";
import { stripComments } from "./playground";

const repoRoot = resolve(import.meta.dirname, "../..");

/**
 * The language's own words: block keywords, property names, expression words,
 * easings, fits, booleans, `indefinitely` and the bounds edges, from the same
 * contract the compiler reads.
 */
const LANGUAGE_WORDS: ReadonlySet<string> = new Set([
  ...KEYWORDS,
  ...EXPRESSION_WORDS,
  ...EASING_VALUES,
  ...FIT_VALUE_WORDS,
  ...BOOLEAN_VALUES,
  ...DURATION_INDEFINITELY_VALUES,
  ...EDGE_VALUES,
  ...Object.values(LANGUAGE_CONTRACT).flatMap((block) => Object.keys(block.properties)),
]);

/** The inline code spans of a Markdown body, which may wrap across lines. */
function codeSpans(markdown: string): string[] {
  return [...markdown.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
}

/**
 * Notes point at the source by quoting it, so a quoted fragment must appear in
 * the scene (spacing aside); a quote the source no longer contains means the
 * notes have drifted. A single word of the language passes either way, so a
 * note can name a keyword or a property the scene does not use.
 */
function spanProblem(span: string, source: string): string | null {
  if (LANGUAGE_WORDS.has(span)) return null;
  const squash = (s: string) => s.replace(/\s+/g, " ");
  return squash(source).includes(squash(span)) ? null : `\`${span}\` is not in the scene's source`;
}
const config = JSON.parse(readFileSync(join(repoRoot, "site/site.json"), "utf8")) as {
  learn: Array<{ slug: string }>;
  gallery: string[];
};
const gallery = loadGallery(repoRoot);
const site = buildSite(repoRoot);

/** The text a reader would copy: tags removed, entities decoded. */
function strip(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function page(url: string): string {
  const found = site.pages.find((p) => p.url === url);
  if (!found) throw new Error(`no page at ${url}`);
  return found.html;
}

describe("the gallery in the repository", () => {
  it("loads with no errors", () => {
    expect(gallery.errors).toEqual([]);
    expect(gallery.entries.map((e) => e.id)).toEqual(config.gallery);
  });

  it("lists the twenty-three scenes in the gallery's order", () => {
    expect(config.gallery).toEqual([
      "lighthouse",
      "dusk-hills",
      "ledges",
      "fireworks",
      "aurora",
      "hourglass",
      "orrery",
      "forest",
      "day-to-night",
      "plinko",
      "domino-run",
      "ripple",
      "title-card",
      "toy-box",
      "metronome",
      "postcard",
      "easing-race",
      "set-sail",
      "sunrise",
      "logo-reveal",
      "bar-chart-reveal",
      "physics-pile",
      "spring-cards",
    ]);
  });

  it("gives every site.json gallery id its .md and its scene", () => {
    for (const id of config.gallery) {
      const md = join(repoRoot, "site/gallery", `${id}.md`);
      expect(existsSync(md), `${id}.md`).toBe(true);
      const source = /^source: (.+)$/m.exec(readFileSync(md, "utf8"))?.[1];
      const scene = source ?? `site/gallery/${id}.marey`;
      expect(existsSync(join(repoRoot, scene)), scene).toBe(true);
    }
  });

  it("lists every .md in site/gallery exactly once", () => {
    const files = readdirSync(join(repoRoot, "site/gallery"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .sort();
    expect([...config.gallery].sort()).toEqual(files);
    expect(new Set(config.gallery).size).toBe(config.gallery.length);
  });

  it("has scenes that compile, with a finite duration and the poster inside it", () => {
    for (const entry of gallery.entries) {
      const outcome = compileSource(entry.source);
      expect(outcome.errors, entry.id).toEqual([]);
      const duration = outcome.ir?.duration ?? null;
      expect(duration, entry.id).not.toBeNull();
      expect(Number.isFinite(duration), entry.id).toBe(true);
      if (entry.poster !== null) {
        expect(entry.poster, entry.id).toBeGreaterThanOrEqual(0);
        expect(entry.poster, entry.id).toBeLessThanOrEqual(duration!);
      }
    }
  });

  it("names the scenes it reads from outside site/gallery", () => {
    const named = gallery.entries.filter((e) => !e.sourcePath.startsWith("site/gallery/")).map((e) => e.sourcePath);
    expect(gallerySourcePaths(repoRoot)).toEqual(named);
    expect(named).toContain("src/examples/ledges.marey");
  });

  it("uses only the five known tags", () => {
    for (const entry of gallery.entries) {
      for (const tag of entry.tags) expect(GALLERY_TAGS, `${entry.id}: ${tag}`).toContain(tag);
    }
    expect([...GALLERY_TAGS]).toEqual(["physics", "generative", "text", "loop", "lesson"]);
  });

  it("names only lessons that site.json lists", () => {
    const lessons = config.learn.map((l) => l.slug);
    for (const entry of gallery.entries) {
      if (entry.lesson !== null) expect(lessons, entry.id).toContain(entry.lesson);
    }
  });

  it("tags a scene `text` exactly when its source has a text object", () => {
    for (const entry of gallery.entries) {
      const hasText = lex(entry.source).some((t) => t.type === "KEYWORD" && t.value === "text");
      expect(entry.tags.includes("text"), entry.id).toBe(hasText);
    }
  });

  it("quotes only the scene's own source in the notes' code spans, or names a language word", () => {
    for (const entry of gallery.entries) {
      const md = readFileSync(join(repoRoot, "site/gallery", `${entry.id}.md`), "utf8");
      const spans = codeSpans(md.slice(md.indexOf("\n---", 3) + 4));
      expect(spans.length, entry.id).toBeGreaterThan(0);
      for (const span of spans) expect(spanProblem(span, entry.source), entry.id).toBeNull();
    }
  });
});

describe("the notes' code-span rule", () => {
  const scene = "scene {\n  duration: 2\n  circle c { position: (200, 150), radius: 20 }\n}\n";

  it("passes a fragment the scene contains, whatever its spacing", () => {
    expect(spanProblem("position: (200,  150)", scene)).toBeNull();
    expect(spanProblem("circle c", scene)).toBeNull();
  });

  it("fails a fragment the scene does not contain", () => {
    expect(spanProblem("radius: 30", scene)).toBe("`radius: 30` is not in the scene's source");
    expect(spanProblem("circle d", scene)).not.toBeNull();
  });

  it("passes a single language word the scene does not use", () => {
    for (const word of ["lockPosition", "easeInOut", "sequence", "contain", "true", "indefinitely", "fit", "length", "bottom"]) {
      expect(scene.includes(word), word).toBe(false);
      expect(spanProblem(word, scene), word).toBeNull();
    }
  });

  it("fails a single word that is not the language's and not in the scene", () => {
    expect(spanProblem("asin", scene)).not.toBeNull();
    expect(spanProblem("Position", scene)).not.toBeNull();
    expect(spanProblem("lockPosition: true", scene)).not.toBeNull();
  });

  it("finds spans that wrap across lines", () => {
    expect(codeSpans("A `radius:\n20` and `c`.")).toEqual(["radius:\n20", "c"]);
  });
});

describe("the gallery pages", () => {
  it("shows each scene's full source highlighted, with a playground link", () => {
    for (const entry of gallery.entries) {
      const html = page(`/gallery/${entry.id}/`);
      const code = /<pre class="code" data-lang="marey"><code>([\s\S]*?)<\/code><\/pre>/.exec(html);
      expect(code, entry.id).not.toBeNull();
      expect(code![1]).toContain('<span class="tk-keyword">scene</span>');
      expect(strip(code![1]!)).toBe(entry.source);
      // A scene over the share-link ceiling links the playground to its
      // source without comments; every other scene links its full source.
      const full = buildShareURLFor("https://marey.pages.dev/", entry.source);
      const share = full ?? buildShareURLFor("https://marey.pages.dev/", stripComments(entry.source));
      expect(share, entry.id).not.toBeNull();
      expect(html).toContain(`href="${escapeHtml(share!)}"`);
      expect(html).toContain(">Open in playground<");
    }
  });

  it("links the previous and next entries in gallery order", () => {
    const ids = config.gallery;
    ids.forEach((id, i) => {
      const html = page(`/gallery/${id}/`);
      const prev = i > 0 ? `rel="prev" href="/gallery/${ids[i - 1]}/"` : 'rel="prev" href="/gallery/"';
      expect(html, id).toContain(prev);
      if (i < ids.length - 1) expect(html, id).toContain(`rel="next" href="/gallery/${ids[i + 1]}/"`);
      else expect(html, id).not.toContain('rel="next"');
    });
  });

  it("gives the detail page a player stage, the notes and the breadcrumb", () => {
    const html = page("/gallery/lighthouse/");
    expect(html).toContain('<figure class="gallery-stage"><div class="sample-stage" data-source="');
    expect(html).toContain('<h2 id="how-its-made">How it&#39;s made');
    expect(html).toContain('<li><a href="/gallery/">Gallery</a></li><li aria-current="page">Lighthouse</li>');
  });

  it("has one card per entry on the index, in site.json order", () => {
    const html = page("/gallery/");
    const cards = [...html.matchAll(/<a class="card" href="\/gallery\/([a-z0-9-]+)\/">/g)].map((m) => m[1]);
    expect(cards).toEqual(config.gallery);
    expect(html.match(/<li class="gallery-card"/g)).toHaveLength(config.gallery.length);
  });

  it("gives each card a stage with its source and its tags", () => {
    const html = page("/gallery/");
    for (const entry of gallery.entries) {
      const at = html.indexOf(`<a class="card" href="/gallery/${entry.id}/">`);
      const card = html.slice(html.lastIndexOf("<li", at), html.indexOf("</a>", at));
      expect(card, entry.id).toContain(`data-tags="${entry.tags.join(" ")}"`);
      expect(card, entry.id).toContain(`<div class="gallery-card-poster sample-stage" data-source="${escapeHtml(entry.source)}"`);
      for (const tag of entry.tags) expect(card, entry.id).toContain(`<li class="chip">${tag}</li>`);
    }
  });

  it("offers a filter button for each tag in use, unpressed, hidden until the script runs", () => {
    const html = page("/gallery/");
    const used = GALLERY_TAGS.filter((t) => gallery.entries.some((e) => e.tags.includes(t)));
    const buttons = [...html.matchAll(/<button type="button" class="chip" data-tag="([a-z]+)" aria-pressed="false">/g)].map((m) => m[1]);
    expect(buttons).toEqual(used);
    expect(html).toContain('<div class="chip-filters" role="group" aria-label="Filter scenes by tag" hidden>');
  });
});

describe("loadGallery on a fixture", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const SCENE = "scene {\n  size: (400, 300)\n  duration: 2\n  circle c { position: (200, 150), radius: 20 }\n}\n";
  const entry = (front: string, notes = "Uses `circle c`.") => `---\ntitle: T\nsummary: S.\n${front}---\n\n${notes}\n`;

  function fixture(gallery: string[], files: Record<string, string>, learn: string[] = []): string {
    const dir = mkdtempSync(join(tmpdir(), "marey-gallery-"));
    dirs.push(dir);
    const all: Record<string, string> = {
      "site/site.json": JSON.stringify({ learn: learn.map((slug) => ({ slug, vocabulary: [] })), guides: [], reference: [], gallery }),
      ...files,
    };
    for (const [path, content] of Object.entries(all)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    return dir;
  }

  it("loads a good entry with its fields", () => {
    const dir = fixture(["a"], {
      "site/gallery/a.md": entry("tags:\n- loop\nposter: 1.5\n"),
      "site/gallery/a.marey": SCENE,
    });
    const { entries, errors } = loadGallery(dir);
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "a",
      title: "T",
      summary: "S.",
      tags: ["loop"],
      poster: 1.5,
      lesson: null,
      sourcePath: "site/gallery/a.marey",
      source: SCENE,
    });
    expect(entries[0]!.notesHtml).toContain("<code>circle c</code>");
  });

  it("reads a scene from the source path the front matter names", () => {
    const dir = fixture(["a"], {
      "site/gallery/a.md": entry("tags:\n- loop\nsource: elsewhere/a.marey\n"),
      "elsewhere/a.marey": SCENE,
    });
    const { entries, errors } = loadGallery(dir);
    expect(errors).toEqual([]);
    expect(entries[0]!.sourcePath).toBe("elsewhere/a.marey");
  });

  it("reports a listed id with no .md, and an .md that is not listed", () => {
    const dir = fixture(["ghost"], { "site/gallery/stray.md": entry("tags:\n- loop\n"), "site/gallery/stray.marey": SCENE });
    expect(loadGallery(dir).errors).toEqual([
      "site/gallery/ghost.md:1: the gallery entry is listed but its file does not exist",
      "site/gallery/stray.md:1: the file is not listed in site/site.json",
    ]);
  });

  it("reports a duplicate id and a bad id", () => {
    const dir = fixture(["a", "a", "Bad Id"], { "site/gallery/a.md": entry("tags:\n- loop\n"), "site/gallery/a.marey": SCENE });
    const errors = loadGallery(dir).errors.join("\n");
    expect(errors).toMatch(/gallery lists "a" more than once/);
    expect(errors).toMatch(/gallery id "Bad Id" must be/);
  });

  it("reports a missing scene, and a scene given twice", () => {
    const dir = fixture(["a", "b"], {
      "site/gallery/a.md": entry("tags:\n- loop\n"),
      "site/gallery/b.md": entry("tags:\n- loop\nsource: other.marey\n"),
      "site/gallery/b.marey": SCENE,
      "other.marey": SCENE,
    });
    expect(loadGallery(dir).errors).toEqual([
      "site/gallery/a.md:1: the entry has no scene: write site/gallery/a.marey or name one with source:",
      "site/gallery/b.md:1: the entry names source: other.marey and also has site/gallery/b.marey; keep one",
    ]);
  });

  it("reports a source path that does not exist", () => {
    const dir = fixture(["a"], { "site/gallery/a.md": entry("tags:\n- loop\nsource: nowhere.marey\n") });
    expect(loadGallery(dir).errors).toEqual(["site/gallery/a.md:1: source: nowhere.marey does not exist"]);
  });

  it("reports missing and unknown front matter, and an unknown tag", () => {
    const dir = fixture(["a"], {
      "site/gallery/a.md": "---\ntitle: T\ntags:\n- sparkly\ncolour: red\n---\n\nUses `circle c`.\n",
      "site/gallery/a.marey": SCENE,
    });
    expect(loadGallery(dir).errors).toEqual([
      'site/gallery/a.md:1: front matter needs a "summary"',
      'site/gallery/a.md:1: unknown front matter key "colour"; a gallery entry takes title, summary, tags, poster, lesson, source',
      'site/gallery/a.md:1: unknown tag "sparkly"; tags are physics, generative, text, loop, lesson',
    ]);
  });

  it("reports tags written as a string", () => {
    const dir = fixture(["a"], { "site/gallery/a.md": entry("tags: loop\n"), "site/gallery/a.marey": SCENE });
    expect(loadGallery(dir).errors).toEqual(['site/gallery/a.md:1: "tags" must be a list of "- tag" lines']);
  });

  it("reports a scene that does not compile, with its line", () => {
    const dir = fixture(["a"], {
      "site/gallery/a.md": entry("tags:\n- loop\n"),
      "site/gallery/a.marey": "scene {\n  size: (400, 300)\n  duration: 2\n  circle c { position: (200, 150), radius: -1 }\n}\n",
    });
    const errors = loadGallery(dir).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^site\/gallery\/a\.marey:4: /);
  });

  it("reports a scene with no duration", () => {
    const dir = fixture(["a"], {
      "site/gallery/a.md": entry("tags:\n- loop\n"),
      "site/gallery/a.marey": "scene {\n  size: (400, 300)\n  circle c { position: (200, 150), radius: 20 }\n}\n",
    });
    expect(loadGallery(dir).errors).toContain(
      "site/gallery/a.marey:1: a gallery scene needs a finite duration; add duration: to the scene block",
    );
  });

  it("reports a poster outside the duration, and one that is not a number", () => {
    const dir = fixture(["a", "b"], {
      "site/gallery/a.md": entry("tags:\n- loop\nposter: 2.5\n"),
      "site/gallery/a.marey": SCENE,
      "site/gallery/b.md": entry("tags:\n- loop\nposter: soon\n"),
      "site/gallery/b.marey": SCENE,
    });
    expect(loadGallery(dir).errors).toEqual([
      "site/gallery/a.md:1: poster: 2.5 is outside the scene's 2 seconds",
      'site/gallery/b.md:1: poster must be a number of seconds, found "soon"',
    ]);
  });

  it("allows a poster at either end of the scene", () => {
    const dir = fixture(["a", "b"], {
      "site/gallery/a.md": entry("tags:\n- loop\nposter: 0\n"),
      "site/gallery/a.marey": SCENE,
      "site/gallery/b.md": entry("tags:\n- loop\nposter: 2\n"),
      "site/gallery/b.marey": SCENE,
    });
    expect(loadGallery(dir).errors).toEqual([]);
  });

  it("reports a lesson site.json does not list, and keeps the lesson tag in step with it", () => {
    const dir = fixture(
      ["a", "b", "c"],
      {
        "site/gallery/a.md": entry("tags:\n- lesson\nlesson: missing\n"),
        "site/gallery/a.marey": SCENE,
        "site/gallery/b.md": entry("tags:\n- loop\nlesson: animate\n"),
        "site/gallery/b.marey": SCENE,
        "site/gallery/c.md": entry("tags:\n- lesson\n"),
        "site/gallery/c.marey": SCENE,
      },
      ["animate"],
    );
    expect(loadGallery(dir).errors).toEqual([
      'site/gallery/a.md:1: lesson "missing" is not a lesson in site/site.json',
      'site/gallery/b.md:1: an entry with a lesson is tagged "lesson"',
      'site/gallery/c.md:1: the "lesson" tag needs a lesson: in the front matter',
    ]);
  });

  it("reports a text scene without the text tag, and the tag on a scene without text", () => {
    const withText = "scene {\n  size: (400, 300)\n  duration: 2\n  text t { position: (200, 150), content: \"hi\" }\n}\n";
    const dir = fixture(["a", "b"], {
      "site/gallery/a.md": entry("tags:\n- loop\n", "Uses `text t`."),
      "site/gallery/a.marey": withText,
      "site/gallery/b.md": entry("tags:\n- text\n"),
      "site/gallery/b.marey": SCENE,
    });
    expect(loadGallery(dir).errors).toEqual([
      'site/gallery/a.md:1: the scene has a text object, so tag it "text"',
      'site/gallery/b.md:1: the scene has no text object, so drop the "text" tag',
    ]);
  });

  it("puts a ## heading's error on its own line, even with inline code in it", () => {
    const notes = "### Fine\n\n```text\n## not a heading\n```\n\n## The `circle c` part\n\nUses `circle c`.";
    const dir = fixture(["a"], { "site/gallery/a.md": entry("tags:\n- loop\n", notes), "site/gallery/a.marey": SCENE });
    expect(loadGallery(dir).errors).toEqual([
      'site/gallery/a.md:14: the notes sit under "How it\'s made"; start their headings at ###',
    ]);
  });

  /** A short scene under a long, varied comment that LZ cannot fold away. */
  function commentHeavy(): string {
    let seed = 11;
    const lines: string[] = [];
    for (let i = 0; i < 900; i++) {
      let w = "//";
      for (let k = 0; k < 24; k++) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        w += k % 6 === 0 ? " " : String.fromCharCode(97 + (seed % 26));
      }
      lines.push(w);
    }
    return lines.join("\n") + "\n" + SCENE;
  }

  it("gives a scene over the share-link ceiling a playground link to its source without comments", () => {
    const source = commentHeavy();
    expect(buildShareURLFor("https://marey.pages.dev/", source)).toBeNull();
    const dir = fixture(["a"], { "site/gallery/a.md": entry(""), "site/gallery/a.marey": source });
    const { entries, errors } = loadGallery(dir);
    expect(errors).toEqual([]);
    const html = galleryPages(entries, new Map())[1]!.html;
    const share = buildShareURLFor("https://marey.pages.dev/", stripComments(source));
    expect(share).not.toBeNull();
    expect(html).toContain(`href="${escapeHtml(share!)}">Open in playground<`);
    // The page still shows the commented source.
    const code = /<pre class="code" data-lang="marey"><code>([\s\S]*?)<\/code><\/pre>/.exec(html);
    expect(strip(code![1]!)).toBe(source);
  });

  it("reports a scene still over the ceiling without its comments, with its compressed length", () => {
    let source = "scene {\n  size: (1000, 1000)\n  duration: 2\n";
    for (let i = 0; i < 4000; i++) {
      source += `  circle c${i} { position: (${(i * 7919) % 1000}, ${(i * 104729) % 1000}), radius: ${(i % 50) + 1} }\n`;
    }
    source += "}\n";
    const dir = fixture(["a"], { "site/gallery/a.md": entry(""), "site/gallery/a.marey": source });
    const { entries, errors } = loadGallery(dir);
    expect(entries).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(
      /^site\/gallery\/a\.marey:1: the scene is too long for a playground link even without comments: \d[\d,]* compressed characters, over the 8,000 a share link takes$/,
    );
  });

  it("reports a ## heading in the notes, which sit under the page's own", () => {
    const dir = fixture(["a"], {
      "site/gallery/a.md": entry("tags:\n- loop\n", "## Big\n\nUses `circle c`."),
      "site/gallery/a.marey": SCENE,
    });
    expect(loadGallery(dir).errors).toEqual([
      'site/gallery/a.md:8: the notes sit under "How it\'s made"; start their headings at ###',
    ]);
  });
});

describe("gallery pages on a fixture", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("links the lesson an entry showcases, by its number and title", () => {
    const dir = mkdtempSync(join(tmpdir(), "marey-gallery-"));
    dirs.push(dir);
    const scene = "scene {\n  size: (400, 300)\n  duration: 2\n  circle c { position: (200, 150), radius: 20 }\n}\n";
    const page = (title: string) => `---\ntitle: ${title}\ndescription: About ${title}.\n---\n\nText.\n`;
    const lesson = (title: string) =>
      `---\ntitle: ${title}\nsummary: S.\ndescription: About ${title}.\nminutes: 5\nlearn:\n- a\n- b\n- c\n---\n\nText.\n`;
    const files: Record<string, string> = {
      "site/site.json": JSON.stringify({
        learn: [{ slug: "first", vocabulary: [] }, { slug: "animate", vocabulary: [] }],
        guides: [],
        reference: [],
        gallery: ["a"],
      }),
      "site/content/learn/index.md": page("Learn"),
      "site/content/learn/first.md": lesson("First"),
      "site/content/learn/animate.md": lesson("Animate & ease"),
      "site/content/guides/index.md": page("Guides"),
      "site/content/reference/index.md": page("Reference"),
      "site/content/404.md": page("Not found"),
      "site/gallery/a.md": "---\ntitle: A <b>\nsummary: S & s.\ntags:\n- lesson\nlesson: animate\n---\n\nUses `circle c`.\n",
      "site/gallery/a.marey": scene,
    };
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    const built = buildSite(dir);
    expect(built.errors).toEqual([]);
    const html = built.pages.find((p) => p.url === "/gallery/a/")!.html;
    expect(html).toContain('<a href="/learn/animate/">Lesson 2: Animate &amp; ease</a>');
    expect(html).toContain("<h1>A &lt;b&gt;</h1>");
    expect(html).not.toContain("<b>");
    expect(built.pages.map((p) => p.url)).toContain("/gallery/");
    expect(built.sitemap).toContain("<loc>https://marey.pages.dev/gallery/a/</loc>");
  });
});
