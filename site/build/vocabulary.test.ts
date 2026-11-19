import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KEYWORDS } from "../../src/compiler/lexer";
import {
  BOOLEAN_VALUES,
  DURATION_VALUES,
  EASING_VALUES,
  EDGE_VALUES,
  FIT_VALUES,
  LANGUAGE_CONTRACT,
} from "../../src/compiler/languageContract";
import { loadGallery } from "./gallery";
import { parseFrontMatter } from "./frontMatter";
import { parseSiteConfig } from "./siteConfig";
import { showcaseVocabularyProblems, vocabularyOf, vocabularyUses } from "./vocabulary";

const repoRoot = resolve(import.meta.dirname, "../..");

describe("vocabularyOf", () => {
  it("collects keywords, shape kinds, property names and keyword values", () => {
    const words = vocabularyOf(
      [
        "scene {",
        "  size: (400, 300)",
        "  fit: cover",
        "  circle dot {",
        "    position: (10, 10), radius: 4, color: red",
        "    animate { property: position, to: (20, 10), duration: 1, easing: linear, loop: true }",
        "  }",
        "}",
      ].join("\n"),
    );
    expect([...words].sort()).toEqual(
      ["animate", "circle", "color", "cover", "duration", "easing", "fit", "linear", "loop", "position", "property", "radius", "scene", "size", "to", "true"].sort(),
    );
  });

  it("finds generate, in and the expression words", () => {
    const words = vocabularyOf(
      "let xs = [1, 2]\nscene {\n  size: (100, 100)\n  generate x, i in xs {\n    circle c { position: (x * 10, if i > 0 then 5 else cos(0)), radius: 2 }\n  }\n}\n",
    );
    expect(words.has("generate")).toBe(true);
    for (const w of ["let", "in", "if", "then", "else", "cos"]) expect(words.has(w), w).toBe(true);
  });

  it("counts the animated property a property: names, and the edges of a bounds list", () => {
    const words = vocabularyOf(
      "scene {\n  size: (100, 100)\n  world { bounds: [left, bottom] }\n  rectangle r { position: (5, 5), size: (2, 2)\n    animate { property: scale, to: 2, duration: 1 } }\n}\n",
    );
    for (const w of ["world", "bounds", "left", "bottom", "scale"]) expect(words.has(w), w).toBe(true);
    expect(words.has("right")).toBe(false);
  });

  it("ignores names, strings, comments and colours", () => {
    const words = vocabularyOf(
      '// generate a loop\nscene {\n  size: (100, 100)\n  text easing { position: (5, 5), content: "physics generate", color: cyan }\n}\n',
    );
    for (const w of ["generate", "physics", "loop", "easing", "cyan"]) expect(words.has(w), w).toBe(false);
  });

  it("gives each use with its line", () => {
    const uses = vocabularyUses("scene {\n  size: (10, 10)\n\n  circle c { position: (1, 1), radius: 1 }\n}\n");
    expect(uses).toContainEqual({ word: "circle", line: 4 });
    expect(uses).toContainEqual({ word: "size", line: 2 });
  });
});

describe("showcaseVocabularyProblems", () => {
  const lessons = [
    { slug: "one", vocabulary: ["scene", "size", "duration", "circle", "position", "radius", "animate", "property", "to"] },
    { slug: "two", vocabulary: ["rectangle"] },
    { slug: "three", vocabulary: ["easing", "linear"] },
  ];

  it("passes a showcase that uses only its own and earlier lessons' words", () => {
    const source = "scene {\n  size: (10, 10)\n  duration: 1\n  rectangle r { position: (1, 1), size: (2, 2) }\n}\n";
    expect(showcaseVocabularyProblems(lessons, [{ lesson: "two", file: "s.marey", source }])).toEqual([]);
  });

  it("names the lesson, the word, its line and the lesson that teaches it", () => {
    const source = "scene {\n  size: (10, 10)\n  circle c { position: (1, 1), radius: 1\n    animate { property: position, to: (2, 2), duration: 1, easing: linear } }\n}\n";
    expect(showcaseVocabularyProblems(lessons, [{ lesson: "one", file: "s.marey", source }])).toEqual([
      's.marey:4: the showcase of lesson 1 (one) uses "easing", which lesson 3 (three) introduces',
      's.marey:4: the showcase of lesson 1 (one) uses "linear", which lesson 3 (three) introduces',
    ]);
  });

  it("reports a word no lesson introduces", () => {
    const source = "scene {\n  size: (10, 10)\n  group g { }\n}\n";
    expect(showcaseVocabularyProblems(lessons, [{ lesson: "three", file: "s.marey", source }])).toEqual([
      's.marey:3: the showcase of lesson 3 (three) uses "group", which no lesson introduces',
    ]);
  });

  it("reports each word once, at its first line", () => {
    const source = "scene {\n  size: (10, 10)\n  rectangle a { position: (1, 1), size: (2, 2) }\n  rectangle b { position: (1, 1), size: (2, 2) }\n}\n";
    expect(showcaseVocabularyProblems(lessons, [{ lesson: "one", file: "s.marey", source }])).toEqual([
      's.marey:3: the showcase of lesson 1 (one) uses "rectangle", which lesson 2 (two) introduces',
    ]);
  });
});

