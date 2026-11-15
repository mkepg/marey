import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/compiler/compileSource";
import { MAX_SHARE_LENGTH, buildShareURLFor, decodeCode } from "../../src/lib/share";
import { loadGallery } from "./gallery";
import { PLAYGROUND, playgroundLink, stripComments } from "./playground";

const repoRoot = resolve(import.meta.dirname, "../..");

/** The source a playground link carries. */
function decoded(url: string): string {
  const hash = new URL(url).hash;
  expect(hash.startsWith("#code=")).toBe(true);
  const text = decodeCode(hash.slice("#code=".length));
  expect(text).not.toBeNull();
  return text!;
}

/**
 * A scene whose code is short but whose comments are long and varied enough
 * that the whole source does not compress under the ceiling. The comments
 * hold a pseudo-random word stream, which LZ cannot fold into a few back
 * references the way it folds repeated code.
 */
function overCeilingScene(): string {
  let seed = 7;
  const word = (): string => {
    let w = "";
    for (let k = 0; k < 6; k++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      w += String.fromCharCode(97 + (seed % 26));
    }
    return w;
  };
  const lines = ["// A long note before the scene.", ""];
  for (let i = 0; i < 900; i++) lines.push(`// ${word()} ${word()} ${word()} ${word()}`);
  lines.push(
    "scene {",
    "  size: (400, 300)",
    "  duration: 2",
    "",
    "",
    "",
    '  text t { position: (200, 40), content: "a // b, not a comment" }   // a trailing note',
    "  circle c { position: (200, 150), radius: 20 // inside a block",
    "    animate { property: position, to: (300, 150), duration: 2 } }",
    "}",
  );
  return lines.join("\n") + "\n";
}

describe("stripComments", () => {
  it("removes line comments, whole-line and trailing, and keeps the code", () => {
    const source = "// head\nscene {\n  size: (400, 300) // the size\n  // a note\n  duration: 2\n}\n";
    expect(stripComments(source)).toBe("scene {\n  size: (400, 300)\n  duration: 2\n}\n");
  });

  it("keeps // inside a string", () => {
    const source = 'scene {\n  text t { position: (1, 1), content: "http://x // y" } // gone\n}\n';
    expect(stripComments(source)).toBe('scene {\n  text t { position: (1, 1), content: "http://x // y" }\n}\n');
  });

  it("collapses a run of blank lines to one, and drops the lines comments leave empty", () => {
    const source = "scene {\n  size: (400, 300)\n\n\n\n  // only a comment\n\n  duration: 2\n}\n\n\n";
    expect(stripComments(source)).toBe("scene {\n  size: (400, 300)\n\n  duration: 2\n}\n");
  });

  it("handles CRLF line ends", () => {
    expect(stripComments("// a\r\nscene {\r\n  size: (4, 3) // b\r\n}\r\n")).toBe("scene {\n  size: (4, 3)\n}\n");
  });

  it("returns a source the lexer rejects unchanged", () => {
    const bad = 'scene { text t { content: "never closed } // x\n';
    expect(stripComments(bad)).toBe(bad);
  });
});

describe("playgroundLink", () => {
  it("keeps the full source for a scene under the ceiling", () => {
    const source = "// A note.\nscene {\n  size: (400, 300)\n  duration: 2\n  circle c { position: (200, 150), radius: 20 }\n}\n";
    const link = playgroundLink(source);
    expect(link.stripped).toBe(false);
    expect(link.url).toBe(buildShareURLFor(PLAYGROUND, source));
    expect(decoded(link.url!)).toBe(source);
  });

  it("gives a scene over the ceiling a working link built from the source without comments", () => {
    const source = overCeilingScene();
    expect(buildShareURLFor(PLAYGROUND, source)).toBeNull();
    const link = playgroundLink(source);
    expect(link.stripped).toBe(true);
    expect(link.url).not.toBeNull();
    expect(link.length).toBeLessThanOrEqual(MAX_SHARE_LENGTH);
    const text = decoded(link.url!);
    expect(text).toBe(stripComments(source));
    expect(text).toContain('"a // b, not a comment"');
    expect(text).not.toContain("trailing note");
    const original = compileSource(source);
    const shared = compileSource(text);
    expect(original.ok).toBe(true);
    expect(shared.ir).toEqual(original.ir);
  });

  it("gives no link, and the length, when even the stripped source is over the ceiling", () => {
    let source = "scene {\n  size: (1000, 1000)\n  duration: 2\n";
    for (let i = 0; i < 4000; i++) {
      source += `  circle c${i} { position: (${(i * 7919) % 1000}, ${(i * 104729) % 1000}), radius: ${(i % 50) + 1} }\n`;
    }
    source += "}\n";
    const link = playgroundLink(source);
    expect(link.url).toBeNull();
    expect(link.stripped).toBe(true);
    expect(link.length).toBeGreaterThan(MAX_SHARE_LENGTH);
  });
});

describe("every gallery scene without its comments", () => {
  const { entries } = loadGallery(repoRoot);

  it("compiles to the same scene as the commented source", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const original = compileSource(entry.source);
      const stripped = compileSource(stripComments(entry.source));
      expect(stripped.errors, entry.id).toEqual([]);
      expect(stripped.ir, entry.id).toEqual(original.ir);
    }
  });

  it("is the same for the playground's example scenes", () => {
    for (const name of ["ledges", "physics-pile"]) {
      const source = readFileSync(join(repoRoot, `src/examples/${name}.marey`), "utf8");
      expect(compileSource(stripComments(source)).ir, name).toEqual(compileSource(source).ir);
    }
  });
});
