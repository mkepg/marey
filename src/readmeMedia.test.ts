import { describe, it, expect } from "vitest";
import readme from "../README.md?raw";
import barsScene from "../docs/media/bars-reveal.marey?raw";

// The README's first image is exported from docs/media/bars-reveal.marey,
// and the README shows that file's source. If the two drift, the image no
// longer shows the code beside it (engineering-lessons §5).
describe("README media", () => {
  it("the README's first marey block is exactly docs/media/bars-reveal.marey", () => {
    const block = readme.match(/```marey\r?\n([\s\S]*?)```/)![1];
    expect(block.replace(/\r\n/g, "\n")).toBe(barsScene.replace(/\r\n/g, "\n"));
  });
  it("the README embeds the exported image before its first marey block", () => {
    const img = readme.indexOf("docs/media/bars-reveal.png");
    expect(img).toBeGreaterThan(-1);
    expect(img).toBeLessThan(readme.indexOf("```marey"));
  });
});