describe("lesson vocabulary in the repository", () => {
  const config = parseSiteConfig(JSON.parse(readFileSync(join(repoRoot, "site/site.json"), "utf8")), "site/site.json").config;
  const gallery = loadGallery(repoRoot);

  it("lists the course's fourteen lessons in order, each with the vocabulary it introduces", () => {
    expect(config.learn).toEqual([
      { slug: "first-scene", vocabulary: ["scene", "size", "background", "duration", "circle", "rectangle", "position", "radius", "color", "animate", "property", "to"] },
      { slug: "shapes", vocabulary: ["polygon", "line", "text", "points", "thickness", "content", "fontSize", "alpha", "rotation", "origin", "layer", "fit", "contain", "cover", "fill", "none"] },
      { slug: "animate", vocabulary: ["easing", "linear", "easeIn", "easeOut", "easeInOut", "scale"] },
      { slug: "timing", vocabulary: ["loop", "yoyo", "delay", "true", "false"] },
      { slug: "groups", vocabulary: ["group"] },
      { slug: "sequence", vocabulary: ["sequence", "parallel"] },
      { slug: "colour", vocabulary: [] },
      { slug: "values", vocabulary: ["let", "if", "then", "else", "and", "or", "not", "sin", "cos", "length"] },
      { slug: "generate", vocabulary: ["generate", "in"] },
      { slug: "templates", vocabulary: ["template", "use"] },
      { slug: "physics", vocabulary: ["physics", "gravity", "velocity", "bounce", "airDrag", "collideBounds", "indefinitely"] },
      { slug: "world", vocabulary: ["world", "bounds", "lockPosition", "lockRotation", "spin", "left", "right", "top", "bottom"] },
      { slug: "handoff", vocabulary: ["handoff"] },
      { slug: "ship-it", vocabulary: [] },
    ]);
  });

  it("lists only words of the language, each introduced by one lesson", () => {
    const known = new Set<string>([
      ...KEYWORDS,
      "in", "to", "if", "then", "else", "and", "or", "not", "sin", "cos", "length",
      ...FIT_VALUES,
      ...BOOLEAN_VALUES,
      ...EASING_VALUES,
      ...DURATION_VALUES,
      ...EDGE_VALUES,
      ...Object.values(LANGUAGE_CONTRACT).flatMap((kind) => Object.keys(kind.properties)),
    ]);
    const seen = new Map<string, string>();
    for (const lesson of config.learn) {
      for (const word of lesson.vocabulary) {
        expect(known.has(word), `${lesson.slug}: "${word}"`).toBe(true);
        expect(seen.get(word), `"${word}" in ${lesson.slug}`).toBeUndefined();
        seen.set(word, lesson.slug);
      }
    }
  });

  it("keeps every lesson's showcase to the words of that lesson and the ones before it", () => {
    const showcases = config.learn.flatMap((lesson) => {
      const file = `site/content/learn/${lesson.slug}.md`;
      const id = parseFrontMatter(readFileSync(join(repoRoot, file), "utf8"), file).data.showcase;
      if (typeof id !== "string") return [];
      const entry = gallery.entries.find((e) => e.id === id);
      expect(entry, `${lesson.slug}'s showcase "${id}"`).toBeDefined();
      return entry ? [{ lesson: lesson.slug, file: entry.sourcePath, source: entry.source }] : [];
    });
    expect(showcaseVocabularyProblems(config.learn, showcases)).toEqual([]);
  });
});
