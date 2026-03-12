import type { AstValue, SceneFit } from "../types";
import { NAMED_COLORS } from "../lexer";
import { ParserState, describeToken } from "./state";

export function parseValue(state: ParserState): AstValue {
  const t = state.peek();

  if (t.type === "NUMBER") {
    state.consume();
    return { kind: "number", value: t.value as number };
  }
  if (t.type === "HEX_COLOR") {
    state.consume();
    return { kind: "color", value: t.value as string };
  }
  if (t.type === "NAMED_COLOR") {
    state.consume();
    return { kind: "color", value: NAMED_COLORS[t.value as string] };
  }
  if (t.type === "STRING") {
    state.consume();
    return { kind: "string", value: t.value as string };
  }
  if (t.type === "SCENE_FIT") {
    state.consume();
    return { kind: "sceneFit", value: t.value as SceneFit };
  }

  if (t.type === "LPAREN") {
    const openTok = state.consume("LPAREN");
    const xTok    = state.consume("NUMBER");
    state.consume("COMMA");
    const yTok    = state.consume("NUMBER");

    if (state.peek().type === "COMMA") {
      const extra = state.peek();
      throw {
        phase: "PARSE" as const,
        message: `In ${state.currentContext}: A point takes exactly two numbers, but found an extra ',' at line ${extra.line}, column ${extra.col}. Point syntax is (x, y) — for example (400, 300).`,
        line: extra.line,
        col:  extra.col,
      };
    }

    if (state.peek().type !== "RPAREN") {
      const bad = state.peek();
      throw {
        phase: "PARSE" as const,
        message: `In ${state.currentContext}: Expected ')' to close the point opened at line ${openTok.line}, column ${openTok.col}, but found ${describeToken(bad)}.`,
        line: bad.line,
        col:  bad.col,
      };
    }
    state.consume("RPAREN");
    return { kind: "point", x: xTok.value as number, y: yTok.value as number };
  }

  if (t.type === "LBRACKET") {
    const openTok = state.consume("LBRACKET");
    const pts: Array<{ x: number; y: number }> = [];

    while (state.peek().type !== "RBRACKET") {
      if (state.peek().type === "EOF") {
        throw {
          phase: "PARSE" as const,
          message: `In ${state.currentContext}: Point list opened at line ${openTok.line}, column ${openTok.col} was not closed before end of file. Add a closing ']'.`,
          line: openTok.line,
          col:  openTok.col,
        };
      }

      if (state.peek().type !== "LPAREN") {
        const bad = state.peek();
        throw {
          phase: "PARSE" as const,
          message: `In ${state.currentContext}: Expected a point '(x, y)' inside the point list, but found ${describeToken(bad)}. Each entry in a point list must be a point, e.g. [(0,0), (100,0), (50,80)].`,
          line: bad.line,
          col:  bad.col,
        };
      }

      const ptOpen = state.consume("LPAREN");
      const x      = state.consume("NUMBER");
      state.consume("COMMA");
      const y      = state.consume("NUMBER");

      if (state.peek().type !== "RPAREN") {
        const bad = state.peek();
        throw {
          phase: "PARSE" as const,
          message: `In ${state.currentContext}: Expected ')' to close the point opened at line ${ptOpen.line}, column ${ptOpen.col}, but found ${describeToken(bad)}.`,
          line: bad.line,
          col:  bad.col,
        };
      }
      
      state.consume("RPAREN");
      pts.push({ x: x.value as number, y: y.value as number });

      // Strict comma constraint (Fix applied)
      if (state.peek().type !== "RBRACKET") {
        state.consume("COMMA");
      }
    }

    if (pts.length === 0) {
      throw {
        phase: "PARSE" as const,
        message: `In ${state.currentContext}: Empty point list '[]' is not valid. A point list must contain at least 3 points for polygon use.`,
        line: openTok.line,
        col:  openTok.col,
      };
    }
    state.consume("RBRACKET");
    return { kind: "pointList", value: pts };
  }

  if (t.type === "IDENT") {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: '${t.value as string}' is not a recognised value. Bare names cannot be used as values in Declare v1.0.`,
      line: t.line,
      col:  t.col,
    };
  }

  if (t.type === "KEYWORD") {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: '${t.value as string}' is an object keyword and cannot be used as a property value.`,
      line: t.line,
      col:  t.col,
    };
  }

  if (t.type === "RBRACE" || t.type === "RBRACKET" || t.type === "RPAREN") {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Unexpected ${describeToken(t)} where a property value was expected.`,
      line: t.line,
      col:  t.col,
    };
  }

  if (t.type === "EOF") {
    throw {
      phase: "PARSE" as const,
      message: `In ${state.currentContext}: Reached end of file while reading a property value. A value is required after ':'.`,
      line: t.line,
      col:  t.col,
    };
  }

  throw {
    phase: "PARSE" as const,
    message: `In ${state.currentContext}: Unexpected ${describeToken(t)} where a property value was expected.`,
    line: t.line,
    col:  t.col,
  };
}