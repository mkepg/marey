import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The playground's theme control cycles as the documentation site's does
 * (site/client/theme.ts): system, light, dark, and back to system. The choice
 * is stored under the key both share, so it holds across the two, and
 * "system" follows the operating system's setting.
 */

function fakeWindow(stored: string | null, systemLight: boolean) {
  const storage = new Map<string, string>();
  if (stored !== null) storage.set("marey_theme", stored);
  let light = systemLight;
  return {
    storage,
    setSystemLight: (value: boolean) => { light = value; },
    window: {
      location: { hash: "", pathname: "/", search: "", origin: "http://localhost" },
      history: { replaceState: () => {} },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
        removeItem: (key: string) => void storage.delete(key),
      },
      matchMedia: (query: string) => ({ matches: query.includes("light") ? light : !light }),
    },
  };
}

async function loadStore(stored: string | null, systemLight: boolean) {
  const fake = fakeWindow(stored, systemLight);
  vi.stubGlobal("window", fake.window);
  vi.resetModules();
  const { useAppStore } = await import("./index");
  return { useAppStore, ...fake };
}

describe("the playground's theme", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("follows the system when nothing is stored, as the site does", async () => {
    const { useAppStore } = await loadStore(null, true);
    expect(useAppStore.getState().themeChoice).toBe("system");
    expect(useAppStore.getState().theme).toBe("light");
  });

  it("reads a light or dark choice made on either the playground or the site", async () => {
    const { useAppStore } = await loadStore("dark", true);
    expect(useAppStore.getState().themeChoice).toBe("dark");
    expect(useAppStore.getState().theme).toBe("dark");
  });

  it("treats the site's stored \"system\" as following the system", async () => {
    const { useAppStore } = await loadStore("system", false);
    expect(useAppStore.getState().themeChoice).toBe("system");
    expect(useAppStore.getState().theme).toBe("dark");
  });

  it("cycles system, light, dark, system, storing each choice under the shared key", async () => {
    const { useAppStore, storage } = await loadStore(null, false);
    const seen: Array<[string, string, string | undefined]> = [];
    for (let i = 0; i < 3; i++) {
      useAppStore.getState().cycleTheme();
      const { themeChoice, theme } = useAppStore.getState();
      seen.push([themeChoice, theme, storage.get("marey_theme")]);
    }
    expect(seen).toEqual([
      ["light", "light", "light"],
      ["dark", "dark", "dark"],
      ["system", "dark", "system"],
    ]);
  });

  it("re-reads the system setting only while the choice is system", async () => {
    const { useAppStore, setSystemLight } = await loadStore(null, false);
    setSystemLight(true);
    useAppStore.getState().syncSystemTheme();
    expect(useAppStore.getState().theme).toBe("light");

    useAppStore.getState().cycleTheme(); // light
    useAppStore.getState().cycleTheme(); // dark
    setSystemLight(true);
    useAppStore.getState().syncSystemTheme();
    expect(useAppStore.getState().theme).toBe("dark");
  });
});
