import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Monaco is most of the playground's JavaScript. One runtime import of it
// from anywhere the entry reaches statically puts all of it back in front of
// the first paint, so it may only be imported by the module `useMonaco`
// loads on demand. Type-only imports are erased and cost nothing.
const ALLOWED = ["src/hooks/monacoSetup.ts"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const RUNTIME_IMPORT = /^\s*import\s+(?!type\b)[^;]*?from\s+["']monaco-editor[^"']*["']/m;

describe("Monaco loads on demand", () => {
  it("is imported at runtime only by the module useMonaco loads", () => {
    const importers = sourceFiles("src")
      .filter((file) => RUNTIME_IMPORT.test(readFileSync(file, "utf8")))
      .map((file) => relative(".", file).split(sep).join("/"));
    expect(importers).toEqual(ALLOWED);
  });

  it("is loaded with a dynamic import", () => {
    const hook = readFileSync("src/hooks/useMonaco.ts", "utf8");
    expect(hook).toContain('import("./monacoSetup")');
  });
});
