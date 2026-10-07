import { describe, it, expect } from "vitest";
import readme from "../README.md?raw";
import barsScene from "../docs/media/bars-reveal.marey?raw";

// The README's first image is exported from docs/media/bars-reveal.marey,
// and the README shows that file's source. If the two drift, the image no
// longer shows the code beside it (engineering-lessons §5).

const FIRST_MAREY_BLOCK = /```marey\r?\n([\s\S]*?)```/;

// The embed itself, as an HTML <img> or a markdown image. A bare path match is
// not enough: the regenerate command's `--out docs/media/bars-reveal.png` also
// precedes the code block, so it would keep the test green with the image gone.
const IMAGE_EMBED =
  /<img\b[^>]*\bsrc=["']docs\/media\/bars-reveal\.png["']|!\[[^\]]*\]\(docs\/media\/bars-reveal\.png[\s)]/;

describe("README media", () => {
  it("the README's first marey block is exactly docs/media/bars-reveal.marey", () => {
    const match = readme.match(FIRST_MAREY_BLOCK);
    if (match === null) throw new Error("README.md has no ```marey code block");
    expect(match[1].replace(/\r\n/g, "\n")).toBe(barsScene.replace(/\r\n/g, "\n"));
  });
  it("the README embeds the exported image before its first marey block", () => {
    const block = readme.search(FIRST_MAREY_BLOCK);
    expect(block, "README.md has no ```marey code block").toBeGreaterThan(-1);
    const img = readme.search(IMAGE_EMBED);
    expect(img, "README.md does not embed docs/media/bars-reveal.png").toBeGreaterThan(-1);
    expect(img, "the image embed comes after the first ```marey block").toBeLessThan(block);
  });
});
