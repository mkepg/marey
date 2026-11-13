import { describe, expect, it } from "vitest";
import { activeHeading } from "./nav";

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
