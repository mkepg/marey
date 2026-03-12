import type { Token, TokenType } from "../types";

export class LexerState {
  i = 0;
  line = 1;
  col = 1;
  tokens: Token[] = [];
  src: string;

  constructor(src: string) {
    this.src = src;
  }

  err(message: string): never {
    throw { phase: "LEX" as const, message, line: this.line, col: this.col };
  }

  push(type: TokenType, value: Token["value"]): void {
    this.tokens.push({ type, value, line: this.line, col: this.col });
  }

  peek(offset = 0): string {
    return this.src[this.i + offset] || "";
  }

  advance(n = 1): void {
    this.i += n;
    this.col += n;
  }

  advanceLine(): void {
    this.line++;
    this.col = 1;
    this.i++;
  }
}