import { escapeHtml as esc } from "./escape";
import type { Heading, Section } from "./types";

export const ORIGIN = "https://marey.pages.dev";
const REPO = "https://github.com/mkepg/marey";
const NPM = "https://www.npmjs.com/package/marey-lang";

export interface SidebarItem {
  readonly href: string;
  readonly title: string;
  /** A lesson's number, shown before its title. */
  readonly number?: number;
}

export interface NavLink {
  readonly href: string;
  readonly title: string;
}

export interface Crumb {
  readonly title: string;
  /** Absent on the last crumb, which is the current page. */
  readonly href?: string;
}

export interface LayoutInput {
  readonly section: Section;
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly bodyHtml: string;
  readonly headings: ReadonlyArray<Heading>;
  readonly sidebar: ReadonlyArray<SidebarItem>;
  readonly prev: NavLink | null;
  readonly next: NavLink | null;
  readonly breadcrumb: ReadonlyArray<Crumb>;
}

export const SECTION_LABELS: Readonly<Record<Exclude<Section, "root">, string>> = {
  learn: "Learn",
  guides: "Guides",
  gallery: "Gallery",
  reference: "Reference",
};

const NOT_FOUND_URL = "/404.html";

/** Runs before any stylesheet, so a stored theme never flashes the other one. */
const THEME_SCRIPT =
  `try{var t=localStorage.getItem("marey_theme");` +
  `if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

function documentTitle(input: LayoutInput): string {
  if (input.section === "root" || input.url === `/${input.section}/`) {
    return `${input.title} · Marey`;
  }
  return `${input.title} · ${SECTION_LABELS[input.section]} Marey`;
}

function topNav(section: Section): string {
  const links = (Object.keys(SECTION_LABELS) as Array<keyof typeof SECTION_LABELS>)
    .map((key) => {
      const current = key === section ? ' aria-current="true"' : "";
      return `<a href="/${key}/"${current}>${SECTION_LABELS[key]}</a>`;
    })
    .join("");
  return `<nav class="site-nav" aria-label="Sections">${links}<a href="/">Playground</a></nav>`;
}

function sidebarNav(input: LayoutInput): string {
  if (input.sidebar.length === 0) return "";
  const label = input.section === "root" ? "Pages" : SECTION_LABELS[input.section];
  const items = input.sidebar
    .map((item) => {
      const current = item.href === input.url ? ' aria-current="page"' : "";
      const number = item.number === undefined ? "" : `<span class="num">${item.number}</span> `;
      return `<li><a href="${esc(item.href)}"${current}>${number}${esc(item.title)}</a></li>`;
    })
    .join("");
  return `<nav class="sidebar" id="sidebar" aria-label="${esc(label)} pages"><ol>${items}</ol></nav>`;
}

function breadcrumbNav(crumbs: ReadonlyArray<Crumb>): string {
  if (crumbs.length === 0) return "";
  const items = crumbs
    .map((crumb) =>
      crumb.href === undefined
        ? `<li aria-current="page">${esc(crumb.title)}</li>`
        : `<li><a href="${esc(crumb.href)}">${esc(crumb.title)}</a></li>`,
    )
    .join("");
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><ol>${items}</ol></nav>`;
}

function pager(prev: NavLink | null, next: NavLink | null): string {
  if (!prev && !next) return "";
  const side = (link: NavLink | null, rel: "prev" | "next", word: string) =>
    link
      ? `<a class="pager-${rel}" rel="${rel}" href="${esc(link.href)}"><span class="pager-label">${word}</span> ${esc(link.title)}</a>`
      : "";
  return `<nav class="pager" aria-label="Previous and next pages">${side(prev, "prev", "Previous")}${side(next, "next", "Next")}</nav>`;
}

function toc(headings: ReadonlyArray<Heading>): string {
  if (headings.length === 0) return "";
  const items = headings
    .map((h) => `<li class="toc-${h.depth}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`)
    .join("");
  return `<aside class="toc" aria-label="On this page"><h2 class="toc-title">On this page</h2><ol>${items}</ol></aside>`;
}

/** The complete HTML document for one page. Every string passes through `esc`. */
export function renderLayout(input: LayoutInput): string {
  const title = esc(documentTitle(input));
  const description = esc(input.description);
  const canonical = `${ORIGIN}${input.url}`;
  const indexed = input.url !== NOT_FOUND_URL;
  const sidebar = sidebarNav(input);
  const shellClass = sidebar === "" ? "shell no-sidebar" : "shell";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script>${THEME_SCRIPT}</script>
    <title>${title}</title>
    <meta name="description" content="${description}" />
${indexed ? `    <link rel="canonical" href="${esc(canonical)}" />\n` : `    <meta name="robots" content="noindex" />\n`}    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#16171a" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#fbfcfa" media="(prefers-color-scheme: light)" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Marey" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:title" content="${esc(input.title)}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${ORIGIN}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(input.title)}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ORIGIN}/og-image.png" />
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to main content</a>
    <header class="site-header">
      <a class="wordmark" href="/learn/">Marey</a>
      ${topNav(input.section)}
      <a class="header-link" href="${REPO}">GitHub</a>
    </header>
    <div class="${shellClass}">
      ${sidebar}
      <main id="main" tabindex="-1">
        ${breadcrumbNav(input.breadcrumb)}
        <h1>${esc(input.title)}</h1>
        <div class="content">
${input.bodyHtml}
        </div>
        ${pager(input.prev, input.next)}
      </main>
      ${toc(input.headings)}
    </div>
    <footer class="site-footer">
      <nav aria-label="Project">
        <a href="${REPO}">GitHub</a>
        <a href="${NPM}">npm</a>
        <a href="${REPO}/blob/main/LICENSE">MIT licence</a>
        <a href="/third-party-licenses.txt">Third-party licences</a>
      </nav>
    </footer>
    <script type="module" src="/site/client/main.ts"></script>
  </body>
</html>
`;
}
