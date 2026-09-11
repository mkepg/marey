import { Rectangle } from "pixi.js";
import type { Application, Container, ICanvas } from "pixi.js";
import { snapshotFor, type FrameSnapshot } from "../renderer/frameSampler";

/**
 * Write one sampled frame's transforms onto an already-built scene tree.
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
 * and background the live adapter adds are not scene objects. `encodePngSequence`
 * checks the id sets agree once, before its loop, so an id that silently
 * matches nothing is an error there rather than a stationary object here.
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
        // both together), but a silent no-op here is exactly this task's
        // headline failure mode in miniature — the position above is
        // updated in the snapshot's bookkeeping, `snapshotFor` would read it
        // back as moved, and the drawn container would silently stay put.
        // Numbers right, pixels wrong, and nothing in `report.json` could
        // ever see it. Throwing loudly trades an unreachable-today path for
        // a defect that cannot ship silently if it ever becomes reachable.
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

/** PNG bytes off an extracted canvas, whichever blob API the host provides. */
function pngBytesOf(canvas: ICanvas): Promise<Uint8Array> {
  const toBytes = async (blob: Blob): Promise<Uint8Array> =>
    new Uint8Array(await blob.arrayBuffer());

  if (typeof canvas.toBlob === "function") {
    const toBlob = canvas.toBlob.bind(canvas);
    return new Promise<Uint8Array>((resolve, reject) => {
      toBlob((blob) => {
        if (!blob) {
          reject(new Error("[export] Canvas.toBlob returned no blob for a frame."));
          return;
        }
        toBytes(blob).then(resolve, reject);
      }, "image/png");
    });
  }
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/png" }).then(toBytes);
  }
  throw new Error(
    "[export] This canvas implementation offers neither toBlob nor convertToBlob, so PNG bytes cannot be read from it.",
  );
}

/**
 * Encode a sampled sequence to PNG bytes, one buffer per frame.
 *
 * **The trap this is designed around.** Reading the live PixiJS canvas in-page
 * returns a blank frame: PixiJS does not set `preserveDrawingBuffer`, so the
 * drawing buffer is undefined by the time any read happens. A naive exporter
 * therefore writes 90 blank PNGs *and reports success*, because a sequence of
 * identical blank frames hashes perfectly consistently and passes every numeric
 * check. `renderer.extract.canvas` sidesteps it entirely: it renders into a
 * render texture the caller owns and reads back from *that*, so the drawing
 * buffer's contents are irrelevant and `preserveDrawingBuffer` stays off — no
 * per-frame cost imposed on live playback for an export-only feature.
 *
 * **It receives `FrameSnapshot[]` and no runtime, no world and no driver**, so
 * it cannot advance the simulation even by accident. That is roadmap §6.2's
 * "encoders never advance the simulation and never see a wall clock" made
 * structural rather than conventional: there is nothing here to advance and no
 * clock to read.
 *
 * **Size and background come from the `Application` the caller built for the
 * export**, which must be initialised at the scene's logical size and
 * background. The extraction passes an explicit `frame` of exactly that size at
 * `resolution: 1`, so the PNG is the scene's declared pixel dimensions — never
 * the preview's `devicePixelRatio`, and never a content bounding box that would
 * change size as objects move. `fit` letterboxing cannot leak in either:
 * `generateTexture` hands the renderer its own translate-only transform, which
 * *replaces* the target container's local transform, so any scale or offset on
 * `root` is bypassed rather than baked in. The exported artifact is the scene,
 * not the preview.
 */
export async function encodePngSequence(
  app: Application,
  root: Container,
  frames: ReadonlyArray<FrameSnapshot>,
): Promise<Uint8Array[]> {
  if (frames.length === 0) return [];

  // Checked once, not per frame. An id in the snapshots that matches no
  // container renders as an object that never moves, and an id in the tree that
  // no snapshot mentions renders as one frozen where it was built — both are
  // silent, both survive every hash check, and both mean the tree and the
  // frames came from different compilations.
  const treeIds = new Set(snapshotFor(root).map((o) => o.id));
  const frameIds = new Set(frames[0].objects.map((o) => o.id));
  const missing = [...frameIds].filter((id) => !treeIds.has(id));
  const extra = [...treeIds].filter((id) => !frameIds.has(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `[export] The scene tree and the sampled frames disagree on which objects exist, so some would never move. Only in the frames: [${missing.join(", ")}]. Only in the tree: [${extra.join(", ")}].`,
    );
  }

  const region = new Rectangle(0, 0, app.renderer.width, app.renderer.height);
  const clearColor = app.renderer.background.colorRgba;

  const out: Uint8Array[] = [];
  for (const frame of frames) {
    applySnapshot(root, frame);
    const canvas = app.renderer.extract.canvas({
      target: root,
      frame: region,
      resolution: 1,
      clearColor,
      antialias: true,
    });
    out.push(await pngBytesOf(canvas));
  }
  return out;
}
