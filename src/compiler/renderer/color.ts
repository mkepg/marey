import type { IRColor } from "../sceneIR";

/**
 * `#rrggbb` → `0xRRGGBB`. `resolvers.ts`'s `normaliseColor` expands `#rgb`
 * before anything reaches the IR, so a short form here is a compiler defect,
 * and it throws rather than draw the wrong colour.
 */
export function colorToInt(hex: IRColor): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`[renderer] Expected a normalised #rrggbb colour, got '${hex}'.`);
  }
  return parseInt(hex.slice(1), 16);
}

/**
 * Per-channel sRGB blend at eased progress `e`, each channel rounded where
 * it is written (Phase 7 spec §2.2), so paint, snapshot, hash, raster and
 * Lottie all read the same integer.
 */
export function lerpColor(a: number, b: number, e: number): number {
  const channel = (shift: number): number => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.max(0, Math.min(255, Math.round(ca + (cb - ca) * e)));
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
