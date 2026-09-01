import { describe, expect, it } from "vitest";
import { lex } from "./lexer";
import { parse } from "./parser";
import { typeCheck } from "./typeChecker";
import { buildIR } from "./typeChecker/builder";

function compileErrors(source: string) {
  const { ast, errors } = parse(lex(source));
  const all = [...errors];
  if (ast) all.push(...typeCheck(ast).errors);
  return all;
}

function irFor(source: string) {
  const { ast, errors } = parse(lex(source));
  expect(errors).toEqual([]);
  expect(ast).not.toBeNull();
  const result = typeCheck(ast!);
  expect(result.errors).toEqual([]);
  expect(result.ir).not.toBeNull();
  return buildIR(ast!);
}

describe("Phase 3A language surface", () => {
  it("accepts only final Phase 3A vocabulary", () => {
    const ir = irFor(`
      let depth = 3
      scene { size:(100,100), fit: contain
        circle c { position:(50,50), radius:10, layer: depth
          animate { property:position, to:(60,50), duration:0.1, handoff:true }
          physics { duration: indefinitely }
        }
      }
    `);
    expect(ir.fit).toBe("contain");
    expect(ir.registry["scene.c"].props.layer).toBe(3);
    expect(ir.registry["scene.c"].props.animations[0].handoff).toBe(true);
  });

  it.each([
    ["def x = 1\nscene { size:(10,10) }", "def", "PARSE_RENAMED_KEYWORD", "let"],
    ["scene { size:(10,10), sceneFit: contain }", "sceneFit", "PARSE_RENAMED_PROPERTY", "fit"],
    ["scene { size:(10,10) circle c { position:(5,5), radius:1, z:2 } }", "z", "PARSE_RENAMED_PROPERTY", "layer"],
    ["scene { size:(10,10) circle c { position:(5,5), radius:1 animate { property:position, to:(6,5), duration:1, handOff:true } physics { duration:indefinitely } } }", "handOff", "PARSE_RENAMED_PROPERTY", "handoff"],
  ])("rejects obsolete spelling at its token", (source, old, code, replacement) => {
    const [error] = compileErrors(source);
    expect(error.message).toContain(code);
    expect(error.message).toContain(replacement);
    const tokenStart = old === "z" ? source.lastIndexOf(old) : source.indexOf(old);
    const before = source.slice(0, tokenStart);
    const lines = before.split("\n");
    expect(error.line).toBe(lines.length);
    expect(error.col).toBe(lines.at(-1)!.length + 1);
  });

  it.each([
    "scene { size:(10,10), def x = 1 }",
    "scene { size:(10,10) circle c { def x = 1 position:(5,5), radius:1 } }",
    "scene { size:(10,10) generate i from 0 to 0 { def x = i circle c { position:(5,5), radius:1 } } }",
    "template T() { def y = 1 circle c { position:(5,5), radius:1 } }\nscene { size:(10,10) }",
    "template T() { def y = 1 circle c { position:(5,5), radius:1 } }\nscene { size:(10,10) use T() inst }",
  ])("rejects old def in binding-bearing context", (source) => {
    const [error] = compileErrors(source);
    expect(error.message).toContain("[PARSE_RENAMED_KEYWORD]");
    expect(error.message).toContain("'def' was renamed to 'let'");
    const old = "def";
    const before = source.slice(0, source.indexOf(old));
    expect(error.line).toBe(before.split("\n").length);
    expect(error.col).toBe(before.split("\n").at(-1)!.length + 1);
  });

  it.each([
    ["scene { size:(10,10), sceneFit: contain }", "sceneFit", "fit"],
    ["scene { size:(10,10) circle c { position:(5,5), radius:1, z:2 } }", "z", "layer"],
    ["scene { size:(10,10) circle c { position:(5,5), radius:1 animate { property:position, to:(6,5), duration:1, handOff:true } physics { duration:indefinitely } } }", "handOff", "handoff"],
    ["template T() { circle c { position:(5,5), radius:1 } }\nscene { size:(10,10) use T() inst { z:2 } }", "z", "layer"],
  ])("rejects old property spelling in direct and use-wrapper contexts", (source, old, replacement) => {
    const [error] = compileErrors(source);
    expect(error.message).toContain("[PARSE_RENAMED_PROPERTY]");
    expect(error.message).toContain(`'${old}' was renamed to '${replacement}'`);
    const tokenStart = old === "z" ? source.lastIndexOf(old) : source.indexOf(old);
    const before = source.slice(0, tokenStart);
    expect(error.line).toBe(before.split("\n").length);
    expect(error.col).toBe(before.split("\n").at(-1)!.length + 1);
  });
});
