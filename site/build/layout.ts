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
  /** True when `bodyHtml` carries the page's h1 itself (the course's front page, whose hero holds it). */
  readonly pageHeading?: boolean;
}

export const SECTION_LABELS: Readonly<Record<Exclude<Section, "root">, string>> = {
  learn: "Learn",
  guides: "Guides",
  gallery: "Gallery",
  reference: "Reference",
};

/** What the drawer button says on each section's pages. */
const SIDEBAR_BUTTON: Readonly<Record<Exclude<Section, "root">, string>> = {
  learn: "All lessons",
  guides: "All guides",
  gallery: "All scenes",
  reference: "All reference pages",
};

const NOT_FOUND_URL = "/404.html";

/**
 * The course's front page. It lists every lesson as a card, so it drops the
 * sidebar and the "On this page" lists and gives the content the full width.
 */
const FRONT_URL = "/learn/";

/**
 * When the browser skips a cross-document view transition, the transition's
 * `ready` promise rejects with an AbortError ("Transition was skipped"). On
 * the page it reaches, Chromium can reject it before `pagereveal` hands the
 * page the transition, so there is no promise to attach a handler to; the
 * rejection would be an uncaught error in the reader's console. This marks
 * that one rejection as handled and lets every other one through. The
 * playground's index.html runs the same text.
 */
export const VIEW_TRANSITION_SCRIPT =
  `addEventListener("unhandledrejection",function(e){var r=e.reason;` +
  `r&&r.name==="AbortError"&&/transition/i.test(r.message)&&e.preventDefault()});`;

/**
 * Runs before any stylesheet, so a stored theme never flashes the other one.
 * It also marks the document as scripted: the drawer and the menu button take
 * over from the plain layout only when the script that drives them will run.
 */
const THEME_SCRIPT =
  `document.documentElement.classList.add("js");` +
  `try{var t=localStorage.getItem("marey_theme");` +
  `if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}` +
  VIEW_TRANSITION_SCRIPT;

/**
 * The brand mark: the favicon itself, drawn at 24 px beside the wordmark, as
 * the playground's top bar draws it. As an image the SVG sizes its own
 * details (its small-size rule applies at this size), which an inline copy
 * could not do.
 */
const MARK = '<img class="wordmark-mark" src="/favicon.svg" width="24" height="24" alt="" />';

const ICON = 'viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"';
const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  search: `<svg ${ICON}><circle cx="8.5" cy="8.5" r="5.75" ${STROKE}/><path d="m13 13 4.5 4.5" ${STROKE}/></svg>`,
  system: `<svg class="icon-system" ${ICON}><circle cx="10" cy="10" r="6.75" ${STROKE}/><path d="M10 3.25a6.75 6.75 0 0 1 0 13.5Z" fill="currentColor"/></svg>`,
  light:
    `<svg class="icon-light" ${ICON}><circle cx="10" cy="10" r="3.6" ${STROKE}/>` +
    `<path d="M10 1.75v2.1M10 16.15v2.1M1.75 10h2.1M16.15 10h2.1M4.17 4.17l1.48 1.48M14.35 14.35l1.48 1.48M4.17 15.83l1.48-1.48M14.35 5.65l1.48-1.48" ${STROKE}/></svg>`,
  dark: `<svg class="icon-dark" ${ICON}><path d="M16.5 12.6A7 7 0 0 1 7.4 3.5a7 7 0 1 0 9.1 9.1Z" ${STROKE}/></svg>`,
  github:
    `<svg ${ICON}><path fill="currentColor" d="M10 1.5a8.5 8.5 0 0 0-2.69 16.57c.43.08.58-.18.58-.41v-1.45c-2.37.51-2.87-1.14-2.87-1.14-.39-.98-.95-1.24-.95-1.24-.77-.53.06-.52.06-.52.85.06 1.3.88 1.3.88.76 1.3 1.99.92 2.47.71.08-.55.3-.92.54-1.13-1.89-.21-3.88-.94-3.88-4.2 0-.93.33-1.69.88-2.28-.09-.22-.38-1.08.08-2.25 0 0 .72-.23 2.34.87a8.1 8.1 0 0 1 4.26 0c1.62-1.1 2.34-.87 2.34-.87.46 1.17.17 2.03.08 2.25.55.59.88 1.35.88 2.28 0 3.27-2 3.99-3.89 4.2.31.26.58.78.58 1.57v2.33c0 .23.15.5.59.41A8.5 8.5 0 0 0 10 1.5Z"/></svg>`,
  menu: `<svg ${ICON}><path d="M3.5 6h13M3.5 10h13M3.5 14h13" ${STROKE}/></svg>`,
  sidebar: `<svg ${ICON}><rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2" ${STROKE}/><path d="M7.75 4v12" ${STROKE}/></svg>`,
  close: `<svg ${ICON}><path d="m5 5 10 10M15 5 5 15" ${STROKE}/></svg>`,
};

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
      return `<a href="/${key}/" data-label="${SECTION_LABELS[key]}"${current}>${SECTION_LABELS[key]}</a>`;
    })
    .join("");
  return `<nav class="site-nav" id="site-nav" aria-label="Sections">${links}<a class="nav-playground" href="/" data-label="Playground">Playground</a></nav>`;
}

/** The last path segment of a lesson's address, which the client keys finished lessons by. */
function lessonSlug(href: string): string {
  return href.split("/").filter((part) => part !== "").pop() ?? "";
}

