import type { Token, AstValue, CompilerError, TemplateDef } from "../types";

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
    case "PLUS":        return "'+'";
    case "MINUS":       return "'-'";
    case "STAR":        return "'*'";
    case "SLASH":       return "'/'";
    case "EQUALS":      return "'='";
    case "EOF":         return "end of file";
    default:                      return `token '${String(t.value)}'`;
  }
}

export function expectedTypeDescription(expected: Token["type"], got: Token): string {
  switch (expected) {
    case "LBRACE":  return "'{' to open a block";
    case "RBRACE":  return "'}' to close the block";
    case "LBRACKET":return "'[' to open a point list";
    case "RBRACKET":return "']' to close the point list";
    case "LPAREN":  return "'(' to open a point or expression";
    case "RPAREN":  return "')' to close the point or expression";
    case "COMMA":   return "','";
    case "COLON":   return "':' after the property name";
    case "EQUALS":  return "'=' for variable assignment";
    case "NUMBER":  return `a number${got.type === "IDENT" ? ` (did you mean to write a numeric value here?)` : ""}`;
    case "IDENT":   return "an object or property name (an identifier)";
    case "KEYWORD": return "an object type keyword (circle, rectangle, polygon, text, or group)";
    default:        return expected;
  }
}

export class ParseException extends Error {
  readonly error: CompilerError;
  constructor(error: CompilerError) {
    super(error.message);
    this.error = error;
  }
}

export class ParserState {
  pos = 0;
  currentContext = "the scene";
  tokens: Token[];
  env: Record<string, AstValue> = {};
  errors: CompilerError[] = [];
  globalNodeCount = 0;
  templates: Record<string, TemplateDef> = {};

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  peek(): Token {
    return this.tokens[this.pos] || this.tokens[this.tokens.length - 1];
  }

  isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }

  consume(expectedType?: Token["type"]): Token {
    const t = this.tokens[this.pos];
    if (expectedType && t.type !== expectedType) {
      const expectedDesc = expectedTypeDescription(expectedType, t);
      this.throwError(`In ${this.currentContext}: Expected ${expectedDesc}, but found ${describeToken(t)}.`, t);
    }
    if (!this.isAtEnd()) this.pos++;
    return t;
  }

  throwError(message: string, token: Token = this.peek()): never {
    const errorObj: CompilerError = {
      phase: "PARSE",
      message,
      line: token.line,
      col: token.col,
      endLine: token.line,
      endCol: token.endCol,
    };

    // Hard cap to prevent worker serialization crashes
    if (this.errors.length >= 50) {
      const maxErrorMessage = "Maximum error limit reached. Further parsing aborted.";
      // Throwing a standard Error bypasses the local `instanceof ParseException` catches and forces a hard failure
      throw new Error(maxErrorMessage);
    }

    throw new ParseException(errorObj);
  }

  synchronize(): void {
    let t = this.peek();
    if (t.type === "RBRACE" || t.type === "EOF") return;
    this.pos++;

    while (!this.isAtEnd()) {
      t = this.peek();
      if (
        t.type === "RBRACE" ||
        t.type === "KEYWORD"
      ) {
        return;
      }
      if (t.type === "IDENT") {
        const next = this.tokens[this.pos + 1];
        if (next && next.type === "COLON") {
          return;
        }
      }
      this.pos++;
    }
  }
}