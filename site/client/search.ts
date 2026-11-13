import type { SearchEntry } from "../build/search";
import type { Section } from "../build/types";

export type { SearchEntry };

export type MatchPlace = "title" | "heading" | "body";

export interface SearchResult {
  /** The page, or the heading on it the match falls under. */
  readonly url: string;
  /** The page's title. */
  readonly page: string;
  readonly section: Section;
  /** The heading matched, or the one a body match falls under; null for the page itself. */
  readonly heading: string | null;
  readonly where: MatchPlace;
  /** A line of context: the page's description for a title match, the matching line for a body match. */
  readonly snippet: string;
}

const SECTION_LABELS: Readonly<Record<Section, string>> = {
  learn: "Learn",
  guides: "Guides",
  gallery: "Gallery",
  reference: "Reference",
  root: "Pages",
};

const RANK: Readonly<Record<MatchPlace, number>> = { title: 3, heading: 2, body: 1 };
const LIMIT = 30;
const SNIPPET = 110;

const WORD = /[\p{L}\p{N}]+/gu;

function words(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

/** True when every term starts some word of `field`. */
function matchesAll(field: ReadonlyArray<string>, terms: ReadonlyArray<string>): boolean {
  return terms.every((t) => field.some((w) => w.startsWith(t)));
}

/** How many terms are whole words of `field`, so "ease" ranks a page saying "ease" above one saying "easing". */
function exact(field: ReadonlyArray<string>, terms: ReadonlyArray<string>): number {
  return terms.filter((t) => field.includes(t)).length;
}

function snippetAround(line: string, terms: ReadonlyArray<string>): string {
  const text = line.trim();
  if (text.length <= SNIPPET) return text;
  const lower = text.toLowerCase();
  const at = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), text.length);
  const start = Math.max(0, Math.min(at - 30, text.length - SNIPPET));
  return `${start > 0 ? "…" : ""}${text.slice(start, start + SNIPPET).trim()}…`;
}

interface Scored {
  readonly result: SearchResult;
  readonly rank: number;
  readonly exact: number;
  readonly order: number;
}

/** The body match for a page: the line holding the most terms, and the heading it falls under. */
type Heading = SearchEntry["headings"][number];

function bodyMatch(entry: SearchEntry, terms: ReadonlyArray<string>): { line: string; heading: Heading | null } {
  let current: Heading | null = null;
  let nextHeading = 0;
  let best: { line: string; heading: Heading | null; hits: number } | null = null;
  for (const line of entry.text.split("\n")) {
    const heading = entry.headings[nextHeading];
    if (heading && line.trim() === heading.text) {
      current = heading;
      nextHeading += 1;
      continue;
    }
    const lineWords = words(line);
    const hits = terms.filter((t) => lineWords.some((w) => w.startsWith(t))).length;
    if (hits > 0 && (best === null || hits > best.hits)) best = { line, heading: current, hits };
  }
  return best ?? { line: entry.description, heading: null };
}

/**
 * The pages and headings matching `query`, best first (spec 9C §3.5). Every
 * word of the query must start a word on the page, ignoring case. A page
 * whose title matches ranks first, then a heading that matches, then a page
 * that matches only in its text.
 */
export function rankResults(index: ReadonlyArray<SearchEntry>, query: string): SearchResult[] {
  const terms = [...new Set(words(query))];
  if (terms.length === 0) return [];
  const scored: Scored[] = [];
  index.forEach((entry, order) => {
    const base = { page: entry.title, section: entry.section };
    const titleWords = words(entry.title);
    let matched = false;
    if (matchesAll(titleWords, terms)) {
      matched = true;
      scored.push({
        result: { ...base, url: entry.url, heading: null, where: "title", snippet: entry.description },
        rank: RANK.title,
        exact: exact(titleWords, terms),
        order,
      });
    }
    for (const heading of entry.headings) {
      const headingWords = words(heading.text);
      if (!matchesAll(headingWords, terms)) continue;
      matched = true;
      scored.push({
        result: { ...base, url: `${entry.url}#${heading.id}`, heading: heading.text, where: "heading", snippet: "" },
        rank: RANK.heading,
        exact: exact(headingWords, terms),
        order,
      });
    }
    if (matched) return;
    const pageWords = [...titleWords, ...words(entry.text)];
    if (!matchesAll(pageWords, terms)) return;
    const { line, heading } = bodyMatch(entry, terms);
    scored.push({
      result: {
        ...base,
        url: heading ? `${entry.url}#${heading.id}` : entry.url,
        heading: heading ? heading.text : null,
        where: "body",
        snippet: snippetAround(line, terms),
      },
      rank: RANK.body,
      exact: exact(pageWords, terms),
      order,
    });
  });
  return scored
    .sort((a, b) => b.rank - a.rank || b.exact - a.exact || a.order - b.order)
    .slice(0, LIMIT)
    .map((s) => s.result);
}

