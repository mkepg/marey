import { Application, CanvasTextMetrics, Container } from "pixi.js";
import type { ICanvas } from "pixi.js";
import { compileSource } from "../compileSource";
import { destroyExportApp } from "./exportApp";
import { ensureExportFonts } from "./exportFonts";
import { planExport, type SamplerPlan } from "./exportContract";
import { createFrameRasterizer } from "./frameRaster";
import { buildNode } from "../renderer/builder";
import { sampleFrames, type FrameSnapshot } from "../renderer/frameSampler";
import { SceneRuntime } from "../renderer/sceneRuntime";
import { MatterWorld } from "../renderer/physicsWorld";
import type { IRSceneNode } from "../sceneIR";

/**
 * The compile -> plan -> build -> sample prefix every export pipeline runs
 * before it does anything pipeline-specific, plus the `finally` teardown
 * that always follows it.
 *
 * Moved out of `videoPipeline.ts` in Phase 5C Task 4 (spec §5.2). Before
 * this, the same shape existed three times over -- `runVideoExport`
 * (`videoPipeline.ts`), `runLottieExport` (`lottiePipeline.ts`) and
 * `devExportSeam.ts`'s `exportPng` -- which is exactly what "one
 * orchestration per export" (5B ruling R45, global constraint 7) exists to
 * prevent: a fix to the Text-texture trap, the try/finally teardown
 * rationale or the device-limit check had to be copied by hand into every
 * copy, with nothing enforcing that it was. `withRasterExport` is now the
 * only place any of the steps below happen; the callers differ only in what
 * they pass through `beforeBuild`/`afterInit`/`afterBuild`/`scale` and what
 * they do with the `PreparedRasterExport` they get back inside `use`.
 */

/**
 * Optional hooks a caller plugs into the shared prefix.
 *
 * `scale` is the one axis that is not just a hook: it governs both the
 * export `Application`'s own init `resolution` (the Text-texture trap, spec
 * §2.2 -- PixiJS rasterizes a `Text`'s texture at the *renderer's*
 * resolution, so an app initialised at 1 and extracted at N would upscale
 * already-blurry 1x text while every vector shape came out sharp at N) and
 * whether `PreparedRasterExport` carries a `rasterize` function at all
 * (T4-R1, this task's controller ruling). `runLottieExport` encodes inert
 * JSON, never rasterizes a single frame, and has no scale to speak of, so it
 * omits `scale` entirely rather than passing a meaningless `1` -- the export
 * `Application` it still needs, so `SceneRuntime`/`buildNode` have a live
 * Pixi context to attach to, inits at resolution 1 either way.
 * `runVideoExport`'s scale is `VideoPlan.scale` (`VIDEO_SCALE`, currently 2),
 * known only once `beforeBuild` has run `planVideo`, so it passes a
 * zero-argument function reading the `VideoPlan` its own `beforeBuild` just
 * stashed in a closure, rather than a plain number. The PNG seam
 * (`devExportSeam.ts`) passes a plain `1`.
 */
export interface RasterExportOptions {
  readonly source: string;
  readonly fps: number;
  /** Explicit export bound in seconds. Overrides the scene's own duration. */
  readonly durationSeconds?: number;
  readonly scale?: number | ((ir: IRSceneNode, plan: SamplerPlan) => number);
  /**
   * Runs after `planExport`, before any `Application` exists. Throw to
   * refuse. `runVideoExport` runs `planVideo` and the codec probe
   * `assertVideoEncodable` here (5B ruling I-4: both before the scene is
   * built or sampled, so a refusal never waits behind a build-and-sample
   * pass).
   */
  readonly beforeBuild?: (ir: IRSceneNode, plan: SamplerPlan) => Promise<void> | void;
  /**
   * Runs after `app.init`, before `buildNode`. Throw to refuse.
   * `runVideoExport` reads the export `Application`'s own GL context
   * (`MAX_TEXTURE_SIZE`/`MAX_RENDERBUFFER_SIZE`) here and refuses a coded
   * size the device cannot render (spec §2.3) -- one line reading the
   * device's real limits, which is why this cannot be a pure function like
   * the rest of `videoContract.ts`.
   */
  readonly afterInit?: (app: Application) => void;
  /**
   * Runs after `buildNode` has built the whole tree, before the physics
   * world exists and before a single frame is sampled. Throw to refuse.
   *
   * `runLottieExport` plans here (Phase 5C Task 8, ruling T8-R1): `text`
   * needs pixi's layout of the built `Text` and HarfBuzz's outlines of it
   * (spec §6.2-6.3), and neither exists before the build. Its refusals
   * (`LOTTIE_TEXT_MISSING_GLYPH`) therefore arrive after the GL context is
   * opened and the tree is built (both torn down in `finally`), but still
   * before sampling: design §2's "diagnostics are properties of the scene,
   * not of the frames" holds, because no frame is ever produced for a
   * refused scene. Video, APNG and the PNG seam pass none.
   */
  readonly afterBuild?: (root: Container, ir: IRSceneNode, plan: SamplerPlan) => Promise<void> | void;
}

