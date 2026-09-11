import { describe, it, expect, beforeAll } from "vitest";

type Posted = Record<string, any>;

let fire: (data: unknown) => Posted[];

beforeAll(async () => {
  let handler: ((e: { data: unknown }) => void) | null = null;
  const posted: Posted[] = [];

  // The worker registers its listener at module-evaluation time, so `self`
  // must exist before the import, and the import must therefore be dynamic.
  (globalThis as Record<string, unknown>).self = {
    addEventListener: (type: string, fn: (e: { data: unknown }) => void) => {
      if (type === "message") handler = fn;
    },
    postMessage: (msg: Posted) => { posted.push(msg); },
  };

  await import("./compiler.worker");
  if (!handler) throw new Error("worker registered no message listener");

  fire = (data: unknown) => {
    posted.length = 0;
    handler!({ data });
    return posted;
  };
});

const texts = (msgs: Posted[]): string[] => msgs[0].logs.map((l: any) => l.text);
const kinds = (msgs: Posted[]): string[] => msgs[0].logs.map((l: any) => l.kind);

describe("compiler.worker · success", () => {
  it("emits the full six-line log sequence in order and posts the IR as a string", () => {
    const out = fire({
      id: 1,
      action: "compile",
      source: `scene { size: (800, 600) circle c { position: (1, 2), radius: 3 } }`,
    });

    expect(out).toHaveLength(1);
    expect(out[0].success).toBe(true);
    expect(out[0].errors).toEqual([]);

    // Asserted as an ordered whole, not line-by-line: the thing under test is
    // the branch ORDER, and a per-line `toContain` would pass against any
    // permutation of the same six lines.
    expect(texts(out)).toEqual([
      "[lexer]   tokenizing...",
      "[lexer]   25 tokens",
      "[parser]  building AST...",
      "[parser]  AST root: scene, 1 top-level object(s)",
      "[type]    checking + building Scene IR...",
      "[type]    no errors — Scene IR ready (1 node(s))",
    ]);
    expect(kinds(out)).toEqual(["info", "ok", "info", "ok", "info", "ok"]);

    // The worker stringifies the IR to dodge a structured-clone cost on large
    // payloads (`compiler.worker.ts:102-104`), and `index.ts:62` parses it
    // back. A regression to posting the object directly would still "work" in
    // the app, so the string-ness is pinned here explicitly.
    expect(typeof out[0].ir).toBe("string");
    expect(JSON.parse(out[0].ir).registry["scene.c"].props.radius).toBe(3);
  });
});

describe("compiler.worker · returned errors", () => {
  it("stops after 'building AST...' for a PARSE error and lists every one", () => {
    const out = fire({ id: 2, action: "compile", source: `circle c { }` });

    expect(out[0].success).toBe(false);
    expect(out[0].ir).toBeNull();
    expect(texts(out)).toEqual([
      "[lexer]   tokenizing...",
      "[lexer]   4 tokens",
      "[parser]  building AST...",
      "[parser]  A Marey program must begin with the 'scene' keyword, but found keyword 'circle'. 'circle' is an object keyword — objects must be placed inside a scene block.",
    ]);
    // The load-bearing half: no `[parser] AST root` line and no `[type]` line.
    // Reordering the PARSE branch after the type-check block would emit both.
    expect(out[0].errors[0].phase).toBe("PARSE");
  });

  it("emits the AST-root line and the type header before a TYPE error", () => {
    const out = fire({
      id: 3,
      action: "compile",
      source: `scene { size: (800, 600) circle c { position: (1, 2), radius: -3 } }`,
    });

    expect(out[0].success).toBe(false);
    expect(texts(out)).toEqual([
      "[lexer]   tokenizing...",
      "[lexer]   26 tokens",
      "[parser]  building AST...",
      "[parser]  AST root: scene, 1 top-level object(s)",
      "[type]    checking + building Scene IR...",
      "[type]    'circle' object 'c': 'radius' must be greater than 0, but got -3.",
    ]);
    expect(out[0].errors[0].phase).toBe("TYPE");
  });
});

describe("compiler.worker · thrown errors", () => {
  it("emits only the tokenizing line when lexing itself throws", () => {
    // `lex()` throws a raw { phase: "LEX", ... } before `parse()` is called,
    // so nothing internal catches it and tokenCount is 0.
    const out = fire({ id: 4, action: "compile", source: "!" });

    expect(out[0].success).toBe(false);
    expect(texts(out)).toHaveLength(2);
    expect(texts(out)[0]).toBe("[lexer]   tokenizing...");
    // No "N tokens" line and no "building AST..." line: the count would be a
    // lie and the parser never ran. This is the `tokenCount === 0` branch.
    expect(texts(out)[1]).toContain("Unexpected character '!'");
    expect(texts(out)[1]).toContain("— line 1, column 1");
    expect(texts(out)[1]).toMatch(/^\[lexer\] /);   // was "[lex]  "
    expect(out[0].errors[0].phase).toBe("LEX");
  });

  it("keeps the token count and the AST header when a later stage throws", () => {
    // The parser's 51-duplicate abort throws a plain Error that escapes every
    // ParseException guard. Phase 4 fixed `compileSource` to hoist `tokens`
    // above its try precisely so this line survives; that fix is what this
    // assertion protects.
    const clauses = Array.from({ length: 52 }, () => "x: 1").join(" ");
    const out = fire({ id: 5, action: "compile", source: `scene { ${clauses} }` });

    expect(out[0].success).toBe(false);
    expect(texts(out)).toHaveLength(4);
    expect(texts(out)[1]).toBe("[lexer]   159 tokens");
    expect(texts(out)[2]).toBe("[parser]  building AST...");
    expect(texts(out)[3]).toContain("Maximum error limit reached");
    expect(texts(out)[3]).toMatch(/^\[system\] /);  // was "[runtime]  "
    expect(out[0].errors[0].phase).toBe("RUNTIME");
  });
});

describe("compiler.worker · lint", () => {
  it("answers a lint request with errors and symbols and no logs at all", () => {
    const out = fire({ id: 6, action: "lint", source: `scene { size: (1, 1) }` });

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ id: 6, action: "lint", errors: [], symbols: [] });
    // No `logs` key whatsoever: the lint branch returns before the log array
    // is even declared (`compiler.worker.ts:7-11`).
    expect("logs" in out[0]).toBe(false);
  });

  it("defaults a message with no action to compile", () => {
    // `action = "compile"` is a destructuring default (`compiler.worker.ts:5`).
    // `index.ts` always sends one, so this is the only guard on that default.
    const out = fire({ id: 7, source: `scene { size: (1, 1) }` });
    expect(out[0].action).toBe("compile");
    expect(out[0].success).toBe(true);
  });
});

describe("compiler.worker · scraped-prefix contract", () => {
  it("emits nothing outside the six prefixes check.mjs scrapes", () => {
    // The exact regex from tools/visual-check/check.mjs:89. A line that
    // does not match is dropped from every captured visual-check report, so a
    // compile can fail there with no reason shown.
    const SCRAPED = /^\[(lexer|parser|type|pixi|render|system)\]/;
    const sources = [
      `scene { size: (800, 600) circle c { position: (1, 2), radius: 3 } }`,
      `circle c { }`,
      `scene { size: (800, 600) circle c { position: (1, 2), radius: -3 } }`,
      "!",
      `scene { ${Array.from({ length: 52 }, () => "x: 1").join(" ")} }`,
    ];
    for (const source of sources) {
      for (const text of texts(fire({ id: 99, action: "compile", source }))) {
        expect(text).toMatch(SCRAPED);
      }
    }
  });
});
