import { describe, expect, it } from "vitest";
import { createSafeStorage } from "./storage";

/** A store whose every method throws, as a blocked `localStorage` does. */
const throwing: Storage = {
  get length(): number {
    throw new Error("SecurityError");
  },
  clear() {
    throw new Error("SecurityError");
  },
  getItem() {
    throw new Error("SecurityError");
  },
  key() {
    throw new Error("SecurityError");
  },
  removeItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};

/** A working in-memory store. */
function memoryStorage(): Storage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
  };
}

describe("safeStorage", () => {
  it("returns null and stores nothing when every Storage method throws", () => {
    const storage = createSafeStorage(() => throwing);
    expect(storage.get("marey_theme")).toBeNull();
    expect(() => storage.set("marey_theme", "dark")).not.toThrow();
    expect(storage.get("marey_theme")).toBeNull();
  });

  it("returns null when reaching localStorage at all throws", () => {
    const storage = createSafeStorage(() => {
      throw new Error("SecurityError: access is denied for this document");
    });
    expect(storage.get("k")).toBeNull();
    expect(() => storage.set("k", "v")).not.toThrow();
  });

  it("returns null when there is no localStorage", () => {
    const storage = createSafeStorage(() => undefined);
    expect(storage.get("k")).toBeNull();
    expect(() => storage.set("k", "v")).not.toThrow();
  });

  it("reads back what it wrote when the store works", () => {
    const store = memoryStorage();
    const storage = createSafeStorage(() => store);
    storage.set("k", "v");
    expect(store.data.get("k")).toBe("v");
    expect(storage.get("k")).toBe("v");
    expect(storage.get("missing")).toBeNull();
  });
});
