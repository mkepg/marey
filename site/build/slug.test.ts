import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lower-cases and joins words with hyphens", () => {
    expect(slugify("Animating colour", new Map())).toBe("animating-colour");
  });

  it("drops punctuation, including the backticks of inline code", () => {
    expect(slugify("`handoff`", new Map())).toBe("handoff");
    expect(slugify("What is a scene?", new Map())).toBe("what-is-a-scene");
  });

  it("keeps existing hyphens and digits", () => {
    expect(slugify("Ease-in 2", new Map())).toBe("ease-in-2");
  });

  it("numbers repeats on one page", () => {
    const seen = new Map<string, number>();
    expect(slugify("Properties", seen)).toBe("properties");
    expect(slugify("Properties", seen)).toBe("properties-1");
    expect(slugify("Properties", seen)).toBe("properties-2");
  });

  it("does not hand out an id a heading already took", () => {
    const seen = new Map<string, number>();
    expect(slugify("A", seen)).toBe("a");
    expect(slugify("A 1", seen)).toBe("a-1");
    expect(slugify("A", seen)).toBe("a-2");
  });
});
