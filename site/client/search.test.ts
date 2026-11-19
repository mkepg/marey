import { describe, expect, it, vi } from "vitest";
import {
  createSearchController,
  groupBySection,
  isSearchShortcut,
  rankResults,
  type SearchEntry,
} from "./search";

function entry(over: Partial<SearchEntry> & Pick<SearchEntry, "url" | "title">): SearchEntry {
  return { section: "learn", description: "", headings: [], text: "", ...over };
}

// Listed body match first and title match last, so a ranking that kept index
// order would put them the wrong way round.
const INDEX: SearchEntry[] = [
  entry({
    url: "/learn/timing/",
    title: "Timing",
    headings: [{ depth: 2, text: "Delays", id: "delays" }],
    text: "Timing\nA scene runs for its duration.\nDelays\nA delay waits before the easing starts.",
  }),
  entry({
    url: "/guides/export/",
    section: "guides",
    title: "Export",
    headings: [{ depth: 2, text: "Choosing an easing", id: "choosing-an-easing" }],
    text: "Choosing an easing\nPick one.",
  }),
  entry({ url: "/reference/easing/", section: "reference", title: "Easing", text: "Every curve." }),
];

describe("rankResults", () => {
  it("ranks a title match above a heading match above a body match", () => {
    const results = rankResults(INDEX, "easing");
    expect(results.map((r) => [r.where, r.url])).toEqual([
      ["title", "/reference/easing/"],
      ["heading", "/guides/export/#choosing-an-easing"],
      ["body", "/learn/timing/#delays"],
    ]);
  });

  it("ignores case in the query and in the index", () => {
    const upper = rankResults(INDEX, "EASING").map((r) => r.url);
    const lower = rankResults(INDEX, "easing").map((r) => r.url);
    expect(upper).toEqual(lower);
    expect(upper).toHaveLength(3);
  });

  it("returns nothing for an empty or blank query", () => {
    expect(rankResults(INDEX, "")).toEqual([]);
    expect(rankResults(INDEX, "   ")).toEqual([]);
  });

  it("matches the start of a word, so a partial word finds the page", () => {
    expect(rankResults(INDEX, "eas").map((r) => r.where)).toEqual(["title", "heading", "body"]);
    expect(rankResults(INDEX, "asing")).toEqual([]);
  });

  it("needs every word of the query on the page", () => {
    expect(rankResults(INDEX, "delay easing").map((r) => r.url)).toEqual(["/learn/timing/#delays"]);
    expect(rankResults(INDEX, "easing zebra")).toEqual([]);
  });

  it("names the heading a body match falls under, and the page when it falls before any", () => {
    const [result] = rankResults(INDEX, "duration");
    expect(result).toMatchObject({ where: "body", heading: null, url: "/learn/timing/", page: "Timing" });
    const [delayed] = rankResults(INDEX, "waits");
    expect(delayed).toMatchObject({ heading: "Delays", url: "/learn/timing/#delays" });
    expect(delayed!.snippet).toContain("waits");
  });
});

describe("groupBySection", () => {
  it("keeps the ranking: groups follow their best result and results keep their order", () => {
    const groups = groupBySection(rankResults(INDEX, "easing"));
    expect(groups.map((g) => g.label)).toEqual(["Reference", "Guides", "Learn"]);
  });
});

describe("the search controller", () => {
  function fakeFetch() {
    return vi.fn(async (_url: string) => ({ ok: true, json: async () => INDEX }));
  }

  it("fetches the index once even when the dialog opens twice", async () => {
    const fetch = fakeFetch();
    const search = createSearchController({ fetch });
    await search.open();
    search.close();
    await search.open();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/search-index.json");
  });

  it("fetches once when it is opened twice before the first fetch settles", async () => {
    const fetch = fakeFetch();
    const search = createSearchController({ fetch });
    await Promise.all([search.open(), search.open()]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("tries again on the next open after a failed fetch", async () => {
    const fetch = vi
      .fn(async (_url: string) => ({ ok: true, json: async () => INDEX }))
      .mockRejectedValueOnce(new Error("offline"));
    const search = createSearchController({ fetch });
    await search.open();
    expect(search.state().status).toBe("failed");
    await search.open();
    expect(search.state().status).toBe("ready");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("moves the selection with the arrows, wrapping at both ends", async () => {
    const search = createSearchController({ fetch: fakeFetch() });
    await search.open();
    search.setQuery("easing");
    expect(search.state().selected).toBe(0);
    search.move(1);
    search.move(1);
    expect(search.state().selected).toBe(2);
    search.move(1);
    expect(search.state().selected).toBe(0);
    search.move(-1);
    expect(search.state().selected).toBe(2);
    expect(search.selectedResult()?.url).toBe("/learn/timing/#delays");
  });

  it("starts the selection again at the top when the query changes", async () => {
    const search = createSearchController({ fetch: fakeFetch() });
    await search.open();
    search.setQuery("easing");
    search.move(1);
    search.setQuery("easin");
    expect(search.state().selected).toBe(0);
    search.setQuery("");
    expect(search.selectedResult()).toBeNull();
  });
});

describe("isSearchShortcut", () => {
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mods,
  });
  const body = { tagName: "BODY", isContentEditable: false };

  it("opens on / and on Ctrl K or Cmd K", () => {
    expect(isSearchShortcut(key("/"), body)).toBe(true);
    expect(isSearchShortcut(key("k", { ctrlKey: true }), body)).toBe(true);
    expect(isSearchShortcut(key("K", { metaKey: true }), body)).toBe(true);
    expect(isSearchShortcut(key("k"), body)).toBe(false);
    expect(isSearchShortcut(key("/", { altKey: true }), body)).toBe(false);
  });

  it("does not open while focus is in a text field", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(isSearchShortcut(key("/"), { tagName, isContentEditable: false })).toBe(false);
      expect(isSearchShortcut(key("k", { ctrlKey: true }), { tagName, isContentEditable: false })).toBe(false);
    }
    expect(isSearchShortcut(key("/"), { tagName: "DIV", isContentEditable: true })).toBe(false);
  });
});
