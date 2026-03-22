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
      // Fixed: Removed loop/yoyo to comply with sibling physics rule.
      // Now it spins a fixed amount (1440 deg) and naturally eases to a stop.
      animate {
        property: rotation
        to: 1440
        duration: 4.0 + j
        easing: easeOut
      }
    }
  }

  // ── 3. Central Pulsing Aura ─────────────────────────────────
  // This is allowed to loop because it has no sequence or physics siblings.
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

  // ── 4. Cinematic Reveal Framing Lines ───────────────────────
  line ruleLeft {
    position: (0, 0)
    points: [(80, 300), (220, 300)]
    thickness: 2
    color: #38bdf8
    alpha: 0.0
    animate {
      property: alpha
      to: 0.0
      duration: 1.0
      easing: linear
    }
    sequence {
      animate {
        property: alpha
        to: 0.6
        duration: 1.0
        easing: easeOut
      }
    }
  }

  line ruleRight {
    position: (0, 0)
    points: [(580, 300), (720, 300)]
    thickness: 2
    color: #38bdf8
    alpha: 0.0
    animate {
      property: alpha
      to: 0.0
      duration: 1.0
      easing: linear
    }
    sequence {
      animate {
        property: alpha
        to: 0.6
        duration: 1.0
        easing: easeOut
      }
    }
  }

  // ── 5. Staggered Typography Reveal ──────────────────────────
  text labelCreated {
    position: (400, 255)
    content: "CREATED BY"
    fontSize: 14
    color: #94a3b8
    alpha: 0.0
    anchor: (0.5, 0.5)
    
    animate {
      property: alpha
      to: 0.0
      duration: 1.5
      easing: linear
    }
    sequence {
      animate {
        property: alpha
        to: 0.9
        duration: 1.0
        easing: easeOut
      }
    }
  }

  text labelName {
    position: (400, 330)
    content: "Mikhael Edman P. Gomez"
    fontSize: 32
    color: #f8fafc
    alpha: 0.0
    anchor: (0.5, 0.5)
    
    animate {
      property: alpha
      to: 0.0
      duration: 2.2
      easing: linear
    }
    animate {
      property: position
      to: (400, 330)
      duration: 2.2
      easing: linear
    }
    
    sequence {
      animate {
        property: position
        to: (400, 300)
        duration: 1.2
        easing: easeOut
      }
      animate {
        property: alpha
        to: 1.0
        duration: 1.2
        easing: easeOut
      }
    }
  }
}
`;

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