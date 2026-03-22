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
  size: (600, 400)
  background: #08080f

  // ── starfield layer 1 — pure loopers, no sequences ────────────────
  generate i from 1 to 22 {
    circle starA {
      position: (i * 27 + 3, i * 17 + 5)
      radius: 1
      color: #ffffff
      alpha: 0.12
      anchor: (0.5, 0.5)

      animate {
        property: alpha
        to: 0.04
        duration: i * 0.35 + 0.9
        easing: easeInOut
        yoyo: true
        loop: true
      }
    }
  }

  // ── starfield layer 2 — pure loopers, no sequences ────────────────
  generate i from 1 to 14 {
    circle starB {
      position: (i * 43 + 15, i * 26 + 12)
      radius: 1
      color: #c4b5fd
      alpha: 0.08
      anchor: (0.5, 0.5)

      animate {
        property: alpha
        to: 0.22
        duration: i * 0.28 + 1.1
        easing: easeInOut
        yoyo: true
        loop: true
      }
    }
  }

  // ── outer glow — pure looper ──────────────────────────────────────
  circle glowOuter {
    position: (300, 200)
    radius: 160
    color: #4c1d95
    alpha: 0.1
    anchor: (0.5, 0.5)

    animate {
      property: scale
      to: (1.08, 1.08)
      duration: 4.0
      easing: easeInOut
      yoyo: true
      loop: true
    }
  }

  // ── inner glow — pure looper ──────────────────────────────────────
  circle glowInner {
    position: (300, 200)
    radius: 70
    color: #7c6af7
    alpha: 0.16
    anchor: (0.5, 0.5)

    animate {
      property: scale
      to: (1.14, 1.14)
      duration: 3.0
      easing: easeInOut
      yoyo: true
      loop: true
    }
  }

  // ── corner sparkle TL — pure looper ──────────────────────────────
  circle cTL {
    position: (40, 40)
    radius: 2
    color: #e2d9f3
    alpha: 0.0
    anchor: (0.5, 0.5)

    animate {
      property: alpha
      to: 0.55
      duration: 2.3
      easing: easeInOut
      yoyo: true
      loop: true
    }
  }

  // ── corner sparkle TR — pure looper ──────────────────────────────
  circle cTR {
    position: (560, 40)
    radius: 2
    color: #e2d9f3
    alpha: 0.0
    anchor: (0.5, 0.5)

    animate {
      property: alpha
      to: 0.55
      duration: 1.9
      easing: easeInOut
      yoyo: true
      loop: true
    }
  }

  // ── corner sparkle BL — pure looper ──────────────────────────────
  circle cBL {
    position: (40, 360)
    radius: 2
    color: #e2d9f3
    alpha: 0.0
    anchor: (0.5, 0.5)

    animate {
      property: alpha
      to: 0.55
      duration: 2.7
      easing: easeInOut
      yoyo: true
      loop: true
    }
  }

  // ── corner sparkle BR — pure looper ──────────────────────────────
  circle cBR {
    position: (560, 360)
    radius: 2
    color: #e2d9f3
    alpha: 0.0
    anchor: (0.5, 0.5)

    animate {
      property: alpha
      to: 0.55
      duration: 2.1
      easing: easeInOut
      yoyo: true
      loop: true
    }
  }

  // ── dot left — pure looper ────────────────────────────────────────
  circle dotL {
    position: (232, 200)
    radius: 3
    color: #7c6af7
    alpha: 0.85
    anchor: (0.5, 0.5)

    animate {
      property: position
      to: (232, 194)
      duration: 1.8
      easing: easeInOut
      yoyo: true
      loop: true
    }
  }

  // ── dot right — pure looper ───────────────────────────────────────
  circle dotR {
    position: (368, 200)
    radius: 3
    color: #7c6af7
    alpha: 0.85
    anchor: (0.5, 0.5)

    animate {
      property: position
      to: (368, 206)
      duration: 1.8
      easing: easeInOut
      yoyo: true
      loop: true
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // SEQUENCED OBJECTS — animate blocks have NO loop or yoyo
  // ════════════════════════════════════════════════════════════════════

  // ── rule left — hold then reveal ─────────────────────────────────
  line ruleL {
    position: (0, 0)
    points: [(48, 200), (228, 200)]
    thickness: 1
    color: #7c6af7
    alpha: 0.0

    animate {
      property: alpha
      to: 0.0
      duration: 0.5
      easing: linear
    }

    sequence {
      animate {
        property: alpha
        to: 0.4
        duration: 0.5
        easing: easeOut
      }
    }
  }

  // ── rule right — hold then reveal ────────────────────────────────
  line ruleR {
    position: (0, 0)
    points: [(372, 200), (552, 200)]
    thickness: 1
    color: #7c6af7
    alpha: 0.0

    animate {
      property: alpha
      to: 0.0
      duration: 0.5
      easing: linear
    }

    sequence {
      animate {
        property: alpha
        to: 0.4
        duration: 0.5
        easing: easeOut
      }
    }
  }

  // ── underline — hold then reveal ──────────────────────────────────
  line underline {
    position: (0, 0)
    points: [(196, 250), (404, 250)]
    thickness: 1
    color: #7c6af7
    alpha: 0.0

    animate {
      property: alpha
      to: 0.0
      duration: 0.9
      easing: linear
    }

    sequence {
      animate {
        property: alpha
        to: 0.35
        duration: 0.4
        easing: easeOut
      }
    }
  }

  // ── orbital particles — staggered entrance then oscillate ─────────
  generate i from 1 to 6 {
    circle orb {
      position: (300 + i * 28, 200)
      radius: 2
      color: #a78bfa
      alpha: 0.0
      anchor: (0.5, 0.5)

      animate {
        property: alpha
        to: 0.0
        duration: i * 0.18 + 0.35
        easing: linear
      }

      sequence {
        animate {
          property: alpha
          to: 0.7
          duration: 0.25
          easing: easeOut
        }
      }

      sequence {
        animate {
          property: position
          to: (300 - i * 28, 200)
          duration: i * 0.3 + 1.4
          easing: easeInOut
        }
      }

      sequence {
        animate {
          property: position
          to: (300 + i * 28, 200)
          duration: i * 0.3 + 1.4
          easing: easeInOut
        }
      }
    }
  }

  // ── "Created By" — fades in via sequence ──────────────────────────
  text labelBy {
    position: (300, 160)
    content: "Created By"
    fontSize: 11
    color: #9988cc
    alpha: 0.0
    anchor: (0.5, 0.5)

    animate {
      property: alpha
      to: 0.0
      duration: 0.4
      easing: linear
    }

    sequence {
      animate {
        property: alpha
        to: 0.8
        duration: 0.6
        easing: easeOut
      }
    }
  }

  // ── first name — slides up and fades in ───────────────────────────
  text nameFirst {
    position: (300, 203)
    content: "Mikhael Edman P."
    fontSize: 28
    color: #f0eeff
    alpha: 0.0
    anchor: (0.5, 0.5)

    animate {
      property: alpha
      to: 0.0
      duration: 0.55
      easing: linear
    }

    animate {
      property: position
      to: (300, 200)
      duration: 0.55
      easing: easeOut
    }

    sequence {
      animate {
        property: alpha
        to: 1.0
        duration: 0.7
        easing: easeOut
      }
    }
  }

  // ── last name — slides up and fades in with slight delay ──────────
  text nameLast {
    position: (300, 236)
    content: "Gomez"
    fontSize: 28
    color: #a78bfa
    alpha: 0.0
    anchor: (0.5, 0.5)

    animate {
      property: alpha
      to: 0.0
      duration: 0.75
      easing: linear
    }

    animate {
      property: position
      to: (300, 233)
      duration: 0.75
      easing: easeOut
    }

    sequence {
      animate {
        property: alpha
        to: 1.0
        duration: 0.6
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