import { describe, expect, it } from "vitest";
import { THEME_KEY, applyTheme, nextTheme, readTheme, storeTheme } from "./theme";
import { createSafeStorage, type SafeStorage } from "./storage";

function memory(initial: Record<string, string> = {}): SafeStorage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, get: (key) => data.get(key) ?? null, set: (key, value) => void data.set(key, value) };
}

function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    removeAttribute: (name: string) => void attrs.delete(name),
  };
}

describe("the theme choice", () => {
  it("cycles system, light, dark and back to system", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });

  it("reads a stored light or dark, and anything else as system", () => {
    expect(readTheme(memory({ [THEME_KEY]: "light" }))).toBe("light");
    expect(readTheme(memory({ [THEME_KEY]: "dark" }))).toBe("dark");
    expect(readTheme(memory({ [THEME_KEY]: "system" }))).toBe("system");
    expect(readTheme(memory({ [THEME_KEY]: "purple" }))).toBe("system");
    expect(readTheme(memory())).toBe("system");
  });

  it("remembers the choice it is given", () => {
    const storage = memory();
    storeTheme(storage, "dark");
    expect(readTheme(storage)).toBe("dark");
    storeTheme(storage, "system");
    expect(readTheme(storage)).toBe("system");
  });

  it("sets data-theme for light and dark and removes it for system", () => {
    const root = fakeRoot();
    applyTheme(root, "dark");
    expect(root.attrs.get("data-theme")).toBe("dark");
    applyTheme(root, "light");
    expect(root.attrs.get("data-theme")).toBe("light");
    applyTheme(root, "system");
    expect(root.attrs.has("data-theme")).toBe(false);
  });

  it("still cycles when localStorage is blocked, remembering nothing", () => {
    const blocked = createSafeStorage(() => {
      throw new Error("SecurityError");
    });
    expect(() => storeTheme(blocked, "dark")).not.toThrow();
    expect(readTheme(blocked)).toBe("system");
  });
});
