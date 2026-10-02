export type MenuKeyResult =
  | { readonly kind: "move"; readonly index: number }
  | { readonly kind: "activate" }
  | { readonly kind: "close" }
  | { readonly kind: "ignore" };

/** Keyboard behaviour shared by every top-bar menu (spec 6B §4). `current` is -1 when no item has focus. */
export function menuKey(key: string, current: number, count: number): MenuKeyResult {
  switch (key) {
    case "ArrowDown":
      return { kind: "move", index: current < 0 ? 0 : (current + 1) % count };
    case "ArrowUp":
      return { kind: "move", index: current < 0 ? count - 1 : (current - 1 + count) % count };
    case "Home":
      return { kind: "move", index: 0 };
    case "End":
      return { kind: "move", index: count - 1 };
    case "Enter":
    case " ":
      return { kind: "activate" };
    case "Escape":
    case "Tab":
      return { kind: "close" };
    default:
      return { kind: "ignore" };
  }
}
