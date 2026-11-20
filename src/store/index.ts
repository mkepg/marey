import { create } from "zustand";
import type { LogEntry, CompilerError } from "../compiler";
import {
  resolveInitialCode,
  saveToStorage,
  encodeCode,
} from "../lib/share";
import type { PlaybackController, PlaybackState } from "../compiler/renderer/playback";
import { EXAMPLES, DEFAULT_EXAMPLE, type ExampleId } from "../examples";

/** The scene loaded when there is no saved or shared document. */
const DEFAULT_CODE: string = DEFAULT_EXAMPLE.source;

export type Theme = "dark" | "light";
/** What the reader chose; "system" follows the operating system's setting. */
export type ThemeChoice = "system" | Theme;
export type CompileStatus = "idle" | "ok" | "error";

export interface ToastState {
  message: string;
  kind: "success" | "error" | "info";
}

export interface ActiveToast extends ToastState {
  id: number;
}

export interface SceneInfo {
  readonly width: number;
  readonly height: number;
  readonly duration: number | null;
  readonly fit: "contain" | "cover" | "fill" | "none";
}

export interface AppState {
  code: string;
  theme: Theme;
  themeChoice: ThemeChoice;
  logs: LogEntry[];
  errors: CompilerError[];
  compileStatus: CompileStatus;
  toasts: ActiveToast[];
  isTooLargeToShare: boolean;
  autoRun: boolean;
  isCompiling: boolean;
  isExporting: boolean;
  fileId: number;
  sceneInfo: SceneInfo | null;
  playback: PlaybackState | null;
  playbackController: PlaybackController | null;
  /** Goes up by one per scene entrance to play; the preview plays one on each change. */
  entrance: number;
  setCode: (code: string) => void;
  /** System, then light, then dark, then system again: the same cycle as the documentation site's toggle. */
  cycleTheme: () => void;
  /** Re-reads the system setting while the choice is "system". */
  syncSystemTheme: () => void;
  setLogs: (logs: LogEntry[]) => void;
  setErrors: (errors: CompilerError[]) => void;
  setCompileStatus: (status: CompileStatus) => void;
  showToast: (message: string, kind: ToastState["kind"]) => void;
  dismissToast: (id: number) => void;
  newFile: () => void;
  loadExample: (id: ExampleId) => void;
  setAutoRun: (val: boolean) => void;
  setIsCompiling: (val: boolean) => void;
  setIsExporting: (val: boolean) => void;
  setSceneInfo: (info: SceneInfo | null) => void;
  setPlayback: (state: PlaybackState | null) => void;
  setPlaybackController: (controller: PlaybackController | null) => void;
  playEntrance: () => void;
}

/** Shared with the documentation site, so a choice made on either holds on both. */
const THEME_STORAGE_KEY = "marey_theme";
const THEME_ORDER: readonly ThemeChoice[] = ["system", "light", "dark"];

function systemTheme(): Theme {
  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

function getInitialThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
  }
  return "system";
}

export function resolveTheme(choice: ThemeChoice): Theme {
  return choice === "system" ? systemTheme() : choice;
}

const initialThemeChoice = getInitialThemeChoice();

const { code: initialCode } = resolveInitialCode(DEFAULT_CODE);

function computeIsTooLarge(code: string): boolean {
  return encodeCode(code) === null;
}

let toastIdCounter = 0;

export const useAppStore = create<AppState>((set) => ({
  code: initialCode,
  theme: resolveTheme(initialThemeChoice),
  themeChoice: initialThemeChoice,
  logs: [],
  errors: [],
  compileStatus: "idle",
  toasts: [],
  isTooLargeToShare: computeIsTooLarge(initialCode),
  autoRun: true,
  isCompiling: false,
  isExporting: false,
  fileId: 0,
  sceneInfo: null,
  playback: null,
  playbackController: null,
  entrance: 0,
  setCode: (code) =>
    set({ code, isTooLargeToShare: computeIsTooLarge(code) }),
  cycleTheme: () =>
    set((s) => {
      const themeChoice = THEME_ORDER[(THEME_ORDER.indexOf(s.themeChoice) + 1) % THEME_ORDER.length]!;
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, themeChoice);
      } catch {
      }
      return { themeChoice, theme: resolveTheme(themeChoice) };
    }),
  syncSystemTheme: () =>
    set((s) => (s.themeChoice === "system" ? { theme: systemTheme() } : {})),
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
  // Loads one of the bundled examples. It is saved because autosave has
  // already overwritten the previous document, so the choice persists like an edit.
  loadExample: (id) => {
    const source = EXAMPLES.find((e) => e.id === id)?.source;
    if (source === undefined) return;
    saveToStorage(source);
    set((s) => ({
      code: source,
      logs: [],
      errors: [],
      compileStatus: "idle",
      isTooLargeToShare: computeIsTooLarge(source),
      fileId: s.fileId + 1,
    }));
  },
  setAutoRun:     (val) => set({ autoRun: val }),
  setIsCompiling: (val) => set({ isCompiling: val }),
  setIsExporting: (val) => set({ isExporting: val }),
  setSceneInfo:   (sceneInfo) => set({ sceneInfo }),
  setPlayback:    (playback) => set({ playback }),
  setPlaybackController: (playbackController) => set({ playbackController }),
  playEntrance: () => set((s) => ({ entrance: s.entrance + 1 })),
}));