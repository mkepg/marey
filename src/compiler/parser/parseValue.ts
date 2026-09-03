import type { AstValue } from "../types";
import type { ParserState } from "./state";
import { parseExpr, ROOT_CTX } from "./parseExpr";

export function parseValue(state: ParserState, currentKey?: string): AstValue {
  const t = state.peek();

  // `property: position` names an animatable property rather than referencing
  // a binding, so it is resolved before the expression grammar sees a bare
  // identifier it would try to look up in `state.env`.
  if (t.type === "IDENT" && currentKey === "property") {
    const tok = state.consume("IDENT");
    return {
      kind: "animProperty",
      value: tok.value as string,
      line: t.line, col: t.col, endLine: t.line, endCol: tok.endCol,
    };
  }

  return parseExpr(state, 0, ROOT_CTX);
}
