import { describe, expect, it } from "vitest";
import { menuKey } from "./menuKeys";

describe("menuKey", () => {
  it("moves down and up, wrapping at both ends", () => {
    expect(menuKey("ArrowDown", 0, 4)).toEqual({ kind: "move", index: 1 });
    expect(menuKey("ArrowDown", 3, 4)).toEqual({ kind: "move", index: 0 });
    expect(menuKey("ArrowUp", 0, 4)).toEqual({ kind: "move", index: 3 });
  });

  it("starts from the first or last item when nothing has focus", () => {
    expect(menuKey("ArrowDown", -1, 4)).toEqual({ kind: "move", index: 0 });
    expect(menuKey("ArrowUp", -1, 4)).toEqual({ kind: "move", index: 3 });
  });

  it("jumps with Home and End", () => {
    expect(menuKey("Home", 2, 4)).toEqual({ kind: "move", index: 0 });
    expect(menuKey("End", 0, 4)).toEqual({ kind: "move", index: 3 });
  });

  it("activates on Enter and Space, closes on Escape and Tab, ignores the rest", () => {
    expect(menuKey("Enter", 1, 4)).toEqual({ kind: "activate" });
    expect(menuKey(" ", 1, 4)).toEqual({ kind: "activate" });
    expect(menuKey("Escape", 1, 4)).toEqual({ kind: "close" });
    expect(menuKey("Tab", 1, 4)).toEqual({ kind: "close" });
    expect(menuKey("a", 1, 4)).toEqual({ kind: "ignore" });
  });
});
