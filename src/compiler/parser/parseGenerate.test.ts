import { describe, expect, it } from "vitest";
import { lex } from "../lexer";
import { parse } from "./index";

function namesOf(src: string): string[] {
  const result = parse(lex(src));
  expect(result.errors).toEqual([]);
  return result.ast!.children.map((c) => c.name);
}

describe("generate ... in", () => {
  it("iterates a range", () => {
    expect(namesOf(`scene { size:(100,100) generate i in 0 to 2 { circle dot { position:(i*10,0), radius:1 } } }`))
      .toEqual(["dot_0", "dot_1", "dot_2"]);
  });

  it("iterates a list, binding the element", () => {
    const src = `let v = [7,8] scene { size:(100,100) generate r in v { circle dot { position:(0,0), radius: r } } }`;
    const result = parse(lex(src));
    expect(result.errors).toEqual([]);
    expect(result.ast!.children.map((c) => (c.props.radius as { value: number }).value)).toEqual([7, 8]);
  });

  it("binds an ordinal index when a second name is given", () => {
    const src = `let v = [7,8] scene { size:(100,100) generate r, i in v { circle dot { position:(i*10,0), radius: r } } }`;
    const result = parse(lex(src));
    expect(result.errors).toEqual([]);
    expect(result.ast!.children.map((c) => (c.props.position as { x: number }).x)).toEqual([0, 10]);
  });

  it("suffixes names with the ordinal, not the element value", () => {
    expect(namesOf(`let v = [7,8] scene { size:(100,100) generate r in v { circle dot { position:(0,0), radius: r } } }`))
      .toEqual(["dot_0", "dot_1"]);
  });

  it("emits nothing for an empty list", () => {
    expect(namesOf(`let v = 5 to 1 scene { size:(100,100) generate r in v { circle dot { position:(0,0), radius: 1 } } }`))
      .toEqual([]);
  });

  it("rejects the removed 'from' header, naming the replacement", () => {
    const msg = parse(lex(`scene { size:(100,100) generate i from 0 to 2 { circle d { position:(0,0), radius:1 } } }`))
      .errors.map((e) => e.message).join();
    expect(msg).toContain("generate i in A to B");
  });

  it("rejects iterating a non-list", () => {
    const msg = parse(lex(`scene { size:(100,100) generate i in 5 { circle d { position:(0,0), radius:1 } } }`))
      .errors.map((e) => e.message).join();
    expect(msg).toContain("requires a list");
  });

  it("rejects a direct conditional collection", () => {
    const result = parse(lex(`scene { size:(10,10) generate v in if true then [1] else [1,2] { circle d { position:(0,0), radius:v } } }`));
    expect(result.errors[0].message).toContain("[PARSE_GENERATE_CONDITIONAL_COLLECTION]");
  });

  it("rejects a conditional list through a let alias", () => {
    const result = parse(lex(`let xs = if true then [1] else [1,2] scene { size:(10,10) generate v in xs { circle d { position:(0,0), radius:v } } }`));
    expect(result.errors[0].message).toContain("[PARSE_GENERATE_CONDITIONAL_COLLECTION]");
  });

  it("allows conditionals inside elements of a fixed-length collection", () => {
    expect(namesOf(`scene { size:(10,10) generate v in [if true then 1 else 2, if false then 3 else 4] { circle d { position:(0,0), radius:v } } }`))
      .toEqual(["d_0", "d_1"]);
  });
});
