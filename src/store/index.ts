import { create } from "zustand";
import type { LogEntry, CompilerError } from "../compiler";
import {
  resolveInitialCode,
  saveToStorage,
  encodeCode,
} from "../lib/share";

export type Theme = "dark" | "light";
export type CompileStatus = "idle" | "ok" | "error";

/** Toast notification state. null = hidden. */
export interface ToastState {
  message: string;
  kind: "success" | "error" | "info";
}

export interface AppState {
  code: string;
  theme: Theme;
  logs: LogEntry[];
  errors: CompilerError[];
  compileStatus: CompileStatus;
  toast: ToastState | null;

  /** True when the encoded code would exceed MAX_SHARE_LENGTH. */
  isTooLargeToShare: boolean;

  setCode: (code: string) => void;
  toggleTheme: () => void;
  setLogs: (logs: LogEntry[]) => void;
  setErrors: (errors: CompilerError[]) => void;
  setCompileStatus: (status: CompileStatus) => void;
  showToast: (message: string, kind: ToastState["kind"]) => void;
  dismissToast: () => void;

  /**
   * Clear the editor to a blank state.
   *
   * Writes an empty-string sentinel to localStorage so resolveInitialCode
   * knows to skip storage on the next boot and fall through to DEFAULT_CODE.
   * (useAutoSave skips empty strings, so this sentinel must be written here
   * directly and not rely on the debounced hook.)
   */
  newFile: () => void;
}

export const DEFAULT_CODE = `scene {
  def sceneWidth = 600
  def sceneHeight = 400
  size: (sceneWidth, sceneHeight)
  background: white
  def lightBlue = #ADD8E6
  text greet {
    position: (sceneWidth/2, sceneHeight/3)
    anchor: (0.5, 0.5)
    color: black
    content: "Hello World"
    fontSize: 18
  }
  group sun {
    position: (sceneWidth-25, 20)
    circle glow {
      position: (0, 0)
      anchor: (0.5, 0.5)
      color: yellow
      radius: 100
      alpha: 0.25
    }
    circle sphere {
      position: (0, 0)
      anchor: (0.5, 0.5)
      color: yellow
      radius: 80
    }
  }
  polygon mountain {
    z: 1
    points: [(60,340),(200,160),(340,340)]
    color: #2d2d44
  }
  polygon mountain2 {
    points: [(180,340),(300,200),(440,340)]
    color: #252538
  }
  rectangle river {
    position: (0, 340)
    size: (600, 60)
    color: lightBlue
  }
  generate i from 1 to 5 {
    group lilypad {
      position: (i * 100 - 20, 370)
      circle leaf {
        position: (0, 0)
        radius: 18
        color: #2e8b57
        scale: (1.5, 0.4)
      }
      circle flower {
        position: (0, -4)
        radius: 6
        color: #ff99cc
        scale: (i * 0.15 + 0.5, i * 0.15 + 0.5)
      }
    }
  }
}`;

// ─── Boot: resolve initial code once ─────────────────────────────────────────
// resolveInitialCode handles the full priority hierarchy:
//   hash → strips hash + seeds localStorage → returns code
//   storage → skips empty strings → returns code
//   fallback → returns DEFAULT_CODE
const { code: initialCode } = resolveInitialCode(DEFAULT_CODE);

function computeIsTooLarge(code: string): boolean {
  return encodeCode(code) === null;
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useAppStore = create<AppState>((set) => ({
  code: initialCode,
  theme: "dark",
  logs: [],
  errors: [],
  compileStatus: "idle",
  toast: null,
  isTooLargeToShare: computeIsTooLarge(initialCode),

  setCode: (code) =>
    set({ code, isTooLargeToShare: computeIsTooLarge(code) }),

  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

  setLogs:          (logs)          => set({ logs }),
  setErrors:        (errors)        => set({ errors }),
  setCompileStatus: (compileStatus) => set({ compileStatus }),

  showToast:   (message, kind) => set({ toast: { message, kind } }),
  dismissToast: ()             => set({ toast: null }),

  newFile: () => {
    // Write the empty sentinel directly — useAutoSave skips empty strings
    // so we must do this synchronously here.
    saveToStorage("");
    // Note: hash is already clean because:
    //   - resolveInitialCode strips it on boot, OR
    //   - useShare strips it after copying.
    // No need to call stripHash() here.
    set({
      code: "",
      logs: [],
      errors: [],
      compileStatus: "idle",
      isTooLargeToShare: false,
    });
  },
}));