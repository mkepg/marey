import { create } from "zustand";
import type { LogEntry, CompilerError } from "../compiler";

export type Theme = "dark" | "light";
export type CompileStatus = "idle" | "ok" | "error";

export interface AppState {
  code: string;
  theme: Theme;
  logs: LogEntry[];
  errors: CompilerError[];
  compileStatus: CompileStatus;
  setCode: (code: string) => void;
  toggleTheme: () => void;
  setLogs: (logs: LogEntry[]) => void;
  setErrors: (errors: CompilerError[]) => void;
  setCompileStatus: (status: CompileStatus) => void;
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
    z: 1
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
      z: 2

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

export const useAppStore = create<AppState>((set) => ({
  code: DEFAULT_CODE,
  theme: "dark",
  logs: [],
  errors: [],
  compileStatus: "idle",
  setCode: (code) => set({ code }),
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
  setLogs: (logs) => set({ logs }),
  setErrors: (errors) => set({ errors }),
  setCompileStatus: (compileStatus) => set({ compileStatus }),
}));