/**
 * Everything the shared prefix produced, handed to the caller's `use`.
 *
 * `rasterize` exists only when the caller supplied `scale` (T4-R1): a
 * pipeline that never rasterizes a frame -- `runLottieExport` -- gets
 * `undefined` here rather than a rasterizer nobody asked for and nobody
 * would call.
 */
/**
 * Let the browser run other tasks, including a repaint, if at least this
 * long has passed since the last yield. A resolved promise is a microtask
 * and never lets the page repaint; a `MessageChannel` message is a task, and
 * unlike `setTimeout(0)` it is not clamped to 4 ms once nested.
 *
 * 100 ms rather than one display frame, measured (Phase 5B fix-wave report,
 * item 3; headless Chromium with SwiftShader, the full app page): at 16 ms a
 * 900-frame export took 43.7 s against 21-22 s with no explicit yield,
 * because every yield also lets the live preview repaint; at 100 ms it took
 * 22.1 s. The longest main-thread gap was the same, about 0.75 s, in all
 * three, so the explicit yield is not what ended the freeze: it guarantees a
 * repaint opportunity at least every 100 ms of rasterize-and-encode work
 * without relying on mediabunny's own backpressure awaits to provide one.
 *
 * Moved here in Phase 5C Task 5 from `videoPipeline.ts`, whose lazy
 * rasterize-and-encode loop was the only caller until `apngPipeline.ts`
 * needed the identical pacing for its own lazy rasterize-and-mux loop.
 * Exported rather than copied, per global constraint 7 ("one orchestration
 * per export" -- the same reasoning that keeps `withRasterExport` itself as
 * the single copy of the compile -> plan -> build -> sample prefix applies
 * to this shared pacing helper too).
 */
export const YIELD_EVERY_MS = 100;

