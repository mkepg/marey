import { describe, expect, it } from "vitest";
import { propertyHoverMarkdown, physicsSnippet } from "./constants";

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
});
