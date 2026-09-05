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

  it("suffixes nested-generate names with each data list's ordinal", () => {
    const src = `scene { size:(100,100) generate outer in [7,8] { generate inner in [40,50] { circle dot { position:(0,0), radius:1 } } } }`;
    expect(namesOf(src)).toEqual(["dot_0_0", "dot_1_0", "dot_0_1", "dot_1_1"]);
  });

  it("suffixes use-instance names with a data list's ordinal", () => {
    const src = `template Badge() { circle mark { position:(0,0), radius:1 } } scene { size:(100,100) generate value in [7,8] { use Badge() badge } }`;
    expect(namesOf(src)).toEqual(["badge_0", "badge_1"]);
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
    expect(result.errors[0].message).toContain("cardinality");
  });

  it("rejects a conditional list through a let alias", () => {
    const result = parse(lex(`let xs = if true then [1] else [1,2] scene { size:(10,10) generate v in xs { circle d { position:(0,0), radius:v } } }`));
    expect(result.errors[0].message).toContain("[PARSE_GENERATE_CONDITIONAL_COLLECTION]");
  });

  it("rejects a collection reached by indexing a conditional list", () => {
    const result = parse(lex(`let xs = if true then [[1]] else [[1,2]] scene { size:(10,10) generate v in xs[0] { circle d { position:(0,0), radius:v } } }`));
    expect(result.errors[0].message).toContain("[PARSE_GENERATE_CONDITIONAL_COLLECTION]");
  });

  it("rejects a conditional-derived list entry after indexing a fixed list", () => {
    const result = parse(lex(`scene { size:(10,10) generate v in [if true then [1] else [1,2]][0] { circle d { position:(0,0), radius:v } } }`));
    expect(result.errors[0].message).toContain("[PARSE_GENERATE_CONDITIONAL_COLLECTION]");
  });

  it("rejects nested generation bounded by a conditional value from a fixed outer list", () => {
    const result = parse(lex(`scene { size:(10,10) generate bound in [if true then 1 else 2] { generate v in 0 to bound { circle d { position:(0,0), radius:1 } } } }`));
    expect(result.errors[0].message).toContain("[PARSE_GENERATE_CONDITIONAL_COLLECTION]");
  });

  it.each([
    "generate v in 0 to (if true then 1 else 2)",
    "let xs = if true then [1] else [1,2] generate v in 0 to length(xs)",
    "let rows = [[1], [1,2]] let i = if true then 0 else 1 generate v in rows[i]",
    "generate v in 0 to ((if true then 1 else 2) + 1)",
    "generate v in 0 to -(if true then -1 else -2)",
    "generate v in 0 to sin(if true then 90 else 180)",
  ])("rejects a conditional-derived iterable cardinality: %s", (header) => {
    const result = parse(lex(`scene { size:(10,10) ${header} { circle d { position:(0,0), radius:1 } } }`));
    expect(result.errors).not.toEqual([]);
    expect(result.errors[0].message).toContain("[PARSE_GENERATE_CONDITIONAL_COLLECTION]");
  });

  it("rejects duplicate element and ordinal binders at the second name", () => {
    const source = `scene { size:(10,10) generate v, v in [1] { circle d { position:(0,0), radius:v } } }`;
    const result = parse(lex(source));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      line: 1,
      col: source.indexOf(", v") + 3,
    });
    expect(result.errors[0].message).toContain("element and ordinal variable names in 'generate' must be different");
  });

  it("allows conditionals inside elements of a fixed-length collection", () => {
    expect(namesOf(`scene { size:(10,10) generate v in [if true then 1 else 2, if false then 3 else 4] { circle d { position:(0,0), radius:v } } }`))
      .toEqual(["d_0", "d_1"]);
  });

  it("allows a fixed literal list's length to bound generation when only its element values are conditional", () => {
    expect(namesOf(`scene { size:(10,10) generate v in 0 to length([if true then 7 else 8, if false then 9 else 10]) - 1 { circle d { position:(0,0), radius:v } } }`))
      .toEqual(["d_0", "d_1"]);
  });

  it("does not expose parser cardinality provenance in serialized AST values", () => {
    const result = parse(lex(`scene { size:(10,10) circle d { position:(0,0), radius: if true then 1 else 2 } }`));
    expect(result.errors).toEqual([]);
    expect(Object.getOwnPropertySymbols(result.ast!.children[0].props.radius)).toEqual([]);
    expect(JSON.stringify(result.ast)).not.toContain("conditionalCardinality");
    expect(JSON.stringify(result.ast)).not.toContain("conditionalResult");
  });
});

