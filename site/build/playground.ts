/**
 * "Open in playground" links for the site's long scenes.
 *
 * A share link carries the source compressed in its fragment, and
 * `MAX_SHARE_LENGTH` caps how long that may be. A showcase is written for
 * reading, so its comments can take it over the cap. Rather than cut the
 * scene to fit, the link for such a scene carries the same code with its
 * comments removed; the page itself still shows the commented source.
 */
import LZString from "lz-string";
import { lex } from "../../src/compiler/lexer";
import { MAX_SHARE_LENGTH } from "../../src/lib/share";

export const PLAYGROUND = "https://marey.pages.dev/";

/** The offset at which each line starts. The lexer counts "\r\n", "\r" and "\n" each as one line end. */
function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\r" && source[i + 1] === "\n") continue;
    if (source[i] === "\r" || source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/** The 0-based line holding `offset`. */
function lineOf(starts: ReadonlyArray<number>, offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The [start, end) offsets of each token in `source`. */
function tokenSpans(source: string, starts: ReadonlyArray<number>): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const t of lex(source)) {
    if (t.type === "EOF") continue;
    const start = (starts[t.line - 1] ?? 0) + t.col - 1;
    spans.push([start, start + (t.endCol - t.col)]);
  }
  return spans;
}

/**
 * The source with every `//` comment removed, each line's trailing spaces
 * trimmed, the lines a comment filled dropped, and each run of blank lines cut
 * to one. Comments are found between the lexer's tokens, so `//` inside a
 * string is kept. Line ends become "\n". A source the lexer rejects is
 * returned unchanged: there is then no telling a comment from a string.
 */
export function stripComments(source: string): string {
  const starts = lineStarts(source);
  let spans: Array<[number, number]>;
  try {
    spans = tokenSpans(source, starts);
  } catch {
    return source;
  }

  // Cut each comment, which only ever sits between tokens and never spans a
  // line end, so the text keeps the source's lines. Note which lines had one.
  let text = "";
  let at = 0;
  const commented = new Set<number>();
  const cut = (gap: string, offset: number): string =>
    gap.replace(/\/\/[^\r\n]*/g, (_match, index: number) => {
      commented.add(lineOf(starts, offset + index));
      return "";
    });
  for (const [start, end] of spans) {
    text += cut(source.slice(at, start), at) + source.slice(start, end);
    at = end;
  }
  text += cut(source.slice(at), at);

  const kept: string[] = [];
  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = raw.replace(/[ \t]+$/, "");
    if (line === "") {
      if (commented.has(i)) return;
      if (kept.length === 0 || kept[kept.length - 1] === "") return;
    }
    kept.push(line);
  });
  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
  return kept.length === 0 ? "" : kept.join("\n") + "\n";
}

export interface PlaygroundLink {
  /** The link, or null when even the stripped source is over the ceiling. */
  readonly url: string | null;
  /** True when the link carries the source without its comments. */
  readonly stripped: boolean;
  /** The compressed length of what the link carries, or would have carried. */
  readonly length: number;
}

/** The share link for text already compressed, in the form `buildShareURLFor` gives; tests pin the two together. */
function shareUrl(compressed: string): string {
  return `${PLAYGROUND}#code=${compressed}`;
}

/**
 * Links already worked out, by source. A gallery scene's link is asked for by
 * the entry's check, by its page and by its lesson's showcase, and
 * compressing a long scene is the slow part, so each source is compressed
 * once per build.
 */
const links = new Map<string, PlaygroundLink>();

/**
 * The playground link for a scene: its full source when that fits a share
 * link, and otherwise the source without comments.
 */
export function playgroundLink(source: string): PlaygroundLink {
  const known = links.get(source);
  if (known) return known;
  let link: PlaygroundLink;
  const full = LZString.compressToEncodedURIComponent(source);
  if (full.length <= MAX_SHARE_LENGTH) {
    link = { url: shareUrl(full), stripped: false, length: full.length };
  } else {
    const bare = LZString.compressToEncodedURIComponent(stripComments(source));
    link = { url: bare.length <= MAX_SHARE_LENGTH ? shareUrl(bare) : null, stripped: true, length: bare.length };
  }
  links.set(source, link);
  return link;
}
