import type { CompileResult, LogEntry } from "./types";
import type { IRSceneNode } from "./sceneIR";
import { renderScene } from "./renderer";

export interface CompileResultWithCleanup extends CompileResult {
  cleanup: (() => void) | null;
}

let compilerWorker: Worker | null = null;
let currentJobId = 0;
let activeResolve: ((val: CompileResultWithCleanup) => void) | null = null;
let activeMessageHandler: ((e: MessageEvent) => void) | null = null;

function createWorker(): Worker {
  const worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
  
  // Handle fatal worker crashes (e.g., OOM or infinite loops)
  worker.onerror = (err: ErrorEvent) => {
    if (activeResolve) {
      activeResolve({
        success: false,
        logs: [{ kind: "error", text: `[system] Compiler crashed or ran out of memory: ${err.message}` }],
        cleanup: null
      });
      activeResolve = null;
    }
    if (activeMessageHandler) {
        worker.removeEventListener('message', activeMessageHandler);
        activeMessageHandler = null;
    }
    // Terminate the crashed worker and clear the reference to spawn a fresh one next time
    worker.terminate();
    compilerWorker = null;
  };
  return worker;
}

export async function compile(
  source: string,
  hostElement: HTMLDivElement,
  isDark: boolean
): Promise<CompileResultWithCleanup> {
  currentJobId += 1;
  const jobId = currentJobId;

  // Optimize Worker Queue: Abort any ongoing compilation to process this new one immediately
  if (activeResolve) {
    activeResolve({ logs: [], success: false, cleanup: null }); // safely ignored by the UI hook
    activeResolve = null;
    if (compilerWorker) {
      compilerWorker.terminate();
      compilerWorker = null;
    }
  }

  if (!compilerWorker) {
    compilerWorker = createWorker();
  }

  // Capture the worker in a local constant to satisfy TypeScript's strict null checks
  // and ensure we are listening to/posting to the correct instance.
  const workerInstance = compilerWorker;
  const t0 = performance.now();

  return new Promise((resolve) => {
    activeResolve = resolve;

    activeMessageHandler = async (e: MessageEvent) => {
      const data = e.data;
      if (data.id !== jobId) return;

      if (activeMessageHandler) {
          workerInstance.removeEventListener('message', activeMessageHandler);
      }
      activeMessageHandler = null;
      activeResolve = null;

      const logs: LogEntry[] = data.logs;
      if (!data.success || !data.ir) {
        resolve({ logs, success: false, cleanup: null });
        return;
      }

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

    workerInstance.addEventListener('message', activeMessageHandler);
    workerInstance.postMessage({ id: jobId, source });
  });
}

export type { CompileResult, LogEntry, LogKind } from "./types";