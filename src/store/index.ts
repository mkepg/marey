import { create } from "zustand";
import type { LogEntry, CompilerError } from "../compiler";
import {
  resolveInitialCode,
  saveToStorage,
  encodeCode,
} from "../lib/share";

export type Theme = "dark" | "light";
export type CompileStatus = "idle" | "ok" | "error";

export interface ToastState {
  message: string;
  kind: "success" | "error" | "info";
}

export interface ActiveToast extends ToastState {
  id: number;
}

export interface AppState {
  code: string;
  theme: Theme;
  logs: LogEntry[];
  errors: CompilerError[];
  compileStatus: CompileStatus;
  toasts: ActiveToast[];
  isTooLargeToShare: boolean;
  autoRun: boolean;
  isCompiling: boolean;
  setCode: (code: string) => void;
  toggleTheme: () => void;
  setLogs: (logs: LogEntry[]) => void;
  setErrors: (errors: CompilerError[]) => void;
  setCompileStatus: (status: CompileStatus) => void;
  showToast: (message: string, kind: ToastState["kind"]) => void;
  dismissToast: (id: number) => void;
  newFile: () => void;
  setAutoRun: (val: boolean) => void;
  setIsCompiling: (val: boolean) => void;
}

export const DEFAULT_CODE = `// ── Reusable Ambient Star Template ────────────────────────────
template Star(starColor) {
  circle s {
    position: (0, 0)
    radius: 2
    color: starColor
    alpha: 0.1
    anchor: (0.5, 0.5)
    animate {
      property: alpha
      to: 0.8
      duration: 1.5
      easing: easeInOut
      loop: true
      yoyo: true
    }
  }
}

scene {
  size: (800, 600)
  background: #080811

  // ── 1. Background Ambient Starfield ─────────────────────────
  generate i from 1 to 20 {
    use Star(#a78bfa) bgStar {
      position: (i * 38, i * 25 - (i * i) / 2 + 100)
      scale: (i / 10 + 0.5, i / 10 + 0.5)
    }
  }

  // ── 2. Physics-Enabled Neon Cubes ───────────────────────────
  generate j from 1 to 5 {
    rectangle cube {
      position: (j * 130 + 50, 20)
      size: (12, 12)
      color: #38bdf8
      alpha: 0.4
      anchor: (0.5, 0.5)
      physics {
        velocity: (j * 50 - 150, 0)
        gravity: (0, 700)
        friction: 0.99
        bounce: 0.7 + j * 0.05
        collideBounds: true
        duration: indefinitely
      }
      animate {
        property: rotation
        to: 1440
        duration: 4.0 + j
        easing: easeOut
      }
    }
  }

  // ── 3. Central Pulsing Aura ─────────────────────────────────
  circle ringOuter {
    position: (400, 300)
    radius: 180
    color: #4c1d95
    alpha: 0.15
    anchor: (0.5, 0.5)
    animate {
      property: scale
      to: (1.1, 1.1)
      duration: 4.0
      easing: easeInOut
      loop: true
      yoyo: true
    }
  }
}
`;

const THEME_STORAGE_KEY = "declare_theme";

function getInitialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // ignore
  }
  
  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  
  return "dark";
}

const { code: initialCode } = resolveInitialCode(DEFAULT_CODE);

function computeIsTooLarge(code: string): boolean {
  return encodeCode(code) === null;
}

let toastIdCounter = 0;

export const useAppStore = create<AppState>((set) => ({
  code: initialCode,
  theme: getInitialTheme(),
  logs: [],
  errors: [],
  compileStatus: "idle",
  toasts: [],
  isTooLargeToShare: computeIsTooLarge(initialCode),
  autoRun: true,
  isCompiling: false,
  setCode: (code) =>
    set({ code, isTooLargeToShare: computeIsTooLarge(code) }),
  toggleTheme: () =>
    set((s) => {
      const nextTheme = s.theme === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // ignore
      }
      return { theme: nextTheme };
    }),
  setLogs:          (logs)          => set({ logs }),
  setErrors:        (errors)        => set({ errors }),
  setCompileStatus: (compileStatus) => set({ compileStatus }),
  showToast: (message, kind) =>
    set((s) => ({
      toasts: [...s.toasts, { id: ++toastIdCounter, message, kind }],
    })),
  dismissToast: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),
  newFile: () => {
    saveToStorage("");
    set({
      code: "",
      logs: [],
      errors: [],
      compileStatus: "idle",
      isTooLargeToShare: false,
    });
  },
  setAutoRun:     (val) => set({ autoRun: val }),
  setIsCompiling: (val) => set({ isCompiling: val }),
}));