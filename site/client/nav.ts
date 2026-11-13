/**
 * The page's navigation behaviour: the top bar's menu on narrow screens, the
 * sidebar drawer, the "On this page" list that follows the reader, and copy
 * buttons on static code blocks. Every piece is an enhancement: with no
 * script the menu's links wrap, the sidebar sits above the content, and the
 * headings' anchor links work as plain links.
 */

export interface HeadingTop {
  readonly id: string;
  /** The heading's distance from the top of the document. */
  readonly top: number;
}

/**
 * The heading the reader is in: the last one at or above `line` (a document
 * offset just under the sticky header), or the first one before any is reached.
 */
export function activeHeading(headings: ReadonlyArray<HeadingTop>, line: number): string | null {
  const sorted = [...headings].sort((a, b) => a.top - b.top);
  let active = sorted[0]?.id ?? null;
  for (const h of sorted) {
    if (h.top <= line) active = h.id;
    else break;
  }
  return active;
}

const NARROW_DRAWER = "(max-width: 1099.98px)";
const NARROW_MENU = "(max-width: 859.98px)";

/** The top bar's section links, behind a Menu button below 860 px. */
function initMenu(): void {
  const header = document.querySelector<HTMLElement>(".site-header");
  const button = header?.querySelector<HTMLButtonElement>(".menu-toggle");
  const nav = document.getElementById("site-nav");
  if (!header || !button || !nav) return;
  const narrow = window.matchMedia(NARROW_MENU);
  const set = (open: boolean): void => {
    header.classList.toggle("menu-open", open);
    button.setAttribute("aria-expanded", String(open));
  };
  button.hidden = false;
  button.addEventListener("click", () => set(!header.classList.contains("menu-open")));
  header.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && header.classList.contains("menu-open")) {
      set(false);
      button.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (header.classList.contains("menu-open") && !header.contains(event.target as Node)) set(false);
  });
  narrow.addEventListener("change", () => set(false));
}

/** The section sidebar, as a drawer below 1100 px. */
function initDrawer(): void {
  const sidebar = document.getElementById("sidebar");
  const button = document.querySelector<HTMLButtonElement>(".sidebar-toggle");
  if (!sidebar || !button) return;
  const narrow = window.matchMedia(NARROW_DRAWER);
  const backdrop = document.createElement("div");
  backdrop.className = "drawer-backdrop";
  backdrop.hidden = true;
  document.body.append(backdrop);
  const outside = (): HTMLElement[] =>
    [...document.querySelectorAll<HTMLElement>(".site-header, main, .toc, .site-footer")];

  const set = (open: boolean, returnFocus = true): void => {
    document.body.classList.toggle("drawer-open", open);
    button.setAttribute("aria-expanded", String(open));
    backdrop.hidden = !open;
    // While the drawer is open the rest of the page can be neither tabbed to nor read.
    for (const el of outside()) el.inert = open;
    if (open) {
      const current = sidebar.querySelector<HTMLElement>('[aria-current="page"]') ?? sidebar.querySelector<HTMLElement>("a");
      current?.focus();
    } else if (returnFocus) {
      button.focus();
    }
  };

  button.hidden = false;
  button.addEventListener("click", () => set(true));
  backdrop.addEventListener("click", () => set(false));
  sidebar.querySelector(".drawer-close")?.addEventListener("click", () => set(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("drawer-open")) {
      event.preventDefault();
      set(false);
    }
  });
  narrow.addEventListener("change", () => {
    if (!narrow.matches && document.body.classList.contains("drawer-open")) set(false, false);
  });
}

/** Marks the "On this page" entry for the section being read. */
function initScrollSpy(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>(".toc a[href^='#']")];
  if (links.length === 0) return;
  const targets = links
    .map((a) => ({ link: a, heading: document.getElementById(decodeURIComponent(a.hash.slice(1))) }))
    .filter((t): t is { link: HTMLAnchorElement; heading: HTMLElement } => t.heading !== null);
  let queued = false;
  let current: string | null = null;
  const update = (): void => {
    queued = false;
    const header = document.querySelector<HTMLElement>(".site-header")?.offsetHeight ?? 0;
    const line = window.scrollY + header + 32;
    const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    const id = atEnd
      ? targets[targets.length - 1]!.heading.id
      : activeHeading(
          targets.map((t) => ({ id: t.heading.id, top: t.heading.getBoundingClientRect().top + window.scrollY })),
          line,
        );
    if (id === current) return;
    current = id;
    for (const t of targets) {
      if (t.heading.id === id) t.link.setAttribute("aria-current", "location");
      else t.link.removeAttribute("aria-current");
    }
  };
  const queue = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  update();
}

/**
 * A Copy button on each static code block. Samples (`figure.sample`) are left
 * alone: their toolbar has its own Copy.
 */
function initCopyButtons(): void {
  for (const pre of document.querySelectorAll<HTMLPreElement>(".content pre.code")) {
    if (pre.closest("figure.sample")) continue;
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    pre.replaceWith(wrap);
    wrap.append(pre);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-button";
    button.textContent = "Copy";
    const lang = pre.dataset.lang;
    button.setAttribute("aria-label", lang && lang !== "text" ? `Copy the ${lang} code` : "Copy the code");
    let reset = 0;
    button.addEventListener("click", async () => {
      const text = pre.textContent ?? "";
      let label = "Copied";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // No clipboard permission: select the code so a keyboard copy takes it.
        const range = document.createRange();
        range.selectNodeContents(pre);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        label = "Selected";
      }
      button.textContent = label;
      button.classList.add("is-done");
      window.clearTimeout(reset);
      reset = window.setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("is-done");
      }, 1600);
    });
    wrap.append(button);
  }
}

export function initNav(): void {
  initMenu();
  initDrawer();
  initScrollSpy();
  initCopyButtons();
}
