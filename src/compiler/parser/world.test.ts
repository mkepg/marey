import { describe, it, expect } from "vitest";
import { compileSource } from "../compileSource";
import { lex } from "../lexer";
import { parse } from "./index";

const messages = (src: string): string[] => compileSource(src).errors.map((e) => e.message);

describe("world block", () => {
  it("parses a scene-level world with gravity and bounds", () => {
    const src = `scene { size: (400, 300) world { gravity: (0, 500) bounds: [left, right, bottom] } }`;
    const out = compileSource(src);
    expect(out.errors).toEqual([]);
    const { ast } = parse(lex(src));
    expect(ast!.world!.type).toBe("world");
    expect(ast!.world!.name).toMatch(/^world_\d+_\d+$/);
    expect(ast!.children).toEqual([]);
    const bounds = ast!.world!.props.bounds;
    if (bounds.kind !== "edges") throw new Error("expected an edges value");
    expect(bounds.value.map((w) => w.name)).toEqual(["left", "right", "bottom"]);
    expect(bounds.value[0]).toMatchObject({ line: 1, col: 61 });
  });

  it("rejects a world block inside a group", () => {
    expect(messages(`scene { size: (400, 300) group g { world { } } }`)).toContain(
      "In 'group' object 'g': 'world' blocks are only allowed directly inside the scene block.",
    );
  });

  it("rejects a world block inside a circle", () => {
    expect(messages(`scene { size: (400, 300) circle c { position: (1, 2) radius: 3 world { } } }`)).toContain(
      "In 'circle' object 'c': 'world' blocks are only allowed directly inside the scene block.",
    );
  });

  it("rejects a world block produced by generate in the scene", () => {
    expect(messages(`scene { size: (400, 300) generate i in [1, 2] { world { } } }`)).toContain(
      "In the scene: 'world' blocks are only allowed directly inside the scene block.",
    );
  });

  it("rejects a world block written before the scene", () => {
    expect(messages(`world { }
scene { size: (400, 300) }`)).toContain(
      "A Marey program must begin with the 'scene' keyword, but found keyword 'world'. 'world' is an object keyword — objects must be placed inside a scene block.",
    );
  });

  it("rejects a second world block", () => {
    expect(messages(`scene { size: (400, 300) world { } world { } }`)).toContain(
      "In the scene: Only one 'world' block is allowed.",
    );
  });

  it("rejects a nested block inside world", () => {
    expect(messages(`scene { size: (400, 300) world { physics { duration: 1 } } }`)).toContain(
      "In 'world' block: 'world' blocks cannot contain nested objects or blocks. Found 'physics'.",
    );
  });

  it("rejects a bounds element that is not a bare word", () => {
    expect(messages(`scene { size: (400, 300) world { bounds: [left, 3] } }`)).toContain(
      "In 'world' block: 'bounds' lists scene edges by name (left, right, top, bottom), but found number 3.",
    );
  });

  it("rejects two bounds words with no comma between them", () => {
    expect(messages(`scene { size: (400, 300) world { bounds: [left right] } }`)).toContain(
      "In 'world' block: 'bounds' lists scene edges by name (left, right, top, bottom), but found identifier 'right'.",
    );
  });

  it("parses an empty bounds list to an edges value with no items", () => {
    const { ast, errors } = parse(lex(`scene { size: (400, 300) world { bounds: [] } }`));
    expect(errors).toEqual([]);
    expect(ast!.world!.props.bounds).toMatchObject({ kind: "edges", value: [] });
  });

  it("does not reserve the edge words", () => {
    const out = compileSource(
      `let top = 40\nscene { size: (400, 300) circle c { position: (top, top) radius: 5 } }`,
    );
    expect(out.errors).toEqual([]);
  });

  it("reserves world as an object name", () => {
    expect(messages(`scene { size: (400, 300) circle world { position: (1, 2) radius: 3 } }`)).toContain(
      "In the scene: Expected a valid, unique name for the 'circle' object, but found keyword 'world'. 'world' is a reserved object keyword.",
    );
  });

  it("accepts lockPosition, lockRotation and spin as physics properties", () => {
    const out = messages(
      `scene { size: (400, 300) circle c { position: (1, 2) radius: 3 physics { lockPosition: true, lockRotation: false, spin: 90, duration: 1 } } }`,
    );
    expect(out.filter((m) => m.includes("has an unknown property"))).toEqual([]);
  });
});
