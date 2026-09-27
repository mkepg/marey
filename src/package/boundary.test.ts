import { describe, it, expect } from "vitest";

// Every non-test source file under src/compiler and src/package, as raw text
// keyed by its path relative to this file ("../compiler/sceneIR.ts",
// "./index.ts").
const SOURCES = {
  ...import.meta.glob(["../compiler/**/*.ts", "!../compiler/**/*.test.ts"], { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob(["./*.ts", "!./*.test.ts"], { query: "?raw", import: "default", eager: true }),
} as Record<string, string>;

const SPECIFIER = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

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

function resolve(fromFile: string, spec: string): string | null {
  const base = join(fromFile, spec);
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (candidate in SOURCES) return candidate;
  }
  return null;
}

/**
 * Every file and every bare package specifier reachable from `entry`, type
 * imports included, plus every relative import the walk could not read
 * (`"<from> -> <spec>"`).
 */
function reach(entry: string): { files: Set<string>; packages: Set<string>; unread: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const unread = new Set<string>();
  const visit = (file: string): void => {
    if (files.has(file)) return;
    files.add(file);
    for (const [, spec] of SOURCES[file].matchAll(SPECIFIER)) {
      if (spec.startsWith(".")) {
        const next = resolve(file, spec);
        if (next) visit(next);
        else unread.add(`${file} -> ${spec}`);
      } else {
        packages.add(spec);
      }
    }
  };
  visit(entry);
  return { files, packages, unread };
}

const FORBIDDEN_PACKAGES = ["pixi.js", "matter-js", "mediabunny", "harfbuzzjs", "playwright-core", "preact", "zustand", "monaco-editor"];

describe("the public library's boundary", () => {
  const { files, packages, unread } = reach("./index.ts");

  it("reaches the compiler", () => {
    expect(files.has("../compiler/compileSource.ts")).toBe(true);
  });

  // The walk can vouch only for files it can read, and SOURCES holds only
  // src/compiler and src/package. A relative import that leaves them (say,
  // "../store", which pulls in zustand) would otherwise be dropped in
  // silence and the two checks below would pass without having looked.
  it("reads every file the entry reaches", () => {
    expect([...unread]).toEqual([]);
  });

  it("never reaches the renderer or the exporters", () => {
    const leaked = [...files].filter((f) => f.startsWith("../compiler/renderer/") || f.startsWith("../compiler/export/"));
    expect(leaked).toEqual([]);
  });

  // Names, not "no packages at all": the naive specifier scan also matches
  // "from '...'" inside diagnostic message strings in the parser (measured
  // 2026-09-27), so an emptiness assertion would fail for the wrong reason.
  it("imports none of the rendering, export, browser or app packages", () => {
    const hits = [...packages].filter((p) => FORBIDDEN_PACKAGES.some((f) => p === f || p.startsWith(`${f}/`)));
    expect(hits).toEqual([]);
  });
});
