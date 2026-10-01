/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Spec 6B §9.6: every text colour in both themes reaches WCAG AA (4.5:1) on
 * the background it is drawn on. The colours are read from the theme blocks
 * in global.scss, so the test checks what ships, not a copy of it.
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
