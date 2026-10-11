import type { AstValue, EdgeWord } from "../types";
import { describeToken, type ParserState } from "./state";
import { parseExpr, ROOT_CTX } from "./parseExpr";

/**
 * `bounds: [left, right]` lists scene edges by bare word. The words are read
 * only here, by key name, so `left`, `top` and the rest stay ordinary names
 * everywhere else. Whether each word is actually an edge is the type
 * checker's question: it needs one position per word.
 */
function parseEdges(state: ParserState): AstValue {
  const open = state.consume("LBRACKET");
  const words: EdgeWord[] = [];
  const reject = (): never => {
    const bad = state.consume();
    return state.throwError(
      `In ${state.currentContext}: 'bounds' lists scene edges by name (left, right, top, bottom), but found ${describeToken(bad)}.`,
      bad,
    );
  };

  while (state.peek().type !== "RBRACKET") {
    if (state.peek().type !== "IDENT") reject();
    const tok = state.consume("IDENT");
    words.push({ name: tok.value as string, line: tok.line, col: tok.col, endLine: tok.line, endCol: tok.endCol });
    if (state.peek().type === "COMMA") state.consume("COMMA");
    else if (state.peek().type !== "RBRACKET") reject();
  }
  const close = state.consume("RBRACKET");
  return { kind: "edges", value: words, line: open.line, col: open.col, endLine: close.line, endCol: close.endCol };
}

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

  if (t.type === "LBRACKET" && currentKey === "bounds") return parseEdges(state);

  return parseExpr(state, 0, ROOT_CTX);
}
