import { describe, expect, it } from "vitest";
import { propertyHoverMarkdown, physicsSnippet } from "./constants";
import { sequenceSnippet } from "./language";
import { analyzeContext } from "./scanner";

describe("Declare editor guidance", () => {
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

  it("keeps nested tab stops in the sequence completion snippet", () => {
    expect(sequenceSnippet()).toContain("duration: ${2:1.0}");
  });
});
