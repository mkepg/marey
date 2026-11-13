import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { buildSite } from "../site/build/index";
import { renderLayout } from "../site/build/layout";
import { escapeHtml } from "../site/build/escape";
import type { BuiltSite } from "../site/build/types";

const GENERATED_FILES = new Map([
  ["/sitemap.xml", { type: "application/xml; charset=utf-8", pick: (s: BuiltSite) => s.sitemap }],
  ["/search-index.json", { type: "application/json; charset=utf-8", pick: (s: BuiltSite) => s.searchIndex }],
]);

/**
 * The scene font. `src/player/render.ts` resolves it as
 * `./fonts/JetBrainsMono-Regular.ttf` beside its own chunk, so the build emits
 * it at `assets/fonts/` and development serves it under `src/player/fonts/`.
 * Without it a scene with `text` fails on the site with PLAYER_FONT_UNAVAILABLE,
 * because the request falls through to an HTML page.
 */
const SCENE_FONT_SOURCE = "public/fonts/JetBrainsMono-Regular.ttf";
const SCENE_FONT_BUILD_PATH = "assets/fonts/JetBrainsMono-Regular.ttf";
const SCENE_FONT_DEV_URL = "/src/player/fonts/JetBrainsMono-Regular.ttf";

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

/** A page that shows the build's errors where the content would be. */
function errorPage(errors: ReadonlyArray<string>): string {
  const list = errors.map((e) => `<li><code>${escapeHtml(e)}</code></li>`).join("");
  return renderLayout({
    section: "root",
    url: "/404.html",
    title: "The site has build errors",
    description: "The documentation site cannot be built until these are fixed.",
    bodyHtml: `<p>The production build fails on each of these.</p><ul class="build-errors">${list}</ul>`,
    headings: [],
    sidebar: [],
    prev: null,
    next: null,
    breadcrumb: [],
  });
}

/**
 * Adds the documentation site to the Vite build. The pages come from
 * `site/build`; each is a virtual HTML entry at its output path, so the
 * playground's `index.html` and every page share one bundle. In
 * development the same pages are served from middleware, rebuilt from disk
 * on each request.
 */
export function site(): Plugin {
  let root = process.cwd();
  let built: BuiltSite | null = null;
  const pageByPath = new Map<string, string>();

  function register(result: BuiltSite): Record<string, string> {
    pageByPath.clear();
    const input: Record<string, string> = {};
    for (const page of result.pages) {
      const abs = resolve(root, page.outFile);
      pageByPath.set(normalize(abs), page.html);
      input[page.outFile.replace(/\.html$/, "")] = abs;
    }
    return input;
  }

  return {
    name: "marey-site",

    config(userConfig, env) {
      root = resolve(userConfig.root ?? process.cwd());
      built = buildSite(root);
      if (env.command === "build" && built.errors.length > 0) {
        throw new Error(`The documentation site has ${built.errors.length} error(s):\n${built.errors.join("\n")}`);
      }
      const pages = register(built);
      return {
        build: {
          rollupOptions: {
            input: { main: resolve(root, "index.html"), ...pages },
          },
        },
      };
    },

    resolveId(id) {
      const path = normalize(id);
      return pageByPath.has(path) ? path : null;
    },

    load(id) {
      return pageByPath.get(normalize(id)) ?? null;
    },

    generateBundle() {
      if (!built) return;
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: built.sitemap });
      this.emitFile({ type: "asset", fileName: "search-index.json", source: built.searchIndex });
      this.emitFile({
        type: "asset",
        fileName: SCENE_FONT_BUILD_PATH,
        source: readFileSync(resolve(root, SCENE_FONT_SOURCE)),
      });
    },

    configureServer(server: ViteDevServer) {
      const contentRoot = normalize(resolve(root, "site"));
      const reload = (file: string) => {
        const path = normalize(file);
        if (path.startsWith(`${contentRoot}/content/`) || path === `${contentRoot}/site.json`) {
          server.ws.send({ type: "full-reload" });
        }
      };
      server.watcher.on("change", reload);
      server.watcher.on("add", reload);
      server.watcher.on("unlink", reload);

      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const url = (req.url ?? "/").split("?")[0];
        if (url === "/") return next();
        if (url === SCENE_FONT_DEV_URL) {
          try {
            const font = readFileSync(resolve(root, SCENE_FONT_SOURCE));
            res.setHeader("Content-Type", "font/ttf");
            res.end(font);
          } catch (e) {
            next(e);
          }
          return;
        }
        const generated = GENERATED_FILES.get(url);
        const sectionPath = /^\/(learn|guides|gallery|reference)(\/[^.]*)?$/.test(url);
        if (!generated && !sectionPath && url !== "/404.html") return next();

        try {
          const result = buildSite(root);
          for (const error of result.errors) server.config.logger.warn(`[site] ${error}`);
          if (generated) {
            res.setHeader("Content-Type", generated.type);
            res.end(generated.pick(result));
            return;
          }
          const page = result.pages.find((p) => p.url === url);
          if (!page) {
            // A section path without its trailing slash: send it where the page is.
            if (result.pages.some((p) => p.url === `${url}/`)) {
              res.statusCode = 301;
              res.setHeader("Location", `${url}/`);
              res.end();
              return;
            }
            return next();
          }
          const html = result.errors.length > 0 ? errorPage(result.errors) : page.html;
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(await server.transformIndexHtml(url, html));
        } catch (e) {
          next(e);
        }
      });
    },
  };
}