function sidebarNav(input: LayoutInput): string {
  if (input.sidebar.length === 0) return "";
  const label = input.section === "root" ? "Pages" : SECTION_LABELS[input.section];
  const course = input.sidebar.some((item) => item.number !== undefined);
  const items = input.sidebar
    .map((item) => {
      const current = item.href === input.url ? ' aria-current="page"' : "";
      if (item.number === undefined) {
        return `<li><a href="${esc(item.href)}"${current}>${esc(item.title)}</a></li>`;
      }
      return (
        `<li class="lesson-item" data-lesson="${esc(lessonSlug(item.href))}"><a href="${esc(item.href)}"${current}>` +
        `<span class="num" aria-hidden="true">${item.number}</span>` +
        `<span class="visually-hidden">Lesson ${item.number}: </span>${esc(item.title)}` +
        `<span class="lesson-status visually-hidden"></span></a></li>`
      );
    })
    .join("");
  return (
    `<nav class="sidebar" id="sidebar" aria-label="${esc(label)} pages">` +
    `<div class="sidebar-head"><span class="sidebar-title">${esc(label)}</span>` +
    `<button class="drawer-close" type="button" aria-label="Close the page list">${ICONS.close}</button></div>` +
    `<ol class="sidebar-list${course ? " is-course" : ""}">${items}</ol></nav>`
  );
}

/** Opens the sidebar as a drawer below 1100 px; hidden until the script that drives it runs. */
function sidebarButton(input: LayoutInput): string {
  if (input.sidebar.length === 0 || input.section === "root") return "";
  return (
    `<button class="sidebar-toggle" type="button" aria-controls="sidebar" aria-expanded="false" hidden>` +
    `${ICONS.sidebar}<span>${SIDEBAR_BUTTON[input.section]}</span></button>`
  );
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
      ? `<a class="pager-${rel}" rel="${rel}" href="${esc(link.href)}"><span class="pager-label">${word}</span> <span class="pager-title">${esc(link.title)}</span></a>`
      : "";
  return `<nav class="pager" aria-label="Previous and next pages">${side(prev, "prev", "Previous")}${side(next, "next", "Next")}</nav>`;
}

function tocItems(headings: ReadonlyArray<Heading>): string {
  return headings.map((h) => `<li class="toc-${h.depth}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join("");
}

/** The wide-screen list, beside the content from 1280 px. */
function toc(headings: ReadonlyArray<Heading>): string {
  if (headings.length === 0) return "";
  return `<aside class="toc" aria-label="On this page"><h2 class="toc-title">On this page</h2><ol>${tocItems(headings)}</ol></aside>`;
}

/** The same list under the title on narrower screens, collapsed until opened. */
function inlineToc(headings: ReadonlyArray<Heading>): string {
  if (headings.length === 0) return "";
  return `<details class="toc-inline"><summary>On this page</summary><ol>${tocItems(headings)}</ol></details>`;
}

/** The complete HTML document for one page. Every string passes through `esc`. */
export function renderLayout(input: LayoutInput): string {
  const title = esc(documentTitle(input));
  const description = esc(input.description);
  const canonical = `${ORIGIN}${input.url}`;
  const indexed = input.url !== NOT_FOUND_URL;
  const front = input.url === FRONT_URL;
  const sidebar = front ? "" : sidebarNav(input);
  const shellClass = sidebar === "" ? "shell no-sidebar" : "shell";
  const tocClass = front || input.headings.length === 0 ? "" : " has-toc";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script>${THEME_SCRIPT}</script>
    <title>${title}</title>
    <meta name="description" content="${description}" />
${indexed ? `    <link rel="canonical" href="${esc(canonical)}" />\n` : `    <meta name="robots" content="noindex" />\n`}    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="preload" href="/fonts/BricolageGrotesque-Regular.ttf" as="font" type="font/ttf" crossorigin />
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
  <body class="section-${input.section}${front ? " page-front" : ""}">
    <a class="skip-link" href="#main">Skip to main content</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="wordmark" href="/learn/">${MARK}Marey</a>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" hidden>${ICONS.menu}<span>Menu</span></button>
        ${topNav(input.section)}
        <div class="header-tools">
          <button class="search-button" type="button" aria-keyshortcuts="/ Control+K Meta+K" hidden>${ICONS.search}<span class="search-button-label">Search</span><kbd>/</kbd></button>
          <button class="theme-toggle" type="button" aria-label="Theme" hidden>${ICONS.system}${ICONS.light}${ICONS.dark}</button>
          <a class="header-link" href="${REPO}" aria-label="Marey on GitHub">${ICONS.github}<span class="header-link-label" aria-hidden="true">GitHub</span></a>
        </div>
      </div>
    </header>
    <div class="${shellClass}${tocClass}">
      ${sidebar}
      <main id="main" tabindex="-1"><div class="main-inner">
        ${front ? "" : sidebarButton(input)}
        ${breadcrumbNav(input.breadcrumb)}
        ${input.pageHeading === true ? "" : `<h1>${esc(input.title)}</h1>`}
        ${front ? "" : inlineToc(input.headings)}
        <div class="content">
${input.bodyHtml}
        </div>
        ${pager(input.prev, input.next)}
      </div></main>
      ${front ? "" : toc(input.headings)}
    </div>
    <footer class="site-footer">
      <div class="footer-inner">
        <p class="footer-mark"><span class="wordmark">${MARK}Marey</span> <span>A language for deterministic 2D motion.</span></p>
        <nav aria-label="Project">
          <a href="/">Playground</a>
          <a href="${REPO}">GitHub</a>
          <a href="${NPM}">npm</a>
          <a href="${REPO}/blob/main/LICENSE">MIT licence</a>
          <a href="/third-party-licenses.txt">Third-party licences</a>
        </nav>
      </div>
    </footer>
    <script type="module" src="/site/client/main.ts"></script>
  </body>
</html>
`;
}
