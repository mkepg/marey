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
