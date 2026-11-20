import { describe, expect, it } from "vitest";
import { SECTION_LABELS } from "../../../site/build/layout";
import { SITE_LINKS } from "./siteLinks";

describe("the top bar's links to the documentation site", () => {
  it("are the site header's sections, in its order and with its labels, so they sit in the same places", () => {
    const site = Object.entries(SECTION_LABELS).map(([key, label]) => ({ href: `/${key}/`, label }));
    expect(SITE_LINKS.map(({ href, label }) => ({ href, label }))).toEqual(site);
  });
});
