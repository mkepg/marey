import { ParserState, describeToken } from "./state";
export function parseTemplate(state: ParserState): void {
  state.consume("KEYWORD");
  if (state.peek().type !== "IDENT") {
    const bad = state.peek();
    state.throwError(`Expected a template name after 'template', but found ${describeToken(bad)}.`, bad);
  }
  const nameTok = state.consume("IDENT");
  const templateName = nameTok.value as string;
  if (state.templates[templateName]) {
    state.throwError(`Template '${templateName}' is already defined.`, nameTok);
  }
  state.consume("LPAREN");
  const params: string[] = [];
  while (state.peek().type !== "RPAREN" && state.peek().type !== "EOF") {
    if (state.peek().type !== "IDENT") {
      const bad = state.peek();
      state.throwError(`Expected a parameter name, but found ${describeToken(bad)}.`, bad);
    }
    params.push(state.consume("IDENT").value as string);
    if (state.peek().type !== "RPAREN") {
      state.consume("COMMA");
    }
  }
  state.consume("RPAREN");
  const braceTok = state.consume("LBRACE");
  const startPos = state.pos;
  let nesting = 1;
  let endPos = state.pos;
  while (endPos < state.tokens.length) {
    const t = state.tokens[endPos];
    if (t.type === "LBRACE") nesting++;
    else if (t.type === "RBRACE") {
      nesting--;
      if (nesting === 0) break;
    }
    endPos++;
  }
  if (nesting !== 0) {
    state.throwError(`Template '${templateName}' was not closed before end of file. Add a closing '}'.`, braceTok);
  }
  state.templates[templateName] = {
    name: templateName,
    params,
    startPos,
    endPos
  };
  state.pos = endPos + 1;
}