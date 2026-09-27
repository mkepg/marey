import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Route } from "playwright-core";
import { compileSource } from "../compiler/compileSource";
import { planExport } from "../compiler/export/exportContract";
import {
  EXPORT_ORIGIN,
  FRAME_PATH,
  type CliExportFormat,
  type CliExportRequest,
} from "../exportPage/protocol";
import { parseExportArgs, frameFileName } from "./exportArgs";
import { FrameAssembler } from "./frameAssembler";
import { mapLaunchError, summaryLine } from "./exportReport";

/**
 * `marey export`'s Node side (spec §4.4): refuse what Node can already see is
 * unexportable, then launch the pinned headless Chromium, serve the export
 * page to it through `page.route`, call the page's one entry point, and
 * receive the output. The page compiles the source again and runs the
 * pipeline the button runs; nothing here samples or rasterizes (ruling R45).
 */

/**
 * Forces SwiftShader, so a machine whose headless mode would pick a GPU still
 * rasterizes the way every other export and check does (spec §4.4). The same
 * flags `tools/visual-check/quality-check.mjs` launches with; every check that
 * compares against the CLI imports this one constant.
 */
export const EXPORT_LAUNCH_ARGS: readonly string[] = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
];

export interface ExportSceneOptions {
  readonly source: string;
  readonly format: CliExportFormat;
  readonly fps: number;
  readonly durationSeconds: number | null;
  /** Directory holding the built export page. Defaults to ../export-page next to the CLI bundle. */
  readonly pageRoot?: string;
  /** Called with each lossless frame, in index order. For checks, not a CLI flag. */
  readonly onFrame?: (index: number, png: Uint8Array) => void | Promise<void>;
  /** Request paths the route handler aborts. For checks (spec §9.2, 5C deferral 14), not a CLI flag. */
  readonly abortPaths?: readonly string[];
}

export interface ExportSceneResult {
  readonly fps: number;
  readonly frameCount: number;
  readonly width: number;
  readonly height: number;
  readonly hash: string;
  /** Whole-file formats. */
  readonly file: Uint8Array | null;
  /** png: every frame, in index order. */
  readonly frames: Uint8Array[] | null;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
};

/** What the route handler does with one request to `EXPORT_ORIGIN`. */
export type RouteAction =
  | { readonly kind: "abort" }
  | { readonly kind: "frame"; readonly index: number }
  | { readonly kind: "file"; readonly path: string; readonly contentType: string }
  | { readonly kind: "status"; readonly status: number };

/**
 * Pure: maps a request's method and URL path onto what the handler does. An
 * aborted path wins over everything else, so a check can fail any request.
 * A frame's index is read from its URL, never from the order requests arrive
 * in (5C ruling T4-R2). Static files resolve inside `pageRoot` only; a path
 * that would leave it is a 404, like a missing file.
 */
export function routeAction(
  method: string,
  pathname: string,
  pageRoot: string,
  abortPaths: readonly string[] = [],
): RouteAction {
  if (abortPaths.includes(pathname)) return { kind: "abort" };

  if (method === "POST") {
    if (!pathname.startsWith(FRAME_PATH)) return { kind: "status", status: 405 };
    const raw = pathname.slice(FRAME_PATH.length);
    if (!/^\d+$/.test(raw)) return { kind: "status", status: 400 };
    return { kind: "frame", index: Number(raw) };
  }

  if (method !== "GET") return { kind: "status", status: 405 };

  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const path = join(pageRoot, relativePath);
  const fromRoot = relative(pageRoot, path);
  if (fromRoot === "" || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    return { kind: "status", status: 404 };
  }
  const contentType = CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
  return { kind: "file", path, contentType };
}

/**
 * The page samples the scene it compiled itself; Node planned the one it
 * compiled. The two must agree on the frame count, or the frames Node places
 * by index do not describe the plan it checked.
 */
export function assertSameFrameCount(pageFrameCount: number, plannedFrameCount: number): void {
  if (pageFrameCount !== plannedFrameCount) {
    throw new Error(
      `[export] The export page produced ${pageFrameCount} frames, but Node planned ${plannedFrameCount}.`,
    );
  }
}

/** Compile and plan in Node, so an unexportable scene is refused before any browser starts (spec §4.4 step 1). */
function preflight(source: string, fps: number, durationSeconds: number | null): number {
  const outcome = compileSource(source);
  if (!outcome.ok || outcome.ir === null) {
    throw new Error(
      outcome.errors
        .map((e) => (e.line !== undefined && e.col !== undefined ? `${e.line}:${e.col}: ${e.message}` : e.message))
        .join(" | "),
    );
  }
  const planned = planExport(outcome.ir, { fps, durationSeconds: durationSeconds ?? undefined });
  if (!planned.ok) {
    throw new Error(planned.diagnostics.map((d) => d.message).join(" | "));
  }
  return planned.plan.frameCount;
}

function defaultPageRoot(): string {
  return fileURLToPath(new URL("../export-page/", import.meta.url));
}

