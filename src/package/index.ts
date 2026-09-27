import { compileSource } from "../compiler/compileSource";
import type { IRSceneNode } from "../compiler/sceneIR";
import type { CompilerError } from "../compiler/types";

/** What `compile` returns. Narrower than the internal `CompileOutcome` on purpose (spec §2.3). */
export interface CompileResult {
  readonly ok: boolean;
  readonly ir: IRSceneNode | null;
  readonly errors: ReadonlyArray<CompilerError>;
}

/** Compile Marey source to its Scene IR. Pure and synchronous: no DOM, no rendering. */
export function compile(source: string): CompileResult {
  const { ok, ir, errors } = compileSource(source);
  return { ok, ir, errors };
}

export type * from "../compiler/sceneIR";
export type { CompilerError } from "../compiler/types";