describe("rejected generate recovery", () => {
  it("preserves a scene sibling after duplicate binders", () => {
    const source = `scene { size:(10,10) generate v, v in [1] { circle rejected { position:(0,0), radius:1 } } circle good { position:(0,0), radius:1 } }`;
    const result = parse(lex(source));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ line: 1, col: source.indexOf(", v") + 3 });
    expect(result.errors[0].message).toContain("element and ordinal variable names in 'generate' must be different");
    expect(result.ast!.children.map((child) => child.name)).toEqual(["good"]);
  });

  it("preserves a group sibling after duplicate binders", () => {
    const source = `scene { size:(10,10) group holder { generate v, v in [1] { circle rejected { position:(0,0), radius:1 } } circle good { position:(0,0), radius:1 } } }`;
    const result = parse(lex(source));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ line: 1, col: source.indexOf(", v") + 3 });
    expect(result.ast!.children[0].children.map((child) => child.name)).toEqual(["good"]);
  });

  it("preserves an outer-generate sibling after duplicate binders", () => {
    const source = `scene { size:(10,10) generate outer in [7] { generate v, v in [1] { circle rejected { position:(0,0), radius:1 } } circle good { position:(0,0), radius:1 } } }`;
    const result = parse(lex(source));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ line: 1, col: source.indexOf(", v") + 3 });
    expect(result.ast!.children.map((child) => child.name)).toEqual(["good_0"]);
  });

  it("preserves a following template-body sibling after duplicate binders", () => {
    // A definition-time-only fixture cannot tell correct recovery apart from
    // a cascade here: `parseTemplate`'s dry run discards its walk and only
    // keeps `startPos`/`endPos` for later re-parsing, so neither the error
    // count nor `result.ast` (which never sees inside an unused template)
    // reveals whether the dry run's position ended up correct or corrupted —
    // confirmed by reverting the fix, which left this exact fixture still
    // reporting 1 error and a non-null ast. `use`-ing the template forces a
    // second, independent parse of the same tokens from the stored
    // boundary, which does show the difference: reverting the fix turns this
    // into 5 errors with 'inst' losing 'good' entirely, because recovery
    // desyncs mid-object instead of resuming at the next statement.
    const source = `template Broken() { generate v, v in [1] { circle rejected { position:(0,0), radius:1 } } circle good { position:(0,0), radius:1 } } scene { size:(10,10) use Broken() inst }`;
    const result = parse(lex(source));
    expect(result.errors).toHaveLength(2);
    for (const err of result.errors) {
      expect(err).toMatchObject({ line: 1, col: source.indexOf(", v") + 3 });
      expect(err.message).toContain("element and ordinal variable names in 'generate' must be different");
    }
    expect(result.ast!.children[0].children.map((child) => child.name)).toEqual(["good"]);
  });

  it("records one conditional-cardinality error and preserves a scene sibling", () => {
    const source = `scene { size:(10,10) generate v in if true then [1] else [1,2] { circle rejected { position:(0,0), radius:1 } } circle good { position:(0,0), radius:1 } }`;
    const result = parse(lex(source));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("[PARSE_GENERATE_CONDITIONAL_COLLECTION]");
    expect(result.ast!.children.map((child) => child.name)).toEqual(["good"]);
  });

  it("records one conditional-cardinality error for a final generate", () => {
    const result = parse(lex(`scene { size:(10,10) generate v in if true then [1] else [1,2] { circle rejected { position:(0,0), radius:1 } } }`));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("[PARSE_GENERATE_CONDITIONAL_COLLECTION]");
    expect(result.ast).not.toBeNull();
  });

  it("records one conditional-cardinality error and preserves a nested sibling", () => {
    const source = `scene { size:(10,10) generate outer in [7] { generate v in if true then [1] else [1,2] { circle rejected { position:(0,0), radius:1 } } circle good { position:(0,0), radius:1 } } }`;
    const result = parse(lex(source));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("[PARSE_GENERATE_CONDITIONAL_COLLECTION]");
    expect(result.ast!.children.map((child) => child.name)).toEqual(["good_0"]);
  });
});

describe("generate with list-valued template parameters", () => {
  it("expands a direct list parameter", () => {
    const source = `template Rows(values) { generate value in values { circle dot { position:(0,0), radius:value } } } scene { size:(10,10) use Rows([7,8]) row }`;
    const result = parse(lex(source));
    expect(result.errors).toEqual([]);
    expect(result.ast!.children[0].children.map((child) => child.name)).toEqual(["dot_0", "dot_1"]);
  });

  it("expands a list parameter through a let alias", () => {
    const source = `template Rows(values) { let items = values generate value in items { circle dot { position:(0,0), radius:value } } } scene { size:(10,10) use Rows([7,8]) row }`;
    const result = parse(lex(source));
    expect(result.errors).toEqual([]);
    expect(result.ast!.children[0].children.map((child) => child.name)).toEqual(["dot_0", "dot_1"]);
  });

  it("supports indexed list selection through template parameters", () => {
    const source = `template Rows(rows, selected) { generate value in rows[selected] { circle dot { position:(0,0), radius:value } } } scene { size:(10,10) use Rows([[7],[8,9]], 1) row }`;
    const result = parse(lex(source));
    expect(result.errors).toEqual([]);
    expect(result.ast!.children[0].children.map((child) => child.name)).toEqual(["dot_0", "dot_1"]);
  });

  it("rejects a conditional-list argument once at real template expansion and preserves siblings", () => {
    const source = `template Rows(values) { generate value in values { circle rejected { position:(0,0), radius:value } } circle kept { position:(0,0), radius:1 } } scene { size:(10,10) use Rows(if true then [7] else [8,9]) row circle good { position:(0,0), radius:1 } }`;
    const result = parse(lex(source));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("[PARSE_GENERATE_CONDITIONAL_COLLECTION]");
    expect(result.ast!.children.map((child) => child.name)).toEqual(["row", "good"]);
    expect(result.ast!.children[0].children.map((child) => child.name)).toEqual(["kept"]);
  });

  it("still validates syntax inside an unused parameter-driven generate", () => {
    const source = `template Broken(values) { generate value in values { circle bad { position:(0,0), radius: } } } scene { size:(10,10) }`;
    const result = parse(lex(source));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Unexpected '}' where a property value was expected");
    expect(result.ast).not.toBeNull();
  });
});
