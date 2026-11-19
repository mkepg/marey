import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigEnv, Plugin, UserConfig, ViteDevServer } from "vite";
import type { BuiltSite } from "../site/build/types";

const buildSite = vi.fn();
vi.mock("../site/build/index", () => ({ buildSite: (root: string) => buildSite(root) }));

const { site } = await import("./site");

const repoRoot = resolve(import.meta.dirname, "..");

function built(overrides: Partial<BuiltSite> = {}): BuiltSite {
  return {
    pages: [
      {
        url: "/learn/",
        outFile: "learn/index.html",
        section: "learn",
        title: "Learn",
        description: "",
        html: "<!doctype html><p>the page</p>",
        headings: [],
        text: "",
        links: [],
      },
    ],
    errors: [],
    sitemap: "<urlset/>",
    searchIndex: "[]",
    ...overrides,
  };
}

type Handler = (req: { method: string; url: string }, res: FakeResponse, next: (e?: unknown) => void) => unknown;

class FakeResponse {
  statusCode = 200;
  headers: Record<string, string> = {};
  body: string | Buffer = "";
  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }
  end(body?: string | Buffer): void {
    if (body !== undefined) this.body = body;
  }
}

function start(): { plugin: Plugin; handler: Handler } {
  const plugin = site();
  const hook = plugin.config;
  const fn = typeof hook === "function" ? hook : hook?.handler;
  const env: ConfigEnv = { command: "serve", mode: "development" };
  (fn?.call({} as never, { root: repoRoot } as UserConfig, env)) as UserConfig;
  let handler: Handler | null = null;
  const server = {
    watcher: { on: () => undefined },
    ws: { send: () => undefined },
    middlewares: { use: (h: Handler) => (handler = h) },
    config: { logger: { warn: () => undefined } },
    transformIndexHtml: async (_url: string, html: string) => html,
  } as unknown as ViteDevServer;
  const configure = plugin.configureServer as (s: ViteDevServer) => void;
  configure(server);
  return { plugin, handler: handler as unknown as Handler };
}

describe("the development middleware", () => {
  beforeEach(() => {
    buildSite.mockReset();
    buildSite.mockReturnValue(built());
  });

  it("serves a page's html", async () => {
    const { handler } = start();
    const res = new FakeResponse();
    await handler({ method: "GET", url: "/learn/" }, res, () => {
      throw new Error("fell through");
    });
    expect(res.body).toContain("the page");
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("escapes a hostile build error in the error page", async () => {
    const { handler } = start();
    buildSite.mockReturnValue(built({ errors: ['site/content/x.md:3: </code><script>alert("x")</script>'] }));
    const res = new FakeResponse();
    await handler({ method: "GET", url: "/learn/" }, res, () => undefined);
    const html = String(res.body);
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain('<script>alert("x")');
    expect(html).not.toContain("the page");
  });

  it("falls through to next() for a path that is not part of the site", async () => {
    const { handler } = start();
    for (const url of ["/src/main.tsx", "/assets/x.js", "/"]) {
      const next = vi.fn();
      const res = new FakeResponse();
      await handler({ method: "GET", url }, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledWith();
    }
    buildSite.mockClear();
    await handler({ method: "GET", url: "/src/main.tsx" }, new FakeResponse(), () => undefined);
    expect(buildSite).not.toHaveBeenCalled();
  });

  it("passes a failing build to next() instead of leaving the request open", async () => {
    const { handler } = start();
    buildSite.mockImplementation(() => {
      throw new Error("cannot read site.json");
    });
    const next = vi.fn();
    await handler({ method: "GET", url: "/learn/" }, new FakeResponse(), next);
    expect(next).toHaveBeenCalledOnce();
    expect((next.mock.calls[0]?.[0] as Error).message).toBe("cannot read site.json");
  });

  it("serves the scene font where the player looks for it", async () => {
    const { handler } = start();
    const res = new FakeResponse();
    await handler({ method: "GET", url: "/src/player/fonts/JetBrainsMono-Regular.ttf" }, res, () => {
      throw new Error("fell through");
    });
    expect(res.headers["content-type"]).toBe("font/ttf");
    expect(Buffer.compare(res.body as Buffer, readFileSync(resolve(repoRoot, "public/fonts/JetBrainsMono-Regular.ttf")))).toBe(0);
  });
});

describe("the build", () => {
  it("emits the scene font beside the player's chunk", () => {
    buildSite.mockReturnValue(built());
    const plugin = site();
    const hook = plugin.config;
    const fn = typeof hook === "function" ? hook : hook?.handler;
    fn?.call({} as never, { root: repoRoot } as UserConfig, { command: "build", mode: "production" } as ConfigEnv);
    const emitted: Array<{ fileName?: string; source?: unknown }> = [];
    const generate = plugin.generateBundle as unknown as (this: { emitFile: (f: object) => void }) => void;
    generate.call({ emitFile: (f) => emitted.push(f) });
    const font = emitted.find((f) => f.fileName === "assets/fonts/JetBrainsMono-Regular.ttf");
    expect(font).toBeDefined();
    expect(Buffer.compare(Buffer.from(font!.source as Uint8Array), readFileSync(resolve(repoRoot, "public/fonts/JetBrainsMono-Regular.ttf")))).toBe(0);
  });
});