export interface ResultGroup {
  readonly section: Section;
  readonly label: string;
  readonly results: ReadonlyArray<SearchResult>;
}

/** Results grouped by section; groups come in the order of their best result, so the ranking still reads top to bottom. */
export function groupBySection(results: ReadonlyArray<SearchResult>): ResultGroup[] {
  const groups = new Map<Section, SearchResult[]>();
  for (const result of results) {
    const list = groups.get(result.section) ?? [];
    list.push(result);
    groups.set(result.section, list);
  }
  return [...groups].map(([section, list]) => ({ section, label: SECTION_LABELS[section], results: list }));
}

type FetchLike = (url: string) => Promise<{ readonly ok: boolean; json(): Promise<unknown> }>;

export interface SearchState {
  readonly status: "idle" | "loading" | "ready" | "failed";
  readonly query: string;
  readonly results: ReadonlyArray<SearchResult>;
  /** Index into `results`, or -1 when there are none. */
  readonly selected: number;
}

export interface SearchController {
  /** Loads the index the first time; later opens reuse it. Never rejects. */
  open(): Promise<void>;
  close(): void;
  setQuery(query: string): void;
  move(step: 1 | -1): void;
  select(index: number): void;
  selectedResult(): SearchResult | null;
  state(): SearchState;
}

export const INDEX_URL = "/search-index.json";

/** The search dialog's logic, apart from the page: loading, ranking and the selection. */
export function createSearchController(options: { readonly fetch: FetchLike; readonly onChange?: () => void }): SearchController {
  let index: ReadonlyArray<SearchEntry> | null = null;
  let loading: Promise<void> | null = null;
  let status: SearchState["status"] = "idle";
  let query = "";
  let results: SearchResult[] = [];
  let selected = -1;
  const changed = (): void => options.onChange?.();

  const run = (): void => {
    results = index ? rankResults(index, query) : [];
    selected = results.length > 0 ? 0 : -1;
  };

  const load = async (): Promise<void> => {
    status = "loading";
    changed();
    try {
      const response = await options.fetch(INDEX_URL);
      if (!response.ok) throw new Error("the search index did not load");
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("the search index is not a list");
      index = data as SearchEntry[];
      status = "ready";
      run();
    } catch {
      status = "failed";
      loading = null;
    }
    changed();
  };

  return {
    open() {
      if (index) return Promise.resolve();
      loading ??= load();
      return loading;
    },
    close() {
      query = "";
      run();
    },
    setQuery(next) {
      query = next;
      run();
      changed();
    },
    move(step) {
      if (results.length === 0) return;
      selected = (selected + step + results.length) % results.length;
      changed();
    },
    select(i) {
      if (i >= 0 && i < results.length) selected = i;
      changed();
    },
    selectedResult() {
      return results[selected] ?? null;
    },
    state() {
      return { status, query, results, selected };
    },
  };
}

