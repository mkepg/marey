import type { AstValue, SceneFit } from "../types";
import { NAMED_COLORS } from "../lexer";
import { ParserState, describeToken } from "./state";

function parseMathPrimary(state: ParserState, depth: number): number {
  if (depth > 50) {
    state.throwError(`In ${state.currentContext}: Math expression is too deeply nested. Maximum depth is 50.`, state.peek());
  }
  const t = state.peek();
  if (t.type === "MINUS") {
    state.consume("MINUS");
    return -parseMathPrimary(state, depth + 1);
  }
  if (t.type === "NUMBER") {
    const numTok = state.consume("NUMBER");
    return numTok.value as number;
  }
  if (t.type === "IDENT") {
    const nameTok = state.consume("IDENT");
    const varName = nameTok.value as string;
    if (!(varName in state.env)) {
      state.throwError(`In ${state.currentContext}: Undefined variable '${varName}'.`, nameTok);
    }
    const val = state.env[varName];
    if (val.kind !== "number") {
      state.throwError(`In ${state.currentContext}: Variable '${varName}' is of type '${val.kind}'. Math expressions require numeric values.`, nameTok);
    }
    return val.value;
  }
  if (t.type === "LPAREN") {
    state.consume("LPAREN");
    const val = parseMathExpr(state, 0, depth + 1);
    const bad = state.peek();
    if (bad.type !== "RPAREN") {
      state.throwError(`In ${state.currentContext}: Expected ')' to close the math expression, but found ${describeToken(bad)}.`, bad);
    }
    state.consume("RPAREN");
    return val;
  }
  state.throwError(`In ${state.currentContext}: Expected a number, variable, or math expression, but found ${describeToken(t)}.`, t);
}

function parseMathExpr(state: ParserState, minPrec: number, depth: number): number {
  if (depth > 50) {
    state.throwError(`In ${state.currentContext}: Math expression is too deeply nested. Maximum depth is 50.`, state.peek());
  }
  let left = parseMathPrimary(state, depth);
  while (true) {
    const t = state.peek();
    let prec = 0;
    if (t.type === "PLUS" || t.type === "MINUS") prec = 1;
    else if (t.type === "STAR" || t.type === "SLASH") prec = 2;
    else break;
    if (prec <= minPrec) break;
    state.consume();
    const right = parseMathExpr(state, prec, depth + 1);
    if (t.type === "PLUS")  left = left + right;
    else if (t.type === "MINUS") left = left - right;
    else if (t.type === "STAR")  left = left * right;
    else if (t.type === "SLASH") {
      if (right === 0) state.throwError(`In ${state.currentContext}: Division by zero.`, t);
      left = left / right;
    }
  }
  return left;
}

