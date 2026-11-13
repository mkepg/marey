/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOKEN_CLASSES } from "../shared/highlight";

/**
 * Spec 9C §6.2: in both themes, body and secondary text reach 4.5:1 on every
 * ground the site draws them on, links and interface text reach 3:1, and every
 * Marey token colour reaches 4.5:1 on the code background. The colours are
 * read from site.css, so the test checks what ships rather than a copy.
 */
// Not `?raw`: Vitest hands back an empty module for a CSS import.
const css = readFileSync(new URL("./site.css", import.meta.url), "utf8");

/** The `--site-*` tokens declared in the block that opens with `selector {` on its own line. */
function block(selector: string): Record<string, string> {
  const lines = css.split("\n");
  const at = lines.findIndex((line) => line.trim() === `${selector} {`);
  if (at < 0) throw new Error(`site.css has no "${selector} {" block`);
  const open = lines.slice(0, at + 1).join("\n").length;
  const close = css.indexOf("}", open);
  const out: Record<string, string> = {};
  for (const m of css.slice(open, close).matchAll(/--site-([\w-]+):\s*([^;]+);/g)) {
    out[m[1]!] = m[2]!.trim().toLowerCase();
  }
  return out;
}

function hex(theme: Record<string, string>, name: string): string {
  const value = theme[name];
  if (value === undefined) throw new Error(`--site-${name} is not defined`);
  if (!/^#[0-9a-f]{6}$/.test(value)) throw new Error(`--site-${name} is "${value}", not a six-digit hex colour`);
  return value;
}

function luminance(colour: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(colour.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const light = block(":root");
const dark = { ...light, ...block('[data-theme="dark"]') };

/** Grounds that body text sits on. */
const GROUNDS = ["bg", "surface", "raised", "accent-soft", "note-bg", "tip-bg", "warn-bg"];

const TEXT: Array<readonly [string, string]> = [
  ...GROUNDS.flatMap((g) => [["text", g], ["text-2", g]] as const),
  ["text", "code-bg"],
  ["code-text", "code-bg"],
  ["note-ink", "note-bg"],
  ["tip-ink", "tip-bg"],
  ["warn-ink", "warn-bg"],
  ["on-accent", "accent"],
  ["error", "bg"],
  ["error", "code-bg"],
  ["ok", "bg"],
];

const INTERFACE: Array<readonly [string, string]> = [
  ...GROUNDS.map((g) => ["link", g] as const),
  ["text-3", "bg"],
  ["text-3", "surface"],
  ["text-3", "raised"],
  ["focus", "bg"],
  ["focus", "surface"],
  ["focus", "raised"],
  ["accent", "bg"],
  ["control-border", "bg"],
  ["control-border", "raised"],
];

/** Every class the highlighter emits, read from the highlighter itself. */
const TOKEN_KINDS = [...new Set([...Object.values(TOKEN_CLASSES).filter((c) => c !== null), "comment", "error"])];

describe.each([["light", light], ["dark", dark]] as const)("the %s theme", (_name, theme) => {
  it.each(TEXT)("--site-%s on --site-%s reaches 4.5:1", (fg, bg) => {
    expect(contrast(hex(theme, fg), hex(theme, bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(INTERFACE)("--site-%s on --site-%s reaches 3:1", (fg, bg) => {
    expect(contrast(hex(theme, fg), hex(theme, bg))).toBeGreaterThanOrEqual(3);
  });

  it.each(TOKEN_KINDS)("the %s token colour reaches 4.5:1 on the code background", (kind) => {
    expect(contrast(hex(theme, `tk-${kind}`), hex(theme, "code-bg"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the theme blocks", () => {
  it("define a dark value for every light token that differs by theme, and nothing else", () => {
    const darkOnly = block('[data-theme="dark"]');
    expect(Object.keys(darkOnly).filter((k) => !(k in light))).toEqual([]);
  });

  it("give the system dark theme exactly the tokens of the chosen dark theme", () => {
    // The media query copy exists so a reader with no stored choice gets dark
    // from their system setting before any script runs; it must not drift.
    expect(block(':root:not([data-theme="light"])')).toEqual(block('[data-theme="dark"]'));
  });

  it("style every token class the highlighter emits", () => {
    for (const kind of TOKEN_KINDS) {
      expect(css, `.tk-${kind}`).toMatch(new RegExp(`\\.tk-${kind}\\b[^{]*\\{[^}]*var\\(--site-tk-${kind}\\)`));
    }
  });
});

describe("the contrast formula", () => {
  it("measures black on white as 21:1 and a colour on itself as 1:1", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#6b58f0", "#6b58f0")).toBeCloseTo(1, 5);
  });
});
