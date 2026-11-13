import { Marked, type Renderer, type Token, type TokenizerAndRendererExtension, type Tokens } from "marked";
import { escapeHtml } from "./escape";
import { checkSample, errorMessages, renderSample, type Sample } from "./samples";
import { slugify } from "./slug";
import type { Heading, SitePage } from "./types";

export interface RenderContext {
  /** The content file, as the repository path an error should name. */
  readonly file: string;
  /** The line of `file` on which the Markdown body starts. */
  readonly bodyLine: number;
  /** What a plain `marey` fence becomes: "live" in lessons and guides, "run" in the reference. */
  readonly sampleMode: "live" | "run";
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
  "container",
]);

/** The text of a token tree with no markup. */
function plainText(token: Token): string {
  if (token.type === "container") return plainTextOf((token as ContainerToken).children);
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

type ContainerKind = "try" | "note" | "tip" | "warn";

interface ContainerToken extends Tokens.Generic {
  type: "container";
  raw: string;
  kind: ContainerKind;
  title: string;
  unclosed: boolean;
  children: Token[];
}

const CONTAINER_OPEN = /^:::(try|note|tip|warn)(?:[ \t]+([^\n]*?))?[ \t]*(?:\n|$)/;
const CONTAINER_START = /(?:^|\n):::(?:try|note|tip|warn)(?:[ \t]|\n|$)/;
const OTHER_FENCES = new Set(["text", "bash", "html", "yaml", "json"]);


function countNewlines(s: string): number {
  let n = 0;
  for (const ch of s) if (ch === "\n") n += 1;
  return n;
}

/** Scans a `:::` container from its opening line to the line that closes it. */
function containerToken(
  lexer: { blockTokens(src: string, tokens: Token[]): Token[] },
  src: string,
): ContainerToken | undefined {
  const open = CONTAINER_OPEN.exec(src);
  if (!open) return undefined;
  let pos = open[0].length;
  let depth = 1;
  let fence: { ch: string; len: number } | null = null;
  let innerEnd = src.length;
  let consumed = src.length;
  let unclosed = true;
  while (pos < src.length) {
    const nl = src.indexOf("\n", pos);
    const lineEnd = nl === -1 ? src.length : nl;
    const next = nl === -1 ? src.length : nl + 1;
    const line = src.slice(pos, lineEnd);
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceMatch) {
      const run = fenceMatch[1]!;
      if (fence === null) fence = { ch: run[0]!, len: run.length };
      else if (run[0] === fence.ch && run.length >= fence.len && fenceMatch[2]!.trim() === "") fence = null;
    } else if (fence === null) {
      if (/^:::(?:try|note|tip|warn)(?:[ \t]|$)/.test(line)) depth += 1;
      else if (/^:::[ \t]*$/.test(line)) {
        depth -= 1;
        if (depth === 0) {
          innerEnd = pos;
          consumed = next;
          unclosed = false;
          break;
        }
      }
    }
    pos = next;
  }
  const kind = open[1] as ContainerKind;
  const inner = src.slice(open[0].length, Math.max(innerEnd, open[0].length));
  return {
    type: "container",
    raw: src.slice(0, consumed),
    kind,
    title: (open[2] ?? "").trim(),
    unclosed,
    children: lexer.blockTokens(inner, []),
  };
}

/**
 * Renders a page body. Standard Markdown plus an id and an anchor link on
 * every heading. Raw HTML in the source is shown as text rather than
 * emitted, so a page can only contain what the generator writes.
 *
 * Fences are the other half of the contract. A `marey` fence is compiled and
 * becomes a sample figure (see `renderSample`), an `error` fence has its
 * messages rendered here at build time, and every other fence is one of a short
 * list or an error. `:::try Title`, `:::note`, `:::tip` and `:::warn` wrap
 * blocks, closed by a line holding `:::`.
 */
