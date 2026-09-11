import { TICK_HZ, secondsToTicks, type IRSceneNode } from "../sceneIR";

/**
 * Diagnostics for an export request that cannot be honoured.
 *
 * Prefixed `EXPORT_` rather than `TYPE_` because these fire after compilation
 * has already succeeded, at export request: the source is valid Marey, and what
 * is wrong is the combination of scene and request. Roadmap §6.1 requires the
 * set be defined before any encoder exists, which is why this module lands
 * ahead of the PNG one.
 */
export type ExportDiagnosticCode =
  | "EXPORT_UNBOUNDED_SCENE"
  | "EXPORT_INVALID_DURATION"
  | "EXPORT_UNSUPPORTED_FPS"
  | "EXPORT_EMPTY_SEQUENCE"
  | "EXPORT_FRAME_BUDGET";

export interface ExportDiagnostic {
  readonly code: ExportDiagnosticCode;
  readonly message: string;
}

export interface ExportRequest {
  readonly fps: number;
  /** Explicit export bound in seconds. Overrides the scene's own duration. */
  readonly durationSeconds?: number;
}

/**
 * A private brand, not exported. Its only purpose is to make `SamplerPlan`
 * a nominal type rather than a structural one: without it, any object
 * literal with the right four number fields would satisfy `SamplerPlan`,
 * and `sampleFrames` (`renderer/frameSampler.ts`) would accept a
 * hand-built plan that never passed through `planExport`'s validation —
 * e.g. a non-integer `ticksPerFrame`, which advances a fractional number of
 * ticks per frame and labels frames with `tick` values that do not
 * correspond to any sampled state. There is no legitimate way to produce a
 * value of this branded type outside this module, because nothing outside
 * it can write a `unique symbol`-keyed property.
 */
declare const PLAN_BRAND: unique symbol;

export interface SamplerPlan {
  readonly [PLAN_BRAND]: true;
  readonly fps: number;
  readonly ticksPerFrame: number;
  readonly durationTicks: number;
  readonly frameCount: number;
}

export type ExportPlanResult =
  | { readonly ok: true; readonly plan: SamplerPlan }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<ExportDiagnostic> };

/**
 * Most frames one export may produce: two minutes at 60fps, five at 24.
 *
 * Snapshots are held as an array, so an unbounded request would exhaust the
 * tab rather than fail. The same reasoning as `TYPE_PHYSICS_BODY_LIMIT` and the
 * 15,000-object parser budget: a ceiling that fails with a name beats one that
 * fails with a crash.
 */
export const MAX_EXPORT_FRAMES = 7_200;

/**
 * Validate an export request and resolve it into a sampler plan.
 *
 * **This is the only function that constructs a `SamplerPlan`**, and
 * `sampleFrames` requires one. That is what makes Gate B's "invalid or
 * unbounded duration fails before rendering begins" structural rather than a
 * convention a caller can forget: holding a plan is proof the request was
 * checked.
 *
 * Every applicable diagnostic is returned, not just the first, so one call
 * tells a caller everything wrong with the request.
 */
export function planExport(ir: IRSceneNode, request: ExportRequest): ExportPlanResult {
  const diagnostics: ExportDiagnostic[] = [];

  // Frame rate must divide the fixed tick rate exactly. `sceneIR.ts` chose
  // 120Hz precisely so 24, 30 and 60 do (5, 4 and 2 ticks per frame); a rate
  // that did not would force sampling *between* ticks, which is the
  // interpolation an exact export exists to avoid.
  const fpsOk =
    Number.isInteger(request.fps) && request.fps > 0 && TICK_HZ % request.fps === 0;
  if (!fpsOk) {
    diagnostics.push({
      code: "EXPORT_UNSUPPORTED_FPS",
      message: `[EXPORT_UNSUPPORTED_FPS] Frame rate ${request.fps} is not supported. It must be a positive whole number that divides the ${TICK_HZ}Hz simulation rate exactly, so every exported frame lands on a simulation tick. Supported rates include 24, 30 and 60.`,
    });
  }

  const explicit = request.durationSeconds;
  let seconds: number | null;
  if (explicit !== undefined) {
    if (!Number.isFinite(explicit) || explicit <= 0) {
      diagnostics.push({
        code: "EXPORT_INVALID_DURATION",
        message: `[EXPORT_INVALID_DURATION] The export bound must be a positive, finite number of seconds. Received ${explicit}.`,
      });
      seconds = null;
    } else {
      seconds = explicit;
    }
  } else if (ir.duration !== null) {
    seconds = ir.duration;
  } else {
    diagnostics.push({
      code: "EXPORT_UNBOUNDED_SCENE",
      message: "[EXPORT_UNBOUNDED_SCENE] This scene declares no 'duration', so it has no finite length to export. Add 'duration: <seconds>' to the scene block, or pass an explicit export bound.",
    });
    seconds = null;
  }

  if (seconds === null || !fpsOk) {
    return { ok: false, diagnostics: Object.freeze(diagnostics) };
  }

  const durationTicks = secondsToTicks(seconds);
  const ticksPerFrame = TICK_HZ / request.fps;
  // `floor`, not `round`: a duration that is not a whole number of frames
  // truncates rather than sampling past the declared end of the scene.
  const frameCount = Math.floor(durationTicks / ticksPerFrame);

  if (frameCount < 1) {
    diagnostics.push({
      code: "EXPORT_EMPTY_SEQUENCE",
      message: `[EXPORT_EMPTY_SEQUENCE] A ${seconds}s scene at ${request.fps}fps yields no frames. The scene must run at least one frame (${ticksPerFrame} ticks) to export.`,
    });
  }

  if (frameCount > MAX_EXPORT_FRAMES) {
    diagnostics.push({
      code: "EXPORT_FRAME_BUDGET",
      message: `[EXPORT_FRAME_BUDGET] This export would produce ${frameCount} frames, over the ${MAX_EXPORT_FRAMES}-frame ceiling. Export a shorter bound or a lower frame rate.`,
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: Object.freeze(diagnostics) };
  }

  return {
    ok: true,
    // The one cast for the one brand: every field above has just been
    // validated, so this literal is a legitimate SamplerPlan, but it cannot
    // satisfy the type structurally because it has no PLAN_BRAND property
    // (nothing can, outside this module). This is the single site allowed
    // to assert that; do not copy the cast anywhere else; use `planExport`.
    plan: Object.freeze({ fps: request.fps, ticksPerFrame, durationTicks, frameCount }) as SamplerPlan,
  };
}
