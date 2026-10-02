/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Spec 6B §9.6: the text colours of both themes reach WCAG AA (4.5:1) on the
 * backgrounds the UI draws them on. Checked, per theme: primary and secondary
 * text on the pane, the terminal, the menu (the pane in light, `--bg-preview`
 * in dark), the hover and focus ground and `--accent-dim`; ok and error text
 * on the bar; the accent's label on the accent; and the editor's comment colour
 * on the editor background and on the current-line highlight. Not checked:
 * `--text-muted` and `--text-info`, which carry no body text, and the
 * syntax colours other than comments. Colours are read from global.scss and
 * themes.ts, so the test checks what ships, not a copy of it.
 */
// Not `?raw`: Vitest's CSS pipeline hands back an empty module for a .scss
// import, and the app project carries no Node types, hence the reference above.
const scss = readFileSync(new URL("./global.scss", import.meta.url), "utf8");

function colours(selector: string): Record<string, string> {
  const start = scss.indexOf(selector);
  if (start < 0) throw new Error(`global.scss has no ${selector} block`);
  const open = scss.indexOf("{", start);
  const close = scss.indexOf("}", open);
  const out: Record<string, string> = {};
  for (const m of scss.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const dark = colours(":root");
const light = { ...dark, ...colours('[data-theme="light"]') };

const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["text-primary", "bg-pane"],
  ["text-secondary", "bg-pane"],
  ["text-primary", "bg-terminal"],
  ["text-secondary", "bg-terminal"],
  ["text-ok", "bg-bar"],
  ["text-error", "bg-bar"],
  ["accent-text", "accent"],
  // Menus: the pane's ground in light, --bg-preview in dark.
  ["text-primary", "bg-preview"],
  ["text-secondary", "bg-preview"],
  // Hovered and focused menu items.
  ["text-primary", "bg-handle"],
  ["text-secondary", "bg-handle"],
  // The running export's button.
  ["text-primary", "accent-dim"],
  ["text-secondary", "accent-dim"],
];

describe.each([["dark", dark], ["light", light]] as const)("%s theme", (_name, theme) => {
  it.each(PAIRS)("--%s on --%s reaches 4.5:1", (fg, bg) => {
    expect(theme[fg], `--${fg} missing`).toBeDefined();
    expect(theme[bg], `--${bg} missing`).toBeDefined();
    expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the contrast formula", () => {
  it("measures black on white as 21:1 and a colour on itself as 1:1", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#6b58f0", "#6b58f0")).toBeCloseTo(1, 5);
  });
});

// Monaco takes literal hex strings, so themes.ts holds its own copy of the
// palette. Comments are the one syntax colour the spec holds to 4.5:1.
const themesSource = readFileSync(
  new URL("../components/Editor/MonacoEditor/themes.ts", import.meta.url), "utf8");

function monacoTheme(name: string) {
  const start = themesSource.indexOf(`defineTheme("${name}"`);
  if (start < 0) throw new Error(`themes.ts does not define ${name}`);
  const next = themesSource.indexOf("defineTheme(", start + 1);
  const block = themesSource.slice(start, next < 0 ? undefined : next);
  const pick = (re: RegExp, what: string): string => {
    const m = block.match(re);
    if (!m) throw new Error(`${name} has no ${what}`);
    return `#${m[1].toLowerCase()}`;
  };
  return {
    comment: pick(/token:\s*"comment",\s*foreground:\s*"([0-9a-fA-F]{6})"/, "comment colour"),
    background: pick(/"editor\.background":\s*"#([0-9a-fA-F]{6})"/, "editor.background"),
    lineHighlight: pick(/"editor\.lineHighlightBackground":\s*"#([0-9a-fA-F]{6})"/, "line highlight"),
  };
}

describe.each([["Marey-dark", "#80858f"], ["Marey-light", "#646d82"]] as const)("%s editor comments", (name, expected) => {
  const t = monacoTheme(name);
  it("uses the colour the spec records", () => {
    expect(t.comment).toBe(expected);
  });
  it("reach 4.5:1 on the editor background", () => {
    expect(contrast(t.comment, t.background)).toBeGreaterThanOrEqual(4.5);
  });
  it("reach 4.5:1 on the current-line highlight", () => {
    expect(contrast(t.comment, t.lineHighlight)).toBeGreaterThanOrEqual(4.5);
  });
});
