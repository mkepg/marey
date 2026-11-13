import { describe, expect, it } from "vitest";
import languageDoc from "../../docs/LANGUAGE.md?raw";
import typesSource from "../../src/compiler/types.ts?raw";
import { lex } from "../../src/compiler/lexer";
import { TOKEN_CLASSES, highlightMarey } from "./highlight";

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

const examples = import.meta.glob("../../src/examples/*.marey", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function fences(markdown: string): string[] {
  const out: string[] = [];
  let open: string[] | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.trim().startsWith("```")) {
      if (open === null) open = [];
      else {
        out.push(open.join("\n"));
        open = null;
      }
    } else if (open !== null) open.push(line);
  }
  return out;
}

describe("highlightMarey", () => {
  it("wraps keywords, properties, numbers and punctuation", () => {
    const html = highlightMarey("scene { size: (960, 540) }");
    expect(html).toContain('<span class="tk-keyword">scene</span>');
    expect(html).toContain('<span class="tk-prop">size</span>');
    expect(html).toContain('<span class="tk-number">960</span>');
    expect(html).toContain('<span class="tk-punct">{</span>');
  });

  it("makes a comment line one span", () => {
    expect(highlightMarey("// a note, with { braces }\nscene {}")).toContain(
      '<span class="tk-comment">// a note, with { braces }</span>',
    );
  });

  it("gives back every example scene exactly once tags are stripped", () => {
    const names = Object.keys(examples);
    expect(names.length).toBeGreaterThanOrEqual(5);
    for (const name of names) {
      expect(strip(highlightMarey(examples[name]!)), name).toBe(examples[name]);
    }
  });

  it("gives back every fence of the language reference exactly", () => {
    const all = fences(languageDoc);
    expect(all.length).toBeGreaterThan(10);
    for (const source of all) expect(strip(highlightMarey(source))).toBe(source);
  });

  it("keeps an unterminated string and marks it as an error", () => {
    const source = 'circle { content: "abc }\n  radius: 3';
    const html = highlightMarey(source);
    expect(strip(html)).toBe(source);
    expect(html).toContain('<span class="tk-error">&quot;abc }</span>');
    expect(html).toContain('<span class="tk-number">3</span>');
  });

  it("keeps a stray character and re-lexes the following lines", () => {
    const source = "scene {\n  size: @ 5\n  radius: 7\n}";
    const html = highlightMarey(source);
    expect(strip(html)).toBe(source);
    expect(html).toContain('<span class="tk-error">@ 5</span>');
    expect(html).toContain('<span class="tk-number">7</span>');
  });

  it("keeps CRLF line breaks", () => {
    const source = 'scene {\r\n  content: "x\r\n  radius: 2\r\n}';
    expect(strip(highlightMarey(source))).toBe(source);
  });

  it("escapes text that looks like HTML", () => {
    const html = highlightMarey('text { content: "<b>&</b>" }');
    expect(html).toContain("&lt;b&gt;&amp;&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });

  it("classifies an identifier by whether a colon follows", () => {
    const html = highlightMarey("circle dot { radius: 4 }");
    expect(html).toContain('<span class="tk-ident">dot</span>');
    expect(html).toContain('<span class="tk-prop">radius</span>');
  });
});

describe("TOKEN_CLASSES", () => {
  it("maps every token type the lexer can emit", () => {
    const declared = /export type TokenType =([^;]*);/.exec(typesSource)![1]!;
    const names = [...declared.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]!);
    expect(names.length).toBeGreaterThan(30);
    expect(Object.keys(TOKEN_CLASSES).sort()).toEqual([...names].sort());
  });

  it("uses only the documented class names", () => {
    const allowed = new Set(["keyword", "prop", "ident", "number", "string", "color", "const", "op", "punct", "error"]);
    for (const cls of Object.values(TOKEN_CLASSES)) {
      if (cls !== null) expect(allowed.has(cls)).toBe(true);
    }
  });

  it("covers the types a real scene produces", () => {
    const tokens = lex(
      'scene { size: (1, 2) color: #fff color: red x: 1 + 2 content: "s" ok: true e: easeIn fit: cover duration: indefinitely let a = 1 if a >= 1 then 1 else 2 }',
    );
    for (const t of tokens) expect(Object.keys(TOKEN_CLASSES)).toContain(t.type);
  });
});
