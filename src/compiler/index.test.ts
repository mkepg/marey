import { describe, it, expect, beforeAll, vi } from "vitest";
import type * as CompilerModule from "./index";

/*
 * `compile()` talks to a Web Worker, which Node has not got. A stand-in
 * records what the module posts and lets a test deliver replies to its
 * `onmessage` in any order, as a real worker's replies can arrive.
 */
interface Posted { readonly id: number; readonly action: string; readonly source: string }

class FakeWorker {
  static last: FakeWorker | null = null;
  readonly posted: Posted[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor() { FakeWorker.last = this; }
  postMessage(msg: Posted): void { this.posted.push(msg); }
  terminate(): void {}
  reply(data: unknown): void { this.onmessage?.({ data }); }
}

let compiler: typeof CompilerModule;

beforeAll(async () => {
  vi.stubGlobal("Worker", FakeWorker);
  compiler = await import("./index");
});

/** A failed compile's reply, which `compile()` resolves without rendering. */
const failed = (id: number, text: string) => ({
  id, action: "compile", success: false, ir: null,
  logs: [{ kind: "error", text }], errors: [{ phase: "PARSE", message: text }],
});

const settled = async <T>(p: Promise<T>): Promise<{ done: boolean; value?: T }> => {
  let out: { done: boolean; value?: T } = { done: false };
  p.then((value) => { out = { done: true, value }; });
  await new Promise((r) => setTimeout(r, 0));
  return out;
};

const host = {} as HTMLDivElement;

describe("compile · worker replies", () => {
  it("ignores an older job's reply, so it cannot resolve the newer job", async () => {
    const older = compiler.compile("older", host, false);
    const newer = compiler.compile("newer", host, false);
    const worker = FakeWorker.last!;
    const [olderPost, newerPost] = worker.posted.slice(-2);
    expect([olderPost.source, newerPost.source]).toEqual(["older", "newer"]);

    // The superseded job resolves at once, empty, when the newer one starts.
    expect(await settled(older)).toMatchObject({ done: true, value: { success: false, logs: [] } });

    // The older job's reply arrives late. It must not answer the newer job.
    worker.reply(failed(olderPost.id, "from the older source"));
    expect((await settled(newer)).done).toBe(false);

    worker.reply(failed(newerPost.id, "from the newer source"));
    const result = await newer;
    expect(result.logs.map((l) => l.text)).toEqual(["from the newer source"]);
  });

  it("still takes its own reply when a lint was sent in between", async () => {
    // `lint` draws its id from the same counter, so the compile's own id is
    // not the latest one issued when its reply arrives.
    const job = compiler.compile("source", host, false);
    const worker = FakeWorker.last!;
    const compilePost = worker.posted.at(-1)!;
    void compiler.lint("source");
    expect(worker.posted.at(-1)!.id).not.toBe(compilePost.id);

    worker.reply(failed(compilePost.id, "own reply"));
    const result = await job;
    expect(result.logs.map((l) => l.text)).toEqual(["own reply"]);
  });
});
