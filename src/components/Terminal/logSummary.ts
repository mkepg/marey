import type { CompileStatus } from "../../store";

/**
 * The one line the phone layout folds the log into (spec 6B §4): "compiled,
 * 0 errors", "2 errors", or "idle" before anything has compiled.
 */
export function logSummary(status: CompileStatus, errorCount: number): string {
  if (status === "ok") return "compiled, 0 errors";
  if (status === "error") {
    // A failure the compiler reports without a positioned error (a renderer
    // crash, say) still failed, so it counts as one.
    const n = Math.max(errorCount, 1);
    return n === 1 ? "1 error" : `${n} errors`;
  }
  return "idle";
}
