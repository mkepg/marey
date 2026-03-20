import type { ParserState } from "./state";
import { parseValue } from "./parseValue";

export function parseDef(state: ParserState): void {
  state.consume("KEYWORD");

  if (state.peek().type !== "IDENT") {
    const bad = state.peek();
    state.throwError(`In ${state.currentContext}: Expected a variable name after 'def', but found ${bad.value}.`, bad);
  }

  const nameTok = state.consume("IDENT");
  const varName = nameTok.value as string;

  // Enforce consistent identifier rules: no leading underscores.
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(varName)) {
    state.throwError(`In ${state.currentContext}: Invalid variable name '${varName}'. Variables must start with a letter and contain only alphanumeric chars or underscores.`, nameTok);
  }

  if (varName in state.env) {
    state.throwError(`In ${state.currentContext}: Variable '${varName}' is already defined. Variables in Declare are strictly immutable and cannot be shadowed or reassigned.`, nameTok);
  }

  state.consume("EQUALS");

  const prevContext = state.currentContext;
  state.currentContext = `variable declaration '${varName}'`;

  const val = parseValue(state);

  state.currentContext = prevContext;
  state.env[varName] = val;
}