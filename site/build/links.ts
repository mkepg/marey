import type { SitePage } from "./types";

/** What `checkLinks` needs to know about a page. */
export type LinkablePage = Pick<SitePage, "url" | "headings" | "links">;

/**
 * Root-relative targets that are not generated pages but are real: the
 * playground, and the files the build writes beside the pages.
 */
export const NON_PAGE_TARGETS: ReadonlySet<string> = new Set([
  "/",
  "/sitemap.xml",
  "/search-index.json",
  "/third-party-licenses.txt",
]);

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Checks every link a page's body makes. Site pages are linked by
 * root-relative path (`/learn/animate/`, `/reference/language/#handoff`);
 * a link to a page that does not exist, an anchor that is not a heading id
 * on its page, or a relative path is reported as `file:line: message`.
 * Absolute URLs (`https:`, `mailto:`) are left alone.
 */
export function checkLinks(
  pages: ReadonlyArray<LinkablePage>,
  nonPageTargets: ReadonlySet<string> = NON_PAGE_TARGETS,
): string[] {
  const byUrl = new Map(pages.map((page) => [page.url, page]));
  const errors: string[] = [];
  for (const page of pages) {
    for (const link of page.links) {
      const where = `${link.file}:${link.line}`;
      const href = link.href;
      if (EXTERNAL.test(href)) continue;

      const hashAt = href.indexOf("#");
      const beforeHash = hashAt < 0 ? href : href.slice(0, hashAt);
      const fragment = hashAt < 0 ? null : decode(href.slice(hashAt + 1));
      const path = beforeHash.split("?")[0];

      let target: LinkablePage | undefined;
      if (path === "") {
        target = page;
      } else if (!path.startsWith("/")) {
        errors.push(`${where}: "${href}" is a relative link; write site links as root-relative paths such as /learn/animate/`);
        continue;
      } else if (nonPageTargets.has(path)) {
        continue;
      } else {
        target = byUrl.get(path);
        if (!target) {
          errors.push(`${where}: "${href}" links to a page that does not exist`);
          continue;
        }
      }
      if (fragment !== null && fragment !== "" && !target.headings.some((h) => h.id === fragment)) {
        errors.push(`${where}: "${href}" links to an anchor that is not a heading on ${target.url}`);
      }
    }
  }
  return errors;
}
