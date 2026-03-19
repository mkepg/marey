import type { CompileResult, LogEntry, CompilerError } from "./types";
import type { IRSceneNode } from "./sceneIR";
import { renderScene } from "./renderer";
import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";

export interface CompileResultWithCleanup extends CompileResult {
  cleanup: (() => void) | null;
}

let compilerWorker: Worker | null = null;
let currentJobId = 0;
let activeResolve: ((val: CompileResultWithCleanup) => void) | null = null;
let activeMessageHandler: ((e: MessageEvent) => void) | null = null;

function createWorker(): Worker {
  const worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
  worker.onerror = (err: ErrorEvent) => {
    if (activeResolve) {
      activeResolve({
        success: false,
        logs: [{ kind: "error", text: `[system] Compiler crashed or ran out of memory: ${err.message}` }],
        errors: [{ phase: "SYSTEM", message: `Compiler crashed: ${err.message}` }],
        cleanup: null
      });
      activeResolve = null;
    }
    if (activeMessageHandler) {
        worker.removeEventListener('message', activeMessageHandler);
        activeMessageHandler = null;
    }
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

  if (activeResolve) {
    activeResolve({ logs: [], errors: [], success: false, cleanup: null });
    activeResolve = null;
    if (compilerWorker) {
      compilerWorker.terminate();
      compilerWorker = null;
    }
  }

  if (!compilerWorker) {
    compilerWorker = createWorker();
  }

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
      const errors: CompilerError[] = data.errors || [];

      if (!data.success || !data.ir) {
        resolve({ logs, errors, success: false, cleanup: null });
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

        resolve({ logs, errors: [], success: true, cleanup });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logs.push({
          kind: "error",
          text: `[render]  ${errorMsg}`
        });
        resolve({ logs, errors: [{ phase: "RENDER", message: errorMsg }], success: false, cleanup: null });
      }
    };

    workerInstance.addEventListener('message', activeMessageHandler);
    workerInstance.postMessage({ id: jobId, source });
  });
}

export function lint(source: string): CompilerError[] {
  try {
    const tokens = lex(source);
    const { ast, errors: parseErrors } = parse(tokens);
    
    if (parseErrors.length > 0) {
       return parseErrors.map(err => ({
           phase: "PARSE",
           message: err.message,
           line: err.line,
           col: err.col,
           endLine: err.endLine,
           endCol: err.endCol
       }));
    }

    if (ast) {
        const { errors } = typeCheck(ast);
        return errors.map(msg => ({ phase: "TYPE", message: msg }));
    }
    return [];

  } catch (raw: unknown) {
    if (raw !== null && typeof raw === "object" && "phase" in raw && "message" in raw) {
      const e = raw as CompilerError;
      return [{
        phase: (e.phase ?? "error").toUpperCase(),
        message: e.message,
        line: e.line,
        col: e.col,
        endLine: e.endLine,
        endCol: e.endCol
      }];
    }
    if (raw instanceof Error) {
      return [{ phase: "RUNTIME", message: raw.message }];
    }
    return [{ phase: "ERROR", message: String(raw) }];
  }
}

export type { CompileResult, LogEntry, LogKind, CompilerError } from "./types";