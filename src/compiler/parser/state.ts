import type { Token } from "../types";

export function describeToken(t: Token): string {
  switch (t.type) {
    case "KEYWORD":     return `keyword '${t.value as string}'`;
    case "IDENT":       return `identifier '${t.value as string}'`;
    case "NUMBER":      return `number ${t.value as number}`;
    case "HEX_COLOR":   return `color '${t.value as string}'`;
    case "NAMED_COLOR": return `color keyword '${t.value as string}'`;
    case "SCENE_FIT":   return `sceneFit value '${t.value as string}'`;
    case "STRING":      return `string "${t.value as string}"`;
    case "LBRACE":      return "'{'";
    case "RBRACE":      return "'}'";
    case "LBRACKET":    return "'['";
    case "RBRACKET":    return "']'";
    case "LPAREN":      return "'('";
    case "RPAREN":      return "')'";
    case "COMMA":       return "','";
    case "COLON":       return "':'";
    case "EOF":         return "end of file";
  }
}

export function expectedTypeDescription(expected: Token["type"], got: Token): string {
  switch (expected) {
    case "LBRACE":  return "'{' to open a block";
    case "RBRACE":  return "'}' to close the block";
    case "LBRACKET":return "'[' to open a point list";
    case "RBRACKET":return "']' to close the point list";
    case "LPAREN":  return "'(' to open a point";
    case "RPAREN":  return "')' to close the point";
    case "COMMA":   return "','";
    case "COLON":   return "':' after the property name";
    case "NUMBER":  return `a number${got.type === "IDENT" ? ` (did you mean to write a numeric value here?)` : ""}`;
    case "IDENT":   return "an object or property name (an identifier)";
    case "KEYWORD": return "an object type keyword (circle, rectangle, polygon, text, or group)";
    default:        return expected;
  }
}

export class ParserState {
  pos = 0;
  currentContext = "the scene";
  tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  peek(): Token {
    return this.tokens[this.pos];
  }

  consume(expectedType?: Token["type"]): Token {
    const t = this.tokens[this.pos];
    if (expectedType && t.type !== expectedType) {
      const expectedDesc = expectedTypeDescription(expectedType, t);
      throw {
        phase: "PARSE" as const,
        message: `In ${this.currentContext}: Expected ${expectedDesc}, but found ${describeToken(t)}.`,
        line: t.line,
        col:  t.col,
      };
    }
    this.pos++;
    return t;
  }
}