interface ShortcutKey {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

interface FocusTarget {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
}

/** `/`, or Ctrl K or ⌘ K, pressed anywhere but in a text field. */
export function isSearchShortcut(event: ShortcutKey, target: FocusTarget | null): boolean {
  if (event.altKey) return false;
  const tag = target?.tagName?.toUpperCase() ?? "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return false;
  if (event.key === "/") return !event.ctrlKey && !event.metaKey;
  return (event.key === "k" || event.key === "K") && (event.ctrlKey || event.metaKey);
}

// ---------------------------------------------------------------------------
// The dialog.

const SEARCH_ICON =
  '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="8.5" cy="8.5" r="5.75" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m13 13 4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Builds the search dialog and wires the header's search button and the
 * keyboard shortcuts. The button is hidden in the page's HTML, so with
 * JavaScript off there is no search field that does nothing.
 */
export function initSearch(button: HTMLButtonElement): void {
  const dialog = el("dialog", "search-dialog");
  dialog.setAttribute("aria-label", "Search the site");
  const box = el("div", "search-box");
  box.innerHTML = SEARCH_ICON;
  const input = el("input", "search-input");
  input.type = "search";
  input.placeholder = "Search lessons, guides and reference";
  input.setAttribute("aria-label", "Search");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "search-results");
  input.setAttribute("aria-expanded", "false");
  input.autocomplete = "off";
  input.spellcheck = false;
  const esc = el("kbd", "search-esc", "Esc");
  esc.setAttribute("aria-hidden", "true");
  box.append(input, esc);
  const list = el("div", "search-results");
  list.id = "search-results";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Results");
  const status = el("p", "search-status");
  status.setAttribute("role", "status");
  const hint = el("p", "search-hint");
  hint.innerHTML = "<span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span>";
  hint.setAttribute("aria-hidden", "true");
  dialog.append(box, list, status, hint);
  document.body.append(dialog);

  let opener: HTMLElement | null = null;

  const render = (): void => {
    const { status: s, query, results, selected } = search.state();
    list.replaceChildren();
    input.setAttribute("aria-expanded", String(results.length > 0));
    let i = 0;
    for (const group of groupBySection(results)) {
      const wrap = el("div", "search-group");
      wrap.setAttribute("role", "group");
      const label = el("div", "search-group-label", group.label);
      label.id = `search-group-${group.section}`;
      wrap.setAttribute("aria-labelledby", label.id);
      wrap.append(label);
      for (const result of group.results) {
        const at = i++;
        const option = el("a", "search-result");
        option.href = result.url;
        option.id = `search-result-${at}`;
        option.tabIndex = -1;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(at === selected));
        option.append(el("span", "search-result-page", result.page));
        if (result.heading !== null) option.append(el("span", "search-result-heading", result.heading));
        if (result.snippet !== "") option.append(el("span", "search-result-snippet", result.snippet));
        option.addEventListener("mousemove", () => {
          if (search.state().selected !== at) search.select(at);
        });
        wrap.append(option);
      }
      list.append(wrap);
    }
    if (selected >= 0) {
      input.setAttribute("aria-activedescendant", `search-result-${selected}`);
      list.querySelector(`#search-result-${selected}`)?.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
    status.textContent =
      s === "loading"
        ? "Loading the index…"
        : s === "failed"
          ? "The search index did not load. Close this and try again."
          : query.trim() === ""
            ? ""
            : results.length === 0
              ? `Nothing matches “${query.trim()}”.`
              : `${results.length} ${results.length === 1 ? "result" : "results"}`;
  };

  const search = createSearchController({ fetch: (url) => fetch(url), onChange: render });

  const open = (): void => {
    if (dialog.open) return;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    input.focus();
    void search.open();
    render();
  };

  // Closing is done here, synchronously, and never in the dialog's "close"
  // event: that event is queued, so a reopen straight after Escape would have
  // its first keystrokes cleared by the previous close arriving late.
  const close = (): void => {
    if (!dialog.open) return;
    dialog.close();
    input.value = "";
    search.close();
    render();
    // Return focus to whatever opened the dialog.
    (opener ?? button).focus();
    opener = null;
  };

  // The browser's own Escape handling goes through the same close.
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  // A click on the backdrop lands on the dialog itself.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  input.addEventListener("input", () => search.setQuery(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      // A search field's own Escape only clears its text; one press closes the dialog.
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      search.move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      const result = search.selectedResult();
      if (result) {
        event.preventDefault();
        close();
        window.location.assign(result.url);
      }
    }
  });
  list.addEventListener("click", (event) => {
    // Following a link to a heading on the current page does not reload it.
    if ((event.target as Element).closest("a")) close();
  });

  button.hidden = false;
  button.addEventListener("click", open);
  document.addEventListener("keydown", (event) => {
    if (dialog.open || event.defaultPrevented) return;
    const target = document.activeElement as FocusTarget | null;
    if (isSearchShortcut(event, target)) {
      event.preventDefault();
      open();
    }
  });
}
