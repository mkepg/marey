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
    
    const paramTok = state.consume("IDENT");
    const paramName = paramTok.value as string;
    
    // Safety check: Prevent template parameter shadowing
    if (params.includes(paramName)) {
      state.throwError(`Duplicate parameter name '${paramName}' in template '${templateName}'. Parameter names must be unique.`, paramTok);
    }
    
    params.push(paramName);

    if (state.peek().type !== "RPAREN") {
      state.consume("COMMA");
    }
  }
  
  state.consume("RPAREN");

  const braceTok = state.consume("LBRACE");
  const startPos = state.pos;
  let nesting = 1;
  let endPos = state.pos;

  // Fast-forward to find the end of the template block for delayed evaluation
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