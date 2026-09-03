import { describe, expect, it } from "vitest";
import { lex } from "./index";

describe("operator tokens", () => {
  it("lexes the single-character operators", () => {
    expect(lex("% < >").map((t) => t.type)).toEqual(["PERCENT", "LT", "GT", "EOF"]);
  });

  it("lexes two-character operators as one token, not two", () => {
    expect(lex("== != <= >=").map((t) => t.type))
      .toEqual(["EQ_EQ", "BANG_EQ", "LT_EQ", "GT_EQ", "EOF"]);
  });

  it("still lexes a lone '=' as EQUALS so 'let' keeps working", () => {
    expect(lex("=").map((t) => t.type)).toEqual(["EQUALS", "EOF"]);
  });

  it("records the two-character operator's end column across both characters", () => {
    const [tok] = lex("==");
    expect(tok.col).toBe(1);
    expect(tok.endCol).toBe(3);
  });

  it("rejects a bare '!' with a hint naming both replacements", () => {
    expect(() => lex("!")).toThrow(/'!=' or 'not'/);
  });
});

describe("expression keywords", () => {
  it.each(["in", "to", "if", "then", "else", "and", "or", "not", "sin", "cos", "length"])(
    "lexes '%s' as EXPR_KEYWORD, not IDENT or KEYWORD",
    (word) => {
      const [tok] = lex(word);
      expect(tok.type).toBe("EXPR_KEYWORD");
      expect(tok.value).toBe(word);
    },
  );

  it("keeps block keywords as KEYWORD", () => {
    expect(lex("circle")[0].type).toBe("KEYWORD");
  });
});
