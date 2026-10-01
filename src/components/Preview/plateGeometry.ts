/**
 * Where the scene lands inside the preview's host box, computed with the same
 * formula as `updateLayout` in src/compiler/renderer/adapter.ts, so the frame
 * the UI draws sits exactly on the scene the renderer draws. Returns null
 * when the scene fills the box (`cover`, `fill`) or overflows it (`none`),
 * because then there is no bounded plate to frame (spec 6B §3).
 */
export type Fit = "contain" | "cover" | "fill" | "none";
export interface Size { readonly width: number; readonly height: number }
export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export function plateRect(fit: Fit, box: Size, scene: Size): Rect | null {
  if (box.width <= 0 || box.height <= 0) return null;
  if (fit === "contain") {
    const s = Math.min(box.width / scene.width, box.height / scene.height);
    const width = scene.width * s;
    const height = scene.height * s;
    return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
  }
  if (fit === "none") {
    if (scene.width > box.width || scene.height > box.height) return null;
    return { x: 0, y: 0, width: scene.width, height: scene.height };
  }
  return null;
}

export function captionFor(scene: { width: number; height: number; duration: number | null }): {
  size: string;
  length: string;
} {
  const seconds = (s: number): string => (Number.isInteger(s) ? String(s) : String(Number(s.toFixed(2))));
  return {
    size: `${scene.width} × ${scene.height}`,
    length: scene.duration === null ? "no fixed length" : `${seconds(scene.duration)} s`,
  };
}
