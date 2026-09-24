import { Rectangle } from "pixi.js";
import type { Application, Container, ICanvas } from "pixi.js";
import { snapshotFor, type FrameSnapshot } from "../renderer/frameSampler";

/**
 * Write one sampled frame's transforms onto an already-built scene tree.
 *
 * Moved here from `pngSequence.ts` in Phase 5B, unchanged: it is not
 * PNG-specific, and the video exporter needs exactly the same inverse of
 * `snapshotFor`.
 *
 * The exact inverse of `snapshotFor` (`renderer/frameSampler.ts`), and the
 * reason an encoder needs a tree at all: an `ObjectSnapshot` carries only
 * transforms — no shape, colour, size or parent link — so the *tree* supplies
 * the geometry and the *snapshot* supplies the motion. Widening the snapshot to
 * carry geometry would make every frame carry a copy of something that never
 * changes.
 *
 * Position and scale go through `layout.currentPos`/`currentScale` and
 * `__updateLayout()` rather than straight onto `container.position`, because
 * `position` places the container's PIVOT and `origin` may have moved that
 * pivot anywhere in the bounding box (`builder.ts`, D16/3C). `__updateLayout`
 * is the single place that knows that convention; writing `position` directly
 * here would be a second copy of it, free to drift.
 *
 * Rotation, alpha and `visible` are written unmodified, which is exactly what
 * `snapshotFor` read off the container — so a round trip is byte-identical
 * rather than merely close. `visible` matters specifically because
 * `cullEscapedBodies` (`renderer/physicsSync.ts`) can set it `false` mid-scene
 * and never sets it back: without writing it here, replaying a frame sampled
 * *before* a later cull would silently leave a culled-away object invisible
 * in every exported PNG, including the ones where it was genuinely on screen.
 *
 * Containers with no `__mareyId`, and ids the frame does not mention, are left
 * alone: a `Graphics` leaf inside a shape's wrapper has no id, and the mask
 * and background the live adapter adds are not scene objects.
 * `assertFrameSetMatchesTree` (below) checks the id sets agree once, before an
 * export's frame loop, so an id that silently matches nothing is an error
 * there rather than a stationary object here.
 */
export function applySnapshot(root: Container, frame: FrameSnapshot): void {
  const byId = new Map<string, FrameSnapshot["objects"][number]>();
  for (const o of frame.objects) byId.set(o.id, o);

  const visit = (c: Container): void => {
    const id = c.__mareyId;
    const layout = c.__mareyLayout;
    if (id !== undefined && layout) {
      const snap = byId.get(id);
      if (snap) {
        layout.currentPos.x = snap.x;
        layout.currentPos.y = snap.y;
        layout.currentScale.x = snap.scaleX;
        layout.currentScale.y = snap.scaleY;
        // Not `?.()`: a container that carries `__mareyLayout` but no
        // `__updateLayout` is unreachable today (`builder.ts` always sets
        // both together), but a silent no-op here would mean the position is
        // updated in the snapshot's bookkeeping, `snapshotFor` would read it
        // back as moved, and the drawn container would silently stay put.
        // Numbers right, pixels wrong, and nothing in an export's
        // `report.json` could ever see it. Throwing loudly trades an
        // unreachable-today path for a defect that cannot ship silently.
        if (!c.__updateLayout) {
          throw new Error(
            `[export] Container '${id}' has __mareyLayout but no __updateLayout, so applySnapshot cannot write its position through to the drawn container.`,
          );
        }
        c.__updateLayout();
        c.rotation = snap.rotation;
        c.alpha = snap.alpha;
        c.visible = snap.visible;
      }
    }
    for (const child of c.children) visit(child as Container);
  };
  visit(root);
}

/**
 * Fail loudly when a scene tree and a sampled frame set disagree about which
 * objects exist.
 *
 * An id in the snapshots that matches no container renders as an object that
 * never moves; an id in the tree that no snapshot mentions renders as one
 * frozen where it was built. Both are silent, both survive every hash check,
 * and both mean the tree and the frames came from different compilations.
 *
 * Checked once per export, not per frame — `frames[0]`'s id set is the whole
 * sequence's, because `snapshotFor` walks the same tree every time.
 */
export function assertFrameSetMatchesTree(
  root: Container,
  frames: ReadonlyArray<FrameSnapshot>,
): void {
  if (frames.length === 0) return;
  const treeIds = new Set(snapshotFor(root).map((o) => o.id));
  const frameIds = new Set(frames[0].objects.map((o) => o.id));
  const missing = [...frameIds].filter((id) => !treeIds.has(id));
  const extra = [...treeIds].filter((id) => !frameIds.has(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `[export] The scene tree and the sampled frames disagree on which objects exist, so some would never move. Only in the frames: [${missing.join(", ")}]. Only in the tree: [${extra.join(", ")}].`,
    );
  }
}

/**
 * Bind an `Application` and a scene tree into a per-frame rasterizer.
 *
 * **This is the one place a sampled frame becomes pixels**, and both exporters
 * go through it so they cannot disagree about the result's size or background.
 * Every argument below encodes a decision that would otherwise be duplicated:
 *
 * - `frame: region` at the renderer's own width/height, `resolution: 1` — the
 *   output is the scene's declared pixel dimensions, never the preview's
 *   `devicePixelRatio`, and never a content bounding box that would change
 *   size as objects move.
 * - `renderer.extract.canvas` rather than reading the live canvas: PixiJS does
 *   not set `preserveDrawingBuffer`, so an in-page read returns a blank frame.
 *   A naive exporter writes blank output *and reports success*, because
 *   identical blank frames hash perfectly consistently. Extraction renders
 *   into a texture the caller owns and reads back from that.
 * - `clearColor` from the Application's own background, so an export is the
 *   scene's background rather than transparent.
 *
 * `generateTexture` hands the renderer its own translate-only transform, which
 * *replaces* the target container's local transform, so `fit` letterboxing on
 * `root` is bypassed rather than baked in. The exported artifact is the scene,
 * not the preview.
 *
 * **Reads `app.renderer` only, never `app.ticker`.** `app` owns a `Ticker`
 * (`app.ticker`), so a wall clock is technically reachable through this
 * function's own argument — the guarantee below is precise rather than
 * absolute, not a structural impossibility. What actually holds is narrower:
 * nothing in this function or the rasterizer it returns reads anything off
 * `app` besides `renderer`, so what gets exported cannot be a function of
 * when it was exported. This is roadmap §6.2's "encoders never advance the
 * simulation and never see a wall clock", for the wall-clock half;
 * `encodePngSequence`'s own docstring covers the simulation half.
 */
export function createFrameRasterizer(
  app: Application,
  root: Container,
  frames: ReadonlyArray<FrameSnapshot>,
): (frame: FrameSnapshot) => ICanvas {
  assertFrameSetMatchesTree(root, frames);

  const region = new Rectangle(0, 0, app.renderer.width, app.renderer.height);
  const clearColor = app.renderer.background.colorRgba;

  return (frame: FrameSnapshot): ICanvas => {
    applySnapshot(root, frame);
    return app.renderer.extract.canvas({
      target: root,
      frame: region,
      resolution: 1,
      clearColor,
      antialias: true,
    });
  };
}
