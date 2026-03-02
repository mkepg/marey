import { create } from "zustand";
import type { LogEntry } from "../compiler";

export type Theme = "dark" | "light";
export type CompileStatus = "idle" | "ok" | "error";

export interface AppState {
  code: string;
  theme: Theme;
  logs: LogEntry[];
  compileStatus: CompileStatus;
  setCode: (code: string) => void;
  toggleTheme: () => void;
  setLogs: (logs: LogEntry[]) => void;
  setCompileStatus: (status: CompileStatus) => void;
}

export const DEFAULT_CODE = `scene {
  size: (600, 400)
  scaleMode: contain
  background: #0f0f1a
  
  text heading {
    position: (24, 42)
    content: "Declare — Scene Preview"
    fontSize: 13
    color: #888899
  }
  
  rectangle ground {
    position: (0, 340)
    size: (600, 60)
    color: #1e1e2e
  }
  
  circle sun {
    position: (480, 80)
    radius: 38
    color: #ffd166
    alpha: 0.92
  }
  
  polygon mountain {
    points: [(60,340),(200,160),(340,340)]
    color: #2d2d44
  }
  
  polygon mountain2 {
    points: [(180,340),(300,200),(440,340)]
    color: #252538
  }
  
  group player {
    position: (130, 270)
    
    circle body {
      position: (0, 0)
      radius: 18
      color: #ef476f
    }
    
    circle head {
      position: (0, -30)
      radius: 11
      color: #ef476f
    }
  }
  
  group collectible {
    position: (310, 295)
    
    circle glow {
      position: (0, 0)
      radius: 14
      color: #ffd166
      alpha: 0.25
    }
    
    circle gem {
      position: (0, 0)
      radius: 7
      color: #ffd166
    }
  }
}`;

export const useAppStore = create<AppState>((set) => ({
  code: DEFAULT_CODE,
  theme: "dark",
  logs: [],
  compileStatus: "idle",
  setCode: (code) => set({ code }),
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
  setLogs: (logs) => set({ logs }),
  setCompileStatus: (compileStatus) => set({ compileStatus }),
}));