export function parseValue(state: ParserState, currentKey?: string): AstValue {
  const t = state.peek();
  const { line, col } = t;

  if (t.type === "BOOLEAN") {
    state.consume();
    return { kind: "boolean", value: t.value as boolean, line, col };
  }
  if (t.type === "EASING") {
    state.consume();
    return { kind: "easing", value: t.value as string, line, col };
  }
  if (t.type === "HEX_COLOR") {
    state.consume();
    return { kind: "color", value: t.value as string, line, col };
  }
  if (t.type === "NAMED_COLOR") {
    state.consume();
    return { kind: "color", value: NAMED_COLORS[t.value as string], line, col };
  }
  if (t.type === "STRING") {
    const strTok = state.consume();
    if (state.peek().type === "PLUS") {
      state.throwError(`In ${state.currentContext}: String concatenation using '+' is not supported.`, state.peek());
    }
    return { kind: "string", value: strTok.value as string, line, col };
  }
  if (t.type === "SCENE_FIT") {
    state.consume();
    return { kind: "sceneFit", value: t.value as SceneFit, line, col };
  }

  // "indefinitely" is only valid as a duration value on physics blocks.
  // We emit it as an IndefinitelyValue so the type checker can validate
  // placement (e.g. forbid it inside sequence blocks).
  if (t.type === "DURATION_INDEFINITELY") {
    state.consume();
    return { kind: "indefinitely", line, col };
  }

  if (t.type === "LBRACKET") {
    const openTok = state.consume("LBRACKET");
    const pts: Array<{ x: number; y: number }> = [];
    while (state.peek().type !== "RBRACKET") {
      if (state.peek().type === "EOF") {
        state.throwError(`In ${state.currentContext}: Point list opened at line ${openTok.line}, column ${openTok.col} was not closed before end of file. Add a closing ']'.`, openTok);
      }
      if (state.peek().type !== "LPAREN") {
        const bad = state.peek();
        state.throwError(`In ${state.currentContext}: Expected a point '(x, y)' inside the point list, but found ${describeToken(bad)}. Each entry in a point list must be a point, e.g. [(0,0), (100,0), (50,80)].`, bad);
      }
      const ptOpen = state.consume("LPAREN");
      const x = parseMathExpr(state, 0, 0);
      state.consume("COMMA");
      const y = parseMathExpr(state, 0, 0);
      if (state.peek().type !== "RPAREN") {
        const bad = state.peek();
        state.throwError(`In ${state.currentContext}: Expected ')' to close the point opened at line ${ptOpen.line}, column ${ptOpen.col}, but found ${describeToken(bad)}.`, bad);
      }
      state.consume("RPAREN");
      pts.push({ x, y });
      if (state.peek().type !== "RBRACKET") {
        state.consume("COMMA");
      }
    }
    state.consume("RBRACKET");
    return { kind: "pointList", value: pts, line, col };
  }

  let isPoint = false;
  if (t.type === "LPAREN") {
    let nesting = 0;
    for (let i = state.pos; i < state.tokens.length; i++) {
      const tok = state.tokens[i];
      if (tok.type === "LPAREN") nesting++;
      else if (tok.type === "RPAREN") {
        nesting--;
        if (nesting === 0) break;
      } else if (tok.type === "COMMA" && nesting === 1) {
        isPoint = true;
        break;
      }
    }
  }
  if (isPoint) {
    const openTok = state.consume("LPAREN");
    const x = parseMathExpr(state, 0, 0);
    state.consume("COMMA");
    const y = parseMathExpr(state, 0, 0);
    if (state.peek().type === "COMMA") {
      const extra = state.peek();
      state.throwError(`In ${state.currentContext}: A point takes exactly two numbers, but found an extra ',' at line ${extra.line}, column ${extra.col}. Point syntax is (x, y) — for example (400, 300).`, extra);
    }
    if (state.peek().type !== "RPAREN") {
      const bad = state.peek();
      state.throwError(`In ${state.currentContext}: Expected ')' to close the point opened at line ${openTok.line}, column ${openTok.col}, but found ${describeToken(bad)}.`, bad);
    }
    state.consume("RPAREN");
    return { kind: "point", x, y, line, col };
  }

  const isMathStart = t.type === "NUMBER" || t.type === "MINUS" || t.type === "LPAREN" ||
    (t.type === "IDENT" && state.env[t.value as string]?.kind === "number");
  if (isMathStart) {
    const val = parseMathExpr(state, 0, 0);
    return { kind: "number", value: val, line, col };
  }

  if (t.type === "IDENT") {
    const varName = t.value as string;
    if (currentKey === "property") {
      state.consume("IDENT");
      return { kind: "animProperty", value: varName, line, col };
    }
    if (varName in state.env) {
      state.consume("IDENT");
      const envVal = state.env[varName];
      return { ...envVal, line, col };
    }
    state.throwError(`In ${state.currentContext}: Undefined variable '${varName}'. Bare names cannot be used as values unless they are declared with 'def'. Variables defined inside 'generate' blocks are strictly block-scoped and cannot be accessed outside of them.`, t);
  }

  if (t.type === "KEYWORD") {
    state.throwError(`In ${state.currentContext}: '${t.value as string}' is an object keyword and cannot be used as a property value.`, t);
  }
  if (t.type === "RBRACE" || t.type === "RBRACKET" || t.type === "RPAREN" || t.type === "EOF") {
    state.throwError(`In ${state.currentContext}: Unexpected ${describeToken(t)} where a property value was expected.`, t);
  }
  state.throwError(`In ${state.currentContext}: Unexpected ${describeToken(t)} where a property value was expected.`, t);
}