import { describe, expect, it } from "vitest";
import { KEYWORD_DOCS, propertyHoverMarkdown, physicsSnippet, TOKENIZER_KEYWORDS, worldSnippet } from "./constants";
import { PROP_TYPES } from "../../../compiler/languageContract";
import { sequenceSnippet } from "./language";
import { analyzeContext } from "./scanner";

describe("Marey editor guidance", () => {
  it("describes bounce as shared-world collision behavior", () => {
    const hover = propertyHoverMarkdown("bounce")!;
    expect(hover).toContain("other objects");
    expect(hover).toContain("scene boundaries");
    expect(hover).toContain("higher");
  });

  it("uses light drag in physics snippets", () => {
    expect(physicsSnippet(false)).toContain("airDrag: ${4:0.006}");
    expect(physicsSnippet(true)).toContain("airDrag: ${3:0.006}");
    expect(physicsSnippet(false)).not.toContain("0.99");
  });

  it("preserves macro scopes in editor context analysis", () => {
    expect(analyzeContext("template Foo(x) {").at(-1)?.blockType).toBe("template");
    expect(analyzeContext("use Foo() instance {").at(-1)?.blockType).toBe("use");
  });

  it("names a '[...]' binding by the language's one list kind", () => {
    // The scanner's kind strings are what a completion shows as
    // "Variable (<kind>)" (language.ts), so they must spell the same kinds the
    // compiler does. Phase 3B folded `pointList` into `list`; nothing else in
    // the suite reads this value, so reverting the scanner alone stayed green.
    expect(analyzeContext("let tri = [(0,0), (10,0), (5,10)]").at(-1)?.vars.tri).toBe("list");
    expect(analyzeContext("let p = (1, 2)").at(-1)?.vars.p).toBe("point");
  });

  it("keeps nested tab stops in the sequence completion snippet", () => {
    expect(sequenceSnippet()).toContain("duration: ${2:1.0}");
  });

  it("gives position a block-specific hover instead of always the first block that declares it", () => {
    // LANGUAGE_CONTRACT declares circle before polygon/line/group, so a
    // first-appearance lookup with no block context always shows circle's
    // "geometric center" wording — wrong for polygon/line (D15's bbox
    // midpoint) and wrong for group (D16's local origin). A block-aware
    // lookup must resolve each correctly.
    expect(propertyHoverMarkdown("position", "circle")!).toContain("geometric center");
    expect(propertyHoverMarkdown("position", "polygon")!).toContain("bounding");
    expect(propertyHoverMarkdown("position", "line")!).toContain("bounding");
    expect(propertyHoverMarkdown("position", "group")!).toContain("local origin");
  });

  it("falls back to first-appearance lookup when no block context is available", () => {
    expect(propertyHoverMarkdown("position")).toBeDefined();
  });

  it("describes gravity as a per-tick simulation input, not applied each frame", () => {
    const hover = propertyHoverMarkdown("gravity", "physics")!;
    expect(hover.toLowerCase()).toContain("tick");
    expect(hover.toLowerCase()).not.toContain("applied each frame");
  });

  it("derives the tokenizer keywords from the lexer, so a new block cannot be missed", () => {
    expect(TOKENIZER_KEYWORDS).toContain("world");
    expect(TOKENIZER_KEYWORDS).toContain("physics");
    expect(TOKENIZER_KEYWORDS).toContain("generate");
    expect(TOKENIZER_KEYWORDS).not.toContain("let");
  });

  it("offers world at scene level, with its properties and docs from the contract", () => {
    expect(worldSnippet()).toBe("world {\n\tgravity: ${1:(0, 980)}\n\tbounds: ${2:[left, right, bottom]}\n}");
    expect(analyzeContext("scene { world {").at(-1)?.blockType).toBe("world");
    expect(Object.keys(PROP_TYPES.world)).toEqual(["gravity", "bounds"]);
    expect(KEYWORD_DOCS.world).toContain("which scene edges are walls");
    expect(KEYWORD_DOCS.world).toContain("`gravity | bounds`");
  });

  it("hovers the new physics properties from the contract", () => {
    expect(propertyHoverMarkdown("lockPosition", "physics")!).toContain("lockPosition");
    expect(propertyHoverMarkdown("lockRotation", "physics")!).toContain("lockRotation");
    expect(propertyHoverMarkdown("spin", "physics")!).toContain("spin");
    expect(propertyHoverMarkdown("bounds", "world")!).toContain("wall");
  });
});
