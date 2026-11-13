import { describe, expect, it } from "vitest";
import type { CompilerError } from "../../src/compiler/types";
import { applyTab, errorLocations, lineCount } from "./editor";

describe("applyTab", () => {
  it("inserts two spaces at a single caret", () => {
    expect(applyTab("ab", 1, 1, false)).toEqual({ value: "a  b", start: 3, end: 3 });
  });

  it("indents every line a selection touches", () => {
    const out = applyTab("a\nb\nc", 0, 3, false);
    expect(out.value).toBe("  a\n  b\nc");
    expect(out.start).toBe(2);
    expect(out.end).toBe(7);
  });

  it("leaves a line alone when the selection ends at its very start", () => {
    expect(applyTab("a\nb", 0, 2, false).value).toBe("  a\nb");
  });

  it("does not indent blank lines inside a selection", () => {
    expect(applyTab("a\n\nb", 0, 4, false).value).toBe("  a\n\n  b");
  });

  it("removes up to two leading spaces per line on outdent", () => {
    const out = applyTab("    a\n b\nc", 0, 9, true);
    expect(out.value).toBe("  a\nb\nc");
  });

  it("outdents the caret's line and keeps the caret on the same text", () => {
    expect(applyTab("  ab", 4, 4, true)).toEqual({ value: "ab", start: 2, end: 2 });
  });

  it("does not move the caret before the line when it sat inside the removed spaces", () => {
    expect(applyTab("  ab", 1, 1, true)).toEqual({ value: "ab", start: 0, end: 0 });
  });

  it("does nothing to a line with no leading spaces", () => {
    expect(applyTab("ab", 1, 1, true)).toEqual({ value: "ab", start: 1, end: 1 });
  });
});

describe("errorLocations", () => {
  const err = (message: string, line?: number, col?: number): CompilerError => ({ phase: "TYPE", message, line, col });

  it("sorts by line, then column", () => {
    const out = errorLocations([err("c", 3, 1), err("b", 1, 9), err("a", 1, 2)]);
    expect(out.map((e) => e.message)).toEqual(["a", "b", "c"]);
  });

  it("lists errors with no line last, with no location", () => {
    const out = errorLocations([err("none"), err("later", 9, 1), err("first", 2, 4)]);
    expect(out.map((e) => e.message)).toEqual(["first", "later", "none"]);
    expect(out[2]).toEqual({ line: 0, col: 0, message: "none" });
  });

  it("gives a missing column as 1", () => {
    expect(errorLocations([err("x", 4)])).toEqual([{ line: 4, col: 1, message: "x" }]);
  });

  it("keeps the order of two errors at the same place", () => {
    const out = errorLocations([err("one", 2, 2), err("two", 2, 2)]);
    expect(out.map((e) => e.message)).toEqual(["one", "two"]);
  });
});

describe("lineCount", () => {
  it("counts the lines of the text, at least one", () => {
    expect(lineCount("")).toBe(1);
    expect(lineCount("a\nb")).toBe(2);
    expect(lineCount("a\n")).toBe(2);
  });
});
