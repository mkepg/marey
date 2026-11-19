import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSite } from "./index";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const site = buildSite(root);

const counts = new Map<string, number>();
for (const page of site.pages) {
  for (const m of page.html.matchAll(/<figure class="sample" data-mode="([a-z]+)"/g)) {
    counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
  }
}
const summary = [...counts].map(([mode, n]) => `${mode}: ${n}`).join(", ") || "no samples yet";

describe("site content", () => {
  it(`builds with no errors; every sample compiles as declared (${summary})`, () => {
    expect(site.errors).toEqual([]);
  });
});
