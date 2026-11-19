import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LANGUAGE_CONTRACT } from "../../src/compiler/languageContract";
import { buildSite } from "./index";
import { ANIMATABLE_OWNERS, NON_ANIMATABLE_KINDS, rewriteRepoLink } from "./reference";

const repoRoot = resolve(import.meta.dirname, "../..");
const BLOB = "https://github.com/mkepg/marey/blob/main/";

describe("rewriteRepoLink", () => {
  it("sends a link to another repository file to GitHub", () => {
    expect(rewriteRepoLink("../README.md", "docs/LANGUAGE.md")).toBe(`${BLOB}README.md`);
  });

  it("keeps a fragment on a GitHub link", () => {
    expect(rewriteRepoLink("../README.md#install", "docs/LANGUAGE.md")).toBe(`${BLOB}README.md#install`);
  });

  it("sends a link to a rendered document to its page", () => {
    expect(rewriteRepoLink("docs/determinism.md", "README.md")).toBe("/reference/determinism/");
    expect(rewriteRepoLink("determinism.md", "docs/LANGUAGE.md")).toBe("/reference/determinism/");
  });

  it("keeps the fragment of a link into a rendered document", () => {
    expect(rewriteRepoLink("LANGUAGE.md#handoff", "docs/LANGUAGE.md")).toBe("/reference/language/#handoff");
  });

  it("leaves absolute URLs, site paths and bare fragments alone", () => {
    expect(rewriteRepoLink("https://example.com/a.md", "docs/LANGUAGE.md")).toBe("https://example.com/a.md");
    expect(rewriteRepoLink("mailto:a@b.c", "docs/LANGUAGE.md")).toBe("mailto:a@b.c");
    expect(rewriteRepoLink("/learn/", "docs/LANGUAGE.md")).toBe("/learn/");
    expect(rewriteRepoLink("#handoff", "docs/LANGUAGE.md")).toBe("#handoff");
  });
});

const site = buildSite(repoRoot);
const page = (url: string) => {
  const found = site.pages.find((p) => p.url === url);
  if (!found) throw new Error(`no page ${url}`);
  return found;
};

describe("the reference pages", () => {
  it("builds without errors", () => {
    expect(site.errors).toEqual([]);
  });

  it("lists the three pages", () => {
    const urls = site.pages.map((p) => p.url);
    for (const url of ["/reference/language/", "/reference/properties/", "/reference/determinism/"]) {
      expect(urls).toContain(url);
    }
  });
});

describe("the properties page", () => {
  const html = page("/reference/properties/").html;
  const withProperties = Object.entries(LANGUAGE_CONTRACT).filter(([, b]) => Object.keys(b.properties).length > 0);

  /** The HTML of one kind's section: from its heading to the next h2. */
  const section = (kind: string): string => {
    const start = html.indexOf(`<h2 id="${kind}">`);
    expect(start, `section for ${kind}`).toBeGreaterThan(-1);
    const end = html.indexOf("<h2 ", start + 1);
    return html.slice(start, end < 0 ? undefined : end);
  };
  const row = (kind: string, name: string): string => {
    const s = section(kind);
    const at = s.indexOf(`<td><code>${name}</code></td>`);
    expect(at, `row ${kind}.${name}`).toBeGreaterThan(-1);
    return s.slice(s.lastIndexOf("<tr>", at), s.indexOf("</tr>", at));
  };

  it("has one table per kind that has properties", () => {
    expect((html.match(/<table/g) ?? []).length).toBe(withProperties.length);
    for (const [kind] of withProperties) expect(section(kind)).toContain("<table");
  });

  it("has one row per property", () => {
    for (const [kind, block] of withProperties) {
      const body = section(kind).split("<tbody>")[1] ?? "";
      expect((body.match(/<tr>/g) ?? []).length, kind).toBe(Object.keys(block.properties).length);
    }
  });

  it("marks position on a circle as animatable", () => {
    expect(row("circle", "position")).toMatch(/<td>yes<\/td>/);
  });

  it("has no color row on a group, because a group has no colour", () => {
    expect(Object.keys(LANGUAGE_CONTRACT.group.properties)).not.toContain("color");
    expect(section("group")).not.toContain("<td><code>color</code></td>");
  });

  it("marks color on a circle animatable and a scene's properties not", () => {
    expect(row("circle", "color")).toMatch(/<td>yes<\/td>/);
    expect(row("scene", "background")).toMatch(/<td>no<\/td>/);
  });

  it("writes an absent duration as running indefinitely, in words", () => {
    const duration = row("scene", "duration");
    expect(duration).toContain("indefinitely");
    expect(duration).toMatch(/omit|without|absent|no duration/i);
    expect(duration).not.toContain("undefined");
  });

  it("writes defaults in Marey syntax and constraints in words", () => {
    expect(row("circle", "origin")).toContain("(0.5, 0.5)");
    expect(row("world", "bounds")).toContain("[left, right, top, bottom]");
    expect(row("circle", "color")).toContain("#ffffff");
    expect(row("circle", "radius")).toContain("greater than 0");
    expect(row("physics", "bounce")).toContain("0 to 1 inclusive");
    expect(row("text", "content")).toContain("at most 500 characters");
  });

  it("carries each property's description and example", () => {
    const plain = (h: string): string =>
      h
        .replace(/<[^>]+>/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ");
    for (const [kind, block] of withProperties) {
      for (const [name, spec] of Object.entries(block.properties)) {
        const text = plain(row(kind, name));
        expect(text, `${kind}.${name} description`).toContain(spec.description.replace(/\s+/g, " "));
        expect(text, `${kind}.${name} example`).toContain(spec.example);
        expect(text, `${kind}.${name}`).not.toContain("undefined");
      }
    }
  });

  it("decides animatability for every contract kind", () => {
    const decided = new Set([...ANIMATABLE_OWNERS, ...NON_ANIMATABLE_KINDS]);
    const undecided = Object.keys(LANGUAGE_CONTRACT).filter((k) => !decided.has(k));
    expect(undecided).toEqual([]);
  });

  it("says it is generated from the compiler's contract", () => {
    expect(page("/reference/properties/").text).toMatch(/generated from the compiler/i);
  });
});

describe("the language page", () => {
  const p = page("/reference/language/");

  it("opens with a banner that links the course", () => {
    expect(p.html).toContain("Formal reference");
    expect(p.links.some((l) => l.href === "/learn/")).toBe(true);
  });

  it("renders its samples as Run samples", () => {
    expect(p.html).toContain('data-mode="run"');
  });

  it("rewrites its link to the README to GitHub", () => {
    expect(p.html).toContain(`href="${BLOB}README.md"`);
  });
});

describe("the determinism page", () => {
  it("renders with no fence errors", () => {
    expect(site.errors.filter((e) => e.startsWith("docs/determinism.md"))).toEqual([]);
    expect(page("/reference/determinism/").html).toContain("Determinism in Marey");
  });
});

describe("docs/LANGUAGE.md", () => {
  const text = readFileSync(resolve(repoRoot, "docs/LANGUAGE.md"), "utf8");

  it("no longer says the tutorial site sits past the finish line", () => {
    expect(text).not.toContain("sits past the finish line");
  });

  it("points the introduction at the course", () => {
    expect(text.slice(0, text.indexOf("```marey"))).toContain("https://marey.pages.dev/learn/");
  });

  it("links the properties page from 'Not covered here'", () => {
    const tail = text.slice(text.indexOf("## Not covered here"));
    expect(tail).toContain("https://marey.pages.dev/reference/properties/");
    expect(tail).not.toContain("later phase generates");
  });
});
