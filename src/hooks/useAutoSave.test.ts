import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function load() {
  // The hook's module loads the store, which reads window at import.
  vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} }, location: { hash: "" } });
  return import("./useAutoSave");
}

describe("saveOnLeave", () => {
  it("saves the current code when the page is hidden, and stops once removed", async () => {
    const { saveOnLeave } = await load();
    const target = new EventTarget();
    let code = "rect r";
    const saved: string[] = [];
    const remove = saveOnLeave(target, () => code, (c) => (saved.push(c), true));

    target.dispatchEvent(new Event("pagehide"));
    code = "rect r2";
    target.dispatchEvent(new Event("pagehide"));
    remove();
    target.dispatchEvent(new Event("pagehide"));

    expect(saved).toEqual(["rect r", "rect r2"]);
  });

  it("never overwrites the saved scene with an empty editor", async () => {
    const { saveOnLeave } = await load();
    const target = new EventTarget();
    const save = vi.fn(() => true);
    saveOnLeave(target, () => "  \n", save);
    target.dispatchEvent(new Event("pagehide"));
    expect(save).not.toHaveBeenCalled();
  });
});
