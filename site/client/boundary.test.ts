import { describe, expect, it } from "vitest";

/**
 * The site's pages never load Monaco: it is about 900 kB gzipped, and the
 * lessons use a light editor instead (spec 9C C5, §6.1). Checked two ways: no
 * file under site/client or site/shared imports it, and the import graph from
 * main.ts, followed through every relative import (dynamic ones included, since
 * a lazy chunk is still downloaded), reaches neither the package nor a file
 * that imports it.
 */
// Every source file the site's client could reach, as raw text keyed by its
// path relative to this file ("./main.ts", "../../src/compiler/lexer/index.ts").
const SOURCES = {
  ...import.meta.glob(["./**/*.ts", "!./**/*.test.ts"], { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob(["../shared/**/*.ts", "!../shared/**/*.test.ts"], { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob(["../../src/**/*.{ts,tsx}", "!../../src/**/*.test.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }),
} as Record<string, string>;

const MONACO = /^monaco-editor(?:\/|$)/;

/** Type-only imports and re-exports are erased by the compiler and load nothing. */
const TYPE_ONLY = /^\s*(?:import|export)\s+type\b[^;]*;/gm;
const SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g;

function specifiers(text: string): string[] {
  return [...text.replace(TYPE_ONLY, "").matchAll(SPECIFIER)].map((m) => m[1]!.split("?")[0]!);
}

function join(fromFile: string, spec: string): string {
  const out: string[] = [];
  for (const seg of [...fromFile.split("/").slice(0, -1), ...spec.split("/")]) {
    if (seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0 || out[out.length - 1] === "..") out.push("..");
      else out.pop();
    } else {
      out.push(seg);
    }
  }
  const path = out.join("/");
  return path.startsWith("..") ? path : `./${path}`;
}

/** Stylesheets, fonts and other assets: imported, but not code that can import anything. */
const ASSET = /\.(?:css|scss|svg|png|ttf|woff2?|json)$/;

function resolve(fromFile: string, spec: string): string | null {
  const base = join(fromFile, spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (candidate in SOURCES) return candidate;
  }
  return null;
}

function reach(entry: string): { files: Set<string>; packages: Set<string>; unread: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const unread = new Set<string>();
  const visit = (file: string): void => {
    if (files.has(file)) return;
    files.add(file);
    for (const spec of specifiers(SOURCES[file]!)) {
      if (!spec.startsWith(".")) {
        packages.add(spec);
      } else if (!ASSET.test(spec)) {
        const next = resolve(file, spec);
        if (next) visit(next);
        else unread.add(`${file} -> ${spec}`);
      }
    }
  };
  visit(entry);
  return { files, packages, unread };
}

const importsMonaco = (file: string): boolean => specifiers(SOURCES[file]!).some((s) => MONACO.test(s));

describe("the site's client boundary", () => {
  const { files, packages, unread } = reach("./main.ts");

  it("reads every file main.ts reaches", () => {
    expect([...unread]).toEqual([]);
    // The walk follows main.ts's own imports, so it sees at least these.
    expect(files.has("./storage.ts")).toBe(true);
    expect(files.has("./search.ts")).toBe(true);
  });

  it("never reaches monaco-editor, or a file that imports it", () => {
    expect([...packages].filter((p) => MONACO.test(p))).toEqual([]);
    expect([...files].filter(importsMonaco)).toEqual([]);
  });

  it("has no file under site/client or site/shared that imports monaco-editor", () => {
    const own = Object.keys(SOURCES).filter((f) => f.startsWith("./") || f.startsWith("../shared/"));
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter(importsMonaco)).toEqual([]);
  });

  it("recognises a Monaco import in each form the walk must catch", () => {
    for (const text of [
      `import * as monaco from "monaco-editor";`,
      `import "monaco-editor/esm/vs/editor/editor.main.css";`,
      `const m = await import("monaco-editor");`,
      `export { editor } from 'monaco-editor';`,
    ]) {
      expect(specifiers(text).some((s) => MONACO.test(s)), text).toBe(true);
    }
    expect(specifiers(`import type * as monaco from "monaco-editor";`)).toEqual([]);
    // The one file in the repository that loads Monaco is seen as doing so.
    expect(importsMonaco("../../src/hooks/monacoSetup.ts")).toBe(true);
  });
});
