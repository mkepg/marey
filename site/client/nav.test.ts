import { describe, expect, it } from "vitest";
import { activeHeading, currentHeading, topmostLayer } from "./nav";

describe("activeHeading", () => {
  const headings = [
    { id: "a", top: 100 },
    { id: "b", top: 600 },
    { id: "c", top: 1400 },
  ];

  it("is the last heading at or above the reading line", () => {
    expect(activeHeading(headings, 120)).toBe("a");
    expect(activeHeading(headings, 600)).toBe("b");
    expect(activeHeading(headings, 1399)).toBe("b");
    expect(activeHeading(headings, 5000)).toBe("c");
  });

  it("is the first heading before the reader reaches any", () => {
    expect(activeHeading(headings, 10)).toBe("a");
  });

  it("is null on a page with no headings", () => {
    expect(activeHeading([], 10)).toBeNull();
  });

  it("does not depend on the order the headings are given in", () => {
    expect(activeHeading([...headings].reverse(), 700)).toBe("b");
  });
});

describe("currentHeading", () => {
  const headings = [
    { id: "a", top: 100 },
    { id: "b", top: 600 },
  ];

  it("is the last heading once the page is scrolled to its end", () => {
    expect(currentHeading(headings, 120, true)).toBe("b");
  });

  it("follows the reading line otherwise", () => {
    expect(currentHeading(headings, 120, false)).toBe("a");
  });

  it("is null, and does not throw, when no heading is found for the contents list", () => {
    expect(currentHeading([], 120, true)).toBeNull();
    expect(currentHeading([], 120, false)).toBeNull();
  });
});

describe("topmostLayer", () => {
  it("is search when search is open, even with the drawer open under it", () => {
    expect(topmostLayer({ searchOpen: true, drawerOpen: true, handled: false })).toBe("search");
    expect(topmostLayer({ searchOpen: true, drawerOpen: false, handled: false })).toBe("search");
  });

  it("is the drawer when only the drawer is open", () => {
    expect(topmostLayer({ searchOpen: false, drawerOpen: true, handled: false })).toBe("drawer");
  });

  it("is nothing when the key was already handled, such as by the search field closing itself", () => {
    expect(topmostLayer({ searchOpen: false, drawerOpen: true, handled: true })).toBeNull();
  });

  it("is nothing when nothing is open", () => {
    expect(topmostLayer({ searchOpen: false, drawerOpen: false, handled: false })).toBeNull();
  });
});
