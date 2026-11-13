import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ConfigEnv, Plugin, UserConfig } from "vite";
import { buildSite } from "../site/build/index";
import { reloadsSite, site } from "./site";

const repoRoot = resolve(import.meta.dirname, "..");

function configOf(plugin: Plugin, root: string): UserConfig {
  const hook = plugin.config;
  const fn = typeof hook === "function" ? hook : hook?.handler;
  const env: ConfigEnv = { command: "build", mode: "production" };
  return (fn?.call({} as never, { root }, env) ?? {}) as UserConfig;
}

describe("site()", () => {
  it("adds one rollup input per page beside the playground's index.html", () => {
    const plugin = site();
    const pages = buildSite(repoRoot).pages;
    const input = configOf(plugin, repoRoot).build?.rollupOptions?.input as Record<string, string>;
    expect(Object.keys(input)).toHaveLength(pages.length + 1);
    expect(input.main).toBe(resolve(repoRoot, "index.html"));
    for (const page of pages) {
      expect(Object.values(input)).toContain(resolve(repoRoot, page.outFile));
    }
  });

  it("serves each page's html for its output path and nothing else", () => {
    const plugin = site();
    configOf(plugin, repoRoot);
    const resolveId = plugin.resolveId as (id: string) => string | null;
    const load = plugin.load as (id: string) => string | null;
    const learn = resolve(repoRoot, "learn/index.html");
    expect(resolveId(learn)).not.toBeNull();
    expect(load(resolveId(learn) as string)).toContain("<h1>Learn</h1>");
    expect(resolveId(resolve(repoRoot, "index.html"))).toBeNull();
    expect(load(resolve(repoRoot, "index.html"))).toBeNull();
  });
});

describe("reloadsSite", () => {
  const at = (path: string) => resolve(repoRoot, path);

  it("reloads for site content, gallery entries and site.json", () => {
    for (const path of ["site/content/learn/index.md", "site/gallery/lighthouse.md", "site/gallery/lighthouse.marey", "site/site.json"]) {
      expect(reloadsSite(at(path), repoRoot), path).toBe(true);
    }
  });

  it("reloads for a scene a gallery entry names with source:, and not for other scenes", () => {
    expect(reloadsSite(at("src/examples/ledges.marey"), repoRoot)).toBe(true);
    expect(reloadsSite(at("docs/media/bars-reveal.marey"), repoRoot)).toBe(false);
    expect(reloadsSite(at("src/examples/index.ts"), repoRoot)).toBe(false);
  });

  it("reads the gallery only for a scene file", () => {
    let reads = 0;
    const scenes = () => {
      reads++;
      return ["src/examples/ledges.marey"];
    };
    expect(reloadsSite(at("src/App.tsx"), repoRoot, scenes)).toBe(false);
    expect(reads).toBe(0);
    expect(reloadsSite(at("src/examples/ledges.marey"), repoRoot, scenes)).toBe(true);
    expect(reads).toBe(1);
  });
});
