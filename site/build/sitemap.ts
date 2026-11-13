import { escapeHtml } from "./escape";
import type { SitePage } from "./types";

/**
 * The sitemap: the playground at `/` and every generated page, except the
 * 404 page. `origin` carries no trailing slash.
 */
export function buildSitemap(pages: ReadonlyArray<Pick<SitePage, "url">>, origin: string): string {
  const urls = ["/", ...pages.map((p) => p.url).filter((url) => url !== "/404.html")];
  const entries = urls
    .map((url) => `  <url>\n    <loc>${escapeHtml(origin + url)}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}
