import { describe, it, expect } from "vitest";

// Every non-test source file the player can reach, as raw text keyed by its
// path relative to this file ("../compiler/sceneIR.ts", "./index.ts").
// element.ts is read as text only: it needs a browser and nothing under Node
// may import it.
const SOURCES = {
  ...import.meta.glob(["../compiler/**/*.ts", "!../compiler/**/*.test.ts"], { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob(["./*.ts", "!./*.test.ts"], { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob(["../package/*.ts", "!../package/*.test.ts"], { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../lib/share.ts", { query: "?raw", import: "default", eager: true }),
} as Record<string, string>;

// `import(` is deliberately not matched: the lazily loaded render chunk is the
// one place the renderer may enter, so the walk must not follow it.
const SPECIFIER = /(?:from|import)\s+["']([^"']+)["']|from\s*["']([^"']+)["']/g;

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

/** Every file and bare package reachable from `entry` by static imports, plus relative imports the walk could not read. */
function reach(entry: string): { files: Set<string>; packages: Set<string>; unread: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const unread = new Set<string>();
  const visit = (file: string): void => {
    if (files.has(file)) return;
    files.add(file);
    for (const m of SOURCES[file].matchAll(SPECIFIER)) {
      const spec = m[1] ?? m[2];
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

describe("the player's boundary", () => {
  const { files, packages, unread } = reach("./index.ts");

  it("reads every file the entry reaches", () => {
    expect([...unread]).toEqual([]);
  });

  it("never statically reaches the renderer", () => {
    expect(files.has("./element.ts")).toBe(true);
    expect([...files].filter((f) => f.startsWith("../compiler/renderer/"))).toEqual([]);
    expect(files.has("./render.ts")).toBe(false);
    expect(packages.has("pixi.js")).toBe(false);
    expect(packages.has("matter-js")).toBe(false);
  });

  it("the renderer is reached only through the one dynamic import", () => {
    const dynamic = /import\(\s*["']\.\/render["']\s*\)/g;
    expect(SOURCES["./element.ts"].match(dynamic)?.length).toBe(1);
    const others = Object.entries(SOURCES)
      .filter(([f]) => f.startsWith("./") && f !== "./element.ts")
      .filter(([, text]) => text.includes("import("))
      .map(([f]) => f);
    expect(others).toEqual([]);
  });
});
