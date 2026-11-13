import { describe, expect, it } from "vitest";
import { parseFrontMatter } from "./frontMatter";

const doc = (...lines: string[]) => lines.join("\n");

describe("parseFrontMatter", () => {
  it("reads strings and lists, and reports where the body starts", () => {
    const fm = parseFrontMatter(
      doc("---", "title: Animate: easing", "minutes: 12", "learn:", "- one", "- two words", "---", "", "# Body"),
      "a.md",
    );
    expect(fm.data).toEqual({ title: "Animate: easing", minutes: "12", learn: ["one", "two words"] });
    expect(fm.body).toBe("\n# Body");
    expect(fm.bodyLine).toBe(8);
  });

  it("treats a file with no opening --- as all body", () => {
    const fm = parseFrontMatter("# Just text", "a.md");
    expect(fm.data).toEqual({});
    expect(fm.body).toBe("# Just text");
    expect(fm.bodyLine).toBe(1);
  });

  it("reads CRLF files", () => {
    const fm = parseFrontMatter("---\r\ntitle: A\r\n---\r\nbody", "a.md");
    expect(fm.data).toEqual({ title: "A" });
    expect(fm.body).toBe("body");
  });

  it("rejects a nested map with its file and line", () => {
    expect(() => parseFrontMatter(doc("---", "a:", "  b: c", "---"), "x.md")).toThrow(/^x\.md:3: /);
  });

  it("rejects a missing closing --- with its file and line", () => {
    expect(() => parseFrontMatter(doc("---", "title: A", "more: B"), "x.md")).toThrow(/^x\.md:3: .*never closed/);
  });

  it("rejects a duplicate key with its file and line", () => {
    expect(() => parseFrontMatter(doc("---", "title: A", "title: B", "---"), "x.md")).toThrow(
      /^x\.md:3: duplicate key "title"/,
    );
  });

  it("rejects a line that is neither a pair nor an item", () => {
    expect(() => parseFrontMatter(doc("---", "just words", "---"), "x.md")).toThrow(/^x\.md:2: /);
  });

  it("rejects a list item with no key above it", () => {
    expect(() => parseFrontMatter(doc("---", "- orphan", "---"), "x.md")).toThrow(/^x\.md:2: /);
  });
});