export async function exportScene(opts: ExportSceneOptions): Promise<ExportSceneResult> {
  const plannedFrameCount = preflight(opts.source, opts.fps, opts.durationSeconds);

  const pageRoot = opts.pageRoot ?? defaultPageRoot();
  if (!existsSync(join(pageRoot, "index.html"))) {
    throw new Error(`[export] The export page is not built: ${join(pageRoot, "index.html")} is missing.`);
  }

  let browser: Browser;
  try {
    browser = await chromium.launch({ args: [...EXPORT_LAUNCH_ARGS] });
  } catch (e) {
    throw new Error(mapLaunchError(e) ?? String(e));
  }

  try {
    const page = await browser.newPage();
    const assembler = new FrameAssembler(plannedFrameCount);
    const frames: Uint8Array[] = [];
    // The first frame refusal, kept because the page only sees an HTTP
    // status and reports that; this message says what was wrong.
    let frameError: Error | null = null;
    // Chains `onFrame` so frames reach it in index order even if two POSTs
    // are handled concurrently.
    let delivered: Promise<void> = Promise.resolve();

    const receiveFrame = async (route: Route, index: number): Promise<void> => {
      try {
        const body = route.request().postDataBuffer();
        if (body === null) throw new Error(`[export] frame ${index} arrived with no body`);
        const ready = assembler.add(index, new Uint8Array(body));
        for (const frame of ready) {
          frames.push(frame.bytes);
          const onFrame = opts.onFrame;
          if (onFrame) delivered = delivered.then(() => onFrame(frame.index, frame.bytes));
        }
        await delivered;
        await route.fulfill({ status: 204 });
      } catch (e) {
        frameError ??= e instanceof Error ? e : new Error(String(e));
        await route.fulfill({ status: 500 });
      }
    };

    await page.route(EXPORT_ORIGIN + "/**", async (route) => {
      const request = route.request();
      const action = routeAction(request.method(), new URL(request.url()).pathname, pageRoot, opts.abortPaths);
      switch (action.kind) {
        case "abort":
          return route.abort();
        case "frame":
          return receiveFrame(route, action.index);
        case "status":
          return route.fulfill({ status: action.status });
        case "file":
          if (!statSync(action.path, { throwIfNoEntry: false })?.isFile()) return route.fulfill({ status: 404 });
          return route.fulfill({
            status: 200,
            contentType: action.contentType,
            body: readFileSync(action.path),
          });
      }
    });

    await page.goto(EXPORT_ORIGIN + "/");
    await page.waitForFunction(() => typeof window.__mareyCliExport === "function");

    const request: CliExportRequest = {
      source: opts.source,
      format: opts.format,
      fps: opts.fps,
      ...(opts.durationSeconds === null ? {} : { durationSeconds: opts.durationSeconds }),
    };
    const result = await page.evaluate((r) => window.__mareyCliExport!(r), request);

    if (frameError !== null) throw frameError;
    if (!result.ok) throw new Error(result.message);
    assertSameFrameCount(result.frameCount, plannedFrameCount);

    let file: Uint8Array | null = null;
    if (opts.format === "png") {
      assembler.finish();
    } else if (result.text !== null) {
      // What the button's `new Blob([string])` downloads: the string as UTF-8.
      file = Buffer.from(result.text, "utf8");
    } else if (result.fileBase64 !== null) {
      file = Buffer.from(result.fileBase64, "base64");
    } else {
      throw new Error(`[export] The export page returned no file for '${opts.format}'.`);
    }

    return {
      fps: result.fps,
      frameCount: result.frameCount,
      width: result.width,
      height: result.height,
      hash: result.hash,
      file,
      frames: opts.format === "png" ? frames : null,
    };
  } finally {
    await browser.close();
  }
}

/**
 * The only impure part: reads the scene, writes the output, prints the
 * summary line. `rest` is the arguments after the `export` command name.
 */
export async function runExport(rest: readonly string[]): Promise<number> {
  const args = parseExportArgs(rest);
  if (args.error !== null) {
    console.error(args.error);
    return 1;
  }

  try {
    const source = readFileSync(args.file, "utf8");
    const result = await exportScene({
      source,
      format: args.format,
      fps: args.fps,
      durationSeconds: args.durationSeconds,
    });

    const sha = createHash("sha256");
    let bytes = 0;
    if (result.frames !== null) {
      mkdirSync(args.out, { recursive: true });
      result.frames.forEach((png, index) => {
        writeFileSync(join(args.out, frameFileName(index, result.frameCount)), png);
        sha.update(png);
        bytes += png.byteLength;
      });
    } else if (result.file !== null) {
      mkdirSync(dirname(args.out), { recursive: true });
      writeFileSync(args.out, result.file);
      sha.update(result.file);
      bytes = result.file.byteLength;
    }

    console.log(
      summaryLine({
        out: args.out,
        frameCount: result.frameCount,
        fps: result.fps,
        width: result.width,
        height: result.height,
        bytes,
        sha256: sha.digest("hex"),
        hash: result.hash,
      }),
    );
    return 0;
  } catch (e) {
    console.error(`${args.file}: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}
