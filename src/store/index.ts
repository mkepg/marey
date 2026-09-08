import { create } from "zustand";
import type { LogEntry, CompilerError } from "../compiler";
import {
  resolveInitialCode,
  saveToStorage,
  encodeCode,
} from "../lib/share";
import { DEFAULT_CODE } from "./defaultScene";

export { DEFAULT_CODE };

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
  fileId: number;
  setCode: (code: string) => void;
  toggleTheme: () => void;
  setLogs: (logs: LogEntry[]) => void;
  setErrors: (errors: CompilerError[]) => void;
  setCompileStatus: (status: CompileStatus) => void;
  showToast: (message: string, kind: ToastState["kind"]) => void;
  dismissToast: (id: number) => void;
  newFile: () => void;
  loadExample: () => void;
  setAutoRun: (val: boolean) => void;
  setIsCompiling: (val: boolean) => void;
}

const THEME_STORAGE_KEY = "marey_theme";

function getInitialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
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
  fileId: 0,
  setCode: (code) =>
    set({ code, isTooLargeToShare: computeIsTooLarge(code) }),
  toggleTheme: () =>
    set((s) => {
      const nextTheme = s.theme === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
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
    set((s) => ({
      code: "",
      logs: [],
      errors: [],
      compileStatus: "idle",
      isTooLargeToShare: false,
      fileId: s.fileId + 1,
    }));
  },
  // Restores the bundled example. Without this the default scene is
  // unrecoverable once it has been edited, since autosave overwrites it.
  loadExample: () => {
    saveToStorage(DEFAULT_CODE);
    set((s) => ({
      code: DEFAULT_CODE,
      logs: [],
      errors: [],
      compileStatus: "idle",
      isTooLargeToShare: computeIsTooLarge(DEFAULT_CODE),
      fileId: s.fileId + 1,
    }));
  },
  setAutoRun:     (val) => set({ autoRun: val }),
  setIsCompiling: (val) => set({ isCompiling: val }),
}));