import type { SafeStorage } from "./storage";

export type ThemeChoice = "system" | "light" | "dark";

/** The key the page's inline head script reads before any stylesheet loads. */
export const THEME_KEY = "marey_theme";

const ORDER: ReadonlyArray<ThemeChoice> = ["system", "light", "dark"];

const LABEL: Readonly<Record<ThemeChoice, string>> = {
  system: "Theme: system",
  light: "Theme: light",
  dark: "Theme: dark",
};

export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;
}

/** The stored choice; anything but "light" or "dark" means follow the system. */
export function readTheme(storage: SafeStorage): ThemeChoice {
  const value = storage.get(THEME_KEY);
  return value === "light" || value === "dark" ? value : "system";
}

export function storeTheme(storage: SafeStorage, choice: ThemeChoice): void {
  storage.set(THEME_KEY, choice);
}

interface ThemeRoot {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/** A light or dark choice pins `data-theme`; system removes it so the media query decides. */
export function applyTheme(root: ThemeRoot, choice: ThemeChoice): void {
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

/** Wires the header's toggle: each press moves to the next choice and remembers it. */
export function initThemeToggle(button: HTMLButtonElement, storage: SafeStorage, root: HTMLElement): void {
  const show = (choice: ThemeChoice): void => {
    button.dataset.choice = choice;
    button.setAttribute("aria-label", `${LABEL[choice]}. Switch to ${nextTheme(choice)}.`);
    button.title = LABEL[choice];
  };
  let choice = readTheme(storage);
  show(choice);
  button.hidden = false;
  button.addEventListener("click", () => {
    choice = nextTheme(choice);
    applyTheme(root, choice);
    storeTheme(storage, choice);
    show(choice);
  });
}
