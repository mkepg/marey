import { Marked, type Renderer, type Token, type Tokens } from "marked";
import { escapeHtml } from "./escape";
import { slugify } from "./slug";
import type { Heading, SitePage } from "./types";

export interface RenderContext {
  /** The content file, as the repository path an error should name. */
  readonly file: string;
  /** The line of `file` on which the Markdown body starts. */
  readonly bodyLine: number;
}

export interface RenderedMarkdown {
  readonly html: string;
  readonly headings: ReadonlyArray<Heading>;
  readonly links: SitePage["links"];
  /** The body as plain text, one block per line, for search. */
  readonly text: string;
  readonly errors: ReadonlyArray<string>;
}

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "list",
  "code",
  "blockquote",
  "table",
  "hr",
  "space",
]);

/** The text of a token tree with no markup. */
function plainText(token: Token): string {
  if (token.type === "list") {
    return (token as Tokens.List).items.map(plainText).join("\n");
  }
  if (token.type === "table") {
    const table = token as Tokens.Table;
    const rows = [table.header, ...table.rows];
    return rows.map((row) => row.map((cell) => plainTextOf(cell.tokens)).join(" ")).join("\n");
  }
  if ("tokens" in token && token.tokens) return plainTextOf(token.tokens);
  if ("text" in token && typeof token.text === "string") return token.text;
  return "";
}

function plainTextOf(tokens: ReadonlyArray<Token>): string {
  const separator = tokens.some((t) => BLOCK_TYPES.has(t.type)) ? "\n" : "";
  return tokens.map(plainText).join(separator);
}

function countNewlines(s: string): number {
  let n = 0;
  for (const ch of s) if (ch === "\n") n += 1;
  return n;
}

/**
 * Renders a page body. Standard Markdown plus an id and an anchor link on
 * every heading. Raw HTML in the source is shown as text rather than
 * emitted, so a page can only contain what the generator writes.
 */
export function renderMarkdown(body: string, ctx: RenderContext): RenderedMarkdown {
  const errors: string[] = [];
  const headings: Heading[] = [];
  const links: Array<{ href: string; line: number; file: string }> = [];
  const seen = new Map<string, number>();
  let currentLine = ctx.bodyLine;

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(this: Renderer, token: Tokens.Heading): string {
        const text = plainTextOf(token.tokens).trim();
        const inner = this.parser.parseInline(token.tokens);
        if (token.depth === 1) {
          errors.push(`${ctx.file}:${currentLine}: "# ${text}" is a level-1 heading; the page title is the only h1, so start at ##`);
          return `<h1>${inner}</h1>\n`;
        }
        const id = slugify(text, seen);
        if (token.depth === 2 || token.depth === 3) {
          headings.push({ depth: token.depth, text, id });
        }
        const label = escapeHtml(`Link to "${text}"`);
        return (
          `<h${token.depth} id="${escapeHtml(id)}">${inner} ` +
          `<a class="anchor" href="#${escapeHtml(id)}" aria-label="${label}">#</a></h${token.depth}>\n`
        );
      },
      html(token: Tokens.HTML | Tokens.Tag): string {
        return escapeHtml(token.text);
      },
    },
  });

  const tokens = marked.lexer(body);
  // The renderer runs in document order, so `currentLine` follows the block
  // being rendered when it reports a heading error.
  const parts: string[] = [];
  const texts: string[] = [];
  for (const token of tokens) {
    const startLine = currentLine;
    marked.walkTokens([token], (t) => {
      if (t.type !== "link") return;
      const link = t as Tokens.Link;
      const at = token.raw.indexOf(link.raw);
      const offset = at < 0 ? 0 : countNewlines(token.raw.slice(0, at));
      links.push({ href: link.href, line: startLine + offset, file: ctx.file });
    });
    parts.push(marked.parser([token]));
    const text = plainText(token).trim();
    if (text !== "") texts.push(text);
    currentLine += countNewlines(token.raw);
  }

  return { html: parts.join(""), headings, links, text: texts.join("\n"), errors };
}