export function renderMarkdown(body: string, ctx: RenderContext): RenderedMarkdown {
  const errors: string[] = [];
  const headings: Heading[] = [];
  const links: Array<{ href: string; line: number; file: string }> = [];
  const seen = new Map<string, number>();
  /** The file line each block token starts on, nested blocks included. */
  const lines = new WeakMap<object, number>();
  const lineOf = (token: object): number => lines.get(token) ?? ctx.bodyLine;
  let tryDepth = 0;

  function annotate(tokens: ReadonlyArray<Token>, first: number): void {
    let line = first;
    for (const token of tokens) {
      lines.set(token, line);
      if (token.type === "container") annotate((token as ContainerToken).children, line + 1);
      else if (token.type === "blockquote") annotate((token as Tokens.Blockquote).tokens, line);
      else if (token.type === "list") {
        let itemLine = line;
        for (const item of (token as Tokens.List).items) {
          lines.set(item, itemLine);
          annotate(item.tokens, itemLine);
          itemLine += countNewlines(item.raw);
        }
      }
      line += countNewlines(token.raw);
    }
  }

  const container: TokenizerAndRendererExtension = {
    name: "container",
    level: "block",
    start(src: string): number | undefined {
      const m = CONTAINER_START.exec(src);
      return m ? m.index + (m[0].startsWith("\n") ? 1 : 0) : undefined;
    },
    tokenizer(this: { lexer: { blockTokens(src: string, tokens: Token[]): Token[] } }, src: string) {
      return containerToken(this.lexer, src);
    },
    childTokens: ["children"],
    renderer(this: { parser: { parse(tokens: Token[]): string } }, token: Tokens.Generic): string {
      const c = token as ContainerToken;
      const line = lineOf(token);
      if (c.unclosed) errors.push(`${ctx.file}:${line}: ":::${c.kind}" is never closed; end it with a line holding ":::"`);
      if (c.kind === "try") {
        if (c.title === "") errors.push(`${ctx.file}:${line}: ":::try" needs a title after it`);
        if (tryDepth > 0) errors.push(`${ctx.file}:${line}: a ":::try" cannot be nested inside another ":::try"`);
        tryDepth += 1;
        const inner = this.parser.parse(c.children);
        tryDepth -= 1;
        return `<section class="try">\n<h3>${escapeHtml(c.title)}</h3>\n${inner}</section>\n`;
      }
      return `<aside class="callout callout-${c.kind}">\n${this.parser.parse(c.children)}</aside>\n`;
    },
  };

  function fence(token: Tokens.Code): string {
    const line = lineOf(token);
    const source = token.text.replace(/\n+$/, "");
    const info = token.codeBlockStyle === "indented" ? "" : (token.lang ?? "").trim();
    const plain = (lang: string): string =>
      `<pre class="code" data-lang="${escapeHtml(lang)}"><code>${escapeHtml(source)}</code></pre>\n`;

    if (OTHER_FENCES.has(info)) return plain(info);

    const m = /^marey(?:[ \t]+(\S+))?$/.exec(info);
    let mode: Sample["mode"] | null = null;
    let code: string | null = null;
    if (m) {
      const flag = m[1];
      if (flag === undefined) mode = ctx.sampleMode;
      else if (flag === "error") mode = "error";
      else if (flag === "fragment" || flag === "solution") mode = flag;
      else {
        const withCode = /^error=([A-Z][A-Z0-9_]*)$/.exec(flag);
        if (withCode) {
          mode = "error";
          code = withCode[1]!;
        }
      }
    }
    if (mode === null) {
      const shown = info === "" ? "no language" : `"${info}"`;
      errors.push(
        `${ctx.file}:${line}: a code fence with ${shown} is not allowed; use marey, marey error[=CODE], marey fragment, marey solution, text, bash, html, yaml or json`,
      );
      return plain("text");
    }
    if (mode === "solution" && tryDepth === 0) {
      errors.push(`${ctx.file}:${line}: "marey solution" belongs inside a ":::try" exercise`);
    }
    const sample: Sample = { mode, source, file: ctx.file, line, code };
    errors.push(...checkSample(sample));
    return renderSample(sample, mode === "error" ? errorMessages(source) : []);
  }

  const marked = new Marked({
    gfm: true,
    extensions: [container],
    renderer: {
      heading(this: Renderer, token: Tokens.Heading): string {
        const text = plainTextOf(token.tokens).trim();
        const inner = this.parser.parseInline(token.tokens);
        if (token.depth === 1) {
          errors.push(`${ctx.file}:${lineOf(token)}: "# ${text}" is a level-1 heading; the page title is the only h1, so start at ##`);
          return `<h1>${inner}</h1>\n`;
        }
        const id = slugify(text, seen);
        if (id === "") {
          errors.push(`${ctx.file}:${lineOf(token)}: the heading "${text}" has no letters or digits, so its anchor would point nowhere`);
        }
        if (token.depth === 2 || token.depth === 3) {
          headings.push({ depth: token.depth, text, id });
        }
        const label = escapeHtml(`Link to "${text}"`);
        return (
          `<h${token.depth} id="${escapeHtml(id)}">${inner} ` +
          `<a class="anchor" href="#${escapeHtml(id)}" aria-label="${label}">#</a></h${token.depth}>\n`
        );
      },
      code(token: Tokens.Code): string {
        return fence(token);
      },
      html(token: Tokens.HTML | Tokens.Tag): string {
        return escapeHtml(token.text);
      },
    },
  });

  const tokens = marked.lexer(body);
  annotate(tokens, ctx.bodyLine);
  // The renderer runs in document order, so the errors it reports follow the
  // page from top to bottom.
  const parts: string[] = [];
  const texts: string[] = [];
  for (const token of tokens) {
    const startLine = lineOf(token);
    // Identical links in one block are told apart by searching on from the
    // end of the previous one.
    let searchFrom = 0;
    marked.walkTokens([token], (t) => {
      if (t.type !== "link") return;
      const link = t as Tokens.Link;
      let at = token.raw.indexOf(link.raw, searchFrom);
      if (at < 0) at = token.raw.indexOf(link.raw);
      else searchFrom = at + link.raw.length;
      const offset = at < 0 ? 0 : countNewlines(token.raw.slice(0, at));
      links.push({ href: link.href, line: startLine + offset, file: ctx.file });
    });
    parts.push(marked.parser([token]));
    const text = plainText(token).trim();
    if (text !== "") texts.push(text);
  }

  return { html: parts.join(""), headings, links, text: texts.join("\n"), errors };
}
