import type { FrameSnapshot } from "../renderer/frameSampler";

/**
 * A stable content hash for a sampled sequence.
 *
 * FNV-1a over the snapshots' JSON, written by hand rather than taken from a
 * dependency because it must produce the identical digest in Node and in the
 * browser — `node:crypto` is not available in one and `crypto.subtle` is async
 * in both. 32 bits is ample: this detects change, it is not a security
 * primitive.
 *
 * Values are **not** rounded before hashing. IEEE-754 arithmetic is
 * deterministic for an identical sequence of operations and Matter.js is
 * deterministic given identical call order, so exact values are both more
 * honest and equally stable. Rounding would hide a real divergence smaller
 * than its own precision.
 *
 * This hashes *simulation output*, so unlike a PNG byte hash it is not tied
 * to one machine's GPU or rasteriser. Measured (`eval/RESULTS-GATE-B.md`
 * method, headless Node against Playwright's Chromium, 4 s at 30 fps):
 * scenes whose only transcendental math is `sin`/`cos` agree bit for bit.
 * Parse-time `sin`/`cos` fold through `detMath.ts`, built from operations
 * IEEE-754 specifies exactly, so no engine's `Math.sin` is involved.
 * `radial-dots.marey` and `fireworks.marey` differed before that change and
 * match after it. **This is still not a guarantee for every scene:** Matter.js
 * calls `Math.sin`/`Math.cos` itself when it rotates bodies, so a scene with
 * physics-driven rotation can still hash differently across engines.
 * `+`, `-`, `*`, `/` and `Math.sqrt` are the operations ECMA-262 requires to
 * be correctly rounded everywhere; `Math.sin`/`Math.cos` are not.
 */
export function hashFrames(frames: ReadonlyArray<FrameSnapshot>): string {
  let h = 0x811c9dc5;
  const text = JSON.stringify(frames);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
