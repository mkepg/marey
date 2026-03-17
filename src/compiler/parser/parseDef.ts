import type { ParserState } from "./state";
import { parseValue } from "./parseValue";

export function parseDef(state: ParserState): void {
  state.consume("KEYWORD"); 
  
  if (state.peek().type !== "IDENT") {
    const bad = state.peek();
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Expected a variable name after 'def', but found ${bad.value}.`,
      line: bad.line,
      col: bad.col,
    };
  }
  
  const nameTok = state.consume("IDENT");
  const varName = nameTok.value as string;
  
  if (varName in state.env) {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Variable '${varName}' is already defined. Variables in Declare are strictly immutable and cannot be shadowed or reassigned.`,
      line: nameTok.line,
      col: nameTok.col,
    };
  }
  
  state.consume("EQUALS");
  
  const prevContext = state.currentContext;
  state.currentContext = `variable declaration '${varName}'`;
  const val = parseValue(state);
  state.currentContext = prevContext;
  
  state.env[varName] = val;
}