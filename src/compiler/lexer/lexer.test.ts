import { describe, expect, it } from "vitest";
import { lex } from "./index";
import { KEYWORDS, EXPRESSION_WORDS } from "./constants";

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

  // handleWord (lexer/handlers.ts) checks KEYWORDS before EXPRESSION_WORDS,
  // so a word in both sets would silently lex as whichever branch runs
  // first — nobody has decided that, and nothing should depend on it. This
  // is what actually makes the branch order safe, not a spot-check like
  // "circle lexes as KEYWORD" (KEYWORDS and EXPRESSION_WORDS have no
  // overlap today, so that check passes regardless of which set is tested
  // first, and can never fail).
  it("KEYWORDS and EXPRESSION_WORDS are disjoint, so handleWord's branch order cannot matter", () => {
    const overlap = [...KEYWORDS].filter((k) => EXPRESSION_WORDS.has(k));
    expect(overlap).toEqual([]);
  });
});