export function yieldToEventLoop(): Promise<void> {
  if (typeof MessageChannel === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

export interface PreparedRasterExport {
  readonly ir: IRSceneNode;
  readonly plan: SamplerPlan;
  readonly app: Application;
  readonly root: Container;
  readonly frames: ReadonlyArray<FrameSnapshot>;
  readonly rasterize?: (frame: FrameSnapshot) => ICanvas;
}

/** What a caller that supplied `scale` receives: `rasterize` is always there. */
export type RasterizingExport = PreparedRasterExport & {
  readonly rasterize: (frame: FrameSnapshot) => ICanvas;
};

/**
 * Compile, plan, init, build, sample; call `use`; always tear down.
 *
 * The **only** copy of the compile -> plan -> build -> sample prefix
 * (ruling R45 / global constraint 7). `runVideoExport`, `runLottieExport`
 * and `devExportSeam.ts`'s `exportPng` are all built on this, and none of
 * them holds a second copy of any step below.
 *
 * The first overload makes T4-R1's rule a type: a caller that supplies
 * `scale` gets a `rasterize` that is always present. So a rasterizing
 * pipeline needs neither a runtime "no rasterizer" guard nor a non-null
 * assertion.
 */
export function withRasterExport<T>(
  opts: RasterExportOptions & { readonly scale: NonNullable<RasterExportOptions["scale"]> },
  use: (prepared: RasterizingExport) => Promise<T>,
): Promise<T>;
export function withRasterExport<T>(
  opts: RasterExportOptions,
  use: (prepared: PreparedRasterExport) => Promise<T>,
): Promise<T>;
export async function withRasterExport<T>(
  opts: RasterExportOptions,
  use: (prepared: RasterizingExport) => Promise<T>,
): Promise<T> {
  const outcome = compileSource(opts.source);
  if (!outcome.ok || !outcome.ir) {
    throw new Error(
      `Source did not compile: ${outcome.errors.map((e) => `${e.phase}: ${e.message}`).join(" | ")}`,
    );
  }
  const ir = outcome.ir;

  // `" | "`, not `" "`: `planExport` accumulates, and each diagnostic is a
  // complete sentence, so two joined with a space read as one confused
  // message in a toast (`exportContract.ts:87-114`).
  const planned = planExport(ir, { fps: opts.fps, durationSeconds: opts.durationSeconds });
  if (!planned.ok) {
    throw new Error(planned.diagnostics.map((d) => d.message).join(" | "));
  }
  const plan = planned.plan;

  // Runs before any Application exists (5B ruling I-4): a refusal here -- an
  // unsupported codec, a scene too large to encode -- arrives before a
  // single tick is simulated or a GL context is opened. (An unbounded scene
  // is refused by `planExport` just above.) Lottie's text refusals cannot be
  // made here, because they need the built tree; see `afterBuild`.
  await opts.beforeBuild?.(ir, plan);

  // Fonts first, for every export (spec §6.1): the one prefix all four
  // exporters share, so video, APNG, Lottie and the PNG seam all wait for
  // the export font here rather than at four call sites. Before any pixi
  // object is built, because a `Text` measured on a cold page gets the
  // fallback font's metrics (Task 6, Q6). After `beforeBuild`, so a scene
  // a pipeline refuses outright (an unsupported codec) is refused without
  // waiting on a font download it would never use. (Lottie's missing-glyph
  // refusal comes later, in `afterBuild`, and does wait: it needs the font
  // to measure the text at all.) A text-free scene makes no call. Throws
  // `[EXPORT_FONT_UNAVAILABLE]` if the font still is not available.
  await ensureExportFonts(ir);

  // Loading the font is not enough on its own: pixi may already have
  // measured it WITHOUT the font. `CanvasTextMetrics.measureFont` caches
  // ascent/descent/fontSize in a static `_fonts` map keyed by the CSS font
  // string alone (pixi.js 8.16.0, `CanvasTextMetrics.mjs`), with nothing in
  // the key that records whether the face had loaded. So if the live preview
  // built this scene's text on a cold page, before the font arrived, every
  // later `TextStyle` with the same font props, the fresh ones
  // `buildNode` makes below included, is served the fallback font's
  // metrics. Measured on a fresh page (`docs/research/2026-09-24-export-
  // quality-probes/text-plumbing/cache-run.mjs`): after one fallback
  // measurement the export built a 60px two-line text at 504 x 126
  // (lineHeight 63, ascent 51) where a warm page builds 504 x 142
  // (lineHeight 71, ascent 60). Width was right either way: the per-text
  // `_measurementCache` is keyed by `styleKey`, which is `${uid}-${tick}`,
  // so a new `TextStyle` never hits an entry an older one wrote.
  // `clearMetrics()` with no argument is pixi's public way to empty
  // `_fonts`; it costs one re-measure per font string, for the preview too,
  // which then picks up the loaded font's real metrics as well.
  CanvasTextMetrics.clearMetrics();

  const scale = typeof opts.scale === "function" ? opts.scale(ir, plan) : opts.scale;

  // `app` is assigned before it is known whether `init()` will succeed, and
  // the `finally` below gates on `app.renderer` (assigned only once
  // `init()`'s `autoDetectRenderer(...)` resolves) rather than on `app`
  // alone, so a failed `init()` cannot turn into a second, masking crash
  // inside `finally`. The `try` opens at `new Application()` so a throw from
  // `init()`, the `buildNode` loop or either constructor cannot leak a live
  // WebGL context.
  let app: Application | undefined;
  let root: Container | undefined;
  let runtime: SceneRuntime | undefined;
  try {
    app = new Application();
    await app.init({
      width: ir.width,
      height: ir.height,
      background: ir.background,
      backgroundAlpha: 1,
      antialias: true,
      // The Text-texture trap (spec §2.2): PixiJS rasterizes a `Text`'s own
      // texture at the RENDERER's resolution, not the `extract.canvas` call
      // site's. Initialising at `resolution: 1` and extracting at a higher
      // `scale` would upscale already-blurry 1x text while every vector
      // shape came out sharp at the higher scale. Initialising here at the
      // same scale frames are later extracted at (`createFrameRasterizer`,
      // `frameRaster.ts`) keeps text native to the coded size. A pipeline
      // that supplies no `scale` at all (Lottie, which never rasterizes)
      // inits at 1.
      resolution: scale ?? 1,
      autoDensity: false,
      autoStart: false,
    });

    // Refuse a coded size the device's own GL context cannot render, before
    // building or sampling the scene (spec §2.3). PixiJS checks no
    // texture-size limit of its own (research §6), so without this a scene
    // whose coded size exceeds the device's limits would fail deep inside
    // WebGL with no name a person could act on.
    opts.afterInit?.(app);

    root = new Container();
    for (const node of ir.children) root.addChild(buildNode(node));

    // After the build, before the world and before sampling (T8-R1): a
    // refusal here means no frame is ever sampled for the scene.
    await opts.afterBuild?.(root, ir, plan);

    const world = new MatterWorld(ir.width, ir.height);
    runtime = new SceneRuntime(world, root);

    // Sample the whole scene first, then hand off to `use`: `use` never
    // sees the runtime, so a pipeline's own encode/build step cannot
    // interleave with sampling even by mistake.
    const frames = sampleFrames(runtime, root, plan);
    const rasterize =
      scale !== undefined ? createFrameRasterizer(app, root, frames, scale) : undefined;

    // `rasterize` is undefined exactly when `scale` is. Only the second
    // overload allows that, and its callback declares `rasterize` optional,
    // so this cast is sound for both overloads.
    return await use({ ir, plan, app, root, frames, rasterize } as RasterizingExport);
  } finally {
    runtime?.destroy();
    root?.destroy({ children: true, texture: true });
    if (app?.renderer) destroyExportApp(app);
  }
}
