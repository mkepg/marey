import type { Application } from "pixi.js";

/**
 * How every export-only pixi Application is torn down.
 *
 * An export builds its own Application beside the preview's long-lived one
 * (`adapter.ts`'s `sharedApp`). pixi v8 reads `renderer.destroy(true)` as
 * `releaseGlobalResources`, which empties the pools *every* Application on
 * the page shares — `TexturePool`, the batch pool, `CanvasPool`
 * (`AbstractRenderer.mjs`, `GlobalResourceRegistry.release()`). Passing
 * `true` here, as this code once did, left the preview with destroyed
 * batches and a wiped texture pool, so the next Run failed with "Cannot
 * read properties of null (reading 'clear')" and the preview stayed blank.
 */
export function destroyExportApp(app: Pick<Application, "destroy">): void {
  app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
}
