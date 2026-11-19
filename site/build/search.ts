import type { SitePage } from "./types";

export interface SearchEntry {
  readonly url: string;
  readonly section: SitePage["section"];
  readonly title: string;
  readonly description: string;
  readonly headings: SitePage["headings"];
  readonly text: string;
}

/** The client's search index, as JSON: one entry per page except the 404 page. */
export function buildSearchIndex(
  pages: ReadonlyArray<Pick<SitePage, "url" | "section" | "title" | "description" | "headings" | "text">>,
): string {
  const entries: SearchEntry[] = pages
    .filter((page) => page.url !== "/404.html")
    .map((page) => ({
      url: page.url,
      section: page.section,
      title: page.title,
      description: page.description,
      headings: page.headings,
      text: page.text,
    }));
  return JSON.stringify(entries);
}
