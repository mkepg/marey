import { describeToken, type ParserState } from "./state";
import { parseValue } from "./parseValue";
import { reservedExpressionWordHint } from "./parseProperty";

export function parseBinding(state: ParserState): void {
  state.consume("KEYWORD");

  if (state.peek().type !== "IDENT") {
    const bad = state.peek();
    state.throwError(`In ${state.currentContext}: Expected a variable name after 'let', but found ${describeToken(bad)}.${reservedExpressionWordHint(bad)}`, bad);
  }

  const nameTok = state.consume("IDENT");
  const varName = nameTok.value as string;

  // Enforce consistent identifier rules: no leading underscores.
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(varName)) {
    state.throwError(`In ${state.currentContext}: Invalid variable name '${varName}'. Variables must start with a letter and contain only alphanumeric chars or underscores.`, nameTok);
  }

  // Use hasOwnProperty to only check the current scope, allowing shadowing of outer scopes.
  if (Object.prototype.hasOwnProperty.call(state.env, varName)) {
    state.throwError(`In ${state.currentContext}: Variable '${varName}' is already defined in this immediate scope.`, nameTok);
  }

  state.consume("EQUALS");

  const prevContext = state.currentContext;
  state.currentContext = `variable declaration '${varName}'`;

  const val = parseValue(state);

  state.currentContext = prevContext;
  state.env[varName] = val;
}
