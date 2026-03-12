import type { AstNode } from "../types";
import type { IRSceneNode } from "../sceneIR";
import { collectErrors } from "./validator";
import { buildIR } from "./builder";

export interface TypeCheckResult {
  readonly errors: ReadonlyArray<string>;
  readonly ir: IRSceneNode | null;
}

export function typeCheck(ast: AstNode): TypeCheckResult {
  const errors = collectErrors(ast);
  
  if (errors.length > 0) {
    return { errors, ir: null };
  }

  const ir = buildIR(ast);
  return { errors: [], ir };
}