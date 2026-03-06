import type { CompileResult, LogEntry } from "./types";
import type { IRSceneNode } from "./sceneIR";
import { renderScene } from "./renderer";

export interface CompileResultWithCleanup extends CompileResult {
  cleanup: (() => void) | null;
}

// Persist the worker instance so we don't pay the startup cost on every keystroke
let compilerWorker: Worker | null = null;
let currentJobId = 0;

/**
 * Full compile pipeline (Decoupled):
 *
 * [Main Thread]    Source String
 * ↓ (postMessage)
 * [Web Worker]     Lexer → Parser → Type Checker → Scene IR
 * ↓ (postMessage)
 * [Main Thread]    Scene IR → Renderer Adapter → Canvas Output
 */
export async function compile(
  source: string,
  hostElement: HTMLDivElement,
  isDark: boolean
): Promise<CompileResultWithCleanup> {
  
  if (!compilerWorker) {
    // Vite handles this syntax natively to bundle the worker
    compilerWorker = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
  }

  currentJobId += 1;
  const jobId = currentJobId;
  const t0 = performance.now();

  return new Promise((resolve) => {
    const handleMessage = async (e: MessageEvent) => {
      const data = e.data;
      
      // Ignore stale responses if the user typed quickly and spawned a newer job
      if (data.id !== jobId) return; 

      compilerWorker?.removeEventListener('message', handleMessage);

      const logs: LogEntry[] = data.logs;

      if (!data.success || !data.ir) {
        resolve({ logs, success: false, cleanup: null });
        return;
      }

      // The IR successfully crossed the thread boundary. Render it on the main DOM thread.
      try {
        const sceneIR = data.ir as IRSceneNode;
        logs.push({ kind: "info", text: "[pixi]    initialising renderer..." });
        
        const cleanup = await renderScene(sceneIR, hostElement, isDark);
        
        const elapsed = (performance.now() - t0).toFixed(1);
        logs.push({
          kind: "ok",
          text: `[pixi]    rendered via WebGL/WebGPU in ${elapsed}ms`,
        });
        
        resolve({ logs, success: true, cleanup });
      } catch (err: unknown) {
        logs.push({ 
          kind: "error", 
          text: `[render]  ${err instanceof Error ? err.message : String(err)}` 
        });
        resolve({ logs, success: false, cleanup: null });
      }
    };

    compilerWorker?.addEventListener('message', handleMessage);
    
    // Send the raw source string to the background thread
    compilerWorker?.postMessage({ id: jobId, source });
  });
}

export type { CompileResult, LogEntry, LogKind } from "./types";