/**
 * The phone layout's preview height (spec 6B §4): tall enough for the plate
 * to fill the pane's width less the margins, plus the caption under it, and
 * never more than 60% of the viewport height.
 */

/** The preview's `--plate-margin` on phones (Preview.module.scss). */
export const PHONE_PLATE_MARGIN = 12;

/** The caption's room under the frame: a 6 px gap and a 16 px line. */
export const CAPTION_ROOM = 22;

/** The preview's height before any scene has compiled. */
export const PHONE_PREVIEW_FALLBACK = 280;

export interface SceneSize {
  readonly width: number;
  readonly height: number;
}

export function phonePreviewHeight(
  paneWidth: number,
  viewportHeight: number,
  scene: SceneSize | null,
): number {
  const cap = 0.6 * viewportHeight;
  if (!scene || scene.width <= 0 || scene.height <= 0 || paneWidth <= 0) {
    return Math.min(cap, PHONE_PREVIEW_FALLBACK);
  }
  const plateHeight = ((paneWidth - 2 * PHONE_PLATE_MARGIN) * scene.height) / scene.width;
  // Rounded up, so the host box is never a fraction too short and `contain`
  // stays width-limited: the plate then spans the full width.
  return Math.min(cap, Math.ceil(plateHeight + CAPTION_ROOM + 2 * PHONE_PLATE_MARGIN));
}
