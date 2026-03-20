import type { CompileResult, LogEntry, CompilerError, LintResult } from "./types";
import type { IRSceneNode } from "./sceneIR";
import { renderScene } from "./renderer";

export interface CompileResultWithCleanup extends CompileResult {
  cleanup: (() => void) | null;
  _irPayload?: IRSceneNode;
}

let compilerWorker: Worker | null = null;
let currentJobId = 0;
let activeCompileResolve: ((val: CompileResultWithCleanup) => void) | null = null;
const activeLintResolves = new Map<number, (errors: LintResult) => void>();

function createWorker(): Worker {
  const worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });

  worker.onerror = (err: ErrorEvent) => {
    if (activeCompileResolve) {
      activeCompileResolve({
        success: false,
        logs: [{ kind: "error", text: `[system] Compiler crashed or ran out of memory: ${err.message}` }],
        errors: [{ phase: "SYSTEM", message: `Compiler crashed: ${err.message}` }],
        cleanup: null
      });
      activeCompileResolve = null;
    }
    for (const resolve of activeLintResolves.values()) {
        resolve({ errors: [{ phase: "SYSTEM", message: `Linter crashed: ${err.message}` }], symbols: [] });
    }
    activeLintResolves.clear();
    worker.terminate();
    compilerWorker = null;
  };

  worker.onmessage = async (e: MessageEvent) => {
    const data = e.data;
    if (data.action === "lint") {
      const resolve = activeLintResolves.get(data.id);
      if (resolve) {
        resolve({ errors: data.errors || [], symbols: data.symbols || [] });
        activeLintResolves.delete(data.id);
      }
      return;
    }

    if (data.action === "compile" && activeCompileResolve) {
      const resolve = activeCompileResolve;
      activeCompileResolve = null;

      const logs: LogEntry[] = data.logs;
      const errors: CompilerError[] = data.errors || [];

      if (!data.success || !data.ir) {
        resolve({ logs, errors, success: false, cleanup: null });
        return;
      }

      try {
        const sceneIR = data.ir as IRSceneNode;
        logs.push({ kind: "info", text: "[pixi]    initialising renderer..." });
        resolve({ logs, errors: [], success: true, cleanup: null, _irPayload: sceneIR });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logs.push({
          kind: "error",
          text: `[render]  ${errorMsg}`
        });
        resolve({ logs, errors: [{ phase: "RENDER", message: errorMsg }], success: false, cleanup: null });
      }
    }
  };

  return worker;
}

export async function compile(
  source: string,
  hostElement: HTMLDivElement,
  isDark: boolean | (() => boolean)
): Promise<CompileResultWithCleanup> {
  currentJobId += 1;
  const jobId = currentJobId;

  if (activeCompileResolve) {
    activeCompileResolve({ logs: [], errors: [], success: false, cleanup: null });
    activeCompileResolve = null;
  }

  if (!compilerWorker) compilerWorker = createWorker();

  const t0 = performance.now();

  return new Promise((resolve) => {
    activeCompileResolve = async (result: CompileResultWithCleanup) => {
      if (!result.success || !result._irPayload) {
        resolve(result);
        return;
      }
      try {
        const currentIsDark = typeof isDark === "function" ? isDark() : isDark;
        const cleanup = await renderScene(result._irPayload, hostElement, currentIsDark);
        
        const elapsed = (performance.now() - t0).toFixed(1);
        result.logs.push({
          kind: "ok",
          text: `[pixi]    rendered via WebGL/WebGPU in ${elapsed}ms`,
        });
        resolve({ ...result, cleanup });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        result.logs.push({ kind: "error", text: `[render]  ${errorMsg}` });
        resolve({ logs: result.logs, errors: [{ phase: "RENDER", message: errorMsg }], success: false, cleanup: null });
      }
    };

    compilerWorker!.postMessage({ id: jobId, action: "compile", source });
  });
}

export async function lint(source: string): Promise<LintResult> {
  currentJobId += 1;
  const jobId = currentJobId;

  if (!compilerWorker) compilerWorker = createWorker();

  return new Promise((resolve) => {
    activeLintResolves.set(jobId, resolve);
    compilerWorker!.postMessage({ id: jobId, action: "lint", source });
  });
}

export type { CompileResult, LogEntry, LogKind, CompilerError, LintResult } from "./types";