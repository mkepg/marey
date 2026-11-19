export interface FrontMatter {
  readonly data: Record<string, string | string[]>;
  /** The Markdown after the closing `---`. */
  readonly body: string;
  /** The 1-based line of the file on which `body` starts. */
  readonly bodyLine: number;
}

const KEY = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s+(.*?))?\s*$/;
const ITEM = /^- (.*?)\s*$/;

/**
 * Parses the block between two `---` lines. It accepts `key: value` and a
 * key followed by `- item` lines, and rejects everything else (nested maps,
 * indentation, a repeated key, a missing closing line) with `file:line:`.
 * A file with no opening `---` has no front matter.
 */
export function parseFrontMatter(src: string, file: string): FrontMatter {
  const lines = src.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { data: {}, body: src, bodyLine: 1 };
  }
  const data: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const where = `${file}:${i + 1}`;
    if (line.trim() === "---") {
      return { data, body: lines.slice(i + 1).join("\n"), bodyLine: i + 2 };
    }
    if (line.trim() === "") continue;
    if (/^\s/.test(line)) {
      throw new Error(`${where}: front matter does not allow indentation or nested maps`);
    }
    const item = ITEM.exec(line);
    if (item) {
      if (listKey === null) {
        throw new Error(`${where}: a "- item" line must follow a "key:" line`);
      }
      (data[listKey] as string[]).push(item[1]);
      continue;
    }
    const pair = KEY.exec(line);
    if (!pair) {
      throw new Error(`${where}: expected "key: value" or "- item", found "${line}"`);
    }
    const key = pair[1];
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      throw new Error(`${where}: duplicate key "${key}"`);
    }
    const value = pair[2];
    if (value === undefined || value === "") {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = value;
      listKey = null;
    }
  }
  throw new Error(`${file}:${lines.length}: front matter opened on line 1 is never closed with ---`);
}
